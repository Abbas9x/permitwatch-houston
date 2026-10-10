// Step 5: already-permitted concrete batch plants in Harris County.
//
// Source: TCEQ's NSR Air Permits search (www2.tceq.texas.gov/airperm), queried
// for county HARRIS, permit type STANDARD PERMIT, unit type CONCRETE BATCH
// PLANTS, completed projects, plain-text output. Each result row is one
// project (initial, renewal, amendment...) on a permit; a permit is "existing"
// when its permit status is EFFECTIVE. The search has no coordinates, so
// addresses are geocoded with the Census geocoder.
//
// Usage: npm run existing [-- --refresh]

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { loadManualLocations, nowIso } from "./extract.js";
import { geocode, inHarrisBbox } from "./geocode.js";
import { RAW_DIR, cachedPostForm } from "./http.js";
import { makeId } from "./ids.js";
import type { PermitType, Plant } from "./types.js";

const SEARCH_URL = "https://www2.tceq.texas.gov/airperm/index.cfm";
const SEARCH_START_URL = `${SEARCH_URL}?fuseaction=airpermits.start`;
const CACHE_PATH = join(RAW_DIR, "existing", "nsr-harris-cbp.html");

export const EXISTING_SOURCE = `TCEQ NSR Air Permits search (${SEARCH_START_URL}): Harris County standard permits for concrete batch plants with permit status EFFECTIVE`;

// Unit type 8471 is "CONCRETE BATCH PLANTS" in the search form's list.
const SEARCH_FORM = new URLSearchParams({
  RequestTimeout: "3000",
  loc_cnty_name: "HARRIS",
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

/** Build one existing Plant per EFFECTIVE permit, from its most recently received project. */
export async function extractExistingHarris(scrapedAt: string): Promise<Plant[]> {
  const html = (await cachedPostForm(SEARCH_URL, SEARCH_FORM, SEARCH_START_URL, CACHE_PATH)).toString("utf8");
  const rows = parseSearchResults(html);

  const byPermit = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    if (row.permitStatus !== "EFFECTIVE" || row.countyName !== "HARRIS" || !row.permitNumber) continue;
    byPermit.set(row.permitNumber, [...(byPermit.get(row.permitNumber) ?? []), row]);
  }

  const manualLocations = await loadManualLocations();
  const plants: Plant[] = [];
  let geocoded = 0;
  for (const [permitNumber, projects] of byPermit) {
    const latest = projects.reduce((a, b) =>
      (toIsoDate(b.receivedDate) ?? "") > (toIsoDate(a.receivedDate) ?? "") ? b : a,
    );
    const address = latest.physicalLocation || null;
    const city = latest.nearCityName || null;
    const notes: string[] = [];

    let coords: { lat: number; lng: number } | null = null;
    let locationSource: Plant["locationSource"] = null;
    const manual = manualLocations[permitNumber];
    if (manual) {
      coords = { lat: manual.lat, lng: manual.lng };
      locationSource = "manual";
      notes.push(manual.note);
    } else if (address && /^\d/.test(address)) {
      coords = await geocode([address, city, "TX"].filter(Boolean).join(", "));
      if (coords && !inHarrisBbox(coords.lat, coords.lng)) {
        notes.push(`The Census geocoder placed this address outside Harris County (${coords.lat}, ${coords.lng}), so no coordinates are given.`);
        coords = null;
      } else if (!coords) {
        notes.push("The Census geocoder found no single match for the address.");
      }
    } else {
      notes.push("The permit search gives no street address, so the location could not be geocoded.");
    }
    if (coords && !locationSource) {
      locationSource = "geocoded";
      geocoded++;
    }

    const name = latest.projectName || null;
    plants.push({
      id: makeId(permitNumber, name, address),
      permitNumber,
      category: "concrete_batch_plant",
      name,
      operator: latest.customerName || null,
      address,
      city,
      county: "Harris",
      zip: (locationSource === "manual" ? manual?.zip : undefined) ?? null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      locationSource,
      status: "existing",
      // From the most recent project on the permit.
      permitType: PROJECT_TYPES[latest.projectType] ?? null,
      dateReceived: toIsoDate(latest.receivedDate),
      commentDeadline: null,
      productionRate: null,
      emissions: [],
      noticeUrl: null,
      scrapedAt,
      notes: notes.length ? notes.join(" ") : null,
    });
  }

  console.log(`${rows.length} completed Harris County concrete plant projects in the NSR permit search`);
  console.log(`  ${byPermit.size} permits with status EFFECTIVE, ${geocoded} geocoded`);
  return plants;
}

async function main() {
  const plants = await extractExistingHarris(nowIso());
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
