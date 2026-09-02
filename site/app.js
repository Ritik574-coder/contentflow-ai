const fallbackDashboard = {
  content: {
    id: 1,
    status: 'ready_for_review',
    raw_text:
      'I spent the last week working on a local content pipeline for creators. The biggest pain point was turning raw notes into publication-ready pieces without losing context. The workflow forced human approval before publishing anything.',
    sourceType: 'note',
    createdAt: '2026-09-01T08:00:00Z',
  },
  draft: {
    title: 'Local content pipeline for creators',
    summary: 'A structured draft built from raw notes with explicit review gates and version preservation.',
    category: 'productivity',
    tags: ['content-pipeline', 'automation', 'creator-tools'],
    keywords: ['AI workflow', 'approval', 'publishing'],
    body: 'A review-ready draft appears here after processing.',
    flaggedClaims: [],
    aiProvider: 'manual',
  },
  versions: [
    { platform: 'blogger', title: 'Local content pipeline for creators', summary: 'Long-form version', body: '' },
    { platform: 'linkedin', title: 'Local content pipeline for creators', summary: 'Feed post version', body: '' },
    { platform: 'devto', title: 'Local content pipeline for creators', summary: 'Developer article version', body: '' },
  ],
  platforms: [
    {
      key: 'blogger',
      label: 'Blogger',
      enabled: true,
      supportsPublish: true,
      supportsMetrics: false,
      supportsComments: true,
      notes: 'No pageview endpoint in the public API. Comments are supported.',
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      enabled: true,
      supportsPublish: true,
      supportsMetrics: false,
      supportsComments: false,
      notes: 'Publish-only. Metrics and comments require partner approval and remain unsupported.',
    },
    {
      key: 'devto',
      label: 'DEV.to',
      enabled: true,
      supportsPublish: true,
      supportsMetrics: false,
      supportsComments: false,
      notes: 'Best-effort engagement counts may be available from the article object.',
    },
    {
      key: 'hashnode',
      label: 'Hashnode',
      enabled: false,
      supportsPublish: false,
      supportsMetrics: false,
      supportsComments: false,
      notes: 'Disabled because publishing requires a paid Pro plan.',
    },
    {
      key: 'x',
      label: 'X (Twitter)',
      enabled: false,
      supportsPublish: false,
      supportsMetrics: false,
      supportsComments: false,
      notes: 'Disabled because the API has no free publishing tier.',
    },
  ],
  approval: {
    id: null,
    status: 'pending',
    selectedPlatforms: [],
    reviewedVersionId: null,
    changedAfterApproval: false,
  },
  metrics: {},
};

const els = {
  connectionStatus: document.getElementById('connectionStatus'),
  pipelineStatus: document.getElementById('pipelineStatus'),
  approvalStatus: document.getElementById('approvalStatus'),
  rawText: document.getElementById('rawText'),
  draftCard: document.getElementById('draftCard'),
  platformList: document.getElementById('platformList'),
  versionList: document.getElementById('versionList'),
  metricsList: document.getElementById('metricsList'),
  publishSelected: document.getElementById('publishSelected'),
};

let dashboard = fallbackDashboard;
let selectedPlatforms = new Set(fallbackDashboard.approval.selectedPlatforms);
let apiBase = resolveApiBase();

function resolveApiBase() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('api');
  if (fromQuery) {
    localStorage.setItem('contentflow_api_base', fromQuery.replace(/\/$/, ''));
    return fromQuery.replace(/\/$/, '');
  }
  const configured = window.CONTENTFLOW_API_BASE || localStorage.getItem('contentflow_api_base');
  if (configured) return configured.replace(/\/$/, '');
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : '';
}

// Phase 7: keep the dashboard token only in browser storage; never in source or URL.
function resolveApiToken() {
  try {
    return sessionStorage.getItem('contentflow_api_token') || localStorage.getItem('contentflow_api_token') || '';
  } catch {
    return localStorage.getItem('contentflow_api_token') || '';
  }
}

function persistApiToken(token) {
  if (!token) return;
  try {
    sessionStorage.setItem('contentflow_api_token', token);
    localStorage.setItem('contentflow_api_token', token);
  } catch {
    // Ignore storage quota/privacy restrictions; keep the token only in-memory if needed.
  }
}

function ensureApiToken() {
  let token = resolveApiToken();
  if (!token) {
    token = window.prompt('Enter the dashboard API token to approve content:', '') || '';
    persistApiToken(token);
  }
  return token;
}

let apiToken = resolveApiToken();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeDashboard(payload) {
  const data = payload && payload.ok ? payload : payload || {};
  return {
    ...fallbackDashboard,
    ...data,
    content: data.content || fallbackDashboard.content,
    draft: data.draft || fallbackDashboard.draft,
    versions: Array.isArray(data.versions) ? data.versions : fallbackDashboard.versions,
    platforms: Array.isArray(data.platforms) ? data.platforms : fallbackDashboard.platforms,
    approval: data.approval || fallbackDashboard.approval,
    metrics: data.metrics || fallbackDashboard.metrics,
  };
}

