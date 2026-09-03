/**
 * Pure board projection: collected board inputs -> one `BoardDocumentV1`.
 *
 * Zero IO, zero clock, zero randomness. Identical input bytes yield
 * byte-identical JSON, which is what makes the A/B revision comparison in
 * `src/effects/state/resolve-board.ts` mean anything: if the document could
 * vary on its own, an unequal round would prove nothing about the inputs.
 *
 * Three dimensions, three authorities, never collapsed into one `status`:
 *
 * | dimension        | authority                        | may move work |
 * | ---------------- | -------------------------------- | ------------- |
 * | `task_state`     | the canonical sprint row         | yes           |
 * | `lease_state`    | the owner record on the plane    | yes           |
 * | `progress_state` | the owner worktree's ledger      | no            |
 *
 * Column decision table, first match wins (`done > blocked > doing > todo`):
 *
 * | # | Column  | Condition                                                        |
 * |---|---------|------------------------------------------------------------------|
 * | 1 | done    | `task_state === 'done'` -- unconditional                          |
 * | 2 | blocked | lease `unknown` or `released`                                     |
 * | 3 | blocked | `task_state` `drifted` or `missing`                               |
 * | 4 | blocked | `progress_state === 'stalled'`                                    |
 * | 5 | blocked | the owner worktree left `git worktree list`                       |
 * | 6 | blocked | the owner record names a different canonical ref                  |
 * | 7 | doing   | lease `reserving`, `bound`, or `completing`                       |
 * | 8 | todo    | everything else (a pending row with no lease)                     |
 *
 * Row 1 is unconditional on purpose: the tracked `[x]` row is the completion
 * authority, and a residual lease on a completed row is cleanup, not work. It
 * carries `lease_cleanup_required` plus an executable `actions.reconcile`
 * instead of dragging the card back into `blocked`.
 *
 * Row 2 puts a residual `released` in `blocked` because it genuinely blocks:
 * `claimSprintCommand` refuses anything whose classification is not
 * `available`, so a `released` record whose directory removal never completed
 * is an unclaimable row, not a free one.
 *
 * `progress_state === 'unreadable'` is deliberately absent from the blocking
 * set. Evidence failure must never transfer or withhold ownership, so an
 * unreadable ledger yields a card whose `claim`, `lease_state`, and `column`
 * are field-for-field identical to the readable case.
 */
import { createHash } from 'crypto';
import { evaluateAttemptStall, type AttemptLedgerRead } from './attempt-ledger';
import {
  COMPLETED_ROW_STATUS_PATTERN,
  PENDING_ROW_STATUS,
  type LeaseOwnerRecord,
} from './coordination-identity';
import type { CanonicalTaskRow } from './coordination-identity';
import type {
  BoardActionsV1,
  BoardCanonicalTargetV1,
  BoardCardV1,
  BoardClaimV1,
  BoardColumn,
  BoardDiagnosticsV1,
  BoardDocumentV1,
  BoardLeaseState,
  BoardOwnershipDiagnosticsV1,
  BoardProgressState,
  BoardRevisionsV1,
  TaskState,
} from './types';

/** Board document protocol; part of the composite revision preimage. */
export const BOARD_PROTOCOL = 1;

const BOARD_REVISION_DOMAIN = 'repo-harness-board-revision';

/**
 * Domain-separated digest over an ordered field list, matching the JSON-array
 * encoding `coordination-identity.ts` uses: every field is quoted and escaped
 * by `JSON.stringify`, so no field value can forge a separator into another
 * field's position, and `null` stays distinguishable from the empty string.
 *
 * The `sha256:` prefix is the house revision shape (`state_revision`,
 * `progress_token`), unlike the bare hex `task_id` uses -- these values are
 * never path components.
 */
export function boardDigest(domain: string, fields: readonly (string | null)[]): string {
  const preimage = JSON.stringify([domain, ...fields]);
  return `sha256:${createHash('sha256').update(preimage, 'utf-8').digest('hex')}`;
}

/**
 * Compose the four per-dimension revisions into the composite one
 * `snapshot_consistency` compares. Published as a function rather than inlined
 * in the collector so a test collector and the real collector cannot disagree
 * about what "the same inputs" means.
 */
