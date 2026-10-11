// Waste layers:
// - landfill, transfer_station: active municipal solid waste facilities (TCEQ MSW viewer).
// - wastewater_plant: sewage treatment plants with an NPDES permit (EPA ECHO, SIC 4952).
// - hazardous_waste_facility: large-quantity generators and treatment/storage/disposal facilities (EPA ECHO, RCRA).
// - scrap_yard: scrap and waste-materials businesses (EPA ECHO, SIC 5093), filtered by name.

import type { Site } from "../types.js";
import { COUNTY_SQL_UPPER, arcgisQuery, echoFacilities, notNull, num, siteIdFor, sourceSite, str, zip5 } from "./common.js";

const MSW_VIEWER = "https://gisweb.tceq.texas.gov/arcgis/rest/services/WP/MSW_FACILITIES_VIEWER/MapServer";
const echoReport = (registryId: string | null) => (registryId ? `https://echo.epa.gov/detailed-facility-report?fid=${registryId}` : null);

// ECHO locations less precise than this are ZIP or county centers, not the facility.
const MAX_ECHO_ACCURACY_METERS = 1000;
const preciseEnough = (accuracy: string | null) => {
  const m = num(accuracy);
  return m === null || m <= MAX_ECHO_ACCURACY_METERS;
};

const LANDFILL_TYPES: Record<string, string> = {
  "1": "municipal solid waste",
  "1AE": "municipal solid waste (arid exempt)",
  "4": "construction, demolition and brush",
  "4AE": "construction, demolition and brush (arid exempt)",
};

