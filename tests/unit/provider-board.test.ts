import { projectFleetBoardSnapshot, type FleetBoardCardInputV2 } from '../../src/core/fleet/board';
import { expect, test } from 'bun:test';
import { buildProviderIssueObservation, buildExternalSourceRefreshReceipt } from '../../src/core/external-sources/issue-observation';
import { buildExternalSourceProjection } from '../../src/core/external-sources/projection';
import { projectProviderBoard } from '../../src/core/state/provider-board';
import type { OperatorTaskSession } from '../../src/core/operator/task-sessions';
const digest = `sha256:${'a'.repeat(64)}`;
function session(task: string, issue = '200'): OperatorTaskSession {
  return { profile_selection: { state: 'unassigned' }, admission_sha256: digest, branch: 'refs/heads/task', runtime: 'terminal', harness_kind: 'codex', selector: {
    repository_id: 'repo_1', provider_repository_id: '100', issue_id: issue, campaign_id: 'campaign', task, role: 'worker',
    claim_ref: `claim:${task}`, claim_revision: digest, grant_sha256: digest, policy_sha256: digest, actor_id: 'owner', session_binding_sha256: `sha256:${task.repeat(64)}`,
  } };
}
function fixture(state: 'open' | 'closed' = 'open') {
  const issue = buildProviderIssueObservation({ registered_repository_id: 'repo_1', provider: 'github', provider_host: 'github.com',
    provider_repository_id: '100', provider_issue_id: '200', display_ref: 'acme/widgets#7', url: 'https://github.com/acme/widgets/issues/7',
    observed_at: '2026-08-31T00:00:00.000Z', provider_created_at: null, provider_updated_at: null, state, title: 'issue', body: 'goal',
    labels: [], assignees: [], comments_policy: 'omitted', policy_revision: digest, eligible: true, eligibility_reasons: [] });
  const receipt = buildExternalSourceRefreshReceipt({ receipt_id: 'complete', registered_repository_id: 'repo_1', provider: 'github', provider_host: 'github.com',
    provider_repository_id: '100', provider_display_ref: 'acme/widgets', policy_revision: digest, started_at: '2026-08-31T00:00:00.000Z', completed_at: '2026-08-31T00:00:01.000Z',
    outcome: 'complete', pages_fetched: 1, issues_seen: 1, observations_written: 1, limits: { max_pages: 2, max_issues: 10, max_body_bytes: 100, max_total_bytes: 1000, deadline_ms: 1000 },
    source_revisions: [issue.source_revision], failure: null });
  return { registered_repository_id: 'repo_1', issues: buildExternalSourceProjection({ registered_repository_id: 'repo_1', observations: [issue], receipts: [receipt] }),
    sessions: { protocol: 1 as const, kind: 'operator_task_sessions' as const, repository_id: 'repo_1', observed_at: '2026-08-31T00:00:01.000Z', sessions: [session('a'), session('b')] }, session_error: null };
}
test('provider state remains separate from all exact admitted session associations', () => {
  const input = fixture('closed'), board = projectProviderBoard(input);
  expect(board.cards[0]!.issue!.state).toBe('closed');
  expect(board.cards[0]!.sessions.map(value => value.selector.task)).toEqual(['a', 'b']);
  expect(board.cards[0]!.issue_status).toBe('observed');
  expect(projectProviderBoard({ ...input, sessions: { ...input.sessions, observed_at: '2026-09-01T00:00:00.000Z' } }).revision).toBe(board.revision);
});
test('unavailable discovery preserves issue rows and unknown provider associations remain visible', () => {
  const input = fixture();
  const failed = projectProviderBoard({ ...input, sessions: null, session_error: 'unavailable' });
  expect(failed.cards).toHaveLength(1); expect(failed.cards[0]!.execution_status).toBe('unavailable');
  const unobserved = projectProviderBoard({ ...input, sessions: { ...input.sessions, sessions: [session('c', '201')] } });
  expect(unobserved.cards.map(row => [row.provider_issue_id, row.issue_status])).toEqual([['200', 'observed'], ['201', 'unavailable']]);
  expect(unobserved.cards[0]!.sessions).toEqual([]);
});

