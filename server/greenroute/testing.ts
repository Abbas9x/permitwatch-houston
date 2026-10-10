import { vi } from 'vitest';
import type { Permit } from '../../shared/permit.js';
import { createGreenRoute } from './engine.js';
import { LlmUnavailableError, type LlmClient, type LlmRequest, type LlmResponse } from './llm.js';
import type { DB } from '../db/index.js';
import { silentLogger } from '../testUtils.js';

/** Test-only helpers for GreenRoute (imported only by *.test.ts files). */

export const MODELS = { router: 'gemini-3.1-flash-lite', small: 'gemini-3.5-flash-lite', large: 'gemini-3.8-flash' };

export type Reply = string | Error | ((req: LlmRequest) => string | Error);

/** An LLM whose replies are decided per model; records every request. */
export function scriptedLlm(byModel: Partial<Record<string, Reply>>, usage = { inputTokens: 1000, outputTokens: 200 }) {
  const calls: LlmRequest[] = [];
  const client: LlmClient = {
    kind: 'gemini',
    generate: vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
      calls.push(req);
      const reply = byModel[req.model];
      const value = typeof reply === 'function' ? reply(req) : reply;
      if (value === undefined) throw new LlmUnavailableError(`no script for ${req.model}`, 503);
      if (value instanceof Error) throw value;
      return { text: value, ...usage, finishReason: 'STOP' };
    }),
  };
  return { client, calls };
}

export function engineWith(db: DB, client: LlmClient) {
  return createGreenRoute({
    db,
    logger: silentLogger(),
    llm: client,
    models: MODELS,
    thinking: { router: 'minimal', small: 'minimal', large: 'low' },
  });
}

export function makePermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: 'p-1',
    registrationNumber: '170001',
    company: 'Example Ready-Mix LLC',
    address: '100 Example St',
    city: 'Houston',
    county: 'Harris',
    zip: '77020',
    lat: 29.77,
    lng: -95.33,
    locationSource: 'dataset',
    permitType: 'renewal',
    maxProductionCydPerHr: 300,
    maxHoursPerYear: 8760,
    pollutants: ['PM10', 'PM2.5'],
    controls: 'Water sprays and a baghouse',
    noticeType: 'NORI',
    noticeIssuanceDate: '2026-09-28',
    commentDeadline: '2026-11-05',
    publicMeetingDate: null,
    sourceUrl: 'https://www.tceq.texas.gov/notice.pdf',
    isSample: false,
    ...overrides,
  };
}

export const NOTICE = 'Example Ready-Mix LLC, Registration No. 170001, may produce up to 300 cubic yards per hour and operate 8,760 hours per year.';

export function goodSummaryJson(): string {
  const text = {
    headline: 'Concrete plant permit renewal on Example St',
    summary: 'Example Ready-Mix LLC wants to renew registration 170001. It is permitted to produce up to 300 cubic yards per hour for up to 8,760 hours per year and to emit PM10 and PM2.5.',
    whatsChanging: 'This is a renewal of an existing permit.',
  };
  const es = {
    headline: 'Renovación de permiso de planta de concreto',
    summary: 'Example Ready-Mix LLC quiere renovar el registro 170001. Puede producir hasta 300 yardas cúbicas por hora durante hasta 8.760 horas al año y emitir PM10 y PM2,5.',
    whatsChanging: 'Es una renovación de un permiso existente.',
  };
  return JSON.stringify({ en: text, es });
}
