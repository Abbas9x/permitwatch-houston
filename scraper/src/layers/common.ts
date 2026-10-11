// Shared helpers for the site layers: paged ArcGIS queries, EPA ECHO queries,
// CSV parsing, and county names. All requests go through the polite, cached
// HTTP helper.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { RAW_DIR, cachedGet } from "../http.js";
import { REGION_COUNTIES, inRegionBbox } from "../region.js";
import type { Category, Site, SiteStatus } from "../types.js";

export const LAYERS_DIR = join(RAW_DIR, "layers");

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------
// Counties

const BY_UPPER = new Map(Object.keys(REGION_COUNTIES).map((c) => [c.toUpperCase(), c]));
const BY_FIPS = new Map(Object.entries(REGION_COUNTIES).map(([name, fips]) => [fips, name]));

/** "HARRIS", "Harris County", "harris" -> "Harris"; null when not one of our 13 counties. */
export function regionCounty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return BY_UPPER.get(raw.toUpperCase().replace(/\s+COUNTY$/, "").trim()) ?? null;
}

/** "48201" or "201" -> "Harris"; null when not one of our 13 counties. */
export function countyFromFips(fips: string | number | null | undefined): string | null {
  if (fips === null || fips === undefined) return null;
  const s = String(fips).padStart(3, "0");
  return BY_FIPS.get(s.length === 5 && s.startsWith("48") ? s.slice(2) : s) ?? null;
}

/** The 13 county names, uppercase, as an SQL list: 'AUSTIN','BRAZORIA',... */
export const COUNTY_SQL_UPPER = Object.keys(REGION_COUNTIES).map((c) => `'${c.toUpperCase()}'`).join(",");
/** The 13 county names as written: 'Austin','Brazoria',... */
export const COUNTY_SQL = Object.keys(REGION_COUNTIES).map((c) => `'${c}'`).join(",");

// ---------------------------------------------------------------------------
// Small value helpers

/** Trimmed string, or null for empty / placeholder values like "NOT AVAILABLE". */
export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || /^(NOT AVAILABLE|N\/A|NA|NULL|-999999|-9999)$/i.test(s) ? null : s;
}

