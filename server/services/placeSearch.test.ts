import { describe, expect, it, vi } from 'vitest';
import { silentLogger, testDb } from '../testUtils.js';
import { createGeocoder } from './geocoder.js';
import { createPlaceSearch, placeLabel, type Place, type PlaceSearch } from './placeSearch.js';
import { zipCentroidsFrom } from './zipCentroids.js';

const feature = (lng: number, lat: number, properties: Record<string, string>) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties,
});
const photon = (...features: unknown[]) =>
  new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('placeLabel', () => {
  it('formats cities, postcodes, and points of interest readably', () => {
    expect(placeLabel({ name: 'Pasadena', county: 'Harris', state: 'Texas', countrycode: 'US', type: 'city' })).toBe('Pasadena, Texas');
    expect(placeLabel({ name: '91101', city: 'Pasadena', state: 'California', countrycode: 'US', osm_value: 'postcode' })).toBe(
      'Pasadena, California 91101',
    );
    expect(
      placeLabel({ name: 'Daikin Park', housenumber: '501', street: 'Crawford Street', city: 'Houston', state: 'Texas', postcode: '77004', countrycode: 'US', type: 'house' }),
    ).toBe('Daikin Park, 501 Crawford Street, Houston, Texas 77004');
    expect(placeLabel({ name: 'Klaipėda', state: 'Klaipėda County', country: 'Lithuania', countrycode: 'LT', type: 'city' })).toBe(
      'Klaipėda, Klaipėda County, Lithuania',
    );
  });
});

describe('createPlaceSearch', () => {
  it('biases to Houston, puts US results first, and caches repeat queries', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      photon(
        feature(21.19, 55.7, { name: '91101', city: 'Klaipėda', country: 'Lithuania', countrycode: 'LT', osm_value: 'postcode' }),
        feature(-118.14, 34.15, { name: '91101', city: 'Pasadena', state: 'California', countrycode: 'US', osm_value: 'postcode' }),
      ),
    );
    const search = createPlaceSearch({ fetchImpl, sleep: async () => {} });
    const first = await search.search('91101');
    expect(first[0]).toMatchObject({ label: 'Pasadena, California 91101', countryCode: 'US', postcode: '91101', precise: false });
    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/');
    expect(url.searchParams.get('lat')).toBe('29.7604');
    await search.search('91101');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function fakePlaces(places: Place[]): PlaceSearch {
  return { search: vi.fn(async () => places) };
}

const pasadenaTx: Place = { label: 'Pasadena, Texas', lat: 29.69, lng: -95.21, state: 'Texas', countryCode: 'US', postcode: null, precise: false };
const pasadenaCa: Place = { label: 'Pasadena, California 91101', lat: 34.15, lng: -118.14, state: 'California', countryCode: 'US', postcode: '91101', precise: false };
const kentuckyStreet: Place = { label: 'Fuqua, Russellville, Kentucky 42276', lat: 36.84, lng: -86.87, state: 'Kentucky', countryCode: 'US', postcode: '42276', precise: false };

function geocoderWith(placeSearch: PlaceSearch, fetchImpl: typeof fetch = vi.fn<typeof fetch>()) {
  return createGeocoder({
    db: testDb(),
    logger: silentLogger(),
    zipCentroids: zipCentroidsFrom({ '77020': { lat: 29.77, lng: -95.31 } }),
    placeSearch,
    fetchImpl,
    retries: 0,
    sleep: async () => {},
  });
}

describe('geocoder with place search', () => {
  it('finds place names like a maps app', async () => {
    const outcome = await geocoderWith(fakePlaces([pasadenaTx])).geocode('Pasadena');
    expect(outcome).toMatchObject({ status: 'found', result: { label: 'Pasadena, Texas', source: 'place_search', approximate: true } });
  });

  it('resolves ZIPs outside Texas through place search (exact postcode only)', async () => {
    const outcome = await geocoderWith(fakePlaces([pasadenaTx, pasadenaCa])).geocode('91101');
    expect(outcome).toMatchObject({ status: 'found', result: { label: 'Pasadena, California 91101', zip: '91101' } });
  });

  it('still uses the Texas ZIP table first, without calling place search', async () => {
    const places = fakePlaces([pasadenaCa]);
    const outcome = await geocoderWith(places).geocode('77020');
    expect(outcome).toMatchObject({ status: 'found', result: { source: 'zip_centroid' } });
    expect(places.search).not.toHaveBeenCalled();
  });

  it('falls back from Census to place search for addresses, but only accepts Texas matches', async () => {
    const noMatch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ result: { addressMatches: [] } }), { status: 200 }));
    const outcome = await geocoderWith(fakePlaces([kentuckyStreet]), noMatch).geocode('4247 Fuqua');
    expect(outcome.status).toBe('not_found');
    const texas = await geocoderWith(fakePlaces([kentuckyStreet, pasadenaTx]), noMatch).geocode('100 Pasadena Blvd');
    expect(texas).toMatchObject({ status: 'found', result: { label: 'Pasadena, Texas' } });
  });

  it('reports the service as unavailable when place search is down', async () => {
    const down: PlaceSearch = { search: vi.fn(async () => Promise.reject(new Error('down'))) };
    expect(await geocoderWith(down).geocode('Pasadena')).toEqual({ status: 'not_found', geocoderAvailable: false });
  });
});
