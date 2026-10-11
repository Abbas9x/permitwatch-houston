// Precompute the demo addresses for demo mode, so the demo needs no geocoding
// or network. Reads scraper/demo-places.json and data/sites.json; writes
// data/demo-addresses.json (format in data/README.md).
//
// Usage: npm run demo  (run npm run scrape first)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nowIso } from "./extract.js";
import { geocode, miles } from "./geocode.js";
import { inRegionBbox } from "./region.js";
import { OUTPUT_PATH as SITES_PATH } from "./scrape.js";
import type { Category, DemoAddress, DemoAddressesFile, SitesFile } from "./types.js";

const PLACES_PATH = fileURLToPath(new URL("../demo-places.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../../data/demo-addresses.json", import.meta.url));
const RADIUS_MILES = 3;

interface DemoPlace {
  id: string;
  label: string;
  address: string;
}

async function main() {
  const places = JSON.parse(await readFile(PLACES_PATH, "utf8")) as DemoPlace[];
  const sitesFile = JSON.parse(await readFile(SITES_PATH, "utf8")) as SitesFile;

  const addresses: DemoAddress[] = [];
  for (const place of places) {
    const coords = await geocode(place.address);
    if (!coords || !inRegionBbox(coords.lat, coords.lng)) {
      throw new Error(`${place.id}: could not place "${place.address}" in the Houston area`);
    }

    const nearby = sitesFile.sites
      // Rounded to 2 decimals first, so the counts agree with the distances in the file.
      .map((s) => ({
        siteId: s.id,
        category: s.category,
        status: s.status,
        distanceMiles: Math.round(miles(coords, s) * 100) / 100,
      }))
      .filter((n) => n.distanceMiles <= RADIUS_MILES)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
    const within = (r: number) => nearby.filter((n) => n.distanceMiles <= r).length;
    const byCategory: Partial<Record<Category, number>> = {};
    for (const n of nearby) byCategory[n.category] = (byCategory[n.category] ?? 0) + 1;

    addresses.push({
      id: place.id,
      label: place.label,
      address: place.address,
      lat: coords.lat,
      lng: coords.lng,
      locationSource: "geocoded",
      sitesWithin1Mile: within(1),
      sitesWithin2Miles: within(2),
      sitesWithin3Miles: within(3),
      pendingWithin3Miles: nearby.filter((n) => n.status === "pending").length,
      within3MilesByCategory: byCategory,
      nearby: nearby.map(({ siteId, category, distanceMiles }) => ({ siteId, category, distanceMiles })),
    });
  }

  const file: DemoAddressesFile = {
    generatedAt: nowIso(),
    sitesGeneratedAt: sitesFile.generatedAt,
    radiusMiles: RADIUS_MILES,
    addresses,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`Wrote ${addresses.length} demo addresses to ${OUTPUT_PATH}`);
  for (const a of addresses) {
    console.log(`  ${a.label}: ${a.sitesWithin1Mile} / ${a.sitesWithin2Miles} / ${a.sitesWithin3Miles} sites within 1 / 2 / 3 mi, ${a.pendingWithin3Miles} pending`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
