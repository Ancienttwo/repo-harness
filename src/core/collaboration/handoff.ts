/**
 * `WorkStateHandoffV1` — what one run knows, written down so the next run does
 * not have to rediscover it.
 *
 * Sprint row C3. A handoff carries knowledge and nothing else. It transfers no
 * Task, no Lease and no Claim: the frozen three-way split is that
 * `WorkStateHandoff` passes knowledge, `TaskFreezeReceiptV1` passes exact state,
 * and the existing Lease lifecycle passes the right to execute. Whoever reads a
 * handoff still has to go through `sprint release`, `fleet takeover` or
 * `fleet acquire` to become a writer.
 *
 * `attempted_paths` and `dead_ends` are the reason this protocol exists. Without
 * them the successor re-burns the predecessor's budget on paths already known to
 * fail, which is the outcome the collaboration plane is supposed to prevent.
 *
 * Append-only: a handoff is immutable once written, and a revision is a new
 * record carrying `supersedes_handoff_id`. The wire version is the frozen
 * `COLLABORATION_PROTOCOL`; this row mints no second protocol constant for the
 * same plane.
 */
import {
  COLLABORATION_PROTOCOL,
  COLLABORATION_SOURCE_SIGNAL_MAX_COUNT,
  canonicalCollaborationBytes,
  canonicalCollaborationDigest,
  collaborationActorSha256,
  collaborationInvalid,
  deriveCollaborationRecordId,
  isCollaborationRecord,
  validateCollaborationActorRef,
  validateCollaborationArtifactRefs,
  validateCollaborationRecordId,
  validateCollaborationRecordedAt,
  validateCollaborationRepositoryId,
  validateCollaborationScopeRefs,
  validateCollaborationThreadKey,
  type CollaborationActorRefV1,
  type CollaborationArtifactRefV1,
  type CollaborationScopeRefV1,
} from './common';
import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageUuid,
  messageRequiredString,
} from '../messages/mechanics';

export const WORK_STATE_HANDOFF_KIND = 'repo-harness-work-state-handoff' as const;

/**
 * Transport limits for this record family. They live here rather than in
 * `common.ts`, which C1 owns exclusively and C3 consumes unchanged; nothing
 * outside a handoff needs them.
 */
export const HANDOFF_GOAL_MAX_BYTES = 2 * 1024;
export const HANDOFF_ENTRY_MAX_BYTES = 1024;
export const HANDOFF_LIST_MAX_COUNT = 32;

/**
 * Why the current holder is writing state down. A closed set: an open trigger
 * string would become a second, undeclared taxonomy that projections would then
 * have to guess at.
 */
export const WORK_STATE_HANDOFF_TRIGGERS = [
  'budget_low',
  'context_pressure',
  'phase_complete',
  'stalled',
  'manual',
] as const;
export type WorkStateHandoffTrigger = (typeof WORK_STATE_HANDOFF_TRIGGERS)[number];

/**
 * What the handoff author was executing under, as a discriminated union rather
 * than a row of nullable fields. Four nullable references admit a record where
 * all four are null and the shape still validates, which says nothing; a branch
 * either carries every reference its kind needs or the record is invalid.
 *
 * None of these references grant anything. `bound_task` names the Claim and
 * Lease generation the author held at the time so a successor can tell whether
 * that state is still current; reading it confers no ownership.
 */
export type HandoffExecutionContextV1 =
  | {
      readonly kind: 'delegated_worker';
      readonly worker_run_ref_sha256: string;
      readonly worker_result_sha256: string;
    }
  | {
      readonly kind: 'bound_task';
      readonly task_id: string;
      readonly task_revision: string;
      readonly claim_id: string;
      readonly lease_generation: number;
      readonly work_envelope_sha256: string;
      readonly task_freeze_receipt_sha256: string;
    }
  | {
      readonly kind: 'publication';
      readonly publication_id: string;
      readonly head_sha: string;
    }
  | { readonly kind: 'none' };

export interface HandoffAttemptedPathV1 {
  readonly description: string;
  readonly outcome: string;
  readonly evidence_refs: readonly CollaborationArtifactRefV1[];
}

