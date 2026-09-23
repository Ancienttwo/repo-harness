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
import { readOperatorPlanningSnapshot } from '../../src/effects/operator/collaboration';
import { decodeOperatorPlanningSnapshot } from '../../src/core/operator/planning-snapshot';
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
    const planningResponse=await fetch(`${server.url}/api/v1/collaboration/${f.entry.id}/snapshot`);
    expect(planningResponse.status).toBe(200);
    const envelope=await planningResponse.json() as {protocol:number;planning:{status:string;snapshot:unknown}};
    expect(envelope.protocol).toBe(4);expect(envelope.planning.status).toBe('observed');
    expect(decodeOperatorPlanningSnapshot(envelope.planning.snapshot,f.entry.id).tasks[0]!.task.title).toBe(f.task);
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

function graphFixture() {
  const f = fixture(), capability = 'capability.planning.context';
  const secondId = 'b'.repeat(64), policy = '{}\n', rollback = '{"scope":"task"}\n';
  const hash = (s:string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
  put(join(f.root, f.sprint), f.sprintText.replace('| [ ] |', '| [x] |') + `| 2 | ${secondId} | [ ] | Dependent task | contract | verified dependency | |\n`);
  put(join(f.root, 'src/context.ts'), 'export {};\n');
  put(join(f.root, '.archcontext/model/nodes/context.yaml'), JSON.stringify({schemaVersion:'archcontext.node/v2',id:capability,kind:'capability',name:'Context',status:'active',summary:'Planning fixture',responsibilities:['Own context'],source:{include:['src/**']},extensions:{contractFiles:{agents:'AGENTS.md',claude:'CLAUDE.md'},lspProfile:'typescript-lsp',verification:[]}}));
  put(join(f.root, '.ai/harness/policy.json'), '{}');
  put(join(f.root, 'plans/policy-module.json'), policy);
  put(join(f.root, 'plans/rollback.json'), rollback);
  const definition = (id:string, taskId:string, depends_on:unknown[]) => ({
    work_package_id:id,task_id:taskId,primary_capability:capability,depends_on,priority:10,concurrency:{scope:'repo',key:id},execution_surface:'contract',integration_group:null,
    required_acceptance:[{gate:'module',policy_id:'module-default',policy_ref:'plans/policy-module.json',policy_revision:hash(policy)}],
    rollback_boundary:{kind:'work_package',boundary_id:id,boundary_ref:'plans/rollback.json',boundary_revision:hash(rollback)},
    retry_policy:{max_automated_attempts:3,retryable_failure_classes:['transient_failure'],backoff:{kind:'fixed',initial_seconds:30,maximum_seconds:30},attention_after_seconds:3600,revision_reset:'reset_on_work_package_revision'},
  });
  const carrier='plans/sprints/context.work-graph.v1.json';
  const graph={protocol:1,kind:'repo-harness-work-graph',repository_id:f.entry.id,sprint_path:f.sprint,lane:'engineering-v2',work_packages:[definition('ready',f.input.task_id,[]),definition('dependent',secondId,[{repository_id:f.entry.id,work_package_id:'ready',required_state:'canonical_done',acceptance_authority:null}])]};
  put(join(f.root,carrier),JSON.stringify(graph));git(f.root,'add','.');git(f.root,'commit','-qm','Planning graph');
  const entry={...f.entry,accessMode:'read_write'};
  put(f.registryPath,JSON.stringify({version:1,authorizationRevision:2,repos:[entry]}));
  return {...f,graph,carrier,entry};
}

test('Planning preserves original requirements and preparation ownership without creating stores',()=>{
  const f=fixture(),before=tree(f.root),r=readOperatorPlanningSnapshot(f.input);
  expect(r.tasks).toHaveLength(1);expect(r.tasks[0]!.task.title).toBe(f.task);
  expect(r.tasks[0]!.offer.blockers).toContainEqual({code:'plan_missing',attention_owner:'agent'});
  expect(r.graph).toMatchObject({status:'observed',snapshot:{lane:'unclassified',work_graph_revision:null,packages:[]}});
  expect(tree(f.root)).toBe(before);expect(decodeOperatorPlanningSnapshot(r,f.entry.id)).toEqual(r);
  f.plan('Draft');expect(readOperatorPlanningSnapshot(f.input).tasks[0]!.offer.blockers).toContainEqual({code:'plan_not_approved',attention_owner:'user'});
  f.plan();expect(readOperatorPlanningSnapshot(f.input).tasks[0]!.offer.plan?.basis).toBe('registered_worktree');
  rmSync(join(f.root,'.ai/harness/sprint/active-sprint'));
  expect(readOperatorPlanningSnapshot(f.input)).toMatchObject({canonical:null,tasks:[],observation:{board_revision:null}});
});

test('Planning reads exact canonical graph and original dependency authority despite dirty source files',()=>{
  const f=graphFixture(),before=tree(f.root),r=readOperatorPlanningSnapshot(f.input);
  expect(r.graph.status).toBe('observed');if(r.graph.status!=='observed')throw Error('graph missing');
  expect(r.graph.snapshot.packages).toHaveLength(2);
  expect(r.graph.snapshot.packages.find(p=>p.work_package_id==='dependent')!.dependencies[0]).toMatchObject({required_state:'canonical_done',status:'satisfied'});
  expect(r.graph.snapshot.sources).toEqual([{repository_id:f.entry.id,commit:r.canonical!.commit,work_graph_revision:r.graph.snapshot.work_graph_revision!}]);
  expect(tree(f.root)).toBe(before);expect(JSON.stringify(r)).not.toContain(f.root);
  put(join(f.root,f.carrier),'{invalid');put(join(f.root,'plans/rollback.json'),'dirty');
  const dirty=readOperatorPlanningSnapshot(f.input);expect(dirty.graph).toEqual({...r.graph,observed_at:dirty.observation.observed_at});
  git(f.root,'add','.');git(f.root,'commit','-qm','invalid canonical graph');
  expect(readOperatorPlanningSnapshot(f.input)).toMatchObject({tasks:[{},{}],graph:{status:'unavailable',code:'source_unavailable'}});
});

test('Planning refuses missing graph authority and read-only dependency authority independently',()=>{
  const f=graphFixture();put(f.registryPath,JSON.stringify({version:1,authorizationRevision:3,repos:[{...f.entry,accessMode:'read_only'}]}));
  const r=readOperatorPlanningSnapshot(f.input);expect(r.graph.status).toBe('observed');
  if(r.graph.status==='observed')expect(r.graph.snapshot.packages.find(p=>p.work_package_id==='dependent')!.dependencies[0]).toMatchObject({status:'authority_unavailable',authority_revision:null});
  f.graph.work_packages[1]!.depends_on=[{repository_id:'repo_0123456789abcdef',work_package_id:'missing',required_state:'canonical_done',acceptance_authority:null}];
  put(join(f.root,f.carrier),JSON.stringify(f.graph));git(f.root,'add','.');git(f.root,'commit','-qm','unavailable dependency');
  expect(readOperatorPlanningSnapshot(f.input)).toMatchObject({tasks:[{},{}],graph:{status:'unavailable'}});
});

test('Planning refuses unstable proof, authorization drift and oversized Board before reading every plan',()=>{
  for(const change of ['plan','registry','limit'] as const){
    const f=fixture();f.plan();const original=boardModule.resolveBoard;let reads=0;
    const reader=spyOn(boardModule,'resolveBoard').mockImplementation((...args)=>{
      const result=original(...args);reads++;
      if(change==='limit')return {...result,cards:Array.from({length:201},()=>result.cards[0]!)};
      if(reads===2){if(change==='plan')f.plan('Draft');else put(f.registryPath,JSON.stringify({version:1,authorizationRevision:2,repos:[f.entry]}));}
      return result;
    });
    try{expect(()=>readOperatorPlanningSnapshot(f.input)).toThrow();expect(reads).toBe(change==='limit'?1:2);}finally{reader.mockRestore();}
  }
});

// Historical definition is independent from current activity/claim state.
import { readOperatorTaskHistory, TASK_HISTORY_BATCH_CHECK_FORMAT } from '../../src/effects/operator/task-history';
import { decodeOperatorTaskHistory, isTaskHistoryRequest, TASK_HISTORY_MAX_BLOB_BYTES } from '../../src/core/operator/task-history';

// Git before 2.51 rejects unknown batch-check atoms (e.g. objectmode) and every history read would fail.
test('history batch lookup uses only cat-file atoms available before Git 2.51', () => {
  const atoms=[...TASK_HISTORY_BATCH_CHECK_FORMAT.matchAll(/%\(([^)]*)\)/gu)].map(match=>match[1]);
  expect(atoms.length).toBeGreaterThan(0);
  expect(atoms.every(atom=>['objecttype','objectname','objectsize'].includes(atom!))).toBeTrue();
  expect(TASK_HISTORY_BATCH_CHECK_FORMAT.replace(/%\([^)]*\)/gu,'')).not.toContain('%');
});

