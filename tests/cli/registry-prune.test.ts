import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pruneRepoHarnessRegistry, readRepoHarnessRegistryStrictSnapshot, repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'registry-prune-')));
  roots.push(root);
  const env = { ...process.env, HOME: root, REPO_HARNESS_HOME: join(root, 'home') };
  mkdirSync(env.REPO_HARNESS_HOME);
  const present = join(root, 'present'); mkdirSync(present);
  const file = join(root, 'file'); writeFileSync(file, 'preserve');
  const paths = [present, join(root, 'missing'), join(root, 'other-missing'), join(file, 'child')];
  const repos = paths.map(path => ({ id: repoHarnessRepoIdFor(path), path, accessMode: 'read_only' as const,
    source: 'init' as const, registeredAt: '2026-09-11T00:00:00.000Z', lastSeenAt: '2026-09-11T00:00:00.000Z' }));
  const registry = join(env.REPO_HARNESS_HOME, 'registered-repos.json');
  writeFileSync(registry, JSON.stringify({ version: 1, authorizationRevision: 5, repos }));
  const cli = (...args: string[]) => spawnSync(process.execPath, [resolve(import.meta.dir, '../../src/cli/index.ts'), 'fleet', 'prune', ...args], { env, encoding: 'utf8' });
  return { root, env, repos, registry, cli };
}

test('CLI defaults to preview, applies exact selected IDs with a revision fence and preserves other rows/files', () => {
  const f = fixture(); const before = readFileSync(f.registry, 'utf8');
  const preview = f.cli(); expect(preview.status).toBe(0);
  const plan = JSON.parse(preview.stdout);
  expect(plan.candidates.map((repo: { path: string }) => repo.path).sort()).toEqual([f.repos[1]!.path, f.repos[2]!.path].sort());
  expect(plan.skipped).toContainEqual({ id: f.repos[3]!.id, path: f.repos[3]!.path, reason: 'ENOTDIR' });
  expect(readFileSync(f.registry, 'utf8')).toBe(before);
  expect(f.cli('--apply').status).toBe(2);
  expect(readFileSync(f.registry, 'utf8')).toBe(before);
  const apply = f.cli('--apply', '--expected-revision', plan.registry_revision, '--repo-id', f.repos[1]!.id);
  expect(apply.status).toBe(0);
  expect(JSON.parse(apply.stdout).removed).toEqual([f.repos[1]]);
  const state = readRepoHarnessRegistryStrictSnapshot({ env: f.env });
  expect(state.authorizationRevision).toBe(6);
  expect(state.repos).toEqual(f.repos.filter((_, i) => i !== 1).sort((a, b) => a.id.localeCompare(b.id)));
  expect(readFileSync(join(f.root, 'file'), 'utf8')).toBe('preserve');
  const current = readFileSync(f.registry, 'utf8');
  expect(f.cli('--apply', '--expected-revision', plan.registry_revision).status).toBe(2);
  expect(readFileSync(f.registry, 'utf8')).toBe(current);
});

test('apply reprobes filesystem and no-op preserves bytes and revision', () => {
  const f = fixture(); const before = readFileSync(f.registry, 'utf8');
  const plan = pruneRepoHarnessRegistry({ env: f.env });
  mkdirSync(f.repos[1]!.path); mkdirSync(f.repos[2]!.path);
  const result = pruneRepoHarnessRegistry({ env: f.env, apply: true, expectedRevision: plan.registry_revision });
  expect(result.removed).toEqual([]); expect(result.authorization_revision).toBe(5);
  expect(readFileSync(f.registry, 'utf8')).toBe(before);
});

test('malformed registry and unknown scope fail without changing authority', () => {
  const f = fixture(); const before = readFileSync(f.registry, 'utf8');
  const plan = pruneRepoHarnessRegistry({ env: f.env });
  expect(() => pruneRepoHarnessRegistry({ env: f.env, apply: true, expectedRevision: plan.registry_revision, repoIds: ['unknown'] })).toThrow('unknown');
  expect(readFileSync(f.registry, 'utf8')).toBe(before);
  writeFileSync(f.registry, '{bad');
  expect(f.cli().status).toBe(2);
  expect(f.cli('--apply', '--expected-revision', plan.registry_revision).status).toBe(2);
  expect(readFileSync(f.registry, 'utf8')).toBe('{bad');
});

test('preview lists linked-worktree rows as not_primary_checkout and apply removes them only under the previewed revision', () => {
  const f = fixture();
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  };
  const primary = join(f.root, 'primary');
  mkdirSync(join(primary, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(primary, '.ai', 'harness', 'policy.json'), '{}\n');
  git(primary, 'init', '-q', '-b', 'main');
  git(primary, 'add', '-A');
  git(primary, 'commit', '-qm', 'base');
  const linked = join(f.root, 'linked');
  git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked);
  const row = (path: string) => ({ id: repoHarnessRepoIdFor(path), path, accessMode: 'read_only' as const,
    source: 'init' as const, registeredAt: '2026-09-11T00:00:00.000Z', lastSeenAt: '2026-09-11T00:00:00.000Z' });
  const primaryRow = row(primary); const linkedRow = row(linked); const missingRow = f.repos[1]!;
  writeFileSync(f.registry, JSON.stringify({ version: 1, authorizationRevision: 5, repos: [primaryRow, linkedRow, missingRow] }));

  const preview = f.cli(); expect(preview.status, preview.stderr).toBe(0);
  const plan = JSON.parse(preview.stdout);
  expect(plan.candidates).toHaveLength(2);
  expect(plan.candidates).toEqual(expect.arrayContaining([
    { ...linkedRow, reason: 'not_primary_checkout' },
    { ...missingRow, reason: 'path_missing' },
  ]));
  expect(plan.skipped).toEqual([{ id: primaryRow.id, path: primary, reason: 'path_present' }]);

  // A registry change after the preview refuses apply and leaves the bytes alone.
  const changed = JSON.stringify({ version: 1, authorizationRevision: 6, repos: [primaryRow, linkedRow, missingRow] });
  writeFileSync(f.registry, changed);
  expect(f.cli('--apply', '--expected-revision', plan.registry_revision).status).toBe(2);
  expect(readFileSync(f.registry, 'utf8')).toBe(changed);

  const fresh = JSON.parse(f.cli().stdout);
  const apply = f.cli('--apply', '--expected-revision', fresh.registry_revision);
  expect(apply.status, apply.stderr).toBe(0);
  const removed = JSON.parse(apply.stdout).removed;
  expect(removed).toHaveLength(2);
  expect(removed).toEqual(expect.arrayContaining([linkedRow, missingRow]));
  const state = readRepoHarnessRegistryStrictSnapshot({ env: f.env });
  expect(state.repos).toEqual([primaryRow]);
  expect(state.authorizationRevision).toBe(7);
});
