import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertTaskRequest, readTaskAgent, readSessionArtifact, readTaskRequestResult, type TaskRequest } from '../terminal/task-session';
import { taskRepository } from '../terminal/task-worktree';
import { verificationContractProvenance, verificationOutcomeProvenance, captureGitVirtualTreeSnapshot } from '../evidence/verification-execution';
import { decodeSubject, digest, equal, object, PipelineError, text, type Evidence, type Key, type PipelineRecord, type Run, type Subject } from '../../core/pipeline/types';

export interface AuthorityQuery { key:Key; root:string|null; kind:'subject'|'enroll'|'result'|'evidence'|'brief'; payload:Record<string,any> }
export interface Bundle {
  protocol:2; source_host:string;repository_id:string;task:string;execution_id:string;report_ref:string|null;sha256:string;
  query_sha256:string;subject:Subject|null;request_identity:{role:string;round:number;request_id:string;context_sha256:string}|null;
  output:Record<string,any>;
}
function git(root:string,args:string[]):string {return execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024}).trim();}
export const sourceHost = (env:NodeJS.ProcessEnv=process.env) => env.REPO_HARNESS_PIPELINES_SOURCE_HOST ?? hostname();
function requireRoot(query:AuthorityQuery):string {
  if(query.key.source_host !== sourceHost()) throw new PipelineError('source_unavailable',3,'Artifact paths belong to another host');
  const root=text(query.root,'root');
  if(taskRepository(root).repository_id !== query.key.repository_id) throw new PipelineError('source_identity',3,'Source repository identity does not match');
  return root;
}
function request(root:string,key:Key,payload:Record<string,any>) {
  const {dir,binding}=readTaskAgent(root,key.task,text(payload.role,'role'));
  const req=readSessionArtifact<TaskRequest>(join(dir,`request-${payload.round}.json`));
  if(req.task!==key.task||req.role!==payload.role || req.round!==payload.round || (payload.request_id && req.request_id!==payload.request_id) || (payload.context_sha256 && req.context_sha256!==payload.context_sha256)) throw new PipelineError('request_identity',3,'Request identity does not match');
  // The original authority checks binding, persisted request and host-scoped paths.
  const result=readTaskRequestResult(root,dir,req);
  if(digest(readFileSync(req.context_ref))!==req.context_sha256) throw new PipelineError('request_context',3,'Request context digest does not match');
  return {dir,binding,req,result};
}
export function validateOnSource(query:AuthorityQuery):Bundle {
  const root=requireRoot(query);let output:Record<string,any>={};let subject:Subject|null=null;let identity:Bundle['request_identity']=null;let report_ref:string|null=null;
  if(query.kind==='brief') {
    report_ref=resolve(root,text(query.payload.path,'brief path'));
    output={source_ref:{path:report_ref,sha256:digest(readFileSync(report_ref)),host:query.key.source_host}};
  } else if(query.kind==='subject') {
    const expected=decodeSubject(query.payload.subject);
    const snap=captureGitVirtualTreeSnapshot(root);
    const contractPath=text(query.payload.contract_path,'contract_path');
    const contract=verificationContractProvenance(root,contractPath);
    subject={...expected,environment:contract.environment,check_set_identity:contract.check_set_identity,head_sha:snap.head_commit,base_sha:git(root,['rev-parse',text(query.payload.base_ref,'base_ref')]),tree_digest:snap.snapshot_hash,
      worktree_clean:git(root,['status','--porcelain','--untracked-files=all'])==='',contract_identity:digest(readFileSync(resolve(root,contractPath)))};
    output={subject};
  } else if(query.kind==='enroll') {
    const session=readTaskAgent(root,query.key.task,text(query.payload.role,'role'));
    const runs:Run[]=[];const errors:string[]=[];
    const files=readdirSync(session.dir).filter(name=>/^request-[1-9][0-9]*\.json$/.test(name));
    if(files.length>100) throw new PipelineError('registration_limit',3,'Session request limit exceeded');
    for(const file of files) {
      try {
        const raw=readSessionArtifact<TaskRequest>(join(session.dir,file));
        // Invalid results do not prevent enrollment of a valid original request.
        let found;
        try{found=request(root,query.key,{role:raw.role,round:raw.round});}
        catch(error){
          if(!String(error).includes('task_agent_result_identity_mismatch')) throw error;
          // Validate original paths using the original request checker directly.
          assertTaskRequest(root,session.dir,raw);
          found={...session,req:raw,result:null};
        }
        const {req,binding,dir}=found;
        runs.push({...req,source_host:query.key.source_host,attempt:req.round,session_ref:join(dir,'binding.json'),endpoint:binding.endpoint,harness_kind:binding.harness_kind,
          pane:{pane_id:binding.pane_id,tab_id:null,workspace_id:binding.workspace_id,herdr_session:binding.endpoint.session,host:query.key.source_host,registered_at:new Date().toISOString(),closed_at:existsSync(join(dir,'closed.json'))?new Date().toISOString():null},
          result_state:'missing',status:'running',progress:{last_observation_at:null,note:null}});
      }catch(error){errors.push(`${file}: ${error instanceof Error?error.message:'invalid'}`);}
    }
    output={runs,errors,registration_incomplete:errors.length};report_ref=join(session.dir,'binding.json');
  } else if(query.kind==='result') {
    try {
      const found=request(root,query.key,query.payload);
      identity={role:found.req.role,round:found.req.round,request_id:found.req.request_id,context_sha256:found.req.context_sha256};report_ref=found.req.result_ref;
      output={result_state:found.result?'validated':existsSync(found.req.result_ref)?'present_unvalidated':'missing',result_digest:found.result?digest(readFileSync(found.req.result_ref)):null};
    } catch(error) {output={result_state:'invalid',reason:error instanceof Error?error.message:'invalid'};}
  } else {
    const e=query.payload.evidence as Evidence;subject=e.subject;report_ref=e.path;
    if(e.kind==='plan') {
      if(digest(readFileSync(e.path))!==e.sha256 || e.sha256!==e.subject.contract_identity) throw new PipelineError('evidence_digest',3,'Plan digest mismatch');
      output={evidence:{...e,source:'verified',verdict:'pass',execution_order:e.subject.plan_revision,authority_ref:{execution_id:e.sha256,report_ref:e.path,validated_on:query.key.source_host}},artifact_digest:e.sha256};
    } else if(e.kind==='plan_review'||e.kind==='cross_review') {
      const found=request(root,query.key,object(query.payload.request));
      if(!found.result) throw new PipelineError('evidence_unavailable',3,'Review result is absent');
      const value=object(found.result.value);
      if(value.kind!=='pipeline_review' || !equal(value.subject,e.subject) || value.check_id!==e.check_id || value.verdict!==e.verdict || value.reviewer!==e.reviewer || value.plan_digest!==e.subject.contract_identity || found.binding.harness_kind!==e.reviewer) throw new PipelineError('evidence_identity',3,'Typed review does not match evidence');
      if(e.path!==found.req.result_ref || digest(readFileSync(e.path))!==e.sha256) throw new PipelineError('evidence_digest',3,'Review artifact digest mismatch');
      identity={role:found.req.role,round:found.req.round,request_id:found.req.request_id,context_sha256:found.req.context_sha256};
      output={evidence:{...e,source:'verified',execution_order:found.req.round,authority_ref:{execution_id:found.req.request_id,report_ref:e.path,validated_on:query.key.source_host}},artifact_digest:e.sha256};
    } else {
      const bytes=readFileSync(e.path);
      if(digest(bytes)!==e.sha256) throw new PipelineError('evidence_digest',3,'Report digest mismatch');
      const provenance=verificationOutcomeProvenance({repoRoot:root,contractPath:text(query.payload.contract_path,'contract_path'),report:JSON.parse(bytes.toString())},e.check_id);
      if(provenance.report.target.head_commit!==e.subject.head_sha || provenance.report.target.snapshot_hash!==e.subject.tree_digest || provenance.contract_identity!==e.subject.contract_identity || provenance.check_set_identity!==e.subject.check_set_identity || provenance.environment!==e.subject.environment) throw new PipelineError('evidence_identity',3,'Execution inputs do not match subject');
      const verdict=provenance.result.passed?'pass':provenance.result.timed_out?'incomplete':'fail';
      if(e.verdict!==verdict) throw new PipelineError('evidence_verdict',3,'Artifact verdict does not match');
      output={evidence:{...e,source:'verified',execution_order:provenance.execution_order,authority_ref:{execution_id:provenance.result.execution_id!,report_ref:e.path,validated_on:query.key.source_host}},artifact_digest:e.sha256};
    }
  }
  const envelope={protocol:2 as const,source_host:query.key.source_host,repository_id:query.key.repository_id,task:query.key.task,execution_id:randomUUID(),report_ref,query_sha256:digest(JSON.stringify(query)),subject,request_identity:identity,output};
  return {...envelope,sha256:digest(JSON.stringify(envelope))};
}
export function sourceAuthority(query:AuthorityQuery,env:NodeJS.ProcessEnv=process.env):Bundle|null {
  try {
    let bundle:Bundle;
    if(query.key.source_host===sourceHost(env)) bundle=validateOnSource(query);
    else {
      // An existing, explicitly configured CLI channel supplies argv. No shell,
      // new credentials, implicit SSH host or local path substitution is used.
      const commands=object(JSON.parse(env.REPO_HARNESS_PIPELINES_SOURCE_COMMANDS ?? '{}'));
      const argv=commands[query.key.source_host];
      if(!Array.isArray(argv)||argv.length===0||!argv.every(x=>typeof x==='string' && x.length)) return null;
      const bytes=execFileSync(argv[0],argv.slice(1),{input:JSON.stringify(query),encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024,env});
      bundle=JSON.parse(bytes);
    }
    const {sha256,...envelope}=bundle;
    if(bundle.protocol!==2||bundle.source_host!==query.key.source_host||bundle.repository_id!==query.key.repository_id||bundle.task!==query.key.task||bundle.query_sha256!==digest(JSON.stringify(query))||sha256!==digest(JSON.stringify(envelope))) return null;
    if(query.kind==='evidence') {
      const declared=query.payload.evidence,admitted=bundle.output.evidence;
      if(!admitted||!equal(bundle.subject,declared.subject)||bundle.output.artifact_digest!==declared.sha256||!equal(admitted.subject,declared.subject))return null;
      for(const field of ['kind','check_id','reviewer','path','sha256','verdict'])if(admitted[field]!==declared[field])return null;
      if(admitted.source!=='verified'||!Number.isSafeInteger(admitted.execution_order)||admitted.execution_order<0||admitted.authority_ref?.validated_on!==query.key.source_host)return null;
      if(['plan_review','cross_review'].includes(declared.kind)&&!equal(bundle.request_identity,query.payload.request))return null;
    }
    if(query.kind==='result' && bundle.output.result_state==='validated' && !equal(bundle.request_identity,{role:query.payload.role,round:query.payload.round,request_id:query.payload.request_id,context_sha256:query.payload.context_sha256})) return null;
    return bundle;
  }catch{return null;}
}
export function evidenceAdmission(record:PipelineRecord,payload:Record<string,any>,env:NodeJS.ProcessEnv):Evidence {
  const e=payload.evidence as Evidence;
  if(['plan_review','cross_review'].includes(e.kind)) {
    const declared=payload.request;
    const run=record.runs.find(r=>r.role===declared?.role&&r.round===declared?.round);
    if(!run||(declared.request_id&&declared.request_id!==run.request_id)||(declared.context_sha256&&declared.context_sha256!==run.context_sha256))return {...e,source:'attested',authority_ref:null,registered_at:new Date().toISOString(),current:false};
    payload={...payload,request:{role:run.role,round:run.round,request_id:run.request_id,context_sha256:run.context_sha256}};
  }
  const bundle=sourceAuthority({key:{source_host:record.source_host,repository_id:record.repository_id,task:record.task.value},root:record.repo.root,kind:'evidence',payload},env);
  if(bundle?.output.evidence?.source==='verified') return {...bundle.output.evidence,registered_at:new Date().toISOString(),current:true};
  return {...e,source:e.source==='missing'?'missing':'attested',authority_ref:null,registered_at:new Date().toISOString(),current:false};
}
