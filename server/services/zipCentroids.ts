import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { LatLng } from '../../shared/geo.js';

const FileSchema = z.object({
  _source: z.string(),
  zips: z.record(z.string().regex(/^\d{5}$/), z.tuple([z.number(), z.number()])),
});

export interface ZipCentroids {
  get(zip: string): LatLng | undefined;
  readonly source: string;
  readonly size: number;
}

/**
 * Texas ZIP Code Tabulation Area internal points from the U.S. Census Bureau 2026 Gazetteer
 * (public domain). Used only as an approximate fallback location.
 */
export function loadZipCentroids(path = resolve(process.cwd(), 'data/zcta-centroids-tx.json')): ZipCentroids {
  const parsed = FileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const map = new Map(Object.entries(parsed.zips).map(([zip, [lat, lng]]) => [zip, { lat, lng }]));
  return {
    get: (zip) => map.get(zip),
    source: parsed._source,
    size: map.size,
  };
}

export function zipCentroidsFrom(entries: Record<string, LatLng>): ZipCentroids {
  const map = new Map(Object.entries(entries));
  return { get: (zip) => map.get(zip), source: 'test', size: map.size };
}
