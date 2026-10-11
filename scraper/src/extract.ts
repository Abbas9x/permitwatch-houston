import { pickOfficialSource } from "./sourceUrl.js";
// Step 3: turn each pending concrete plant in the Houston area into a record
// using its public notices, and fill in missing coordinates with the
// geocoders.
//
// Usage: npm run extract [-- --refresh]
// Writes data/raw/pending.json (an intermediate file; step 4 writes
// data/sites.json).
//
// Fields are read with rules from the notice text. Anything a rule can't read
// stays null; nothing is inferred.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPendingHtml, parsePendingRows, type PendingRow } from "./fetchList.js";
import { NOMINATIM_NOTE, geocode, isStreetAddress } from "./geocode.js";
import { RAW_DIR } from "./http.js";
import { makeId } from "./ids.js";
import { getNotices, loadListedNotices, type Notice } from "./notices.js";
import { inRegion } from "./region.js";
import type { ConcretePlant, PermitType } from "./types.js";

const OUTPUT_PATH = join(RAW_DIR, "pending.json");

interface Location {
  address: string;
  city: string | null;
  county: string;
  zip: string | null;
}

// "located at <address>, <city>, <county> County[, Texas <zip>]". The address
// part may itself contain commas (driving directions), so the city and county
// are the last two comma-separated parts. "County" must be followed by "." or
// "," so that "County Road 130" in directions doesn't end the match.
const LOCATION_RE =
  /located (?:at the following driving directions: |using the following driving directions: |at )?(.*?) County(?=[.,])(?:, Texas,? (\d{5}))?/;

