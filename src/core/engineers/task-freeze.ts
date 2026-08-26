import { canonicalEngineerJson, engineerSha256 } from './profile-binding';

export const TASK_FREEZE_PROTOCOL = 1 as const;
export const TASK_FREEZE_KIND = 'repo-harness-task-freeze-receipt' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const TASK_ID = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const GIT_SHA = /^[0-9a-f]{40,64}$/u;
const OPAQUE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;

export interface TaskFreezeReceiptV1 {
  readonly protocol: typeof TASK_FREEZE_PROTOCOL;
  readonly kind: typeof TASK_FREEZE_KIND;
  readonly task: {
    readonly task_id: string;
    readonly task_revision: string;
    readonly claim_id: string;
    readonly lease_generation: number;
  };
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly binding_current_sha256: string;
  readonly claim_actor_receipt_sha256: string;
  readonly work_envelope_sha256: string;
  readonly work_envelope_bytes_sha256: string;
  readonly lease_state_sha256: string;
  readonly worktree: string;
  readonly worktree_topology_sha256: string;
  readonly branch: string;
  readonly unit_ref: string;
  readonly head_sha: string;
  readonly tree_sha: string;
  readonly diff_sha256: string;
  readonly untracked_inventory_sha256: string;
  readonly checks_state_sha256: string;
  readonly unverified_hypotheses_sha256: string;
  readonly writer_grant_id: string | null;
  readonly writer_grant_sha256: string | null;
  readonly observed_at: string;
  readonly receipt_sha256: string;
}

export type TaskFreezeReason =
  | 'tracked_dirty'
  | 'untracked_present'
  | 'checks_unverified'
  | 'hypotheses_present'
  | 'writer_grant_active';

export type TaskFreezeHumanChoice =
  | 'keep_binding'
  | 'retain_frozen_candidate'
  | 'abandon'
  | 'manual_recovery';

export interface TaskFreezeInspectionV1 {
  readonly receipt: TaskFreezeReceiptV1;
  readonly disposition: 'clean_release_allowed' | 'freeze_required';
  readonly reasons: readonly TaskFreezeReason[];
  readonly human_choices: readonly TaskFreezeHumanChoice[];
  readonly untracked_inventory_is_content_carrier: false;
}

export type TaskFreezeErrorCode =
  | 'task_freeze_invalid'
  | 'task_freeze_claim_missing'
  | 'task_freeze_claim_ambiguous'
  | 'task_freeze_binding_stale'
  | 'task_freeze_changed_during_read'
  | 'task_freeze_stale'
  | 'task_freeze_conflict'
  | 'task_freeze_state_unavailable'
  | 'bound_task_active';

export class TaskFreezeError extends Error {
  constructor(readonly code: TaskFreezeErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TaskFreezeError';
  }
}

type RecordValue = Record<string, unknown>;

function invalid(message: string): never {
  throw new TaskFreezeError('task_freeze_invalid', message);
}

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as RecordValue;
}

function exact(value: RecordValue, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid(`${label} keys are invalid`);
  }
}

function string(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid(`${label} is invalid`);
  return value;
}

function integer(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid(`${label} is invalid`);
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  const parsed = string(value, label, OPAQUE);
  if (!Number.isFinite(Date.parse(parsed))) invalid(`${label} is invalid`);
  return parsed;
}

function basis(value: Omit<TaskFreezeReceiptV1, 'receipt_sha256'>): object {
  return value;
}

export function buildTaskFreezeReceipt(
  input: Omit<TaskFreezeReceiptV1, 'protocol' | 'kind' | 'receipt_sha256'>,
): TaskFreezeReceiptV1 {
  const candidate = {
    protocol: TASK_FREEZE_PROTOCOL,
    kind: TASK_FREEZE_KIND,
    ...input,
  } as const;
  return validateTaskFreezeReceipt({
    ...candidate,
    receipt_sha256: engineerSha256(canonicalEngineerJson(basis(candidate))),
  });
}

