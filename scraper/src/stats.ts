// Step 7: numbers for the pitch slides, computed from data/concrete-plants.json
// and the cached NSR permit search. Prints Markdown.
//
// Usage: npm run stats  (run npm run scrape first)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSearchResults } from "./existing.js";
import { RAW_DIR } from "./http.js";
import { OUTPUT_PATH } from "./scrape.js";
import type { Plant, PlantsFile } from "./types.js";

/** Great-circle distance in miles. */
export function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

function topCounts(values: string[], n: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const file = JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as PlantsFile;
  const plants = file.plants;
  const mapped = plants.filter((p): p is Plant & { lat: number; lng: number } => p.lat !== null && p.lng !== null);
  const pending = plants.filter((p) => p.status === "pending");

  // Permit history from the cached search (all projects, including cancelled permits).
  const projects = parseSearchResults(await readFile(join(RAW_DIR, "existing", "nsr-harris-cbp.html"), "utf8"));
  const firstReceived = new Map<string, number>();
  const permitStatus = new Map<string, string>();
  for (const p of projects) {
    const year = Number(p.receivedDate.slice(-4));
    if (year && (!firstReceived.has(p.permitNumber) || year < firstReceived.get(p.permitNumber)!)) {
      firstReceived.set(p.permitNumber, year);
    }
    permitStatus.set(p.permitNumber, p.permitStatus);
  }
  const effectiveSince = (year: number) =>
    [...firstReceived].filter(([permit, y]) => y >= year && permitStatus.get(permit) === "EFFECTIVE").length;
  const cancelled = [...permitStatus.values()].filter((s) => s === "CANCELLED").length;

  // Densest cluster: the plant with the most other plants within 2 miles.
  const densest = mapped
    .map((p) => ({ p, n: mapped.filter((q) => miles(p, q) <= 2).length }))
    .sort((a, b) => b.n - a.n)[0];

  const lines = [
    `# Permit Watch: concrete batch plant stats (data generated ${file.generatedAt})`,
    "",
    `- **${plants.length}** concrete batch plants in Harris County: **${plants.length - pending.length}** permitted and **${pending.length}** with a pending application`,
    `- **${mapped.length}** of them have map coordinates (${plants.length - mapped.length} have only an address or directions)`,
    `- Of the **${effectiveSince(0)}** effective permits (including the pending renewals), **${effectiveSince(2020)}** were first applied for in 2020 or later and **${effectiveSince(2015)}** in 2015 or later`,
    `- **${cancelled}** more concrete plant permits in Harris County have been cancelled over the years`,
    `- Densest cluster: **${densest.n}** plants within 2 miles of ${densest.p.address}, ${densest.p.city}`,
    `- Pending applications: ${pending.map((p) => `${p.name} (${p.address}, ${p.city}; ${p.permitType}, ${p.productionRate ?? "rate not stated"})`).join("; ")}`,
    "",
    "Plants by city:",
    ...topCounts(plants.map((p) => p.city?.toUpperCase().replace(/^LAPORTE$/, "LA PORTE") ?? "(unknown)"), 8).map(([c, n]) => `- ${c}: ${n}`),
    "",
    "Operators with the most plants:",
    ...topCounts(plants.map((p) => p.operator ?? "(unknown)"), 5).map(([o, n]) => `- ${o}: ${n}`),
  ];
  console.log(lines.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