export function composeBoardRevision(
  dimensions: Omit<BoardRevisionsV1, 'board'>,
): BoardRevisionsV1 {
  return {
    ...dimensions,
    board: boardDigest(BOARD_REVISION_DOMAIN, [
      String(BOARD_PROTOCOL),
      dimensions.task_authority,
      dimensions.coordination,
      dimensions.topology,
      dimensions.evidence,
    ]),
  };
}

/** One lease read, reduced to what the projection may look at. */
export interface BoardLeaseInput {
  readonly classification: BoardLeaseState;
  /** The store's own `unknown_reason`, passed through verbatim. */
  readonly unknown_reason: string | null;
  readonly record: LeaseOwnerRecord | null;
}

/**
 * Everything observed in one owner worktree. Present only for a lease whose
 * record names an execution worktree; a `reserving` lease has none yet.
 */
export interface BoardEvidenceInput {
  readonly worktree: string;
  /** Whether the worktree is still in `git worktree list --porcelain`. */
  readonly worktree_present: boolean;
  /** Parsed attempt ledger, or null when it was not read at all. */
  readonly ledger: AttemptLedgerRead | null;
  /** The ledger's own bytes; digest input only, never projected into a card. */
  readonly ledger_raw: string | null;
  /** `resolveEffectiveStateReadOnly(...).progress_token`, or null when unresolvable. */
  readonly progress_token: string | null;
  readonly progress_unreadable_reason: string | null;
}

export interface BoardTaskInput {
  readonly task_id: string;
  readonly task_revision: string;
  /**
   * The canonical row, or null when a lease survives a row that left the
   * sprint. `collectBoardInputs` enumerates from canonical rows, so it never
   * produces null today; the projector still handles it, because a total
   * projection is what keeps `missing` from becoming an unreachable state that
   * silently changes meaning the first time a caller does enumerate leases.
   */
  readonly row: CanonicalTaskRow | null;
  readonly lease: BoardLeaseInput;
  readonly evidence: BoardEvidenceInput | null;
}

export interface BoardInputsV1 {
  readonly canonical_target: BoardCanonicalTargetV1;
  readonly sprint_path: string;
  readonly tasks: readonly BoardTaskInput[];
  readonly revisions: BoardRevisionsV1;
}

/**
 * The ownership-dimension inputs, and only those: the canonical row, the lease
 * read, and whether git still lists the owner worktree. This is the exact
 * subset `src/core/state/project-board-slice.ts` can collect without opening an
 * attempt ledger or resolving a second worktree's Effective State, and every
 * `derive*` function below is written against it so the two projections cannot
 * drift into two lease classifications.
 *
 * `worktree_present` is a tri-state on purpose: `null` means no owner worktree
 * was observed at all (a `reserving` lease names none), which is not the same
 * fact as `false` ("git no longer lists the one it names").
 */
export interface BoardOwnershipInput {
  readonly task_id: string;
  readonly task_revision: string;
  readonly row: CanonicalTaskRow | null;
  readonly lease: BoardLeaseInput;
  readonly worktree_present: boolean | null;
}

/** Lease states the slice reports as a live peer. */
export const ACTIVE_LEASE_STATES: ReadonlySet<BoardLeaseState> = new Set<BoardLeaseState>([
  'reserving',
  'bound',
  'completing',
  'reviewing',
]);

/** Lease states a fencing token may still give up or have taken from it. */
const GIVABLE_LEASE_STATES: ReadonlySet<string> = new Set(['reserving', 'bound']);

/**
 * `drifted` covers both shapes of "the canonical definition is not what
 * execution is holding": the owner's recorded `task_revision` no longer
 * matches canonical, and a status cell outside the `[ ]` / `[x]` grammar
 * `sprint-backlog.sh` writes. Neither row is claimable and neither is done.
 */
export function deriveTaskState(task: BoardOwnershipInput): TaskState {
  const row = task.row;
  if (row === null) return 'missing';
  if (COMPLETED_ROW_STATUS_PATTERN.test(row.status)) return 'done';
  const record = task.lease.record;
  if (record !== null && record.task_revision !== task.task_revision) return 'drifted';
  if (row.status === PENDING_ROW_STATUS) return 'pending';
  return 'drifted';
}

/**
 * The evidence overlay. `evaluateAttemptStall` is the only stall rule in the
 * repository and it accepts exactly one input shape -- the ledger's own bytes
 * plus the envelope-scoped `progress_token` of the owner worktree -- so there
 * is no second rule here, only a mapping of its verdict onto the dimension.
 */
