import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.js';

const base = {
  NODE_ENV: 'development',
  ALLOWED_ORIGINS: 'http://localhost:5173,https://permitwatch.example.org',
  DATABASE_PATH: './data/test.db',
  GEMINI_API_KEY: 'test_key_value_that_is_long_enough_123',
  GEMINI_MODEL_ROUTER: 'gemini-3.1-flash-lite',
  GEMINI_MODEL_SMALL: 'gemini-3.5-flash-lite',
  GEMINI_MODEL_LARGE: 'gemini-3.8-flash',
};

function problemsFor(env: Record<string, string | undefined>): string[] {
  try {
    parseEnv(env);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return (error as EnvError).problems;
  }
}

describe('parseEnv', () => {
  it('accepts a complete configuration and applies defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(8787);
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:5173', 'https://permitwatch.example.org']);
    expect(env.GEMINI_MOCK).toBe('off');
    expect(env.GEMINI_THINKING_LARGE).toBe('low');
  });

  it('fails fast when required variables are missing', () => {
    const problems = problemsFor({});
    const text = problems.join('\n');
    for (const name of ['ALLOWED_ORIGINS', 'DATABASE_PATH', 'GEMINI_MODEL_ROUTER', 'GEMINI_MODEL_SMALL', 'GEMINI_MODEL_LARGE']) {
      expect(text).toContain(name);
    }
  });

  it('requires GEMINI_API_KEY unless the offline mock is enabled', () => {
    expect(problemsFor({ ...base, GEMINI_API_KEY: '' }).join()).toContain('GEMINI_API_KEY');
    expect(problemsFor({ ...base, GEMINI_API_KEY: '', GEMINI_MOCK: 'ok' })).toEqual([]);
  });

  it('never allows the mock in production', () => {
    expect(problemsFor({ ...base, NODE_ENV: 'production', GEMINI_MOCK: 'ok' }).join()).toContain('GEMINI_MOCK');
  });

  it('rejects origins with paths and malformed model IDs', () => {
    expect(problemsFor({ ...base, ALLOWED_ORIGINS: 'https://example.com/app' }).join()).toContain('ALLOWED_ORIGINS');
    expect(problemsFor({ ...base, GEMINI_MODEL_SMALL: 'Gemini Flash!' }).join()).toContain('GEMINI_MODEL_SMALL');
  });

  it('never echoes secret values in error messages', () => {
    const secret = 'this is not a valid key!!';
    const problems = problemsFor({ ...base, GEMINI_API_KEY: secret });
    expect(problems.join()).toContain('GEMINI_API_KEY');
    expect(problems.join()).not.toContain(secret);
  });
});
