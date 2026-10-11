import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from './index.js';
import { MIGRATIONS } from './migrations.js';

describe('database', () => {
  it('creates every table and records the schema version', () => {
    const db = openDatabase(':memory:');
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (t) => t.name,
    );
    for (const name of ['permits', 'permit_summaries', 'import_runs', 'import_issues', 'geocode_cache', 'alert_signups']) {
      expect(tables).toContain(name);
    }
    expect(tables).not.toContain('ai_cache');
    expect(tables).not.toContain('ai_calls');
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
  });

  it('is idempotent when migrations run again', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db)).not.toThrow();
  });

  it('enforces permit_type values at the database level', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db
        .prepare(
          `INSERT INTO permits (id, registration_number, company, address, city, county, zip, lat, lng,
           location_source, permit_type, source_url, content_hash, imported_at)
           VALUES ('x', '1', 'c', 'a', 'Houston', 'Harris', '77002', 29.7, -95.3, 'dataset', 'bogus', 'https://x', 'h', 'now')`,
        )
        .run(),
    ).toThrow(/CHECK constraint/);
  });
});

describe('existing database upgrade', () => {
  it('preserves permits while removing retired provider state and summaries', () => {
    const db = new Database(':memory:');
    try {
      db.exec(MIGRATIONS[0]!);db.pragma('user_version = 1');
      db.prepare(`INSERT INTO permits (id,registration_number,company,address,city,county,zip,lat,lng,location_source,permit_type,source_url,content_hash,imported_at)
        VALUES ('p','1','C','1 Main','Houston','Harris','77002',29.7,-95.3,'dataset','unknown','https://www.tceq.texas.gov','hash','now')`).run();
      db.prepare(`INSERT INTO permit_summaries VALUES ('p','hash','{}','legacy-provider','now')`).run();
      migrate(db);
      expect((db.prepare('SELECT COUNT(*) AS n FROM permits').get() as {n:number}).n).toBe(1);
      expect((db.prepare('SELECT COUNT(*) AS n FROM permit_summaries').get() as {n:number}).n).toBe(0);
      expect(() => db.prepare('SELECT * FROM ai_calls')).toThrow();
    } finally {db.close();}
  });
});
