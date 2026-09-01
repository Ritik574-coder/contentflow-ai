#!/usr/bin/env node
// Reports which credentials and infrastructure are configured.
// Run: node scripts/check-setup.js
// Exit 0 = ready for DRY_RUN pipeline; exit 1 = missing required items for production.

const REQUIRED_FOR_CI = [];
const REQUIRED_FOR_PROCESS = ['CF_API_TOKEN', 'CF_D1_DATABASE_ID', 'CF_ACCOUNT_ID'];
const REQUIRED_FOR_PUBLISH = [
  'CF_API_TOKEN',
  'CF_D1_DATABASE_ID',
  'CF_ACCOUNT_ID',
];
const OPTIONAL_AI = ['GEMINI_API_KEY', 'GROQ_API_KEY'];
const OPTIONAL_PLATFORMS = {
  blogger: ['BLOGGER_CLIENT_ID', 'BLOGGER_CLIENT_SECRET', 'BLOGGER_REFRESH_TOKEN', 'BLOGGER_BLOG_ID'],
  linkedin: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_MEMBER_URN'],
  devto: ['DEVTO_API_KEY'],
};
const WORKER_SECRETS = ['TELEGRAM_SECRET_TOKEN', 'GH_DISPATCH_PAT', 'GH_REPO_OWNER', 'GH_REPO_NAME'];
const TELEGRAM = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

function present(key) {
  return Boolean(process.env[key] && String(process.env[key]).trim());
}

function section(title, keys) {
  const rows = keys.map((key) => ({ key, ok: present(key) }));
  return { title, rows, ready: rows.every((r) => r.ok) };
}

const report = {
  checkedAt: new Date().toISOString(),
  aiProvider: process.env.AI_PROVIDER || process.env.AI_PROVIDER_ORDER || 'gemini,groq,workers_ai,manual',
  dryRun: String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
  sections: {
    database: section('Cloudflare D1 (GitHub Actions)', REQUIRED_FOR_PROCESS),
    telegram: section('Telegram notifications', TELEGRAM),
    worker: section('Worker → GitHub dispatch', WORKER_SECRETS),
    ai: section('AI providers (optional if manual)', OPTIONAL_AI),
    blogger: section('Blogger', OPTIONAL_PLATFORMS.blogger),
    linkedin: section('LinkedIn', OPTIONAL_PLATFORMS.linkedin),
    devto: section('DEV.to', OPTIONAL_PLATFORMS.devto),
  },
};

const d1Ready = report.sections.database.ready;
const telegramReady = report.sections.telegram.ready;
const workerReady = report.sections.worker.ready;
const anyPlatform =
  report.sections.blogger.ready || report.sections.linkedin.ready || report.sections.devto.ready;

report.summary = {
  localTestsOnly: true,
  dryRunPipelineReady: d1Ready,
  liveWorkerReady: d1Ready && workerReady && telegramReady,
  realPublishReady: d1Ready && anyPlatform && !report.dryRun,
};

console.log(JSON.stringify(report, null, 2));

if (!d1Ready) process.exitCode = 1;
