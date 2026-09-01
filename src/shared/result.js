// Result helpers matching the spec's platform-adapter result contract.
//   ok data            => { ok: true, data }
//   error              => { ok: false, error, retryable }
//   unsupported        => { ok: false, unsupported: true, reason }

export const ok = (data) => ({ ok: true, data });
export const err = (error, retryable = false) => ({ ok: false, error, retryable });
export const unsupported = (reason) => ({ ok: false, unsupported: true, reason });

export const isOk = (r) => Boolean(r && r.ok === true);
export const isError = (r) => Boolean(r && r.ok === false && !r.unsupported);
export const isUnsupported = (r) => Boolean(r && r.unsupported === true);