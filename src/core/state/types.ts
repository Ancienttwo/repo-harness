import type {
  WorkflowOperationKind,
  WorkflowProfile,
  WorkflowProfileSignals,
} from '../workflow/profile';
import type { EvaluateReadinessResult } from '../workflow/operation-readiness';
import type {
  LeaseState,
  LeaseStolenFrom,
  PersistedLeaseState,
} from './coordination-identity';

export type SnapshotPlanState =
  | 'none'
  | 'stale_marker'
  | 'foreign_worktree'
  | 'draft'
  | 'annotating'
  | 'approved'
  | 'executing'
  | 'unknown';

export type FreshnessState = 'fresh' | 'stale' | 'missing' | 'unavailable' | 'not_applicable';

export interface StateSnapshot {
  readonly protocol: 1;
  readonly kind: 'repo-harness-state-snapshot';
  readonly states: {
    readonly spec: 'present' | 'missing';
    readonly plan: SnapshotPlanState;
    readonly pending: 'none' | 'fresh' | 'stale';
    readonly worktree: 'current' | 'linked_target' | 'foreign_marker';
    readonly contract: 'present' | 'missing';
    readonly contract_path: 'present' | 'missing';
    readonly evidence: 'unchecked' | 'complete' | 'incomplete';
  };
  readonly paths: {
    readonly active_plan: string | null;
    readonly contract: string | null;
  };
  readonly marker: {
    readonly problem: 'none' | 'deleted' | 'foreign_worktree';
  };
}

export interface EffectiveStateSource {
  readonly path: string | null;
  readonly freshness: FreshnessState;
  readonly detail?: string;
}

export interface EffectiveStateV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-effective-state';
  readonly task_id: string | null;
  readonly phase: string;
  readonly state_version: number;
  readonly state_revision: string;
  /**
   * Four typed revisions partition the former single authority+subject+
   * evidence+projection mix (LOOP-03/LOOP-08 audit). `state_revision` above
   * stays the untouched all-source union (LSC-05 owns allocation); these are
   * additive and each computed once per bucket (LSC-04).
   */
  readonly authority_revision: string;
  readonly subject_revision: string;
  readonly evidence_revision: string;
  readonly projection_revision: string;
  /**
   * Pure content hash over exactly {subject_revision, completed-task markers
   * derived from the plan text, evidence_revision, the hard blocker set,
   * allowed_paths}. No projection, time, or PID input feeds it.
   */
  readonly progress_token: string;
  readonly authoritative_plan: {
    readonly path: string;
    readonly status: SnapshotPlanState;
  } | null;
  readonly contract: {
    readonly path: string;
    readonly status: string | null;
    readonly plan: string | null;
  } | null;
  readonly task_profile: string | null;
  readonly workflow_profile: WorkflowProfile | null;
  readonly requested_workflow_profile: string | null;
  readonly risk_floor: WorkflowProfile;
  readonly profile_reasons: readonly string[];
  readonly profile_signals: WorkflowProfileSignals | null;
  readonly allowed_paths: readonly string[];
  readonly next_action: string | null;
  readonly guidance: string | null;
  readonly blockers: readonly string[];
  readonly stale_sources: readonly string[];
  readonly conflicting_sources: readonly string[];
  readonly source_hashes: Readonly<Record<string, string>>;
  readonly review: EffectiveStateSource & {
    readonly recommendation: string | null;
    readonly recorded_subject_sha256: string | null;
    readonly recorded_target_revision: string | null;
  };
  readonly external_acceptance: EffectiveStateSource & {
    readonly status: string | null;
  };
  readonly checks: EffectiveStateSource & {
    readonly status: string | null;
  };
  readonly active_sprint: EffectiveStateSource;
  readonly worktree: EffectiveStateSource & {
    readonly current: string;
    readonly owner: string | null;
  };
  readonly handoff: EffectiveStateSource;
  readonly resume: EffectiveStateSource;
  readonly current_snapshot: EffectiveStateSource;
  /**
   * LSC-07: additive shared-readiness projection. `evaluateReadiness`
   * (operation `'stop'`, scoping its `nextAction` to the Stop gate) computed
   * purely from inputs this projector already has -- per-operation
   * `resolve()` decisions, contract presence, worktree ownership,
   * review/external/checks freshness, and `blockers`. Null only when
   * `workflow_profile` itself is unavailable (`riskResolution` not ok);
   * every other existing field keeps byte-identical semantics.
   */
  readonly readiness: EvaluateReadinessResult | null;
}

