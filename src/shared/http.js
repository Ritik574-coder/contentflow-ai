// Thin fetch wrapper that tolerates JSON or non-JSON responses and supports
// dependency injection of a fetch implementation for tests.

export async function httpJson(url, { method = 'GET', headers = {}, body, fetchImpl, timeoutMs, signal } = {}) {
  const fn = fetchImpl || globalThis.fetch;
  let abortSignal = signal;
  if (!abortSignal && timeoutMs && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    abortSignal = AbortSignal.timeout(timeoutMs);
  }

  const res = await fn(url, {
    method,
    headers,
    body: typeof body === 'string'
      ? body
      : (body === undefined ? undefined : JSON.stringify(body)),
    signal: abortSignal,
  });

  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // non-JSON response body (or empty) is fine
  }

  return { status: res.status, ok: res.ok, headers: res.headers, body: json, text };
}

export async function httpGet(url, { headers = {}, fetchImpl, timeoutMs, signal } = {}) {
  return httpJson(url, { headers, fetchImpl, timeoutMs, signal });
}