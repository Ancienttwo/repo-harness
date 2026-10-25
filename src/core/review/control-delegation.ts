import { createHash, createPublicKey, verify } from 'node:crypto';
import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import { validateReviewAdmission, type ReviewAdmission } from './authority-context';

export interface ControlDelegation {
  protocol: 1;
  kind: 'repo-harness-control-delegation';
  id: string;
  user_id: string;
  bot_id: string;
  bot_public_key: string;
  repository_id: string;
  issue_ids: string[];
  allowed_paths: string[];
  policy_sha256: string;
  benchmark: 'required' | 'not_required';
  /** Epoch milliseconds. Expiry is exclusive. */
  not_before: number;
  expires_at: number;
}
export interface ControlApprovalDecision {
  protocol: 1;
  kind: 'repo-harness-control-approval';
  delegation_sha256: string;
  admission_sha256: string;
  repository_root: string;
  expected_revision: number;
  expires_at: number;
}
export interface ControlApprovalProvenance {
  readonly delegation_id: string;
  readonly delegation_sha256: string;
  readonly bot_id: string;
  readonly user_id: string;
  readonly expires_at: number;
}
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
function publicKey(pem: string) {
  // Reject private keys even though createPublicKey can derive their public key.
  if (!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----\r?\n?$/.test(pem)) fail('public_key');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') fail('key_algorithm');
  return key;
}
function signed(value: JsonValue | undefined, pem: string): Record<string, JsonValue> {
  const envelope = record(value, ['payload', 'signature']);
  text(envelope.signature);
  const signature = Buffer.from(envelope.signature, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== envelope.signature) fail('signature_encoding');
  if (!verify(null, Buffer.from(canonicalize(envelope.payload!)), publicKey(pem), signature)) fail('signature');
  if (!envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) fail('payload');
  return envelope.payload as Record<string, JsonValue>;
}

/** Trust must come from the protected host boundary, never from this envelope.
 * Signatures cover UTF-8 canonical JSON payload bytes. Distinct signed kinds
 * separate delegation from approval. This verifier never grants a waiver.
 */
export function verifyControlApproval(
  envelope: unknown,
  trust: { userPublicKey: string; revokedDelegationIds: readonly string[] },
  now: number,
  admission: ReviewAdmission,
  repositoryRoot: string,
  expectedRevision: number,
): ControlApprovalProvenance {
  integer(now); integer(expectedRevision); text(repositoryRoot);
  const current = validateReviewAdmission(snapshot(admission) as unknown as ReviewAdmission);
  const root = record(snapshot(envelope), ['delegation', 'decision']);
  const delegation = record(signed(root.delegation, trust.userPublicKey), [
    'protocol', 'kind', 'id', 'user_id', 'bot_id', 'bot_public_key', 'repository_id',
    'issue_ids', 'allowed_paths', 'policy_sha256', 'benchmark', 'not_before', 'expires_at',
  ]);
  if (delegation.protocol !== 1 || delegation.kind !== 'repo-harness-control-delegation') fail('delegation_kind');
  for (const key of ['id', 'user_id', 'bot_id', 'bot_public_key', 'repository_id']) text(delegation[key]);
  strings(delegation.issue_ids); strings(delegation.allowed_paths); hash(delegation.policy_sha256);
  integer(delegation.not_before); integer(delegation.expires_at);
  if (delegation.not_before > now || delegation.expires_at <= now || delegation.expires_at <= delegation.not_before) fail('delegation_expired');
  if (trust.revokedDelegationIds.includes(delegation.id as string)) fail('revoked');
  if (delegation.user_id === delegation.bot_id || delegation.bot_id === current.actor_id || delegation.user_id === current.actor_id) fail('self_approval');
  if (delegation.repository_id !== current.repository_id || !delegation.issue_ids.includes(current.issue_id)) fail('repository_or_issue');
  if (delegation.policy_sha256 !== current.policy.policy_sha256 || delegation.benchmark !== current.benchmark) fail('policy');
  if (current.policy.user_waiver !== 'forbidden') fail('waiver');
  for (const path of delegation.allowed_paths) {
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\')
      || (path.endsWith('/') ? path.slice(0, -1) : path).split('/').some(part => part === '' || part === '.' || part === '..')) fail('path');
  }
  const allowedPaths = delegation.allowed_paths;
  if (!allowedPaths.includes('*') && current.allowed_paths.some(path => !allowedPaths.includes(path))) fail('scope');
  const delegationSha256 = `sha256:${createHash('sha256').update(canonicalize(delegation)).digest('hex')}`;
  const decision = record(signed(root.decision, delegation.bot_public_key as string), [
    'protocol', 'kind', 'delegation_sha256', 'admission_sha256', 'repository_root', 'expected_revision', 'expires_at',
  ]);
  if (decision.protocol !== 1 || decision.kind !== 'repo-harness-control-approval') fail('decision_kind');
  hash(decision.delegation_sha256); hash(decision.admission_sha256); text(decision.repository_root);
  integer(decision.expected_revision); integer(decision.expires_at);
  if (decision.expires_at <= now || decision.expires_at > delegation.expires_at) fail('decision_expired');
  if (decision.delegation_sha256 !== delegationSha256 || decision.admission_sha256 !== current.admission_sha256
    || decision.repository_root !== repositoryRoot || decision.expected_revision !== expectedRevision) fail('decision_subject');
  return Object.freeze({ delegation_id: delegation.id as string, delegation_sha256: delegationSha256,
    bot_id: delegation.bot_id as string, user_id: delegation.user_id as string, expires_at: decision.expires_at });
}
