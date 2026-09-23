import { describe, expect, test } from 'bun:test';

import {
  classifyFleetBoardPlacement,
  projectFleetBoardSnapshot,
  type FleetBoardCardInputV1,
} from '../../src/core/fleet/board';

const taskId = 'a'.repeat(64);
const taskRevision = 'b'.repeat(64);

function card(overrides: Partial<FleetBoardCardInputV1> = {}): FleetBoardCardInputV1 {
  return {
    task_id: taskId,
    task_revision: taskRevision,
    task_label: 'inspect one registered repository',
    task_index: 1,
    task_state: 'pending',
    lease_state: 'available',
    claim_id: null,
    generation: null,
    current_publication: null,
    merge_readiness: null,
    execution_readiness: 'execution_ready', readiness_blockers: [],
    feedback: { pending_count: 0, no_progress: false, repair_actions: [] },
    inbox: { unread_count: 0, addressed_to_current_claim: false, delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, delivery_evidence: { candidate_count: 0, latest: null }, failure_class: null },
    snapshot_consistency: 'stable',
    error: null,
    ...overrides,
  };
}

function snapshot(observedAt: string, sequence: number) {
  return projectFleetBoardSnapshot({
    registry_revision: 'sha256:registry',
    sequence,
    observed_at: observedAt,
    repositories: [
      {
        repository_id: 'repo-z', repo_root: '/fixtures/z', access_mode: 'read_only', status: 'ok',
        snapshot_consistency: 'stable', cards: [card({ task_id: 'z'.repeat(64) })], error: null,
      },
      {
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [card()], error: null,
      },
    ],
  });
}

