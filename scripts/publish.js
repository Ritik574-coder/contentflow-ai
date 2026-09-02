#!/usr/bin/env node
// Publish Content — run a publish job for an approved approval request.
// Publishes ONLY to platforms the human explicitly selected. Idempotency is
// enforced by platform_posts.idempotency_key (checked before any adapter call).
// With DRY_RUN=true (the default), adapters are never called — simulated
// results are written instead.
//
// Inputs (environment):
//   APPROVAL_ID - the approved approval_requests row to publish
//   DRY_RUN     - "true" (or "1") simulates every publish (default true)
//   Per-platform secrets (BLOGGER_*, LINKEDIN_*, DEVTO_API_KEY, ...)

import { getDb } from '../src/db/client.js';
import q from '../src/db/queries/index.js';
import { getAdapter } from '../src/platforms/index.js';
import { generateIdempotencyKey } from '../src/shared/idempotency.js';
import { isOk, isUnsupported } from '../src/shared/result.js';
import { withBackoff } from '../src/shared/retry.js';
import { notifyPublishResult } from '../src/notify.js';
import { logAudit } from '../src/shared/logger.js';
import { pathToFileURL } from 'node:url';

const dryRun = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true' || String(process.env.DRY_RUN) === '1';

async function publishToPlatform({ db, job, approval, content, account, platform, version }) {
  const adapter = getAdapter(platform.key);
  const idempotencyKey = generateIdempotencyKey({
    contentId: content.id,
    platformAccountId: account.id,
    contentVersionId: version.id,
    approvalRequestId: approval.id,
  });

  // Duplicate-publish guard — check the idempotency key BEFORE any adapter call.
  const existing = await q.getPlatformPostByIdempotency(db, idempotencyKey);
  if (existing) {
    await q.insertPublishingAttempt(db, {
      publishingJobId: job.id,
      platformPostId: existing.id,
      attemptNumber: 1,
      result: 'skipped',
      errorMessage: 'already published (idempotency key match)',
    });
    return { platform: platform.key, outcome: 'skipped', reason: 'already published (idempotency key match)' };
  }

  const post = await q.insertPlatformPost(db, {
    contentVersionId: version.id,
    platformAccountId: account.id,
    status: 'publishing',
    idempotencyKey,
  });

  // Validate content before publishing.
  const validation = await adapter.validateContent(version);
  if (!isOk(validation)) {
    await q.updatePlatformPost(db, post.id, { status: 'failed' });
    await q.insertPublishingAttempt(db, {
      publishingJobId: job.id,
      platformPostId: post.id,
      attemptNumber: 1,
      result: 'failed',
      errorMessage: `validation: ${validation.error}`,
    });
    return { platform: platform.key, outcome: 'failed', reason: validation.error };
  }

  let outcome;
  try {
    if (dryRun) {
      // Simulate success — no real network call to any platform API.
      await q.updatePlatformPost(db, post.id, {
        status: 'published',
        external_post_id: `sim-${platform.key}-${post.id}`,
        external_url: `https://example.local/sim/${platform.key}/${post.id}`,
        published_at: new Date().toISOString(),
        response_metadata_json: JSON.stringify({ dry_run: true }),
      });
      await q.insertPublishingAttempt(db, {
        publishingJobId: job.id,
        platformPostId: post.id,
        attemptNumber: 1,
        result: 'success',
      });
      outcome = { platform: platform.key, outcome: 'success', url: `dry-run simulated publish (${platform.key})` };
    } else {
      const publishRes = await withBackoff(
        () => adapter.publish(version, account, idempotencyKey, {}),
        { retries: 5 },
      );

      if (isOk(publishRes)) {
        await q.updatePlatformPost(db, post.id, {
          status: 'published',
          external_post_id: publishRes.data.externalPostId,
          external_url: publishRes.data.externalUrl,
          published_at: new Date().toISOString(),
          response_metadata_json: JSON.stringify({ ok: true }),
        });
        await q.insertPublishingAttempt(db, {
          publishingJobId: job.id,
          platformPostId: post.id,
          attemptNumber: 1,
          result: 'success',
        });
        outcome = { platform: platform.key, outcome: 'success', url: publishRes.data.externalUrl };
      } else if (isUnsupported(publishRes)) {
        await q.updatePlatformPost(db, post.id, { status: 'skipped' });
        await q.insertPublishingAttempt(db, {
          publishingJobId: job.id,
          platformPostId: post.id,
          attemptNumber: 1,
          result: 'skipped',
          errorMessage: `unsupported: ${publishRes.reason}`,
        });
        outcome = { platform: platform.key, outcome: 'unsupported', reason: publishRes.reason };
      } else {
        await q.updatePlatformPost(db, post.id, { status: 'failed' });
        await q.insertPublishingAttempt(db, {
          publishingJobId: job.id,
          platformPostId: post.id,
          attemptNumber: 1,
          result: 'failed',
          errorMessage: publishRes.error,
        });
        outcome = { platform: platform.key, outcome: 'failed', reason: publishRes.error };
      }
    }
  } catch (e) {
    await q.updatePlatformPost(db, post.id, { status: 'failed' });
    await q.insertPublishingAttempt(db, {
      publishingJobId: job.id,
      platformPostId: post.id,
      attemptNumber: 1,
      result: 'failed',
      errorMessage: String((e && e.message) || e),
    });
    outcome = { platform: platform.key, outcome: 'failed', reason: String((e && e.message) || e) };
  }

  return outcome;
}

