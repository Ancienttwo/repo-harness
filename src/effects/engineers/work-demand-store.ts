import { createHash, randomUUID } from 'crypto';
import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from 'fs';
import { dirname, join, resolve } from 'path';

import {
  buildAcceptedWorkDemandProjection, buildWorkDemandEvent, canonicalWorkDemandBytes,
  canonicalWorkDemandCurrentBytes, canonicalWorkDemandEventBytes, canonicalWorkDemandProjectionBytes,
  deriveWorkDemandTransitionId, foldWorkDemandCurrent, validateWorkDemand, validateWorkDemandCurrent,
  validateWorkDemandEvent, type AcceptedWorkDemandProjectionV1, type MaterializedWorkDemandReceiptV1,
  type WorkDemandActorV1, type WorkDemandCurrentV1, type WorkDemandEventV1, type WorkDemandTransition, type WorkDemandV1,
} from '../../core/engineers/work-demand';
import { EngineerProfileBindingError } from '../../core/engineers/profile-binding';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { readEngineerBindingStatus, withEngineerBindingLock } from './binding-store';
import { loadEngineerProfile } from './profile-store';

const ROOT = 'repo-harness/work-demands/v1';
type ImmutableKind = 'requests' | 'events' | 'transitions' | 'projections';

export class WorkDemandStoreError extends Error {
  constructor(readonly code: 'work_demand_store_not_found' | 'work_demand_store_conflict' | 'work_demand_store_unsafe_path' | 'work_demand_store_persistence_failed', message: string, readonly cause?: unknown) {
    super(message); this.name = 'WorkDemandStoreError';
  }
}
function fail(code: WorkDemandStoreError['code'], message: string, cause?: unknown): never { throw new WorkDemandStoreError(code, message, cause); }
function key(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) fail('work_demand_store_unsafe_path', 'demand_id is invalid');
  return createHash('sha256').update(id).digest('hex');
}
function digest(value: string): string { if (!/^sha256:[0-9a-f]{64}$/u.test(value)) fail('work_demand_store_unsafe_path', 'digest is invalid'); return value.slice(7); }
function paths(repoRoot: string, id: string) {
  const common = resolveGitCommonDirectory(repoRoot); const root = join(common, ROOT); const state = join(root, 'state', key(id));
  return { common, root, state, current: join(state, 'current.json'), lock: `${ROOT}/locks/${key(id)}.lock` };
}
function ensure(path: string): void { mkdirSync(path, { recursive: true, mode: 0o700 }); const s = lstatSync(path); if (!s.isDirectory() || s.isSymbolicLink()) fail('work_demand_store_unsafe_path', `unsafe directory: ${path}`); }
function prepare(p: ReturnType<typeof paths>): void { for (const path of [p.root, ...(['requests','events','transitions','projections','state'] as const).map(x => join(p.root,x)), p.state]) ensure(path); }
function readRegular(path: string): Buffer { const s = lstatSync(path); if (!s.isFile() || s.isSymbolicLink()) fail('work_demand_store_unsafe_path', `unsafe file: ${path}`); return readFileSync(path); }
function atomic(path: string, bytes: Buffer): void {
  ensure(dirname(path)); const temp = join(dirname(path), `.${process.pid}.${randomUUID()}.tmp`); const fd = openSync(temp, constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW, 0o600);
  try { let offset=0; while(offset<bytes.length) offset += writeSync(fd, bytes, offset, bytes.length-offset); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp,path); const d=openSync(dirname(path),constants.O_RDONLY); try { fsyncSync(d); } finally { closeSync(d); }
}
function immutable<T>(p: ReturnType<typeof paths>, kind: ImmutableKind, name: string, value: T, canonical: (v:T)=>string): void {
  const path=join(p.root,kind,`${digest(name)}.json`); const bytes=Buffer.from(`${canonical(value)}\n`);
  if(existsSync(path)){ if(!readRegular(path).equals(bytes)) fail('work_demand_store_conflict',`${kind} digest names different bytes`); return; }
  atomic(path,bytes);
}
function parse<T>(path:string, validate:(v:unknown)=>T, canonical:(v:T)=>string):T { let value:T; const raw=readRegular(path); try{value=validate(JSON.parse(raw.toString('utf8')));}catch(error){return fail('work_demand_store_conflict',`${path} is invalid`,error);} if(!raw.equals(Buffer.from(`${canonical(value)}\n`))) fail('work_demand_store_conflict',`${path} is not canonical`); return value; }
function current(p:ReturnType<typeof paths>):WorkDemandCurrentV1|null{return existsSync(p.current)?parse(p.current,validateWorkDemandCurrent,canonicalWorkDemandCurrentBytes):null;}
function validateEngineer(repoRoot:string,demand:WorkDemandV1,actor:WorkDemandActorV1):void {
  if(actor.kind!=='engineer') return; const principal=actor.principal; const profile=loadEngineerProfile(repoRoot,principal.engineer_id);
  if(profile.profile.capability_id!==demand.source_capability_id) fail('work_demand_store_conflict','Engineer actor does not own source capability');
  const status=readEngineerBindingStatus(repoRoot,principal.engineer_id,principal.engineer_contract_revision); const binding=status.binding;
  if(!binding||status.current.state!=='active'||binding.state!=='active'||binding.binding_id!==principal.binding_id||binding.binding_generation!==principal.binding_generation||binding.engineer_contract_revision!==principal.engineer_contract_revision) fail('work_demand_store_conflict','Engineer actor does not match exact current Binding');
}

