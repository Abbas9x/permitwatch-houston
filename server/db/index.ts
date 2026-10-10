import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations.js';

export type DB = Database.Database;

/** Opens (or creates) the SQLite database and brings the schema up to date. */
export function openDatabase(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) break;
    db.transaction(() => {
      db.exec(sql);
      // PRAGMA cannot be parameterized; `version` is a loop counter, never user input.
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
