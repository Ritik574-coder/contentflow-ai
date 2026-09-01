#!/usr/bin/env bash
# Provision Cloudflare D1 and update wrangler.toml with the real database_id.
# Prerequisites: npx wrangler login (interactive — owner must run this once).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB_NAME="contentflow-ai"

echo "==> Checking wrangler authentication..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "ERROR: Not logged in. Run: npx wrangler login"
  exit 1
fi

echo "==> Creating D1 database (skipped if it already exists)..."
CREATE_OUT="$(npx wrangler d1 create "$DB_NAME" 2>&1 || true)"
echo "$CREATE_OUT"

DB_ID="$(echo "$CREATE_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"

if [ -z "$DB_ID" ]; then
  echo "==> Fetching existing database id from wrangler d1 list..."
  DB_ID="$(npx wrangler d1 list 2>/dev/null | grep "$DB_NAME" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
fi

if [ -z "$DB_ID" ]; then
  echo "ERROR: Could not determine database_id. Create manually: npx wrangler d1 create $DB_NAME"
  exit 1
fi

echo "==> Updating wrangler.toml database_id -> $DB_ID"
sed -i "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml

echo "==> Applying migrations (remote)..."
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo "==> Done. Next steps:"
echo "  1. Add GitHub secrets: CF_D1_DATABASE_ID=$DB_ID, CF_API_TOKEN, CF_ACCOUNT_ID"
echo "  2. npx wrangler deploy"
echo "  3. npx wrangler secret put TELEGRAM_SECRET_TOKEN"
echo "  4. Register Telegram webhook (see docs/DEPLOYMENT.md)"