describe('FleetBoardSnapshotV1 pure projection', () => {
  test('normal missing-plan preparation preserves a healthy repository', () => {
    const result = projectFleetBoardSnapshot({ registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-09-22T00:00:00.000Z',
      repositories: [{ repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok', snapshot_consistency: 'stable',
        cards: [card({ execution_readiness: 'planning_required', readiness_blockers: [{ code: 'plan_missing', attention_owner: 'agent' }] })], error: null }] });
    expect(result.snapshot_consistency).toBe('stable');
    expect(result.repositories[0]!.error).toBeNull();
  });

  test('maps only exact execution-ready pending work to available', () => {
    expect(classifyFleetBoardPlacement(card())).toEqual({ kind: 'column', column: 'available' });
    expect(classifyFleetBoardPlacement(card({ execution_readiness: 'planning_required', readiness_blockers: [{ code: 'plan_missing', attention_owner: 'agent' }] }))).toEqual({ kind: 'preparation' });
    expect(classifyFleetBoardPlacement(card({ lease_state: 'bound', execution_readiness: 'planning_required', readiness_blockers: [{ code: 'plan_missing', attention_owner: 'agent' }] }))).toEqual({ kind: 'column', column: 'working' });
    expect(classifyFleetBoardPlacement(card({ task_state: 'done', lease_state: 'reviewing' }))).toEqual({ kind: 'column', column: 'done' });
  });

  test('keeps runtime delivery facts out of Fleet column and execution readiness authority', () => {
    const baseline = card();
    const reconciled = card({
      inbox: {
        ...baseline.inbox,
        delivery_state: 'reconciliation_required',
        runtime_reachability: 'unavailable',
        effect_sha256: `sha256:${'f'.repeat(64)}`,
        failure_class: 'receipt_missing',
      },
    });
    const projected = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-30T00:00:00.000Z',
      repositories: [{ repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok', snapshot_consistency: 'stable', cards: [reconciled], error: null }],
    }).repositories[0]!.cards[0]!;
    expect(projected.placement).toEqual(classifyFleetBoardPlacement(baseline));
    expect(projected.execution_readiness).toBe(baseline.execution_readiness);
    expect(projected.inbox.delivery_state).toBe('reconciliation_required');
  });

  test('uses review readiness only with the lease pointer and preserves attention precedence', () => {
    const reviewing = card({
      lease_state: 'reviewing',
      claim_id: '123e4567-e89b-42d3-a456-426614174001',
      generation: 2,
      current_publication: { publication_id: `sha256:${'c'.repeat(64)}`, head_sha: 'd'.repeat(40) },
      merge_readiness: {
        protocol: 1,
        kind: 'repo-harness-merge-readiness',
        publication_id: `sha256:${'c'.repeat(64)}`,
        ready: false,
        expected_head_sha: 'd'.repeat(40),
        expected_base_sha: 'e'.repeat(40),
        integration_mode: 'unmerged',
        attention_owner: 'external',
        blockers: [{ code: 'checks_pending', attention_owner: 'external' }],
      },
      feedback: { pending_count: 2, no_progress: true, repair_actions: [] },
      inbox: { unread_count: 1, addressed_to_current_claim: true, delivery_state: 'delivered', runtime_reachability: 'reachable', effect_sha256: `sha256:${'f'.repeat(64)}`, delivery_evidence: { candidate_count: 0, latest: null }, failure_class: null },
    });
    const result = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [reviewing], error: null,
      }],
    });
    expect(result.repositories[0]?.cards[0]).toMatchObject({
      placement: { kind: 'column', column: 'in_review' }, attention_owner: 'user',
      head_sha: 'd'.repeat(40), blocker_codes: ['checks_pending'],
      feedback: { pending_count: 2, no_progress: true },
    });
  });

  test('sorts deterministically and excludes wall clock and sequence from snapshot digest', () => {
    const first = snapshot('2026-08-23T00:00:00.000Z', 1);
    const second = snapshot('2026-08-23T00:01:00.000Z', 2);
    expect(first.repositories.map((entry) => entry.repository_id)).toEqual(['repo-a', 'repo-z']);
    expect(first.snapshot_sha256).toBe(second.snapshot_sha256);
    expect(first.counts).toEqual({ available: 2, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 2 });
  });

  test('rolls a changed card up through its repository and the Fleet snapshot', () => {
    const stable = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [card()], error: null,
      }],
    });
    const changed = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [card({ snapshot_consistency: 'changed_during_read' })], error: null,
      }],
    });

    expect(changed.repositories[0]).toMatchObject({ snapshot_consistency: 'changed_during_read' });
    expect(changed.snapshot_consistency).toBe('changed_during_read');
    expect(changed.snapshot_sha256).not.toBe(stable.snapshot_sha256);
  });

  test('keeps degraded classification above changed child consistency', () => {
    const result = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable',
        cards: [card({ execution_readiness: 'unsupported', readiness_blockers: [{ code: 'lease_unknown', attention_owner: 'user' }], snapshot_consistency: 'changed_during_read' })],
        error: null,
      }],
    });

    expect(result.repositories[0]?.snapshot_consistency).toBe('degraded');
    expect(result.snapshot_consistency).toBe('degraded');
  });

  test('carries the sprint row label and index as snapshot facts inside the digest basis', () => {
    const labelled = snapshot('2026-08-23T00:00:00.000Z', 1);
    expect(labelled.repositories[0]?.cards[0]).toMatchObject({
      task_label: 'inspect one registered repository',
      task_index: 1,
    });

    const relabelled = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry',
      sequence: 1,
      observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [card({ task_label: 'inspect one registered repository (renamed)' })], error: null,
      }],
    });
    const unlabelled = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry',
      sequence: 1,
      observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [card({ task_label: null, task_index: null })], error: null,
      }],
    });
    const baseline = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry',
      sequence: 1,
      observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [card()], error: null,
      }],
    });
    expect(unlabelled.repositories[0]?.cards[0]).toMatchObject({ task_label: null, task_index: null });
    expect(relabelled.snapshot_sha256).not.toBe(baseline.snapshot_sha256);
    expect(unlabelled.snapshot_sha256).not.toBe(baseline.snapshot_sha256);
  });

  test('keeps a broken repository as an isolated typed row', () => {
    const result = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-bad', repo_root: '/fixtures/bad', access_mode: 'read_only', status: 'unreadable',
        snapshot_consistency: 'degraded', cards: [], error: { code: 'repo_unreadable', message: 'permission denied' },
      }],
    });
    expect(result.snapshot_consistency).toBe('degraded');
    expect(result.counts.unreadable).toBe(1);
    expect(result.repositories[0]).toMatchObject({ status: 'unreadable', cards: [], error: { code: 'repo_unreadable' } });
  });

  test('counts normal preparation beside available canonical work', () => {
    const result = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable',
        cards: [
          card({ task_id: '1'.repeat(64) }),
          card({ task_id: '2'.repeat(64), execution_readiness: 'planning_required', readiness_blockers: [{ code: 'plan_missing', attention_owner: 'agent' }] }),
        ],
        error: null,
      }],
    });

    expect(result.counts).toEqual({
      available: 1, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 1, alternate_workflow: 0, isolated_execution: 0, known_tasks: 2,
    });
    expect(result.repositories[0]?.cards).toHaveLength(2);
  });

  test('keeps a failed card beside its readable siblings and never classifies it', () => {
    const result = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable',
        cards: [
          card({ task_id: '1'.repeat(64) }),
          card({
            task_id: '2'.repeat(64),
            error: { code: 'repo_inbox_unreadable', message: 'inbox stderr /private/agent-root token=super-secret' },
          }),
        ],
        error: null,
      }],
    });
    const repository = result.repositories[0]!;

    expect(repository.status).toBe('ok');
    expect(repository.snapshot_consistency).toBe('degraded');
    expect(repository.cards[0]).toMatchObject({ placement: { kind: 'column', column: 'available' }, error: null, inbox: { delivery_evidence: { candidate_count: 0, latest: null } } });
    expect(repository.cards[1]).toMatchObject({
      placement: { kind: 'unclassified', reason: 'observation_failed' },
      error: { code: 'repo_inbox_unreadable', message: 'repository inbox observation is unavailable' },
      inbox: { delivery_evidence: null },
    });
    expect(result.counts.available).toBe(1);
    expect(result.counts.unclassified).toBe(1);
    expect(result.counts.unreadable).toBe(0);
    const rendered = JSON.stringify(result);
    expect(rendered).not.toContain('/private/agent-root');
    expect(rendered).not.toContain('super-secret');
  });

  test('redacts repository causes to the closed public error vocabulary', () => {
    const result = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-secret', repo_root: '/private/agent/repository', access_mode: 'read_only',
        status: 'unreadable', snapshot_consistency: 'degraded', cards: [],
        error: {
          code: 'repo_readiness_unavailable',
          message: 'gh stderr: token=super-secret path=/private/raw-provider-stderr',
        },
      }],
    });
    const rendered = JSON.stringify(result);
    expect(result.repositories[0]?.error).toEqual({
      code: 'repo_readiness_unavailable', message: 'repository readiness observation is unavailable',
    });
    expect(rendered).not.toContain('super-secret');
    expect(rendered).not.toContain('/private/raw-provider-stderr');
    expect(rendered).not.toContain('gh stderr');
  });
});


