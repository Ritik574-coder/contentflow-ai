CREATE TABLE platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  supports_publish INTEGER NOT NULL DEFAULT 0,
  supports_metrics INTEGER NOT NULL DEFAULT 0,
  supports_comments INTEGER NOT NULL DEFAULT 0,
  supports_media_upload INTEGER NOT NULL DEFAULT 0,
  supports_scheduling INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE platform_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  account_label TEXT NOT NULL,
  external_account_id TEXT,
  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  token_secret_ref TEXT,
  last_verified_at TEXT
);
