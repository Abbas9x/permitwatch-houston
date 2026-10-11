import { REGION_COUNTIES, inRegionBbox } from './region.js';

export type WaterPermitStatus = 'effective' | 'administratively_continued' | 'expired' | 'pending' | 'issued' | 'unknown';
export interface WaterPermit {
  id: string;
  registration_number: string;
  category: 'wastewater_permit';
  company: string;
  facility_name: string;
  operator_name: null;
  permittee_name: string | null;
  address: string;
  city: string;
  county: string;
  zip: string;
  lat: number;
  lng: number;
  permit_type: 'unknown';
  permit_status: WaterPermitStatus;
  source_status: string | null;
  data_source: string;
  retrieved_at: string;
  source_url: string;
  location_notes: string;
  pollutants: string[];
  raw_text: string;
  is_sample: false;
}

const text = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).replace(/\s+/g, ' ').trim();
  return !result || /^(NOT AVAILABLE|N\/A|NA|NULL|-999999|-9999)$/i.test(result) ? null : result;
};
const number = (value: unknown): number | null => {
  const input = text(value);
  if (!input) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > -9999 ? parsed : null;
};
const counties = new Map(Object.keys(REGION_COUNTIES).map((county) => [county.toUpperCase(), county]));
const statuses: Record<string, WaterPermitStatus> = {
  effective: 'effective', 'admin continued': 'administratively_continued',
  'administratively continued': 'administratively_continued', expired: 'expired', pending: 'pending', issued: 'issued',
};

/** Normalize actual NPDES permits. Facility activity is deliberately not a permit lifecycle status. */
export function normalizeWaterPermits(rows: Record<string, unknown>[], retrievedAt: string): { permits: WaterPermit[]; excluded: Record<string, number> } {
  const permits: WaterPermit[] = [];
  const excluded: Record<string, number> = {};
  const seen = new Set<string>();
  const reject = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  for (const row of rows) {
    const permitId = text(row.SourceID);
    if (!permitId || !/^TX0\d{6}$/.test(permitId)) { reject('not_individual_wastewater_id'); continue; }
    if (text(row.CWPPermitTypeDesc) !== 'NPDES Individual Permit') { reject('not_individual_permit'); continue; }
    const facility = text(row.CWPName);
    const address = text(row.CWPStreet);
    const city = text(row.CWPCity);
    const rawCounty = text(row.CWPCounty);
    const county = rawCounty ? counties.get(rawCounty.toUpperCase().replace(/\s+COUNTY$/, '').trim()) : undefined;
    if (!facility) { reject('missing_facility_name'); continue; }
    if (!address) { reject('missing_address'); continue; }
    if (!city) { reject('missing_city'); continue; }
    if (!rawCounty) { reject('missing_county'); continue; }
    if (!county) { reject('outside_region_county'); continue; }
    const lat = number(row.FacLat);
    const lng = number(row.FacLong);
    if (lat === null || lng === null) { reject('missing_coordinates'); continue; }
    if (!inRegionBbox(lat, lng)) { reject('outside_region_coordinates'); continue; }
    const accuracy = number(row.CalculatedAccuracyMeters);
    if (accuracy !== null && accuracy > 1000) { reject('coarse_coordinates'); continue; }
    const reference = text(row.ReferencePoint);
    if (reference && /MAILING|POSTAL ADDRESS|CORRESPONDENCE|HEADQUARTERS/i.test(reference)) { reject('mailing_coordinates'); continue; }
    const registryId = text(row.RegistryID);
    if (!registryId || !/^\d{12}$/.test(registryId)) { reject('missing_report_identifier'); continue; }
    if (seen.has(permitId)) { reject('duplicate_permit'); continue; }
    seen.add(permitId);
    const permittee = text(row.PermitName);
    const sourceStatus = text(row.CWPPermitStatusDesc);
    const method = text(row.CollectionMethod);
    const zip = text(row.CWPZip)?.match(/^\d{5}/)?.[0];
    const metadata = [
      ['NPDES permit', permitId], ['Program permit classification', text(row.CWPPermitTypeDesc)],
      ['Facility', facility], ['Permittee', permittee], ['Source permit status', sourceStatus],
      ['Source status code', text(row.CWPPermitStatusCode)], ['Other/state permit IDs', text(row.OtherPermitIDs)],
      ['Permit issue date (source format)', text(row.CWPIssueDate)],
      ['Permit effective date (source format)', text(row.CWPEffectiveDate)],
      ['Permit expiration date (source format)', text(row.CWPExpirationDate)],
      ['Permit termination date (source format)', text(row.CWPTerminationDate)],
      ['Permit components', text(row.PermitComponents)], ['Permitting agency', text(row.PermittingAgency)],
    ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n');
    permits.push({
      id: `epa-water-${permitId}`, registration_number: permitId, category: 'wastewater_permit',
      company: facility, facility_name: facility, operator_name: null, permittee_name: permittee,
      address, city, county, zip: zip && zip !== '00000' ? zip : '', lat, lng,
      permit_type: 'unknown', permit_status: sourceStatus ? (statuses[sourceStatus.toLowerCase()] ?? 'unknown') : 'unknown',
      source_status: sourceStatus, data_source: 'EPA ECHO / ICIS-NPDES individual wastewater discharge permits (SIC 4952)',
      retrieved_at: text(row.__retrievedAt) ?? retrievedAt, source_url: `https://echo.epa.gov/detailed-facility-report?fid=${registryId}`,
      location_notes: [
        'EPA provider coordinates for the facility or permit holder; exact parcel location is not independently verified.',
        `Coordinate precision ${accuracy === null || accuracy < 0 ? 'unknown' : `${accuracy} meters (EPA calculated accuracy)`}.`,
        `Source reference point: ${reference ?? 'unknown'}.`, `Source collection method: ${method ?? 'unknown'}.`,
        'EPA reported address may be a mailing or permittee office address and may differ from the mapped facility.',
      ].join(' '),
      pollutants: [], raw_text: metadata, is_sample: false,
    });
  }
  permits.sort((a, b) => a.registration_number.localeCompare(b.registration_number));
  return { permits, excluded };
}
