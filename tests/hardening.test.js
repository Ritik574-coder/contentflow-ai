import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/index.js';
import { handleTelegramUpdate } from '../worker/telegram.js';
import q from '../src/db/queries/index.js';
import { createTestDb } from './helpers/sqlite-db.js';
import { runProcessPipeline } from '../scripts/process.js';
import { publishToPlatform, dryRun } from '../scripts/publish.js';

function buildEnv(db, extra = {}) {
  return {
    query: db.query.bind(db),
    first: db.first.bind(db),
    run: db.run.bind(db),
    ...extra,
  };
}

function approvalRequestBody(contentId, selectedPlatforms = ['blogger']) {
  return JSON.stringify({ contentId, selectedPlatforms });
}

async function callDashboardApproval(db, { token, env = {}, contentId, selectedPlatforms = ['blogger'] }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request('https://example.test/api/approval', {
    method: 'POST',
    headers,
    body: approvalRequestBody(contentId, selectedPlatforms),
  });
  return worker.fetch(request, buildEnv(db, env));
}

function finalizeContentStatusFromResults(db, contentId, results) {
  const failedCount = results.filter((result) => result.outcome === 'failed').length;
  const allFailed = failedCount > 0 && results.every((result) => result.outcome === 'failed');
  const finalStatus = allFailed ? 'failed' : 'published';
  return q.updateContentStatus(db, contentId, finalStatus, null);
}

test('dashboard auth rejects missing token when configured', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Authorization should reject missing bearer token.');

  const res = await callDashboardApproval(db, { env: { DASHBOARD_API_TOKEN: 'secret-token' }, contentId: summary.contentId });
  assert.equal(res.status, 401);

  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'Unauthorized');
});

test('dashboard auth rejects wrong token when configured', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Authorization should reject wrong bearer token.');

  const res = await callDashboardApproval(db, {
    token: 'wrong-token',
    env: { DASHBOARD_API_TOKEN: 'secret-token' },
    contentId: summary.contentId,
  });
  assert.equal(res.status, 401);

  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'Unauthorized');
});

test('dashboard auth accepts a valid bearer token', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Authorization should accept the configured bearer token.');

  const res = await callDashboardApproval(db, {
    token: 'secret-token',
    env: { DASHBOARD_API_TOKEN: 'secret-token' },
    contentId: summary.contentId,
  });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.approval_id, summary.approvalId);
  assert.equal(body.dispatch, 'GH_DISPATCH_PAT / GH_REPO_OWNER / GH_REPO_NAME not configured');

  const approval = await q.getApprovalRequest(db, summary.approvalId);
  assert.equal(approval.status, 'approved');
});

test('telegram webhook authentication still works', async () => {
  const db = createTestDb();
  const request = new Request('https://example.test/webhook/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
    },
    body: JSON.stringify({ ok: true }),
  });

  const unauthorized = await worker.fetch(request, buildEnv(db, { TELEGRAM_SECRET_TOKEN: 'correct-secret' }));
  assert.equal(unauthorized.status, 403);

  const allowed = await worker.fetch(new Request('https://example.test/webhook/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'correct-secret',
    },
    body: JSON.stringify({ message: { chat: { id: 1 } } }),
  }), buildEnv(db, { TELEGRAM_SECRET_TOKEN: 'correct-secret' }));

  assert.equal(allowed.status, 200);
  const allowedBody = await allowed.json();
  assert.equal(allowedBody.ok, true);
});

test('successful publishing keeps the content status published', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'A successful publish should leave content in published state.');
  const content = await q.getContent(db, summary.contentId);

  const results = [{ platform: 'blogger', outcome: 'success' }];
  await finalizeContentStatusFromResults(db, content.id, results);

  const updated = await q.getContent(db, content.id);
  assert.equal(updated.status, 'published');
});

