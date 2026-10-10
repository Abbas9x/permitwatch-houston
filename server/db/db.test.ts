import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from './index.js';
import { MIGRATIONS } from './migrations.js';

describe('database', () => {
  it('creates every table and records the schema version', () => {
    const db = openDatabase(':memory:');
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (t) => t.name,
    );
    for (const name of ['permits', 'permit_summaries', 'import_runs', 'import_issues', 'ai_cache', 'ai_calls', 'geocode_cache', 'alert_signups']) {
      expect(tables).toContain(name);
    }
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