/** Finite number, or null (also for placeholders like -999999). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > -9999 ? n : null;
}

/** ArcGIS epoch milliseconds or "MM/DD/YYYY" -> "YYYY-MM-DD", else null. */
export function isoDate(v: unknown): string | null {
  if (typeof v === "number" && v > 0) return new Date(v).toISOString().slice(0, 10);
  const s = str(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** 5-digit ZIP from "77045", "77045-1234", 77045; else null. */
export function zip5(v: unknown): string | null {
  const m = str(v)?.match(/^(\d{5})/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// ArcGIS REST

export interface ArcgisFeature {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number; paths?: number[][][]; rings?: number[][][] };
}

/**
 * All features matching `where` from an ArcGIS FeatureServer/MapServer layer,
 * in WGS84, paging with resultOffset. `pageSize` must not exceed the
 * service's maxRecordCount.
 */
export async function arcgisQuery(
  layerUrl: string,
  options: { where: string; outFields?: string; pageSize?: number; geometry?: boolean; orderBy?: string; extra?: Record<string, string> },
): Promise<ArcgisFeature[]> {
  const pageSize = options.pageSize ?? 1000;
  const features: ArcgisFeature[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      where: options.where,
      outFields: options.outFields ?? "*",
      returnGeometry: String(options.geometry ?? true),
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      ...(options.orderBy ? { orderByFields: options.orderBy } : {}),
      f: "json",
      ...options.extra,
    });
    const url = `${layerUrl}/query?${params}`;
    const body = await cachedGet(url, join(LAYERS_DIR, "arcgis", `${hash(url)}.json`));
    if (!body) throw new Error(`${layerUrl}: 404`);
    const page = JSON.parse(body.toString("utf8")) as { features?: ArcgisFeature[]; exceededTransferLimit?: boolean; error?: { message: string } };
    if (page.error) throw new Error(`${layerUrl}: ${page.error.message}`);
    features.push(...(page.features ?? []));
    if ((page.features?.length ?? 0) < pageSize && !page.exceededTransferLimit) break;
  }
  return features;
}

/** A representative point for a feature: the point itself, or the middle vertex of a line/polygon. */
export function featurePoint(f: ArcgisFeature): { lat: number; lng: number } | null {
  const g = f.geometry;
  if (!g) return null;
  if (typeof g.x === "number" && typeof g.y === "number") return { lat: g.y, lng: g.x };
  const vertices = (g.paths ?? g.rings ?? []).flat();
  if (!vertices.length) return null;
  // The vertex nearest the average, so the point lies on the feature itself.
  const avg = vertices.reduce(([sx, sy], [x, y]) => [sx + x / vertices.length, sy + y / vertices.length], [0, 0]);
  const best = vertices.reduce((a, b) => (Math.hypot(a[0] - avg[0], a[1] - avg[1]) <= Math.hypot(b[0] - avg[0], b[1] - avg[1]) ? a : b));
  return { lat: best[1], lng: best[0] };
}

// ---------------------------------------------------------------------------
// EPA ECHO (no key). A search returns a QueryID; get_qid pages through the
// results with the columns we ask for. Column IDs come from the service's own
// metadata, looked up by name.

const ECHO = "https://echodata.epa.gov/echo";

async function echoJson(url: string): Promise<Record<string, unknown>> {
  const body = await cachedGet(url, join(LAYERS_DIR, "echo", `${hash(url)}.json`));
  if (!body) throw new Error(`${url}: 404`);
  return JSON.parse(body.toString("utf8"));
}

/**
 * ECHO facilities for `service` (e.g. "cwa_rest_services", "rcra_rest_services",
 * "echo_rest_services") matching `params`, one query per county FIPS code.
 * Returns one object per facility keyed by ECHO's ObjectName (e.g. FacLat).
 */
export async function echoFacilities(
  service: string,
  params: Record<string, string>,
  columns: string[],
): Promise<Record<string, string | null>[]> {
  const meta = (await echoJson(`${ECHO}/${service}.metadata?output=JSON`)) as {
    Results: { ResultColumns: { ObjectName: string; ColumnID: string }[] };
  };
  const ids = columns.map((name) => {
    const col = meta.Results.ResultColumns.find((c) => c.ObjectName === name);
    if (!col) throw new Error(`ECHO ${service}: no column ${name}`);
    return col.ColumnID;
  });

  const rows: Record<string, string | null>[] = [];
  for (const fips of Object.values(REGION_COUNTIES)) {
    const search = (await echoJson(`${ECHO}/${service}.get_facilities?${new URLSearchParams({ output: "JSON", p_fips: `48${fips}`, ...params })}`)) as {
      Results: { QueryID?: string; QueryRows?: string; Error?: { ErrorMessage: string } };
    };
    if (search.Results.Error) throw new Error(`ECHO ${service}: ${search.Results.Error.ErrorMessage}`);
    const qid = search.Results.QueryID;
    const total = Number(search.Results.QueryRows ?? 0);
    if (!qid || total === 0) continue;
    let fetched = 0;
    for (let page = 1; fetched < total; page++) {
      const res = (await echoJson(`${ECHO}/${service}.get_qid?${new URLSearchParams({ output: "JSON", qid, pageno: String(page), qcolumns: ids.join(",") })}`)) as {
        Results: { Facilities?: Record<string, string | null>[] };
      };
      const facilities = res.Results.Facilities ?? [];
      if (facilities.length === 0) break;
      rows.push(...facilities);
      fetched += facilities.length;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CSV

/** Parse CSV text with quoted fields (including commas and doubled quotes inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Building sites

export interface SiteInput {
  id: string;
  category: Category;
  name: string | null;
  operator?: string | null;
  address?: string | null;
  city?: string | null;
  /** Raw county from the source; normalized with regionCounty. */
  county: string | null;
  zip?: string | null;
  lat: number | null;
  lng: number | null;
  status: SiteStatus;
  sourceUrl: string | null;
  source: string;
  notes?: string | null;
  details: Record<string, unknown>;
}

/** A Site with coordinates from the source, or null when it's outside the 13 counties or has no usable location. */
export function sourceSite(input: SiteInput, scrapedAt: string): Site | null {
  const county = regionCounty(input.county);
  if (!county || input.lat === null || input.lng === null || !inRegionBbox(input.lat, input.lng)) return null;
  return {
    id: input.id,
    category: input.category,
    name: input.name,
    operator: input.operator ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    county,
    zip: input.zip ?? null,
    lat: input.lat,
    lng: input.lng,
    locationSource: "source_data",
    status: input.status,
    sourceUrl: input.sourceUrl,
    source: input.source,
    scrapedAt,
    notes: input.notes ?? null,
    details: input.details,
  };
}

export const notNull = <T>(v: T | null): v is T => v !== null;

export { siteId as siteIdFor } from "../ids.js";

// ---------------------------------------------------------------------------
// County for a point, for sources without a county field (Census geographies
// lookup, cached per rounded point).

export async function countyAt(lat: number, lng: number): Promise<string | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${new URLSearchParams({
    x: lng.toFixed(5),
    y: lat.toFixed(5),
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "Counties",
    format: "json",
  })}`;
  const body = await cachedGet(url, join(LAYERS_DIR, "census-county", `${hash(url)}.json`));
  if (!body) return null;
  const counties = (JSON.parse(body.toString("utf8")) as { result?: { geographies?: { Counties?: { STATE: string; COUNTY: string }[] } } })
    .result?.geographies?.Counties ?? [];
  const c = counties.find((x) => x.STATE === "48");
  return c ? countyFromFips(c.COUNTY) : null;
}
