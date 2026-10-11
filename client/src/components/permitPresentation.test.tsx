import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permit } from '../../../shared/permit';
import { I18nProvider } from '../i18n';
import { PlantListItem } from './PlantListItem';
import { PermitStatusBadge } from './Badges';
import { PermitFacts } from './PermitFacts';
import { ActNow } from './panel/ActNow';

const base: Permit = {
  id:'water-1', registrationNumber:'WQ000001', category:'wastewater_permit',
  company:'Bayou Treatment Facility', facilityName:'Bayou Treatment Facility',
  address:'1 Main St',city:'Houston',county:'Harris',zip:'77020',lat:29.77,lng:-95.33,
  locationSource:'dataset',permitType:'unknown',permitStatus:'issued',sourceStatus:'ISSUED',
  operatorName:null,permitteeName:'County Water District',dataSource:'TCEQ Water Quality General Permits',
  retrievedAt:'2026-10-11T14:00:00Z',applicationDate:'2026-08-19',
  locationNotes:'Provider-reported address may be a mailing address.',
  maxProductionCydPerHr:null,maxHoursPerYear:null,pollutants:[],controls:null,
  noticeType:null,noticeIssuanceDate:null,commentDeadline:null,publicMeetingDate:null,
  sourceUrl:'https://www.tceq.texas.gov/record',noticeUrl:null,isSample:false,
};

function renderEn(ui:ReactElement) { return render(<I18nProvider initial="en">{ui}</I18nProvider>); }
afterEach(()=>{ cleanup();vi.useRealTimers(); });

describe('permit presentation',()=>{
  it('prioritizes the facility over a distinct legacy company on cards',()=>{
    renderEn(<PlantListItem plant={{permit:{...base,category:'air_permit',company:'Legacy Operator',facilityName:'Industrial Facility'},distanceMiles:1,bearingDeg:0,compass:'N',summary:null}} index={0} selected={false} onSelect={()=>{}} />);
    expect(screen.getByRole('heading',{name:'Industrial Facility'})).toBeTruthy();
    expect(screen.getByRole('button',{name:/^Industrial Facility,/})).toBeTruthy();
    expect(screen.getAllByText('Industrial Facility')).toHaveLength(1);
  });

  it('shows source provenance and an explicitly missing operator without treating facility as operator',()=>{
    const {container}=renderEn(<PermitFacts permit={base} />);
    const operator=[...container.querySelectorAll('dt')].find(el=>/operator/i.test(el.textContent??''));
    expect(operator).toBeTruthy();
    expect(operator!.nextElementSibling!.textContent).not.toContain('Bayou Treatment Facility');
    expect(within(operator!.parentElement!).getByRole('link').getAttribute('href')).toBe(base.sourceUrl);
    expect(screen.getByText('County Water District')).toBeTruthy();
    expect(screen.getByText('TCEQ Water Quality General Permits')).toBeTruthy();
    expect(screen.getByText('October 11, 2026')).toBeTruthy();
    expect(screen.getByText('August 19, 2026')).toBeTruthy();
    expect(screen.getByText(/may be a mailing address/)).toBeTruthy();
    expect(screen.queryByText('Max production')).toBeNull();
    expect(screen.queryByText('Pollution controls')).toBeNull();
  });

  it.each(['wastewater_permit','solid_waste_permit'] as const)('does not solicit comments for issued %s without a listed future deadline',category=>{
    renderEn(<ActNow permit={{...base,category}} />);
    expect(screen.queryByRole('link',{name:/Comment on TCEQ eComment/})).toBeNull();
    expect(screen.queryByRole('button',{name:/draft/i})).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    const links=screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe(base.sourceUrl);
  });

  it.each([
    {category:'wastewater_permit',permitStatus:'unknown'},
    {category:'solid_waste_permit',permitStatus:'pending'},
    {category:'air_permit',permitStatus:'issued'},
    {category:'concrete_batch_plant',permitStatus:'effective'},
  ] as const)('requires a listed current deadline for $category / $permitStatus comment actions',record=>{
    renderEn(<ActNow permit={{...base,...record}} />);
    expect(screen.queryByRole('link',{name:/Comment on TCEQ eComment/})).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('link',{name:/official record/i}).getAttribute('href')).toBe(base.sourceUrl);
  });

  it.each(['wastewater_permit','solid_waste_permit'] as const)('uses permit identification and omits concrete production for %s cards',category=>{
    renderEn(<PlantListItem plant={{permit:{...base,category},distanceMiles:1,bearingDeg:0,compass:'N',summary:null}} index={0} selected={false} onSelect={()=>{}} />);
    expect(screen.getAllByText('Bayou Treatment Facility')).toHaveLength(1);
    expect(screen.getByText('Permit WQ000001')).toBeTruthy();
    expect(screen.queryByText(/Registration|Max production|cubic yards/i)).toBeNull();
    expect(screen.getByText('Issued permit')).toBeTruthy();
  });

  it('links to the source record and a distinct supplied notice',()=>{
    renderEn(<PermitFacts permit={{...base,noticeUrl:'https://www.tceq.texas.gov/actual-notice'}} />);
    expect(screen.getByRole('link',{name:/View official notice/}).getAttribute('href')).toBe('https://www.tceq.texas.gov/actual-notice');
    expect(screen.getByRole('link',{name:/View official source/}).getAttribute('href')).toBe(base.sourceUrl);
  });

  it('does not offer commenting on an unknown older concrete authorization',()=>{renderEn(<ActNow permit={{...base,category:'concrete_batch_plant',permitStatus:'unknown',commentDeadline:null}} />);expect(screen.queryByRole('link',{name:/Comment on TCEQ eComment/})).toBeNull();expect(screen.getByText(/current public-comment period is not established/)).toBeTruthy();});
  it('hides comment tools after a concrete permit deadline passes even when status is unknown',()=>{
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-11T17:00:00Z'));
    renderEn(<ActNow permit={{...base,category:'concrete_batch_plant',permitStatus:'unknown',commentDeadline:'2026-10-10'}} />);
    expect(screen.queryByRole('link',{name:/Comment on TCEQ eComment/})).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/has passed/)).toBeTruthy();
  });

  it('does not present physical facility activity as an unknown permit lifecycle status',()=>{
    renderEn(<PermitFacts permit={{...base,category:'concrete_batch_plant',permitStatus:'unknown',sourceStatus:'active'}} />);
    expect(screen.getByText('Status not listed')).toBeTruthy();
    expect(screen.queryByText('(active)')).toBeNull();
  });

  it('labels absent lifecycle status as unknown rather than using the application type',()=>{
    renderEn(<PermitStatusBadge />);
    expect(screen.getByText('Status not listed')).toBeTruthy();
  });

  it('retains commenting when an issued water permit has a real future deadline',()=>{
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,11,12));
    renderEn(<ActNow permit={{...base,commentDeadline:'2026-11-05'}} />);
    expect(screen.getByRole('link',{name:/Comment on TCEQ eComment/})).toBeTruthy();
    expect(screen.getByText('25 days left to comment')).toBeTruthy();
  });
});
