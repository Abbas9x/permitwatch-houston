// Shape of data/sites.json and data/demo-addresses.json. See data/README.md
// for field semantics. Unknown values are null, never guessed.

/** Every kind of site in sites.json. More are added as layers are built. */
export const CATEGORIES = {
  busy_road: "Busy road (traffic counter)",
  concrete_batch_plant: "Concrete batch plant",
  construction_project: "Large construction project",
  disposal_well: "Injection, disposal or storage well",
  fuel_terminal: "Fuel or chemical terminal",
  hazardous_waste_facility: "Hazardous waste facility",
  industrial_facility: "Industrial facility",
  landfill: "Landfill",
  pending_air_permit: "Pending air permit",
  power_plant: "Power plant",
  rail_yard: "Rail yard or intermodal terminal",
  scrap_yard: "Scrap yard or metal recycler",
  superfund_site: "Superfund site",
  transfer_station: "Waste transfer station",
  wastewater_plant: "Wastewater treatment plant",
} as const;

export type Category = keyof typeof CATEGORIES;

/** How lat/lng were obtained. */
export type LocationSource = "tceq_map_link" | "geocoded" | "source_data";

/** pending: application under review; active: permitted or operating; closed: no longer operating. */
export type SiteStatus = "pending" | "active" | "closed";

export interface Site {
  // See "Building id" in data/README.md.
  id: string;
  category: Category;
  name: string | null;
  operator: string | null;
  address: string | null;
  city: string | null;
  county: string;
  zip: string | null;
  lat: number;
  lng: number;
  locationSource: LocationSource;
  status: SiteStatus;
  /** Where a person can read more: the public notice or the source record. */
  sourceUrl: string | null;
  /** Which dataset the record came from. */
  source: string;
  scrapedAt: string;
  notes: string | null;
  /** Category-specific facts; see data/README.md for each category. */
  details: Record<string, unknown>;
}

export interface SitesFile {
  generatedAt: string;
  count: number;
  categories: { id: Category; label: string; count: number }[];
  sites: Site[];
}

// ---------------------------------------------------------------------------
// Internal shape of a concrete batch plant while it's being built from TCEQ
// data, before it becomes a Site (see toSite in scrape.ts).

export type PermitType = "new" | "renewal" | "amendment";

export interface ConcretePlant {
  id: string;
  permitNumber: string | null;
  name: string | null;
  operator: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  locationSource: "tceq_map_link" | "geocoded" | null;
  status: "pending" | "existing";
  permitType: PermitType | null;
  dateReceived: string | null;
  commentDeadline: string | null;
  productionRate: string | null;
  noticeUrl: string | null;
  scrapedAt: string;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// data/demo-addresses.json

export interface NearbySite {
  /** A Site id in data/sites.json. */
  siteId: string;
  category: Category;
  distanceMiles: number;
}

export interface DemoAddress {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  locationSource: "geocoded";
  sitesWithin1Mile: number;
  sitesWithin2Miles: number;
  sitesWithin3Miles: number;
  pendingWithin3Miles: number;
  /** Sites within 3 miles, counted by category. */
  within3MilesByCategory: Partial<Record<Category, number>>;
  /** Sites within radiusMiles, nearest first. */
  nearby: NearbySite[];
}

export interface DemoAddressesFile {
  generatedAt: string;
  /** generatedAt of the sites.json these were computed from. */
  sitesGeneratedAt: string;
  radiusMiles: number;
  addresses: DemoAddress[];
}
