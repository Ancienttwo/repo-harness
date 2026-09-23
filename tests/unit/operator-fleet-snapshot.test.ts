import { describe, expect, test } from 'bun:test';

import {
  projectFleetBoardSnapshot,
  type FleetBoardSnapshotV1,
} from '../../src/core/fleet/board';
import {
  projectOperatorFleetSnapshot,
  type OperatorFleetSnapshotV1,
} from '../../src/core/operator/fleet-snapshot';

function sourceSnapshot(): FleetBoardSnapshotV1 {
  return projectFleetBoardSnapshot({
    registry_revision: 'sha256:registry',
    sequence: 7,
    observed_at: '2026-08-24T01:03:00.000Z',
    repositories: [
      {
        repository_id: 'repo-a',
        repo_root: '/private/workspaces/repo-a',
        access_mode: 'read_write',
        status: 'ok',
        snapshot_consistency: 'stable',
        cards: [
          {
            task_id: 'a'.repeat(64),
            task_revision: 'b'.repeat(64),
            task_label: 'observe one registered repository',
            task_index: 1,
            task_state: 'pending',
            lease_state: 'available',
            claim_id: null,
            generation: null,
            current_publication: null,
            merge_readiness: null,
            execution_readiness: 'execution_ready', readiness_blockers: [],
            feedback: { pending_count: 1, no_progress: false, repair_actions: [] },
            inbox: { unread_count: 2, addressed_to_current_claim: false, delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, delivery_evidence: { candidate_count: 0, latest: null }, failure_class: null },
            snapshot_consistency: 'changed_during_read',
            error: null,
          },
        ],
        error: null,
      },
      {
        repository_id: 'repo-unreadable',
        repo_root: '/private/workspaces/secret-repo',
        access_mode: 'read_only',
        status: 'unreadable',
        snapshot_consistency: 'degraded',
        cards: [],
        error: {
          code: 'repo_unreadable',
          message: 'provider stderr token=secret /private/raw-path',
        },
      },
    ],
  });
}

