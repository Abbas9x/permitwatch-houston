import { energyFactorFor, priceFor } from './config.js';

export interface TokenUsage {
  inputTokens: number;
  /** Visible output + thinking tokens (both are billed at the output rate). */
  outputTokens: number;
}

export function costUsd(model: string, usage: TokenUsage): number {
  const price = priceFor(model);
  return (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000;
}

/** ESTIMATED watt-hours (see ENERGY_SOURCE in config.ts). */
export function energyWhEstimate(model: string, usage: TokenUsage): number {
  return ((usage.inputTokens + usage.outputTokens) / 1000) * energyFactorFor(model);
}

/** Percent saved vs. baseline, or null when there is no baseline yet. */
export function percentSaved(actual: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return Math.max(-999, Math.min(100, (1 - actual / baseline) * 100));
}
