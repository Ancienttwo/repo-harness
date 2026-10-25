import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { acceptanceReceiptPath } from '../../scripts/acceptance-receipt';
import {
  gatesDirectoryName,
  resolveRepositoryIdentity,
  taskSessionKey,
  taskWorkspaceKey,
  worktreeTrashPrefix,
} from '../../src/effects/git/repository-identity';
import { taskRepository } from '../../src/effects/git/task-repository';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function git(cwd: string, args: readonly string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'ignore' });
}

/** A clone with one commit and two linked worktrees beside its primary checkout. */
function clone(): { base: string; primary: string; linkedA: string; linkedB: string } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'repository-identity-')));
  roots.push(base);
  const primary = join(base, 'primary');
  mkdirSync(primary);
  git(primary, ['init', '-q', '-b', 'main']);
  writeFileSync(join(primary, 'README.md'), 'x\n');
  git(primary, ['add', 'README.md']);
  git(primary, ['commit', '-qm', 'seed']);
  const linkedA = join(base, 'linked-a');
  const linkedB = join(base, 'linked-b');
  git(primary, ['worktree', 'add', '-qb', 'a', linkedA]);
  git(primary, ['worktree', 'add', '-qb', 'b', linkedB]);
  return { base, primary, linkedA, linkedB };
}

describe('repository identity', () => {
  test('linked worktrees of one clone share the repository id and keep distinct worktree ids', () => {
    const { primary, linkedA, linkedB } = clone();

    const ids = [primary, linkedA, linkedB].map((root) => resolveRepositoryIdentity(root));

    expect(new Set(ids.map((id) => id.repositoryId))).toEqual(new Set([join(primary, '.git')]));
    expect(ids.map((id) => id.worktreeId)).toEqual([primary, linkedA, linkedB]);
    expect(new Set(ids.map((id) => gatesDirectoryName(id.worktreeId))).size).toBe(3);
    expect(new Set(ids.map((id) => worktreeTrashPrefix(id.repositoryId))).size).toBe(1);
  });

  test('a subdirectory or a symlinked path resolves to the canonical ids of its checkout', () => {
    const { base, linkedA } = clone();
    mkdirSync(join(linkedA, 'src/deep'), { recursive: true });
    symlinkSync(linkedA, join(base, 'alias'));

    expect(resolveRepositoryIdentity(join(linkedA, 'src/deep'))).toEqual(resolveRepositoryIdentity(linkedA));
    expect(resolveRepositoryIdentity(join(base, 'alias'))).toEqual(resolveRepositoryIdentity(linkedA));
  });

  test('the task repository record is built from the same two ids', () => {
    const { primary, linkedA } = clone();
    const identity = resolveRepositoryIdentity(linkedA);

    expect(taskRepository(linkedA)).toEqual({ repository_id: identity.repositoryId, primary_root: primary, execution_root: identity.worktreeId });
  });

  test('the gates directory of an acceptance receipt is the worktree projection', () => {
    const { base, linkedA } = clone();
    const home = join(base, 'home');
    mkdirSync(home);

    const path = acceptanceReceiptPath(linkedA, home);

    expect(dirname(path)).toBe(join(home, '.repo-harness/gates', gatesDirectoryName(resolveRepositoryIdentity(linkedA).worktreeId)));
  });

  test('projections keep the bytes of the stored identifiers they replace', () => {
    expect(worktreeTrashPrefix('/repo/.git')).toBe('.repo-harness-wt-trash-6b4ca2db35cfaf43d6963005a8445402-');
    expect(taskSessionKey('/repo/.git', 'T-1', 'reviewer')).toBe('9d65e02e90825e67315c1adbb934fb10208c96acc0b27f5261babe7ba305de9f');
    expect(taskWorkspaceKey('/repo/.git', '/repo-wt')).toBe('c3516ff4059043457685cc6a6b3e55e4c10d5266d870d6b68104a6c52c28cb83');
    expect(gatesDirectoryName('/repo-wt')).toBe('d63c3e1ee57cbf91184ddda1706f5b65f94d96f82c6c8f9dce01a2143a3fcd21');
  });
});
