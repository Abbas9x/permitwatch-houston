// Step 4: run the pipeline and write data/concrete-plants.json, the file the
// app reads. Format: data/README.md.
//
// Usage: npm run scrape [-- --refresh]

import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXISTING_SOURCE, extractExistingHarris } from "./existing.js";
import { extractPendingHarris, nowIso } from "./extract.js";
import { PENDING_URL } from "./fetchList.js";
import type { Plant, PlantsFile } from "./types.js";

export const OUTPUT_PATH = fileURLToPath(new URL("../../data/concrete-plants.json", import.meta.url));

/** By permit number (numeric-aware, so "77728" < "138305"), records without one last, then by id. */
export function comparePlants(a: Plant, b: Plant): number {
  if (a.permitNumber !== b.permitNumber) {
    if (a.permitNumber === null) return 1;
    if (b.permitNumber === null) return -1;
    return a.permitNumber.localeCompare(b.permitNumber, "en", { numeric: true });
  }
  return a.id.localeCompare(b.id);
}

async function main() {
  const generatedAt = nowIso();
  const pending = await extractPendingHarris(generatedAt);
  const existing = await extractExistingHarris(generatedAt);

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
  console.log(`${existing.length - existingOnly.length} existing plants also have a pending application; kept as pending`);

  const plants = [...pending, ...existingOnly].sort(comparePlants);

  const file: PlantsFile = {
    generatedAt,
    source: `TCEQ pending air permit applications, Concrete Batch Plant Standard Permits section (${PENDING_URL}), with their public notice PDFs; and ${EXISTING_SOURCE}`,
    count: plants.length,
    plants,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`Wrote ${plants.length} plants (${pending.length} pending, ${existingOnly.length} existing) to ${OUTPUT_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
