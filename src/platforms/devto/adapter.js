import { ok, err, unsupported } from '../../shared/result.js';
import { httpJson } from '../../shared/http.js';
import { resolveSecret, syncValidateContent } from '../adapter-utils.js';

// DEV.to / Forem API. Personal API key auth (api-key header).
// Respect the 10 requests / 30 second limit with a light throttle.
export class DevtoAdapter {
  key = 'devto';

  _apiKey(account) {
    return resolveSecret(account && account.token_secret_ref, 'DEVTO_API_KEY');
  }

  async validateCredentials(account) {
    const key = this._apiKey(account);
    if (!key) return { ok: false, error: 'DEVTO_API_KEY is not set', retryable: false };
    return ok(true);
  }

  async validateContent(version) {
    return syncValidateContent(version);
  }

  async createDraft(version, account, idempotencyKey, opts = {}) {
    return this._create(version, account, false, opts);
  }

  async publish(version, account, idempotencyKey, opts = {}) {
    return this._create(version, account, true, opts);
  }

  async _create(version, account, published, opts = {}) {
    const key = this._apiKey(account);
    if (!key) return { ok: false, error: 'DEVTO_API_KEY is not set', retryable: false };

    const res = await httpJson('https://dev.to/api/articles', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: {
        article: {
          title: version.title,
          body_markdown: version.body,
          published,
          tags: (version.tags || [])
            .slice(0, 4)
            .map((t) => t.replace(/[^a-z0-9-]/gi, '').toLowerCase())
            .filter(Boolean),
        },
      },
      fetchImpl: opts.fetchImpl,
    });

    if (!res.ok) return { ok: false, error: `DEV.to publish failed (${res.status}): ${res.text}`, retryable: true };
    await throttle30s();
    return ok({ externalPostId: String(res.body.id), externalUrl: res.body.url });
  }

  async getPost(externalPostId, account, opts = {}) {
    const key = this._apiKey(account);
    if (!key) return { ok: false, error: 'DEVTO_API_KEY is not set', retryable: false };
    const res = await httpJson(`https://dev.to/api/articles/${externalPostId}`, {
      headers: { 'api-key': key },
      fetchImpl: opts.fetchImpl,
    });
    if (!res.ok) return { ok: false, error: `DEV.to getPost failed (${res.status}): ${res.text}`, retryable: true };
    return ok({
      id: String(res.body.id),
      url: res.body.url,
      title: res.body.title,
      reactions: res.body.public_reactions_count,
      commentsCount: res.body.comments_count,
    });
  }

  async getMetrics(externalPostId, account, opts = {}) {
    const post = await this.getPost(externalPostId, account, opts);
    if (!post.ok) return post;
    return ok({
      likes: post.data.reactions,
      commentsCount: post.data.commentsCount,
    });
  }

  // Full comment-thread endpoint is not clearly documented for the public API.
  getComments() {
    return Promise.resolve(unsupported('DEV.to comment threads are not reliably available via the public API; counts appear on the article object only.'));
  }
}

// Respect DEV.to's 10 requests / 30s limit (clientside throttle).
const throttleQueue = [];
async function throttle30s() {
  const now = Date.now();
  while (throttleQueue.length && throttleQueue[0] <= now - 30000) throttleQueue.shift();
  if (throttleQueue.length >= 10) {
    const wait = throttleQueue[0] + 30000 - now;
    await new Promise((r) => setTimeout(r, wait));
  }
  throttleQueue.push(Date.now());
}