async function loadDashboard() {
  if (!apiBase) {
    els.connectionStatus.textContent = 'Sample data';
    els.connectionStatus.className = 'badge warning';
    render();
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/content`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dashboard = normalizeDashboard(await response.json());
    selectedPlatforms = new Set(dashboard.approval?.selectedPlatforms || []);
    els.connectionStatus.textContent = 'Worker connected';
    els.connectionStatus.className = 'badge success';
  } catch (error) {
    dashboard = fallbackDashboard;
    selectedPlatforms = new Set();
    els.connectionStatus.textContent = 'Sample data';
    els.connectionStatus.className = 'badge warning';
  }

  render();
}

function render() {
  const content = dashboard.content;
  const draft = dashboard.draft;
  const approval = dashboard.approval;

  els.pipelineStatus.textContent = content ? String(content.status || 'unknown').replace(/_/g, ' ') : 'No content yet';
  els.approvalStatus.textContent = approval ? `Approval: ${approval.status || 'pending'}` : 'Approval: not requested';
  els.rawText.textContent = content ? content.raw_text || content.rawText || '' : 'No raw content has been processed yet.';

  els.draftCard.innerHTML = draft
    ? `
      <div class="panel-heading"><h4>${escapeHtml(draft.title)}</h4></div>
      <p>${escapeHtml(draft.summary)}</p>
      <div class="meta-grid">
        <span>Category: ${escapeHtml(draft.category || 'uncategorized')}</span>
        <span>Tags: ${escapeHtml((draft.tags || []).join(', ') || 'none')}</span>
        <span>Keywords: ${escapeHtml((draft.keywords || []).join(', ') || 'none')}</span>
        <span>AI: ${escapeHtml(draft.aiProvider || 'manual')}</span>
      </div>
      ${renderFlaggedClaims(draft.flaggedClaims)}
    `
    : '<p>No structured draft is available yet.</p>';

  els.platformList.innerHTML = dashboard.platforms.map(renderPlatform).join('');
  els.versionList.innerHTML = dashboard.versions.length
    ? dashboard.versions.map(renderVersion).join('')
    : '<p class="meta">No platform versions have been generated yet.</p>';
  els.metricsList.innerHTML = renderMetrics();
  els.publishSelected.disabled = !content || !approval || approval.status !== 'pending' || selectedPlatforms.size === 0;
}

function renderFlaggedClaims(claims = []) {
  if (!claims.length) return '<p class="meta">No flagged claims.</p>';
  return `
    <div class="claim-list">
      ${claims.map((claim) => `
        <div class="claim">
          <strong>${escapeHtml(claim.claim_text || claim.claimText || 'Claim')}</strong>
          <span>${escapeHtml(claim.reason || 'Needs review')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPlatform(platform) {
  const enabled = Boolean(platform.enabled);
  const selected = selectedPlatforms.has(platform.key);
  return `
    <button class="platform-item ${selected ? 'selected' : ''}" data-platform="${escapeHtml(platform.key)}" ${enabled ? '' : 'disabled'}>
      <span>
        <strong>${escapeHtml(platform.label || platform.display_name || platform.key)}</strong>
        <span class="meta">${escapeHtml(platform.notes)}</span>
      </span>
      <span class="platform-toggle ${selected ? 'selected' : ''}">
        ${selected ? 'Selected' : enabled ? 'Available' : 'Disabled'}
      </span>
    </button>
  `;
}

function renderVersion(version) {
  return `
    <article class="version-item">
      <div>
        <strong>${escapeHtml(version.platform)}</strong>
        <h4>${escapeHtml(version.title || 'Untitled')}</h4>
      </div>
      <p>${escapeHtml(version.summary || '')}</p>
    </article>
  `;
}

function renderMetrics() {
  const metricEntries = Object.entries(dashboard.metrics || {});
  const unsupported = dashboard.platforms
    .filter((platform) => !platform.supportsMetrics || !platform.supportsComments)
    .map((platform) => `
      <div class="metric-item">
        <strong>${escapeHtml(platform.label || platform.key)}</strong>
        <span>${escapeHtml(platform.notes || 'Capability unavailable through the official API.')}</span>
      </div>
    `);

  const metrics = metricEntries.map(([key, value]) => `
    <div class="metric-item">
      <strong>${escapeHtml(key)}</strong>
      <span>${escapeHtml(JSON.stringify(value))}</span>
    </div>
  `);

  return [...metrics, ...unsupported].join('') || '<p class="meta">No published metrics yet.</p>';
}

els.platformList.addEventListener('click', (event) => {
  const item = event.target.closest('[data-platform]');
  if (!item || item.disabled) return;
  const key = item.getAttribute('data-platform');
  if (selectedPlatforms.has(key)) selectedPlatforms.delete(key);
  else selectedPlatforms.add(key);
  render();
});

els.publishSelected.addEventListener('click', async () => {
  const contentId = dashboard.content && dashboard.content.id;
  if (!apiBase || !contentId) {
    els.publishSelected.textContent = 'Worker API not configured';
    return;
  }

  els.publishSelected.disabled = true;
  els.publishSelected.textContent = 'Approving...';

  try {
    apiToken = apiToken || ensureApiToken();
    if (!apiToken) {
      els.publishSelected.textContent = 'Token required';
      els.publishSelected.disabled = false;
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    };
    const response = await fetch(`${apiBase}/api/approval`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contentId,
        selectedPlatforms: Array.from(selectedPlatforms),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    els.publishSelected.textContent = `Approved (${Array.from(selectedPlatforms).join(', ')})`;
    await loadDashboard();
  } catch (error) {
    els.publishSelected.textContent = `Approval failed`;
    els.publishSelected.disabled = false;
  }
});

loadDashboard();
