import type { AreaSummary, NearbyPlant } from './api.js';
import { PERMIT_CATEGORIES, type PermitCategory } from './permit.js';

/** Aggregate only the already-filtered permits and production rates listed in their source data. */
export function summarizeArea(plants: NearbyPlant[]): AreaSummary {
  const listed = plants.filter(p=>p.permit.category==='concrete_batch_plant').map(p => p.permit.maxProductionCydPerHr).filter((v): v is number => v !== null);
  return {
    withinRadius: plants.length,
    categoryCounts: Object.fromEntries(PERMIT_CATEGORIES.map(category=>[category, plants.filter(p=>p.permit.category===category).length])) as Record<PermitCategory,number>,
    // Retained for existing API consumers; the UI presents the selected distance instead.
    within1: plants.filter(p => p.distanceMiles <= 1).length,
    within2: plants.filter(p => p.distanceMiles <= 2).length,
    within3: plants.filter(p => p.distanceMiles <= 3).length,
    combinedCapacityCydPerHr: listed.length ? listed.reduce((sum,v) => sum + v,0) : null,
    capacityListedCount: listed.length,
  };
}