export function parseLocation(text: string): Location | null {
  const m = text.match(LOCATION_RE);
  if (!m) return null;
  const parts = m[1].split(", ");
  // With fewer than three parts we can't tell the city from the county
  // (e.g. "110 Holmes Road, Houston Harris County").
  if (parts.length < 3) return null;
  const county = parts.pop()!;
  const city = parts.pop()!.replace(/^in /, "");
  if (!/^[A-Z][A-Za-z.' -]*$/.test(county) || /\bTX\b/.test(county)) return null;
  return {
    address: parts.join(", "),
    city: /^[A-Z][A-Za-z.' -]*$/.test(city) ? city : null,
    county,
    zip: m[2] ?? null,
  };
}

/** Coordinates from a TCEQ LocationMapper link (`marker=LONGITUDE,LATITUDE`). */
export function parseMapLink(text: string): { lat: number; lng: number } | null {
  const m = text.match(/marker=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  // Some notices drop the minus sign; every Texas longitude is west (negative).
  const lng = -Math.abs(Number(m[1]));
  const lat = Number(m[2]);
  // Sanity check: Texas spans roughly 25.8–36.5°N and 93.5–106.7°W.
  if (lat < 25 || lat > 37 || lng < -107 || lng > -93) return null;
  return { lat, lng };
}

export function parsePermitType(notice: Notice): PermitType | null {
  const t = notice.text;
  if (notice.kind === "pls") {
    if (/application to renew/i.test(t)) return "renewal";
    if (/application to amend/i.test(t)) return "amendment";
    if (/application to register/i.test(t)) return "new";
    return null;
  }
  if (/renewal of (?:Registration|Permit)|authorize continued operation/i.test(t)) return "renewal";
  if (/amendment/i.test(t)) return "amendment";
  if (/authorize construction/i.test(t)) return "new";
  return null;
}

export function parseProductionRate(text: string): string | null {
  return text.match(/maximum production rate of (.+?) of concrete/)?.[1] ?? null;
}

async function buildPlant(
  row: PendingRow,
  notices: Notice[],
  onNoticePage: boolean,
  scrapedAt: string,
): Promise<ConcretePlant> {
  // NAPD, then NORI, then PLS: the formal notices are the most complete.
  const firstOf = <T>(f: (n: Notice) => T | null): T | null => {
    for (const n of notices) {
      const v = f(n);
      if (v !== null) return v;
    }
    return null;
  };

  const location = firstOf((n) => parseLocation(n.text));
  const notes: string[] = [];

  let coords = firstOf((n) => parseMapLink(n.text));
  let locationSource: ConcretePlant["locationSource"] = coords ? "tceq_map_link" : null;
  if (!coords && location) {
    // Only geocode street addresses, not driving directions.
    if (isStreetAddress(location.address)) {
      const query = [location.address, location.city, `TX ${location.zip ?? ""}`.trim()].filter(Boolean).join(", ");
      const result = await geocode(query);
      if (result) {
        coords = { lat: result.lat, lng: result.lng };
        locationSource = "geocoded";
        if (result.source === "nominatim") notes.push(NOMINATIM_NOTE);
      } else {
        notes.push("No map link in the notice, and neither the Census nor the OpenStreetMap geocoder found a single exact match for the address.");
      }
    } else {
      notes.push("No map link in the notice, and the location is given as directions, not a street address.");
    }
  }

  const name = row.facilityName;
  const address = location?.address ?? null;
  return {
    id: makeId(row.permitNumber, name, address),
    permitNumber: row.permitNumber,
    name,
    operator: row.applicant,
    address,
    city: location?.city ?? null,
    county: location?.county ?? null,
    zip: location?.zip ?? null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    locationSource,
    status: "pending",
    permitType: firstOf(parsePermitType),
    dateReceived: row.dateReceived,
    // Notices only say "15 days after the final newspaper notice", never a date.
    commentDeadline: null,
    productionRate: firstOf((n) => parseProductionRate(n.text)),
    // The notice page entry when TCEQ lists one, otherwise the notice PDF itself.
    noticeUrl: pickOfficialSource([onNoticePage ? row.noticeUrl : null, ...notices.map((n) => n.url), row.noticeUrl]),
    scrapedAt,
    notes: notes.length ? notes.join(" ") : null,
  };
}

/**
 * Build records for every pending concrete plant in the Houston area and
 * print how many were skipped and why.
 */
export async function extractPending(scrapedAt: string): Promise<ConcretePlant[]> {
  const rows = parsePendingRows(await loadPendingHtml());
  const listed = await loadListedNotices();

  const kept: ConcretePlant[] = [];
  const skipped = { noNotice: 0, noCounty: [] as string[], outsideRegion: 0, noIdentity: 0 };

  for (const row of rows) {
    if (!row.permitNumber && !row.facilityName) {
      skipped.noIdentity++;
      continue;
    }
    const notices = await getNotices(row, listed);
    if (notices.length === 0) {
      skipped.noNotice++;
      continue;
    }
    const entryId = row.noticeUrl?.split("#")[1];
    const plant = await buildPlant(row, notices, !!entryId && listed.has(entryId), scrapedAt);
    if (plant.county === null) skipped.noCounty.push(row.permitNumber ?? "?");
    else if (!inRegion(plant.county)) skipped.outsideRegion++;
    else kept.push(plant);
  }

  console.log(`${rows.length} pending concrete plants on the list (statewide)`);
  console.log(`  skipped, no permit number, name or address: ${skipped.noIdentity}`);
  console.log(`  skipped, no public notice found: ${skipped.noNotice}`);
  console.log(`  skipped, county not readable from notices: ${skipped.noCounty.length} ${skipped.noCounty.join(", ")}`);
  console.log(`  skipped, outside the Houston area: ${skipped.outsideRegion}`);
  console.log(`  kept: ${kept.length}`);
  return kept;
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main() {
  const kept = await extractPending(nowIso());
  await writeFile(OUTPUT_PATH, JSON.stringify(kept, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const p of kept) {
    console.log(
      `  ${p.id} | ${p.name} | ${p.address}, ${p.city} ${p.zip ?? ""} | ${p.lat},${p.lng} (${p.locationSource}) | ${p.permitType} | ${p.productionRate}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
