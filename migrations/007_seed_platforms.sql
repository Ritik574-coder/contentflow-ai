INSERT INTO platforms (key, display_name, enabled, supports_publish, supports_metrics, supports_comments, supports_media_upload, supports_scheduling, notes) VALUES
  ('blogger', 'Blogger', 1, 1, 0, 1, 1, 0, 'No pageview endpoint in the public API; add GA4 later if needed'),
  ('linkedin', 'LinkedIn', 1, 1, 0, 0, 1, 0, 'Publish-only. Metrics/comments require partner approval and cannot legally be stored >48h'),
  ('devto', 'DEV.to', 1, 1, 0, 0, 0, 0, 'Reaction/comment counts on the article object are best-effort, verify field names at build time'),
  ('hashnode', 'Hashnode', 0, 0, 0, 0, 0, 0, 'DISABLED: publishing requires a paid Hashnode Pro plan as of 13 May 2026'),
  ('x', 'X (Twitter)', 0, 0, 0, 0, 0, 0, 'DISABLED: no free tier since 6 Feb 2026, pay-per-use only');