test('historical Task survives archive and deletion through exact canonical commit evidence without writes', () => {
  const f=fixture(); const original=git(f.root,'rev-parse','HEAD');
  const originalText=readFileSync(join(f.root,f.sprint),'utf8');
  git(f.root,'mv',f.sprint,'plans/sprints/renamed.sprint.md');git(f.root,'commit','-qm','rename carrier');
  const renamed=git(f.root,'rev-parse','HEAD');
  mkdirSync(join(f.root,'plans/archive'),{recursive:true});
  git(f.root,'mv','plans/sprints/renamed.sprint.md','plans/archive/unrelated-name.md');git(f.root,'commit','-qm','archive carrier');
  const target=git(f.root,'rev-parse','HEAD'); const before=tree(f.root);
  const value=readOperatorTaskHistory(f.input);
  expect(value.source).toEqual({target_ref:'main',target_commit:target,commit:renamed,sprint_path:'plans/sprints/renamed.sprint.md',blob_sha256:`sha256:${createHash('sha256').update(originalText).digest('hex')}`});
  expect(value.task_id).toBe(f.input.task_id);expect(value.task.title).toBe('Inspect current task');
  expect(value.source.commit).not.toBe(original);expect(value.coverage.commits_examined).toBe(2);
  expect(JSON.stringify(value)).not.toContain(f.root);expect(JSON.stringify(value)).not.toContain('execution');
  expect(tree(f.root)).toBe(before);
});

