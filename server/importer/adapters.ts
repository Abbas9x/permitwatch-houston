import { TCEQ_LINKS } from '../../shared/permit.js';

/**
 * Adapter for the team's TCEQ scrape file:
 *   { generatedAt, source, count, plants: [{ id, permitNumber, operator, name, address, city, county,
 *     zip, lat, lng, status, permitType, dateReceived, commentDeadline, productionRate, emissions,
 *     noticeUrl, notes, ... }] }
 * Maps fields 1:1 onto the importer's row format. Nothing is inferred: values that are not in the
 * file stay empty and the UI shows "Not listed in notice – check TCEQ".
 */
export interface TceqScrapeFile {
  generatedAt?: string;
  source?: unknown;
  plants: unknown[];
}

export function isTceqScrape(value: unknown): value is TceqScrapeFile {
  if (!value || typeof value !== 'object') return false;
  const plants = (value as { plants?: unknown }).plants;
  return Array.isArray(plants);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** "150 cubic yards per hour" -> 150; "less than 200 cubic yards per hour" -> 200 (an upper bound, kept verbatim in the record text). */
export function parseProductionRate(text: unknown): number | undefined {
  const s = str(text);
  if (!s) return undefined;
  const m = /(?:^|\s)([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*cubic\s+yards?\s+(?:per|an|\/)\s*hour/i.exec(s);
  const rate = m ? Number(m[1]!.replace(/,/g, '')) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/** The source pages named in the file's own `source` description. */
function sourcePages(source: string | undefined) {
  const urls = source?.match(/https?:\/\/[^\s)]+/g) ?? [];
  return {
    pending: urls.find((u) => /pending/i.test(u)) ?? TCEQ_LINKS.airPermitSearch,
    search: urls.find((u) => /airperm/i.test(u)) ?? TCEQ_LINKS.airPermitSearch,
  };
}

function recordText(p: Record<string, unknown>, sourceDescription: string | undefined): string {
  const lines = [
    'Dataset record compiled from TCEQ public data (this is not the full text of a public notice).',
    `Permit number: ${String(p.permitNumber)}.`,
    `Operator: ${str(p.operator) ?? 'not listed'}.`,
    str(p.name) ? `Plant or registration name: ${str(p.name)}.` : null,
    `Address: ${[str(p.address), str(p.city), str(p.county) ? `${str(p.county)} County` : null].filter(Boolean).join(', ')}.`,
    str(p.status) ? `Status in dataset: ${str(p.status)}.` : null,
    str(p.permitType) ? `Permit type in dataset: ${str(p.permitType)}.` : 'Permit type: not listed.',
    str(p.dateReceived) ? `Application received by TCEQ: ${str(p.dateReceived)}.` : null,
    str(p.productionRate) ? `Production rate as listed: ${str(p.productionRate)}.` : 'Production rate: not listed.',
    str(p.notes) ? `Notes: ${str(p.notes)}` : null,
    sourceDescription ? `Source: ${sourceDescription}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

export function adaptTceqScrape(file: TceqScrapeFile): unknown[] {
  const source = str(file.source);
  const pages = sourcePages(source);
  return file.plants.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const p = raw as Record<string, unknown>;
    return ({
    id: p.id,
    registration_number: p.permitNumber,
    company: p.operator,
    address: p.address,
    city: p.city,
    county: p.county,
    zip: p.zip ?? '',
    lat: p.lat,
    lng: p.lng,
    permit_type: p.permitType ?? '',
    max_production_cyd_per_hr: parseProductionRate(p.productionRate),
    pollutants: Array.isArray(p.emissions) ? p.emissions.map(e => e && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string,unknown>).pollutant : e) : [],
    comment_deadline: p.commentDeadline ?? undefined,
    // Rows without their own notice link point to the TCEQ page the record came from.
    source_url: str(p.noticeUrl) ?? (p.status === 'pending' ? pages.pending : pages.search),
    raw_text: recordText(p, source),
    is_sample: false,
  });
  });
}
