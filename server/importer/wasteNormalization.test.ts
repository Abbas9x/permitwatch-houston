import { describe, expect, it } from 'vitest';
import { normalizeWastePermits } from '../../scraper/src/normalizeWastePermits.js';

const retrievedAt = '2026-10-11T05:00:00Z';
const gis = {
  layerId: 7,
  attributes: {
    PERMIT_NUM: '1307D', FACILITY_N: 'OLDER SOURCE NAME', REGULATED_: 'RN100216142',
    COUNTY: 'HARRIS', LATITUDE: 29.951487, LONGITUDE: -95.239017,
    ADDRESS: 'MAILING ADDRESS', LANDFILL_T: '1', HORZ_METH: 'Unknown', HORZ_ACC: '-9999',
  },
  geometry: { x: -95.239017, y: 29.951487 },
};
const authorization = {
  'Additional ID': '1307D', 'Site Name': 'WM ATASCOCITA RECYCLING DISPOSAL FACILITY',
  'Physical Type': '1', 'Legal Status': 'ISSUED', 'Legal Status Date': '2011-08-10',
  'Physical Site Status': 'ACTIVE', RN: 'RN100216142', County: 'HARRIS',
  'Phys Addr Line 1': '3623 WILSON RD', 'Phys Addr Line 2': ' ',
  'Phys Addr City': 'HUMBLE', 'Phys Addr Zip': '77396',
};

// These cases catch registrations labeled as permits, invented statuses or people,
// stale GIS names, mailing addresses used as physical addresses, and bad joins.
describe('municipal solid waste permit normalization', () => {
  it('uses current authorization name and physical address with official point provenance', () => {
    const { permits, exclusions } = normalizeWastePermits([gis], [authorization], retrievedAt);
    expect(exclusions).toEqual({});
    expect(permits).toHaveLength(1);
    expect(permits[0]).toMatchObject({
      id: 'tceq-waste-1307D', registration_number: '1307D', category: 'solid_waste_permit',
      company: 'WM ATASCOCITA RECYCLING DISPOSAL FACILITY',
      facility_name: 'WM ATASCOCITA RECYCLING DISPOSAL FACILITY',
      address: '3623 WILSON RD', city: 'HUMBLE', county: 'Harris', zip: '77396',
      lat: 29.951487, lng: -95.239017, permit_status: 'issued', source_status: 'ISSUED',
      retrieved_at: retrievedAt, operator_name: null, permittee_name: null,
      permit_type: 'unknown', pollutants: [], is_sample: false,
    });
    const sourceUrl = new URL(permits[0]!.source_url);
    expect(sourceUrl.hostname).toBe('gisweb.tceq.texas.gov');
    expect(sourceUrl.searchParams.get('where')).toBe("PERMIT_NUM = '1307D'");
    expect(permits[0]!.raw_text).toContain('2011-08-10');
    expect(permits[0]!).not.toHaveProperty('comment_deadline');
  });

  it.each(['40098', '40236', '9000', '100202', 'bad-id', '1307D junk'])(
    'excludes authorization %s rather than treating all viewer IDs as permits', (id) => {
      const result = normalizeWastePermits([
        { ...gis, attributes: { ...gis.attributes, PERMIT_NUM: id } },
      ], [{ ...authorization, 'Additional ID': id }], retrievedAt);
      expect(result.permits).toEqual([]);
      expect(result.exclusions).toEqual({ not_a_permit: 1 });
    },
  );

  it.each([
    ['PENDING', 'pending'], ['ACTIVE', 'unknown'], ['ACKNOWLEDGED', 'unknown'], ['', 'unknown'],
  ])('maps legal status %s to %s independently of active facility status', (raw, expected) => {
    const result = normalizeWastePermits([gis], [{ ...authorization, 'Legal Status': raw }], retrievedAt);
    expect(result.permits[0]!.permit_status).toBe(expected);
    expect(result.permits[0]!.source_status).toBe(raw || null);
  });

  it.each(['Phys Addr Line 1', 'Phys Addr City', 'County'])('rejects missing required physical field %s', (field) => {
    const result = normalizeWastePermits([gis], [{ ...authorization, [field]: ' ' }], retrievedAt);
    expect(result.permits).toEqual([]);
    expect(result.exclusions).toEqual({ missing_physical_location: 1 });
  });

  it('requires exact authorization ID and matching regulated entity', () => {
    expect(normalizeWastePermits([gis], [], retrievedAt).exclusions).toEqual({ missing_authorization: 1 });
    const wrongEntity = { ...authorization, RN: 'RN999999999' };
    expect(normalizeWastePermits([gis], [wrongEntity], retrievedAt).exclusions).toEqual({ entity_mismatch: 1 });
  });

  it('rejects missing or out-of-region source coordinates without geocoding', () => {
    const invalid = { ...gis, geometry: { x: -95.239017, y: 0 } };
    expect(normalizeWastePermits([invalid], [authorization], retrievedAt).exclusions).toEqual({ unusable_coordinates: 1 });
  });

  it('does not duplicate an authorization or choose an ambiguous spreadsheet join', () => {
    expect(normalizeWastePermits([gis, gis], [authorization], retrievedAt).permits).toHaveLength(1);
    const ambiguous = normalizeWastePermits([gis], [authorization, authorization], retrievedAt);
    expect(ambiguous.permits).toEqual([]);
    expect(ambiguous.exclusions).toEqual({ ambiguous_authorization: 1 });
  });
});
