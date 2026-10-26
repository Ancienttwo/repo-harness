import { afterEach, beforeEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { decodeDocsTree, githubRemoteRepository } from '../../src/core/operator/docs';
import { startDocsCollector, type DocsCollectorHandle } from '../../src/effects/operator/docs-collector';
import { DocsReadError } from '../../src/effects/operator/docs-reader';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const cleanup: string[] = [];
const collectors: DocsCollectorHandle[] = [];
let originalGitGlobal: string | undefined;
let originalGitSystem: string | undefined;
beforeEach(() => {
  originalGitGlobal = process.env.GIT_CONFIG_GLOBAL;
  originalGitSystem = process.env.GIT_CONFIG_NOSYSTEM;
  const configHome = mkdtempSync(join(tmpdir(), 'docs-collector-config-')); cleanup.push(configHome);
  writeFileSync(join(configHome, 'gitconfig'), '');
  process.env.GIT_CONFIG_GLOBAL = join(configHome, 'gitconfig');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});
afterEach(async () => {
  for (const collector of collectors.splice(0)) await collector.close();
  if (originalGitGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = originalGitGlobal;
  if (originalGitSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM; else process.env.GIT_CONFIG_NOSYSTEM = originalGitSystem;
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const REAL_GIT = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * A registered repository whose remote-tracking `origin/main` holds `docs/a.md`
 * = "remote\n", while local `main` has moved on to "local\n". A git shim logs
 * every argv and the pid of each cat-file process.
 */
function fixture(remotes: Record<string, string> = { origin: 'git@github.com:Owner/Repo.git' }) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'docs-collector-'))); cleanup.push(parent);
  const root = join(parent, 'repo'), home = join(parent, 'home'), bin = join(parent, 'bin');
  mkdirSync(join(root, 'docs'), { recursive: true }); mkdirSync(home); mkdirSync(bin);
  git(root, 'init', '-q', '-b', 'main'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(root, 'docs/a.md'), 'remote\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'remote');
  for (const [name, url] of Object.entries(remotes)) git(root, 'remote', 'add', name, url);
  if ('origin' in remotes) git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const remoteCommit = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'docs/a.md'), 'local\n');
  git(root, 'commit', '-q', '-am', 'local');
  const id = repoHarnessRepoIdFor(root);
  const now = '2026-10-27T00:00:00.000Z';
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [
    { id, path: root, accessMode: 'read_only', source: 'adopt', registeredAt: now, lastSeenAt: now },
  ] }));
  const log = join(bin, 'argv.log'), pids = join(bin, 'cat-file.pid');
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in *cat-file*) echo $$ > '${pids}';; esac\nexec '${REAL_GIT}' "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);
  return { root, home, id, remoteCommit, gitBin: join(bin, 'git'), log, pids, env: { ...process.env, REPO_HARNESS_HOME: home } };
}

function activity(id: string, github: string | null, defaultBranch: string | null, collectedAt: string | null = '2026-10-27T00:00:00.000Z'): DevActivitySnapshotV2 {
  return {
    projection_version: 'repo-harness.dev-activity.v2', status: collectedAt === null ? 'unavailable' : 'ready', collected_at: collectedAt,
    repositories: collectedAt === null ? [] : [{ repository_id: id, display_name: 'repo', github, default_branch: defaultBranch, sources: [] }],
    unreadable_registrations: 0, items: [], attention: [],
  } as unknown as DevActivitySnapshotV2;
}

function collect(f: ReturnType<typeof fixture>, snapshot: DevActivitySnapshotV2, interval_ms = 60_000): DocsCollectorHandle {
  const handle = startDocsCollector({ env: f.env, read_dev_activity: () => snapshot, git_bin: f.gitBin, interval_ms, now: () => new Date('2026-10-27T01:00:00.000Z') });
  collectors.push(handle);
  return handle;
}

test('the listing comes from the remote-tracking ref of the GitHub default branch, never local main', async () => {
  const f = fixture();
  const docs = collect(f, activity(f.id, 'owner/repo', 'main'));
  expect(docs.read(f.id)).toEqual({ state: 'unavailable', reason: 'docs_pending' });
  await docs.settled();
  const cache = docs.read(f.id);
  if (cache.state !== 'ready') throw new Error(`not ready: ${cache.reason}`);
  expect(decodeDocsTree(cache.tree)).toEqual({
    protocol: 1, kind: 'operator_docs_tree', repository_id: f.id, ref: 'refs/remotes/origin/main', commit: f.remoteCommit,
    collected_at: '2026-10-27T01:00:00.000Z', files: [{ path: 'docs/a.md', size: 7, sha256: createHash('sha256').update('remote\n').digest('hex') }],
  });
  const file = await cache.reader.file('docs/a.md');
  expect(file).toMatchObject({ commit: f.remoteCommit, text: 'remote\n', worktree_differs: true });
  expect(JSON.stringify(cache.tree)).not.toContain(f.root);
  // Read-only argv: the remote lookup and one resident cat-file; no fetch, no ref or index write.
  const argv = readFileSync(f.log, 'utf8').trim().split('\n');
  expect(argv).toEqual(['config --local --get-regexp ^remote\\..*\\.url$', '--no-optional-locks cat-file --batch-command']);
  expect(docs.read('repo_unknown')).toEqual({ state: 'unavailable', reason: 'repository_not_found' });
});

