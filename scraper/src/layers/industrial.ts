// industrial_facility: facilities reporting to EPA's Toxics Release Inventory
// (refineries, chemical plants...), from the TRI basic data file for Texas.
// The file has one row per facility and chemical; this sums them per facility.

import { join } from "node:path";
import { cachedGet } from "../http.js";
import type { Site } from "../types.js";
import { LAYERS_DIR, notNull, num, parseCsv, sourceSite, str, zip5 } from "./common.js";

export const TRI_YEAR = 2024;
const TRI_URL = `https://data.epa.gov/efservice/downloads/tri/mv_tri_basic_download/${TRI_YEAR}_TX/csv`;

export async function industrialFacilities(scrapedAt: string): Promise<Site[]> {
  const body = await cachedGet(TRI_URL, join(LAYERS_DIR, `tri-${TRI_YEAR}-tx.csv`));
  if (!body) throw new Error(`${TRI_URL}: 404`);
  const [header, ...rows] = parseCsv(body.toString("utf8"));
  // Headers look like "4. FACILITY NAME"; drop the number.
  const col = new Map(header.map((h, i) => [h.replace(/^\d+\.\s*/, "").trim(), i]));
  const get = (row: string[], name: string) => {
    const i = col.get(name);
    if (i === undefined) throw new Error(`TRI file: no column ${name}`);
    return row[i];
  };

  interface Facility {
    row: string[];
    airLb: number;
    chemicals: Set<string>;
    carcinogensToAir: Set<string>;
  }
  const byFacility = new Map<string, Facility>();
  for (const row of rows) {
    if (row.length < header.length) continue;
    const id = str(get(row, "TRIFD"));
    if (!id) continue;
    const f = byFacility.get(id) ?? { row, airLb: 0, chemicals: new Set(), carcinogensToAir: new Set() };
    const chemical = str(get(row, "CHEMICAL")) ?? "";
    f.chemicals.add(chemical);
    // Dioxins are reported in grams; only pounds are summed.
    if (get(row, "UNIT OF MEASURE") === "Pounds") {
      const air = (num(get(row, "5.1 - FUGITIVE AIR")) ?? 0) + (num(get(row, "5.2 - STACK AIR")) ?? 0);
      f.airLb += air;
      if (air > 0 && get(row, "CARCINOGEN") === "YES") f.carcinogensToAir.add(chemical);
    }
    byFacility.set(id, f);
  }

  return [...byFacility].map(([id, f]) => {
    const frsId = str(get(f.row, "FRS ID"));
    return sourceSite(
      {
        id: `tri-${id}`,
        category: "industrial_facility",
        name: str(get(f.row, "FACILITY NAME")),
        operator: str(get(f.row, "STANDARD PARENT CO NAME")) ?? str(get(f.row, "PARENT CO NAME")),
        address: str(get(f.row, "STREET ADDRESS")),
        city: str(get(f.row, "CITY")),
        county: str(get(f.row, "COUNTY")),
        zip: zip5(get(f.row, "ZIP")),
        lat: num(get(f.row, "LATITUDE")),
        lng: num(get(f.row, "LONGITUDE")),
        status: "active",
        sourceUrl: frsId ? `https://echo.epa.gov/detailed-facility-report?fid=${frsId}` : null,
        source: `EPA Toxics Release Inventory (${TRI_YEAR})`,
        details: {
          triFacilityId: id,
          industrySector: str(get(f.row, "INDUSTRY SECTOR")),
          reportingYear: TRI_YEAR,
          airReleasesLb: Math.round(f.airLb),
          chemicalsReported: f.chemicals.size,
          carcinogensReleasedToAir: [...f.carcinogensToAir].sort(),
        },
      },
      scrapedAt,
    );
  }).filter(notNull);
}