function fleetCard(execution: OperatorTaskSession | null, issueState: 'open' | 'closed' | null = 'open'): FleetBoardCardInputV2 {
  return { provider_repository_id: '100', provider_issue_id: '200', issue_state: issueState, issue_revision: digest,
    execution_status: 'observed', execution, task_id: execution?.selector.task ?? null, task_label: 'Provider title', task_index: 7,
    merge_readiness: null, execution_readiness: null, readiness_blockers: null,
    feedback: { observation_status: 'unavailable', pending_count: 0, no_progress: false, repair_actions: [] },
    inbox: { observation_status: 'unavailable', unread_count: 0, addressed_to_current_claim: false, delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, failure_class: null, delivery_evidence: null },
    snapshot_consistency: 'stable', error: null };
}
function fleet(cards: readonly FleetBoardCardInputV2[]) {
  return projectFleetBoardSnapshot({ registry_revision: digest, sequence: 1, observed_at: '2026-08-31T00:00:00.000Z', repositories: [{ repository_id: 'repo_1', repo_root: '/repo', access_mode: 'read_only', status: 'ok', snapshot_consistency: 'stable', cards, error: null }] });
}
test('fleet preserves simultaneous sessions without deriving issue completion from execution', () => {
  const result = fleet([fleetCard(session('a')), fleetCard(session('b'))]);
  expect(result.protocol).toBe(6);
  expect(result.repositories[0]!.cards).toHaveLength(2);
  expect(result.counts.working).toBe(2);
  expect(result.repositories[0]!.cards.map(card => card.execution!.selector.task)).toEqual(['a', 'b']);
  expect(fleet([fleetCard(session('a'), 'closed')]).counts.done).toBe(1);
  expect(fleet([fleetCard(null)]).repositories[0]!.cards[0]!.task_id).toBeNull();
});
test('unknown provider state or execution observations remain visible and unclassified', () => {
  expect(fleet([fleetCard(session('a'), null)]).counts.isolated_execution).toBe(1);
  const result = fleet([{ ...fleetCard(null), execution_status: 'unavailable' }]);
  expect(result.repositories[0]!.cards[0]!.placement).toEqual({ kind: 'unclassified', reason: 'readiness_unavailable' });
  expect(result.snapshot_consistency).toBe('degraded');
});

// Exercise the real bounded collector loop. The scripted readers supply observations,
// not precomputed board revisions or a replacement snapshot-consistency algorithm.
import { resolveProviderBoard, type ProviderBoardReaders } from '../../src/effects/state/collect-provider-board-inputs';
import { OperatorTaskDiffError } from '../../src/effects/operator/task-diff';
function scriptedBoardReads(snapshots: readonly ReturnType<typeof fixture>[], failure?: 'stale' | 'too_large' | 'unavailable') {
  let reads = 0;
  let current = snapshots[0]!;
  const readers: ProviderBoardReaders = {
    registry: () => {
      current = snapshots[Math.min(reads++, snapshots.length - 1)]!;
      return { registryPath: '/fixture/registry.json', authorizationRevision: 1, registryRevision: digest,
        repos: [{ id: 'repo_1', path: '/fixture/repository', accessMode: 'read_only', source: 'manual',
          registeredAt: '2026-08-31T00:00:00.000Z', lastSeenAt: '2026-08-31T00:00:00.000Z' }] };
    },
    observations: root => { expect(root).toBe('/fixture/repository'); return current.issues.issues.map(row => row.latest_observation); },
    receipts: root => { expect(root).toBe('/fixture/repository'); return [current.issues.latest_complete_refresh!]; },
    sessions: input => {
      expect(input.repository_id).toBe('repo_1');
      if (failure) throw new OperatorTaskDiffError(failure);
      return current.sessions;
    },
  };
  return { readers, count: () => reads };
}
test('quiet provider board settles after exactly two complete observations', () => {
  const input = fixture(), script = scriptedBoardReads([input]);
  expect(resolveProviderBoard({ repository_id: 'repo_1' }, script.readers)).toEqual(projectProviderBoard(input));
  expect(script.count()).toBe(2);
});
test('one changed provider round can settle within the bounded retry', () => {
  const before = fixture(), after = fixture('closed'), script = scriptedBoardReads([before, after, after]);
  expect(resolveProviderBoard({ repository_id: 'repo_1' }, script.readers)).toEqual(projectProviderBoard(after));
  expect(script.count()).toBe(3);
});
test('unchanged issue state cannot hide changing admitted session evidence', () => {
  const initial = fixture();
  const snapshots = ['a', 'b', 'c'].map(task => ({ ...initial, sessions: { ...initial.sessions, sessions: [session(task)] } }));
  const script = scriptedBoardReads(snapshots);
  const board = resolveProviderBoard({ repository_id: 'repo_1' }, script.readers);
  expect(script.count()).toBe(3);
  expect(board).toEqual({ ...projectProviderBoard(snapshots[2]!), snapshot_consistency: 'changed_during_read' });
  expect(board.cards[0]!.issue!.state).toBe('open');
  expect(board.cards[0]!.sessions.map(row => row.selector.task)).toEqual(['c']);
});
test.each(['stale', 'too_large', 'unavailable'] as const)('discovery %s stays explicit and never creates an unassigned successful observation', failure => {
  const input = fixture(), script = scriptedBoardReads([input], failure);
  const board = resolveProviderBoard({ repository_id: 'repo_1' }, script.readers);
  expect(board.cards).toHaveLength(1);
  expect(board.cards[0]!.issue_status).toBe('observed');
  expect(board.cards[0]!.execution_status).toBe('unavailable');
  expect(board.cards[0]!.execution_error).toBe(failure);
  expect(board.cards[0]!.sessions).toEqual([]);
  expect(script.count()).toBe(2);
});
