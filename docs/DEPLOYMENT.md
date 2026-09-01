# ContentFlow AI — Deployment Guide

Step-by-step instructions to take the MVP from **code complete** to **fully live**.

## Current live URLs

| Component | URL | Status |
|---|---|---|
| Dashboard (GitHub Pages) | https://ritik574-coder.github.io/contentflow-ai/ | Live (sample data) |
| GitHub repo | https://github.com/Ritik574-coder/contentflow-ai | Live |
| Cloudflare Worker API | `https://contentflow-ai.<account>.workers.dev` | **Not deployed** |
| D1 database | — | **Not provisioned** |

---

## Phase 1 — Cloudflare (owner, ~15 min)

### 1.1 Log in to Cloudflare

```bash
cd "/home/ritik/Documents/AI-Powered-Content-Automation-&-Distribution-System"
npx wrangler login
```

### 1.2 Provision D1 + apply migrations

```bash
chmod +x scripts/provision-cloudflare.sh
./scripts/provision-cloudflare.sh
```

This creates the D1 database, updates `wrangler.toml` with the real `database_id`, and applies migrations 001–008.

### 1.3 Deploy the Worker

```bash
npx wrangler deploy
```

Note the Worker URL from the output (e.g. `https://contentflow-ai.<subdomain>.workers.dev`).

### 1.4 Set Worker secrets

```bash
npx wrangler secret put TELEGRAM_SECRET_TOKEN    # random string, same value used in webhook
npx wrangler secret put GH_DISPATCH_PAT          # fine-grained PAT: contents:write + actions:write
npx wrangler secret put GH_REPO_OWNER            # Ritik574-coder
npx wrangler secret put GH_REPO_NAME             # contentflow-ai
npx wrangler secret put TELEGRAM_BOT_TOKEN       # optional, for Worker-side messages
npx wrangler secret put TELEGRAM_CHAT_ID         # optional
```

### 1.5 Connect dashboard to Worker

Edit `site/config.js`:

```js
window.CONTENTFLOW_API_BASE = 'https://contentflow-ai.<subdomain>.workers.dev';
```

Commit and push — `deploy.yml` will redeploy Pages.

---

## Phase 2 — GitHub Secrets (owner, ~10 min)

Add these in **Settings → Secrets and variables → Actions** for `Ritik574-coder/contentflow-ai`:

### Required for D1 + Worker CI deploy

| Secret | How to get it |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare dashboard → Account ID |
| `CF_API_TOKEN` | Cloudflare → API Tokens → Create (D1 Edit + Workers Edit) |
| `CF_D1_DATABASE_ID` | Output of `provision-cloudflare.sh` |

Aliases `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` also work in `deploy.yml`.

### Required for content processing

| Secret | Notes |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_CHAT_ID` | Your personal chat ID |
| `GEMINI_API_KEY` | Optional if `AI_PROVIDER=manual` |

### Required for publishing (when `DRY_RUN=false`)

| Secret | Platform |
|---|---|
| `BLOGGER_CLIENT_ID` / `BLOGGER_CLIENT_SECRET` | Google Cloud OAuth |
| `BLOGGER_REFRESH_TOKEN` | OAuth flow (consent screen = **In production**) |
| `BLOGGER_BLOG_ID` | Blogger blog ID |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn Developer app |
| `LINKEDIN_MEMBER_URN` | Your member URN |
| `DEVTO_API_KEY` | DEV.to account settings |

### Repository variables

| Variable | Recommended value |
|---|---|
| `DRY_RUN` | `true` until end-to-end test passes |
| `AI_PROVIDER` | `manual` or leave blank for fallback chain |

Verify setup:

```bash
# With secrets exported locally:
node scripts/check-setup.js
```

---

## Phase 3 — Telegram webhook (owner, ~5 min)

Replace placeholders and run once:

```bash
WORKER_URL="https://contentflow-ai.<subdomain>.workers.dev"
BOT_TOKEN="<from BotFather>"
SECRET="<same as TELEGRAM_SECRET_TOKEN>"

curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${WORKER_URL}/webhook/telegram" \
  -d "secret_token=${SECRET}"
```

---

## Phase 4 — End-to-end DRY_RUN test

1. Go to **Actions → Process Content → Run workflow**
2. Paste sample `raw_text`, run
3. Open dashboard with Worker API:  
   `https://ritik574-coder.github.io/contentflow-ai/?api=<WORKER_URL>`
4. Select platforms → **Approve Selected**
5. Confirm `publish-content.yml` runs with `DRY_RUN=true`
6. Check D1 has `platform_posts` with `dry_run: true` metadata

---

## Phase 5 — Go live

1. Set repository variable `DRY_RUN` = `false`
2. Ensure all platform secrets are valid (`refresh-tokens.yml` runs daily)
3. Process real content → approve → verify publish on Blogger/LinkedIn/DEV.to

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows "Sample data" | Set `site/config.js` or use `?api=<worker-url>` |
| Worker returns 403 on webhook | `TELEGRAM_SECRET_TOKEN` mismatch |
| Publish workflow not triggered | Check `GH_DISPATCH_PAT`, `GH_REPO_OWNER`, `GH_REPO_NAME` Worker secrets |
| Blogger token expires every 7 days | OAuth consent screen must be **In production**, not Testing |
| CI deploy skips Worker | Add `CF_API_TOKEN` + `CF_ACCOUNT_ID` to GitHub Secrets |
