import { expect, test } from 'bun:test';
import { observeReviewIssueGoal } from '../../src/effects/review/issue-goal';
import { parseExternalSourcesPolicy } from '../../src/effects/external-sources/policy';
import type { GithubCommandRunner } from '../../src/effects/external-sources/github';

const policy = parseExternalSourcesPolicy({ version: 1, mode: 'manual', github: {
  enabled: true, repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [7] },
  limits: { max_pages: 1, max_issues: 1, max_body_bytes: 4096, max_total_bytes: 8192, deadline_ms: 5000 },
} });
const issue = { id: 201, number: 7, html_url: 'https://github.com/acme/widgets/issues/7', state: 'open',
  title: 'Preserve behavior', body: 'Migrate review authority.', updated_at: '2026-10-25T00:00:00Z' };
function runner(value: unknown = issue, repoId = 101): GithubCommandRunner {
  const responses = [{ id: repoId, full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }, value];
  return (args) => {
    expect(args.slice(0, 3)).toEqual(['api', '--method', 'GET']);
    return { stdout: JSON.stringify(responses.shift()) };
  };
}
const observe = (value: unknown = issue, repoId = 101) => observeReviewIssueGoal({
  policy, repository_id: '101', issue_id: '201', runner: runner(value, repoId),
});

test('goal binds provider identity, revision and exact content, without using closure as acceptance', () => {
  const first = observe();
  expect(JSON.parse(first.content)).toEqual({ title: issue.title, body: issue.body });
  expect(observe({ ...issue, body: 'Different goal at the same provider timestamp' }).revision).not.toBe(first.revision);
  expect(observe({ ...issue, updated_at: '2026-10-25T00:00:01Z' }).revision).toBe(first.revision);
  expect(observe({ ...issue, title: 'Different goal title' }).revision).not.toBe(first.revision);
  expect(observe({ ...issue, state: 'closed' })).toEqual(first);
  expect(Object.isFrozen(first)).toBe(true);
});

test('goal rejects a replacement repository or issue, PR substitution and missing revisions', () => {
  expect(() => observe(issue, 999)).toThrow('review_goal_identity_changed');
  expect(() => observe({ ...issue, id: 999 })).toThrow('review_goal_identity_changed');
  expect(() => observe({ ...issue, pull_request: {} })).toThrow('is a pull request');
  expect(() => observe({ ...issue, updated_at: null })).toThrow('review_goal_revision_unavailable');
  expect(() => observeReviewIssueGoal({ policy: parseExternalSourcesPolicy(undefined), repository_id: '101', issue_id: '201',
    runner: () => { throw new Error('must not fetch with disabled policy'); } })).toThrow('external_sources is off; manual GitHub refresh is not enabled');
});
