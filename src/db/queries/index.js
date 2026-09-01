import * as content from './content.js';
import * as platforms from './platforms.js';
import * as approval from './approval.js';
import * as publishing from './publishing.js';
import * as metrics from './metrics.js';

export const queries = {
  ...content,
  ...platforms,
  ...approval,
  ...publishing,
  ...metrics,
};

export function insertNotification(db, { contentId, approvalRequestId, channel = 'telegram', notificationType, payload }) {
  return db.run(
    `INSERT INTO notifications (content_id, approval_request_id, channel, notification_type, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    [contentId ?? null, approvalRequestId ?? null, channel, notificationType, JSON.stringify(payload ?? {})],
  );
}

export default queries;