export type EffectiveState = EffectiveStateV1;

/**
 * The six continuation routes. There is deliberately no `ask`/`wait` member:
 * blocked and needs-user states collapse into `halt`, whose `reason` carries
 * the existing blocker/plan-status/sprint-status vocabulary.
 */
export type ContinuationRoute =
  | 'continue_active_plan'
  | 'advance_sprint'
  | 'verify_or_finish'
  | 'halt'
  | 'complete'
  | 'idle';

/**
 * One deterministic per-turn answer to "what is next", projected from the
 * effective state plus the active sprint's own file. It is a read model, never
 * an authority: `command` names the existing command that owns the action (row
 * selection stays in `sprint-backlog`), and one call yields exactly one unit or
 * one halt. Identical repo bytes yield byte-identical JSON -- no time, PID,
 * locale, or absolute path enters this document.
 */
export interface ContinuationEnvelopeV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-continuation-envelope';
  readonly route: ContinuationRoute;
  /** Repo-relative plan or sprint path identifying the unit; null only for `idle`. */
  readonly unit_ref: string | null;
  readonly authority_revision: string;
  readonly progress_token: string;
  /** Exact existing command for actionable routes; null for `halt`/`complete`/`idle`. */
  readonly command: string | null;
  readonly reason: string;
}

/**
 * The three outcomes a continuation attempt may end in. `completed` and
 * `halted` are what the loop host observed; `resumed` is the explicit user
 * resume that clears a stall count.
 */
export type AttemptOutcome = 'completed' | 'halted' | 'resumed';

/**
 * One recorded continuation attempt, appended verbatim as a single JSONL line
 * to the ignored runtime ledger. It is evidence, never authority: nothing in
 * this document may enter `EffectiveState` resolution, `state_revision`, or the
 * `progress_token` recipe. The only thing a sequence of receipts can do is flip
 * an otherwise-actionable continuation envelope to `halt`.
 *
 * `before_progress_token`/`after_progress_token` are the envelope-scoped
 * `progress_token` values the recorder was handed. They are null only for an
 * explicit `resumed` receipt, which carries no token claim at all.
 */
export interface AttemptReceiptV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-attempt-receipt';
  readonly unit_ref: string;
  readonly before_progress_token: string | null;
  readonly after_progress_token: string | null;
  readonly outcome: AttemptOutcome;
  /** Ledger-only timestamp; never projected into envelope output. */
  readonly recorded_at: string;
}

export interface EffectiveStateRiskInput {
  readonly targetPaths?: readonly string[];
  readonly capabilityIds?: readonly string[];
  readonly capabilityCount?: number;
  readonly operationKind?: WorkflowOperationKind;
  readonly explicitOverride?: WorkflowProfile;
}

/* -------------------------------------------------------------------------
 * Deterministic kanban board (WP2)
 *
 * The read-only projection of one canonical sprint onto four columns. It is a
 * diagnostic read model and never an authority: `claim`, `steal`, `release`,
 * and `begin-completion` re-read the lease under their own task lock, which is
 * exactly why this document may report `changed_during_read` instead of
 * blocking on a lock it deliberately never takes.
 *
 * Three dimensions stay separated rather than collapsing into one `status`,
 * because they answer three different questions with three different
 * authorities: the canonical row (`task_state`), the shared lease plane
 * (`lease_state`), and the owner worktree's attempt ledger (`progress_state`).
 * Only the first two can move work; the third is an evidence overlay.
 * ---------------------------------------------------------------------- */

