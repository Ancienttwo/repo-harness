import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageUuid,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageNullableString,
  messageRequiredString,
} from '../messages/mechanics';
import {
  validateWorkerResult,
  validateWorkerRunRef,
  type WorkerResultV1,
  type WorkerRunRefV1,
} from './delegation';

/** ME-2C is evidence projection only. It deliberately has no authority-transition dependency. */
export const VERIFIED_CONTEXT_PROTOCOL = 1 as const;
export const SEMANTIC_CONTRACT_PROJECTION_KIND = 'repo-harness-semantic-contract-projection' as const;
export const ENGINEER_STEP_PROPOSAL_KIND = 'repo-harness-engineer-step-proposal' as const;
export const WORKER_ROUND_RECEIPT_KIND = 'repo-harness-worker-round-receipt' as const;
export const SEMANTIC_VERIFICATION_ASSERTION_KIND = 'repo-harness-semantic-verification-assertion' as const;
export const DECISION_REQUEST_KIND = 'repo-harness-decision-request' as const;
export const DECISION_REQUEST_EVENT_KIND = 'repo-harness-decision-request-event' as const;
export const DECISION_REQUEST_CURRENT_KIND = 'repo-harness-decision-request-current' as const;
export const VERIFIED_EVIDENCE_CONTEXT_KIND = 'repo-harness-verified-evidence-context' as const;

const TASK = /^[0-9a-f]{64}$/u;
const ENGINEER = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const GIT_OID = /^[0-9a-f]{40,64}$/u;
const CONSTRAINT = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const REF = /^(?:repo:[^\u0000-\u001f\u007f]{1,2043}|evidence-blob:sha256:[0-9a-f]{64})$/u;

export interface SemanticConstraintV1 {
  readonly constraint_id: string;
  readonly statement: string;
}

export interface SemanticContractProjectionV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof SEMANTIC_CONTRACT_PROJECTION_KIND;
  readonly contract_ref: string;
  readonly contract_revision: string;
  readonly contract_blob_oid: string;
  readonly contract_sha256: string;
  readonly constraints: readonly SemanticConstraintV1[];
  readonly projection_sha256: string;
}

export interface VerifiedTaskFenceV1 {
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly lease_generation: number;
}

export interface VerifiedBindingFenceV1 {
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
}

export interface VerifiedEvidenceRefV1 {
  readonly ref: string;
  readonly sha256: string;
}

export type EngineerStepActionKind = 'analyze' | 'diagnose' | 'implement' | 'verify' | 'request_decision';

export interface EngineerStepProposalV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof ENGINEER_STEP_PROPOSAL_KIND;
  readonly proposal_id: string;
  readonly task: VerifiedTaskFenceV1;
  readonly binding: VerifiedBindingFenceV1;
  readonly round_index: number;
  readonly previous_assertion_sha256: string | null;
  readonly contract_sha256: string;
  readonly context_packet_sha256: string;
  readonly action_kind: EngineerStepActionKind;
  readonly target_constraint_ids: readonly string[];
  readonly input_evidence_refs: readonly VerifiedEvidenceRefV1[];
  readonly proposal_sha256: string;
}

export interface VerifiedCandidateV1 {
  readonly commit_sha: string;
  readonly tree_sha: string;
  readonly subject_sha256: string;
}

export interface WorkerRoundReceiptV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof WORKER_ROUND_RECEIPT_KIND;
  readonly worker_run_id: string;
  readonly worker_run_ref_sha256: string;
  readonly worker_runtime_receipt_sha256: string;
  readonly delegation_id: string;
  readonly round_index: number;
  readonly proposal_sha256: string;
  readonly result_sha256: string;
  readonly candidate: VerifiedCandidateV1 | null;
  readonly before_state_sha256: string;
  readonly after_state_sha256: string;
  readonly evidence_refs: readonly VerifiedEvidenceRefV1[];
  readonly round_receipt_sha256: string;
}

export interface SemanticVerificationAssertionV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof SEMANTIC_VERIFICATION_ASSERTION_KIND;
  readonly assertion_id: string;
  readonly worker_run_id: string;
  readonly round_index: number;
  readonly previous_assertion_sha256: string | null;
  readonly task: VerifiedTaskFenceV1;
  readonly candidate: VerifiedCandidateV1;
  readonly contract_sha256: string;
  readonly worker_round_receipt_sha256: string;
  readonly check_receipt_sha256: string;
  readonly verifier_receipt_sha256: string;
  readonly verifier_profile_revision: string;
  readonly satisfied_constraints: readonly string[];
  readonly unsatisfied_constraints: readonly string[];
  readonly blocked_constraints: readonly string[];
  readonly integrity_findings: readonly string[];
  readonly untrusted_claims: readonly string[];
  readonly evidence_refs: readonly VerifiedEvidenceRefV1[];
  readonly assertion_sha256: string;
}

export interface DecisionRequestV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof DECISION_REQUEST_KIND;
  readonly decision_id: string;
  readonly task_fence: VerifiedTaskFenceV1;
  readonly binding_fence: VerifiedBindingFenceV1;
  readonly previous_assertion_sha256: string | null;
  readonly question: string;
  readonly request_sha256: string;
}

export type DecisionTransition = 'open' | 'answer' | 'cancel' | 'supersede';
export type DecisionState = 'open' | 'answered' | 'cancelled' | 'superseded';
export type DecisionActor =
  | { readonly kind: 'engineer'; readonly principal_ref: string; readonly binding_generation: number }
  | { readonly kind: 'human'; readonly principal_ref: string; readonly binding_generation: null };

export interface DecisionRequestEventV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof DECISION_REQUEST_EVENT_KIND;
  readonly transition_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly decision_id: string;
  readonly request_sha256: string;
  readonly transition: DecisionTransition;
  readonly expected_current_digest: string | null;
  readonly actor: DecisionActor;
  readonly next_state: DecisionState;
  readonly answer: string | null;
  readonly event_sha256: string;
}

export interface DecisionRequestCurrentV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof DECISION_REQUEST_CURRENT_KIND;
  readonly decision_id: string;
  readonly request_sha256: string;
  readonly current_event_sha256: string;
  readonly state: DecisionState;
  readonly answer: string | null;
  readonly answered_by: string | null;
  readonly previous_current_digest: string | null;
  readonly current_digest: string;
}

export interface VerifiedCheckpointV1 {
  readonly round_index: number;
  readonly proposal_sha256: string;
  readonly round_receipt_sha256: string;
  readonly assertion_sha256: string;
  readonly candidate: VerifiedCandidateV1;
  readonly satisfied_constraints: readonly string[];
  readonly unsatisfied_constraints: readonly string[];
  readonly blocked_constraints: readonly string[];
}

