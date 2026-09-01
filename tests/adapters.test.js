import test from 'node:test';
import assert from 'node:assert/strict';

import { generateIdempotencyKey } from '../src/shared/idempotency.js';
import { isUnsupported } from '../src/shared/result.js';
import { LinkedInAdapter } from '../src/platforms/linkedin/adapter.js';
import { DevtoAdapter } from '../src/platforms/devto/adapter.js';
import { XAdapter } from '../src/platforms/x/adapter.js';
import { HashnodeAdapter } from '../src/platforms/hashnode/adapter.js';

test('generateIdempotencyKey is deterministic for the same inputs', () => {
  const opts = { contentId: 1, platformAccountId: 2, contentVersionId: 3, approvalRequestId: 4 };
  const a = generateIdempotencyKey(opts);
  const b = generateIdempotencyKey(opts);
  assert.equal(a, b);
  assert.match(a, /^cf-[a-f0-9]{32}$/);
});

test('generateIdempotencyKey changes when approval changes', () => {
  const base = { contentId: 1, platformAccountId: 2, contentVersionId: 3, approvalRequestId: 4 };
  const other = { ...base, approvalRequestId: 5 };
  assert.notEqual(generateIdempotencyKey(base), generateIdempotencyKey(other));
});

test('LinkedIn adapter returns unsupported for metrics and comments', async () => {
  const adapter = new LinkedInAdapter();
  const metrics = await adapter.getMetrics('123', {});
  const comments = await adapter.getComments('123', {});
  assert.equal(isUnsupported(metrics), true);
  assert.equal(isUnsupported(comments), true);
});

test('X adapter publish is unsupported (no free tier)', async () => {
  const adapter = new XAdapter();
  const result = await adapter.publish({ body: 'hello' }, {}, 'key-1');
  assert.equal(isUnsupported(result), true);
  assert.match(result.reason, /no free/i);
});

test('Hashnode adapter publish is unsupported when disabled', async () => {
  const adapter = new HashnodeAdapter();
  const draft = await adapter.createDraft({ body: 'hello' }, {}, 'key-1');
  assert.equal(isUnsupported(draft), true);
});

test('DEV.to adapter sends tags as an array', async () => {
  const adapter = new DevtoAdapter();
  let capturedBody;
  const fetchImpl = async (_url, opts = {}) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: 99, url: 'https://dev.to/example/99' }),
      text: async () => '',
    };
  };

  process.env.DEVTO_API_KEY = 'test-key';
  const result = await adapter.publish(
    { title: 'Test', body: 'Body', tags: ['AI', 'workflow'] },
    { token_secret_ref: 'DEVTO_API_KEY' },
    'idem-1',
    { fetchImpl },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(capturedBody.article.tags, ['ai', 'workflow']);
});
