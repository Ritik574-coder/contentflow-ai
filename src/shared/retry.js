// Exponential backoff wrapper. Honor the platform result's retryable flag
// instead of retrying errors that are permanent.
// fn is called as fn(attempt) and must return a Result (via shared/result.js).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withBackoff(fn, { retries = 5, baseDelaySec = 2 } = {}, { isOk, isError } = {}) {
  let attempt = 0;
  const looksOk = isOk || ((r) => Boolean(r && r.ok === true));
  const looksError = isError || ((r) => Boolean(r && r.ok === false && !r.unsupported));

  for (; ; attempt++) {
    let result;
    try {
      result = await fn(attempt);
    } catch (e) {
      if (attempt >= retries) {
        return { ok: false, error: String(e && (e.message || e)), retryable: true };
      }
      await sleep(Math.min(Math.pow(2, attempt + 1) * baseDelaySec * 1000, 60000));
      continue;
    }

    if (looksOk(result) || !looksError(result)) {
      return result;
    }

    if (!result.retryable || attempt >= retries) {
      return result;
    }

    await sleep(Math.min(Math.pow(2, attempt + 1) * baseDelaySec * 1000, 60000));
  }
}