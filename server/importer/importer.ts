import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseCsvSync } from 'csv-parse/sync';
import type { LocationSource } from '../../shared/permit.js';
import { nowIso, type DB } from '../db/index.js';
import { upsertPermit, type PermitRecord } from '../db/permitsRepo.js';
import { adaptSites, adaptTceqScrape, isSitesFile, isTceqScrape } from './adapters.js';
import type { Logger } from '../lib/logger.js';
import { isInTexasBounds } from '../../shared/geo.js';
import { normalizePermitType, OPTIONAL_FIELDS, RowSchema, type PermitRow } from './rowSchema.js';

export interface GeocodedPoint {
  lat: number;
  lng: number;
  source: Exclude<LocationSource, 'dataset'>;
}

/** Resolves a street address to coordinates, or null if it can't. Injected so tests stay offline. */
export type GeocodeFn = (input: { address: string; city: string; zip: string }) => Promise<GeocodedPoint | null>;

export interface RowIssue {
  rowNumber: number;
  rowId?: string;
  messages: string[];
}

export interface ImportReport {
  runId: number;
  source: string;
  total: number;
  imported: number;
  importedIds: string[];
  rejected: RowIssue[];
  warnings: RowIssue[];
}

export type RowValidation = { ok: true; row: PermitRow; warnings: string[] } | { ok: false; errors: string[] };

/** Lower-cases keys and turns spaces/hyphens into underscores so "Max Hours Per Year" matches. */
export function normalizeKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.trim().toLowerCase().replace(/[\s-]+/g, '_')] = value;
  }
  return out;
}

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  const field = issue.path.map(String).join('.') || 'row';
  return `${field}: ${issue.message}`;
}

/** Validates one raw row. Never throws. */
export function validateRow(raw: unknown): RowValidation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['row: must be an object'] };
  }
  const input = normalizeKeys(raw as Record<string, unknown>);
  const warnings: string[] = [];

  const hasValue = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
  if (!hasValue(input.id) && hasValue(input.registration_number)) {
    input.id = `reg-${String(input.registration_number).trim()}`;
    warnings.push(`id: missing; derived "${String(input.id)}" from registration_number`);
  }

  const permitType = normalizePermitType(input.permit_type);
  if (!permitType.recognized) {
    warnings.push('permit_type: unrecognized value; stored as "unknown"');
  }

  let result = RowSchema.safeParse(input);
  if (!result.success) {
    const fatal = result.error.issues.filter((i) => !OPTIONAL_FIELDS.has(String(i.path[0])));
    if (fatal.length > 0) {
      return { ok: false, errors: fatal.map(formatIssue) };
    }
    // Only optional fields are bad: drop them (shown as "Not listed") and keep the row.
    for (const issue of result.error.issues) {
      const field = String(issue.path[0]);
      delete input[field];
      warnings.push(`${formatIssue(issue)} (field cleared)`);
    }
    result = RowSchema.safeParse(input);
    if (!result.success) {
      return { ok: false, errors: result.error.issues.map(formatIssue) };
    }
  }

  const row = { ...result.data };
  const hasLat = row.lat !== undefined;
  const hasLng = row.lng !== undefined;
  if (hasLat !== hasLng) {
    warnings.push('lat/lng: only one coordinate given; both cleared and the address will be geocoded');
    delete row.lat;
    delete row.lng;
  } else if (hasLat && hasLng) {
    if (!isInTexasBounds({ lat: row.lat!, lng: row.lng! })) {
      warnings.push('lat/lng: outside Texas (swapped?); cleared and the address will be geocoded');
      delete row.lat;
      delete row.lng;
    }
  }

  return { ok: true, row, warnings };
}

