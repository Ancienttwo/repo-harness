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
function basis(input: Input) {
  if (!input || !isTaskDiffRequest(input.session) || input.provider !== 'github'
    || input.registered_repository_id !== input.session.repository_id
    || input.provider_repository_id !== input.session.provider_repository_id || input.provider_issue_id !== input.session.issue_id
    || !Number.isSafeInteger(input.authorization_revision) || input.authorization_revision < 0
    || ![input.source_revision, input.observation_sha256, input.admission_sha256].every(digest)
    || typeof input.bound_at !== 'string' || !Number.isFinite(Date.parse(input.bound_at))) invalid();
  return { protocol: 2 as const, kind: 'repo-harness-external-source-binding-receipt' as const, ...input };
}
export function buildAdmittedSourceBindingReceipt(input: Input): ExternalSourceBindingReceiptV2 {
  const record = basis(input);
  const { bound_at: _time, ...identity } = record;
  const value = { ...record, binding_id: hash(identity) };
  return Object.freeze({ ...value, binding_sha256: hash(value) });
}
export function validateAdmittedSourceBindingReceipt(value: unknown): ExternalSourceBindingReceiptV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const { protocol, kind, binding_id, binding_sha256, ...input } = value as ExternalSourceBindingReceiptV2;
  if (Object.keys(input).sort().join(',') !== 'admission_sha256,authorization_revision,bound_at,observation_sha256,provider,provider_issue_id,provider_repository_id,registered_repository_id,session,source_revision') invalid();
  const expected = buildAdmittedSourceBindingReceipt(input);
  if (protocol !== expected.protocol || kind !== expected.kind || binding_id !== expected.binding_id || binding_sha256 !== expected.binding_sha256) invalid();
  return expected;
}
export function canonicalAdmittedSourceBindingReceiptBytes(value: ExternalSourceBindingReceiptV2): string {
  return canonicalExternalSourceBytes(validateAdmittedSourceBindingReceipt(value));
}
