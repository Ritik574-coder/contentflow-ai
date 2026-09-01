#!/usr/bin/env node
// Collect Metrics — for every published platform post, whatever each
// platform's official API genuinely allows. Blogger comments and DEV.to
// best-effort engagement counts are persisted; LinkedIn/X/Hashnode return
// Unsupported and are left untouched (never fabricated).
//
// DRY_RUN=true (default) never calls any platform API and only records an
// audit row.

import { getDb } from '../src/db/client.js';
import q from '../src/db/queries/index.js';
import { getAdapter, platformSupports } from '../src/platforms/index.js';
import { isOk, isUnsupported } from '../src/shared/result.js';
import { withBackoff } from '../src/shared/retry.js';
import { notifyAlert } from '../src/notify.js';
import { logAudit } from '../src/shared/logger.js';
import { pathToFileURL } from 'node:url';

const dryRun = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true' || String(process.env.DRY_RUN) === '1';

export async function main() {
  const db = getDb();
  const posts = await q.getAllPublishedPosts(db);
  let collected = 0;
  let unsupported = 0;

  await logAudit(db, { entityType: 'metrics', entityId: null, action: 'metrics_collection_started', result: 'success' });

  for (const post of posts) {
    const adapter = getAdapter(post.platform_key);
    if (!adapter) continue;
    const account = await q.getPlatformAccount(db, post.platform_key);
    if (!account) continue;

    if (post.supports_metrics) {
      let res;
      if (dryRun) {
        res = { ok: true, data: { rawMetrics: { dry_run: true } } };
      } else {
        res = await withBackoff(() => adapter.getMetrics(post.external_post_id, account, {}), { retries: 3 });
      }
      if (isOk(res)) {
        await q.insertMetricSnapshot(db, {
          platformPostId: post.id,
          views: res.data.views,
          impressions: res.data.impressions,
          likes: res.data.likes,
          commentsCount: res.data.commentsCount,
          shares: res.data.shares,
          clicks: res.data.clicks,
          rawMetrics: res.data.rawMetrics || {},
        });
        collected++;
      } else if (isUnsupported(res)) {
        unsupported++;
      }
    }

    if (post.supports_comments) {
      let res;
      if (dryRun) {
        res = { ok: true, data: [] };
      } else {
        res = await withBackoff(() => adapter.getComments(post.external_post_id, account, {}), { retries: 3 });
      }
      if (isOk(res)) {
        for (const c of res.data) {
          await q.insertComment(db, {
            platformPostId: post.id,
            externalCommentId: c.externalCommentId,
            authorDisplayName: c.authorDisplayName,
            commentText: c.commentText,
            postedAt: c.postedAt,
          });
        }
        collected += res.data.length;
      } else if (isUnsupported(res)) {
        unsupported++;
      }
    }
  }

  await logAudit(db, { entityType: 'metrics', entityId: null, action: 'metrics_collection_completed', result: 'success' });
  if (unsupported) {
    await notifyAlert({ db, text: `Metrics collection skipped ${unsupported} unsupported platform(s).` });
  }

  console.log(JSON.stringify({ ok: true, postsProcessed: posts.length, metricsCollected: collected, unsupported, dryRun }, null, 2));
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
