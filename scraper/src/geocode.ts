// Fallback coordinates from the free U.S. Census geocoder, for records with a
// street address but no map link. Only an unambiguous result is used: zero or
// several matches mean no coordinates.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { RAW_DIR, cachedGet } from "./http.js";

// Harris County's extent, rounded outward to two decimals.
export const HARRIS_BBOX = { minLat: 29.49, maxLat: 30.18, minLng: -95.97, maxLng: -94.9 };

export function inHarrisBbox(lat: number, lng: number): boolean {
  const { minLat, maxLat, minLng, maxLng } = HARRIS_BBOX;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

interface CensusResponse {
  result?: { addressMatches?: { coordinates: { x: number; y: number } }[] };
}

export async function geocode(oneLineAddress: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${CENSUS_URL}?${new URLSearchParams({
    address: oneLineAddress,
    benchmark: "Public_AR_Current",
    format: "json",
  })}`;
  const cacheName = createHash("sha1").update(oneLineAddress).digest("hex").slice(0, 16);
  const body = await cachedGet(url, join(RAW_DIR, "geocode", `${cacheName}.json`));
  if (!body) return null;

  const matches = (JSON.parse(body.toString("utf8")) as CensusResponse).result?.addressMatches ?? [];
  if (matches.length !== 1) return null;
  const { x, y } = matches[0].coordinates;
  return { lat: y, lng: x };
}
