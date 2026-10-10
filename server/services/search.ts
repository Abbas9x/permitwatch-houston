import type { AreaSummary, NearbyPlant, SearchResponse } from '../../shared/api.js';
import {
  bearingDegrees,
  boundingBox,
  compassPoint,
  haversineMiles,
  MAX_SEARCH_RADIUS_MILES,
  type LatLng,
} from '../../shared/geo.js';
import type { DB } from '../db/index.js';
import { listPermitRecords, listPermitRecordsInBox, toPermit } from '../db/permitsRepo.js';
import { getSummaries } from '../db/summariesRepo.js';

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Every plant within `radiusMiles`, nearest first. */
export function findNearby(db: DB, center: LatLng, radiusMiles = MAX_SEARCH_RADIUS_MILES): NearbyPlant[] {
  const candidates = listPermitRecordsInBox(db, boundingBox(center, radiusMiles));
  const summaries = getSummaries(db, candidates.map((c) => c.id));
  return candidates
    .map((record) => {
      const permit = toPermit(record);
      const distance = haversineMiles(center, permit);
      const bearing = bearingDegrees(center, permit);
      return {
        permit,
        distanceMiles: round(distance, 2),
        bearingDeg: round(bearing, 1),
        compass: compassPoint(bearing),
        summary: summaries.get(permit.id) ?? null,
        exact: distance,
      };
    })
    .filter((p) => p.exact <= radiusMiles)
    .sort((a, b) => a.exact - b.exact || a.permit.id.localeCompare(b.permit.id))
    .map(({ exact: _exact, ...plant }) => plant);
}

/** Counts and combined capacity, computed only from values present in the data. */
export function summarizeArea(plants: NearbyPlant[]): AreaSummary {
  const listed = plants.map((p) => p.permit.maxProductionCydPerHr).filter((v): v is number => v !== null);
  return {
    within1: plants.filter((p) => p.distanceMiles <= 1).length,
    within2: plants.filter((p) => p.distanceMiles <= 2).length,
    within3: plants.filter((p) => p.distanceMiles <= 3).length,
    combinedCapacityCydPerHr: listed.length > 0 ? listed.reduce((sum, v) => sum + v, 0) : null,
    capacityListedCount: listed.length,
  };
}

/** Nearest plant anywhere in the dataset (used when nothing is within the search radius). */
export function findNearestOverall(db: DB, center: LatLng): SearchResponse['nearestOutside'] {
  let best: SearchResponse['nearestOutside'] = null;
  let bestDistance = Infinity;
  for (const record of listPermitRecords(db)) {
    const d = haversineMiles(center, record);
    if (d < bestDistance) {
      bestDistance = d;
      best = {
        id: record.id,
        company: record.company,
        distanceMiles: round(d, 1),
        compass: compassPoint(bearingDegrees(center, record)),
      };
    }
  }
  return best;
}
