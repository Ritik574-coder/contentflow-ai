import test from 'node:test';
import assert from 'node:assert/strict';

import { generateIdempotencyKey } from '../src/shared/idempotency.js';
import { isUnsupported } from '../src/shared/result.js';
import { LinkedInAdapter } from '../src/platforms/linkedin/adapter.js';
import { DevtoAdapter } from '../src/platforms/devto/adapter.js';
import { XAdapter } from '../src/platforms/x/adapter.js';
import { HashnodeAdapter } from '../src/platforms/hashnode/adapter.js';
import { BloggerAdapter } from '../src/platforms/blogger/adapter.js';

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

test('Blogger adapter converts Markdown body to HTML on publish', async () => {
  const adapter = new BloggerAdapter();
  let capturedBody;
  const fetchImpl = async (url, opts = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const data = { access_token: 'mock-access-token' };
      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => JSON.stringify(data),
      };
    }
    capturedBody = JSON.parse(opts.body);
    const postData = { id: 'blogger-post-123', url: 'https://myblog.blogspot.com/post123' };
    return {
      ok: true,
      status: 200,
      json: async () => postData,
      text: async () => JSON.stringify(postData),
    };
  };

  process.env.BLOGGER_CLIENT_ID = 'mock-client-id';
  process.env.BLOGGER_CLIENT_SECRET = 'mock-client-secret';
  process.env.BLOGGER_REFRESH_TOKEN = 'mock-refresh-token';
  process.env.BLOGGER_BLOG_ID = '1234567890';

  const markdownBody = `# Main Title

## Section Heading

This is **bold** text and *italic* text.

- Item A
- Item B

[Link](https://example.com)`;

  const result = await adapter.publish(
    { title: 'Test Blogger Post', body: markdownBody },
    { token_secret_ref: 'BLOGGER_REFRESH_TOKEN' },
    'idem-blogger-1',
    { fetchImpl },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.externalPostId, 'blogger-post-123');
  assert.equal(result.data.externalUrl, 'https://myblog.blogspot.com/post123');

  assert.ok(capturedBody.content.includes('<h1>Main Title</h1>'));
  assert.ok(capturedBody.content.includes('<h2>Section Heading</h2>'));
  assert.ok(capturedBody.content.includes('<strong>bold</strong>'));
  assert.ok(capturedBody.content.includes('<em>italic</em>'));
  assert.ok(capturedBody.content.includes('<ul>'));
  assert.ok(capturedBody.content.includes('<li>Item A</li>'));
  assert.ok(capturedBody.content.includes('<a href="https://example.com">Link</a>'));
  assert.equal(capturedBody.content.includes('# Main Title'), false);
});

test('Blogger adapter converts Markdown body to HTML on createDraft', async () => {
  const adapter = new BloggerAdapter();
  let capturedBody;
  const fetchImpl = async (url, opts = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const data = { access_token: 'mock-access-token' };
      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => JSON.stringify(data),
      };
    }
    capturedBody = JSON.parse(opts.body);
    const draftData = { id: 'blogger-draft-456', url: 'https://myblog.blogspot.com/draft456' };
    return {
      ok: true,
      status: 200,
      json: async () => draftData,
      text: async () => JSON.stringify(draftData),
    };
  };

  process.env.BLOGGER_CLIENT_ID = 'mock-client-id';
  process.env.BLOGGER_CLIENT_SECRET = 'mock-client-secret';
  process.env.BLOGGER_REFRESH_TOKEN = 'mock-refresh-token';
  process.env.BLOGGER_BLOG_ID = '1234567890';

  const markdownBody = `### Draft Heading\n\nDraft paragraph.`;

  const result = await adapter.createDraft(
    { title: 'Draft Post', body: markdownBody },
    { token_secret_ref: 'BLOGGER_REFRESH_TOKEN' },
    { fetchImpl },
  );

  assert.equal(result.ok, true);
  assert.equal(capturedBody.status, 'DRAFT');
  assert.ok(capturedBody.content.includes('<h3>Draft Heading</h3>'));
  assert.ok(capturedBody.content.includes('<p>Draft paragraph.</p>'));
  assert.equal(capturedBody.content.includes('### Draft Heading'), false);
});

