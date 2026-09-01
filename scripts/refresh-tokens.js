#!/usr/bin/env node
// Validates OAuth/API credentials before they expire.
// Blogger: exchanges refresh token for a new access token (refresh token is unchanged).
// LinkedIn: lightweight userinfo probe.
// Does NOT write back to GitHub Secrets — that requires libsodium-sealed API calls
// (see docs/DEPLOYMENT.md). On failure, logs audit row and exits non-zero.

import { BloggerAdapter } from '../src/platforms/blogger/adapter.js';
import { LinkedInAdapter } from '../src/platforms/linkedin/adapter.js';
import { DevtoAdapter } from '../src/platforms/devto/adapter.js';
import { getDb } from '../src/db/client.js';
import { logAudit } from '../src/shared/logger.js';
import { pathToFileURL } from 'node:url';

const account = { token_secret_ref: null };

async function checkBlogger() {
  if (!process.env.BLOGGER_REFRESH_TOKEN) return { platform: 'blogger', status: 'skipped', reason: 'no refresh token' };
  const adapter = new BloggerAdapter();
  const res = await adapter.validateCredentials(account);
  return res.ok
    ? { platform: 'blogger', status: 'ok' }
    : { platform: 'blogger', status: 'failed', reason: res.error };
}

async function checkLinkedIn() {
  if (!process.env.LINKEDIN_ACCESS_TOKEN) return { platform: 'linkedin', status: 'skipped', reason: 'no access token' };
  const adapter = new LinkedInAdapter();
  const res = await adapter.validateCredentials(account);
  return res.ok
    ? { platform: 'linkedin', status: 'ok' }
    : { platform: 'linkedin', status: 'failed', reason: res.error };
}

async function checkDevto() {
  if (!process.env.DEVTO_API_KEY) return { platform: 'devto', status: 'skipped', reason: 'no api key' };
  const adapter = new DevtoAdapter();
  const res = await adapter.validateCredentials({ token_secret_ref: 'DEVTO_API_KEY' });
  return res.ok
    ? { platform: 'devto', status: 'ok' }
    : { platform: 'devto', status: 'failed', reason: res.error };
}

export async function main() {
  const db = getDb();
  const results = await Promise.all([checkBlogger(), checkLinkedIn(), checkDevto()]);
  const failed = results.filter((r) => r.status === 'failed');

  await logAudit(db, {
    entityType: 'platform_accounts',
    entityId: null,
    action: 'token_refresh_check',
    result: failed.length ? 'failure' : 'success',
    errorMessage: failed.map((f) => `${f.platform}: ${f.reason}`).join('; ') || null,
  });

  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    process.exit(1);
  });
}
