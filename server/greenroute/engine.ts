import { randomUUID } from 'node:crypto';
import type { DB } from '../db/index.js';
import type { Logger } from '../lib/logger.js';
import { cacheKey, getCached, putCached } from './cache.js';
import { logCall, type CallStage } from './callLog.js';
import { costUsd, energyWhEstimate, type TokenUsage } from './costs.js';
import { LlmUnavailableError, type LlmClient, type ThinkingLevelName } from './llm.js';
import { newNonce } from './prompts.js';
import {
  parseRouterDecision,
  routeByRules,
  ROUTER_MAX_OUTPUT_TOKENS,
  ROUTER_SYSTEM_PROMPT,
  tierForDecision,
  type RouterDecision,
  type Tier,
} from './routing.js';
import type { TaskDefinition } from './tasks.js';
import { parseJsonLoose } from './util.js';

export interface GreenRouteModels {
  router: string;
  small: string;
  large: string;
}

export interface GreenRouteThinking {
  router: ThinkingLevelName;
  small: ThinkingLevelName;
  large: ThinkingLevelName;
}

export interface RunMeta {
  requestId: string;
  model: string;
  routedBy: 'cache' | 'rules' | 'router';
  routeReason: string;
  cacheHit: boolean;
  fallback: boolean;
  /** Cost of this request (router + attempts), USD. */
  costUsd: number;
  /** Same work on the large model with no cache/routing, USD. */
  baselineCostUsd: number;
  latencyMs: number;
  generatedBy: 'ai' | 'mock';
}

export interface RunResult<O> {
  output: O;
  meta: RunMeta;
}

export class GreenRouteError extends Error {
  constructor(
    public readonly code: 'ai_unavailable' | 'ai_invalid_output',
    message: string,
  ) {
    super(message);
    this.name = 'GreenRouteError';
  }
}

export interface GreenRouteDeps {
  db: DB;
  logger: Logger;
  llm: LlmClient;
  models: GreenRouteModels;
  thinking: GreenRouteThinking;
  now?: () => number;
}

type AttemptResult<O> =
  | { ok: true; output: O; usage: TokenUsage; model: string; cost: number; baseline: number }
  | { ok: false; reason: 'unavailable' | 'invalid_output' | 'low_quality'; cost: number };

export interface GreenRoute {
  run<I, O>(task: TaskDefinition<I, O>, input: I): Promise<RunResult<O>>;
  readonly models: GreenRouteModels;
  readonly mode: 'live' | 'mock';
}

