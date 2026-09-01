CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  telegram_chat_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  raw_text TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'note',
  status TEXT NOT NULL DEFAULT 'raw',
  current_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content(id),
  parent_version_id INTEGER REFERENCES content_versions(id),
  version_type TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  body TEXT NOT NULL,
  category TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  flagged_claims_json TEXT NOT NULL DEFAULT '[]',
  ai_provider TEXT,
  created_by TEXT NOT NULL DEFAULT 'system_ai',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_content_versions_content_id ON content_versions(content_id);

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content(id),
  media_type TEXT NOT NULL,
  description TEXT NOT NULL,
  alt_text TEXT,
  source_url TEXT,
  filename TEXT,
  mime_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_content_id ON media(content_id);
