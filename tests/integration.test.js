import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestDb } from './helpers/sqlite-db.js';
import q from '../src/db/queries/index.js';
import { runProcessPipeline } from '../scripts/process.js';
import { publishToPlatform, dryRun } from '../scripts/publish.js';
import { generateIdempotencyKey } from '../src/shared/idempotency.js';

test('process pipeline stores versions and a pending approval with no default selection', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'A short note about building a content pipeline with human approval gates.');

  assert.ok(summary.contentId > 0);
  assert.ok(summary.approvalId > 0);
  assert.equal(summary.status, 'ready_for_review');

  const content = await q.getContent(db, summary.contentId);
  assert.equal(content.status, 'ready_for_review');

  const selections = await q.getApprovalSelections(db, summary.approvalId);
  assert.ok(selections.length >= 3);
  assert.equal(selections.every((s) => !s.selected), true);
});

test('publish pipeline is idempotent in DRY_RUN mode', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Publish idempotency test note.');

  const blogger = await q.getPlatform(db, 'blogger');
  const account = await q.getPlatformAccount(db, 'blogger');
  await q.upsertApprovalSelection(db, { approvalRequestId: summary.approvalId, platformId: blogger.id, selected: true });
  await q.updateApprovalStatus(db, summary.approvalId, 'approved', 'test');

  const approval = await q.getApprovalRequest(db, summary.approvalId);
  const content = await q.getContent(db, summary.contentId);
  const job = await q.createPublishingJob(db, { approvalRequestId: summary.approvalId, dryRun: true });
  const versions = await q.getVersionsForContent(db, content.id, 'blogger');
  const version = versions[versions.length - 1];

  const first = await publishToPlatform({
    db,
    job,
    approval,
    content,
    account,
    platform: blogger,
    version,
  });
  const second = await publishToPlatform({
    db,
    job,
    approval,
    content,
    account,
    platform: blogger,
    version,
  });

  assert.equal(first.outcome, 'success');
  assert.equal(second.outcome, 'skipped');
  assert.equal(dryRun, true);

  const key = generateIdempotencyKey({
    contentId: content.id,
    platformAccountId: account.id,
    contentVersionId: version.id,
    approvalRequestId: approval.id,
  });
  const existing = await q.getPlatformPostByIdempotency(db, key);
  assert.ok(existing);
  assert.equal(existing.status, 'published');
});
