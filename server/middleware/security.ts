import { randomUUID } from 'node:crypto';
import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { HttpError } from '../lib/errors.js';

/** Third-party origins the browser talks to directly (map tiles, glyphs, sprites). */
const MAP_TILE_ORIGIN = 'https://tiles.openfreemap.org';

export function requestId(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Request-Id', randomUUID());
    next();
  };
}

export function securityHeaders(isProduction: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // MapLibre and Framer Motion position elements with inline style attributes.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', MAP_TILE_ORIGIN],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", MAP_TILE_ORIGIN],
        // MapLibre runs its tile parser in a blob: web worker.
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        manifestSrc: ["'self'"],
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // Map tiles are cross-origin resources without CORP headers.
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  });
}

/** CORS for our own frontend origin(s) only. */
export function corsPolicy(allowedOrigins: readonly string[]): RequestHandler {
  return cors({
    origin: (origin, callback) => callback(null, origin === undefined || allowedOrigins.includes(origin)),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  });
}

/**
 * Browsers always send Origin on cross-site POSTs. Rejecting unknown origins outright
 * (rather than only withholding CORS headers) blocks cross-site form posts and CSRF-style abuse.
 */
export function originGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      next(new HttpError(403, 'origin_not_allowed', 'This site is not allowed to use the PermitWatch API.'));
      return;
    }
    next();
  };
}

/** POST bodies must be JSON; anything else is rejected before parsing. */
export function requireJsonBody(): RequestHandler {
  return (req, _res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) {
      next(new HttpError(415, 'unsupported_media_type', 'Requests must be sent as JSON.'));
      return;
    }
    next();
  };
}

export interface RateLimits {
  apiPerMinute: number;
  draftsPerMinute: number;
  signupsPer10Minutes: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = { apiPerMinute: 120, draftsPerMinute: 10, signupsPer10Minutes: 5 };

function limiter(limit: number, windowMs: number, message: string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'rate_limited', message)),
  });
}

export function createLimiters(limits: RateLimits) {
  return {
    api: limiter(limits.apiPerMinute, 60_000, 'Too many requests. Please wait a minute and try again.'),
    draft: limiter(limits.draftsPerMinute, 60_000, 'Too many draft requests. Please wait a minute and try again.'),
    signup: limiter(limits.signupsPer10Minutes, 10 * 60_000, 'Too many sign-up attempts. Please try again later.'),
  };
}
