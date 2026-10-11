// Step 5: already-permitted concrete batch plants in the Houston area.
//
// Source: TCEQ's NSR Air Permits search (www2.tceq.texas.gov/airperm), queried
// for TCEQ Region 12, permit type STANDARD PERMIT, unit type CONCRETE BATCH
// PLANTS, completed projects, plain-text output. Each result row is one
// project (initial, renewal, amendment...) on a permit; a permit is "existing"
// when its permit status is EFFECTIVE. The search has no coordinates, so
// addresses are geocoded in one batch (see geocode.ts).
//
// Usage: npm run existing [-- --refresh]

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { nowIso } from "./extract.js";
import { NOMINATIM_NOTE, geocodeMany, isStreetAddress } from "./geocode.js";
import { RAW_DIR, cachedPostForm } from "./http.js";
import { makeId } from "./ids.js";
import { TCEQ_REGION, inRegion } from "./region.js";
import type { ConcretePlant, PermitType } from "./types.js";

const SEARCH_URL = "https://www2.tceq.texas.gov/airperm/index.cfm";
const SEARCH_START_URL = `${SEARCH_URL}?fuseaction=airpermits.start`;

// One search per TCEQ region; only Region 12 (Houston) for now.
const REGIONS = [TCEQ_REGION];
// The search silently stops at this many rows.
const RESULT_CAP = 7000;

export const searchCachePath = (region: string) => join(RAW_DIR, "existing", `nsr-region-${region.padStart(2, "0")}.html`);

export const EXISTING_SOURCE = "TCEQ NSR Air Permits search";
export const EXISTING_SOURCE_URL = SEARCH_START_URL;

// Unit type 8471 is "CONCRETE BATCH PLANTS" in the search form's list.
export const SEARCH_FORM = new URLSearchParams({
  RequestTimeout: "3000",
  loc_cnty_name: "0",
  proj_id: "",
  tnrcc_region_cd: "0",
  addn_num_txt: "",
  addn_id_typ_txt: "STDPMT",
  cn_issue_to_txt: "",
  proj_typ_txt: "",
  cn_ref_num_txt: "",
  account: "",
  unit_id: "8471",
  rn_ref_num_txt: "",
  proj_status_txt: "COMPLETE",
  date_option: "0",
  date_range_from: "",
  date_range_to: "",
  sort_dir: "asc",
  program: "NSR",
  order_by: "proj_id",
  out_form: "text",
  // The search button is an image input named "_fuseaction=airpermits.validate_search_criteria".
  "_fuseaction=airpermits.validate_search_criteria.x": "10",
  "_fuseaction=airpermits.validate_search_criteria.y": "10",
});

const FIELDS = [
  "programArea", "permitNumber", "permitType", "permitStatus", "projectNumber", "customerName",
  "legalName", "cnNumber", "projectType", "receivedDate", "completeDate", "renewalDate",
  "projectStatus", "projectName", "regulatedEntity", "physicalLocation", "regionName",
  "countyName", "nearCityName",
] as const;

type ProjectRow = Record<(typeof FIELDS)[number], string>;

/** One row per project, as printed. */
export function parseSearchResults(html: string): ProjectRow[] {
  const text = cheerio.load(html).text();
  if (/There\s+are\s+no\s+projects\s+for\s+the\s+criteria/.test(text)) return [];
  const headerEnd = text.indexOf("Near City Name|");
  if (headerEnd < 0) throw new Error("NSR search results: header row not found (did the search fail?)");
  // Every record starts with the program area "NSR|"; fields never contain "|".
  return text
    .slice(headerEnd)
    .split(/\n\s*NSR\|/)
    .slice(1)
    .map((rec) => {
      const values = ["NSR", ...rec.split("|").map((v) => v.replace(/\s+/g, " ").trim())];
      return Object.fromEntries(FIELDS.map((f, i) => [f, values[i] ?? ""])) as ProjectRow;
    });
}

/** Run the NSR search with some form fields changed; the result is cached at `cacheName` under data/raw/existing/. */
export async function searchNsr(overrides: Record<string, string>, cacheName: string): Promise<ProjectRow[]> {
  const form = new URLSearchParams(SEARCH_FORM);
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  const html = (await cachedPostForm(SEARCH_URL, form, SEARCH_START_URL, join(RAW_DIR, "existing", cacheName))).toString("utf8");
  const rows = parseSearchResults(html);
  if (rows.length >= RESULT_CAP) throw new Error(`NSR search ${cacheName} returned ${rows.length} rows, the search's cap; results are incomplete.`);
  return rows;
}

