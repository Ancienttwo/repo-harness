import type {
  WorkflowOperationKind,
  WorkflowProfile,
  WorkflowProfileSignals,
} from '../workflow/profile';

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
    readonly evidence: 'unchecked' | 'complete' | 'incomplete';
  };
  readonly paths: {
    readonly active_plan: string | null;
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

/** One capability that owns some of the resolved implementation paths. */
export interface CapabilityOwnershipEntry {
  readonly id: string;
  readonly module_document: string;
  /** The resolved implementation paths this capability owns, sorted. */
  readonly paths: readonly string[];
}

/**
 * The capability ownership answer for the resolved implementation paths: the
 * explicit target paths plus the review subject. It is a projection of the
 * one ownership result the resolver already computes.
 */
export interface CapabilityOwnership {
  /** The commit the review subject was diffed against; null when the subject was unavailable. */
  readonly review_base: string | null;
  readonly capability_ids: readonly string[];
  readonly capabilities: readonly CapabilityOwnershipEntry[];
  readonly unowned_paths: readonly string[];
}

export interface EffectiveStateV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-effective-state';
  readonly task_id: string | null;
  readonly phase: string;
  readonly state_version: number;
  readonly state_revision: string;
  /**
   * Revisions separate authority, the observed Git subject and display
   * projections. `state_revision` is the hash of all current inputs.
   */
  readonly authority_revision: string;
  readonly subject_revision: string;
  readonly projection_revision: string;
  /**
   * Pure content hash over exactly {subject_revision, completed-task markers
   * derived from the plan text, the hard blocker set}. No projection, time, or PID input feeds it.
   */
  readonly progress_token: string;
  readonly authoritative_plan: {
    readonly path: string;
    readonly status: SnapshotPlanState;
  } | null;
  readonly workflow_profile: WorkflowProfile | null;
  readonly requested_workflow_profile: string | null;
  readonly risk_floor: WorkflowProfile;
  readonly profile_reasons: readonly string[];
  readonly profile_signals: WorkflowProfileSignals | null;
  /**
   * Null when ownership was not computed: no implementation path, an absent
   * registry, an ownership blocker, or capability ids the caller declared.
   */
  readonly capability_ownership: CapabilityOwnership | null;
  readonly next_action: string | null;
  readonly guidance: string | null;
  readonly blockers: readonly string[];
  readonly stale_sources: readonly string[];
  readonly conflicting_sources: readonly string[];
  readonly source_hashes: Readonly<Record<string, string>>;
  readonly worktree: EffectiveStateSource & {
    readonly current: string;
    readonly owner: string | null;
  };
  readonly handoff: EffectiveStateSource;
  readonly resume: EffectiveStateSource;
  readonly current_snapshot: EffectiveStateSource;
}

export type EffectiveState = EffectiveStateV1;

/**
 * The continuation routes. There is deliberately no `ask`/`wait` member:
 * blocked and needs-user states collapse into `halt`, whose `reason` carries
 * the blocker or plan status.
 */
export type ContinuationRoute =
  | 'continue_active_plan'
  | 'verify_or_finish'
  | 'halt'
  | 'idle';

/**
 * One deterministic per-turn answer to "what is next", projected from the
 * effective state. It is a read model, never an authority.
 * `command` names the command that owns the action. One call yields one unit or
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
