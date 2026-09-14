import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  acknowledgeArchitectureProjectionPublication,
  advanceArchitectureDriftCursor,
  architectureDriftSourceEvent,
  computeArchitectureDriftChangedSet,
  drainArchitectureDriftCascade,
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
    advanceArchitectureDriftCursor(cwd, anchor, null);

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
    advanceArchitectureDriftCursor(cwd, head, null);

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
    advanceArchitectureDriftCursor(cwd, anchor, null);

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
    advanceArchitectureDriftCursor(cwd, 'b'.repeat(40), null);
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
    advanceArchitectureDriftCursor(cwd, head, null, new Date('2026-08-12T00:00:00.000Z'));
    expect(readArchitectureDriftCursor(cwd)).toEqual({
      version: 1,
      head_sha: head,
      updated_at: '2026-08-12T00:00:00.000Z',
    });

    advanceArchitectureDriftCursor(cwd, 'a'.repeat(40), head, new Date('2026-08-12T01:00:00.000Z'));
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

describe('architecture projection publication acknowledgement', () => {
  function publicationFixture(): { cwd: string; publication: string } {
    const cwd = fixture();
    write(cwd, 'docs/architecture/.projection-manifest.json', '{"version":1}\n');
    commitAll(cwd, 'projection baseline');
    write(cwd, 'docs/architecture/.projection-manifest.json', '{"version":2}\n');
    git(cwd, ['add', '-A']);
    git(cwd, [
      'commit',
      '-m',
      'feat(contract): complete projection-fixture',
      '-m',
      `Source-Worktree-Head: ${'a'.repeat(40)}`,
    ]);
    return { cwd, publication: git(cwd, ['rev-parse', 'HEAD']) };
  }

  test('advances the cursor to a clean synthesized publication that changed the manifest', () => {
    const { cwd, publication } = publicationFixture();

    const acknowledgement = acknowledgeArchitectureProjectionPublication(
      cwd,
      publication,
      new Date('2026-08-20T08:00:00.000Z'),
    );

    expect(acknowledgement).toEqual({
      schemaVersion: 'repo-harness.architecture-projection-publication-ack/v1',
      publicationSha: publication,
      manifestDigest: `sha256:${createHash('sha256').update('{"version":2}\n').digest('hex')}`,
      cursorSha: publication,
    });
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(publication);
    expect(computeArchitectureDriftChangedSet(cwd).paths).toEqual([]);
  });

  test('rejects a non-HEAD publication, a dirty manifest, and a commit without a manifest delta', () => {
    const { cwd, publication } = publicationFixture();
    const parent = git(cwd, ['rev-parse', 'HEAD^']);

    expect(() => acknowledgeArchitectureProjectionPublication(cwd, parent)).toThrow('not checked-out HEAD');

    write(cwd, 'docs/architecture/.projection-manifest.json', '{"dirty":true}\n');
    expect(() => acknowledgeArchitectureProjectionPublication(cwd, publication)).toThrow('tracked changes');
    git(cwd, ['checkout', '--', 'docs/architecture/.projection-manifest.json']);

    git(cwd, ['commit', '--allow-empty', '-m', 'feat(contract): complete empty', '-m', `Source-Worktree-Head: ${'b'.repeat(40)}`]);
    const emptyPublication = git(cwd, ['rev-parse', 'HEAD']);
    expect(() => acknowledgeArchitectureProjectionPublication(cwd, emptyPublication)).toThrow('did not change the projection manifest');
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

describe('resumable legacy cascade', () => {
  test('real CLI drain crosses an unmapped workspace file and queues the mapped tail', () => {
    const cwd = fixture();
    const cli = join(import.meta.dir, '../src/cli/index.ts');
    const fixtureHome = realpathSync(mkdtempSync(join(tmpdir(), 'drift-unmapped-home-')));
    workspaces.push(fixtureHome);
    symlinkSync(join(import.meta.dir, '../scripts'), join(cwd, 'scripts'));
    write(cwd, '.gitignore', '.ai/harness/\nscripts\n');
    write(cwd, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'archcontext' } }));
    write(cwd, '.archcontext/model/nodes/capability.sdk.sdk-root.yaml', [
      'schemaVersion: archcontext.node/v2', 'id: capability.sdk.sdk-root',
      'kind: capability', 'name: SDK', 'status: active', 'summary: SDK source',
      'responsibilities: [Own SDK source]', 'source:', '  include: [src/**]',
      'extensions:', '  contractFiles:', '    agents: src/AGENTS.md', '    claude: src/CLAUDE.md',
      '  lspProfile: typescript-lsp', '  verification: []',
    ].join('\n'));
    write(cwd, 'src/index.ts', 'export const sdk = 1;');
    write(cwd, 'docs/architecture/index.md', '# Architecture\n\n## Pending Requests\n');
    const anchor = commitAll(cwd, 'capability baseline');
    advanceArchitectureDriftCursor(cwd, anchor, null);
    write(cwd, 'pnpm-workspace.yaml', 'packages: [src]\n');
    write(cwd, 'src/index.ts', 'export const sdk = 2;');
    const head = commitAll(cwd, 'workspace and SDK changes');
    const result = spawnSync(process.execPath, [cli, 'architecture-projection', 'drain', '--json'], {
      cwd, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, HOME: fixtureHome, REPO_HARNESS_CLI: cli },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe('disabled');
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(head);
    const queue = readFileSync(join(cwd, '.ai/harness/capability-context/requests.jsonl'), 'utf8')
      .trim().split('\n').map(line => JSON.parse(line));
    expect(queue.map(entry => entry.capability_id)).toEqual(['sdk-sdk-root']);
    expect(readFileSync(join(cwd, 'docs/architecture/requests/root.md'), 'utf8')).toContain('pnpm-workspace.yaml');
  }, 35_000);

  test('drains a 1592-path backlog across bounded retries without replaying the prefix', () => {
    const cwd = fixture();
    const anchor = git(cwd, ['rev-parse', 'HEAD']);
    advanceArchitectureDriftCursor(cwd, anchor, null);
    const paths = Array.from({ length: 1592 }, (_, i) => `src/${String(i).padStart(4, '0')}.ts`);
    const changed = { cursorSha: anchor, headSha: anchor, paths, warnings: [] };
    const delivered: string[] = [];
    let runs = 0;
    while (delivered.length < paths.length) {
      let clock = 0;
      runs += 1;
      try {
        drainArchitectureDriftCascade(cwd, changed, (path) => { delivered.push(path); clock += 1000; },
          { deadlineMs: 20_000, nowMs: () => clock });
      } catch (error) {
        expect(String(error)).toContain('deadline exhausted');
      }
      if (runs > 80) throw new Error('backlog did not converge');
    }
    expect(runs).toBe(80);
    expect(delivered).toEqual(paths);
  });

  test('retries the failed path but not its completed predecessor', () => {
    const cwd = fixture();
    const changed = { ...computeArchitectureDriftChangedSet(cwd), paths: ['a.ts', 'b.ts', 'c.ts'] };
    const calls: string[] = [];
    const budget = { deadlineMs: 20_000, nowMs: () => 0 };
    expect(() => drainArchitectureDriftCascade(cwd, changed, (path) => {
      calls.push(path);
      if (path === 'b.ts') throw new Error('follow-up failed');
    }, budget)).toThrow('follow-up failed');
    expect(readArchitectureDriftCursor(cwd)).toBeNull();
    drainArchitectureDriftCascade(cwd, changed, (path) => { calls.push(path); }, budget);
    expect(calls).toEqual(['a.ts', 'b.ts', 'b.ts', 'c.ts']);
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(changed.headSha!);
  });

  test('rejects malformed progress without acknowledging or delivering paths', () => {
    const cwd = fixture();
    write(cwd, '.ai/harness/state/architecture-drift-cascade.json', '{"version":1,"completed":999}');
    let called = false;
    expect(() => drainArchitectureDriftCascade(cwd, computeArchitectureDriftChangedSet(cwd),
      () => { called = true; }, { deadlineMs: 20_000, nowMs: () => 0 })).toThrow('invalid architecture drift cascade batch');
    expect(called).toBe(false);
    expect(readArchitectureDriftCursor(cwd)).toBeNull();
  });

  test('manual CLI drain resumes a failed batch and preserves its JSON contract', () => {
    const cwd = fixture();
    advanceArchitectureDriftCursor(cwd, git(cwd, ['rev-parse', 'HEAD']), null);
    write(cwd, 'a.ts', 'export const a = 1;');
    write(cwd, 'b.ts', 'export const b = 1;');
    const head = commitAll(cwd, 'backlog');
    const stubRoot = realpathSync(mkdtempSync(join(tmpdir(), 'drift-cli-helper-')));
    workspaces.push(stubRoot);
    const calls = join(stubRoot, 'calls.txt');
    const failed = join(stubRoot, 'failed');
    const stub = join(stubRoot, 'stub.ts');
    writeFileSync(stub, [
      "import { appendFileSync, existsSync, writeFileSync } from 'fs';",
      "if (process.argv[3] === 'architecture-queue') {",
      " const path = process.argv.at(-1); appendFileSync(process.env.DRIFT_CALLS!, path + '\\n');",
      " if (path === 'b.ts' && !existsSync(process.env.DRIFT_FAILED!)) { writeFileSync(process.env.DRIFT_FAILED!, 'yes'); process.exit(9); }",
      "}",
    ].join('\n'));
    const run = () => spawnSync(process.execPath, [join(import.meta.dir, '../src/cli/index.ts'), 'architecture-projection', 'drain', '--json'],
      { cwd, encoding: 'utf8', env: { ...process.env, HOME: stubRoot, REPO_HARNESS_CLI: stub, DRIFT_CALLS: calls, DRIFT_FAILED: failed } });
    const first = run();
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('architecture-queue exited 9');
    const second = run();
    expect(second.status).toBe(0);
    expect(JSON.parse(second.stdout).status).toBe('disabled');
    expect(readFileSync(calls, 'utf8').trim().split('\n')).toEqual(['a.ts', 'b.ts', 'b.ts']);
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(head);
  });

  test('does not rewind a cursor acknowledged by another projection', () => {
    const cwd = fixture();
    const changed = { ...computeArchitectureDriftChangedSet(cwd), paths: ['a.ts', 'b.ts'] };
    const budget = { deadlineMs: 20_000, nowMs: () => 0 };
    expect(() => drainArchitectureDriftCascade(cwd, changed, () => { throw new Error('interrupted'); }, budget)).toThrow();
    write(cwd, 'new.ts', 'export const value = 1;');
    const newHead = commitAll(cwd, 'new head');
    advanceArchitectureDriftCursor(cwd, newHead, null);
    expect(() => drainArchitectureDriftCascade(cwd, changed, () => {}, budget)).toThrow('cursor changed before cascade');
    const calls: string[] = [];
    drainArchitectureDriftCascade(cwd, computeArchitectureDriftChangedSet(cwd), (path) => { calls.push(path); }, budget);
    expect(calls).toEqual(['a.ts', 'b.ts']);
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(newHead);
  });
});
