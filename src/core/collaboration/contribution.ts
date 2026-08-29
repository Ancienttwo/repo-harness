/**
 * `CollaborationContributionDraftV1` and `CollaborationContributionCommitV1` —
 * what a delegated Worker produced, and the single point at which it becomes
 * visible.
 *
 * Sprint row C4. Two properties are load-bearing and both are structural rather
 * than procedural:
 *
 * 1. **The draft names no author.** There is no actor field anywhere below. The
 *    Host derives `delegated_worker` from the persisted `WorkerRunRefV1` and the
 *    admission receipt, so a Worker that writes an identity into its own output
 *    is writing into a key the exact-key check rejects.
 * 2. **Identity is derived from the run, not from the content.** Every signal
 *    and the handoff take `<worker_run_ref_sha256>#<index>` as their identity
 *    key, which is the shape `deriveCoordinationSignalId()` was written for in
 *    C1. A retried collection therefore recomputes the same ids and reconciles
 *    through the store's create-once branch instead of appending duplicates.
 *
 * The commit is the visibility boundary. Candidate signals and the handoff land
 * first, immutably; the commit is the last write, and a projection that reads
 * only committed contributions can never observe a half-published one. Its own
 * identity is derived from the run reference alone, so one run has exactly one
 * commit by construction rather than by a policy check.
 *
 * The wire version is the frozen `COLLABORATION_PROTOCOL`; this row mints no
 * second protocol constant for the same plane (C1 and C3 precedent).
 */
import {
  COLLABORATION_PROTOCOL,
  COLLABORATION_SOURCE_SIGNAL_MAX_COUNT,
  canonicalCollaborationBytes,
  canonicalCollaborationDigest,
  collaborationInvalid,
  deriveCollaborationRecordId,
  isCollaborationRecord,
  validateCollaborationArtifactRefs,
  validateCollaborationBody,
  validateCollaborationLabels,
  validateCollaborationRecordId,
  validateCollaborationRecordedAt,
  validateCollaborationScopeRefs,
  validateCollaborationThreadKey,
  validateCollaborationTitle,
  type CollaborationArtifactRefV1,
  type CollaborationScopeRefV1,
} from './common';
import {
  WORK_STATE_HANDOFF_TRIGGERS,
  validateHandoffExecutionContext,
  type HandoffAttemptedPathV1,
  type HandoffExecutionContextV1,
  type WorkStateHandoffTrigger,
} from './handoff';
import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageSha256,
  messageRequiredString,
} from '../messages/mechanics';

export const CONTRIBUTION_DRAFT_KIND = 'repo-harness-collaboration-contribution-draft' as const;
export const CONTRIBUTION_COMMIT_KIND = 'repo-harness-collaboration-contribution-commit' as const;

/**
 * Transport limits for this record family, kept local exactly as `handoff.ts`
 * keeps its own: nothing outside a contribution needs them, and `common.ts` is
 * C1's to own.
 */
export const CONTRIBUTION_SIGNAL_MAX_COUNT = 16;
export const CONTRIBUTION_ENTRY_MAX_BYTES = 1024;
export const CONTRIBUTION_GOAL_MAX_BYTES = 2 * 1024;
export const CONTRIBUTION_LIST_MAX_COUNT = 32;

/**
 * One signal the Worker proposes. It is the authorable subset of
 * `CoordinationSignalV1`: everything the Host owns — id, repository, actor,
 * recorded time, digest — is absent, and absent is enforced by the exact-key
 * check rather than ignored on read.
 */
export interface ContributionSignalDraftV1 {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly scope_refs: readonly CollaborationScopeRefV1[];
  readonly artifact_refs: readonly CollaborationArtifactRefV1[];
  readonly reply_to_signal_id: string | null;
  readonly source_signal_ids: readonly string[];
}

/** The authorable subset of `WorkStateHandoffV1`, on the same rule. */
export interface ContributionHandoffDraftV1 {
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
}

export interface CollaborationContributionDraftV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof CONTRIBUTION_DRAFT_KIND;
  readonly thread_key: string;
  readonly signals: readonly ContributionSignalDraftV1[];
  readonly handoff: ContributionHandoffDraftV1 | null;
  readonly built_on_signal_ids: readonly string[];
}

export interface ContributionSignalRefV1 {
  readonly signal_id: string;
  readonly signal_sha256: string;
}

export interface ContributionHandoffRefV1 {
  readonly handoff_id: string;
  readonly handoff_sha256: string;
}

