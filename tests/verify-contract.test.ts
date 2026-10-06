import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'fs';
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
function run(root:string,args:string[]){return spawnSync('bash',['scripts/verify-contract.sh',...args],{cwd:root,encoding:'utf8',env:{...process.env,REPO_HARNESS_BUN_BIN:process.execPath}});}
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

test('explicit verification starts selected tests through the owning package runner from an ordinary HOME',()=>{
  const root=fixture(); const ordinaryHome='/nonexistent/repo-harness-ordinary-home'; try {
    copyFileSync(join(ROOT,'bunfig.toml'),join(root,'bunfig.toml'));
    copyFileSync(join(ROOT,'tests/preload-home-isolation.ts'),join(root,'tests/preload-home-isolation.ts'));
    mkdirSync(join(root,'scripts/lib'));
    for(const file of ['ci-run-tests.sh','test-home-isolation.mjs']) copyFileSync(join(ROOT,'scripts/lib',file),join(root,'scripts/lib',file));
    const packageScripts=JSON.parse(readFileSync(join(ROOT,'package.json'),'utf8')).scripts;
    writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{'check:type':'bun typecheck.ts',test:packageScripts.test}}));
    writeFileSync(join(root,'tests/affected.test.ts'),"import { test,expect } from 'bun:test'; import {appendFileSync,existsSync,realpathSync} from 'fs'; import {homedir} from 'os'; import {join} from 'path'; test('isolated affected behavior',()=>{ expect(homedir().startsWith(realpathSync('/tmp')+'/')).toBe(true); expect(existsSync(join(homedir(),'.gitconfig'))).toBe(true); appendFileSync('commands.log','affected\\n'); });\n");
    writeFileSync(join(root,'tests/unselected.test.ts'),"import { test } from 'bun:test'; import {appendFileSync} from 'fs'; test('unselected',()=>appendFileSync('commands.log','unselected\\n'));\n");
    writeFileSync(join(root,'tests/failing.test.ts'),"import { test,expect } from 'bun:test'; test('selected failure',()=>expect(1).toBe(2));\n");
    const invoke=(file:string)=>spawnSync('bash',['scripts/verify-contract.sh','--test',file],{cwd:root,encoding:'utf8',env:{...process.env,HOME:ordinaryHome,REPO_HARNESS_BUN_BIN:process.execPath}});
    const passed=invoke('tests/affected.test.ts'); expect(passed.status,`${passed.stdout}\n${passed.stderr}`).toBe(0);
    expect(readFileSync(join(root,'commands.log'),'utf8')).toBe('typecheck\naffected\n');
    expect(invoke('tests/failing.test.ts').status).not.toBe(0);
    expect(readFileSync(join(root,'commands.log'),'utf8')).toBe('typecheck\naffected\ntypecheck\n');
    expect(existsSync(ordinaryHome)).toBe(false);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('task metadata preflight validates canonical task inputs without executing their commands',()=>{
  const root=fixture(); try {
    mkdirSync(join(root,'tasks/reviews'),{recursive:true});
    writeFileSync(join(root,'tasks/reviews/task.md'),'# task input\n');
    const plan={protocol:1,checks:[{id:'affected',kind:'command',command:'bun test tests/affected.test.ts',cwd:'.',phase:'verification',cost:'normal',evidence_policy:'current_exact',necessity:'Verify the requested behavior',inputs:{env:[]}}]};
    const contract=['# Task','> **Status**: Active','> **Task Profile**: code-change','> **Review File**: tasks/reviews/task.md','', '## Allowed Paths','```yaml','allowed_paths:','  - src/','```','','## Verification Plan','```json',JSON.stringify(plan),'```',''].join('\n');
    writeFileSync(join(root,'task.md'),contract);
    const invoke=()=>spawnSync('bash',[join(ROOT,'scripts/verify-contract.sh'),'--contract','task.md','--preflight'],{cwd:root,encoding:'utf8',env:{...process.env,REPO_HARNESS_BUN_BIN:process.execPath,REPO_HARNESS_TARGET_REPO_ROOT:root}});
    const valid=invoke();expect(valid.status,valid.stderr).toBe(0);
    expect(valid.stdout).toContain('task input metadata validated');
    expect(readFileSync(join(root,'task.md'),'utf8')).toBe(contract);
    expect(()=>readFileSync(join(root,'commands.log'),'utf8')).toThrow();
    writeFileSync(join(root,'task.md'),contract.replace('code-change','docs-only'));
    expect(invoke().status).not.toBe(0);
    writeFileSync(join(root,'task.md'),contract.replace('  - src/','  - ../outside/'));
    expect(invoke().status).not.toBe(0);
  } finally {rmSync(root,{recursive:true,force:true});}
});
