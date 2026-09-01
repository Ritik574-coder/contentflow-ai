#!/usr/bin/env node
// Reports which credentials and infrastructure are configured.
// Run: node scripts/check-setup.js
// Exit 0 = D1 credentials present (DRY_RUN pipeline can run in CI);
// exit 1 = missing CF_API_TOKEN / CF_D1_DATABASE_ID / CF_ACCOUNT_ID.

const REQUIRED_FOR_PROCESS = ['CF_API_TOKEN', 'CF_D1_DATABASE_ID', 'CF_ACCOUNT_ID'];
const OPTIONAL_AI = ['GEMINI_API_KEY', 'GROQ_API_KEY'];
const PLATFORM_SECRETS = {
  blogger: ['BLOGGER_CLIENT_ID', 'BLOGGER_CLIENT_SECRET', 'BLOGGER_REFRESH_TOKEN', 'BLOGGER_BLOG_ID'],
  linkedin: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_MEMBER_URN'],
  devto: ['DEVTO_API_KEY'],
};
const WORKER_SECRETS = ['TELEGRAM_SECRET_TOKEN', 'GH_DISPATCH_PAT'];
const WORKER_VARS = ['GH_REPO_OWNER', 'GH_REPO_NAME'];
const TELEGRAM = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

function present(key) {
  return Boolean(process.env[key] && String(process.env[key]).trim());
}

function section(title, keys) {
  const rows = keys.map((key) => ({ key, ok: present(key) }));
  const missing = rows.filter((r) => !r.ok).map((r) => r.key);
  return { title, rows, missing, ready: rows.every((r) => r.ok) };
}

function platformReadiness() {
  const platforms = {};
  const readyPlatforms = [];
  const missingForRealPublish = [];

  for (const [key, secrets] of Object.entries(PLATFORM_SECRETS)) {
    const missing = secrets.filter((s) => !present(s));
    const ready = missing.length === 0;
    platforms[key] = { ready, missing };
    if (ready) readyPlatforms.push(key);
    else missingForRealPublish.push({ platform: key, missing });
  }

  return { platforms, readyPlatforms, missingForRealPublish };
}

const dryRun = String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const platformStatus = platformReadiness();

const report = {
  checkedAt: new Date().toISOString(),
  aiProvider: process.env.AI_PROVIDER || process.env.AI_PROVIDER_ORDER || 'gemini,groq,workers_ai,manual',
  dryRun,
  sections: {
    database: section('Cloudflare D1 (GitHub Actions)', REQUIRED_FOR_PROCESS),
    telegram: section('Telegram notifications (GitHub Actions)', TELEGRAM),
    workerSecrets: section('Worker secrets (set via wrangler secret put)', WORKER_SECRETS),
    workerVars: section('Worker vars (wrangler.toml [vars])', WORKER_VARS),
    ai: section('AI providers (optional if AI_PROVIDER=manual)', OPTIONAL_AI),
    blogger: section('Blogger (real publish)', PLATFORM_SECRETS.blogger),
    linkedin: section('LinkedIn (real publish)', PLATFORM_SECRETS.linkedin),
    devto: section('DEV.to (real publish)', PLATFORM_SECRETS.devto),
  },
};

const d1Ready = report.sections.database.ready;
const telegramReady = report.sections.telegram.ready;
const workerSecretsReady = report.sections.workerSecrets.ready;
const workerVarsReady = report.sections.workerVars.ready;
const anyPlatformReady = platformStatus.readyPlatforms.length > 0;

report.summary = {
  dryRunE2EReady: d1Ready && telegramReady && workerSecretsReady && workerVarsReady && dryRun,
  dryRunPipelineReady: d1Ready,
  liveWorkerReady: d1Ready && workerSecretsReady && workerVarsReady && telegramReady,
  realPublishReady: d1Ready && anyPlatformReady && !dryRun,
  readyPlatforms: platformStatus.readyPlatforms,
  missingForRealPublish: platformStatus.missingForRealPublish,
  notes: [
    !dryRun ? null : 'DRY_RUN=true — real platform APIs are not called during publish.',
    anyPlatformReady ? null : 'No platform credentials configured yet — add secrets before setting DRY_RUN=false.',
    workerSecretsReady ? null : 'Worker secrets are not visible in GitHub Actions env; verify with: npx wrangler secret list',
    'refresh-tokens.yml validates credentials only — it does not write refreshed tokens back to GitHub Secrets.',
  ].filter(Boolean),
};

console.log(JSON.stringify(report, null, 2));

if (!d1Ready) process.exitCode = 1;