/** Every completed concrete plant project in the searched regions, one search per region. */
export async function loadAllProjects(): Promise<ProjectRow[]> {
  const rows: ProjectRow[] = [];
  for (const region of REGIONS) {
    const form = new URLSearchParams(SEARCH_FORM);
    form.set("tnrcc_region_cd", region);
    const html = (await cachedPostForm(SEARCH_URL, form, SEARCH_START_URL, searchCachePath(region))).toString("utf8");
    const regionRows = parseSearchResults(html);
    if (regionRows.length >= RESULT_CAP) {
      throw new Error(`Region ${region} returned ${regionRows.length} rows, the search's cap; results are incomplete. Split this region further.`);
    }
    rows.push(...regionRows);
  }
  return rows;
}

// "HARRIS" -> "Harris", "FORT BEND" -> "Fort Bend", "MCLENNAN" -> "McLennan", "DEWITT" -> "DeWitt"
export function countyName(upper: string): string | null {
  if (!upper) return null;
  return upper
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`)
    .replace(/^Dewitt$/, "DeWitt");
}

// MM/DD/YYYY -> YYYY-MM-DD
function toIsoDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

const PROJECT_TYPES: Record<string, PermitType> = {
  INITIAL: "new",
  RENEWAL: "renewal",
  RENEWNOTIC: "renewal",
  AMEND: "amendment",
  REVISION: "amendment",
};

/** Build one existing plant per EFFECTIVE permit in the region, from its most recently received project. */
export async function extractExisting(scrapedAt: string): Promise<ConcretePlant[]> {
  const rows = await loadAllProjects();

  const byPermit = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    if (row.permitStatus !== "EFFECTIVE" || !row.permitNumber || !inRegion(countyName(row.countyName))) continue;
    byPermit.set(row.permitNumber, [...(byPermit.get(row.permitNumber) ?? []), row]);
  }
  const latestByPermit = new Map(
    [...byPermit].map(([permit, projects]) => [
      permit,
      projects.reduce((a, b) => ((toIsoDate(b.receivedDate) ?? "") > (toIsoDate(a.receivedDate) ?? "") ? b : a)),
    ]),
  );

  // Geocode every street address in one batch.
  const toGeocode = [...latestByPermit]
    .filter(([, p]) => isStreetAddress(p.physicalLocation))
    .map(([permit, p]) => ({ id: permit, street: p.physicalLocation, city: p.nearCityName || null }));
  const geocoded = await geocodeMany(toGeocode);

  const plants: ConcretePlant[] = [];
  for (const [permitNumber, latest] of latestByPermit) {
    const address = latest.physicalLocation || null;
    const result = geocoded.get(permitNumber);
    const name = latest.projectName || null;
    plants.push({
      id: makeId(permitNumber, name, address),
      permitNumber,
      name,
      operator: latest.customerName || null,
      address,
      city: latest.nearCityName || null,
      county: countyName(latest.countyName),
      zip: null,
      lat: result?.lat ?? null,
      lng: result?.lng ?? null,
      locationSource: result ? "geocoded" : null,
      status: "existing",
      // From the most recent project on the permit.
      permitType: PROJECT_TYPES[latest.projectType] ?? null,
      dateReceived: toIsoDate(latest.receivedDate),
      commentDeadline: null,
      productionRate: null,
      noticeUrl: null,
      scrapedAt,
      notes: result?.source === "nominatim" ? NOMINATIM_NOTE : null,
    });
  }

  const mapped = plants.filter((p) => p.lat !== null).length;
  console.log(`${rows.length} completed concrete plant projects in the NSR permit search`);
  console.log(`  ${plants.length} permits with status EFFECTIVE in the region, ${mapped} with coordinates`);
  return plants;
}

async function main() {
  const plants = await extractExisting(nowIso());
  for (const p of plants) {
    console.log(`  ${p.id} | ${p.name} | ${p.address}, ${p.city} | ${p.lat},${p.lng} | ${p.permitType} ${p.dateReceived}${p.notes ? ` | ${p.notes}` : ""}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
