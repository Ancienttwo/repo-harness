import { decodeOperatorFleetSnapshot } from '../../src/operator-web/types';
import { describe, expect, test } from 'bun:test';
import { basename } from 'path';

import {
  projectFleetBoardSnapshot,
  type FleetBoardSnapshotV2,
} from '../../src/core/fleet/board';
import {
  projectOperatorFleetSnapshot,
  type OperatorFleetSnapshotV1,
} from '../../src/core/operator/fleet-snapshot';
import type { PullRequestReadinessV2 } from '../../src/core/publication/merge-readiness';

const serviceEpoch = '00000000-0000-4000-8000-000000000001';

function sourceSnapshot(readiness: PullRequestReadinessV2 | null = null): FleetBoardSnapshotV2 {
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
            task_id: null, provider_repository_id: '1001', provider_issue_id: '2001', issue_state: 'open', issue_revision: `sha256:${'b'.repeat(64)}`, execution_status: 'observed', execution: null,
            task_label: 'observe one registered repository',
            task_index: 1,
            merge_readiness: readiness,
            execution_readiness: 'execution_ready', readiness_blockers: [],
            feedback: { observation_status: 'observed', pending_count: 1, no_progress: false, repair_actions: [] },
            inbox: { observation_status: 'observed', unread_count: 2, addressed_to_current_claim: false },
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
  test('preserves the required-check coverage blocker detail and evidence', () => {
    const head = 'a'.repeat(40), base = 'b'.repeat(40);
    const detail = 'required check "build, typecheck, test (matrix)" is skipping for protected path "api-surface/entries.json"; run it or add a passing "coverage-waiver" check';
    const readiness: PullRequestReadinessV2 = {
      protocol: 2, kind: 'repo-harness-pull-request-readiness',
      provider_repository_id: '1001', repository: 'example/repo-harness', pr_number: 1, ready: false,
      expected_head_sha: head, expected_base_sha: base, integration_mode: 'unmerged', attention_owner: 'agent',
      blockers: [{ code: 'required_check_coverage_missing', attention_owner: 'agent', detail }],
      check_failures: [],
      required_check_coverage: { protocol: 1, kind: 'repo-harness-required-check-coverage', head_sha: head, base_sha: base,
        protected_paths: ['api-surface/entries.json'],
        checks: [{ check: 'build, typecheck, test (matrix)', bucket: 'skipping', requirement: 'required' }], waiver: null },
      stack: { member: false, depth: 0, chain: [], final_base_sha: null, status: 'not_member' },
    };
    const projected = projectOperatorFleetSnapshot(sourceSnapshot(readiness), serviceEpoch, basename);
    expect(projected.repositories[0]?.cards[0]?.merge_readiness?.blockers[0]?.detail).toBe(detail);
    expect(projected.repositories[0]?.cards[0]?.merge_readiness?.stack).toEqual(readiness.stack);
    expect(projected.repositories[0]?.cards[0]?.merge_readiness?.required_check_coverage).toEqual(readiness.required_check_coverage);
    // The projection is a transport view: it must not reclassify the blocker.
    expect(projected.repositories[0]?.cards[0]?.blocker_codes).toEqual(['required_check_coverage_missing']);
  });

  test('UX-local-human-control-board-v1-N1 removes local paths and preserves Fleet facts', () => {
    const source = sourceSnapshot();
    const projected = projectOperatorFleetSnapshot(source, serviceEpoch, basename);

    expect(projected).toMatchObject({
      protocol: 8,
      service_epoch: serviceEpoch,
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
    const projected = projectOperatorFleetSnapshot(source, serviceEpoch, basename);
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
            task_id: null, provider_repository_id: '1001', provider_issue_id: '2001', issue_state: 'open', issue_revision: `sha256:${'b'.repeat(64)}`, execution_status: 'observed', execution: null,
            task_label: 'observe one registered repository',
            task_index: 1,
            merge_readiness: null,
            execution_readiness: 'execution_ready', readiness_blockers: [],
            feedback: { observation_status: 'observed', pending_count: 0, no_progress: false, repair_actions: [] },
            inbox: { observation_status: 'observed', unread_count: 0, addressed_to_current_claim: false },
            snapshot_consistency: 'stable',
            error: null,
          },
          {
            task_id: null, provider_repository_id: '1001', provider_issue_id: '2002', issue_state: 'open', issue_revision: `sha256:${'b'.repeat(64)}`, execution_status: 'observed', execution: null,
            task_label: 'observe a damaged card',
            task_index: 2,
            merge_readiness: null,
            execution_readiness: null, readiness_blockers: null,
            feedback: { observation_status: 'observed', pending_count: 0, no_progress: false, repair_actions: [] },
            inbox: { observation_status: 'observed', unread_count: 0, addressed_to_current_claim: false },
            snapshot_consistency: 'stable',
            error: { code: 'repo_inbox_unreadable', message: 'inbox stderr /private/agent-root' },
          },
        ],
        error: null,
      }],
    });

    const projected = projectOperatorFleetSnapshot(source, serviceEpoch, basename);
    expect(projected.counts.unclassified).toBe(1);
    expect(projected.repositories[0]?.cards[1]).toMatchObject({
      placement: { kind: 'unclassified', reason: 'observation_failed' },
      error: { code: 'repo_inbox_unreadable', message: 'repository inbox observation is unavailable' },
    });
    expect(projected.repositories[0]?.cards[0]?.error).toBeNull();
    expect(JSON.stringify(projected)).not.toContain('/private/agent-root');
  });

  test('rejects an unsupported Fleet protocol or kind before crossing the browser boundary', () => {
    const invalid = { ...sourceSnapshot(), protocol: 99 } as unknown as FleetBoardSnapshotV2;
    expect(() => projectOperatorFleetSnapshot(invalid, serviceEpoch, basename)).toThrow('unsupported Fleet snapshot protocol');
    const otherKind = { ...sourceSnapshot(), kind: 'operator_fleet_snapshot' } as unknown as FleetBoardSnapshotV2;
    expect(() => projectOperatorFleetSnapshot(otherKind, serviceEpoch, basename)).toThrow('unsupported Fleet snapshot kind');
  });

  test('UX-local-human-control-board-v1-N1 allowlists every DTO level against hostile identity-shaped extras', () => {
    const source = JSON.parse(JSON.stringify(sourceSnapshot())) as FleetBoardSnapshotV2 & Record<string, unknown>;
    const repository = source.repositories[0] as FleetBoardSnapshotV2['repositories'][number] & Record<string, unknown>;
    const card = repository.cards[0] as FleetBoardSnapshotV2['repositories'][number]['cards'][number] & Record<string, unknown>;
    Object.defineProperty(source, 'future_env', { value: 'REPO_HARNESS_TOKEN=secret', enumerable: true });
    Object.defineProperty(repository, 'repo_root', { value: 'C:\\Users\\operator\\private', enumerable: true });
    Object.defineProperty(repository, 'future_unix_path', { value: '/Users/operator/.ssh/id_rsa', enumerable: true });
    Object.defineProperty(card.placement, 'future_env', { value: 'PLACEMENT_PRIVATE_CONTROL', enumerable: true });
    Object.defineProperty(card, 'future_control', { value: 'line\u0000break', enumerable: true });
    Object.defineProperty(card, 'future_windows_path', { value: 'C:\\Users\\operator\\token.txt', enumerable: true });

    const projected = projectOperatorFleetSnapshot(source, serviceEpoch, basename);
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
      'repositories', 'sequence', 'service_epoch', 'snapshot_consistency', 'source_snapshot_sha256',
    ]);
    expect(Object.keys(projected.repositories[0] ?? {}).sort()).toEqual([
      'access_mode', 'cards', 'display_name', 'error', 'repository_id', 'snapshot_consistency', 'status',
    ]);
    expect(Object.keys(projected.repositories[0]?.cards[0] ?? {}).sort()).toEqual([
      'attention_owner', 'blocker_codes', 'error', 'execution', 'execution_readiness', 'execution_status',
      'feedback', 'inbox', 'issue_revision', 'issue_state', 'merge_readiness', 'placement', 'provider_issue_id', 'provider_repository_id',
      'readiness_blockers', 'repository_id', 'snapshot_consistency', 'task_id', 'task_index', 'task_label',
    ]);
  });
});


 test('Fleet projection requires the actual service epoch and never synthesizes one', () => {
  for (const epoch of [undefined, null, '', 'unknown', '00000000-0000-1000-8000-000000000001']) {
    expect(() => projectOperatorFleetSnapshot(sourceSnapshot(), epoch as string, basename)).toThrow('invalid operator service epoch');
  }
  expect(projectOperatorFleetSnapshot(sourceSnapshot(), serviceEpoch, basename).service_epoch).toBe(serviceEpoch);
});

