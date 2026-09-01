CREATE TABLE approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content(id),
  reviewed_version_id INTEGER NOT NULL REFERENCES content_versions(id),
  status TEXT NOT NULL DEFAULT 'pending',
  notified_at TEXT,
  decided_at TEXT,
  decided_via TEXT
);

CREATE TABLE approval_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_request_id INTEGER NOT NULL REFERENCES approval_requests(id),
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  selected INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE publishing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_request_id INTEGER NOT NULL REFERENCES approval_requests(id),
  status TEXT NOT NULL DEFAULT 'queued',
  dry_run INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE publishing_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publishing_job_id INTEGER NOT NULL REFERENCES publishing_jobs(id),
  platform_post_id INTEGER NOT NULL REFERENCES platform_posts(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  result TEXT NOT NULL,
  error_message TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