/** Column precedence is fixed at `done > blocked > doing > todo`. */
export type BoardColumn = 'todo' | 'doing' | 'blocked' | 'done';

/**
 * The canonical-row dimension. `missing` names a lease whose row no longer
 * exists on the canonical ref; `drifted` names a row whose definition no longer
 * matches what its owner claimed (or whose status cell is outside the `[ ]` /
 * `[x]` grammar `sprint-backlog.sh` writes).
 */
export type TaskState = 'pending' | 'done' | 'missing' | 'drifted';

/**
 * The lease dimension: the store's own vocabulary, passed through unchanged.
 * `orphaned` is deliberately absent -- it is not a persisted state but a
 * derivation over topology, published as `diagnostics.orphan_reclaimable`.
 */
export type BoardLeaseState = LeaseState | 'unknown';

/** The evidence dimension. `stalled` never transfers ownership (spec 10.5). */
export type BoardProgressState = 'not_observed' | 'active' | 'stalled' | 'unreadable';

/** The owning lease record, projected. Null when no lease record exists. */
export interface BoardClaimV1 {
  readonly claim_id: string;
  readonly generation: number;
  readonly state: PersistedLeaseState;
  readonly worktree: string | null;
  readonly branch: string | null;
  readonly unit_ref: string | null;
  readonly session_id: string;
  readonly source_worktree: string;
  readonly target_ref: string;
  readonly finish_transaction_key: string | null;
  readonly stolen_from: LeaseStolenFrom | null;
}

/**
 * The diagnostics both board projections share: every field derivable from the
 * canonical row, the lease record, and git's worktree list alone. No evidence
 * dimension, so a projection that never opens an attempt ledger (the hook
 * slice) and one that does (the full board) still classify ownership through
 * one implementation.
 *
 * The two conflict fields spec 12 describes (`actual_path_overlap` /
 * `scope_overlap`) are absent rather than empty: the changed-set authority is
 * a cwd-bound shell function, and re-deriving it here would be a shadow
 * parser. Absent says "not computed"; `[]` would say "no overlap", which
 * neither projection can prove.
 */
export interface BoardOwnershipDiagnosticsV1 {
  readonly definition_drift: boolean;
  readonly target_ref_mismatch: boolean;
  readonly worktree_missing: boolean;
  readonly orphan_reclaimable: boolean;
  readonly lease_cleanup_required: boolean;
  /** The store's `unknown_reason`, verbatim; null unless `lease_state` is `unknown`. */
  readonly lease_unknown_reason: string | null;
}

/** Per-card diagnostics: the shared ownership set plus the evidence overlay. */
export interface BoardDiagnosticsV1 extends BoardOwnershipDiagnosticsV1 {
  readonly progress_unreadable_reason: string | null;
}

/** Existing command strings, never re-implemented logic. Null means not offered. */
export interface BoardActionsV1 {
  readonly release: string | null;
  readonly steal: string | null;
  readonly reconcile: string | null;
}

export interface BoardCardV1 {
  readonly task_id: string;
  readonly task_revision: string;
  /** The backlog index cell verbatim; a string, exactly as the row grammar reads it. */
  readonly row_index: string;
  readonly task: string;
  readonly mode: string;
  readonly acceptance: string;
  readonly plan: string;
  readonly column: BoardColumn;
  readonly task_state: TaskState;
  readonly lease_state: BoardLeaseState;
  readonly progress_state: BoardProgressState;
  readonly claim: BoardClaimV1 | null;
  readonly diagnostics: BoardDiagnosticsV1;
  readonly actions: BoardActionsV1;
}