export interface AnsweredDecisionProjectionV1 {
  readonly decision_id: string;
  readonly request_sha256: string;
  readonly current_digest: string;
  readonly answer: string;
  readonly answered_by: string;
}

export interface VerifiedEvidenceContextV1 {
  readonly protocol: typeof VERIFIED_CONTEXT_PROTOCOL;
  readonly kind: typeof VERIFIED_EVIDENCE_CONTEXT_KIND;
  readonly task: VerifiedTaskFenceV1;
  readonly binding: VerifiedBindingFenceV1;
  readonly contract_projection_sha256: string;
  readonly contract_sha256: string;
  readonly selected_assertion_sha256: string | null;
  readonly assertion_chain: readonly string[];
  readonly checkpoints: readonly VerifiedCheckpointV1[];
  readonly trusted_evidence_refs: readonly VerifiedEvidenceRefV1[];
  readonly untrusted_claims: readonly string[];
  readonly answered_decisions: readonly AnsweredDecisionProjectionV1[];
  readonly context_packet_sha256: string;
}

export type VerifiedContextErrorCode = 'verified_context_invalid' | 'verified_context_ambiguous' | 'verified_context_blocked';

export class VerifiedContextError extends Error {
  constructor(readonly code: VerifiedContextErrorCode, message: string) {
    super(message);
    this.name = 'VerifiedContextError';
  }
}

function fail(code: VerifiedContextErrorCode, message: string): never {
  throw new VerifiedContextError(code, message);
}

const invalid = (message: string): never => fail('verified_context_invalid', message);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function required(value: unknown, field: string, maximum = 4096): string {
  const text = messageRequiredString(value, field, invalid);
  assertMessageBoundedUtf8(text, field, maximum, invalid);
  return text;
}

function sha(value: unknown, field: string): string {
  const text = required(value, field, 71);
  assertMessageSha256(text, field, invalid);
  return text;
}

function uuid(value: unknown, field: string): string {
  const text = required(value, field, 36);
  assertMessageUuid(text, field, invalid);
  return text;
}

function opaque(value: unknown, field: string, maximum = 1024): string {
  const text = required(value, field, maximum);
  if (/\u0000|[\u0001-\u001f\u007f]/u.test(text)) invalid(`${field} is invalid`);
  return text;
}

function taskDigest(value: unknown, field: string): string {
  const text = required(value, field, 64);
  if (!TASK.test(text)) invalid(`${field} is invalid`);
  return text;
}

function gitOid(value: unknown, field: string): string {
  const text = required(value, field, 64);
  if (!GIT_OID.test(text)) invalid(`${field} is invalid`);
  return text;
}

function constraintId(value: unknown, field: string): string {
  const text = required(value, field, 128);
  if (!CONSTRAINT.test(text)) invalid(`${field} is invalid`);
  return text;
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function sortedUniqueStrings(values: unknown, label: string, validate: (value: unknown, field: string) => string, allowEmpty = false): readonly string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) invalid(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  const sorted = (values as unknown[]).map((item) => validate(item, label)).sort(byteCompare);
  if (new Set(sorted).size !== sorted.length) invalid(`${label} contains duplicates`);
  return Object.freeze(sorted);
}

function taskFence(value: VerifiedTaskFenceV1): VerifiedTaskFenceV1 {
  const input = record(value, 'task fence');
  assertMessageExactKeys(input, ['task_id', 'task_revision', 'claim_id', 'lease_generation'], 'task fence', invalid);
  const claim = uuid(input.claim_id, 'claim_id');
  assertMessageInteger(input.lease_generation, 'lease_generation', 0, invalid);
  return Object.freeze({ task_id: taskDigest(input.task_id, 'task_id'), task_revision: taskDigest(input.task_revision, 'task_revision'), claim_id: claim, lease_generation: input.lease_generation });
}

function bindingFence(value: VerifiedBindingFenceV1): VerifiedBindingFenceV1 {
  const input = record(value, 'binding fence');
  assertMessageExactKeys(input, ['engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision'], 'binding fence', invalid);
  const engineer = required(input.engineer_id, 'engineer_id', 256);
  if (!ENGINEER.test(engineer)) invalid('engineer_id is invalid');
  const binding = uuid(input.binding_id, 'binding_id');
  assertMessageInteger(input.binding_generation, 'binding_generation', 1, invalid);
  return Object.freeze({ engineer_id: engineer, binding_id: binding, binding_generation: input.binding_generation, engineer_contract_revision: sha(input.engineer_contract_revision, 'engineer_contract_revision') });
}

function evidenceRef(value: VerifiedEvidenceRefV1): VerifiedEvidenceRefV1 {
  const input = record(value, 'evidence ref');
  assertMessageExactKeys(input, ['ref', 'sha256'], 'evidence ref', invalid);
  const ref = required(input.ref, 'evidence ref.ref', 2048);
  if (!REF.test(ref) || ref.includes('/../') || ref.endsWith('/..')) invalid('evidence ref.ref is invalid');
  return Object.freeze({ ref, sha256: sha(input.sha256, 'evidence ref.sha256') });
}

function evidenceRefs(values: unknown, label: string, allowEmpty = false): readonly VerifiedEvidenceRefV1[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) invalid(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  const sorted = (values as unknown[]).map((item) => evidenceRef(item as VerifiedEvidenceRefV1)).sort((left, right) => byteCompare(`${left.ref}\0${left.sha256}`, `${right.ref}\0${right.sha256}`));
  const keys = sorted.map((item) => `${item.ref}\0${item.sha256}`);
  if (new Set(keys).size !== keys.length) invalid(`${label} contains duplicates`);
  return Object.freeze(sorted);
}

function mergedEvidenceRefs(values: readonly VerifiedEvidenceRefV1[], label: string): readonly VerifiedEvidenceRefV1[] {
  const byRef = new Map<string, VerifiedEvidenceRefV1>();
  for (const value of values.map(evidenceRef)) {
    const existing = byRef.get(value.ref);
    if (existing && existing.sha256 !== value.sha256) invalid(`${label} contains conflicting bytes for ${value.ref}`);
    byRef.set(value.ref, value);
  }
  return Object.freeze([...byRef.values()].sort((left, right) => byteCompare(`${left.ref}\0${left.sha256}`, `${right.ref}\0${right.sha256}`)));
}

