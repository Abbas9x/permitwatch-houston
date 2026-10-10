import { describe, expect, it, vi } from 'vitest';
import { getPermitRecord, listPermitRecords, toPermit } from '../db/permitsRepo.js';
import { silentLogger, testDb } from '../testUtils.js';
import { importRows, parseCsv, readDatasetFile, validateRow, type GeocodeFn } from './importer.js';
import { normalizeDate, normalizePermitType, normalizePollutants } from './rowSchema.js';

const validRow = {
  id: 'p-1',
  registration_number: '170001',
  company: 'Example Ready-Mix LLC',
  address: '100 Example St',
  city: 'Houston',
  county: 'Harris',
  zip: '77020',
  lat: 29.77,
  lng: -95.33,
  permit_type: 'new',
  max_production_cyd_per_hr: 300,
  max_hours_per_year: 8760,
  pollutants: ['PM10', 'PM2.5'],
  controls: 'Water sprays',
  notice_type: 'NORI',
  notice_issuance_date: '2026-09-01',
  comment_deadline: '2026-10-31',
  source_url: 'https://www.tceq.texas.gov/notice.pdf',
  raw_text: 'Notice text',
};

function expectValid(raw: unknown) {
  const result = validateRow(raw);
  if (!result.ok) throw new Error(`expected valid row, got: ${result.errors.join('; ')}`);
  return result;
}

