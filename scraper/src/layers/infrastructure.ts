// Infrastructure layers:
// - rail_yard: rail yards and rail intermodal terminals (U.S. DOT BTS, National Transportation Atlas Database).
// - fuel_terminal: bulk petroleum and chemical terminals (NTAD Pipeline Terminals, from HIFLD/EIA).
// - busy_road: TxDOT traffic count stations with at least BUSY_ROAD_AADT vehicles a day.
// - disposal_well: injection/disposal and storage wells (Texas Railroad Commission well locations).

import type { Site } from "../types.js";
import {
  COUNTY_SQL,
  COUNTY_SQL_UPPER,
  arcgisQuery,
  countyAt,
  countyFromFips,
  featurePoint,
  notNull,
  num,
  siteIdFor,
  sourceSite,
  str,
  zip5,
  type ArcgisFeature,
} from "./common.js";
import { REGION_COUNTIES } from "../region.js";

const NTAD = "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services";
const NTAD_SOURCE = "U.S. DOT Bureau of Transportation Statistics, National Transportation Atlas Database";

export async function railYards(scrapedAt: string): Promise<Site[]> {
  const fipsList = Object.values(REGION_COUNTIES).map((f) => `'48${f}'`).join(",");
  const yards = await arcgisQuery(`${NTAD}/NTAD_Rail_Yards/FeatureServer/0`, { where: `STCNTYFIPS IN (${fipsList})` });

  // A yard can be several track features; merge them by name and county.
  const byYard = new Map<string, ArcgisFeature[]>();
  for (const f of yards) {
    const key = `${str(f.attributes.YARDNAME) ?? "?"}|${f.attributes.STCNTYFIPS}`;
    byYard.set(key, [...(byYard.get(key) ?? []), f]);
  }
  const sites: (Site | null)[] = [...byYard.values()].map((features) => {
    const a = features[0].attributes;
    const merged: ArcgisFeature = { attributes: a, geometry: { paths: features.flatMap((f) => f.geometry?.paths ?? []) } };
    const point = featurePoint(merged);
    const name = str(a.YARDNAME);
    return sourceSite(
      {
        id: siteIdFor("ntad-yard", null, "yard", name, String(a.STCNTYFIPS)),
        category: "rail_yard",
        name,
        operator: str(a.RROWNER1_NAME) ?? str(a.RROWNER1),
        county: countyFromFips(str(a.STCNTYFIPS)),
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        status: "active",
        sourceUrl: null,
        source: NTAD_SOURCE,
        details: { kind: "rail yard", railroad: str(a.RROWNER1) },
      },
      scrapedAt,
    );
  });

  // Intermodal terminals have no county field, so look it up from the point.
  const terminals = await arcgisQuery(`${NTAD}/NTAD_Intermodal_Freight_Facilities_Rail_TOFC_COFC/FeatureServer/0`, {
    where: "STATE='TX'",
    geometry: false,
  });
  for (const { attributes: a } of terminals) {
    const lat = num(a.LAT);
    const lng = num(a.LON);
    if (lat === null || lng === null) continue;
    const name = str(a.TERMINAL);
    const address = str(a.TERM_ADDRESS);
    sites.push(
      sourceSite(
        {
          id: siteIdFor("ntad-intermodal", null, "intermodal", name, address),
          category: "rail_yard",
          name,
          operator: str(a.RAIL_CO),
          address,
          city: str(a.CITY),
          county: await countyAt(lat, lng),
          zip: zip5(a.ZIP_CODE),
          lat,
          lng,
          status: "active",
          sourceUrl: null,
          source: NTAD_SOURCE,
          details: { kind: "intermodal terminal", railroad: str(a.RAIL_CO) },
        },
        scrapedAt,
      ),
    );
  }
  return sites.filter(notNull);
}

const PRODUCT_FLAGS: Record<string, string> = {
  CRUDE_OIL: "crude oil",
  REFINED: "refined products",
  PET_CHEM: "petrochemicals",
  NGL: "natural gas liquids",
  GASOLINE: "gasoline",
  DISTILLATE: "distillate",
  BIODIESEL: "biodiesel",
  JETFUEL: "jet fuel",
  ETHANOL: "ethanol",
};

