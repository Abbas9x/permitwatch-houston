import { describe, expect, it } from 'vitest';
import {
  angularDifference,
  bearingDegrees,
  boundingBox,
  circleRing,
  compassPoint,
  destinationPoint,
  haversineMiles,
} from './geo.js';

const UH = { lat: 29.7199, lng: -95.3422 }; // University of Houston
const DOWNTOWN = { lat: 29.7604, lng: -95.3698 }; // Houston City Hall area

describe('haversineMiles', () => {
  it('is zero for the same point', () => {
    expect(haversineMiles(UH, UH)).toBe(0);
  });

  it('matches a known distance (1 degree of latitude ≈ 69.09 mi)', () => {
    expect(haversineMiles({ lat: 29, lng: -95 }, { lat: 30, lng: -95 })).toBeCloseTo(69.09, 1);
  });

  it('matches the UH → downtown distance (~3.25 mi)', () => {
    expect(haversineMiles(UH, DOWNTOWN)).toBeCloseTo(3.25, 1);
  });

  it('is symmetric', () => {
    expect(haversineMiles(UH, DOWNTOWN)).toBeCloseTo(haversineMiles(DOWNTOWN, UH), 10);
  });

  it('handles antipodal points without NaN', () => {
    expect(haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * 3958.7613, 3);
  });
});

describe('bearingDegrees + compassPoint', () => {
  const origin = { lat: 29.76, lng: -95.37 };
  it.each([
    [{ lat: 29.86, lng: -95.37 }, 0, 'N'],
    [{ lat: 29.76, lng: -95.27 }, 90, 'E'],
    [{ lat: 29.66, lng: -95.37 }, 180, 'S'],
    [{ lat: 29.76, lng: -95.47 }, 270, 'W'],
  ])('points to %o at ~%i° (%s)', (target, expected, compass) => {
    const bearing = bearingDegrees(origin, target);
    expect(angularDifference(bearing, expected)).toBeLessThan(0.1);
    expect(compassPoint(bearing)).toBe(compass);
  });

  it('downtown is north-west of UH', () => {
    expect(compassPoint(bearingDegrees(UH, DOWNTOWN))).toBe('NW');
  });

  it('uses 45° sectors with boundaries at 22.5°', () => {
    expect(compassPoint(22.4)).toBe('N');
    expect(compassPoint(22.6)).toBe('NE');
    expect(compassPoint(337.6)).toBe('N');
    expect(compassPoint(359.9)).toBe('N');
    expect(compassPoint(-45)).toBe('NW');
    expect(compassPoint(720 + 180)).toBe('S');
  });
});

describe('angularDifference', () => {
  it('wraps around north', () => {
    expect(angularDifference(350, 10)).toBe(20);
    expect(angularDifference(10, 350)).toBe(20);
    expect(angularDifference(0, 180)).toBe(180);
    expect(angularDifference(90, 90)).toBe(0);
  });
});

describe('boundingBox / destinationPoint / circleRing', () => {
  it('bounding box contains every point on the circle', () => {
    const box = boundingBox(UH, 3);
    for (let b = 0; b < 360; b += 15) {
      const p = destinationPoint(UH, b, 3);
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat - 1e-9);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat + 1e-9);
      expect(p.lng).toBeGreaterThanOrEqual(box.minLng - 1e-9);
      expect(p.lng).toBeLessThanOrEqual(box.maxLng + 1e-9);
    }
  });

  it('destination point is the requested distance away', () => {
    const p = destinationPoint(UH, 37, 2);
    expect(haversineMiles(UH, p)).toBeCloseTo(2, 6);
    expect(bearingDegrees(UH, p)).toBeCloseTo(37, 3);
  });

  it('circle ring is closed and every vertex is on the circle', () => {
    const ring = circleRing(UH, 1, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]![0]).toBeCloseTo(ring[32]![0], 9);
    for (const [lng, lat] of ring) expect(haversineMiles(UH, { lat, lng })).toBeCloseTo(1, 6);
  });
});