test('history selects persisted ID across title changes and honors an explicit historical revision', () => {
  const f=fixture(),original=git(f.root,'rev-parse','HEAD');
  const old=readOperatorTaskHistory(f.input);
  put(join(f.root,f.sprint),readFileSync(join(f.root,f.sprint),'utf8').replace('Inspect current task','Renamed canonical task'));
  git(f.root,'add','.');git(f.root,'commit','-qm','rename task');
  expect(readOperatorTaskHistory(f.input).task.title).toBe('Renamed canonical task');
  const historical=readOperatorTaskHistory({...f.input,expected_task_revision:old.task_revision});
  expect(historical.source.commit).toBe(original);expect(historical.task.title).toBe(old.task.title);
  expect(()=>readOperatorTaskHistory({...f.input,task_id:'f'.repeat(64)})).toThrow('history_unavailable');
  expect(()=>readOperatorTaskHistory({...f.input,expected_task_revision:'f'.repeat(64)})).toThrow('history_unavailable');
});

test('uncommitted history lookalikes and client source coordinates cannot supply Task identity', () => {
  const f=fixture();
  git(f.root,'rm',f.sprint);git(f.root,'commit','-qm','remove task');
  put(join(f.root,'plans/archive/title-match.md'),`# Inspect current task\n${f.input.task_id}`);
  const value=readOperatorTaskHistory(f.input);expect(value.coverage.commits_examined).toBe(2);
  expect(()=>readOperatorTaskHistory({...f.input,repository_id:'missing'})).toThrow('history_unavailable');
  expect(isTaskHistoryRequest({...f.input,env:undefined})).toBe(false);
  expect(()=>readOperatorTaskHistory({...f.input,target_ref:'HEAD'} as never)).toThrow('unavailable');
  expect(()=>readOperatorTaskHistory({...f.input,sprint_path:f.sprint} as never)).toThrow('unavailable');
});

test('history checks every carrier before returning an exact match and refuses oversized evidence', () => {
  const f=fixture(),text=readFileSync(join(f.root,f.sprint),'utf8');
  put(join(f.root,'plans/sprints/duplicate.sprint.md'),text);git(f.root,'add','.');git(f.root,'commit','-qm','ambiguous ID');
  expect(()=>readOperatorTaskHistory(f.input)).toThrow('history_ambiguous');
  git(f.root,'rm','plans/sprints/duplicate.sprint.md');
  put(join(f.root,f.sprint),text+'\n'+'x'.repeat(TASK_HISTORY_MAX_BLOB_BYTES));
  git(f.root,'add','.');git(f.root,'commit','-qm','oversize carrier');
  expect(()=>readOperatorTaskHistory(f.input)).toThrow('too_large');
});

