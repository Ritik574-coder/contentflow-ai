// Shared system prompt asking the model to return strict JSON that the
// pipeline can consume directly.
export const DRAFT_PROMPT = `You are a content editor. Clean and structure the following unstructured raw notes into a publication-ready draft. Be faithful to the source: do not invent facts, and flag any claim that might need external validation.

Return ONLY strict JSON with this exact shape (no markdown, no commentary):
{
  "title": "string",
  "summary": "string",
  "body": "string (markdown)",
  "category": "string",
  "tags": ["string"],
  "keywords": ["string"],
  "flaggedClaims": [{"claim_text": "string", "reason": "string"}]
}

Raw notes:
`;

export function extractJson(rawText) {
  if (rawText == null) return null;
  const str = String(rawText).trim();
  if (!str) return null;

  // 1. Direct parse attempt
  try {
    return JSON.parse(str);
  } catch {}

  // 2. Strip standard ```json ... ``` markdown fences
  const cleanedFences = str
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleanedFences);
  } catch {}

  // 3. Find outermost JSON object {...} if surrounded by conversational commentary
  const start = str.indexOf('{');
  const end = str.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(str.slice(start, end + 1));
    } catch {}
  }

  return null;
}