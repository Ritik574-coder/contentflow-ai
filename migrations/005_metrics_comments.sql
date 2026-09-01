CREATE TABLE metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_post_id INTEGER NOT NULL REFERENCES platform_posts(id),
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  views INTEGER,
  impressions INTEGER,
  likes INTEGER,
  comments_count INTEGER,
  shares INTEGER,
  clicks INTEGER,
  raw_metrics_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_metric_snapshots_post ON metric_snapshots(platform_post_id);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_post_id INTEGER NOT NULL REFERENCES platform_posts(id),
  external_comment_id TEXT,
  author_display_name TEXT,
  comment_text TEXT,
  posted_at TEXT,
  collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  sentiment_label TEXT
);
