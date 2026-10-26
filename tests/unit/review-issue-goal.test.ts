import { initGitRepo } from '../helpers/repo-fixture';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { observeActiveReviewAdmission } from '../../src/effects/admission/issue-goal';
import { expect, test } from 'bun:test';
import { observeReviewIssueGoal } from '../../src/effects/admission/issue-goal';
import { parseExternalSourcesPolicy, requireManualGithubPolicy } from '../../src/effects/github/policy';
import type { GithubCommandRunner } from '../../src/effects/github/issues';

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

test('launch-time GH_HOST cannot redirect canonical goal command arguments', () => {
  const code = `
    const { observeReviewIssueGoal } = await import(${JSON.stringify(new URL('../../src/effects/admission/issue-goal.ts', import.meta.url).href)});
    const calls = [];
    const goal = observeReviewIssueGoal({ policy: ${JSON.stringify(policy)}, repository_id: '101', issue_id: '201', runner: (args) => {
      calls.push(args);
      const hostAt = args.indexOf('--hostname');
      const host = hostAt < 0 ? process.env.GH_HOST : args[hostAt + 1];
      return { stdout: JSON.stringify(args[3].endsWith('/issues/7')
        ? { ...${JSON.stringify(issue)}, html_url: 'https://' + host + '/acme/widgets/issues/7', body: host === 'github.com' ? 'Approved GitHub goal' : 'Hostile same-id goal' }
        : { id: 101, full_name: 'acme/widgets', html_url: 'https://' + host + '/acme/widgets' }) };
    } });
    console.log(JSON.stringify({ goal, calls }));
  `;
  const child = Bun.spawnSync([process.execPath, '-e', code], {
    env: { ...process.env, GH_HOST: 'hostile.example.test' }, stdout: 'pipe', stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  const observed = JSON.parse(child.stdout.toString());
  expect(JSON.parse(observed.goal.content).body).toBe('Approved GitHub goal');
  expect(observed.calls).toHaveLength(2);
  for (const args of observed.calls) {
    expect(args.filter((arg: string) => arg === '--hostname')).toHaveLength(1);
    expect(args[args.indexOf('--hostname') + 1]).toBe('github.com');
  }
});


test.each(['labels', 'issue_numbers'] as const)('approved locator works through the shared observer with %s discovery', kind => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'review-locator-root-')));
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'review-locator-home-')));
  try {
    initGitRepo(root);
    const fixture = seedReviewAdmissionFixture(root, home);
    const originalPolicy = requireManualGithubPolicy(fixture.policy);
    const broad = parseExternalSourcesPolicy({ version: fixture.policy.version, mode: fixture.policy.mode, github: { ...originalPolicy.github, limits: { ...originalPolicy.github.limits, max_issues: 10 },
      selection: kind === 'labels' ? { kind: 'labels', labels_all: ['ready'], assignees_any: [] }
        : { kind: 'issue_numbers', issue_numbers: [902, 903] } } });
    const calls: string[][] = [];
    const source = { ...fixture.source, issuePolicy: broad, runner: (args: readonly string[], options: any) => {
      calls.push([...args]); return fixture.source.runner!(args, options);
    } };
    expect(observeActiveReviewAdmission(source).admission.admission_sha256).toBe(fixture.admission.admission_sha256);
    expect(calls.filter(args => args.includes('repos/acme/widgets/issues/903'))).toHaveLength(2);
    expect(requireManualGithubPolicy(broad).github.selection.kind).toBe(kind);
    expect(() => observeActiveReviewAdmission({ ...source, expectedGrantSha256: `sha256:${'0'.repeat(64)}` })).toThrow();
    expect(() => observeActiveReviewAdmission({ ...source, runner: (args: readonly string[]) => ({ stdout: JSON.stringify(
      args.includes('repos/acme/widgets/issues/903') ? { ...fixture.issue, id: 'OTHER' }
        : { id: fixture.admission.repository_id, full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }) }) })).toThrow('review_goal_identity_changed');
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); }
});
