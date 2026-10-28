import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runDevActivityProcess,
  DEV_ACTIVITY_SUBPROCESS_TIMEOUT_MS,
  collectDevActivity,
  startDevActivityCollector,
  devActivityGhPrListArgv,
  devActivityGhPrDayArgvs,
  DEV_ACTIVITY_GH_PR_LIMIT,
  DEV_ACTIVITY_GH_REPO_VIEW_ARGV,
  parseGhPullRequests,
  type DevActivityProcessRunner,
} from '../../src/effects/dev-activity/collector';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const DAY = 24 * 60 * 60 * 1000;

interface Fixture {
  readonly root: string;
  readonly env: NodeJS.ProcessEnv;
  readonly argvLog: string;
  readonly repos: Record<string, string>;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A fake `gh` on PATH. Behaviour is selected by marker files in the repository's .git directory. */
function fakeGh(bin: string, argvLog: string): void {
  const script = `#!/bin/bash
printf '%s\\n' "$*" >> ${JSON.stringify(argvLog)}
state="$PWD/.git"
if [ -f "$state/gh-fail" ]; then echo "fatal: secret $PWD" >&2; exit 1; fi
if [ -f "$state/gh-sleep" ]; then trap 'touch "$state/gh-terminated"; exit 143' TERM; sleep 30 & wait $!; fi
case "$1 $2" in
  "repo view") echo '{"nameWithOwner":"acme/widgets","defaultBranchRef":{"name":"main"}}' ;;
  "pr list")
    while [ $# -gt 0 ]; do if [ "$1" = "--state" ]; then pr_state="$2"; fi; if [ "$1" = "--search" ]; then pr_search="$2"; fi; shift; done
    # A one-day search (merged:2026-10-09) reads gh-prs-<state>-<date>.json; a window search reads gh-prs-<state>.json.
    pr_file="gh-prs-$pr_state"
    pr_day="\${pr_search#*:}"; pr_day="\${pr_day%% *}"
    case "$pr_day" in 20*) pr_file="$pr_file-$pr_day" ;; esac
    if [ -f "$state/$pr_file.json" ]; then cat "$state/$pr_file.json"; else echo '[]'; fi ;;
  *) exit 2 ;;
esac
`;
  writeFileSync(join(bin, 'gh'), script);
  chmodSync(join(bin, 'gh'), 0o755);
}

function makeRepo(root: string, name: string): string {
  const path = join(root, name);
  mkdirSync(path);
  git(path, 'init', '-q', '-b', 'main');
  writeFileSync(join(path, 'README.md'), 'hello\n');
  git(path, 'add', '.');
  git(path, 'commit', '-qm', 'base');
  git(path, 'remote', 'add', 'origin', 'https://github.com/acme/widgets.git');
  git(path, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(path, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  return realpathSync(path);
}

function fixture(names: readonly string[], missing = 1): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-activity-')));
  const home = join(root, 'harness-home');
  const bin = join(root, 'bin');
  mkdirSync(home);
  mkdirSync(bin);
  const argvLog = join(root, 'gh-argv.log');
  fakeGh(bin, argvLog);
  const repos: Record<string, string> = {};
  for (const name of names) repos[name] = makeRepo(root, name);
  const paths = [...Object.values(repos), ...Array.from({ length: missing }, (_, index) => join(root, `gone-${index}`))];
  const now = '2026-10-10T00:00:00.000Z';
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: paths.map(path => ({
    id: repoHarnessRepoIdFor(path), path, accessMode: 'read_only', source: 'manual', registeredAt: now, lastSeenAt: now,
  })) }));
  const env = {
    ...process.env,
    REPO_HARNESS_HOME: home,
    PATH: `${bin}:${process.env.PATH}`,
  };
  return { root, env, argvLog, repos };
}

function prJson(head: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 7, title: 'Add widgets', state: 'OPEN', isDraft: false, headRefName: head, baseRefName: 'main',
    url: 'https://github.com/acme/widgets/pull/7', createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
    updatedAt: new Date(Date.now() - DAY).toISOString(), mergedAt: null, closedAt: null, mergeStateStatus: 'CLEAN',
    reviewDecision: 'APPROVED', statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    headRefOid: 'c'.repeat(40), changedFiles: 1, files: [{ path: 'src/widgets.ts', additions: 3, deletions: 1 }],
    ...overrides,
  };
}

