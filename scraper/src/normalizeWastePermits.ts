import { REGION_COUNTIES, inRegionBbox } from './region.js';

export const MSW_GIS_URL = 'https://gisweb.tceq.texas.gov/arcgis/rest/services/WP/MSW_FACILITIES_VIEWER/MapServer';
export const MSW_XLS_URL = 'https://www.tceq.texas.gov/assets/public/permitting/waste/msw/msw-facilities-texas.xls';
export const WASTE_DATA_SOURCE = 'TCEQ Municipal Solid Waste GIS viewer joined to the current MSW authorization spreadsheet';

export interface WasteGisFeature {
  layerId: number;
  retrievedAt?: string;
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number };
}
export type WasteAuthorization = Record<string, unknown>;

export interface WastePermitRow {
  id: string;
  registration_number: string;
  category: 'solid_waste_permit';
  company: string;
  facility_name: string;
  operator_name: null;
  permittee_name: null;
  address: string;
  city: string;
  county: string;
  zip: string;
  lat: number;
  lng: number;
  permit_type: 'unknown';
  permit_status: 'issued' | 'pending' | 'unknown';
  source_status: string | null;
  data_source: string;
  retrieved_at: string;
  source_url: string;
  location_notes: string;
  pollutants: string[];
  raw_text: string;
  is_sample: false;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  return cleaned && !/^(?:N\/A|NULL|NOT AVAILABLE|-9999)$/i.test(cleaned) ? cleaned : null;
}

/** Only the number range documented as permits in TCEQ GI-613 is admitted. */
export function normalizeWastePermits(
  features: WasteGisFeature[],
  authorizations: WasteAuthorization[],
  retrievedAt: string,
): { permits: WastePermitRow[]; exclusions: Record<string, number> } {
  const byNumber = new Map<string, WasteAuthorization[]>();
  for (const row of authorizations) {
    const id = text(row['Additional ID'])?.toUpperCase();
    if (!id) continue;
    const existing = byNumber.get(id) ?? [];
    existing.push(row);
    byNumber.set(id, existing);
  }
  const permits: WastePermitRow[] = [];
  const exclusions: Record<string, number> = {};
  const reject = (reason: string) => { exclusions[reason] = (exclusions[reason] ?? 0) + 1; };
  const seen = new Set<string>();
  const counties = new Map(Object.keys(REGION_COUNTIES).map((name) => [name.toUpperCase(), name]));
  for (const feature of features) {
    const attributes = feature.attributes;
    const number = text(attributes.PERMIT_NUM)?.toUpperCase();
    const match = number?.match(/^([1-9]\d{0,3})[A-Z]?$/);
    if (!number || !match || Number(match[1]) > 8999) { reject('not_a_permit'); continue; }
    const rows = byNumber.get(number);
    if (!rows?.length) { reject('missing_authorization'); continue; }
    if (rows.length !== 1) { reject('ambiguous_authorization'); continue; }
    const row = rows[0]!;
    const rn = text(row.RN);
    if (!rn || rn !== text(attributes.REGULATED_)) { reject('entity_mismatch'); continue; }
    const physicalType = text(row['Physical Type']);
    if ((feature.layerId !== 7 && feature.layerId !== 8)
      || (feature.layerId === 7 && !['1', '1AE', '4', '4AE', '1 AE & 4 AE'].includes(physicalType ?? ''))
      || (feature.layerId === 8 && physicalType !== '5TS')) { reject('unexpected_facility_type'); continue; }
    const name = text(row['Site Name']);
    if (!name) { reject('missing_facility_name'); continue; }
    const addressLine = text(row['Phys Addr Line 1']);
    const city = text(row['Phys Addr City']);
    const county = counties.get(text(row.County)?.toUpperCase() ?? '');
    if (!addressLine || !city || !county) { reject('missing_physical_location'); continue; }
    const lat = feature.geometry ? feature.geometry.y : attributes.LATITUDE;
    const lng = feature.geometry ? feature.geometry.x : attributes.LONGITUDE;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat)
      || !Number.isFinite(lng) || !inRegionBbox(lat, lng)) { reject('unusable_coordinates'); continue; }
    if (seen.has(number)) { reject('duplicate_permit'); continue; }
    seen.add(number);
    const sourceStatus = text(row['Legal Status']);
    const legalStatus = sourceStatus?.toUpperCase();
    const address = [addressLine, text(row['Phys Addr Line 2'])].filter(Boolean).join(' ');
    const sourceUrl = `${MSW_GIS_URL}/${feature.layerId}/query?${new URLSearchParams({
      where: `PERMIT_NUM = '${number}'`, outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'pjson',
    })}`;
    permits.push({
      id: `tceq-waste-${number}`, registration_number: number, category: 'solid_waste_permit',
      company: name, facility_name: name, operator_name: null, permittee_name: null,
      address, city, county, zip: text(row['Phys Addr Zip'])?.match(/^\d{5}/)?.[0] ?? '',
      lat, lng, permit_type: 'unknown',
      permit_status: legalStatus === 'ISSUED' ? 'issued' : legalStatus === 'PENDING' ? 'pending' : 'unknown',
      source_status: sourceStatus, data_source: WASTE_DATA_SOURCE, retrieved_at: feature.retrievedAt ?? retrievedAt, source_url: sourceUrl,
      location_notes: 'Official TCEQ GIS facility representative point; survey method and coordinate precision are unknown. Physical address comes from the MSW authorization spreadsheet. Facility ACTIVE status does not verify that it is operating today.',
      pollutants: [],
      raw_text: JSON.stringify({
        authorizationNumber: number, regulatedEntityNumber: rn, physicalType,
        legalStatus: sourceStatus, legalStatusDate: text(row['Legal Status Date']),
        physicalSiteStatus: text(row['Physical Site Status']),
        coordinateSource: `${MSW_GIS_URL}/${feature.layerId}`, coordinateMethod: text(attributes.HORZ_METH),
        coordinateAccuracy: text(attributes.HORZ_ACC), authorizationSource: MSW_XLS_URL,
        authorizationNumberGuide: 'https://www.tceq.texas.gov/downloads/permitting/waste-permits/publications/gi-613-description-of-fields-msw-data-files.pdf',
      }),
      is_sample: false,
    });
  }
  permits.sort((a, b) => a.id.localeCompare(b.id));
  return { permits, exclusions };
}
