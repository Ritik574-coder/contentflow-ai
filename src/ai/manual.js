// Manual/offline generator — always succeeds, no API key needed.
export async function generateManual(rawText) {
  const trimmed = String(rawText ?? '').trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const title = words.slice(0, 8).join(' ');

  return {
    ok: true,
    data: {
      title: title ? `${title}${words.length > 8 ? '…' : ''}` : 'Untitled content',
      summary: 'A structured draft built from raw notes with explicit review gates and version preservation.',
      category: 'general',
      tags: ['content-pipeline', 'automation', 'creator-tools'],
      keywords: ['AI workflow', 'approval', 'publishing'],
      body: trimmed,
      flaggedClaims: [],
      createdBy: 'system_ai',
    },
  };
}