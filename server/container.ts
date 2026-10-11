import type { AppDeps } from './app.js';
import type { DB } from './db/index.js';
import type { GeocodeFn } from './importer/importer.js';
import type { Logger } from './lib/logger.js';
import { commentRouter } from './routes/comments.js';
import { searchRouter } from './routes/search.js';
import { createGeocoder, type Geocoder } from './services/geocoder.js';
import { createPlaceSearch, type PlaceSearch } from './services/placeSearch.js';
import { loadZipCentroids } from './services/zipCentroids.js';

export interface Services {
  /** Addresses, ZIPs and place names (search box). */
  geocoder: Geocoder;
  /** Addresses and ZIPs only (importer: no loose place-name matches for permit locations). */
  addressGeocoder: Geocoder;
  placeSearch: PlaceSearch;
}

/** Wires permit search services. Tests inject offline fakes. */
export function createServices(db: DB, logger: Logger): Services {
  const zipCentroids = loadZipCentroids();
  const placeSearch = createPlaceSearch();
  return {
    geocoder: createGeocoder({ db, logger, zipCentroids, placeSearch }),
    addressGeocoder: createGeocoder({ db, logger, zipCentroids }),
    placeSearch,
  };
}

export function createRoutes(db: DB, services: Services): NonNullable<AppDeps['routes']> {
  return [searchRouter({ db, geocoder: services.geocoder, placeSearch: services.placeSearch }), commentRouter({ db })];
}

/** Adapts the address geocoder for the importer (rows without lat/lng). */
export function importerGeocode(geocoder: Geocoder): GeocodeFn {
  return async ({ address, city, zip }) => {
    const outcome = await geocoder.geocode(`${address}, ${city}, TX ${zip}`);
    // Permit locations must come from the dataset, the Census geocoder, or a ZIP point, never a fuzzy place match.
    if (outcome.status !== 'found' || outcome.result.source === 'place_search') return null;
    return { lat: outcome.result.lat, lng: outcome.result.lng, source: outcome.result.source };
  };
}
