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
        snapshot_consistency: 'changed_during_read',
        cards: [
          {
            task_id: 'a'.repeat(64),
            task_revision: 'b'.repeat(64),
            task_state: 'pending',
            lease_state: 'available',
            claim_id: null,
            generation: null,
            current_publication: null,
            merge_readiness: null,
            execution_readiness: 'execution_ready',
            feedback: { pending_count: 1, no_progress: false, repair_actions: [] },
            inbox: { unread_count: 2, addressed_to_current_claim: false },
            snapshot_consistency: 'changed_during_read',
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
      protocol: source.protocol,
      kind: 'operator_fleet_snapshot',
      registry_revision: source.registry_revision,
      sequence: source.sequence,
      observed_at: source.observed_at,
      snapshot_consistency: source.snapshot_consistency,
      counts: source.counts,
      source_snapshot_sha256: source.snapshot_sha256,
    });
    expect(projected.repositories[0]?.cards).toEqual(source.repositories[0]?.cards);
    expect(JSON.stringify(projected)).not.toContain('repo_root');
    expect(JSON.stringify(projected)).not.toContain('/private/workspaces');
    expect(JSON.stringify(projected)).not.toContain('provider stderr');
    expect(JSON.stringify(projected)).not.toContain('token=secret');
    expect(projected.repositories[1]?.error).toEqual({
      code: 'repo_unreadable',
      message: 'repository authority cannot be read',
    });
  });

  test('returns an immutable transport view without reclassifying cards or counts', () => {
    const source = sourceSnapshot();
    const projected = projectOperatorFleetSnapshot(source);
    const typed = projected as OperatorFleetSnapshotV1;

    expect(Object.isFrozen(typed)).toBe(true);
    expect(Object.isFrozen(typed.repositories)).toBe(true);
    expect(Object.isFrozen(typed.repositories[0])).toBe(true);
    expect(typed.repositories[0]?.cards[0]?.column).toBe('available');
    expect(typed.counts.available).toBe(source.counts.available);
  });

  test('rejects an unsupported Fleet protocol before crossing the browser boundary', () => {
    const invalid = { ...sourceSnapshot(), protocol: 99 } as unknown as FleetBoardSnapshotV1;
    expect(() => projectOperatorFleetSnapshot(invalid)).toThrow('unsupported Fleet snapshot protocol');
  });
});
