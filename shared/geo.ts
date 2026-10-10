export interface LatLng {
  lat: number;
  lng: number;
}

/** IUGG mean Earth radius (6371.0088 km) in statute miles. */
export const EARTH_RADIUS_MILES = 3958.7613;

/** Search radii shown in the UI, in miles. */
export const SEARCH_RADII_MILES = [1, 2, 3] as const;
export const MAX_SEARCH_RADIUS_MILES = 3;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in miles (haversine formula). */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from `from` to `to`, in degrees clockwise from true north [0, 360). */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const phi1 = toRad(from.lat);
  const phi2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Maps a bearing to one of 8 compass points (each covers a 45° sector centred on its direction). */
export function compassPoint(bearing: number): CompassPoint {
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return COMPASS_POINTS[index]!;
}

/** Smallest absolute difference between two bearings, in degrees [0, 180]. */
export function angularDifference(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/** Lat/lng box that fully contains a circle of `radiusMiles` around `center` (for SQL prefiltering). */
export function boundingBox(center: LatLng, radiusMiles: number) {
  const latDelta = toDeg(radiusMiles / EARTH_RADIUS_MILES);
  const lngDelta = toDeg(radiusMiles / (EARTH_RADIUS_MILES * Math.max(Math.cos(toRad(center.lat)), 1e-6)));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/** Point at `distanceMiles` along `bearing` from `origin` (used to draw radius rings). */
export function destinationPoint(origin: LatLng, bearing: number, distanceMiles: number): LatLng {
  const delta = distanceMiles / EARTH_RADIUS_MILES;
  const theta = toRad(bearing);
  const phi1 = toRad(origin.lat);
  const lambda1 = toRad(origin.lng);
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lambda2 =
    lambda1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
  return { lat: toDeg(phi2), lng: ((toDeg(lambda2) + 540) % 360) - 180 };
}

/** Closed ring of [lng, lat] pairs approximating a circle (GeoJSON order). */
export function circleRing(center: LatLng, radiusMiles: number, steps = 96): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destinationPoint(center, (i / steps) * 360, radiusMiles);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

/** Texas bounding box with a small margin. Points outside it are almost always data errors (e.g. swapped lat/lng). */
export const TEXAS_BOUNDS = { minLat: 25.8, maxLat: 36.6, minLng: -106.7, maxLng: -93.5 } as const;

export function isInTexasBounds(p: LatLng): boolean {
  return p.lat >= TEXAS_BOUNDS.minLat && p.lat <= TEXAS_BOUNDS.maxLat && p.lng >= TEXAS_BOUNDS.minLng && p.lng <= TEXAS_BOUNDS.maxLng;
}
