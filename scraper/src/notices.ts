// Step 3a: download the public notice PDFs for each pending concrete plant and
// extract their text.
//
// Notice kinds (English versions only):
//   napd: Notice of Application and Preliminary Decision
//   nori: Notice of Receipt of Application and Intent to Obtain a Permit
//   pls:  Plain Language Summary
// NAPD/NORI give the address, county, ZIP and a map link with coordinates. PLS
// gives the address, county and production rate.
//
// Many plants aren't on TCEQ's pending permit apps page, but their notices
// still exist at the same URL pattern, so for each plant we use the listed
// link when there is one and the pattern otherwise. A 404 means "no notice".

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import { loadPendingHtml, parsePendingRows, type PendingRow } from "./fetchList.js";
import { RAW_DIR, cachedGet } from "./http.js";

const NOTICES_PAGE_URL = "https://www.tceq.texas.gov/permitting/air/newsourcereview/airpermits-pendingpermit-apps";
const NOTICE_PDF_BASE = "https://www.tceq.texas.gov/downloads/permitting/air/bilingual/pending-permit-notices/";

export const NOTICE_KINDS = ["napd", "nori", "pls"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export interface Notice {
  kind: NoticeKind;
  url: string;
  /** PDF text with whitespace collapsed to single spaces. */
  text: string;
}

/** Map of notice-page entry id (the `#406616` in a row's noticeUrl) to its listed English notice PDFs. */
export async function loadListedNotices(): Promise<Map<string, Map<NoticeKind, string>>> {
  const body = await cachedGet(NOTICES_PAGE_URL, join(RAW_DIR, "notices.html"));
  if (!body) throw new Error(`${NOTICES_PAGE_URL} returned 404`);
  const $ = cheerio.load(body.toString("utf8"));
  const listed = new Map<string, Map<NoticeKind, string>>();
  $("tr[id]").each((_, tr) => {
    const links = new Map<NoticeKind, string>();
    $(tr)
      .find("a[href]")
      .each((_, a) => {
        const href = ($(a).attr("href") ?? "").replace(/\s+/g, "");
        const kind = href.match(/-([a-z]+)-english\.pdf$/)?.[1] as NoticeKind | undefined;
        if (kind && NOTICE_KINDS.includes(kind)) links.set(kind, new URL(href, NOTICES_PAGE_URL).href);
      });
    listed.set($(tr).attr("id")!, links);
  });
  return listed;
}

/** Download (or read from cache) every available notice for one plant. */
export async function getNotices(
  row: PendingRow,
  listed: Map<string, Map<NoticeKind, string>>,
): Promise<Notice[]> {
  const entryId = row.noticeUrl?.split("#")[1];
  const listedLinks = (entryId && listed.get(entryId)) || new Map<NoticeKind, string>();
  const notices: Notice[] = [];

  for (const kind of NOTICE_KINDS) {
    let url = listedLinks.get(kind);
    // Only build a URL from the pattern for plain numeric permit numbers.
    if (!url && row.permitNumber && /^\d+$/.test(row.permitNumber)) {
      url = `${NOTICE_PDF_BASE}${row.permitNumber}-${kind}-english.pdf`;
    }
    if (!url) continue;

    const fileName = decodeURIComponent(new URL(url).pathname.split("/").pop()!);
    const pdf = await cachedGet(url, join(RAW_DIR, "notices", fileName));
    if (!pdf) continue;
    notices.push({ kind, url, text: await pdfText(pdf) });
  }
  return notices;
}

async function pdfText(pdf: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return text.replace(/\s+/g, " ").trim();
}

async function main() {
  const rows = parsePendingRows(await loadPendingHtml());
  const listed = await loadListedNotices();
  const coverage: Record<string, number> = {};
  for (const [i, row] of rows.entries()) {
    const notices = await getNotices(row, listed);
    const key = notices.map((n) => n.kind).join("+") || "(none)";
    coverage[key] = (coverage[key] ?? 0) + 1;
    console.log(`${i + 1}/${rows.length} ${row.permitNumber} ${key}`);
  }
  console.log(coverage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
