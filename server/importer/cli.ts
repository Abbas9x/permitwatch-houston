/**
 * Import a permit dataset into SQLite, then batch-generate AI summaries (English + Spanish).
 *
 *   npm run import                          # loads data/sample-permits.json
 *   npm run import -- path/to/permits.csv   # teammate's real dataset (.json or .csv)
 *   npm run import -- file.json --no-ai     # skip AI summaries (data-only template summaries instead)
 *   npm run import -- file.json --remove-samples   # also deletes SAMPLE rows (destructive)
 */
import { parseArgs } from 'node:util';
import { loadEnvOrExit } from '../config/loadEnv.js';
import { createServices, importerGeocode } from '../container.js';
import { openDatabase } from '../db/index.js';
import { deleteSamplePermits } from '../db/permitsRepo.js';
import { listPermitIdsNeedingSummary } from '../db/summariesRepo.js';
import { generateSummaries } from '../greenroute/batch.js';
import { createLogger } from '../lib/logger.js';
import { importRows, readDatasetFile } from './importer.js';
import { exportSnapshot, restoreSnapshot } from './snapshot.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'remove-samples': { type: 'boolean', default: false },
    'no-ai': { type: 'boolean', default: false },
    // Restore previously generated AI summaries + their call log instead of re-calling Gemini (used by deploys).
    snapshot: { type: 'string' },
    // Write the AI summaries + call log to a snapshot file after this run.
    'export-snapshot': { type: 'string' },
    // Re-try AI for permits that only have a data-only template summary (e.g. after a quota reset).
    'retry-templates': { type: 'boolean', default: false },
  },
});

const env = loadEnvOrExit();
const logger = createLogger(env.LOG_LEVEL);
const db = openDatabase(env.DATABASE_PATH);
const file = positionals[0] ?? 'data/sample-permits.json';

let rows: unknown[];
try {
  rows = readDatasetFile(file);
} catch (error) {
  console.error(`Could not read ${file}: ${(error as Error).message}`);
  process.exit(1);
}

const services = createServices(env, db, logger);

const report = await importRows(rows, { db, logger, source: file, geocode: importerGeocode(services.geocoder) });

if (values['remove-samples']) {
  const removed = deleteSamplePermits(db);
  logger.info({ removed }, 'removed SAMPLE rows');
}

console.warn(
  `\nImported ${report.imported}/${report.total} rows from ${file}` +
    ` (${report.rejected.length} rejected, ${report.warnings.length} with warnings).`,
);
for (const issue of report.rejected) {
  console.warn(`  REJECTED row ${issue.rowNumber}${issue.rowId ? ` (${issue.rowId})` : ''}: ${issue.messages.join('; ')}`);
}
for (const issue of report.warnings) {
  console.warn(`  warning  row ${issue.rowNumber}${issue.rowId ? ` (${issue.rowId})` : ''}: ${issue.messages.join('; ')}`);
}

if (values.snapshot) {
  const restored = restoreSnapshot(db, values.snapshot);
  console.warn(`Restored AI snapshot ${values.snapshot}: ${restored.summaries} summaries, ${restored.calls} logged calls.`);
}

const batch = await generateSummaries(
  { db, logger, engine: values['no-ai'] ? null : services.engine },
  listPermitIdsNeedingSummary(db, values['retry-templates']),
);
console.warn(
  `Summaries: ${batch.total} needed -> ${batch.ai} by ${services.engine.mode === 'mock' ? 'MOCK AI' : 'GreenRoute AI'}` +
    ` (${batch.cacheHits} from cache), ${batch.template} data-only templates.`,
);
if (values['export-snapshot']) {
  const exported = exportSnapshot(db, values['export-snapshot']);
  console.warn(`Exported AI snapshot to ${values['export-snapshot']}: ${exported.summaries} summaries, ${exported.calls} calls.`);
}
db.close();
