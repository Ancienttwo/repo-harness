import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  advanceArchitectureDriftCursor,
  architectureDriftSourceEvent,
  computeArchitectureDriftChangedSet,
  readArchitectureDriftCursor,
} from '../src/cli/hook/architecture-drift';

// The changed-set authority that replaces the post-edit journal as the
// architecture cascade / projection feed. Every fixture mutates files the way
// a shell-writing session does (plain fs writes plus git commands), never
// through a hook payload, because observing exactly those mutations is the
// reason this module exists.

const workspaces: string[] = [];

afterEach(() => {
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture(): string {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-drift-')));
  workspaces.push(cwd);
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'architecture-drift@example.com']);
  git(cwd, ['config', 'user.name', 'Architecture Drift Test']);
  // The managed gitignore block covers .ai/harness/state/ in a real
  // repository; without it the cursor slot would report itself as drift.
  writeFileSync(join(cwd, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'seed']);
  return cwd;
}

function write(cwd: string, path: string, content: string): void {
  mkdirSync(join(cwd, path, '..'), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function commitAll(cwd: string, message: string): string {
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

describe('architecture drift changed set', () => {
  test('re-anchors and reports working-tree entries when no cursor exists', () => {
    const cwd = fixture();
    write(cwd, 'src/shell-written.ts', 'export const value = 1;\n');
    const head = git(cwd, ['rev-parse', 'HEAD']);

    const changed = computeArchitectureDriftChangedSet(cwd);

    expect(changed.cursorSha).toBeNull();
    expect(changed.headSha).toBe(head);
    expect(changed.paths).toEqual(['src/shell-written.ts']);
    expect(changed.warnings).toHaveLength(1);
    expect(changed.warnings[0]).toContain('drift cursor (missing) is unresolvable');
    expect(changed.warnings[0]).toContain(head);
  });

  test('unions the commit range since the cursor with the working tree', () => {
    const cwd = fixture();
    write(cwd, 'src/first.ts', 'export const first = 1;\n');
    const anchor = commitAll(cwd, 'first');
    advanceArchitectureDriftCursor(cwd, anchor);

    write(cwd, 'src/second.ts', 'export const second = 2;\n');
    const head = commitAll(cwd, 'second');
    write(cwd, 'src/third.ts', 'export const third = 3;\n');
    write(cwd, 'src/first.ts', 'export const first = 11;\n');

    const changed = computeArchitectureDriftChangedSet(cwd);

    expect(changed.cursorSha).toBe(anchor);
    expect(changed.headSha).toBe(head);
    expect(changed.paths).toEqual(['src/first.ts', 'src/second.ts', 'src/third.ts']);
    expect(changed.warnings).toEqual([]);
  });

  test('reports nothing extra when the cursor is already at HEAD with a clean tree', () => {
    const cwd = fixture();
    const head = git(cwd, ['rev-parse', 'HEAD']);
    advanceArchitectureDriftCursor(cwd, head);

    const changed = computeArchitectureDriftChangedSet(cwd);

    expect(changed.paths).toEqual([]);
    expect(changed.warnings).toEqual([]);
    expect(architectureDriftSourceEvent(changed)).toBeNull();
  });

  test('carries both sides of a rename, deletions, and files inside untracked directories', () => {
    const cwd = fixture();
    write(cwd, 'src/renamed-from.ts', 'export const moved = 1;\n');
    write(cwd, 'src/removed.ts', 'export const removed = 1;\n');
    const anchor = commitAll(cwd, 'seed rename inputs');
    advanceArchitectureDriftCursor(cwd, anchor);

    git(cwd, ['mv', 'src/renamed-from.ts', 'src/renamed-to.ts']);
    unlinkSync(join(cwd, 'src/removed.ts'));
    write(cwd, 'packages/new-package/src/index.ts', 'export const added = 1;\n');
    write(cwd, 'packages/new-package/package.json', '{"name":"new-package"}\n');

    const changed = computeArchitectureDriftChangedSet(cwd);

    expect(changed.paths).toEqual([
      'packages/new-package/package.json',
      'packages/new-package/src/index.ts',
      'src/removed.ts',
      'src/renamed-from.ts',
      'src/renamed-to.ts',
    ]);
  });

  test('re-anchors with a note when the stored cursor commit no longer resolves', () => {
    const cwd = fixture();
    advanceArchitectureDriftCursor(cwd, 'b'.repeat(40));
    write(cwd, 'src/after-gc.ts', 'export const value = 1;\n');

    const changed = computeArchitectureDriftChangedSet(cwd);

    expect(changed.paths).toEqual(['src/after-gc.ts']);
    expect(changed.warnings[0]).toContain(`drift cursor ${'b'.repeat(40)} is unresolvable`);
  });

  test('drops a working-tree entry that canonicalizes outside the repository', () => {
    const cwd = fixture();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-drift-outside-')));
    workspaces.push(outside);
    writeFileSync(join(outside, 'foreign.ts'), 'export const foreign = 1;\n');
    symlinkSync(outside, join(cwd, 'escape'));
    write(cwd, 'src/inside.ts', 'export const inside = 1;\n');

    expect(computeArchitectureDriftChangedSet(cwd).paths).toEqual(['src/inside.ts']);
  });

  test('reports git unavailability outside a repository instead of throwing', () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-drift-nogit-')));
    workspaces.push(outside);

    const changed = computeArchitectureDriftChangedSet(outside);

    expect(changed).toMatchObject({ headSha: null, cursorSha: null, paths: [] });
    expect(changed.warnings).toEqual(['[ArchitectureDrift] git changed set unavailable; no architecture changed set for this run']);
  });
});

describe('architecture drift cursor slot', () => {
  test('keeps exactly one slot and reads back what it wrote', () => {
    const cwd = fixture();
    const head = git(cwd, ['rev-parse', 'HEAD']);

    expect(readArchitectureDriftCursor(cwd)).toBeNull();
    advanceArchitectureDriftCursor(cwd, head, new Date('2026-08-12T00:00:00.000Z'));
    expect(readArchitectureDriftCursor(cwd)).toEqual({
      version: 1,
      head_sha: head,
      updated_at: '2026-08-12T00:00:00.000Z',
    });

    advanceArchitectureDriftCursor(cwd, 'a'.repeat(40), new Date('2026-08-12T01:00:00.000Z'));
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe('a'.repeat(40));
  });

  test('treats a corrupt or foreign-shaped slot as no cursor', () => {
    const cwd = fixture();
    const cursorPath = join(cwd, '.ai/harness/state/architecture-drift-cursor.json');
    mkdirSync(join(cwd, '.ai/harness/state'), { recursive: true });

    writeFileSync(cursorPath, 'not json\n');
    expect(readArchitectureDriftCursor(cwd)).toBeNull();

    writeFileSync(cursorPath, `${JSON.stringify({ version: 2, head_sha: 'c'.repeat(40), updated_at: 'now' })}\n`);
    expect(readArchitectureDriftCursor(cwd)).toBeNull();

    writeFileSync(cursorPath, `${JSON.stringify({ version: 1, head_sha: 'nope', updated_at: 'now' })}\n`);
    expect(readArchitectureDriftCursor(cwd)).toBeNull();
  });
});

describe('architecture drift source event', () => {
  test('is deterministic over the range and its paths', () => {
    const base = { headSha: 'd'.repeat(40), cursorSha: 'e'.repeat(40), warnings: [] };
    const first = architectureDriftSourceEvent({ ...base, paths: ['src/a.ts', 'src/b.ts'] })!;
    const repeat = architectureDriftSourceEvent({ ...base, paths: ['src/a.ts', 'src/b.ts'] })!;
    const otherPaths = architectureDriftSourceEvent({ ...base, paths: ['src/a.ts'] })!;
    const otherRange = architectureDriftSourceEvent({ ...base, headSha: 'f'.repeat(40), paths: ['src/a.ts', 'src/b.ts'] })!;

    expect(first.event_id).toMatch(/^drift-[a-f0-9]{24}$/);
    expect(repeat.event_id).toBe(first.event_id);
    expect(otherPaths.event_id).not.toBe(first.event_id);
    expect(otherRange.event_id).not.toBe(first.event_id);
    expect(first.changed_paths).toEqual(['src/a.ts', 'src/b.ts']);
    expect(new Set([first, repeat, otherPaths, otherRange].map((event) => event.source_key)).size).toBe(1);
  });

  test('has no delivery to make for an empty changed set', () => {
    expect(architectureDriftSourceEvent({ headSha: 'a'.repeat(40), cursorSha: null, paths: [], warnings: [] })).toBeNull();
  });
});
