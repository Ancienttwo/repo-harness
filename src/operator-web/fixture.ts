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
  delivery_state: 'pending',
  runtime_reachability: 'unknown',
  effect_sha256: null,
  failure_class: null,
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

/**
 * A fixture task is the real pair the board projects: a 64-hex digest nobody
 * can read, plus the sprint row cells that name it. Designing the browser
 * against short synthetic ids is what hid the need for the label.
 */
export interface FixtureTask {
  readonly slug: string;
  readonly task_id: string;
  readonly task_label: string;
  readonly task_index: number;
}

function fixtureTask(slug: string, seed: string, label: string, index: number): FixtureTask {
  return { slug, task_id: seed.repeat(4), task_label: label, task_index: index };
}

export const fixtureTasks = {
  available: fixtureTask('available', '9c4e17a3b0d582f6', 'WP1 crash-durable closeout transaction', 1),
  working: fixtureTask('working', '2b71fe0c845d93a7', 'WP2 lease steal fencing token audit', 2),
  review: fixtureTask('review', 'd0a5c93b16e478f2', 'WP3 publication receipt drift check', 3),
  ready: fixtureTask('ready', '7e63b2df05a1c894', 'WP4 merge readiness blocker vocabulary', 4),
  done: fixtureTask('done', '4a18d6c72f9b350e', 'WP0 sprint row identity derivation', 5),
  console: fixtureTask('console', 'f52c8093a6d71b4e', 'Console adoption planner dry run parity', 1),
  changed: fixtureTask('changed', '81becf4207d3a596', 'WP5 snapshot consistency propagation', 6),
  blocked: fixtureTask('blocked', '3f9a52c7e08b41d6', 'WP6 base moved during review', 7),
} as const;

function card(
  repositoryId: string,
  task: FixtureTask,
  column: OperatorFleetCardV1['column'],
  overrides: Partial<OperatorFleetCardV1> = {},
): OperatorFleetCardV1 {
  return {
    repository_id: repositoryId,
    task_id: task.task_id,
    task_revision: `rev-${task.slug}`,
    task_label: task.task_label,
    task_index: task.task_index,
    claim_id: column === 'available' || column === 'done' ? null : `claim-${task.slug}`,
    generation: column === 'available' || column === 'done' ? null : 3,
    column,
    attention_owner: 'none',
    execution_readiness: column === 'available' ? 'execution_ready' : null,
    lease_state: column === 'available' ? 'available' : column === 'done' ? 'released' : 'bound',
    publication_id: column === 'in_review' || column === 'ready_to_merge' ? `pub-${task.slug}` : null,
    head_sha: column === 'in_review' || column === 'ready_to_merge' ? '0123456789abcdef0123456789abcdef01234567' : null,
    merge_readiness: column === 'ready_to_merge' ? mergeReadiness(`pub-${task.slug}`, true) : null,
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
    card('repo-harness', fixtureTasks.available, 'available', {
      attention_owner: 'user',
      inbox: { ...baseInbox, unread_count: 1, addressed_to_current_claim: false },
    }),
    card('repo-harness', fixtureTasks.working, 'working', {
      attention_owner: 'agent',
      feedback: { pending_count: 1, no_progress: false, repair_actions: ['resume_same_owner'] },
    }),
    card('repo-harness', fixtureTasks.review, 'in_review', {
      attention_owner: 'external',
      merge_readiness: mergeReadiness('pub-review', false, [{ code: 'provider_unavailable', attention_owner: 'external' }]),
      blocker_codes: ['provider_unavailable'],
    }),
    card('repo-harness', fixtureTasks.ready, 'ready_to_merge', {
      attention_owner: 'none',
      merge_readiness: mergeReadiness('pub-ready', true),
    }),
    card('repo-harness', fixtureTasks.done, 'done'),
    // A user-owned blocker plus an external one: the worklist row must show the
    // user-owned cause, and the detail pane must show both.
    card('repo-harness', fixtureTasks.blocked, 'in_review', {
      attention_owner: 'user',
      merge_readiness: mergeReadiness('pub-blocked', false, [
        { code: 'base_moved_since_verification', attention_owner: 'user' },
        { code: 'checks_pending', attention_owner: 'external' },
      ]),
      blocker_codes: ['base_moved_since_verification', 'checks_pending'],
    }),
  ]),
  repository('repo-console', [
    card('repo-console', fixtureTasks.console, 'working', {
      task_revision: 'r18',
      attention_owner: 'user',
      feedback: { pending_count: 2, no_progress: true, repair_actions: ['resume_same_owner', 'explicit_takeover'] },
      inbox: { ...baseInbox, unread_count: 2, addressed_to_current_claim: true },
    }),
  ], { access_mode: 'read_only' }),
];

export const stableSnapshot: OperatorFleetSnapshotV1 = {
  protocol: 3,
  kind: 'operator_fleet_snapshot',
  registry_revision: `sha256:${'e'.repeat(64)}`,
  sequence: 18,
  observed_at: '2026-08-24T01:10:00.000Z',
  snapshot_consistency: 'stable',
  repositories: stableRepositories,
  counts: {
    available: 1,
    working: 2,
    in_review: 2,
    ready_to_merge: 1,
    done: 1,
    unreadable: 0,
  },
  source_snapshot_sha256: `sha256:${'a'.repeat(64)}`,
};

export const emptySnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: `sha256:${'f'.repeat(64)}`,
  sequence: 19,
  repositories: [],
  counts: { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0 },
  source_snapshot_sha256: `sha256:${'b'.repeat(64)}`,
};

export const changedDuringReadSnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: `sha256:${'1'.repeat(64)}`,
  sequence: 20,
  snapshot_consistency: 'changed_during_read',
  repositories: [
    repository('repo-harness', [
      card('repo-harness', fixtureTasks.changed, null, {
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
  registry_revision: `sha256:${'2'.repeat(64)}`,
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
