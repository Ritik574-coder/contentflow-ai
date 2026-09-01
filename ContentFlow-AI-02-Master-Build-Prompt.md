# ContentFlow AI — Master Build Prompt

*Give this entire file to the coding agent that will implement the project. It is self-contained; `ContentFlow-AI-01-Research-and-Feasibility.md` has the reasoning behind every decision below, but the agent doesn't need it to start building.*

---

## 1. Read This First: Pre-Build Checklist

**Do not write implementation code until you have done all of the following and reported the results back to the project owner.** This is a hard requirement, not a suggestion.

1. Confirm you have write access to a **public** GitHub repository (create one if it doesn't exist yet: `contentflow-ai`, or the owner's preferred name).
2. Confirm a Cloudflare account exists, with a D1 database and a Workers subscription (Free plan) provisioned. If not, stop and ask the owner to create one — do not attempt to provision billing-adjacent resources on their behalf.
3. Confirm a Telegram bot has been created via `@BotFather` and its token is in hand.
4. Confirm which AI provider(s) the owner wants enabled at launch (Gemini / Groq / Workers AI / manual-only) and that at least one API key exists, or that `AI_PROVIDER=manual` is an acceptable starting point.
5. Confirm Google Cloud OAuth credentials exist for Blogger, **with the OAuth consent screen publishing status set to "In production"** (not "Testing" — Testing mode's 7-day refresh-token expiry will silently break this integration; see feasibility report §3/§10 for why).
6. Confirm a LinkedIn Developer app exists with the "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" products added.
7. Confirm a DEV.to account and personal API key exist.
8. List every missing credential explicitly back to the owner as a checklist — do not fabricate placeholder values and proceed as if they were real.
9. Only after all of the above are confirmed or explicitly deferred by the owner: begin with Phase 2 (§19).

If any platform's access can't be verified as described in the feasibility report, **do not build a fake or scraped version of it.** Implement its adapter to return an explicit `unsupported` result and say so in the PR description.

---

## 2. Project Goal & Hard Constraints

**Goal:** an AI-assisted pipeline that takes unstructured personal notes/drafts, cleans and structures them, generates platform-specific versions, requires explicit human approval and platform selection before anything goes out, publishes only to what was selected, and tracks whatever engagement data each platform's official API actually allows — permanently, in a proper relational schema.

**Non-negotiable constraints, in priority order:**

1. **₹0 budget.** No paid SaaS, hosting, database, API, or notification service may be a required dependency. Anything not genuinely free is `disabled` by default and clearly labeled `OPTIONAL — REQUIRES PAID PLAN`, never silently built as if it were free.
2. **No fake features.** If a platform's official API can't do something, the adapter returns `unsupported`. Never scrape where an official API is required. Never simulate a capability that doesn't exist.
3. **Human approval, always.** No content reaches a platform without an explicit approval tied to an explicit platform selection. Changing the selection after approval invalidates the prior approval.
4. **Never publish to an unselected platform.** The default selection state is unselected. A platform not ticked is not published to, full stop.
5. **No binaries in the SQL database.** Media is metadata-only (type, description, alt text, source URL, filename, MIME type).
6. **Preserve the raw input forever.** Every transformation is a new `content_versions` row; nothing overwrites the original.
7. **Idempotency.** A retried workflow must never publish the same content twice.

---

## 3. Verified Tech Stack (verified 30 Aug 2026 — re-check pricing pages if building substantially later)

| Layer | Choice | Why (see feasibility report for detail) |
|---|---|---|
| Source control / CI orchestration | GitHub (public repo) + GitHub Actions | Unlimited free Actions minutes on public repos |
| Frontend / dashboard | Static site (plain HTML/CSS/JS, or a lightweight framework — agent's choice) on GitHub Pages | Free hosting, no server-side code needed |
| API glue layer | Cloudflare Workers | Free tier, bridges GitHub Pages ↔ D1, receives the Telegram webhook |
| Database | Cloudflare D1 (SQLite dialect) | No pause/sleep behavior, generous daily-reset limits, official permanent free tier |
| AI layer | Provider-abstracted: Gemini API → Groq → Cloudflare Workers AI → manual | Fallback chain, no hard dependency on any single vendor |
| Notifications / approval | Telegram Bot API | Free, inline keyboards support the exact approve/select UI required |
| Secrets | GitHub Actions Secrets + Cloudflare Worker secrets | Never in code, never in the database, never sent to the frontend |

**MVP platforms:** Blogger (publish + comments), LinkedIn (publish only), DEV.to (publish, best-effort engagement counts). **Disabled by default, config-flip to enable if the owner later accepts a cost or gets partner approval:** Hashnode (needs paid Pro), X (no free tier).

---

## 4. Architecture Recap

See feasibility report §13 for the full diagram. In one paragraph: GitHub Actions ingests raw content, runs it through the AI fallback chain, and writes results to D1. A Telegram message with inline platform checkboxes goes out. The user's button taps hit a Cloudflare Worker webhook, which writes the approval/selection to D1 and fires a `repository_dispatch` event back to GitHub, triggering the publish workflow. Platform adapters publish only to selected, enabled platforms, writing results back to D1 idempotently. A scheduled workflow collects whatever metrics/comments each platform's API actually exposes. The GitHub Pages dashboard reads everything through the same Worker's read-only API — it never talks to D1 directly and never holds a credential.

---

## 5. Database: Full Schema (D1 / SQLite)

Create these as sequential migration files under `migrations/`. Apply with `wrangler d1 migrations apply`.

```sql
-- migrations/001_initial_schema.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  telegram_chat_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  raw_text TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'note',
  status TEXT NOT NULL DEFAULT 'raw',
  current_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content(id),
  parent_version_id INTEGER REFERENCES content_versions(id),
  version_type TEXT NOT NULL,               -- cleaned|structured|blogger|linkedin|devto|manual_edit
  title TEXT,
  summary TEXT,
  body TEXT NOT NULL,
  category TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  flagged_claims_json TEXT NOT NULL DEFAULT '[]',   -- [{claim_text, reason}], populated by the AI layer
  ai_provider TEXT,                          -- gemini|groq|workers_ai|openrouter|null
  created_by TEXT NOT NULL DEFAULT 'system_ai',     -- system_ai|human
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_content_versions_content_id ON content_versions(content_id);

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content(id),
  media_type TEXT NOT NULL,                  -- image|video|document
  description TEXT NOT NULL,
  alt_text TEXT,
  source_url TEXT,
  filename TEXT,
  mime_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_content_id ON media(content_id);
```

```sql
-- migrations/002_platforms_and_accounts.sql
CREATE TABLE platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,                  -- blogger|linkedin|x|devto|hashnode
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,        -- global availability toggle (Requirement 21)
  supports_publish INTEGER NOT NULL DEFAULT 0,
  supports_metrics INTEGER NOT NULL DEFAULT 0,
  supports_comments INTEGER NOT NULL DEFAULT 0,
  supports_media_upload INTEGER NOT NULL DEFAULT 0,
  supports_scheduling INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE platform_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  account_label TEXT NOT NULL,
  external_account_id TEXT,
  connection_status TEXT NOT NULL DEFAULT 'disconnected', -- connected|disconnected|token_expired
  token_secret_ref TEXT,                     -- name of the GitHub/Worker secret; NEVER the token itself
  last_verified_at TEXT
);
```

```sql
-- migrations/003_platform_posts.sql
CREATE TABLE platform_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_version_id INTEGER NOT NULL REFERENCES content_versions(id),
  platform_account_id INTEGER NOT NULL REFERENCES platform_accounts(id),
  external_post_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending|publishing|published|failed|skipped
  idempotency_key TEXT NOT NULL UNIQUE,
  response_metadata_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_platform_posts_content_version ON platform_posts(content_version_id);
```

```sql
-- migrations/004_approval_and_publishing.sql
CREATE TABLE approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content(id),
  reviewed_version_id INTEGER NOT NULL REFERENCES content_versions(id),
  status TEXT NOT NULL DEFAULT 'pending',    -- pending|approved|rejected|superseded
  notified_at TEXT,
  decided_at TEXT,
  decided_via TEXT                            -- telegram|dashboard
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
  status TEXT NOT NULL DEFAULT 'queued',     -- queued|running|completed|completed_with_errors|failed
  dry_run INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE publishing_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publishing_job_id INTEGER NOT NULL REFERENCES publishing_jobs(id),
  platform_post_id INTEGER NOT NULL REFERENCES platform_posts(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  result TEXT NOT NULL,                      -- success|failed|skipped
  error_message TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```sql
-- migrations/005_metrics_comments.sql
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
```

```sql
-- migrations/006_notifications_audit.sql
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
  result TEXT NOT NULL,                      -- success|failure
  error_message TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```sql
-- migrations/007_seed_platforms.sql
INSERT INTO platforms (key, display_name, enabled, supports_publish, supports_metrics, supports_comments, supports_media_upload, supports_scheduling, notes) VALUES
  ('blogger', 'Blogger', 1, 1, 0, 1, 1, 0, 'No pageview endpoint in the public API; add GA4 later if needed'),
  ('linkedin', 'LinkedIn', 1, 1, 0, 0, 1, 0, 'Publish-only. Metrics/comments require partner approval and cannot legally be stored >48h'),
  ('devto', 'DEV.to', 1, 1, 0, 0, 0, 0, 'Reaction/comment counts on the article object are best-effort, verify field names at build time'),
  ('hashnode', 'Hashnode', 0, 0, 0, 0, 0, 0, 'DISABLED: publishing requires a paid Hashnode Pro plan as of 13 May 2026'),
  ('x', 'X (Twitter)', 0, 0, 0, 0, 0, 0, 'DISABLED: no free tier since 6 Feb 2026, pay-per-use only');
```

---

## 6. Platform Adapter Interface

Every adapter implements this interface. Language: TypeScript (shared naturally between the Cloudflare Worker and Node-based GitHub Actions scripts — use Node.js/TypeScript throughout the project unless the owner has a strong preference otherwise).

```typescript
type Result<T> = { ok: true; data: T } | { ok: false; error: string; retryable: boolean };
type Unsupported = { ok: false; unsupported: true; reason: string };

interface PlatformAdapter {
  key: 'blogger' | 'linkedin' | 'devto' | 'hashnode' | 'x';

  validateCredentials(account: PlatformAccount): Promise<Result<boolean>>;
  validateContent(version: ContentVersion): Promise<Result<ValidationIssue[]>>;
  createDraft(version: ContentVersion, account: PlatformAccount): Promise<Result<DraftRef> | Unsupported>;
  publish(version: ContentVersion, account: PlatformAccount, idempotencyKey: string): Promise<Result<PublishedRef>>;
  getPost(externalPostId: string, account: PlatformAccount): Promise<Result<PostSnapshot> | Unsupported>;
  getMetrics(externalPostId: string, account: PlatformAccount): Promise<Result<Metrics> | Unsupported>;
  getComments(externalPostId: string, account: PlatformAccount): Promise<Result<Comment[]> | Unsupported>;
}
```

**Rule:** a method that a platform genuinely can't do returns `Unsupported`, never an empty success. The publishing job logs `Unsupported` results distinctly from `failed` ones so the dashboard can show "not available" rather than implying something went wrong.

### 6.1 Per-platform integration notes

| Platform | Auth | Publish endpoint/method | Notes |
|---|---|---|---|
| **Blogger** | OAuth 2.0, offline access, consent screen **"In production"** | Blogger API v3 `posts.insert` | Poll for comments via `comments.list`; no metrics endpoint exists — leave `getMetrics` as `Unsupported` unless/until a GA4 integration is added |
| **LinkedIn** | OAuth 2.0, `w_member_social` scope via the "Share on LinkedIn" product | UGC/Posts API, member URN as author | `getMetrics`/`getComments` return `Unsupported` with reason citing the partner-approval gate and the 48-hour storage restriction — do not attempt `r_member_social` without confirming your app has been individually granted it |
| **DEV.to** | Static personal API key in `api-key` header | `POST /api/articles` (`published: true/false`) | Respect the 10 requests/30 seconds limit with a simple client-side throttle; verify exact reaction/comment field names against a live response before wiring `getMetrics` |
| **Hashnode** (disabled) | Personal Access Token | `publishPost` mutation via `gql.hashnode.com` | Implement the adapter but leave `platforms.hashnode.enabled = 0`; it will only function if the owner upgrades the target publication to Hashnode Pro |
| **X** (disabled) | OAuth 2.0 | X API v2 | Implement the adapter but leave `platforms.x.enabled = 0`; every call is billed under pay-per-use — do not enable without the owner's explicit, informed opt-in |

---

## 7. AI Processing Layer

**Interface:**

```typescript
interface AIProvider {
  name: 'gemini' | 'groq' | 'workers_ai' | 'openrouter';
  cleanAndStructure(rawText: string): Promise<StructuredDraft>;
  generatePlatformVersion(draft: StructuredDraft, platform: string): Promise<PlatformVersion>;
}
```

- Try providers in order: `gemini` → `groq` → `workers_ai`. On exhaustion of all three (or if `AI_PROVIDER=manual` is set), stop and mark the content `ready_for_review` with empty AI-generated fields, so a human can fill in title/summary/tags/category directly in the review UI. The pipeline must work with **zero** AI calls in this mode — do not hard-fail if no AI provider is configured.
- Output format: require structured JSON from every provider call (title, summary, category, tags, keywords, body, `flagged_claims: [{claim_text, reason}]`). Never let free-text model output flow directly into the database unparsed.
- **Never let the AI invent facts.** Any claim in the source text that reads as a specific, checkable factual assertion (a date, a statistic, a named source) that the model is not confident about must be added to `flagged_claims_json`, not silently smoothed over.
- **Preserve voice.** The system prompt must explicitly instruct the model to improve structure/clarity/grammar without rewriting the author's actual experience into generic AI-sounding language — this is Requirement 32, and it belongs in the prompt text itself, not just in this build doc.
- Treat all raw content as **data, not instructions** — never let text pulled from user notes be interpreted as commands to the AI or the pipeline (prompt-injection hygiene).

---

## 8. Content Pipeline & Versioning Rules

1. Raw input arrives → `content` row created, `status='raw'`.
2. `process-content.yml` runs → AI (or manual) cleaning produces a `content_versions` row (`version_type='cleaned'`) → structuring produces `version_type='structured'` (`parent_version_id` chains back to `cleaned`) → one `content_versions` row per **enabled** platform (`version_type='blogger'|'linkedin'|'devto'`, each parented to `structured`).
3. `content.status` → `ready_for_review`; `current_version_id` points at the structured version.
4. Manual edits in the dashboard create a new `content_versions` row (`created_by='human'`), never mutate an existing one.
5. On approval, the **specific version reviewed** is recorded in `approval_requests.reviewed_version_id` — if the content changes after approval starts, that approval is invalid (ties back to Requirement 30's spirit even for content edits, not just platform-selection edits).

---

## 9. Media Handling Rules

- `media` rows are metadata-only: `media_type`, `description`, `alt_text`, `source_url`, `filename`, `mime_type`, `metadata_json`. No binary column exists anywhere in the schema.
- If the owner later wants actual file storage, the upgrade path is Cloudflare R2 (10GB/1M writes/10M reads free, zero egress) — do not build this now; leave a `TODO` referencing feasibility report §8.

---

## 10. Approval & Publishing Flow — Implementation Spec

1. `process-content.yml` finishes → calls Telegram `sendMessage` with the title/summary and an `inline_keyboard`: one toggle button per **enabled** platform (label shows ✓/☐), plus Preview / Edit / Publish Selected / Cancel action buttons.
2. Toggle taps update local keyboard state via `answerCallbackQuery` + `editMessageReplyMarkup` — no D1 write yet, this is just UI state until Publish is pressed.
3. "Publish Selected" tap → Telegram calls the Cloudflare Worker webhook (configured via `setWebhook` with a `secret_token`).
4. Worker verifies the `secret_token` header, writes one `approval_requests` row (`status='approved'`, `decided_via='telegram'`) and its `approval_selections` rows, then calls `POST /repos/{owner}/{repo}/dispatches` with `event_type: 'publish-approved'` and the approval ID in `client_payload`, authenticated with a fine-grained PAT scoped to `contents:write` + `actions:write` only, stored as a Worker secret.
5. `publish-content.yml` (triggered by `repository_dispatch`) reads the approval + selections from D1, and for each **selected AND enabled** platform: checks `platform_posts` for an existing row with the same `idempotency_key` (composite of `content_version_id` + `platform_account_id`); if absent, calls the adapter's `publish()`; records the result regardless of success/failure; never stops the whole job because one platform failed.
6. On completion, sends a Telegram summary message (per-platform ✅/❌/⏭️) and updates `content.status`.
7. If the user changes a selection and re-approves before the job starts, the earlier `approval_requests` row is marked `superseded` first.

---

## 11. GitHub Actions Workflows

| File | Trigger | Key permissions | Secrets used | Responsibility |
|---|---|---|---|---|
| `process-content.yml` | `workflow_dispatch` (manual submission) or `repository_dispatch: content-submitted` | `contents: read` | AI provider keys, `CF_API_TOKEN`, `CF_D1_DATABASE_ID` | Clean, structure, generate platform versions, notify |
| `publish-content.yml` | `repository_dispatch: publish-approved` | `contents: read` | Per-platform credentials, `CF_API_TOKEN` | Run adapters for selected+enabled platforms only |
| `collect-metrics.yml` | `schedule` (e.g. every 6h via cron) | `contents: read` | Per-platform read credentials, `CF_API_TOKEN` | Poll `getMetrics`/`getComments` for published posts, insert `metric_snapshots`/`comments` rows |
| `refresh-tokens.yml` | `schedule` (daily) | `contents: read`, `secrets: write` (via REST API call, not native permission) | Google/LinkedIn refresh tokens | Rotate OAuth access tokens before expiry; writes new tokens back as repo secrets via the GitHub REST API (libsodium-sealed) |
| `cleanup.yml` | `schedule` (weekly) | `contents: read` | `CF_API_TOKEN` | Purge stale `queued`/`running` job rows past a timeout threshold |
| `test.yml` | `pull_request`, `push` | `contents: read` | none (mocked APIs only) | Lint, unit tests, adapter tests with mocked HTTP, `DRY_RUN=true` end-to-end test |
| `deploy.yml` | `push` to `main`, after `test.yml` passes | `contents: read`, `pages: write`, `id-token: write` | `CF_API_TOKEN` (for Worker deploy) | Build dashboard → GitHub Pages; deploy Worker via Wrangler |

Skeleton (illustrative, not exhaustive — the agent fills in the actual steps):

```yaml
# .github/workflows/publish-content.yml
name: Publish Content
on:
  repository_dispatch:
    types: [publish-approved]
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned-sha>
      - uses: actions/setup-node@<pinned-sha>
        with:
          node-version: 20
      - run: npm ci
      - name: Run publish job
        env:
          APPROVAL_ID: ${{ github.event.client_payload.approval_id }}
          DRY_RUN: ${{ vars.DRY_RUN }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_D1_DATABASE_ID: ${{ secrets.CF_D1_DATABASE_ID }}
          BLOGGER_REFRESH_TOKEN: ${{ secrets.BLOGGER_REFRESH_TOKEN }}
          LINKEDIN_ACCESS_TOKEN: ${{ secrets.LINKEDIN_ACCESS_TOKEN }}
          DEVTO_API_KEY: ${{ secrets.DEVTO_API_KEY }}
        run: node scripts/publish.js
```

```yaml
# .github/workflows/process-content.yml
name: Process Content
on:
  workflow_dispatch:
    inputs:
      content_id: { required: true, type: string }
  repository_dispatch:
    types: [content-submitted]
permissions:
  contents: read
jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned-sha>
      - uses: actions/setup-node@<pinned-sha>
        with:
          node-version: 20
      - run: npm ci
      - name: Run processing pipeline
        env:
          AI_PROVIDER_ORDER: gemini,groq,workers_ai
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
        run: node scripts/process.js
```

---

## 12. Secrets & Environment Variables

`.env.example` (never commit real values):

```dotenv
# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=            # scoped: D1 edit, Workers edit only
CF_D1_DATABASE_ID=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=                # the owner's own chat ID — single-user bot
TELEGRAM_WEBHOOK_SECRET=         # used as Telegram's secret_token

# AI providers (configure at least one, or leave all blank for AI_PROVIDER=manual)
AI_PROVIDER_ORDER=gemini,groq,workers_ai
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=              # optional, stay on the 50 req/day unfunded tier to remain ₹0

# Blogger (Google OAuth — consent screen MUST be "In production")
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
BLOGGER_REFRESH_TOKEN=
BLOGGER_BLOG_ID=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_MEMBER_URN=

# DEV.to
DEVTO_API_KEY=

# GitHub (used by the Cloudflare Worker to trigger repository_dispatch and rotate secrets)
GH_DISPATCH_PAT=                 # fine-grained PAT: contents:write, actions:write only

# Runtime
DRY_RUN=true
NODE_ENV=development
```

---

## 13. Error Handling, Retries, Idempotency

- Every outbound platform call wraps in exponential backoff (base 2s, capped at ~5 retries) honoring any `retry_after`/rate-limit header the platform returns.
- `platform_posts.idempotency_key` (unique constraint) is the duplicate-publish guard — checked **before** calling `adapter.publish()`, not just recorded after.
- Partial failure never stops the batch — each platform is independent; the job's final status is `completed` only if every attempted platform succeeded, `completed_with_errors` otherwise.
- Observability events (write an `audit_logs` row for each): `processing_started`, `processing_completed`, `processing_failed`, `approval_requested`, `approval_received`, `publishing_started`, `publishing_completed`, `publishing_failed`, `metrics_collection_started`, `metrics_collection_completed`.
- Notifications fire on: processing finished, review required, publish success, publish partial success, publish failure, metrics collection failure, auth expired, retry required — batched/deduplicated so a flaky platform doesn't spam five Telegram messages in a minute.

---

## 14. Testing Strategy & DRY_RUN Mode

- Unit tests: content-cleaning logic, schema validation, idempotency-key generation.
- Adapter tests: every `PlatformAdapter` method tested against **mocked HTTP responses**, including a mocked `Unsupported` case.
- Integration tests: full pipeline run with `DRY_RUN=true` — generates content, validates it, simulates each adapter call, writes simulated results to a test D1 database, and **asserts zero real network calls were made to any platform's actual API**.
- Never run a real publish during CI. `test.yml` sets `DRY_RUN=true` unconditionally, with no override possible from a PR.
- Database tests: migration files apply cleanly to a fresh D1 instance, in order, idempotently (`IF NOT EXISTS` guards or a migrations-tracking table).

---

## 15. Folder Structure

```
contentflow-ai/
├── .github/workflows/
│   ├── process-content.yml
│   ├── publish-content.yml
│   ├── collect-metrics.yml
│   ├── refresh-tokens.yml
│   ├── cleanup.yml
│   ├── test.yml
│   └── deploy.yml
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_platforms_and_accounts.sql
│   ├── 003_platform_posts.sql
│   ├── 004_approval_and_publishing.sql
│   ├── 005_metrics_comments.sql
│   ├── 006_notifications_audit.sql
│   └── 007_seed_platforms.sql
├── scripts/
│   ├── process.js
│   ├── publish.js
│   └── collect-metrics.js
├── src/
│   ├── ai/                  # provider abstraction + gemini.ts, groq.ts, workers_ai.ts
│   ├── platforms/
│   │   ├── blogger/
│   │   ├── linkedin/
│   │   ├── devto/
│   │   ├── hashnode/
│   │   └── x/
│   ├── db/                  # D1 client + query helpers
│   └── shared/               # types, idempotency-key generation, validation
├── worker/                   # Cloudflare Worker: telegram webhook + dashboard API
│   ├── src/index.ts
│   └── wrangler.toml
├── dashboard/                 # static GitHub Pages frontend
├── tests/
├── .env.example
├── README.md
└── package.json
```

---

## 16. Documentation Requirements (README.md outline)

Project overview · Architecture (link the feasibility report's diagrams) · Features · Tech stack · Free-tier assumptions (with "verify this hasn't changed" callout) · Setup · Environment variables · Database setup (migrations) · GitHub Actions setup · Telegram bot setup · Blogger OAuth setup (**with the "In production" consent-screen step called out explicitly**) · LinkedIn setup · DEV.to setup · Secrets setup · Local development · Testing · Dry-run mode · Deployment · Troubleshooting · Security · Known limitations (X/Hashnode excluded, LinkedIn metrics unavailable, Blogger has no analytics endpoint) · Future roadmap.

---

## 17. Deployment & CI/CD

`deploy.yml` runs only after `test.yml` passes on `main`: build the static dashboard → publish to GitHub Pages; deploy the Worker via `wrangler deploy` using `CF_API_TOKEN`; apply any pending D1 migrations. No deployment step ever runs with `DRY_RUN` forced off — that flag is only ever set by the human-approved `publish-content.yml` path.

---

## 18. MVP Scope

**In:** raw content ingestion, AI (or manual) cleaning/structuring, Blogger + LinkedIn + DEV.to adapters (publish path), Telegram approval with per-platform selection, D1 storage per the full schema above, Blogger comment collection, DEV.to best-effort engagement counts, basic analytics dashboard, DRY_RUN mode, idempotent publishing, audit logging.

**Out (config-flip-ready, not built into the UI by default):** Hashnode, X, LinkedIn metrics/comments, media binary storage (R2), scheduled/future-dated publishing, Google Analytics integration for Blogger pageviews.

---

## 19. Build Order

1. Repo skeleton + D1 migrations (this section is safe to start immediately after the Pre-Build Checklist in §1 is satisfied)
2. Raw content ingestion (manual submission via `workflow_dispatch` input is enough for v1 — no need to build a submission UI yet)
3. AI processing abstraction with the fallback chain and `manual` mode
4. Review — start with the Telegram flow before the dashboard; the dashboard can lag
5. Cloudflare Worker: Telegram webhook receiver first, dashboard read API second
6. Blogger adapter (publish + comments)
7. LinkedIn adapter (publish only)
8. DEV.to adapter
9. `collect-metrics.yml`
10. Hashnode + X adapters, built but left `enabled=0`
11. Analytics dashboard
12. Hardening: full test suite, error-handling review, secrets audit, README pass

---

## 20. Future Roadmap

- Cloudflare R2 for actual media file storage once binary media becomes a real need
- Google Analytics (GA4) integration for Blogger pageviews
- Re-enable Hashnode if the owner ever pays for Pro; re-enable X if the owner ever accepts pay-per-use billing
- Scheduled/future-dated publishing
- If LinkedIn's Community Management API partnership is ever granted, add metrics/comments with the 48-hour storage restriction respected (or a documented, explicit exception if LinkedIn's policy changes)

---

## 21. Non-Negotiables Recap

- Never publish to a platform the user didn't select.
- Never fake a capability an API doesn't have — return `unsupported` and say why.
- Never scrape where an official API is required.
- Never publish anything without an explicit, current approval.
- Never let a retry cause a duplicate publish.
- Never put a real credential in the repo, the database, or the frontend.
- Never assume a "free" service is still free without checking — this is the single lesson this entire research pass exists to teach.
