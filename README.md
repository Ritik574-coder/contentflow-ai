# 🚀 ContentFlow AI

An end-to-end, AI-assisted content ingestion, structuring, approval, multi-platform publishing, and analytics pipeline.

ContentFlow AI turns raw developer notes or markdown posts into platform-optimized content, routes structured drafts to Telegram for explicit per-platform human approval, publishes asynchronously to enabled channels via official APIs, and tracks post-level metrics in a Cloudflare D1 database exposed to a static dashboard on GitHub Pages.

---

## 📐 System Architecture Overview

![ContentFlow AI Architecture Overview](docs/assets/architecture-overview.svg)

### High-Level Data Flow

```mermaid
flowchart TD
    subgraph Ingestion ["1. Ingestion Layer"]
        RAW["📝 Raw Notes / Markdown"] --> GHA_PROC["⚙️ GitHub Actions (process-content.yml)"]
    end

    subgraph AI_Engine ["2. AI Fallback Engine"]
        GHA_PROC --> AI_CHAIN{"🤖 AI Provider Chain"}
        AI_CHAIN -- 1. Primary --> GPT4["OpenAI GPT-4o"]
        AI_CHAIN -- 2. Secondary --> CLAUDE["Anthropic Claude 3.5"]
        AI_CHAIN -- 3. Tertiary --> GEMINI["Google Gemini 1.5"]
        AI_CHAIN -- 4. Fallback --> MANUAL["Manual / Rule-Based Engine"]
    end

    subgraph Storage_Approval ["3. Storage & Human Approval"]
        GPT4 & CLAUDE & GEMINI & MANUAL --> D1_DRAFT[("💾 Cloudflare D1 (Pending Drafts)")]
        D1_DRAFT --> TG_BOT["💬 Telegram Bot Webhook"]
        TG_BOT --> HUMAN["👤 Content Owner (Interactive Review)"]
    end

    subgraph Publishing ["4. Autonomous Distribution"]
        HUMAN -- "Approve & Select Platforms" --> GHA_PUB["⚙️ GitHub Actions (publish-content.yml)"]
        GHA_PUB --> BLOGGER["🧡 Blogger API"]
        GHA_PUB --> LINKEDIN["💙 LinkedIn API"]
        GHA_PUB --> DEVTO["🖤 DEV.to API"]
    end

    subgraph Analytics ["5. Metrics & Dashboard"]
        GHA_METRICS["⚙️ Scheduled Metrics Collection (6h)"] --> BLOGGER & DEVTO
        GHA_METRICS --> D1_METRICS[("💾 Cloudflare D1 Snapshots")]
        D1_METRICS --> WORKER_API["⚡ Cloudflare Worker API"]
        WORKER_API --> DASHBOARD["📊 GitHub Pages Static Dashboard"]
    end

    classDef primary fill:#1e1b4b,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef ai fill:#3b0764,stroke:#a855f7,stroke-width:2px,color:#fff;
    classDef approval fill:#831843,stroke:#ec4899,stroke-width:2px,color:#fff;
    classDef publish fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#fff;

    class RAW,GHA_PROC primary;
    class AI_CHAIN,GPT4,CLAUDE,GEMINI,MANUAL ai;
    class D1_DRAFT,TG_BOT,HUMAN approval;
    class GHA_PUB,BLOGGER,LINKEDIN,DEVTO,GHA_METRICS,D1_METRICS,WORKER_API,DASHBOARD publish;
```

---

## ✨ Key Features & Capabilities

- 🤖 **Swappable AI Provider Chain**: Automatic runtime fallback across OpenAI (GPT-4o), Anthropic (Claude 3.5), Google Gemini (1.5), and a zero-credential deterministic manual parser.
- 💬 **Interactive Telegram Approval**: Review AI-structured drafts directly in Telegram with per-platform toggle buttons before any external API call is dispatched.
- 🛡️ **Strict Human-in-the-Loop Safeguards**: Posts remain safely stored in draft status until explicit user authorization.
- 🔑 **Idempotency Guarantee**: Deterministic SHA-256 idempotency keying prevents duplicate publishing across automated retries or worker restarts.
- 📊 **Multi-Platform Analytics**: Periodic metrics collection and comments polling stored as immutable snapshots in Cloudflare D1.
- ⚡ **Serverless & Zero-Cost Architecture**: Runs on GitHub Actions, Cloudflare Workers, Cloudflare D1, and GitHub Pages.

---

## 🔄 Content Lifecycle & Approval State Machine

