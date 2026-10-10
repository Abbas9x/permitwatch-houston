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
  /** Gemini model ID, or "template" when written from the data without AI. */
  generator: string;
  generatedBy: 'ai' | 'template' | 'mock';
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
  within1: number;
  within2: number;
  within3: number;
  /** Sum of listed max production rates within 3 miles; null when no plant lists one. */
  combinedCapacityCydPerHr: number | null;
  /** How many of the plants within 3 miles list a production rate. */
  capacityListedCount: number;
}

export interface SearchLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'census_geocoder' | 'zip_centroid';
  approximate: boolean;
  zip: string | null;
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
