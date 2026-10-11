// Coordinates for records with a street address but no map link: the free
// U.S. Census geocoder first, then OpenStreetMap's Nominatim. Only an
// unambiguous, exact result is used; otherwise there are no coordinates.
//
// For many addresses at once, geocodeMany sends them all to the Census batch
// geocoder in one upload and only falls back to Nominatim (1 request per
// second) for the ones Census can't match.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { RAW_DIR, cachedGet, cachedPost } from "./http.js";

// Texas's extent, rounded outward.
export const TEXAS_BBOX = { minLat: 25.8, maxLat: 36.6, minLng: -106.7, maxLng: -93.5 };

export function inTexasBbox(lat: number, lng: number): boolean {
  const { minLat, maxLat, minLng, maxLng } = TEXAS_BBOX;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

/** Great-circle distance in miles. */
export function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/**
 * Whether text looks like a street address ("4101 FM 1942") rather than
 * driving directions ("35W N FROM FT WORTH ... GO E ON LOOP 288 5 MI ...").
 */
export function isStreetAddress(text: string | null | undefined): text is string {
  if (!text || text.length > 80 || !/^\d+[A-Z]?\s+\S/.test(text)) return false;
  return !/\b(FROM|INTX|INTERSECTION|TURN|TRAVEL|HEAD|APPROX\w*|MILES?|MI)\b/i.test(text);
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
  const osm = await tryNominatim(oneLineAddress);
  return osm ? { ...osm, source: "nominatim" } : null;
}

export interface AddressToGeocode {
  id: string;
  street: string;
  city: string | null;
  zip?: string | null;
}

/** Geocode many Texas addresses: one Census batch upload, then Nominatim for the misses. */
export async function geocodeMany(items: AddressToGeocode[]): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();
  for (let i = 0; i < items.length; i += CENSUS_BATCH_LIMIT) {
    for (const [id, coords] of await geocodeCensusBatch(items.slice(i, i + CENSUS_BATCH_LIMIT))) {
      results.set(id, { ...coords, source: "census" });
    }
  }
  const misses = items.filter((item) => !results.has(item.id));
  console.log(`  Census batch geocoder matched ${results.size} of ${items.length}; trying OpenStreetMap for ${misses.length}`);
  for (const [n, item] of misses.entries()) {
    const osm = await tryNominatim([item.street, item.city, `TX ${item.zip ?? ""}`.trim()].filter(Boolean).join(", "));
    if (osm) results.set(item.id, { ...osm, source: "nominatim" });
    if ((n + 1) % 50 === 0) console.log(`  OpenStreetMap: ${n + 1}/${misses.length}`);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Census

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const CENSUS_BATCH_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const CENSUS_BATCH_LIMIT = 10000;

interface CensusResponse {
  result?: { addressMatches?: { coordinates: { x: number; y: number } }[] };
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

const csvField = (s: string | null | undefined) => `"${(s ?? "").replace(/"/g, "'")}"`;

/** Parse one CSV line with quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// The batch geocoder takes a CSV of "id,street,city,state,zip" and returns one
// line per address: id, input, Match/No_Match/Tie, Exact/Non_Exact, matched
// address, "lon,lat", ... Only "Match" counts; a "Tie" is ambiguous.
async function geocodeCensusBatch(items: AddressToGeocode[]): Promise<Map<string, { lat: number; lng: number }>> {
  const csv = items.map((i) => [csvField(i.id), csvField(i.street), csvField(i.city), '"TX"', csvField(i.zip)].join(",")).join("\n") + "\n";
  const form = new FormData();
  form.append("benchmark", "Public_AR_Current");
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  const cacheName = createHash("sha1").update(csv).digest("hex").slice(0, 16);
  const body = await cachedPost(CENSUS_BATCH_URL, form, join(RAW_DIR, "geocode", `batch-${cacheName}.csv`));

  const results = new Map<string, { lat: number; lng: number }>();
  for (const line of body.toString("utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [id, , status, , , lonLat] = parseCsvLine(line);
    if (status !== "Match" || !lonLat) continue;
    const [lng, lat] = lonLat.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && inTexasBbox(lat, lng)) results.set(id, { lat, lng });
  }
  return results;
}

// ---------------------------------------------------------------------------
// OpenStreetMap Nominatim

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  lat: string;
  lon: string;
  address?: { house_number?: string };
}

/** Nominatim, but a rejected or failed query means "no match" instead of stopping the run. */
async function tryNominatim(oneLineAddress: string): Promise<{ lat: number; lng: number } | null> {
  try {
    return await geocodeNominatim(oneLineAddress);
  } catch (err) {
    console.warn(`  OpenStreetMap lookup skipped: ${(err as Error).message.slice(0, 100)}`);
    return null;
  }
}

// Nominatim often falls back to the street itself when it doesn't know the
// house number, which on a long road can be miles off. So only a single
// result with a matched house number counts. Searches are limited to Texas.
// Usage policy: at most 1 request per second, identified, cached; cachedGet
// handles all three.
async function geocodeNominatim(oneLineAddress: string): Promise<{ lat: number; lng: number } | null> {
  // Census queries end in "TX [zip]"; Nominatim matches the full state name more reliably.
  const query = oneLineAddress.replace(/, TX(?= |$)/, ", Texas");
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    countrycodes: "us",
    viewbox: `${TEXAS_BBOX.minLng},${TEXAS_BBOX.maxLat},${TEXAS_BBOX.maxLng},${TEXAS_BBOX.minLat}`,
    bounded: "1",
  })}`;
  const cacheName = createHash("sha1").update(query).digest("hex").slice(0, 16);
  const body = await cachedGet(url, join(RAW_DIR, "nominatim", `${cacheName}.json`));
  if (!body) return null;

  const exact = (JSON.parse(body.toString("utf8")) as NominatimResult[]).filter((r) => r.address?.house_number);
  if (exact.length !== 1) return null;
  const lat = Number(exact[0].lat);
  const lng = Number(exact[0].lon);
  return inTexasBbox(lat, lng) ? { lat, lng } : null;
}
