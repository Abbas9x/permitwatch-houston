/** Input rules shared by the browser (instant feedback) and the server (authoritative check). */

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 200;
const ALLOWED_SEARCH_CHARS = /^[\p{L}\p{N}\s#,.'’/&()-]+$/u;

export type SearchInputError = 'empty' | 'too_short' | 'too_long' | 'invalid_zip' | 'invalid_chars';

export function checkSearchInput(raw: string): SearchInputError | null {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value.length === 0) return 'empty';
  if (value.length < SEARCH_QUERY_MIN) return 'too_short';
  if (value.length > SEARCH_QUERY_MAX) return 'too_long';
  if (/^\d+$/.test(value) && !/^\d{5}$/.test(value)) return 'invalid_zip';
  if (!ALLOWED_SEARCH_CHARS.test(value)) return 'invalid_chars';
  return null;
}

export const PERMIT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export const EMAIL_MAX = 254;
// Pragmatic email check (RFC 5322 is not worth the risk of a catastrophic-backtracking regex).
export const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+$/;

export const COMMENT_CONCERNS = [
  'dust',
  'truck_traffic',
  'noise',
  'hours',
  'proximity_homes_schools',
  'cumulative',
  'water_runoff',
  'more_information',
] as const;
export type CommentConcern = (typeof COMMENT_CONCERNS)[number];

export const PERSONAL_NOTE_MAX = 600;
export const QUESTION_MAX = 300;

export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];
