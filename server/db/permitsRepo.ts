import { z } from 'zod';
import type { LocationSource, Permit, PermitCategory, PermitType } from '../../shared/permit.js';
import type { DB } from './index.js';

export interface PermitRecord {
  id: string;
  registration_number: string;
  company: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  lat: number;
  lng: number;
  location_source: LocationSource;
  permit_type: PermitType;
  max_production_cyd_per_hr: number | null;
  max_hours_per_year: number | null;
  pollutants_json: string;
  controls: string | null;
  notice_type: string | null;
  notice_issuance_date: string | null;
  comment_deadline: string | null;
  public_meeting_date: string | null;
  source_url: string;
  raw_text: string;
  is_sample: 0 | 1;
  category: PermitCategory;
  facility_name: string | null;
  content_hash: string;
  imported_at: string;
}

const pollutantsSchema = z.array(z.string());

export function toPermit(record: PermitRecord): Permit {
  let pollutants: string[] = [];
  try {
    pollutants = pollutantsSchema.parse(JSON.parse(record.pollutants_json));
  } catch {
    pollutants = [];
  }
  return {
    id: record.id,
    registrationNumber: record.registration_number,
    company: record.company,
    address: record.address,
    city: record.city,
    county: record.county,
    zip: record.zip,
    lat: record.lat,
    lng: record.lng,
    locationSource: record.location_source,
    permitType: record.permit_type,
    maxProductionCydPerHr: record.max_production_cyd_per_hr,
    maxHoursPerYear: record.max_hours_per_year,
    pollutants,
    controls: record.controls,
    noticeType: record.notice_type,
    noticeIssuanceDate: record.notice_issuance_date,
    commentDeadline: record.comment_deadline,
    publicMeetingDate: record.public_meeting_date,
    sourceUrl: record.source_url,
    isSample: record.is_sample === 1,
    category: record.category,
    facilityName: record.facility_name,
  };
}

export function upsertPermit(db: DB, record: PermitRecord): void {
  db.prepare(
    `INSERT INTO permits (
       id, registration_number, company, address, city, county, zip, lat, lng, location_source,
       permit_type, max_production_cyd_per_hr, max_hours_per_year, pollutants_json, controls,
       notice_type, notice_issuance_date, comment_deadline, public_meeting_date, source_url,
       raw_text, is_sample, category, facility_name, content_hash, imported_at
     ) VALUES (
       @id, @registration_number, @company, @address, @city, @county, @zip, @lat, @lng, @location_source,
       @permit_type, @max_production_cyd_per_hr, @max_hours_per_year, @pollutants_json, @controls,
       @notice_type, @notice_issuance_date, @comment_deadline, @public_meeting_date, @source_url,
       @raw_text, @is_sample, @category, @facility_name, @content_hash, @imported_at
     )
     ON CONFLICT (id) DO UPDATE SET
       registration_number = excluded.registration_number,
       company = excluded.company,
       address = excluded.address,
       city = excluded.city,
       county = excluded.county,
       zip = excluded.zip,
       lat = excluded.lat,
       lng = excluded.lng,
       location_source = excluded.location_source,
       permit_type = excluded.permit_type,
       max_production_cyd_per_hr = excluded.max_production_cyd_per_hr,
       max_hours_per_year = excluded.max_hours_per_year,
       pollutants_json = excluded.pollutants_json,
       controls = excluded.controls,
       notice_type = excluded.notice_type,
       notice_issuance_date = excluded.notice_issuance_date,
       comment_deadline = excluded.comment_deadline,
       public_meeting_date = excluded.public_meeting_date,
       source_url = excluded.source_url,
       raw_text = excluded.raw_text,
       is_sample = excluded.is_sample,
       category = excluded.category,
       facility_name = excluded.facility_name,
       content_hash = excluded.content_hash,
       imported_at = excluded.imported_at`,
  ).run(record);
}

export function getPermitRecord(db: DB, id: string): PermitRecord | undefined {
  return db.prepare('SELECT * FROM permits WHERE id = ?').get(id) as PermitRecord | undefined;
}

export function listPermitRecords(db: DB): PermitRecord[] {
  return db.prepare('SELECT * FROM permits ORDER BY id').all() as PermitRecord[];
}

/** Coarse bounding-box prefilter; callers refine with haversine distance. */
export function listPermitRecordsInBox(
  db: DB,
  box: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): PermitRecord[] {
  return db
    .prepare('SELECT * FROM permits WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?')
    .all(box.minLat, box.maxLat, box.minLng, box.maxLng) as PermitRecord[];
}

export function countPermits(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM permits').get() as { n: number };
  return row.n;
}

export function deleteSamplePermits(db: DB): number {
  return db.prepare('DELETE FROM permits WHERE is_sample = 1').run().changes;
}
