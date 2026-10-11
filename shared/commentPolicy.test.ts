import {describe,expect,it} from 'vitest';
import {shouldCheckOfficialRecord} from './commentPolicy.js';
const now=new Date('2026-10-11T03:00:00Z'); // October 10 in Houston.
describe('source-based comment opportunities',()=>{
 it('requires official-record confirmation for issued, expired and unknown wastewater/waste authorizations without a deadline',()=>{
  for(const category of ['wastewater_permit','solid_waste_permit'] as const)for(const permitStatus of ['issued','expired','unknown','pending'] as const)expect(shouldCheckOfficialRecord({category,permitStatus,commentDeadline:null},now)).toBe(true);
 });
 it('compares an actual listed deadline in Houston time, independently of source lifecycle',()=>{
  expect(shouldCheckOfficialRecord({category:'wastewater_permit',permitStatus:'expired',commentDeadline:'2026-10-10'},now)).toBe(false);
  expect(shouldCheckOfficialRecord({category:'air_permit',permitStatus:'pending',commentDeadline:'2026-10-09'},now)).toBe(true);
 });
 it('does not invent an application or comment opportunity for older concrete authorizations',()=>{expect(shouldCheckOfficialRecord({category:'concrete_batch_plant',permitStatus:'unknown',commentDeadline:null},now)).toBe(true);});
 it('preserves the existing pending-air drafting workflow with source confirmation',()=>{expect(shouldCheckOfficialRecord({category:'air_permit',permitStatus:'pending',commentDeadline:null},now)).toBe(false);});
});
