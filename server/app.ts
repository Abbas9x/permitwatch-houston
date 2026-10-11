import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type Express, type Router } from 'express';
import type { Env } from './config/env.js';
import type { DB } from './db/index.js';
import { countPermits } from './db/permitsRepo.js';
import { errorHandler, HttpError } from './lib/errors.js';
import type { Logger } from './lib/logger.js';
import {
  corsPolicy,
  createLimiters,
  DEFAULT_RATE_LIMITS,
  originGuard,
  requestId,
  requireJsonBody,
  securityHeaders,
  type RateLimits,
} from './middleware/security.js';

export type Limiters = ReturnType<typeof createLimiters>;

export interface AppDeps {
  env: Env;
  db: DB;
  logger: Logger;
  rateLimits?: RateLimits;
  /** Extra API routers, mounted under /api. Each receives the shared limiters. */
  routes?: ((limiters: Limiters) => Router)[];
  /** Directory of the built frontend; served only if it exists. */
  clientDir?: string;
}

export function createApp(deps: AppDeps): Express {
  const { env, db, logger } = deps;
  const isProduction = env.NODE_ENV === 'production';
  const limiters = createLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(requestId());
  app.use(securityHeaders(isProduction));

  const api = express.Router();
  api.use(corsPolicy(env.ALLOWED_ORIGINS));
  api.use(originGuard(env.ALLOWED_ORIGINS));
  api.use(limiters.api);
  api.use(requireJsonBody());
  api.use(express.json({ limit: '16kb', strict: true }));
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (_req, res) => {
    res.json({
      ok: true,
      permits: countPermits(db),
    });
  });

  for (const makeRouter of deps.routes ?? []) api.use(makeRouter(limiters));

  api.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'That API route does not exist.')));
  app.use('/api', api);

  const clientDir = deps.clientDir ?? resolve(process.cwd(), 'dist/client');
  if (existsSync(join(clientDir, 'index.html'))) {
    app.use(
      '/assets',
      express.static(join(clientDir, 'assets'), { immutable: true, maxAge: '1y', index: false, fallthrough: false }),
    );
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    // Single-page app: every other GET returns index.html.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(clientDir, 'index.html'));
    });
  } else if (isProduction) {
    logger.warn({ clientDir }, 'built frontend not found; only the API is being served');
  }

  app.use(errorHandler(logger));
  return app;
}
