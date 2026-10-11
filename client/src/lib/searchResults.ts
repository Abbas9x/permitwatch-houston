import type { SearchResponse } from '../../../shared/api';
import { summarizeArea } from '../../../shared/area';

/** Keep slider updates local to the loaded location, using exact server-calculated distances. */
export function resultsForRadius(data: SearchResponse, radiusMiles: number): SearchResponse {
  const plants = data.plants.filter(p => p.distanceMiles <= radiusMiles);
  const nearest = data.plants[0];
  return {
    ...data,
    radiusMiles,
    plants,
    area: summarizeArea(plants),
    hasSampleData: plants.some(p => p.permit.isSample),
    nearestOutside: plants.length ? null : nearest ? {
      id: nearest.permit.id,
      company: nearest.permit.company,
      distanceMiles: nearest.distanceMiles,
      compass: nearest.compass,
    } : data.nearestOutside,
  };
}
