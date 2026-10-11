import { z } from 'zod';
import { fetchJson } from '../lib/http.js';

/**
 * Place-name search ("Pasadena", "91101", "Minute Maid Park") via Photon by komoot
 * (https://photon.komoot.io, OpenStreetMap data, free, no key, search-as-you-type supported).
 * Results are biased toward Houston, with US places ahead of foreign ones.
 * Responses are cached in memory to keep usage fair.
 */
export const PHOTON_URL = 'https://photon.komoot.io/api/';
const HOUSTON = { lat: 29.7604, lon: -95.3698 };

export interface Place {
  label: string;
  lat: number;
  lng: number;
  state: string | null;
  countryCode: string | null;
  postcode: string | null;
  /** True for a specific building or point of interest; false for a city, ZIP, street, or region. */
  precise: boolean;
}

export interface PlaceSearch {
  /** Throws UpstreamError when Photon is unreachable. */
  search(query: string, limit?: number): Promise<Place[]>;
}

const PhotonSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z
        .object({
          name: z.string(),
          housenumber: z.string(),
          street: z.string(),
          city: z.string(),
          district: z.string(),
          county: z.string(),
          state: z.string(),
          postcode: z.string(),
          country: z.string(),
          countrycode: z.string(),
          type: z.string(),
          osm_value: z.string(),
        })
        .partial(),
    }),
  ),
});

type PhotonProps = z.infer<typeof PhotonSchema>['features'][number]['properties'];

export function placeLabel(p: PhotonProps): string {
  const parts: string[] = [];
  const add = (s: string | undefined) => {
    const v = s?.trim();
    if (v && !parts.some((x) => x.toLowerCase() === v.toLowerCase())) parts.push(v);
  };
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(' ');
  if (p.osm_value === 'postcode') {
    add(p.city ?? p.county);
    add([p.state, p.name].filter(Boolean).join(' '));
  } else {
    add(p.name ?? streetLine);
    if (p.name && streetLine && p.type === 'house') add(streetLine);
    // Cities and regions read better without their county ("Pasadena, Texas").
    add(p.city ?? (['city', 'county', 'state', 'country'].includes(p.type ?? '') ? undefined : p.county));
    add([p.state, p.postcode].filter(Boolean).join(' '));
  }
  if (p.countrycode && p.countrycode.toUpperCase() !== 'US') add(p.country);
  return parts.join(', ');
}

/** US results first; Photon's Houston location bias already puts nearby Texas places on top. */
function rank(place: Place): number {
  return place.countryCode === 'US' ? 0 : 1;
}

export function createPlaceSearch(
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): PlaceSearch {
  const cache = new Map<string, { at: number; places: Place[] }>();
  const TTL_MS = 60 * 60 * 1000;
  const MAX_ENTRIES = 500;

  return {
    async search(query, limit = 5) {
      const key = `${query.trim().toLowerCase()}|${limit}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.places;

      const url = new URL(PHOTON_URL);
      url.searchParams.set('q', query.trim());
      url.searchParams.set('limit', String(Math.min(limit * 2, 10)));
      url.searchParams.set('lat', String(HOUSTON.lat));
      url.searchParams.set('lon', String(HOUSTON.lon));
      url.searchParams.set('lang', 'en');
      const body = await fetchJson(url.toString(), { method: 'GET' }, {
        service: 'photon',
        timeoutMs: deps.timeoutMs ?? 5_000,
        retries: 1,
        baseDelayMs: 300,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.sleep ? { sleep: deps.sleep } : {}),
      });
      const parsed = PhotonSchema.safeParse(body);
      const places: Place[] = (parsed.success ? parsed.data.features : [])
        .map((f) => ({
          label: placeLabel(f.properties),
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          state: f.properties.state ?? null,
          countryCode: f.properties.countrycode?.toUpperCase() ?? null,
          postcode: f.properties.osm_value === 'postcode' ? (f.properties.name ?? null) : (f.properties.postcode ?? null),
          precise: f.properties.type === 'house',
        }))
        .filter((p) => p.label.length > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lng))
        // Stable sort keeps Photon's own relevance order within each group.
        .sort((a, b) => rank(a) - rank(b))
        .filter((p, i, all) => all.findIndex((q) => q.label === p.label) === i)
        .slice(0, limit);

      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), places });
      return places;
    },
  };
}
