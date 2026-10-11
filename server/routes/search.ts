import { Router } from 'express';
import { z } from 'zod';
import type { PermitDetailResponse, SearchResponse, SuggestResponse } from '../../shared/api.js';
import { isInTexasBounds, MAX_SEARCH_RADIUS_MILES } from '../../shared/geo.js';
import { checkSearchInput, PERMIT_ID_PATTERN, SEARCH_QUERY_MAX } from '../../shared/validation.js';
import type { Limiters } from '../app.js';
import type { DB } from '../db/index.js';
import { getPermitRecord, toPermit } from '../db/permitsRepo.js';
import { getSummaries } from '../db/summariesRepo.js';
import { HttpError, parseInput } from '../lib/errors.js';
import type { GeocodeOutcome, Geocoder } from '../services/geocoder.js';
import type { PlaceSearch } from '../services/placeSearch.js';
import { findNearby, findNearestOverall, summarizeArea } from '../services/search.js';

const SEARCH_MESSAGES: Record<string, string> = {
  empty: 'Enter a Houston street address or a 5-digit ZIP code.',
  too_short: 'Enter a Houston street address or a 5-digit ZIP code.',
  too_long: `That is too long. Please use ${SEARCH_QUERY_MAX} characters or fewer.`,
  invalid_zip: 'ZIP codes have exactly 5 digits.',
  invalid_chars: 'Please use only letters, numbers and common address punctuation.',
};

const queryText = z
  .string()
  .max(SEARCH_QUERY_MAX * 2)
  .transform((v) => v.replace(/\s+/g, ' ').trim())
  .superRefine((value, ctx) => {
    const problem = checkSearchInput(value);
    if (problem) ctx.addIssue({ code: 'custom', message: SEARCH_MESSAGES[problem] ?? 'Invalid search.' });
  });

const coordinate = (min: number, max: number) => z.coerce.number().finite().min(min).max(max);

const SearchQuerySchema = z
  .object({
    q: queryText,
    // Set when the resident picked a suggested place: search right there, no second lookup.
    lat: coordinate(-90, 90).optional(),
    lng: coordinate(-180, 180).optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'lat and lng must be given together');

const SuggestQuerySchema = z.object({ q: queryText });

const PermitParamsSchema = z.object({ id: z.string().regex(PERMIT_ID_PATTERN) });

export function searchRouter(deps: { db: DB; geocoder: Geocoder; placeSearch?: PlaceSearch }) {
  return (_limiters: Limiters) => {
    const router = Router();

    router.get('/search', async (req, res) => {
      const parsed = SearchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Enter a Houston street address or a 5-digit ZIP code.';
        throw new HttpError(400, 'invalid_query', message);
      }
      const { q, lat, lng } = parsed.data;

      const outcome: GeocodeOutcome =
        lat !== undefined && lng !== undefined
          ? {
              status: 'found',
              geocoderAvailable: true,
              result: { lat, lng, label: q, source: 'place_search', approximate: true, zip: null },
            }
          : await deps.geocoder.geocode(q);
      if (outcome.status === 'not_found') {
        throw new HttpError(
          404,
          outcome.geocoderAvailable ? 'location_not_found' : 'geocoder_unavailable',
          outcome.geocoderAvailable
            ? "We couldn't find that address. Try adding the ZIP code, or enter just a 5-digit ZIP."
            : 'The address lookup service is not responding right now. Please enter a 5-digit ZIP code instead.',
        );
      }
      const location = outcome.result;
      if (!isInTexasBounds(location)) {
        throw new HttpError(
          422,
          'outside_service_area',
          `We found ${location.label}, but PermitWatch covers Houston-area (Texas) concrete plant permits only. Try a Houston address, neighborhood, or ZIP code.`,
        );
      }

      const plants = findNearby(deps.db, location, MAX_SEARCH_RADIUS_MILES);
      const nearestOutside = plants.length === 0 ? findNearestOverall(deps.db, location) : null;
      const body: SearchResponse = {
        query: q,
        location: {
          lat: location.lat,
          lng: location.lng,
          label: location.label,
          source: location.source,
          approximate: location.approximate,
          zip: location.zip,
        },
        geocoderAvailable: outcome.geocoderAvailable,
        radiusMiles: MAX_SEARCH_RADIUS_MILES,
        plants,
        area: summarizeArea(plants),
        nearestOutside,
        hasSampleData: plants.some((p) => p.permit.isSample),
      };
      res.json(body);
    });

    // Search-as-you-type place suggestions. Degrades to an empty list if place search is down.
    router.get('/geocode/suggest', async (req, res) => {
      const parsed = SuggestQuerySchema.safeParse(req.query);
      if (!parsed.success || parsed.data.q.length < 3 || !deps.placeSearch) {
        const empty: SuggestResponse = { suggestions: [] };
        res.json(empty);
        return;
      }
      let body: SuggestResponse = { suggestions: [] };
      try {
        const places = await deps.placeSearch.search(parsed.data.q, 5);
        body = { suggestions: places.map((p) => ({ label: p.label, lat: p.lat, lng: p.lng })) };
      } catch {
        // Photon unreachable: the resident can still press Search (Census + ZIP fallbacks).
      }
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.json(body);
    });

    router.get('/permits/:id', (req, res) => {
      const { id } = parseInput(PermitParamsSchema, req.params, 'That permit ID is not valid.');
      const record = getPermitRecord(deps.db, id);
      if (!record) throw new HttpError(404, 'permit_not_found', 'We could not find that permit.');
      const body: PermitDetailResponse = {
        permit: toPermit(record),
        summary: getSummaries(deps.db, [id]).get(id) ?? null,
        rawText: record.raw_text,
      };
      res.json(body);
    });

    return router;
  };
}
