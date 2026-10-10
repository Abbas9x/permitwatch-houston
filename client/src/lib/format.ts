import type { Language } from '../../../shared/validation';

const locale = (lang: Language) => (lang === 'es' ? 'es-US' : 'en-US');

export function formatNumber(value: number, lang: Language, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits }).format(value);
}

export function formatMiles(value: number, lang: Language): string {
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** Parses a dataset date ("YYYY-MM-DD") as a local calendar date, so it never shifts a day across time zones. */
export function parseLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDate(iso: string, lang: Language): string {
  const date = parseLocalDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

/**
 * Whole calendar days from `today` until a deadline that IS in the dataset.
 * Negative means the deadline has passed. We never compute a deadline, only count down to a listed one.
 */
export function daysUntil(deadlineIso: string, today: Date = new Date()): number | null {
  const deadline = parseLocalDate(deadlineIso);
  if (!deadline) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((deadline.getTime() - start.getTime()) / 86_400_000);
}
