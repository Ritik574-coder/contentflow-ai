// Telegram webhook update handler: content ingestion and inline-keyboard approval flow.
// callback_data: toggle:<approvalId>:<platformKey> | approve:<approvalId> | reject:<approvalId>
import q from '../src/db/queries/index.js';
import { answerCallbackQuery, editMessageReplyMarkup, editMessageText, sendMessage } from '../src/telegram/client.js';
import { approvalKeyboard, parseCallbackData } from '../src/telegram/keyboard.js';
import { triggerWorkflowDispatch, repoFromEnv } from '../src/github.js';
import { logAudit } from '../src/shared/logger.js';

const DECIDED = new Set(['approved', 'rejected', 'superseded']);

function submissionText(message) {
  const text = String(message && message.text || '').trim();
  if (!text) return '';
  if (/^\/new(?:@\w+)?(?:\s|$)/i.test(text)) {
    return text.replace(/^\/new(?:@\w+)?\s*/i, '').trim();
  }
  if (text.startsWith('/')) return '';
  return text;
}

function telegramSubmissionKey(update, message) {
  if (update.update_id != null) return String(update.update_id);
  return `${message.chat.id}:${message.message_id}`;
}

async function handleContentSubmission({ db, env, update, message, text }) {
  if (!text) {
    await sendMessage(message.chat.id, 'Send a topic or notes after /new, or send the content directly.', { env });
    return { handled: true, action: 'content_submission_empty' };
  }

  const telegramUpdateId = telegramSubmissionKey(update, message);
  const claim = await q.claimTelegramIngestion(db, {
    telegramUpdateId,
    chatId: message.chat.id,
    messageId: message.message_id,
    rawText: text,
  });
  if (!claim.claimed) {
    await sendMessage(message.chat.id, '✅ This content submission was already received.', { env });
    return { handled: true, action: 'content_submission_duplicate' };
  }

  const repo = repoFromEnv(env);
  const dispatch = repo
    ? await triggerWorkflowDispatch({
      ...repo,
      workflow: 'process-content.yml',
      inputs: { raw_text: text },
      token: env.GH_DISPATCH_PAT,
      ref: env.GH_DISPATCH_REF,
    })
    : { ok: false, error: 'Processing workflow is not configured' };

  if (!dispatch.ok) {
    await q.updateTelegramIngestion(db, telegramUpdateId, 'failed');
    await logAudit(db, {
      entityType: 'telegram_ingestions',
      action: 'processing_dispatch_failed',
      result: 'failure',
      actor: 'telegram',
      errorMessage: dispatch.error,
    });
    await sendMessage(message.chat.id, '⚠️ I couldn’t start processing right now.\nPlease try again in a moment.', { env });
    return { handled: true, action: 'content_submission_failed' };
  }

  await q.updateTelegramIngestion(db, telegramUpdateId, 'dispatched');
  await logAudit(db, {
    entityType: 'telegram_ingestions',
    action: 'processing_started',
    result: 'success',
    actor: 'telegram',
  });
  await sendMessage(message.chat.id, '✅ Content received.\n\nProcessing has started.\nYou’ll receive the draft here for review.', { env });
  return { handled: true, action: 'content_submission' };
}

async function rebuildKeyboard(db, approvalId, chatId, messageId, env = {}) {
  const approval = await q.getApprovalRequest(db, approvalId);
  if (!approval) return;
  const platforms = await q.getPlatforms(db);
  const selections = await q.getApprovalSelections(db, approvalId);
  const selectedKeys = selections.filter((s) => s.selected).map((s) => s.platformKey);
  await editMessageReplyMarkup(chatId, messageId, approvalKeyboard(approvalId, platforms, selectedKeys), { env });
}

async function handleToggle({ db, env, approvalId, platformKey, chatId, messageId, callbackId }) {
  const approval = await q.getApprovalRequest(db, approvalId);
  if (!approval || DECIDED.has(approval.status)) {
    await answerCallbackQuery(callbackId, 'This approval is already decided.', { env });
    return;
  }
  const platform = await q.getPlatform(db, platformKey);
  if (!platform || !platform.enabled) {
    await answerCallbackQuery(callbackId, `${platformKey} is disabled.`, { env });
    return;
  }
  const selections = await q.getApprovalSelections(db, approvalId);
  const current = selections.find((s) => s.platformKey === platformKey);
  const newSelected = !(current && current.selected);
  await q.upsertApprovalSelection(db, {
    approvalRequestId: approvalId,
    platformId: platform.id,
    selected: newSelected,
  });
  await rebuildKeyboard(db, approvalId, chatId, messageId, env);
  await answerCallbackQuery(callbackId, newSelected ? `${platform.display_name} selected` : `${platform.display_name} unselected`, { env });
}

