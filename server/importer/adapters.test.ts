import { describe, expect, it } from 'vitest';
import { adaptTceqScrape, isTceqScrape, parseProductionRate } from './adapters.js';
import { validateRow } from './importer.js';

const file = {
  generatedAt: '2026-10-10T23:10:48Z',
  source:
    'TCEQ pending air permit applications (https://www.tceq.texas.gov/assets/public/permitting/air/reports/applications/nsr-pending-permits.html) and TCEQ NSR Air Permits search (https://www2.tceq.texas.gov/airperm/index.cfm?fuseaction=airpermits.start)',
  count: 2,
  plants: [
    {
      id: 'tceq-47219',
      permitNumber: '47219',
      name: 'CONCRETE BATCH PLANT',
      operator: 'ALAMO CONCRETE PRODUCTS COMPANY',
      address: '18880 E HARDY RD',
      city: 'HOUSTON',
      county: 'Harris',
      zip: null,
      lat: 30.026,
      lng: -95.4034,
      status: 'existing',
      permitType: 'renewal',
      dateReceived: '2020-10-14',
      commentDeadline: null,
      productionRate: 'less than 200 cubic yards per hour',
      emissions: [],
      noticeUrl: null,
      notes: null,
    },
    {
      id: 'tceq-1',
      permitNumber: '1',
      operator: 'X',
      address: '1 Main',
      city: 'Houston',
      county: 'Harris',
      zip: '77045',
      lat: 29.7,
      lng: -95.3,
      status: 'pending',
      permitType: null,
      dateReceived: '2026-06-03',
      commentDeadline: null,
      productionRate: null,
      emissions: [],
      noticeUrl: null,
      notes: null,
    },
  ],
};

describe('TCEQ scrape adapter', () => {
  it('detects the format', () => {
    expect(isTceqScrape(file)).toBe(true);
    expect(isTceqScrape({ permits: [] })).toBe(false);
  });

  it('maps fields without inventing values', () => {
    const [a, b] = adaptTceqScrape(file).map((row) => {
      const v = validateRow(row);
      if (!v.ok) throw new Error(v.errors.join('; '));
      return v.row;
    });
    expect(a).toMatchObject({
      registration_number: '47219',
      company: 'ALAMO CONCRETE PRODUCTS COMPANY',
      zip: '',
      permit_type: 'renewal',
      max_production_cyd_per_hr: 200,
      pollutants: [],
      source_url: 'https://www2.tceq.texas.gov/airperm/index.cfm?fuseaction=airpermits.start',
    });
    expect(a!.max_hours_per_year).toBeUndefined();
    expect(a!.comment_deadline).toBeUndefined();
    expect(a!.notice_issuance_date).toBeUndefined(); // dateReceived is not a notice date
    expect(a!.raw_text).toContain('Application received by TCEQ: 2020-10-14');
    expect(a!.raw_text).toContain('Production rate as listed: less than 200 cubic yards per hour');
    expect(b).toMatchObject({ zip: '77045', permit_type: 'unknown' });
    expect(b!.source_url).toContain('nsr-pending-permits');
  });

  it('parses listed production rates', () => {
    expect(parseProductionRate('150 cubic yards per hour')).toBe(150);
    expect(parseProductionRate('less than 1,200 cubic yards per hour')).toBe(1200);
    expect(parseProductionRate('unknown')).toBeUndefined();
    expect(parseProductionRate(null)).toBeUndefined();
  });
});