export function validateTaskFreezeReceipt(value: unknown): TaskFreezeReceiptV1 {
  const input = record(value, 'task freeze receipt');
  exact(input, [
    'protocol', 'kind', 'task', 'engineer_id', 'binding_id', 'binding_generation',
    'binding_current_sha256', 'claim_actor_receipt_sha256', 'work_envelope_sha256', 'work_envelope_bytes_sha256', 'lease_state_sha256',
    'worktree', 'worktree_topology_sha256', 'branch', 'unit_ref', 'head_sha', 'tree_sha', 'diff_sha256',
    'untracked_inventory_sha256', 'checks_state_sha256', 'unverified_hypotheses_sha256',
    'writer_grant_id', 'writer_grant_sha256', 'observed_at', 'receipt_sha256',
  ], 'task freeze receipt');
  if (input.protocol !== TASK_FREEZE_PROTOCOL || input.kind !== TASK_FREEZE_KIND) {
    invalid('task freeze receipt protocol or kind is invalid');
  }
  const task = record(input.task, 'task');
  exact(task, ['task_id', 'task_revision', 'claim_id', 'lease_generation'], 'task');
  const writerGrantId = input.writer_grant_id === null ? null : string(input.writer_grant_id, 'writer_grant_id', UUID);
  const writerGrantSha = input.writer_grant_sha256 === null ? null : string(input.writer_grant_sha256, 'writer_grant_sha256', DIGEST);
  if ((writerGrantId === null) !== (writerGrantSha === null)) invalid('writer grant identity and digest must both be null or non-null');
  const candidate = Object.freeze({
    protocol: TASK_FREEZE_PROTOCOL,
    kind: TASK_FREEZE_KIND,
    task: Object.freeze({
      task_id: string(task.task_id, 'task.task_id', TASK_ID),
      task_revision: string(task.task_revision, 'task.task_revision', TASK_ID),
      claim_id: string(task.claim_id, 'task.claim_id', UUID),
      lease_generation: integer(task.lease_generation, 'task.lease_generation', 1),
    }),
    engineer_id: string(input.engineer_id, 'engineer_id', ENGINEER_ID),
    binding_id: string(input.binding_id, 'binding_id', UUID),
    binding_generation: integer(input.binding_generation, 'binding_generation', 1),
    binding_current_sha256: string(input.binding_current_sha256, 'binding_current_sha256', DIGEST),
    claim_actor_receipt_sha256: string(input.claim_actor_receipt_sha256, 'claim_actor_receipt_sha256', DIGEST),
    work_envelope_sha256: string(input.work_envelope_sha256, 'work_envelope_sha256', DIGEST),
    work_envelope_bytes_sha256: string(input.work_envelope_bytes_sha256, 'work_envelope_bytes_sha256', DIGEST),
    lease_state_sha256: string(input.lease_state_sha256, 'lease_state_sha256', DIGEST),
    worktree: string(input.worktree, 'worktree', OPAQUE),
    worktree_topology_sha256: string(input.worktree_topology_sha256, 'worktree_topology_sha256', DIGEST),
    branch: string(input.branch, 'branch', OPAQUE),
    unit_ref: string(input.unit_ref, 'unit_ref', OPAQUE),
    head_sha: string(input.head_sha, 'head_sha', GIT_SHA),
    tree_sha: string(input.tree_sha, 'tree_sha', GIT_SHA),
    diff_sha256: string(input.diff_sha256, 'diff_sha256', DIGEST),
    untracked_inventory_sha256: string(input.untracked_inventory_sha256, 'untracked_inventory_sha256', DIGEST),
    checks_state_sha256: string(input.checks_state_sha256, 'checks_state_sha256', DIGEST),
    unverified_hypotheses_sha256: string(input.unverified_hypotheses_sha256, 'unverified_hypotheses_sha256', DIGEST),
    writer_grant_id: writerGrantId,
    writer_grant_sha256: writerGrantSha,
    observed_at: timestamp(input.observed_at, 'observed_at'),
    receipt_sha256: string(input.receipt_sha256, 'receipt_sha256', DIGEST),
  });
  const { receipt_sha256: _ignored, ...withoutDigest } = candidate;
  if (candidate.receipt_sha256 !== engineerSha256(canonicalEngineerJson(basis(withoutDigest)))) {
    invalid('receipt_sha256 is invalid');
  }
  return candidate;
}

export function canonicalTaskFreezeReceiptBytes(value: TaskFreezeReceiptV1): string {
  return canonicalEngineerJson(validateTaskFreezeReceipt(value));
}

export function taskFreezeReceiptChangedFields(
  frozenInput: TaskFreezeReceiptV1,
  currentInput: TaskFreezeReceiptV1,
): readonly string[] {
  const frozen = validateTaskFreezeReceipt(frozenInput);
  const current = validateTaskFreezeReceipt(currentInput);
  const fields: (keyof TaskFreezeReceiptV1)[] = [
    'task', 'engineer_id', 'binding_id', 'binding_generation', 'binding_current_sha256',
    'claim_actor_receipt_sha256', 'work_envelope_sha256', 'work_envelope_bytes_sha256', 'lease_state_sha256', 'worktree',
    'worktree_topology_sha256', 'branch', 'unit_ref',
    'head_sha', 'tree_sha', 'diff_sha256', 'untracked_inventory_sha256', 'checks_state_sha256',
    'unverified_hypotheses_sha256', 'writer_grant_id', 'writer_grant_sha256',
  ];
  return Object.freeze(fields.filter((field) => canonicalEngineerJson(frozen[field]) !== canonicalEngineerJson(current[field])));
}

export function buildTaskFreezeInspection(input: {
  readonly receipt: TaskFreezeReceiptV1;
  readonly tracked_dirty: boolean;
  readonly untracked_present: boolean;
  readonly checks_verified: boolean;
  readonly hypotheses_present: boolean;
  readonly writer_grant_active: boolean;
}): TaskFreezeInspectionV1 {
  const reasons: TaskFreezeReason[] = [];
  if (input.tracked_dirty) reasons.push('tracked_dirty');
  if (input.untracked_present) reasons.push('untracked_present');
  if (!input.checks_verified) reasons.push('checks_unverified');
  if (input.hypotheses_present) reasons.push('hypotheses_present');
  if (input.writer_grant_active) reasons.push('writer_grant_active');
  return Object.freeze({
    receipt: validateTaskFreezeReceipt(input.receipt),
    disposition: reasons.length === 0 ? 'clean_release_allowed' : 'freeze_required',
    reasons: Object.freeze(reasons),
    human_choices: Object.freeze<TaskFreezeHumanChoice[]>(['keep_binding', 'retain_frozen_candidate', 'abandon', 'manual_recovery']),
    untracked_inventory_is_content_carrier: false,
  });
}
