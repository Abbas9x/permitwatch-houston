// Check data/sites.json (and data/demo-addresses.json if present) against the
// contract in data/README.md. Prints every problem found and exits with code 1
// if there are any.
//
// Usage: npm run validate

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { makeId } from "./ids.js";
import { inRegion, inRegionBbox } from "./region.js";
import { CATEGORIES, type DemoAddressesFile, type Site } from "./types.js";

const DATA_PATH = fileURLToPath(new URL("../../data/sites.json", import.meta.url));
const DEMO_PATH = fileURLToPath(new URL("../../data/demo-addresses.json", import.meta.url));

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SITE_FIELDS: (keyof Site)[] = [
  "id", "category", "name", "operator", "address", "city", "county", "zip", "lat", "lng",
  "locationSource", "status", "sourceUrl", "source", "scrapedAt", "notes", "details",
];

const isStringOrNull = (v: unknown) => v === null || typeof v === "string";

/** Checks for the details of each category; see data/README.md. */
const DETAIL_CHECKS: Partial<Record<keyof typeof CATEGORIES, (d: Record<string, unknown>, site: Site) => string[]>> = {
  concrete_batch_plant: (d, site) => {
    const errors: string[] = [];
    for (const f of ["permitNumber", "productionRate"]) if (!isStringOrNull(d[f])) errors.push(`details.${f} must be a string or null`);
    if (![null, "new", "renewal", "amendment"].includes(d.permitType as string | null)) errors.push(`invalid details.permitType ${JSON.stringify(d.permitType)}`);
    for (const f of ["dateReceived", "commentDeadline"]) {
      if (d[f] !== null && !(typeof d[f] === "string" && ISO_DATE.test(d[f] as string))) errors.push(`details.${f} must be YYYY-MM-DD or null`);
    }
    const expectedId = makeId((d.permitNumber as string | null) ?? null, site.name, site.address);
    if (site.id !== expectedId) errors.push(`id should be ${expectedId} (see "Building id" in data/README.md)`);
    return errors;
  },
};

export function validate(data: unknown): string[] {
  const errors: string[] = [];
  const file = data as Record<string, unknown>;

  if (typeof file.generatedAt !== "string" || !ISO_TIMESTAMP.test(file.generatedAt)) {
    errors.push("generatedAt must be an ISO 8601 UTC timestamp like 2026-10-10T17:30:00Z");
  }
  if (!Array.isArray(file.sites)) return [...errors, "sites must be an array"];
  if (file.count !== file.sites.length) errors.push(`count is ${file.count} but sites has ${file.sites.length} entries`);

  const counts = new Map<string, number>();
  const seenIds = new Set<string>();
  file.sites.forEach((raw: Record<string, unknown>, i: number) => {
    const s = raw as unknown as Site;
    const err = (msg: string) => errors.push(`sites[${i}] (${typeof s.id === "string" ? s.id : "no id"}): ${msg}`);

    for (const field of SITE_FIELDS) if (!(field in raw)) err(`missing field ${field}`);
    for (const field of Object.keys(raw)) if (!SITE_FIELDS.includes(field as keyof Site)) err(`unknown field ${field}`);

    if (typeof s.id !== "string" || s.id === "") err("id must be a non-empty string");
    else if (seenIds.has(s.id)) err("duplicate id");
    else seenIds.add(s.id);

    if (!(s.category in CATEGORIES)) err(`unknown category ${JSON.stringify(s.category)}`);
    else counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    if (!["pending", "active", "closed"].includes(s.status)) err(`status must be pending, active or closed, got ${JSON.stringify(s.status)}`);
    if (!["tceq_map_link", "geocoded", "source_data"].includes(s.locationSource)) err(`invalid locationSource ${JSON.stringify(s.locationSource)}`);

    for (const field of ["name", "operator", "address", "city", "sourceUrl", "notes"] as const) {
      if (!isStringOrNull(s[field])) err(`${field} must be a string or null`);
    }
    if (typeof s.source !== "string" || s.source === "") err("source must be a non-empty string");
    if (!inRegion(s.county)) err(`county must be one of the 13 Houston-area counties, got ${JSON.stringify(s.county)}`);
    if (s.zip !== null && !(typeof s.zip === "string" && /^\d{5}$/.test(s.zip))) err("zip must be a 5-digit string or null");
    if (typeof s.scrapedAt !== "string" || !ISO_TIMESTAMP.test(s.scrapedAt)) err("scrapedAt must be an ISO 8601 UTC timestamp");

    if (typeof s.lat !== "number" || typeof s.lng !== "number") err("lat and lng must be numbers");
    else if (!inRegionBbox(s.lat, s.lng)) err(`coordinates ${s.lat},${s.lng} are outside the Houston area's bounding box`);

    if (typeof s.details !== "object" || s.details === null || Array.isArray(s.details)) err("details must be an object");
    else for (const e of DETAIL_CHECKS[s.category]?.(s.details, s) ?? []) err(e);
  });

  // The categories list must cover every category, with matching counts.
  const listed = Array.isArray(file.categories) ? (file.categories as { id: string; label: string; count: number }[]) : [];
  for (const id of Object.keys(CATEGORIES)) {
    const entry = listed.find((c) => c.id === id);
    if (!entry) errors.push(`categories is missing ${id}`);
    else if (entry.count !== (counts.get(id) ?? 0)) errors.push(`categories says ${entry.count} ${id} but sites has ${counts.get(id) ?? 0}`);
  }
  return errors;
}