export function createGreenRoute(deps: GreenRouteDeps): GreenRoute {
  const { db, logger, llm, models, thinking } = deps;
  const now = deps.now ?? (() => performance.now());
  const generatedBy = llm.kind === 'mock' ? 'mock' : 'ai';
  const inflight = new Map<string, Promise<RunResult<unknown>>>();

  const modelFor = (tier: Tier) => (tier === 'small' ? models.small : models.large);
  const thinkingFor = (tier: Tier) => (tier === 'small' ? thinking.small : thinking.large);
  const baselineCost = (usage: TokenUsage) => costUsd(models.large, usage);
  const baselineEnergy = (usage: TokenUsage) => energyWhEstimate(models.large, usage);

  function log(
    requestId: string,
    task: string,
    stage: CallStage,
    routeReason: string,
    model: string | null,
    usage: TokenUsage,
    latencyMs: number,
    flags: { success: boolean; cacheHit?: boolean; fallback?: boolean; errorCode?: string | null; countBaseline?: boolean },
  ) {
    const actualModel = flags.cacheHit ? null : model;
    logCall(db, {
      requestId,
      task,
      stage,
      routeReason,
      model,
      inputTokens: flags.cacheHit ? 0 : usage.inputTokens,
      outputTokens: flags.cacheHit ? 0 : usage.outputTokens,
      costUsd: actualModel ? costUsd(actualModel, usage) : 0,
      baselineCostUsd: flags.countBaseline ? baselineCost(usage) : 0,
      energyWh: actualModel ? energyWhEstimate(actualModel, usage) : 0,
      baselineEnergyWh: flags.countBaseline ? baselineEnergy(usage) : 0,
      latencyMs,
      cacheHit: flags.cacheHit ?? false,
      fallback: flags.fallback ?? false,
      success: flags.success,
      errorCode: flags.errorCode ?? null,
    });
  }

  async function callRouter(requestId: string, taskName: string, description: string): Promise<{ decision: RouterDecision; cost: number }> {
    const started = now();
    try {
      const response = await llm.generate({
        model: models.router,
        system: ROUTER_SYSTEM_PROMPT,
        user: description,
        maxOutputTokens: ROUTER_MAX_OUTPUT_TOKENS,
        temperature: 0,
        thinkingLevel: thinking.router,
        metadata: { task: 'router' },
      });
      const decision = parseRouterDecision(response.text);
      const usage = { inputTokens: response.inputTokens, outputTokens: response.outputTokens };
      log(requestId, taskName, 'router', `router:${decision}`, models.router, usage, now() - started, { success: true });
      return { decision, cost: costUsd(models.router, usage) };
    } catch (error) {
      // Router down: be safe and use the large model.
      logger.warn({ err: error, task: taskName }, 'router unavailable; defaulting to large model');
      log(requestId, taskName, 'router', 'router:error', models.router, { inputTokens: 0, outputTokens: 0 }, now() - started, {
        success: false,
        errorCode: 'unavailable',
      });
      return { decision: 'complex', cost: 0 };
    }
  }

  async function attempt<I, O>(
    task: TaskDefinition<I, O>,
    input: I,
    tier: Tier,
    stage: 'execute' | 'fallback',
    routeReason: string,
    requestId: string,
  ): Promise<AttemptResult<O>> {
    const model = modelFor(tier);
    const started = now();
    const prompt = task.buildPrompt(input, newNonce());
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    const fail = (reason: 'unavailable' | 'invalid_output' | 'low_quality', detail?: unknown): AttemptResult<O> => {
      logger.warn({ task: task.name, model, stage, reason, detail }, 'greenroute attempt rejected');
      log(requestId, task.name, stage, routeReason, model, usage, now() - started, {
        success: false,
        fallback: stage === 'fallback',
        errorCode: reason,
      });
      return { ok: false, reason, cost: costUsd(model, usage) };
    };

    let text: string;
    try {
      const response = await llm.generate({
        model,
        system: prompt.system,
        user: prompt.user,
        maxOutputTokens: task.maxOutputTokens,
        temperature: task.temperature,
        thinkingLevel: thinkingFor(tier),
        responseJsonSchema: task.responseJsonSchema,
        metadata: { task: task.name, input },
      });
      usage = { inputTokens: response.inputTokens, outputTokens: response.outputTokens };
      text = response.text;
    } catch (error) {
      return fail('unavailable', error instanceof LlmUnavailableError ? error.message : 'unexpected client error');
    }

    let raw: unknown;
    try {
      raw = parseJsonLoose(text);
    } catch {
      return fail('invalid_output', 'not JSON');
    }
    const parsed = task.outputSchema.safeParse(raw);
    if (!parsed.success) return fail('invalid_output', parsed.error.issues.slice(0, 3).map((i) => i.message));
    const problems = task.qualityProblems(parsed.data, input);
    if (problems.length > 0) return fail('low_quality', problems.slice(0, 5));

    log(requestId, task.name, stage, routeReason, model, usage, now() - started, {
      success: true,
      fallback: stage === 'fallback',
      countBaseline: true,
    });
    return { ok: true, output: parsed.data, usage, model, cost: costUsd(model, usage), baseline: baselineCost(usage) };
  }

  async function runUncached<I, O>(task: TaskDefinition<I, O>, input: I, key: string): Promise<RunResult<O>> {
    const requestId = randomUUID();
    const started = now();

    // 1. Cache: identical task + input costs $0.
    const cached = getCached(db, key);
    if (cached) {
      const parsed = task.outputSchema.safeParse(cached.result);
      if (parsed.success) {
        log(requestId, task.name, 'cache', 'cache', cached.model, cached, now() - started, {
          success: true,
          cacheHit: true,
          countBaseline: true,
        });
        return {
          output: parsed.data,
          meta: {
            requestId,
            model: cached.model,
            routedBy: 'cache',
            routeReason: 'cache',
            cacheHit: true,
            fallback: false,
            costUsd: 0,
            baselineCostUsd: baselineCost(cached),
            latencyMs: now() - started,
            generatedBy,
          },
        };
      }
    }

    // 2. Free rules, 3. router only if the rules can't decide.
    let tier: Tier;
    let routeReason: string;
    let routedBy: 'rules' | 'router';
    let spent = 0;
    const rule = routeByRules(task.permitType(input));
    if (rule) {
      ({ tier, reason: routeReason } = rule);
      routedBy = 'rules';
    } else {
      const routed = await callRouter(requestId, task.name, task.routerDescription(input));
      tier = tierForDecision(routed.decision);
      routeReason = `router:${routed.decision}`;
      routedBy = 'router';
      spent += routed.cost;
    }

    // 4. Execute; if invalid or low quality, retry once on the large model.
    const first = await attempt(task, input, tier, 'execute', routeReason, requestId);
    spent += first.cost;
    let final = first;
    let fallback = false;
    if (!first.ok) {
      fallback = true;
      const second = await attempt(task, input, 'large', 'fallback', `fallback:${first.reason}`, requestId);
      spent += second.cost;
      final = second;
      if (!second.ok) {
        const code = first.reason === 'unavailable' && second.reason === 'unavailable' ? 'ai_unavailable' : 'ai_invalid_output';
        throw new GreenRouteError(code, `${task.name} failed: ${first.reason}, then ${second.reason}`);
      }
    }
    if (!final.ok) throw new GreenRouteError('ai_invalid_output', 'unreachable');

    putCached(db, key, task.name, final.model, final.output, final.usage);
    return {
      output: final.output,
      meta: {
        requestId,
        model: final.model,
        routedBy,
        routeReason,
        cacheHit: false,
        fallback,
        costUsd: spent,
        baselineCostUsd: final.baseline,
        latencyMs: now() - started,
        generatedBy,
      },
    };
  }

  return {
    models,
    mode: llm.kind === 'mock' ? 'mock' : 'live',
    run<I, O>(task: TaskDefinition<I, O>, input: I): Promise<RunResult<O>> {
      // Identical concurrent requests share one model call.
      const key = cacheKey(task.name, input);
      const existing = inflight.get(key) as Promise<RunResult<O>> | undefined;
      if (existing) return existing;
      const promise = runUncached(task, input, key).finally(() => inflight.delete(key));
      inflight.set(key, promise as Promise<RunResult<unknown>>);
      return promise;
    },
  };
}
