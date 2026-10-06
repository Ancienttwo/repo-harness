import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CIReportError, reportCI, renderReport, watchDailyCI, type GitHubAPI } from '../scripts/report-ci';

function fixture(run: (f: { api: GitHubAPI; git: (...args: string[]) => string; before: string; after: string; prCommits: number; root: string; issues: any[]; calls: { path: string; method: string }[]; setConclusion: (value: string) => void; setRun: (id: number, attempt: number) => void; denyIssues: () => void }) => Promise<void>, candidateCommits = 1) {
  const root = mkdtempSync(join(tmpdir(), 'ci-report-fixture-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return (async () => {
    try {
      git('init', '-qb', 'main'); git('config', 'user.name', 'CI report fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      writeFileSync(join(root, 'feature.txt'), 'before\n'); git('add', '.'); git('commit', '-qm', 'base'); const before = git('rev-parse', 'HEAD');
      git('checkout', '-qb', 'candidate'); writeFileSync(join(root, 'feature.txt'), 'after\n'); git('add', '.'); git('commit', '-qm', 'candidate');
      for (let i = 1; i < candidateCommits; i++) {
        writeFileSync(join(root, `candidate-${i}.txt`), `change ${i}\n`); git('add', '.'); git('commit', '-qm', `candidate change ${i}`);
      }
      const prCommits = Number(git('rev-list', '--count', `${before}..candidate`));
      git('checkout', '-q', 'main'); git('merge', '--squash', 'candidate'); git('commit', '-qm', 'squashed PR'); const after = git('rev-parse', 'HEAD');
      const now = new Date().toISOString(); const issues: any[] = []; const calls: { path: string; method: string }[] = []; let conclusion = 'success'; let denied = false; let runId = 12; let runAttempt = 1;
      const api: GitHubAPI = async (path, method = 'GET', raw) => {
        calls.push({ path, method });
        const body = raw as any;
        if (path === `/repos/test/repo/actions/runs/${runId}`) return { id: runId, path: '.github/workflows/ci.yml', head_branch: 'main', head_sha: git('rev-parse', 'main'),
          event: 'schedule', status: 'completed', conclusion, run_attempt: runAttempt, html_url: `https://github.com/test/repo/actions/runs/${runId}`, created_at: now };
        if (path.includes('/attempts/1/jobs')) return { jobs: [{ id: 44, name: 'Daily test', conclusion, check_run_url: 'https://api.github.com/repos/test/repo/check-runs/55' }] };
        if (path.endsWith('/check-runs/55')) return { id: 55, html_url: 'https://github.com/test/repo/runs/55' };
        if (path.includes('/issues?')) return issues;
        if (path.endsWith('/issues') && method === 'POST') {
          if (denied) throw new CIReportError(403, 'HTTP 403');
          const issue = { ...body, state: 'open', number: issues.length + 1, html_url: `https://github.com/test/repo/issues/${issues.length + 1}` };
          issues.push(issue); writeFileSync(join(root, 'repair-issues.json'), JSON.stringify(issues)); return issue;
        }
        if (path.startsWith('/repos/test/repo/pulls?')) return [{ number: 7, merged_at: now, merge_commit_sha: after, base: { ref: 'main' } }];
        if (path.endsWith('/pulls/7')) return { number: 7, merged: true, merge_commit_sha: after, base: { ref: 'main' }, commits: prCommits };
        if (path === `/repos/test/repo/commits/${before}/pulls?per_page=100`) return [];
        if (path.endsWith(`/git/commits/${after}`)) return { sha: after, parents: [{ sha: before }] };
        if (path.includes('/compare/')) {
          const [base, head] = path.split('/compare/')[1]!.split('...');
          return { status: base === head ? 'identical' : spawnSync('git', ['merge-base', '--is-ancestor', base!, head!], { cwd: root }).status === 0 ? 'ahead' : 'diverged' };
        }
        throw Error(`Unexpected API operation ${method} ${path}`);
      };
      await run({ api, git, root, before, after, prCommits, issues, calls, setConclusion: value => { conclusion = value; }, setRun: (id, attempt) => { runId = id; runAttempt = attempt; }, denyIssues: () => { denied = true; } });
    } finally { rmSync(root, { recursive: true, force: true }); }
  })();
}

test('daily report reads exact squash boundaries without ref writes; its SHA revert restores the actual tree', () => fixture(async f => {
  const refs = f.git('show-ref');
  const first = await reportCI('test/repo', 12, f.api);
  expect(first.errors).toEqual([]); expect(first.merges).toEqual([{ pr: 7, before: f.before, after: f.after, rollback: `git revert --no-edit ${f.after}` }]);
  const second = await reportCI('test/repo', 12, f.api);
  expect(second).toEqual(first); expect(f.git('show-ref')).toBe(refs);
  expect(f.calls.some(call => /\/git\/(?:tags|refs?)(?:\/|$)/.test(call.path))).toBe(false);
  expect(f.calls.some(call => call.method !== 'GET')).toBe(false);
  expect(renderReport(first)).toContain(`git revert --no-edit ${f.after}`);
  f.git(...first.merges[0]!.rollback.split(' ').slice(1));
  expect(f.git('rev-parse', 'HEAD^{tree}')).toBe(f.git('rev-parse', `${f.before}^{tree}`));
}));

test('multi-commit squash accepts one main boundary and its reported revert restores the pre-merge tree', () => fixture(async f => {
  const refs = f.git('show-ref');
  const report = await reportCI('test/repo', 12, f.api);
  expect(f.prCommits).toBe(2);
  expect(f.git('rev-list', '--count', `${f.before}..${f.after}`)).toBe('1');
  expect(report.errors).toEqual([]); expect(report.repairs).toEqual([]);
  expect(report.merges).toEqual([{ pr: 7, before: f.before, after: f.after, rollback: `git revert --no-edit ${f.after}` }]);
  expect(f.git('show-ref')).toBe(refs); expect(f.calls.every(call => call.method === 'GET')).toBe(true);
  f.git(...report.merges[0]!.rollback.split(' ').slice(1));
  expect(f.git('rev-parse', 'HEAD^{tree}')).toBe(f.git('rev-parse', `${f.before}^{tree}`));
}, 2));

test.each(['failure', 'cancelled', 'timed_out'])('completed %s run creates one readable run/check-bound repair task across retries', conclusion => fixture(async f => {
  f.setConclusion(conclusion);
  const first = await reportCI('test/repo', 12, f.api);
  expect(first.repairs).toEqual([{ key: 'ci-repair:12:1:check-55', issue_url: 'https://github.com/test/repo/issues/1', delivery: 'created' }]);
  const persisted = JSON.parse(readFileSync(join(f.root, 'repair-issues.json'), 'utf8'));
  expect(persisted).toHaveLength(1); expect(persisted[0].body).toContain(f.after);
  expect(first.unresolved_repairs?.map(issue => issue.issue_number)).toEqual([1]);
  const second = await reportCI('test/repo', 12, f.api);
  expect(second.repairs[0]?.delivery).toBe('reused'); expect(f.issues).toHaveLength(1);
}));

test('dispatch permission refusal stays pending and leaves the completed merge unchanged', () => fixture(async f => {
  f.setConclusion('failure'); f.denyIssues();
  const report = await reportCI('test/repo', 12, f.api);
  expect(report.repairs).toHaveLength(1);
  expect(report.repairs.every(repair => repair.delivery === 'pending' && repair.issue_url === null)).toBe(true);
  expect(report.errors.join('\n')).toContain('Repair dispatch pending: check-55: HTTP 403');
  expect(report.merges[0]?.after).toBe(f.after);
  expect(f.git('rev-parse', 'main')).toBe(f.after);
}));

test('untrusted PR or wrong workflow runs cannot dispatch privileged effects', async () => {
  let writes = 0;
  const api: GitHubAPI = async (_path, method = 'GET') => { if (method === 'POST') writes++; return { id: 12, path: '.github/workflows/untrusted.yml', head_branch: 'main' }; };
  await expect(reportCI('test/repo', 12, api)).rejects.toThrow('not a completed fixed-main');
  expect(writes).toBe(0);
});

test.each([{ runs: [] }, { runs: [{ id: 12, path: '.github/workflows/ci.yml', event: 'schedule', head_branch: 'main', created_at: '2026-10-03T19:00:00Z', status: 'in_progress' }] }])('daily watchdog creates/reuses one dated repair for no completion event: %j', async ({ runs }) => {
  const issues: any[] = [];
  const api: GitHubAPI = async (path, method = 'GET', body) => {
    if (path.includes('/actions/workflows/ci.yml/runs?')) return { workflow_runs: runs };
    if (path.includes('/issues?')) return issues;
    if (path.endsWith('/commits/main')) return { sha: 'a'.repeat(40) };
    if (path.endsWith('/issues') && method === 'POST') { const issue = { ...(body as any), number: 1, html_url: 'https://github.com/test/repo/issues/1' }; issues.push(issue); return issue; }
    throw Error(`Unexpected API request ${path}`);
  };
  const first = await watchDailyCI('test/repo', new Date('2026-10-03T23:30:00Z'), api, '0 19 * * *');
  expect(first.delivery).toBe('created'); expect(first.sha).toBe('a'.repeat(40));
  expect(first.observation).toBe(runs.length ? 'deadline-exceeded' : 'not-started');
  const late = await watchDailyCI('test/repo', new Date('2026-10-04T00:05:00Z'), api, '0 19 * * *');
  expect(late.delivery).toBe('reused'); expect(late.date).toBe('2026-10-03'); expect(issues).toHaveLength(1);
});

test.each([
  { now: '2026-10-03T23:30:00Z', created: '2026-10-03T21:00:00Z', date: '2026-10-03' },
  { now: '2026-10-06T03:09:34.720Z', created: '2026-10-06T00:41:50Z', date: '2026-10-05' },
])('daily watchdog observes a completed run across its UTC window: %j', async ({ now, created, date }) => {
  const run = { id: 37395342276, path: '.github/workflows/ci.yml', event: 'schedule', head_branch: 'main', created_at: created, status: 'completed', conclusion: 'failure' };
  let writes = 0;
  const api: GitHubAPI = async (path, method = 'GET', body) => {
    if (path.includes('/actions/workflows/ci.yml/runs?')) {
      // Match the provider's inclusive calendar-date filter, including one-day queries.
      const filter = new URL(path, 'https://api.github.com').searchParams.get('created')!;
      const [from, to = from] = filter.split('..');
      const day = run.created_at.slice(0, 10);
      return { workflow_runs: day >= from! && day <= to! ? [run] : [] };
    }
    if (path.includes('/issues?')) return [];
    if (path.endsWith('/commits/main')) return { sha: 'a'.repeat(40) };
    if (path.endsWith('/issues') && method === 'POST') { writes++; return { ...(body as object), number: 1, html_url: 'https://github.com/test/repo/issues/1' }; }
    throw Error(`Unexpected API request ${path}`);
  };
  const observed = await watchDailyCI('test/repo', new Date(now), api, '0 19 * * *');
  expect(observed).toEqual({ date, observation: 'completion-observed', run_ids: [run.id] });
  expect(writes).toBe(0);
});

test.each(['2026-10-05T18:59:59Z', '2026-10-06T03:09:35Z'])('daily watchdog does not count a run outside the exact window: %s', async created => {
  let writes = 0;
  const api: GitHubAPI = async (path, method = 'GET', body) => {
    if (path.includes('/actions/workflows/ci.yml/runs?')) return { workflow_runs: [{ id: 12, path: '.github/workflows/ci.yml', event: 'schedule', head_branch: 'main', created_at: created, status: 'completed' }] };
    if (path.includes('/issues?')) return [];
    if (path.endsWith('/commits/main')) return { sha: 'a'.repeat(40) };
    if (path.endsWith('/issues') && method === 'POST') { writes++; return { ...(body as object), number: 1, html_url: 'https://github.com/test/repo/issues/1' }; }
    throw Error(`Unexpected API request ${path}`);
  };
  const observed = await watchDailyCI('test/repo', new Date('2026-10-06T03:09:34.720Z'), api, '0 19 * * *');
  expect(observed.observation).toBe('not-started');
  expect(writes).toBe(1);
});

test('malformed provider JSON run is rejected before any issue effect', async () => {
  let writes = 0;
  const api: GitHubAPI = async (_path, method = 'GET') => { if (method === 'POST') writes++; return ['not a run object']; };
  await expect(reportCI('test/repo', 12, api)).rejects.toThrow('CI run must be a JSON object');
  expect(writes).toBe(0);
});

test.each([
  { name: 'malformed commit', commit: [] },
  { name: 'root commit', commit: { parents: [] } },
  { name: 'multiple parents', commit: { parents: [{ sha: 'a'.repeat(40) }, { sha: 'b'.repeat(40) }] } },
  { name: 'wrong commit SHA', commit: { sha: 'a'.repeat(40) } },
  { name: 'zero parent', commit: { parents: [{ sha: '0'.repeat(40) }] } },
  { name: 'malformed parent', commit: { parents: [null] } },
  { name: 'incomplete commit', commit: { parents: undefined } },
  { name: 'same parent', sameParent: true },
  { name: 'API failure', fail: true },
  { name: 'incomplete membership', membership: {} },
])('rollback boundary fails closed for $name', scenario => fixture(async f => {
  const refs = f.git('show-ref');
  const api: GitHubAPI = async (path, method, body) => {
    if (path.endsWith(`/git/commits/${f.after}`)) {
      if ('fail' in scenario) throw new CIReportError(503, 'HTTP 503');
      if ('sameParent' in scenario) return { sha: f.after, parents: [{ sha: f.after }] };
      if ('commit' in scenario) return Array.isArray(scenario.commit) ? scenario.commit : { sha: f.after, parents: [{ sha: f.before }], ...scenario.commit };
    }
    if (path.includes('/compare/') && 'membership' in scenario) return scenario.membership;
    return f.api(path, method, body);
  };
  const first = await reportCI('test/repo', 12, api);
  expect(first.merges).toEqual([]); expect(first.errors).toHaveLength(1);
  expect(first.repairs).toEqual([{ key: 'ci-repair:merge-pr-7', issue_url: 'https://github.com/test/repo/issues/1', delivery: 'created' }]);
  const second = await reportCI('test/repo', 12, api);
  expect(second.repairs[0]?.delivery).toBe('reused'); expect(f.issues).toHaveLength(1);
  expect(f.git('show-ref')).toBe(refs);
}));

test('multi-commit rebase fails closed because reverting its last commit leaves the first change', () => fixture(async f => {
  f.git('checkout', '-qb', 'rebase-pr', f.before);
  for (const file of ['first.txt', 'second.txt']) {
    writeFileSync(join(f.root, file), file); f.git('add', '.'); f.git('commit', '-qm', file);
  }
  f.git('rebase', 'main'); const after = f.git('rev-parse', 'HEAD');
  const count = Number(f.git('rev-list', '--count', `${f.after}..${after}`));
  const parent = f.git('rev-parse', 'HEAD^');
  f.git('checkout', '-q', 'main'); f.git('merge', '--ff-only', 'rebase-pr');
  const api: GitHubAPI = async (path, method, body) => {
    if (path.startsWith('/repos/test/repo/pulls?')) return (await f.api(path) as Record<string, unknown>[]).map(pr => ({ ...pr, merge_commit_sha: after }));
    if (path.endsWith('/pulls/7')) return { number: 7, merged: true, merge_commit_sha: after, base: { ref: 'main' }, commits: count };
    if (path.endsWith(`/git/commits/${after}`)) return { sha: after, parents: [{ sha: parent }] };
    if (path === `/repos/test/repo/commits/${parent}/pulls?per_page=100`) return [{ number: 7 }];
    return f.api(path, method, body);
  };
  const report = await reportCI('test/repo', 12, api);
  expect(count).toBe(2); expect(report.merges).toEqual([]);
  expect(report.errors.join('\n')).toContain('Automatic rollback cannot revert only the last commit of multi-commit rebase PR #7');
  expect(report.repairs[0]).toMatchObject({ key: 'ci-repair:merge-pr-7', delivery: 'created' });
  expect(f.git('rev-parse', 'main')).toBe(after);
  f.git('checkout', '-qb', 'incomplete-rollback'); f.git('revert', '--no-edit', after);
  expect(readFileSync(join(f.root, 'first.txt'), 'utf8')).toBe('first.txt');
  expect(f.git('rev-parse', 'HEAD^{tree}')).not.toBe(f.git('rev-parse', `${f.after}^{tree}`));
}));

test.each([
  { name: 'wrong PR', detail: { number: 8 } },
  { name: 'wrong merge SHA', detail: { merge_commit_sha: 'a'.repeat(40) } },
  { name: 'unmerged PR', detail: { merged: false } },
  { name: 'wrong base', detail: { base: { ref: 'feature' } } },
  { name: 'malformed detail', detail: null },
  { name: 'detail API failure', fail: true },
])('merged PR identity proof fails closed: $name', scenario => fixture(async f => {
  const report = await reportCI('test/repo', 12, async (path, method, body) => {
    if (path.endsWith('/pulls/7')) {
      if ('fail' in scenario) throw new CIReportError(503, 'HTTP 503');
      return scenario.detail === null ? null : { ...(await f.api(path) as object), ...scenario.detail };
    }
    return f.api(path, method, body);
  });
  expect(report.merges).toEqual([]); expect(report.errors).toHaveLength(1);
  expect(report.repairs[0]).toMatchObject({ key: 'ci-repair:merge-pr-7', delivery: 'created' });
}));

test.each([
  { name: 'non-array associations', response: {} },
  { name: 'malformed association', response: [null] },
  { name: 'missing PR number', response: [{}] },
  { name: 'unsafe PR number', response: [{ number: Number.MAX_SAFE_INTEGER + 1 }] },
  { name: 'full association page', response: Array.from({ length: 100 }, () => ({ number: 6 })) },
  { name: 'parent API failure', fail: true },
])('rollback parent PR observation fails closed: $name', scenario => fixture(async f => {
  const report = await reportCI('test/repo', 12, async (path, method, body) => {
    if (path === `/repos/test/repo/commits/${f.before}/pulls?per_page=100`) {
      if ('fail' in scenario) throw new CIReportError(503, 'HTTP 503');
      return scenario.response;
    }
    return f.api(path, method, body);
  });
  expect(report.merges).toEqual([]); expect(report.errors).toHaveLength(1);
  expect(report.repairs[0]).toMatchObject({ key: 'ci-repair:merge-pr-7', delivery: 'created' });
}));

test('a parent introduced by another PR keeps the squash boundary valid', () => fixture(async f => {
  const report = await reportCI('test/repo', 12, (path, method, body) =>
    path === `/repos/test/repo/commits/${f.before}/pulls?per_page=100` ? Promise.resolve([{ number: 6 }]) : f.api(path, method, body));
  expect(report.errors).toEqual([]);
  expect(report.merges[0]).toEqual({ pr: 7, before: f.before, after: f.after, rollback: `git revert --no-edit ${f.after}` });
}));

test.each(['behind', 'diverged'])('merge outside the fixed snapshot is excluded: %s', status => fixture(async f => {
  const report = await reportCI('test/repo', 12, (path, method, body) => path.includes('/compare/') ? Promise.resolve({ status }) : f.api(path, method, body));
  expect(report.merges).toEqual([]); expect(report.repairs).toEqual([]); expect(report.errors).toEqual([]);
}));

test('a later fixed main snapshot retains the provider merge and parent boundary', () => fixture(async f => {
  writeFileSync(join(f.root, 'feature.txt'), 'later main\n'); f.git('add', '.'); f.git('commit', '-qm', 'later main');
  const report = await reportCI('test/repo', 12, f.api);
  expect(report.sha).toBe(f.git('rev-parse', 'main'));
  expect(report.merges).toEqual([{ pr: 7, before: f.before, after: f.after, rollback: `git revert --no-edit ${f.after}` }]);
  expect(report.errors).toEqual([]);
}));

test.each([
  { name: 'incomplete PR page', response: {} },
  { name: 'missing merge SHA', response: [{ number: 7, merged_at: new Date().toISOString(), base: { ref: 'main' } }] },
  { name: 'unsafe PR number', response: [{ number: Number.MAX_SAFE_INTEGER + 1, merged_at: new Date().toISOString(), merge_commit_sha: 'a'.repeat(40), base: { ref: 'main' } }] },
  { name: 'fractional PR number', response: [{ number: 7.5, merged_at: new Date().toISOString(), merge_commit_sha: 'a'.repeat(40), base: { ref: 'main' } }] },
  { name: 'zero merge SHA', response: [{ number: 7, merged_at: new Date().toISOString(), merge_commit_sha: '0'.repeat(40), base: { ref: 'main' } }] },
])('incomplete provider merge observation fails closed: $name', ({ response }) => fixture(async f => {
  const report = await reportCI('test/repo', 12, (path, method, body) => path.startsWith('/repos/test/repo/pulls?') ? Promise.resolve(response) : f.api(path, method, body));
  expect(report.merges).toEqual([]); expect(report.errors).toHaveLength(1);
  expect(report.repairs[0]).toMatchObject({ key: 'ci-repair:12:1:report-12', delivery: 'created' });
}));

test('merge boundary repair reuses one open PR issue across new main SHAs, run IDs and attempts', () => fixture(async f => {
  f.issues.push(
    { number: 1, state: 'open', body: '<!-- ci-repair:91:3:tags-pr-7 -->', html_url: 'https://github.com/test/repo/issues/1' },
    { number: 2, state: 'open', body: '<!-- ci-repair:tags-pr-7 -->', html_url: 'https://github.com/test/repo/issues/2' },
    { number: 3, state: 'open', pull_request: {}, body: '<!-- ci-repair:merge-pr-7 -->', html_url: 'https://github.com/test/repo/pull/3' },
    { number: 4, state: 'closed', body: '<!-- ci-repair:merge-pr-7 -->', html_url: 'https://github.com/test/repo/issues/4' },
  );
  const api: GitHubAPI = (path, method, body) => path.includes('/git/commits/') ? Promise.reject(new CIReportError(503, 'HTTP 503')) : f.api(path, method, body);
  const first = await reportCI('test/repo', 12, api);
  expect(first.repairs[0]).toMatchObject({ key: 'ci-repair:merge-pr-7', delivery: 'created', issue_url: 'https://github.com/test/repo/issues/5' });
  expect((await reportCI('test/repo', 12, api)).repairs[0]?.delivery).toBe('reused');
  f.issues[4].state = 'closed';
  expect((await reportCI('test/repo', 12, api)).repairs[0]?.delivery).toBe('created');
  writeFileSync(join(f.root, 'later.txt'), 'later main\n'); f.git('add', '.'); f.git('commit', '-qm', 'later main');
  f.setRun(13, 2);
  const next = await reportCI('test/repo', 13, api);
  expect(next.sha).not.toBe(first.sha);
  expect(next.run_id).toBe(13); expect(next.run_attempt).toBe(2);
  expect(next.repairs[0]).toEqual({ key: 'ci-repair:merge-pr-7', delivery: 'reused', issue_url: 'https://github.com/test/repo/issues/6' });
  expect(f.issues).toHaveLength(6);
}));

test('concurrent reports for one merged PR elect one open shared repair issue', async () => {
  const now = new Date().toISOString();
  const after = 'b'.repeat(40);
  const issues: any[] = [];
  let lists = 0;
  let releaseSecond = () => {};
  const bothListed = new Promise<void>(resolve => { releaseSecond = resolve; });
  const api: GitHubAPI = async (path, method = 'GET', raw) => {
    const body = raw as any;
    if (/^\/repos\/test\/repo\/actions\/runs\/\d+$/.test(path)) {
      const id = Number(path.split('/').pop());
      return { id, path: '.github/workflows/ci.yml', head_branch: 'main', head_sha: 'a'.repeat(40), event: 'schedule', status: 'completed', conclusion: 'success', run_attempt: 1, html_url: `https://github.com/test/repo/actions/runs/${id}`, created_at: now };
    }
    // Deterministic barrier: both reports read the same empty issue snapshot
    // before either creation becomes visible, then creation runs for real.
    if (path.startsWith('/repos/test/repo/issues?state=all')) {
      lists++;
      if (lists <= 2) { if (lists === 2) releaseSecond(); await bothListed; return []; }
      return issues;
    }
    if (path.startsWith('/repos/test/repo/issues?state=open')) return issues.filter(issue => issue.state === 'open');
    if (path === '/repos/test/repo/issues' && method === 'POST') {
      const issue = { ...body, state: 'open', number: issues.length + 1, html_url: `https://github.com/test/repo/issues/${issues.length + 1}` };
      issues.push(issue);
      return issue;
    }
    if (path.startsWith('/repos/test/repo/issues/') && method === 'PATCH') {
      const issue = issues.find(candidate => candidate.number === Number(path.split('/').pop()));
      if (!issue) throw new Error(`Unexpected close of missing issue ${path}`);
      issue.state = body.state ?? issue.state;
      return issue;
    }
    if (path.startsWith('/repos/test/repo/pulls?')) return [{ number: 7, merged_at: now, merge_commit_sha: after, base: { ref: 'main' } }];
    if (/^\/repos\/test\/repo\/git\/commits\//.test(path)) throw new CIReportError(503, 'HTTP 503');
    throw Error(`Unexpected API operation ${method} ${path}`);
  };
  const reports = await Promise.all([reportCI('test/repo', 12, api), reportCI('test/repo', 13, api)]);
  const repairs = reports.map(report => report.repairs[0]!);
  expect(repairs.map(repair => repair.key)).toEqual(['ci-repair:merge-pr-7', 'ci-repair:merge-pr-7']);
  expect([...repairs.map(repair => repair.delivery)].sort()).toEqual(['created', 'reused']);
  const winner = repairs.find(repair => repair.delivery === 'created')!;
  expect(repairs.find(repair => repair.delivery === 'reused')!.issue_url).toBe(winner.issue_url);
  expect(issues).toHaveLength(2);
  expect(issues.every(issue => typeof issue.body === 'string' && issue.body.includes('<!-- ci-repair:merge-pr-7 -->'))).toBe(true);
  const open = issues.filter(issue => issue.state === 'open');
  expect(open).toHaveLength(1);
  expect(open[0]!.html_url).toBe(winner.issue_url);
  expect(issues.find(issue => issue.state === 'closed')!.number).toBeGreaterThan(open[0]!.number);
  const next = await reportCI('test/repo', 14, api);
  expect(next.repairs[0]).toMatchObject({ key: 'ci-repair:merge-pr-7', delivery: 'reused', issue_url: winner.issue_url });
  expect(issues).toHaveLength(2);
  expect(issues.filter(issue => issue.state === 'open')).toHaveLength(1);
});

test.each([
  { response: JSON.stringify({ message: 'Resource not accessible by integration\nfixture-secret-token ghp_othercredential Bearer another-token', token: 'must-not-be-recorded' }), reason: 'Resource not accessible by integration' },
  { response: 'upstream returned non-JSON fixture-secret-token', reason: '' },
  { response: JSON.stringify({ message: { token: 'fixture-secret-token' } }), reason: '' },
])('real CLI keeps HTTP refusal status and only a redacted provider message: %j', ({ response, reason }) => fixture(async f => {
  const eventPath = join(f.root, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ workflow_run: { id: 12 } }));
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const path = new URL(request.url).pathname + new URL(request.url).search;
    if (request.method === 'GET' && path.endsWith(`/git/commits/${f.after}`)) return new Response(response, { status: 403, headers: { 'Content-Type': 'application/json', 'X-Fake-Secret': 'header-secret' } });
    try {
      const result = await f.api(path, request.method as 'GET' | 'POST', request.method === 'POST' ? await request.json() : undefined);
      return Response.json(result);
    } catch (error) {
      if (error instanceof CIReportError) return Response.json({ message: error.message }, { status: error.status });
      return Response.json({ message: String(error) }, { status: 500 });
    }
  } });
  try {
    const child = Bun.spawn([process.execPath, join(import.meta.dir, '../scripts/report-ci.ts')], {
      cwd: f.root, env: { ...process.env, HOME: f.root, GH_TOKEN: 'fixture-secret-token', GITHUB_REPOSITORY: 'test/repo', GITHUB_API_URL: server.url.origin,
        GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: join(f.root, 'summary.md') }, stdout: 'pipe', stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 1, stdout: '', stderr: '' });
    const json = readFileSync(join(f.root, '.ci-report/report.json'), 'utf8');
    const report = JSON.parse(json);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain(`GitHub GET /repos/test/repo/git/commits/${f.after}: HTTP 403`);
    if (reason) expect(report.errors[0]).toContain(reason);
    expect(report.merges).toEqual([]); expect(report.repairs[0].delivery).toBe('created');
    const output = json + readFileSync(join(f.root, '.ci-report/report.md'), 'utf8') + readFileSync(join(f.root, 'summary.md'), 'utf8') + stdout + stderr;
    for (const secret of ['fixture-secret-token', 'ghp_othercredential', 'another-token', 'must-not-be-recorded', 'header-secret']) expect(output).not.toContain(secret);
    expect(f.git('rev-parse', 'main')).toBe(f.after);
    expect(f.git('tag', '--list')).toBe('');
  } finally { server.stop(true); }
}));

test('report and watchdog uploads include the real hidden report directory', () => {
  const workflow = Bun.YAML.parse(readFileSync(join(import.meta.dir, '../.github/workflows/ci-report.yml'), 'utf8')) as any;
  for (const name of ['report', 'watchdog']) {
    const uploads = workflow.jobs[name].steps.filter((step: any) => step.uses === 'actions/upload-artifact@v4');
    expect(uploads).toHaveLength(1);
    expect(uploads[0].if).toBe('always()');
    expect(uploads[0].with.path).toBe('.ci-report/');
    expect(uploads[0].with['include-hidden-files']).toBe(true);
    expect(uploads[0].with['if-no-files-found']).toBe('error');
  }
});
