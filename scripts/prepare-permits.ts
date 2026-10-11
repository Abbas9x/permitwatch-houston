import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {readDatasetFile} from '../server/importer/importer.js';
import {prepareDataset} from '../server/importer/prepareDataset.js';
import {PERMIT_CATEGORIES} from '../shared/permit.js';

const sources=process.argv.slice(2);
const inputs=sources.length ? sources : ['data/permit-sites.json','data/water-permits.json','data/waste-permits.json'];
const snapshots=inputs.map(source=>{
  const body=readFileSync(source,'utf8');
  const original=JSON.parse(body) as {generatedAt?:string;sites?:unknown[];permits?:unknown[];exclusions?:unknown;excluded?:unknown;scope?:unknown};
  return {source,original,rows:readDatasetFile(source),sha256:createHash('sha256').update(body).digest('hex')};
});
const rows=snapshots.flatMap(s=>s.rows);
const {permits,rejected,warnings}=prepareDataset(rows);
if (!permits.length) throw new Error('No usable real permits found; publication files were left unchanged.');
if (!sources.length && PERMIT_CATEGORIES.some(category=>!permits.some(p=>p.category===category))) throw new Error('Four-category data gate failed; publication files were left unchanged.');
const generatedAt=new Date().toISOString();
const categories=Object.fromEntries(PERMIT_CATEGORIES.map(category=>{
  const subset=permits.filter(p=>p.category===category);
  return [category,{count:subset.length,coordinates:subset.length,officialLinks:subset.length,commentDeadlines:subset.filter(p=>p.comment_deadline).length,operators:subset.filter(p=>p.operator_name).length,permittees:subset.filter(p=>p.permittee_name).length,statuses:countBy(subset.map(p=>p.permit_status))}];
}));
function countBy(values:string[]) {return values.reduce<Record<string,number>>((counts,value)=>{counts[value]=(counts[value]??0)+1;return counts;},{});}
const sameLocations=Object.entries(countBy(permits.map(p=>`${p.lat},${p.lng}`))).filter(([,count])=>count>1).map(([coordinates,count])=>({coordinates,count}));
const report={generatedAt,sources:snapshots.map(s=>({source:s.source,sourceGeneratedAt:s.original.generatedAt??null,sourceSha256:s.sha256,eligible:s.rows.length,exclusions:s.original.exclusions??s.original.excluded??null,scope:s.original.scope??null})),eligible:rows.length,accepted:permits.length,categories,rejected,warnings,sameLocations,
  coverage:{commentDeadlines:permits.filter(p=>p.comment_deadline).length,productionRates:permits.filter(p=>p.max_production_cyd_per_hr!==undefined).length,pollutantLists:permits.filter(p=>p.pollutants.length).length},
  limitations:['This is a source-scoped snapshot, not a complete inventory of Houston permits.','Permit status is distinct from facility operation. Older concrete records have unknown legal status.','EPA reported addresses may be mailing addresses; provider coordinate reference and accuracy are preserved in location notes.','Missing deadlines, operators and limits remain absent. Proximity is not a health assessment.','Multiple distinct authorizations may share a facility point; only identical category/permit IDs are deduplicated.']};
writeFileSync('data/validated-permits.json',JSON.stringify({generatedAt,sources:inputs,permits},null,2)+'\n');
writeFileSync('data/permit-validation.json',JSON.stringify(report,null,2)+'\n');
console.warn(JSON.stringify({accepted:report.accepted,categories,rejected:rejected.length,warnings:warnings.length},null,2));
