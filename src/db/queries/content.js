const jsonParse = (s, fallback) => {
  if (s == null || s === '') return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export async function ensureDefaultUser(db) {
  const existing = await db.first(`SELECT * FROM users ORDER BY id ASC LIMIT 1`);
  if (existing) return existing;
  await db.run(
    `INSERT INTO users (display_name, telegram_chat_id) VALUES (?, ?)`,
    ['Default User', null],
  );
  return db.first(`SELECT * FROM users ORDER BY id ASC LIMIT 1`);
}

export async function insertContent(db, { userId, rawText, sourceType = 'note' }) {
  const info = await db.run(
    `INSERT INTO content (user_id, raw_text, source_type, status)
     VALUES (?, ?, ?, 'raw')`,
    [userId, rawText, sourceType],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM content WHERE id = ?`, [id]) || { id, raw_text: rawText, user_id: userId };
}

export async function getContent(db, id) {
  return db.first(`SELECT * FROM content WHERE id = ?`, [id]);
}

export async function getLatestContent(db) {
  return db.first(`SELECT * FROM content ORDER BY id DESC LIMIT 1`);
}

export async function updateContentStatus(db, id, status, currentVersionId) {
  return db.run(
    `UPDATE content SET status = ?, current_version_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, currentVersionId, id],
  );
}

export async function insertContentVersion(db, version) {
  const info = await db.run(
    `INSERT INTO content_versions
       (content_id, parent_version_id, version_type, title, summary, body, category,
        tags_json, keywords_json, flagged_claims_json, ai_provider, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      version.contentId,
      version.parentVersionId ?? null,
      version.versionType,
      version.title ?? null,
      version.summary ?? null,
      version.body,
      version.category ?? null,
      JSON.stringify(version.tags ?? []),
      JSON.stringify(version.keywords ?? []),
      JSON.stringify(version.flaggedClaims ?? []),
      version.aiProvider ?? null,
      version.createdBy ?? 'system_ai',
    ],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM content_versions WHERE id = ?`, [id]) || { id };
}

export async function getContentVersion(db, id) {
  return db.first(`SELECT * FROM content_versions WHERE id = ?`, [id]);
}

export function mapVersionRow(row) {
  return {
    id: row.id,
    contentId: row.content_id,
    parentVersionId: row.parent_version_id,
    versionType: row.version_type,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    tags: jsonParse(row.tags_json, []),
    keywords: jsonParse(row.keywords_json, []),
    flaggedClaims: jsonParse(row.flagged_claims_json, []),
    aiProvider: row.ai_provider,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function getVersionsForContent(db, contentId, versionType) {
  let rows;
  if (versionType) {
    rows = await db.query(
      `SELECT * FROM content_versions WHERE content_id = ? AND version_type = ? ORDER BY id ASC`,
      [contentId, versionType],
    );
  } else {
    rows = await db.query(`SELECT * FROM content_versions WHERE content_id = ? ORDER BY id ASC`, [contentId]);
  }
  return rows.map(mapVersionRow);
}