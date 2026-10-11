import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {readDatasetFile} from '../server/importer/importer.js';
import {prepareDataset} from '../server/importer/prepareDataset.js';

const source=process.argv[2] ?? 'data/permit-sites.json';
const original=JSON.parse(readFileSync(source,'utf8')) as {generatedAt?:string;sites?:unknown[];count?:number;refreshMode?:string};
const rows=readDatasetFile(source);
const {permits,rejected,warnings}=prepareDataset(rows);
if (!permits.length) throw new Error('No usable real permits found; publication files were left unchanged.');
const generatedAt=new Date().toISOString();
const report={generatedAt,source,sourceGeneratedAt:original.generatedAt ?? null,sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),refreshMode:original.refreshMode ?? 'Existing source snapshot',sourceRecords:original.sites?.length ?? rows.length,eligible:rows.length,accepted:permits.length,rejected,warnings,
  coverage:{commentDeadlines:permits.filter(p=>p.comment_deadline).length,productionRates:permits.filter(p=>p.max_production_cyd_per_hr!==undefined).length,pollutantLists:permits.filter(p=>p.pollutants.length).length},
  limitations:['Validation confirms required fields and usable coordinates, not the current legal status of each permit.','Missing deadlines and production limits are left absent, never calculated or invented.']};
writeFileSync('data/validated-permits.json',JSON.stringify({generatedAt,source,permits},null,2)+'\n');
writeFileSync('data/permit-validation.json',JSON.stringify(report,null,2)+'\n');
console.warn(JSON.stringify(report,null,2));
