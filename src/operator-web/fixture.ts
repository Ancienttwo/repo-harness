import type {
  OperatorFleetCardV1,
  OperatorFleetColumn,
  OperatorFleetRepositoryV1,
  OperatorFleetSnapshotV1,
} from './types';

import type { PullRequestReadinessV2 } from '../core/publication/merge-readiness';

const baseFeedback = {
  observation_status: 'observed',
  pending_count: 0,
  no_progress: false,
  repair_actions: [],
} as const;

const baseInbox = {
  observation_status: 'observed',
  unread_count: 0,
  addressed_to_current_claim: false,
  delivery_state: 'pending',
  runtime_reachability: 'unknown',
  effect_sha256: null,
  delivery_evidence: { candidate_count: 0, latest: null }, failure_class: null,
} as const;

function mergeReadiness(
  _publicationId: string,
  ready: boolean,
  blockers: PullRequestReadinessV2['blockers'] = [],
): PullRequestReadinessV2 {
  return {
    protocol: 2,
    kind: 'repo-harness-pull-request-readiness',
    repository: 'example/fixture', provider_repository_id: '1001', pr_number: 1,
    ready,
    expected_head_sha: '0123456789abcdef0123456789abcdef01234567',
    expected_base_sha: 'fedcba9876543210fedcba9876543210fedcba98',
    integration_mode: 'unmerged',
    attention_owner: blockers.length === 0 ? 'none' : blockers[0].attention_owner,
    blockers,
    check_failures: [],
    required_check_coverage: null,
    stack: { member: false, depth: 0, chain: [], final_base_sha: null, status: 'not_member' },
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
  const digest = `sha256:${task.task_revision}`;
  const execution: OperatorFleetCardV1['execution'] = column === 'available' || column === 'done' ? null : {
    profile_selection: { state: 'unassigned' }, admission_sha256: digest, branch: `codex/${task.slug}`, runtime: 'terminal', harness_kind: 'codex',
    selector: { repository_id: repositoryId, provider_repository_id: '1001', issue_id: String(2000 + task.task_index), campaign_id: 'fixture',
      task: task.task_id, role: 'worker', claim_ref: task.claim_id, claim_revision: digest, grant_sha256: digest, policy_sha256: digest,
      actor_id: 'fixture-user', session_binding_sha256: `sha256:${task.task_id}` },
  };
  return {
    repository_id: repositoryId, provider_repository_id: '1001', provider_issue_id: String(2000 + task.task_index),
    issue_state: column === 'done' ? 'closed' : 'open', issue_revision: digest, execution_status: 'observed', execution,
    task_id: execution?.selector.task ?? null, task_label: task.task_label, task_index: task.task_index,
    placement: column === null ? { kind: 'unclassified', reason: 'state_unmapped' } : { kind: 'column', column },
    attention_owner: 'none',
    execution_readiness: column === 'available' ? 'execution_ready' : null,
    readiness_blockers: column === 'available' ? [] : null,
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
      feedback: { observation_status: 'observed', pending_count: 1, no_progress: false, repair_actions: [] },
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
      feedback: { observation_status: 'observed', pending_count: 2, no_progress: true, repair_actions: [] },
      inbox: { ...baseInbox, unread_count: 2, addressed_to_current_claim: true },
    }),
  ], { access_mode: 'read_only' }),
];

export const stableSnapshot: OperatorFleetSnapshotV1 = {
  protocol: 8,
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
    card('repo-harness', fixtureTasks.reserving, 'working', {}),
    card('repo-harness', fixtureTasks.completing, 'working', {}),
    card('repo-harness', fixtureTasks.reviewing, 'in_review', {}),
    card('repo-harness', fixtureTasks.reviewingUnpublished, null, {}),
    card('repo-harness', fixtureTasks.leaseUnknown, null, { execution_status: 'unavailable', execution: null, task_id: null }),
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
    // This issue belongs to repo-harness here; console's own repository issue #1 is a different fixture.
    card('repo-harness', { ...fixtureTasks.console, task_index: 13 }, 'available', {
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
  const hash = `sha256:${'b'.repeat(64)}`, at = '2026-09-22T07:00:00+08:00';
  const tasks: import('../core/engineers/scheduling').ProviderEngineerSchedulingSnapshot['tasks'][number][] = [];
  for (const card of cards) {
    let row = tasks.find(task => task.provider_repository_id === card.provider_repository_id && task.issue_id === card.provider_issue_id);
    const issue: import('../core/external-sources/issue-observation').ProviderIssueObservationV1 | null = card.issue_state === null ? null : {
      protocol:1,kind:'repo-harness-provider-issue-observation',registered_repository_id:repositoryId,provider:'github',provider_host:'github.com',
      provider_repository_id:card.provider_repository_id,provider_issue_id:card.provider_issue_id,display_ref:'example/fixture',url:`https://github.com/example/fixture/issues/${card.task_index}`,
      observed_at:at,provider_created_at:at,provider_updated_at:at,state:card.issue_state,title:card.task_label ?? card.provider_issue_id,
      body:'Read the provider issue and preserve its admitted execution identity.',labels:[],assignees:[],comments_policy:'omitted',policy_revision:hash,eligible:true,eligibility_reasons:[],source_revision:card.issue_revision ?? hash,observation_sha256:hash,
    };
    if (!row) { row={provider_repository_id:card.provider_repository_id,issue_id:card.provider_issue_id,issue,sessions:[]};tasks.push(row); }
    if (card.execution) {
      const selection = card.execution.profile_selection.state === 'unassigned' ? {state:'unassigned' as const} : {state:'profile_missing' as const,engineer_id:card.execution.profile_selection.engineer_id,engineer_contract_revision:card.execution.profile_selection.engineer_contract_revision};
      tasks[tasks.indexOf(row)]={...row,sessions:[...row.sessions,{session:{...card.execution,selector:{...card.execution.selector,repository_id:repositoryId}},selection}]};
    }
  }
  return {protocol:2,kind:'operator_planning_snapshot',repository_id:repositoryId,
    scheduling:{protocol:2,kind:'provider_engineer_scheduling',repository_id:repositoryId,profiles:[],tasks,source_revision:hash},
    observation:{observed_at:at,authorization_revision:1},graph:{status:'unavailable',code:'needs_provider_graph'}};
}
/** Browser fixture for the current admitted context transport, not approval evidence. */
export function admittedTaskContextFixture(selector: import('../core/sessions/session-selector').AdmittedSessionSelector): import('../core/operator/admitted-task-context').AdmittedTaskContext {
  const hash=`sha256:${'a'.repeat(64)}`;
  const task=Object.values(fixtureTasks).find(task=>task.task_id===selector.task);
  return {protocol:2,kind:'operator_admitted_task_context',selector,goal:{revision:hash,content:`${task?.task_label ?? 'Provider task'}: The exact candidate passes independent verification.`},
    verification:{plan_sha256:hash,plan_json:'{"protocol":1,"checks":[]}'},scope:{allowed_paths:['src/**'],benchmark:'not_required',oracles_json:'[]'},
    approval:{admission_sha256:hash,grant_sha256:selector.grant_sha256,revision:1,goal_revision:hash,scope_sha256:hash},profile_selection:{state:'unassigned'},
    execution:{branch:'codex/fixture',runtime:'terminal',harness_kind:'codex'},observed_at:'2026-10-25T00:00:00Z'};
}