function candidate(value: VerifiedCandidateV1): VerifiedCandidateV1 {
  const input = record(value, 'candidate');
  assertMessageExactKeys(input, ['commit_sha', 'tree_sha', 'subject_sha256'], 'candidate', invalid);
  return Object.freeze({ commit_sha: gitOid(input.commit_sha, 'candidate.commit_sha'), tree_sha: gitOid(input.tree_sha, 'candidate.tree_sha'), subject_sha256: sha(input.subject_sha256, 'candidate.subject_sha256') });
}

function nullableSha(value: unknown, field: string): string | null {
  const text = messageNullableString(value, field, invalid);
  return text === null ? null : sha(text, field);
}

function canonical(value: unknown): string {
  return canonicalMessageBytes(value as Readonly<Record<string, unknown>>);
}

function digestBasis<T extends Readonly<Record<string, unknown>>>(value: T): string {
  return canonicalMessageDigest(value);
}

export function buildSemanticContractProjection(input: Omit<SemanticContractProjectionV1, 'protocol' | 'kind' | 'projection_sha256'>): SemanticContractProjectionV1 {
  if (!Array.isArray(input.constraints) || input.constraints.length === 0) invalid('constraints must be non-empty');
  const constraints = input.constraints.map((item) => {
    const row = record(item, 'semantic constraint');
    assertMessageExactKeys(row, ['constraint_id', 'statement'], 'semantic constraint', invalid);
    return Object.freeze({ constraint_id: constraintId(row.constraint_id, 'constraint_id'), statement: required(row.statement, 'statement', 4096) });
  }).sort((left, right) => byteCompare(left.constraint_id, right.constraint_id));
  if (new Set(constraints.map((item) => item.constraint_id)).size !== constraints.length) invalid('constraints contain duplicate IDs');
  const contractRef = required(input.contract_ref, 'contract_ref', 2048);
  if (contractRef.startsWith('/') || contractRef.split('/').includes('..') || !contractRef.endsWith('.contract.md')) invalid('contract_ref is invalid');
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: SEMANTIC_CONTRACT_PROJECTION_KIND, contract_ref: contractRef, contract_revision: gitOid(input.contract_revision, 'contract_revision'), contract_blob_oid: gitOid(input.contract_blob_oid, 'contract_blob_oid'), contract_sha256: sha(input.contract_sha256, 'contract_sha256'), constraints: Object.freeze(constraints) });
  return Object.freeze({ ...basis, projection_sha256: digestBasis(basis) });
}

export function validateSemanticContractProjection(value: unknown): SemanticContractProjectionV1 {
  const input = record(value, 'semantic contract projection');
  assertMessageExactKeys(input, ['protocol', 'kind', 'contract_ref', 'contract_revision', 'contract_blob_oid', 'contract_sha256', 'constraints', 'projection_sha256'], 'semantic contract projection', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== SEMANTIC_CONTRACT_PROJECTION_KIND || !Array.isArray(input.constraints)) invalid('semantic contract projection protocol, kind or constraints are invalid');
  const built = buildSemanticContractProjection({ contract_ref: input.contract_ref as string, contract_revision: input.contract_revision as string, contract_blob_oid: input.contract_blob_oid as string, contract_sha256: input.contract_sha256 as string, constraints: input.constraints as unknown as readonly SemanticConstraintV1[] });
  if (input.projection_sha256 !== built.projection_sha256 || canonical(input) !== canonicalSemanticContractProjectionBytes(built)) invalid('semantic contract projection digest or order is stale');
  return built;
}

export const canonicalSemanticContractProjectionBytes = (value: SemanticContractProjectionV1): string => canonical(value);

function proposalBasis(input: Omit<EngineerStepProposalV1, 'protocol' | 'kind' | 'proposal_sha256'>): Omit<EngineerStepProposalV1, 'proposal_sha256'> {
  assertMessageInteger(input.round_index, 'round_index', 0, invalid);
  if (!['analyze', 'diagnose', 'implement', 'verify', 'request_decision'].includes(input.action_kind)) invalid('action_kind is invalid');
  return Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: ENGINEER_STEP_PROPOSAL_KIND, proposal_id: uuid(input.proposal_id, 'proposal_id'), task: taskFence(input.task), binding: bindingFence(input.binding), round_index: input.round_index, previous_assertion_sha256: nullableSha(input.previous_assertion_sha256, 'previous_assertion_sha256'), contract_sha256: sha(input.contract_sha256, 'contract_sha256'), context_packet_sha256: sha(input.context_packet_sha256, 'context_packet_sha256'), action_kind: input.action_kind, target_constraint_ids: sortedUniqueStrings(input.target_constraint_ids, 'target_constraint_ids', constraintId), input_evidence_refs: evidenceRefs(input.input_evidence_refs, 'input_evidence_refs', true) });
}

export function buildEngineerStepProposal(input: Omit<EngineerStepProposalV1, 'protocol' | 'kind' | 'proposal_sha256'>, contract: SemanticContractProjectionV1): EngineerStepProposalV1 {
  const projection = validateSemanticContractProjection(contract);
  const basis = proposalBasis(input);
  if (basis.contract_sha256 !== projection.contract_sha256) invalid('proposal contract_sha256 does not match projection');
  const allowed = new Set(projection.constraints.map((item) => item.constraint_id));
  if (basis.target_constraint_ids.some((item) => !allowed.has(item))) invalid('proposal target constraint is absent from exact Contract');
  return Object.freeze({ ...basis, proposal_sha256: digestBasis(basis) });
}

export function validateEngineerStepProposal(value: unknown): EngineerStepProposalV1 {
  const input = record(value, 'engineer step proposal');
  assertMessageExactKeys(input, ['protocol', 'kind', 'proposal_id', 'task', 'binding', 'round_index', 'previous_assertion_sha256', 'contract_sha256', 'context_packet_sha256', 'action_kind', 'target_constraint_ids', 'input_evidence_refs', 'proposal_sha256'], 'engineer step proposal', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== ENGINEER_STEP_PROPOSAL_KIND) invalid('engineer step proposal protocol or kind is invalid');
  const basis = proposalBasis(input as unknown as Omit<EngineerStepProposalV1, 'protocol' | 'kind' | 'proposal_sha256'>);
  const built = Object.freeze({ ...basis, proposal_sha256: digestBasis(basis) });
  if (input.proposal_sha256 !== built.proposal_sha256 || canonical(input) !== canonical(built)) invalid('engineer step proposal digest or order is stale');
  return built;
}
export const canonicalEngineerStepProposalBytes = (value: EngineerStepProposalV1): string => canonical(validateEngineerStepProposal(value));

