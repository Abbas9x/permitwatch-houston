import { describe, expect, it } from 'vitest';
import { importRows, readDatasetFile } from '../importer/importer.js';
import { silentLogger, testDb } from '../testUtils.js';
import { findNearby, summarizeArea } from './search.js';
import { haversineMiles } from '../../shared/geo.js';

describe('exact area counts', () => {
  it('does not include just-outside records after rounding for display', async () => {
    const db=testDb();
    try {
      const base=readDatasetFile('data/sample-permits.json')[0] as Record<string,unknown>;
      const center={lat:29.7,lng:-95.4};
      const lat=center.lat + 1.004 / haversineMiles(center,{lat:center.lat+1,lng:center.lng});
      await importRows([{...base,id:'edge',lat,lng:center.lng}],{db,logger:silentLogger(),source:'boundary'});
      const plants=findNearby(db,center);
      expect(plants).toHaveLength(1);
      expect(summarizeArea(plants)).toMatchObject({within1:0,within2:1,within3:1});
    } finally {db.close();}
  });
  it('handles an empty dataset with no invented capacity', () => {
    expect(summarizeArea([])).toEqual({withinRadius:0,categoryCounts:{concrete_batch_plant:0,air_permit:0,wastewater_permit:0,solid_waste_permit:0},within1:0,within2:0,within3:0,combinedCapacityCydPerHr:null,capacityListedCount:0});
  });
});
