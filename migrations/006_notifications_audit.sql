CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER REFERENCES content(id),
  approval_request_id INTEGER REFERENCES approval_requests(id),
  channel TEXT NOT NULL DEFAULT 'telegram',
  notification_type TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  result TEXT NOT NULL,
  error_message TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
