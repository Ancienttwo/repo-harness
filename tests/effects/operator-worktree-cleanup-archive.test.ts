import { expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCleanupPlan } from '../../src/effects/operator/worktree-cleanup-plan';
import { stageCleanupArchive } from '../../src/effects/operator/worktree-cleanup-archive';
import { observeCleanupLoss } from '../../src/effects/operator/worktree-cleanup-observation';
import { worktreeId } from '../../src/effects/git/worktree-record';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { inspectWorktree } from '../../src/effects/state/coordination-worktree-topology';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';
import type { WorktreeView } from '../../src/core/operator/worktrees';

const sid = 'a'.repeat(32), repoId = `repo_${'b'.repeat(16)}`, archivePath = 'docs/archive/2026-10-29-feature';
function fixture() {
  const parent = tmpWorkspace('cleanup-archive'), repo = join(parent, 'repo'), tree = join(parent, 'repo-wt-feature');
  const home = join(parent, 'home'), staging = join(parent, 'staging');
  for (const path of [repo, home, staging]) mkdirSync(path, { mode: 0o700 });
  initGitRepo(repo); mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'docs/guide.md'), 'base\n'); writeFileSync(join(repo, '.gitignore'), '.env\ncache.bin\n'); commitAll(repo, 'base');
  const git = (cwd: string, ...args: string[]) => { const r = run('git', args, cwd); expect(r.status).toBe(0); return r.stdout.trim(); };
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD'); git(repo, 'worktree', 'add', '-b', 'feature', tree);
  const env = { ...process.env, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: parent };
  const target = { repository: repo, worktree: tree, id: worktreeId(resolveGitCommonDirectory(repo), tree), kind: 'registered' as const };
  const options = () => ({ env, deadline: Date.now() + 20_000, staging_root: staging });
  const plan = (gitPaths: string[], privatePaths: string[], commits = false) => {
    const worktree: WorktreeView = { id: target.id, repository_id: repoId, directory: 'repo-wt-feature', branch: 'feature', source: 'manual',
      size_bytes: null, size_observed_at: null, record: null, ...inspectWorktree(repo, tree, repo, { env, processes: [] }) };
    return createCleanupPlan(sid, [{ observation: { worktree, loss: observeCleanupLoss(target, options()) }, advice: {
      recommendation: 'archive_then_delete', reason: 'Keep the reviewed changes.', evidence: ['Fixture content reviewed.'],
      archive: { git: gitPaths.length || commits ? { directory: archivePath, branch: 'docs/archive-feature', paths: gitPaths, include_commits: commits } : null,
        private: privatePaths.length ? { directory: repoId, paths: privatePaths } : null },
    } }]).items[0]!;
  };
  return { parent, repo, tree, home, staging, env, target, options, plan, git, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

test('stages raw worktree and index versions, and copies synthetic private content as 0600 without deleting the source', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'docs/guide.md'), 'index version\n'); f.git(f.tree, 'add', 'docs/guide.md');
    writeFileSync(join(f.tree, 'docs/guide.md'), 'working version\n'); writeFileSync(join(f.tree, '.env'), 'SYNTHETIC_PRIVATE=fixture\n');
    const item = f.plan(['docs/guide.md'], ['.env']);
    const result = stageCleanupArchive(sid, f.target, item, f.options());
    const archive = join(result.git_directory!, archivePath);
    expect(readFileSync(join(archive, 'docs/guide.md'), 'utf8')).toBe('working version\n');
    expect(readFileSync(join(archive, '.cleanup/index/0/docs/guide.md'), 'utf8')).toBe('index version\n');
    expect(readFileSync(join(result.private_directory!, '.env'), 'utf8')).toBe('SYNTHETIC_PRIVATE=fixture\n');
    expect(statSync(join(result.private_directory!, '.env')).mode & 0o777).toBe(0o600);
    expect(statSync(result.private_directory!).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(f.tree, '.env'), 'utf8')).toBe('SYNTHETIC_PRIVATE=fixture\n');
    expect(readFileSync(join(f.tree, 'docs/guide.md'), 'utf8')).toBe('working version\n');
    const source = readFileSync(join(archive, 'SOURCE.md'), 'utf8');
    expect(source).toContain(sid); expect(source).toContain(repoId); expect(source).not.toContain(f.parent); expect(source).not.toContain('SYNTHETIC_PRIVATE=');
    expect(stageCleanupArchive(sid, f.target, item, f.options())).toEqual(result);
  } finally { f.cleanup(); }
});

