import type { DB } from '../db/index.js';
import { getPermitRecord, toPermit } from '../db/permitsRepo.js';
import { listPermitIdsNeedingSummary, saveSummary } from '../db/summariesRepo.js';
import type { Logger } from '../lib/logger.js';
import { GreenRouteError, type GreenRoute } from './engine.js';
import { permitSummaryTask } from './tasks.js';
import { templateSummaryText } from './templates.js';

export interface BatchReport {
  total: number;
  ai: number;
  template: number;
  cacheHits: number;
}

/**
 * Generates plain-English + Spanish summaries at import time and stores them, so the live demo
 * never depends on an AI call. Sequential on purpose (gentle on API rate limits).
 * If AI fails for a permit (or `engine` is null, i.e. --no-ai), a data-only template summary is stored instead.
 */
export async function generateSummaries(
  deps: { db: DB; logger: Logger; engine: GreenRoute | null },
  ids: string[] = listPermitIdsNeedingSummary(deps.db),
): Promise<BatchReport> {
  const { db, logger, engine } = deps;
  const report: BatchReport = { total: ids.length, ai: 0, template: 0, cacheHits: 0 };

  for (const id of ids) {
    const record = getPermitRecord(db, id);
    if (!record) continue;
    const permit = toPermit(record);
    try {
      if (!engine) throw new GreenRouteError('ai_unavailable', 'AI disabled for this run');
      const result = await engine.run(permitSummaryTask, { permit, noticeText: record.raw_text });
      saveSummary(db, id, record.content_hash, { ...result.output, generatedBy: result.meta.generatedBy }, result.meta.model);
      report.ai += 1;
      if (result.meta.cacheHit) report.cacheHits += 1;
    } catch (error) {
      if (!(error instanceof GreenRouteError)) throw error;
      if (engine) logger.warn({ permitId: id, code: error.code }, 'AI summary failed; storing data-only template summary');
      saveSummary(
        db,
        id,
        record.content_hash,
        { en: templateSummaryText(permit, 'en'), es: templateSummaryText(permit, 'es'), generatedBy: 'template' },
        'template',
      );
      report.template += 1;
    }
  }
  logger.info(report, 'batch summaries finished');
  return report;
}