function roundBasis(input: Omit<WorkerRoundReceiptV1, 'protocol' | 'kind' | 'round_receipt_sha256'>): Omit<WorkerRoundReceiptV1, 'round_receipt_sha256'> {
  assertMessageInteger(input.round_index, 'round_index', 0, invalid);
  return Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: WORKER_ROUND_RECEIPT_KIND, worker_run_id: uuid(input.worker_run_id, 'worker_run_id'), worker_run_ref_sha256: sha(input.worker_run_ref_sha256, 'worker_run_ref_sha256'), worker_runtime_receipt_sha256: sha(input.worker_runtime_receipt_sha256, 'worker_runtime_receipt_sha256'), delegation_id: uuid(input.delegation_id, 'delegation_id'), round_index: input.round_index, proposal_sha256: sha(input.proposal_sha256, 'proposal_sha256'), result_sha256: sha(input.result_sha256, 'result_sha256'), candidate: input.candidate === null ? null : candidate(input.candidate), before_state_sha256: sha(input.before_state_sha256, 'before_state_sha256'), after_state_sha256: sha(input.after_state_sha256, 'after_state_sha256'), evidence_refs: evidenceRefs(input.evidence_refs, 'evidence_refs', true) });
}

export function buildWorkerRoundReceipt(input: Omit<WorkerRoundReceiptV1, 'protocol' | 'kind' | 'round_receipt_sha256'>): WorkerRoundReceiptV1 {
  const basis = roundBasis(input);
  return Object.freeze({ ...basis, round_receipt_sha256: digestBasis(basis) });
}

export function validateWorkerRoundReceipt(value: unknown): WorkerRoundReceiptV1 {
  const input = record(value, 'worker round receipt');
  assertMessageExactKeys(input, ['protocol', 'kind', 'worker_run_id', 'worker_run_ref_sha256', 'worker_runtime_receipt_sha256', 'delegation_id', 'round_index', 'proposal_sha256', 'result_sha256', 'candidate', 'before_state_sha256', 'after_state_sha256', 'evidence_refs', 'round_receipt_sha256'], 'worker round receipt', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== WORKER_ROUND_RECEIPT_KIND) invalid('worker round receipt protocol or kind is invalid');
  const basis = roundBasis(input as unknown as Omit<WorkerRoundReceiptV1, 'protocol' | 'kind' | 'round_receipt_sha256'>);
  const built = Object.freeze({ ...basis, round_receipt_sha256: digestBasis(basis) });
  if (input.round_receipt_sha256 !== built.round_receipt_sha256 || canonical(input) !== canonical(built)) invalid('worker round receipt digest or order is stale');
  return built;
}
export const canonicalWorkerRoundReceiptBytes = (value: WorkerRoundReceiptV1): string => canonical(validateWorkerRoundReceipt(value));

function assertionBasis(input: Omit<SemanticVerificationAssertionV1, 'protocol' | 'kind' | 'assertion_sha256'>): Omit<SemanticVerificationAssertionV1, 'assertion_sha256'> {
  assertMessageInteger(input.round_index, 'round_index', 0, invalid);
  const checkReceipt = sha(input.check_receipt_sha256, 'check_receipt_sha256');
  const verifierReceipt = sha(input.verifier_receipt_sha256, 'verifier_receipt_sha256');
  // The Worker check and the Verifier judgement are independent artifacts; one
  // digest standing for both would let a single run vouch for itself.
  if (checkReceipt === verifierReceipt) invalid('check_receipt_sha256 and verifier_receipt_sha256 must name distinct artifacts');
  return Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: SEMANTIC_VERIFICATION_ASSERTION_KIND, assertion_id: uuid(input.assertion_id, 'assertion_id'), worker_run_id: uuid(input.worker_run_id, 'worker_run_id'), round_index: input.round_index, previous_assertion_sha256: nullableSha(input.previous_assertion_sha256, 'previous_assertion_sha256'), task: taskFence(input.task), candidate: candidate(input.candidate), contract_sha256: sha(input.contract_sha256, 'contract_sha256'), worker_round_receipt_sha256: sha(input.worker_round_receipt_sha256, 'worker_round_receipt_sha256'), check_receipt_sha256: checkReceipt, verifier_receipt_sha256: verifierReceipt, verifier_profile_revision: sha(input.verifier_profile_revision, 'verifier_profile_revision'), satisfied_constraints: sortedUniqueStrings(input.satisfied_constraints, 'satisfied_constraints', constraintId, true), unsatisfied_constraints: sortedUniqueStrings(input.unsatisfied_constraints, 'unsatisfied_constraints', constraintId, true), blocked_constraints: sortedUniqueStrings(input.blocked_constraints, 'blocked_constraints', constraintId, true), integrity_findings: sortedUniqueStrings(input.integrity_findings, 'integrity_findings', (value, field) => opaque(value, field, 4096), true), untrusted_claims: sortedUniqueStrings(input.untrusted_claims, 'untrusted_claims', (value, field) => opaque(value, field, 4096), true), evidence_refs: evidenceRefs(input.evidence_refs, 'evidence_refs', true) });
}

export function buildSemanticVerificationAssertion(input: Omit<SemanticVerificationAssertionV1, 'protocol' | 'kind' | 'assertion_sha256'>): SemanticVerificationAssertionV1 {
  const basis = assertionBasis(input);
  const all = [...basis.satisfied_constraints, ...basis.unsatisfied_constraints, ...basis.blocked_constraints];
  if (new Set(all).size !== all.length) invalid('assertion constraint sets overlap');
  return Object.freeze({ ...basis, assertion_sha256: digestBasis(basis) });
}

export function validateSemanticVerificationAssertion(value: unknown): SemanticVerificationAssertionV1 {
  const input = record(value, 'semantic verification assertion');
  assertMessageExactKeys(input, ['protocol', 'kind', 'assertion_id', 'worker_run_id', 'round_index', 'previous_assertion_sha256', 'task', 'candidate', 'contract_sha256', 'worker_round_receipt_sha256', 'check_receipt_sha256', 'verifier_receipt_sha256', 'verifier_profile_revision', 'satisfied_constraints', 'unsatisfied_constraints', 'blocked_constraints', 'integrity_findings', 'untrusted_claims', 'evidence_refs', 'assertion_sha256'], 'semantic verification assertion', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== SEMANTIC_VERIFICATION_ASSERTION_KIND) invalid('semantic verification assertion protocol or kind is invalid');
  const built = buildSemanticVerificationAssertion(input as unknown as Omit<SemanticVerificationAssertionV1, 'protocol' | 'kind' | 'assertion_sha256'>);
  if (input.assertion_sha256 !== built.assertion_sha256 || canonical(input) !== canonical(built)) invalid('semantic verification assertion digest or order is stale');
  return built;
}
export const canonicalSemanticVerificationAssertionBytes = (value: SemanticVerificationAssertionV1): string => canonical(validateSemanticVerificationAssertion(value));