export { publishToPlatform, dryRun };
export async function main() {
  const approvalId = Number(process.env.APPROVAL_ID);
  if (!approvalId) throw new Error('APPROVAL_ID is required');

  const db = getDb();
  const approval = await q.getApprovalRequest(db, approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} not found`);

  if (approval.status !== 'approved') {
    console.log(JSON.stringify({ ok: false, error: `Approval ${approvalId} is not approved (status: ${approval.status}) — no publish.` }));
    return;
  }

  const content = await q.getContent(db, approval.content_id);
  const selectedKeys = await q.getSelectedPlatformKeys(db, approvalId);
  const job = await q.createPublishingJob(db, { approvalRequestId: approvalId, dryRun });

  if (!selectedKeys.length) {
    await q.updatePublishingJob(db, job.id, { status: 'completed', finished_at: new Date().toISOString() });
    console.log(JSON.stringify({ ok: true, approvalId, message: 'No platforms selected — nothing was published.', jobId: job.id }));
    return;
  }

  await logAudit(db, { entityType: 'publishing_jobs', entityId: job.id, action: 'publishing_started', result: 'success' });
  // Phase 7: mark content as actively publishing so status is no longer stale.
  await q.updateContentStatus(db, content.id, 'publishing', content.current_version_id);

  const results = [];
  let failed = 0;

  for (const key of selectedKeys) {
    const platform = await q.getPlatform(db, key);
    const account = await q.getPlatformAccount(db, key);
    if (!platform || !platform.enabled) {
      results.push({ platform: key, outcome: 'skipped', reason: 'platform disabled in catalog' });
      continue;
    }
    if (!account) {
      results.push({ platform: key, outcome: 'failed', reason: 'no platform_account configured' });
      failed++;
      continue;
    }
    const versions = await q.getVersionsForContent(db, content.id, key);
    const version = versions.length ? versions[versions.length - 1] : null;
    if (!version) {
      results.push({ platform: key, outcome: 'failed', reason: 'no platform-specific content version found' });
      failed++;
      continue;
    }

    const result = await publishToPlatform({ db, job, approval, content, account, platform, version });
    if (result.outcome === 'failed') failed++;
    results.push(result);
  }

  const jobStatus = failed === 0 ? 'completed' : 'completed_with_errors';
  await q.updatePublishingJob(db, job.id, { status: jobStatus, finished_at: new Date().toISOString() });
  await logAudit(db, { entityType: 'publishing_jobs', entityId: job.id, action: 'publishing_completed', result: jobStatus });

  // Phase 7: update content.status to reflect final publish outcome.
  // 'published'  → at least one platform succeeded (or all skipped via idempotency)
  // 'failed'     → every attempted platform failed (no successful post recorded)
  const allFailed = failed > 0 && results.every((r) => r.outcome === 'failed');
  const finalContentStatus = allFailed ? 'failed' : 'published';
  await q.updateContentStatus(db, content.id, finalContentStatus, content.current_version_id);

  await notifyPublishResult({ db, approvalId, results, jobStatus });

  const summary = { ok: true, approvalId, jobId: job.id, dryRun, jobStatus, results };
  console.log(JSON.stringify(summary, null, 2));
  if (jobStatus === 'completed_with_errors') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (e) => {
      console.error(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
      process.exit(1);
    },
  );
}