```mermaid
stateDiagram-v2
    [*] --> DraftSubmitted: Issue / Workflow Dispatch

    DraftSubmitted --> AIProcessing: Trigger process-content.yml
    AIProcessing --> DraftStructured: AI Cleans & Structures Draft

    DraftStructured --> PendingApproval: Save to D1 & Send Telegram Notification

    state PendingApproval {
        [*] --> AwaitingUserAction
        AwaitingUserAction --> PreviewRequested: Callback "preview"
        PreviewRequested --> AwaitingUserAction: Render Draft Preview
        AwaitingUserAction --> PlatformToggled: Callback "toggle_platform"
        PlatformToggled --> AwaitingUserAction: Update Target List
    }

    PendingApproval --> Rejected: User Clicks "Reject"
    Rejected --> [*]: Workflow Terminated

    PendingApproval --> ReadyToPublish: User Clicks "Approve"
    ReadyToPublish --> Publishing: Trigger publish-content.yml

    state Publishing {
        [*] --> CheckIdempotency
        CheckIdempotency --> DispatchAPIs: Key Not Found
        CheckIdempotency --> SkipPublish: Key Already Executed
        DispatchAPIs --> RecordPublishedState
    }

    Publishing --> Published: All Enabled Platforms Processed
    Published --> MetricsCollection: Scheduled Cron (Every 6h)
    MetricsCollection --> Published: Metrics Snapshot Saved to D1
```

---

## 🤖 AI Provider Fallback Engine

ContentFlow AI features a resilient provider fallback system. If an API provider experiences downtime, rate limits, or quota exhaustion, the pipeline gracefully fails over to the next provider without failing the workflow.

```mermaid
graph TD
    A[Raw Input Text] --> B{Try OpenAI GPT-4o}
    B -- Success --> S[Structured Draft Object]
    B -- Failure / Rate Limit --> C{Try Anthropic Claude 3.5}
    C -- Success --> S
    C -- Failure / Timeout --> D{Try Google Gemini 1.5}
    D -- Success --> S
    D -- Failure / No API Keys --> E[Deterministic Manual Fallback Engine]
    E --> S
```

### Provider Matrix

| Priority | Provider | Model | Fallback Trigger |
| :---: | :--- | :--- | :--- |
| **1** | **OpenAI** | `gpt-4o` | Rate limit (429), API outage (5xx), invalid key |
| **2** | **Anthropic** | `claude-3-5-sonnet` | Network timeout, payload error |
| **3** | **Google** | `gemini-1.5-flash` | Quota exceeded |
| **4** | **Manual** | Rule-Based Regex / Parser | Zero API keys configured or total cloud failure |

---

## 🌐 Platform Capabilities & Matrix

![ContentFlow AI Platform Capabilities](docs/assets/platform-matrix.svg)

| Platform | Default Status | Publishing Payload | Metrics Polling | Comments Sync |
| :--- | :---: | :--- | :--- | :--- |
| **Blogger** | ✅ `Enabled` | Full HTML Article | GA4 Integration (Optional) | ✅ Official Comments API |
| **LinkedIn** | ✅ `Enabled` | UGC Post (Text + Link) | ❌ Partner-Gated (48h limit) | ❌ Partner-Gated |
| **DEV.to** | ✅ `Enabled` | Markdown + Tag Array | ✅ Reactions & Views API | ❌ N/A |
| **Hashnode** | 🛑 `Disabled` | GraphQL API (Pro Tier) | 🛑 Disabled | 🛑 Disabled |
| **X (Twitter)** | 🛑 `Disabled` | Twitter API v2 (Pay-per-use) | 🛑 Disabled | 🛑 Disabled |

---

## 🗄️ Database Schema & D1 Architecture

The pipeline uses **Cloudflare D1** (SQLite at the edge) for structured persistent storage.

```mermaid
erDiagram
    CONTENTS ||--o{ CLEANED_VERSIONS : "has"
    CONTENTS ||--o{ PLATFORM_VERSIONS : "generates"
    CONTENTS ||--o{ APPROVALS : "requires"
    CONTENTS ||--o{ PUBLISH_JOBS : "triggers"
    PUBLISH_JOBS ||--o{ PUBLISHED_POSTS : "produces"
    PUBLISHED_POSTS ||--o{ METRICS_SNAPSHOTS : "tracks"
    PUBLISHED_POSTS ||--o{ COMMENTS : "receives"

    CONTENTS {
        integer id PK
        text raw_text
        text title
        text status
        datetime created_at
    }

    CLEANED_VERSIONS {
        integer id PK
        integer content_id FK
        text title
        text body
        text ai_provider
    }

    PLATFORM_VERSIONS {
        integer id PK
        integer content_id FK
        text platform
        text formatted_body
    }

    APPROVALS {
        integer id PK
        integer content_id FK
        text status
        text enabled_platforms
        text idempotency_key
    }

    PUBLISH_JOBS {
        integer id PK
        integer content_id FK
        text status
        text idempotency_key
    }

    PUBLISHED_POSTS {
        integer id PK
        integer content_id FK
        text platform
        text external_id
        text url
    }

    METRICS_SNAPSHOTS {
        integer id PK
        integer published_post_id FK
        integer views
        integer reactions
        datetime fetched_at
    }
```

