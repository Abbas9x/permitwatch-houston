// Refresh only permit layers; never overwrite the broader raw sites archive.
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {concreteSites,compareSites} from './scrape.js';
import {pendingAirPermits} from './layers/pendingAir.js';
import {nowIso} from './extract.js';

const generatedAt=nowIso();
const concrete=await concreteSites(generatedAt);
const air=await pendingAirPermits(generatedAt);
if (!concrete.length || !air.length) throw new Error('A permit source returned no records; the previous snapshot was left unchanged.');
const sites=[...concrete,...air].sort(compareSites);
const output=fileURLToPath(new URL('../../data/permit-sites.json',import.meta.url));
await writeFile(output,JSON.stringify({generatedAt,count:sites.length,refreshMode:process.argv.includes('--refresh') ? 'Official source indexes and notice documents refetched.' : process.argv.includes('--refresh-lists') ? 'Official source indexes refreshed; previously downloaded notice PDFs and geocoding responses reused when available.' : 'Reprocessed cached official indexes and downloaded notice documents from the preceding refresh.',sites},null,2)+'\n');
console.log(`Wrote ${sites.length} source permits to ${output}`);