/**
 * Four per-dimension input revisions plus their composite. Comparing only the
 * sprint revision reports `stable` while lease owners flip underneath the read;
 * the composite is what `snapshot_consistency` actually compares, and the four
 * dimensions are published so a torn read can be localized.
 */
export interface BoardRevisionsV1 {
  readonly task_authority: string;
  readonly coordination: string;
  readonly topology: string;
  readonly evidence: string;
  readonly board: string;
}

/**
 * `changed_during_read` means the inputs moved across a full collect ->
 * project -> collect round twice. The document stays usable for diagnosis;
 * no ownership verb may trust it.
 */
export type BoardSnapshotConsistency = 'stable' | 'changed_during_read';

export interface BoardCanonicalTargetV1 {
  readonly ref: string;
  readonly oid: string;
}

export interface BoardDocumentV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-board';
  readonly canonical_target: BoardCanonicalTargetV1;
  readonly sprint_path: string;
  readonly revisions: BoardRevisionsV1;
  readonly snapshot_consistency: BoardSnapshotConsistency;
  readonly cards: readonly BoardCardV1[];
}

/* -------------------------------------------------------------------------
 * Hook board slice (WP3)
 *
 * What a hook may afford to observe, and nothing more. `BoardDocumentV1` costs
 * 644-1288ms because its evidence dimension resolves Effective State once per
 * owner worktree (~100ms each); a route that fires on every structured edit
 * cannot pay that, so the slice reads only the two cheap authorities -- the
 * canonical sprint and the lease plane, plus git's worktree list -- and
 * publishes exactly what those two can prove.
 *
 * Three groups of fields are STRUCTURALLY ABSENT rather than null or empty:
 *
 * - `progress_state`: the evidence dimension is never collected here, and a
 *   `not_observed` field would advertise a dimension this document does not
 *   have;
 * - `column`: the column decision table consumes `progress_state`, so a column
 *   projected without it would be a second, quieter column rule that disagrees
 *   with `repo-harness state board --json` on exactly the `stalled` rows;
 * - every conflict field (`actual_path_overlap`, `scope_overlap`): the WP2
 *   precedent, for the same shadow-parser reason.
 *
 * Absence is the contract. A consumer reads the closing pointer line and runs
 * the board command when it needs the dimensions this slice refuses to guess.
 * ---------------------------------------------------------------------- */

/**
 * The current tree's own row: what it holds, and what is wrong with what it
 * holds. Null on the slice when this tree holds no resolvable claim.
 */
export interface BoardSliceSelfV1 {
  readonly task_id: string;
  readonly task_revision: string;
  /** The backlog task cell verbatim. */
  readonly task: string;
  /** The backlog Plan cell verbatim; empty until finish back-fills it. */
  readonly plan: string;
  readonly task_state: TaskState;
  readonly lease_state: BoardLeaseState;
  readonly claim: BoardClaimV1 | null;
  readonly diagnostics: BoardOwnershipDiagnosticsV1;
  readonly actions: BoardActionsV1;
}

/**
 * One other row with a live lease. Peers exist so a spawned agent learns that
 * someone else is already holding work, which is the whole point of injecting
 * anything at spawn time; they carry no diagnostics because a peer's
 * remediation is its owner's, not this tree's.
 */
export interface BoardSlicePeerV1 {
  readonly task_id: string;
  readonly task: string;
  readonly lease_state: BoardLeaseState;
  readonly worktree: string | null;
  readonly branch: string | null;
  /** Whether git still lists the owner worktree; false is the orphan signal. */
  readonly worktree_present: boolean;
}

export interface BoardSliceV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-board-slice';
  readonly canonical_target: BoardCanonicalTargetV1;
  readonly sprint_path: string;
  readonly self: BoardSliceSelfV1 | null;
  /** Live-lease rows other than `self`, in `task_id` lexicographic order. */
  readonly peers: readonly BoardSlicePeerV1[];
}
