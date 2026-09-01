# ContentFlow AI

AI-assisted content pipeline: ingest raw notes, clean and structure them with a swappable AI fallback chain, require explicit human approval with per-platform selection, publish only to selected enabled platforms, and track engagement data each platform's official API actually allows.

See `ContentFlow-AI-01-Research-and-Feasibility.md` for architecture decisions and `ContentFlow-AI-02-Master-Build-Prompt.md` for the full build specification.

## Live demo

After deployment, the static dashboard is served from **GitHub Pages**. It shows sample data offline and connects to the Cloudflare Worker API when configured (`?api=https://your-worker.workers.dev`).

## Architecture

```
Raw notes → GitHub Actions (process) → D1 database
                    ↓
            Telegram approval (Worker webhook)
                    ↓
         GitHub Actions (publish) → Blogger / LinkedIn / DEV.to
                    ↓
         Scheduled metrics collection → D1 snapshots
                    ↓
         GitHub Pages dashboard ← Worker read API
```

**MVP platforms:** Blogger (publish + comments), LinkedIn (publish only), DEV.to (publish + best-effort metrics). **Disabled by default:** Hashnode (paid Pro), X (pay-per-use).

## Local development

```bash
cd "/home/ritik/Documents/AI-Powered-Content-Automation-&-Distribution-System"
npm install
npm test
npm run serve   # http://localhost:4173
```

### Worker API (local)

```bash
npx wrangler dev
# Dashboard: http://localhost:4173/?api=http://localhost:8787
```

## Environment variables

Copy `.env.example` to `.env`. Minimum for local manual mode:

- `AI_PROVIDER=manual` — no AI API keys required
- `DRY_RUN=true` — never calls real platform APIs

Production also needs Cloudflare D1 credentials, Telegram bot token, and per-platform OAuth/API keys. See `.env.example` for the full list.

## Database setup

```bash
npx wrangler d1 migrations apply contentflow-ai --remote
# or locally:
npx wrangler d1 migrations apply contentflow-ai --local
```

Migrations live in `migrations/` (001–008).

## GitHub Actions workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `process-content.yml` | `workflow_dispatch` / `content-submitted` | Ingest + AI processing + Telegram notification |
| `publish-content.yml` | `workflow_dispatch` / `publish-approved` | Publish to selected platforms |
| `collect-metrics.yml` | Every 6 hours | Poll metrics/comments |
| `refresh-tokens.yml` | Daily | Credential health check (validates tokens; does not rotate secrets) |
| `cleanup.yml` | Weekly | Purge stale publishing jobs |
| `test.yml` | Push / PR | Unit + integration tests (`DRY_RUN=true`) |
| `deploy.yml` | Push to `main` | GitHub Pages + Cloudflare Worker |

## Telegram bot setup

1. Create a bot via [@BotFather](https://t.me/BotFather).
2. Set webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>/webhook/telegram&secret_token=<SECRET>`.
3. Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_SECRET_TOKEN` to GitHub/Worker secrets.

## Blogger OAuth (important)

Set the Google Cloud OAuth consent screen to **"In production"** — Testing mode refresh tokens expire every 7 days and will break unattended automation.

## Dry-run mode

`DRY_RUN=true` (default in CI) simulates publishes and metrics collection without calling any platform API. Set the `DRY_RUN` repository variable to `false` only when you are ready for real publishes.

## Testing

```bash
npm test
```

Tests cover platform adapters (mocked HTTP), idempotency keys, the processing pipeline, and DRY_RUN publish idempotency against an in-memory SQLite database with the full migration schema.

## Deployment

1. Push to a **public** GitHub repository (unlimited Actions minutes).
2. Enable GitHub Pages (Actions source).
3. Add secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, platform credentials.
4. The `deploy.yml` workflow publishes the dashboard and deploys the Worker when Cloudflare secrets are present.

## Known limitations

- LinkedIn metrics/comments are unsupported (partner-gated; 48-hour storage policy).
- Blogger has no pageview API (GA4 integration is a future add-on).
- Hashnode and X are implemented but disabled — enable only if you accept paid usage.
- X adapter intentionally returns `unsupported` rather than billing you accidentally.

## Security

- Secrets live only in GitHub Actions Secrets and Cloudflare Worker secrets.
- The dashboard never holds credentials; all reads go through the Worker API.
- Telegram webhooks are verified via `secret_token` on every request.
- Idempotency keys prevent duplicate publishes on retry.

## Project status

See `NEXT-AGENT-REPORT.md` for the current handoff state (~90% ready; DRY_RUN E2E verified). See `PROGRESS.md` for the feature checklist and `docs/DEPLOYMENT.md` for owner setup steps before real publishing.