export interface CollaborationContributionCommitV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof CONTRIBUTION_COMMIT_KIND;
  readonly worker_run_ref_sha256: string;
  /**
   * The exact draft this commit published. The draft is not a persisted shard —
   * D9's frozen shard list has none — because it is a pure function of the
   * stdout blob the `WorkerResultV1` evidence refs already pin. Recomputing the
   * draft from that blob reproduces this digest, which is a stronger binding
   * than a second copy that could drift from its own preimage.
   */
  readonly draft_sha256: string;
  readonly signal_refs: readonly ContributionSignalRefV1[];
  readonly handoff_ref: ContributionHandoffRefV1 | null;
  /** Host-derived and stable across retries; never re-sampled from the wall clock. */
  readonly committed_at: string;
  readonly commit_sha256: string;
}

export type CollaborationContributionCommitInput =
  Omit<CollaborationContributionCommitV1, 'protocol' | 'kind' | 'commit_sha256'>;

const DRAFT_FIELDS = ['protocol', 'kind', 'thread_key', 'signals', 'handoff', 'built_on_signal_ids'] as const;

const SIGNAL_DRAFT_FIELDS = [
  'title',
  'body',
  'labels',
  'scope_refs',
  'artifact_refs',
  'reply_to_signal_id',
  'source_signal_ids',
] as const;

const HANDOFF_DRAFT_FIELDS = [
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
] as const;

const COMMIT_FIELDS = [
  'protocol',
  'kind',
  'worker_run_ref_sha256',
  'draft_sha256',
  'signal_refs',
  'handoff_ref',
  'committed_at',
  'commit_sha256',
] as const;

function digest(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  assertMessageSha256(text, field, collaborationInvalid);
  return text;
}

/** One unit of written-down knowledge; blank-but-present is rejected (C3 rule). */
function entry(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  assertMessageBoundedUtf8(text, field, CONTRIBUTION_ENTRY_MAX_BYTES, collaborationInvalid);
  if (text.trim().length === 0) collaborationInvalid(`${field} must not be blank`);
  return text;
}

function entryList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > CONTRIBUTION_LIST_MAX_COUNT) {
    collaborationInvalid(`${field} exceeds ${CONTRIBUTION_LIST_MAX_COUNT} entries`);
  }
  return Object.freeze(value.map((item) => entry(item, field)));
}

function signalIdList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > COLLABORATION_SOURCE_SIGNAL_MAX_COUNT) {
    collaborationInvalid(`${field} exceeds ${COLLABORATION_SOURCE_SIGNAL_MAX_COUNT} entries`);
  }
  const ids = value.map((item) => validateCollaborationRecordId(item, field));
  if (new Set(ids).size !== ids.length) collaborationInvalid(`${field} must be unique`);
  return Object.freeze(ids);
}

function attemptedPaths(value: unknown): readonly HandoffAttemptedPathV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > CONTRIBUTION_LIST_MAX_COUNT) {
    collaborationInvalid(`attempted_paths must hold 1 to ${CONTRIBUTION_LIST_MAX_COUNT} entries`);
  }
  return Object.freeze(value.map((item) => {
    if (!isCollaborationRecord(item)) collaborationInvalid('attempted_path must be an object');
    assertMessageExactKeys(item, ['description', 'outcome', 'evidence_refs'], 'attempted_path', collaborationInvalid);
    return Object.freeze({
      description: entry(item.description, 'attempted_path description'),
      outcome: entry(item.outcome, 'attempted_path outcome'),
      evidence_refs: validateCollaborationArtifactRefs(item.evidence_refs, 'attempted_path evidence_refs'),
    });
  }));
}

export function validateContributionSignalDraft(value: unknown): ContributionSignalDraftV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('contribution signal draft must be an object');
  assertMessageExactKeys(value, SIGNAL_DRAFT_FIELDS, 'contribution signal draft', collaborationInvalid);
  return Object.freeze({
    title: validateCollaborationTitle(value.title),
    body: validateCollaborationBody(value.body),
    labels: validateCollaborationLabels(value.labels, 'labels'),
    scope_refs: validateCollaborationScopeRefs(value.scope_refs, 'scope_refs'),
    artifact_refs: validateCollaborationArtifactRefs(value.artifact_refs, 'artifact_refs'),
    reply_to_signal_id: value.reply_to_signal_id === null
      ? null
      : validateCollaborationRecordId(value.reply_to_signal_id, 'reply_to_signal_id'),
    source_signal_ids: signalIdList(value.source_signal_ids, 'source_signal_ids'),
  });
}

