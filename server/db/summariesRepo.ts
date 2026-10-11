import { z } from 'zod';
import type { PermitSummary } from '../../shared/api.js';
import { nowIso, type DB } from './index.js';

const SummaryTextSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  whatsChanging: z.string(),
});

export const StoredSummarySchema = z.object({
  en: SummaryTextSchema,
  es: SummaryTextSchema,
  generatedBy: z.enum(['ai', 'template', 'mock']),
});
export type StoredSummary = z.infer<typeof StoredSummarySchema>;

interface SummaryRow {
  permit_id: string;
  summary_json: string;
  generator: string;
  created_at: string;
}

function rowToSummary(row: SummaryRow): PermitSummary | null {
  try {
    const stored = StoredSummarySchema.parse(JSON.parse(row.summary_json));
    return { ...stored, generator: row.generator, createdAt: row.created_at };
  } catch {
    return null;
  }
}

/**
 * Summaries for the given permits. A summary is only returned if it was generated from the
 * permit's current content (same content hash), so an edited permit never shows a stale summary.
 */
export function getSummaries(db: DB, permitIds: string[]): Map<string, PermitSummary> {
  const result = new Map<string, PermitSummary>();
  if (permitIds.length === 0) return result;
  const stmt = db.prepare(
    `SELECT s.permit_id, s.summary_json, s.generator, s.created_at
       FROM permit_summaries s JOIN permits p ON p.id = s.permit_id
      WHERE s.permit_id = ? AND s.content_hash = p.content_hash`,
  );
  for (const id of permitIds) {
    const row = stmt.get(id) as SummaryRow | undefined;
    const summary = row ? rowToSummary(row) : null;
    if (summary) result.set(id, summary);
  }
  return result;
}

export function saveSummary(db: DB, permitId: string, contentHash: string, summary: StoredSummary, generator: string): void {
  db.prepare(
    `INSERT INTO permit_summaries (permit_id, content_hash, summary_json, generator, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (permit_id) DO UPDATE SET content_hash = excluded.content_hash,
       summary_json = excluded.summary_json, generator = excluded.generator, created_at = excluded.created_at`,
  ).run(permitId, contentHash, JSON.stringify(StoredSummarySchema.parse(summary)), generator, nowIso());
}

/** Permits that have no summary, or whose summary was generated from older content (optionally also template-only ones). */
export function listPermitIdsNeedingSummary(db: DB, includeTemplates = false): string[] {
  const rows = db
    .prepare(
      `SELECT p.id FROM permits p LEFT JOIN permit_summaries s ON s.permit_id = p.id
        WHERE s.permit_id IS NULL OR s.content_hash <> p.content_hash OR (? = 1 AND s.generator = 'template') ORDER BY p.id`,
    )
    .all(includeTemplates ? 1 : 0) as { id: string }[];
  return rows.map((r) => r.id);
}
