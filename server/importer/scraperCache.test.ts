import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {cachedGet} from '../../scraper/src/http.js';

it('retries a newly listed notice after a cached 404 and removes its negative marker',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pw-notice-test-'));
  const path=join(dir,'notice.pdf');
  await writeFile(path+'.404','');
  const fetch=vi.fn().mockResolvedValue(new Response('actual PDF bytes',{status:200}));
  vi.stubGlobal('fetch',fetch);
  try {
    expect(await cachedGet('https://www.tceq.texas.gov/notice.pdf',path)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect((await cachedGet('https://www.tceq.texas.gov/notice.pdf',path,true))?.toString()).toBe('actual PDF bytes');
    await expect(readFile(path+'.404')).rejects.toMatchObject({code:'ENOENT'});
    await cachedGet('https://www.tceq.texas.gov/notice.pdf',path,true);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {vi.unstubAllGlobals();await rm(dir,{recursive:true,force:true});}
});