export function buildDecisionRequest(input: Omit<DecisionRequestV1, 'protocol' | 'kind' | 'request_sha256'>): DecisionRequestV1 {
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: DECISION_REQUEST_KIND, decision_id: uuid(input.decision_id, 'decision_id'), task_fence: taskFence(input.task_fence), binding_fence: bindingFence(input.binding_fence), previous_assertion_sha256: nullableSha(input.previous_assertion_sha256, 'previous_assertion_sha256'), question: opaque(input.question, 'question', 16 * 1024) });
  return Object.freeze({ ...basis, request_sha256: digestBasis(basis) });
}

export function validateDecisionRequest(value: unknown): DecisionRequestV1 {
  const input = record(value, 'decision request');
  assertMessageExactKeys(input, ['protocol', 'kind', 'decision_id', 'task_fence', 'binding_fence', 'previous_assertion_sha256', 'question', 'request_sha256'], 'decision request', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== DECISION_REQUEST_KIND) invalid('decision request protocol or kind is invalid');
  const built = buildDecisionRequest(input as unknown as Omit<DecisionRequestV1, 'protocol' | 'kind' | 'request_sha256'>);
  if (input.request_sha256 !== built.request_sha256 || canonical(input) !== canonical(built)) invalid('decision request digest is stale');
  return built;
}
export const canonicalDecisionRequestBytes = (value: DecisionRequestV1): string => canonical(validateDecisionRequest(value));

export interface DecisionTransitionInput {
  readonly idempotency_key: string;
  readonly transition: DecisionTransition;
  readonly expected_current_digest: string | null;
  readonly actor: DecisionActor;
  readonly answer: string | null;
}

export function deriveDecisionTransitionId(decisionId: string, idempotencyKey: string): string {
  return canonicalMessageDigest({ domain: 'repo-harness-decision-transition.v1', decision_id: uuid(decisionId, 'decision_id'), idempotency_key: opaque(idempotencyKey, 'idempotency_key', 512) });
}

function decisionOperationFingerprint(input: { readonly decision_id: string; readonly request_sha256: string; readonly transition: DecisionTransition; readonly expected_current_digest: string | null; readonly actor: DecisionActor; readonly answer: string | null }): string {
  return canonicalMessageDigest({ domain: 'repo-harness-decision-operation.v1', ...input });
}

export function deriveDecisionOperationFingerprint(request: DecisionRequestV1, transitionInput: DecisionTransitionInput): string {
  const exactRequest = validateDecisionRequest(request);
  if (!['open', 'answer', 'cancel', 'supersede'].includes(transitionInput.transition)) invalid('decision transition is invalid');
  const actor = decisionActor(transitionInput.actor);
  const expected = nullableSha(transitionInput.expected_current_digest, 'expected_current_digest');
  const answer = messageNullableString(transitionInput.answer, 'answer', invalid);
  if (answer !== null) assertMessageBoundedUtf8(answer, 'answer', 16 * 1024, invalid);
  return decisionOperationFingerprint({ decision_id: exactRequest.decision_id, request_sha256: exactRequest.request_sha256, transition: transitionInput.transition, expected_current_digest: expected, actor, answer });
}

function decisionActor(value: DecisionActor): DecisionActor {
  const input = record(value, 'decision actor');
  assertMessageExactKeys(input, ['kind', 'principal_ref', 'binding_generation'], 'decision actor', invalid);
  if (input.kind !== 'engineer' && input.kind !== 'human') invalid('decision actor kind is invalid');
  const principal = opaque(input.principal_ref, 'principal_ref', 1024);
  if (input.kind === 'engineer') {
    assertMessageInteger(input.binding_generation, 'binding_generation', 1, invalid);
    return Object.freeze({ kind: 'engineer', principal_ref: principal, binding_generation: input.binding_generation });
  }
  if (input.binding_generation !== null) invalid('human binding_generation must be null');
  return Object.freeze({ kind: 'human', principal_ref: principal, binding_generation: null });
}

export function buildDecisionRequestEvent(request: DecisionRequestV1, previous: DecisionRequestCurrentV1 | null, transitionInput: DecisionTransitionInput): DecisionRequestEventV1 {
  const exactRequest = validateDecisionRequest(request);
  const transition = transitionInput.transition;
  if (!['open', 'answer', 'cancel', 'supersede'].includes(transition)) invalid('decision transition is invalid');
  const actor = decisionActor(transitionInput.actor);
  const expected = nullableSha(transitionInput.expected_current_digest, 'expected_current_digest');
  const answer = messageNullableString(transitionInput.answer, 'answer', invalid);
  if (answer !== null) assertMessageBoundedUtf8(answer, 'answer', 16 * 1024, invalid);
  if (transition === 'open') {
    if (previous !== null || expected !== null || actor.kind !== 'engineer' || answer !== null) invalid('open transition actor or fence is invalid');
    if (actor.binding_generation !== exactRequest.binding_fence.binding_generation) invalid('opening engineer binding generation is stale');
  } else {
    if (previous === null || previous.state !== 'open' || expected !== previous.current_digest) fail('verified_context_blocked', 'decision current fence is stale or not open');
    if (previous.decision_id !== exactRequest.decision_id || previous.request_sha256 !== exactRequest.request_sha256) invalid('decision current does not match request');
    if (transition === 'answer' && (actor.kind !== 'human' || answer === null)) invalid('only a Human may answer with non-empty bytes');
    if (transition === 'cancel' && (answer !== null || (actor.kind === 'engineer' && actor.binding_generation !== exactRequest.binding_fence.binding_generation))) invalid('cancel actor or answer is invalid');
    if (transition === 'supersede' && (actor.kind !== 'engineer' || answer !== null || actor.binding_generation !== exactRequest.binding_fence.binding_generation)) invalid('supersede actor is invalid');
  }
  const nextState: DecisionState = transition === 'open' ? 'open' : transition === 'answer' ? 'answered' : transition === 'cancel' ? 'cancelled' : 'superseded';
  const idempotencyKey = opaque(transitionInput.idempotency_key, 'idempotency_key', 512);
  const fingerprint = deriveDecisionOperationFingerprint(exactRequest, transitionInput);
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: DECISION_REQUEST_EVENT_KIND, transition_id: deriveDecisionTransitionId(exactRequest.decision_id, idempotencyKey), idempotency_key: idempotencyKey, operation_fingerprint: fingerprint, decision_id: exactRequest.decision_id, request_sha256: exactRequest.request_sha256, transition, expected_current_digest: expected, actor, next_state: nextState, answer });
  return Object.freeze({ ...basis, event_sha256: digestBasis(basis) });
}

