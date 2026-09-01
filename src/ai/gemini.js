import { httpJson } from '../shared/http.js';
import { ok, err } from '../shared/result.js';
import { DRAFT_PROMPT, extractJson } from './prompt.js';

// Google Gemini API (free tier). Requires GEMINI_API_KEY.
export async function generateWithGemini(rawText, opts = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return err('GEMINI_API_KEY is not set', false);

  const model = opts.geminiModel || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const res = await httpJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [{ role: 'user', parts: [{ text: DRAFT_PROMPT + rawText }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      fetchImpl: opts.fetchImpl,
    },
  );

  if (!res.ok || !res.body.candidates || !res.body.candidates.length) {
    return err(`Gemini request failed (${res.status}): ${res.text}`, true);
  }

  const content = res.body.candidates[0].content;
  const text = content && content.parts && content.parts.map((p) => p.text).join('');
  const json = extractJson(text);
  if (!json) return err('Gemini returned unparseable JSON', true);

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