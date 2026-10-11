import {describe,expect,it} from 'vitest';
import {prepareDataset} from './prepareDataset.js';

const permit = {id:'tceq-123',registration_number:'123',company:'Real operator',address:'4014 Market St',city:'Houston',county:'Harris',zip:'77020',lat:29.77,lng:-95.32,permit_type:'renewal',pollutants:[],source_url:'https://www2.tceq.texas.gov/airperm/index.cfm',category:'air_permit'};
describe('publication dataset validation',()=>{
  it('keeps usable permits with absent optional details without inventing values',()=>{
    const result=prepareDataset([permit]);
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.comment_deadline).toBeUndefined();
    expect(result.permits[0]?.max_production_cyd_per_hr).toBeUndefined();
  });
  it('quarantines missing identity, unresolved coordinates, samples and unofficial sources',()=>{
    const result=prepareDataset([
      {...permit,registration_number:''}, {...permit,id:'missing-address',address:null},
      {...permit,id:'missing-location',lat:undefined}, {...permit,id:'outside',lat:0,lng:0},
      {...permit,id:'sample',is_sample:true},
      {...permit,id:'fake-source',source_url:'https://tceq.texas.gov.example.com/notice'},
    ]);
    expect(result.permits).toHaveLength(0);expect(result.rejected).toHaveLength(6);
  });
  it('reports duplicate ids and optional field corrections',()=>{
    const result=prepareDataset([{...permit,max_hours_per_year:-1},permit]);
    expect(result.permits).toHaveLength(1);expect(result.warnings).toHaveLength(1);
    expect(result.rejected[0]?.messages.join(' ')).toMatch(/duplicate/);
  });
});
