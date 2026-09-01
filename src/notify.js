// Notification helper — builds human-readable Telegram messages and records a
// notifications row when a db client is available.
import { sendMessage } from './telegram/client.js';
import { approvalKeyboard } from './telegram/keyboard.js';
import { insertNotification } from './db/queries/index.js';

function chatId(env = {}) {
  return env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
}

export async function notifyReview({ db, env = {}, approvalId, draft, platforms, selectedKeys = [] }) {
  const chat = chatId(env);
  const text =
    `📝 *Content ready for review*\n\n` +
    `*${draft.title}*\n` +
    `${draft.summary || ''}\n\n` +
    `Tick the platforms to publish to, then tap *Approve & Publish Selected*.\n` +
    `_Changing the selection after approving creates a fresh approval._`;

  const result = chat
    ? await sendMessage(chat, text, { replyMarkup: approvalKeyboard(approvalId, platforms, selectedKeys) })
    : { ok: false, error: 'TELEGRAM_CHAT_ID not set (dashboard approval remains available)' };

  if (db) {
    await insertNotification(db, {
      approvalRequestId: approvalId,
      channel: 'telegram',
      notificationType: 'ready_for_review',
      payload: { draftTitle: draft.title },
    });
  }
  return result;
}

export async function notifyPublishResult({ db, env = {}, approvalId, results, jobStatus }) {
  const chat = chatId(env);
  const lines = [`📊 *Publish job: ${jobStatus}*`];
  for (const r of results) {
    if (r.outcome === 'success') lines.push(`  ✅ *${r.platform}* — ${r.url || 'published'}`);
    else if (r.outcome === 'skipped') lines.push(`  ⏭️ *${r.platform}* — ${r.reason}`);
    else if (r.outcome === 'unsupported') lines.push(`  🔒 *${r.platform}* — not available (${r.reason})`);
    else lines.push(`  ❌ *${r.platform}* — ${r.reason}`);
  }
  const text = lines.join('\n');

  const result = chat ? await sendMessage(chat, text) : { ok: false, error: 'TELEGRAM_CHAT_ID not set' };

  if (db) {
    await insertNotification(db, {
      approvalRequestId: approvalId,
      channel: 'telegram',
      notificationType: 'publish_result',
      payload: { jobStatus, results },
    });
  }
  return result;
}

export async function notifyAlert({ db, env = {}, text }) {
  const chat = chatId(env);
  const result = chat ? await sendMessage(chat, `⚠️ *ContentFlow AI*\n${text}`) : { ok: false, error: 'TELEGRAM_CHAT_ID not set' };
  if (db) {
    await insertNotification(db, {
      channel: 'telegram',
      notificationType: 'alert',
      payload: { text },
    });
  }
  return result;
}