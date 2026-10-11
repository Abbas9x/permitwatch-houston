// construction_project: large construction nearby (dust, trucks, noise).
// - TxDOT road projects in the construction stage, all 13 counties.
// - Harris County permits for site development, mass grading and logistics
//   warehouses issued in the last 12 months (unincorporated Harris County only).

import type { Site } from "../types.js";
import { COUNTY_SQL, arcgisQuery, featurePoint, isoDate, notNull, num, sourceSite, str } from "./common.js";

const TXDOT_PROJECTS = "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Projects_Info/FeatureServer/0";
const HARRIS_PERMITS = "https://www.gis.hctx.net/arcgishcpid/rest/services/Permits/IssuedPermits/FeatureServer/0";

const HARRIS_PROJECT_TYPES = [
  "Site Development",
  "Site Development - Phased Permitting and Inspections",
  "Mass Grading Applications",
  "Pre-Qualified Logistical Warehouse & Facilities",
];

export async function constructionProjects(scrapedAt: string): Promise<Site[]> {
  const txdot = await arcgisQuery(TXDOT_PROJECTS, {
    where: `COUNTY_NAME IN (${COUNTY_SQL}) AND PROJ_STG='Construction'`,
    // Simplify the road lines; only a representative point is kept.
    extra: { maxAllowableOffset: "0.001" },
  });
  const seen = new Set<string>();
  const sites: (Site | null)[] = txdot.map((f) => {
    const a = f.attributes;
    const csj = str(a.CONTROL_SECT_JOB);
    if (!csj || seen.has(csj)) return null;
    seen.add(csj);
    const point = featurePoint(f);
    const highway = str(a.HWY_NBR);
    const work = str(a.TYPE_OF_WORK);
    return sourceSite(
      {
        id: `txdot-${csj}`,
        category: "construction_project",
        name: [highway, work].filter(Boolean).join(": ") || null,
        operator: "TxDOT",
        address: str(a.LIMITS_FROM) && str(a.LIMITS_TO) ? `${highway ?? ""} from ${str(a.LIMITS_FROM)} to ${str(a.LIMITS_TO)}`.trim() : null,
        county: str(a.COUNTY_NAME),
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        status: "active",
        sourceUrl: null,
        source: "TxDOT Projects",
        details: {
          projectSource: "TxDOT",
          projectId: csj,
          typeOfWork: work,
          estimatedCost: num(a.EST_CONSTRUCTION_COST),
          startDate: isoDate(a.CNSTR_WKBG_DT),
          estimatedCompletion: isoDate(a.CNST_EST_CMPLT_DT),
          percentComplete: num(a.CNSTR_PCT_COMPLETE),
          lastUpdated: isoDate(a.LAST_PROJ_UPDATE_DT),
        },
      },
      scrapedAt,
    );
  });

  const since = new Date(Date.parse(scrapedAt) - 365 * 86400000).toISOString().slice(0, 10);
  const permits = await arcgisQuery(HARRIS_PERMITS, {
    where: `ISSUEDDATE >= DATE '${since}' AND APPTYPE IN (${HARRIS_PROJECT_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")})`,
    outFields: "PROJECTNUMBER,PROJECTNAME,FULLADDRESS,APPTYPE,PERMITNAME,PROJECTSTATUS,ISSUEDDATE",
    pageSize: 2000,
  });
  // A project can have several permits; keep the earliest-issued one per project.
  const byProject = new Map<string, (typeof permits)[number]>();
  for (const p of permits) {
    const id = str(p.attributes.PROJECTNUMBER);
    if (!id) continue;
    const prev = byProject.get(id);
    if (!prev || (num(p.attributes.ISSUEDDATE) ?? Infinity) < (num(prev.attributes.ISSUEDDATE) ?? Infinity)) byProject.set(id, p);
  }
  for (const [id, f] of byProject) {
    const a = f.attributes;
    const point = featurePoint(f);
    sites.push(
      sourceSite(
        {
          id: `hcpid-${id}`,
          category: "construction_project",
          name: str(a.PROJECTNAME),
          address: str(a.FULLADDRESS),
          county: "Harris",
          lat: point?.lat ?? null,
          lng: point?.lng ?? null,
          status: "active",
          sourceUrl: null,
          source: "Harris County Engineering issued permits",
          details: {
            projectSource: "Harris County",
            projectId: id,
            typeOfWork: str(a.APPTYPE),
            permit: str(a.PERMITNAME),
            projectStatus: str(a.PROJECTSTATUS),
            startDate: isoDate(a.ISSUEDDATE),
          },
        },
        scrapedAt,
      ),
    );
  }
  return sites.filter(notNull);
}
