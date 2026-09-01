export const platforms = [
  {
    key: 'blogger',
    label: 'Blogger',
    enabled: true,
    supportsPublish: true,
    supportsMetrics: false,
    supportsComments: true,
    supportsMediaUpload: true,
    supportsScheduling: false,
    notes: 'No pageview endpoint in the public API. Comments are supported.'
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    enabled: true,
    supportsPublish: true,
    supportsMetrics: false,
    supportsComments: false,
    supportsMediaUpload: true,
    supportsScheduling: false,
    notes: 'Publish-only. Metrics and comments require partner approval and remain unsupported.'
  },
  {
    key: 'devto',
    label: 'DEV.to',
    enabled: true,
    supportsPublish: true,
    supportsMetrics: false,
    supportsComments: false,
    supportsMediaUpload: false,
    supportsScheduling: false,
    notes: 'Best-effort engagement counts may be available, but verification is required.'
  },
  {
    key: 'hashnode',
    label: 'Hashnode',
    enabled: false,
    supportsPublish: false,
    supportsMetrics: false,
    supportsComments: false,
    supportsMediaUpload: false,
    supportsScheduling: false,
    notes: 'Disabled by default because publishing requires a paid Pro plan.'
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    enabled: false,
    supportsPublish: false,
    supportsMetrics: false,
    supportsComments: false,
    supportsMediaUpload: false,
    supportsScheduling: false,
    notes: 'Disabled: no free tier remains and writes are billed.'
  }
];

export const sampleContent = {
  id: 1,
  userId: 101,
  sourceType: 'note',
  status: 'ready_for_review',
  rawText: `I spent the last week working on a local content pipeline for creators. The biggest pain point was turning raw notes into publication-ready pieces without losing context. We gradually cleaned the notes, structured them into headings, and then created tailored versions for Blogger, LinkedIn, and DEV.to. The best workflow was one that forced human approval before publishing anything.`,
  createdAt: '2026-09-01T08:00:00Z'
};

export function structureDraft(rawText) {
  const trimmed = String(rawText ?? '').trim();
  const title = trimmed.split(/\s+/).slice(0, 8).join(' '); 

  return {
    title: title ? `${title}...` : 'Untitled content',
    summary: 'A structured draft built from raw notes with explicit review gates and version preservation.',
    category: 'productivity',
    tags: ['content-pipeline', 'automation', 'creator-tools'],
    keywords: ['AI workflow', 'approval', 'publishing'],
    body: trimmed,
    flaggedClaims: [
      {
        claim_text: 'The workflow was built for creators to publish across multiple platforms.',
        reason: 'This is a high-level summary of the process rather than a factual claim requiring external validation.'
      }
    ],
    aiProvider: 'gemini'
  };
}

export function generatePlatformVersions(draft) {
  return platforms
    .filter((platform) => platform.enabled)
    .map((platform) => ({
      platform: platform.key,
      title: `${draft.title} · ${platform.label}`,
      summary: `${draft.summary} Tailored for ${platform.label}.`,
      body: `${draft.body}\n\n## Platform-specific note\nThis version was generated for ${platform.label} and is pending human review.`
    }));
}

export function createApprovalState() {
  return {
    selectedPlatforms: ['blogger', 'devto'],
    status: 'approved',
    reviewedVersionId: 2,
    changedAfterApproval: false
  };
}

export function getMockDashboardData() {
  const draft = structureDraft(sampleContent.rawText);

  return {
    content: sampleContent,
    draft,
    versions: generatePlatformVersions(draft),
    platforms,
    approval: createApprovalState(),
    metrics: {
      blogger: { comments: 12, views: 'unsupported' },
      linkedin: { metrics: 'unsupported', comments: 'unsupported' },
      devto: { reactions: 49, comments: 'unverified' }
    }
  };
}

export function getSupportedPlatforms() {
  return platforms.filter((platform) => platform.enabled);
}

export function getUnsupportedPlatformReasons() {
  return [
    {
      key: 'linkedin',
      reason: 'LinkedIn metrics and comments are unsupported because read access is partner-gated and social data is restricted to 48 hours.'
    },
    {
      key: 'hashnode',
      reason: 'Hashnode publishing requires a paid Pro plan and is disabled by default.'
    },
    {
      key: 'x',
      reason: 'X has no free tier and is disabled by default.'
    }
  ];
}

if (typeof process !== 'undefined' && process.argv.includes('--check')) {
  console.log('contentflow.js OK');
}
