/**
 * Structured draft validation.
 * Ensures AI output matches the required schema and contains non-empty required fields.
 */
export function validateDraft(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, error: 'Draft must be a non-null object' };
  }

  const title = String(json.title ?? '').trim();
  if (!title) {
    return { ok: false, error: 'Draft title is required and cannot be empty' };
  }

  const body = String(json.body ?? '').trim();
  if (!body) {
    return { ok: false, error: 'Draft body is required and cannot be empty' };
  }

  const summary = String(json.summary ?? '').trim() || 'Structured draft pending review.';
  const category = String(json.category ?? '').trim() || 'general';

  const tags = Array.isArray(json.tags)
    ? json.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const keywords = Array.isArray(json.keywords)
    ? json.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];

  const flaggedClaims = Array.isArray(json.flaggedClaims)
    ? json.flaggedClaims
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          claim_text: String(c.claim_text ?? (c.claimText ?? '')).trim(),
          reason: String(c.reason ?? '').trim(),
        }))
        .filter((c) => c.claim_text)
    : [];

  return {
    ok: true,
    data: {
      title,
      summary,
      body,
      category,
      tags,
      keywords,
      flaggedClaims,
    },
  };
}
