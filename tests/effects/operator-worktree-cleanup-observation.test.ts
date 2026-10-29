import { expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupContentsDigestInput } from '../../src/core/operator/worktree-cleanup-observation';
import { observeCleanupLoss, type CleanupObservationTarget } from '../../src/effects/operator/worktree-cleanup-observation';
import { worktreeId } from '../../src/effects/git/worktree-record';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

function fixture() {
  const parent = tmpWorkspace('cleanup-observation'), repo = join(parent, 'repo'), tree = join(parent, 'tree');
  mkdirSync(repo); initGitRepo(repo); writeFileSync(join(repo, 'tracked.txt'), 'base\n');
  writeFileSync(join(repo, '.gitignore'), '.env\ncache/\n'); commitAll(repo, 'base');
  const git = (cwd: string, ...args: string[]) => { const r = run('git', args, cwd); expect(r.status).toBe(0); return r.stdout.trim(); };
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(repo, 'worktree', 'add', '-b', 'feature', tree);
  const target: CleanupObservationTarget = { repository: repo, worktree: tree, id: worktreeId(resolveGitCommonDirectory(repo), tree), kind: 'registered' };
  const observe = (other = target) => observeCleanupLoss(other, { env: process.env, deadline: Date.now() + 10_000 });
  return { parent, repo, tree, git, target, observe, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

test('all unpublished ancestors are included, with no session base cutoff', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'first.txt'), 'first'); commitAll(f.tree, 'first'); const first = f.git(f.tree, 'rev-parse', 'HEAD');
    writeFileSync(join(f.tree, 'second.txt'), 'second'); commitAll(f.tree, 'second'); const second = f.git(f.tree, 'rev-parse', 'HEAD');
    expect(f.observe().commits).toEqual([first, second]);
    f.git(f.repo, 'update-ref', 'refs/remotes/backup/saved', first);
    expect(f.observe().commits).toEqual([second]);
  } finally { f.cleanup(); }
});

test('raw bytes, modes, ignored files and empty directories are bound without changing the index', () => {
  const f = fixture();
  try {
    const index = join(f.git(f.tree, 'rev-parse', '--absolute-git-dir'), 'index');
    const indexBefore = readFileSync(index);
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=one\n'); mkdirSync(join(f.tree, 'cache')); mkdirSync(join(f.tree, 'cache/empty'));
    const first = f.observe(); expect(first.ignored).toContain('.env');
    expect(first.files.find(file => file.path === 'cache/empty')).toMatchObject({ kind: 'directory' });
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=two\n'); expect(cleanupContentsDigestInput(f.observe())).not.toBe(cleanupContentsDigestInput(first));
    chmodSync(join(f.tree, '.env'), 0o644); const second = f.observe(); chmodSync(join(f.tree, '.env'), 0o600); expect(cleanupContentsDigestInput(f.observe())).not.toBe(cleanupContentsDigestInput(second));
    expect(readFileSync(index).equals(indexBefore)).toBe(true);
  } finally { f.cleanup(); }
});

test('index-only versions and skip-worktree content remain observable', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'tracked.txt'), 'staged\n'); f.git(f.tree, 'add', 'tracked.txt');
    writeFileSync(join(f.tree, 'tracked.txt'), 'base\n');
    expect(f.observe().changed_paths).toContain('tracked.txt');
    const first = f.observe(); f.git(f.tree, 'update-index', '--skip-worktree', 'tracked.txt');
    writeFileSync(join(f.tree, 'tracked.txt'), 'hidden working bytes\n');
    const next = f.observe(); expect(next.changed_paths).toContain('tracked.txt');
    expect(cleanupContentsDigestInput(first)).not.toBe(cleanupContentsDigestInput(next));
  } finally { f.cleanup(); }
});

test('repository filters and fsmonitor do not run during observation', () => {
  const f = fixture();
  try {
    const marker = join(f.parent, 'must-not-exist');
    const script = join(f.parent, 'filter.sh'); writeFileSync(script, `#!/bin/sh\nprintf touched > '${marker}'\ncat\n`); chmodSync(script, 0o700);
    f.git(f.tree, 'config', 'filter.fixture.clean', script); f.git(f.tree, 'config', 'core.fsmonitor', script);
    writeFileSync(join(f.tree, '.gitattributes'), '*.txt filter=fixture\n'); writeFileSync(join(f.tree, 'tracked.txt'), 'dirty\n');
    expect(f.observe().changed_paths).toContain('tracked.txt'); expect(existsSync(marker)).toBe(false);
  } finally { f.cleanup(); }
});

