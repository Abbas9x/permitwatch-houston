import {validateRow,type RowIssue} from './importer.js';
import type {PermitRow} from './rowSchema.js';

/** Publication gate: required fields and usable coordinates, with no external guesses. */
export function prepareDataset(rows: unknown[]) {
  const permits: PermitRow[]=[];
  const rejected: RowIssue[]=[];
  const warnings: RowIssue[]=[];
  const seen=new Set<string>();
  for (const [index,raw] of rows.entries()) {
    const validation=validateRow(raw);
    const rowNumber=index+1;
    if (!validation.ok) { rejected.push({rowNumber,messages:validation.errors});continue; }
    const {row}=validation;
    const messages:string[]=[];
    const source=new URL(row.source_url);
    if (source.protocol!=='https:' || !(source.hostname==='tceq.texas.gov' || source.hostname.endsWith('.tceq.texas.gov')) || source.username || source.password) messages.push('source_url: must be an official HTTPS TCEQ link');
    if (row.is_sample) messages.push('is_sample: fictional records cannot be published');
    if (row.lat===undefined || row.lng===undefined) messages.push('lat/lng: usable Texas coordinates are required');
    if (seen.has(row.id)) messages.push(`id: duplicate "${row.id}"`);
    if (messages.length) {rejected.push({rowNumber,rowId:row.id,messages});continue;}
    seen.add(row.id);permits.push(row);
    if (validation.warnings.length) warnings.push({rowNumber,rowId:row.id,messages:validation.warnings});
  }
  return {permits,rejected,warnings};
}
