import test from 'node:test';
import assert from 'node:assert/strict';

import { validateDraft } from '../src/ai/validation.js';
import { extractJson } from '../src/ai/prompt.js';
import { generateManual } from '../src/ai/manual.js';
import { generateWithGemini } from '../src/ai/gemini.js';
import { generateWithGroq } from '../src/ai/groq.js';
import { generateWithWorkersAI } from '../src/ai/workers-ai.js';
import { processContent } from '../src/ai/index.js';

// --- Validation Tests ---

test('validateDraft passes on valid complete draft', () => {
  const input = {
    title: 'Valid Title',
    summary: 'A brief summary',
    body: '## Markdown Content\nSome body text.',
    category: 'engineering',
    tags: ['ai', 'automation'],
    keywords: ['workflow'],
    flaggedClaims: [{ claim_text: 'Claim', reason: 'Unverified' }],
  };

  const res = validateDraft(input);
  assert.equal(res.ok, true);
  assert.equal(res.data.title, 'Valid Title');
  assert.equal(res.data.body, '## Markdown Content\nSome body text.');
  assert.equal(res.data.category, 'engineering');
  assert.deepEqual(res.data.tags, ['ai', 'automation']);
});

test('validateDraft fails when title or body is missing or empty', () => {
  assert.equal(validateDraft(null).ok, false);
  assert.equal(validateDraft({ body: 'Some body' }).ok, false);
  assert.equal(validateDraft({ title: '   ', body: 'Some body' }).ok, false);
  assert.equal(validateDraft({ title: 'Title', body: '   ' }).ok, false);
  assert.equal(validateDraft({ title: 'Title' }).ok, false);
});

test('validateDraft provides default values for optional fields', () => {
  const input = {
    title: 'Minimal Title',
    body: 'Minimal Body',
  };

  const res = validateDraft(input);
  assert.equal(res.ok, true);
  assert.equal(res.data.summary, 'Structured draft pending review.');
  assert.equal(res.data.category, 'general');
  assert.deepEqual(res.data.tags, []);
  assert.deepEqual(res.data.keywords, []);
  assert.deepEqual(res.data.flaggedClaims, []);
});

// --- JSON Extraction Tests ---

test('extractJson parses plain JSON and markdown-fenced JSON', () => {
  const plain = '{"title": "Test", "body": "Body"}';
  assert.deepEqual(extractJson(plain), { title: 'Test', body: 'Body' });

  const fenced = '```json\n{"title": "Fenced", "body": "Body"}\n```';
  assert.deepEqual(extractJson(fenced), { title: 'Fenced', body: 'Body' });

  const commentary = 'Here is the response:\n{"title": "Commentary", "body": "Body"}\nHope this helps!';
  assert.deepEqual(extractJson(commentary), { title: 'Commentary', body: 'Body' });

  assert.equal(extractJson('invalid json string'), null);
  assert.equal(extractJson(null), null);
});

// --- Provider Unit Tests ---

test('generateManual produces deterministic valid draft with zero credentials', async () => {
  const res = await generateManual('First note about automation and publishing pipeline.');
  assert.equal(res.ok, true);
  assert.match(res.data.title, /^First note/);
  assert.ok(res.data.body.includes('First note about automation'));
  assert.equal(res.data.category, 'general');
  assert.ok(Array.isArray(res.data.tags));
});

test('generateWithGemini returns error if GEMINI_API_KEY is missing', async () => {
  delete process.env.GEMINI_API_KEY;
  const res = await generateWithGemini('Raw text');
  assert.equal(res.ok, false);
  assert.match(res.error, /GEMINI_API_KEY/);
});

test('generateWithGemini parses valid API response', async () => {
  process.env.GEMINI_API_KEY = 'mock-key';
  const mockPayload = {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            title: 'Gemini Title',
            summary: 'Gemini Summary',
            body: '# Gemini Body',
            category: 'tech',
            tags: ['gemini'],
            keywords: ['ai'],
            flaggedClaims: [],
          }),
        }],
      },
    }],
  };

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(mockPayload),
  });

  const res = await generateWithGemini('Raw input', { fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.data.title, 'Gemini Title');
  assert.equal(res.data.body, '# Gemini Body');
});

test('generateWithGemini handles malformed AI output', async () => {
  process.env.GEMINI_API_KEY = 'mock-key';
  const mockPayload = {
    candidates: [{
      content: {
        parts: [{ text: '{"title": "Missing Body"}' }],
      },
    }],
  };

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(mockPayload),
  });

  const res = await generateWithGemini('Raw input', { fetchImpl });
  assert.equal(res.ok, false);
  assert.match(res.error, /validation failed/i);
});