export async function landfills(scrapedAt: string): Promise<Site[]> {
  const features = await arcgisQuery(`${MSW_VIEWER}/7`, { where: `COUNTY IN (${COUNTY_SQL_UPPER})`, geometry: false });
  return features
    .map(({ attributes: a }) => {
      const permit = str(a.PERMIT_NUM);
      const type = str(a.LANDFILL_T);
      return sourceSite(
        {
          id: siteIdFor("tceq-msw", permit, "lf", str(a.FACILITY_N), str(a.ADDRESS)),
          category: "landfill",
          name: str(a.FACILITY_N),
          address: str(a.ADDRESS),
          county: str(a.COUNTY),
          lat: num(a.LATITUDE),
          lng: num(a.LONGITUDE),
          status: "active",
          sourceUrl: null,
          source: "TCEQ Municipal Solid Waste facilities",
          details: { permitNumber: permit, landfillType: type ? (LANDFILL_TYPES[type] ?? type) : null },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}

export async function transferStations(scrapedAt: string): Promise<Site[]> {
  const features = await arcgisQuery(`${MSW_VIEWER}/8`, { where: `COUNTY IN (${COUNTY_SQL_UPPER})`, geometry: false });
  return features
    .map(({ attributes: a }) => {
      const permit = str(a.PERMIT_NUM);
      const address = str(a.PHYS_ADDR_) ?? str(a.ADDRESS);
      return sourceSite(
        {
          id: siteIdFor("tceq-msw", permit, "ts", str(a.FACILITY_N), address),
          category: "transfer_station",
          name: str(a.FACILITY_N),
          address,
          county: str(a.COUNTY),
          lat: num(a.LATITUDE),
          lng: num(a.LONGITUDE),
          status: "active",
          sourceUrl: null,
          source: "TCEQ Municipal Solid Waste facilities",
          details: { permitNumber: permit, facilityType: str(a.FACILITY_T) },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}

export async function wastewaterPlants(scrapedAt: string): Promise<Site[]> {
  const rows = await echoFacilities("cwa_rest_services", { p_sic: "4952", p_act: "Y" }, [
    "CWPName", "SourceID", "CWPStreet", "CWPCity", "CWPZip", "CWPCounty", "FacLat", "FacLong", "RegistryID",
    "CWPTotalDesignFlowNmbr", "CWPActualAverageFlowNmbr", "CWPPermitStatusDesc", "CWPMajorMinorStatusFlag", "CalculatedAccuracyMeters",
  ]);
  const seen = new Set<string>();
  return rows
    .map((r) => {
      const npdes = str(r.SourceID);
      // Individual wastewater permits start with TX0; TXR (stormwater) and TXL (sludge) duplicate the same plant.
      if (!npdes?.startsWith("TX0") || seen.has(npdes) || !preciseEnough(r.CalculatedAccuracyMeters)) return null;
      seen.add(npdes);
      return sourceSite(
        {
          id: `npdes-${npdes}`,
          category: "wastewater_plant",
          name: str(r.CWPName),
          address: str(r.CWPStreet),
          city: str(r.CWPCity),
          county: str(r.CWPCounty),
          zip: zip5(r.CWPZip),
          lat: num(r.FacLat),
          lng: num(r.FacLong),
          status: "active",
          sourceUrl: echoReport(str(r.RegistryID)),
          source: "EPA ECHO (Clean Water Act permits)",
          details: {
            npdesId: npdes,
            designFlowMgd: num(r.CWPTotalDesignFlowNmbr),
            actualFlowMgd: num(r.CWPActualAverageFlowNmbr),
            permitStatus: str(r.CWPPermitStatusDesc),
            major: r.CWPMajorMinorStatusFlag === "M",
          },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}

export async function hazardousWasteFacilities(scrapedAt: string): Promise<Site[]> {
  const rows = await echoFacilities("rcra_rest_services", { p_act: "Y" }, [
    "RCRAName", "SourceID", "RCRAStreet", "RCRACity", "RCRAZip", "RCRACounty", "FacLat", "FacLong", "RegistryID",
    "RCRAUniverse", "RCRAComplStatus", "CalculatedAccuracyMeters",
  ]);
  const seen = new Set<string>();
  return rows
    .map((r) => {
      const epaId = str(r.SourceID);
      const universe = str(r.RCRAUniverse);
      // Only large-quantity generators and treatment, storage or disposal facilities.
      if (!epaId || seen.has(epaId) || !/LQG|TSD/i.test(universe ?? "") || !preciseEnough(r.CalculatedAccuracyMeters)) return null;
      seen.add(epaId);
      return sourceSite(
        {
          id: `rcra-${epaId}`,
          category: "hazardous_waste_facility",
          name: str(r.RCRAName),
          address: str(r.RCRAStreet),
          city: str(r.RCRACity),
          county: str(r.RCRACounty),
          zip: zip5(r.RCRAZip),
          lat: num(r.FacLat),
          lng: num(r.FacLong),
          status: "active",
          sourceUrl: echoReport(str(r.RegistryID)),
          source: "EPA ECHO (RCRA hazardous waste handlers)",
          details: { epaId, universe, complianceStatus: str(r.RCRAComplStatus) },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}

// SIC 5093 also covers pallet, paper and rag dealers; keep metal and salvage businesses.
const SCRAP_NAME = /SCRAP|METAL|IRON|STEEL|SALVAGE|JUNK|WRECK|AUTO PARTS|RECYCL/i;

export async function scrapYards(scrapedAt: string): Promise<Site[]> {
  const rows = await echoFacilities("echo_rest_services", { p_sic: "5093", p_act: "Y" }, [
    "FacName", "FacStreet", "FacCity", "FacZip", "FacCounty", "FacLat", "FacLong", "RegistryID", "FacAccuracyMeters", "FacSICCodes",
  ]);
  const seen = new Set<string>();
  return rows
    .map((r) => {
      const frsId = str(r.RegistryID);
      const name = str(r.FacName);
      if (!frsId || seen.has(frsId) || !SCRAP_NAME.test(name ?? "") || !preciseEnough(r.FacAccuracyMeters)) return null;
      seen.add(frsId);
      return sourceSite(
        {
          id: `frs-${frsId}`,
          category: "scrap_yard",
          name,
          address: str(r.FacStreet),
          city: str(r.FacCity),
          county: str(r.FacCounty),
          zip: zip5(r.FacZip),
          lat: num(r.FacLat),
          lng: num(r.FacLong),
          status: "active",
          sourceUrl: echoReport(frsId),
          source: "EPA ECHO (facilities with SIC 5093, scrap and waste materials)",
          details: { frsId, sicCodes: str(r.FacSICCodes) },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}