Migrations live in `migrations/` (`001_initial_schema.sql` through `008_add_indexes.sql`).

---

## 📊 Static Dashboard & Analytics Visualizer

![ContentFlow AI Dashboard Mockup](docs/assets/dashboard-mockup.svg)

The frontend is a zero-dependency static web application hosted on **GitHub Pages** that connects to the Cloudflare Worker API.

- **Offline Mode**: Renders mock historical data when loaded without an API endpoint.
- **Live Worker Mode**: Pass `?api=https://your-worker.workers.dev` to connect to your live D1 database.
- **Metrics Tracked**: Total posts, pending approvals, multi-platform publishing history, engagement views, reactions, and comment feeds.

---

## ⚙️ GitHub Actions Workflows

| Workflow | File Path | Trigger | Purpose |
| :--- | :--- | :--- | :--- |
| **Process Content** | `.github/workflows/process-content.yml` | `workflow_dispatch` / `content-submitted` | Ingest raw notes, invoke AI fallback, push draft to D1, send Telegram prompt. |
| **Publish Content** | `.github/workflows/publish-content.yml` | `workflow_dispatch` / `publish-approved` | Dispatch idempotent multi-platform publishing jobs for approved posts. |
| **Collect Metrics** | `.github/workflows/collect-metrics.yml` | Cron (`0 */6 * * *`) | Poll platform APIs for engagement metrics and comments; save snapshots to D1. |
| **Refresh Tokens** | `.github/workflows/refresh-tokens.yml` | Daily Cron | Validate OAuth refresh token health across integrated services. |
| **Cleanup** | `.github/workflows/cleanup.yml` | Weekly Cron | Purge stale publishing job logs and temporary workflow artifacts. |
| **CI / Tests** | `.github/workflows/test.yml` | Push / Pull Request | Run test suite with `DRY_RUN=true` against in-memory SQLite schema. |
| **Deploy** | `.github/workflows/deploy.yml` | Push to `main` | Build & deploy static dashboard to GitHub Pages & worker to Cloudflare. |

---

## 🛠️ Local Development & Quickstart

### Prerequisites

- **Node.js**: `v18.x` or higher
- **Python 3**: For running the local static dashboard server

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/ContentFlow-AI.git
cd ContentFlow-AI

# Install dependencies
npm install

# Run full test suite
npm test
```

### Local Development Servers

```bash
# 1. Run local static dashboard (http://localhost:4173)
npm run serve

# 2. In a separate terminal, run Cloudflare Worker API locally
npm run worker:dev
# Dashboard with live local API: http://localhost:4173/?api=http://localhost:8787
```

### Applying Local Database Migrations

```bash
# Apply migrations to local D1 instance
npm run db:migrate:local
```

---

## 🔐 Environment Variables & Configuration

Copy `.env.example` to `.env`:

```bash
# General Pipeline Configuration
DRY_RUN=true               # When true, simulates all publishing without making real API calls
AI_PROVIDER=manual         # Set to 'auto', 'openai', 'anthropic', 'gemini', or 'manual'

# AI Provider Credentials (Optional if using manual mode)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...

# Telegram Approval Bot
TELEGRAM_BOT_TOKEN=123456789:ABC...
TELEGRAM_CHAT_ID=-100123456789
TELEGRAM_SECRET_TOKEN=super-secret-webhook-token

# Platform Publishing Credentials
BLOGGER_CLIENT_ID=...
BLOGGER_CLIENT_SECRET=...
BLOGGER_REFRESH_TOKEN=...
BLOGGER_BLOG_ID=...

LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REFRESH_TOKEN=...
LINKEDIN_AUTHOR_URN=urn:li:person:...

DEVTO_API_KEY=...
```

---

## 🛡️ Security & Safeguards

1. **Explicit Human Approval**: No content is ever posted automatically without explicit user authorization via Telegram.
2. **Deterministic Idempotency**: Idempotency keys (`hash(content_id + platform + approval_timestamp)`) ensure posts are never duplicated upon workflow retries.
3. **Secret Isolation**: Credentials reside exclusively in GitHub Action Secrets and Cloudflare Worker Secrets. The public dashboard on GitHub Pages never receives or exposes API keys.
4. **Webhook Authentication**: All Telegram webhooks check `X-Telegram-Bot-Api-Secret-Token` headers before accepting callbacks.

---

## 📄 License & Status

- **Project Status**: ~90% ready; `DRY_RUN` end-to-end verified. See `NEXT-AGENT-REPORT.md` and `PROGRESS.md` for details.
- **License**: MIT License
