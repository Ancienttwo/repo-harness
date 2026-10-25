import { createHash } from 'node:crypto';
import { isTaskDiffRequest, type OperatorTaskDiffRequest } from '../operator/task-diff';
import { canonicalExternalSourceBytes } from './issue-observation';
import { ExternalSourceBindingError } from './binding';

/** Immutable correlation evidence. The selector locates authority; it never grants it. */
export interface ExternalSourceBindingReceiptV2 {
  readonly protocol: 2;
  readonly kind: 'repo-harness-external-source-binding-receipt';
  readonly binding_id: string;
  readonly registered_repository_id: string;
  readonly authorization_revision: number;
  readonly provider: 'github';
  readonly provider_repository_id: string;
  readonly provider_issue_id: string;
  readonly source_revision: string;
  readonly observation_sha256: string;
  readonly session: OperatorTaskDiffRequest;
  readonly admission_sha256: string;
  readonly bound_at: string;
  readonly binding_sha256: string;
}
type Input = Omit<ExternalSourceBindingReceiptV2, 'protocol' | 'kind' | 'binding_id' | 'binding_sha256'>;
const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalExternalSourceBytes(value)).digest('hex')}`;
function invalid(): never { throw new ExternalSourceBindingError('external_source_binding_invalid', 'admitted source binding is invalid'); }
const INPUT_KEYS = ['registered_repository_id', 'authorization_revision', 'provider', 'provider_repository_id',
  'provider_issue_id', 'source_revision', 'observation_sha256', 'session', 'admission_sha256', 'bound_at'] as const;
function exactKeys(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid();
}
function basis(input: Input) {
  exactKeys(input, INPUT_KEYS);
  if (!isTaskDiffRequest(input.session)) invalid();
  // Copy only scalar selector fields. Never serialize the caller's object or its toJSON.
  const selected = input.session;
  const session = Object.freeze({ repository_id: selected.repository_id, provider_repository_id: selected.provider_repository_id,
    issue_id: selected.issue_id, campaign_id: selected.campaign_id, task: selected.task, role: selected.role,
    claim_ref: selected.claim_ref, claim_revision: selected.claim_revision, grant_sha256: selected.grant_sha256,
    policy_sha256: selected.policy_sha256, actor_id: selected.actor_id, session_binding_sha256: selected.session_binding_sha256 });
  const record = { protocol: 2 as const, kind: 'repo-harness-external-source-binding-receipt' as const,
    registered_repository_id: input.registered_repository_id, authorization_revision: input.authorization_revision,
    provider: input.provider, provider_repository_id: input.provider_repository_id, provider_issue_id: input.provider_issue_id,
    source_revision: input.source_revision, observation_sha256: input.observation_sha256,
    session, admission_sha256: input.admission_sha256, bound_at: input.bound_at };
  if (!isTaskDiffRequest(session) || record.provider !== 'github'
    || record.registered_repository_id !== session.repository_id
    || record.provider_repository_id !== session.provider_repository_id || record.provider_issue_id !== session.issue_id
    || !Number.isSafeInteger(record.authorization_revision) || record.authorization_revision < 0
    || ![record.source_revision, record.observation_sha256, record.admission_sha256].every(digest)
    || typeof record.bound_at !== 'string' || !Number.isFinite(Date.parse(record.bound_at))) invalid();
  return record;
}
export function buildAdmittedSourceBindingReceipt(input: Input): ExternalSourceBindingReceiptV2 {
  const record = basis(input);
  const { bound_at: _time, ...identity } = record;
  const value = { ...record, binding_id: hash(identity) };
  return Object.freeze({ ...value, binding_sha256: hash(value) });
}
export function validateAdmittedSourceBindingReceipt(value: unknown): ExternalSourceBindingReceiptV2 {
  exactKeys(value, [...INPUT_KEYS, 'protocol', 'kind', 'binding_id', 'binding_sha256']);
  const record = value as ExternalSourceBindingReceiptV2;
  const { protocol, kind, binding_id, binding_sha256 } = record;
  const expected = buildAdmittedSourceBindingReceipt({ registered_repository_id: record.registered_repository_id,
    authorization_revision: record.authorization_revision, provider: record.provider,
    provider_repository_id: record.provider_repository_id, provider_issue_id: record.provider_issue_id,
    source_revision: record.source_revision, observation_sha256: record.observation_sha256,
    session: record.session, admission_sha256: record.admission_sha256, bound_at: record.bound_at });
  if (protocol !== expected.protocol || kind !== expected.kind || binding_id !== expected.binding_id || binding_sha256 !== expected.binding_sha256) invalid();
  return expected;
}
export function canonicalAdmittedSourceBindingReceiptBytes(value: ExternalSourceBindingReceiptV2): string {
  return canonicalExternalSourceBytes(validateAdmittedSourceBindingReceipt(value));
}
