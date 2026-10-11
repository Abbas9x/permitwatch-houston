import { describe, expect, it } from 'vitest';
import { adaptSites, adaptTceqScrape, isSitesFile, isTceqScrape, parseProductionRate } from './adapters.js';
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

describe('malformed TCEQ input', () => {
  it('recognizes an empty plants array', () => { expect(isTceqScrape({plants:[]})).toBe(true); });
  it('preserves malformed rows for rejection instead of crashing the entire import', () => {
    expect(() => adaptTceqScrape({plants:[null, 'broken', file.plants[0]]} as never)).not.toThrow();
  });
  it('ignores malformed source metadata without aborting valid rows', () => {
    expect(() => adaptTceqScrape({...file,source:42})).not.toThrow();
  });
  it('does not turn invalid production-rate strings into positive capacity', () => {
    for (const rate of ['-150 cubic yards per hour', '1,2 cubic yards per hour', '1e3 cubic yards per hour']) {
      expect(parseProductionRate(rate)).toBeUndefined();
    }
  });
  it('retains sourced pollutant names from emission objects', () => {
    const [row]=adaptTceqScrape({...file,plants:[{...file.plants[0],emissions:[{pollutant:'PM10',tonsPerYear:1.2}]}]});
    const value=validateRow(row);
    expect(value.ok).toBe(true);
    if(value.ok) expect(value.row.pollutants).toEqual(['PM10']);
  });
});

const sitesFile = {
  generatedAt: '2026-10-11T03:46:20Z',
  count: 3,
  sites: [
    {
      id: 'tceq-77728',
      category: 'concrete_batch_plant',
      name: 'HOLMES ROAD PLANT B',
      operator: 'ALLEYTON RESOURCE COMPANY LLC',
      address: '110 Holmes Road',
      city: 'Houston',
      county: 'Harris',
      zip: '77045',
      lat: 29.652777,
      lng: -95.440277,
      locationSource: 'tceq_map_link',
      status: 'pending',
      sourceUrl: 'https://www.tceq.texas.gov/permitting/air/newsourcereview/airpermits-pendingpermit-apps#410602',
      source: 'TCEQ pending air permit applications and public notices',
      scrapedAt: '2026-10-11T03:46:20Z',
      notes: null,
      details: { permitNumber: '77728', permitType: 'renewal', dateReceived: '2026-06-03', commentDeadline: null, productionRate: 'less than 200 cubic yards per hour' },
    },
    {
      id: 'tceq-2468',
      category: 'pending_air_permit',
      name: 'STORAGE TERMINAL',
      operator: 'ADVARIO',
      address: '2301 Highway 146 South',
      city: 'Texas City',
      county: 'Galveston',
      zip: '77590',
      lat: 29.359166,
      lng: -94.945277,
      locationSource: 'tceq_map_link',
      status: 'pending',
      sourceUrl: null,
      source: 'TCEQ pending air permit applications and public notices',
      scrapedAt: '2026-10-11T03:46:20Z',
      notes: null,
      details: { permitNumber: '2468', permitType: 'amendment', dateReceived: '2026-05-01', airContaminants: 'carbon monoxide, nitrogen oxides and volatile organic compounds' },
    },
    {
      id: 'tceq-msw-1307D',
      category: 'landfill',
      name: 'WM ATASCOCITA RDF',
      operator: null,
      address: '3623 Wilson Rd',
      city: null,
      county: 'Harris',
      zip: null,
      lat: 29.9515,
      lng: -95.239,
      locationSource: 'source_data',
      status: 'active',
      sourceUrl: null,
      source: 'TCEQ Municipal Solid Waste facilities',
      scrapedAt: '2026-10-11T03:46:20Z',
      notes: null,
      details: { permitNumber: '1307D', landfillType: 'municipal solid waste' },
    },
  ],
};

describe('sites file adapter', () => {
  it('detects the format', () => {
    expect(isSitesFile(sitesFile)).toBe(true);
    expect(isSitesFile(file)).toBe(false);
    expect(isTceqScrape(sitesFile)).toBe(false);
  });

  it('imports only permit categories, mapping fields without inventing values', () => {
    const rows = adaptSites(sitesFile).map((row) => {
      const v = validateRow(row);
      if (!v.ok) throw new Error(v.errors.join('; '));
      return v.row;
    });
    expect(rows).toHaveLength(2); // the landfill is not a permit row
    const [plant, terminal] = rows;
    expect(plant).toMatchObject({
      id: 'tceq-77728',
      registration_number: '77728',
      company: 'ALLEYTON RESOURCE COMPANY LLC',
      zip: '77045',
      permit_type: 'renewal',
      max_production_cyd_per_hr: 200,
      pollutants: [],
      source_url: 'https://www.tceq.texas.gov/permitting/air/newsourcereview/airpermits-pendingpermit-apps#410602',
    });
    expect(plant!.comment_deadline).toBeUndefined();
    expect(plant!.raw_text).toContain('Application received by TCEQ: 2026-06-03');
    expect(terminal).toMatchObject({
      permit_type: 'amendment',
      pollutants: ['carbon monoxide', 'nitrogen oxides', 'volatile organic compounds'],
      source_url: 'https://www.tceq.texas.gov/permitting/air/nav/air_status_permits.html',
    });
    expect(terminal!.max_production_cyd_per_hr).toBeUndefined();
    expect(terminal!.raw_text).toContain('Air contaminants listed in the notice');
  });

  it('preserves malformed rows for rejection instead of crashing the entire import', () => {
    expect(() => adaptSites({ sites: [null, 'broken', sitesFile.sites[0]] } as never)).not.toThrow();
  });
});
