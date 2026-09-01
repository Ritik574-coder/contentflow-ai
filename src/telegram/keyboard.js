// Inline keyboard builders for the Telegram approval flow.
// callback_data format: "toggle:<approvalId>:<platformKey>",
//                        "preview:<approvalId>", "edit:<approvalId>",
//                        "approve:<approvalId>", "reject:<approvalId>"

export function approvalKeyboard(approvalId, platforms, selectedKeys) {
  const rows = (platforms || []).map((p) => [
    {
      text: `${selectedKeys.includes(p.key) ? '✅' : '⬜'} ${p.display_name || p.label || p.key}`,
      callback_data: `toggle:${approvalId}:${p.key}`,
    },
  ]);

  rows.push([
    { text: 'Preview', callback_data: `preview:${approvalId}` },
    { text: 'Edit', callback_data: `edit:${approvalId}` },
  ]);
  rows.push([{ text: '📤 Approve & Publish Selected', callback_data: `approve:${approvalId}` }]);
  rows.push([{ text: '❌ Reject', callback_data: `reject:${approvalId}` }]);

  return { inline_keyboard: rows };
}

export function parseCallbackData(data) {
  const parts = String(data || '').split(':');
  const action = parts[0];
  const approvalId = Number(parts[1]);
  const platformKey = parts[2];
  return { action, approvalId, platformKey };
}
