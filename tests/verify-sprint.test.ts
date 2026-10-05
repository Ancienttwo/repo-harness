import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
const ROOT=join(import.meta.dir,'..');
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'explicit-verify-'));
  mkdirSync(join(root,'tests'),{recursive:true}); mkdirSync(join(root,'scripts'));
  for(const file of ['verify-sprint.sh','verify-contract.sh']) copyFileSync(join(ROOT,'scripts',file),join(root,'scripts',file));
  writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{'check:type':'bun typecheck.ts',test:'bun test'}}));
  writeFileSync(join(root,'typecheck.ts'),"import { appendFileSync,existsSync } from 'fs'; appendFileSync('commands.log','typecheck\\n'); if(existsSync('bad-types'))process.exit(7);\n");
  writeFileSync(join(root,'tests/affected.test.ts'),"import { test,expect } from 'bun:test'; import {appendFileSync} from 'fs'; appendFileSync('commands.log','affected\\n'); test('real affected behavior',()=>expect(1+1).toBe(2));\n");
  return root;
}
function run(root:string,args:string[]){return spawnSync('bash',['scripts/verify-sprint.sh',...args],{cwd:root,encoding:'utf8',env:{...process.env,REPO_HARNESS_BUN_BIN:process.execPath}});}
describe('explicit verification owner',()=>{
  test('runs typecheck plus only affected tests once without workflow artifacts',()=>{
    const root=fixture(); try {
      const result=run(root,['--test','tests/affected.test.ts']); expect(result.status).toBe(0);
      expect(readFileSync(join(root,'commands.log'),'utf8')).toBe('typecheck\naffected\n');
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  test('failed typecheck suppresses test execution and remains a failure',()=>{
    const root=fixture(); try {
      writeFileSync(join(root,'bad-types'),'bad');
      const result=run(root,['--test','tests/affected.test.ts']); expect(result.status).toBe(7);
      expect(readFileSync(join(root,'commands.log'),'utf8')).toBe('typecheck\n');
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  test('rejects path escape and retired acceptance flags before executing commands',()=>{
    const root=fixture(); try {
      expect(run(root,['--test','../outside.test.ts']).status).not.toBe(0);
      expect(run(root,['--prepare-acceptance']).status).toBe(2);
    } finally {rmSync(root,{recursive:true,force:true});}
  });
});
