import { describe, expect, it } from 'vitest';
import type { Permit } from '../../shared/permit.js';
import { adaptSites, facilityName } from '../importer/adapters.js';
import { validateRow } from '../importer/importer.js';
import { facilityPhrase, templateCommentDraft, templateSummaryText } from './templates.js';

const base: Permit = {
  id: 'p',
  registrationNumber: '2487',
  category: 'air_permit',
  company: 'KETJEN LIMITED LIABILITY COMPANY',
  facilityName: 'ALBEMARLE CATALYSTS',
  address: '13000 Bay Park Rd',
  city: 'Pasadena',
  county: 'Harris',
  zip: '',
  lat: 29.6,
  lng: -95.0,
  locationSource: 'dataset',
  permitType: 'renewal',
  maxProductionCydPerHr: null,
  maxHoursPerYear: null,
  pollutants: ['carbon monoxide', 'nitrogen oxides'],
  controls: null,
  noticeType: null,
  noticeIssuanceDate: null,
  commentDeadline: null,
  publicMeetingDate: null,
  sourceUrl: 'https://www.tceq.texas.gov/x',
  isSample: false,
};

describe('category-aware templates', () => {
  it('describes industrial air permits without calling them concrete plants', () => {
    for (const lang of ['en', 'es'] as const) {
      const s = templateSummaryText(base, lang);
      const all = `${s.headline} ${s.summary} ${s.whatsChanging}`.toLowerCase();
      expect(all).not.toMatch(/concrete|concreto|cubic|cúbicas|production rate|producción/);
      expect(all).toContain('albemarle catalysts');
      expect(all).toContain('2487');
    }
    expect(templateSummaryText(base, 'en').summary).toContain('carbon monoxide and nitrogen oxides');
    const draft = templateCommentDraft(base, ['dust'], '', 'en');
    expect(draft.body).toContain('permit 2487, for the ALBEMARLE CATALYSTS facility');
    expect(draft.body.toLowerCase()).not.toContain('concrete');
  });

  it('keeps concrete plant wording for concrete permits', () => {
    const concrete: Permit = { ...base, category: 'concrete_batch_plant', facilityName: null, maxProductionCydPerHr: 200 };
    expect(templateSummaryText(concrete, 'en').summary).toContain('for a concrete batch plant');
    expect(templateSummaryText(concrete, 'en').summary).toContain('200 cubic yards');
    expect(facilityPhrase({ category: 'air_permit', facilityName: null }, 'en')).toBe('an industrial facility');
  });
});

describe('sites.json categories', () => {
  it('maps pending air permits to the air_permit category with their facility name', () => {
    const rows = adaptSites({
      sites: [
        {
          id: 'tceq-2487',
          category: 'pending_air_permit',
          name: 'ALBEMARLE CATALYSTS',
          operator: 'KETJEN LIMITED LIABILITY COMPANY',
          address: '13000 Bay Park Rd',
          city: 'Pasadena',
          county: 'Harris',
          lat: 29.6,
          lng: -95.0,
          sourceUrl: 'https://www.tceq.texas.gov/x',
          details: { permitNumber: '2487', permitType: 'renewal', airContaminants: 'carbon monoxide and nitrogen oxides' },
        },
        {
          id: 'tceq-1',
          category: 'concrete_batch_plant',
          name: 'CONCRETE BATCH PLANT',
          operator: 'X',
          address: '1 Main',
          city: 'Houston',
          county: 'Harris',
          lat: 29.7,
          lng: -95.3,
          sourceUrl: 'https://www.tceq.texas.gov/y',
          details: { permitNumber: '1' },
        },
        { id: 'road', category: 'busy_road' },
      ],
    });
    expect(rows).toHaveLength(2);
    const [air, concrete] = rows.map((r) => {
      const v = validateRow(r);
      if (!v.ok) throw new Error(v.errors.join('; '));
      return v.row;
    });
    expect(air).toMatchObject({ category: 'air_permit', facility_name: 'ALBEMARLE CATALYSTS' });
    expect(concrete).toMatchObject({ category: 'concrete_batch_plant' });
    expect(concrete!.facility_name).toBeUndefined();
  });

  it('rejects unknown categories instead of guessing', () => {
    const v = validateRow({
      id: 'x',
      registration_number: '1',
      company: 'C',
      address: '1 Main',
      city: 'Houston',
      county: 'Harris',
      lat: 29.7,
      lng: -95.3,
      source_url: 'https://www.tceq.texas.gov/x',
      category: 'landfill',
    });
    expect(v.ok).toBe(false);
  });

  it('ignores generic facility names', () => {
    expect(facilityName('CONCRETE BATCH PLANT', 'ACME')).toBeUndefined();
    expect(facilityName('ACME', 'acme')).toBeUndefined();
    expect(facilityName('HOLMES ROAD PLANT B', 'ACME')).toBe('HOLMES ROAD PLANT B');
  });
});

it('does not present a known effective air authorization as a pending application',()=>{
 const text=templateSummaryText({...base,permitStatus:'effective',sourceStatus:'Effective'},'en');
 expect(text.summary).toContain('Effective');expect(text.summary).not.toContain('has an air permit application');expect(text.whatsChanging).not.toContain('This is an application');
});
