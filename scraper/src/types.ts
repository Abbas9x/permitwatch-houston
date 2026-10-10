// Shape of data/concrete-plants.json. See data/README.md for field semantics.
// Unknown values are null, never guessed.

export type LocationSource = "tceq_map_link" | "geocoded" | "manual";
export type PermitStatus = "pending" | "existing";
export type PermitType = "new" | "renewal" | "amendment";

export interface Emission {
  pollutant: string;
  tonsPerYear: number;
}

export interface Plant {
  // "tceq-<permitNumber>" if there is a permit number, otherwise
  // "cbp-<hash of normalized name + address>". See "Building id" in data/README.md.
  id: string;
  permitNumber: string | null;
  category: "concrete_batch_plant";
  name: string | null;
  operator: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  locationSource: LocationSource | null;
  status: PermitStatus;
  permitType: PermitType | null;
  dateReceived: string | null;
  commentDeadline: string | null;
  productionRate: string | null;
  emissions: Emission[];
  noticeUrl: string | null;
  scrapedAt: string;
  notes: string | null;
}

export interface PlantsFile {
  generatedAt: string;
  source: string;
  count: number;
  plants: Plant[];
}
