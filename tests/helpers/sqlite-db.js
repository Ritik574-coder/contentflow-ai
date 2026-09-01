import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function bindParams(params = []) {
  return params.map((value) => {
    if (value == null) return null;
    if (typeof value === 'bigint') return Number(value);
    return value;
  });
}

export class SqliteDbClient {
  constructor(db) {
    this.db = db;
  }

  async query(sql, params = []) {
    return this.db.prepare(sql).all(...bindParams(params));
  }

  async first(sql, params = []) {
    return this.db.prepare(sql).get(...bindParams(params));
  }

  async run(sql, params = []) {
    const info = this.db.prepare(sql).run(...bindParams(params));
    return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
  }
}

export function createTestDb() {
  const db = new DatabaseSync(':memory:');
  const dir = resolve('migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    db.exec(sql);
  }

  return new SqliteDbClient(db);
}
