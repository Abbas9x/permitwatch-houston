import { z } from 'zod';

export const PERMIT_TYPES = ['new', 'renewal', 'amendment', 'unknown'] as const;
export const PermitTypeSchema = z.enum(PERMIT_TYPES);
export type PermitType = z.infer<typeof PermitTypeSchema>;

/** What kind of permit a record is. Air permits are TCEQ case-by-case permits for industrial facilities. */
export const PERMIT_CATEGORIES = ['concrete_batch_plant', 'air_permit', 'wastewater_permit', 'solid_waste_permit'] as const;
export type PermitCategory = (typeof PERMIT_CATEGORIES)[number];

export const PERMIT_STATUSES = ['pending', 'effective', 'issued', 'administratively_continued', 'expired', 'unknown'] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export interface PermitFilters { category?: PermitCategory; status?: PermitStatus; }

export const LOCATION_SOURCES = ['dataset', 'census_geocoder', 'zip_centroid'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

/** A permit as served by the API. Every value comes from the dataset; null means "not listed". */
export const PermitSchema = z.object({
  id: z.string(),
  registrationNumber: z.string(),
  category: z.enum(PERMIT_CATEGORIES),
  company: z.string(),
  /** Facility name from the source (e.g. "ALBEMARLE CATALYSTS"), when it is more than a generic label. */
  facilityName: z.string().nullable(),
  address: z.string(),
  city: z.string(),
  county: z.string(),
  zip: z.string(),
  lat: z.number(),
  lng: z.number(),
  locationSource: z.enum(LOCATION_SOURCES),
  permitType: PermitTypeSchema,
  maxProductionCydPerHr: z.number().nullable(),
  maxHoursPerYear: z.number().nullable(),
  pollutants: z.array(z.string()),
  controls: z.string().nullable(),
  noticeType: z.string().nullable(),
  noticeIssuanceDate: z.string().nullable(),
  commentDeadline: z.string().nullable(),
  publicMeetingDate: z.string().nullable(),
  sourceUrl: z.string(),
  isSample: z.boolean(),
  permitStatus: z.enum(PERMIT_STATUSES).optional(),
  sourceStatus: z.string().nullable().optional(),
  operatorName: z.string().nullable().optional(),
  permitteeName: z.string().nullable().optional(),
  dataSource: z.string().nullable().optional(),
  retrievedAt: z.string().nullable().optional(),
  applicationDate: z.string().nullable().optional(),
  noticeUrl: z.string().nullable().optional(),
  locationNotes: z.string().nullable().optional(),
});
export type Permit = z.infer<typeof PermitSchema>;

/** Public TCEQ pages we link to for confirmation. */
export const TCEQ_LINKS = {
  eComment: 'https://www14.tceq.texas.gov/epic/eComment/',
  complaints: 'https://www.tceq.texas.gov/compliance/complaints/',
  airPermitSearch: 'https://www.tceq.texas.gov/permitting/air/nav/air_status_permits.html',
} as const;
