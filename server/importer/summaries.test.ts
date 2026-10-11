import { describe, expect, it } from 'vitest';
import { getSummaries } from '../db/summariesRepo.js';
import { getPermitRecord } from '../db/permitsRepo.js';
import { silentLogger, testDb } from '../testUtils.js';
import { importRows, readDatasetFile } from './importer.js';
import { generateSummaries } from './summaries.js';

describe('data-only summaries', () => {
  it('uses the current source fields, keeps missing facts missing, and invalidates edited records',async()=>{
    const db=testDb();
    try {
      const rows=readDatasetFile('data/sample-permits.json');
      await importRows(rows,{db,logger:silentLogger(),source:'sample'});
      expect(generateSummaries(db)).toBe(5);
      const summary=getSummaries(db,['sample-005']).get('sample-005')!;
      expect(summary.generatedBy).toBe('template');
      expect(summary.en.summary).toContain('does not list a maximum production rate');
      expect(summary.es.summary).toContain('no indica una tasa máxima');
      await importRows([{...(rows[4] as Record<string,unknown>),company:'Updated operator'}],{db,logger:silentLogger(),source:'update'});
      expect(getSummaries(db,['sample-005']).size).toBe(0);
      generateSummaries(db);
      expect(getSummaries(db,['sample-005']).get('sample-005')!.en.summary).toContain('Updated operator');
      const record=getPermitRecord(db,'sample-005')!;
      db.prepare(`UPDATE permit_summaries SET summary_json='not json',content_hash=? WHERE permit_id=?`).run(record.content_hash,record.id);
      expect(getSummaries(db,[record.id]).size).toBe(0);
    } finally {db.close();}
  });
});
