import { digest, type PipelineRecord, type Run } from './types';
import { currentSubject } from './gates';
export interface LogObservation {source_host:string|null;repository_id:string|null;task:string|null;role:string|null;round:number|null;request_id:string|null;kind:string;source:string;observed_at:string;payload:Record<string,any>;terminal_key:string|null}
export function projectedRuns(record:PipelineRecord,logs:LogObservation[]):Run[] {
  const relevant=logs.filter(o=>o.source_host===record.source_host&&o.repository_id===record.repository_id&&o.task===record.task.value);
  const runs=structuredClone(record.runs);
  for(const log of relevant) if(log.kind==='enrollment')for(const run of log.payload.runs??[]){if(!runs.some(r=>r.role===run.role&&r.round===run.round&&r.request_id===run.request_id))runs.push(run);}
  for(const run of runs)for(const log of relevant) {
    if(log.role!==run.role || log.round!==run.round || log.request_id!==run.request_id)continue;
    if(log.kind==='result'||log.kind==='source_check') {run.result_state=log.payload.result_state;run.progress.last_observation_at=log.observed_at;}
    if(log.kind==='liveness') {
      run.progress.last_observation_at=log.observed_at;
      // Focused idle is not completion. It cannot replace a validated result.
      if(log.payload.agent_status==='blocked')run.status='waiting_input';
      else if(log.payload.agent_status==='working')run.status='running';
      else if(log.payload.present===false)run.status='crashed_unknown';
    }
  }
  return runs;
}