test('orphan scan does not follow a stale Git pointer and preserves empty directories', () => {
  const f = fixture();
  try {
    const orphan = join(f.parent, 'orphan'); mkdirSync(orphan); mkdirSync(join(orphan, 'empty'));
    writeFileSync(join(orphan, '.git'), 'gitdir: /nonexistent-private-admin/worktrees/old\n');
    writeFileSync(join(orphan, 'work.txt'), 'lost work\n');
    const target = { ...f.target, worktree: orphan, id: worktreeId(resolveGitCommonDirectory(f.repo), orphan), kind: 'orphan' as const };
    const loss = f.observe(target);
    expect(loss.head_commit).toBeNull(); expect(loss.branch).toBeNull(); expect(loss.index).toEqual([]);
    expect(loss.changed_paths).toEqual(['empty', 'work.txt']); expect(loss.files.map(file => file.path)).toEqual(['.git', 'empty', 'work.txt']);
    expect(cleanupContentsDigestInput(loss)).not.toContain('/nonexistent-private-admin');
  } finally { f.cleanup(); }
});

test('a symlink is fingerprinted as link text without reading its target', () => {
  const f = fixture();
  try {
    const outside = join(f.parent, 'outside'); writeFileSync(outside, 'outside-one'); symlinkSync(outside, join(f.tree, 'link'));
    const first = f.observe(); writeFileSync(outside, 'outside-two');
    expect(cleanupContentsDigestInput(f.observe())).toBe(cleanupContentsDigestInput(first));
    expect(first.files.find(file => file.path === 'link')?.kind).toBe('symlink');
  } finally { f.cleanup(); }
});

test('identity mismatch, nested repositories and bounded scans fail closed', () => {
  const f = fixture();
  try {
    expect(() => f.observe({ ...f.target, id: `wt_${'0'.repeat(64)}` })).toThrow('changed');
    expect(() => observeCleanupLoss(f.target, { env: process.env, deadline: Date.now() + 10_000, max_bytes: 1 })).toThrow('too_large');
    mkdirSync(join(f.tree, 'nested')); writeFileSync(join(f.tree, 'nested/.git'), 'gitdir: invalid');
    expect(() => f.observe()).toThrow('unsupported');
  } finally { f.cleanup(); }
});

// POSIX path bytes need not be UTF-8. A replacement character must never alias an unread file.
test.skipIf(process.platform === 'win32')('invalid filename bytes are refused even beside their UTF-8 replacement spelling', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, '\ufffd'), 'valid spelling');
    writeFileSync(Buffer.concat([Buffer.from(f.tree + '/'), Buffer.from([0xff])]), 'different bytes');
    expect(() => f.observe()).toThrow('unsupported');
  } finally { f.cleanup(); }
});
test.skipIf(process.platform === 'win32')('raw non-UTF-8 symlink targets have different fingerprints', () => {
  const f = fixture();
  try {
    const path = join(f.tree, 'raw-link'); symlinkSync(Buffer.from([0xff]), path);
    const first = f.observe(); unlinkSync(path); symlinkSync(Buffer.from([0xfe]), path);
    expect(cleanupContentsDigestInput(f.observe())).not.toBe(cleanupContentsDigestInput(first));
  } finally { f.cleanup(); }
});

test('directory replacement never redirects a file read outside the opened target', () => {
  const f = fixture();
  const nested = join(f.tree, 'nested'), outside = join(f.parent, 'outside'), moved = join(f.parent, 'moved');
  let outsideReads = 0, totalReads = 0, swapped = false;
  mkdirSync(nested); mkdirSync(outside);
  writeFileSync(join(nested, 'data.txt'), 'original'); writeFileSync(join(outside, 'data.txt'), 'outside fixture');
  const outsideInode = statSync(join(outside, 'data.txt')).ino;
  const originalRead = fs.readSync;
  const reader = spyOn(fs, 'readSync').mockImplementation(((...args: any[]) => {
    totalReads++;
    if (fs.fstatSync(args[0]).ino === outsideInode) outsideReads++;
    return (originalRead as any)(...args);
  }) as typeof fs.readSync);
  try {
    expect(() => observeCleanupLoss(f.target, { env: process.env, deadline: Date.now() + 10_000,
      after_directory_open(relative) {
        if (relative !== 'nested' || swapped) return;
        swapped = true; renameSync(nested, moved); symlinkSync(outside, nested);
      },
    })).toThrow('changed');
    expect(swapped).toBe(true); expect(totalReads).toBeGreaterThan(0); expect(outsideReads).toBe(0);
  } finally { reader.mockRestore(); f.cleanup(); }
});
