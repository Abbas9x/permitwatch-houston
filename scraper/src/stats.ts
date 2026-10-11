// Numbers for the pitch slides, computed from data/sites.json and the cached
// concrete plant permit search. Prints Markdown.
//
// Usage: npm run stats  (run npm run scrape first)

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadAllProjects } from "./existing.js";
import { miles } from "./geocode.js";
import { OUTPUT_PATH } from "./scrape.js";
import type { SitesFile } from "./types.js";

function topCounts(values: string[], n: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const file = JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as SitesFile;
  const sites = file.sites;
  const pending = sites.filter((s) => s.status === "pending");
  const concrete = sites.filter((s) => s.category === "concrete_batch_plant");

  // Concrete plant permit history from the cached search (includes cancelled permits).
  const projects = await loadAllProjects();
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

  // Densest cluster: the site with the most other sites within 2 miles.
  const densest = sites
    .map((s) => ({ s, n: sites.filter((t) => miles(s, t) <= 2).length }))
    .sort((a, b) => b.n - a.n)[0];

  const lines = [
    `# Permit Watch: Houston-area stats (data generated ${file.generatedAt})`,
    "",
    `- **${sites.length}** mapped sites in the 13 Houston-area counties, **${pending.length}** with a pending application`,
    ...file.categories.map((c) => `  - ${c.label}: ${c.count}`),
    `- Concrete batch plants: of the **${effectiveSince(0)}** effective permits, **${effectiveSince(2020)}** were first applied for in 2020 or later and **${effectiveSince(2015)}** in 2015 or later; **${cancelled}** more have been cancelled over the years`,
    densest
      ? `- Densest cluster: **${densest.n}** sites within 2 miles of ${densest.s.name ?? "a site"} (${[densest.s.address, densest.s.city].filter(Boolean).join(", ") || `${densest.s.county} County`}; ${densest.s.lat.toFixed(4)}, ${densest.s.lng.toFixed(4)})`
      : "",
    "",
    "Sites by county:",
    ...topCounts(sites.map((s) => s.county), 13).map(([c, n]) => `- ${c}: ${n}`),
    "",
    "Concrete plant operators with the most plants:",
    ...topCounts(concrete.map((s) => s.operator ?? "(unknown)"), 5).map(([o, n]) => `- ${o}: ${n}`),
  ];
  console.log(lines.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
