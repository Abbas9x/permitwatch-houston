// superfund_site: federal Superfund (EPA National Priorities List, with status
// and hazard score) and state Superfund sites (TCEQ). TCEQ's layer covers
// both; its EPA_TXID links to the NPL record for status and score.

import type { Site } from "../types.js";
import { COUNTY_SQL_UPPER, arcgisQuery, isoDate, notNull, num, regionCounty, siteIdFor, sourceSite, str, zip5 } from "./common.js";

const NPL_LAYER =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Superfund_National_Priorities_List_(NPL)_Sites_with_Status_Information/FeatureServer/0";
const TCEQ_LAYER = "https://gisweb.tceq.texas.gov/arcgis/rest/services/Public/Superfund/MapServer/0";

export async function superfundSites(scrapedAt: string): Promise<Site[]> {
  const npl = (await arcgisQuery(NPL_LAYER, { where: "State='Texas'", geometry: false }))
    .map((f) => f.attributes)
    .filter((a) => regionCounty(str(a.County)));
  const nplById = new Map(npl.map((a) => [str(a.Site_EPA_ID), a]));
  const tceq = (await arcgisQuery(TCEQ_LAYER, { where: `COUNTY IN (${COUNTY_SQL_UPPER})`, geometry: false })).map((f) => f.attributes);

  const nplDetails = (a: Record<string, unknown> | undefined) => ({
    nplStatus: a ? str(a.Status) : null,
    hazardScore: a ? num(a.Site_Score) : null,
    listingDate: a ? isoDate(a.Listing_Date) : null,
    deletionDate: a ? isoDate(a.Deletion_Date) : null,
  });
  // Sites deleted from the NPL have finished cleanup.
  const statusOf = (a: Record<string, unknown> | undefined) => (a && /deleted/i.test(str(a.Status) ?? "") ? "closed" : "active");

  const sites: (Site | null)[] = [];
  const usedEpaIds = new Set<string>();
  for (const t of tceq) {
    const epaId = str(t.EPA_TXID);
    const n = epaId ? nplById.get(epaId) : undefined;
    if (n && epaId) usedEpaIds.add(epaId);
    sites.push(
      sourceSite(
        {
          id: n && epaId ? `epa-${epaId}` : siteIdFor("tceq-sf", str(t.SF_ID) ?? str(t.RN), "sf", str(t.SITE_NAME), str(t.PHYS_ADDR)),
          category: "superfund_site",
          name: str(t.SITE_NAME),
          address: str(t.PHYS_ADDR) ?? str(t.ADDR_DESC),
          city: str(t.CITY),
          county: str(t.COUNTY),
          zip: zip5(t.ZIP_CODE),
          lat: num(t.LAT_DD),
          lng: num(t.LONG_DD),
          status: statusOf(n),
          sourceUrl: (n && str(n.Site_Progress_Profile)) ?? str(t.WEB_URL),
          source: n ? "EPA National Priorities List and TCEQ Superfund sites" : "TCEQ Superfund sites",
          details: { program: n ? "federal" : "state", epaId, ...nplDetails(n) },
        },
        scrapedAt,
      ),
    );
  }
  // NPL sites TCEQ's layer doesn't list.
  for (const n of npl) {
    const epaId = str(n.Site_EPA_ID);
    if (!epaId || usedEpaIds.has(epaId)) continue;
    sites.push(
      sourceSite(
        {
          id: `epa-${epaId}`,
          category: "superfund_site",
          name: str(n.Site_Name),
          city: str(n.City),
          county: str(n.County),
          lat: num(n.Latitude),
          lng: num(n.Longitude),
          status: statusOf(n),
          sourceUrl: str(n.Site_Progress_Profile),
          source: "EPA National Priorities List",
          details: { program: "federal", epaId, ...nplDetails(n) },
        },
        scrapedAt,
      ),
    );
  }
  return sites.filter(notNull);
}