export const PIPELINE_STALE_AFTER_MS = 300000;
const publicText = (value:string) => value.replace(/\/(?:Users|home|private|tmp|Volumes)\/[^\s]+/g, '[private path]');
export interface PipelineCard {
  source_host:string;repository_id:string;task:string;id:string;repo:string;title:string;phase:string;admission:string;
  state_version:number;record_updated_at:string;phase_since:string;
  runs:{role:string;round:number;status:string;result_state:string}[];blocked:string|null;
  subject:{base_sha:string;head_sha:string;tree_digest:string;environment:string}|null;
  approval:{attested:boolean;expired:boolean;expired_reason:string|null}|null;
  external_fact:{source:string;approval_not_recorded:boolean;confirmed_deviation:boolean;squash_commit:string}|null;
  evidence:{kind:string;source:string;verdict:string;current:boolean;count:number}[];flags:string[];
}
export interface PipelineBoardV2 {
  projection_version:'repo-harness.pipeline-board.v2';status:'empty'|'ready'|'partial'|'stale'|'unavailable';
  generated_at:string|null;last_reconciled_at:string|null;epoch:number|null;commit_seq:number|null;
  source_observed_at:Record<string,string>;coverage:{counted:number;skipped:number;errors:number;registration_incomplete:number};cards:PipelineCard[];
}
export function unavailableBoard():PipelineBoardV2 {return {projection_version:'repo-harness.pipeline-board.v2',status:'unavailable',generated_at:null,last_reconciled_at:null,epoch:null,commit_seq:null,source_observed_at:{},coverage:{counted:0,skipped:0,errors:1,registration_incomplete:0},cards:[]};}
export function projectBoard(records:PipelineRecord[],logs:LogObservation[],watermark:{epoch:number;commit_seq:number;produced_at:string},now=new Date(),staleMs=PIPELINE_STALE_AFTER_MS):PipelineBoardV2 {
  const sources:Record<string,string>={};let reconciled:string|null=null;let errors=0;let incomplete=0;
  for(const record of records)for(const obs of record.observations) {
    if(obs.kind==='subject'&&obs.data.quality==='verified')sources[`${record.source_host}:git`]=[sources[`${record.source_host}:git`]??'',obs.observed_at].sort().at(-1)!;
    if(obs.kind==='enrollment')incomplete+=Number(obs.data.registration_incomplete??0);
  }
  for(const log of logs) {
    if(log.kind==='reconcile') {if(log.payload.status==='complete')reconciled=log.observed_at;errors=Number(log.payload.errors??0);}
    if(['result','source_check','liveness','enrollment'].includes(log.kind)&&log.source_host)sources[`${log.source_host}:${log.source}`]=log.observed_at;
  }
  const cards=records.map(record=>{
    const runs=projectedRuns(record,logs);const subject=currentSubject(record);const counts=new Map<string,PipelineCard['evidence'][number]>();
    for(const e of record.evidence){const key=JSON.stringify([e.kind,e.source,e.verdict,e.current]);const row=counts.get(key);if(row)row.count++;else counts.set(key,{kind:e.kind,source:e.source,verdict:e.verdict,current:e.current,count:1});}
    const flags=[...record.flags_attested];
    if(record.phase==='merge-ask')flags.push('waiting_owner');
    if(record.blocked)flags.push('blocked');
    if(record.admission==='attested_only')flags.push('attested_only');
    if(record.evidence.some(e=>!e.current))flags.push('stale_subject');
    const relevant=logs.filter(o=>o.source_host===record.source_host&&o.repository_id===record.repository_id&&o.task===record.task.value);
    const latestSources=new Map<string,LogObservation>();for(const o of relevant)if(['source_unavailable','source_check','result','enrollment','liveness'].includes(o.kind))latestSources.set(o.source,o);
    if([...latestSources.values()].some(o=>o.kind==='source_unavailable'))flags.push('source_stale');
    if(runs.length===0)flags.push('registration_incomplete');
    if(runs.some(r=>r.status==='external_pending'))flags.push('run_external_pending');
    const threshold=record.policy.stall_thresholds[record.phase];
    if(threshold && record.phase!=='merge-ask' && now.getTime()-Date.parse(record.phase_since)>threshold)flags.push('stalled');
    const approval=record.merge.owner_approval;const fact=record.merge.external_merge;
    return {source_host:record.source_host,repository_id:digest(record.repository_id),task:record.task.value,id:record.id,repo:record.repo.id,title:publicText(record.task.title),phase:record.phase,admission:record.admission,state_version:record.state_version,record_updated_at:record.updated_at,phase_since:record.phase_since,
      runs:runs.map(r=>({role:r.role,round:r.round,status:r.status,result_state:r.result_state})),blocked:record.blocked?publicText(record.blocked.reason):null,
      subject:subject?{base_sha:subject.base_sha.slice(0,12),head_sha:subject.head_sha.slice(0,12),tree_digest:subject.tree_digest.slice(0,19),environment:subject.environment}:null,
      approval:approval?{attested:approval.attested,expired:approval.expired,expired_reason:approval.expired_reason?publicText(approval.expired_reason):null}:null,
      external_fact:fact?{source:fact.source,approval_not_recorded:fact.approval_not_recorded,confirmed_deviation:fact.confirmed_deviation,squash_commit:fact.squash_commit.slice(0,12)}:null,evidence:[...counts.values()],flags};
  });
  const stale=now.getTime()-Date.parse(watermark.produced_at)>staleMs || Object.values(sources).some(t=>now.getTime()-Date.parse(t)>staleMs);
  return {projection_version:'repo-harness.pipeline-board.v2',status:stale?'stale':errors||incomplete||cards.some(c=>c.flags.includes('registration_incomplete'))?'partial':cards.length?'ready':'empty',generated_at:watermark.produced_at,last_reconciled_at:reconciled,...{epoch:watermark.epoch,commit_seq:watermark.commit_seq},source_observed_at:sources,coverage:{counted:cards.length,skipped:logs.filter(o=>o.kind==='ignored').length,errors,registration_incomplete:incomplete+cards.filter(c=>c.flags.includes('registration_incomplete')).length},cards};
}
export function decodePipelineBoard(value:unknown):PipelineBoardV2 {
  const obj=(v:unknown):Record<string,any>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('pipeline projection invalid');return v as Record<string,any>;};
  const string=(v:unknown)=>{if(typeof v!=='string'||/\/(?:Users|home|private|tmp|Volumes)\//.test(v))throw new Error('pipeline projection text invalid');};
  const nullableString=(v:unknown)=>{if(v!==null)string(v);};
  const integer=(v:unknown)=>{if(!Number.isSafeInteger(v)||(v as number)<0)throw new Error('pipeline projection counter invalid');};
  const keys=(v:Record<string,any>,required:string[])=>{if(Object.keys(v).sort().join(',')!==required.slice().sort().join(','))throw new Error('pipeline projection fields invalid');};
  const v=obj(value);keys(v,['projection_version','status','generated_at','last_reconciled_at','epoch','commit_seq','source_observed_at','coverage','cards']);
  if(v.projection_version!=='repo-harness.pipeline-board.v2'||!['empty','ready','partial','stale','unavailable'].includes(v.status))throw new Error('pipeline projection invalid');
  nullableString(v.generated_at);nullableString(v.last_reconciled_at);if(v.epoch!==null)integer(v.epoch);if(v.commit_seq!==null)integer(v.commit_seq);
  for(const [k,time] of Object.entries(obj(v.source_observed_at))){string(k);string(time);}
  const coverage=obj(v.coverage);keys(coverage,['counted','skipped','errors','registration_incomplete']);Object.values(coverage).forEach(integer);
  if(!Array.isArray(v.cards))throw new Error('pipeline projection cards invalid');
  for(const raw of v.cards) {
    const c=obj(raw);keys(c,['source_host','repository_id','task','id','repo','title','phase','admission','state_version','record_updated_at','phase_since','runs','blocked','subject','approval','external_fact','evidence','flags']);
    for(const k of ['source_host','repository_id','task','id','repo','title','phase','admission','record_updated_at','phase_since'])string(c[k]);
    if(!/^sha256:[a-f0-9]{64}$/.test(c.repository_id))throw new Error('pipeline repository identity invalid');
    integer(c.state_version);nullableString(c.blocked);
    if(!Array.isArray(c.runs)||!Array.isArray(c.evidence)||!Array.isArray(c.flags))throw new Error('pipeline card arrays invalid');
    c.flags.forEach(string);
    for(const rawRun of c.runs){const r=obj(rawRun);keys(r,['role','round','status','result_state']);string(r.role);integer(r.round);string(r.status);string(r.result_state);}
    for(const rawEvidence of c.evidence){const e=obj(rawEvidence);keys(e,['kind','source','verdict','current','count']);string(e.kind);string(e.source);string(e.verdict);integer(e.count);if(typeof e.current!=='boolean')throw new Error('pipeline evidence quality invalid');}
    if(c.subject!==null){const s=obj(c.subject);keys(s,['base_sha','head_sha','tree_digest','environment']);Object.values(s).forEach(string);}
    if(c.approval!==null){const a=obj(c.approval);keys(a,['attested','expired','expired_reason']);if(typeof a.attested!=='boolean'||typeof a.expired!=='boolean')throw new Error('pipeline approval quality invalid');nullableString(a.expired_reason);}
    if(c.external_fact!==null){const f=obj(c.external_fact);keys(f,['source','approval_not_recorded','confirmed_deviation','squash_commit']);string(f.source);string(f.squash_commit);if(typeof f.approval_not_recorded!=='boolean'||typeof f.confirmed_deviation!=='boolean')throw new Error('pipeline merge quality invalid');}
  }
  return v as PipelineBoardV2;
}
