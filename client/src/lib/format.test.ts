import { describe, expect, it } from 'vitest';
import { daysUntil, formatDate, formatMiles, parseLocalDate } from './format';

describe('format helpers', () => {
  it('parses dataset dates as local calendar dates (no time-zone shift)', () => {
    const d = parseLocalDate('2026-11-05')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 5]);
    expect(parseLocalDate('11/05/2026')).toBeNull();
  });

  it('formats dates in English and Spanish', () => {
    expect(formatDate('2026-11-05', 'en')).toBe('November 5, 2026');
    expect(formatDate('2026-11-05', 'es')).toContain('noviembre');
  });

  it('counts down whole days to a listed deadline', () => {
    const today = new Date(2026, 9, 10, 23, 59);
    expect(daysUntil('2026-10-10', today)).toBe(0);
    expect(daysUntil('2026-11-05', today)).toBe(26);
    expect(daysUntil('2026-10-01', today)).toBe(-9);
    expect(daysUntil('not a date', today)).toBeNull();
  });

  it('formats miles with one decimal', () => {
    expect(formatMiles(0.42, 'en')).toBe('0.4');
    expect(formatMiles(2, 'en')).toBe('2.0');
  });
});
