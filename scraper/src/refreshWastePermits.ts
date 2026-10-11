// Run: npx tsx scraper/src/refreshWastePermits.ts [--refresh]
// Reuses official downloads under ignored data/raw; --refresh refetches them.
// XLS parsing needs Python 3 and xlrd (available in the workspace runtime).
import { execFile } from 'node:child_process';
import { rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { RAW_DIR, cachedGet } from './http.js';
import { COUNTY_SQL_UPPER } from './layers/common.js';
import { MSW_GIS_URL, MSW_XLS_URL, WASTE_DATA_SOURCE, normalizeWastePermits } from './normalizeWastePermits.js';
import type { WasteAuthorization, WasteGisFeature } from './normalizeWastePermits.js';

const xlsPath = join(RAW_DIR, 'waste-permits', 'msw-facilities-texas.xls');
const xls = await cachedGet(MSW_XLS_URL, xlsPath);
if (!xls) throw new Error('TCEQ MSW authorization spreadsheet is unavailable; previous dataset was left unchanged.');

// Keep the raw Excel download, including its actual date-cell types, as evidence.
const parser = `
import json, sys
try:
    import xlrd
except ImportError:
    raise SystemExit('Waste refresh requires Python 3 with xlrd to read the official XLS source.')
book = xlrd.open_workbook(sys.argv[1])
sheet = book.sheet_by_index(0)
headers = [str(v).strip() for v in sheet.row_values(0)]
required = ['Additional ID', 'RN', 'Legal Status', 'Physical Site Status', 'Phys Addr Line 1', 'Phys Addr City']
if any(h not in headers for h in required):
    raise SystemExit('TCEQ MSW spreadsheet schema changed; previous dataset was left unchanged.')
rows = []
for i in range(1, sheet.nrows):
    row = {}
    for j, header in enumerate(headers):
        cell = sheet.cell(i, j)
        value = cell.value
        if cell.ctype == xlrd.XL_CELL_DATE:
            value = xlrd.xldate_as_datetime(value, book.datemode).date().isoformat()
        row[header] = value
    rows.append(row)
print(json.dumps(rows))
`;
const { stdout } = await promisify(execFile)(process.env.PERMITWATCH_PYTHON ?? 'python3', ['-c', parser, xlsPath], { maxBuffer: 10_000_000 });
const authorizations = JSON.parse(stdout) as WasteAuthorization[];
const features: WasteGisFeature[] = [];
const xlsRetrievedAt = (await stat(xlsPath)).mtime.toISOString();
const sourceSnapshots: Record<string, string> = {[MSW_XLS_URL]: xlsRetrievedAt};
for (const layerId of [7, 8]) {
  const records: Omit<WasteGisFeature, 'layerId'>[] = [];
  const snapshotDates: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const url = `${MSW_GIS_URL}/${layerId}/query?${new URLSearchParams({where: `COUNTY IN (${COUNTY_SQL_UPPER})`, outFields: '*', returnGeometry: 'true', outSR: '4326', resultOffset: String(offset), resultRecordCount: '1000', orderByFields: 'OBJECTID', f: 'json'})}`;
    const cachePath = join(RAW_DIR, 'layers', 'arcgis', `${createHash('sha1').update(url).digest('hex').slice(0,12)}.json`);
    const body = await cachedGet(url, cachePath);
    if (!body) throw new Error(`TCEQ MSW layer ${layerId} unavailable`);
    const page = JSON.parse(body.toString('utf8')) as {features?: Omit<WasteGisFeature, 'layerId'>[]; exceededTransferLimit?: boolean; error?: {message: string}};
    if (page.error || !Array.isArray(page.features)) throw new Error(`Invalid TCEQ MSW layer ${layerId} response`);
    snapshotDates.push((await stat(cachePath)).mtime.toISOString());
    records.push(...page.features);
    if (page.features.length < 1000 && !page.exceededTransferLimit) break;
    if (!page.features.length) throw new Error(`Empty TCEQ MSW page before completion`);
  }
  const gisRetrievedAt = snapshotDates.sort()[0]!;
  sourceSnapshots[`${MSW_GIS_URL}/${layerId}`] = gisRetrievedAt;
  const retrievedAt = [xlsRetrievedAt, gisRetrievedAt].sort()[0]!;
  if (!records.length) throw new Error(`TCEQ MSW layer ${layerId} returned no records; previous dataset was left unchanged.`);
  features.push(...records.map((record) => ({ ...record, layerId, retrievedAt })));
}
const generatedAt = new Date().toISOString();
const result = normalizeWastePermits(features, authorizations, generatedAt);
if (!result.permits.length) throw new Error('No usable solid waste permits; previous dataset was left unchanged.');
const output = fileURLToPath(new URL('../../data/waste-permits.json', import.meta.url));
await writeFile(`${output}.tmp`, JSON.stringify({ generatedAt, source: WASTE_DATA_SOURCE, sourceRecords: features.length, exclusions: result.exclusions, sourceSnapshots, scope: 'Active landfill and transfer-station GIS layers joined by authorization number and RN to TCEQ MSW spreadsheet; registrations excluded.', permits: result.permits }, null, 2) + '\n');
await rename(`${output}.tmp`, output);
console.log(JSON.stringify({ output, sourceRecords: features.length, usablePermits: result.permits.length, exclusions: result.exclusions }));
