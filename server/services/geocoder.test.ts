import { describe, expect, it, vi } from 'vitest';
import { silentLogger, testDb } from '../testUtils.js';
import { createGeocoder, extractZip, withHoustonDefault } from './geocoder.js';
import { loadZipCentroids, zipCentroidsFrom } from './zipCentroids.js';

const centroids = zipCentroidsFrom({ '77020': { lat: 29.7683, lng: -95.30897 }, '77004': { lat: 29.72, lng: -95.36 } });

const censusMatch = (x: number, y: number, matchedAddress: string, zip = '77204') =>
  new Response(
    JSON.stringify({ result: { addressMatches: [{ matchedAddress, coordinates: { x, y }, addressComponents: { zip } }] } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
const censusNoMatch = () =>
  new Response(JSON.stringify({ result: { addressMatches: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });

function make(fetchImpl: typeof fetch) {
  return createGeocoder({
    db: testDb(),
    logger: silentLogger(),
    zipCentroids: centroids,
    fetchImpl,
    retries: 1,
    sleep: async () => {},
  });
}

describe('geocoder', () => {
  it('resolves a bare ZIP from Census ZCTA points without calling the network', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const outcome = await make(fetchImpl).geocode(' 77020 ');
    expect(outcome).toMatchObject({ status: 'found', result: { source: 'zip_centroid', approximate: true, zip: '77020' } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns not_found for an unknown ZIP', async () => {
    const outcome = await make(vi.fn<typeof fetch>()).geocode('99999');
    expect(outcome.status).toBe('not_found');
  });

  it('geocodes an address with the Census geocoder and caches the result', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => censusMatch(-95.338, 29.7215, '4800 CALHOUN RD, HOUSTON, TX, 77204'));
    const geocoder = make(fetchImpl);
    const first = await geocoder.geocode('4800 Calhoun Rd');
    expect(first).toMatchObject({ status: 'found', result: { lat: 29.7215, lng: -95.338, source: 'census_geocoder', approximate: false } });

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    expect(url.searchParams.get('address')).toBe('4800 Calhoun Rd, Houston, TX');
    expect(url.searchParams.get('benchmark')).toBe('Public_AR_Current');

    const second = await geocoder.geocode('4800  calhoun rd');
    expect(second.status).toBe('found');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to the ZIP in the address when Census finds no match', async () => {
    const outcome = await make(vi.fn<typeof fetch>(async () => censusNoMatch())).geocode('1 Nowhere Ln, Houston, TX 77020');
    expect(outcome).toMatchObject({ status: 'found', geocoderAvailable: true, result: { source: 'zip_centroid', zip: '77020' } });
  });

  it('degrades gracefully when the Census geocoder is down', async () => {
    const down = vi.fn<typeof fetch>(async () => new Response('', { status: 503 }));
    const withZip = await make(down).geocode('123 Main St, Houston, TX 77004');
    expect(withZip).toMatchObject({ status: 'found', geocoderAvailable: false, result: { source: 'zip_centroid' } });

    const withoutZip = await make(down).geocode('123 Main St');
    expect(withoutZip).toEqual({ status: 'not_found', geocoderAvailable: false });
  });

  it('treats a malformed Census response as unavailable rather than crashing', async () => {
    const weird = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    const outcome = await make(weird).geocode('123 Main St');
    expect(outcome).toEqual({ status: 'not_found', geocoderAvailable: false });
  });
});

describe('address helpers', () => {
  it('adds Houston, TX only when no state or ZIP is present', () => {
    expect(withHoustonDefault('4800 Calhoun Rd')).toBe('4800 Calhoun Rd, Houston, TX');
    expect(withHoustonDefault('4800 Calhoun Rd, Houston, TX')).toBe('4800 Calhoun Rd, Houston, TX');
    expect(withHoustonDefault('4800 Calhoun Rd 77004')).toBe('4800 Calhoun Rd 77004');
  });

  it('extracts the last 5-digit ZIP', () => {
    expect(extractZip('1200 77th St, Houston, TX 77012-1234')).toBe('77012');
    expect(extractZip('no zip here')).toBeNull();
  });
});

describe('bundled ZIP centroid file', () => {
  it('loads Texas ZCTAs with a cited source', () => {
    const zips = loadZipCentroids();
    expect(zips.size).toBeGreaterThan(1500);
    expect(zips.source).toContain('Census');
    const p = zips.get('77020')!;
    expect(p.lat).toBeCloseTo(29.77, 1);
    expect(p.lng).toBeCloseTo(-95.31, 1);
    expect(zips.get('10001')).toBeUndefined();
  });
});
