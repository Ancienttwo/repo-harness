import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import { validateReviewAdmission, type ReviewAdmission } from './authority-context';

/** An already-authorized upstream request. These fields provide binding and
 * traceability, not authentication. The calling Bot owns human authentication,
 * current delegation and access to this integration entrypoint.
 */
export interface ControlApproval {
  protocol: 1;
  kind: 'repo-harness-upstream-control-approval';
  authorization_ref: string;
  bot_id: string;
  action: 'admit' | 'admit-with-waiver-eligibility';
  repository_id: string;
  issue_id: string;
  campaign_id: string;
  execution_actor: string;
  parent_scope: {
    issue_ids: string[];
    allowed_paths: string[];
    policy: { reviewer: 'Claude' | 'Codex'; user_waiver: 'allowed' | 'forbidden'; policy_sha256: string };
    benchmark: 'required' | 'not_required';
    /** Epoch milliseconds. Expiry is exclusive. */
    not_before: number;
    expires_at: number;
  };
  admission_sha256: string;
  repository_root: string;
  expected_revision: number;
  expires_at: number;
}
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
export type ValidatedControlApproval = Frozen<ControlApproval>;
function fail(reason: string): never { throw new Error(`control_approval_invalid: ${reason}`); }

/** Detach data without invoking getters, toJSON, iterators or coercion hooks. */
function snapshot(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value)) fail('non_json_value');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) fail('prototype');
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) fail('symbol_field');
  const result: Record<string, JsonValue> = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (array && key === 'length') continue;
    if (!descriptor.enumerable || !('value' in descriptor)) fail('non_data_field');
    result[key] = snapshot(descriptor.value, ancestors);
  }
  ancestors.delete(value);
  if (!array) return result;
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || Object.keys(result).length !== length) fail('array_fields');
  const items: JsonValue[] = [];
  for (let i = 0; i < length; i++) {
    if (!Object.hasOwn(result, String(i))) fail('array_fields');
    items.push(result[String(i)]!);
  }
  return items;
}
function record(value: JsonValue | undefined, fields: readonly string[]): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) fail('fields');
  return value as Record<string, JsonValue>;
}
function text(value: JsonValue | undefined): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) fail('text');
}
function integer(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail('integer');
}
function hash(value: JsonValue | undefined): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) fail('digest');
}
function strings(value: JsonValue | undefined): asserts value is string[] {
  if (!Array.isArray(value) || !value.length) fail('list');
  for (const item of value) text(item);
  if (new Set(value).size !== value.length) fail('duplicate');
}

function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}

/** Validate an upstream-authorized request against the exact local transition.
 * No local key, actor string or authorization reference authenticates its source.
 * Waiver eligibility is an explicit separate action; neither action grants a waiver.
 */
export function validateControlApproval(
  request: unknown, now: number, admission: ReviewAdmission, repositoryRoot: string, expectedRevision: number,
): ValidatedControlApproval {
  integer(now); integer(expectedRevision); text(repositoryRoot);
  const current = validateReviewAdmission(snapshot(admission) as unknown as ReviewAdmission);
  const approval = record(snapshot(request), ['protocol', 'kind', 'authorization_ref', 'bot_id', 'action',
    'repository_id', 'issue_id', 'campaign_id', 'execution_actor', 'parent_scope', 'admission_sha256',
    'repository_root', 'expected_revision', 'expires_at']);
  if (approval.protocol !== 1 || approval.kind !== 'repo-harness-upstream-control-approval') fail('kind');
  for (const key of ['authorization_ref', 'bot_id', 'repository_id', 'issue_id', 'campaign_id', 'execution_actor', 'repository_root']) text(approval[key]);
  if (approval.action !== 'admit' && approval.action !== 'admit-with-waiver-eligibility') fail('action');
  if (approval.bot_id === current.actor_id) fail('self_approval');
  if (approval.repository_id !== current.repository_id || approval.issue_id !== current.issue_id
    || approval.campaign_id !== current.campaign_id || approval.execution_actor !== current.actor_id) fail('identity');
  const scope = record(approval.parent_scope, ['issue_ids', 'allowed_paths', 'policy', 'benchmark', 'not_before', 'expires_at']);
  strings(scope.issue_ids); strings(scope.allowed_paths);
  if (!scope.issue_ids.includes(current.issue_id)) fail('issue_scope');
  const policy = record(scope.policy, ['reviewer', 'user_waiver', 'policy_sha256']);
  hash(policy.policy_sha256);
  if ((policy.reviewer !== 'Codex' && policy.reviewer !== 'Claude')
    || (policy.user_waiver !== 'allowed' && policy.user_waiver !== 'forbidden')) fail('policy');
  if (approval.action === 'admit' && current.policy.user_waiver !== 'forbidden') fail('waiver');
  if (approval.action === 'admit-with-waiver-eligibility' && current.policy.user_waiver !== 'allowed') fail('waiver');
  if (canonicalize(policy) !== canonicalize(current.policy as unknown as JsonValue) || scope.benchmark !== current.benchmark) fail('policy');
  integer(scope.not_before); integer(scope.expires_at); integer(approval.expires_at); integer(approval.expected_revision);
  if (scope.not_before > now || scope.expires_at <= now || scope.expires_at <= scope.not_before) fail('scope_expired');
  if (approval.expires_at <= now || approval.expires_at > scope.expires_at) fail('approval_expired');
  for (const path of scope.allowed_paths) {
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\')
      || (path.endsWith('/') ? path.slice(0, -1) : path).split('/').some(part => part === '' || part === '.' || part === '..')) fail('path');
  }
  const allowedPaths = scope.allowed_paths;
  if (!allowedPaths.includes('*') && current.allowed_paths.some(path => !allowedPaths.includes(path))) fail('scope');
  hash(approval.admission_sha256);
  if (approval.admission_sha256 !== current.admission_sha256 || approval.repository_root !== repositoryRoot
    || approval.expected_revision !== expectedRevision) fail('subject');
  return freeze(approval as unknown as ControlApproval);
}
