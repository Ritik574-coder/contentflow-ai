// Minimal Telegram Bot API client (free). All methods return a normalized
// { ok: true, data } | { ok: false, error, retryable } result.
import { httpJson } from '../shared/http.js';
import { ok, err } from '../shared/result.js';

function botToken(opts = {}) {
  return opts.token || (opts.env && opts.env.TELEGRAM_BOT_TOKEN) || (typeof process !== 'undefined' ? process.env.TELEGRAM_BOT_TOKEN : undefined);
}

export async function tgRequest(method, payload, opts = {}) {
  const token = botToken(opts);
  if (!token) return err('TELEGRAM_BOT_TOKEN is not set', false);

  const res = await httpJson(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    fetchImpl: opts.fetchImpl,
  });

  if (!res.ok || res.body.ok !== true) {
    return err(`Telegram ${method} failed (${res.status}): ${res.text}`, true);
  }
  return ok(res.body.result);
}

export function sendMessage(chatId, text, { replyMarkup, parseMode = 'Markdown', fetchImpl, token, env } = {}) {
  return tgRequest(
    'sendMessage',
    {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      reply_markup: replyMarkup,
    },
    { fetchImpl, token, env },
  );
}

export function editMessageText(chatId, messageId, text, { replyMarkup, parseMode = 'Markdown', fetchImpl, token, env } = {}) {
  return tgRequest(
    'editMessageText',
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
      reply_markup: replyMarkup,
    },
    { fetchImpl, token, env },
  );
}

export function editMessageReplyMarkup(chatId, messageId, replyMarkup, { fetchImpl, token, env } = {}) {
  return tgRequest(
    'editMessageReplyMarkup',
    {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    },
    { fetchImpl, token, env },
  );
}

export function answerCallbackQuery(callbackQueryId, text, { fetchImpl, token, env } = {}) {
  return tgRequest(
    'answerCallbackQuery',
    { callback_query_id: callbackQueryId, text },
    { fetchImpl, token, env },
  );
}

export function setWebhook(url, secretToken, { fetchImpl, token, env } = {}) {
  return tgRequest('setWebhook', { url, secret_token: secretToken }, { fetchImpl, token, env });
}