describe('OperatorFleetSnapshotV1 browser projection', () => {
  test('UX-local-human-control-board-v1-N1 removes local paths and preserves Fleet facts', () => {
    const source = sourceSnapshot();
    const projected = projectOperatorFleetSnapshot(source);

    expect(projected).toMatchObject({
      protocol: 6,
      kind: 'operator_fleet_snapshot',
      registry_revision: source.registry_revision,
      sequence: source.sequence,
      observed_at: source.observed_at,
      snapshot_consistency: source.snapshot_consistency,
      counts: source.counts,
      source_snapshot_sha256: source.snapshot_sha256,
    });
    expect(projected.repositories[0]?.cards).toEqual(source.repositories[0]?.cards);
    expect(projected.repositories[0]?.display_name).toBe('repo-a');
    expect(JSON.stringify(projected)).not.toContain('repo_root');
    expect(JSON.stringify(projected)).not.toContain('/private/workspaces');
    expect(JSON.stringify(projected)).not.toContain('provider stderr');
    expect(JSON.stringify(projected)).not.toContain('token=secret');
    expect(projected.repositories[1]?.error).toEqual({
      code: 'repo_unreadable',
      message: 'repository authority cannot be read',
    });
    expect(source.repositories[0]?.snapshot_consistency).toBe('changed_during_read');
    expect(projected.snapshot_consistency).toBe('degraded');
  });

  test('returns an immutable transport view without reclassifying cards or counts', () => {
    const source = sourceSnapshot();
    const projected = projectOperatorFleetSnapshot(source);
    const typed = projected as OperatorFleetSnapshotV1;

    expect(Object.isFrozen(typed)).toBe(true);
    expect(Object.isFrozen(typed.repositories)).toBe(true);
    expect(Object.isFrozen(typed.repositories[0])).toBe(true);
    expect(typed.repositories[0]?.cards[0]?.placement).toEqual({ kind: 'column', column: 'available' });
    expect(typed.repositories[0]?.cards[0]).toMatchObject({
      task_label: 'observe one registered repository',
      task_index: 1,
    });
    expect(typed.counts.available).toBe(source.counts.available);
  });

  test('projects the Agent Runtime effect-store error as a safe dedicated DTO value', () => {
    const source = sourceSnapshot();
    const withRuntimeError = {
      ...source,
      repositories: source.repositories.map((repository, index) => index === 1
        ? {
            ...repository,
            error: {
              code: 'repo_runtime_effect_unreadable' as const,
              message: 'runtime store /private/runtime-effects secret=redacted',
            },
          }
        : repository),
    } as FleetBoardSnapshotV1;

    const projected = projectOperatorFleetSnapshot(withRuntimeError);
    expect(projected.repositories[1]?.error).toEqual({
      code: 'repo_runtime_effect_unreadable',
      message: 'repository Agent Runtime effect store is unavailable',
    });
    expect(JSON.stringify(projected)).not.toContain('/private/runtime-effects');
    expect(JSON.stringify(projected)).not.toContain('secret=redacted');
  });

  test('carries the unclassified count and one failed card error through the transport view', () => {
    const source = projectFleetBoardSnapshot({
      registry_revision: 'sha256:registry',
      sequence: 3,
      observed_at: '2026-09-05T00:00:00.000Z',
      repositories: [{
        repository_id: 'repo-a',
        repo_root: '/private/workspaces/repo-a',
        access_mode: 'read_write',
        status: 'ok',
        snapshot_consistency: 'stable',
        cards: [
          {
            task_id: 'a'.repeat(64),
            task_revision: 'b'.repeat(64),
            task_label: 'observe one registered repository',
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
          },
          {
            task_id: 'c'.repeat(64),
            task_revision: 'b'.repeat(64),
            task_label: 'observe a damaged card',
            task_index: 2,
            task_state: 'pending',
            lease_state: 'available',
            claim_id: null,
            generation: null,
            current_publication: null,
            merge_readiness: null,
            execution_readiness: null, readiness_blockers: null,
            feedback: { pending_count: 0, no_progress: false, repair_actions: [] },
            inbox: { unread_count: 0, addressed_to_current_claim: false, delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, delivery_evidence: null, failure_class: null },
            snapshot_consistency: 'stable',
            error: { code: 'repo_inbox_unreadable', message: 'inbox stderr /private/agent-root' },
          },
        ],
        error: null,
      }],
    });

    const projected = projectOperatorFleetSnapshot(source);
    expect(projected.counts.unclassified).toBe(1);
    expect(projected.repositories[0]?.cards[1]).toMatchObject({
      placement: { kind: 'unclassified', reason: 'observation_failed' },
      error: { code: 'repo_inbox_unreadable', message: 'repository inbox observation is unavailable' },
    });
    expect(projected.repositories[0]?.cards[0]?.error).toBeNull();
    expect(JSON.stringify(projected)).not.toContain('/private/agent-root');
  });

  test('rejects an unsupported Fleet protocol before crossing the browser boundary', () => {
    const invalid = { ...sourceSnapshot(), protocol: 99 } as unknown as FleetBoardSnapshotV1;
    expect(() => projectOperatorFleetSnapshot(invalid)).toThrow('unsupported Fleet snapshot protocol');
  });

  test('UX-local-human-control-board-v1-N1 allowlists every DTO level against hostile identity-shaped extras', () => {
    const source = JSON.parse(JSON.stringify(sourceSnapshot())) as FleetBoardSnapshotV1 & Record<string, unknown>;
    const repository = source.repositories[0] as FleetBoardSnapshotV1['repositories'][number] & Record<string, unknown>;
    const card = repository.cards[0] as FleetBoardSnapshotV1['repositories'][number]['cards'][number] & Record<string, unknown>;
    Object.defineProperty(source, 'future_env', { value: 'REPO_HARNESS_TOKEN=secret', enumerable: true });
    Object.defineProperty(repository, 'repo_root', { value: 'C:\\Users\\operator\\private', enumerable: true });
    Object.defineProperty(repository, 'future_unix_path', { value: '/Users/operator/.ssh/id_rsa', enumerable: true });
    Object.defineProperty(card.placement, 'future_env', { value: 'PLACEMENT_PRIVATE_CONTROL', enumerable: true });
    Object.defineProperty(card, 'future_control', { value: 'line\u0000break', enumerable: true });
    Object.defineProperty(card, 'future_windows_path', { value: 'C:\\Users\\operator\\token.txt', enumerable: true });

    const projected = projectOperatorFleetSnapshot(source);
    const rendered = JSON.stringify(projected);
    expect(rendered).not.toContain('future_env');
    expect(rendered).not.toContain('PLACEMENT_PRIVATE_CONTROL');
    expect(rendered).not.toContain('REPO_HARNESS_TOKEN=secret');
    expect(rendered).not.toContain('future_unix_path');
    expect(rendered).not.toContain('/Users/operator/.ssh/id_rsa');
    expect(rendered).not.toContain('future_control');
    expect(rendered).not.toContain('future_windows_path');
    expect(rendered).not.toContain('C:\\Users\\operator\\token.txt');
    expect(Object.keys(projected).sort()).toEqual([
      'counts', 'kind', 'observed_at', 'protocol', 'registry_revision',
      'repositories', 'sequence', 'snapshot_consistency', 'source_snapshot_sha256',
    ]);
    expect(Object.keys(projected.repositories[0] ?? {}).sort()).toEqual([
      'access_mode', 'cards', 'display_name', 'error', 'repository_id', 'snapshot_consistency', 'status',
    ]);
    expect(Object.keys(projected.repositories[0]?.cards[0] ?? {}).sort()).toEqual([
      'attention_owner', 'blocker_codes', 'claim_id', 'error', 'execution_readiness',
      'feedback', 'generation', 'head_sha', 'inbox', 'lease_state', 'merge_readiness',
      'placement', 'publication_id', 'readiness_blockers', 'repository_id', 'snapshot_consistency', 'task_id', 'task_index',
      'task_label', 'task_revision', 'task_state',
    ]);
  });
});


test('notification evidence is copied by allowlist without exposing raw runtime fields', () => {
  const latest = { adapter_kind: 'herdr-cli-agent' as const, effect_state: 'stopped' as const, receipt_kind: null,
    observed_at: '2026-09-07T00:00:00.000Z', observation_sequence: 2, observation_sha256: `sha256:${'f'.repeat(64)}`,
    endpoint_id: 'private-endpoint', host_id: 'private-host' };
  const baseline = sourceSnapshot();
  const source = { ...baseline, repositories: baseline.repositories.map(repo => ({ ...repo,
    cards: repo.cards.map(card => ({ ...card, inbox: { ...card.inbox, delivery_evidence: { candidate_count: 1, latest } } })),
  })) };
  const result = projectOperatorFleetSnapshot(source);
  expect(JSON.stringify(result)).not.toContain('private-endpoint');
  expect(JSON.stringify(result)).not.toContain('private-host');
  expect(result.repositories[0]!.cards[0]!.inbox.delivery_evidence!.latest!.observation_sha256).toBe(latest.observation_sha256);
  expect(Object.isFrozen(result.repositories[0]!.cards[0]!.inbox.delivery_evidence!.latest)).toBe(true);
});
