import { unsupported } from '../../shared/result.js';
import { syncValidateContent } from '../adapter-utils.js';

// X (Twitter) — DISABLED by default (platforms.x seeded enabled=0). There is
// no free tier since 6 Feb 2026; writes are pay-per-use. To honor the ₹0
// constraint the adapter never publishes — it returns Unsupported with the
// reason, so the dashboard shows "not available" rather than an error.
export class XAdapter {
  key = 'x';

  async validateCredentials() {
    return { ok: true, data: true, note: 'X is disabled (no free tier); credentials are never required.' };
  }

  async validateContent(version) {
    return syncValidateContent(version);
  }

  publish() {
    return Promise.resolve(unsupported('X (Twitter) has no free API tier since 6 Feb 2026; publishing is pay-per-use and disabled by default.'));
  }

  createDraft() {
    return Promise.resolve(unsupported('X (Twitter) is disabled: no free tier remains.'));
  }

  getPost() {
    return Promise.resolve(unsupported('X (Twitter) is disabled: no free tier remains.'));
  }

  getMetrics() {
    return Promise.resolve(unsupported('X (Twitter) metrics are pay-per-use and disabled by default.'));
  }

  getComments() {
    return Promise.resolve(unsupported('X (Twitter) comment retrieval is pay-per-use and disabled by default.'));
  }
}