import { basename } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { decodeEvidence, decodePolicy, decodeSubject, digest, keyOf, object, PHASES, PipelineError, text, wire, type Key, type Phase, type PipelineRecord, type Run } from '../../core/pipeline/types';
import { advanceRecord } from '../../core/pipeline/stage-machine';
import { currentSubject, refreshValidity } from '../../core/pipeline/gates';
import { sourceAuthority, evidenceAdmission } from './authority';
import { observations, projectedRuns } from './ingest';
import { PipelineStore, publishAfterCommit } from './store';

export interface Receipt {status:'already_applied';source_host:string;repository_id:string;task:string;state_version:number;commit_seq:number;epoch:number;at:string}
export type MutationBoundary=(stage:'record'|'audit'|'idem'|'commit'|'response')=>void;
export function replay(store:PipelineStore,key:Key,commandKey:string|undefined,hash:string):Receipt|null {
  if(!commandKey) return null;
  const row=store.db.query('SELECT request_hash,response FROM idem_keys WHERE source_host=? AND repository_id=? AND task=? AND command_key=?').get(key.source_host,key.repository_id,key.task,commandKey) as {request_hash:string;response:string}|null;
  if(!row) return null;
  if(row.request_hash!==hash) throw new PipelineError('idem_conflict',4,'Command key has different input');
  return JSON.parse(row.response);
}
function receipt(store:PipelineStore,key:Key,version:number):Receipt {return {status:'already_applied',...key,state_version:version,...store.bump(),at:new Date().toISOString()};}
function remember(store:PipelineStore,key:Key,commandKey:string|undefined,kind:string,hash:string,result:Receipt):void {
  if(commandKey) store.db.query('INSERT INTO idem_keys VALUES(?,?,?,?,?,?,?,?,?)').run(key.source_host,key.repository_id,key.task,commandKey,kind,hash,JSON.stringify(result),result.state_version,result.at);
}
const generatedTask=(repo:string,title:string)=>`pl-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${new Date().toISOString().slice(11,16).replace(':','')}-${repo}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40)||'task'}-${randomUUID().slice(0,4)}`;
export function newPipeline(store:PipelineStore,input:{source_host:string;repository_id:string;title?:string;adopt_task?:string;root?:string;brief?:string;issue?:number;backfill?:boolean;phase?:Phase;note?:string;idem_key?:string},boundary?:MutationBoundary):Receipt {
  text(input.source_host,'source-host');text(input.repository_id,'repository-id');
  if(!input.title&&!input.adopt_task) throw new PipelineError('usage',2,'title or adopt-task is required');
  if(input.phase && !PHASES.includes(input.phase)) throw new PipelineError('usage',2,'Unknown phase');
  if(input.backfill && !input.note) throw new PipelineError('usage',2,'Backfill requires a note');
  const hash=digest(wire({...input,idem_key:undefined}));
  // Creation keys use their own namespace. The mapping and created task are atomic.
  const createKey={source_host:input.source_host,repository_id:input.repository_id,task:''};
  const cached=replay(store,createKey,input.idem_key,hash);if(cached){publishAfterCommit(store);return cached;}store.assertWritable();
  const now=new Date().toISOString();const repo=basename(input.root??input.repository_id.replace(/\/\.git$/,''));
  const task=input.adopt_task??generatedTask(repo,input.title!);const key={source_host:input.source_host,repository_id:input.repository_id,task};
  const brief=input.brief?sourceAuthority({key,root:input.root??null,kind:'brief',payload:{path:input.brief}},store.env):null;
  const unknown=digest('unmapped');
  const record:PipelineRecord={schema_version:'repo-harness.pipeline-record.v2',id:task,source_host:key.source_host,repository_id:key.repository_id,state_version:1,created_at:now,updated_at:now,host:hostname(),owner_bot:'unassigned',repo:{id:repo,root:input.root??null},task:{value:task,title:input.title??task,issue:input.issue??null,acceptance:input.note??'',source_ref:brief?.output.source_ref??null},phase:input.backfill?input.phase??'plan':'plan',admission:'attested_only',phase_since:now,blocked:null,next_action:null,runs:[],counters:{attempts:{},infra_retries:0,fix_loops:0,review_rounds:{},problem_fingerprints:[]},evidence:[],relations:[],merge:{phase_entry_facts:null,ask:null,owner_approval:null,external_merge:null,squash_commit:null,merge_seal_sha256:null},resources:{worktree:null,branch:null,pr:null,pr_base:null,pr_base_sha:null},policy:{verification:{typecheck:{requirement:'required',check_ids:['unmapped:typecheck'],identity:unknown},affected_tests:{requirement:'required',check_ids:['unmapped:affected_tests'],identity:unknown},full_suite:{requirement:'required',check_ids:['unmapped:full_suite'],identity:unknown},check_set_identity:unknown,source:'Unmapped. The owner brief requires typecheck, affected tests and one serial full suite.'},stall_thresholds:{}},observations:[],flags_attested:['policy_unmapped',...(input.brief&&!brief?['brief_unavailable']:[])]};
  const result=store.transaction(()=>{
    const duplicate=replay(store,createKey,input.idem_key,hash);if(duplicate)return duplicate;store.assertWritable();
    const exists=store.db.query('SELECT 1 FROM pipelines WHERE source_host=? AND repository_id=? AND task=?').get(key.source_host,key.repository_id,key.task);
    if(exists) throw new PipelineError('rev_conflict',4,'Task is already registered',true);
    store.save(record);boundary?.('record');store.audit(key,'new',null,record.phase,input);boundary?.('audit');
    const value=receipt(store,key,1);remember(store,createKey,input.idem_key,'new',hash,value);boundary?.('idem');return value;
  });
  boundary?.('commit');publishAfterCommit(store);boundary?.('response');return result;
}
function enroll(record:PipelineRecord,runs:Run[]):void {
  for(const run of runs) {
    if(run.task!==record.task.value||run.source_host!==record.source_host) throw new PipelineError('request_identity',2,'Run parent does not match');
    const old=record.runs.find(r=>r.role===run.role&&r.round===run.round);
    if(old) {if(old.request_id!==run.request_id||old.context_sha256!==run.context_sha256) throw new PipelineError('request_identity',4,'Run identity changed');continue;}
    record.runs.push(run);record.counters.attempts[run.role]=(record.counters.attempts[run.role]??0)+1;
  }
}
function observeSubject(store:PipelineStore,record:PipelineRecord,payload:Record<string,any>) {
  const bundle=sourceAuthority({key:keyOf(record),root:record.repo.root,kind:'subject',payload},store.env);
  const subject=bundle?.subject??null;
  return {kind:'subject',source:'git',observed_at:new Date().toISOString(),data:{...payload,subject,quality:subject?'verified':'unavailable'}};
}
function prepareRecord(store:PipelineStore,record:PipelineRecord,kind:string,payload:Record<string,any>,reconcile:boolean):()=>void {
  const now=new Date().toISOString();
  if(kind==='resource') {
    if(payload.policy) decodePolicy(payload.policy);
    const observed=payload.subject?observeSubject(store,record,{subject:decodeSubject(payload.subject),contract_path:text(payload.contract_path,'contract_path'),base_ref:text(payload.base_ref,'base_ref')}):null;
    return ()=>{if(payload.resources) record.resources={...record.resources,...object(payload.resources)};
      if(payload.policy){record.policy=payload.policy;record.flags_attested=record.flags_attested.filter(f=>f!=='policy_unmapped');}
      if(observed)record.observations.push(observed);
      if(observed||payload.resources)refreshValidity(record,currentSubject(record));
      if(payload.relations) record.relations.push(...payload.relations);
    };
  }
  if(kind==='request') {
    const bundle=sourceAuthority({key:keyOf(record),root:record.repo.root,kind:'enroll',payload:{role:text(payload.role,'role')}},store.env);
    if(!bundle) throw new PipelineError('source_unavailable',3,'Cannot enroll requests from the source host');
    const runs=bundle.output.runs as Run[];
    if(!reconcile && payload.round!==undefined && !runs.some(r=>r.round===payload.round)) throw new PipelineError('request_identity',2,'Persisted request round is absent');
    return ()=>{if(!record.observations.some(o=>o.kind==='session'&&o.data.role===payload.role))record.observations.push({kind:'session',source:'registration',observed_at:now,data:{role:payload.role}});enroll(record,reconcile?runs:runs.filter(r=>payload.round===undefined||r.round===payload.round));record.observations.push({kind:'enrollment',source:'outbox',observed_at:now,data:{registration_incomplete:bundle.output.registration_incomplete,errors:bundle.output.errors}});};
  }
  if(kind==='evidence') {
    const e=decodeEvidence(payload.evidence);const admitted=evidenceAdmission({...record,runs:projectedRuns(record,observations(store))},{...payload,evidence:e},store.env);
    return ()=>{record.evidence.push(admitted);refreshValidity(record,currentSubject(record));if(payload.relations)record.relations.push(...payload.relations);};
  }
  if(kind==='ask') return ()=>{if(record.phase!=='merge-ask'||record.merge.external_merge)throw new PipelineError('transition_not_allowed',7,'Ask is pre-merge only');record.merge.ask={at:now,digest:text(payload.digest,'digest')};};
  if(kind==='go') return ()=>{
    if(record.phase!=='merge-ask'||record.merge.external_merge) throw new PipelineError('transition_not_allowed',7,'Go is pre-merge only');
    const subject=currentSubject(record);
    if(!subject||payload.head_sha!==subject.head_sha||payload.base_sha!==subject.base_sha||payload.tree_digest!==subject.tree_digest||payload.repository_id!==record.repository_id||payload.pr!==record.resources.pr||payload.target_branch!==record.resources.pr_base) throw new PipelineError('gate_not_satisfied',5,'Approval does not match the candidate');
    record.merge.owner_approval={...payload,at:now,validity:'exact_candidate',attested:true,expired:false,expired_reason:null,consumed_at:null} as PipelineRecord['merge']['owner_approval'];
  };
  if(kind==='revoke') return ()=>{if(record.merge.owner_approval?.consumed_at)throw new PipelineError('transition_not_allowed',7,'Historical go cannot be revoked');if(record.merge.owner_approval){record.merge.owner_approval.expired=true;record.merge.owner_approval.expired_reason=text(payload.reason,'reason');}};
  if(kind==='external-merge') return ()=>{
    const fact={...payload,source:'attested' as const,approval_not_recorded:!record.merge.owner_approval,confirmed_deviation:false};
    record.merge.external_merge=fact as PipelineRecord['merge']['external_merge'];record.merge.squash_commit=text(payload.squash_commit,'squash_commit');
    if(record.phase!=='cleanup'&&record.phase!=='abandoned'){record.phase='merged';record.phase_since=now;record.admission='observed';}
    else record.observations.push({kind:'external_merge',source:'operator',observed_at:now,data:fact});
  };
  if(kind==='observation') return ()=>{
    const o={kind:text(payload.kind,'kind'),source:text(payload.source,'source'),observed_at:now,data:object(payload.data)};
    if(o.kind==='subject'||o.kind==='enrollment') throw new PipelineError('usage',2,'Use source reconciliation for authority observations');
    if(o.kind==='merge_fact') record.merge.external_merge={...o.data,source:'attested',approval_not_recorded:!record.merge.owner_approval,confirmed_deviation:false} as PipelineRecord['merge']['external_merge'];
    record.observations.push(o);
    if(o.kind==='infra_retry')record.counters.infra_retries++;
    if(o.kind==='problem') {const fp=text(o.data.fp,'fp');const prior=record.counters.problem_fingerprints.find(x=>x.fp===fp);if(prior)prior.count++;else record.counters.problem_fingerprints.push({fp,first_seen:now,count:1});}
  };
  throw new PipelineError('usage',2,'Unknown record kind');
}
export function mutatePipeline(store:PipelineStore,key:Key,input:{op:'record'|'advance';kind?:string;payload?:unknown;state_version:number;command_key?:string;reconcile?:boolean;to?:Phase;reason?:string},boundary?:MutationBoundary):Receipt {
  text(key.source_host,'source-host');text(key.repository_id,'repository-id');text(key.task,'task');
  if(!Number.isSafeInteger(input.state_version)||input.state_version<1)throw new PipelineError('usage',2,'state-version is required');
  const hash=digest(wire({...input,command_key:undefined}));
  const cached=replay(store,key,input.command_key,hash);if(cached){publishAfterCommit(store);return cached;}store.assertWritable();
  const record=store.read(key);if(record.state_version!==input.state_version)throw new PipelineError('rev_conflict',4,'Record version changed',true);
  const from=record.phase;let action:()=>void;
  if(input.op==='record')action=prepareRecord(store,record,text(input.kind,'kind'),object(input.payload),input.reconcile??false);
  else {
    if(!input.to||!PHASES.includes(input.to))throw new PipelineError('usage',2,'Unknown phase');
    const previous=record.observations.slice().reverse().find(o=>o.kind==='subject');
    const observed=previous?observeSubject(store,record,previous.data):null;
    action=()=>{
      // Ingest does not change the record version. Project runs under the writer lock.
      record.runs=projectedRuns(record,observations(store));
      if(observed)record.observations.push(observed);
      // T6 consumes the old candidate approval before new base observations.
      if(input.to==='merged') advanceRecord(record,input.to,input.reason);
      refreshValidity(record,currentSubject(record));
      if(input.to!=='merged')advanceRecord(record,input.to!,input.reason);
    };
  }
  // All Git/channel/artifact work is finished before BEGIN IMMEDIATE.
  const result=store.transaction(()=>{
    const duplicate=replay(store,key,input.command_key,hash);if(duplicate)return duplicate;store.assertWritable();
    if(store.read(key).state_version!==input.state_version)throw new PipelineError('rev_conflict',4,'Record version changed',true);
    action();record.state_version++;record.updated_at=new Date().toISOString();store.save(record);boundary?.('record');
    store.audit(key,input.op==='record'?`record:${input.kind}`:'advance',from,record.phase,input);boundary?.('audit');
    const value=receipt(store,key,record.state_version);remember(store,key,input.command_key,input.op,hash,value);boundary?.('idem');return value;
  });
  boundary?.('commit');publishAfterCommit(store);boundary?.('response');return result;
}

