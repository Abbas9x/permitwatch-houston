#!/usr/bin/env node
/**
 * Imports every dataset listed in data/datasets.json (in order) into DATABASE_PATH.
 *
 *   node scripts/import-datasets.mjs           # import into the existing database
 *   node scripts/import-datasets.mjs --fresh   # on Render only: start from an empty database
 *
 * Deploys run `npm run render-build`, so changing data/datasets.json (or a listed file) and pushing
 * is all it takes to update the live site. --fresh is ignored outside Render so a local run can
 * never delete a developer's database.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';

const MANIFEST = 'data/datasets.json';
const IMPORTER = 'dist/server/importer/cli.js';

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const files = manifest.datasets;
if (!Array.isArray(files) || files.length === 0 || !files.every((f) => typeof f === 'string' && f.trim())) {
  console.error(`${MANIFEST} must contain a non-empty "datasets" array of file paths.`);
  process.exit(1);
}
const missing = files.filter((f) => !existsSync(f));
if (missing.length > 0) {
  console.error(`Dataset file(s) listed in ${MANIFEST} not found: ${missing.join(', ')}`);
  process.exit(1);
}
if (!existsSync(IMPORTER)) {
  console.error(`${IMPORTER} not found. Run "npm run build" first.`);
  process.exit(1);
}

if (process.argv.includes('--fresh')) {
  const db = process.env.DATABASE_PATH;
  if (process.env.RENDER && db) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${db}${suffix}`, { force: true });
    console.warn(`Fresh build: cleared ${db}.`);
  } else {
    console.warn('--fresh ignored (only applies on Render).');
  }
}

for (const file of files) {
  console.warn(`Importing ${file} ...`);
  execFileSync(process.execPath, [IMPORTER, file], { stdio: 'inherit' });
}
console.warn(`Imported ${files.length} dataset(s) from ${MANIFEST}.`);
