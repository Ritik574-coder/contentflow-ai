// D1 database client with two implementations sharing one interface:
//   query(sql, params)  -> array of rows
//   first(sql, params)  -> single row or undefined
//   run(sql, params)    -> run result ({ meta }, { changes }, ...)
//
// In a Cloudflare Worker, pass `env` (env.DB is the D1 binding). In Node
// scripts / tests, it uses the Cloudflare D1 REST API with CF_API_TOKEN and
// CF_D1_DATABASE_ID (plus CF_ACCOUNT_ID). Pass a pre-built client from tests to
// avoid any network call.

import { httpJson } from '../shared/http.js';

const REST_BASE = 'https://api.cloudflare.com/client/v4';

class WorkerDbClient {
  constructor(db) {
    this.db = db;
  }

  _prepare(sql, params) {
    const stmt = this.db.prepare(sql);
    return params && params.length ? stmt.bind(...params) : stmt;
  }

  async query(sql, params = []) {
    const result = await this._prepare(sql, params).all();
    if (Array.isArray(result)) return result;
    return result && Array.isArray(result.results) ? result.results : [];
  }

  async first(sql, params = []) {
    return this._prepare(sql, params).first();
  }

  async run(sql, params = []) {
    const result = await this._prepare(sql, params).run();
    return { meta: result && result.meta ? result.meta : result };
  }
}

class RestDbClient {
  _auth() {
    const token = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
    const databaseId = process.env.CF_D1_DATABASE_ID;
    const accountId = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token) throw new Error('CF_API_TOKEN (or CLOUDFLARE_API_TOKEN) is not set');
    if (!databaseId) throw new Error('CF_D1_DATABASE_ID is not set');
    if (!accountId) throw new Error('CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) is not set');
    return { token, databaseId, accountId };
  }

  async _post(sql, params) {
    const { token, databaseId, accountId } = this._auth();
    const res = await httpJson(
      `${REST_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: { sql, params },
      },
    );
    if (!res.ok) {
      throw new Error(`D1 REST query failed (${res.status}): ${res.text}`);
    }
    if (!res.body.success || !Array.isArray(res.body.result)) {
      throw new Error('Unexpected D1 REST response shape');
    }
    return res.body.result[0] || { results: [], meta: { changes: 0, last_row_id: 0 } };
  }

  async query(sql, params = []) {
    const metaRow = await this._post(sql, params);
    return metaRow.results || [];
  }

  async first(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows.length ? rows[0] : undefined;
  }

  async run(sql, params = []) {
    const metaRow = await this._post(sql, params);
    // D1 REST wraps write metadata under metaRow.meta; Worker bindings expose it flat.
    return { meta: metaRow.meta || metaRow };
  }
}

// getDb(env) — Worker uses the D1 binding; Node/REST otherwise.
// getDb(db) — a pre-built client (e.g. an in-memory test client) is returned as-is.
export function getDb(env = {}) {
  if (env && env.DB) return new WorkerDbClient(env.DB);
  if (env && typeof env.query === 'function') return env;
  return new RestDbClient();
}

export { WorkerDbClient, RestDbClient };
