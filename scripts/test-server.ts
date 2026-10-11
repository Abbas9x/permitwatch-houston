/** Offline verification server: real routes and database, injected geocoding results. */
import { createApp } from '../server/app.js';
import { createRoutes, type Services } from '../server/container.js';
import { parseEnv } from '../server/config/env.js';
import { openDatabase } from '../server/db/index.js';
import { importRows, readDatasetFile } from '../server/importer/importer.js';
import { generateSummaries } from '../server/importer/summaries.js';
import { createLogger } from '../server/lib/logger.js';
import { createGeocoder } from '../server/services/geocoder.js';
import { loadZipCentroids } from '../server/services/zipCentroids.js';
import type { PlaceSearch } from '../server/services/placeSearch.js';

const port=Number(process.env.TEST_PORT || 8790);
const env=parseEnv({NODE_ENV:'production',PORT:String(port),DATABASE_PATH:':memory:',ALLOWED_ORIGINS:`http://127.0.0.1:${port}`,LOG_LEVEL:'error'});
const logger=createLogger('error');const db=openDatabase(':memory:');
const realData=process.env.TEST_REAL_DATA==='1';
await importRows(readDatasetFile(realData?'data/validated-permits.json':'data/sample-permits.json'),{db,logger,source:realData?'e2e verified permits':'e2e sample'});
generateSummaries(db);
const placeSearch:PlaceSearch={search:async query=> query.toLowerCase().includes('calhoun') ? [{label:'4800 Calhoun Rd, Houston, TX',lat:29.7683,lng:-95.30897,state:'Texas',countryCode:'US',postcode:'77020',precise:true}] : []};
const addressGeocoder=createGeocoder({db,logger,zipCentroids:loadZipCentroids(),fetchImpl:async()=>{throw new Error('External geocoding disabled during tests');},retries:0,timeoutMs:100});
const services:Services={addressGeocoder,placeSearch,geocoder:{geocode:async query=>{
  if(realData && query==='5303 S Lake Houston Pkwy, Houston, TX') return {status:'found',geocoderAvailable:true,result:{lat:29.810683571296,lng:-95.213255154669,label:query,source:'place_search',approximate:true,zip:null}};
  if(realData && query==='7015 Fairbanks N Houston Rd, Houston, TX') return {status:'found',geocoderAvailable:true,result:{lat:29.870881922702,lng:-95.524674282027,label:query,source:'place_search',approximate:true,zip:null}};
  if(query==='4800 Calhoun Rd, Houston, TX')return {status:'found',geocoderAvailable:true,result:{lat:29.7683,lng:-95.30897,label:query,source:'census_geocoder',approximate:false,zip:'77020'}};
  if(/^\d{5}$/.test(query))return addressGeocoder.geocode(query);
  return {status:'not_found',geocoderAvailable:false};
}}};
const app=createApp({env,db,logger,routes:createRoutes(db,services),
  rateLimits:{apiPerMinute:10000,draftsPerMinute:1000,signupsPer10Minutes:5}});
const server=app.listen(port,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
