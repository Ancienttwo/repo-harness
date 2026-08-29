import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageTimestamp,
  assertMessageUuid,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageNullableString,
  messageRequiredString,
} from '../messages/mechanics';

/**
 * ME-2A/ME-3B deliberately models a bounded, external effect.  These records
 * describe the control-plane facts around one Codex CLI invocation; they are
 * not an Agent runtime, a conversation, or a second claim authority.
 */
export const DELEGATION_PROTOCOL = 1 as const;
export const LOGICAL_ROLE_PROFILE_KIND = 'repo-harness-logical-role-profile' as const;
export const CODEX_READ_ONLY_CAPABILITY_KIND = 'repo-harness-codex-read-only-capability' as const;
export const EXECUTION_PACKET_KIND = 'repo-harness-delegation-execution-packet' as const;
export const DELEGATION_ENVELOPE_KIND = 'repo-harness-delegation-envelope' as const;
export const DELEGATION_ADMISSION_RECEIPT_KIND = 'repo-harness-delegation-admission-receipt' as const;
export const DELEGATED_RUN_INTENT_KIND = 'repo-harness-delegated-run-intent' as const;
export const DELEGATED_RUN_LAUNCH_CLAIM_KIND = 'repo-harness-delegated-run-launch-claim' as const;
export const DELEGATED_RUN_OBSERVATION_KIND = 'repo-harness-delegated-run-observation' as const;
export const WORKER_RUN_REF_KIND = 'repo-harness-worker-run-ref' as const;
export const WORKER_RESULT_KIND = 'repo-harness-worker-result' as const;
export const CODEX_READ_ONLY_ADAPTER_KIND = 'codex_exec_read_only' as const;

/**
 * The effective read-only proof is taken from the `codex sandbox` subcommand
 * while dispatch runs the `codex exec` subcommand.  `codex exec` cannot attempt
 * a mutation without a provider turn, so no credential-free deterministic
 * denial probe exists on the execution surface; the capability receipt records
 * that extrapolation instead of implying the two surfaces were both proven.
 */
export const CODEX_READ_ONLY_PROOF_SURFACE = 'sandbox_subcommand_extrapolated_to_exec' as const;

export const CODEX_READ_ONLY_ARGV_TEMPLATE = Object.freeze([
  'exec', '--sandbox', 'read-only', '--ephemeral', '--ignore-user-config', '--strict-config', '--json', '--model', '{model}', '-c', '{developer_instructions_config}', '{execution_packet}',
] as const);

const ROLE = /^[a-z][a-z0-9-]{0,63}$/u;
const ENGINEER = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const TASK = /^[0-9a-f]{64}$/u;
const OPAQUE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;
const RESULT_REF = /^[^\u0000-\u001f\u007f]{1,2048}$/u;

export type DelegationMode = 'read_only';
export type DelegationDecision = 'admitted' | 'rejected';
export type DelegationRejectionReason =
  | 'parent_stale'
  | 'binding_stale'
  | 'role_profile_unavailable'
  | 'role_profile_stale'
  | 'runtime_capability_stale'
  | 'sandbox_capability_unverified';
export type DelegatedRunState =
  | 'intent_persisted'
  | 'launch_claimed'
  | 'running'
  | 'collecting'
  | 'completed'
  | 'failed'
  | 'reconciliation_required';
export type DelegatedRunFailureClass =
  | 'none'
  | 'admission'
  | 'infrastructure'
  | 'provider'
  | 'sandbox_violation'
  | 'protected_state_changed'
  | 'unknown';

export interface LogicalRoleProfileV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof LOGICAL_ROLE_PROFILE_KIND;
  readonly logical_role: string;
  readonly source_ref: string;
  readonly toml_sha256: string;
  readonly model: string;
  readonly developer_instructions_sha256: string;
  /** Declared intent only. Effective enforcement is the capability receipt. */
  readonly declared_sandbox_mode: 'read_only';
  readonly role_profile_sha256: string;
}

export interface CodexReadOnlyCapabilityReceiptV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof CODEX_READ_ONLY_CAPABILITY_KIND;
  readonly adapter_kind: typeof CODEX_READ_ONLY_ADAPTER_KIND;
  readonly executable_path: string;
  readonly executable_sha256: string;
  readonly version: string;
  readonly model: string;
  readonly argv_template: readonly string[];
  readonly sandbox_mode: 'read_only';
  /** Digest of the exact minimal environment set handed to the child process. */
  readonly env_sha256: string;
  /** Which Codex subcommand the read-only proof was taken on. */
  readonly proof_surface: typeof CODEX_READ_ONLY_PROOF_SURFACE;
  readonly mutation_matrix_sha256: string;
  readonly protected_scope_sha256: string;
  readonly canary_before_snapshot_sha256: string;
  readonly canary_after_snapshot_sha256: string;
  readonly canary_process_receipt_sha256: string;
  readonly evidence_refs: readonly { readonly ref: string; readonly sha256: string }[];
  readonly observed_at: string;
  readonly capability_sha256: string;
}

export interface DelegationExecutionPacketV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof EXECUTION_PACKET_KIND;
  readonly delegation_id: string;
  readonly logical_role: string;
  readonly role_profile_sha256: string;
  readonly model: string;
  /** Exact tracked SOP/persona text carried to the external CLI boundary. */
  readonly role_instructions: string;
  readonly goal: string;
  /** Context metadata only; this is not a sandbox permission or read grant. */
  readonly allowed_read_paths: readonly string[];
  readonly max_turns: number;
  readonly max_depth: 0;
  readonly return_contract: 'WorkerResultV1';
  readonly packet_sha256: string;
}

