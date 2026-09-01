import { httpJson } from '../shared/http.js';
import { ok, err } from '../shared/result.js';
import { DRAFT_PROMPT, extractJson } from './prompt.js';

// Groq (free tier). Requires GROQ_API_KEY.
export async function generateWithGroq(rawText, opts = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return err('GROQ_API_KEY is not set', false);

  const model = opts.groqModel || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const res = await httpJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model,
      messages: [{
        role: 'system',
        content: 'You return only strict JSON. Do not wrap JSON in markdown fences or add commentary.',
      }, {
        role: 'user',
        content: DRAFT_PROMPT + rawText,
      }],
      temperature: 0.3,
    },
    fetchImpl: opts.fetchImpl,
  });

  if (!res.ok || !res.body.choices || !res.body.choices.length) {
    return err(`Groq request failed (${res.status}): ${res.text}`, true);
  }

  const content = res.body.choices[0].message && res.body.choices[0].message.content;
  const json = extractJson(content);
  if (!json) return err('Groq returned unparseable JSON', true);

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