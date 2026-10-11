import { circleRing, destinationPoint, DEFAULT_SEARCH_RADIUS_MILES, type LatLng } from '../../../../shared/geo';

export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

/** Wide, tilted view of Houston used as the starting point of the fly-in. */
export const HOUSTON_OVERVIEW = { center: [-95.3698, 29.7604] as [number, number], zoom: 9.3, pitch: 58, bearing: -24 };

export function ringsGeoJson(center: LatLng, radiusMiles = DEFAULT_SEARCH_RADIUS_MILES) {
  return {
    type: 'FeatureCollection' as const,
    features: [radiusMiles].map((radius) => ({
      type: 'Feature' as const,
      properties: { radius },
      geometry: { type: 'Polygon' as const, coordinates: [circleRing(center, radius)] },
    })),
  };
}

/** Label the single selected distance on the near side of the boundary. */
export function ringLabelPoints(center: LatLng, radiusMiles = DEFAULT_SEARCH_RADIUS_MILES) {
  // On the near (south) side of the rings: the tilted camera looks north, so the rings are spread
  // furthest apart there and the labels don't stack.
  return [radiusMiles].map((radius) => ({ radius, point: destinationPoint(center, 195, radius) }));
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

/** Wall thickness of the 3D rings, in miles (~45 m). */
const WALL_MILES = 0.028;
/** Keep the selected boundary visible without suggesting different exposure zones. */
const RING_WALL_HEIGHT_M = 300;

/** Thin annulus per radius, extruded by MapLibre into a translucent 3D wall. */
export function ringWallsGeoJson(center: LatLng, radiusMiles = DEFAULT_SEARCH_RADIUS_MILES) {
  return {
    type: 'FeatureCollection' as const,
    features: [radiusMiles].map((radius) => ({
      type: 'Feature' as const,
      properties: { radius, h: RING_WALL_HEIGHT_M },
      geometry: {
        type: 'Polygon' as const,
        // Outer ring + reversed inner ring = hole, so only the wall is extruded.
        coordinates: [circleRing(center, radius), circleRing(center, radius - WALL_MILES).reverse()],
      },
    })),
  };
}
