// Step 2: fetch TCEQ's pending NSR permits page and parse the
// "Concrete Batch Plant Standard Permits" section.
//
// Usage: npm run list [-- --refresh]
// The page is cached in data/raw/pending.html; --refresh refetches it.

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { RAW_DIR, REFRESH, cachedGet } from "./http.js";

export const PENDING_URL =
  "https://www.tceq.texas.gov/assets/public/permitting/air/reports/applications/nsr-pending-permits.html";

const CACHE_PATH = join(RAW_DIR, "pending.html");

// Section header rows carry the section name as the id of their first cell.
// Letter sub-headers ("...-A", "...-B") belong to the same section.
const SECTION_ID = "Concrete Batch Plant Standard Permits";

/** One row of the concrete batch plant section, values as printed (null when blank). */
export interface PendingRow {
  applicant: string | null;
  facilityName: string | null;
  permitNumber: string | null;
  /** YYYY-MM-DD, or null if the cell isn't a MM/DD/YYYY date. */
  dateReceived: string | null;
  /** Plain-language notice entry on TCEQ's pending permit apps page. */
  noticeUrl: string | null;
  /** Application PDF. */
  applicationUrl: string | null;
  /** Link text, e.g. "Technically Complete Application". */
  applicationStage: string | null;
}

export async function loadPendingHtml(): Promise<string> {
  const body = await cachedGet(PENDING_URL, CACHE_PATH);
  if (!body) throw new Error(`${PENDING_URL} returned 404`);
  return body.toString("utf8");
}

export function parsePendingRows(html: string): PendingRow[] {
  const $ = cheerio.load(html);
  const rows: PendingRow[] = [];
  let section: string | null = null;

  $("table.report tr").each((_, tr) => {
    const cells = $(tr).children("td");
    const headerId = cells.first().attr("id");
    if (headerId) {
      section = headerId.replace(/-[A-Z#]$/, "");
      return;
    }
    if (section !== SECTION_ID || cells.length !== 5) return;

    const [applicantCell, facilityCell, permitCell, dateCell, appCell] = cells.toArray().map((c) => $(c));
    const appLink = appCell.find("a").first();

    rows.push({
      // The applicant cell also holds the notice link; keep only its own text.
      applicant: clean(applicantCell.contents().first().text()),
      facilityName: clean(facilityCell.text()),
      permitNumber: clean(permitCell.text()),
      dateReceived: toIsoDate(clean(dateCell.text())),
      noticeUrl: toUrl(applicantCell.find("a").first().attr("href")),
      applicationUrl: toUrl(appLink.attr("href")),
      applicationStage: clean(appLink.text()),
    });
  });

  return rows;
}

function clean(text: string | undefined): string | null {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

// The page wraps long hrefs across lines, so strip all whitespace before resolving.
function toUrl(href: string | undefined): string | null {
  const s = (href ?? "").replace(/\s+/g, "");
  return s === "" ? null : new URL(s, PENDING_URL).href;
}

function toIsoDate(s: string | null): string | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

async function main() {
  const rows = parsePendingRows(await loadPendingHtml());
  console.log(`${rows.length} concrete batch plant rows (${REFRESH ? "fetched" : "cache or fetch"}: ${CACHE_PATH})`);
  console.log(JSON.stringify(rows.slice(0, 3), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
