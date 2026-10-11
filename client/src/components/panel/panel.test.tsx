import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permit } from '../../../../shared/permit';
import { I18nProvider } from '../../i18n';
import { ActNow } from './ActNow';
import { KeyNumbers } from './KeyNumbers';

afterEach(cleanup);

const base: Permit = {
  id: 'p1',
  registrationNumber: '170001',
  category: 'concrete_batch_plant',
  facilityName: null,
  company: 'Example Co',
  address: '1 Main St',
  city: 'Houston',
  county: 'Harris',
  zip: '77020',
  lat: 29.77,
  lng: -95.33,
  locationSource: 'dataset',
  permitType: 'new',
  maxProductionCydPerHr: 300,
  maxHoursPerYear: 8760,
  pollutants: ['PM10'],
  controls: null,
  noticeType: null,
  noticeIssuanceDate: '2026-09-28',
  commentDeadline: null,
  publicMeetingDate: null,
  sourceUrl: 'https://www.tceq.texas.gov/notice',
  isSample: false,
};

function renderEn(ui: React.ReactElement) {
  return render(<I18nProvider initial="en">{ui}</I18nProvider>);
}

describe('ActNow', () => {
  it('never invents a deadline: says none is listed and shows the notice date instead', () => {
    renderEn(<ActNow permit={{ ...base, commentDeadline: null }} />);
    expect(screen.getByText(/does not list a comment deadline/)).toBeTruthy();
    expect(screen.getByText(/September 28, 2026/)).toBeTruthy();
    expect(screen.queryByText(/days left/)).toBeNull();
  });

  it('counts down only to a deadline that is in the data', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    renderEn(<ActNow permit={{ ...base, commentDeadline: '2026-11-05' }} />);
    expect(screen.getByText('26 days left to comment')).toBeTruthy();
    expect(screen.getByText(/Deadline listed in the notice: November 5, 2026/)).toBeTruthy();
    vi.useRealTimers();
  });

  it('says a listed deadline has passed', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 11, 1, 12));
    renderEn(<ActNow permit={{ ...base, commentDeadline: '2026-11-05' }} />);
    expect(screen.getByText(/has passed/)).toBeTruthy();
    vi.useRealTimers();
  });

  it('links to TCEQ eComment and the official notice, and never auto-submits', () => {
    renderEn(<ActNow permit={base} />);
    const ecomment = screen.getByRole('link', { name: /Comment on TCEQ eComment/ });
    expect(ecomment.getAttribute('href')).toBe('https://www14.tceq.texas.gov/epic/eComment/');
    expect(ecomment.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByRole('link', { name: /View official notice/ }).getAttribute('href')).toBe(base.sourceUrl);
  });
});

describe('KeyNumbers', () => {
  it('shows real numbers from the permit', () => {
    renderEn(<KeyNumbers permit={base} />);
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('8,760')).toBeTruthy();
  });

  it('shows "Not listed in notice – check TCEQ" with the source link for missing values', () => {
    renderEn(<KeyNumbers permit={{ ...base, maxProductionCydPerHr: null, maxHoursPerYear: null }} />);
    const notListed = screen.getAllByRole('link', { name: /Not listed in notice – check TCEQ/ });
    expect(notListed).toHaveLength(2);
    expect(notListed[0]!.getAttribute('href')).toBe(base.sourceUrl);
  });
});
