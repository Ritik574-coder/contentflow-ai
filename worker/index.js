// ContentFlow AI — Cloudflare Worker.
// Routes:
//   POST /webhook/telegram      Telegram webhook receiver (approval flow)
//   GET  /api/health             health check
//   GET  /api/content            dashboard read model (latest content)
//   GET  /api/approvals         approval request list
//   GET  /api/metrics          metrics + comments (flat view)
//   GET  /api/platforms         platform catalog + account connection status
//   POST /api/approval           dashboard-driven approval + dispatch publish
// All dashboard reads go through this Worker — the static GitHub Pages site
// never talks to D1 directly and never holds a credential.
import { getDb } from '../src/db/client.js';
import q from '../src/db/queries/index.js';
import { buildDashboardPayload } from './dashboard.js';
import { handleTelegramUpdate } from './telegram.js';
import { triggerWorkflowDispatch, repoFromEnv } from '../src/github.js';
import { logAudit } from '../src/shared/logger.js';

const json = (payload, status = 200, extraHeaders = {}) => new Response(
  status === 204 ? null : JSON.stringify(payload),
  {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token',
      ...extraHeaders,
    },
  },
);

// Phase 7: Minimal bearer-token auth for dashboard mutation endpoints.
// If DASHBOARD_API_TOKEN is set in Worker secrets, the caller must supply:
//   Authorization: Bearer <token>
// Returns { ok: false, warn } when the env var is absent (backward-compatible).
// Returns { ok: false, error, status: 401 } on mismatch.
function checkDashboardAuth(request, env) {
  const configured = env && env.DASHBOARD_API_TOKEN;
  if (!configured) {
    // Token not yet configured — allow but signal the gap.
    return { ok: true, warn: 'DASHBOARD_API_TOKEN is not configured; endpoint is unauthenticated' };
  }
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1] : '';
  // Constant-time-equivalent comparison using === (single-user MVP; timing
  // attack risk is negligible in this threat model).
  if (!provided || provided !== configured) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const db = getDb(env);

    if (request.method === 'OPTIONS') return json({ ok: true }, 204);

    try {
      // ---- Telegram webhook ----
      if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
        const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (secret !== env.TELEGRAM_SECRET_TOKEN) {
          return json({ ok: false, error: 'Unauthorized' }, 403);
        }
        const update = await request.json();
        const result = await handleTelegramUpdate(db, update, env);
        return json({ ok: true, handled: result.handled, action: result.action || null });
      }

      // ---- Health ----
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, status: 'healthy', service: 'contentflow-worker' });
      }

      // ---- Dashboard read API ----
      if (url.pathname === '/api/content' && request.method === 'GET') {
        const payload = await buildDashboardPayload(db);
        return json({ ok: true, ...payload });
      }

      if (url.pathname === '/api/approvals' && request.method === 'GET') {
        const approvals = await q.getApprovals(db);
        return json({ ok: true, approvals });
      }

      if (url.pathname === '/api/metrics' && request.method === 'GET') {
        const posts = await q.getAllPublishedPosts(db);
        const snapshotRows = await db.query(`SELECT * FROM metric_snapshots ORDER BY captured_at DESC LIMIT 200`);
        const commentRows = await db.query(`SELECT * FROM comments ORDER BY collected_at DESC LIMIT 200`);
        return json({ ok: true, posts, snapshots: snapshotRows, comments: commentRows });
      }

      if (url.pathname === '/api/platforms' && request.method === 'GET') {
        const rows = await q.getPlatforms(db);
        const accounts = await db.query(`SELECT pa.*, p.key AS platform_key FROM platform_accounts pa JOIN platforms p ON p.id = pa.platform_id`);
        return json({ ok: true, platforms: rows, accounts });
      }

      // ---- Dashboard approval + publish dispatch ----
      if (url.pathname === '/api/approval' && request.method === 'POST') {
        // Phase 7: require DASHBOARD_API_TOKEN bearer auth for mutation.
        const auth = checkDashboardAuth(request, env);
        if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status || 401);

        const body = await request.json().catch(() => ({}));
        const contentId = Number(body.contentId);
        const selected = Array.isArray(body.selectedPlatforms) ? body.selectedPlatforms : [];

        if (!contentId) return json({ ok: false, error: 'contentId is required' }, 400);
        if (!selected.length) return json({ ok: false, error: 'Select at least one platform before approving.' }, 400);

        const approval = await q.getLatestApprovalForContent(db, contentId);
        if (!approval) return json({ ok: false, error: 'No approval request found for this content' }, 404);

        const transitioned = await q.transitionApprovalStatus(db, approval.id, 'approved', 'dashboard');
        if (!transitioned) {
          return json({ ok: false, error: `Approval already decided (${approval.status}). A change requires a fresh approval.` }, 409);
        }

        await q.setSelectionsForApproval(db, approval.id, selected);
        await logAudit(db, { entityType: 'approval_requests', entityId: approval.id, action: 'approval_received', result: 'success', actor: 'dashboard' });

        const repo = repoFromEnv(env);
        let dispatch = { ok: false, error: 'GH_DISPATCH_PAT / GH_REPO_OWNER / GH_REPO_NAME not configured' };
        if (repo) {
          dispatch = await triggerWorkflowDispatch({
            ...repo,
            workflow: 'publish-content.yml',
            inputs: { approval_id: String(approval.id) },
            token: env.GH_DISPATCH_PAT,
            ref: env.GH_DISPATCH_REF,
          });
        }

        const extraHeaders = auth.warn ? { 'X-Auth-Warning': auth.warn } : {};
        return json({ ok: true, approval_id: approval.id, selectedPlatforms: selected, dispatch: dispatch.ok ? 'triggered' : dispatch.error }, 200, extraHeaders);
      }

      return json({ ok: false, error: 'Not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  },
};
