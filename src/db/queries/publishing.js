export async function createPublishingJob(db, { approvalRequestId, dryRun }) {
  const info = await db.run(
    `INSERT INTO publishing_jobs (approval_request_id, status, dry_run, started_at)
     VALUES (?, 'queued', ?, datetime('now'))`,
    [approvalRequestId, dryRun ? 1 : 0],
  );
  const id = info.meta && info.meta.last_row_id;
  return db.first(`SELECT * FROM publishing_jobs WHERE id = ?`, [id]) || { id };
}

export async function getPublishingJob(db, id) {
  return db.first(`SELECT * FROM publishing_jobs WHERE id = ?`, [id]);
}

export async function updatePublishingJob(db, id, patch) {
  const sets = [];
  const params = [];
  const allowed = ['status', 'started_at', 'finished_at'];
  for (const key of allowed) {
    if (key in patch && patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(patch[key]);
    }
  }
  if (!sets.length) return;
  params.push(id);
  return db.run(`UPDATE publishing_jobs SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function insertPublishingAttempt(db, { publishingJobId, platformPostId, attemptNumber, result, errorMessage }) {
  return db.run(
    `INSERT INTO publishing_attempts (publishing_job_id, platform_post_id, attempt_number, result, error_message)
     VALUES (?, ?, ?, ?, ?)`,
    [publishingJobId, platformPostId, attemptNumber, result, errorMessage ?? null],
  );
}

export async function getPublishingAttemptsForJob(db, publishingJobId) {
  return db.query(`SELECT * FROM publishing_attempts WHERE publishing_job_id = ?`, [publishingJobId]);
}