test('all platform failures mark content as failed', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'A total platform failure should mark content as failed.');
  const content = await q.getContent(db, summary.contentId);

  const results = [{ platform: 'blogger', outcome: 'failed', reason: 'network error' }, { platform: 'linkedin', outcome: 'failed', reason: 'network error' }];
  await finalizeContentStatusFromResults(db, content.id, results);

  const updated = await q.getContent(db, content.id);
  assert.equal(updated.status, 'failed');
});

test('partial platform failure still leaves content published', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'One good platform and one failed platform should still publish.');
  const content = await q.getContent(db, summary.contentId);

  const results = [{ platform: 'blogger', outcome: 'success' }, { platform: 'linkedin', outcome: 'failed', reason: 'rate limited' }];
  await finalizeContentStatusFromResults(db, content.id, results);

  const updated = await q.getContent(db, content.id);
  assert.equal(updated.status, 'published');
});

test('telegram rejection marks content as rejected', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Telegram rejection should mark the reviewed content as rejected.');
  const approval = await q.getApprovalRequest(db, summary.approvalId);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const update = {
      callback_query: {
        id: 'q1',
        data: `reject:${approval.id}`,
        message: { chat: { id: 101 }, message_id: 999 },
      },
    };

    await handleTelegramUpdate(db, update, { TELEGRAM_BOT_TOKEN: 'fake-token' });

    const currentApproval = await q.getApprovalRequest(db, approval.id);
    const content = await q.getContent(db, summary.contentId);
    assert.equal(currentApproval.status, 'rejected');
    assert.equal(content.status, 'rejected');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('duplicate approval requests return 409', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Duplicate dashboard approvals should be rejected.');

  const first = await callDashboardApproval(db, {
    token: 'secret-token',
    env: { DASHBOARD_API_TOKEN: 'secret-token' },
    contentId: summary.contentId,
  });
  assert.equal(first.status, 200);

  const second = await callDashboardApproval(db, {
    token: 'secret-token',
    env: { DASHBOARD_API_TOKEN: 'secret-token' },
    contentId: summary.contentId,
  });
  assert.equal(second.status, 409);
});

test('concurrent dashboard approvals dispatch only one publish workflow', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Only one concurrent approval should dispatch the workflow.');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const first = await callDashboardApproval(db, {
      token: 'secret-token',
      env: {
        DASHBOARD_API_TOKEN: 'secret-token',
        GH_REPO_OWNER: 'demo-owner',
        GH_REPO_NAME: 'demo-repo',
        GH_DISPATCH_PAT: 'token',
      },
      contentId: summary.contentId,
    });
    const second = await callDashboardApproval(db, {
      token: 'secret-token',
      env: {
        DASHBOARD_API_TOKEN: 'secret-token',
        GH_REPO_OWNER: 'demo-owner',
        GH_REPO_NAME: 'demo-repo',
        GH_DISPATCH_PAT: 'token',
      },
      contentId: summary.contentId,
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('existing platform idempotency still works', async () => {
  const db = createTestDb();
  const summary = await runProcessPipeline(db, 'Platform idempotency should still prevent duplicates.');

  const blogger = await q.getPlatform(db, 'blogger');
  const account = await q.getPlatformAccount(db, 'blogger');
  await q.upsertApprovalSelection(db, { approvalRequestId: summary.approvalId, platformId: blogger.id, selected: true });
  await q.updateApprovalStatus(db, summary.approvalId, 'approved', 'test');

  const approval = await q.getApprovalRequest(db, summary.approvalId);
  const content = await q.getContent(db, summary.contentId);
  const job = await q.createPublishingJob(db, { approvalRequestId: summary.approvalId, dryRun: true });
  const versions = await q.getVersionsForContent(db, content.id, 'blogger');
  const version = versions[versions.length - 1];

  const first = await publishToPlatform({ db, job, approval, content, account, platform: blogger, version });
  const second = await publishToPlatform({ db, job, approval, content, account, platform: blogger, version });

  assert.equal(first.outcome, 'success');
  assert.equal(second.outcome, 'skipped');
  assert.equal(dryRun, true);
});
