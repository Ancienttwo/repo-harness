import { createHash } from 'node:crypto';
import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import type { TaskRequest } from '../../effects/terminal/task-session';
import type { HerdrEndpoint } from '../../effects/terminal/herdr';
import schema from '../../../assets/pipeline-record.v2.schema.json';

export const PHASES = ['plan','plan-review','implement','cross-review','test','merge-ask','merged','cleanup','blocked','abandoned'] as const;
export type Phase = typeof PHASES[number];
export type Admission = 'gate_qualified' | 'observed' | 'attested_only';
export type ResultState = 'missing' | 'present_unvalidated' | 'validated' | 'applied' | 'invalid';
export interface Key { source_host: string; repository_id: string; task: string }
export interface Subject {
  base_sha: string; head_sha: string; tree_digest: string; plan_revision: number;
  worktree_clean: boolean; environment: string; contract_identity: string; check_set_identity: string;
}
export interface Requirement { requirement: 'required'; check_ids: string[]; identity: string }
export interface Policy {
  verification: Record<string, Requirement | string> & { check_set_identity: string; source: string };
  stall_thresholds: Record<string, number>;
}
export interface Evidence {
  kind: 'plan'|'plan_review'|'cross_review'|'typecheck'|'affected_tests'|'full_suite'|'cleanup_check';
  check_id: string; subject: Subject; source: 'verified'|'attested'|'missing';
  authority_ref: {execution_id: string; report_ref: string; validated_on: string} | null;
  verdict: 'pass'|'fail'|'request_changes'|'incomplete'|'blocked'; reviewer: string;
  path: string; sha256: string; execution_order: number; produced_at: string; registered_at: string; current: boolean;
}
export interface Run extends TaskRequest {
  source_host: string; attempt: number; session_ref: string; endpoint: HerdrEndpoint; harness_kind: string;
  pane: {pane_id: string; tab_id: string|null; workspace_id: string; herdr_session: string; host: string; registered_at: string; closed_at: string|null};
  result_state: ResultState; status: 'running'|'waiting_input'|'waiting_approval'|'waiting_retry'|'verifying'|'external_pending'|'pending_verification'|'crashed_unknown'|'ended';
  progress: {last_observation_at: string|null; note: string|null};
}
export interface Approval {
  by: string; channel: string; ref: string; at: string; pr: number; head_sha: string; base_sha: string;
  tree_digest: string; target_branch: string; provider: string; repository_id: string;
  merge_method: string; validity: 'exact_candidate'; attested: true; expired: boolean; expired_reason: string|null;
  consumed_at: string|null;
}
export interface MergeFact {
  squash_commit: string; pre_merge_head: string; pre_merge_base: string; tree_digest: string;
  method: string; observed_at: string; source: 'attested'|'verified'; approval_not_recorded: boolean; confirmed_deviation: boolean;
}
export interface Observation { kind: string; observed_at: string; source: string; data: Record<string, unknown> }
export interface PipelineRecord {
  schema_version: 'repo-harness.pipeline-record.v2'; id: string; source_host: string; repository_id: string;
  state_version: number; created_at: string; updated_at: string; host: string; owner_bot: string;
  repo: {id: string; root: string|null}; task: {value: string; title: string; issue: number|null; acceptance: string; source_ref: {path:string;sha256:string;host:string}|null};
  phase: Phase; admission: Admission; phase_since: string;
  blocked: {reason:string;since:string;return_to:Phase}|null; next_action: string|null;
  runs: Run[]; counters: {attempts:Record<string,number>;infra_retries:number;fix_loops:number;review_rounds:Record<string,number>;problem_fingerprints:{fp:string;first_seen:string;count:number}[]};
  evidence: Evidence[]; relations: {rel:'derived_from'|'reviews'|'validates'|'supersedes';from:number;to:number|string}[];
  merge: {phase_entry_facts: {base_sha:string;head_sha:string}|null; ask:{at:string;digest:string}|null;owner_approval:Approval|null;external_merge:MergeFact|null;squash_commit:string|null;merge_seal_sha256:string|null};
  resources: {worktree:string|null;branch:string|null;pr:number|null;pr_base:string|null;pr_base_sha:string|null};
  policy: Policy; observations: Observation[]; flags_attested: string[];
}
export class PipelineError extends Error {
  constructor(public code: string, public exit: number, message: string, public retryable = false) { super(message); }
}
export const digest = (value: string|Buffer) => 'sha256:' + createHash('sha256').update(value).digest('hex');
export const wire = (value: unknown) => canonicalize(JSON.parse(JSON.stringify(value)) as JsonValue);
export const equal = (a: unknown,b:unknown) => wire(a) === wire(b);
export const keyOf = (r: PipelineRecord): Key => ({source_host:r.source_host,repository_id:r.repository_id,task:r.task.value});
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PipelineError('usage',2,'Expected an object');
  return value as Record<string, any>;
}
export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new PipelineError('usage',2,`${name} must be a non-empty string`);
  return value;
}
// The shipped schema is also the runtime authority. This validator supports its
// finite vocabulary only. Unsupported schema keywords fail during development.
function validate(value: unknown, rule: any, at: string): void {
  const supported=['$ref','$schema','$id','$defs','anyOf','const','enum','type','required','properties','additionalProperties','items','minItems','minLength','pattern','minimum'];
  if(Object.keys(rule).some(k=>!supported.includes(k)))throw new PipelineError('schema_keyword',3,'The schema contains an unsupported validation keyword');
  if (rule.$ref) return validate(value, (schema.$defs as any)[rule.$ref.split('/').pop()],at);
  if (rule.anyOf) {
    if (rule.anyOf.some((r:any)=>{try{validate(value,r,at);return true;}catch{return false;}})) return;
    throw new PipelineError('usage',2,`${at} has an invalid shape`);
  }
  if (rule.const !== undefined && value !== rule.const) throw new PipelineError('usage',2,`${at} has an invalid value`);
  if (rule.enum && !rule.enum.includes(value)) throw new PipelineError('usage',2,`${at} has an invalid enum`);
  if (rule.type === 'null' && value !== null) throw new PipelineError('usage',2,`${at} must be null`);
  if (rule.type === 'object') {
    const v=object(value);
    for(const k of rule.required ?? []) if (!(k in v)) throw new PipelineError('usage',2,`${at}.${k} is required`);
    for(const [k,x] of Object.entries(v)) {
      const sub=rule.properties?.[k] ?? rule.additionalProperties;
      if(sub === false) throw new PipelineError('usage',2,`${at}.${k} is unknown`);
      if(sub && sub !== true) validate(x,sub,`${at}.${k}`);
    }
  }
  if(rule.type === 'array') {
    if(!Array.isArray(value) || value.length < (rule.minItems ?? 0)) throw new PipelineError('usage',2,`${at} must be an array`);
    value.forEach((v,i)=>validate(v,rule.items,`${at}[${i}]`));
  }
  if(rule.type === 'string') {
    if(typeof value !== 'string' || value.length < (rule.minLength ?? 0) || (rule.pattern && !new RegExp(rule.pattern).test(value))) throw new PipelineError('usage',2,`${at} must be a valid string`);
  }
  if(rule.type === 'integer' && (!Number.isSafeInteger(value) || (value as number) < (rule.minimum ?? 0))) throw new PipelineError('usage',2,`${at} must be an integer`);
  if(rule.type === 'boolean' && typeof value !== 'boolean') throw new PipelineError('usage',2,`${at} must be boolean`);
}
export function decodeRecord(value: unknown): PipelineRecord { validate(value,schema,'record'); return value as PipelineRecord; }
export function decodeSubject(value: unknown): Subject { validate(value,schema.$defs.subject,'subject');return value as Subject; }
export function decodeEvidence(value: unknown): Evidence { validate(value,schema.$defs.evidence,'evidence');return value as Evidence; }
export function decodePolicy(value: unknown): Policy { validate(value,schema.$defs.policy,'policy');return value as Policy; }