describe('validateRow', () => {
  it('accepts a complete valid row', () => {
    const { row, warnings } = expectValid(validRow);
    expect(row.max_production_cyd_per_hr).toBe(300);
    expect(row.pollutants).toEqual(['PM10', 'PM2.5']);
    expect(row.is_sample).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('coerces CSV-style strings without inventing values', () => {
    const { row } = expectValid({
      ...validRow,
      lat: '29.77',
      lng: '-95.33',
      zip: '77020-1234',
      max_production_cyd_per_hr: '1,200',
      max_hours_per_year: '',
      pollutants: 'PM10; PM2.5; PM10',
      notice_issuance_date: '9/1/2026',
      comment_deadline: '',
      is_sample: 'TRUE',
    });
    expect(row.zip).toBe('77020');
    expect(row.max_production_cyd_per_hr).toBe(1200);
    expect(row.max_hours_per_year).toBeUndefined();
    expect(row.pollutants).toEqual(['PM10', 'PM2.5']);
    expect(row.notice_issuance_date).toBe('2026-09-01');
    expect(row.comment_deadline).toBeUndefined();
    expect(row.is_sample).toBe(true);
  });

  it('rejects rows with missing or invalid required fields', () => {
    const missingCompany = validateRow({ ...validRow, company: '  ' });
    expect(missingCompany.ok).toBe(false);
    if (!missingCompany.ok) expect(missingCompany.errors.join()).toContain('company');

    const badZip = validateRow({ ...validRow, zip: '7702' });
    expect(badZip.ok).toBe(false);

    const scriptUrl = validateRow({ ...validRow, source_url: 'javascript:alert(1)' });
    expect(scriptUrl.ok).toBe(false);
    if (!scriptUrl.ok) expect(scriptUrl.errors.join()).toContain('source_url');
  });

  it('rejects non-object rows without throwing', () => {
    for (const raw of [null, 42, 'text', [1, 2]]) {
      expect(validateRow(raw).ok).toBe(false);
    }
  });

  it('clears a malformed optional field and warns instead of rejecting the row', () => {
    const result = expectValid({ ...validRow, comment_deadline: '2026-02-30', max_hours_per_year: 'lots' });
    expect(result.row.comment_deadline).toBeUndefined();
    expect(result.row.max_hours_per_year).toBeUndefined();
    expect(result.warnings.join()).toContain('comment_deadline');
    expect(result.warnings.join()).toContain('max_hours_per_year');
  });

  it('rejects impossible production numbers rather than storing them', () => {
    const result = expectValid({ ...validRow, max_production_cyd_per_hr: -5, max_hours_per_year: 9000 });
    expect(result.row.max_production_cyd_per_hr).toBeUndefined();
    expect(result.row.max_hours_per_year).toBeUndefined();
  });

  it('clears coordinates outside Texas (e.g. a dropped minus sign) so they get geocoded', () => {
    const result = expectValid({ ...validRow, lat: 29.77, lng: 95.33 }); // missing minus sign
    expect(result.row.lat).toBeUndefined();
    expect(result.warnings.join()).toContain('outside Texas');
  });

  it('normalizes header names and derives a missing id from the registration number', () => {
    const { row, warnings } = expectValid({
      'Registration Number': '170002',
      Company: 'Example',
      Address: '1 Main',
      City: 'Houston',
      County: 'Harris',
      ZIP: '77002',
      'Permit-Type': 'Renewal',
      'Source URL': 'https://www.tceq.texas.gov/x',
    });
    expect(row.id).toBe('reg-170002');
    expect(row.permit_type).toBe('renewal');
    expect(warnings.join()).toContain('derived');
  });

  it('strips control characters from text', () => {
    const { row } = expectValid({ ...validRow, company: 'Acme\u0000 Concrete\u0007' });
    expect(row.company).toBe('Acme Concrete');
  });
});

describe('normalizers', () => {
  it('maps permit type wording', () => {
    expect(normalizePermitType('Renewal of standard permit').type).toBe('renewal');
    expect(normalizePermitType('AMENDMENT').type).toBe('amendment');
    expect(normalizePermitType('New').type).toBe('new');
    expect(normalizePermitType('initial issuance').type).toBe('new');
    expect(normalizePermitType('???')).toEqual({ type: 'unknown', recognized: false });
    expect(normalizePermitType('')).toEqual({ type: 'unknown', recognized: true });
  });

  it('parses dates in several formats', () => {
    expect(normalizeDate('2026-10-31T00:00:00Z')).toBe('2026-10-31');
    expect(normalizeDate('10/31/2026')).toBe('2026-10-31');
    expect(normalizeDate('  ')).toBeUndefined();
  });

  it('parses pollutant lists', () => {
    expect(normalizePollutants('["PM10","PM2.5"]')).toEqual(['PM10', 'PM2.5']);
    expect(normalizePollutants('PM10, PM2.5')).toEqual(['PM10', 'PM2.5']);
    expect(normalizePollutants(undefined)).toEqual([]);
  });

  it('parses CSV with quoted commas and newlines', () => {
    const rows = parseCsv('id,company,controls\n1,"Acme, Inc.","line one\nline two"\n');
    expect(rows).toEqual([{ id: '1', company: 'Acme, Inc.', controls: 'line one\nline two' }]);
  });
});

describe('importRows', () => {
  it('imports valid rows, rejects bad ones, and logs rejections without crashing', async () => {
    const db = testDb();
    const report = await importRows(
      [validRow, { ...validRow, id: 'p-2', zip: 'bad' }, 'garbage', { ...validRow }],
      { db, logger: silentLogger(), source: 'test' },
    );
    expect(report.imported).toBe(1);
    expect(report.rejected.map((r) => r.rowNumber)).toEqual([2, 3, 4]);
    expect(report.rejected[2]!.messages.join()).toContain('duplicate');
    const logged = db.prepare("SELECT COUNT(*) AS n FROM import_issues WHERE severity = 'rejected'").get() as { n: number };
    expect(logged.n).toBe(3);
  });

  it('geocodes rows that have no coordinates, and rejects them when geocoding fails', async () => {
    const db = testDb();
    const geocode = vi.fn<GeocodeFn>(async ({ address }) =>
      address === 'findable' ? { lat: 29.7, lng: -95.3, source: 'census_geocoder' } : null,
    );
    const { lat: _lat, lng: _lng, ...noCoords } = validRow;
    const report = await importRows(
      [
        { ...noCoords, id: 'a', address: 'findable' },
        { ...noCoords, id: 'b', address: 'nowhere' },
      ],
      { db, logger: silentLogger(), source: 'test', geocode },
    );
    expect(report.importedIds).toEqual(['a']);
    expect(getPermitRecord(db, 'a')?.location_source).toBe('census_geocoder');
    expect(report.rejected[0]!.messages.join()).toContain('could not be geocoded');
  });

  it('upserts on re-import and keeps missing values as null (never invented)', async () => {
    const db = testDb();
    await importRows([validRow], { db, logger: silentLogger(), source: 'test' });
    const { max_hours_per_year: _h, comment_deadline: _d, ...partial } = validRow;
    await importRows([{ ...partial, company: 'Renamed LLC' }], { db, logger: silentLogger(), source: 'test' });
    const permit = toPermit(getPermitRecord(db, 'p-1')!);
    expect(permit.company).toBe('Renamed LLC');
    expect(permit.maxHoursPerYear).toBeNull();
    expect(permit.commentDeadline).toBeNull();
    expect(listPermitRecords(db)).toHaveLength(1);
  });

  it('loads the bundled SAMPLE dataset cleanly and flags every row as sample', async () => {
    const db = testDb();
    const rows = readDatasetFile('data/sample-permits.json');
    const report = await importRows(rows, { db, logger: silentLogger(), source: 'sample' });
    expect(report.total).toBe(5);
    expect(report.imported).toBe(5);
    expect(report.rejected).toEqual([]);
    const permits = listPermitRecords(db).map(toPermit);
    expect(permits.every((p) => p.isSample)).toBe(true);
    expect(permits.every((p) => p.company.startsWith('[SAMPLE]'))).toBe(true);
    const unknown = permits.find((p) => p.id === 'sample-005')!;
    expect(unknown.permitType).toBe('unknown');
    expect(unknown.maxProductionCydPerHr).toBeNull();
  });
});
