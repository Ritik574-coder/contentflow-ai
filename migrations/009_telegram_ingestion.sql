CREATE TABLE telegram_ingestions (
  telegram_update_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_id TEXT,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
