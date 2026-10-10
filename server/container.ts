import type { AppDeps } from './app.js';
import type { Env } from './config/env.js';
import type { DB } from './db/index.js';
import { isKnownModel } from './greenroute/config.js';
import { createGreenRoute, type GreenRoute } from './greenroute/engine.js';
import { createGeminiClient } from './greenroute/geminiClient.js';
import type { LlmClient } from './greenroute/llm.js';
import { createMockClient } from './greenroute/mockClient.js';
import type { GeocodeFn } from './importer/importer.js';
import type { Logger } from './lib/logger.js';
import { aiRouter } from './routes/ai.js';
import { searchRouter } from './routes/search.js';
import { createGeocoder, type Geocoder } from './services/geocoder.js';
import { loadZipCentroids } from './services/zipCentroids.js';

export interface Services {
  geocoder: Geocoder;
  engine: GreenRoute;
}

export function createLlmClient(env: Env, logger: Logger): LlmClient {
  if (env.GEMINI_MOCK !== 'off') return createMockClient(env.GEMINI_MOCK);
  // parseEnv guarantees the key exists when the mock is off.
  return createGeminiClient({ apiKey: env.GEMINI_API_KEY!, timeoutMs: env.GEMINI_TIMEOUT_MS, logger });
}

/** Wires real service implementations. Tests build their own with fakes. */
export function createServices(env: Env, db: DB, logger: Logger, llm: LlmClient = createLlmClient(env, logger)): Services {
  const models = { router: env.GEMINI_MODEL_ROUTER, small: env.GEMINI_MODEL_SMALL, large: env.GEMINI_MODEL_LARGE };
  for (const model of Object.values(models)) {
    if (!isKnownModel(model)) {
      logger.warn({ model }, 'model not in the GreenRoute pricing table; costs will be estimated conservatively');
    }
  }
  return {
    geocoder: createGeocoder({ db, logger, zipCentroids: loadZipCentroids() }),
    engine: createGreenRoute({
      db,
      logger,
      llm,
      models,
      thinking: { router: env.GEMINI_THINKING_ROUTER, small: env.GEMINI_THINKING_SMALL, large: env.GEMINI_THINKING_LARGE },
    }),
  };
}

export function createRoutes(db: DB, services: Services): NonNullable<AppDeps['routes']> {
  return [searchRouter({ db, geocoder: services.geocoder }), aiRouter({ db, engine: services.engine })];
}

/** Adapts the address geocoder for the importer (rows without lat/lng). */
export function importerGeocode(geocoder: Geocoder): GeocodeFn {
  return async ({ address, city, zip }) => {
    const outcome = await geocoder.geocode(`${address}, ${city}, TX ${zip}`);
    if (outcome.status !== 'found') return null;
    return { lat: outcome.result.lat, lng: outcome.result.lng, source: outcome.result.source };
  };
}
