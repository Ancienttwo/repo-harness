import { describe, expect, test } from 'bun:test';

import {
  classifyFleetBoardColumn,
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
    execution_readiness: 'execution_ready',
    feedback: { pending_count: 0, no_progress: false, repair_actions: [] },
    inbox: { unread_count: 0, addressed_to_current_claim: false, delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, failure_class: null },
    snapshot_consistency: 'stable',
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
  test('maps only exact execution-ready pending work to available', () => {
    expect(classifyFleetBoardColumn(card())).toBe('available');
    expect(classifyFleetBoardColumn(card({ execution_readiness: 'planning_required' }))).toBeNull();
    expect(classifyFleetBoardColumn(card({ lease_state: 'bound', execution_readiness: 'planning_required' }))).toBe('working');
    expect(classifyFleetBoardColumn(card({ task_state: 'done', lease_state: 'reviewing' }))).toBe('done');
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
    expect(projected.column).toBe(classifyFleetBoardColumn(baseline));
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
      inbox: { unread_count: 1, addressed_to_current_claim: true, delivery_state: 'delivered', runtime_reachability: 'reachable', effect_sha256: `sha256:${'f'.repeat(64)}`, failure_class: null },
    });
    const result = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry', sequence: 1, observed_at: '2026-08-23T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a', repo_root: '/fixtures/a', access_mode: 'read_write', status: 'ok',
        snapshot_consistency: 'stable', cards: [reviewing], error: null,
      }],
    });
    expect(result.repositories[0]?.cards[0]).toMatchObject({
      column: 'in_review', attention_owner: 'user',
      head_sha: 'd'.repeat(40), blocker_codes: ['checks_pending'],
      feedback: { pending_count: 2, no_progress: true },
    });
  });

  test('sorts deterministically and excludes wall clock and sequence from snapshot digest', () => {
    const first = snapshot('2026-08-23T00:00:00.000Z', 1);
    const second = snapshot('2026-08-23T00:01:00.000Z', 2);
    expect(first.repositories.map((entry) => entry.repository_id)).toEqual(['repo-a', 'repo-z']);
    expect(first.snapshot_sha256).toBe(second.snapshot_sha256);
    expect(first.counts).toEqual({ available: 2, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0 });
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
        cards: [card({ execution_readiness: 'planning_required', snapshot_consistency: 'changed_during_read' })],
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