async function handleApprove({ db, env, approvalId, chatId, messageId, callbackId }) {
  const approval = await q.getApprovalRequest(db, approvalId);
  if (!approval) {
    await answerCallbackQuery(callbackId, 'Approval not found.', { env });
    return;
  }
  if (DECIDED.has(approval.status)) {
    await answerCallbackQuery(callbackId, 'This approval is already decided.', { env });
    return;
  }
  const selectedKeys = await q.getSelectedPlatformKeys(db, approvalId);
  if (!selectedKeys.length) {
    await answerCallbackQuery(callbackId, 'Select at least one platform first.', { env });
    return;
  }

  const transitioned = await q.transitionApprovalStatus(db, approvalId, 'approved', 'telegram');
  if (!transitioned) {
    await answerCallbackQuery(callbackId, 'This approval is already decided.', { env });
    return;
  }

  await logAudit(db, { entityType: 'approval_requests', entityId: approvalId, action: 'approval_received', result: 'success', actor: 'telegram' });
  await editMessageText(chatId, messageId, `✅ Approved — publishing to: ${selectedKeys.join(', ')}`, { env });
  await answerCallbackQuery(callbackId, `Approved for ${selectedKeys.join(', ')}`, { env });

  const repo = repoFromEnv(env);
  if (repo) {
    const dispatch = await triggerWorkflowDispatch({
      ...repo,
      workflow: 'publish-content.yml',
      inputs: { approval_id: String(approvalId) },
      token: env.GH_DISPATCH_PAT,
      ref: env.GH_DISPATCH_REF,
    });
    if (!dispatch.ok) {
      await logAudit(db, { entityType: 'approval_requests', entityId: approvalId, action: 'dispatch_failed', result: 'failure', errorMessage: dispatch.error });
      await sendMessage(chatId, `⚠️ Approved but could not trigger the publish workflow: ${dispatch.error}`, { env });
    }
  }
}

async function handlePreview({ db, env, approvalId, chatId, callbackId }) {
  const approval = await q.getApprovalRequest(db, approvalId);
  if (!approval) {
    await answerCallbackQuery(callbackId, 'Approval not found.', { env });
    return;
  }
  const version = await q.getContentVersion(db, approval.reviewed_version_id);
  if (!version) {
    await answerCallbackQuery(callbackId, 'Reviewed version not found.', { env });
    return;
  }
  const title = version.title || 'Untitled content';
  const summary = version.summary || '';
  const body = String(version.body || '').slice(0, 900);
  await sendMessage(chatId, `*Preview*\n\n*${title}*\n${summary}\n\n${body}`, { env });
  await answerCallbackQuery(callbackId, 'Preview sent.', { env });
}

async function handleEdit({ env, approvalId, chatId, callbackId }) {
  const dashboardUrl = env.DASHBOARD_URL || env.SITE_URL;
  const suffix = dashboardUrl ? `\n\n${dashboardUrl}?approval=${approvalId}` : '';
  await sendMessage(
    chatId,
    `Open the dashboard to edit this draft. Manual edits must create a new version before approval.${suffix}`,
    { env },
  );
  await answerCallbackQuery(callbackId, dashboardUrl ? 'Dashboard link sent.' : 'Dashboard URL is not configured.', { env });
}

async function handleReject({ db, env, approvalId, chatId, messageId, callbackId }) {
  const approval = await q.getApprovalRequest(db, approvalId);
  if (!approval || DECIDED.has(approval.status)) {
    await answerCallbackQuery(callbackId, 'This approval is already decided.', { env });
    return;
  }
  const transitioned = await q.transitionApprovalStatus(db, approvalId, 'rejected', 'telegram');
  if (!transitioned) {
    await answerCallbackQuery(callbackId, 'This approval is already decided.', { env });
    return;
  }
  const content = approval.content_id ? await q.getContent(db, approval.content_id) : null;
  if (content) {
    await q.updateContentStatus(db, content.id, 'rejected', approval.reviewed_version_id || content.current_version_id);
  }
  await logAudit(db, { entityType: 'approval_requests', entityId: approvalId, action: 'approval_rejected', result: 'success', actor: 'telegram' });
  await editMessageText(chatId, messageId, '❌ Rejected — nothing was published.', { env });
  await answerCallbackQuery(callbackId, 'Rejected', { env });
}

export async function handleTelegramUpdate(db, update, env = {}) {
  const callbackQuery = update.callback_query;
  if (!callbackQuery) {
    const message = update.message;
    if (!message || !message.chat) return { handled: false };
    return handleContentSubmission({
      db,
      env,
      update,
      message,
      text: submissionText(message),
    });
  }

  const { action, approvalId, platformKey } = parseCallbackData(callbackQuery.data);
  const chat = callbackQuery.message && callbackQuery.message.chat;
  const messageId = callbackQuery.message && callbackQuery.message.message_id;
  if (!chat || !messageId || !approvalId) {
    await answerCallbackQuery(callbackQuery.id, 'Invalid callback data.', { env });
    return { handled: false };
  }
  const base = { db, env, approvalId, chatId: chat.id, messageId, callbackId: callbackQuery.id };

  if (action === 'toggle' && platformKey) await handleToggle({ ...base, platformKey });
  else if (action === 'preview') await handlePreview(base);
  else if (action === 'edit') await handleEdit(base);
  else if (action === 'approve') await handleApprove({ ...base, env });
  else if (action === 'reject') await handleReject(base);
  else await answerCallbackQuery(callbackQuery.id, 'Unknown action.', { env });

  return { handled: true, action };
}