test('interruption after a published artifact resumes without overwriting it', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'docs/guide.md'), 'working\n'); const item = f.plan(['docs/guide.md'], []);
    let interrupted = false;
    expect(() => stageCleanupArchive(sid, f.target, item, { ...f.options(), after_artifact() { interrupted = true; throw new Error('fixture stop'); } })).toThrow('unavailable');
    expect(interrupted).toBe(true);
    const operation = readdirSync(f.staging)[0]!, saved = join(f.staging, operation, archivePath, 'docs/guide.md');
    const inode = statSync(saved).ino;
    const result = stageCleanupArchive(sid, f.target, item, f.options());
    expect(statSync(saved).ino).toBe(inode); expect(readFileSync(saved, 'utf8')).toBe('working\n'); expect(result.manifest_sha256).toMatch(/^[a-f0-9]{64}$/u);
    writeFileSync(saved, 'corrupt');
    expect(() => stageCleanupArchive(sid, f.target, item, f.options())).toThrow('archive_conflict');
    expect(readFileSync(saved, 'utf8')).toBe('corrupt');
  } finally { f.cleanup(); }
});

test('source changes during staging refuse success and keep the original worktree', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'docs/guide.md'), 'working\n'); const item = f.plan(['docs/guide.md'], []);
    expect(() => stageCleanupArchive(sid, f.target, item, { ...f.options(), after_artifact() { writeFileSync(join(f.tree, 'docs/guide.md'), 'new content\n'); } })).toThrow('changed');
    expect(readFileSync(join(f.tree, 'docs/guide.md'), 'utf8')).toBe('new content\n');
  } finally { f.cleanup(); }
});

test('credentials and binary content cannot enter a Git archive', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=fixture\n');
    expect(() => stageCleanupArchive(sid, f.target, f.plan(['.env'], []), f.options())).toThrow('unsafe_git_content');
    writeFileSync(join(f.tree, 'docs/guide.md'), 'ghp_' + 'q'.repeat(36));
    expect(() => stageCleanupArchive(sid, f.target, f.plan(['docs/guide.md'], []), f.options())).toThrow('unsafe_git_content');
    writeFileSync(join(f.tree, 'cache.bin'), Buffer.alloc(65_537, 0));
    expect(() => stageCleanupArchive(sid, f.target, f.plan(['cache.bin'], []), f.options())).toThrow('unsafe_git_content');
    const result = stageCleanupArchive(sid, f.target, f.plan([], ['cache.bin']), f.options());
    expect(readFileSync(join(result.private_directory!, 'cache.bin')).equals(Buffer.alloc(65_537, 0))).toBe(true);
    expect(statSync(join(result.private_directory!, 'cache.bin')).mode & 0o777).toBe(0o600);
  } finally { f.cleanup(); }
});

test('a private archive symlink is refused without writing to its target', () => {
  const f = fixture();
  try {
    const outside = join(f.parent, 'outside'); mkdirSync(outside); symlinkSync(outside, join(f.home, 'archive'));
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=fixture\n');
    expect(() => stageCleanupArchive(sid, f.target, f.plan([], ['.env']), f.options())).toThrow();
    expect(readdirSync(outside)).toEqual([]); expect(existsSync(join(f.tree, '.env'))).toBe(true);
  } finally { f.cleanup(); }
});

