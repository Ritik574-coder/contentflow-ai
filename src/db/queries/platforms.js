export async function getPlatform(db, key) {
  return db.first(`SELECT * FROM platforms WHERE key = ?`, [key]);
}

export async function getPlatforms(db) {
  return db.query(`SELECT * FROM platforms ORDER BY id ASC`);
}

export async function getEnabledPlatforms(db) {
  return db.query(`SELECT * FROM platforms WHERE enabled = 1 ORDER BY id ASC`);
}

export async function getPlatformAccount(db, platformKey) {
  return db.first(
    `SELECT pa.* FROM platform_accounts pa
     JOIN platforms p ON p.id = pa.platform_id
     WHERE p.key = ?
     ORDER BY pa.id ASC LIMIT 1`,
    [platformKey],
  );
}

export async function getPlatformAccountById(db, id) {
  return db.first(`SELECT * FROM platform_accounts WHERE id = ?`, [id]);
}

export async function insertPlatformAccount(db, { platformId, accountLabel, externalAccountId, tokenSecretRef }) {
  const info = await db.run(
    `INSERT INTO platform_accounts (platform_id, account_label, external_account_id, connection_status, token_secret_ref)
     VALUES (?, ?, ?, 'disconnected', ?)`,
    [platformId, accountLabel, externalAccountId ?? null, tokenSecretRef ?? null],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM platform_accounts WHERE id = ?`, [id]) || { id };
}

export async function insertPlatformPost(db, { contentVersionId, platformAccountId, status = 'pending', idempotencyKey }) {
  const info = await db.run(
    `INSERT INTO platform_posts (content_version_id, platform_account_id, status, idempotency_key)
     VALUES (?, ?, ?, ?)`,
    [contentVersionId, platformAccountId, status, idempotencyKey],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM platform_posts WHERE id = ?`, [id]) || { id };
}

export async function getPlatformPostByIdempotency(db, idempotencyKey) {
  return db.first(`SELECT * FROM platform_posts WHERE idempotency_key = ?`, [idempotencyKey]);
}

export async function updatePlatformPost(db, id, patch) {
  const sets = [];
  const params = [];
  const allowed = ['external_post_id', 'external_url', 'status', 'response_metadata_json', 'published_at'];
  for (const key of allowed) {
    if (key in patch && patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(patch[key]);
    }
  }
  if (!sets.length) return;
  sets.push(`updated_at = datetime('now')`);
  params.push(id);
  return db.run(`UPDATE platform_posts SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function getPublishedPostsForPlatform(db, platformKey) {
  return db.query(
    `SELECT pp.*, cv.title, cv.body, p.key AS platform_key, p.display_name AS platform_name
     FROM platform_posts pp
     JOIN content_versions cv ON cv.id = pp.content_version_id
     JOIN platform_accounts pa ON pa.id = pp.platform_account_id
     JOIN platforms p ON p.id = pa.platform_id
     WHERE p.key = ? AND pp.status = 'published'
     ORDER BY pp.published_at DESC`,
    [platformKey],
  );
}