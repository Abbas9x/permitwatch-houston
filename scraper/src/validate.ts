// Check data/concrete-plants.json against the contract in data/README.md.
// Prints every problem found and exits with code 1 if there are any.
//
// Usage: npm run validate

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inHarrisBbox } from "./geocode.js";
import { makeId } from "./ids.js";
import type { DemoAddressesFile, Plant } from "./types.js";

const DATA_PATH = fileURLToPath(new URL("../../data/concrete-plants.json", import.meta.url));
const DEMO_PATH = fileURLToPath(new URL("../../data/demo-addresses.json", import.meta.url));


const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PLANT_FIELDS: (keyof Plant)[] = [
  "id", "permitNumber", "category", "name", "operator", "address", "city", "county", "zip",
  "lat", "lng", "locationSource", "status", "permitType", "dateReceived", "commentDeadline",
  "productionRate", "emissions", "noticeUrl", "scrapedAt", "notes",
];

function isStringOrNull(v: unknown): boolean {
  return v === null || typeof v === "string";
}

function isOneOf(v: unknown, allowed: readonly unknown[]): boolean {
  return allowed.includes(v);
}

export function validate(data: unknown): string[] {
  const errors: string[] = [];
  const file = data as Record<string, unknown>;

  if (typeof file.generatedAt !== "string" || !ISO_TIMESTAMP.test(file.generatedAt)) {
    errors.push("generatedAt must be an ISO 8601 UTC timestamp like 2026-10-10T17:30:00Z");
  }
  if (typeof file.source !== "string" || file.source === "") errors.push("source must be a non-empty string");
  if (!Array.isArray(file.plants)) return [...errors, "plants must be an array"];
  if (file.count !== file.plants.length) errors.push(`count is ${file.count} but plants has ${file.plants.length} entries`);

  const seenIds = new Set<string>();
  file.plants.forEach((raw: Record<string, unknown>, i: number) => {
    const p = raw as unknown as Plant;
    const at = `plants[${i}] (${typeof p.id === "string" ? p.id : "no id"})`;
    const err = (msg: string) => errors.push(`${at}: ${msg}`);

    for (const field of PLANT_FIELDS) if (!(field in raw)) err(`missing field ${field}`);
    for (const field of Object.keys(raw)) if (!PLANT_FIELDS.includes(field as keyof Plant)) err(`unknown field ${field}`);

    if (typeof p.id !== "string" || p.id === "") err("id must be a non-empty string");
    else if (seenIds.has(p.id)) err("duplicate id");
    else seenIds.add(p.id);
    if (typeof p.id === "string" && p.id !== makeId(p.permitNumber, p.name, p.address)) {
      err(`id should be ${makeId(p.permitNumber, p.name, p.address)} (see "Building id" in data/README.md)`);
    }

    if (!isOneOf(p.status, ["pending", "existing"])) err(`status must be "pending" or "existing", got ${JSON.stringify(p.status)}`);
    if (p.category !== "concrete_batch_plant") err(`category must be "concrete_batch_plant"`);
    if (!isOneOf(p.permitType, ["new", "renewal", "amendment", null])) err(`invalid permitType ${JSON.stringify(p.permitType)}`);
    if (!isOneOf(p.locationSource, ["tceq_map_link", "geocoded", "manual", null])) {
      err(`invalid locationSource ${JSON.stringify(p.locationSource)}`);
    }

    for (const field of ["permitNumber", "name", "operator", "address", "city", "productionRate", "noticeUrl", "notes"] as const) {
      if (!isStringOrNull(p[field])) err(`${field} must be a string or null`);
    }
    if (p.county !== "Harris") err(`county must be "Harris" (Harris County only), got ${JSON.stringify(p.county)}`);
    if (p.zip !== null && !(typeof p.zip === "string" && /^\d{5}$/.test(p.zip))) err("zip must be a 5-digit string or null");
    for (const field of ["dateReceived", "commentDeadline"] as const) {
      const v = p[field];
      if (v !== null && !(typeof v === "string" && ISO_DATE.test(v))) err(`${field} must be YYYY-MM-DD or null`);
    }
    if (typeof p.scrapedAt !== "string" || !ISO_TIMESTAMP.test(p.scrapedAt)) err("scrapedAt must be an ISO 8601 UTC timestamp");

    const hasLat = typeof p.lat === "number";
    const hasLng = typeof p.lng === "number";
    if (hasLat !== hasLng || (!hasLat && p.lat !== null) || (!hasLng && p.lng !== null)) {
      err("lat and lng must both be numbers or both be null");
    } else if (hasLat) {
      if (!inHarrisBbox(p.lat!, p.lng!)) {
        err(`coordinates ${p.lat},${p.lng} are outside Harris County's bounding box`);
      }
      if (p.locationSource === null) err("locationSource must be set when there are coordinates");
    } else if (p.locationSource !== null) {
      err("locationSource must be null when there are no coordinates");
    }

    if (!Array.isArray(p.emissions)) err("emissions must be an array");
    else {
      p.emissions.forEach((e, j) => {
        if (typeof e?.pollutant !== "string" || typeof e?.tonsPerYear !== "number") {
          err(`emissions[${j}] must have a string pollutant and a number tonsPerYear`);
        }
      });
    }
  });

  return errors;
}

/** Check data/demo-addresses.json against the plants it refers to. */
export function validateDemo(demo: DemoAddressesFile, plants: Plant[]): string[] {
  const errors: string[] = [];
  const byId = new Map(plants.map((p) => [p.id, p]));
  for (const a of demo.addresses) {
    const err = (msg: string) => errors.push(`demo address ${a.id}: ${msg}`);
    if (!inHarrisBbox(a.lat, a.lng)) err("coordinates are outside Harris County's bounding box");
    const distances = a.nearby.map((n) => n.distanceMiles);
    if (distances.some((d, i) => i > 0 && d < distances[i - 1])) err("nearby is not sorted nearest first");
    if (distances.some((d) => d > demo.radiusMiles)) err(`nearby has plants beyond radiusMiles (${demo.radiusMiles})`);
    for (const n of a.nearby) if (!byId.has(n.plantId)) err(`plantId ${n.plantId} is not in concrete-plants.json`);
    const within = (r: number) => distances.filter((d) => d <= r).length;
    if (a.plantsWithin1Mile !== within(1) || a.plantsWithin2Miles !== within(2) || a.plantsWithin3Miles !== within(3)) {
      err("plantsWithin counts don't match nearby");
    }
    if (a.pendingWithin3Miles !== a.nearby.filter((n) => byId.get(n.plantId)?.status === "pending").length) {
      err("pendingWithin3Miles doesn't match nearby");
    }
  }
  return errors;
}

async function main() {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const errors = validate(data);
  const hasDemo = existsSync(DEMO_PATH);
  if (hasDemo && Array.isArray(data.plants)) {
    errors.push(...validateDemo(JSON.parse(await readFile(DEMO_PATH, "utf8")), data.plants));
  }
  if (errors.length) {
    console.error(`${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK: ${data.count} plants in ${DATA_PATH} match the format in data/README.md`);
  if (hasDemo) console.log(`OK: ${DEMO_PATH} matches the plants`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
