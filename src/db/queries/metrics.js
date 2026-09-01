const jsonParse = (s, fallback) => {
  if (s == null || s === '') return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export async function insertMetricSnapshot(db, snapshot) {
  const info = await db.run(
    `INSERT INTO metric_snapshots
       (platform_post_id, views, impressions, likes, comments_count, shares, clicks, raw_metrics_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.platformPostId,
      snapshot.views ?? null,
      snapshot.impressions ?? null,
      snapshot.likes ?? null,
      snapshot.commentsCount ?? null,
      snapshot.shares ?? null,
      snapshot.clicks ?? null,
      JSON.stringify(snapshot.rawMetrics ?? {}),
    ],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM metric_snapshots WHERE id = ?`, [id]) || { id };
}

export async function insertComment(db, comment) {
  const info = await db.run(
    `INSERT INTO comments (platform_post_id, external_comment_id, author_display_name, comment_text, posted_at, sentiment_label)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      comment.platformPostId,
      comment.externalCommentId ?? null,
      comment.authorDisplayName ?? null,
      comment.commentText ?? null,
      comment.postedAt ?? null,
      comment.sentimentLabel ?? null,
    ],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM comments WHERE id = ?`, [id]) || { id };
}

export async function getMetricSnapshots(db, platformPostId) {
  const rows = await db.query(
    `SELECT * FROM metric_snapshots WHERE platform_post_id = ? ORDER BY captured_at ASC`,
    [platformPostId],
  );
  return rows.map((r) => ({
    id: r.id,
    platformPostId: r.platform_post_id,
    capturedAt: r.captured_at,
    views: r.views,
    impressions: r.impressions,
    likes: r.likes,
    commentsCount: r.comments_count,
    shares: r.shares,
    clicks: r.clicks,
    rawMetrics: jsonParse(r.raw_metrics_json, {}),
  }));
}

export async function getCommentsForPost(db, platformPostId) {
  return db.query(`SELECT * FROM comments WHERE platform_post_id = ? ORDER BY posted_at ASC`, [platformPostId]);
}

export async function getAllPublishedPosts(db) {
  return db.query(
    `SELECT pp.*, p.key AS platform_key, p.display_name AS platform_name, p.supports_metrics, p.supports_comments
     FROM platform_posts pp
     JOIN platform_accounts pa ON pa.id = pp.platform_account_id
     JOIN platforms p ON p.id = pa.platform_id
     WHERE pp.status = 'published'
     ORDER BY pp.published_at DESC`,
  );
}