export interface WorkStateHandoffV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof WORK_STATE_HANDOFF_KIND;
  readonly handoff_id: string;
  readonly repository_id: string;
  readonly actor: CollaborationActorRefV1;
  readonly thread_key: string;
  readonly scope_refs: readonly CollaborationScopeRefV1[];
  readonly trigger: WorkStateHandoffTrigger;
  readonly goal: string;
  readonly completed: readonly string[];
  readonly key_findings: readonly string[];
  readonly attempted_paths: readonly HandoffAttemptedPathV1[];
  readonly dead_ends: readonly string[];
  readonly open_hypotheses: readonly string[];
  readonly next_actions: readonly string[];
  readonly source_signal_ids: readonly string[];
  readonly execution_context: HandoffExecutionContextV1;
  readonly supersedes_handoff_id: string | null;
  /** Host-derived and stable across retries; never re-sampled from the wall clock. */
  readonly created_at: string;
  readonly handoff_sha256: string;
}

export type WorkStateHandoffInput = Omit<WorkStateHandoffV1, 'protocol' | 'kind' | 'handoff_sha256'>;

const HANDOFF_FIELDS = [
  'protocol',
  'kind',
  'handoff_id',
  'repository_id',
  'actor',
  'thread_key',
  'scope_refs',
  'trigger',
  'goal',
  'completed',
  'key_findings',
  'attempted_paths',
  'dead_ends',
  'open_hypotheses',
  'next_actions',
  'source_signal_ids',
  'execution_context',
  'supersedes_handoff_id',
  'created_at',
  'handoff_sha256',
] as const;

/** One line, no control characters: the same opaque-id rule `common.ts` applies. */
const PUBLICATION_ID = /^[^\u0000-\u001f\u007f]+$/u;
const GIT_OID = /^[0-9a-f]{40,64}$/u;

/**
 * One unit of written-down knowledge. Blank-but-present is the failure this
 * rejects: a whitespace-only dead end reads as a recorded finding and is worth
 * less than no entry at all, because the successor trusts it.
 */
function entry(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  assertMessageBoundedUtf8(text, field, HANDOFF_ENTRY_MAX_BYTES, collaborationInvalid);
  if (text.trim().length === 0) collaborationInvalid(`${field} must not be blank`);
  return text;
}

function entryList(value: unknown, field: string, minimum: number): readonly string[] {
  if (!Array.isArray(value)) collaborationInvalid(`${field} is required`);
  if (value.length < minimum) collaborationInvalid(`${field} must not be empty`);
  if (value.length > HANDOFF_LIST_MAX_COUNT) {
    collaborationInvalid(`${field} exceeds ${HANDOFF_LIST_MAX_COUNT} entries`);
  }
  return Object.freeze(value.map((item, index) => entry(item, `${field}[${index}]`)));
}

function validateAttemptedPaths(value: unknown): readonly HandoffAttemptedPathV1[] {
  if (!Array.isArray(value)) collaborationInvalid('attempted_paths is required');
  // A handoff that attempted nothing carries no route the successor can skip,
  // which is the whole transfer. It is an empty record wearing a schema.
  if (value.length === 0) collaborationInvalid('attempted_paths must not be empty');
  if (value.length > HANDOFF_LIST_MAX_COUNT) {
    collaborationInvalid(`attempted_paths exceeds ${HANDOFF_LIST_MAX_COUNT} entries`);
  }
  return Object.freeze(value.map((item, index) => {
    const field = `attempted_paths[${index}]`;
    if (!isCollaborationRecord(item)) collaborationInvalid(`${field} must be an object`);
    assertMessageExactKeys(item, ['description', 'outcome', 'evidence_refs'], field, collaborationInvalid);
    return Object.freeze({
      description: entry(item.description, `${field} description`),
      // What happened, not what was tried: an attempt with no recorded outcome
      // tells the successor to try it again to find out.
      outcome: entry(item.outcome, `${field} outcome`),
      evidence_refs: validateCollaborationArtifactRefs(item.evidence_refs, `${field} evidence_refs`),
    });
  }));
}

