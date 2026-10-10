import { parseEnv, type Env } from './config/env.js';
import { openDatabase, type DB } from './db/index.js';
import { createLogger, type Logger } from './lib/logger.js';

/** Shared helpers for unit tests (not part of the production build: only imported by *.test.ts). */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    DATABASE_PATH: ':memory:',
    GEMINI_MODEL_ROUTER: 'gemini-3.1-flash-lite',
    GEMINI_MODEL_SMALL: 'gemini-3.5-flash-lite',
    GEMINI_MODEL_LARGE: 'gemini-3.8-flash',
    GEMINI_MOCK: 'ok',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

export function testDb(): DB {
  return openDatabase(':memory:');
}

export function silentLogger(): Logger {
  return createLogger('silent');
}