test('provider eligibility reasons survive the public projection and strict browser decoder', () => {
  const source = sourceSnapshot();
  const reasons = ['assignee_not_allowed', 'missing_label:ready'];
  const first = source.repositories[0]!;
  const input = { ...source, registry_revision: `sha256:${'a'.repeat(64)}`,
    counts: { ...source.counts, available: 0, unreadable: 0, preparation: 1 },
    repositories: [{ ...first, cards: [{ ...first.cards[0]!, execution_readiness: 'unsupported' as const,
      placement: { kind: 'preparation' as const },
      readiness_blockers: [{ code: 'provider_ineligible' as const, attention_owner: 'user' as const, eligibility_reasons: reasons }],
    }] }] };
  const wire = projectOperatorFleetSnapshot(input, serviceEpoch, basename);
  const blocker = wire.repositories[0]!.cards[0]!.readiness_blockers![0]!;
  expect(blocker).toEqual({ code: 'provider_ineligible', attention_owner: 'user', eligibility_reasons: reasons });
  const decoded = decodeOperatorFleetSnapshot(JSON.parse(JSON.stringify(wire)));
  expect(decoded.repositories[0]!.cards[0]!.readiness_blockers).toEqual([blocker]);
  reasons.push('later_mutation');
  expect(blocker).toEqual({ code: 'provider_ineligible', attention_owner: 'user', eligibility_reasons: ['assignee_not_allowed', 'missing_label:ready'] });
  for (const bad of [
    { ...blocker, extra: true }, { ...blocker, code: 'unknown_provider_blocker' }, { code: 'provider_ineligible', attention_owner: 'user' },
    { ...blocker, attention_owner: 'agent' },
    ...[null, [1], [''], [' trailing '], ['bad\u0000reason'], ['x'.repeat(1025)], Array.from({ length: 101 }, (_, i) => String(i).padStart(3, '0')), ['a', 'a'], ['z', 'a']]
      .map(eligibility_reasons => ({ ...blocker, eligibility_reasons })),
    { code: 'repo_read_only', attention_owner: 'user', eligibility_reasons: [] },
  ]) {
    const malformed = JSON.parse(JSON.stringify(wire));
    malformed.repositories[0].cards[0].readiness_blockers = [bad];
    expect(() => decodeOperatorFleetSnapshot(malformed)).toThrow();
  }
});