export function validateHandoffExecutionContext(value: unknown): HandoffExecutionContextV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('execution_context must be an object');
  const input = value;
  switch (input.kind) {
    case 'delegated_worker': {
      assertMessageExactKeys(
        input,
        ['kind', 'worker_run_ref_sha256', 'worker_result_sha256'],
        'execution_context',
        collaborationInvalid,
      );
      const runRef = messageRequiredString(input.worker_run_ref_sha256, 'execution_context worker_run_ref_sha256', collaborationInvalid);
      assertMessageSha256(runRef, 'execution_context worker_run_ref_sha256', collaborationInvalid);
      const result = messageRequiredString(input.worker_result_sha256, 'execution_context worker_result_sha256', collaborationInvalid);
      assertMessageSha256(result, 'execution_context worker_result_sha256', collaborationInvalid);
      return Object.freeze({ kind: 'delegated_worker' as const, worker_run_ref_sha256: runRef, worker_result_sha256: result });
    }
    case 'bound_task': {
      assertMessageExactKeys(
        input,
        ['kind', 'task_id', 'task_revision', 'claim_id', 'lease_generation', 'work_envelope_sha256', 'task_freeze_receipt_sha256'],
        'execution_context',
        collaborationInvalid,
      );
      const claimId = messageRequiredString(input.claim_id, 'execution_context claim_id', collaborationInvalid);
      assertMessageUuid(claimId, 'execution_context claim_id', collaborationInvalid);
      assertMessageInteger(input.lease_generation, 'execution_context lease_generation', 1, collaborationInvalid);
      const envelope = messageRequiredString(input.work_envelope_sha256, 'execution_context work_envelope_sha256', collaborationInvalid);
      assertMessageSha256(envelope, 'execution_context work_envelope_sha256', collaborationInvalid);
      const freeze = messageRequiredString(input.task_freeze_receipt_sha256, 'execution_context task_freeze_receipt_sha256', collaborationInvalid);
      assertMessageSha256(freeze, 'execution_context task_freeze_receipt_sha256', collaborationInvalid);
      return Object.freeze({
        kind: 'bound_task' as const,
        task_id: validateCollaborationRecordId(input.task_id, 'execution_context task_id'),
        task_revision: validateCollaborationRecordId(input.task_revision, 'execution_context task_revision'),
        claim_id: claimId,
        lease_generation: input.lease_generation,
        work_envelope_sha256: envelope,
        task_freeze_receipt_sha256: freeze,
      });
    }
    case 'publication': {
      assertMessageExactKeys(input, ['kind', 'publication_id', 'head_sha'], 'execution_context', collaborationInvalid);
      const publicationId = messageRequiredString(input.publication_id, 'execution_context publication_id', collaborationInvalid);
      assertMessageBoundedUtf8(publicationId, 'execution_context publication_id', HANDOFF_ENTRY_MAX_BYTES, collaborationInvalid);
      if (!PUBLICATION_ID.test(publicationId)) collaborationInvalid('execution_context publication_id is invalid');
      const headSha = messageRequiredString(input.head_sha, 'execution_context head_sha', collaborationInvalid);
      if (!GIT_OID.test(headSha)) collaborationInvalid('execution_context head_sha is invalid');
      return Object.freeze({ kind: 'publication' as const, publication_id: publicationId, head_sha: headSha });
    }
    case 'none':
      assertMessageExactKeys(input, ['kind'], 'execution_context', collaborationInvalid);
      return Object.freeze({ kind: 'none' as const });
    default:
      return collaborationInvalid('execution_context kind is invalid');
  }
}

/**
 * Identity is derived by the Host from the repository, the authenticated actor
 * and one identity key. A direct publication passes its idempotency key; a
 * delegated contribution passes `<worker_run_ref_sha256>#<entry index>`, so a
 * retried run converges on the same ids.
 */
export function deriveWorkStateHandoffId(
  repositoryId: string,
  actor: CollaborationActorRefV1,
  identityKey: string,
): string {
  return deriveCollaborationRecordId('work-state-handoff', [
    validateCollaborationRepositoryId(repositoryId),
    collaborationActorSha256(actor),
    identityKey,
  ]);
}

function validateTrigger(value: unknown): WorkStateHandoffTrigger {
  if (typeof value !== 'string' || !(WORK_STATE_HANDOFF_TRIGGERS as readonly string[]).includes(value)) {
    collaborationInvalid(`trigger must be one of ${WORK_STATE_HANDOFF_TRIGGERS.join(', ')}`);
  }
  return value as WorkStateHandoffTrigger;
}

function validateSourceSignalIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > COLLABORATION_SOURCE_SIGNAL_MAX_COUNT) {
    collaborationInvalid(`source_signal_ids exceeds ${COLLABORATION_SOURCE_SIGNAL_MAX_COUNT} entries`);
  }
  const ids = value.map((item) => validateCollaborationRecordId(item, 'source_signal_id'));
  if (new Set(ids).size !== ids.length) collaborationInvalid('source_signal_ids must be unique');
  return Object.freeze(ids);
}

