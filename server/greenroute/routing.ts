import type { PermitType } from '../../shared/permit.js';

export type Tier = 'small' | 'large';
export type RouterDecision = 'simple' | 'complex';

/**
 * Free rules (no AI call). A known permit type decides the model:
 * renewals restate an existing permit -> small model; new plants and amendments -> large model.
 * Returns null when the rules can't decide (unknown type), which sends the task to the router.
 */
export function routeByRules(permitType: PermitType): { tier: Tier; reason: string } | null {
  switch (permitType) {
    case 'renewal':
      return { tier: 'small', reason: 'rules:renewal' };
    case 'new':
      return { tier: 'large', reason: 'rules:new' };
    case 'amendment':
      return { tier: 'large', reason: 'rules:amendment' };
    case 'unknown':
      return null;
  }
}

export const ROUTER_MAX_OUTPUT_TOKENS = 10;

export const ROUTER_SYSTEM_PROMPT = [
  'You route AI tasks to the cheapest model that can do them well.',
  'Reply with exactly one lowercase word and nothing else: simple or complex.',
  'simple: short, well-structured input with the key facts present.',
  'complex: long or messy input, several key facts missing, or an unusual request.',
].join('\n');

/** Accepts exactly "simple" or "complex" (case/punctuation-insensitive); anything else is "complex". */
export function parseRouterDecision(text: string): RouterDecision {
  const word = text.trim().toLowerCase().replace(/[^a-z]/g, '');
  return word === 'simple' ? 'simple' : 'complex';
}

export function tierForDecision(decision: RouterDecision): Tier {
  return decision === 'simple' ? 'small' : 'large';
}
