import { describe, expect, it } from 'vitest';
import { haversineMiles } from '../../../../shared/geo';
import { ringsGeoJson, ringWallsGeoJson, ringLabelPoints } from './mapGeo';

const center = {lat:29.7683,lng:-95.30897};
describe('selected distance boundary', () => {
  it.each([1,10])('draws one boundary and label at %i miles', radius => {
    const ring = ringsGeoJson(center, radius);
    expect(ring.features).toHaveLength(1);
    for (const [lng,lat] of ring.features[0]!.geometry.coordinates[0]!) {
      expect(haversineMiles(center,{lat,lng})).toBeCloseTo(radius,6);
    }
    const walls = ringWallsGeoJson(center,radius);
    expect(walls.features).toHaveLength(1);
    for (const [lng,lat] of walls.features[0]!.geometry.coordinates[0]!) {
      expect(haversineMiles(center,{lat,lng})).toBeCloseTo(radius,6);
    }
    const labels = ringLabelPoints(center,radius);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.radius).toBe(radius);
    expect(haversineMiles(center,labels[0]!.point)).toBeCloseTo(radius,6);
  });
});
