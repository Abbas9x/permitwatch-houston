// power_plant: operating power plants from EIA's "Power Plants in the US" layer.

import type { Site } from "../types.js";
import { COUNTY_SQL, arcgisQuery, notNull, num, sourceSite, str, zip5 } from "./common.js";

const EIA_LAYER = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0";

export async function powerPlants(scrapedAt: string): Promise<Site[]> {
  const features = await arcgisQuery(EIA_LAYER, { where: `State='Texas' AND County IN (${COUNTY_SQL})`, geometry: false });
  return features
    .map(({ attributes: a }) => {
      const code = str(a.Plant_Code);
      return sourceSite(
        {
          id: `eia-${code}`,
          category: "power_plant",
          name: str(a.Plant_Name),
          operator: str(a.Utility_Na),
          address: str(a.Street_Add),
          city: str(a.City),
          county: str(a.County),
          zip: zip5(a.Zip),
          lat: num(a.Latitude),
          lng: num(a.Longitude),
          status: "active",
          sourceUrl: code ? `https://www.eia.gov/electricity/data/browser/#/plant/${code}` : null,
          source: "U.S. Energy Information Administration, Power Plants in the US",
          details: {
            eiaPlantCode: code,
            primarySource: str(a.PrimSource),
            technology: str(a.tech_desc),
            capacityMw: num(a.Total_MW),
            dataPeriod: str(a.Period),
          },
        },
        scrapedAt,
      );
    })
    .filter(notNull);
}