export function validateContributionHandoffDraft(value: unknown): ContributionHandoffDraftV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('contribution handoff draft must be an object');
  assertMessageExactKeys(value, HANDOFF_DRAFT_FIELDS, 'contribution handoff draft', collaborationInvalid);
  if (!(WORK_STATE_HANDOFF_TRIGGERS as readonly string[]).includes(value.trigger as string)) {
    collaborationInvalid('trigger is invalid');
  }
  const goal = messageRequiredString(value.goal, 'goal', collaborationInvalid);
  assertMessageBoundedUtf8(goal, 'goal', CONTRIBUTION_GOAL_MAX_BYTES, collaborationInvalid);
  if (goal.trim().length === 0) collaborationInvalid('goal must not be blank');
  const nextActions = entryList(value.next_actions, 'next_actions');
  if (nextActions.length === 0) collaborationInvalid('next_actions must not be empty');
  return Object.freeze({
    trigger: value.trigger as WorkStateHandoffTrigger,
    goal,
    completed: entryList(value.completed, 'completed'),
    key_findings: entryList(value.key_findings, 'key_findings'),
    attempted_paths: attemptedPaths(value.attempted_paths),
    dead_ends: entryList(value.dead_ends, 'dead_ends'),
    open_hypotheses: entryList(value.open_hypotheses, 'open_hypotheses'),
    next_actions: nextActions,
    source_signal_ids: signalIdList(value.source_signal_ids, 'source_signal_ids'),
    execution_context: validateHandoffExecutionContext(value.execution_context),
  });
}

/**
 * Validate one whole draft. Nothing partial is accepted: the collector runs this
 * before any visible write, so a draft whose fifth signal is malformed publishes
 * none of the first four.
 */
export function validateCollaborationContributionDraft(value: unknown): CollaborationContributionDraftV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('contribution draft must be an object');
  assertMessageExactKeys(value, DRAFT_FIELDS, 'contribution draft', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL || value.kind !== CONTRIBUTION_DRAFT_KIND) {
    collaborationInvalid('contribution draft protocol or kind is invalid');
  }
  if (!Array.isArray(value.signals) || value.signals.length > CONTRIBUTION_SIGNAL_MAX_COUNT) {
    collaborationInvalid(`signals exceeds ${CONTRIBUTION_SIGNAL_MAX_COUNT} entries`);
  }
  // A contribution that proposes nothing is not a contribution. Accepting it
  // would let the collector publish a commit with no refs, which is exactly the
  // "empty contribution synthesised as a success" shape the row forbids.
  if (value.signals.length === 0 && value.handoff === null) {
    collaborationInvalid('contribution draft must carry at least one signal or a handoff');
  }
  return Object.freeze({
    protocol: COLLABORATION_PROTOCOL,
    kind: CONTRIBUTION_DRAFT_KIND,
    thread_key: validateCollaborationThreadKey(value.thread_key),
    signals: Object.freeze(value.signals.map(validateContributionSignalDraft)),
    handoff: value.handoff === null ? null : validateContributionHandoffDraft(value.handoff),
    built_on_signal_ids: signalIdList(value.built_on_signal_ids, 'built_on_signal_ids'),
  });
}

export function canonicalCollaborationContributionDraftBytes(
  draft: CollaborationContributionDraftV1,
): string {
  return canonicalCollaborationBytes(
    validateCollaborationContributionDraft(draft) as unknown as Readonly<Record<string, unknown>>,
  );
}

export function collaborationContributionDraftSha256(draft: CollaborationContributionDraftV1): string {
  return canonicalCollaborationDigest(
    validateCollaborationContributionDraft(draft) as unknown as Readonly<Record<string, unknown>>,
  );
}

/**
 * The identity key one contributed signal is filed under. It names the run and
 * the entry index and nothing else, so the same run collected twice derives the
 * same key, and two different runs never collide even on byte-identical content.
 *
 * The shape `<worker_run_ref_sha256>#<index>` is the one C1 wrote
 * `deriveCoordinationSignalId()` against; it is spelled once, here.
 */
export function contributionSignalIdentityKey(workerRunRefSha256: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= CONTRIBUTION_SIGNAL_MAX_COUNT) {
    collaborationInvalid('contribution signal index is invalid');
  }
  return `${digest(workerRunRefSha256, 'worker_run_ref_sha256')}#${index}`;
}

/**
 * The handoff key. A run publishes at most one handoff, so the index is fixed at
 * `handoff` rather than a number: a numeric slot would imply a second one could
 * exist.
 */
export function contributionHandoffIdentityKey(workerRunRefSha256: string): string {
  return `${digest(workerRunRefSha256, 'worker_run_ref_sha256')}#handoff`;
}

/**
 * The commit identity, derived from the run reference alone. One run has exactly
 * one commit because two commits for one run would be one filename, and the
 * store's create-once branch reconciles or conflicts rather than appending.
 */
export function deriveCollaborationContributionCommitId(workerRunRefSha256: string): string {
  return deriveCollaborationRecordId('contribution-commit', [
    digest(workerRunRefSha256, 'worker_run_ref_sha256'),
  ]);
}