/** Check data/demo-addresses.json against the sites it refers to. */
export function validateDemo(demo: DemoAddressesFile, sites: Site[]): string[] {
  const errors: string[] = [];
  const byId = new Map(sites.map((s) => [s.id, s]));
  for (const a of demo.addresses) {
    const err = (msg: string) => errors.push(`demo address ${a.id}: ${msg}`);
    if (!inRegionBbox(a.lat, a.lng)) err("coordinates are outside the Houston area's bounding box");
    const distances = a.nearby.map((n) => n.distanceMiles);
    if (distances.some((d, i) => i > 0 && d < distances[i - 1])) err("nearby is not sorted nearest first");
    if (distances.some((d) => d > demo.radiusMiles)) err(`nearby has sites beyond radiusMiles (${demo.radiusMiles})`);
    for (const n of a.nearby) {
      const site = byId.get(n.siteId);
      if (!site) err(`siteId ${n.siteId} is not in sites.json`);
      else if (site.category !== n.category) err(`siteId ${n.siteId} has category ${site.category}, not ${n.category}`);
    }
    const within = (r: number) => distances.filter((d) => d <= r).length;
    if (a.sitesWithin1Mile !== within(1) || a.sitesWithin2Miles !== within(2) || a.sitesWithin3Miles !== within(3)) {
      err("sitesWithin counts don't match nearby");
    }
    if (a.pendingWithin3Miles !== a.nearby.filter((n) => byId.get(n.siteId)?.status === "pending").length) {
      err("pendingWithin3Miles doesn't match nearby");
    }
    const byCategory: Record<string, number> = {};
    for (const n of a.nearby) byCategory[n.category] = (byCategory[n.category] ?? 0) + 1;
    if (JSON.stringify(Object.entries(byCategory).sort()) !== JSON.stringify(Object.entries(a.within3MilesByCategory).sort())) {
      err("within3MilesByCategory doesn't match nearby");
    }
  }
  return errors;
}

async function main() {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const errors = validate(data);
  const hasDemo = existsSync(DEMO_PATH);
  if (hasDemo && Array.isArray(data.sites)) {
    errors.push(...validateDemo(JSON.parse(await readFile(DEMO_PATH, "utf8")), data.sites));
  }
  if (errors.length) {
    console.error(`${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK: ${data.count} sites in ${DATA_PATH} match the format in data/README.md`);
  if (hasDemo) console.log(`OK: ${DEMO_PATH} matches the sites`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