export function contentHash(row: PermitRow): string {
  const canonical = JSON.stringify(row, Object.keys(row).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

export function toRecord(row: PermitRow, location: { lat: number; lng: number; source: LocationSource }): PermitRecord {
  return {
    id: row.id,
    registration_number: row.registration_number,
    company: row.company,
    address: row.address,
    city: row.city,
    county: row.county,
    zip: row.zip,
    lat: location.lat,
    lng: location.lng,
    location_source: location.source,
    permit_type: row.permit_type,
    max_production_cyd_per_hr: row.max_production_cyd_per_hr ?? null,
    max_hours_per_year: row.max_hours_per_year ?? null,
    pollutants_json: JSON.stringify(row.pollutants),
    controls: row.controls ?? null,
    notice_type: row.notice_type ?? null,
    notice_issuance_date: row.notice_issuance_date ?? null,
    comment_deadline: row.comment_deadline ?? null,
    public_meeting_date: row.public_meeting_date ?? null,
    source_url: row.source_url,
    raw_text: row.raw_text,
    is_sample: row.is_sample ? 1 : 0,
    category: row.category,
    facility_name: row.facility_name ?? null,
    content_hash: contentHash(row),
    imported_at: nowIso(),
  };
}

export function parseCsv(text: string): Record<string, string>[] {
  return parseCsvSync(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

/** Reads a dataset file: a JSON array, a JSON object with a `permits` array, or a CSV with a header row. */
export function readDatasetFile(path: string): unknown[] {
  const text = readFileSync(path, 'utf8');
  const ext = extname(path).toLowerCase();
  if (ext === '.csv') return parseCsv(text);
  if (ext !== '.json') throw new Error(`Unsupported dataset file type "${ext}" (use .json or .csv)`);
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (isTceqScrape(parsed)) return adaptTceqScrape(parsed);
  if (isSitesFile(parsed)) return adaptSites(parsed);
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { permits?: unknown }).permits)) {
    return (parsed as { permits: unknown[] }).permits;
  }
  throw new Error('JSON dataset must be an array of rows or an object with a "permits", "plants" or "sites" array');
}

export interface ImportOptions {
  db: DB;
  logger: Logger;
  source: string;
  geocode?: GeocodeFn;
}

/**
 * Validates and stores rows. Bad rows are rejected and logged (to the DB and the logger);
 * the import itself never throws because of row content.
 */
export async function importRows(rows: unknown[], options: ImportOptions): Promise<ImportReport> {
  const { db, logger, source, geocode } = options;
  const runId = Number(
    db.prepare('INSERT INTO import_runs (source, started_at, total_rows) VALUES (?, ?, ?)').run(source, nowIso(), rows.length)
      .lastInsertRowid,
  );

  const rejected: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const ready: PermitRecord[] = [];
  const seenIds = new Set<string>();

  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 1;
    const validation = validateRow(raw);
    if (!validation.ok) {
      rejected.push({ rowNumber, messages: validation.errors });
      continue;
    }
    const { row } = validation;
    const rowWarnings = [...validation.warnings];

    if (seenIds.has(row.id)) {
      rejected.push({ rowNumber, rowId: row.id, messages: [`id: duplicate "${row.id}" (an earlier row has the same id)`] });
      continue;
    }

    let location: { lat: number; lng: number; source: LocationSource } | null = null;
    if (row.lat !== undefined && row.lng !== undefined) {
      location = { lat: row.lat, lng: row.lng, source: 'dataset' };
    } else if (geocode) {
      try {
        location = await geocode({ address: row.address, city: row.city, zip: row.zip });
      } catch (error) {
        logger.warn({ err: error, rowNumber }, 'geocoding failed during import');
      }
      if (location) rowWarnings.push(`lat/lng: missing; located via ${location.source}`);
    }
    if (location && (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || !isInTexasBounds(location))) {
      location = null;
    }
    if (!location) {
      rejected.push({
        rowNumber,
        rowId: row.id,
        messages: ['lat/lng: missing and the address could not be geocoded'],
      });
      continue;
    }

    seenIds.add(row.id);
    ready.push(toRecord(row, location));
    if (rowWarnings.length > 0) warnings.push({ rowNumber, rowId: row.id, messages: rowWarnings });
  }

  const insertIssue = db.prepare(
    'INSERT INTO import_issues (run_id, row_number, row_id, severity, messages_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    for (const record of ready) upsertPermit(db, record);
    const at = nowIso();
    for (const issue of rejected) {
      insertIssue.run(runId, issue.rowNumber, issue.rowId ?? null, 'rejected', JSON.stringify(issue.messages), at);
    }
    for (const issue of warnings) {
      insertIssue.run(runId, issue.rowNumber, issue.rowId ?? null, 'warning', JSON.stringify(issue.messages), at);
    }
    db.prepare('UPDATE import_runs SET finished_at = ?, imported = ?, rejected = ?, warnings = ? WHERE id = ?').run(
      nowIso(),
      ready.length,
      rejected.length,
      warnings.length,
      runId,
    );
  })();

  for (const issue of rejected) {
    logger.warn({ rowNumber: issue.rowNumber, rowId: issue.rowId, problems: issue.messages }, 'import: row rejected');
  }
  logger.info(
    { source, total: rows.length, imported: ready.length, rejected: rejected.length, warnings: warnings.length },
    'import finished',
  );

  return {
    runId,
    source,
    total: rows.length,
    imported: ready.length,
    importedIds: ready.map((r) => r.id),
    rejected,
    warnings,
  };
}
