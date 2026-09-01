// Trigger GitHub Actions workflows from the Worker. Uses the modern
// workflow_dispatch API (the repository_dispatch event is deprecated) so the
// publish pipeline reliably starts after human approval.
import { httpJson } from './shared/http.js';
import { ok, err } from './shared/result.js';

export function repoFromEnv(env = {}) {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const owner = env.GH_REPO_OWNER || procEnv.GH_REPO_OWNER;
  const repo = env.GH_REPO_NAME || procEnv.GH_REPO_NAME;
  if (owner && repo) return { owner, repo };
  const full = env.GITHUB_REPOSITORY || procEnv.GITHUB_REPOSITORY;
  if (full && full.includes('/')) {
    const [o, r] = full.split('/');
    return { owner: o, repo: r };
  }
  return null;
}

export async function triggerWorkflowDispatch({ owner, repo, workflow, inputs = {}, token, ref, fetchImpl }) {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const pat = token || procEnv.GH_DISPATCH_PAT;
  if (!pat) return err('GH_DISPATCH_PAT is not set', false);
  if (!owner || !repo || !workflow) return err('owner/repo/workflow are required', false);
  const branch = ref || procEnv.GH_DISPATCH_REF || 'main';

  const res = await httpJson(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches?ref=${encodeURIComponent(branch)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pat}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: { ref: branch, inputs },
      fetchImpl,
    },
  );

  if (!res.ok) return err(`GitHub workflow_dispatch failed (${res.status}): ${res.text}`, true);
  return ok(true);
}

export async function createRepositoryDispatch({ owner, repo, eventType, payload = {}, token, fetchImpl }) {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const pat = token || procEnv.GH_DISPATCH_PAT;
  if (!pat) return err('GH_DISPATCH_PAT is not set', false);

  const res = await httpJson(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pat}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: { event_type: eventType, client_payload: payload },
    fetchImpl,
  });

  if (!res.ok) return err(`GitHub repository_dispatch failed (${res.status}): ${res.text}`, true);
  return ok(true);
}
