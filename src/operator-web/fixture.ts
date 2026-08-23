import type {
  OperatorFleetCardV1,
  OperatorFleetRepositoryV1,
  OperatorFleetSnapshotV1,
} from './types';

import type { MergeReadinessV1 } from '../core/publication/merge-readiness';

const baseFeedback = {
  pending_count: 0,
  no_progress: false,
  repair_actions: [],
} as const;

const baseInbox = {
  unread_count: 0,
  addressed_to_current_claim: false,
} as const;

function mergeReadiness(
  publicationId: string,
  ready: boolean,
  blockers: MergeReadinessV1['blockers'] = [],
): MergeReadinessV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-merge-readiness',
    publication_id: publicationId,
    ready,
    expected_head_sha: '0123456789abcdef0123456789abcdef01234567',
    expected_base_sha: 'fedcba9876543210fedcba9876543210fedcba98',
    integration_mode: 'unmerged',
    attention_owner: blockers.length === 0 ? 'none' : blockers[0].attention_owner,
    blockers,
  };
}

function card(
  repositoryId: string,
  taskId: string,
  column: OperatorFleetCardV1['column'],
  overrides: Partial<OperatorFleetCardV1> = {},
): OperatorFleetCardV1 {
  return {
    repository_id: repositoryId,
    task_id: taskId,
    task_revision: `rev-${taskId}`,
    claim_id: column === 'available' || column === 'done' ? null : `claim-${taskId}`,
    generation: column === 'available' || column === 'done' ? null : 3,
    column,
    attention_owner: 'none',
    execution_readiness: column === 'available' ? 'execution_ready' : null,
    lease_state: column === 'available' ? 'available' : column === 'done' ? 'released' : 'bound',
    publication_id: column === 'in_review' || column === 'ready_to_merge' ? `pub-${taskId}` : null,
    head_sha: column === 'in_review' || column === 'ready_to_merge' ? '0123456789abcdef0123456789abcdef01234567' : null,
    merge_readiness: column === 'ready_to_merge' ? mergeReadiness(`pub-${taskId}`, true) : null,
    blocker_codes: [],
    feedback: baseFeedback,
    inbox: baseInbox,
    snapshot_consistency: 'stable',
    ...overrides,
  };
}

function repository(
  repositoryId: string,
  cards: readonly OperatorFleetCardV1[],
  overrides: Partial<OperatorFleetRepositoryV1> = {},
): OperatorFleetRepositoryV1 {
  return {
    repository_id: repositoryId,
    access_mode: 'read_write',
    status: 'ok',
    snapshot_consistency: 'stable',
    cards,
    error: null,
    ...overrides,
  };
}

const stableRepositories: readonly OperatorFleetRepositoryV1[] = [
  repository('repo-harness', [
    card('repo-harness', 'task-available', 'available', {
      attention_owner: 'user',
      inbox: { unread_count: 1, addressed_to_current_claim: false },
    }),
    card('repo-harness', 'task-working', 'working', {
      attention_owner: 'agent',
      feedback: { pending_count: 1, no_progress: false, repair_actions: ['resume_same_owner'] },
    }),
    card('repo-harness', 'task-review', 'in_review', {
      attention_owner: 'external',
      merge_readiness: mergeReadiness('pub-task-review', false, [{ code: 'provider_unavailable', attention_owner: 'external' }]),
      blocker_codes: ['provider_unavailable'],
    }),
    card('repo-harness', 'task-ready', 'ready_to_merge', {
      attention_owner: 'none',
      merge_readiness: mergeReadiness('pub-task-ready', true),
    }),
    card('repo-harness', 'task-done', 'done'),
  ]),
  repository('repo-console', [
    card('repo-console', 'task-console', 'working', {
      task_revision: 'r18',
      attention_owner: 'user',
      inbox: { unread_count: 2, addressed_to_current_claim: true },
    }),
  ], { access_mode: 'read_only' }),
];

export const stableSnapshot: OperatorFleetSnapshotV1 = {
  protocol: 1,
  kind: 'operator_fleet_snapshot',
  registry_revision: 'registry-20260824-01',
  sequence: 18,
  observed_at: '2026-08-24T01:10:00.000Z',
  snapshot_consistency: 'stable',
  repositories: stableRepositories,
  counts: {
    available: 1,
    working: 2,
    in_review: 1,
    ready_to_merge: 1,
    done: 1,
    unreadable: 0,
  },
  source_snapshot_sha256: `sha256:${'a'.repeat(64)}`,
};

export const emptySnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: 'registry-empty',
  sequence: 19,
  repositories: [],
  counts: { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0 },
  source_snapshot_sha256: `sha256:${'b'.repeat(64)}`,
};

export const changedDuringReadSnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: 'registry-changed',
  sequence: 20,
  snapshot_consistency: 'changed_during_read',
  repositories: [
    repository('repo-harness', [
      card('repo-harness', 'task-changed', null, {
        task_revision: 'rev-changed',
        snapshot_consistency: 'changed_during_read',
        attention_owner: 'user',
      }),
    ], { snapshot_consistency: 'changed_during_read' }),
  ],
  counts: { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0 },
  source_snapshot_sha256: `sha256:${'c'.repeat(64)}`,
};

export const degradedSnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: 'registry-degraded',
  sequence: 21,
  snapshot_consistency: 'degraded',
  repositories: [
    ...stableRepositories,
    repository('repo-unreadable', [], {
      status: 'unreadable',
      snapshot_consistency: 'degraded',
      error: {
        code: 'repo_unreadable',
        message: 'repository authority cannot be read',
      },
    }),
  ],
  counts: { ...stableSnapshot.counts, unreadable: 1 },
  source_snapshot_sha256: `sha256:${'d'.repeat(64)}`,
};

export const operatorFixtures = {
  stable: stableSnapshot,
  empty: emptySnapshot,
  changedDuringRead: changedDuringReadSnapshot,
  degraded: degradedSnapshot,
} as const;
