import { ok, err, unsupported } from '../../shared/result.js';
import { httpJson } from '../../shared/http.js';
import { resolveSecret, syncValidateContent } from '../adapter-utils.js';
import { markdownToHtml } from '../../shared/markdown.js';

// Blogger (Google Blogger API v3). OAuth 2.0 with offline access ("In
// production" consent screen). Publish via posts.insert; comments via
// comments.list. No pageview/metrics endpoint exists in the public API.
export class BloggerAdapter {
  key = 'blogger';

  _blogId() {
    return process.env.BLOGGER_BLOG_ID;
  }

  async _accessToken(account, opts = {}) {
    const clientId = process.env.BLOGGER_CLIENT_ID;
    const clientSecret = process.env.BLOGGER_CLIENT_SECRET;
    const refreshToken = resolveSecret(account && account.token_secret_ref, 'BLOGGER_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      return err('Blogger credentials incomplete (client id/secret or refresh token missing)', false);
    }

    const res = await httpJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&refresh_token=${encodeURIComponent(refreshToken)}&grant_type=refresh_token`,
      fetchImpl: opts.fetchImpl,
    });

    if (!res.ok || !res.body.access_token) {
      return err(`Blogger token refresh failed (${res.status}): ${res.text}`, false);
    }
    return ok(res.body.access_token);
  }

  async validateCredentials(account, opts = {}) {
    return this._accessToken(account, opts);
  }

  async validateContent(version) {
    return syncValidateContent(version);
  }

  async createDraft(version, account, opts = {}) {
    const tokenRes = await this._accessToken(account, opts);
    if (!tokenRes.ok) return tokenRes;
    const blogId = this._blogId();
    if (!blogId) return err('BLOGGER_BLOG_ID is not set', false);

    const htmlContent = markdownToHtml(version.body);

    const res = await httpJson(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRes.data}`,
        },
        body: { kind: 'blogger#post', title: version.title, content: htmlContent, status: 'DRAFT' },
        fetchImpl: opts.fetchImpl,
      },
    );

    if (!res.ok) return err(`Blogger draft failed (${res.status}): ${res.text}`, true);
    return ok({ externalPostId: res.body.id, externalUrl: res.body.url });
  }

  async publish(version, account, idempotencyKey, opts = {}) {
    const tokenRes = await this._accessToken(account, opts);
    if (!tokenRes.ok) return tokenRes;
    const blogId = this._blogId();
    if (!blogId) return err('BLOGGER_BLOG_ID is not set', false);

    const htmlContent = markdownToHtml(version.body);

    const res = await httpJson(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRes.data}`,
        },
        body: { kind: 'blogger#post', title: version.title, content: htmlContent },
        fetchImpl: opts.fetchImpl,
      },
    );

    if (!res.ok) return err(`Blogger publish failed (${res.status}): ${res.text}`, true);
    return ok({ externalPostId: res.body.id, externalUrl: res.body.url });
  }

  async getPost(externalPostId, account, opts = {}) {
    const tokenRes = await this._accessToken(account, opts);
    if (!tokenRes.ok) return tokenRes;
    const blogId = this._blogId();
    if (!blogId) return err('BLOGGER_BLOG_ID is not set', false);

    const res = await httpJson(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${externalPostId}`,
      { headers: { Authorization: `Bearer ${tokenRes.data}` }, fetchImpl: opts.fetchImpl },
    );
    if (!res.ok) return err(`Blogger getPost failed (${res.status}): ${res.text}`, true);
    return ok({ id: res.body.id, url: res.body.url, title: res.body.title, published: res.body.published });
  }

  getMetrics() {
    return Promise.resolve(unsupported('Blogger has no pageview/metrics endpoint in the public API; add GA4 later if needed.'));
  }

  async getComments(externalPostId, account, opts = {}) {
    const tokenRes = await this._accessToken(account, opts);
    if (!tokenRes.ok) return tokenRes;
    const blogId = this._blogId();
    if (!blogId) return err('BLOGGER_BLOG_ID is not set', false);

    const res = await httpJson(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${externalPostId}/comments`,
      { headers: { Authorization: `Bearer ${tokenRes.data}` }, fetchImpl: opts.fetchImpl },
    );
    if (!res.ok) return err(`Blogger comments failed (${res.status}): ${res.text}`, true);

    const items = Array.isArray(res.body.items) ? res.body.items : [];
    return ok(items.map((c) => ({
      externalCommentId: c.id,
      authorDisplayName: (c.author && c.author.displayName) || null,
      commentText: c.content,
      postedAt: c.published,
    })));
  }
}