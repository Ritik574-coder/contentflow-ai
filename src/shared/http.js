// Thin fetch wrapper that tolerates JSON or non-JSON responses and supports
// dependency injection of a fetch implementation for tests.

export async function httpJson(url, { method = 'GET', headers = {}, body, fetchImpl } = {}) {
  const fn = fetchImpl || globalThis.fetch;
  const res = await fn(url, {
    method,
    headers,
    body: typeof body === 'string'
      ? body
      : (body === undefined ? undefined : JSON.stringify(body)),
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

export async function httpGet(url, { headers = {}, fetchImpl } = {}) {
  return httpJson(url, { headers, fetchImpl });
}