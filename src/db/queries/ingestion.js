export async function claimTelegramIngestion(db, {
  telegramUpdateId,
  chatId,
  messageId,
  rawText,
}) {
  const info = await db.run(
    `INSERT OR IGNORE INTO telegram_ingestions
       (telegram_update_id, chat_id, message_id, raw_text, status)
     VALUES (?, ?, ?, ?, 'processing')`,
    [telegramUpdateId, String(chatId), messageId == null ? null : String(messageId), rawText],
  );
  return {
    claimed: Number(info && info.meta && info.meta.changes ? info.meta.changes : 0) > 0,
  };
}

export function updateTelegramIngestion(db, telegramUpdateId, status) {
  return db.run(
    `UPDATE telegram_ingestions
     SET status = ?, updated_at = datetime('now')
     WHERE telegram_update_id = ?`,
    [status, telegramUpdateId],
  );
}
