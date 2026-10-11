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

import {filtersFromParams} from './router';
describe('shareable permit filters',()=>{
 it('preserves category and status alongside radius, coordinates and detail selection',()=>{
  const params=new URL(searchHref('Houston','water-1',{lat:29.8,lng:-95.2},5,{category:'wastewater_permit',status:'expired'}),'http://local').searchParams;
  expect(params.get('category')).toBe('wastewater_permit');expect(params.get('status')).toBe('expired');expect(params.get('permit')).toBe('water-1');expect(params.get('radius')).toBe('5');expect(filtersFromParams(params)).toEqual({category:'wastewater_permit',status:'expired'});
 });
 it('ignores invalid shared-link filter values without inventing another category',()=>{expect(filtersFromParams(new URLSearchParams('category=landfill&status=active'))).toEqual({});});
});