export interface DelegationEnvelopeV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof DELEGATION_ENVELOPE_KIND;
  readonly delegation_id: string;
  readonly parent: {
    readonly task_id: string;
    readonly task_revision: string;
    readonly claim_id: string;
    readonly lease_generation: number;
    readonly work_envelope_sha256: string;
  };
  readonly engineer: {
    readonly engineer_id: string;
    readonly binding_id: string;
    readonly binding_generation: number;
    readonly claim_actor_receipt_sha256: string;
  };
  readonly logical_role: string;
  readonly role_profile_sha256: string;
  readonly runtime_capability_sha256: string;
  readonly execution_packet_sha256: string;
  readonly mode: DelegationMode;
  readonly goal: string;
  /** Context metadata only; this is not a sandbox permission or read grant. */
  readonly allowed_read_paths: readonly string[];
  readonly budget: { readonly max_turns: number; readonly max_depth: 0 };
  readonly return_contract: 'WorkerResultV1';
  readonly envelope_sha256: string;
}

export interface DelegationAdmissionReceiptV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof DELEGATION_ADMISSION_RECEIPT_KIND;
  readonly delegation_id: string;
  readonly envelope_sha256: string;
  readonly decision: DelegationDecision;
  readonly rejection_reason: DelegationRejectionReason | null;
  readonly admitted_role_profile_sha256: string | null;
  readonly admitted_mode: DelegationMode | null;
  readonly admitted_sandbox_policy_sha256: string | null;
  readonly expected_runtime_observation_sha256: string | null;
  readonly decided_at: string;
  readonly admission_receipt_sha256: string;
}

export interface DelegatedRunIntentV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof DELEGATED_RUN_INTENT_KIND;
  readonly dispatch_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly delegation_id: string;
  readonly admission_receipt_sha256: string;
  readonly round_index: number;
  readonly adapter_kind: typeof CODEX_READ_ONLY_ADAPTER_KIND;
  readonly context_packet_sha256: string;
  readonly intent_sha256: string;
}

export interface DelegatedRunLaunchClaimV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof DELEGATED_RUN_LAUNCH_CLAIM_KIND;
  readonly dispatch_id: string;
  readonly intent_sha256: string;
  readonly claimed_at: string;
  readonly launch_claim_sha256: string;
}

export interface DelegatedRunObservationV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof DELEGATED_RUN_OBSERVATION_KIND;
  readonly dispatch_id: string;
  readonly intent_sha256: string;
  readonly worker_run_ref: string | null;
  readonly runtime_principal_id: string | null;
  readonly state: DelegatedRunState;
  readonly failure_class: DelegatedRunFailureClass;
  readonly observed_capabilities_sha256: string;
  readonly protected_before_snapshot_sha256: string | null;
  readonly protected_after_snapshot_sha256: string | null;
  readonly process_receipt_sha256: string | null;
  readonly previous_observation_sha256: string | null;
  readonly observed_at: string;
  readonly observation_sha256: string;
}

export interface WorkerRunRefV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof WORKER_RUN_REF_KIND;
  readonly worker_run_id: string;
  readonly delegation_id: string;
  readonly admission_receipt_sha256: string;
  readonly runtime_kind: 'codex_exec';
  readonly logical_role: string;
  readonly role_profile_sha256: string;
  readonly runtime_principal_ref: string;
  readonly launch_claim_sha256: string;
  readonly execution_receipt_sha256: string;
  readonly read_only_sandbox_receipt_sha256: string;
  readonly run_ref_sha256: string;
}

/**
 * The `{ ref, sha256 }` evidence reference `WorkerResultV1` carries. Named so
 * that the collaboration plane's `ArtifactRefV1` can alias this exact type and
 * run this exact validator instead of growing a second equivalent shape.
 */
export interface WorkerEvidenceRefV1 {
  readonly ref: string;
  readonly sha256: string;
}

export interface WorkerResultV1 {
  readonly protocol: typeof DELEGATION_PROTOCOL;
  readonly kind: typeof WORKER_RESULT_KIND;
  readonly delegation_id: string;
  readonly worker_run_id: string;
  readonly worker_run_ref_sha256: string;
  readonly logical_role: string;
  readonly runtime_observation_sha256: string;
  readonly read_only_sandbox_receipt_sha256: string;
  readonly evidence_refs: readonly WorkerEvidenceRefV1[];
  /** Worker prose is evidence only; no authority transition consumes it here. */
  readonly untrusted_claims: readonly string[];
  readonly result_sha256: string;
}

export type DelegationErrorCode = 'delegation_invalid' | 'delegation_transition_invalid';

export class DelegationError extends Error {
  constructor(readonly code: DelegationErrorCode, message: string) {
    super(message);
    this.name = 'DelegationError';
  }
}

function invalid(message: string): never {
  throw new DelegationError('delegation_invalid', message);
}

function transitionInvalid(message: string): never {
  throw new DelegationError('delegation_transition_invalid', message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function required(value: unknown, field: string, maximum = 1024): string {
  const text = messageRequiredString(value, field, invalid);
  assertMessageBoundedUtf8(text, field, maximum, invalid);
  return text;
}

function opaque(value: unknown, field: string, maximum = 1024): string {
  const text = required(value, field, maximum);
  if (!OPAQUE.test(text)) invalid(`${field} is invalid`);
  return text;
}

function sha(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, invalid);
  assertMessageSha256(text, field, invalid);
  return text;
}

function uuid(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, invalid);
  assertMessageUuid(text, field, invalid);
  return text;
}

function role(value: unknown, field = 'logical_role'): string {
  const text = required(value, field, 64);
  if (!ROLE.test(text)) invalid(`${field} is invalid`);
  return text;
}

function task(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, invalid);
  if (!TASK.test(text)) invalid(`${field} is invalid`);
  return text;
}

function mode(value: unknown, field = 'mode'): DelegationMode {
  if (value !== 'read_only') invalid(`${field} is invalid`);
  return value;
}

function exactArray<T>(value: unknown, field: string, map: (item: unknown, index: number) => T, maximum = 64): readonly T[] {
  if (!Array.isArray(value) || value.length > maximum) invalid(`${field} is invalid`);
  return Object.freeze(value.map(map));
}

