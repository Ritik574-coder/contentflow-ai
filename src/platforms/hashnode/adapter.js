import { ok, err, unsupported } from '../../shared/result.js';
import { httpJson } from '../../shared/http.js';
import { resolveSecret, syncValidateContent } from '../adapter-utils.js';

// Hashnode — implemented per spec but DISABLED by default (platforms.hashnode
// seeded enabled=0). Publishing via graphql requires a paid Hashnode Pro plan
// on the target publication as of 13 May 2026.
export class HashnodeAdapter {
  key = 'hashnode';

  _token(account) {
    return resolveSecret(account && account.token_secret_ref, 'HASHNODE_API_TOKEN');
  }

  async validateCredentials(account) {
    const token = this._token(account);
    if (!token) return { ok: false, error: 'HASHNODE_API_TOKEN is not set', retryable: false };
    return ok(true);
  }

  async validateContent(version) {
    return syncValidateContent(version);
  }

  async publish(version, account, idempotencyKey, opts = {}) {
    const token = this._token(account);
    if (!token) return { ok: false, error: 'HASHNODE_API_TOKEN is not set', retryable: false };
    const publicationId = process.env.HASHNODE_PUBLICATION_ID;
    if (!publicationId) return { ok: false, error: 'HASHNODE_PUBLICATION_ID is not set', retryable: false };

    const res = await httpJson('https://gql.hashnode.com', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: {
        query: `mutation PublishPost($input: PublishPostInput!) {
          publishPost(input: $input) { post { id url title } }
        }`,
        variables: {
          input: {
            publicationId,
            title: version.title,
            contentMarkdown: version.body,
          },
        },
      },
      fetchImpl: opts.fetchImpl,
    });

    if (!res.ok || !res.body.data || !res.body.data.publishPost) {
      return { ok: false, error: `Hashnode publish failed (${res.status}): ${res.text}`, retryable: true };
    }
    const post = res.body.data.publishPost.post;
    return ok({ externalPostId: post.id, externalUrl: post.url });
  }

  createDraft() {
    return Promise.resolve(unsupported('Hashnode has no draft flow implemented for the disabled adapter.'));
  }
  getPost() {
    return Promise.resolve(unsupported('Hashnode is disabled (paid plan required) and non-public reads are not wired into this pipeline.'));
  }
  getMetrics() {
    return Promise.resolve(unsupported('Hashnode metrics require Hashnode Pro and are disabled by default.'));
  }
  getComments() {
    return Promise.resolve(unsupported('Hashnode comments retrieval is not wired into this pipeline.'));
  }
}