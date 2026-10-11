// Refresh: npx tsx scraper/src/refreshWaterPermits.ts --refresh
// Rerun without --refresh to reproduce the completed county snapshots in data/raw.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW_DIR, REFRESH, cachedGet } from './http.js';
import { REGION_COUNTIES } from './region.js';
import { normalizeWaterPermits } from './normalizeWaterPermits.js';

const BASE = 'https://echodata.epa.gov/echo/cwa_rest_services';
const CACHE = join(RAW_DIR, 'water-permits');
const OUTPUT = fileURLToPath(new URL('../../data/water-permits.json', import.meta.url));
const COLUMN_NAMES = [
  'CWPName', 'SourceID', 'CWPStreet', 'CWPCity', 'CWPCounty', 'CWPZip', 'FacLat', 'FacLong', 'RegistryID',
  'PermitName', 'CWPPermitStatusDesc', 'CWPPermitStatusCode', 'CWPPermitTypeDesc', 'OtherPermitIDs',
  'CWPIssueDate', 'CWPEffectiveDate', 'CWPExpirationDate', 'CWPTerminationDate',
  'CollectionMethod', 'ReferencePoint', 'CalculatedAccuracyMeters', 'PermitComponents', 'PermittingAgency',
];
interface EchoResponse {
  Results: {
    QueryID?: string;
    QueryRows?: string;
    Facilities?: Record<string, unknown>[];
    ResultColumns?: { ObjectName: string; ColumnID: string }[];
    Error?: { ErrorMessage?: string };
  };
}
type GetJson = (url: string) => Promise<EchoResponse>;

/** A QueryID is short lived: finish paging immediately, then cache a completed county snapshot. */
export async function fetchWaterCounty(fips: string, columns: string, getJson: GetJson): Promise<Record<string, unknown>[]> {
  const searchUrl = `${BASE}.get_facilities?${new URLSearchParams({ output: 'JSON', p_fips: fips, p_sic: '4952', p_act: 'Y', responseset: '500' })}`;
  const search = (await getJson(searchUrl)).Results;
  if (search.Error) throw new Error(`EPA ${fips}: ${search.Error.ErrorMessage ?? 'search failed'}`);
  const total = Number(search.QueryRows);
  if (!Number.isInteger(total) || total < 0) throw new Error(`EPA ${fips}: invalid source row count`);
  if (total === 0) return [];
  if (!search.QueryID) throw new Error(`EPA ${fips}: missing query ID`);
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; rows.length < total; page++) {
    const url = `${BASE}.get_qid?${new URLSearchParams({ output: 'JSON', qid: search.QueryID, pageno: String(page), qcolumns: columns })}`;
    const result = (await getJson(url)).Results;
    if (result.Error) throw new Error(`EPA ${fips}: ${result.Error.ErrorMessage ?? 'page failed'}`);
    if (!Array.isArray(result.Facilities) || result.Facilities.length === 0) throw new Error(`EPA ${fips}: empty page ${page} before ${total} records`);
    rows.push(...result.Facilities);
  }
  if (rows.length !== total) throw new Error(`EPA ${fips}: row count changed during paging (${rows.length}/${total})`);
  return rows;
}

async function run(): Promise<void> {
  const generatedAt = new Date().toISOString();
  // Run-specific request caches prevent accidentally reusing an expired QueryID.
  const requestDirectory = join(CACHE, 'requests', generatedAt.replace(/[:.]/g, '-'));
  const getJson: GetJson = async (url) => {
    const digest = createHash('sha256').update(url).digest('hex').slice(0, 24);
    const buffer = await cachedGet(url, join(requestDirectory, `${digest}.json`));
    if (!buffer) throw new Error(`EPA endpoint unavailable: ${url}`);
    const result = JSON.parse(buffer.toString('utf8')) as EchoResponse;
    if (!result.Results || typeof result.Results !== 'object') throw new Error(`EPA malformed response: ${url}`);
    return result;
  };
  const metadataBuffer = await cachedGet(`${BASE}.metadata?output=JSON`, join(CACHE, 'metadata.json'));
  if (!metadataBuffer) throw new Error('EPA water metadata unavailable');
  const metadata = (JSON.parse(metadataBuffer.toString('utf8')) as EchoResponse).Results.ResultColumns;
  const columns = COLUMN_NAMES.map((name) => {
    const column = metadata?.find((item) => item.ObjectName === name);
    if (!column) throw new Error(`EPA water metadata missing ${name}`);
    return column.ColumnID;
  }).join(',');
  const rows: Record<string, unknown>[] = [];
  const countyRows: Record<string, number> = {};
  const snapshotDates: Record<string, string> = {};
  await mkdir(join(CACHE, 'snapshots'), { recursive: true });
  for (const [county, code] of Object.entries(REGION_COUNTIES)) {
    const fips = `48${code}`;
    const snapshotPath = join(CACHE, 'snapshots', `${fips}-sic4952-active-v1.json`);
    let snapshot: { fetchedAt: string; rows: Record<string, unknown>[] };
    if (!REFRESH && existsSync(snapshotPath)) {
      snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as typeof snapshot;
      if (!snapshot.fetchedAt || !Array.isArray(snapshot.rows)) throw new Error(`Invalid cached EPA snapshot: ${snapshotPath}`);
    } else {
      const countyRecords = await fetchWaterCounty(fips, columns, getJson);
      snapshot = { fetchedAt: new Date().toISOString(), rows: countyRecords };
      await writeFile(`${snapshotPath}.tmp`, JSON.stringify(snapshot));
      await rename(`${snapshotPath}.tmp`, snapshotPath);
    }
    countyRows[county] = snapshot.rows.length;
    snapshotDates[county] = snapshot.fetchedAt;
    rows.push(...snapshot.rows.map((row) => ({ ...row, __retrievedAt: snapshot.fetchedAt })));
    console.log(`${county}: ${snapshot.rows.length} source records (${snapshot.fetchedAt})`);
  }
  const normalized = normalizeWaterPermits(rows, generatedAt);
  const statuses: Record<string, number> = {};
  for (const permit of normalized.permits) statuses[permit.permit_status] = (statuses[permit.permit_status] ?? 0) + 1;
  const output = {
    generatedAt,
    source: 'EPA ECHO / ICIS-NPDES, SIC 4952 individual TX0 wastewater discharge permits; 13 Houston-region counties. EPA p_act=Y includes effective, administratively continued and expired permits. This is a verified subset, not all wastewater permits.',
    source_url: 'https://echo.epa.gov/tools/web-services/facility-search-water',
    scope: { counties: Object.keys(REGION_COUNTIES), sic: '4952', activity_filter: 'Y', permit_id_pattern: '^TX0[0-9]{6}$', maximum_known_coordinate_accuracy_meters: 1000 },
    source_count: rows.length,
    county_source_counts: countyRows,
    source_snapshot_dates: snapshotDates,
    count: normalized.permits.length,
    excluded: normalized.excluded,
    status_counts: statuses,
    permits: normalized.permits,
  };
  await writeFile(`${OUTPUT}.tmp`, `${JSON.stringify(output, null, 2)}\n`);
  await rename(`${OUTPUT}.tmp`, OUTPUT);
  console.log(JSON.stringify({ count: output.count, source_count: output.source_count, excluded: output.excluded, status_counts: statuses }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