test('delivery observations affect the digest without changing classification', () => {
  const make = (observationSequence: number) => projectFleetBoardSnapshot({
    registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-09-07T00:00:00.000Z',
    repositories: [{ repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok', snapshot_consistency: 'stable', error: null,
      cards: [card({ inbox: { ...card().inbox, delivery_evidence: { candidate_count: 1, latest: {
        adapter_kind: 'herdr-cli-agent', effect_state: 'stopped', receipt_kind: null,
        observed_at: '2026-09-07T00:00:00.000Z', observation_sequence: observationSequence, observation_sha256: `sha256:${'e'.repeat(64)}`,
      } } } })],
    }],
  });
  const before = make(1); const after = make(2);
  expect(before.snapshot_sha256).not.toBe(after.snapshot_sha256);
  expect(before.counts).toEqual(after.counts);
  expect(before.repositories[0]!.cards[0]!.attention_owner).toBe(after.repositories[0]!.cards[0]!.attention_owner);
});


describe('exhaustive canonical placement', () => {
  const preparationBlockers = [
    { code: 'plan_missing', attention_owner: 'agent' },
    { code: 'plan_not_approved', attention_owner: 'user' },
    { code: 'repo_read_only', attention_owner: 'user' },
    { code: 'plan_not_projectable', attention_owner: 'agent' },
    { code: 'contract_missing', attention_owner: 'agent' },
    { code: 'contract_not_projectable', attention_owner: 'agent' },
  ] as const;
  const project = (cards: readonly FleetBoardCardInputV1[]) => projectFleetBoardSnapshot({
    registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-09-22T00:00:00.000Z',
    repositories: [{ repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok', snapshot_consistency: 'stable', cards, error: null }],
  });
  test.each([...preparationBlockers])('preserves preparation reason $code and its authoritative owner', blocker => {
    for (const execution_readiness of ['planning_required', 'unsupported'] as const) {
      const result = project([card({ execution_readiness, readiness_blockers: [blocker] })]);
      expect(result.snapshot_consistency).toBe('stable');
      expect(result.repositories[0]!.cards[0]).toMatchObject({ placement: { kind: 'preparation' }, readiness_blockers: [blocker], attention_owner: blocker.attention_owner });
      expect(result.counts).toMatchObject({ known_tasks: 1, preparation: 1, unclassified: 0 });
    }
  });
  test.each(['plan_ambiguous', 'plan_source_mismatch', 'lease_unknown', 'mode_unsupported', 'canonical_unavailable'] as const)('does not turn %s or mixed blockers into preparation', code => {
    expect(classifyFleetBoardPlacement(card({ execution_readiness: 'unsupported', readiness_blockers: [preparationBlockers[0], { code, attention_owner: 'user' }] }))).toEqual({ kind: 'unclassified', reason: 'unsupported_readiness' });
  });
  test('requires complete readiness authority and refuses contradictory ready states', () => {
    expect(classifyFleetBoardPlacement(card({ readiness_blockers: null }))).toEqual({ kind: 'unclassified', reason: 'readiness_unavailable' });
    for (const execution_readiness of ['planning_required', 'unsupported'] as const) {
      expect(classifyFleetBoardPlacement(card({ execution_readiness }))).toEqual({ kind: 'unclassified', reason: 'unsupported_readiness' });
    }
    for (const execution_readiness of ['execution_ready', 'inline_ready'] as const) {
      expect(classifyFleetBoardPlacement(card({ execution_readiness, readiness_blockers: [preparationBlockers[0]] }))).toEqual({ kind: 'unclassified', reason: 'unsupported_readiness' });
    }
    expect(classifyFleetBoardPlacement(card({ lease_state: 'unknown' }))).toEqual({ kind: 'unclassified', reason: 'state_unmapped' });
    expect(classifyFleetBoardPlacement(card({ task_state: 'drifted', lease_state: 'bound' }))).toEqual({ kind: 'unclassified', reason: 'task_drifted' });
  });
  test('keeps claimed and completed work independent of reacquisition blockers', () => {
    for (const lease_state of ['reserving', 'bound', 'completing'] as const) {
      const result = project([card({ lease_state, execution_readiness: 'unsupported', readiness_blockers: [{ code: 'repo_read_only', attention_owner: 'user' }, { code: 'lease_unavailable', attention_owner: 'external' }] })]);
      expect(result.repositories[0]!.cards[0]).toMatchObject({ placement: { kind: 'column', column: 'working' }, attention_owner: 'none' });
    }
    expect(classifyFleetBoardPlacement(card({ task_state: 'done', execution_readiness: null, readiness_blockers: null }))).toEqual({ kind: 'column', column: 'done' });
  });
  test('conserves known canonical tasks, counting orphan execution separately', () => {
    const result = project([
      card({ task_id: '1'.repeat(64) }),
      card({ task_id: '2'.repeat(64), execution_readiness: 'planning_required', readiness_blockers: [preparationBlockers[0]] }),
      card({ task_id: '3'.repeat(64), execution_readiness: 'inline_ready' }),
      card({ task_id: '4'.repeat(64), task_state: 'missing', task_label: null, task_index: null, lease_state: 'bound', claim_id: 'orphan', generation: 1 }),
      card({ task_id: '5'.repeat(64), task_state: 'drifted' }),
    ]);
    expect(result.counts).toEqual({ available: 1, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 1, preparation: 1, alternate_workflow: 1, isolated_execution: 1, known_tasks: 4 });
    expect(result.repositories[0]!.cards[2]!.placement).toEqual({ kind: 'alternate_workflow', workflow: 'inline' });
    expect(result.repositories[0]!.cards[3]!.placement).toEqual({ kind: 'unclassified', reason: 'canonical_missing' });
  });
  test('rejects duplicate canonical identities instead of counting them twice', () => {
    expect(() => project([card(), card()])).toThrow('duplicate task identities');
    const result = project([card()]);
    expect(() => projectFleetBoardSnapshot({ ...result, repositories: [
      { repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok', snapshot_consistency: 'stable', cards: [], error: null },
      { repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok', snapshot_consistency: 'stable', cards: [], error: null },
    ] })).toThrow('duplicate repository identities');
  });
});
