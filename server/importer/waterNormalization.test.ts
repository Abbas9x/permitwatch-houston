import { describe, expect, it } from 'vitest';
import { normalizeWaterPermits } from '../../scraper/src/normalizeWaterPermits.js';

// Hand-checked EPA example: provider point is the discharge location, while the
// reported Greenway Plaza address can be the permittee office.
const example = {
  SourceID: 'TX0097373', CWPName: '18415 FOREST DEER RAOD',
  PermitName: 'ROLLING CREEK UTILITY DISTRICT', CWPStreet: '9 GREENWAY PLAZA STE 110',
  CWPCity: 'HOUSTON', CWPCounty: 'Harris', CWPZip: '77046',
  RegistryID: '110009747453', FacLat: '29.836389', FacLong: '-95.689972',
  CWPPermitTypeDesc: 'NPDES Individual Permit', CWPPermitStatusDesc: 'Effective',
  CollectionMethod: 'INTERPOLATION-MAP', ReferencePoint: 'POINT WHERE SUBSTANCE IS RELEASED',
  CalculatedAccuracyMeters: '50', CWPIssueDate: '08/30/2023',
  CWPEffectiveDate: '09/01/2023', CWPExpirationDate: '08/30/2028', OtherPermitIDs: '12841001',
};
const timestamp = '2026-10-11T12:00:00.000Z';

describe('EPA wastewater permit normalization', () => {
  it('keeps permit identity, permittee and provider coordinates without claiming an operator or application date', () => {
    const result = normalizeWaterPermits([example], timestamp);
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]).toMatchObject({
      id: 'epa-water-TX0097373', registration_number: 'TX0097373', category: 'wastewater_permit',
      company: '18415 FOREST DEER RAOD', facility_name: '18415 FOREST DEER RAOD',
      operator_name: null, permittee_name: 'ROLLING CREEK UTILITY DISTRICT',
      address: '9 GREENWAY PLAZA STE 110', city: 'HOUSTON', county: 'Harris', zip: '77046',
      lat: 29.836389, lng: -95.689972, permit_type: 'unknown', permit_status: 'effective',
      source_status: 'Effective', retrieved_at: timestamp, pollutants: [], is_sample: false,
      source_url: 'https://echo.epa.gov/detailed-facility-report?fid=110009747453',
    });
    expect(result.permits[0]).not.toHaveProperty('application_date');
    expect(result.permits[0]).not.toHaveProperty('notice_issuance_date');
    expect(result.permits[0]?.location_notes).toContain('reported address');
    expect(result.permits[0]?.location_notes).toContain('50');
    expect(result.permits[0]?.location_notes).toContain('POINT WHERE SUBSTANCE IS RELEASED');
    expect(result.permits[0]?.raw_text).toContain('08/30/2028');
  });

  it.each([
    ['Effective', 'effective'], ['Admin Continued', 'administratively_continued'],
    ['Administratively Continued', 'administratively_continued'], ['Expired', 'expired'],
    ['Pending', 'pending'], ['Issued', 'issued'], ['New Unrecognized Status', 'unknown'],
    [null, 'unknown'],
  ])('preserves permit status %s as %s without using facility activity', (status, expected) => {
    const result = normalizeWaterPermits([{ ...example, CWPPermitStatusDesc: status, FacActiveFlag: 'Y' }], timestamp);
    expect(result.permits[0]?.permit_status).toBe(expected);
  });

  it('rejects facilities without individual wastewater permit identity and reports each reason', () => {
    const result = normalizeWaterPermits([
      { ...example, SourceID: 'TXR05K229' }, { ...example, SourceID: null },
      { ...example, CWPPermitTypeDesc: 'General Permit Covered Facility' },
    ], timestamp);
    expect(result.permits).toEqual([]);
    expect(result.excluded).toEqual({ not_individual_wastewater_id: 2, not_individual_permit: 1 });
  });

  it('rejects absent required address fields and coordinates instead of inventing locations', () => {
    const result = normalizeWaterPermits([
      { ...example, CWPStreet: '' }, { ...example, CWPCity: null },
      { ...example, CWPCounty: 'Dallas' }, { ...example, FacLat: '' },
      { ...example, FacLat: '29.7', FacLong: '-100' },
    ], timestamp);
    expect(result.permits).toEqual([]);
    expect(result.excluded).toEqual({ missing_address: 1, missing_city: 1, outside_region_county: 1, missing_coordinates: 1, outside_region_coordinates: 1 });
  });

  it('rejects coarse and explicitly mailing points but keeps unknown precision honestly labeled', () => {
    const result = normalizeWaterPermits([
      { ...example, CalculatedAccuracyMeters: '17483' },
      { ...example, ReferencePoint: 'MAILING ADDRESS' },
      { ...example, CalculatedAccuracyMeters: null, ReferencePoint: null },
    ], timestamp);
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.location_notes).toContain('precision unknown');
    expect(result.excluded).toEqual({ coarse_coordinates: 1, mailing_coordinates: 1 });
  });

  it('deduplicates genuine permit IDs and leaves unavailable permittee and ZIP unknown', () => {
    const row = { ...example, PermitName: null, CWPZip: '00000' };
    const result = normalizeWaterPermits([row, row], timestamp);
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.operator_name).toBeNull();
    expect(result.permits[0]?.permittee_name).toBeNull();
    expect(result.permits[0]?.zip).toBe('');
    expect(result.excluded).toEqual({ duplicate_permit: 1 });
  });
});

describe('EPA wastewater source paging', () => {
  it('requests permit metadata and all county pages without treating an empty page as success', async () => {
    const { fetchWaterCounty } = await import('../../scraper/src/refreshWaterPermits.js');
    const paths: string[] = [];
    const get = async (url: string) => {
      paths.push(url);
      if (url.includes('.get_facilities?')) return { Results: { QueryID: 'test-query', QueryRows: '2' } };
      if (url.includes('pageno=1')) return { Results: { Facilities: [example] } };
      return { Results: { Facilities: [{ ...example, SourceID: 'TX0137162' }] } };
    };
    expect(await fetchWaterCounty('48201', '1,2,48,53', get)).toHaveLength(2);
    expect(paths[0]).toContain('p_sic=4952');
    expect(paths[0]).toContain('p_act=Y');
    expect(paths[1]).toContain('qcolumns=1%2C2%2C48%2C53');
    await expect(fetchWaterCounty('48201', '1', async (url) => url.includes('.get_facilities?')
      ? { Results: { QueryID: 'test-query', QueryRows: '1' } }
      : { Results: { Facilities: [] } })).rejects.toThrow('empty page');
  });
});