export function validateDecisionRequestEvent(value: unknown): DecisionRequestEventV1 {
  const input = record(value, 'decision request event');
  assertMessageExactKeys(input, ['protocol', 'kind', 'transition_id', 'idempotency_key', 'operation_fingerprint', 'decision_id', 'request_sha256', 'transition', 'expected_current_digest', 'actor', 'next_state', 'answer', 'event_sha256'], 'decision request event', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== DECISION_REQUEST_EVENT_KIND) invalid('decision request event protocol or kind is invalid');
  const actor = decisionActor(input.actor as DecisionActor);
  const transition = input.transition as DecisionTransition;
  if (!['open', 'answer', 'cancel', 'supersede'].includes(transition)) invalid('decision transition is invalid');
  const next = transition === 'open' ? 'open' : transition === 'answer' ? 'answered' : transition === 'cancel' ? 'cancelled' : 'superseded';
  if (input.next_state !== next) invalid('decision next_state is invalid');
  const decisionId = uuid(input.decision_id, 'decision_id');
  const key = opaque(input.idempotency_key, 'idempotency_key', 512);
  const expected = nullableSha(input.expected_current_digest, 'expected_current_digest');
  const answer = messageNullableString(input.answer, 'answer', invalid);
  if (answer !== null) assertMessageBoundedUtf8(answer, 'answer', 16 * 1024, invalid);
  const requestSha = sha(input.request_sha256, 'request_sha256');
  const fingerprint = decisionOperationFingerprint({ decision_id: decisionId, request_sha256: requestSha, transition, expected_current_digest: expected, actor, answer });
  if (input.operation_fingerprint !== fingerprint) invalid('decision operation_fingerprint is stale');
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: DECISION_REQUEST_EVENT_KIND, transition_id: deriveDecisionTransitionId(decisionId, key), idempotency_key: key, operation_fingerprint: fingerprint, decision_id: decisionId, request_sha256: requestSha, transition, expected_current_digest: expected, actor, next_state: next, answer });
  const built = Object.freeze({ ...basis, event_sha256: digestBasis(basis) });
  if (input.transition_id !== built.transition_id || input.event_sha256 !== built.event_sha256 || canonical(input) !== canonical(built)) invalid('decision request event digest or order is stale');
  return built;
}
export const canonicalDecisionRequestEventBytes = (value: DecisionRequestEventV1): string => canonical(validateDecisionRequestEvent(value));

export function buildDecisionRequestCurrent(event: DecisionRequestEventV1, previous: DecisionRequestCurrentV1 | null): DecisionRequestCurrentV1 {
  const exactEvent = validateDecisionRequestEvent(event);
  if ((previous === null) !== (exactEvent.transition === 'open')) invalid('decision current predecessor is invalid');
  if (previous !== null && exactEvent.expected_current_digest !== previous.current_digest) fail('verified_context_blocked', 'decision current CAS is stale');
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: DECISION_REQUEST_CURRENT_KIND, decision_id: exactEvent.decision_id, request_sha256: exactEvent.request_sha256, current_event_sha256: exactEvent.event_sha256, state: exactEvent.next_state, answer: exactEvent.next_state === 'answered' ? exactEvent.answer : null, answered_by: exactEvent.next_state === 'answered' ? exactEvent.actor.principal_ref : null, previous_current_digest: previous?.current_digest ?? null });
  return Object.freeze({ ...basis, current_digest: digestBasis(basis) });
}

export function validateDecisionRequestCurrent(value: unknown): DecisionRequestCurrentV1 {
  const input = record(value, 'decision request current');
  assertMessageExactKeys(input, ['protocol', 'kind', 'decision_id', 'request_sha256', 'current_event_sha256', 'state', 'answer', 'answered_by', 'previous_current_digest', 'current_digest'], 'decision request current', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== DECISION_REQUEST_CURRENT_KIND || !['open', 'answered', 'cancelled', 'superseded'].includes(input.state as string)) invalid('decision current protocol, kind or state is invalid');
  const state = input.state as DecisionState;
  const answer = messageNullableString(input.answer, 'answer', invalid);
  const answeredBy = messageNullableString(input.answered_by, 'answered_by', invalid);
  if ((state === 'answered') !== (answer !== null && answeredBy !== null)) invalid('decision answered projection is invalid');
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: DECISION_REQUEST_CURRENT_KIND, decision_id: uuid(input.decision_id, 'decision_id'), request_sha256: sha(input.request_sha256, 'request_sha256'), current_event_sha256: sha(input.current_event_sha256, 'current_event_sha256'), state, answer, answered_by: answeredBy, previous_current_digest: nullableSha(input.previous_current_digest, 'previous_current_digest') });
  const built = Object.freeze({ ...basis, current_digest: digestBasis(basis) });
  if (input.current_digest !== built.current_digest || canonical(input) !== canonical(built)) invalid('decision current digest or order is stale');
  return built;
}
export const canonicalDecisionRequestCurrentBytes = (value: DecisionRequestCurrentV1): string => canonical(validateDecisionRequestCurrent(value));

export interface CompileVerifiedEvidenceContextInput {
  readonly contract: SemanticContractProjectionV1;
  readonly task: VerifiedTaskFenceV1;
  readonly binding: VerifiedBindingFenceV1;
  readonly proposals: readonly EngineerStepProposalV1[];
  readonly rounds: readonly WorkerRoundReceiptV1[];
  readonly assertions: readonly SemanticVerificationAssertionV1[];
  readonly worker_run_refs: readonly WorkerRunRefV1[];
  readonly worker_results: readonly WorkerResultV1[];
  readonly decisions: readonly { readonly request: DecisionRequestV1; readonly current: DecisionRequestCurrentV1 }[];
}

function equal(left: unknown, right: unknown): boolean { return canonicalMessageBytes(left as Readonly<Record<string, unknown>>) === canonicalMessageBytes(right as Readonly<Record<string, unknown>>); }

