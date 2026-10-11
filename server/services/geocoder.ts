import { z } from 'zod';
import type { LatLng } from '../../shared/geo.js';
import { nowIso, type DB } from '../db/index.js';
import { fetchJson, UpstreamError } from '../lib/http.js';
import type { Logger } from '../lib/logger.js';
import type { Place, PlaceSearch } from './placeSearch.js';
import type { ZipCentroids } from './zipCentroids.js';

export const CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

export type GeocodeSource = 'census_geocoder' | 'zip_centroid' | 'place_search';

export interface GeocodeResult extends LatLng {
  /** Human-readable label for what we located (matched address, place name, or "ZIP 77020"). */
  label: string;
  source: GeocodeSource;
  /** True when the point is a ZIP-area approximation rather than the exact address. */
  approximate: boolean;
  zip: string | null;
}

export type GeocodeOutcome =
  | { status: 'found'; result: GeocodeResult; geocoderAvailable: boolean }
  | { status: 'not_found'; geocoderAvailable: boolean };

export interface Geocoder {
  geocode(query: string): Promise<GeocodeOutcome>;
}

const CensusResponseSchema = z.object({
  result: z.object({
    addressMatches: z.array(
      z.object({
        matchedAddress: z.string(),
        coordinates: z.object({ x: z.number(), y: z.number() }),
        addressComponents: z.object({ zip: z.string().optional() }).partial().optional(),
      }),
    ),
  }),
});

export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

const STATE_HINT = /\b(tx|texas)\b/i;
const ZIP_IN_TEXT = /\b(\d{5})(?:-\d{4})?\b/;

/** Residents type "4800 Calhoun Rd"; the Census geocoder needs a city/state or ZIP to match it. */
export function withHoustonDefault(address: string): string {
  if (ZIP_IN_TEXT.test(address) || STATE_HINT.test(address)) return address;
  return `${address}, Houston, TX`;
}

export function extractZip(text: string): string | null {
  const matches = [...text.matchAll(new RegExp(ZIP_IN_TEXT, 'g'))];
  // The ZIP is normally the last 5-digit group ("1200 77th St, Houston, TX 77012").
  return matches.length > 0 ? matches[matches.length - 1]![1]! : null;
}

export interface GeocoderDeps {
  db: DB;
  logger: Logger;
  zipCentroids: ZipCentroids;
  /** Place-name search (Photon). Optional so tests can run without it. */
  placeSearch?: PlaceSearch;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createGeocoder(deps: GeocoderDeps): Geocoder {
  const { db, logger, zipCentroids } = deps;
  const getCached = db.prepare('SELECT lat, lng, label, source FROM geocode_cache WHERE query_key = ?');
  const putCached = db.prepare(
    `INSERT INTO geocode_cache (query_key, lat, lng, label, source, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (query_key) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, label = excluded.label,
       source = excluded.source, created_at = excluded.created_at`,
  );

  function fromZip(zip: string): GeocodeResult | null {
    const point = zipCentroids.get(zip);
    return point ? { ...point, label: `ZIP ${zip}`, source: 'zip_centroid', approximate: true, zip } : null;
  }

  async function census(address: string): Promise<GeocodeResult | null> {
    const url = new URL(CENSUS_GEOCODER_URL);
    url.searchParams.set('address', address);
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('format', 'json');
    const body = await fetchJson(url.toString(), { method: 'GET' }, {
      service: 'census-geocoder',
      timeoutMs: deps.timeoutMs ?? 8_000,
      retries: deps.retries ?? 2,
      baseDelayMs: 400,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
    });
    const parsed = CensusResponseSchema.safeParse(body);
    if (!parsed.success) throw new UpstreamError('census-geocoder', 'unexpected response shape');
    const match = parsed.data.result.addressMatches[0];
    if (!match) return null;
    return {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      label: match.matchedAddress,
      source: 'census_geocoder',
      approximate: false,
      zip: match.addressComponents?.zip ?? extractZip(match.matchedAddress),
    };
  }

  function fromPlace(place: Place): GeocodeResult {
    return {
      lat: place.lat,
      lng: place.lng,
      label: place.label,
      source: 'place_search',
      approximate: !place.precise,
      zip: place.postcode && /^\d{5}$/.test(place.postcode) ? place.postcode : null,
    };
  }

  /** Place search; never throws (reports availability instead). */
  async function places(query: string, accept: (p: Place) => boolean = () => true) {
    if (!deps.placeSearch) return { result: null, available: true };
    try {
      const match = (await deps.placeSearch.search(query, 5)).find(accept);
      return { result: match ? fromPlace(match) : null, available: true };
    } catch (error) {
      logger.warn({ err: error }, 'place search unavailable');
      return { result: null, available: false };
    }
  }

  return {
    async geocode(rawQuery) {
      const query = normalizeQuery(rawQuery);

      // ZIP: Texas ZCTA table first (instant, offline); any other ZIP via place search (e.g. 91101).
      if (/^\d{5}$/.test(query)) {
        const result = fromZip(query);
        if (result) return { status: 'found', result, geocoderAvailable: true };
        const found = await places(query, (p) => p.postcode === query);
        return found.result
          ? { status: 'found', result: found.result, geocoderAvailable: true }
          : { status: 'not_found', geocoderAvailable: found.available };
      }

      const cacheKey = `addr:${query.toLowerCase()}`;
      const cached = getCached.get(cacheKey) as { lat: number; lng: number; label: string; source: string } | undefined;
      if (cached) {
        const source: GeocodeSource = cached.source === 'place_search' ? 'place_search' : 'census_geocoder';
        return {
          status: 'found',
          geocoderAvailable: true,
          result: {
            lat: cached.lat,
            lng: cached.lng,
            label: cached.label,
            source,
            approximate: source !== 'census_geocoder',
            zip: extractZip(cached.label),
          },
        };
      }
      const remember = (result: GeocodeResult) =>
        putCached.run(cacheKey, result.lat, result.lng, result.label, result.source, nowIso());

      // A place name with no house number ("Pasadena", "Minute Maid Park"): place search.
      if (!/\d/.test(query)) {
        const found = await places(query);
        if (found.result) {
          remember(found.result);
          return { status: 'found', result: found.result, geocoderAvailable: true };
        }
        return { status: 'not_found', geocoderAvailable: found.available };
      }

      // A street address: the Census geocoder is the most accurate source for US addresses.
      let geocoderAvailable = true;
      try {
        const result = await census(withHoustonDefault(query));
        if (result) {
          remember(result);
          return { status: 'found', result, geocoderAvailable };
        }
      } catch (error) {
        geocoderAvailable = false;
        logger.warn({ err: error }, 'census geocoder unavailable; trying place search');
      }

      // Fallback 1: place search, accepting only Texas matches (Photon is loose on street addresses).
      const found = await places(query, (p) => p.countryCode === 'US' && p.state === 'Texas');
      if (found.result) {
        remember(found.result);
        return { status: 'found', result: found.result, geocoderAvailable };
      }

      // Fallback 2: the ZIP code in the typed address, located by its Census ZCTA internal point.
      const zip = extractZip(query);
      const fallback = zip ? fromZip(zip) : null;
      return fallback ? { status: 'found', result: fallback, geocoderAvailable } : { status: 'not_found', geocoderAvailable };
    },
  };
}