export function reverifyRestoredStore(store:PipelineStore):void {
  const records=store.all();
  const prepared=records.map(record=>{
    const prior=record.observations.slice().reverse().find(o=>o.kind==='subject');
    const observed=prior?observeSubject(store,record,prior.data):{kind:'subject',source:'git',observed_at:new Date().toISOString(),data:{subject:null,quality:'unavailable'}};
    let unavailable=observed.data.quality!=='verified';
    const roles=new Set(record.runs.map(run=>run.role));
    for(const observation of record.observations)if(observation.kind==='session'&&typeof observation.data.role==='string')roles.add(observation.data.role);
    for(const role of roles){
      const bundle=sourceAuthority({key:keyOf(record),root:record.repo.root,kind:'enroll',payload:{role}},store.env);
      if(bundle)enroll(record,bundle.output.runs);else unavailable=true;
    }
    const checked=record.runs.map(run=>{
      const bundle=sourceAuthority({key:keyOf(record),root:record.repo.root,kind:'result',payload:{role:run.role,round:run.round,request_id:run.request_id,context_sha256:run.context_sha256}},store.env);
      if(!bundle){unavailable=true;return {available:false,run:{...run,result_state:'present_unvalidated' as const,status:'pending_verification' as const}};}
      if(bundle.output.result_state==='invalid')unavailable=true;
      return {available:true,run:{...run,result_state:bundle.output.result_state}};
    });
    const evidence=record.evidence.map(row=>{
      const request=record.runs.find(run=>run.request_id===row.authority_ref?.execution_id);
      const admitted=evidenceAdmission(record,{evidence:row,contract_path:prior?.data.contract_path,...(request?{request:{role:request.role,round:request.round}}:{})},store.env);
      if(admitted.source!=='verified')unavailable=true;
      return {...admitted,registered_at:row.registered_at};
    });
    return {record,observed,checked,runs:checked.map(item=>item.run),evidence,unavailable,version:record.state_version};
  });
  store.transaction(()=>{
    for(const item of prepared){
      if(store.read(keyOf(item.record)).state_version!==item.version)throw new PipelineError('rev_conflict',4,'Restored record changed',true);
      item.record.observations.push(item.observed);item.record.runs=item.runs;item.record.evidence=item.evidence;item.record.flags_attested=item.record.flags_attested.filter(f=>!['restore_requires_reverification','restore_source_unavailable','source_stale'].includes(f));
      if(item.unavailable){item.record.flags_attested.push('restore_source_unavailable','source_stale');item.record.admission='observed';}
      refreshValidity(item.record,currentSubject(item.record));
      for(const checked of item.checked){const run=checked.run;store.appendObservation({key:keyOf(item.record),role:run.role,round:run.round,request_id:run.request_id,kind:checked.available?'source_check':'source_unavailable',source:'outbox',observed_at:new Date().toISOString(),payload:{result_state:run.result_state}});}
      item.record.state_version++;item.record.updated_at=new Date().toISOString();store.save(item.record);store.audit(keyOf(item.record),'reverify',item.record.phase,item.record.phase,{quality:item.unavailable?'unavailable':'verified'});
    }
    store.db.exec('UPDATE metadata SET recovery_pending=0 WHERE id=1');store.bump();
  });
  publishAfterCommit(store);
}
