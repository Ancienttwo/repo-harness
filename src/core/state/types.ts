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
}

export type EffectiveState = EffectiveStateV1;

export interface EffectiveStateRiskInput {
  readonly targetPaths?: readonly string[];
  readonly capabilityIds?: readonly string[];
  readonly capabilityCount?: number;
  readonly operationKind?: WorkflowOperationKind;
  readonly explicitOverride?: WorkflowProfile;
}
