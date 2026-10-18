import type {
  OperatorFleetCardV1,
  OperatorFleetColumn,
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
  delivery_evidence: { candidate_count: 0, latest: null }, failure_class: null,
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
  readonly task_revision: string;
  readonly claim_id: string;
  readonly task_label: string;
  readonly task_index: number;
}

/**
 * Identity is derived from the same 16-hex seed as the task id so the fixture
 * satisfies the production decoder without a test-side rewrite, and so a task
 * never shares its revision digest with its id. The derivation is arithmetic
 * rather than a hash because this module must stay free of Node `crypto`.
 */
function revisionDigest(seed: string): string {
  return [...seed].reverse().join('').repeat(4);
}

function claimUuid(seed: string): string {
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(12, 15)}-8${seed.slice(1, 4)}-${seed.slice(4, 16)}`;
}

function fixtureTask(slug: string, seed: string, label: string, index: number): FixtureTask {
  return {
    slug,
    task_id: seed.repeat(4),
    task_revision: revisionDigest(seed),
    claim_id: claimUuid(seed),
    task_label: label,
    task_index: index,
  };
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
  reserving: fixtureTask('reserving', '5d0c8b1e63f47a29', 'WP7 lease reservation fence audit', 8),
  completing: fixtureTask('completing', 'c81704ba9e2d635f', 'WP8 completion receipt writeback', 9),
  reviewing: fixtureTask('reviewing', '6b2f95d1a0c473e8', 'WP9 review publication pointer check', 10),
  reviewingUnpublished: fixtureTask('reviewing-unpublished', '0e7c3a19f5b82d64', 'WP10 review without a publication', 11),
  leaseUnknown: fixtureTask('lease-unknown', 'bd483f6c0a91e527', 'WP11 unreadable lease state probe', 12),
} as const;

function card(
  repositoryId: string,
  task: FixtureTask,
  column: OperatorFleetColumn | null,
  overrides: Partial<OperatorFleetCardV1> = {},
): OperatorFleetCardV1 {
  return {
    repository_id: repositoryId,
    task_id: task.task_id,
    task_revision: task.task_revision,
    task_label: task.task_label,
    task_index: task.task_index,
    claim_id: column === 'available' || column === 'done' ? null : task.claim_id,
    generation: column === 'available' || column === 'done' ? null : 3,
    task_state: column === 'done' ? 'done' : 'pending',
    placement: column === null ? { kind: 'unclassified', reason: 'state_unmapped' } : { kind: 'column', column },
    attention_owner: 'none',
    execution_readiness: column === 'available' ? 'execution_ready' : null,
    readiness_blockers: column === 'available' ? [] : null,
    lease_state: column === 'available' ? 'available' : column === 'done' ? 'released' : 'bound',
    publication_id: column === 'in_review' || column === 'ready_to_merge' ? `pub-${task.slug}` : null,
    head_sha: column === 'in_review' || column === 'ready_to_merge' ? '0123456789abcdef0123456789abcdef01234567' : null,
    merge_readiness: column === 'ready_to_merge' ? mergeReadiness(`pub-${task.slug}`, true) : null,
    blocker_codes: [],
    feedback: baseFeedback,
    inbox: baseInbox,
    snapshot_consistency: 'stable',
    error: null,
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
    display_name: repositoryId,
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
      feedback: { pending_count: 1, no_progress: false, repair_actions: [] },
      inbox: {
        ...baseInbox,
        delivery_state: 'reconciliation_required',
        runtime_reachability: 'unavailable',
        effect_sha256: `sha256:${'9'.repeat(64)}`,
        failure_class: 'adapter_unavailable',
        delivery_evidence: { candidate_count: 1, latest: {
          adapter_kind: 'herdr-cli-agent', effect_state: 'reconciliation_required',
          receipt_kind: null, observed_at: '2026-08-31T00:00:00.000Z',
          observation_sequence: 2, observation_sha256: `sha256:${'8'.repeat(64)}`,
        } },
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
      attention_owner: 'user',
      feedback: { pending_count: 2, no_progress: true, repair_actions: [] },
      inbox: { ...baseInbox, unread_count: 2, addressed_to_current_claim: true },
    }),
  ], { access_mode: 'read_only' }),
];

export const stableSnapshot: OperatorFleetSnapshotV1 = {
  protocol: 7,
  service_epoch: '00000000-0000-4000-8000-000000000001',
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
    unclassified: 0,
    preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 7,
  },
  source_snapshot_sha256: `sha256:${'a'.repeat(64)}`,
};

export const emptySnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: `sha256:${'f'.repeat(64)}`,
  sequence: 19,
  repositories: [],
  counts: { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 0 },
  source_snapshot_sha256: `sha256:${'b'.repeat(64)}`,
};

export const changedDuringReadSnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: `sha256:${'1'.repeat(64)}`,
  sequence: 20,
  snapshot_consistency: 'changed_during_read',
  repositories: [
    repository('repo-harness', [
      card('repo-harness', fixtureTasks.changed, 'working', {
        snapshot_consistency: 'changed_during_read',
        attention_owner: 'user',
      }),
    ], { snapshot_consistency: 'changed_during_read' }),
  ],
  counts: { available: 0, working: 1, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 1 },
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

/**
 * The lease states a healthy board reaches that `stableSnapshot` does not.
 *
 * Every card here carries a live `claim_id` and `generation` while its lease is
 * something other than `bound`, which is the exact shape the composer has to
 * describe truthfully: the server accepts claim-scoped delivery only for a
 * bound lease, so the message still queues on the task while a holder exists.
 * `reviewing` appears twice because a review with a publication and a review
 * without one are different rows, not the same row with a missing field.
 */
const leaseStateRepositories: readonly OperatorFleetRepositoryV1[] = [
  repository('repo-harness', [
    card('repo-harness', fixtureTasks.reserving, 'working', { lease_state: 'reserving' }),
    card('repo-harness', fixtureTasks.completing, 'working', { lease_state: 'completing' }),
    card('repo-harness', fixtureTasks.reviewing, 'in_review', { lease_state: 'reviewing' }),
    card('repo-harness', fixtureTasks.reviewingUnpublished, null, { lease_state: 'reviewing' }),
    card('repo-harness', fixtureTasks.leaseUnknown, null, { lease_state: 'unknown' }),
  ], { snapshot_consistency: 'degraded' }),
];

export const leaseStateSnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  registry_revision: `sha256:${'3'.repeat(64)}`,
  sequence: 22,
  snapshot_consistency: 'degraded',
  repositories: leaseStateRepositories,
  counts: { available: 0, working: 2, in_review: 1, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 2, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 5 },
  source_snapshot_sha256: `sha256:${'7'.repeat(64)}`,
};

/** Normal preparation and inline work are healthy canonical placements. */
export const preparationSnapshot: OperatorFleetSnapshotV1 = {
  ...stableSnapshot,
  repositories: [repository('repo-harness', [
    card('repo-harness', fixtureTasks.available, 'available', { attention_owner: 'none' }),
    card('repo-harness', fixtureTasks.changed, 'available', {
      placement: { kind: 'preparation' }, execution_readiness: 'planning_required',
      readiness_blockers: [{ code: 'plan_missing', attention_owner: 'agent' }], attention_owner: 'agent',
    }),
    card('repo-harness', fixtureTasks.blocked, 'available', {
      placement: { kind: 'preparation' }, execution_readiness: 'planning_required',
      readiness_blockers: [{ code: 'plan_not_approved', attention_owner: 'user' }], attention_owner: 'user',
    }),
    card('repo-harness', fixtureTasks.console, 'available', {
      placement: { kind: 'alternate_workflow', workflow: 'inline' }, execution_readiness: 'inline_ready',
    }),
  ])],
  counts: { ...emptySnapshot.counts, available: 1, preparation: 2, alternate_workflow: 1, known_tasks: 4 },
};

export const operatorFixtures = {
  stable: stableSnapshot,
  empty: emptySnapshot,
  changedDuringRead: changedDuringReadSnapshot,
  degraded: degradedSnapshot,
  leaseStates: leaseStateSnapshot,
  preparation: preparationSnapshot,
} as const;

/** Independent repository observations for browser fixtures. */
export function repositoryObservationFixture(repositoryId = 'repo_a5b76eee64af71c3'): import('../core/operator/repository-snapshot').OperatorRepositorySnapshotV1 {
  return { protocol: 1, kind: 'operator_repository_snapshot', repository_id: repositoryId,
    planning: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    organization: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' } };
}
export const repositorySnapshot = repositoryObservationFixture();

export function planningObservationFixture(repositoryId: string, cards: readonly OperatorFleetCardV1[]): import('../core/operator/planning-snapshot').OperatorPlanningSnapshot {
  const tasks = cards.filter(card => card.task_state !== 'missing').map(card => ({
    ...taskContextFixture({repository_id:repositoryId,task_id:card.task_id,expected_task_revision:card.task_revision}),
    task: {title:card.task_label ?? card.task_id,mode:'contract',acceptance:'Read the canonical requirements and preserve the exact Task identity.',state:card.task_state},
  }));
  const canonical = tasks[0]?.canonical ?? null;
  const observation = {observed_at:'2026-09-22T07:00:00+08:00',authorization_revision:1,board_revision:canonical ? `sha256:${'b'.repeat(64)}` : null};
  return {protocol:1,kind:'operator_planning_snapshot',repository_id:repositoryId,canonical,tasks,observation,
    graph:{status:'observed',observed_at:observation.observed_at,snapshot:{lane:'unclassified',work_graph_revision:null,packages:[],sources:[]}}};
}
/** Stored-fact-shaped fixtures for the read-only detail preview and decoder tests. */
export function taskContextFixture(request: import('../core/operator/task-context').OperatorTaskContextRequest): import('../core/operator/task-context').OperatorTaskContext {
  const task = Object.values(fixtureTasks).find(value => value.task_id === request.task_id) ?? fixtureTasks.working;
  return {
    protocol: 1, kind: 'operator_task_context', repository_id: request.repository_id, task_id: request.task_id,
    task_revision: request.expected_task_revision ?? task.task_revision,
    canonical: { target_ref: 'origin/main', commit: 'a'.repeat(40), sprint_path: 'plans/sprints/fixture.sprint.md' },
    task: { title: task.task_label, mode: 'contract', acceptance: 'The exact candidate passes independent verification.', state: 'pending' },
    execution: { lease_state: 'bound', claim: { claim_id: task.claim_id, generation: 1, state: 'bound', branch: 'codex/fixture', target_ref: 'origin/main' } },
    offer: { execution_readiness: 'planning_required', blockers: [{ code: 'plan_missing', attention_owner: 'agent' }], offer_revision: `sha256:${'a'.repeat(64)}`, plan: null },
    observation: { observed_at: '2026-09-22T07:00:00+08:00', board_revision: `sha256:${'b'.repeat(64)}`, authorization_revision: 1, consistency: 'observed' },
  };
}
export function taskActivityFixture(request: import('../core/operator/task-activity').OperatorTaskActivityRequest): import('../core/operator/task-activity').OperatorTaskActivity {
  const parentId = '11111111-1111-4111-8111-111111111111';
  const replyId = '22222222-2222-4222-8222-222222222222';
  const task = Object.values(fixtureTasks).find(value => value.task_id === request.task_id) ?? fixtureTasks.working;
  const sha = `sha256:${'a'.repeat(64)}`;
  const at = '2026-09-22T07:00:00+08:00';
  const actor = { engineer_id: 'engineer:capability.fixture.reader', binding_id: task.claim_id, binding_generation: 2, engineer_contract_revision: sha, claim_id: task.claim_id, lease_generation: 1, receipt_sha256: sha };
  const reply = { claim_id: task.claim_id, generation: 1, reply_message_id: replyId, state: 'complete' as const, reason: null, actor };
  const parent: import('../core/operator/task-activity').ActivityEntry = {
    event: { message_id: parentId, task_revision: task.task_revision, scope: 'task', target_claim_id: null, target_generation: null, sender_kind: 'user', sender_id: 'local_operator', sender_trust: 'local_operator', audience: 'owner', body: 'Please preserve the existing evidence boundary.', body_sha256: sha, created_at: at, in_reply_to: null, event_digest: sha },
    receipts: [{ message_id: parentId, recipient_kind: 'claim', recipient_id: task.claim_id, recipient_task_revision: task.task_revision, recipient_claim_id: task.claim_id, recipient_generation: 1, delivery_state: 'acknowledged', delivery_channel: 'agent_runtime_effect', delivery_ref: 'fixture-effect', delivered_at: at, acknowledged_at: at }],
    replies: [reply], provenance: 'not_reply',
  };
  const response: import('../core/operator/task-activity').ActivityEntry = { event: { ...parent.event, message_id: replyId, sender_kind: 'agent', sender_id: sha, sender_trust: 'lease_owner', audience: 'user', body: 'The boundary is preserved; inspect the candidate evidence.', in_reply_to: parentId }, receipts: [], replies: [reply], provenance: 'recorded_claim_actor' };
  const entries = [parent, response].filter(value => request.message_id !== null ? value.event.message_id === request.message_id : request.after === null || value.event.message_id > request.after);
  return { ...request, protocol: 1, kind: 'operator_task_activity', observed_at: at, consistency: 'observed', entries, coverage: { scope: request.message_id === null ? 'task' : 'message', complete: true, reason: null, scanned: 2, bytes: 2048 }, next_cursor: null };
}
