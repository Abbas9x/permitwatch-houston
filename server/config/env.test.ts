import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.js';

const base = {
  NODE_ENV: 'development',
  ALLOWED_ORIGINS: 'http://localhost:5173,https://permitwatch.example.org',
  DATABASE_PATH: './data/test.db',
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
  it('accepts a complete non-AI configuration and applies defaults', () => {
    const env = parseEnv({ NODE_ENV:'production', ALLOWED_ORIGINS:'https://permitwatch.example.org', DATABASE_PATH:'./data/test.db' });
    expect(env.PORT).toBe(8787);
    expect(env.ALLOWED_ORIGINS).toEqual(['https://permitwatch.example.org']);
  });
  it('fails fast when required variables are missing', () => {
    const text = problemsFor({}).join('\n');
    for (const name of ['ALLOWED_ORIGINS', 'DATABASE_PATH']) expect(text).toContain(name);
  });
  it('rejects origins with paths and invalid numeric settings', () => {
    expect(problemsFor({ ...base, ALLOWED_ORIGINS:'https://example.com/app' }).join()).toContain('ALLOWED_ORIGINS');
    expect(problemsFor({ ...base, PORT:'0' }).join()).toContain('PORT');
    expect(problemsFor({ ...base, TRUST_PROXY:'99' }).join()).toContain('TRUST_PROXY');
  });
  it('adds the Render public origin automatically', () => {
    expect(parseEnv({ ...base, RENDER_EXTERNAL_URL:'https://demo.onrender.com' }).ALLOWED_ORIGINS).toContain('https://demo.onrender.com');
  });
});
