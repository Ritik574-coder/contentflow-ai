import { ok, err, unsupported } from '../../shared/result.js';
import { httpJson } from '../../shared/http.js';
import { resolveSecret, syncValidateContent } from '../adapter-utils.js';

// LinkedIn — publish-only. UGC Posts API to the authenticated member's own
// feed via w_member_social (self-serve "Share on LinkedIn" product).
// Metrics/comments are genuinely UNSUPPORTED: r_member_social is partner-gated
// and LinkedIn's Restricted Use Policy caps storage of social-activity data at
// 48 hours — neither can be honored by this permanent-snapshot pipeline.
export class LinkedInAdapter {
  key = 'linkedin';

  _accessToken(account) {
    return resolveSecret(account && account.token_secret_ref, 'LINKEDIN_ACCESS_TOKEN');
  }

  async validateCredentials(account) {
    const token = this._accessToken(account);
    if (!token) return { ok: false, error: 'LINKEDIN_ACCESS_TOKEN is not set', retryable: false };
    // Lightweight self-check via the UGC share as person endpoint.
    const res = await httpJson('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? ok(true) : { ok: false, error: `LinkedIn credential check failed (${res.status})`, retryable: true };
  }

  async validateContent(version) {
    return syncValidateContent(version);
  }

  // LinkedIn has no self-serve draft creation via these scopes.
  createDraft() {
    return Promise.resolve(unsupported('LinkedIn has no self-serve draft flow via the Share on LinkedIn product.'));
  }

  async publish(version, account, idempotencyKey, opts = {}) {
    const token = this._accessToken(account);
    if (!token) return { ok: false, error: 'LINKEDIN_ACCESS_TOKEN is not set', retryable: false };

    const memberUrn = process.env.LINKEDIN_MEMBER_URN;
    if (!memberUrn) return { ok: false, error: 'LINKEDIN_MEMBER_URN is not set', retryable: false };
    const author = memberUrn.startsWith('urn:li:person:') ? memberUrn : `urn:li:person:${memberUrn}`;

    const res = await httpJson('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: version.body },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      },
      fetchImpl: opts.fetchImpl,
    });

    if (!res.ok) return { ok: false, error: `LinkedIn publish failed (${res.status}): ${res.text}`, retryable: true };
    const shareId = res.body.id; // e.g. urn:li:share:12345
    const shareSlug = encodeURIComponent(String(shareId));
    return ok({
      externalPostId: shareId,
      externalUrl: `https://www.linkedin.com/feed/update/${shareSlug}`,
    });
  }

  getPost() {
    return Promise.resolve(unsupported('Reading a LinkedIn post requires r_member_social, granted to select developers only.'));
  }

  getMetrics() {
    return Promise.resolve(unsupported('LinkedIn metrics require Marketing Developer Platform / Community Management API partnership, and member social data may not be stored beyond 48 hours.'));
  }

  getComments() {
    return Promise.resolve(unsupported('LinkedIn comment retrieval requires partner access and member social data may not be stored beyond 48 hours.'));
  }
}