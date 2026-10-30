import type { EffectiveState, StateSnapshot } from './types';

export interface StateSnapshotCompatibilityFacts {
  readonly spec: 'present' | 'missing';
  readonly pending: 'none' | 'fresh' | 'stale';
}

/** Pure compatibility projection from Effective State plus legacy-only display facts. */
export function projectStateSnapshot(
  state: EffectiveState,
  facts: StateSnapshotCompatibilityFacts,
): StateSnapshot {
  const markerProblem = state.worktree.freshness === 'stale' && state.worktree.owner
    ? 'foreign_worktree'
    : 'none';
  return {
    protocol: 1,
    kind: 'repo-harness-state-snapshot',
    states: {
      spec: facts.spec,
      plan: 'none',
      pending: facts.pending,
      worktree: markerProblem === 'foreign_worktree' ? 'foreign_marker' : 'current',
      evidence: 'unchecked',
    },
    paths: { active_plan: null },
    marker: { problem: markerProblem },
  };
}
