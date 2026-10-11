import { z } from 'zod';
import { PERMIT_ID_PATTERN } from '../../shared/validation.js';
import { PERMIT_CATEGORIES, PERMIT_STATUSES, type PermitType } from '../../shared/permit.js';

export { TEXAS_BOUNDS } from '../../shared/geo.js';

/**
 * Validation for one row of the teammate-provided permit dataset (JSON or CSV).
 * Lenient about formatting (numbers as strings, ZIP+4, US dates), strict about meaning:
 * nothing is guessed. A bad optional field becomes null plus a warning; a bad required
 * field rejects the whole row.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function cleanString(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return value;
  return value.replace(CONTROL_CHARS, '').trim();
}

const requiredText = (max: number) => z.preprocess(cleanString, z.string().min(1, 'is required').max(max));

const optionalText = (max: number) =>
  z.preprocess((v) => (isBlank(v) ? undefined : cleanString(v)), z.string().max(max).optional());

const optionalNumber = (label: string, max: number) =>
  z.preprocess(
    (v) => {
      if (isBlank(v)) return undefined;
      if (typeof v === 'string') {
        const n = Number(v.replace(/,/g, '').trim());
        return Number.isFinite(n) ? n : v;
      }
      return v;
    },
    z
      .number({ error: `${label} must be a number` })
      .positive(`${label} must be greater than 0`)
      .max(max, `${label} must be at most ${max}`)
      .optional(),
  );

const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      if (isBlank(v)) return undefined;
      if (typeof v === 'string') {
        const n = Number(v.trim());
        return Number.isFinite(n) ? n : v;
      }
      return v;
    },
    z.number().min(min).max(max).optional(),
  );

/** Accepts YYYY-MM-DD, an ISO timestamp, or M/D/YYYY; outputs YYYY-MM-DD. */
export function normalizeDate(value: unknown): unknown {
  if (isBlank(value)) return undefined;
  if (typeof value !== 'string') return value;
  const v = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (us) return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  return v;
}

export function isRealCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const optionalDate = z.preprocess(
  normalizeDate,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-31')
    .refine(isRealCalendarDate, 'is not a real calendar date')
    .optional(),
);

export function normalizePermitType(value: unknown): { type: PermitType; recognized: boolean } {
  if (isBlank(value) || typeof value !== 'string') return { type: 'unknown', recognized: isBlank(value) };
  const v = value.trim().toLowerCase();
  if (v === 'unknown') return { type: 'unknown', recognized: true };
  if (v.includes('renew')) return { type: 'renewal', recognized: true };
  if (v.includes('amend') || v.includes('modif')) return { type: 'amendment', recognized: true };
  if (v === 'new' || v.startsWith('new ') || v.includes('initial')) return { type: 'new', recognized: true };
  return { type: 'unknown', recognized: false };
}

export function normalizePollutants(value: unknown): unknown {
  if (isBlank(value)) return [];
  let items: unknown[];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === 'string') {
    const v = value.trim();
    if (v.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(v);
        if (!Array.isArray(parsed)) return value;
        items = parsed;
      } catch {
        return value;
      }
    } else {
      const separator = /[;|\n]/.test(v) ? /[;|\n]/ : /,/;
      items = v.split(separator);
    }
  } else {
    return value;
  }
  const cleaned = items.map(cleanString).filter((s): s is string => typeof s === 'string' && s.length > 0);
  return [...new Set(cleaned)];
}

function normalizeZip(value: unknown): unknown {
  if (typeof value === 'number' && Number.isInteger(value)) return String(value).padStart(5, '0');
  if (typeof value !== 'string') return value;
  const m = /^(\d{5})(?:-\d{4})?$/.exec(value.trim());
  return m ? m[1] : value.trim();
}

export const RowSchema = z.object({
  id: requiredText(64).pipe(z.string().regex(PERMIT_ID_PATTERN, 'must use letters, numbers, dots, underscores, or hyphens')),
  registration_number: requiredText(32),
  company: requiredText(200),
  address: requiredText(300),
  city: requiredText(100),
  county: requiredText(100),
  // Optional: many TCEQ records omit it. Empty means "not listed"; anything present must be 5 digits.
  zip: z.preprocess((v) => (isBlank(v) ? '' : normalizeZip(v)), z.string().regex(/^(\d{5})?$/, 'must be a 5-digit ZIP code')),
  lat: optionalCoordinate(-90, 90),
  lng: optionalCoordinate(-180, 180),
  permit_type: z.preprocess((v) => normalizePermitType(v).type, z.enum(['new', 'renewal', 'amendment', 'unknown'])),
  max_production_cyd_per_hr: optionalNumber('max_production_cyd_per_hr', 10_000),
  max_hours_per_year: optionalNumber('max_hours_per_year', 8_784),
  pollutants: z.preprocess(normalizePollutants, z.array(z.string().max(120)).max(30)),
  controls: optionalText(4_000),
  notice_type: optionalText(300),
  notice_issuance_date: optionalDate,
  comment_deadline: optionalDate,
  public_meeting_date: optionalDate,
  source_url: z.preprocess(
    cleanString,
    z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' }).max(2_000),
  ),
  raw_text: z.preprocess((v) => (isBlank(v) ? '' : cleanString(v)), z.string().max(100_000)),
  is_sample: z.preprocess(
    (v) => v === true || v === 1 || (typeof v === 'string' && ['true', '1', 'yes'].includes(v.trim().toLowerCase())),
    z.boolean(),
  ),
  // Older datasets were concrete-only, so a missing category means concrete. Unknown values reject the row.
  category: z.preprocess(
    (v) => (isBlank(v) ? 'concrete_batch_plant' : v === 'pending_air_permit' ? 'air_permit' : v),
    z.enum(PERMIT_CATEGORIES, { error: 'must be a supported permit category' }),
  ),
  facility_name: optionalText(200),
  permit_status: z.preprocess(v => isBlank(v) ? 'unknown' : v, z.enum(PERMIT_STATUSES)),
  source_status: optionalText(200),
  operator_name: optionalText(200),
  permittee_name: optionalText(200),
  data_source: optionalText(500),
  retrieved_at: z.preprocess(v => isBlank(v) ? undefined : v, z.iso.datetime().optional()),
  application_date: optionalDate,
  notice_url: z.preprocess(v => isBlank(v) ? undefined : v, z.url({protocol: /^https$/}).max(2000).optional()),
  location_notes: optionalText(2000),
});

export type PermitRow = z.infer<typeof RowSchema>;

/** Fields whose failure nulls the field (with a warning) instead of rejecting the row. */
export const OPTIONAL_FIELDS = new Set<string>([
  'lat',
  'lng',
  'max_production_cyd_per_hr',
  'max_hours_per_year',
  'pollutants',
  'controls',
  'notice_type',
  'notice_issuance_date',
  'comment_deadline',
  'public_meeting_date',
  'raw_text',
  'facility_name', 'source_status', 'operator_name', 'permittee_name', 'data_source', 'retrieved_at', 'application_date', 'notice_url', 'location_notes',
]);