function progressState(task: BoardTaskInput): BoardProgressState {
  const evidence = task.evidence;
  if (evidence === null) return 'not_observed';
  if (evidence.ledger === null || evidence.progress_token === null) return 'unreadable';
  const verdict = evaluateAttemptStall(
    evidence.ledger,
    task.lease.record?.unit_ref ?? null,
    evidence.progress_token,
  );
  if (verdict === 'attempt_ledger_unreadable') return 'unreadable';
  return verdict === 'no_progress' ? 'stalled' : 'active';
}

export function deriveOwnershipDiagnostics(
  task: BoardOwnershipInput,
  state: TaskState,
  lease: BoardLeaseState,
  canonicalRef: string,
): BoardOwnershipDiagnosticsV1 {
  const record = task.lease.record;
  const worktreeMissing = task.worktree_present === false;
  return {
    definition_drift: state === 'drifted',
    target_ref_mismatch: record !== null && record.target_ref !== canonicalRef,
    worktree_missing: worktreeMissing,
    // Spec 11's auto-reclaimable shape, and only that shape: a live persisted
    // state, a worktree git no longer lists, and no open finish transaction.
    // `completing` and a stamped finish key are both excluded because neither
    // can prove the publication did not already land.
    orphan_reclaimable: worktreeMissing
      && record !== null
      && GIVABLE_LEASE_STATES.has(record.state)
      && record.finish_transaction_key === null,
    lease_cleanup_required: state === 'done' && lease !== 'available',
    lease_unknown_reason: task.lease.unknown_reason,
  };
}

/**
 * The column decision table. Exported for the slice, which computes a column
 * it never publishes: `projectActions`'s `reconcile` offer keys off "blocked",
 * and re-deriving a second blocking rule there would be exactly the divergence
 * the shared derivation exists to prevent. The slice passes `not_observed`,
 * which is the truthful progress value for a projection that never reads a
 * ledger, and drops the result.
 */
export function deriveColumn(
  state: TaskState,
  lease: BoardLeaseState,
  progress: BoardProgressState,
  diagnostics: BoardOwnershipDiagnosticsV1,
): BoardColumn {
  if (state === 'done') return 'done';
  if (
    lease === 'unknown'
    || lease === 'released'
    || state === 'drifted'
    || state === 'missing'
    || progress === 'stalled'
    || diagnostics.worktree_missing
    || diagnostics.target_ref_mismatch
  ) return 'blocked';
  if (ACTIVE_LEASE_STATES.has(lease)) return 'doing';
  return 'todo';
}

/**
 * Existing command strings only. `steal` and `release` are offered exactly
 * where the verbs would accept them, so a `completing` lease offers neither --
 * `stealLeaseRecord` refuses `completing` outright and `releaseLeaseRecord`
 * accepts only `reserving`/`bound`. Printing a command the verb would refuse
 * would be inventing an action, not projecting one.
 *
 * `steal` carries `<reason>` / `<session-id>` placeholders because both are
 * the caller's own statement; there is no value here that could stand in for
 * them without forging provenance.
 */
export function deriveActions(
  task: BoardOwnershipInput,
  lease: BoardLeaseState,
  column: BoardColumn,
  diagnostics: BoardOwnershipDiagnosticsV1,
  canonicalRef: string,
): BoardActionsV1 {
  const record = task.lease.record;
  const givable = record !== null && GIVABLE_LEASE_STATES.has(record.state);
  // Provider-backed closure is deliberately not the sprint reconcile domain.
  // A reviewing lease must name publication lifecycle commands only, never a
  // board action that the verb would refuse or that could clear it locally.
  const reconcilable = lease !== 'reviewing' && (diagnostics.lease_cleanup_required
    || (column === 'blocked' && lease !== 'available'));
  const publication = record !== null && record.state === 'reviewing'
    && 'current_publication' in record && record.current_publication !== null
    ? record.current_publication
    : null;
  const lifecycleBase = publication === null || record === null ? null
    : `--task-id ${task.task_id} --expected-claim-id ${record.claim_id}`
      + ` --expected-generation ${record.generation} --publication-id ${publication.publication_id}`
      + ` --expected-head-sha ${publication.head_sha}`;
  return {
    release: givable
      ? `repo-harness sprint release --claim-id ${record.claim_id}`
      : null,
    steal: givable
      ? `repo-harness sprint steal --expected-claim-id ${record.claim_id}`
        + " --reason '<reason>' --session-id '<session-id>'"
      : null,
    reconcile: reconcilable
      ? `repo-harness sprint reconcile --task-id ${task.task_id} --target-ref ${canonicalRef}`
      : null,
    publication_reconcile: lifecycleBase === null
      ? null
      : `repo-harness publication reconcile ${lifecycleBase} --remote '<remote>'`,
    publication_recover: record !== null && record.state === 'completing'
      ? 'repo-harness publication recover inspect'
      : null,
    publication_reopen: publication === null || record === null
      ? null
      : `repo-harness publication reopen --task-id ${task.task_id} --claim-id ${record.claim_id}`
        + ` --expected-generation ${record.generation} --publication-id ${publication.publication_id}`
        + ` --expected-head-sha ${publication.head_sha}`,
    publication_takeover: lifecycleBase === null
      ? null
      : `repo-harness publication takeover ${lifecycleBase} --reason '<reason>' --session-id '<session-id>'`,
    publication_abandon: lifecycleBase === null
      ? null
      : `repo-harness publication abandon ${lifecycleBase} --reason '<reason>'`,
  };
}

