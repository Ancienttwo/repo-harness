import { isAdmittedSessionSelector, SESSION_SELECTOR_KEYS, type AdmittedSessionSelector } from '../sessions/session-selector';
export const ADMITTED_CONTEXT_MAX_BYTES = 256 * 1024;
export interface AdmittedTaskContext {
  readonly protocol: 2;
  readonly kind: 'operator_admitted_task_context';
  readonly selector: AdmittedSessionSelector;
  readonly goal: { readonly revision: string; readonly content: string };
  /** Canonical approved bytes, displayed as evidence and never executed by the browser. */
  readonly verification: { readonly plan_sha256: string; readonly plan_json: string };
  readonly scope: { readonly allowed_paths: readonly string[]; readonly benchmark: 'required' | 'not_required'; readonly oracles_json: string };
  readonly approval: { readonly admission_sha256: string; readonly grant_sha256: string; readonly revision: number; readonly goal_revision: string; readonly scope_sha256: string };
  readonly execution: { readonly branch: string; readonly runtime: 'terminal' | 'herdr'; readonly harness_kind: string };
  readonly observed_at: string;
}
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(key=>keys.includes(key));
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('\0');
const hash = (v: unknown): v is string => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
export function decodeAdmittedTaskContext(value: unknown, request: AdmittedSessionSelector): AdmittedTaskContext {
  const invalid = (): never => {throw new Error('Invalid admitted task context');};
  if (!isAdmittedSessionSelector(request) || new TextEncoder().encode(JSON.stringify(value)).length > ADMITTED_CONTEXT_MAX_BYTES
    || !exact(value,['protocol','kind','selector','goal','verification','scope','approval','execution','observed_at'])) return invalid();
  if(value.protocol!==2||value.kind!=='operator_admitted_task_context'||!isAdmittedSessionSelector(value.selector))return invalid();
  const selector=value.selector;
  if(SESSION_SELECTOR_KEYS.some(key=>selector[key]!==request[key]))return invalid();
  const goal=value.goal,verification=value.verification,scope=value.scope,approval=value.approval,execution=value.execution;
  if(!exact(goal,['revision','content'])||!hash(goal.revision)||!text(goal.content)
    ||!exact(verification,['plan_sha256','plan_json'])||!hash(verification.plan_sha256)||!text(verification.plan_json)
    ||!exact(scope,['allowed_paths','benchmark','oracles_json'])||!Array.isArray(scope.allowed_paths)||!scope.allowed_paths.length||!scope.allowed_paths.every(text)
    ||!['required','not_required'].includes(scope.benchmark as string)||!text(scope.oracles_json))return invalid();
  if(!exact(approval,['admission_sha256','grant_sha256','revision','goal_revision','scope_sha256'])||!hash(approval.admission_sha256)||approval.grant_sha256!==request.grant_sha256
    ||!Number.isSafeInteger(approval.revision)||(approval.revision as number)<1||approval.goal_revision!==goal.revision||!hash(approval.scope_sha256))return invalid();
  if(!exact(execution,['branch','runtime','harness_kind'])||!text(execution.branch)||!['terminal','herdr'].includes(execution.runtime as string)||!text(execution.harness_kind)
    ||!text(value.observed_at)||!Number.isFinite(Date.parse(value.observed_at)))return invalid();
  return value as unknown as AdmittedTaskContext;
}
