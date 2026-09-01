// Builds the dashboard read-model from D1, shaped to match what the static
// GitHub Pages dashboard renders (camelCase, platform-keyed).
import q from '../src/db/queries/index.js';

const toCamelPlatform = (row) => ({
  key: row.key,
  label: row.display_name,
  enabled: Boolean(row.enabled),
  supportsPublish: Boolean(row.supports_publish),
  supportsMetrics: Boolean(row.supports_metrics),
  supportsComments: Boolean(row.supports_comments),
  supportsMediaUpload: Boolean(row.supports_media_upload),
  supportsScheduling: Boolean(row.supports_scheduling),
  notes: row.notes,
});

export async function buildDashboardPayload(db) {
  const content = await q.getLatestContent(db);
  if (!content) return { content: null, draft: null, versions: [], platforms: [], approval: null, metrics: {} };

  let approval = await q.getLatestApprovalForContent(db, content.id);
  let selections = approval ? await q.getApprovalSelections(db, approval.id) : [];
  const selectedKeys = selections.filter((s) => s.selected).map((s) => s.platformKey);

  const versionsRow = await q.getVersionsForContent(db, content.id);
  const cleaned = versionsRow.find((v) => v.versionType === 'cleaned') || null;

  const draft = cleaned
    ? {
        title: cleaned.title,
        summary: cleaned.summary,
        category: cleaned.category,
        tags: cleaned.tags,
        keywords: cleaned.keywords,
        body: cleaned.body,
        flaggedClaims: cleaned.flaggedClaims,
        aiProvider: cleaned.aiProvider,
      }
    : null;

  const versions = versionsRow
    .filter((v) => v.versionType !== 'cleaned' && v.versionType !== 'manual_edit')
    .map((v) => ({
      platform: v.versionType,
      title: v.title,
      summary: v.summary,
      body: v.body,
      versionId: v.id,
    }));

  const platformRows = await q.getPlatforms(db);
  const platforms = platformRows.map(toCamelPlatform);

  // Metrics per platform from published posts.
  const allPosts = await q.getAllPublishedPosts(db);
  const metrics = {};
  for (const post of allPosts) {
    const key = post.platform_key;
    const snapshots = await q.getMetricSnapshots(db, post.id);
    const comments = await q.getCommentsForPost(db, post.id);
    metrics[key] = metrics[key] || { posts: [] };
    metrics[key].posts.push({
      id: post.id,
      externalUrl: post.external_url,
      externalPostId: post.external_post_id,
      snapshots,
      comments: comments.map((c) => ({
        id: c.id,
        author: c.author_display_name,
        text: c.comment_text,
        postedAt: c.posted_at,
        sentiment: c.sentiment_label,
      })),
    });
  }

  return {
    content: {
      id: content.id,
      status: content.status,
      raw_text: content.raw_text,
      sourceType: content.source_type,
      createdAt: content.created_at,
    },
    draft,
    versions,
    platforms,
    approval: approval
      ? {
          id: approval.id,
          status: approval.status,
          selectedPlatforms: selectedKeys,
          reviewedVersionId: approval.reviewed_version_id,
          decidedVia: approval.decided_via,
          decidedAt: approval.decided_at,
          changedAfterApproval: approval.status === 'superseded',
        }
      : null,
    metrics,
  };
}