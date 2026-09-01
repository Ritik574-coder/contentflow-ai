// Telegram webhook update handler: inline-keyboard approval flow.
// callback_data: toggle:<approvalId>:<platformKey> | approve:<approvalId> | reject:<approvalId>
import q from '../src/db/queries/index.js';
import { answerCallbackQuery, editMessageReplyMarkup, editMessageText, sendMessage } from '../src/telegram/client.js';
import { approvalKeyboard, parseCallbackData } from '../src/telegram/keyboard.js';
import { triggerWorkflowDispatch, repoFromEnv } from '../src/github.js';
import { logAudit } from '../src/shared/logger.js';

const DECIDED = new Set(['approved', 'rejected', 'superseded']);

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

  await q.updateApprovalStatus(db, approvalId, 'approved', 'telegram');
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
  await q.updateApprovalStatus(db, approvalId, 'rejected', 'telegram');
  await logAudit(db, { entityType: 'approval_requests', entityId: approvalId, action: 'approval_rejected', result: 'success', actor: 'telegram' });
  await editMessageText(chatId, messageId, '❌ Rejected — nothing was published.', { env });
  await answerCallbackQuery(callbackId, 'Rejected', { env });
}

export async function handleTelegramUpdate(db, update, env = {}) {
  const callbackQuery = update.callback_query;
  if (!callbackQuery) {
    // Non-callback messages: reply with a short hint.
    if (update.message && update.message.chat) {
      await sendMessage(update.message.chat.id, 'ContentFlow AI is running. Use the dashboard or wait for a review message.', { env });
    }
    return { handled: false };
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
