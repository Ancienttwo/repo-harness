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