export interface WorkDemandAcceptanceInput extends Omit<AcceptedWorkDemandProjectionV1,'protocol'|'kind'|'demand_id'|'demand_sha256'|'accepted_from_current_digest'|'work_package_revision'|'projection_sha256'> {}
export interface TransitionWorkDemandInput { readonly repo_root:string; readonly demand:WorkDemandV1; readonly idempotency_key:string; readonly transition:WorkDemandTransition; readonly expected_current_digest:string|null; readonly actor:WorkDemandActorV1; readonly acceptance:WorkDemandAcceptanceInput|null; readonly materialization_receipt:MaterializedWorkDemandReceiptV1|null; readonly crash_hook?:(boundary:'after_event_fsync'|'after_current_fsync')=>void; }

export function transitionWorkDemand(input:TransitionWorkDemandInput):{readonly demand:WorkDemandV1;readonly event:WorkDemandEventV1;readonly current:WorkDemandCurrentV1}{
  const repoRoot=resolve(input.repo_root); const demand=validateWorkDemand(input.demand); if(repoHarnessRepoIdFor(repoRoot)!==demand.repository_id) fail('work_demand_store_conflict','demand repository_id does not match current repository'); const p=paths(repoRoot,demand.demand_id);
  const mutate=()=>withExclusiveDirectoryLock(p.common,p.lock,()=>{ prepare(p); const previous=current(p); const transitionId=deriveWorkDemandTransitionId(demand.demand_id,input.idempotency_key); const transitionPath=join(p.root,'transitions',`${digest(transitionId)}.json`);
    const projection=input.acceptance===null?null:buildAcceptedWorkDemandProjection({...input.acceptance,demand_id:demand.demand_id,demand_sha256:demand.demand_sha256,accepted_from_current_digest:input.expected_current_digest!});
    if(existsSync(transitionPath)){ const stored=parse(transitionPath,validateWorkDemandEvent,canonicalWorkDemandEventBytes); const same=stored.demand_sha256===demand.demand_sha256&&stored.transition===input.transition&&stored.expected_current_digest===input.expected_current_digest&&JSON.stringify(stored.actor)===JSON.stringify(input.actor)&&stored.accepted_projection?.projection_sha256===(projection?.projection_sha256??undefined)&&stored.materialization_receipt?.receipt_sha256===(input.materialization_receipt?.receipt_sha256??undefined);if(!same)fail('work_demand_store_conflict','idempotency key names different operation bytes');if(previous?.current_event_sha256===stored.event_sha256)return Object.freeze({demand,event:stored,current:previous});if((previous?.current_digest??null)===stored.expected_current_digest){const repaired=foldWorkDemandCurrent(previous,stored);atomic(p.current,Buffer.from(`${canonicalWorkDemandCurrentBytes(repaired)}\n`));return Object.freeze({demand,event:stored,current:repaired});}if(!previous)return fail('work_demand_store_conflict','stored transition lacks recoverable predecessor');return Object.freeze({demand,event:stored,current:previous}); }
    const candidate=buildWorkDemandEvent({demand,previous,idempotency_key:input.idempotency_key,transition:input.transition,expected_current_digest:input.expected_current_digest,actor:input.actor,accepted_projection:projection,materialization_receipt:input.materialization_receipt});
    immutable(p,'requests',demand.demand_sha256,demand,canonicalWorkDemandBytes); if(projection)immutable(p,'projections',projection.projection_sha256,projection,canonicalWorkDemandProjectionBytes); immutable(p,'transitions',candidate.transition_id,candidate,canonicalWorkDemandEventBytes); immutable(p,'events',candidate.event_sha256,candidate,canonicalWorkDemandEventBytes); input.crash_hook?.('after_event_fsync'); const next=foldWorkDemandCurrent(previous,candidate); atomic(p.current,Buffer.from(`${canonicalWorkDemandCurrentBytes(next)}\n`)); input.crash_hook?.('after_current_fsync'); return Object.freeze({demand,event:candidate,current:next}); },{reclaimStaleEmptyDirectory:true,reclaimStaleOwner:true});
  if(input.actor.kind==='human') return mutate();
  try{return withEngineerBindingLock(repoRoot,input.actor.principal.engineer_id,()=>{validateEngineer(repoRoot,demand,input.actor);return mutate();});}catch(error){if(error instanceof EngineerProfileBindingError)return fail('work_demand_store_conflict','Engineer Binding changed before WorkDemand mutation',error);throw error;}
}

export function readWorkDemandStatus(repoRootInput:string,demandId:string):{readonly demand:WorkDemandV1;readonly current:WorkDemandCurrentV1}{const p=paths(resolve(repoRootInput),demandId);const c=current(p);if(!c)return fail('work_demand_store_not_found','WorkDemand current is missing');const d=parse(join(p.root,'requests',`${digest(c.demand_sha256)}.json`),validateWorkDemand,canonicalWorkDemandBytes);return Object.freeze({demand:d,current:c});}
export function listWorkDemandStatuses(repoRootInput:string):readonly ReturnType<typeof readWorkDemandStatus>[] {const repoRoot=resolve(repoRootInput);const root=join(resolveGitCommonDirectory(repoRoot),ROOT,'state');if(!existsSync(root))return Object.freeze([]);return Object.freeze(readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>{const c=parse(join(root,e.name,'current.json'),validateWorkDemandCurrent,canonicalWorkDemandCurrentBytes);return readWorkDemandStatus(repoRoot,c.demand_id);}).sort((a,b)=>a.demand.created_at.localeCompare(b.demand.created_at)||a.demand.demand_id.localeCompare(b.demand.demand_id)));}