test('a branch GitHub did not name, a missing first Dev Activity cycle and a missing ref are unavailable with reasons', async () => {
  const f = fixture();
  for (const [snapshot, reason] of [
    [activity(f.id, null, 'main'), 'default_branch_unknown'],
    [activity(f.id, 'owner/repo', null), 'default_branch_unknown'],
    [activity(f.id, 'owner/repo', 'main', null), 'docs_pending'],
    [activity(f.id, 'owner/repo', 'trunk'), 'branch_missing'],
    [activity(f.id, 'owner/repo', 'main/../x'), 'ref_invalid'],
    [activity(f.id, 'owner/other', 'main'), 'github_remote_missing'],
  ] as const) {
    const docs = collect(f, snapshot);
    await docs.settled();
    expect(docs.read(f.id)).toEqual({ state: 'unavailable', reason });
  }
});

test('two remotes of the same GitHub repository are ambiguous; an invalid registry is unavailable', async () => {
  const f = fixture({ origin: 'https://github.com/owner/repo.git', mirror: 'ssh://git@github.com/OWNER/repo' });
  const docs = collect(f, activity(f.id, 'owner/repo', 'main'));
  await docs.settled();
  expect(docs.read(f.id)).toEqual({ state: 'unavailable', reason: 'github_remote_ambiguous' });

  writeFileSync(join(f.home, 'registered-repos.json'), '{"version":1}');
  const broken = collect(f, activity(f.id, 'owner/repo', 'main'));
  await broken.settled();
  expect(broken.read(f.id)).toEqual({ state: 'unavailable', reason: 'registry_unavailable' });
});

test('a dead cat-file process stays dead for reads until the next cycle restarts it', async () => {
  const f = fixture();
  const docs = collect(f, activity(f.id, 'owner/repo', 'main'), 200);
  await docs.settled();
  const first = docs.read(f.id);
  if (first.state !== 'ready') throw new Error('not ready');
  const pid = Number(readFileSync(f.pids, 'utf8'));
  process.kill(pid, 'SIGKILL');
  for (let attempt = 0; attempt < 100 && first.reader.running; attempt++) await Bun.sleep(10);
  let code: string | null = null;
  try { await first.reader.file('docs/a.md'); } catch (error) { code = (error as DocsReadError).code; }
  expect(code).toBe('worker_unavailable');
  for (let attempt = 0; attempt < 200 && Number(readFileSync(f.pids, 'utf8')) === pid; attempt++) await Bun.sleep(10);
  await docs.settled();
  const again = docs.read(f.id);
  if (again.state !== 'ready') throw new Error('not ready again');
  expect((await again.reader.file('docs/a.md')).text).toBe('remote\n');
});

test('a close during the remote lookup starts no cat-file process and no scan', async () => {
  const f = fixture();
  const slow = join(dirname(f.gitBin), 'git-slow');
  writeFileSync(slow, `#!/bin/sh\ncase "$*" in config*) sleep 1;; esac\nexec '${f.gitBin}' "$@"\n`);
  chmodSync(slow, 0o755);
  const docs = startDocsCollector({ env: f.env, read_dev_activity: () => activity(f.id, 'owner/repo', 'main'), git_bin: slow, interval_ms: 60_000 });
  await Bun.sleep(100);
  await docs.close();
  await Bun.sleep(1_300);
  expect(readFileSync(f.log, 'utf8').trim().split('\n')).toEqual(['config --local --get-regexp ^remote\\..*\\.url$']);
  expect(existsSync(f.pids)).toBe(false);
});

test('the docs follow the first Dev Activity cycle without waiting a full interval', async () => {
  const f = fixture();
  let snapshot = activity(f.id, 'owner/repo', 'main', null);
  const docs = startDocsCollector({ env: f.env, read_dev_activity: () => snapshot, git_bin: f.gitBin, interval_ms: 60_000 });
  collectors.push(docs);
  await docs.settled();
  expect(docs.read(f.id)).toEqual({ state: 'unavailable', reason: 'docs_pending' });
  snapshot = activity(f.id, 'owner/repo', 'main');
  for (let attempt = 0; attempt < 300 && docs.read(f.id).state !== 'ready'; attempt++) await Bun.sleep(10);
  expect(docs.read(f.id).state).toBe('ready');
});

test('closing ends every resident process', async () => {
  const f = fixture();
  const docs = collect(f, activity(f.id, 'owner/repo', 'main'));
  await docs.settled();
  const cache = docs.read(f.id);
  if (cache.state !== 'ready') throw new Error('not ready');
  await docs.close();
  expect(cache.reader.running).toBe(false);
});

test('GitHub remote URLs name owner/repo in every form, and nothing else does', () => {
  for (const url of ['https://github.com/Owner/Repo.git', 'https://token@github.com/owner/repo', 'git@github.com:owner/repo.git', 'ssh://git@github.com/owner/repo.git', 'ssh://git@github.com:22/owner/repo/']) {
    expect(githubRemoteRepository(url)).toBe('owner/repo');
  }
  for (const url of ['https://gitlab.com/owner/repo.git', 'https://github.com.evil.example/owner/repo', 'git@github.com:owner/repo/extra.git', '/srv/git/repo.git']) {
    expect(githubRemoteRepository(url)).toBeNull();
  }
});
