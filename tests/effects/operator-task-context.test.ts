import { afterEach, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, closeSync, openSync, renameSync, writeSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { decodeOperatorTaskContext, parseTaskContextRequest } from '../../src/core/operator/task-context';
import { buildLeaseOwnerRecord, deriveTaskRevision, serializeLeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import { readOperatorTaskContext } from '../../src/effects/operator/task-context';
import { startOperatorServer } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { leaseOwnerPath } from '../../src/effects/state/coordination-lease-store';
import * as boardModule from '../../src/effects/state/resolve-board';
const roots:string[]=[];
afterEach(()=>{ for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
const git=(cwd:string,...args:string[])=>execFileSync('git',['-c','core.fsmonitor=false','-c','maintenance.auto=false','-c','gc.auto=0',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const put=(path:string,value:string)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);};
function tree(root:string):string {return readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>e.isDirectory()?`${e.name}/{${tree(join(root,e.name))}}`:`${e.name}:${createHash('sha256').update(readFileSync(join(root,e.name))).digest('hex')}`).join('\n');}
function fixture() {
  const base=realpathSync(mkdtempSync(join(tmpdir(),'operator-context-')));roots.push(base);
  const root=join(base,'repo'), home=join(base,'home');mkdirSync(root);mkdirSync(home);
  git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
  const task='Inspect current task',taskId='a'.repeat(64),sprint='plans/sprints/context.sprint.md';
  const taskRevision=deriveTaskRevision({taskId,taskCell:task,modeCell:'contract',acceptanceCell:'read only'});
  const sprintText=`# Sprint\n\n> **Status**: Executing\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|--------|------|------|------------|------|\n| 1 | ${taskId} | [ ] | ${task} | contract | read only | plans/plan-false.md |\n`;
  put(join(root,sprint),sprintText);put(join(root,'.ai/harness/sprint/active-sprint'),sprint+'\n');
  git(root,'add','.');git(root,'commit','-qm','canonical task');
  const repo=repoHarnessRepoIdFor(root),at='2026-09-22T00:00:00.000Z';
  const entry={id:repo,path:root,accessMode:'read_only',source:'adopt',registeredAt:at,lastSeenAt:at};
  const registryPath=join(home,'registered-repos.json');put(registryPath,JSON.stringify({version:1,authorizationRevision:1,repos:[entry]}));
  const input={repository_id:repo,task_id:taskId,expected_task_revision:null,env:{REPO_HARNESS_HOME:home}};
  const planPath='plans/plan-20260922-context.md',contractPath='tasks/contracts/context.contract.md';
  function plan(status='Approved',source=`sprint:${sprint}#${task}`) {
    const body=`# Plan\n\n> **Status**: ${status}\n> **Source Ref**: ${source}\n> **Artifact Level**: work-package\n> **Promotion Reason**: verification_boundary\n> **Verification Boundary**: context test\n> **Rollback Surface**: remove context\n> **Task Contract**: ${contractPath}\n\n## Promotion Gate\n- **Merge/PR unit**: context unit\n- **Rollback surface**: remove context\n- **Verification boundary**: context test\n- **Review/acceptance boundary**: context review\n- **High-risk surface**: identity\n- **Why not checklist row**: independent verification\n\n## Evidence Contract\n- **State/progress path**: context plan\n- **Verification evidence**: context tests\n- **Evaluator rubric**: context review\n- **Stop condition**: tests pass\n- **Rollback surface**: remove context\n`;
    put(join(root,planPath),body);put(join(root,contractPath),`# Contract\n\n> **Plan**: ${planPath}\n\n## Allowed Paths\n\n\`\`\`yaml\nallowed_paths:\n  - src/context.ts\n\`\`\`\n`);
  }
  return {root,home,input,task,sprint,sprintText,entry,registryPath,plan,planPath};
}
test('current unclaimed task returns original preparation owners and ignores the Plan cell',()=>{
  const f=fixture(),before=tree(f.root),r=readOperatorTaskContext(f.input);
  expect(r.task).toEqual({title:f.task,mode:'contract',acceptance:'read only',state:'pending'});
  expect(r.execution).toEqual({lease_state:'available',claim:null});
  expect(r.offer.plan).toBeNull();expect(r.offer.blockers).toContainEqual({code:'plan_missing',attention_owner:'agent'});
  expect(r.offer.blockers).toContainEqual({code:'repo_read_only',attention_owner:'user'});
  expect(tree(f.root)).toBe(before);expect(JSON.stringify(r)).not.toContain(f.root);expect(decodeOperatorTaskContext(r,f.input)).toEqual(r);
});
test('exact original Source Ref proof and unapproved source remain distinct',()=>{
  const f=fixture();f.plan();const r=readOperatorTaskContext(f.input);
  expect(r.offer.plan?.source_ref).toBe(`sprint:${f.sprint}#${f.task}`);expect(r.offer.plan?.plan_path).toBe(f.planPath);
  expect(r.offer.plan?.basis).toBe('registered_worktree');expect(r.offer.plan?.plan_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);expect(r.offer.execution_readiness).toBe('unsupported');
  f.plan('Draft');const unapproved=readOperatorTaskContext(f.input);expect(unapproved.offer.plan).toBeNull();
  expect(unapproved.offer.blockers).toContainEqual({code:'plan_not_approved',attention_owner:'user'});
  f.plan('Approved',`sprint:${f.sprint}#Other task`);expect(readOperatorTaskContext(f.input).offer.blockers).toContainEqual({code:'plan_source_mismatch',attention_owner:'user'});
});
test('expected revision is fenced and current canonical source overrides dirty working copy',()=>{
  const f=fixture(),first=readOperatorTaskContext(f.input);
  expect(()=>readOperatorTaskContext({...f.input,expected_task_revision:'b'.repeat(64)})).toThrow('stale');
  put(join(f.root,f.sprint),f.sprintText.replace(f.task,'Changed task'));
  expect(readOperatorTaskContext(f.input).task_revision).toBe(first.task_revision);
  git(f.root,'add',f.sprint);git(f.root,'commit','-qm','revise task');
  expect(()=>readOperatorTaskContext({...f.input,expected_task_revision:first.task_revision})).toThrow('stale');
  expect(readOperatorTaskContext(f.input).task.title).toBe('Changed task');
  expect(()=>readOperatorTaskContext({...f.input,task_id:'c'.repeat(64)})).toThrow('task_not_found');
});
test('healthy A remains readable with unavailable B; corrupted registry fails closed',()=>{
  const f=fixture(),missing=join(f.root,'missing-repo');
  put(f.registryPath,JSON.stringify({version:1,authorizationRevision:2,repos:[f.entry,{...f.entry,id:repoHarnessRepoIdFor(missing),path:missing}]}));
  expect(readOperatorTaskContext(f.input).observation.authorization_revision).toBe(2);
  put(f.registryPath,'{bad');expect(()=>readOperatorTaskContext(f.input)).toThrow('unavailable');
});
test('recorded claim is allowlisted without session/worktree or invented execution status',()=>{
  const f=fixture(),current=readOperatorTaskContext(f.input);
  const owner=buildLeaseOwnerRecord({taskId:f.input.task_id,taskRevision:current.task_revision,claimId:'123e4567-e89b-42d3-a456-426614174001',generation:1,sprintPath:f.sprint,targetRef:'main',sourceWorktree:f.root,sessionId:'private-session'});
  put(leaseOwnerPath(f.root,f.input.task_id),serializeLeaseOwnerRecord(owner));const before=tree(f.root),r=readOperatorTaskContext(f.input);
  expect(r.execution.lease_state).toBe('reserving');expect(r.execution.claim?.claim_id).toBe(owner.claim_id);
  expect(JSON.stringify(r)).not.toContain('private-session');expect(JSON.stringify(r)).not.toContain(f.root);expect(tree(f.root)).toBe(before);
});
test('strict decoder refuses wrong identity, arbitrary source paths and unsupported fields',()=>{
  const f=fixture();f.plan();const r=readOperatorTaskContext(f.input);
  for(const change of [{repository_id:'other'},{protocol:2},{path:f.root},{canonical:{...r.canonical,sprint_path:'../private'}},{offer:{...r.offer,plan:{...r.offer.plan,contract_path:'/private/secret'}}},{offer:{...r.offer,plan:{...r.offer.plan,source_ref:'sprint:fake#task'}}},{execution:{...r.execution,running:true}}]) expect(()=>decodeOperatorTaskContext({...r,...change},f.input)).toThrow();
  for(const query of ['path=/private','source_ref=bad','task_revision=bad','task_revision='+r.task_revision+'&task_revision='+r.task_revision]) expect(()=>parseTaskContextRequest(f.input.repository_id,f.input.task_id,new URLSearchParams(query))).toThrow();
});
test('real HTTP worker returns current context, stale refusal and method/query guards without mutation',async()=>{
  const f=fixture(),before=tree(f.root),server=await startOperatorServer({port:0,env:f.input.env});
  try {
    const url=`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/context`;
    const response=await fetch(url);expect(response.status).toBe(200);expect(decodeOperatorTaskContext(await response.json(),f.input).task.title).toBe(f.task);
    expect((await fetch(url+'?task_revision='+'b'.repeat(64))).status).toBe(409);
    expect((await fetch(url+'?path=/private')).status).toBe(400);expect((await fetch(url,{method:'POST',headers:{Origin:server.url}})).status).toBe(405);
    expect((await fetch(url,{headers:{Origin:'https://foreign.invalid'}})).status).toBe(403);
    expect(tree(f.root)).toBe(before);
  } finally {await server.close();}
});


test('changed current plan proof during observation is rejected rather than mixed with old facts',()=>{
  const f=fixture();f.plan();const original=boardModule.resolveBoard;let reads=0;
  const reader=spyOn(boardModule,'resolveBoard').mockImplementation((...args)=>{
    const result=original(...args);if (++reads === 2) f.plan('Draft');return result;
  });
  try {expect(()=>readOperatorTaskContext(f.input)).toThrow('stale');expect(reads).toBe(2);}
  finally {reader.mockRestore();}
});

test('registry authorization changed during the second Board read invalidates the response',()=>{
  const f=fixture(),original=boardModule.resolveBoard;let reads=0;
  const reader=spyOn(boardModule,'resolveBoard').mockImplementation((...args)=>{
    const result=original(...args);
    if (++reads === 2) put(f.registryPath,JSON.stringify({version:1,authorizationRevision:2,repos:[f.entry]}));
    return result;
  });
  try {expect(()=>readOperatorTaskContext(f.input)).toThrow('stale');}
  finally {reader.mockRestore();}
});

// A real Git subprocess blocked on HEAD cannot be interrupted by Worker.terminate.
// Keep this POSIX fixture out of Windows; the shared Job supervisor has its own native tests.
test.skipIf(process.platform === 'win32').each(['context', 'activity'] as const)(
  'blocked native %s Git read releases admission and permits bounded shutdown after timeout',
  async (kind) => {
    const f = fixture();
    const head = join(f.root, '.git', 'HEAD');
    const original = head + '.original', pipe = head + '.blocked';
    const bytes = readFileSync(head);
    renameSync(head, original);
    execFileSync('mkfifo', [head]);
    const server = await startOperatorServer({port:0,env:f.input.env,timeout_ms:1000,max_concurrency:1});
    let closing: Promise<void> | undefined;
    try {
      const response = await fetch(`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/${kind}`);
      expect(await response.json()).toEqual({code:'timeout'});
      let status = 503;
      const until = Date.now() + 2200;
      while (Date.now() < until) {
        status = (await fetch(`${server.url}/api/v1/fleet/tasks/unknown-repo/${f.input.task_id}/${kind}`)).status;
        if (status !== 503) break;
        await Bun.sleep(25);
      }
      closing = server.close();
      const closed = await Promise.race([closing.then(()=>true),Bun.sleep(1000).then(()=>false)]);
      expect({status,closed}).toEqual({status:404,closed:true});
    } finally {
      // Restore future opens, then release any pre-fix reader already waiting on the FIFO.
      renameSync(head, pipe); renameSync(original, head);
      try { const fd=openSync(pipe,constants.O_WRONLY|constants.O_NONBLOCK);try{writeSync(fd,bytes);}finally{closeSync(fd);} } catch(error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENXIO') throw error;
      }
      await (closing ?? server.close());
    }
  }, 15000,
);
