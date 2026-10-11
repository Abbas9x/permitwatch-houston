import { describe, expect, it } from 'vitest';
import { searchHref } from './router';
describe('shareable search distance', () => {
  it('preserves distance, selected permit and exact picked location', () => {
    const params = new URL(searchHref('Houston', 'sample-001', {lat:29.7,lng:-95.4},10),'http://local').searchParams;
    expect(params.get('radius')).toBe('10');
    expect(params.get('permit')).toBe('sample-001');
    expect(params.get('lat')).toBe('29.70000');
    expect(params.get('lng')).toBe('-95.40000');
  });
});
