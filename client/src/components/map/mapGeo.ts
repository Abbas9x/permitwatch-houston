import { circleRing, destinationPoint, SEARCH_RADII_MILES, type LatLng } from '../../../../shared/geo';

export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

/** Wide, tilted view of Houston used as the starting point of the fly-in. */
export const HOUSTON_OVERVIEW = { center: [-95.3698, 29.7604] as [number, number], zoom: 9.3, pitch: 58, bearing: -24 };

export function ringsGeoJson(center: LatLng) {
  return {
    type: 'FeatureCollection' as const,
    features: SEARCH_RADII_MILES.map((radius) => ({
      type: 'Feature' as const,
      properties: { radius },
      geometry: { type: 'Polygon' as const, coordinates: [circleRing(center, radius)] },
    })),
  };
}

/** Where to pin each ring's "1 mi / 2 mi / 3 mi" label (due north of the center). */
export function ringLabelPoints(center: LatLng) {
  return SEARCH_RADII_MILES.map((radius) => ({ radius, point: destinationPoint(center, 0, radius) }));
}

/** [[west, south], [east, north]] around the outermost ring. */
export function ringBounds(center: LatLng, radius: number): [[number, number], [number, number]] {
  const n = destinationPoint(center, 0, radius);
  const s = destinationPoint(center, 180, radius);
  const e = destinationPoint(center, 90, radius);
  const w = destinationPoint(center, 270, radius);
  return [
    [w.lng, s.lat],
    [e.lng, n.lat],
  ];
}

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