export async function fuelTerminals(scrapedAt: string): Promise<Site[]> {
  const features = await arcgisQuery(`${NTAD}/NTAD_Intermodal_Freight_Facilities_Pipeline_Terminals/FeatureServer/0`, {
    where: `STATE='TX' AND COUNTY IN (${COUNTY_SQL_UPPER})`,
    geometry: false,
  });
  return features
    .map(({ attributes: a }) => {
      const termId = str(a.TERM_ID) ?? str(a.HIFLD_ID);
      return sourceSite(
        {
          id: siteIdFor("hifld-terminal", termId, "terminal", str(a.TERM_NAME), str(a.ADDRESS)),
          category: "fuel_terminal",
          name: str(a.TERM_NAME),
          operator: str(a.COMP_NAME),
          address: str(a.ADDRESS),
          city: str(a.CITY),
          county: str(a.COUNTY),
          lat: num(a.LATITUDE),
          lng: num(a.LONGITUDE),
          status: "active",
          sourceUrl: str(a.WEBSITE),
          source: NTAD_SOURCE,
          details: {
            terminalId: termId,
            capacityBarrels: num(a.CAPACITY),
            products: Object.entries(PRODUCT_FLAGS).filter(([flag]) => a[flag] === "Y").map(([, label]) => label),
            validatedDate: str(a.VAL_DATE),
          },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}

/** Vehicles per day at or above which a count station counts as a busy road. */
export const BUSY_ROAD_AADT = 100000;

// "IH0010" -> "IH 10", "US0059" -> "US 59", "SH0288" -> "SH 288"
const roadName = (code: string | null) => code?.replace(/^([A-Z]+)0*(\d+)/, "$1 $2") ?? null;

export async function busyRoads(scrapedAt: string): Promise<Site[]> {
  const features = await arcgisQuery("https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT_Annuals_(Public_View)/FeatureServer/0", {
    where: `CNTY_NM IN (${COUNTY_SQL}) AND AADT_RPT_QTY >= ${BUSY_ROAD_AADT}`,
    outFields: "TRFC_STATN_ID,CNTY_NM,ON_ROAD,AADT_RPT_YEAR,AADT_RPT_QTY,LATITUDE,LONGITUDE",
    geometry: false,
  });
  return features
    .map(({ attributes: a }) => {
      const station = str(a.TRFC_STATN_ID);
      const road = roadName(str(a.ON_ROAD));
      return sourceSite(
        {
          id: `txdot-aadt-${station}`,
          category: "busy_road",
          name: road ? `${road} traffic count station` : "Traffic count station",
          county: str(a.CNTY_NM),
          lat: num(a.LATITUDE),
          lng: num(a.LONGITUDE),
          status: "active",
          sourceUrl: null,
          source: "TxDOT Annual Average Daily Traffic (AADT)",
          details: { stationId: station, road, vehiclesPerDay: num(a.AADT_RPT_QTY), year: num(a.AADT_RPT_YEAR) },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}

export async function disposalWells(scrapedAt: string): Promise<Site[]> {
  // The first 3 digits of a Texas API well number are the county code (same as FIPS).
  const apiPrefixes = Object.values(REGION_COUNTIES).map((f) => `API LIKE '${f}%'`).join(" OR ");
  const features = await arcgisQuery("https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer/1", {
    where: `(${apiPrefixes}) AND (GIS_SYMBOL_DESCRIPTION LIKE '%Injection%' OR GIS_SYMBOL_DESCRIPTION LIKE 'Storage%')`,
    outFields: "API,GIS_WELL_NUMBER,GIS_SYMBOL_DESCRIPTION,RELIAB,GIS_LAT83,GIS_LONG83",
    geometry: false,
    orderBy: "OBJECTID",
  });
  const seen = new Set<string>();
  return features
    .map(({ attributes: a }) => {
      const api = str(a.API);
      if (!api || seen.has(api)) return null;
      seen.add(api);
      return sourceSite(
        {
          id: `rrc-${api}`,
          category: "disposal_well",
          name: str(a.GIS_WELL_NUMBER) ? `Well ${str(a.GIS_WELL_NUMBER)} (API ${api})` : `Well API ${api}`,
          county: countyFromFips(api.slice(0, 3)),
          lat: num(a.GIS_LAT83),
          lng: num(a.GIS_LONG83),
          status: "active",
          sourceUrl: null,
          source: "Texas Railroad Commission well locations",
          details: { api, wellType: str(a.GIS_SYMBOL_DESCRIPTION), locationReliability: num(a.RELIAB) },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}
