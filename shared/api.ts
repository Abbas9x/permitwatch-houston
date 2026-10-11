/** Response shapes for the PermitWatch JSON API (shared by server and client). */
import type { CompassPoint } from './geo.js';
import type { Permit } from './permit.js';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
    requestId?: string;
  };
}

export interface PermitSummaryText {
  headline: string;
  summary: string;
  whatsChanging: string;
}

export interface PermitSummary {
  en: PermitSummaryText;
  es: PermitSummaryText;
  /** Summaries are assembled directly from the dataset fields. */
  generator: 'template';
  generatedBy: 'template';
  createdAt: string;
}

export interface NearbyPlant {
  permit: Permit;
  /** Straight-line distance from the searched location. */
  distanceMiles: number;
  /** Bearing from the searched location to the plant, degrees from north. */
  bearingDeg: number;
  compass: CompassPoint;
  summary: PermitSummary | null;
}

export interface AreaSummary {
  /** Number of plants within the selected search distance. */
  withinRadius: number;
  within1: number;
  within2: number;
  within3: number;
  /** Sum of listed max production rates within the selected distance; null when no plant lists one. */
  combinedCapacityCydPerHr: number | null;
  /** How many of the plants within the selected distance list a production rate. */
  capacityListedCount: number;
}

export interface SearchLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'census_geocoder' | 'zip_centroid' | 'place_search';
  approximate: boolean;
  zip: string | null;
}

export interface PlaceSuggestion {
  label: string;
  lat: number;
  lng: number;
}

export interface SuggestResponse {
  suggestions: PlaceSuggestion[];
}

export interface SearchResponse {
  query: string;
  location: SearchLocation;
  /** False when the Census geocoder was unreachable and a ZIP fallback was used. */
  geocoderAvailable: boolean;
  radiusMiles: number;
  plants: NearbyPlant[];
  area: AreaSummary;
  nearestOutside: { id: string; company: string; distanceMiles: number; compass: CompassPoint } | null;
  hasSampleData: boolean;
}

export interface PermitDetailResponse {
  permit: Permit;
  summary: PermitSummary | null;
  rawText: string;
}

export interface CommentDraftResponse {
  draft: { subject: string; body: string };
  generatedBy: 'template';
}