test('history uses the Sprint directory policy from each immutable commit', () => {
  const f=fixture();mkdirSync(join(f.root,'work'),{recursive:true});
  git(f.root,'mv',f.sprint,'work/canonical.sprint.md');
  put(join(f.root,'.ai/harness/policy.json'),JSON.stringify({sprints:{dir:'work'}}));
  git(f.root,'add','.');git(f.root,'commit','-qm','configured carrier directory');
  put(join(f.root,'.ai/harness/policy.json'),JSON.stringify({sprints:{dir:'wrong-local-directory'}}));
  const value=readOperatorTaskHistory(f.input);expect(value.source.sprint_path).toBe('work/canonical.sprint.md');
  const {env,...request}=f.input;
  expect(decodeOperatorTaskHistory(value,request)).toEqual(value);
  for (const bad of [{...value,protocol:2},{...value,source:{...value.source,sprint_path:'/private/secret'}},{...value,task:{...value.task,title:42}},{...value,task_revision:'invalid'},{...value,ready:true}]) {
    expect(()=>decodeOperatorTaskHistory(bad,request)).toThrow('Invalid task history response');
  }
});

test('schema1 history cannot manufacture a persisted Task ID from its title', () => {
  const f=fixture();git(f.root,'checkout','--orphan','legacy');
  put(join(f.root,f.sprint),'# Legacy\n\n## Backlog\n| # | Status | Task | Mode | Acceptance | Plan |\n|---|--------|------|------|------------|------|\n| 1 | [ ] | Inspect current task | contract | read only | |\n');
  git(f.root,'add','.');git(f.root,'commit','-qm','legacy source');
  put(join(f.root,'.ai/harness/policy.json'),JSON.stringify({worktree_strategy:{merge_back:{target:'legacy'}}}));
  expect(()=>readOperatorTaskHistory(f.input)).toThrow('history_unavailable');
});

test('history refuses an otherwise valid Task beyond its64 canonical-commit budget', () => {
  const f=fixture();git(f.root,'rm',f.sprint);git(f.root,'commit','-qm','delete task');
  for(let i=0;i<63;i++)git(f.root,'commit','--allow-empty','-qm',`later${i}`);
  expect(()=>readOperatorTaskHistory(f.input)).toThrow('history_unavailable');
});

import * as registryModule from '../../src/effects/repo-registry';
test('history rejects registry or canonical-target changes during its read', () => {
  for(const change of ['registry','target']) {
    const f=fixture();const original=registryModule.readRepoHarnessRegistryStrictSnapshot;let calls=0;
    const spy=spyOn(registryModule,'readRepoHarnessRegistryStrictSnapshot').mockImplementation(options=>{
      calls++;
      if(calls===2) {
        if(change==='registry') { const value=JSON.parse(readFileSync(f.registryPath,'utf8'));value.authorizationRevision++;put(f.registryPath,JSON.stringify(value)); }
        else git(f.root,'commit','--allow-empty','-qm','target moved');
      }
      return original(options);
    });
    try {expect(()=>readOperatorTaskHistory(f.input)).toThrow('stale');} finally {spy.mockRestore();}
  }
});

test('history digest binds the actual UTF-8 blob including a byte-order mark', () => {
  const f=fixture(),text='\ufeff'+readFileSync(join(f.root,f.sprint),'utf8');
  put(join(f.root,f.sprint),text);git(f.root,'add','.');git(f.root,'commit','-qm','source byte marker');
  expect(readOperatorTaskHistory(f.input).source.blob_sha256).toBe(`sha256:${createHash('sha256').update(readFileSync(join(f.root,f.sprint))).digest('hex')}`);
});

test('the existing context GET explicitly serves archived history with all selector and origin guards',async()=>{
  const f=fixture();git(f.root,'rm',f.sprint);git(f.root,'commit','-qm','archive current task');
  const before=tree(f.root),server=await startOperatorServer({port:0,env:f.input.env});
  try {
    const url=`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/context`;
    const response=await fetch(url+'?view=history');expect(response.status).toBe(200);
    const {env,...request}=f.input;expect(decodeOperatorTaskHistory(await response.json(),request).task.title).toBe(f.task);
    expect((await fetch(url)).status).toBe(503);
    expect((await fetch(url+'?view=history&task_revision='+'f'.repeat(64))).status).toBe(404);
    for(const q of ['view=history&view=history','view=history&ref=HEAD','view=history&path=/private','view=unknown','view=history&task_revision=invalid'])expect((await fetch(url+'?'+q)).status).toBe(400);
    expect((await fetch(url+'?view=history',{headers:{Origin:'https://foreign.invalid'}})).status).toBe(403);
    expect((await fetch(url+'?view=history',{method:'POST',headers:{Origin:server.url}})).status).toBe(405);
    expect(tree(f.root)).toBe(before);
  } finally {await server.close();}
});
