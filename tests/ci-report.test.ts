import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CIReportError, reportCI, renderReport, watchDailyCI, type GitHubAPI } from '../scripts/report-ci';

function fixture(run: (f: { api: GitHubAPI; git: (...args: string[]) => string; before: string; after: string; root: string; issues: any[]; setConclusion: (value: string) => void; setRun: (id: number, attempt: number) => void; denyIssues: () => void }) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'ci-report-fixture-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return (async () => {
    try {
      git('init', '-qb', 'main'); git('config', 'user.name', 'CI report fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      writeFileSync(join(root, 'feature.txt'), 'before\n'); git('add', '.'); git('commit', '-qm', 'base'); const before = git('rev-parse', 'HEAD');
      git('checkout', '-qb', 'candidate'); writeFileSync(join(root, 'feature.txt'), 'after\n'); git('add', '.'); git('commit', '-qm', 'candidate');
      git('checkout', '-q', 'main'); git('merge', '--squash', 'candidate'); git('commit', '-qm', 'squashed PR'); const after = git('rev-parse', 'HEAD');
      const now = new Date().toISOString(); const issues: any[] = []; let conclusion = 'success'; let denied = false; let runId = 12; let runAttempt = 1;
      const api: GitHubAPI = async (path, method = 'GET', raw) => {
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
        if (path.includes('/pulls?')) return [{ number: 7, merged_at: now, merge_commit_sha: after, base: { ref: 'main' } }];
        if (path.endsWith(`/git/commits/${after}`)) return { sha: after, parents: [{ sha: before }] };
        if (path.includes('/compare/')) {
          const [base, head] = path.split('/compare/')[1]!.split('...');
          return { status: base === head ? 'identical' : spawnSync('git', ['merge-base', '--is-ancestor', base!, head!], { cwd: root }).status === 0 ? 'ahead' : 'diverged' };
        }
        if (path.includes('/git/ref/tags/')) {
          const name = path.split('/git/ref/tags/')[1]!;
          if (spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${name}`], { cwd: root }).status !== 0) throw new CIReportError(404, 'Not found');
          return { object: { type: git('cat-file', '-t', `refs/tags/${name}`), sha: git('rev-parse', `refs/tags/${name}`) } };
        }
        if (path.endsWith('/git/tags') && method === 'POST') {
          const payload = `object ${body.object}\ntype ${body.type}\ntag ${body.tag}\ntagger CI fixture <ci@example.invalid> 1790980000 +0000\n\n${body.message}\n`;
          const sha = execFileSync('git', ['hash-object', '-t', 'tag', '-w', '--stdin'], { cwd: root, encoding: 'utf8', input: payload }).trim();
          return { sha };
        }
        if (path.includes('/git/tags/')) {
          const sha = path.split('/').at(-1)!; const payload = git('cat-file', '-p', sha);
          return { tag: payload.split('\n').find(line => line.startsWith('tag '))!.slice(4), object: { type: 'commit', sha: payload.split('\n')[0]!.slice(7) } };
        }
        if (path.endsWith('/git/refs') && method === 'POST') { git('update-ref', body.ref, body.sha); return { ref: body.ref }; }
        throw Error(`Unexpected API operation ${method} ${path}`);
      };
      await run({ api, git, root, before, after, issues, setConclusion: value => { conclusion = value; }, setRun: (id, attempt) => { runId = id; runAttempt = attempt; }, denyIssues: () => { denied = true; } });
    } finally { rmSync(root, { recursive: true, force: true }); }
  })();
}

test('daily report creates exact annotated squash boundaries once; one revert restores the actual tree', () => fixture(async f => {
  const first = await reportCI('test/repo', 12, f.api);
  expect(first.errors).toEqual([]); expect(first.merges).toHaveLength(1);
  expect(first.merges[0]).toMatchObject({ before: f.before, after: f.after, rollback: 'git revert --no-edit gate-cutover-pr-7-after' });
  const tagObject = f.git('rev-parse', 'refs/tags/gate-cutover-pr-7-after');
  const second = await reportCI('test/repo', 12, f.api);
  expect(second.merges).toEqual(first.merges); expect(f.git('rev-parse', 'refs/tags/gate-cutover-pr-7-after')).toBe(tagObject);
  expect(renderReport(first)).toContain('git revert --no-edit gate-cutover-pr-7-after');
  f.git('revert', '--no-edit', 'gate-cutover-pr-7-after');
  expect(f.git('rev-parse', 'HEAD^{tree}')).toBe(f.git('rev-parse', `${f.before}^{tree}`));
}));

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

test('dispatch permission refusal stays pending; tag conflicts never overwrite or repeat merge', () => fixture(async f => {
  f.setConclusion('failure'); f.denyIssues();
  f.git('tag', '-a', 'gate-cutover-pr-7-after', f.before, '-m', 'conflicting existing tag');
  const originalTag = f.git('rev-parse', 'refs/tags/gate-cutover-pr-7-after');
  const report = await reportCI('test/repo', 12, f.api);
  expect(report.repairs.every(repair => repair.delivery === 'pending' && repair.issue_url === null)).toBe(true);
  expect(report.errors.join('\n')).toContain('Tag conflict');
  expect(f.git('rev-parse', 'refs/tags/gate-cutover-pr-7-after')).toBe(originalTag);
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

test('malformed provider JSON run is rejected before any issue or tag effect', async () => {
  let writes = 0;
  const api: GitHubAPI = async (_path, method = 'GET') => { if (method === 'POST') writes++; return ['not a run object']; };
  await expect(reportCI('test/repo', 12, api)).rejects.toThrow('CI run must be a JSON object');
  expect(writes).toBe(0);
});

test('tag repair uses one open PR issue across new main commits, run IDs and attempts', () => fixture(async f => {
  f.git('tag', '-a', 'gate-cutover-pr-7-before', f.after, '-m', 'conflicting boundary');
  const originalTag = f.git('rev-parse', 'refs/tags/gate-cutover-pr-7-before');
  const first = await reportCI('test/repo', 12, f.api);
  expect(first.repairs).toEqual([{ key: 'ci-repair:tags-pr-7', issue_url: 'https://github.com/test/repo/issues/1', delivery: 'created' }]);
  expect(first.errors.join('\n')).toContain('Tag conflict: gate-cutover-pr-7-before');
  expect(f.issues[0].body).toContain('<!-- ci-repair:tags-pr-7 -->');
  writeFileSync(join(f.root, 'feature.txt'), 'next main snapshot\n'); f.git('add', '.'); f.git('commit', '-qm', 'next main');
  const main = f.git('rev-parse', 'main');
  f.setRun(13, 2);
  const second = await reportCI('test/repo', 13, f.api);
  expect(second.sha).toBe(main); expect(second.run_attempt).toBe(2);
  expect(second.repairs).toEqual([{ key: 'ci-repair:tags-pr-7', issue_url: first.repairs[0]!.issue_url, delivery: 'reused' }]);
  expect(second.errors.join('\n')).toContain('Tag conflict: gate-cutover-pr-7-before');
  expect(second.merges).toEqual([]); expect(f.issues).toHaveLength(1);
  expect(JSON.parse(readFileSync(join(f.root, 'repair-issues.json'), 'utf8'))).toHaveLength(1);
  expect(f.git('rev-parse', 'refs/tags/gate-cutover-pr-7-before')).toBe(originalTag);
  expect(f.git('rev-parse', 'main')).toBe(main);
}));

test.each(['<!-- ci-repair:91:3:tags-pr-7 -->', '<!-- ci-repair:tags-pr-7 -->'])('tag repair reuses an existing open issue with marker %s', marker => fixture(async f => {
  f.git('tag', '-a', 'gate-cutover-pr-7-before', f.after, '-m', 'conflicting boundary');
  f.issues.push(
    { number: 1, state: 'open', pull_request: { url: 'https://github.com/test/repo/pulls/1' }, body: marker, html_url: 'https://github.com/test/repo/pull/1' },
    { number: 2, state: 'closed', body: marker, html_url: 'https://github.com/test/repo/issues/2' },
    { number: 3, state: 'open', body: '<!-- ci-repair:91:3:tags-pr-70 -->', html_url: 'https://github.com/test/repo/issues/3' },
    { number: 4, state: 'open', body: marker, html_url: 'https://github.com/test/repo/issues/4' },
  );
  const report = await reportCI('test/repo', 12, f.api);
  expect(report.repairs).toEqual([{ key: 'ci-repair:tags-pr-7', issue_url: 'https://github.com/test/repo/issues/4', delivery: 'reused' }]);
  expect(f.issues).toHaveLength(4); expect(report.errors.join('\n')).toContain('Tag conflict');
}));

test('a closed PR repair cannot hide a new tag recovery failure', () => fixture(async f => {
  f.git('tag', '-a', 'gate-cutover-pr-7-before', f.after, '-m', 'conflicting boundary');
  const first = await reportCI('test/repo', 12, f.api);
  f.issues[0].state = 'closed';
  f.setRun(13, 2);
  const second = await reportCI('test/repo', 13, f.api);
  expect(first.repairs[0]?.delivery).toBe('created');
  expect(second.repairs).toEqual([{ key: 'ci-repair:tags-pr-7', issue_url: 'https://github.com/test/repo/issues/2', delivery: 'created' }]);
  expect(second.unresolved_repairs?.map(issue => issue.issue_number)).toEqual([2]);
  expect(f.issues).toHaveLength(2); expect(second.errors.join('\n')).toContain('Tag conflict');
}));

test.each([
  { response: JSON.stringify({ message: 'Resource not accessible by integration\nfixture-secret-token ghp_othercredential Bearer another-token', token: 'must-not-be-recorded' }), reason: 'Resource not accessible by integration' },
  { response: 'upstream returned non-JSON fixture-secret-token', reason: '' },
  { response: JSON.stringify({ message: { token: 'fixture-secret-token' } }), reason: '' },
])('real CLI keeps HTTP refusal status and only a redacted provider message: %j', ({ response, reason }) => fixture(async f => {
  const eventPath = join(f.root, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ workflow_run: { id: 12 } }));
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const path = new URL(request.url).pathname + new URL(request.url).search;
    if (request.method === 'POST' && path.endsWith('/git/refs')) return new Response(response, { status: 403, headers: { 'Content-Type': 'application/json', 'X-Fake-Secret': 'header-secret' } });
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
    expect(report.errors[0]).toContain('GitHub POST /repos/test/repo/git/refs: HTTP 403');
    if (reason) expect(report.errors[0]).toContain(reason);
    expect(report.merges).toEqual([]); expect(report.repairs[0].delivery).toBe('created');
    const output = json + readFileSync(join(f.root, '.ci-report/report.md'), 'utf8') + readFileSync(join(f.root, 'summary.md'), 'utf8') + stdout + stderr;
    for (const secret of ['fixture-secret-token', 'ghp_othercredential', 'another-token', 'must-not-be-recorded', 'header-secret']) expect(output).not.toContain(secret);
    expect(f.git('rev-parse', 'main')).toBe(f.after);
    expect(spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/tags/gate-cutover-pr-7-before'], { cwd: f.root }).status).not.toBe(0);
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
