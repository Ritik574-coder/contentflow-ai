import { createHash } from 'node:crypto';

// Deterministic idempotency key. A retried workflow for the same
// (content, platform account, content version, approval) produces the same
// key, so the unique constraint on platform_posts.idempotency_key is the
// duplicate-publish guard.
export function generateIdempotencyKey(opts) {
  const input = [
    String(opts.contentId ?? ''),
    String(opts.platformAccountId ?? ''),
    String(opts.contentVersionId ?? ''),
    String(opts.approvalRequestId ?? ''),
  ].join(':');

  return 'cf-' + createHash('sha256').update(input).digest('hex').slice(0, 32);
}