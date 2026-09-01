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
  // The model may wrap JSON in ```json ... ``` fences; strip them.
  const cleaned = String(rawText ?? '')
    .replace(/```(?:json)?/g, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}