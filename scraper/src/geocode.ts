// Fallback coordinates for records with a street address but no map link:
// the free U.S. Census geocoder first, then OpenStreetMap's Nominatim. Only
// an unambiguous, exact result is used; otherwise there are no coordinates.

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

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: "census" | "nominatim";
}

/** Note to add to a record placed by Nominatim; OpenStreetMap's license requires the credit. */
export const NOMINATIM_NOTE = "Coordinates from the OpenStreetMap Nominatim geocoder (© OpenStreetMap contributors).";

export async function geocode(oneLineAddress: string): Promise<GeocodeResult | null> {
  const census = await geocodeCensus(oneLineAddress);
  if (census) return { ...census, source: "census" };
  const osm = await geocodeNominatim(oneLineAddress);
  return osm ? { ...osm, source: "nominatim" } : null;
}

async function geocodeCensus(oneLineAddress: string): Promise<{ lat: number; lng: number } | null> {
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

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  lat: string;
  lon: string;
  address?: { house_number?: string };
}

// Nominatim often falls back to the street itself when it doesn't know the
// house number, which on a long road can be miles off. So only a single
// result with a matched house number counts. Searches are limited to Harris
// County. Usage policy: at most 1 request per second, identified, cached;
// cachedGet handles all three.
async function geocodeNominatim(oneLineAddress: string): Promise<{ lat: number; lng: number } | null> {
  // Census queries end in "TX [zip]"; Nominatim matches the full state name more reliably.
  const query = oneLineAddress.replace(/, TX(?= |$)/, ", Texas");
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    countrycodes: "us",
    viewbox: `${HARRIS_BBOX.minLng},${HARRIS_BBOX.maxLat},${HARRIS_BBOX.maxLng},${HARRIS_BBOX.minLat}`,
    bounded: "1",
  })}`;
  const cacheName = createHash("sha1").update(query).digest("hex").slice(0, 16);
  const body = await cachedGet(url, join(RAW_DIR, "nominatim", `${cacheName}.json`));
  if (!body) return null;

  const exact = (JSON.parse(body.toString("utf8")) as NominatimResult[]).filter((r) => r.address?.house_number);
  if (exact.length !== 1) return null;
  const lat = Number(exact[0].lat);
  const lng = Number(exact[0].lon);
  return inHarrisBbox(lat, lng) ? { lat, lng } : null;
}
