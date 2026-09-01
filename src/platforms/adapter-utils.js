import { ok } from '../shared/result.js';
import { validateContentVersion, hasValidationIssues } from '../shared/validation.js';

// Read the actual credential value from the environment by the secret's
// stored reference name. Never store the secret itself in the DB.
export function resolveSecret(secretRef, fallbackName) {
  if (secretRef && process.env[secretRef]) return process.env[secretRef];
  if (fallbackName && process.env[fallbackName]) return process.env[fallbackName];
  return null;
}

// Standard validateContent: delegates to the shared content-version validator.
export async function syncValidateContent(version) {
  const issues = validateContentVersion(version);
  return hasValidationIssues(issues) ? { ok: false, error: issues.map((i) => i.message).join('; '), retryable: false } : ok(issues);
}