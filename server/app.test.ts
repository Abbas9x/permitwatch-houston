import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { HttpError } from './lib/errors.js';
import { silentLogger, testDb, testEnv } from './testUtils.js';

function makeApp(options: Parameters<typeof createApp>[0]['rateLimits'] = undefined) {
  const boom = express.Router();
  boom.get('/boom', () => {
    throw new Error('secret internal detail: GEMINI_API_KEY=abc');
  });
  boom.post('/echo', (req, res) => res.json({ received: req.body as unknown }));
  boom.get('/teapot', () => {
    throw new HttpError(418, 'teapot', 'Friendly message');
  });
  return createApp({
    env: testEnv(),
    db: testDb(),
    logger: silentLogger(),
    rateLimits: options,
    routes: [() => boom],
    clientDir: 'does-not-exist',
  });
}

describe('API security middleware', () => {
  it('serves health with security headers', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, permits: 0 });
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('allows the configured origin and rejects other origins', async () => {
    const app = makeApp();
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const evil = await request(app).post('/api/echo').set('Origin', 'https://evil.example').send({ a: 1 });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('origin_not_allowed');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects oversized bodies, non-JSON bodies, and malformed JSON', async () => {
    const app = makeApp();
    const big = await request(app).post('/api/echo').send({ text: 'x'.repeat(20_000) });
    expect(big.status).toBe(413);

    const form = await request(app).post('/api/echo').type('form').send('a=1');
    expect(form.status).toBe(415);

    const broken = await request(app).post('/api/echo').set('Content-Type', 'application/json').send('{"a":');
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('invalid_json');
  });

  it('never leaks stack traces or internal messages', async () => {
    const res = await request(makeApp()).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret internal detail');
    expect(body).not.toContain('GEMINI_API_KEY');
    expect(body).not.toMatch(/at .*\.ts:\d+/);
  });

  it('passes through friendly HttpError messages and returns JSON 404s', async () => {
    const app = makeApp();
    const teapot = await request(app).get('/api/teapot');
    expect(teapot.status).toBe(418);
    expect(teapot.body.error).toMatchObject({ code: 'teapot', message: 'Friendly message' });

    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('not_found');
  });

  it('rate limits API requests per client', async () => {
    const app = makeApp({ apiPerMinute: 3, aiPerMinute: 1, signupsPer10Minutes: 1 });
    for (let i = 0; i < 3; i++) expect((await request(app).get('/api/health')).status).toBe(200);
    const limited = await request(app).get('/api/health');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
  });
});
