// The area Permit Watch covers: TCEQ Region 12 (Houston), 13 counties.

/** County name -> 3-digit county FIPS code (Texas state code is 48). */
export const REGION_COUNTIES: Record<string, string> = {
  Austin: "015",
  Brazoria: "039",
  Chambers: "071",
  Colorado: "089",
  "Fort Bend": "157",
  Galveston: "167",
  Harris: "201",
  Liberty: "291",
  Matagorda: "321",
  Montgomery: "339",
  Walker: "471",
  Waller: "473",
  Wharton: "481",
};

/** TCEQ's code for Region 12 in its search forms. */
export const TCEQ_REGION = "12";

export function inRegion(county: string | null | undefined): county is string {
  return !!county && county in REGION_COUNTIES;
}

// The 13 counties' extent, rounded outward.
export const REGION_BBOX = { minLat: 28.2, maxLat: 31.1, minLng: -96.9, maxLng: -94.2 };

export function inRegionBbox(lat: number, lng: number): boolean {
  const { minLat, maxLat, minLng, maxLng } = REGION_BBOX;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}