export function buildWorkStateHandoff(input: WorkStateHandoffInput): WorkStateHandoffV1 {
  const handoffId = validateCollaborationRecordId(input.handoff_id, 'handoff_id');
  const supersedes = input.supersedes_handoff_id === null
    ? null
    : validateCollaborationRecordId(input.supersedes_handoff_id, 'supersedes_handoff_id');
  if (supersedes === handoffId) collaborationInvalid('a handoff cannot supersede itself');
  const goal = messageRequiredString(input.goal, 'goal', collaborationInvalid);
  assertMessageBoundedUtf8(goal, 'goal', HANDOFF_GOAL_MAX_BYTES, collaborationInvalid);
  if (goal.trim().length === 0) collaborationInvalid('goal must not be blank');
  const basis = Object.freeze({
    protocol: COLLABORATION_PROTOCOL,
    kind: WORK_STATE_HANDOFF_KIND,
    handoff_id: handoffId,
    repository_id: validateCollaborationRepositoryId(input.repository_id),
    actor: validateCollaborationActorRef(input.actor),
    thread_key: validateCollaborationThreadKey(input.thread_key),
    scope_refs: validateCollaborationScopeRefs(input.scope_refs, 'scope_refs'),
    trigger: validateTrigger(input.trigger),
    goal,
    completed: entryList(input.completed, 'completed', 0),
    // `key_findings` and `dead_ends` may be empty: a run that found nothing and
    // ruled nothing out is a real outcome, and a validator that forces a row
    // here buys "none" written in the successor's evidence slot.
    key_findings: entryList(input.key_findings, 'key_findings', 0),
    attempted_paths: validateAttemptedPaths(input.attempted_paths),
    dead_ends: entryList(input.dead_ends, 'dead_ends', 0),
    open_hypotheses: entryList(input.open_hypotheses, 'open_hypotheses', 0),
    // A handoff with nothing to do next hands nothing off.
    next_actions: entryList(input.next_actions, 'next_actions', 1),
    source_signal_ids: validateSourceSignalIds(input.source_signal_ids),
    execution_context: validateHandoffExecutionContext(input.execution_context),
    supersedes_handoff_id: supersedes,
    created_at: validateCollaborationRecordedAt(input.created_at, 'created_at'),
  });
  return Object.freeze({
    ...basis,
    handoff_sha256: canonicalCollaborationDigest(basis as unknown as Readonly<Record<string, unknown>>),
  });
}

export function validateWorkStateHandoff(value: unknown): WorkStateHandoffV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('work state handoff must be an object');
  assertMessageExactKeys(value, HANDOFF_FIELDS, 'work state handoff', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL || value.kind !== WORK_STATE_HANDOFF_KIND) {
    collaborationInvalid('work state handoff protocol or kind is invalid');
  }
  const handoff = buildWorkStateHandoff({
    handoff_id: value.handoff_id as string,
    repository_id: value.repository_id as string,
    actor: value.actor as CollaborationActorRefV1,
    thread_key: value.thread_key as string,
    scope_refs: value.scope_refs as readonly CollaborationScopeRefV1[],
    trigger: value.trigger as WorkStateHandoffTrigger,
    goal: value.goal as string,
    completed: value.completed as readonly string[],
    key_findings: value.key_findings as readonly string[],
    attempted_paths: value.attempted_paths as readonly HandoffAttemptedPathV1[],
    dead_ends: value.dead_ends as readonly string[],
    open_hypotheses: value.open_hypotheses as readonly string[],
    next_actions: value.next_actions as readonly string[],
    source_signal_ids: value.source_signal_ids as readonly string[],
    execution_context: value.execution_context as HandoffExecutionContextV1,
    supersedes_handoff_id: value.supersedes_handoff_id as string | null,
    created_at: value.created_at as string,
  });
  if (value.handoff_sha256 !== handoff.handoff_sha256) {
    collaborationInvalid('work state handoff handoff_sha256 is stale');
  }
  return handoff;
}

export function canonicalWorkStateHandoffBytes(handoff: WorkStateHandoffV1): string {
  return canonicalCollaborationBytes(
    validateWorkStateHandoff(handoff) as unknown as Readonly<Record<string, unknown>>,
  );
}