test('generateWithGroq parses valid response and handles missing key', async () => {
  delete process.env.GROQ_API_KEY;
  assert.equal((await generateWithGroq('Raw')).ok, false);

  process.env.GROQ_API_KEY = 'mock-groq';
  const mockPayload = {
    choices: [{
      message: {
        content: JSON.stringify({
          title: 'Groq Title',
          summary: 'Groq Summary',
          body: 'Groq Body Content',
          category: 'ai',
          tags: ['groq'],
        }),
      },
    }],
  };

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(mockPayload),
  });

  const res = await generateWithGroq('Raw input', { fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.data.title, 'Groq Title');
});

test('generateWithWorkersAI requires CF_API_TOKEN and CF_ACCOUNT_ID', async () => {
  delete process.env.CF_API_TOKEN;
  delete process.env.CF_ACCOUNT_ID;
  assert.equal((await generateWithWorkersAI('Raw')).ok, false);

  process.env.CF_API_TOKEN = 'mock-cf-token';
  process.env.CF_ACCOUNT_ID = 'mock-cf-account';
  const mockPayload = {
    result: {
      response: JSON.stringify({
        title: 'Workers AI Title',
        body: 'Workers AI Body',
      }),
    },
  };

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(mockPayload),
  });

  const res = await generateWithWorkersAI('Raw input', { fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.data.title, 'Workers AI Title');
});

// --- Fallback Chain & Integration Tests ---

test('processContent succeeds with primary provider when available', async () => {
  process.env.GEMINI_API_KEY = 'mock-key';
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              title: 'Primary Gemini Success',
              body: 'Content structured by Gemini.',
              category: 'product',
            }),
          }],
        },
      }],
    }),
  });

  const draft = await processContent('Raw note', {
    providerOrder: 'gemini,groq,manual',
    fetchImpl,
  });

  assert.equal(draft.aiProvider, 'gemini');
  assert.equal(draft.title, 'Primary Gemini Success');
});

test('processContent falls back to secondary provider when primary fails', async () => {
  process.env.GEMINI_API_KEY = 'mock-key';
  process.env.GROQ_API_KEY = 'mock-groq';

  const fetchImpl = async (url) => {
    if (url.includes('generativelanguage.googleapis.com')) {
      return { ok: false, status: 429, text: async () => 'Rate limit exceeded' };
    }
    if (url.includes('api.groq.com')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Groq Failover Success',
                body: 'Structured by Groq after Gemini 429.',
                category: 'automation',
              }),
            },
          }],
        }),
      };
    }
    return { ok: false, status: 500, text: async () => 'Server error' };
  };

  const draft = await processContent('Raw note', {
    providerOrder: 'gemini,groq,manual',
    fetchImpl,
  });

  assert.equal(draft.aiProvider, 'groq');
  assert.equal(draft.title, 'Groq Failover Success');
  assert.ok(draft.providerErrors.length >= 1);
});

test('processContent falls back to manual when all AI providers fail', async () => {
  process.env.GEMINI_API_KEY = 'mock-key';
  process.env.GROQ_API_KEY = 'mock-groq';

  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error',
  });

  const draft = await processContent('My short raw developer notes about publishing.', {
    providerOrder: 'gemini,groq,workers_ai',
    fetchImpl,
  });

  assert.equal(draft.aiProvider, 'manual');
  assert.equal(draft.fallbackReason, 'all_ai_providers_failed');
  assert.ok(draft.title.length > 0);
  assert.ok(draft.body.includes('My short raw developer notes'));
  assert.ok(draft.providerErrors.length >= 2);
});

test('processContent respects explicit AI_PROVIDER=manual', async () => {
  const draft = await processContent('Manual test content note.', {
    provider: 'manual',
  });

  assert.equal(draft.aiProvider, 'manual');
  assert.match(draft.title, /^Manual test content/);
  assert.equal(draft.body, 'Manual test content note.');
});

test('processContent handles network timeout/abort gracefully', async () => {
  process.env.GEMINI_API_KEY = 'mock-key';
  const fetchImpl = async () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    throw error;
  };

  const draft = await processContent('Timeout test note.', {
    providerOrder: 'gemini,manual',
    fetchImpl,
  });

  assert.equal(draft.aiProvider, 'manual');
  assert.ok(draft.providerErrors.some((e) => e.error.includes('aborted')));
});
