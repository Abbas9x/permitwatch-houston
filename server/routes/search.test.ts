import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SearchResponse } from '../../shared/api.js';
import { createApp } from '../app.js';
import type { DB } from '../db/index.js';
import { importRows, readDatasetFile } from '../importer/importer.js';
import type { GeocodeOutcome, Geocoder } from '../services/geocoder.js';
import { silentLogger, testDb, testEnv } from '../testUtils.js';
import { searchRouter } from './search.js';

const PLACES: Record<string, GeocodeOutcome> = {
  '77020': {
    status: 'found',
    geocoderAvailable: true,
    result: { lat: 29.7683, lng: -95.30897, label: 'ZIP 77020', source: 'zip_centroid', approximate: true, zip: '77020' },
  },
  '77494': {
    status: 'found',
    geocoderAvailable: true,
    result: { lat: 29.74466, lng: -95.81554, label: 'ZIP 77494', source: 'zip_centroid', approximate: true, zip: '77494' },
  },
  'Chicago address': {
    status: 'found',
    geocoderAvailable: true,
    result: { lat: 41.88, lng: -87.63, label: 'Chicago', source: 'census_geocoder', approximate: false, zip: '60601' },
  },
  'down street': { status: 'not_found', geocoderAvailable: false },
};

const fakeGeocoder: Geocoder = {
  geocode: async (q) => PLACES[q] ?? { status: 'not_found', geocoderAvailable: true },
};

let db: DB;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = testDb();
  await importRows(readDatasetFile('data/sample-permits.json'), { db, logger: silentLogger(), source: 'sample' });
  app = createApp({
    env: testEnv(),
    db,
    logger: silentLogger(),
    routes: [searchRouter({ db, geocoder: fakeGeocoder })],
    clientDir: 'none',
  });
});

describe('GET /api/search', () => {
  it('returns plants within 3 miles, nearest first, with distance and compass direction', async () => {
    const res = await request(app).get('/api/search').query({ q: '77020' });
    expect(res.status).toBe(200);
    const body = res.body as SearchResponse;
    expect(body.plants.map((p) => p.permit.id)).toEqual(['sample-003', 'sample-001', 'sample-002']);
    const distances = body.plants.map((p) => p.distanceMiles);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    expect(distances.every((d) => d <= 3)).toBe(true);
    expect(body.plants[1]!.compass).toBe('NW'); // ~300° from the ZIP 77020 point
    expect(body.radiusMiles).toBe(3);
    expect(body.hasSampleData).toBe(true);
    expect(body.location).toMatchObject({ approximate: true, zip: '77020' });
  });

  it('summarizes the area using only values present in the data', async () => {
    const body = (await request(app).get('/api/search').query({ q: '77020' })).body as SearchResponse;
    expect(body.area).toEqual({
      within1: 1,
      within2: 2,
      within3: 3,
      combinedCapacityCydPerHr: 250 + 300 + 200,
      capacityListedCount: 3,
    });
  });

  it('reports the nearest plant when none are within 3 miles', async () => {
    const body = (await request(app).get('/api/search').query({ q: '77494' })).body as SearchResponse;
    expect(body.plants).toEqual([]);
    expect(body.area.within3).toBe(0);
    expect(body.area.combinedCapacityCydPerHr).toBeNull();
    expect(body.nearestOutside).not.toBeNull();
    expect(body.nearestOutside!.distanceMiles).toBeGreaterThan(3);
    expect(body.hasSampleData).toBe(false);
  });

  it.each([
    ['', 'invalid_query'],
    ['7702', 'invalid_query'],
    ['<script>alert(1)</script>', 'invalid_query'],
    ['x'.repeat(250), 'invalid_query'],
  ])('rejects invalid input %#', async (q, code) => {
    const res = await request(app).get('/api/search').query({ q });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
  });

  it('rejects repeated query parameters', async () => {
    const res = await request(app).get('/api/search?q=77020&q=77494');
    expect(res.status).toBe(400);
  });

  it('returns friendly errors for unknown, unavailable, and out-of-area locations', async () => {
    const unknown = await request(app).get('/api/search').query({ q: '1 Imaginary Blvd' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('location_not_found');

    const down = await request(app).get('/api/search').query({ q: 'down street' });
    expect(down.status).toBe(404);
    expect(down.body.error.code).toBe('geocoder_unavailable');
    expect(down.body.error.message).toMatch(/ZIP code/);

    const chicago = await request(app).get('/api/search').query({ q: 'Chicago address' });
    expect(chicago.status).toBe(422);
    expect(chicago.body.error.code).toBe('outside_service_area');
  });
});

describe('GET /api/permits/:id', () => {
  it('returns the permit with raw notice text', async () => {
    const res = await request(app).get('/api/permits/sample-001');
    expect(res.status).toBe(200);
    expect(res.body.permit).toMatchObject({ registrationNumber: 'SAMPLE-100001', maxProductionCydPerHr: 300, isSample: true });
    expect(res.body.rawText).toContain('SAMPLE DATA');
  });

  it('returns null (not invented) values for fields missing from the notice', async () => {
    const res = await request(app).get('/api/permits/sample-005');
    expect(res.body.permit).toMatchObject({ maxProductionCydPerHr: null, maxHoursPerYear: null, commentDeadline: null });
  });

  it('404s unknown permits and 400s malformed IDs', async () => {
    expect((await request(app).get('/api/permits/nope')).status).toBe(404);
    expect((await request(app).get('/api/permits/bad%20id!')).status).toBe(400);
  });
});
