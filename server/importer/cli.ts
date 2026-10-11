/**
 * Import a permit dataset into SQLite and build deterministic summaries (English + Spanish).
 *
 *   npm run import                          # loads data/sample-permits.json
 *   npm run import -- path/to/permits.csv   # teammate's real dataset (.json or .csv)
 *   npm run import -- file.json --remove-samples   # also deletes SAMPLE rows (destructive)
 */
import { parseArgs } from 'node:util';
import { loadEnvOrExit } from '../config/loadEnv.js';
import { createServices, importerGeocode } from '../container.js';
import { openDatabase } from '../db/index.js';
import { deleteSamplePermits } from '../db/permitsRepo.js';
import { createLogger } from '../lib/logger.js';
import { prepareDataset } from './prepareDataset.js';
import { generateSummaries } from './summaries.js';
import { importRows, readDatasetFile } from './importer.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'remove-samples': { type: 'boolean', default: false },
    'strict-real': { type: 'boolean', default: false },
    'validate-only': { type: 'boolean', default: false },
  },
});

const env = loadEnvOrExit();
const logger = createLogger(env.LOG_LEVEL);

const file = positionals[0] ?? 'data/sample-permits.json';

let rows: unknown[];
try {
  rows = readDatasetFile(file);
} catch (error) {
  console.error(`Could not read ${file}: ${(error as Error).message}`);
  process.exit(1);
}

if (values['strict-real'] || values['validate-only']) {
  const prepared = prepareDataset(rows);
  if (prepared.rejected.length || !prepared.permits.length) {
    console.error('Publication validation failed; database was left unchanged.', prepared.rejected);
    process.exit(1);
  }
  rows = prepared.permits;
}
if (values['validate-only']) {
  console.warn(`Validated ${rows.length} real permits in ${file}; no database opened.`);
  process.exit(0);
}
const db = openDatabase(env.DATABASE_PATH);
const services = createServices(db, logger);

const report = await importRows(rows, { db, logger, source: file, geocode: importerGeocode(services.addressGeocoder) });

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

console.warn(`Built ${generateSummaries(db)} data-only summaries.`);
db.close();
