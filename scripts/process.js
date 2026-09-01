#!/usr/bin/env node
// Process Content — ingest raw content, run the AI fallback chain, store
// versions and an approval request, and (when Telegram is configured) send a
// ready-for-review notification with an inline approval keyboard.
//
// Inputs (environment):
//   RAW_TEXT   - raw notes to ingest (workflow_dispatch input)
//   CONTENT_ID - (optional) re-process an existing content row
//   AI_PROVIDER / AI_PROVIDER_ORDER - control the AI fallback chain
//   CF_API_TOKEN, CF_D1_DATABASE_ID, CF_ACCOUNT_ID - D1 via REST (or run with DB binding)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_SECRET_TOKEN - notifications

import { getDb } from '../src/db/client.js';
import q from '../src/db/queries/index.js';
import { processContent } from '../src/ai/index.js';
import { getAdapter } from '../src/platforms/index.js';
import { notifyReview } from '../src/notify.js';
import { logAudit } from '../src/shared/logger.js';
import { pathToFileURL } from 'node:url';

export async function runProcessPipeline(db, rawText, { contentId = null } = {}) {
  const text = String(rawText || '').trim();

  // ----- resolve raw text -----
  let content;
  if (text) {
    const user = await q.ensureDefaultUser(db);
    content = await q.insertContent(db, { userId: user.id, rawText: text, sourceType: 'note' });
  } else if (contentId) {
    content = await q.getContent(db, Number(contentId));
    if (!content) throw new Error(`Content ${contentId} not found`);
  } else {
    throw new Error('Nothing to process: set RAW_TEXT or CONTENT_ID');
  }

  await q.updateContentStatus(db, content.id, 'processing', null);
  await logAudit(db, { entityType: 'content', entityId: content.id, action: 'processing_started', result: 'success' });

  // ----- AI processing (fallback chain) -----
  const draft = await processContent(content.raw_text, {});

  const cleaned = await q.insertContentVersion(db, {
    contentId: content.id,
    parentVersionId: null,
    versionType: 'cleaned',
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    category: draft.category,
    tags: draft.tags,
    keywords: draft.keywords,
    flaggedClaims: draft.flaggedClaims,
    aiProvider: draft.aiProvider,
    createdBy: 'system_ai',
  });

  // ----- platform versions (only for enabled platforms) -----
  const enabledPlatforms = await q.getEnabledPlatforms(db);
  const platformVersions = [];
  for (const p of enabledPlatforms) {
    const adapter = getAdapter(p.key);
    const platformVersion = await q.insertContentVersion(db, {
      contentId: content.id,
      parentVersionId: cleaned.id,
      versionType: p.key,
      title: draft.title,
      summary: draft.summary,
      body: `${draft.body}\n\n## Platform note\nThis version was generated for ${p.display_name} and is pending human review.${adapter ? '' : ''}`,
      category: draft.category,
      tags: draft.tags,
      keywords: draft.keywords,
      flaggedClaims: draft.flaggedClaims,
      aiProvider: draft.aiProvider,
      createdBy: 'system_ai',
    });
    platformVersions.push({ platform: p.key, versionId: platformVersion.id });
  }

  // ----- approval request (default: no platform selected) -----
  const approval = await q.createApprovalRequest(db, {
    contentId: content.id,
    reviewedVersionId: cleaned.id,
  });
  for (const p of enabledPlatforms) {
    await q.upsertApprovalSelection(db, { approvalRequestId: approval.id, platformId: p.id, selected: false });
  }

  await q.updateContentStatus(db, content.id, 'ready_for_review', cleaned.id);
  await logAudit(db, { entityType: 'content', entityId: content.id, action: 'processing_completed', result: 'success' });

  // ----- notify (best effort; dashboard remains the fallback) -----
  const notifyResult = await notifyReview({
    db,
    approvalId: approval.id,
    draft,
    platforms: enabledPlatforms,
    selectedKeys: [],
  });

  const summary = {
    contentId: content.id,
    approvalId: approval.id,
    cleanedVersionId: cleaned.id,
    aiProvider: draft.aiProvider,
    fallbackReason: draft.fallbackReason || null,
    platformVersions,
    reviewChannel: notifyResult.ok ? 'telegram' : 'dashboard_fallback',
    status: 'ready_for_review',
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

export async function main() {
  const contentId = process.env.CONTENT_ID ? Number(process.env.CONTENT_ID) : null;
  const rawText = process.env.RAW_TEXT || '';
  return runProcessPipeline(getDb(), rawText, { contentId });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
      process.exit(1);
    },
  );
}