test('unpublished commit format-patch can be applied in a separate fixture checkout', () => {
  const f = fixture();
  try {
    const base = f.git(f.tree, 'rev-parse', 'HEAD');
    writeFileSync(join(f.tree, 'docs/new.md'), 'unpublished content\n'); commitAll(f.tree, 'unpublished');
    const commit = f.git(f.tree, 'rev-parse', 'HEAD');
    const result = stageCleanupArchive(sid, f.target, f.plan([], [], true), f.options());
    const patch = join(result.git_directory!, archivePath, '.cleanup/commits', commit + '.patch');
    expect(readFileSync(patch, 'utf8').startsWith(`From ${commit} Mon Sep 17 00:00:00 2001\n`)).toBe(true);
    const source = readFileSync(join(result.git_directory!, archivePath, 'SOURCE.md'), 'utf8');
    const manifest = JSON.parse(source.split('```json\n')[1]!.split('```')[0]!);
    const recorded = manifest.files.find((file: { original: { kind: string } }) => file.original.kind === 'commit').original;
    expect(recorded.parents).toEqual([base]); expect(source).toContain(`HEAD: ${commit}`); expect(source).not.toContain('Base:');
    const restore = join(f.parent, 'restored'); f.git(f.repo, 'worktree', 'add', '-b', 'restored', restore, recorded.parents[0]);
    f.git(restore, 'am', patch);
    expect(readFileSync(join(restore, 'docs/new.md'), 'utf8')).toBe('unpublished content\n');
    expect(f.git(f.tree, 'rev-parse', 'HEAD')).toBe(commit);
  } finally { f.cleanup(); }
});

test('archive manifest preserves executable modes and index-only symlink identity', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'run.sh'), '#!/bin/sh\necho fixture\n'); chmodSync(join(f.tree, 'run.sh'), 0o755);
    symlinkSync('docs/guide.md', join(f.tree, 'shortcut')); f.git(f.tree, 'add', 'shortcut');
    const oid = f.git(f.tree, 'rev-parse', ':shortcut'); fs.unlinkSync(join(f.tree, 'shortcut'));
    const result = stageCleanupArchive(sid, f.target, f.plan(['run.sh', 'shortcut'], []), f.options());
    const source = readFileSync(join(result.git_directory!, archivePath, 'SOURCE.md'), 'utf8');
    const manifest = JSON.parse(source.split('```json\n')[1]!.split('```')[0]!);
    expect(manifest.files.find((file: { path: string }) => file.path === 'run.sh').original).toEqual({ kind: 'file', mode: 0o755 });
    expect(manifest.files.find((file: { path: string }) => file.path === '.cleanup/index/0/shortcut').original).toEqual({ kind: 'index', mode: '120000', stage: 0, oid });
    expect(readFileSync(join(result.git_directory!, archivePath, '.cleanup/index/0/shortcut'), 'utf8')).toBe('docs/guide.md');
  } finally { f.cleanup(); }
});

test('Git replacement objects cannot change the archived index-only version', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'docs/guide.md'), 'original staged bytes\n'); f.git(f.tree, 'add', 'docs/guide.md');
    const original = f.git(f.tree, 'rev-parse', ':docs/guide.md');
    writeFileSync(join(f.tree, 'docs/guide.md'), 'working bytes\n');
    const replacementFile = join(f.parent, 'replacement'); writeFileSync(replacementFile, 'replacement bytes\n');
    const replacement = f.git(f.tree, 'hash-object', '-w', replacementFile);
    f.git(f.tree, 'replace', original, replacement);
    const result = stageCleanupArchive(sid, f.target, f.plan(['docs/guide.md'], []), f.options());
    expect(readFileSync(join(result.git_directory!, archivePath, '.cleanup/index/0/docs/guide.md'), 'utf8')).toBe('original staged bytes\n');
  } finally { f.cleanup(); }
});

test('each ancestor of a private artifact is durably linked before staging succeeds', () => {
  const f = fixture(), synced = new Set<number>();
  const originalSync = fs.fsyncSync;
  const sync = spyOn(fs, 'fsyncSync').mockImplementation(fd => { const stat = fs.fstatSync(fd); if (stat.isDirectory()) synced.add(stat.ino); originalSync(fd); });
  try {
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=fixture\n');
    const result = stageCleanupArchive(sid, f.target, f.plan([], ['.env']), f.options());
    for (const path of [f.home, join(f.home, 'archive'), join(f.home, 'archive', repoId), result.private_directory!]) {
      expect(synced.has(statSync(path).ino)).toBe(true);
    }
  } finally { sync.mockRestore(); f.cleanup(); }
});