function signalRefs(value: unknown): readonly ContributionSignalRefV1[] {
  if (!Array.isArray(value) || value.length > CONTRIBUTION_SIGNAL_MAX_COUNT) {
    collaborationInvalid(`signal_refs exceeds ${CONTRIBUTION_SIGNAL_MAX_COUNT} entries`);
  }
  const refs = value.map((item) => {
    if (!isCollaborationRecord(item)) collaborationInvalid('signal_ref must be an object');
    assertMessageExactKeys(item, ['signal_id', 'signal_sha256'], 'signal_ref', collaborationInvalid);
    return Object.freeze({
      signal_id: validateCollaborationRecordId(item.signal_id, 'signal_ref signal_id'),
      signal_sha256: digest(item.signal_sha256, 'signal_ref signal_sha256'),
    });
  });
  if (new Set(refs.map((ref) => ref.signal_id)).size !== refs.length) {
    collaborationInvalid('signal_refs must be unique');
  }
  return Object.freeze(refs);
}

function handoffRef(value: unknown): ContributionHandoffRefV1 | null {
  if (value === null) return null;
  if (!isCollaborationRecord(value)) collaborationInvalid('handoff_ref must be an object or null');
  assertMessageExactKeys(value, ['handoff_id', 'handoff_sha256'], 'handoff_ref', collaborationInvalid);
  return Object.freeze({
    handoff_id: validateCollaborationRecordId(value.handoff_id, 'handoff_ref handoff_id'),
    handoff_sha256: digest(value.handoff_sha256, 'handoff_ref handoff_sha256'),
  });
}

export function buildCollaborationContributionCommit(
  input: CollaborationContributionCommitInput,
): CollaborationContributionCommitV1 {
  const refs = signalRefs(input.signal_refs);
  const handoff = handoffRef(input.handoff_ref);
  if (refs.length === 0 && handoff === null) {
    collaborationInvalid('a contribution commit must publish at least one signal or a handoff');
  }
  const basis = Object.freeze({
    protocol: COLLABORATION_PROTOCOL,
    kind: CONTRIBUTION_COMMIT_KIND,
    worker_run_ref_sha256: digest(input.worker_run_ref_sha256, 'worker_run_ref_sha256'),
    draft_sha256: digest(input.draft_sha256, 'draft_sha256'),
    signal_refs: refs,
    handoff_ref: handoff,
    committed_at: validateCollaborationRecordedAt(input.committed_at, 'committed_at'),
  });
  return Object.freeze({
    ...basis,
    commit_sha256: canonicalCollaborationDigest(basis as unknown as Readonly<Record<string, unknown>>),
  });
}

export function validateCollaborationContributionCommit(value: unknown): CollaborationContributionCommitV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('contribution commit must be an object');
  assertMessageExactKeys(value, COMMIT_FIELDS, 'contribution commit', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL || value.kind !== CONTRIBUTION_COMMIT_KIND) {
    collaborationInvalid('contribution commit protocol or kind is invalid');
  }
  const commit = buildCollaborationContributionCommit({
    worker_run_ref_sha256: value.worker_run_ref_sha256 as string,
    draft_sha256: value.draft_sha256 as string,
    signal_refs: value.signal_refs as readonly ContributionSignalRefV1[],
    handoff_ref: value.handoff_ref as ContributionHandoffRefV1 | null,
    committed_at: value.committed_at as string,
  });
  if (value.commit_sha256 !== commit.commit_sha256) {
    collaborationInvalid('contribution commit commit_sha256 is stale');
  }
  return commit;
}

/** The commit carries no id field, so its identity is recomputed from its bytes. */
export function collaborationContributionCommitId(commit: CollaborationContributionCommitV1): string {
  return deriveCollaborationContributionCommitId(commit.worker_run_ref_sha256);
}

export function canonicalCollaborationContributionCommitBytes(
  commit: CollaborationContributionCommitV1,
): string {
  return canonicalCollaborationBytes(
    validateCollaborationContributionCommit(commit) as unknown as Readonly<Record<string, unknown>>,
  );
}

/**
 * The reference a `WorkerResultV1` carries so the run points at what it made
 * visible. It rides in `evidence_refs`, whose `ref` is already a free printable
 * string, so no delegation protocol byte moves.
 */
export const CONTRIBUTION_COMMIT_EVIDENCE_PREFIX = 'collaboration-contribution-commit:';

export function contributionCommitEvidenceRef(
  commit: CollaborationContributionCommitV1,
): { readonly ref: string; readonly sha256: string } {
  const valid = validateCollaborationContributionCommit(commit);
  return Object.freeze({
    ref: `${CONTRIBUTION_COMMIT_EVIDENCE_PREFIX}${collaborationContributionCommitId(valid)}`,
    sha256: valid.commit_sha256,
  });
}
