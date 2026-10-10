// Polite, cached HTTP for TCEQ and the Census geocoder: one request at a time,
// at least 1 second apart, and every response (including 404s) cached under
// data/raw/ so reruns don't refetch.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const RAW_DIR = fileURLToPath(new URL("../../data/raw/", import.meta.url));

const USER_AGENT = "PermitWatch-scraper (CodeRED hackathon project)";
const MIN_GAP_MS = 1000;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Global --refresh flag: refetch instead of reading the cache. */
export const REFRESH = process.argv.includes("--refresh");

/**
 * GET `url`, caching the body at `cachePath`. Returns null for a 404, and
 * remembers it with a `<cachePath>.404` marker. Other errors throw.
 */
export function cachedGet(url: string, cachePath: string): Promise<Buffer | null> {
  const run = async () => {
    const missingMarker = `${cachePath}.404`;
    if (!REFRESH) {
      if (existsSync(cachePath)) return readFile(cachePath);
      if (existsSync(missingMarker)) return null;
    }

    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    await mkdir(dirname(cachePath), { recursive: true });
    if (res.status === 404) {
      await writeFile(missingMarker, "");
      return null;
    }
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    const body = Buffer.from(await res.arrayBuffer());
    await writeFile(cachePath, body);
    return body;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
