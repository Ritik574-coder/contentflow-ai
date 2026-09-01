import { httpJson } from '../shared/http.js';
import { ok, err } from '../shared/result.js';
import { DRAFT_PROMPT, extractJson } from './prompt.js';

// Cloudflare Workers AI (REST API). Requires CF_API_TOKEN and CF_ACCOUNT_ID.
export async function generateWithWorkersAI(rawText, opts = {}) {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!token) return err('CF_API_TOKEN is not set', false);
  if (!accountId) return err('CF_ACCOUNT_ID is not set (needed for Workers AI via REST)', false);

  const model = opts.workersAiModel || process.env.WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  const res = await httpJson(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(model)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: { prompt: DRAFT_PROMPT + rawText },
      fetchImpl: opts.fetchImpl,
    },
  );

  if (!res.ok || !res.body.result) {
    return err(`Workers AI request failed (${res.status}): ${res.text}`, true);
  }

  const response = typeof res.body.result === 'string'
    ? res.body.result
    : (res.body.result.response || '');

  const json = extractJson(response);
  if (!json) return err('Workers AI returned unparseable JSON', true);

  return ok(normalizeDraft(json));
}

function normalizeDraft(json) {
  return {
    title: String(json.title ?? '').trim(),
    summary: String(json.summary ?? '').trim(),
    body: String(json.body ?? '').trim(),
    category: String(json.category ?? '').trim(),
    tags: Array.isArray(json.tags) ? json.tags.map(String).filter(Boolean) : [],
    keywords: Array.isArray(json.keywords) ? json.keywords.map(String).filter(Boolean) : [],
    flaggedClaims: Array.isArray(json.flaggedClaims)
      ? json.flaggedClaims.map((c) => ({
          claim_text: String(c.claim_text ?? (c.claimText ?? '')).trim(),
          reason: String(c.reason ?? '').trim(),
        })).filter((c) => c.claim_text)
      : [],
  };
}