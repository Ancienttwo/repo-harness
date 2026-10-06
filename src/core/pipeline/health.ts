import { PipelineError } from './types';
import type { PipelineBoardV2 } from './board';

export interface PublicationWatermark {epoch:number;commit_seq:number}
export interface PublicationIntent {watermark:PublicationWatermark;pid:number;at:string}
export interface PublicationState {
  status:'ok'|'failed';watermark:PublicationWatermark;error_code:string|null;at:string;
  writer:{host:string;path_sha256:string;sqlite_version:string;sqlite_library_configured:boolean};
}
export interface PipelineHealthV1 {
  projection_version:'repo-harness.pipeline-health.v1';
  store:{path_is_default:boolean;path_sha256:string;authority_host:string;hostname_matches:boolean;sqlite_version:string|null;sqlite_library_configured:boolean};
  snapshot:{status:'missing'|PipelineBoardV2['status'];watermark:PublicationWatermark|null;produced_at:string|null;age_ms:number|null};
  publication:{status:'unknown'|'unavailable'|'pending'|'failed'|'published';state_file:'missing'|'current'|'stale'|'unavailable';target:PublicationWatermark|null;at:string|null;error_code:string|null;pending_intents:number|null};
  coverage:{pipelines:PipelineBoardV2['coverage']|null;idempotent_deliveries:number|null;missing_delivery_observations:number|null;unclassified_observations:number|null};
}
export const compareWatermarks=(a:PublicationWatermark,b:PublicationWatermark):number=>a.epoch-b.epoch||a.commit_seq-b.commit_seq;
const invalid=():never=>{throw new PipelineError('publication_evidence',3,'Publication evidence is invalid');};
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>;}
function fields(value:Record<string,unknown>,names:string[]):void {if(Object.keys(value).sort().join(',')!==names.sort().join(','))invalid();}
function integer(value:unknown,min=0):number {if(!Number.isSafeInteger(value)||(value as number)<min)return invalid();return value as number;}
function time(value:unknown):string {if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value)))return invalid();return value;}
function token(value:unknown):string {if(typeof value!=='string'||!value||!/^[-a-zA-Z0-9_.:]+$/.test(value))return invalid();return value;}
function watermark(value:unknown):PublicationWatermark {const v=object(value);fields(v,['epoch','commit_seq']);return {epoch:integer(v.epoch,1),commit_seq:integer(v.commit_seq)};}
export function decodePublicationIntent(value:unknown):PublicationIntent {
  const v=object(value);fields(v,['watermark','pid','at']);return {watermark:watermark(v.watermark),pid:integer(v.pid,1),at:time(v.at)};
}
export function decodePublicationState(value:unknown):PublicationState {
  const v=object(value);fields(v,['status','watermark','error_code','at','writer']);
  if(v.status!=='ok'&&v.status!=='failed')return invalid();
  if(v.status==='ok'&&v.error_code!==null||v.status==='failed'&&v.error_code===null)return invalid();
  const writer=object(v.writer);fields(writer,['host','path_sha256','sqlite_version','sqlite_library_configured']);
  if(typeof writer.path_sha256!=='string'||!/^sha256:[a-f0-9]{64}$/.test(writer.path_sha256)||typeof writer.sqlite_version!=='string'||!/^\d+\.\d+\.\d+$/.test(writer.sqlite_version)||typeof writer.sqlite_library_configured!=='boolean')return invalid();
  return {status:v.status,watermark:watermark(v.watermark),error_code:v.error_code===null?null:token(v.error_code),at:time(v.at),writer:{host:token(writer.host),path_sha256:writer.path_sha256,sqlite_version:writer.sqlite_version,sqlite_library_configured:writer.sqlite_library_configured}};
}
export function decodePipelineHealth(value:unknown):PipelineHealthV1 {
  const v=object(value);fields(v,['projection_version','store','snapshot','publication','coverage']);
  if(v.projection_version!=='repo-harness.pipeline-health.v1')return invalid();
  const s=object(v.store);fields(s,['path_is_default','path_sha256','authority_host','hostname_matches','sqlite_version','sqlite_library_configured']);
  for(const key of ['path_is_default','hostname_matches','sqlite_library_configured'])if(typeof s[key]!=='boolean')invalid();
  token(s.authority_host);if(typeof s.path_sha256!=='string'||!/^sha256:[a-f0-9]{64}$/.test(s.path_sha256))invalid();
  if(s.sqlite_version!==null&&(typeof s.sqlite_version!=='string'||!/^\d+\.\d+\.\d+$/.test(s.sqlite_version)))invalid();
  const snapshot=object(v.snapshot);fields(snapshot,['status','watermark','produced_at','age_ms']);
  if(typeof snapshot.status!=='string'||!['missing','empty','ready','partial','stale','unavailable'].includes(snapshot.status))invalid();
  if(snapshot.watermark!==null)watermark(snapshot.watermark);if(snapshot.produced_at!==null)time(snapshot.produced_at);if(snapshot.age_ms!==null)integer(snapshot.age_ms);
  const p=object(v.publication);fields(p,['status','state_file','target','at','error_code','pending_intents']);
  if(typeof p.status!=='string'||!['unknown','unavailable','pending','failed','published'].includes(p.status)||typeof p.state_file!=='string'||!['missing','current','stale','unavailable'].includes(p.state_file))invalid();
  if(p.target!==null)watermark(p.target);if(p.at!==null)time(p.at);if(p.error_code!==null)token(p.error_code);if(p.pending_intents!==null)integer(p.pending_intents);
  const c=object(v.coverage);fields(c,['pipelines','idempotent_deliveries','missing_delivery_observations','unclassified_observations']);
  for(const key of ['idempotent_deliveries','missing_delivery_observations','unclassified_observations'])if(c[key]!==null)integer(c[key]);
  if(c.pipelines!==null){const pc=object(c.pipelines);fields(pc,['counted','skipped','errors','registration_incomplete']);Object.values(pc).forEach(n=>integer(n));}
  return value as PipelineHealthV1;
}
