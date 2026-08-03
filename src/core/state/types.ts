import type {
  WorkflowOperationKind,
  WorkflowProfile,
  WorkflowProfileSignals,
} from '../workflow/profile';
import type { EvaluateReadinessResult } from '../workflow/operation-readiness';

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
