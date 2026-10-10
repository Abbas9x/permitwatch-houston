import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { CommentDraftResponse, GreenRouteStatsResponse } from '../../shared/api.js';
import { createApp } from '../app.js';
import { createGreenRoute } from '../greenroute/engine.js';
import { createMockClient } from '../greenroute/mockClient.js';
import { MODELS } from '../greenroute/testing.js';
import { importRows, readDatasetFile } from '../importer/importer.js';
import type { RateLimits } from '../middleware/security.js';
import { silentLogger, testDb, testEnv } from '../testUtils.js';
import { aiRouter } from './ai.js';

async function makeApp(mode: 'ok' | 'down', rateLimits?: RateLimits) {
  const db = testDb();
  await importRows(readDatasetFile('data/sample-permits.json'), { db, logger: silentLogger(), source: 'sample' });
  const engine = createGreenRoute({
    db,
    logger: silentLogger(),
    llm: createMockClient(mode),
    models: MODELS,
    thinking: { router: 'minimal', small: 'minimal', large: 'low' },
  });
  return createApp({ env: testEnv(), db, logger: silentLogger(), rateLimits, routes: [aiRouter({ db, engine })], clientDir: 'none' });
}

const validDraft = { concerns: ['dust', 'truck_traffic'], personalNote: 'My kids walk past the site every day.', language: 'en' };

describe('POST /api/permits/:id/comment-draft', () => {
  it('drafts a comment that cites the registration number', async () => {
    const res = await request(await makeApp('ok')).post('/api/permits/sample-001/comment-draft').send(validDraft);
    expect(res.status).toBe(200);
    const body = res.body as CommentDraftResponse;
    expect(body.generatedBy).toBe('mock');
    expect(body.draft.body).toContain('SAMPLE-100001');
    expect(body.draft.body).toContain('My kids walk past the site every day.');
    expect(body.meta).toMatchObject({ routedBy: 'rules', model: MODELS.large });
  });

  it('drafts in Spanish', async () => {
    const res = await request(await makeApp('ok'))
      .post('/api/permits/sample-002/comment-draft')
      .send({ ...validDraft, language: 'es' });
    expect(res.body.draft.body).toContain('Escribo como residente');
  });

  it('falls back to an editable data-only template when Gemini is unavailable', async () => {
    const res = await request(await makeApp('down')).post('/api/permits/sample-001/comment-draft').send(validDraft);
    expect(res.status).toBe(200);
    expect(res.body.generatedBy).toBe('template');
    expect(res.body.meta).toBeNull();
    expect(res.body.draft.body).toContain('SAMPLE-100001');
  });

  it.each([
    [{ ...validDraft, concerns: ['not-a-concern'] }],
    [{ ...validDraft, concerns: ['dust', 'dust'] }],
    [{ ...validDraft, personalNote: 'x'.repeat(601) }],
    [{ ...validDraft, language: 'fr' }],
    [{ ...validDraft, extra: 'field' }],
    [{ concerns: [], personalNote: '', language: 'en' }],
  ])('rejects invalid input %#', async (body) => {
    const res = await request(await makeApp('ok')).post('/api/permits/sample-001/comment-draft').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });

  it('404s an unknown permit', async () => {
    const res = await request(await makeApp('ok')).post('/api/permits/nope/comment-draft').send(validDraft);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/permits/:id/ask', () => {
  it('answers in mock mode and returns 503 with a friendly message when Gemini is down', async () => {
    const ok = await request(await makeApp('ok')).post('/api/permits/sample-001/ask').send({ question: 'How many hours?', language: 'en' });
    expect(ok.status).toBe(200);
    expect(ok.body.answerable).toBe(false);

    const down = await request(await makeApp('down')).post('/api/permits/sample-001/ask').send({ question: 'How many hours?', language: 'en' });
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('ai_unavailable');
    expect(down.body.error.message).not.toMatch(/stack|Error:/);
  });

  it('caps question length', async () => {
    const res = await request(await makeApp('ok')).post('/api/permits/sample-001/ask').send({ question: 'q'.repeat(301), language: 'en' });
    expect(res.status).toBe(400);
  });
});

describe('AI rate limiting', () => {
  it('allows 10 AI requests per minute per client, then 429s', async () => {
    const app = await makeApp('ok', { apiPerMinute: 1000, aiPerMinute: 10, signupsPer10Minutes: 5 });
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/permits/sample-001/ask').send({ question: `Question ${i}?`, language: 'en' });
      expect(res.status).toBe(200);
    }
    const limited = await request(app).post('/api/permits/sample-001/ask').send({ question: 'One more?', language: 'en' });
    expect(limited.status).toBe(429);
    // Non-AI routes are unaffected.
    expect((await request(app).get('/api/greenroute/stats')).status).toBe(200);
  });
});

describe('GET /api/greenroute/stats', () => {
  it('reports real numbers from the call log', async () => {
    const app = await makeApp('ok');
    await request(app).post('/api/permits/sample-002/comment-draft').send(validDraft); // renewal -> small
    await request(app).post('/api/permits/sample-002/comment-draft').send(validDraft); // cache hit
    const stats = (await request(app).get('/api/greenroute/stats')).body as GreenRouteStatsResponse;
    expect(stats.mode).toBe('mock');
    expect(stats.models).toEqual(MODELS);
    expect(stats.tasks).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.modelMix).toEqual([expect.objectContaining({ model: MODELS.small, calls: 1 })]);
    expect(stats.cost.baselineUsd).toBeGreaterThan(stats.cost.actualUsd);
    expect(stats.energy.estimated).toBe(true);
    expect(stats.pricingSource.url).toContain('ai.google.dev');
  });
});
