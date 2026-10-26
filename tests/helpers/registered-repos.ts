import { spawnSync } from 'child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { planAdoption } from '../../src/effects/adoption/plan';
import { applyAdoptionPlan } from '../../src/effects/fs-transaction';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

/** An isolated HOME, harness home, managed worktree root and registry under one canonical root. */
export interface RegisteredReposFixture {
  readonly root: string;
  readonly registry: string;
  readonly env: NodeJS.ProcessEnv;
}

export function registeredReposFixture(root: string): RegisteredReposFixture {
  const home = join(root, 'home');
  const harnessHome = join(home, '.repo-harness');
  const worktrees = join(root, 'managed-worktrees');
  mkdirSync(harnessHome, { recursive: true });
  mkdirSync(worktrees);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    REPO_HARNESS_HOME: harnessHome,
    REPO_HARNESS_WORKTREE_ROOT: worktrees,
  };
  return { root, registry: join(harnessHome, 'registered-repos.json'), env };
}

export function git(f: RegisteredReposFixture, cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, env: f.env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

export function commitAll(f: RegisteredReposFixture, repo: string, message: string): void {
  git(f, repo, 'add', '-A');
  git(f, repo, 'commit', '-q', '--allow-empty', '-m', message);
}

/** A primary checkout on `main` with the standard adoption applied and committed. */
export function adoptedRepo(f: RegisteredReposFixture, name: string): string {
  const repo = join(f.root, name);
  mkdirSync(repo);
  git(f, repo, 'init', '-q', '-b', 'main');
  git(f, repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  const applied = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: 'standard', apply: true, env: f.env }));
  if (!applied.ok) throw new Error(`fixture adoption failed in ${repo}`);
  commitAll(f, repo, 'adopt');
  return repo;
}

export function writeRegistry(f: RegisteredReposFixture, paths: readonly string[], authorizationRevision = 1): void {
  const at = '2026-10-26T00:00:00.000Z';
  const repos = paths.map((path) => ({ id: repoHarnessRepoIdFor(path), path, accessMode: 'read_only', source: 'init', registeredAt: at, lastSeenAt: at }));
  writeFileSync(f.registry, `${JSON.stringify({ version: 1, authorizationRevision, repos }, null, 2)}\n`);
}

/** Every worktree byte and link, without `.git`. */
export function worktreeSnapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.git') continue;
      const path = join(dir, name);
      const stat = lstatSync(path);
      const rel = relative(root, path);
      if (stat.isSymbolicLink()) result[rel] = `link:${readlinkSync(path)}`;
      else if (stat.isDirectory()) { result[rel] = 'directory'; walk(path); }
      else result[rel] = readFileSync(path).toString('base64');
    }
  };
  walk(root);
  return result;
}
