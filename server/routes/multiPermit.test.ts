import request from 'supertest';
import {beforeAll,describe,expect,it} from 'vitest';
import {createApp} from '../app.js';
import {importRows,readDatasetFile} from '../importer/importer.js';
import {silentLogger,testDb,testEnv} from '../testUtils.js';
import {searchRouter} from './search.js';
import type {SearchResponse} from '../../shared/api.js';
import {PERMIT_CATEGORIES} from '../../shared/permit.js';
const db=testDb();
const app=createApp({env:testEnv(),db,logger:silentLogger(),routes:[searchRouter({db,geocoder:{geocode:async()=>({status:'not_found',geocoderAvailable:true})}})],clientDir:'none',rateLimits:{apiPerMinute:2000,draftsPerMinute:100,signupsPer10Minutes:100}});
const query={q:'Houston demo area',lat:29.77,lng:-95.32,radius:10};
beforeAll(async()=>{await importRows(readDatasetFile('data/validated-permits.json'),{db,logger:silentLogger(),source:'verified snapshot'});});
describe('real multi-category API',()=>{
 it('returns verified permits with deterministic distances and category counts',async()=>{
  const a=await request(app).get('/api/search').query(query);const b=await request(app).get('/api/search').query(query);
  expect(a.status).toBe(200);expect(a.body).toEqual(b.body);const body=a.body as SearchResponse;
  expect(new Set(body.plants.map(p=>p.permit.category)).size).toBe(4);
  expect(Object.values(body.area.categoryCounts??{}).reduce((a,b)=>a+b,0)).toBe(body.plants.length);
  expect(body.plants.every(p=>p.distanceMiles<=10&&!p.permit.isSample&&p.permit.sourceUrl.startsWith('https://'))).toBe(true);
 });
 it.each(PERMIT_CATEGORIES)('filters %s and retrieves real details',async category=>{
  const res=await request(app).get('/api/search').query({...query,category});expect(res.status).toBe(200);
  expect(res.body.plants.length).toBeGreaterThan(0);expect(res.body.plants.every((p:SearchResponse['plants'][number])=>p.permit.category===category)).toBe(true);
  const id=res.body.plants[0].permit.id;const detail=await request(app).get(`/api/permits/${id}`);expect(detail.status).toBe(200);expect(detail.body.permit.category).toBe(category);expect(detail.body.permit.commentDeadline).toBeNull();
 });
 it('filters status independently and jointly without treating expired permits as effective',async()=>{
  const res=await request(app).get('/api/search').query({...query,status:'effective'});expect(res.status).toBe(200);expect(res.body.plants.length).toBeGreaterThan(0);expect(res.body.plants.every((p:SearchResponse['plants'][number])=>p.permit.permitStatus==='effective')).toBe(true);
  const empty=await request(app).get('/api/search').query({...query,category:'solid_waste_permit',status:'expired'});expect(empty.status).toBe(200);expect(empty.body.plants).toEqual([]);expect(empty.body.nearestOutside).toBeNull();
 });
 it.each([{category:'landfill'},{status:'active'},{category:['air_permit','wastewater_permit']},{radius:-1},{radius:1000},{lat:NaN},{lng:200}])('rejects malformed filters or locations %#',async bad=>{expect((await request(app).get('/api/search').query({...query,...bad})).status).toBe(400);});
 it('radius narrows counts deterministically and unknown ID fails cleanly',async()=>{
  const a=await request(app).get('/api/search').query({...query,radius:1});const b=await request(app).get('/api/search').query(query);expect(a.body.plants.length).toBeLessThan(b.body.plants.length);expect(a.body.plants.every((p:SearchResponse['plants'][number])=>p.distanceMiles<=1)).toBe(true);expect((await request(app).get('/api/permits/no-such-permit')).status).toBe(404);
 });
});
