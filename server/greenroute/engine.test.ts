import { describe, expect, it } from 'vitest';
import { testDb } from '../testUtils.js';
import { getStats } from './callLog.js';
import { costUsd } from './costs.js';
import { GreenRouteError } from './engine.js';
import { LlmUnavailableError } from './llm.js';
import { permitSummaryTask } from './tasks.js';
import { engineWith, goodSummaryJson, makePermit, MODELS, NOTICE, scriptedLlm } from './testing.js';

type Row = { stage: string; model: string | null; route_reason: string; success: number; fallback: number; cache_hit: number; cost_usd: number; baseline_cost_usd: number };
const rows = (db: ReturnType<typeof testDb>) => db.prepare('SELECT * FROM ai_calls ORDER BY id').all() as Row[];

describe('GreenRoute engine', () => {
  it('routes a renewal to the small model by free rules (no router call)', async () => {
    const db = testDb();
    const { client, calls } = scriptedLlm({ [MODELS.small]: goodSummaryJson() });
    const result = await engineWith(db, client).run(permitSummaryTask, { permit: makePermit({ permitType: 'renewal' }), noticeText: NOTICE });
    expect(calls.map((c) => c.model)).toEqual([MODELS.small]);
    expect(result.meta).toMatchObject({ routedBy: 'rules', routeReason: 'rules:renewal', model: MODELS.small, fallback: false, cacheHit: false });
    expect(result.output.en.summary).toContain('300');
    expect(rows(db).map((r) => [r.stage, r.model, r.success])).toEqual([['execute', MODELS.small, 1]]);
  });

  it('routes new and amended permits to the large model', async () => {
    for (const permitType of ['new', 'amendment'] as const) {
      const db = testDb();
      const { client, calls } = scriptedLlm({ [MODELS.large]: goodSummaryJson() });
      await engineWith(db, client).run(permitSummaryTask, { permit: makePermit({ permitType }), noticeText: NOTICE });
      expect(calls.map((c) => c.model)).toEqual([MODELS.large]);
    }
  });

  it('asks the cheapest router model only when the rules cannot decide, with thinking minimal and ~10 output tokens', async () => {
    const db = testDb();
    const { client, calls } = scriptedLlm({ [MODELS.router]: 'simple', [MODELS.small]: goodSummaryJson() });
    const result = await engineWith(db, client).run(permitSummaryTask, { permit: makePermit({ permitType: 'unknown' }), noticeText: NOTICE });
    expect(calls.map((c) => c.model)).toEqual([MODELS.router, MODELS.small]);
    const routerCall = calls[0]!;
    expect(routerCall.maxOutputTokens).toBeLessThanOrEqual(10);
    expect(routerCall.thinkingLevel).toBe('minimal');
    expect(routerCall.responseJsonSchema).toBeUndefined();
    // The router never sees untrusted notice text.
    expect(routerCall.user).not.toContain(NOTICE);
    expect(result.meta.routedBy).toBe('router');
    expect(rows(db).map((r) => r.stage)).toEqual(['router', 'execute']);
  });

  it('defaults to the large model when the router answers anything else or is down', async () => {
    for (const reply of ['maybe?', new LlmUnavailableError('down', 503)]) {
      const db = testDb();
      const { client, calls } = scriptedLlm({ [MODELS.router]: reply, [MODELS.large]: goodSummaryJson() });
      await engineWith(db, client).run(permitSummaryTask, { permit: makePermit({ permitType: 'unknown' }), noticeText: NOTICE });
      expect(calls.map((c) => c.model)).toEqual([MODELS.router, MODELS.large]);
    }
  });

  it('serves repeat requests from the cache at $0 and logs the baseline it avoided', async () => {
    const db = testDb();
    const { client, calls } = scriptedLlm({ [MODELS.small]: goodSummaryJson() });
    const engine = engineWith(db, client);
    const input = { permit: makePermit(), noticeText: NOTICE };
    await engine.run(permitSummaryTask, input);
    const second = await engine.run(permitSummaryTask, input);
    expect(calls).toHaveLength(1);
    expect(second.meta).toMatchObject({ cacheHit: true, routedBy: 'cache', costUsd: 0 });
    const cacheRow = rows(db)[1]!;
    expect(cacheRow).toMatchObject({ stage: 'cache', cache_hit: 1, cost_usd: 0 });
    expect(cacheRow.baseline_cost_usd).toBeCloseTo(costUsd(MODELS.large, { inputTokens: 1000, outputTokens: 200 }), 12);
  });

  it('shares one model call between identical concurrent requests', async () => {
    const db = testDb();
    const { client, calls } = scriptedLlm({ [MODELS.small]: goodSummaryJson() });
    const engine = engineWith(db, client);
    const input = { permit: makePermit(), noticeText: NOTICE };
    const [a, b] = await Promise.all([engine.run(permitSummaryTask, input), engine.run(permitSummaryTask, input)]);
    expect(calls).toHaveLength(1);
    expect(a.output).toEqual(b.output);
  });

  it('retries once on the large model when the small model returns invalid JSON (logged as fallback)', async () => {
    const db = testDb();
    const { client, calls } = scriptedLlm({ [MODELS.small]: '{"en": "oops"', [MODELS.large]: goodSummaryJson() });
    const result = await engineWith(db, client).run(permitSummaryTask, { permit: makePermit(), noticeText: NOTICE });
    expect(calls.map((c) => c.model)).toEqual([MODELS.small, MODELS.large]);
    expect(result.meta.fallback).toBe(true);
    expect(rows(db).map((r) => [r.stage, r.success, r.fallback])).toEqual([
      ['execute', 0, 0],
      ['fallback', 1, 1],
    ]);
  });

  it('treats invented numbers as low quality and falls back', async () => {
    const db = testDb();
    const invented = goodSummaryJson().replace('300 cubic yards', '450 cubic yards');
    const { client } = scriptedLlm({ [MODELS.small]: invented, [MODELS.large]: goodSummaryJson() });
    const result = await engineWith(db, client).run(permitSummaryTask, { permit: makePermit(), noticeText: NOTICE });
    expect(result.meta.fallback).toBe(true);
    expect(result.output.en.summary).toContain('300');
    expect((db.prepare("SELECT error_code FROM ai_calls WHERE stage = 'execute'").get() as { error_code: string }).error_code).toBe(
      'low_quality',
    );
  });

  it('fails with a typed error after exactly one fallback', async () => {
    const db = testDb();
    const { client, calls } = scriptedLlm({ [MODELS.small]: 'not json', [MODELS.large]: 'still not json' });
    await expect(engineWith(db, client).run(permitSummaryTask, { permit: makePermit(), noticeText: NOTICE })).rejects.toMatchObject({
      code: 'ai_invalid_output',
    });
    expect(calls).toHaveLength(2);

    const down = scriptedLlm({});
    await expect(engineWith(testDb(), down.client).run(permitSummaryTask, { permit: makePermit(), noticeText: NOTICE })).rejects.toBeInstanceOf(
      GreenRouteError,
    );
  });

  it('records actual cost, the all-large baseline, and savings in the stats', async () => {
    const db = testDb();
    const { client } = scriptedLlm({ [MODELS.small]: goodSummaryJson() });
    const engine = engineWith(db, client);
    const input = { permit: makePermit(), noticeText: NOTICE };
    await engine.run(permitSummaryTask, input); // small model
    await engine.run(permitSummaryTask, input); // cache hit

    const usage = { inputTokens: 1000, outputTokens: 200 };
    const stats = getStats(db, MODELS.large);
    expect(stats.tasks).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.rulesRouted).toBe(1);
    expect(stats.modelMix).toEqual([expect.objectContaining({ model: MODELS.small, calls: 1 })]);
    expect(stats.cost.actualUsd).toBeCloseTo(costUsd(MODELS.small, usage), 12);
    expect(stats.cost.baselineUsd).toBeCloseTo(2 * costUsd(MODELS.large, usage), 12);
    expect(stats.cost.savedPercent).toBeGreaterThan(50);
    expect(stats.energy.estimated).toBe(true);
    expect(stats.energy.savedWh).toBeGreaterThan(0);
  });
});
