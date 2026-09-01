-- Enable best-effort DEV.to engagement metrics collection.
UPDATE platforms SET supports_metrics = 1 WHERE key = 'devto';

-- Default platform accounts (token_secret_ref points to GitHub/Worker secret names).
INSERT INTO platform_accounts (platform_id, account_label, external_account_id, connection_status, token_secret_ref)
SELECT p.id, 'Default ' || p.display_name || ' account', NULL, 'disconnected',
  CASE p.key
    WHEN 'blogger' THEN 'BLOGGER_REFRESH_TOKEN'
    WHEN 'linkedin' THEN 'LINKEDIN_ACCESS_TOKEN'
    WHEN 'devto' THEN 'DEVTO_API_KEY'
    WHEN 'hashnode' THEN 'HASHNODE_PAT'
    WHEN 'x' THEN 'X_ACCESS_TOKEN'
  END
FROM platforms p
WHERE NOT EXISTS (
  SELECT 1 FROM platform_accounts pa WHERE pa.platform_id = p.id
);
