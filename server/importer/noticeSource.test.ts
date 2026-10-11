import {expect,it} from 'vitest';
import {pickOfficialSource} from '../../scraper/src/sourceUrl.js';
it('uses a downloaded official notice when the list contains a broken source hostname',()=>{
  const pdf='https://www.tceq.texas.gov/downloads/183397-nori-english.pdf';
  expect(pickOfficialSource(['https://www.tceq.texasgov/notices#406775',pdf])).toBe(pdf);
  expect(pickOfficialSource(['https://tceq.texas.gov.example.com/notice',null])).toBeNull();
});