export function compileVerifiedEvidenceContext(input: CompileVerifiedEvidenceContextInput): VerifiedEvidenceContextV1 {
  const contract = validateSemanticContractProjection(input.contract);
  const task = taskFence(input.task);
  const binding = bindingFence(input.binding);
  const proposals = input.proposals.map(validateEngineerStepProposal);
  const rounds = input.rounds.map(validateWorkerRoundReceipt);
  const assertions = input.assertions.map(validateSemanticVerificationAssertion);
  const runRefs = input.worker_run_refs.map(validateWorkerRunRef);
  const results = input.worker_results.map(validateWorkerResult);
  const byProposal = uniqueMap(proposals, (item) => item.proposal_sha256, 'proposal');
  const byRound = uniqueMap(rounds, (item) => item.round_receipt_sha256, 'round receipt');
  const byRunRef = uniqueMap(runRefs, (item) => item.run_ref_sha256, 'worker run ref');
  const byResult = uniqueMap(results, (item) => item.result_sha256, 'worker result');
  const allowed = new Set(contract.constraints.map((item) => item.constraint_id));
  for (const proposal of proposals) {
    if (!equal(proposal.task, task) || !equal(proposal.binding, binding) || proposal.contract_sha256 !== contract.contract_sha256) invalid('proposal subject does not match requested context');
    if (proposal.target_constraint_ids.some((item) => !allowed.has(item))) invalid('proposal constraint is absent from exact Contract');
  }
  const roots = assertions.filter((item) => item.previous_assertion_sha256 === null);
  if (assertions.length > 0 && roots.length !== 1) fail('verified_context_ambiguous', 'assertion chain must have exactly one root');
  const children = new Map<string, SemanticVerificationAssertionV1[]>();
  for (const assertion of assertions) {
    if (!equal(assertion.task, task) || assertion.contract_sha256 !== contract.contract_sha256) invalid('assertion subject does not match requested context');
    if (assertion.previous_assertion_sha256 !== null) {
      const list = children.get(assertion.previous_assertion_sha256) ?? [];
      list.push(assertion);
      children.set(assertion.previous_assertion_sha256, list);
    }
  }
  const chain: SemanticVerificationAssertionV1[] = [];
  let cursor = roots[0] ?? null;
  while (cursor !== null) {
    chain.push(cursor);
    const next = children.get(cursor.assertion_sha256) ?? [];
    if (next.length > 1) fail('verified_context_ambiguous', 'assertion chain forks');
    cursor = next[0] ?? null;
  }
  if (chain.length !== assertions.length) fail('verified_context_ambiguous', 'assertion chain contains a gap, fork or unreachable assertion');
  const checkpoints: VerifiedCheckpointV1[] = [];
  const trustedRefs: VerifiedEvidenceRefV1[] = [];
  const untrustedClaims: string[] = [];
  const usedProposalDigests = new Set<string>();
  const usedRoundDigests = new Set<string>();
  const usedRunRefDigests = new Set<string>();
  const usedResultDigests = new Set<string>();
  for (let index = 0; index < chain.length; index += 1) {
    const assertion = chain[index]!;
    if (assertion.round_index !== index) fail('verified_context_ambiguous', 'assertion round indexes are not continuous from zero');
    const roundMaybe = byRound.get(assertion.worker_round_receipt_sha256);
    if (!roundMaybe) invalid('assertion Worker round is missing');
    const round = roundMaybe!;
    if (round.round_index !== assertion.round_index || round.worker_run_id !== assertion.worker_run_id || round.candidate === null || !equal(round.candidate, assertion.candidate)) invalid('assertion does not match its Worker round or candidate');
    const proposalMaybe = byProposal.get(round.proposal_sha256);
    if (!proposalMaybe) invalid('Worker round proposal is missing');
    const proposal = proposalMaybe!;
    if (proposal.round_index !== round.round_index || proposal.previous_assertion_sha256 !== assertion.previous_assertion_sha256) invalid('Worker round does not match its proposal or assertion chain');
    const runRefMaybe = byRunRef.get(round.worker_run_ref_sha256);
    const resultMaybe = byResult.get(round.result_sha256);
    if (!runRefMaybe) invalid('Worker run ref is missing');
    if (!resultMaybe) invalid('Worker result is missing');
    const runRef = runRefMaybe!;
    const result = resultMaybe!;
    if (runRef.worker_run_id !== round.worker_run_id || runRef.delegation_id !== round.delegation_id || runRef.execution_receipt_sha256 !== round.worker_runtime_receipt_sha256 || result.worker_run_id !== round.worker_run_id || result.delegation_id !== round.delegation_id || result.worker_run_ref_sha256 !== runRef.run_ref_sha256) invalid('Worker round does not match immutable delegated-run evidence');
    const partition = [...assertion.satisfied_constraints, ...assertion.unsatisfied_constraints, ...assertion.blocked_constraints].sort(byteCompare);
    if (JSON.stringify(partition) !== JSON.stringify([...proposal.target_constraint_ids].sort(byteCompare))) invalid('assertion constraint partition does not exactly cover proposal targets');
    const assertionEvidenceDigests = new Set(assertion.evidence_refs.map((item) => item.sha256));
    if (!assertionEvidenceDigests.has(assertion.check_receipt_sha256) || !assertionEvidenceDigests.has(assertion.verifier_receipt_sha256)) invalid('assertion evidence does not carry exact check and verifier receipts');
    usedProposalDigests.add(proposal.proposal_sha256);
    usedRoundDigests.add(round.round_receipt_sha256);
    usedRunRefDigests.add(runRef.run_ref_sha256);
    usedResultDigests.add(result.result_sha256);
    checkpoints.push(Object.freeze({ round_index: assertion.round_index, proposal_sha256: proposal.proposal_sha256, round_receipt_sha256: round.round_receipt_sha256, assertion_sha256: assertion.assertion_sha256, candidate: assertion.candidate, satisfied_constraints: assertion.satisfied_constraints, unsatisfied_constraints: assertion.unsatisfied_constraints, blocked_constraints: assertion.blocked_constraints }));
    trustedRefs.push(...proposal.input_evidence_refs, ...round.evidence_refs, ...assertion.evidence_refs);
    untrustedClaims.push(...result.untrusted_claims, ...assertion.untrusted_claims);
  }
  if (usedProposalDigests.size !== proposals.length || usedRoundDigests.size !== rounds.length || usedRunRefDigests.size !== runRefs.length || usedResultDigests.size !== results.length) {
    fail('verified_context_ambiguous', 'checkpoint inputs contain unreachable proposal, round or delegated-run evidence');
  }
  const answered: AnsweredDecisionProjectionV1[] = [];
  const decisionIds = new Set<string>();
  for (const pair of input.decisions) {
    const request = validateDecisionRequest(pair.request);
    const current = validateDecisionRequestCurrent(pair.current);
    if (!equal(request.task_fence, task) || !equal(request.binding_fence, binding) || request.request_sha256 !== current.request_sha256 || request.decision_id !== current.decision_id) invalid('decision subject does not match requested context');
    if (decisionIds.has(request.decision_id)) invalid('decision_id is duplicated');
    decisionIds.add(request.decision_id);
    if (current.state === 'open') fail('verified_context_blocked', `decision ${current.decision_id} is open`);
    if (current.state === 'answered') answered.push(Object.freeze({ decision_id: current.decision_id, request_sha256: current.request_sha256, current_digest: current.current_digest, answer: current.answer!, answered_by: current.answered_by! }));
  }
  const sortedRefs = mergedEvidenceRefs(trustedRefs, 'trusted_evidence_refs');
  const claims = sortedUniqueStrings(untrustedClaims, 'untrusted_claims', (value, field) => opaque(value, field, 4096), true);
  answered.sort((left, right) => byteCompare(left.decision_id, right.decision_id));
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: VERIFIED_EVIDENCE_CONTEXT_KIND, task, binding, contract_projection_sha256: contract.projection_sha256, contract_sha256: contract.contract_sha256, selected_assertion_sha256: chain.at(-1)?.assertion_sha256 ?? null, assertion_chain: Object.freeze(chain.map((item) => item.assertion_sha256)), checkpoints: Object.freeze(checkpoints), trusted_evidence_refs: sortedRefs, untrusted_claims: claims, answered_decisions: Object.freeze(answered) });
  return Object.freeze({ ...basis, context_packet_sha256: digestBasis(basis) });
}

