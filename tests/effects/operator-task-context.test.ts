import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startOperatorServer } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
const roots:string[]=[];
afterEach(()=>{ for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
const git=(cwd:string,...args:string[])=>execFileSync('git',['-c','core.fsmonitor=false','-c','maintenance.auto=false','-c','gc.auto=0',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const put=(path:string,value:string)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);};
function tree(root:string):string {return readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>e.isDirectory()?`${e.name}/{${tree(join(root,e.name))}}`:`${e.name}:${createHash('sha256').update(readFileSync(join(root,e.name))).digest('hex')}`).join('\n');}
function fixture() {
  const base=realpathSync(mkdtempSync(join(tmpdir(),'operator-context-')));roots.push(base);
  const root=join(base,'repo'), home=join(base,'home');mkdirSync(root);mkdirSync(home);
  git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
  const taskId='a'.repeat(64);
  put(join(root,'.ai/harness/.gitkeep'),'');
  git(root,'add','.');git(root,'commit','-qm','empty repository');
  const repo=repoHarnessRepoIdFor(root),at='2026-09-22T00:00:00.000Z';
  const entry={id:repo,path:root,accessMode:'read_only',source:'adopt',registeredAt:at,lastSeenAt:at};
  const registryPath=join(home,'registered-repos.json');put(registryPath,JSON.stringify({version:1,authorizationRevision:1,repos:[entry]}));
  const input={repository_id:repo,task_id:taskId,env:{REPO_HARNESS_HOME:home}};
  return {root,home,input,entry,registryPath};
}
// Current admitted context coverage shares the protected session fixture in operator-task-diff.test.ts.

test('the retired task history selector is not routed',async()=>{
  const f=fixture();
  const before=tree(f.root),server=await startOperatorServer({port:0,env:f.input.env});
  try {
    const url=`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/context`;
    for(const query of ['?view=history','?view=history&task_revision='+'f'.repeat(64)]){
      const response=await fetch(url+query);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({error:{code:'not_found'}});
    }
    expect(tree(f.root)).toBe(before);
  } finally {await server.close();}
});
