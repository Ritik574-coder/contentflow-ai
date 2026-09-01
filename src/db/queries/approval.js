export async function createApprovalRequest(db, { contentId, reviewedVersionId }) {
  const info = await db.run(
    `INSERT INTO approval_requests (content_id, reviewed_version_id, status)
     VALUES (?, ?, 'pending')`,
    [contentId, reviewedVersionId],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM approval_requests WHERE id = ?`, [id]) || { id };
}

export async function getApprovalRequest(db, id) {
  return db.first(`SELECT * FROM approval_requests WHERE id = ?`, [id]);
}

export async function getLatestApprovalForContent(db, contentId) {
  return db.first(`SELECT * FROM approval_requests WHERE content_id = ? ORDER BY id DESC LIMIT 1`, [contentId]);
}

export async function getApprovals(db, limit = 20) {
  return db.query(`SELECT * FROM approval_requests ORDER BY id DESC LIMIT ${Number(limit) || 20}`);
}

export async function updateApprovalStatus(db, id, status, decidedVia, decidedAt) {
  const info = await db.run(
    `UPDATE approval_requests SET status = ?, decided_via = ?, decided_at = ? WHERE id = ?`,
    [status, decidedVia ?? null, decidedAt ?? new Date().toISOString(), id],
  );
  return info;
}

export async function upsertApprovalSelection(db, { approvalRequestId, platformId, selected }) {
  const existing = await db.first(
    `SELECT * FROM approval_selections WHERE approval_request_id = ? AND platform_id = ?`,
    [approvalRequestId, platformId],
  );
  if (existing) {
    return db.run(
      `UPDATE approval_selections SET selected = ? WHERE id = ?`,
      [selected ? 1 : 0, existing.id],
    );
  }
  const info = await db.run(
    `INSERT INTO approval_selections (approval_request_id, platform_id, selected) VALUES (?, ?, ?)`,
    [approvalRequestId, platformId, selected ? 1 : 0],
  );
  return db.first(`SELECT * FROM approval_selections WHERE id = ?`, [info.meta && info.meta.last_row_id]) || {};
}

export async function getApprovalSelections(db, approvalRequestId) {
  const rows = await db.query(
    `SELECT s.*, p.key AS platform_key, p.display_name AS platform_name, p.enabled AS platform_enabled
     FROM approval_selections s
     JOIN platforms p ON p.id = s.platform_id
     WHERE s.approval_request_id = ?
     ORDER BY p.id ASC`,
    [approvalRequestId],
  );
  return rows.map((r) => ({
    id: r.id,
    approvalRequestId: r.approval_request_id,
    platformId: r.platform_id,
    selected: Boolean(r.selected),
    platformKey: r.platform_key,
    platformName: r.platform_name,
    platformEnabled: Boolean(r.platform_enabled),
  }));
}

export async function setSelectionsForApproval(db, approvalRequestId, platformKeys) {
  const platforms = await db.query(`SELECT * FROM platforms`);
  for (const p of platforms) {
    const selected = platformKeys.includes(p.key);
    await upsertApprovalSelection(db, {
      approvalRequestId,
      platformId: p.id,
      selected,
    });
  }
}

export async function getSelectedPlatformKeys(db, approvalRequestId) {
  const rows = await getApprovalSelections(db, approvalRequestId);
  return rows.filter((r) => r.selected && r.platformEnabled).map((r) => r.platformKey);
}