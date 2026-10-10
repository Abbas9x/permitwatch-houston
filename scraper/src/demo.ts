// Step 7: precompute the demo addresses for demo mode, so the demo needs no
// geocoding or network. Reads scraper/demo-places.json and
// data/concrete-plants.json; writes data/demo-addresses.json (format in
// data/README.md).
//
// Usage: npm run demo  (run npm run scrape first)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nowIso } from "./extract.js";
import { geocode, inHarrisBbox } from "./geocode.js";
import { OUTPUT_PATH as PLANTS_PATH } from "./scrape.js";
import { miles } from "./stats.js";
import type { DemoAddress, DemoAddressesFile, PlantsFile } from "./types.js";

const PLACES_PATH = fileURLToPath(new URL("../demo-places.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../../data/demo-addresses.json", import.meta.url));
const RADIUS_MILES = 3;

interface DemoPlace {
  id: string;
  label: string;
  address: string;
  /** Hand-entered coordinates, used instead of geocoding when given. */
  lat?: number;
  lng?: number;
}

async function main() {
  const places = JSON.parse(await readFile(PLACES_PATH, "utf8")) as DemoPlace[];
  const plantsFile = JSON.parse(await readFile(PLANTS_PATH, "utf8")) as PlantsFile;
  const mapped = plantsFile.plants.filter((p) => p.lat !== null && p.lng !== null);

  const addresses: DemoAddress[] = [];
  for (const place of places) {
    const manual = place.lat !== undefined && place.lng !== undefined;
    const coords = manual ? { lat: place.lat!, lng: place.lng! } : await geocode(place.address);
    if (!coords || !inHarrisBbox(coords.lat, coords.lng)) {
      throw new Error(`${place.id}: could not place "${place.address}" in Harris County; add lat/lng to demo-places.json`);
    }

    const nearby = mapped
      // Rounded to 2 decimals first, so the counts agree with the distances in the file.
      .map((p) => ({
        plantId: p.id,
        status: p.status,
        distanceMiles: Math.round(miles(coords, { lat: p.lat!, lng: p.lng! }) * 100) / 100,
      }))
      .filter((n) => n.distanceMiles <= RADIUS_MILES)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
    const within = (r: number) => nearby.filter((n) => n.distanceMiles <= r).length;

    addresses.push({
      id: place.id,
      label: place.label,
      address: place.address,
      lat: coords.lat,
      lng: coords.lng,
      locationSource: manual ? "manual" : "geocoded",
      plantsWithin1Mile: within(1),
      plantsWithin2Miles: within(2),
      plantsWithin3Miles: within(3),
      pendingWithin3Miles: nearby.filter((n) => n.status === "pending").length,
      nearby: nearby.map(({ plantId, distanceMiles }) => ({ plantId, distanceMiles })),
    });
  }

  const file: DemoAddressesFile = {
    generatedAt: nowIso(),
    plantsGeneratedAt: plantsFile.generatedAt,
    radiusMiles: RADIUS_MILES,
    addresses,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`Wrote ${addresses.length} demo addresses to ${OUTPUT_PATH}`);
  for (const a of addresses) {
    console.log(`  ${a.label}: ${a.plantsWithin1Mile} / ${a.plantsWithin2Miles} / ${a.plantsWithin3Miles} plants within 1 / 2 / 3 mi, ${a.pendingWithin3Miles} pending`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
