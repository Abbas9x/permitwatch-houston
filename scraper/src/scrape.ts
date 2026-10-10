// Step 4: run the pipeline and write data/concrete-plants.json, the file the
// app reads. Format: data/README.md.
//
// Usage: npm run scrape [-- --refresh]

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
  const plants = (await extractPendingHarris(generatedAt)).sort(comparePlants);

  const file: PlantsFile = {
    generatedAt,
    source: `TCEQ pending air permit applications, Concrete Batch Plant Standard Permits section (${PENDING_URL}), and their public notice PDFs`,
    count: plants.length,
    plants,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`Wrote ${plants.length} plants to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
