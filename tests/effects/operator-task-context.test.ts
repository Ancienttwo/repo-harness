import { afterEach, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, closeSync, openSync, renameSync, writeSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startOperatorServer } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

import { readOperatorPlanningSnapshot } from '../../src/effects/operator/repository-snapshot';
import { decodeOperatorPlanningSnapshot } from '../../src/core/operator/planning-snapshot';
import * as schedulingModule from '../../src/effects/engineers/scheduling';
import * as githubModule from '../../src/effects/github/issues';
import { buildProviderIssueObservation } from '../../src/core/external-sources/issue-observation';
import { writeProviderIssueObservation } from '../../src/effects/external-sources/store';
import { readExternalSourcesPolicy } from '../../src/effects/github/policy';
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
// Current admitted context coverage shares the protected session fixture in operator-task-diff.test.ts.

// A real Git subprocess blocked on HEAD cannot be interrupted by Worker.terminate.
// Keep this POSIX fixture out of Windows; the shared Job supervisor has its own native tests.
test.skipIf(process.platform === 'win32').each(['history', 'activity'] as const)(
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
      const response = await fetch(`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/${kind === 'activity' ? 'history/activity' : 'context?view=history'}`);
      expect(await response.json()).toEqual({code:'timeout'});
      let status = 503;
      const until = Date.now() + 2200;
      while (Date.now() < until) {
        status = (await fetch(`${server.url}/api/v1/fleet/tasks/unknown-repo/${f.input.task_id}/${kind === 'activity' ? 'history/activity' : 'context?view=history'}`)).status;
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
  put(join(f.root,'agents/engineers/profiles/.gitkeep'),'');
  git(f.root,'remote','add','origin','https://github.com/fixture/context.git');
  const secondId = '987655', policy = '{}\n', rollback = '{"scope":"task"}\n';
  const hash = (s:string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
  put(join(f.root, 'src/context.ts'), 'export {};\n');
  put(join(f.root,'AGENTS.md'),'# Context fixture\n');put(join(f.root,'CLAUDE.md'),'# Context fixture\n');
  put(join(f.root, '.archcontext/manifest.yaml'), JSON.stringify({schemaVersion:'archcontext.manifest/v1',model:{layout:'split',root:'.archcontext/model'},runtime:{contextBudgetBytes:12288}}));
  put(join(f.root, '.archcontext/model/nodes/context.yaml'), JSON.stringify({schemaVersion:'archcontext.node/v2',id:capability,kind:'capability',name:'Context',status:'active',summary:'Planning fixture',responsibilities:['Own context'],source:{include:['src/**']},extensions:{contractFiles:{agents:'AGENTS.md',claude:'CLAUDE.md'},lspProfile:'typescript-lsp',verification:[]}}));
  put(join(f.root, '.ai/harness/policy.json'), JSON.stringify({external_sources:{version:1,mode:'manual',github:{enabled:true,repository:'fixture/context',selection:{kind:'issue_numbers',issue_numbers:[1,2]},limits:{max_pages:1,max_issues:10,max_body_bytes:4096,max_total_bytes:65536,deadline_ms:5000}}}}));
  put(join(f.root, 'plans/policy-module.json'), policy);
  put(join(f.root, 'plans/rollback.json'), rollback);
  const definition = (id:string, taskId:string, depends_on:unknown[]) => ({
    work_package_id:id,task:{provider_repository_id:'123456',issue_id:taskId},primary_capability:capability,depends_on,priority:10,concurrency:{scope:'repo',key:id},execution_surface:'admitted_session',integration_group:null,
    required_acceptance:[{gate:'module',policy_id:'module-default',policy_ref:'plans/policy-module.json',policy_revision:hash(policy)}],
    rollback_boundary:{kind:'work_package',boundary_id:id,boundary_ref:'plans/rollback.json',boundary_revision:hash(rollback)},
    retry_policy:{max_automated_attempts:3,retryable_failure_classes:['transient_failure'],backoff:{kind:'fixed',initial_seconds:30,maximum_seconds:30},attention_after_seconds:3600,revision_reset:'reset_on_work_package_revision'},
  });
  const carrier='.ai/harness/work-graph.v2.json';
  const graph={protocol:2,kind:'repo-harness-provider-work-graph',repository_id:f.entry.id,work_packages:[definition('ready','987654',[]),definition('dependent',secondId,[{repository_id:f.entry.id,work_package_id:'ready',required_state:'provider_closed',acceptance_authority:null}])]};
  put(join(f.root,carrier),JSON.stringify(graph));git(f.root,'add','.');git(f.root,'commit','-qm','Planning graph');
  const entry={...f.entry,accessMode:'read_write'};
  put(f.registryPath,JSON.stringify({version:1,authorizationRevision:2,repos:[entry]}));
  const observations=['987654',secondId].map((id,index)=>buildProviderIssueObservation({
    registered_repository_id:entry.id,provider:'github',provider_host:'github.com',provider_repository_id:'123456',provider_issue_id:id,
    display_ref:`fixture/context#${index+1}`,url:`https://github.com/fixture/context/issues/${index+1}`,observed_at:'2026-10-01T00:00:00.000Z',
    provider_created_at:null,provider_updated_at:null,state:index===0?'closed':'open',title:index===0?'Original requirement':'Dependent requirement',body:'Original provider acceptance requirements',labels:[],assignees:[],comments_policy:'omitted',policy_revision:readExternalSourcesPolicy(f.root).policy_revision,eligible:index!==0,eligibility_reasons:index===0?['closed']:[],
  }));
  observations.forEach(observation=>writeProviderIssueObservation(f.root,observation));
  const provider={repository:{provider_repository_id:'123456',display_ref:'fixture/context',url:'https://github.com/fixture/context'},issues:observations.map((o,index)=>({provider_issue_id:o.provider_issue_id,number:index+1,url:o.url,created_at:null,updated_at:null,state:o.state,title:o.title,body:o.body,labels:o.labels,assignees:o.assignees})),pages_fetched:1,issues_seen:2};
  return {...f,input:{repository_id:entry.id,env:f.input.env},graph,carrier,entry,provider,commit:git(f.root,'rev-parse','HEAD')};
}

test('Planning preserves provider requirements without manufacturing preparation or execution state',()=>{
  const f=graphFixture();git(f.root,'rm',f.carrier);git(f.root,'commit','-qm','graph not authored');
  const before=tree(f.root),r=readOperatorPlanningSnapshot(f.input);
  expect(r.scheduling.tasks).toHaveLength(2);
  expect(r.scheduling.tasks[0]!.issue).toMatchObject({title:'Original requirement',body:'Original provider acceptance requirements',state:'closed'});
  expect(r.scheduling.tasks.every(task=>task.sessions.length===0)).toBe(true);
  expect(r.graph).toEqual({status:'unavailable',code:'needs_provider_graph'});
  expect(tree(f.root)).toBe(before);expect(decodeOperatorPlanningSnapshot(r,f.entry.id)).toEqual(r);
  rmSync(join(f.root,'.ai/harness/sprint/active-sprint'));
  expect(readOperatorPlanningSnapshot(f.input).scheduling).toEqual(r.scheduling);
});

test('Planning reads immutable provider graph references and freshly observes dependency closure',()=>{
  const f=graphFixture(),provider=spyOn(githubModule,'fetchGithubIssues').mockImplementation(()=>f.provider);
  try {
    const before=tree(f.root),r=readOperatorPlanningSnapshot(f.input);
    expect(r.graph.status).toBe('observed');if(r.graph.status!=='observed')throw Error('graph missing');
    expect(r.graph.snapshot.packages).toHaveLength(2);
    expect(r.graph.snapshot.packages.find(p=>p.work_package_id==='dependent')!.dependencies[0]).toMatchObject({required_state:'provider_closed',status:'satisfied'});
    expect(r.graph.snapshot.sources).toEqual([{repository_id:f.entry.id,commit:f.commit,graph_path:f.carrier,work_graph_revision:expect.stringMatching(/^sha256:/)}]);
    expect(tree(f.root)).toBe(before);expect(JSON.stringify(r)).not.toContain(f.root);
    put(join(f.root,f.carrier),'{invalid');put(join(f.root,'plans/rollback.json'),'dirty');
    expect(readOperatorPlanningSnapshot(f.input).graph).toEqual(r.graph);
    f.provider.issues[0]!.state='open';
    const reopened=readOperatorPlanningSnapshot(f.input);
    if(reopened.graph.status!=='observed')throw Error('graph missing');
    expect(reopened.graph.snapshot.packages.find(p=>p.work_package_id==='dependent')!.dependencies[0]!.status).toBe('unsatisfied');
    git(f.root,'add','.');git(f.root,'commit','-qm','invalid canonical graph');
    expect(readOperatorPlanningSnapshot(f.input)).toMatchObject({scheduling:{tasks:[{},{}]},graph:{status:'unavailable',code:'source_unavailable'}});
  } finally {provider.mockRestore();}
});

test('Planning refuses missing graph authority and read-only dependency authority independently',()=>{
  const f=graphFixture();put(f.registryPath,JSON.stringify({version:1,authorizationRevision:3,repos:[{...f.entry,accessMode:'read_only'}]}));
  const r=readOperatorPlanningSnapshot(f.input);expect(r.graph.status).toBe('observed');
  if(r.graph.status==='observed')expect(r.graph.snapshot.packages.find(p=>p.work_package_id==='dependent')!.dependencies[0]).toMatchObject({status:'authority_unavailable',authority_revision:null});
  f.graph.work_packages[1]!.depends_on=[{repository_id:'repo_0123456789abcdef',work_package_id:'missing',required_state:'provider_closed',acceptance_authority:null}];
  put(join(f.root,f.carrier),JSON.stringify(f.graph));git(f.root,'add','.');git(f.root,'commit','-qm','unavailable dependency');
  expect(readOperatorPlanningSnapshot(f.input)).toMatchObject({scheduling:{tasks:[{},{}]},graph:{status:'unavailable'}});
});

test('Planning refuses changing provider evidence, authorization drift and oversized scheduling',()=>{
  for(const change of ['provider','registry','limit'] as const){
    const f=graphFixture(),original=schedulingModule.readProviderEngineerScheduling;let reads=0;
    const provider=spyOn(githubModule,'fetchGithubIssues').mockImplementation(()=>f.provider);
    const reader=spyOn(schedulingModule,'readProviderEngineerScheduling').mockImplementation((...args)=>{
      reads++;
      if(reads===2){
        if(change==='provider')writeProviderIssueObservation(f.root,buildProviderIssueObservation({registered_repository_id:f.entry.id,provider:'github',provider_host:'github.com',provider_repository_id:'123456',provider_issue_id:'987654',display_ref:'fixture/context#1',url:'https://github.com/fixture/context/issues/1',observed_at:'2026-10-02T00:00:00.000Z',provider_created_at:null,provider_updated_at:'2026-10-02T00:00:00.000Z',state:'open',title:'Changed requirement',body:'Changed acceptance',labels:[],assignees:[],comments_policy:'omitted',policy_revision:readExternalSourcesPolicy(f.root).policy_revision,eligible:true,eligibility_reasons:[]}));
        else if(change==='registry')put(f.registryPath,JSON.stringify({version:1,authorizationRevision:3,repos:[f.entry]}));
      }
      const result=original(...args);
      return change==='limit'?{...result,tasks:Array.from({length:201},()=>result.tasks[0]!)}:result;
    });
    try{expect(()=>readOperatorPlanningSnapshot(f.input)).toThrow();expect(reads).toBe(change==='limit'?1:2);}finally{reader.mockRestore();provider.mockRestore();}
  }
});

// Historical definition is independent from current activity/claim state.
import { readOperatorTaskHistory } from '../../src/effects/operator/task-history';
import { decodeOperatorTaskHistory, isTaskHistoryRequest, TASK_HISTORY_MAX_BLOB_BYTES } from '../../src/core/operator/task-history';

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
  // The reader starts two Git processes per commit; slow process start-up (Windows) must not turn the budget refusal into a timeout.
  expect(()=>readOperatorTaskHistory(f.input,{deadline_ms:60_000})).toThrow('history_unavailable');
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
    // Historical reads require explicit selection; missing view never invokes a fallback reader.
    expect((await fetch(url)).status).toBe(400);
    expect((await fetch(url+'?view=history&task_revision='+'f'.repeat(64))).status).toBe(404);
    for(const q of ['view=history&view=history','view=history&ref=HEAD','view=history&path=/private','view=unknown','view=history&task_revision=invalid'])expect((await fetch(url+'?'+q)).status).toBe(400);
    expect((await fetch(url+'?view=history',{headers:{Origin:'https://foreign.invalid'}})).status).toBe(403);
    expect((await fetch(url+'?view=history',{method:'POST',headers:{Origin:server.url}})).status).toBe(405);
    expect(tree(f.root)).toBe(before);
  } finally {await server.close();}
});