function uniqueMap<T>(items: readonly T[], key: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (result.has(id)) invalid(`${label} digest is duplicated`);
    result.set(id, item);
  }
  return result;
}

export function validateVerifiedEvidenceContext(value: unknown): VerifiedEvidenceContextV1 {
  const input = record(value, 'verified evidence context');
  assertMessageExactKeys(input, ['protocol', 'kind', 'task', 'binding', 'contract_projection_sha256', 'contract_sha256', 'selected_assertion_sha256', 'assertion_chain', 'checkpoints', 'trusted_evidence_refs', 'untrusted_claims', 'answered_decisions', 'context_packet_sha256'], 'verified evidence context', invalid);
  if (input.protocol !== VERIFIED_CONTEXT_PROTOCOL || input.kind !== VERIFIED_EVIDENCE_CONTEXT_KIND || !Array.isArray(input.assertion_chain) || !Array.isArray(input.checkpoints) || !Array.isArray(input.answered_decisions)) invalid('verified evidence context shape is invalid');
  const task = taskFence(input.task as VerifiedTaskFenceV1);
  const binding = bindingFence(input.binding as VerifiedBindingFenceV1);
  const chain = Object.freeze((input.assertion_chain as unknown[]).map((item) => sha(item, 'assertion_chain')));
  const checkpoints = Object.freeze((input.checkpoints as unknown[]).map((item) => {
    const row = record(item, 'checkpoint');
    assertMessageExactKeys(row, ['round_index', 'proposal_sha256', 'round_receipt_sha256', 'assertion_sha256', 'candidate', 'satisfied_constraints', 'unsatisfied_constraints', 'blocked_constraints'], 'checkpoint', invalid);
    assertMessageInteger(row.round_index, 'checkpoint.round_index', 0, invalid);
    return Object.freeze({ round_index: row.round_index, proposal_sha256: sha(row.proposal_sha256, 'checkpoint.proposal_sha256'), round_receipt_sha256: sha(row.round_receipt_sha256, 'checkpoint.round_receipt_sha256'), assertion_sha256: sha(row.assertion_sha256, 'checkpoint.assertion_sha256'), candidate: candidate(row.candidate as VerifiedCandidateV1), satisfied_constraints: sortedUniqueStrings(row.satisfied_constraints, 'checkpoint.satisfied_constraints', constraintId, true), unsatisfied_constraints: sortedUniqueStrings(row.unsatisfied_constraints, 'checkpoint.unsatisfied_constraints', constraintId, true), blocked_constraints: sortedUniqueStrings(row.blocked_constraints, 'checkpoint.blocked_constraints', constraintId, true) });
  }));
  const answered = Object.freeze((input.answered_decisions as unknown[]).map((item) => {
    const row = record(item, 'answered decision');
    assertMessageExactKeys(row, ['decision_id', 'request_sha256', 'current_digest', 'answer', 'answered_by'], 'answered decision', invalid);
    return Object.freeze({ decision_id: uuid(row.decision_id, 'decision_id'), request_sha256: sha(row.request_sha256, 'request_sha256'), current_digest: sha(row.current_digest, 'current_digest'), answer: opaque(row.answer, 'answer', 16 * 1024), answered_by: opaque(row.answered_by, 'answered_by', 1024) });
  }));
  const selected = nullableSha(input.selected_assertion_sha256, 'selected_assertion_sha256');
  if (selected !== (chain.at(-1) ?? null) || chain.length !== checkpoints.length || checkpoints.some((item, index) => item.round_index !== index || item.assertion_sha256 !== chain[index])) invalid('verified evidence context chain projection is inconsistent');
  const basis = Object.freeze({ protocol: VERIFIED_CONTEXT_PROTOCOL, kind: VERIFIED_EVIDENCE_CONTEXT_KIND, task, binding, contract_projection_sha256: sha(input.contract_projection_sha256, 'contract_projection_sha256'), contract_sha256: sha(input.contract_sha256, 'contract_sha256'), selected_assertion_sha256: selected, assertion_chain: chain, checkpoints, trusted_evidence_refs: evidenceRefs(input.trusted_evidence_refs, 'trusted_evidence_refs', true), untrusted_claims: sortedUniqueStrings(input.untrusted_claims, 'untrusted_claims', (item, field) => opaque(item, field, 4096), true), answered_decisions: answered });
  const built = Object.freeze({ ...basis, context_packet_sha256: digestBasis(basis) });
  if (input.context_packet_sha256 !== built.context_packet_sha256 || canonical(input) !== canonical(built)) invalid('verified evidence context digest or order is stale');
  return built;
}
export const canonicalVerifiedEvidenceContextBytes = (value: VerifiedEvidenceContextV1): string => canonical(validateVerifiedEvidenceContext(value));
