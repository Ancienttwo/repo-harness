import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CIReportError, reportCI, renderReport, watchDailyCI, type GitHubAPI } from '../scripts/report-ci';

function fixture(run: (f: { api: GitHubAPI; git: (...args: string[]) => string; before: string; after: string; root: string; issues: any[]; setConclusion: (value: string) => void; denyIssues: () => void }) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'ci-report-fixture-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return (async () => {
    try {
      git('init', '-qb', 'main'); git('config', 'user.name', 'CI report fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      writeFileSync(join(root, 'feature.txt'), 'before\n'); git('add', '.'); git('commit', '-qm', 'base'); const before = git('rev-parse', 'HEAD');
      git('checkout', '-qb', 'candidate'); writeFileSync(join(root, 'feature.txt'), 'after\n'); git('add', '.'); git('commit', '-qm', 'candidate');
      git('checkout', '-q', 'main'); git('merge', '--squash', 'candidate'); git('commit', '-qm', 'squashed PR'); const after = git('rev-parse', 'HEAD');
      const now = new Date().toISOString(); const issues: any[] = []; let conclusion = 'success'; let denied = false;
      const api: GitHubAPI = async (path, method = 'GET', raw) => {
        const body = raw as any;
        if (path === '/repos/test/repo/actions/runs/12') return { id: 12, path: '.github/workflows/ci.yml', head_branch: 'main', head_sha: after,
          event: 'schedule', status: 'completed', conclusion, run_attempt: 1, html_url: 'https://github.com/test/repo/actions/runs/12', created_at: now };
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
        if (path.includes('/compare/')) return { status: 'identical' };
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
      await run({ api, git, root, before, after, issues, setConclusion: value => { conclusion = value; }, denyIssues: () => { denied = true; } });
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
