// Run the pipeline and write data/sites.json, the file the app reads.
// Format: data/README.md.
//
// Usage: npm run scrape [-- --refresh]

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXISTING_SOURCE, EXISTING_SOURCE_URL, extractExisting } from "./existing.js";
import { extractPending, nowIso } from "./extract.js";
import { constructionProjects } from "./layers/construction.js";
import { industrialFacilities } from "./layers/industrial.js";
import { busyRoads, disposalWells, fuelTerminals, railYards } from "./layers/infrastructure.js";
import { pendingAirPermits } from "./layers/pendingAir.js";
import { powerPlants } from "./layers/powerPlants.js";
import { superfundSites } from "./layers/superfund.js";
import { hazardousWasteFacilities, landfills, scrapYards, transferStations, wastewaterPlants } from "./layers/waste.js";
import { inRegionBbox } from "./region.js";
import { CATEGORIES, type Category, type ConcretePlant, type Site, type SitesFile } from "./types.js";

export const OUTPUT_PATH = fileURLToPath(new URL("../../data/sites.json", import.meta.url));

const PENDING_SOURCE = "TCEQ pending air permit applications and public notices";

/** A concrete plant as a Site, or null when it has no usable coordinates or county. */
function concreteToSite(p: ConcretePlant): Site | null {
  if (p.lat === null || p.lng === null || !p.locationSource || !p.county || !inRegionBbox(p.lat, p.lng)) return null;
  return {
    id: p.id,
    category: "concrete_batch_plant",
    name: p.name,
    operator: p.operator,
    address: p.address,
    city: p.city,
    county: p.county,
    zip: p.zip,
    lat: p.lat,
    lng: p.lng,
    locationSource: p.locationSource,
    status: p.status === "pending" ? "pending" : "active",
    sourceUrl: p.status === "pending" ? p.noticeUrl : EXISTING_SOURCE_URL,
    source: p.status === "pending" ? PENDING_SOURCE : EXISTING_SOURCE,
    scrapedAt: p.scrapedAt,
    notes: p.notes,
    details: {
      permitNumber: p.permitNumber,
      permitType: p.permitType,
      dateReceived: p.dateReceived,
      commentDeadline: p.commentDeadline,
      productionRate: p.productionRate,
    },
  };
}

export async function concreteSites(scrapedAt: string): Promise<Site[]> {
  const pending = await extractPending(scrapedAt);
  const existing = await extractExisting(scrapedAt);

  // A plant with a pending application (usually a renewal) that already holds
  // an effective permit appears in both lists. Keep one record: the pending
  // one, which has the notice details.
  const pendingByPermit = new Map(pending.map((p) => [p.permitNumber, p]));
  const existingOnly = existing.filter((e) => {
    const p = pendingByPermit.get(e.permitNumber);
    if (!p) return true;
    const note = "This plant already holds an effective permit; the pending application is for that permit.";
    p.notes = p.notes ? `${note} ${p.notes}` : note;
    return false;
  });

  // Plants without a real coordinate are left out rather than shown in the wrong place.
  const all = [...pending, ...existingOnly];
  const sites = all.map(concreteToSite).filter((s): s is Site => s !== null);
  console.log(`Concrete batch plants: ${sites.length} kept, ${all.length - sites.length} left out for lack of coordinates`);
  return sites;
}

/** By category, then by name, then by id, so diffs between runs stay small. */
export function compareSites(a: Site, b: Site): number {
  return a.category.localeCompare(b.category) || (a.name ?? "").localeCompare(b.name ?? "") || a.id.localeCompare(b.id);
}

/** Every layer, with the categories it produces. */
const LAYERS: { name: string; categories: Category[]; run: (scrapedAt: string) => Promise<Site[]> }[] = [
  { name: "concrete batch plants", categories: ["concrete_batch_plant"], run: concreteSites },
  { name: "pending air permits", categories: ["pending_air_permit"], run: pendingAirPermits },
  { name: "industrial facilities (TRI)", categories: ["industrial_facility"], run: industrialFacilities },
  { name: "power plants", categories: ["power_plant"], run: powerPlants },
  { name: "Superfund sites", categories: ["superfund_site"], run: superfundSites },
  { name: "hazardous waste facilities", categories: ["hazardous_waste_facility"], run: hazardousWasteFacilities },
  { name: "landfills", categories: ["landfill"], run: landfills },
  { name: "transfer stations", categories: ["transfer_station"], run: transferStations },
  { name: "wastewater plants", categories: ["wastewater_plant"], run: wastewaterPlants },
  { name: "scrap yards", categories: ["scrap_yard"], run: scrapYards },
  { name: "rail yards", categories: ["rail_yard"], run: railYards },
  { name: "fuel terminals", categories: ["fuel_terminal"], run: fuelTerminals },
  { name: "disposal and storage wells", categories: ["disposal_well"], run: disposalWells },
  { name: "construction projects", categories: ["construction_project"], run: constructionProjects },
  { name: "busy roads", categories: ["busy_road"], run: busyRoads },
];

async function main() {
  const generatedAt = nowIso();
  const previous = existsSync(OUTPUT_PATH) ? ((JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as SitesFile).sites ?? []) : [];

  const all: Site[] = [];
  for (const layer of LAYERS) {
    try {
      const sites = await layer.run(generatedAt);
      console.log(`${layer.name}: ${sites.length}`);
      all.push(...sites);
    } catch (err) {
      // Keep the last good data for this layer rather than dropping the category.
      const kept = previous.filter((s) => layer.categories.includes(s.category));
      console.warn(`${layer.name}: FAILED (${(err as Error).message.slice(0, 200)}); keeping ${kept.length} sites from the previous run`);
      all.push(...kept);
    }
  }

  // Ids must be unique across the whole file.
  const byId = new Map<string, Site>();
  for (const s of all) {
    if (byId.has(s.id)) console.warn(`duplicate id ${s.id} (${s.category}); keeping the first`);
    else byId.set(s.id, s);
  }
  const sites = [...byId.values()].sort(compareSites);

  const counts = new Map<Category, number>();
  for (const s of sites) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  const file: SitesFile = {
    generatedAt,
    count: sites.length,
    categories: (Object.keys(CATEGORIES) as Category[]).map((id) => ({ id, label: CATEGORIES[id], count: counts.get(id) ?? 0 })),
    sites,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`Wrote ${sites.length} sites to ${OUTPUT_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
