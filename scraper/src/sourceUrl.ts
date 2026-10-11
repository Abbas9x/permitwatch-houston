/** Choose an actual official link; never repair a hostname by guessing. */
export function pickOfficialSource(candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url=new URL(candidate);
      if (url.protocol==='https:' && !url.username && !url.password && (url.hostname==='tceq.texas.gov' || url.hostname.endsWith('.tceq.texas.gov'))) return candidate;
    } catch { /* Try the next downloaded notice. */ }
  }
  return null;
}
