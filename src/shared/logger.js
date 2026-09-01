// Observability helper — writes audit_logs rows when a db client is available.
import { ok, err } from './result.js';

export function logAudit(db, { entityType, entityId, action, actor = 'system', result, errorMessage }) {
  if (!db) return ok(0);
  try {
    return db.run(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor, result, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [entityType, entityId ?? null, action, actor, result, errorMessage ?? null],
    );
  } catch (e) {
    return err(String(e.message || e), false);
  }
}