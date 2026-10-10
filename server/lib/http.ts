/** Identifies us to free public APIs, as their usage policies ask. */
export const USER_AGENT = 'PermitWatchHouston/0.1 (+https://github.com/Abbas9x/permitwatch-houston)';

export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(`${service}: ${message}`, options);
    this.name = 'UpstreamError';
  }
}

export interface RetryOptions {
  service: string;
  timeoutMs: number;
  /** Extra attempts after the first one. */
  retries: number;
  baseDelayMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Random source in [0, 1) for jitter; injectable for tests. */
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function backoffDelay(attempt: number, baseDelayMs: number, random: () => number): number {
  return baseDelayMs * 2 ** attempt + Math.floor(random() * baseDelayMs);
}

/**
 * GET/POST JSON with a per-attempt timeout and exponential backoff + jitter.
 * Retries network errors, timeouts, 408/429 and 5xx; never retries other 4xx.
 */
export async function fetchJson(url: string, init: RequestInit, options: RetryOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    if (attempt > 0) await sleep(backoffDelay(attempt - 1, options.baseDelayMs, random));
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) {
        lastError = new UpstreamError(options.service, `HTTP ${response.status}`, response.status);
        if (isRetryableStatus(response.status)) continue;
        throw lastError;
      }
      try {
        return (await response.json()) as unknown;
      } catch (cause) {
        throw new UpstreamError(options.service, 'response was not valid JSON', response.status, { cause });
      }
    } catch (error) {
      if (error instanceof UpstreamError) {
        if (error.status !== undefined && isRetryableStatus(error.status)) continue;
        throw error;
      }
      // Network failure or timeout (TimeoutError/AbortError): retry.
      lastError = new UpstreamError(options.service, (error as Error).name || 'network error', undefined, { cause: error });
    }
  }
  throw lastError instanceof UpstreamError ? lastError : new UpstreamError(options.service, 'request failed');
}
