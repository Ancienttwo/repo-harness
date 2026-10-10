import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  collectDevActivity,
  startDevActivityCollector,
  devActivityGhPrListArgv,
  DEV_ACTIVITY_GH_REPO_VIEW_ARGV,
  type DevActivityProcessRunner,
} from '../../src/effects/dev-activity/collector';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { preparePipelineSQLite } from '../helpers/pipeline-sqlite-fixture';
import { PipelineStore } from '../../src/effects/pipeline/store';
import { newPipeline } from '../../src/effects/pipeline/ledger';

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
if [ -f "$state/gh-sleep" ]; then exec sleep 30; fi
case "$1 $2" in
  "repo view") echo '{"nameWithOwner":"acme/widgets","defaultBranchRef":{"name":"main"}}' ;;
  "pr list")
    while [ $# -gt 0 ]; do if [ "$1" = "--state" ]; then pr_state="$2"; fi; shift; done
    if [ -f "$state/gh-prs-$pr_state.json" ]; then cat "$state/gh-prs-$pr_state.json"; else echo '[]'; fi ;;
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
    REPO_HARNESS_PIPELINES_DB: join(root, 'ledger', 'pipelines.db'),
  };
  return { root, env, argvLog, repos };
}

function prJson(head: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 7, title: 'Add widgets', state: 'OPEN', isDraft: false, headRefName: head, baseRefName: 'main',
    url: 'https://github.com/acme/widgets/pull/7', createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
    updatedAt: new Date(Date.now() - DAY).toISOString(), mergedAt: null, closedAt: null, mergeStateStatus: 'CLEAN',
    reviewDecision: 'APPROVED', statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
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
        ['git', 'ok', null], ['github', 'ok', null], ['ledger', 'not_configured', 'ledger_not_configured'],
        ['runtime', 'not_configured', 'runtime_not_configured'], ['decisions', 'ok', null],
      ]);
      expect(betaRepo.sources.find(source => source.kind === 'github')).toMatchObject({ status: 'unavailable', reason: 'gh_failed' });
      expect(betaRepo).toMatchObject({ github: null, default_branch: 'main' });

      const featA = snapshot.items.find(item => item.repository_id === alphaRepo.repository_id && item.branch === 'feat/a')!;
      expect(featA).toMatchObject({ column: 'ready_to_merge', title: 'Add widgets', agent: null,
        worktrees: [{ directory: 'alpha-feat-a', dirty: true, ahead: null, behind: null }],
        pull_request: { number: 7, ci: 'success', review: 'approved', merge_state: 'CLEAN' } });
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

  test('joins ledger records to the registry repository through repo.root', async () => {
    preparePipelineSQLite();
    const f = fixture(['ledgered'], 0);
    try {
      const env = { ...f.env, REPO_HARNESS_PIPELINES_AUTHORITY_HOST: hostname() };
      mkdirSync(join(f.root, 'ledger'));
      const store = new PipelineStore({ env });
      try {
        newPipeline(store, { source_host: hostname(), repository_id: 'acme-widgets', root: f.repos.ledgered!, title: 'Plan widgets' });
        newPipeline(store, { source_host: hostname(), repository_id: 'acme-widgets', root: f.repos.ledgered!, title: 'Merge widgets', backfill: true, phase: 'merge-ask', note: 'fixture' });
        newPipeline(store, { source_host: hostname(), repository_id: 'elsewhere', title: 'No root' });
      } finally { store.close(); }
      const snapshot = await collectDevActivity({ env });
      expect(snapshot.repositories[0]!.sources.find(source => source.kind === 'ledger')).toMatchObject({ status: 'ok' });
      const titles = snapshot.items.map(item => [item.title, item.column, item.ledger?.phase]);
      expect(titles.sort()).toEqual([['Merge widgets', 'building', 'merge-ask'], ['Plan widgets', 'planned', 'plan']]);
      expect(snapshot.attention.map(entry => entry.kind)).toEqual(['ledger_waiting_owner']);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});

describe('dev activity collector bounds', () => {
  test('PR queries are author-scoped and bounded to the shipped window by the collector clock', () => {
    const [open, merged, closed] = devActivityGhPrListArgv(Date.parse('2026-10-10T12:00:00.000Z')).map(argv => argv.join(' '));
    expect(open).toBe('pr list --state open --author @me --limit 50 --json number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision,statusCheckRollup');
    expect(merged).toBe('pr list --state merged --author @me --limit 50 --search merged:>=2026-10-03 --json number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision');
    expect(closed).toBe('pr list --state closed --author @me --limit 50 --search closed:>=2026-10-03 is:unmerged --json number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision');
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
        'git --no-optional-locks rev-parse --git-common-dir',
        'git --no-optional-locks symbolic-ref --quiet --short refs/remotes/origin/HEAD',
        'git --no-optional-locks worktree list --porcelain',
      ]);
      expect(snapshot.repositories.every(repo => repo.sources.find(source => source.kind === 'git')?.reason === 'git_failed')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
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
        read_runtime: () => { reads++; return { projection_version: 'repo-harness.runtime-overlay.v4', status: 'unavailable', observed_at: null, source_epoch: 0, program_status: 'unsupported', unclaimed: 0, badges: [], pane_observations: [], native_sources: [] }; },
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
