import type { AppDeps } from './app.js';
import type { Env } from './config/env.js';
import type { DB } from './db/index.js';
import type { GeocodeFn } from './importer/importer.js';
import type { Logger } from './lib/logger.js';
import { searchRouter } from './routes/search.js';
import { createGeocoder, type Geocoder } from './services/geocoder.js';
import { loadZipCentroids } from './services/zipCentroids.js';

export interface Services {
  geocoder: Geocoder;
}

/** Wires real service implementations. Tests build their own with fakes. */
export function createServices(_env: Env, db: DB, logger: Logger): Services {
  const zipCentroids = loadZipCentroids();
  return {
    geocoder: createGeocoder({ db, logger, zipCentroids }),
  };
}

export function createRoutes(db: DB, services: Services): NonNullable<AppDeps['routes']> {
  return [searchRouter({ db, geocoder: services.geocoder })];
}

/** Adapts the address geocoder for the importer (rows without lat/lng). */
export function importerGeocode(geocoder: Geocoder): GeocodeFn {
  return async ({ address, city, zip }) => {
    const outcome = await geocoder.geocode(`${address}, ${city}, TX ${zip}`);
    if (outcome.status !== 'found') return null;
    return { lat: outcome.result.lat, lng: outcome.result.lng, source: outcome.result.source };
  };
}
