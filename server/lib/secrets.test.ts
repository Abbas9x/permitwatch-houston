import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('secret scanner',()=>{
  it('checks ignored environment files and reports locations without exposing values',()=>{
    const dir=mkdtempSync(join(tmpdir(),'permitwatch-scan-'));
    try {
      execFileSync('git',['init','-q'],{cwd:dir});
      writeFileSync(join(dir,'.gitignore'),'.env\n');
      const fake='AIza'+'Z'.repeat(35);
      writeFileSync(join(dir,'.env'),'PRIVATE_ACCESS_KEY='+fake+'\n');
      const result=spawnSync(process.execPath,[resolve('scripts/scan-secrets.mjs')],{cwd:dir,encoding:'utf8'});
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.env:1');
      expect(result.stderr).not.toContain(fake);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
});
