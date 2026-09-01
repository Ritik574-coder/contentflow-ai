CREATE TABLE platform_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_version_id INTEGER NOT NULL REFERENCES content_versions(id),
  platform_account_id INTEGER NOT NULL REFERENCES platform_accounts(id),
  external_post_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  response_metadata_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_platform_posts_content_version ON platform_posts(content_version_id);
