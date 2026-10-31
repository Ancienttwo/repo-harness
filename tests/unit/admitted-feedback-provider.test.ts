import { expect, test } from 'bun:test';
import { observeGitHubFeedback, type FeedbackSubject, type FeedbackObservationInput } from '../../src/effects/fleet/provider-feedback';
const head = 'a'.repeat(40), base = 'b'.repeat(40);
const subject: FeedbackSubject = { publication_id: `sha256:${'1'.repeat(64)}`,
  selection: { repository: 'acme/widgets', provider_repository_id: '42', pr_number: 7, expected_head_sha: head, expected_base_sha: base },
  task_id: '2'.repeat(64), repository_id: '42', issue_id: '903', campaign_id: 'review',
  claim: { reference: 'claim-fixture', revision: `sha256:${'3'.repeat(64)}` },
  admission_sha256: `sha256:${'4'.repeat(64)}`, head_sha: head, base_sha: base, pr_number: 7 };
function provider(options: { repositoryId?: number; head?: string; base?: string; truncated?: boolean; baseRef?: string; defaultBranch?: string } = {}): NonNullable<FeedbackObservationInput['gh_runner']> {
  return args => {
    const json = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value) });
    if (args[0] === 'repo') return json({ id: 'R_widgets', nameWithOwner: 'acme/widgets' });
    if (args[0] === 'pr') return json({ number: 7, url: 'https://github.com/acme/widgets/pull/7', state: 'OPEN', isDraft: false,
      headRefOid: options.head ?? head, headRefName: 'work', baseRefOid: options.base ?? base, baseRefName: options.baseRef ?? 'main', body: '', reviewDecision: null, changedFiles: 0, mergeable: 'MERGEABLE' });
    if (args[1] === 'repos/acme/widgets') return json({ id: options.repositoryId ?? 42, node_id: 'R_widgets', full_name: 'acme/widgets', default_branch: options.defaultBranch ?? 'main' });
    const query = args.find(arg => arg.startsWith('query=')) ?? '';
    const pageInfo = { hasNextPage: false, endCursor: null };
    if (query.includes('checkSuites')) return json({ data: { node: { pullRequest: { commits: { nodes: [{ commit: { oid: head, checkSuites: { pageInfo, nodes: [] } } }] } } } } });
    if (query.includes('reviewThreads')) return json({ data: { node: { pullRequest: { reviewThreads: { pageInfo: { ...pageInfo, hasNextPage: options.truncated ?? false }, nodes: [{ id: 'THREAD_1', isResolved: false, updatedAt: '2026-10-25T00:00:00Z' }] } } } } });
    if (query.includes('reviews(first:100')) return json({ data: { node: { pullRequest: { reviews: { pageInfo, nodes: [] } } } } });
    return { status: 1, stdout: '', stderr: 'unexpected fixture request' };
  };
}
test('feedback observes selected provider identity and retains complete event facts', () => {
  const events = observeGitHubFeedback(subject, { repo_root: '.', gh_runner: provider() });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ publication_id: subject.publication_id, provider_event_id: 'THREAD_1', head_sha: head });
  expect(() => observeGitHubFeedback(subject, { repo_root: '.', gh_runner: provider({ repositoryId: 43 }) })).toThrow();
  expect(() => observeGitHubFeedback(subject, { repo_root: '.', gh_runner: provider({ head: 'c'.repeat(40) }) })).toThrow();
  expect(() => observeGitHubFeedback(subject, { repo_root: '.', gh_runner: provider({ base: 'c'.repeat(40) }) })).toThrow();
  expect(() => observeGitHubFeedback(subject, { repo_root: '.', gh_runner: provider({ truncated: true }) })).toThrow();
});
test('feedback accepts a PR into a default branch other than main and refuses other targets', () => {
  const trunk = observeGitHubFeedback(subject, { repo_root: '.', gh_runner: provider({ baseRef: 'trunk', defaultBranch: 'trunk' }) });
  expect(trunk.map(event => event.provider_event_id)).toEqual(['THREAD_1']);
  expect(() => observeGitHubFeedback(subject, { repo_root: '.', gh_runner: provider({ baseRef: 'main', defaultBranch: 'trunk' }) })).toThrow();
});
