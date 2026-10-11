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

/**
 * Adapter for the scraper's sites file (data/sites.json):
 *   { generatedAt, count, categories, sites: [{ id, category, name, operator, address, city, county,
 *     zip, lat, lng, status, sourceUrl, source, notes, details: { permitNumber, permitType, ... } }] }
 * Only categories that are TCEQ permits become permit rows; the other site categories (landfills,
 * roads, Superfund sites...) don't fit the permit model and are skipped.
 */
export interface SitesFile {
  generatedAt?: string;
  sites: unknown[];
}

export const PERMIT_SITE_CATEGORIES = ['concrete_batch_plant', 'pending_air_permit'] as const;

export function isSitesFile(value: unknown): value is SitesFile {
  if (!value || typeof value !== 'object') return false;
  return Array.isArray((value as { sites?: unknown }).sites);
}

/** "particulate matter, sulfur dioxide and nitrogen oxides" -> ["particulate matter", "sulfur dioxide", "nitrogen oxides"] */
function splitContaminants(text: unknown): string[] {
  const s = str(text);
  if (!s) return [];
  return s
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length <= 120);
}

/** A facility name worth showing: not a generic label like "CONCRETE BATCH PLANT" and not just the operator again. */
export function facilityName(name: unknown, operator: unknown): string | undefined {
  const n = str(name);
  if (!n || /^(concrete batch plant|standard permit|change of representations|existing relocation)\b/i.test(n)) return undefined;
  return n.toLowerCase() === str(operator)?.toLowerCase() ? undefined : n;
}

export function adaptSites(file: SitesFile): unknown[] {
  return file.sites.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [raw];
    const s = raw as Record<string, unknown>;
    if (!(PERMIT_SITE_CATEGORIES as readonly unknown[]).includes(s.category)) return [];
    const d = (s.details && typeof s.details === 'object' ? s.details : {}) as Record<string, unknown>;
    const flat = {
      permitNumber: d.permitNumber,
      operator: s.operator,
      name: s.name,
      address: s.address,
      city: s.city,
      county: s.county,
      status: s.status,
      permitType: d.permitType,
      dateReceived: d.dateReceived,
      productionRate: d.productionRate,
      notes: [str(d.airContaminants) ? `Air contaminants listed in the notice: ${str(d.airContaminants)}.` : null, str(s.notes)]
        .filter(Boolean)
        .join(' '),
    };
    return [
      {
        id: s.id,
        registration_number: d.permitNumber,
        company: s.operator,
        address: s.address,
        city: s.city,
        county: s.county,
        zip: s.zip ?? '',
        lat: s.lat,
        lng: s.lng,
        permit_type: d.permitType ?? '',
        max_production_cyd_per_hr: parseProductionRate(d.productionRate),
        pollutants: splitContaminants(d.airContaminants),
        comment_deadline: d.commentDeadline ?? undefined,
        source_url: str(s.sourceUrl) ?? TCEQ_LINKS.airPermitSearch,
        raw_text: recordText(flat, str(s.source)),
        is_sample: false,
        category: s.category === 'concrete_batch_plant' ? 'concrete_batch_plant' : 'air_permit',
        facility_name: facilityName(s.name, s.operator),
      },
    ];
  });
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
    category: 'concrete_batch_plant',
    facility_name: facilityName(p.name, p.operator),
  });
  });
}
