import type { EffectiveState, StateSnapshot } from './types';

export interface StateSnapshotCompatibilityFacts {
  readonly spec: 'present' | 'missing';
  readonly pending: 'none' | 'fresh' | 'stale';
  readonly activePlanMarker: string | null;
  readonly evidence: 'unchecked' | 'complete' | 'incomplete';
}

/** Pure compatibility projection from Effective State plus legacy-only display facts. */
export function projectStateSnapshot(
  state: EffectiveState,
  facts: StateSnapshotCompatibilityFacts,
): StateSnapshot {
  const planPath = state.authoritative_plan?.path ?? null;
  const markerProblem = state.worktree.freshness === 'stale' && state.worktree.owner
    ? 'foreign_worktree'
    : state.stale_sources.includes('active_plan_marker')
      ? 'deleted'
      : 'none';
  const plan = markerProblem === 'foreign_worktree'
    ? 'foreign_worktree'
    : markerProblem === 'deleted'
      ? 'stale_marker'
      : state.authoritative_plan?.status ?? 'none';
  return {
    protocol: 1,
    kind: 'repo-harness-state-snapshot',
    states: {
      spec: facts.spec,
      plan,
      pending: facts.pending,
      worktree: markerProblem === 'foreign_worktree' ? 'foreign_marker' : 'current',
      evidence: planPath ? facts.evidence : 'unchecked',
    },
    paths: {
      active_plan: planPath ?? facts.activePlanMarker,
    },
    marker: { problem: markerProblem },
  };
}
