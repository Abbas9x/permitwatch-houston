// pending_air_permit: every other kind of pending TCEQ air permit (not concrete
// plants, which have their own category) in the Houston area.
//
// The pending permits page lists them statewide without locations. TCEQ's NSR
// search for Region 12 pending projects says which permit numbers are in the
// area; for those, the public notice PDFs give the address and a map link.
// Only permits whose notice has a map link are kept.

import { searchNsr } from "../existing.js";
import { parseLocation, parseMapLink, parsePermitType } from "../extract.js";
import { SECTION_ID, loadPendingHtml, parsePendingRows } from "../fetchList.js";
import { getNotices, loadListedNotices, type Notice } from "../notices.js";
import { TCEQ_REGION } from "../region.js";
import type { Site } from "../types.js";
import { sourceSite } from "./common.js";

/** "will emit the following air contaminants: X, Y and Z." -> "X, Y and Z" */
function parseContaminants(text: string): string | null {
  const m = text.match(/following air contaminants(?: from [^:]{0,80})?:?\s*(.+?)(?:\.\s|$)/i);
  return m ? m[1].trim() : null;
}

export async function pendingAirPermits(scrapedAt: string): Promise<Site[]> {
  const regionProjects = await searchNsr(
    { tnrcc_region_cd: TCEQ_REGION, addn_id_typ_txt: "", unit_id: "", proj_status_txt: "PENDING" },
    `nsr-region-${TCEQ_REGION}-pending-all.html`,
  );
  const inRegion = new Set(regionProjects.map((p) => p.permitNumber));

  const rows = parsePendingRows(await loadPendingHtml(), null).filter(
    (r) => r.section !== SECTION_ID && r.permitNumber && inRegion.has(r.permitNumber),
  );
  const listed = await loadListedNotices();

  const sites: Site[] = [];
  const seen = new Set<string>();
  let noMapLink = 0;
  for (const row of rows) {
    if (seen.has(row.permitNumber!)) continue;
    seen.add(row.permitNumber!);
    const notices = await getNotices(row, listed);
    const firstOf = <T>(f: (n: Notice) => T | null): T | null => {
      for (const n of notices) {
        const v = f(n);
        if (v !== null) return v;
      }
      return null;
    };
    const coords = firstOf((n) => parseMapLink(n.text));
    const location = firstOf((n) => parseLocation(n.text));
    if (!coords) {
      noMapLink++;
      continue;
    }
    const entryId = row.noticeUrl?.split("#")[1];
    const site = sourceSite(
      {
        id: `tceq-${row.permitNumber}`,
        category: "pending_air_permit",
        name: row.facilityName,
        operator: row.applicant,
        address: location?.address ?? null,
        city: location?.city ?? null,
        county: location?.county ?? regionProjects.find((p) => p.permitNumber === row.permitNumber)?.countyName ?? null,
        zip: location?.zip ?? null,
        lat: coords.lat,
        lng: coords.lng,
        status: "pending",
        sourceUrl: entryId && listed.has(entryId) ? row.noticeUrl : (notices[0]?.url ?? row.noticeUrl),
        source: "TCEQ pending air permit applications and public notices",
        details: {
          permitNumber: row.permitNumber,
          permitSection: row.section,
          permitType: firstOf(parsePermitType),
          dateReceived: row.dateReceived,
          applicationStage: row.applicationStage,
          airContaminants: firstOf((n) => parseContaminants(n.text)),
        },
      },
      scrapedAt,
    );
    if (site) sites.push({ ...site, locationSource: "tceq_map_link" });
  }
  console.log(`  pending air permits: ${rows.length} in the area on the list, ${sites.length} with a map link, ${noMapLink} without`);
  return sites;
}
