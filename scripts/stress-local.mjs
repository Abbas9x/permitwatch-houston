#!/usr/bin/env node
/** Exercises only an ephemeral loopback server. External lookups are replaced by offline services. */
import { performance } from 'node:perf_hooks';
import { createApp } from '../dist/server/app.js';
import { parseEnv } from '../dist/server/config/env.js';
import { createRoutes } from '../dist/server/container.js';
import { openDatabase } from '../dist/server/db/index.js';
import { importRows, readDatasetFile } from '../dist/server/importer/importer.js';
import { generateSummaries } from '../dist/server/importer/summaries.js';
import { createLogger } from '../dist/server/lib/logger.js';
import { createGeocoder } from '../dist/server/services/geocoder.js';
import { loadZipCentroids } from '../dist/server/services/zipCentroids.js';

const db=openDatabase(':memory:');const logger=createLogger('silent');
const imported=await importRows(readDatasetFile('data/concrete-plants.json'),{db,logger,source:'load test'});
generateSummaries(db);
const geocoder=createGeocoder({db,logger,zipCentroids:loadZipCentroids(),fetchImpl:async()=>{throw new Error('External network is disabled during load tests');},retries:0});
const services={geocoder,addressGeocoder:geocoder,placeSearch:{search:async()=>[]}};
const env=parseEnv({NODE_ENV:'test',ALLOWED_ORIGINS:'http://127.0.0.1',DATABASE_PATH:':memory:'});
const app=createApp({env,db,logger,routes:createRoutes(db,services),clientDir:'none',
  rateLimits:{apiPerMinute:10000,draftsPerMinute:1000,signupsPer10Minutes:5}});
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const id=imported.importedIds[0];
const paths=['/api/health','/api/search?q=77045','/api/search?q=77020',
  '/api/search?q=Houston&lat=29.7&lng=-95.4',`/api/permits/${id}`,'/api/geocode/suggest?q=pa'];
const unhandled=[];const onUnhandled=error=>unhandled.push(String(error));process.on('unhandledRejection',onUnhandled);
const results=[];const before=process.memoryUsage().rss;
try {
  for(const [phase,concurrency,total] of [['low',2,80],['moderate',10,400],['burst',40,800],['repeat',4,200]]) {
    let next=0;const timings=[];let failures=0;const started=performance.now();
    await Promise.all(Array.from({length:concurrency},async()=>{
      while(next<total) {
        const index=next++;const path=paths[index%paths.length];const begin=performance.now();
        try {
          const response=await fetch(base+path,{signal:AbortSignal.timeout(5000)});const body=await response.json();
          if(response.status!==200 || !body || typeof body!=='object')throw new Error('Bad status/JSON');
          if(path.startsWith('/api/search') && (!Array.isArray(body.plants) || !Number.isFinite(body.area.within3)))throw new Error('Malformed search result');
          if(path.startsWith('/api/permits/') && body.permit?.id!==id)throw new Error('Incorrect detail');
        } catch {failures++;}
        timings.push(performance.now()-begin);
      }
    }));
    timings.sort((a,b)=>a-b);
    results.push({phase,concurrency,requests:total,failures,p95Ms:Math.round(timings[Math.floor(timings.length*.95)]),maxMs:Math.round(timings.at(-1)),durationMs:Math.round(performance.now()-started)});
  }
  // Confirm throttling remains effective under the production default limit.
  const guarded=createApp({env,db,logger,routes:createRoutes(db,services),clientDir:'none'});
  const limited=guarded.listen(0,'127.0.0.1');await new Promise(resolve=>limited.once('listening',resolve));
  let accepted=0,throttled=0,bad=0;
  try {
    for(let i=0;i<130;i++) {
      const response=await fetch(`http://127.0.0.1:${limited.address().port}/api/health`);const body=await response.json();
      if(response.status===200 && body.ok)accepted++;
      else if(response.status===429 && body.error?.code==='rate_limited')throttled++;
      else bad++;
    }
  } finally {await new Promise(resolve=>limited.close(resolve));}
  const report={dataset:{imported:imported.imported,rejectedUnlocated:imported.rejected.length},results,
    rateLimit:{accepted,throttled,bad},rssBeforeMB:Math.round(before/1024/1024),rssAfterMB:Math.round(process.memoryUsage().rss/1024/1024),unhandledRejections:unhandled.length};
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(results.some(p=>p.failures) || bad || accepted!==120 || throttled!==10 || unhandled.length)process.exitCode=1;
} finally {await new Promise(resolve=>server.close(resolve));db.close();process.removeListener('unhandledRejection',onUnhandled);}