test('a merge with unique conflict resolution refuses instead of archiving an ancestor patch under its identity', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'docs/guide.md'), 'feature text\n'); commitAll(f.tree, 'feature');
    writeFileSync(join(f.repo, 'docs/guide.md'), 'main text\n'); commitAll(f.repo, 'main');
    const merge = run('git', ['merge', '--no-edit', 'main'], f.tree); expect(merge.status).toBe(1);
    writeFileSync(join(f.tree, 'docs/guide.md'), 'unique conflict resolution\n'); commitAll(f.tree, 'resolve conflict');
    const head = f.git(f.tree, 'rev-parse', 'HEAD');
    expect(f.git(f.tree, 'rev-list', '--parents', '-n', '1', head).split(' ')).toHaveLength(3);
    expect(() => stageCleanupArchive(sid, f.target, f.plan([], [], true), f.options())).toThrow('unsupported');
    expect(readFileSync(join(f.tree, 'docs/guide.md'), 'utf8')).toBe('unique conflict resolution\n');
    for (const operation of readdirSync(f.staging)) expect(existsSync(join(f.staging, operation, archivePath, 'SOURCE.md'))).toBe(false);
  } finally { f.cleanup(); }
});

test('a root commit patch keeps its exact identity and restores into an empty repository', () => {
  const f = fixture();
  try {
    f.git(f.repo, 'update-ref', '-d', 'refs/remotes/origin/main');
    f.git(f.repo, 'config', 'format.zeroCommit', 'true');
    const head = f.git(f.tree, 'rev-parse', 'HEAD');
    const result = stageCleanupArchive(sid, f.target, f.plan([], [], true), f.options());
    const patch = join(result.git_directory!, archivePath, '.cleanup/commits', head + '.patch');
    expect(readFileSync(patch, 'utf8').startsWith(`From ${head} Mon Sep 17 00:00:00 2001\n`)).toBe(true);
    const source = readFileSync(join(result.git_directory!, archivePath, 'SOURCE.md'), 'utf8');
    const manifest = JSON.parse(source.split('```json\n')[1]!.split('```')[0]!);
    expect(manifest.files.find((file: { original: { kind: string } }) => file.original.kind === 'commit').original.parents).toEqual([]);
    const restore = join(f.parent, 'root-restore'); mkdirSync(restore); initGitRepo(restore); f.git(restore, 'am', patch);
    expect(readFileSync(join(restore, 'docs/guide.md'), 'utf8')).toBe('base\n');
  } finally { f.cleanup(); }
});

test('archive capture keeps BOM-prefixed and plain filenames as different artifacts', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'hidden.txt'), 'plain bytes\n'); writeFileSync(join(f.tree, '\ufeffhidden.txt'), 'BOM-name bytes\n');
    const result = stageCleanupArchive(sid, f.target, f.plan(['hidden.txt', '\ufeffhidden.txt'], []), f.options());
    expect(readFileSync(join(result.git_directory!, archivePath, 'hidden.txt'), 'utf8')).toBe('plain bytes\n');
    expect(readFileSync(join(result.git_directory!, archivePath, '\ufeffhidden.txt'), 'utf8')).toBe('BOM-name bytes\n');
    expect(result.artifacts.filter(file => file.path.endsWith('hidden.txt')).map(file => file.sha256)[0]).not.toBe(result.artifacts.filter(file => file.path.endsWith('hidden.txt')).map(file => file.sha256)[1]);
  } finally { f.cleanup(); }
});

test('private archive refuses a plan destination that differs from the owning repository key', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=fixture\n');
    const original = f.plan([], ['.env']);
    const item = createCleanupPlan(sid, [{ observation: { worktree: original.worktree, loss: observeCleanupLoss(f.target, f.options()) },
      advice: { ...original.advice, archive: { git: null, private: { directory: 'different-destination', paths: ['.env'] } } } }]).items[0]!;
    expect(() => stageCleanupArchive(sid, f.target, item, f.options())).toThrow('changed');
    expect(existsSync(join(f.home, 'archive'))).toBe(false);
  } finally { f.cleanup(); }
});
