#!/usr/bin/env node
// Purge stale queued/running publishing jobs past a timeout threshold.
import { getDb } from '../src/db/client.js';
import { logAudit } from '../src/shared/logger.js';
import { pathToFileURL } from 'node:url';

const staleHours = Number(process.env.STALE_JOB_HOURS || 24);

export async function main() {
  const db = getDb();
  const result = await db.run(
    `UPDATE publishing_jobs
     SET status = 'failed', finished_at = datetime('now')
     WHERE status IN ('queued', 'running')
       AND started_at IS NOT NULL
       AND datetime(started_at) < datetime('now', ?)`,
    [`-${staleHours} hours`],
  );

  const purged = result.meta?.changes ?? 0;
  await logAudit(db, {
    entityType: 'publishing_jobs',
    entityId: null,
    action: 'cleanup_stale_jobs',
    result: 'success',
    actor: 'cleanup',
  });

  console.log(JSON.stringify({ ok: true, purged, staleHours }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      process.exit(1);
    },
  );
}
