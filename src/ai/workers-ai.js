import { httpJson } from '../shared/http.js';
import { ok, err } from '../shared/result.js';
import { DRAFT_PROMPT, extractJson } from './prompt.js';
import { validateDraft } from './validation.js';

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
      timeoutMs: opts.timeoutMs || 30000,
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

  const validation = validateDraft(json);
  if (!validation.ok) {
    return err(`Workers AI output validation failed: ${validation.error}`, true);
  }

  return ok(validation.data);
}