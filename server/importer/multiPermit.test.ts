import Database from 'better-sqlite3';
import {describe,expect,it} from 'vitest';
import {migrate} from '../db/index.js';
import {MIGRATIONS} from '../db/migrations.js';
import {getPermitRecord,toPermit} from '../db/permitsRepo.js';
import {silentLogger,testDb} from '../testUtils.js';
import {importRows} from './importer.js';
import {prepareDataset} from './prepareDataset.js';

const base={id:'water-1',registration_number:'TX0123456',company:'Source facility',facility_name:'Source facility',address:'4014 Market St',city:'Houston',county:'Harris',zip:'77020',lat:29.77,lng:-95.32,permit_type:'unknown',pollutants:[],source_url:'https://echo.epa.gov/detailed-facility-report?fid=110000000001',category:'wastewater_permit',permit_status:'expired',source_status:'Expired',permittee_name:'Actual permit holder',data_source:'EPA ECHO',retrieved_at:'2026-10-11T12:00:00.000Z',location_notes:'Provider reported address; entrance coordinate.'};
describe('multi-category data gate',()=>{
 it('round trips wastewater identity, expired status and provenance without inventing an operator',async()=>{
  const db=testDb();const prepared=prepareDataset([base]);expect(prepared.rejected).toEqual([]);
  const result=await importRows(prepared.permits,{db,logger:silentLogger(),source:'test'});expect(result.imported).toBe(1);
  const permit=toPermit(getPermitRecord(db,'water-1')!);
  expect(permit.permitStatus).toBe('expired');expect(permit.permitteeName).toBe('Actual permit holder');
  expect(permit.operatorName).toBeNull();expect(permit.locationNotes).toContain('Provider');expect(permit.dataSource).toBe('EPA ECHO');expect(permit.commentDeadline).toBeNull();db.close();
 });
 it('restricts EPA provenance to wastewater records and rejects alternate IDs for the same authorization',()=>{
  expect(prepareDataset([{...base,category:'solid_waste_permit'}]).rejected).toHaveLength(1);
  expect(prepareDataset([base,{...base,id:'other-id'}]).permits).toHaveLength(1);
  expect(prepareDataset([{...base,permit_status:'active'}]).rejected).toHaveLength(1);
 });
 it('upgrades populated version 3 without losing permits or their summaries',()=>{
  const db=new Database(':memory:');db.pragma('foreign_keys=ON');
  for(const migration of MIGRATIONS.slice(0,3))db.exec(migration);db.pragma('user_version=3');
  db.prepare(`INSERT INTO permits (id,registration_number,company,address,city,county,zip,lat,lng,location_source,permit_type,source_url,content_hash,imported_at) VALUES ('legacy','123','Legacy company','Street','Houston','Harris','',29.7,-95.3,'dataset','new','https://www.tceq.texas.gov/','hash','2026-10-10')`).run();
  db.prepare(`INSERT INTO permit_summaries VALUES ('legacy','hash','{}','template','2026-10-10')`).run();
  migrate(db);expect(getPermitRecord(db,'legacy')?.company).toBe('Legacy company');
  expect(db.prepare('SELECT COUNT(*) AS n FROM permit_summaries').get()).toEqual({n:1});expect(db.pragma('foreign_key_check')).toEqual([]);expect(db.pragma('user_version',{simple:true})).toBe(4);db.close();
 });
});
