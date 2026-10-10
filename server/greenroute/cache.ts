import { nowIso, type DB } from '../db/index.js';
import { PROMPT_VERSION } from './config.js';
import type { TokenUsage } from './costs.js';
import { canonicalJson, sha256 } from './util.js';

/** Cache key = hash(prompt version + task type + canonical input). */
export function cacheKey(task: string, input: unknown): string {
  return sha256(`${PROMPT_VERSION}\n${task}\n${canonicalJson(input)}`);
}

export interface CachedResult extends TokenUsage {
  model: string;
  result: unknown;
}

export function getCached(db: DB, key: string): CachedResult | null {
  const row = db
    .prepare('SELECT model, result_json, input_tokens, output_tokens FROM ai_cache WHERE cache_key = ?')
    .get(key) as { model: string; result_json: string; input_tokens: number; output_tokens: number } | undefined;
  if (!row) return null;
  try {
    return {
      model: row.model,
      result: JSON.parse(row.result_json) as unknown,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    };
  } catch {
    return null;
  }
}

export function putCached(db: DB, key: string, task: string, model: string, result: unknown, usage: TokenUsage): void {
  db.prepare(
    `INSERT INTO ai_cache (cache_key, task, model, result_json, input_tokens, output_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (cache_key) DO UPDATE SET model = excluded.model, result_json = excluded.result_json,
       input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, created_at = excluded.created_at`,
  ).run(key, task, model, JSON.stringify(result), usage.inputTokens, usage.outputTokens, nowIso());
}
