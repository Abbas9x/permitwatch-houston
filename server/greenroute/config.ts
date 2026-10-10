/**
 * GreenRoute pricing and energy configuration.
 *
 * PRICING: USD per 1M tokens, standard paid tier, text input; output price includes thinking tokens.
 * Source: https://ai.google.dev/gemini-api/docs/pricing (page "last updated 2026-10-09 UTC"), retrieved 2026-10-10.
 * Note: Google lists higher prices for Gemini 3.6/3.8 Flash starting in 2027; update this table then.
 */
export const PRICING_SOURCE = {
  url: 'https://ai.google.dev/gemini-api/docs/pricing',
  retrieved: '2026-10-10',
  pageUpdated: '2026-10-09',
} as const;

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const PRICING: Record<string, ModelPrice> = {
  'gemini-3.1-flash-lite': { inputPerMTok: 0.25, outputPerMTok: 1.5 },
  'gemini-3.5-flash-lite': { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  'gemini-3.6-flash': { inputPerMTok: 0.75, outputPerMTok: 3.75 },
  'gemini-3.8-flash': { inputPerMTok: 0.75, outputPerMTok: 3.75 },
  'gemini-3-flash-preview': { inputPerMTok: 0.5, outputPerMTok: 3.0 },
  'gemini-3.1-pro-preview': { inputPerMTok: 2.0, outputPerMTok: 12.0 },
  'gemini-2.5-flash-lite': { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  'gemini-2.5-flash': { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  'gemini-2.5-pro': { inputPerMTok: 1.25, outputPerMTok: 10.0 },
};

/**
 * ENERGY (ESTIMATED): watt-hours per 1,000 tokens processed (input + output).
 * Google does not publish per-model, per-token energy. These factors are ASSUMPTIONS for
 * illustration, anchored to Google's published median Gemini Apps text prompt of 0.24 Wh
 * ("Measuring the environmental impact of delivering AI at Google scale", Aug 2025) and scaled
 * by each model's relative output price as a rough proxy for compute. Label every number "estimated".
 */
export const ENERGY_SOURCE = {
  note: 'Estimated. Factors are assumptions scaled from Google’s published 0.24 Wh median Gemini text prompt (Aug 2025); not measured.',
  // Reporting on Google's Aug 2025 paper (self-reported, not independently verified).
  url: 'https://www.technologyreview.com/2025/08/21/1122288/google-gemini-ai-energy/',
} as const;

export const ENERGY_WH_PER_1K_TOKENS: Record<string, number> = {
  'gemini-3.1-flash-lite': 0.1,
  'gemini-3.5-flash-lite': 0.16,
  'gemini-3.6-flash': 0.24,
  'gemini-3.8-flash': 0.24,
  'gemini-3-flash-preview': 0.19,
  'gemini-3.1-pro-preview': 0.77,
  'gemini-2.5-flash-lite': 0.03,
  'gemini-2.5-flash': 0.16,
  'gemini-2.5-pro': 0.64,
};

/** Used when a configured model is missing from the tables: assume the most expensive known model so savings are never overstated. */
const FALLBACK_PRICE: ModelPrice = { inputPerMTok: 2.0, outputPerMTok: 12.0 };
const FALLBACK_ENERGY = 0.77;

export function priceFor(model: string): ModelPrice {
  return PRICING[model] ?? FALLBACK_PRICE;
}

export function energyFactorFor(model: string): number {
  return ENERGY_WH_PER_1K_TOKENS[model] ?? FALLBACK_ENERGY;
}

export function isKnownModel(model: string): boolean {
  return model in PRICING && model in ENERGY_WH_PER_1K_TOKENS;
}

/** Bump when prompts change so cached AI results from older prompts are not reused. */
export const PROMPT_VERSION = 'v1';
