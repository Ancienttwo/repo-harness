import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { preparePipelineSQLite } from '../helpers/pipeline-sqlite-fixture';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { decodeRecord, digest, keyOf, PipelineError, type Evidence, type Key, type PipelineRecord, type Subject } from '../../src/core/pipeline/types';
import { currentSubject, requirementPass } from '../../src/core/pipeline/gates';
import { advanceRecord } from '../../src/core/pipeline/stage-machine';
import { projectedRuns, projectBoard } from '../../src/core/pipeline/projection';
import { assertSQLiteVersion, exportSnapshot, immutableDatabase, openSnapshot, PipelineStore, snapshotPointerPath } from '../../src/effects/pipeline/store';
import { mutatePipeline, newPipeline, type MutationBoundary } from '../../src/effects/pipeline/ledger';
import { ingestEvent, observations } from '../../src/effects/pipeline/ingest';
import { readPipelineSnapshot, readPipelineStatus } from '../../src/effects/pipeline/read';
import { sourceAuthority, validateOnSource, type AuthorityQuery } from '../../src/effects/pipeline/authority';
import { taskRepository } from '../../src/effects/terminal/task-worktree';
import { taskSessionDirectory, processIdentity, harnessCapabilities, writeSessionArtifact, type TaskRequest, type TaskPaneBinding } from '../../src/effects/terminal/task-session';
import { captureGitVirtualTreeSnapshot, executeVerificationContract, verificationContractProvenance, validateMaterializedVerificationExecutionReport } from '../../src/effects/evidence/verification-execution';
import { createPipelineStatusReader } from '../../src/effects/operator/pipeline-status';
import { startOperatorServer, OPERATOR_ROUTES } from '../../src/effects/operator/server';