describe('dev activity collector on real repositories', () => {
  test('collects worktrees and PRs, isolates one failing gh repository, and leaks no paths', async () => {
    const f = fixture(['alpha', 'beta']);
    try {
      const alpha = f.repos.alpha!;
      const beta = f.repos.beta!;
      const worktree = join(f.root, 'alpha-feat-a');
      git(alpha, 'worktree', 'add', '-q', '-b', 'feat/a', worktree);
      writeFileSync(join(worktree, 'dirty.txt'), 'x');
      writeFileSync(join(alpha, '.git', 'gh-prs-open.json'), JSON.stringify([prJson('feat/a'), prJson('main', { number: 8, url: 'https://github.com/acme/widgets/pull/8' })]));
      const merged = new Date(Date.now() - DAY).toISOString();
      const { statusCheckRollup: _ci, ...closedFields } = prJson('feat/shipped', { number: 9, url: 'https://github.com/acme/widgets/pull/9', state: 'MERGED', mergedAt: merged, closedAt: merged });
      writeFileSync(join(alpha, '.git', 'gh-prs-merged.json'), JSON.stringify([closedFields]));
      git(beta, 'worktree', 'add', '-q', '-b', 'feat/b', join(f.root, 'beta-feat-b'));
      writeFileSync(join(beta, '.git', 'gh-fail'), '');

      const nowMs = Date.now();
      const snapshot = decodeDevActivitySnapshot(await collectDevActivity({ env: f.env, now: () => nowMs }));
      expect(snapshot.status).toBe('partial');
      expect(snapshot.unreadable_registrations).toBe(1);
      const alphaRepo = snapshot.repositories.find(repo => repo.display_name === 'alpha')!;
      const betaRepo = snapshot.repositories.find(repo => repo.display_name === 'beta')!;
      expect(alphaRepo).toMatchObject({ github: 'acme/widgets', default_branch: 'main' });
      expect(alphaRepo.sources.map(source => [source.kind, source.status, source.reason])).toEqual([
        ['git', 'ok', null], ['github', 'ok', null], ['runtime', 'not_configured', 'runtime_not_configured'],
      ]);
      expect(betaRepo.sources.find(source => source.kind === 'github')).toMatchObject({ status: 'unavailable', reason: 'gh_failed' });
      expect(betaRepo).toMatchObject({ github: null, default_branch: 'main' });

      const featA = snapshot.items.find(item => item.repository_id === alphaRepo.repository_id && item.branch === 'feat/a')!;
      expect(featA).toMatchObject({ column: 'ready_to_merge', title: 'Add widgets',
        worktrees: [{ directory: 'alpha-feat-a', dirty: true, ahead: null, behind: null }],
        pull_request: { number: 7, ci: 'success', review: 'approved', merge_state: 'CLEAN' } });
      for (const retired of ['ledger', 'agent', 'runtime_blocked']) expect(featA).not.toHaveProperty(retired);
      const featB = snapshot.items.find(item => item.repository_id === betaRepo.repository_id)!;
      expect(featB).toMatchObject({ branch: 'feat/b', column: 'building', pull_request: null });
      expect(snapshot.items.some(item => item.branch === 'main')).toBe(false);
      expect(snapshot.attention.map(entry => [entry.kind, entry.subject_id])).toEqual([['ready_to_merge', featA.id]]);
      expect(snapshot.items.find(item => item.branch === 'feat/shipped')).toMatchObject({ column: 'shipped', pull_request: { number: 9, ci: null } });

      const wire = JSON.stringify(snapshot);
      expect(wire).not.toContain(f.root);
      expect(wire).not.toContain('fatal');
      expect(wire).not.toContain(tmpdir());

      const argv = readFileSync(f.argvLog, 'utf8').trim().split('\n');
      const expected = [DEV_ACTIVITY_GH_REPO_VIEW_ARGV, ...devActivityGhPrListArgv(nowMs)].map(command => command.join(' '));
      expect([...new Set(argv)].sort()).toEqual(expected.sort());
      expect(argv.filter(line => line.startsWith('pr list')).every(line => line.includes('--author @me'))).toBe(true);
      expect(argv.filter(line => line.includes('statusCheckRollup')).every(line => line.includes('--state open'))).toBe(true);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('times out a hung gh child and still finishes the cycle', async () => {
    const f = fixture(['slow'], 0);
    try {
      writeFileSync(join(f.repos.slow!, '.git', 'gh-sleep'), '');
      const started = Date.now();
      const snapshot = await collectDevActivity({ env: f.env, timeout_ms: 1_000 });
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(snapshot.repositories[0]!.sources.find(source => source.kind === 'github')).toMatchObject({ status: 'unavailable', reason: 'gh_timeout' });
      expect(snapshot.repositories[0]!.sources.find(source => source.kind === 'git')).toMatchObject({ status: 'ok' });
      // The deadline sends SIGTERM, so the child's TERM handler runs.
      const terminated = join(f.repos.slow!, '.git', 'gh-terminated');
      for (let waited = 0; waited < 5_000 && !existsSync(terminated); waited += 50) await Bun.sleep(50);
      expect(existsSync(terminated)).toBe(true);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  for (const cause of ['timeout', 'aborted'] as const) {
    test(`reaps a direct child that ignores SIGTERM on ${cause}`, async () => {
      const f = fixture(['resistant'], 0);
      const cwd = f.repos.resistant!;
      const ready = join(cwd, '.git', 'resistant-ready');
      const term = join(cwd, '.git', 'resistant-term');
      let pid: number | undefined;
      try {
        const executable = join(f.root, 'bin', 'gh');
        writeFileSync(executable, `#!/usr/bin/env node
const fs = require('node:fs');
process.on('SIGTERM', () => fs.writeFileSync(${JSON.stringify(term)}, 'received'));
fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid));
setInterval(() => {}, 1000);
`);
        chmodSync(executable, 0o755);
        const controller = new AbortController();
        const pending = runDevActivityProcess('gh', [], { cwd, env: f.env, timeout_ms: cause === 'timeout' ? 2500 : 60000, signal: controller.signal });
        for (let waited = 0; waited < 2000 && !existsSync(ready); waited += 10) await Bun.sleep(10);
        expect(existsSync(ready)).toBe(true);
        pid = Number(readFileSync(ready, 'utf8'));
        if (cause === 'aborted') controller.abort();
        expect(await pending).toEqual({ ok: false, code: cause });
        expect(() => process.kill(pid!, 0)).toThrow();
        expect(readFileSync(term, 'utf8')).toBe('received');
      } finally {
        if (pid !== undefined) { try { process.kill(pid, 'SIGKILL'); } catch { /* fixture already exited */ } }
        rmSync(f.root, { recursive: true, force: true });
      }
    });
  }

  test('a deadline reaps a grandchild that holds stdout open after its parent exits', async () => {
    const f = fixture(['inherited'], 0);
    const cwd = f.repos.inherited!;
    const ready = join(cwd, '.git', 'grandchild-pid');
    let pid: number | undefined;
    try {
      const executable = join(f.root, 'bin', 'gh');
      writeFileSync(executable, `#!/usr/bin/env node
const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'ignore'] });
require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(child.pid));
process.exit(0);
`);
      chmodSync(executable, 0o755);
      const deadline_ms = DEV_ACTIVITY_SUBPROCESS_TIMEOUT_MS;
      const started = Date.now();
      const pending = runDevActivityProcess('gh', [], { cwd, env: f.env, timeout_ms: deadline_ms, signal: new AbortController().signal });
      // Process startup shares the real production deadline. It has no 800 ms promise.
      for (let waited = 0; waited < deadline_ms && !existsSync(ready); waited += 10) await Bun.sleep(10);
      expect(existsSync(ready)).toBe(true);
      pid = Number(readFileSync(ready, 'utf8'));
      expect(await pending).toEqual({ ok: false, code: 'timeout' });
      expect(Date.now() - started).toBeLessThan(deadline_ms + 5000);
      expect(() => process.kill(pid!, 0)).toThrow();
    } finally {
      if (pid !== undefined) { try { process.kill(pid, 'SIGKILL'); } catch { /* fixture already exited */ } }
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('a week with more merged PRs than one query carries is paged by day and keeps the board populated', async () => {
    const f = fixture(['busy'], 0);
    try {
      const gitDir = join(f.repos.busy!, '.git');
      const nowMs = Date.now();
      const merged = (index: number, daysAgo: number) => {
        const at = new Date(nowMs - daysAgo * DAY).toISOString();
        const { statusCheckRollup: _ci, ...fields } = prJson(`feat/m${index}`, { number: index + 1, state: 'MERGED', mergedAt: at, closedAt: at,
          url: `https://github.com/acme/widgets/pull/${index + 1}` });
        return fields;
      };
      const dayFile = (daysAgo: number) => `gh-prs-merged-${new Date(nowMs - daysAgo * DAY).toISOString().slice(0, 10)}.json`;
      const first = Array.from({ length: 150 }, (_, index) => merged(index, 1));
      const second = Array.from({ length: 120 }, (_, index) => merged(150 + index, 2));
      writeFileSync(join(gitDir, 'gh-prs-merged.json'), JSON.stringify(Array.from({ length: DEV_ACTIVITY_GH_PR_LIMIT + 1 }, (_, index) => merged(index, 1))));
      writeFileSync(join(gitDir, dayFile(1)), JSON.stringify(first));
      writeFileSync(join(gitDir, dayFile(2)), JSON.stringify(second));
      writeFileSync(join(gitDir, 'gh-prs-open.json'), JSON.stringify([prJson('feat/open', { number: 900, url: 'https://github.com/acme/widgets/pull/900' })]));

      const snapshot = decodeDevActivitySnapshot(await collectDevActivity({ env: f.env, now: () => nowMs }));
      expect(snapshot.repositories[0]!.sources.find(source => source.kind === 'github')).toMatchObject({ status: 'ok', reason: null });
      expect(snapshot.status).toBe('ready');
      expect(snapshot.items.filter(item => item.column === 'shipped')).toHaveLength(270);
      expect(snapshot.items.filter(item => item.column === 'ready_to_merge')).toHaveLength(1);

      const argv = readFileSync(f.argvLog, 'utf8').trim().split('\n');
      const days = devActivityGhPrDayArgvs('merged', nowMs).map(command => command.join(' '));
      expect(days).toHaveLength(8);
      for (const day of days) expect(argv).toContain(day);
      expect(argv.filter(line => line.includes('--state closed') && line.includes('closed:2'))).toHaveLength(0);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('a day with more merged PRs than the limit drops only the merged category', async () => {
    const f = fixture(['busy'], 0);
    try {
      const gitDir = join(f.repos.busy!, '.git');
      const nowMs = Date.now();
      const at = new Date(nowMs - DAY).toISOString();
      const rows = Array.from({ length: DEV_ACTIVITY_GH_PR_LIMIT + 1 }, (_, index) => {
        const { statusCheckRollup: _ci, ...fields } = prJson(`feat/m${index}`, { number: index + 1, state: 'MERGED', mergedAt: at, closedAt: at,
          url: `https://github.com/acme/widgets/pull/${index + 1}` });
        return fields;
      });
      writeFileSync(join(gitDir, 'gh-prs-merged.json'), JSON.stringify(rows));
      writeFileSync(join(gitDir, `gh-prs-merged-${at.slice(0, 10)}.json`), JSON.stringify(rows));
      writeFileSync(join(gitDir, 'gh-prs-open.json'), JSON.stringify([prJson('feat/open', { number: 900, url: 'https://github.com/acme/widgets/pull/900' })]));

      const snapshot = decodeDevActivitySnapshot(await collectDevActivity({ env: f.env, now: () => nowMs }));
      expect(snapshot.repositories[0]!.sources.find(source => source.kind === 'github')).toMatchObject({ status: 'unavailable', reason: 'github_truncated_merged' });
      expect(snapshot.repositories[0]).toMatchObject({ github: 'acme/widgets', default_branch: 'main' });
      expect(snapshot.status).toBe('partial');
      expect(snapshot.items.map(item => item.branch)).toEqual(['feat/open']);
      expect(snapshot.attention.map(entry => entry.kind)).toEqual(['ready_to_merge']);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('more open PRs than the limit drop only the open category', async () => {
    const f = fixture(['busy'], 0);
    try {
      const gitDir = join(f.repos.busy!, '.git');
      const nowMs = Date.now();
      const at = new Date(nowMs - DAY).toISOString();
      const rows = Array.from({ length: DEV_ACTIVITY_GH_PR_LIMIT + 1 }, (_, index) =>
        prJson(`feat/p${index}`, { number: index + 1, url: `https://github.com/acme/widgets/pull/${index + 1}` }));
      writeFileSync(join(gitDir, 'gh-prs-open.json'), JSON.stringify(rows));
      const { statusCheckRollup: _ci, ...shipped } = prJson('feat/shipped', { number: 900, state: 'MERGED', mergedAt: at, closedAt: at, url: 'https://github.com/acme/widgets/pull/900' });
      writeFileSync(join(gitDir, 'gh-prs-merged.json'), JSON.stringify([shipped]));

      const snapshot = await collectDevActivity({ env: f.env, now: () => nowMs });
      expect(snapshot.repositories[0]!.sources.find(source => source.kind === 'github')).toMatchObject({ status: 'unavailable', reason: 'github_truncated_open' });
      expect(snapshot.status).toBe('partial');
      expect(snapshot.items.map(item => item.branch)).toEqual(['feat/shipped']);
      const argv = readFileSync(f.argvLog, 'utf8').trim().split('\n');
      expect(argv.filter(line => line.includes('--state open'))).toHaveLength(1);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('a repository without a GitHub remote never runs gh', async () => {
    const f = fixture(['local'], 0);
    try {
      git(f.repos.local!, 'remote', 'remove', 'origin');
      const snapshot = await collectDevActivity({ env: f.env });
      expect(snapshot.repositories[0]!.sources.find(source => source.kind === 'github')).toMatchObject({ status: 'not_configured', reason: 'no_github_remote' });
      expect(snapshot.repositories[0]!.default_branch).toBeNull();
      expect(() => readFileSync(f.argvLog, 'utf8')).toThrow();
      expect(snapshot.status).toBe('ready');
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});

describe('dev activity collector bounds', () => {
  test('PR queries are author-scoped and bounded to the shipped window by the collector clock', () => {
    const [open, merged, closed] = devActivityGhPrListArgv(Date.parse('2026-10-10T12:00:00.000Z')).map(argv => argv.join(' '));
    expect(open).toBe('pr list --state open --author @me --limit 201 --json number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision,statusCheckRollup,headRefOid,changedFiles,files');
    expect(merged).toBe('pr list --state merged --author @me --limit 201 --search merged:>=2026-10-03 --json number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision');
    expect(closed).toBe('pr list --state closed --author @me --limit 201 --search closed:>=2026-10-03 is:unmerged --json number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision');
  });

  test('an open PR keeps its head and a complete file list; a short, missing or bad list is a reason, never a partial list', () => {
    const parse = (overrides: Record<string, unknown>, open = true) => parseGhPullRequests(JSON.stringify([prJson('feat/a', overrides)]), open)[0]!;
    const many = (count: number) => Array.from({ length: count }, (_, index) => ({ path: `src/f${String(index).padStart(3, '0')}.ts` }));
    expect(parse({ changedFiles: 2, files: [{ path: 'src/b.ts' }, { path: 'README.md' }] })).toMatchObject({
      head_sha: 'c'.repeat(40), changed_files: { state: 'ok', paths: ['README.md', 'src/b.ts'] } });
    // gh lists at most 100 files; a PR with more is truncated, not complete.
    expect(parse({ changedFiles: 150, files: many(100) }).changed_files).toEqual({ state: 'unavailable', reason: 'files_truncated' });
    expect(parse({ changedFiles: 100, files: many(100) }).changed_files?.state).toBe('ok');
    expect(parse({ files: undefined }).changed_files).toEqual({ state: 'unavailable', reason: 'files_missing' });
    expect(parse({ changedFiles: undefined }).changed_files).toEqual({ state: 'unavailable', reason: 'files_missing' });
    for (const files of [[{ path: '/Users/me/repo/x.ts' }], [{ path: '../x.ts' }], [{ name: 'x.ts' }], [{ path: 'x.ts' }, { path: 'x.ts' }]]) {
      expect(parse({ changedFiles: files.length, files }).changed_files).toEqual({ state: 'unavailable', reason: 'files_invalid' });
    }
    expect(parse({ changedFiles: 0, files: [{ path: 'x.ts' }] }).changed_files).toEqual({ state: 'unavailable', reason: 'files_invalid' });
    expect(parse({ headRefOid: 'main' }).head_sha).toBeNull();
    // The merged and closed queries ask for neither.
    const merged = parse({ state: 'MERGED', mergedAt: new Date().toISOString(), closedAt: new Date().toISOString() }, false);
    expect([merged.head_sha, merged.changed_files]).toEqual([null, null]);
  });

  test('caps repository concurrency and passes only constant argv', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-activity-cap-')));
    try {
      const home = join(root, 'home');
      mkdirSync(home);
      const paths = Array.from({ length: 9 }, (_, index) => { const path = join(root, `r${index}`); mkdirSync(path); return path; });
      writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: paths.map(path => ({
        id: repoHarnessRepoIdFor(path), path, accessMode: 'read_only', source: 'manual', registeredAt: 'x', lastSeenAt: 'x' })) }));
      let active = 0;
      let peak = 0;
      const calls: { command: string; argv: string; cwd: string }[] = [];
      const run: DevActivityProcessRunner = async (command, argv, options) => {
        calls.push({ command, argv: argv.join(' '), cwd: options.cwd });
        active++;
        peak = Math.max(peak, active);
        await Bun.sleep(5);
        active--;
        return { ok: false, code: 'failed' };
      };
      const snapshot = await collectDevActivity({ env: { REPO_HARNESS_HOME: home, REPO_HARNESS_PIPELINES_DB: join(root, 'none.db') }, run_process: run });
      expect(peak).toBe(4);
      expect(snapshot.repositories).toHaveLength(9);
      expect(new Set(calls.map(call => call.cwd))).toEqual(new Set(paths));
      expect([...new Set(calls.map(call => `${call.command} ${call.argv}`))].sort()).toEqual([
        'git --no-optional-locks remote -v',
        'git --no-optional-locks symbolic-ref --quiet --short refs/remotes/origin/HEAD',
        'git --no-optional-locks worktree list --porcelain',
      ]);
      expect(snapshot.repositories.every(repo => repo.sources.find(source => source.kind === 'git')?.reason === 'git_failed')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a first cycle that fails ends the pending state with an unavailable snapshot', async () => {
    const f = fixture(['one'], 0);
    try {
      const collector = startDevActivityCollector({
        env: f.env, interval_ms: 60_000, now: () => Date.parse('2026-10-28T09:00:00.000Z'),
        run_process: async () => { throw new Error('spawn failed'); },
      });
      await collector.settled();
      await collector.close();
      expect(collector.read()).toMatchObject({ status: 'unavailable', collected_at: '2026-10-28T09:00:00.000Z', repositories: [], items: [] });
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('serves unavailable before the first cycle, then the cache; close stops the timer', async () => {
    const f = fixture(['one'], 0);
    try {
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let reads = 0;
      const collector = startDevActivityCollector({
        env: f.env,
        interval_ms: 20,
        read_runtime: () => { reads++; return { projection_version: 'repo-harness.runtime-overlay.v5', status: 'unavailable', reason: null, observed_at: null, source_epoch: 0, program_status: 'unsupported', unclaimed: 0, badges: [], pane_observations: [], native_sources: [] }; },
        run_process: async () => { await gate; return { ok: false, code: 'failed' }; },
      });
      expect(collector.read()).toMatchObject({ status: 'unavailable', collected_at: null, items: [], repositories: [] });
      release();
      await collector.settled();
      expect(collector.read()).toMatchObject({ status: 'partial', unreadable_registrations: 0, repositories: [{ display_name: 'one' }] });
      await Bun.sleep(80);
      expect(reads).toBeGreaterThan(1);
      await collector.close();
      const after = reads;
      await Bun.sleep(80);
      expect(reads).toBe(after);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});
