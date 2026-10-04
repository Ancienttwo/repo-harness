export const PIPELINE_STALE_AFTER_MS = 300000;
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
export function decodePipelineBoard(value:unknown):PipelineBoardV2 {
  const obj=(v:unknown):Record<string,any>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('pipeline projection invalid');return v as Record<string,any>;};
  const string=(v:unknown)=>{if(typeof v!=='string'||/(?:^|[\s("'=:])\/\S+|[A-Za-z]:[\\/]/.test(v))throw new Error('pipeline projection text invalid');};
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
