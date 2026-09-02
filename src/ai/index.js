// AI provider abstraction with a fallback chain:
//   gemini -> groq -> workers_ai -> manual
// Any provider may be omitted by leaving its API key unset; the chain advances
// to the next one. If every AI provider fails, `manual` still produces a
// usable structured draft, so the human can edit it.

import { generateWithGemini } from './gemini.js';
import { generateWithGroq } from './groq.js';
import { generateWithWorkersAI } from './workers-ai.js';
import { generateManual } from './manual.js';
import { validateDraft } from './validation.js';

const PROVIDERS = {
  gemini: generateWithGemini,
  groq: generateWithGroq,
  workers_ai: generateWithWorkersAI,
  manual: generateManual,
};

const DEFAULT_ORDER = 'gemini,groq,workers_ai,manual';

// Returns a validated draft object directly (not a Result). Throws-free: on total
// failure it falls back to the manual generator.
export async function processContent(rawText, opts = {}) {
  const explicit = opts.provider || process.env.AI_PROVIDER;
  const orderRaw =
    explicit && explicit !== 'auto'
      ? explicit
      : (opts.providerOrder || process.env.AI_PROVIDER_ORDER || DEFAULT_ORDER);

  const order = String(orderRaw).split(',').map((s) => s.trim()).filter(Boolean);
  const errors = [];

  for (const name of order) {
    const generator = PROVIDERS[name];
    if (!generator) {
      errors.push({ provider: name, error: `unknown provider: ${name}` });
      continue;
    }
    try {
      const result = await generator(String(rawText ?? ''), opts);
      if (result && result.ok && result.data) {
        const validation = validateDraft(result.data);
        if (!validation.ok) {
          errors.push({ provider: name, error: `validation failed: ${validation.error}` });
          continue;
        }
        return {
          ...validation.data,
          aiProvider: name,
          ...(errors.length ? { fallbackReason: 'prior_providers_failed', providerErrors: errors } : {}),
        };
      }
      if (result && result.error) {
        errors.push({ provider: name, error: result.error });
      }
    } catch (e) {
      errors.push({ provider: name, error: String((e && e.message) || e) });
    }
  }

  // Final fallback — always produces a usable draft.
  const manual = await generateManual(String(rawText ?? ''), opts);
  return {
    ...manual.data,
    aiProvider: 'manual',
    fallbackReason: 'all_ai_providers_failed',
    providerErrors: errors,
  };
}

export { PROVIDERS, DEFAULT_ORDER };