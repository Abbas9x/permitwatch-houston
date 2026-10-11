/** Recent searches live only in this browser (per-viewer convenience); every access is guarded. */
const KEY = 'pw.recent';
const MAX = 5;

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  try {
    const next = [query, ...getRecentSearches().filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: nothing to remember
  }
}