export function deriveClaim(record: LeaseOwnerRecord | null): BoardClaimV1 | null {
  if (record === null) return null;
  return {
    claim_id: record.claim_id,
    generation: record.generation,
    state: record.state,
    worktree: record.execution_worktree,
    branch: record.branch,
    unit_ref: record.unit_ref,
    session_id: record.claimed_by.session_id,
    source_worktree: record.claimed_by.source_worktree,
    target_ref: record.target_ref,
    finish_transaction_key: record.finish_transaction_key,
    current_publication: record.state === 'reviewing'
      && 'current_publication' in record
      ? record.current_publication
      : null,
    stolen_from: record.stolen_from,
  };
}

/**
 * The board's own inputs, narrowed to the ownership subset the shared
 * derivation consumes. A `reserving` lease names no execution worktree, so the
 * collector observed none and `worktree_present` is `null` -- the same value
 * the old `task.evidence !== null && !task.evidence.worktree_present` guard
 * produced as `worktree_missing: false`.
 */
function ownershipInput(task: BoardTaskInput): BoardOwnershipInput {
  return {
    task_id: task.task_id,
    task_revision: task.task_revision,
    row: task.row,
    lease: task.lease,
    worktree_present: task.evidence === null ? null : task.evidence.worktree_present,
  };
}

function projectCard(task: BoardTaskInput, canonicalRef: string): BoardCardV1 {
  const ownership = ownershipInput(task);
  const lease = task.lease.classification;
  const state = deriveTaskState(ownership);
  const progress = progressState(task);
  const diagnostics: BoardDiagnosticsV1 = {
    ...deriveOwnershipDiagnostics(ownership, state, lease, canonicalRef),
    progress_unreadable_reason: task.evidence?.progress_unreadable_reason ?? null,
  };
  const column = deriveColumn(state, lease, progress, diagnostics);
  const row = task.row;
  return {
    task_id: task.task_id,
    task_revision: task.task_revision,
    row_index: row?.index ?? '',
    task: row?.task ?? '',
    mode: row?.mode ?? '',
    acceptance: row?.acceptance ?? '',
    plan: row?.plan ?? '',
    column,
    task_state: state,
    lease_state: lease,
    progress_state: progress,
    claim: deriveClaim(task.lease.record),
    diagnostics,
    actions: deriveActions(ownership, lease, column, diagnostics, canonicalRef),
  };
}

/**
 * Cards stay in canonical file order. Sorting them by column or id would
 * discard the one ordering the sprint file actually asserts, and the caller
 * that wants a column view already has `column` on every card.
 *
 * `snapshot_consistency` is always `stable` here. Deciding it needs a second
 * observation of the inputs, which is an effect; `resolveBoard` owns that
 * decision and replaces this field, exactly as
 * `projectContinuationEnvelope`'s circuit-breaker post-pass replaces `route`.
 */
export function projectBoard(inputs: BoardInputsV1): BoardDocumentV1 {
  return {
    protocol: BOARD_PROTOCOL,
    kind: 'repo-harness-board',
    canonical_target: inputs.canonical_target,
    sprint_path: inputs.sprint_path,
    revisions: inputs.revisions,
    snapshot_consistency: 'stable',
    cards: inputs.tasks.map((task) => projectCard(task, inputs.canonical_target.ref)),
  };
}
