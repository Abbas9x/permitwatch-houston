import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, fetchJson, UpstreamError, USER_AGENT } from './http.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function options(fetchImpl: typeof fetch, retries = 2) {
  const sleep = vi.fn(async (_ms: number) => {});
  return { sleep, opts: { service: 'test', timeoutMs: 1000, retries, baseDelayMs: 100, fetchImpl, sleep, random: () => 0 } };
}

describe('fetchJson', () => {
  it('returns parsed JSON and identifies itself with a User-Agent', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ ok: 1 }));
    const { opts } = options(fetchImpl);
    await expect(fetchJson('https://x.test', { method: 'GET' }, opts)).resolves.toEqual({ ok: 1 });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries 5xx and 429 with exponential backoff, then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ ok: true }));
    const { opts, sleep } = options(fetchImpl);
    await expect(fetchJson('https://x.test', {}, opts)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it('retries network errors and timeouts, then gives up with UpstreamError', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    const { opts } = options(fetchImpl, 2);
    await expect(fetchJson('https://x.test', {}, opts)).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry client errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({}, 400));
    const { opts } = options(fetchImpl);
    await expect(fetchJson('https://x.test', {}, opts)).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid JSON bodies', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<html>', { status: 200 }));
    const { opts } = options(fetchImpl);
    await expect(fetchJson('https://x.test', {}, opts)).rejects.toThrow(/not valid JSON/);
  });

  it('adds jitter within one base delay', () => {
    expect(backoffDelay(0, 100, () => 0)).toBe(100);
    expect(backoffDelay(2, 100, () => 0.999)).toBe(499);
  });
});