// Check the fixed SQLite prerequisite before any database opens.
// Test hosts, databases and artifacts all live in /tmp.
preparePipelineSQLite();
const CLI=resolve(import.meta.dir,'../../src/cli/index.ts');
let scratch:string;let env:NodeJS.ProcessEnv;let store:PipelineStore;const saved={...process.env};
beforeEach(()=>{
  scratch=realpathSync(mkdtempSync('/tmp/observer-test-'));const home=join(scratch,'home');mkdirSync(home);
  env={...saved,HOME:home,TMPDIR:'/tmp',REPO_HARNESS_PIPELINES_AUTHORITY_HOST:hostname(),REPO_HARNESS_PIPELINES_DB:join(scratch,'store','ledger.db'),GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
  delete env.REPO_HARNESS_PIPELINES_SOURCE_HOST;delete env.REPO_HARNESS_PIPELINES_SOURCE_COMMANDS;
  store=new PipelineStore({env});
});
afterEach(()=>{store?.close();rmSync(scratch,{recursive:true,force:true});});
function git(root:string,...args:string[]):string{return execFileSync('git',args,{cwd:root,env,encoding:'utf8'}).trim();}
function repo(name:string,preflight:readonly string[]=[]):string {
  const root=join(scratch,name);mkdirSync(root);git(root,'init','-q','-b','main');git(root,'config','user.name','Observer test');git(root,'config','user.email','observer@test');
  writeFileSync(join(root,'.gitignore'),'.ai/\n');writeFileSync(join(root,'source.txt'),'source\n');
  const checks=['tc','a','b','full'].map(id=>({id,kind:'command',command:`test ! -f .ai/harness/runs/fail-${id}`,cwd:'.',phase:preflight.includes(id)?'preflight':'verification',cost:'normal',evidence_policy:'current_exact',necessity:'Test the observer authority boundary',inputs:{env:[]}}));
  writeFileSync(join(root,'plan.md'),'# Observer plan\n\n## Verification Plan\n\n```json\n'+JSON.stringify({protocol:1,checks})+'\n```\n');
  git(root,'add','.');git(root,'commit','-qm','fixture');return root;
}
function create(root:string,task='task',host=hostname()):Key {
  const repository_id=taskRepository(root).repository_id;
  const receipt=newPipeline(store,{source_host:host,repository_id,root,adopt_task:task});return {source_host:host,repository_id,task:receipt.task};
}
function record(key:Key,kind:string,payload:unknown,command_key?:string) {return mutatePipeline(store,key,{op:'record',kind,payload,state_version:store.read(key).state_version,command_key});}
function subject(root:string):Subject {
  const snap=captureGitVirtualTreeSnapshot(root);const authority=verificationContractProvenance(root,'plan.md');
  return {base_sha:git(root,'rev-parse','main'),head_sha:snap.head_commit,tree_digest:snap.snapshot_hash,plan_revision:1,worktree_clean:true,environment:authority.environment,contract_identity:authority.contract_identity,check_set_identity:authority.check_set_identity};
}
function resource(key:Key,root:string) {
  const s=subject(root);record(key,'resource',{resources:{worktree:root,branch:'feature',pr:17,pr_base:'main',pr_base_sha:s.base_sha},subject:s,contract_path:'plan.md',base_ref:'main',policy:{verification:{typecheck:{requirement:'required',check_ids:['tc'],identity:s.contract_identity},affected_tests:{requirement:'required',check_ids:['a','b'],identity:s.contract_identity},full_suite:{requirement:'required',check_ids:['full'],identity:s.contract_identity},check_set_identity:s.check_set_identity,source:'Owner test brief'},stall_thresholds:{}}});return s;
}
function persistedRequest(root:string,task:string,role:string,round=1):{dir:string;request:TaskRequest} {
  const dir=taskSessionDirectory(root,task,role);mkdirSync(dir,{recursive:true});const outbox=join(root,'.ai/harness/runs/task-agent-outbox',basename(dir));mkdirSync(outbox,{recursive:true});
  const proof={pid:process.pid,identity:processIdentity(process.pid)};
  const binding:TaskPaneBinding={protocol:2,repository_id:taskRepository(root).repository_id,execution_root:root,runtime:'herdr',task,role,harness_kind:role==='implement'?'codex':'claude',endpoint:{session:'observer-fixture'},pane_id:'pane-'+role,terminal_id:'terminal-'+role,workspace_id:'workspace',shell:proof,agent_name:'observer-fixture',provider:{...proof,ownership:{disposition:'attached'}},host:null,ownership:{disposition:'attached'},capabilities:harnessCapabilities('codex'),max_requests:20};
  if(!existsSync(join(dir,'binding.json')))writeSessionArtifact(join(dir,'binding.json'),binding);
  const request:TaskRequest={protocol:2,task,role,round,request_id:randomUUID(),context_ref:join(outbox,`context-${round}.txt`),source_ref:join(root,'plan.md'),context_sha256:digest('request context'),result_ref:join(outbox,`result-${round}.json`),result_contract:{required_fields:['request_id','context_sha256','value'],atomic_write:'temp_rename',submission:{command:'repo-harness task-agent result',repo:root,task,role,round}}};
  writeSessionArtifact(join(dir,`request-${round}.json`),request);writeFileSync(request.context_ref,'request context');return {dir,request};
}
function result(request:TaskRequest,value:unknown={outcome:'done'}) {writeSessionArtifact(request.result_ref,{request_id:request.request_id,context_sha256:request.context_sha256,value},false);}
function evidence(root:string,s:Subject,id:string,verdict:Evidence['verdict'],path:string,kind:Evidence['kind']='affected_tests'):Evidence{return {kind,check_id:id,subject:s,source:'verified',authority_ref:null,verdict,reviewer:'codex',path,sha256:digest(readFileSync(path)),execution_order:0,produced_at:new Date().toISOString(),registered_at:new Date().toISOString(),current:true};}
function execute(root:string,name:string) {
  const reportFile=`.ai/harness/runs/${name}.json`;
  const report=executeVerificationContract({repoRoot:root,contractPath:'plan.md',env,reportFile,forceReason:'Observer acceptance'});
  return {report,path:join(root,reportFile)};
}
function cli(args:string[],overrides:NodeJS.ProcessEnv={}) {return spawnSync(process.execPath,[CLI,'pipeline',...args],{env:{...env,...overrides},encoding:'utf8',timeout:20000});}
async function child(script:string,args:string[]=[]) {const proc=spawn(process.execPath,[script,...args],{env,stdio:['ignore','pipe','pipe']});let out='';let err='';proc.stdout.on('data',x=>out+=x);proc.stderr.on('data',x=>err+=x);const code=await new Promise<number|null>(resolve=>proc.on('exit',resolve));return {code,out,err};}
function worker(body:string):string {const path=join(scratch,randomUUID()+'.ts');writeFileSync(path,`import {PipelineStore,exportSnapshot} from ${JSON.stringify(resolve(import.meta.dir,'../../src/effects/pipeline/store.ts'))};\nimport {mutatePipeline,newPipeline} from ${JSON.stringify(resolve(import.meta.dir,'../../src/effects/pipeline/ledger.ts'))};\nimport {ingestEvent} from ${JSON.stringify(resolve(import.meta.dir,'../../src/effects/pipeline/ingest.ts'))};\nimport {writeFileSync,existsSync} from 'fs';\nconst s=new PipelineStore();\n${body}\ns.close();\n`);return path;}

test('A1: six tasks in two real repositories preserve imported and host-scoped identity',()=>{
  const a=repo('a'),b=repo('b');const imported=persistedRequest(a,'imported','implement');
  const keys=[create(a,'same'),create(b,'same'),create(a,'imported'),create(a,'other'),create(b,'other'),create(b,'same','remote')];
  const requestBytes=readFileSync(join(imported.dir,'request-1.json'));const bindingBytes=readFileSync(join(imported.dir,'binding.json'));
  record(keys[2],'request',{role:'implement'},'enroll');
  expect(store.all()).toHaveLength(6);expect(store.read(keys[2]).runs[0].request_id).toBe(imported.request.request_id);
  keys.forEach((key,i)=>record(key,'observation',{kind:'note',source:'operator',data:{index:i}},'same-key'));
  const bound=resource(keys[2],a);record(keys[2],'evidence',{evidence:evidence(a,bound,'plan','pass',join(a,'plan.md'),'plan')});
  const board=readPipelineSnapshot({env});expect(board.cards).toHaveLength(6);
  for(const [i,key] of keys.entries()){expect(store.read(key).observations.filter(o=>o.kind==='note').map(o=>o.data)).toEqual([{index:i}]);const status=readPipelineStatus(key,{env,events:true}) as any;expect(status.record.task.value).toBe(key.task);expect(status.events.every((e:any)=>e.source_host===key.source_host&&e.repository_id===key.repository_id)).toBe(true);}
  const importedCard=board.cards.find(c=>c.source_host===keys[2].source_host&&c.repository_id===digest(keys[2].repository_id)&&c.task===keys[2].task)!;
  const detail=readPipelineStatus(keys[2],{env,evidence:0}) as any;expect(detail.evidence.sha256).toBe(digest(readFileSync(join(a,'plan.md'))));expect(importedCard.evidence).toContainEqual({kind:detail.evidence.kind,source:detail.evidence.source,verdict:detail.evidence.verdict,current:detail.evidence.current,count:1});
  expect(readFileSync(join(imported.dir,'request-1.json'))).toEqual(requestBytes);expect(readFileSync(join(imported.dir,'binding.json'))).toEqual(bindingBytes);
  expect(()=>decodeRecord({...store.read(keys[0]),unknown:true})).toThrow('unknown');
});

test('A2: concurrent CAS commits one writer and receipt replay survives later state',async()=>{
  const key=create(repo('repo'));const input={op:'record' as const,kind:'observation',payload:{kind:'infra_retry',source:'operator',data:{}},state_version:1,command_key:'retry'};
  const path=worker(`const key=${JSON.stringify(key)}; while(!existsSync(process.argv[2])) await Bun.sleep(5);try{console.log(JSON.stringify(mutatePipeline(s,key,${JSON.stringify(input)})))}catch(e){console.log(JSON.stringify({code:e.code}));process.exitCode=e.exit;}`);
  const signal=join(scratch,'go');const one=child(path,[signal]);const two=child(path,[signal]);writeFileSync(signal,'go');const results=await Promise.all([one,two]);
  // Same command keys return the same durable receipt, even under concurrency.
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(store.read(key).counters.infra_retries).toBe(1);
  const first=JSON.parse(results[0].out);record(key,'observation',{kind:'note',source:'operator',data:{}});
  expect(mutatePipeline(store,key,input)).toEqual(first);expect(store.read(key).counters.infra_retries).toBe(1);
  expect(()=>mutatePipeline(store,key,{...input,payload:{kind:'note',source:'operator',data:{}}})).toThrow('different input');
  const raceInput={...input,state_version:store.read(key).state_version,command_key:undefined};
  const race=worker(`while(!existsSync(process.argv[2])) await Bun.sleep(5);try{console.log(JSON.stringify(mutatePipeline(s,${JSON.stringify(key)},${JSON.stringify(raceInput)})))}catch(e){console.log(JSON.stringify({code:e.code}));process.exitCode=e.exit;}`);
  const gate=join(scratch,'race');const r1=child(race,[gate]);const r2=child(race,[gate]);writeFileSync(gate,'go');const outcomes=await Promise.all([r1,r2]);expect(outcomes.map(r=>r.code).sort()).toEqual([0,4]);expect(outcomes.find(r=>r.code===4)?.out).toContain('rev_conflict');
  for(const command of [['new','--source-host','h','--repository-id','r','--title','t'],['ingest-event','--payload','-']]) {const r=cli([...command,'--state-version','1']);expect(r.status).toBe(2);expect(r.stdout).toContain('usage');}
});

test('A3: real process death rolls back record/audit/idem and preserves committed replay',async()=>{
  const key=create(repo('repo'));
  for(const boundary of ['record','audit','idem']) {
    const script=worker(`mutatePipeline(s,${JSON.stringify(key)},{op:'record',kind:'observation',payload:{kind:'infra_retry',source:'operator',data:{}},state_version:1,command_key:'crash'},stage=>{if(stage===${JSON.stringify(boundary)})process.kill(process.pid,'SIGKILL')});`);
    const r=await child(script);expect(r.code).not.toBe(0);expect(store.read(key).state_version).toBe(1);expect(store.db.query('SELECT count(*) n FROM transitions').get()).toEqual({n:1});expect(store.db.query('SELECT count(*) n FROM idem_keys').get()).toEqual({n:0});
  }
  const input={op:'record',kind:'observation',payload:{kind:'infra_retry',source:'operator',data:{}},state_version:1,command_key:'crash'};
  const committed=worker(`mutatePipeline(s,${JSON.stringify(key)},${JSON.stringify(input)},stage=>{if(stage==='commit')process.kill(process.pid,'SIGKILL')});`);await child(committed);
  expect(store.read(key).state_version).toBe(2);expect(store.read(key).counters.infra_retries).toBe(1);expect((mutatePipeline(store,key,input as any)).state_version).toBe(2);
  expect(store.db.query('SELECT count(*) n FROM transitions').get()).toEqual({n:2});expect(store.db.query('SELECT count(*) n FROM idem_keys').get()).toEqual({n:1});
  store.restoreEpoch();expect(store.watermark().epoch).toBe(2);expect(store.read(key).flags_attested).toContain('restore_requires_reverification');expect(store.read(key).state_version).toBe(3);
  store.db.exec('UPDATE metadata SET protocol=99');expect(()=>new PipelineStore({env})).toThrow('Incompatible writer protocol');
});

test('A4: transport and validated-terminal dedupe keep distinct identities and reject foreign artifacts',()=>{
  const root=repo('repo'),key=create(root);const first=persistedRequest(root,key.task,'implement');const second=persistedRequest(root,key.task,'plan');result(first.request);result(second.request);record(key,'request',{role:'implement'});record(key,'request',{role:'plan'});
  const event={source:'herdr',agent_status:'done',...key,role:'implement',round:1,request_id:first.request.request_id,context_sha256:first.request.context_sha256};
  expect(ingestEvent(store,event,{delivery_id:'one'}).status).toBe('observed');expect(ingestEvent(store,event,{delivery_id:'one'}).status).toBe('duplicate');expect(ingestEvent(store,event,{delivery_id:'other'}).status).toBe('duplicate');
  expect(ingestEvent(store,{...event,role:'plan',request_id:second.request.request_id},{delivery_id:'two'}).status).toBe('observed');
  const count=observations(store).filter(o=>o.kind==='result').length;expect(count).toBe(2);
  expect(ingestEvent(store,{agent_status:'done',pane_id:'pane-implement',host:key.source_host,herdr_session:'observer-fixture'},{delivery_id:'weak'}).status).toBe('weak_observation');
  expect(observations(store).at(-1)?.request_id).toBeNull();
  writeSessionArtifact(first.request.result_ref,{request_id:randomUUID(),context_sha256:first.request.context_sha256,value:'done'},false);
  ingestEvent(store,event,{delivery_id:'wrong'});expect(observations(store).at(-1)?.payload.result_state).toBe('invalid');
  writeFileSync(first.request.result_ref,'{bad');ingestEvent(store,event,{delivery_id:'malformed'});expect(observations(store).at(-1)?.payload.result_state).not.toBe('validated');
  writeSessionArtifact(join(first.dir,'request-1.json'),{...first.request,result_ref:second.request.result_ref},false);ingestEvent(store,event,{delivery_id:'foreign'});expect(observations(store).at(-1)?.payload.result_state).toBe('invalid');
});

test('A5: result-first snapshots recover all roles and an enrollment gap without done',()=>{
  const root=repo('repo'),key=create(root);const requests=['plan','plan-review','implement'].map(role=>persistedRequest(root,key.task,role));
  requests.forEach(f=>{result(f.request);record(key,'request',{role:f.request.role});});
  const later=persistedRequest(root,key.task,'implement',2);result(later.request);
  const version=store.read(key).state_version;
  const snapshot={host:key.source_host,herdr_session:'observer-fixture',result:{panes:requests.map(f=>({pane_id:'pane-'+f.request.role,agent_status:'idle',focused:true}))}};
  expect(ingestEvent(store,snapshot,{snapshot:true}).status).toBe('observed');
  expect(store.read(key).state_version).toBe(version);const runs=projectedRuns(store.read(key),observations(store));expect(runs).toHaveLength(4);expect(runs.every(r=>r.result_state==='validated')).toBe(true);
  expect(existsSync(join(requests[0].dir,'collected-1.json'))).toBe(false);
  expect(readPipelineSnapshot({env}).cards[0].runs.every(r=>r.result_state==='validated')).toBe(true);
  const before=readPipelineSnapshot({env}).source_observed_at;ingestEvent(store,snapshot,{snapshot:true});expect(readPipelineSnapshot({env}).source_observed_at[`${key.source_host}:outbox`]>=before[`${key.source_host}:outbox`]).toBe(true);
});

test('A6: original execution provenance admits pass/fail, per-check AND and authority order',()=>{
  const root=repo('repo'),key=create(root);const s=resource(key,root);const passed=execute(root,'pass');
  for(const id of ['a','b'])record(key,'evidence',{evidence:evidence(root,s,id,'pass',passed.path),contract_path:'plan.md'});
  expect(store.read(key).evidence.every(e=>e.source==='verified')).toBe(true);expect(requirementPass(store.read(key),'affected_tests')).toBe(true);
  writeFileSync(join(root,'.ai/harness/runs/fail-b'),'fail');const failed=execute(root,'fail');expect(failed.report.passed).toBe(false);expect(()=>validateMaterializedVerificationExecutionReport({repoRoot:root,contractPath:'plan.md',report:failed.report,env})).toThrow('passing');
  const row=evidence(root,s,'b','fail',failed.path);row.produced_at='2000-01-01T00:00:00.000Z';record(key,'evidence',{evidence:row,contract_path:'plan.md'});
  const stored=store.read(key);expect(stored.evidence.at(-1)?.source).toBe('verified');expect(stored.evidence.at(-1)?.execution_order).toBeGreaterThan(stored.evidence[1].execution_order);expect(requirementPass(stored,'affected_tests')).toBe(false);
  const uncertain=create(root,'attested-only');resource(uncertain,root);
  const attested={...row,sha256:digest('wrong'),execution_order:100};record(uncertain,'evidence',{evidence:attested,contract_path:'plan.md'});expect(store.read(uncertain).evidence.at(-1)?.source).toBe('attested');expect(requirementPass(store.read(uncertain),'affected_tests')).toBe(false);
  rmSync(join(root,'.ai/harness/runs/fail-b'));const restored=execute(root,'restored');for(const id of ['a','b'])record(key,'evidence',{evidence:evidence(root,s,id,'pass',restored.path),contract_path:'plan.md'});
  expect(store.read(key).evidence.at(-1)?.source).toBe('verified');
  expect(requirementPass(store.read(key),'affected_tests')).toBe(true);
  writeFileSync(join(root,'source.txt'),'dirty\n');resource(key,root);expect(store.read(key).evidence.every(e=>!e.current)).toBe(true);expect(requirementPass(store.read(key),'affected_tests')).toBe(false);
});

test('A6: a failed preflight with skipped later checks supersedes the earlier verified pass',()=>{
  const root=repo('preflight',['tc']),key=create(root);const s=resource(key,root);const passed=execute(root,'pass');
  record(key,'evidence',{evidence:evidence(root,s,'tc','pass',passed.path,'typecheck'),contract_path:'plan.md'});expect(requirementPass(store.read(key),'typecheck')).toBe(true);
  writeFileSync(join(root,'.ai/harness/runs/fail-tc'),'fail');const failed=execute(root,'preflight-fail');
  expect(failed.report.status).toBe('failed');expect(failed.report.results.filter(r=>r.execution==='missing').map(r=>r.id)).toEqual(['a','b','full']);
  record(key,'evidence',{evidence:evidence(root,s,'tc','fail',failed.path,'typecheck'),contract_path:'plan.md'});
  const stored=store.read(key);expect(requirementPass(stored,'typecheck')).toBe(false);expect(stored.evidence.at(-1)?.source).toBe('verified');expect(stored.evidence.at(-1)?.execution_order).toBeGreaterThan(stored.evidence[0].execution_order);
});

function mergeReady(key:Key,s:Subject):void {const r=store.read(key);r.phase='merge-ask';r.admission='gate_qualified';r.merge.phase_entry_facts={head_sha:s.head_sha,base_sha:s.base_sha};store.transaction(()=>store.save(r));}
function go(key:Key,s:Subject){return {by:'owner',channel:'chat',ref:'owner-message',pr:17,head_sha:s.head_sha,base_sha:s.base_sha,tree_digest:s.tree_digest,target_branch:'main',provider:'github',repository_id:key.repository_id,merge_method:'squash'};}
test('A7: ask/go/revoke and historical go survive B to M; external merge is an observed fact',()=>{
  const root=repo('repo'),key=create(root),s=resource(key,root);mergeReady(key,s);record(key,'ask',{digest:s.tree_digest});record(key,'go',go(key,s));record(key,'revoke',{reason:'Owner revoked'});expect(store.read(key).merge.owner_approval?.expired).toBe(true);record(key,'go',go(key,s));
  git(root,'commit','--allow-empty','-qm','squash');const merge=git(root,'rev-parse','HEAD');
  record(key,'observation',{kind:'merge_fact',source:'operator',data:{squash_commit:merge,pre_merge_head:s.head_sha,pre_merge_base:s.base_sha,tree_digest:s.tree_digest,method:'squash',observed_at:new Date().toISOString()}});
  mutatePipeline(store,key,{op:'advance',to:'merged',state_version:store.read(key).state_version});expect(store.read(key).merge.owner_approval?.consumed_at).not.toBeNull();expect(store.read(key).merge.owner_approval?.expired).toBe(false);
  git(root,'commit','--allow-empty','-qm','next');resource(key,root);const r=store.read(key);expect(r.merge.owner_approval?.expired).toBe(false);expect(r.merge.owner_approval?.consumed_at).not.toBeNull();expect(()=>advanceRecord(r,'implement')).toThrow('not allowed');
  const other=create(root,'external');record(other,'external-merge',{squash_commit:merge,pre_merge_head:s.head_sha,pre_merge_base:s.base_sha,tree_digest:s.tree_digest,method:'squash',observed_at:new Date().toISOString()});expect(store.read(other).phase).toBe('merged');expect(store.read(other).admission).toBe('observed');expect(store.read(other).merge.external_merge?.approval_not_recorded).toBe(true);expect(store.read(other).merge.external_merge?.confirmed_deviation).toBe(false);
});

test('A8: notes and go do not refresh source ages; partial and failed refresh retain times',async()=>{
  const root=repo('repo'),key=create(root),s=resource(key,root);const before=readPipelineSnapshot({env});record(key,'observation',{kind:'note',source:'operator',data:{}});mergeReady(key,s);record(key,'go',go(key,s));expect(readPipelineSnapshot({env}).source_observed_at).toEqual(before.source_observed_at);
  const remote=create(root,'remote','unreachable');record(remote,'observation',{kind:'session',source:'registration',data:{role:'implement'}});ingestEvent(store,{host:hostname(),herdr_session:'observer-fixture',result:{panes:[]}},{snapshot:true});expect(readPipelineSnapshot({env}).status).toBe('partial');expect(readPipelineSnapshot({env}).source_observed_at[`${hostname()}:git`]).toBe(before.source_observed_at[`${hostname()}:git`]);
  const detail=readPipelineStatus(key,{env,events:true,limit:1}) as any;expect(detail.events).toHaveLength(1);expect(detail.record.merge.owner_approval.attested).toBe(true);
  const stale=readPipelineSnapshot({env,now:new Date(Date.now()+600000)});expect(stale.status).toBe('stale');
  const pointer=snapshotPointerPath(store.path);const good=readFileSync(pointer);writeFileSync(pointer,'bad');expect(readPipelineSnapshot({env}).status).toBe('unavailable');writeFileSync(pointer,good);
});

test('A9: pinned snapshot and GET/HEAD paths never open or change live WAL files',async()=>{
  const root=repo('repo'),key=create(root);const path=store.path;const before=readdirSync(join(scratch,'store')).sort();const wal=readFileSync(path+'-wal');const live=readFileSync(path);
  const board=readPipelineSnapshot({env});readPipelineStatus(key,{env});expect(readFileSync(path+'-wal')).toEqual(wal);expect(readFileSync(path)).toEqual(live);expect(readdirSync(join(scratch,'store')).sort()).toEqual(before);
  const readerScript=join(scratch,'repo-harness');writeFileSync(readerScript,`#!/bin/sh\nexec '${process.execPath}' '${CLI}' "$@"\n`);chmodSync(readerScript,0o700);const server=await startOperatorServer({port:0,static_root:scratch,env:{...env,PATH:scratch+':'+env.PATH}});
  try{for(const method of ['GET','HEAD']) {const response=await fetch(server.url+'/api/v1/pipelines',{method});expect(response.status).toBe(200);if(method==='GET'){const body=await response.text();expect(body).not.toContain(root);expect(JSON.parse(body).commit_seq).toBe(board.commit_seq);}}
    for(const method of ['POST','PUT','PATCH','DELETE'])expect((await fetch(server.url+'/api/v1/pipelines',{method})).status).toBe(405);
    expect((await fetch(server.url+'/api/v1/pipelines?task=unsafe')).status).toBe(400);
  }finally{await server.close();}
  expect(readFileSync(path+'-wal')).toEqual(wal);expect(OPERATOR_ROUTES.find(r=>r.id==='pipelines')?.write).toBe(false);
});

test('A10/A14: unavailable authority and missing D never create a fallback or alter existing workflow paths',()=>{
  const missing=join(scratch,'missing','db');expect(()=>new PipelineStore({env:{...env,REPO_HARNESS_PIPELINES_AUTHORITY_HOST:'another-host',REPO_HARNESS_PIPELINES_DB:missing}})).toThrow('authority host');expect(existsSync(missing)).toBe(false);
  let mounted=false;try{mounted=statSync('/Volumes/D').dev!==statSync('/Volumes').dev;}catch{}
  if(mounted)throw new Error('A14 requires unmounted D. Refuse to create a test database on the real volume.');
  const r=cli(['new','--source-host','max','--repository-id','/repo/.git','--title','one'],{REPO_HARNESS_PIPELINES_DB:'/Volumes/D/repo-harness/pipelines/pipelines.db'});expect(r.status).toBe(3);expect(r.stdout).toContain('volume_unavailable');expect(readPipelineSnapshot({env:{...env,REPO_HARNESS_PIPELINES_DB:missing}}).status).toBe('unavailable');expect(existsSync(missing)).toBe(false);
  for(const version of ['3.51.0','unknown','3.50.6'])expect(()=>assertSQLiteVersion(version)).toThrow();for(const version of ['3.51.3','3.50.7','3.44.6','3.53.4'])expect(()=>assertSQLiteVersion(version)).not.toThrow();
  for(const file of ['src/effects/terminal/task-session.ts','src/effects/terminal/herdr.ts','src/effects/publication/merge-readiness.ts'])expect(readFileSync(resolve(import.meta.dir,'../..',file),'utf8')).not.toMatch(/from ['"].*pipeline/);
});

test('A11: post-commit export failure preserves receipt; later export catches up',()=>{
  const key=create(repo('repo'));const pointerPath=snapshotPointerPath(store.path);const good=readFileSync(pointerPath);const old=JSON.parse(good.toString());writeFileSync(pointerPath,'corrupt');
  const input={op:'record' as const,kind:'observation',payload:{kind:'infra_retry',source:'operator',data:{}},state_version:1,command_key:'lost'};const receipt=mutatePipeline(store,key,input);expect(receipt.state_version).toBe(2);expect(store.read(key).counters.infra_retries).toBe(1);expect(mutatePipeline(store,key,input)).toEqual(receipt);
  writeFileSync(pointerPath,good);const stale=readPipelineSnapshot({env,now:new Date(Date.now()+600000)});expect(stale.commit_seq).toBe(old.commit_seq);expect(stale.status).toBe('stale');exportSnapshot(store);expect(readPipelineSnapshot({env}).commit_seq).toBe(receipt.commit_seq);
});

test('A12: killed and concurrent exporters only publish complete monotonic immutable generations',async()=>{
  const key=create(repo('repo'));const pointerPath=snapshotPointerPath(store.path);const old=readFileSync(pointerPath);const pinned=openSnapshot(pointerPath);const pinnedBytes=readFileSync(join(join(scratch,'store'),pinned.pointer.file));
  const mutation=worker(`mutatePipeline(s,${JSON.stringify(key)},{op:'record',kind:'observation',payload:{kind:'note',source:'operator',data:{}},state_version:1},stage=>{if(stage==='commit')process.kill(process.pid,'SIGKILL')});`);await child(mutation);
  const killed=worker(`exportSnapshot(s,undefined,stage=>{if(stage==='copied')process.kill(process.pid,'SIGKILL')});`);expect((await child(killed)).code).not.toBe(0);expect(readFileSync(pointerPath)).toEqual(old);
  const exporter=worker(`console.log(JSON.stringify(exportSnapshot(s)));`);const result=await Promise.all([child(exporter),child(exporter)]);expect(result.map(r=>r.code)).toEqual([0,0]);const pointer=JSON.parse(readFileSync(pointerPath,'utf8'));expect(pointer.commit_seq).toBe(store.watermark().commit_seq);expect(result.map(r=>JSON.parse(r.out).file)).toEqual([pointer.file,pointer.file]);
  expect(pinned.db.query('SELECT state_version FROM pipelines').get()).toEqual({state_version:1});expect(readFileSync(join(join(scratch,'store'),pinned.pointer.file))).toEqual(pinnedBytes);pinned.db.close();
});

test('A13: a real source CLI channel checks provenance; labels and mismatched host bundles stay attested',()=>{
  const root=repo('repo'),key=create(root,'remote','source-a');const local=subject(root);const query:AuthorityQuery={key,root,kind:'subject',payload:{subject:local,contract_path:'plan.md',base_ref:'main'}};
  const channel=join(scratch,'channel.ts');writeFileSync(channel,`process.env.REPO_HARNESS_PIPELINES_SOURCE_HOST='source-a';const {validateOnSource}=await import(${JSON.stringify(resolve(import.meta.dir,'../../src/effects/pipeline/authority.ts'))});let query=await Bun.stdin.json();console.log(JSON.stringify(validateOnSource(query)));`);
  const channelEnv={...env,REPO_HARNESS_PIPELINES_SOURCE_HOST:'mini',REPO_HARNESS_PIPELINES_SOURCE_COMMANDS:JSON.stringify({'source-a':[process.execPath,channel]})};
  const actual=sourceAuthority(query,channelEnv);expect(actual?.source_host).toBe('source-a');expect(actual?.subject?.head_sha).toBe(local.head_sha);
  const sourceStore=new PipelineStore({env:channelEnv});try{
    const r=sourceStore.read(key);mutatePipeline(sourceStore,key,{op:'record',kind:'resource',state_version:r.state_version,payload:{resources:{branch:'feature'},subject:local,contract_path:'plan.md',base_ref:'main'}});
    const plan=evidence(root,local,'plan','pass',join(root,'plan.md'),'plan');record(key,'evidence',{evidence:plan});expect(store.read(key).evidence.at(-1)?.source).toBe('attested');
    mutatePipeline(sourceStore,key,{op:'record',kind:'evidence',state_version:store.read(key).state_version,payload:{evidence:plan}});expect(store.read(key).evidence.at(-1)?.source).toBe('verified');
    writeFileSync(channel,`process.env.REPO_HARNESS_PIPELINES_SOURCE_HOST='source-a';const {validateOnSource}=await import(${JSON.stringify(resolve(import.meta.dir,'../../src/effects/pipeline/authority.ts'))});let q=await Bun.stdin.json();let b=validateOnSource(q);b.source_host='foreign';console.log(JSON.stringify(b));`);
    expect(sourceAuthority(query,channelEnv)).toBeNull();
    expect(sourceAuthority(query,{...channelEnv,REPO_HARNESS_PIPELINES_SOURCE_COMMANDS:'{}'})).toBeNull();
  }finally{sourceStore.close();}
  const alias=create(root,'remote','source-b');record(alias,'observation',{kind:'note',source:'operator',data:{}});expect(store.read(key).source_host).toBe('source-a');expect(store.read(alias).source_host).toBe('source-b');
});

test('A15: ingest-only and cross-task commits publish their exact store-wide watermark and observation log',()=>{
  const root=repo('repo'),one=create(root,'one'),two=create(root,'two');const version=store.read(one).state_version;const old=readPipelineSnapshot({env}).commit_seq!;
  ingestEvent(store,{agent_status:'done',pane_id:'unknown'},{delivery_id:'notice'});const after=readPipelineSnapshot({env});expect(after.commit_seq).toBeGreaterThan(old);expect(store.read(one).state_version).toBe(version);
  const snapshot=openSnapshot(snapshotPointerPath(store.path));try{expect(snapshot.db.query('SELECT count(*) n FROM observations').get()).toEqual({n:1});expect(snapshot.db.query('SELECT commit_seq FROM metadata').get()).toEqual({commit_seq:after.commit_seq});}finally{snapshot.db.close();}
  const r1=record(one,'observation',{kind:'note',source:'operator',data:{}}),r2=record(two,'observation',{kind:'note',source:'operator',data:{}});expect(r2.commit_seq).toBe(r1.commit_seq+1);expect(r1.state_version).toBe(r2.state_version);expect(readPipelineSnapshot({env}).commit_seq).toBe(r2.commit_seq);
});

// This walks the shipped phase gates with source-owned typed review results,
// actual verification executions, and the original result authority.
test('A6/A7: complete phase path uses current plan, typed cross review and all checks',()=>{
  const root=repo('path'),key=create(root),s=resource(key,root);
  const policy=store.read(key).policy;policy.verification.plan_review={requirement:'required',check_ids:['pr'],identity:s.contract_identity};policy.verification.cross_review={requirement:'required',check_ids:['cr'],identity:s.contract_identity};record(key,'resource',{policy});
  record(key,'evidence',{evidence:evidence(root,s,'plan','pass',join(root,'plan.md'),'plan')});
  const advance=(to:any)=>mutatePipeline(store,key,{op:'advance',to,state_version:store.read(key).state_version});advance('plan-review');
  const review=(role:string,id:string,kind:Evidence['kind'])=>{
    const f=persistedRequest(root,key.task,role);result(f.request,{kind:'pipeline_review',subject:s,check_id:id,verdict:'pass',reviewer:'claude',plan_digest:s.contract_identity});record(key,'request',{role});
    const e=evidence(root,s,id,'pass',f.request.result_ref,kind);e.reviewer='claude';record(key,'evidence',{evidence:e,request:{role,round:1},relations:kind==='plan_review'?[{rel:'reviews',from:store.read(key).evidence.length,to:0}]:[]});
  };
  review('plan-review','pr','plan_review');advance('implement');const worker=persistedRequest(root,key.task,'implement');result(worker.request);record(key,'request',{role:'implement'});ingestEvent(store,{host:hostname(),herdr_session:'observer-fixture',result:{panes:[]}},{snapshot:true});advance('cross-review');review('cross-review','cr','cross_review');advance('test');
  const run=execute(root,'phase-path');for(const [id,kind] of [['tc','typecheck'],['a','affected_tests'],['b','affected_tests'],['full','full_suite']] as const)record(key,'evidence',{evidence:evidence(root,s,id,'pass',run.path,kind),contract_path:'plan.md'});
  advance('merge-ask');record(key,'ask',{digest:s.tree_digest});record(key,'go',go(key,s));git(root,'commit','--allow-empty','-qm','squash');const merged=git(root,'rev-parse','HEAD');record(key,'observation',{kind:'merge_fact',source:'operator',data:{squash_commit:merged,pre_merge_head:s.head_sha,pre_merge_base:s.base_sha,tree_digest:s.tree_digest,method:'squash',observed_at:new Date().toISOString()}});advance('merged');
  expect(store.read(key).merge.owner_approval?.consumed_at).not.toBeNull();expect(store.read(key).merge.squash_commit).toBe(merged);expect(existsSync(root)).toBe(true);
  expect(()=>advance('cleanup')).toThrow('checklist');
});

test('A6: base, plan and environment movement expire unconsumed evidence and approval',()=>{
  const root=repo('movement'),key=create(root),s=resource(key,root);const report=execute(root,'subject');record(key,'evidence',{evidence:evidence(root,s,'a','pass',report.path),contract_path:'plan.md'});mergeReady(key,s);record(key,'go',go(key,s));
  git(root,'commit','--allow-empty','-qm','base movement');resource(key,root);expect(store.read(key).evidence[0].current).toBe(false);expect(store.read(key).merge.owner_approval?.expired).toBe(true);
  writeFileSync(join(root,'plan.md'),readFileSync(join(root,'plan.md'),'utf8')+'\nPlan revision two.\n');git(root,'add','plan.md');git(root,'commit','-qm','plan moved');const moved=resource(key,root);expect(moved.contract_identity).not.toBe(s.contract_identity);expect(requirementPass(store.read(key),'affected_tests')).toBe(false);
  const claimed={...moved,environment:'caller-supplied'};record(key,'resource',{subject:claimed,contract_path:'plan.md',base_ref:'main'});expect(currentSubject(store.read(key))?.environment).not.toBe('caller-supplied');
});

test('A3: restored store refuses new writes until original sources are reverified',async()=>{
  const {reverifyRestoredStore}=await import('../../src/effects/pipeline/ledger');const root=repo('restore'),key=create(root);resource(key,root);store.restoreEpoch();expect(()=>record(key,'observation',{kind:'note',source:'operator',data:{}})).toThrow('Reverify');reverifyRestoredStore(store);record(key,'observation',{kind:'note',source:'operator',data:{}});expect(store.read(key).flags_attested).not.toContain('restore_requires_reverification');expect(store.watermark().epoch).toBe(2);
});

test('A3: ingest observation and delivery receipt remain atomic across process death',async()=>{
  for(const stage of ['observations','receipt']) {
    const script=worker(`ingestEvent(s,{agent_status:'done',pane_id:'unknown'},{delivery_id:'crash'},stage=>{if(stage===${JSON.stringify(stage)})process.kill(process.pid,'SIGKILL')});`);
    await child(script);expect(store.db.query('SELECT count(*) n FROM observations').get()).toEqual({n:0});expect(store.db.query('SELECT count(*) n FROM ingest_receipts').get()).toEqual({n:0});expect(store.watermark().commit_seq).toBe(0);
  }
  const committed=worker(`ingestEvent(s,{agent_status:'done',pane_id:'unknown'},{delivery_id:'crash'},stage=>{if(stage==='commit')process.kill(process.pid,'SIGKILL')});`);await child(committed);expect(store.db.query('SELECT count(*) n FROM observations').get()).toEqual({n:1});expect(store.db.query('SELECT count(*) n FROM ingest_receipts').get()).toEqual({n:1});expect(ingestEvent(store,{agent_status:'done',pane_id:'unknown'},{delivery_id:'crash'}).status).toBe('duplicate');expect(store.watermark().commit_seq).toBe(1);
});

test('A6: a real timed-out execution is verified incomplete and cannot pass admission',()=>{
  const root=repo('timeout'),key=create(root);const plan=readFileSync(join(root,'plan.md'),'utf8').replaceAll('test ! -f .ai/harness/runs/fail-', 'sleep 1 # ');writeFileSync(join(root,'plan.md'),plan);git(root,'add','plan.md');git(root,'commit','-qm','timeout input');const s=resource(key,root);
  const reportFile='.ai/harness/runs/incomplete.json';const output=executeVerificationContract({repoRoot:root,contractPath:'plan.md',env,timeoutMs:100,reportFile,forceReason:'Test incomplete authority'});expect(output.results[0].timed_out).toBe(true);record(key,'evidence',{evidence:evidence(root,s,'tc','incomplete',join(root,reportFile),'typecheck'),contract_path:'plan.md'});expect(store.read(key).evidence[0].source).toBe('verified');expect(requirementPass(store.read(key),'typecheck')).toBe(false);
});

test('A9/A13: list pins one generation and source CLI rejects mismatched selectors',async()=>{
  const {readPipelineListView}=await import('../../src/effects/pipeline/read');const root=repo('selectors'),key=create(root);record(key,'observation',{kind:'note',source:'operator',data:{}});const listed=readPipelineListView(env) as any;expect(listed.records[0].state_version).toBe(listed.cards[0].state_version);expect(listed.records[0].repository_id).toBe(key.repository_id);expect(listed.commit_seq).toBe(store.watermark().commit_seq);
  const query={key,root,kind:'subject',payload:{subject:subject(root),contract_path:'plan.md',base_ref:'main'}};const input=join(scratch,'query.json');writeFileSync(input,JSON.stringify(query));const wrong=cli(['record','--validate-only','--source-host',key.source_host,'--repository-id',key.repository_id,'--task','foreign','--kind','subject','--payload',input]);expect(wrong.status).toBe(2);expect(wrong.stdout).toContain('selectors');
});

test('F3/F9: restore preserves the inbox and unavailable records cannot stop unrelated writes',async()=>{
  const {reverifyRestoredStore}=await import('../../src/effects/pipeline/ledger');const root=repo('partial-restore'),good=create(root,'good'),unknown=create(root,'unknown');resource(good,root);
  const pending=persistedRequest(root,good.task,'implement');result(pending.request);record(good,'request',{role:'implement'});ingestEvent(store,{host:hostname(),herdr_session:'observer-fixture',result:{panes:[]}},{snapshot:true});
  ingestEvent(store,{pane_id:'unclaimed'},{delivery_id:'inbox-before-restore'});const before=observations(store).filter(o=>o.kind==='unclaimed');
  store.restoreEpoch();expect(projectedRuns(store.read(good),observations(store))[0].result_state).toBe('present_unvalidated');expect(observations(store).filter(o=>o.kind==='unclaimed')).toEqual(before);expect(ingestEvent(store,{pane_id:'unclaimed'},{delivery_id:'inbox-before-restore'}).status).toBe('duplicate');
  reverifyRestoredStore(store);expect(store.read(unknown).flags_attested).toContain('restore_source_unavailable');expect(store.read(unknown).admission).toBe('observed');expect(projectedRuns(store.read(good),observations(store))[0].result_state).toBe('validated');
  record(good,'observation',{kind:'note',source:'operator',data:{}});create(root,'after-restore');expect(()=>mutatePipeline(store,unknown,{op:'advance',to:'plan-review',state_version:store.read(unknown).state_version})).toThrow('Current verified plan');
});

test('F4: late external merge facts preserve cleanup and abandoned terminal positions',()=>{
  const root=repo('terminal'),s=subject(root);
  for(const phase of ['cleanup','abandoned'] as const){const receipt=newPipeline(store,{source_host:hostname(),repository_id:taskRepository(root).repository_id,root,adopt_task:phase,backfill:true,phase,note:'Historical terminal state is attested'});const key={source_host:hostname(),repository_id:taskRepository(root).repository_id,task:receipt.task};record(key,'external-merge',{squash_commit:s.head_sha,pre_merge_head:s.head_sha,pre_merge_base:s.base_sha,tree_digest:s.tree_digest,method:'squash',observed_at:new Date().toISOString()});expect(store.read(key).phase).toBe(phase);expect(store.read(key).merge.external_merge?.source).toBe('attested');expect(store.read(key).observations.at(-1)?.kind).toBe('external_merge');}
});

test('F5: unchanged exports create no copy and failed unpublished builds remove only their own file',async()=>{
  const key=create(repo('export-cleanup'));const directory=join(scratch,'store'),pointer=snapshotPointerPath(store.path);const before=readdirSync(directory).sort();exportSnapshot(store);exportSnapshot(store);expect(readdirSync(directory).sort()).toEqual(before);
  const mutation=worker(`mutatePipeline(s,${JSON.stringify(key)},{op:'record',kind:'observation',payload:{kind:'note',source:'operator',data:{}},state_version:1},stage=>{if(stage==='commit')process.kill(process.pid,'SIGKILL')});`);await child(mutation);const current=readdirSync(directory).sort();const oldPointer=readFileSync(pointer);
  expect(()=>exportSnapshot(store,undefined,stage=>{if(stage==='verified')throw new Error('Interrupted verified build');})).toThrow('Interrupted');expect(readdirSync(directory).sort()).toEqual(current);expect(readFileSync(pointer)).toEqual(oldPointer);
  let loserFileCount=0;const published=exportSnapshot(store,undefined,stage=>{if(stage==='verified'){const winner=exportSnapshot(store);expect(winner.commit_seq).toBe(store.watermark().commit_seq);loserFileCount=readdirSync(directory).filter(name=>name.startsWith('.pipeline-')).length;}});expect(readdirSync(directory).filter(name=>name.startsWith('.pipeline-'))).toHaveLength(loserFileCount-1);expect(openSnapshot(pointer).pointer.file).toBe(published.file);
});

test('F2: matching remote subject and digest cannot hide changed evidence identity or verdict',()=>{
  const root=repo('evidence-channel'),key=create(root,'channel','source-a'),s=subject(root);const declared=evidence(root,s,'plan','pass',join(root,'plan.md'),'plan');const query:AuthorityQuery={key,root,kind:'evidence',payload:{evidence:declared}};const channel=join(scratch,'identity-channel.ts');
  const channelEnv={...env,REPO_HARNESS_PIPELINES_SOURCE_HOST:'mini',REPO_HARNESS_PIPELINES_SOURCE_COMMANDS:JSON.stringify({'source-a':[process.execPath,channel]})};
  for(const [field,value] of [['verdict','fail'],['check_id','foreign'],['kind','cross_review'],['reviewer','owner'],['path','/foreign/report']] as const){
    writeFileSync(channel,`process.env.REPO_HARNESS_PIPELINES_SOURCE_HOST='source-a';const {validateOnSource}=await import(${JSON.stringify(resolve(import.meta.dir,'../../src/effects/pipeline/authority.ts'))});const {digest}=await import(${JSON.stringify(resolve(import.meta.dir,'../../src/core/pipeline/types.ts'))});let q=await Bun.stdin.json();let b=validateOnSource(q);b.output.evidence[${JSON.stringify(field)}]=${JSON.stringify(value)};const {sha256,...envelope}=b;b.sha256=digest(JSON.stringify(envelope));console.log(JSON.stringify(b));`);
    expect(sourceAuthority(query,channelEnv)).toBeNull();
  }
});

test('ungated blocked return and rework remain observed rather than qualified',()=>{
  const root=repo('admission'),key=create(root);mutatePipeline(store,key,{op:'advance',to:'blocked',reason:'Observed wait',state_version:1});mutatePipeline(store,key,{op:'advance',to:'plan',state_version:2});expect(store.read(key).admission).toBe('observed');
  const imported=newPipeline(store,{source_host:hostname(),repository_id:key.repository_id,root,adopt_task:'rework',backfill:true,phase:'cross-review',note:'Historical position is attested'});const retry={...key,task:imported.task};mutatePipeline(store,retry,{op:'advance',to:'implement',reason:'Recorded rework',state_version:1});expect(store.read(retry).admission).toBe('observed');expect(store.read(retry).counters.fix_loops).toBe(1);
});
