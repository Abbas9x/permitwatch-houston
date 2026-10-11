import type { DB } from '../db/index.js';
import { listPermitRecords, toPermit } from '../db/permitsRepo.js';
import { saveSummary } from '../db/summariesRepo.js';
import { templateSummaryText } from '../services/templates.js';

export function generateSummaries(db: DB): number {
  const records = listPermitRecords(db);
  db.transaction(() => {
    for (const record of records) {
      const permit = toPermit(record);
      saveSummary(db,record.id,record.content_hash,{
        en:templateSummaryText(permit,'en'),es:templateSummaryText(permit,'es'),generatedBy:'template',
      },'template');
    }
  })();
  return records.length;
}
