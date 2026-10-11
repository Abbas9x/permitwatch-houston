// Polite, cached HTTP for TCEQ and the Census geocoder: one request at a time,
// at least 1 second apart, and every response (including 404s) cached under
// data/raw/ so reruns don't refetch.

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const RAW_DIR = fileURLToPath(new URL("../../data/raw/", import.meta.url));

const USER_AGENT = "PermitWatch-scraper (CodeRED hackathon project; https://github.com/Abbas9x/permitwatch-houston)";
const MIN_GAP_MS = 1000;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Global --refresh flag: refetch instead of reading the cache. */
export const REFRESH = process.argv.includes("--refresh");
const refreshed = new Set<string>();
const retriedMissing = new Set<string>();
/** Refresh source indexes once per run; reuse downloaded PDFs and geocoding caches. */
function shouldRefresh(cachePath: string): boolean {
  if (REFRESH) return true;
  const list = basename(cachePath);
  const isIndex = list === "pending.html" || list === "notices.html" || /^nsr-.*\.html$/.test(list);
  if (!process.argv.includes("--refresh-lists") || !isIndex || refreshed.has(cachePath)) return false;
  refreshed.add(cachePath);
  return true;
}

/** Run requests one at a time, at least MIN_GAP_MS apart. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}

// Backoff before each retry when a server is overloaded (429) or failing (5xx).
const RETRY_DELAYS_MS = [5000, 15000, 30000];

async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000), headers: { "User-Agent": USER_AGENT, ...init.headers } });
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) return res;
    await res.arrayBuffer();
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}

/**
 * GET `url`, caching the body at `cachePath`. Returns null for a 404, and
 * remembers it with a `<cachePath>.404` marker. Other errors throw.
 */
export function cachedGet(url: string, cachePath: string, retryMissing = false): Promise<Buffer | null> {
  return enqueue(async () => {
    const missingMarker = `${cachePath}.404`;
    if (!shouldRefresh(cachePath)) {
      if (existsSync(cachePath)) return readFile(cachePath);
      if (existsSync(missingMarker)) {
        if (!retryMissing || retriedMissing.has(cachePath)) return null;
        retriedMissing.add(cachePath);
      }
    }

    const res = await politeFetch(url);
    await mkdir(dirname(cachePath), { recursive: true });
    if (res.status === 404) {
      await writeFile(missingMarker, "");
      return null;
    }
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    const body = Buffer.from(await res.arrayBuffer());
    await writeFile(cachePath, body);
    await rm(missingMarker, { force: true });
    return body;
  });
}

/**
 * Submit a form that needs a session: GET `sessionUrl` for its cookies, then
 * POST `form` to `url` with them. The response is cached at `cachePath`.
 */
export function cachedPostForm(
  url: string,
  form: URLSearchParams,
  sessionUrl: string,
  cachePath: string,
): Promise<Buffer> {
  return enqueue(async () => {
    if (!shouldRefresh(cachePath) && existsSync(cachePath)) return readFile(cachePath);

    const session = await politeFetch(sessionUrl);
    if (!session.ok) throw new Error(`GET ${sessionUrl} failed: ${session.status} ${session.statusText}`);
    await session.arrayBuffer();
    const cookie = session.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const res = await politeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie, Referer: sessionUrl },
      body: form.toString(),
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}`);
    const body = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, body);
    return body;
  });
}

/** POST `body` (e.g. a multipart form) to `url`, caching the response at `cachePath`. */
export function cachedPost(url: string, body: FormData, cachePath: string): Promise<Buffer> {
  return enqueue(async () => {
    if (!shouldRefresh(cachePath) && existsSync(cachePath)) return readFile(cachePath);
    const res = await politeFetch(url, { method: "POST", body });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}`);
    const out = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, out);
    return out;
  });
}
