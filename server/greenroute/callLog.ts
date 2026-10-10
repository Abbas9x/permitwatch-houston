import type { GreenRouteStats } from '../../shared/api.js';
import { nowIso, type DB } from '../db/index.js';
import { ENERGY_SOURCE, PRICING_SOURCE } from './config.js';
import { percentSaved } from './costs.js';

export type CallStage = GreenRouteStats['recent'][number]['stage'];

export interface CallLogEntry {
  requestId: string;
  task: string;
  stage: CallStage;
  routeReason: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  energyWh: number;
  baselineEnergyWh: number;
  latencyMs: number;
  cacheHit: boolean;
  fallback: boolean;
  success: boolean;
  errorCode: string | null;
}

export function logCall(db: DB, e: CallLogEntry): void {
  db.prepare(
    `INSERT INTO ai_calls (created_at, request_id, task, stage, route_reason, model, input_tokens, output_tokens,
       cost_usd, baseline_cost_usd, energy_wh_est, baseline_energy_wh_est, latency_ms, cache_hit, fallback, success, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    nowIso(),
    e.requestId,
    e.task,
    e.stage,
    e.routeReason,
    e.model,
    Math.round(e.inputTokens),
    Math.round(e.outputTokens),
    e.costUsd,
    e.baselineCostUsd,
    e.energyWh,
    e.baselineEnergyWh,
    Math.round(e.latencyMs),
    e.cacheHit ? 1 : 0,
    e.fallback ? 1 : 0,
    e.success ? 1 : 0,
    e.errorCode,
  );
}

/** Dashboard numbers, computed only from the call log. */
export function getStats(db: DB, baselineModel: string): GreenRouteStats {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number | null }).n ?? 0;
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS cost, COALESCE(SUM(baseline_cost_usd), 0) AS baseline,
              COALESCE(SUM(energy_wh_est), 0) AS energy, COALESCE(SUM(baseline_energy_wh_est), 0) AS baselineEnergy
         FROM ai_calls`,
    )
    .get() as { cost: number; baseline: number; energy: number; baselineEnergy: number };

  const modelMix = (
    db
      .prepare(
        `SELECT model, COUNT(*) AS calls, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
                SUM(cost_usd) AS costUsd
           FROM ai_calls WHERE model IS NOT NULL AND stage IN ('router', 'execute', 'fallback')
          GROUP BY model ORDER BY calls DESC`,
      )
      .all() as GreenRouteStats['modelMix']
  ).map((m) => ({ ...m, costUsd: m.costUsd ?? 0 }));

  const taskMix = db
    .prepare('SELECT task, COUNT(DISTINCT request_id) AS count FROM ai_calls GROUP BY task ORDER BY count DESC')
    .all() as GreenRouteStats['taskMix'];

  const recent = (
    db
      .prepare(
        `SELECT created_at AS createdAt, task, stage, route_reason AS routeReason, model, input_tokens AS inputTokens,
                output_tokens AS outputTokens, cost_usd AS costUsd, latency_ms AS latencyMs, success
           FROM ai_calls ORDER BY id DESC LIMIT 25`,
      )
      .all() as (Omit<GreenRouteStats['recent'][number], 'success'> & { success: number })[]
  ).map((r) => ({ ...r, success: r.success === 1 }));

  return {
    tasks: n('SELECT COUNT(DISTINCT request_id) AS n FROM ai_calls'),
    permitsSummarized: n("SELECT COUNT(*) AS n FROM permit_summaries WHERE generator <> 'template'"),
    modelCalls: n("SELECT COUNT(*) AS n FROM ai_calls WHERE stage IN ('router', 'execute', 'fallback')"),
    cacheHits: n("SELECT COUNT(*) AS n FROM ai_calls WHERE stage = 'cache'"),
    rulesRouted: n("SELECT COUNT(DISTINCT request_id) AS n FROM ai_calls WHERE route_reason LIKE 'rules:%'"),
    routerCalls: n("SELECT COUNT(*) AS n FROM ai_calls WHERE stage = 'router'"),
    fallbacks: n("SELECT COUNT(*) AS n FROM ai_calls WHERE stage = 'fallback'"),
    failures: n('SELECT COUNT(*) AS n FROM ai_calls WHERE success = 0'),
    modelMix,
    taskMix,
    cost: {
      actualUsd: totals.cost,
      baselineUsd: totals.baseline,
      savedUsd: totals.baseline - totals.cost,
      savedPercent: percentSaved(totals.cost, totals.baseline),
    },
    energy: {
      actualWh: totals.energy,
      baselineWh: totals.baselineEnergy,
      savedWh: totals.baselineEnergy - totals.energy,
      savedPercent: percentSaved(totals.energy, totals.baselineEnergy),
      estimated: true,
    },
    baselineModel,
    pricingSource: PRICING_SOURCE,
    energySource: ENERGY_SOURCE,
    recent,
  };
}