function assertPaths(value: unknown): readonly string[] {
  const paths = exactArray(value, 'allowed_read_paths', (item) => {
    const path = required(item, 'allowed_read_path', 1024);
    if (path.startsWith('/') || path.includes('\0') || path.split('/').includes('..')) invalid('allowed_read_path is invalid');
    return path;
  }, 128);
  const sorted = [...paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (paths.some((item, index) => item !== sorted[index]) || new Set(paths).size !== paths.length) {
    invalid('allowed_read_paths must be sorted and unique');
  }
  return paths;
}

function assertRefs(value: unknown, field = 'evidence_refs'): readonly { readonly ref: string; readonly sha256: string }[] {
  return exactArray(value, field, (item) => {
    const entry = record(item, 'evidence_ref');
    assertMessageExactKeys(entry, ['ref', 'sha256'], 'evidence_ref', invalid);
    return Object.freeze({ ref: opaque(entry.ref, 'evidence_ref.ref', 2048), sha256: sha(entry.sha256, 'evidence_ref.sha256') });
  }, 32);
}

function assertDecision(value: unknown): DelegationDecision {
  if (value !== 'admitted' && value !== 'rejected') invalid('decision is invalid');
  return value;
}

function rejection(value: unknown): DelegationRejectionReason | null {
  if (value === null) return null;
  const allowed: readonly DelegationRejectionReason[] = [
    'parent_stale', 'binding_stale', 'role_profile_unavailable', 'role_profile_stale', 'runtime_capability_stale',
    'sandbox_capability_unverified',
  ];
  if (!allowed.includes(value as DelegationRejectionReason)) invalid('rejection_reason is invalid');
  return value as DelegationRejectionReason;
}

function nullableSha(value: unknown, field: string): string | null {
  const text = messageNullableString(value, field, invalid);
  if (text !== null) assertMessageSha256(text, field, invalid);
  return text;
}

function nullableOpaque(value: unknown, field: string): string | null {
  const text = messageNullableString(value, field, invalid);
  if (text !== null && !OPAQUE.test(text)) invalid(`${field} is invalid`);
  return text;
}

function canonical<T>(value: T, validate: (value: unknown) => T): string {
  return canonicalMessageBytes(validate(value) as unknown as Readonly<Record<string, unknown>>);
}

export function buildLogicalRoleProfile(input: Omit<LogicalRoleProfileV1, 'protocol' | 'kind' | 'role_profile_sha256'>): LogicalRoleProfileV1 {
  const basis = {
    protocol: DELEGATION_PROTOCOL,
    kind: LOGICAL_ROLE_PROFILE_KIND,
    logical_role: role(input.logical_role),
    source_ref: opaque(input.source_ref, 'source_ref', 2048),
    toml_sha256: sha(input.toml_sha256, 'toml_sha256'),
    model: opaque(input.model, 'model', 256),
    developer_instructions_sha256: sha(input.developer_instructions_sha256, 'developer_instructions_sha256'),
    declared_sandbox_mode: mode(input.declared_sandbox_mode, 'declared_sandbox_mode'),
  } as const;
  return Object.freeze({ ...basis, role_profile_sha256: canonicalMessageDigest(basis) });
}

export function validateLogicalRoleProfile(value: unknown): LogicalRoleProfileV1 {
  const input = record(value, 'logical role profile');
  assertMessageExactKeys(input, ['protocol', 'kind', 'logical_role', 'source_ref', 'toml_sha256', 'model', 'developer_instructions_sha256', 'declared_sandbox_mode', 'role_profile_sha256'], 'logical role profile', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== LOGICAL_ROLE_PROFILE_KIND) invalid('logical role profile protocol or kind is invalid');
  const built = buildLogicalRoleProfile({
    logical_role: input.logical_role as string, source_ref: input.source_ref as string, toml_sha256: input.toml_sha256 as string,
    model: input.model as string, developer_instructions_sha256: input.developer_instructions_sha256 as string,
    declared_sandbox_mode: input.declared_sandbox_mode as 'read_only',
  });
  if (input.role_profile_sha256 !== built.role_profile_sha256) invalid('role_profile_sha256 is stale');
  return built;
}

export const canonicalLogicalRoleProfileBytes = (value: LogicalRoleProfileV1): string => canonical(value, validateLogicalRoleProfile);

function assertCapabilityTemplate(value: unknown): readonly string[] {
  const items = exactArray(value, 'argv_template', (item) => required(item, 'argv_template item', 128), CODEX_READ_ONLY_ARGV_TEMPLATE.length);
  if (items.length !== CODEX_READ_ONLY_ARGV_TEMPLATE.length || items.some((item, index) => item !== CODEX_READ_ONLY_ARGV_TEMPLATE[index])) {
    invalid('argv_template is not the approved read-only Codex CLI template');
  }
  return items;
}

export function buildCodexReadOnlyCapabilityReceipt(input: Omit<CodexReadOnlyCapabilityReceiptV1,
  'protocol' | 'kind' | 'adapter_kind' | 'capability_sha256'>): CodexReadOnlyCapabilityReceiptV1 {
  if (input.sandbox_mode !== 'read_only') invalid('sandbox_mode is invalid');
  if (input.proof_surface !== CODEX_READ_ONLY_PROOF_SURFACE) invalid('proof_surface is invalid');
  const before = sha(input.canary_before_snapshot_sha256, 'canary_before_snapshot_sha256');
  const after = sha(input.canary_after_snapshot_sha256, 'canary_after_snapshot_sha256');
  if (before !== after) invalid('effective read-only capability requires identical canary snapshots');
  const basis = {
    protocol: DELEGATION_PROTOCOL,
    kind: CODEX_READ_ONLY_CAPABILITY_KIND,
    adapter_kind: CODEX_READ_ONLY_ADAPTER_KIND,
    executable_path: opaque(input.executable_path, 'executable_path', 2048),
    executable_sha256: sha(input.executable_sha256, 'executable_sha256'),
    version: opaque(input.version, 'version', 256),
    model: opaque(input.model, 'model', 256),
    argv_template: assertCapabilityTemplate(input.argv_template),
    sandbox_mode: 'read_only' as const,
    env_sha256: sha(input.env_sha256, 'env_sha256'),
    proof_surface: CODEX_READ_ONLY_PROOF_SURFACE,
    mutation_matrix_sha256: sha(input.mutation_matrix_sha256, 'mutation_matrix_sha256'),
    protected_scope_sha256: sha(input.protected_scope_sha256, 'protected_scope_sha256'),
    canary_before_snapshot_sha256: before,
    canary_after_snapshot_sha256: after,
    canary_process_receipt_sha256: sha(input.canary_process_receipt_sha256, 'canary_process_receipt_sha256'),
    evidence_refs: assertRefs(input.evidence_refs),
    observed_at: (() => { assertMessageTimestamp(input.observed_at, 'observed_at', invalid); return input.observed_at; })(),
  } as const;
  return Object.freeze({ ...basis, capability_sha256: canonicalMessageDigest(basis) });
}

export function validateCodexReadOnlyCapabilityReceipt(value: unknown): CodexReadOnlyCapabilityReceiptV1 {
  const input = record(value, 'Codex read-only capability');
  assertMessageExactKeys(input, ['protocol', 'kind', 'adapter_kind', 'executable_path', 'executable_sha256', 'version', 'model', 'argv_template', 'sandbox_mode', 'env_sha256', 'proof_surface', 'mutation_matrix_sha256', 'protected_scope_sha256', 'canary_before_snapshot_sha256', 'canary_after_snapshot_sha256', 'canary_process_receipt_sha256', 'evidence_refs', 'observed_at', 'capability_sha256'], 'Codex read-only capability', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== CODEX_READ_ONLY_CAPABILITY_KIND || input.adapter_kind !== CODEX_READ_ONLY_ADAPTER_KIND) invalid('Codex read-only capability protocol, kind, or adapter is invalid');
  const built = buildCodexReadOnlyCapabilityReceipt({
    executable_path: input.executable_path as string, executable_sha256: input.executable_sha256 as string, version: input.version as string, model: input.model as string,
    argv_template: input.argv_template as readonly string[], sandbox_mode: input.sandbox_mode as 'read_only',
    env_sha256: input.env_sha256 as string, proof_surface: input.proof_surface as typeof CODEX_READ_ONLY_PROOF_SURFACE,
    mutation_matrix_sha256: input.mutation_matrix_sha256 as string, protected_scope_sha256: input.protected_scope_sha256 as string,
    canary_before_snapshot_sha256: input.canary_before_snapshot_sha256 as string, canary_after_snapshot_sha256: input.canary_after_snapshot_sha256 as string, canary_process_receipt_sha256: input.canary_process_receipt_sha256 as string,
    evidence_refs: input.evidence_refs as readonly { readonly ref: string; readonly sha256: string }[], observed_at: input.observed_at as string,
  });
  if (input.capability_sha256 !== built.capability_sha256) invalid('capability_sha256 is stale');
  return built;
}

export const canonicalCodexReadOnlyCapabilityReceiptBytes = (value: CodexReadOnlyCapabilityReceiptV1): string => canonical(value, validateCodexReadOnlyCapabilityReceipt);

export function buildDelegationExecutionPacket(input: Omit<DelegationExecutionPacketV1, 'protocol' | 'kind' | 'packet_sha256'>): DelegationExecutionPacketV1 {
  assertMessageInteger(input.max_turns, 'max_turns', 1, invalid);
  if (input.max_turns !== 1 || input.max_depth !== 0 || input.return_contract !== 'WorkerResultV1') invalid('execution packet budget or return contract is invalid');
  const basis = {
    protocol: DELEGATION_PROTOCOL,
    kind: EXECUTION_PACKET_KIND,
    delegation_id: uuid(input.delegation_id, 'delegation_id'),
    logical_role: role(input.logical_role),
    role_profile_sha256: sha(input.role_profile_sha256, 'role_profile_sha256'),
    model: opaque(input.model, 'model', 256),
    role_instructions: required(input.role_instructions, 'role_instructions', 24 * 1024),
    goal: required(input.goal, 'goal', 16 * 1024),
    allowed_read_paths: assertPaths(input.allowed_read_paths),
    max_turns: input.max_turns,
    max_depth: 0 as const,
    return_contract: 'WorkerResultV1' as const,
  } as const;
  return Object.freeze({ ...basis, packet_sha256: canonicalMessageDigest(basis) });
}

export function validateDelegationExecutionPacket(value: unknown): DelegationExecutionPacketV1 {
  const input = record(value, 'execution packet');
  assertMessageExactKeys(input, ['protocol', 'kind', 'delegation_id', 'logical_role', 'role_profile_sha256', 'model', 'role_instructions', 'goal', 'allowed_read_paths', 'max_turns', 'max_depth', 'return_contract', 'packet_sha256'], 'execution packet', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== EXECUTION_PACKET_KIND) invalid('execution packet protocol or kind is invalid');
  const built = buildDelegationExecutionPacket({
    delegation_id: input.delegation_id as string, logical_role: input.logical_role as string, role_profile_sha256: input.role_profile_sha256 as string,
    model: input.model as string, role_instructions: input.role_instructions as string, goal: input.goal as string, allowed_read_paths: input.allowed_read_paths as readonly string[],
    max_turns: input.max_turns as number, max_depth: input.max_depth as 0, return_contract: input.return_contract as 'WorkerResultV1',
  });
  if (input.packet_sha256 !== built.packet_sha256) invalid('packet_sha256 is stale');
  return built;
}

export const canonicalDelegationExecutionPacketBytes = (value: DelegationExecutionPacketV1): string => canonical(value, validateDelegationExecutionPacket);

export function buildDelegationEnvelope(input: Omit<DelegationEnvelopeV1, 'protocol' | 'kind' | 'envelope_sha256'>): DelegationEnvelopeV1 {
  const parent = record(input.parent, 'parent');
  assertMessageExactKeys(parent, ['task_id', 'task_revision', 'claim_id', 'lease_generation', 'work_envelope_sha256'], 'parent', invalid);
  const engineer = record(input.engineer, 'engineer');
  assertMessageExactKeys(engineer, ['engineer_id', 'binding_id', 'binding_generation', 'claim_actor_receipt_sha256'], 'engineer', invalid);
  const budget = record(input.budget, 'budget');
  assertMessageExactKeys(budget, ['max_turns', 'max_depth'], 'budget', invalid);
  assertMessageInteger(parent.lease_generation, 'parent.lease_generation', 1, invalid);
  assertMessageInteger(engineer.binding_generation, 'engineer.binding_generation', 1, invalid);
  assertMessageInteger(budget.max_turns, 'budget.max_turns', 1, invalid);
  if (budget.max_turns !== 1 || budget.max_depth !== 0 || input.return_contract !== 'WorkerResultV1') invalid('budget or return_contract is invalid');
  const engineerId = required(engineer.engineer_id, 'engineer.engineer_id');
  if (!ENGINEER.test(engineerId)) invalid('engineer.engineer_id is invalid');
  const basis = {
    protocol: DELEGATION_PROTOCOL,
    kind: DELEGATION_ENVELOPE_KIND,
    delegation_id: uuid(input.delegation_id, 'delegation_id'),
    parent: Object.freeze({ task_id: task(parent.task_id, 'parent.task_id'), task_revision: task(parent.task_revision, 'parent.task_revision'), claim_id: uuid(parent.claim_id, 'parent.claim_id'), lease_generation: parent.lease_generation as number, work_envelope_sha256: sha(parent.work_envelope_sha256, 'parent.work_envelope_sha256') }),
    engineer: Object.freeze({ engineer_id: engineerId, binding_id: uuid(engineer.binding_id, 'engineer.binding_id'), binding_generation: engineer.binding_generation as number, claim_actor_receipt_sha256: sha(engineer.claim_actor_receipt_sha256, 'engineer.claim_actor_receipt_sha256') }),
    logical_role: role(input.logical_role),
    role_profile_sha256: sha(input.role_profile_sha256, 'role_profile_sha256'),
    runtime_capability_sha256: sha(input.runtime_capability_sha256, 'runtime_capability_sha256'),
    execution_packet_sha256: sha(input.execution_packet_sha256, 'execution_packet_sha256'),
    mode: mode(input.mode),
    goal: required(input.goal, 'goal', 16 * 1024),
    allowed_read_paths: assertPaths(input.allowed_read_paths),
    budget: Object.freeze({ max_turns: budget.max_turns as number, max_depth: 0 as const }),
    return_contract: 'WorkerResultV1' as const,
  } as const;
  return Object.freeze({ ...basis, envelope_sha256: canonicalMessageDigest(basis) });
}

export function validateDelegationEnvelope(value: unknown): DelegationEnvelopeV1 {
  const input = record(value, 'delegation envelope');
  assertMessageExactKeys(input, ['protocol', 'kind', 'delegation_id', 'parent', 'engineer', 'logical_role', 'role_profile_sha256', 'runtime_capability_sha256', 'execution_packet_sha256', 'mode', 'goal', 'allowed_read_paths', 'budget', 'return_contract', 'envelope_sha256'], 'delegation envelope', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== DELEGATION_ENVELOPE_KIND) invalid('delegation envelope protocol or kind is invalid');
  const built = buildDelegationEnvelope({
    delegation_id: input.delegation_id as string, parent: input.parent as DelegationEnvelopeV1['parent'], engineer: input.engineer as DelegationEnvelopeV1['engineer'],
    logical_role: input.logical_role as string, role_profile_sha256: input.role_profile_sha256 as string,
    runtime_capability_sha256: input.runtime_capability_sha256 as string, execution_packet_sha256: input.execution_packet_sha256 as string,
    mode: input.mode as DelegationMode, goal: input.goal as string, allowed_read_paths: input.allowed_read_paths as readonly string[],
    budget: input.budget as DelegationEnvelopeV1['budget'], return_contract: input.return_contract as 'WorkerResultV1',
  });
  if (input.envelope_sha256 !== built.envelope_sha256) invalid('envelope_sha256 is stale');
  return built;
}

export const canonicalDelegationEnvelopeBytes = (value: DelegationEnvelopeV1): string => canonical(value, validateDelegationEnvelope);

export function buildDelegationAdmissionReceipt(input: Omit<DelegationAdmissionReceiptV1, 'protocol' | 'kind' | 'admission_receipt_sha256'>): DelegationAdmissionReceiptV1 {
  const decision = assertDecision(input.decision);
  const reason = rejection(input.rejection_reason);
  const roleDigest = nullableSha(input.admitted_role_profile_sha256, 'admitted_role_profile_sha256');
  const sandbox = nullableSha(input.admitted_sandbox_policy_sha256, 'admitted_sandbox_policy_sha256');
  const expected = nullableSha(input.expected_runtime_observation_sha256, 'expected_runtime_observation_sha256');
  if ((decision === 'admitted') !== (reason === null && roleDigest !== null && input.admitted_mode === 'read_only' && sandbox !== null && expected !== null)) {
    invalid('admission receipt decision fields are inconsistent');
  }
  if (decision === 'rejected' && (input.admitted_mode !== null || roleDigest !== null || sandbox !== null || expected !== null || reason === null)) {
    invalid('rejected admission receipt must contain no admitted fields');
  }
  assertMessageTimestamp(input.decided_at, 'decided_at', invalid);
  const basis = {
    protocol: DELEGATION_PROTOCOL,
    kind: DELEGATION_ADMISSION_RECEIPT_KIND,
    delegation_id: uuid(input.delegation_id, 'delegation_id'),
    envelope_sha256: sha(input.envelope_sha256, 'envelope_sha256'),
    decision,
    rejection_reason: reason,
    admitted_role_profile_sha256: roleDigest,
    admitted_mode: decision === 'admitted' ? 'read_only' as const : null,
    admitted_sandbox_policy_sha256: sandbox,
    expected_runtime_observation_sha256: expected,
    decided_at: input.decided_at,
  } as const;
  return Object.freeze({ ...basis, admission_receipt_sha256: canonicalMessageDigest(basis) });
}

export function validateDelegationAdmissionReceipt(value: unknown): DelegationAdmissionReceiptV1 {
  const input = record(value, 'delegation admission receipt');
  assertMessageExactKeys(input, ['protocol', 'kind', 'delegation_id', 'envelope_sha256', 'decision', 'rejection_reason', 'admitted_role_profile_sha256', 'admitted_mode', 'admitted_sandbox_policy_sha256', 'expected_runtime_observation_sha256', 'decided_at', 'admission_receipt_sha256'], 'delegation admission receipt', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== DELEGATION_ADMISSION_RECEIPT_KIND) invalid('delegation admission receipt protocol or kind is invalid');
  const built = buildDelegationAdmissionReceipt({
    delegation_id: input.delegation_id as string, envelope_sha256: input.envelope_sha256 as string, decision: input.decision as DelegationDecision,
    rejection_reason: input.rejection_reason as DelegationRejectionReason | null, admitted_role_profile_sha256: input.admitted_role_profile_sha256 as string | null,
    admitted_mode: input.admitted_mode as DelegationMode | null, admitted_sandbox_policy_sha256: input.admitted_sandbox_policy_sha256 as string | null,
    expected_runtime_observation_sha256: input.expected_runtime_observation_sha256 as string | null, decided_at: input.decided_at as string,
  });
  if (input.admission_receipt_sha256 !== built.admission_receipt_sha256) invalid('admission_receipt_sha256 is stale');
  return built;
}

export const canonicalDelegationAdmissionReceiptBytes = (value: DelegationAdmissionReceiptV1): string => canonical(value, validateDelegationAdmissionReceipt);

export function deriveDelegatedRunDispatchId(idempotencyKey: string): string {
  return canonicalMessageDigest({ domain: 'repo-harness-delegated-run-dispatch.v1', adapter_kind: CODEX_READ_ONLY_ADAPTER_KIND, idempotency_key: opaque(idempotencyKey, 'idempotency_key') });
}

export function buildDelegatedRunIntent(input: Omit<DelegatedRunIntentV1, 'protocol' | 'kind' | 'dispatch_id' | 'operation_fingerprint' | 'adapter_kind' | 'intent_sha256'>): DelegatedRunIntentV1 {
  assertMessageInteger(input.round_index, 'round_index', 0, invalid);
  const idempotencyKey = opaque(input.idempotency_key, 'idempotency_key');
  const basis = {
    protocol: DELEGATION_PROTOCOL,
    kind: DELEGATED_RUN_INTENT_KIND,
    dispatch_id: deriveDelegatedRunDispatchId(idempotencyKey),
    idempotency_key: idempotencyKey,
    operation_fingerprint: canonicalMessageDigest({ domain: 'repo-harness-delegated-run-operation.v1', delegation_id: uuid(input.delegation_id, 'delegation_id'), admission_receipt_sha256: sha(input.admission_receipt_sha256, 'admission_receipt_sha256'), round_index: input.round_index, adapter_kind: CODEX_READ_ONLY_ADAPTER_KIND, context_packet_sha256: sha(input.context_packet_sha256, 'context_packet_sha256') }),
    delegation_id: uuid(input.delegation_id, 'delegation_id'),
    admission_receipt_sha256: sha(input.admission_receipt_sha256, 'admission_receipt_sha256'),
    round_index: input.round_index,
    adapter_kind: CODEX_READ_ONLY_ADAPTER_KIND,
    context_packet_sha256: sha(input.context_packet_sha256, 'context_packet_sha256'),
  } as const;
  return Object.freeze({ ...basis, intent_sha256: canonicalMessageDigest(basis) });
}

export function validateDelegatedRunIntent(value: unknown): DelegatedRunIntentV1 {
  const input = record(value, 'delegated run intent');
  assertMessageExactKeys(input, ['protocol', 'kind', 'dispatch_id', 'idempotency_key', 'operation_fingerprint', 'delegation_id', 'admission_receipt_sha256', 'round_index', 'adapter_kind', 'context_packet_sha256', 'intent_sha256'], 'delegated run intent', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== DELEGATED_RUN_INTENT_KIND || input.adapter_kind !== CODEX_READ_ONLY_ADAPTER_KIND) invalid('delegated run intent protocol, kind, or adapter is invalid');
  const built = buildDelegatedRunIntent({ idempotency_key: input.idempotency_key as string, delegation_id: input.delegation_id as string, admission_receipt_sha256: input.admission_receipt_sha256 as string, round_index: input.round_index as number, context_packet_sha256: input.context_packet_sha256 as string });
  if (input.dispatch_id !== built.dispatch_id || input.operation_fingerprint !== built.operation_fingerprint || input.intent_sha256 !== built.intent_sha256) invalid('delegated run intent derived values are stale');
  return built;
}

export const canonicalDelegatedRunIntentBytes = (value: DelegatedRunIntentV1): string => canonical(value, validateDelegatedRunIntent);

export function buildDelegatedRunLaunchClaim(input: Omit<DelegatedRunLaunchClaimV1, 'protocol' | 'kind' | 'launch_claim_sha256'>): DelegatedRunLaunchClaimV1 {
  assertMessageTimestamp(input.claimed_at, 'claimed_at', invalid);
  const basis = { protocol: DELEGATION_PROTOCOL, kind: DELEGATED_RUN_LAUNCH_CLAIM_KIND, dispatch_id: sha(input.dispatch_id, 'dispatch_id'), intent_sha256: sha(input.intent_sha256, 'intent_sha256'), claimed_at: input.claimed_at } as const;
  return Object.freeze({ ...basis, launch_claim_sha256: canonicalMessageDigest(basis) });
}

export function validateDelegatedRunLaunchClaim(value: unknown): DelegatedRunLaunchClaimV1 {
  const input = record(value, 'delegated run launch claim');
  assertMessageExactKeys(input, ['protocol', 'kind', 'dispatch_id', 'intent_sha256', 'claimed_at', 'launch_claim_sha256'], 'delegated run launch claim', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== DELEGATED_RUN_LAUNCH_CLAIM_KIND) invalid('delegated run launch claim protocol or kind is invalid');
  const built = buildDelegatedRunLaunchClaim({ dispatch_id: input.dispatch_id as string, intent_sha256: input.intent_sha256 as string, claimed_at: input.claimed_at as string });
  if (input.launch_claim_sha256 !== built.launch_claim_sha256) invalid('launch_claim_sha256 is stale');
  return built;
}

export const canonicalDelegatedRunLaunchClaimBytes = (value: DelegatedRunLaunchClaimV1): string => canonical(value, validateDelegatedRunLaunchClaim);

function state(value: unknown): DelegatedRunState {
  const allowed: readonly DelegatedRunState[] = ['intent_persisted', 'launch_claimed', 'running', 'collecting', 'completed', 'failed', 'reconciliation_required'];
  if (!allowed.includes(value as DelegatedRunState)) invalid('delegated run state is invalid');
  return value as DelegatedRunState;
}

function failureClass(value: unknown): DelegatedRunFailureClass {
  const allowed: readonly DelegatedRunFailureClass[] = ['none', 'admission', 'infrastructure', 'provider', 'sandbox_violation', 'protected_state_changed', 'unknown'];
  if (!allowed.includes(value as DelegatedRunFailureClass)) invalid('delegated run failure_class is invalid');
  return value as DelegatedRunFailureClass;
}

export function buildDelegatedRunObservation(input: Omit<DelegatedRunObservationV1, 'protocol' | 'kind' | 'observation_sha256'>): DelegatedRunObservationV1 {
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const current = state(input.state);
  const failure = failureClass(input.failure_class);
  const before = nullableSha(input.protected_before_snapshot_sha256, 'protected_before_snapshot_sha256');
  const after = nullableSha(input.protected_after_snapshot_sha256, 'protected_after_snapshot_sha256');
  const receipt = nullableSha(input.process_receipt_sha256, 'process_receipt_sha256');
  if (current === 'completed' && (failure !== 'none' || before === null || after === null || before !== after || receipt === null || input.worker_run_ref === null)) invalid('completed observation lacks verified protected state');
  if (current !== 'completed' && failure === 'none' && current !== 'intent_persisted' && current !== 'launch_claimed' && current !== 'running' && current !== 'collecting') invalid('terminal non-completed observation requires failure class');
  const basis = {
    protocol: DELEGATION_PROTOCOL,
    kind: DELEGATED_RUN_OBSERVATION_KIND,
    dispatch_id: sha(input.dispatch_id, 'dispatch_id'),
    intent_sha256: sha(input.intent_sha256, 'intent_sha256'),
    worker_run_ref: nullableOpaque(input.worker_run_ref, 'worker_run_ref'),
    runtime_principal_id: nullableOpaque(input.runtime_principal_id, 'runtime_principal_id'),
    state: current,
    failure_class: failure,
    observed_capabilities_sha256: sha(input.observed_capabilities_sha256, 'observed_capabilities_sha256'),
    protected_before_snapshot_sha256: before,
    protected_after_snapshot_sha256: after,
    process_receipt_sha256: receipt,
    previous_observation_sha256: nullableSha(input.previous_observation_sha256, 'previous_observation_sha256'),
    observed_at: input.observed_at,
  } as const;
  return Object.freeze({ ...basis, observation_sha256: canonicalMessageDigest(basis) });
}

export function validateDelegatedRunObservation(value: unknown): DelegatedRunObservationV1 {
  const input = record(value, 'delegated run observation');
  assertMessageExactKeys(input, ['protocol', 'kind', 'dispatch_id', 'intent_sha256', 'worker_run_ref', 'runtime_principal_id', 'state', 'failure_class', 'observed_capabilities_sha256', 'protected_before_snapshot_sha256', 'protected_after_snapshot_sha256', 'process_receipt_sha256', 'previous_observation_sha256', 'observed_at', 'observation_sha256'], 'delegated run observation', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== DELEGATED_RUN_OBSERVATION_KIND) invalid('delegated run observation protocol or kind is invalid');
  const built = buildDelegatedRunObservation({ dispatch_id: input.dispatch_id as string, intent_sha256: input.intent_sha256 as string, worker_run_ref: input.worker_run_ref as string | null, runtime_principal_id: input.runtime_principal_id as string | null, state: input.state as DelegatedRunState, failure_class: input.failure_class as DelegatedRunFailureClass, observed_capabilities_sha256: input.observed_capabilities_sha256 as string, protected_before_snapshot_sha256: input.protected_before_snapshot_sha256 as string | null, protected_after_snapshot_sha256: input.protected_after_snapshot_sha256 as string | null, process_receipt_sha256: input.process_receipt_sha256 as string | null, previous_observation_sha256: input.previous_observation_sha256 as string | null, observed_at: input.observed_at as string });
  if (input.observation_sha256 !== built.observation_sha256) invalid('observation_sha256 is stale');
  return built;
}

export const canonicalDelegatedRunObservationBytes = (value: DelegatedRunObservationV1): string => canonical(value, validateDelegatedRunObservation);

export function assertDelegatedRunTransition(previous: DelegatedRunState, next: DelegatedRunState): void {
  const allowed: Readonly<Record<DelegatedRunState, readonly DelegatedRunState[]>> = {
    intent_persisted: ['launch_claimed', 'reconciliation_required'],
    launch_claimed: ['running', 'failed', 'reconciliation_required'],
    running: ['collecting', 'failed', 'reconciliation_required'],
    collecting: ['completed', 'failed', 'reconciliation_required'],
    completed: [], failed: [], reconciliation_required: [],
  };
  if (!allowed[previous].includes(next)) transitionInvalid(`delegated run transition ${previous} -> ${next} is invalid`);
}

export function buildWorkerRunRef(input: Omit<WorkerRunRefV1, 'protocol' | 'kind' | 'runtime_kind' | 'run_ref_sha256'>): WorkerRunRefV1 {
  const basis = {
    protocol: DELEGATION_PROTOCOL, kind: WORKER_RUN_REF_KIND, worker_run_id: uuid(input.worker_run_id, 'worker_run_id'), delegation_id: uuid(input.delegation_id, 'delegation_id'), admission_receipt_sha256: sha(input.admission_receipt_sha256, 'admission_receipt_sha256'), runtime_kind: 'codex_exec' as const, logical_role: role(input.logical_role), role_profile_sha256: sha(input.role_profile_sha256, 'role_profile_sha256'), runtime_principal_ref: opaque(input.runtime_principal_ref, 'runtime_principal_ref'), launch_claim_sha256: sha(input.launch_claim_sha256, 'launch_claim_sha256'), execution_receipt_sha256: sha(input.execution_receipt_sha256, 'execution_receipt_sha256'), read_only_sandbox_receipt_sha256: sha(input.read_only_sandbox_receipt_sha256, 'read_only_sandbox_receipt_sha256'),
  } as const;
  return Object.freeze({ ...basis, run_ref_sha256: canonicalMessageDigest(basis) });
}

export function validateWorkerRunRef(value: unknown): WorkerRunRefV1 {
  const input = record(value, 'worker run ref');
  assertMessageExactKeys(input, ['protocol', 'kind', 'worker_run_id', 'delegation_id', 'admission_receipt_sha256', 'runtime_kind', 'logical_role', 'role_profile_sha256', 'runtime_principal_ref', 'launch_claim_sha256', 'execution_receipt_sha256', 'read_only_sandbox_receipt_sha256', 'run_ref_sha256'], 'worker run ref', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== WORKER_RUN_REF_KIND || input.runtime_kind !== 'codex_exec') invalid('worker run ref protocol, kind, or runtime is invalid');
  const built = buildWorkerRunRef({ worker_run_id: input.worker_run_id as string, delegation_id: input.delegation_id as string, admission_receipt_sha256: input.admission_receipt_sha256 as string, logical_role: input.logical_role as string, role_profile_sha256: input.role_profile_sha256 as string, runtime_principal_ref: input.runtime_principal_ref as string, launch_claim_sha256: input.launch_claim_sha256 as string, execution_receipt_sha256: input.execution_receipt_sha256 as string, read_only_sandbox_receipt_sha256: input.read_only_sandbox_receipt_sha256 as string });
  if (input.run_ref_sha256 !== built.run_ref_sha256) invalid('run_ref_sha256 is stale');
  return built;
}

export const canonicalWorkerRunRefBytes = (value: WorkerRunRefV1): string => canonical(value, validateWorkerRunRef);

/**
 * The single validator for the `WorkerResultV1` evidence-ref shape. Exported so
 * the collaboration plane reuses it verbatim rather than re-deriving the same
 * `{ ref, sha256 }` contract; `maximum` lets a caller impose a tighter count
 * bound without changing the per-entry rules.
 */
export function validateWorkerEvidenceRefs(
  value: unknown,
  field: string,
  maximum: number,
): readonly WorkerEvidenceRefV1[] {
  return exactArray(value, field, (item) => {
    const entry = record(item, 'evidence_ref');
    assertMessageExactKeys(entry, ['ref', 'sha256'], 'evidence_ref', invalid);
    const ref = required(entry.ref, 'evidence_ref.ref', 2048);
    if (!RESULT_REF.test(ref)) invalid('evidence_ref.ref is invalid');
    return Object.freeze({ ref, sha256: sha(entry.sha256, 'evidence_ref.sha256') });
  }, maximum);
}

export function buildWorkerResult(input: Omit<WorkerResultV1, 'protocol' | 'kind' | 'result_sha256'>): WorkerResultV1 {
  const claims = exactArray(input.untrusted_claims, 'untrusted_claims', (item) => required(item, 'untrusted_claim', 4096), 64);
  const refs = validateWorkerEvidenceRefs(input.evidence_refs, 'evidence_refs', 64);
  const basis = {
    protocol: DELEGATION_PROTOCOL, kind: WORKER_RESULT_KIND, delegation_id: uuid(input.delegation_id, 'delegation_id'), worker_run_id: uuid(input.worker_run_id, 'worker_run_id'), worker_run_ref_sha256: sha(input.worker_run_ref_sha256, 'worker_run_ref_sha256'), logical_role: role(input.logical_role), runtime_observation_sha256: sha(input.runtime_observation_sha256, 'runtime_observation_sha256'), read_only_sandbox_receipt_sha256: sha(input.read_only_sandbox_receipt_sha256, 'read_only_sandbox_receipt_sha256'), evidence_refs: refs, untrusted_claims: claims,
  } as const;
  return Object.freeze({ ...basis, result_sha256: canonicalMessageDigest(basis) });
}

export function validateWorkerResult(value: unknown): WorkerResultV1 {
  const input = record(value, 'worker result');
  assertMessageExactKeys(input, ['protocol', 'kind', 'delegation_id', 'worker_run_id', 'worker_run_ref_sha256', 'logical_role', 'runtime_observation_sha256', 'read_only_sandbox_receipt_sha256', 'evidence_refs', 'untrusted_claims', 'result_sha256'], 'worker result', invalid);
  if (input.protocol !== DELEGATION_PROTOCOL || input.kind !== WORKER_RESULT_KIND) invalid('worker result protocol or kind is invalid');
  const built = buildWorkerResult({ delegation_id: input.delegation_id as string, worker_run_id: input.worker_run_id as string, worker_run_ref_sha256: input.worker_run_ref_sha256 as string, logical_role: input.logical_role as string, runtime_observation_sha256: input.runtime_observation_sha256 as string, read_only_sandbox_receipt_sha256: input.read_only_sandbox_receipt_sha256 as string, evidence_refs: input.evidence_refs as readonly { readonly ref: string; readonly sha256: string }[], untrusted_claims: input.untrusted_claims as readonly string[] });
  if (input.result_sha256 !== built.result_sha256) invalid('result_sha256 is stale');
  return built;
}

export const canonicalWorkerResultBytes = (value: WorkerResultV1): string => canonical(value, validateWorkerResult);
