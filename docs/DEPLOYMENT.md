# ContentFlow AI — Deployment Guide

Step-by-step instructions to take the MVP from **code complete** to **fully live**.

> **Current status:** See `NEXT-AGENT-REPORT.md` for the latest handoff. Phase 3 (Telegram + DRY_RUN E2E) is complete. Phase 4 prepared the project for real platform credentials while keeping `DRY_RUN=true`.

## Current live URLs

| Component | URL | Status |
|---|---|---|
| Dashboard (GitHub Pages) | https://ritik574-coder.github.io/contentflow-ai/ | Live |
| GitHub repo | https://github.com/Ritik574-coder/contentflow-ai | Live |
| Cloudflare Worker API | https://contentflow-ai.ritik574-coder.workers.dev | Deployed |
| D1 database | `contentflow-ai` (`7e71bdf2-ac75-47df-8ff0-43ed4f438802`) | Provisioned |

### Cloudflare credentials (for reference)

| Item | Value |
|---|---|
| Account ID | `264490ec9c67ed5f105677e821abb574` |
| D1 Database ID | `7e71bdf2-ac75-47df-8ff0-43ed4f438802` |
| workers.dev subdomain | `ritik574-coder` |

### Infrastructure already configured

| Item | Status |
|---|---|
| `CF_API_TOKEN` in GitHub Secrets | Done |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Done |
| Worker secrets (`TELEGRAM_*`, `GH_DISPATCH_PAT`) | Done |
| Telegram webhook | Registered at `/webhook/telegram` |
| Dashboard → Worker (`site/config.js`) | Points to live Worker URL |
| `DRY_RUN` repo variable | `true` |
| `AI_PROVIDER` repo variable | `manual` |

---

## Phase 1 — Cloudflare (completed)

Infrastructure is provisioned. For reference or disaster recovery:

```bash
cd "/home/ritik/Documents/AI-Powered-Content-Automation-&-Distribution-System"
npx wrangler login
./scripts/provision-cloudflare.sh   # creates D1, applies migrations
npx wrangler deploy
```

Worker secrets (already set):

```bash
npx wrangler secret put TELEGRAM_SECRET_TOKEN
npx wrangler secret put GH_DISPATCH_PAT          # fine-grained PAT: contents:write + actions:write
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Repo owner/name are in `wrangler.toml` `[vars]` (`GH_REPO_OWNER`, `GH_REPO_NAME`).

---

## Phase 2 — GitHub Secrets (core — completed)

These are already configured in GitHub Actions:

| Secret | Purpose |
|---|---|
| `CF_ACCOUNT_ID` / `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |
| `CF_API_TOKEN` / `CLOUDFLARE_API_TOKEN` | D1 REST + Worker deploy |
| `CF_D1_DATABASE_ID` | D1 database binding |
| `TELEGRAM_BOT_TOKEN` | Process-content notifications |
| `TELEGRAM_CHAT_ID` | Owner chat ID |

### Repository variables (current)

| Variable | Value | Notes |
|---|---|---|
| `DRY_RUN` | `true` | Keep until owner approves real publishing |
| `AI_PROVIDER` | `manual` | No AI API keys required |

Verify setup locally (export secrets from your password manager first):

```bash
node scripts/check-setup.js
```

The script reports `dryRunE2EReady`, `realPublishReady`, and per-platform `missingForRealPublish`.

---

## Phase 3 — Telegram webhook (completed)

Webhook is registered at:

```
https://contentflow-ai.ritik574-coder.workers.dev/webhook/telegram
```

To re-register after rotating `TELEGRAM_SECRET_TOKEN`:

```bash
WORKER_URL="https://contentflow-ai.ritik574-coder.workers.dev"
BOT_TOKEN="<from BotFather>"
SECRET="<same as TELEGRAM_SECRET_TOKEN>"

curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${WORKER_URL}/webhook/telegram" \
  -d "secret_token=${SECRET}"
```

---

## Phase 4 — End-to-end DRY_RUN test (verified)

This path has been verified in production:

1. **Actions → Process Content** → run with sample `raw_text`
2. Telegram receives "Content ready for review" with platform toggles
3. Select platform(s) and approve from Telegram (or use dashboard **Approve Selected**)
4. `publish-content.yml` runs with `DRY_RUN=true`
5. Telegram shows dry-run publish result; D1 has `platform_posts` with `dry_run` metadata

---

## Before real publishing (owner checklist)

Do **not** set `DRY_RUN=false` until all steps below are complete.

### 1. Add platform secrets to GitHub Actions

**Blogger** (OAuth consent screen must be **In production**, not Testing):

```bash
gh secret set BLOGGER_CLIENT_ID -R Ritik574-coder/contentflow-ai
gh secret set BLOGGER_CLIENT_SECRET -R Ritik574-coder/contentflow-ai
gh secret set BLOGGER_REFRESH_TOKEN -R Ritik574-coder/contentflow-ai
gh secret set BLOGGER_BLOG_ID -R Ritik574-coder/contentflow-ai
```

**LinkedIn** (publish-only in MVP):

```bash
gh secret set LINKEDIN_ACCESS_TOKEN -R Ritik574-coder/contentflow-ai
gh secret set LINKEDIN_MEMBER_URN -R Ritik574-coder/contentflow-ai
```

**DEV.to**:

```bash
gh secret set DEVTO_API_KEY -R Ritik574-coder/contentflow-ai
```

### 2. Verify credentials locally

```bash
# Export the same secrets into your shell, then:
node scripts/check-setup.js
```

Confirm `readyPlatforms` lists the platform(s) you configured.

### 3. DRY_RUN publish per platform

With `DRY_RUN=true`, process content and approve **one platform at a time** to confirm adapter validation and workflow wiring.

### 4. Owner explicitly approves real publishing

Only after step 3 passes:

```bash
gh variable set DRY_RUN -R Ritik574-coder/contentflow-ai --body "false"
```

Process real content → approve **only the intended platform(s)** → verify the live post.

---

## Phase 5 — Go live

1. `DRY_RUN=false` (owner approval required)
2. Platform secrets valid (run `refresh-tokens.yml` manually to probe Blogger credentials)
3. Process real content → approve selected platform(s) only → verify publish

> **Note:** `refresh-tokens.yml` is a **credential health check** — it validates tokens but does **not** automatically write refreshed tokens back to GitHub Secrets. Rotate Blogger tokens manually if validation fails.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows "Sample data" | `site/config.js` is configured; try hard-refresh or `?api=https://contentflow-ai.ritik574-coder.workers.dev` |
| Worker returns 403 on webhook | `TELEGRAM_SECRET_TOKEN` mismatch between Worker secret and Telegram webhook |
| Publish workflow not triggered | Check `GH_DISPATCH_PAT` Worker secret and `GH_REPO_OWNER`/`GH_REPO_NAME` in `wrangler.toml` |
| Blogger token expires every 7 days | OAuth consent screen must be **In production**, not Testing |
| CI deploy skips Worker | Add `CF_API_TOKEN` + `CF_ACCOUNT_ID` to GitHub Secrets |
| `process-content` fails with empty body | Set `AI_PROVIDER=manual` or add AI provider keys |
| D1 REST insert fails in Actions | Ensure `CF_API_TOKEN` is a permanent API token (not expired OAuth) |
