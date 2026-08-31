import type {
  OperatorCollaborationSnapshotV1,
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
      inbox: {
        ...baseInbox,
        delivery_state: 'reconciliation_required',
        runtime_reachability: 'unavailable',
        effect_sha256: `sha256:${'9'.repeat(64)}`,
        failure_class: 'adapter_unavailable',
      },
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

/**
 * Collaboration fixtures use the real identity shapes, not short synthetic ones:
 * a `repo_<16hex>` id, 64-hex record ids, `sha256:`-prefixed digests, and the
 * C1 lineage strings that concatenate the actor kind with the identity it keeps
 * across rebindings. Designing the panels against readable stand-ins is what
 * hides how much of the row is an unreadable digest.
 */
const COLLAB_REPOSITORY_ID = 'repo_a5b76eee64af71c3';

function recordId(seed: string): string {
  return seed.repeat(4);
}

function collabDigest(seed: string): string {
  return `sha256:${seed.repeat(4)}`;
}

const ENGINEER_LINEAGE = 'module_engineerengineer:capability.runtime-harness.collaboration';
const WORKER_LINEAGE = `delegated_worker${collabDigest('6b1f04d9c8a2e735')}`;

export const collaborationSnapshot: OperatorCollaborationSnapshotV1 = {
  protocol: 1,
  kind: 'operator_collaboration_snapshot',
  repository_id: COLLAB_REPOSITORY_ID,
  mode: 'shadow',
  snapshot_consistency: 'stable',
  degraded_sources: [],
  changed_sources: [],
  threads: [
    {
      thread_key: 'capability.runtime-harness.collaboration',
      signal_count: 5,
      distinct_contributor_count: 2,
      latest_signal_at: '2026-08-30T09:41:00.000Z',
      artifact_ref_count: 6,
      unadopted_handoff_count: 1,
      adoption_count: 2,
      cross_thread_reference_count: 3,
      recency_rank: 4,
      hotspot_score: 87,
      thread_sha256: collabDigest('1a2b3c4d5e6f7081'),
    },
    {
      thread_key: 'task.snapshot-consistency-propagation',
      signal_count: 2,
      distinct_contributor_count: 1,
      latest_signal_at: '2026-08-30T06:12:00.000Z',
      artifact_ref_count: 1,
      unadopted_handoff_count: 0,
      adoption_count: 0,
      cross_thread_reference_count: 0,
      recency_rank: 3,
      hotspot_score: 44,
      thread_sha256: collabDigest('90a1b2c3d4e5f607'),
    },
  ],
  signals: [
    {
      signal_id: recordId('7d3e91b4c05a682f'),
      signal_sha256: collabDigest('7d3e91b4c05a682f'),
      thread_key: 'capability.runtime-harness.collaboration',
      actor_lineage: ENGINEER_LINEAGE,
      title: 'Double-read windows must overlap or stable is an overclaim',
      labels: ['dead-end', 'protocol'],
      artifact_ref_count: 3,
      created_at: '2026-08-30T09:41:00.000Z',
      superseded: false,
    },
    {
      signal_id: recordId('2c8f60a1d97b34e5'),
      signal_sha256: collabDigest('2c8f60a1d97b34e5'),
      thread_key: 'capability.runtime-harness.collaboration',
      actor_lineage: WORKER_LINEAGE,
      title: 'Per-source back-to-back reads look stable and prove nothing',
      labels: ['hypothesis'],
      artifact_ref_count: 2,
      created_at: '2026-08-30T08:03:00.000Z',
      superseded: true,
    },
    {
      signal_id: recordId('b45e270c8a1f9d36'),
      signal_sha256: collabDigest('b45e270c8a1f9d36'),
      thread_key: 'task.snapshot-consistency-propagation',
      actor_lineage: ENGINEER_LINEAGE,
      title: 'Degraded never renders as an empty lane list',
      labels: [],
      artifact_ref_count: 1,
      created_at: '2026-08-30T06:12:00.000Z',
      superseded: false,
    },
  ],
  handoffs: [
    {
      handoff_id: recordId('e071c94a35d8b26f'),
      handoff_sha256: collabDigest('e071c94a35d8b26f'),
      thread_key: 'capability.runtime-harness.collaboration',
      actor_lineage: ENGINEER_LINEAGE,
      trigger: 'budget_exhausted',
      goal: 'Prove cross-source stability for the exchange collection',
      next_action_count: 3,
      open_hypothesis_count: 2,
      adoption_count: 2,
      created_at: '2026-08-30T09:05:00.000Z',
      execution_context_kind: 'bound_task',
    },
    {
      handoff_id: recordId('4f8a13e6b7025c9d'),
      handoff_sha256: collabDigest('4f8a13e6b7025c9d'),
      thread_key: 'task.snapshot-consistency-propagation',
      actor_lineage: WORKER_LINEAGE,
      trigger: 'context_exhausted',
      goal: 'Trace snapshot_consistency from the collector to the panel',
      next_action_count: 1,
      open_hypothesis_count: 0,
      adoption_count: 0,
      created_at: '2026-08-30T05:47:00.000Z',
      // The withheld branch: C6 proved this one and the proof did not hold.
      execution_context_kind: null,
    },
  ],
  participants: [
    {
      actor_lineage: ENGINEER_LINEAGE,
      actor_kind: 'module_engineer',
      latest_actor_sha256: collabDigest('c3d20f9a61e4785b'),
      signal_count: 2,
      handoff_count: 1,
      thread_keys: ['capability.runtime-harness.collaboration', 'task.snapshot-consistency-propagation'],
      latest_activity_at: '2026-08-30T09:41:00.000Z',
    },
    {
      actor_lineage: WORKER_LINEAGE,
      actor_kind: 'delegated_worker',
      latest_actor_sha256: collabDigest('8e5b07f2a91cd463'),
      signal_count: 1,
      handoff_count: 1,
      thread_keys: ['capability.runtime-harness.collaboration'],
      latest_activity_at: '2026-08-30T08:03:00.000Z',
    },
  ],
  opportunities: [
    {
      thread_key: 'capability.runtime-harness.collaboration',
      reason: 'unadopted_handoff',
      source_refs: [recordId('4f8a13e6b7025c9d')],
    },
    {
      thread_key: 'task.snapshot-consistency-propagation',
      reason: 'low_contributor_coverage',
      source_refs: [recordId('b45e270c8a1f9d36')],
    },
  ],
  unverified_execution_context_count: 1,
  source_snapshot_sha256: collabDigest('5f9c31e08b4a7d62'),
};

/** Two additive sources unreadable: the panel must say so, not show fewer lanes. */
export const degradedCollaborationSnapshot: OperatorCollaborationSnapshotV1 = {
  ...collaborationSnapshot,
  snapshot_consistency: 'degraded',
  degraded_sources: ['handoffs', 'adoptions'],
  handoffs: [],
};

/** A writer landed between the two reads. */
export const changedCollaborationSnapshot: OperatorCollaborationSnapshotV1 = {
  ...collaborationSnapshot,
  snapshot_consistency: 'changed_during_read',
  changed_sources: ['signals'],
};

/** Collaboration switched off: readable, and nothing can be written to it. */
export const offCollaborationSnapshot: OperatorCollaborationSnapshotV1 = {
  ...collaborationSnapshot,
  mode: 'off',
};

export const collaborationFixtures = {
  stable: collaborationSnapshot,
  degraded: degradedCollaborationSnapshot,
  changedDuringRead: changedCollaborationSnapshot,
  off: offCollaborationSnapshot,
} as const;
