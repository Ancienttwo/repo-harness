import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { owedStateCommand } from '../src/cli/commands/state';
import {
  owedCapabilities,
  renderOwedCapabilities,
  PROJECTION_MANIFEST_PATH,
} from '../src/effects/state/owed-capabilities';
import { resolveCapabilityOwnership } from '../src/effects/state/resolve-effective-state';

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(cwd: string, path: string, content: string): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function commit(cwd: string, message: string): void {
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-q', '-m', message]);
}

/**
 * A registry-mode repository: `src/owned` belongs to `core-owned`, `main`
 * holds the projection manifest, and the work happens on `feature`.
 */
function ownedRepo(options: { readonly manifest?: boolean } = {}): string {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'owed-capabilities-')));
  roots.push(cwd);
  git(cwd, ['init', '-q', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'owed@example.com']);
  git(cwd, ['config', 'user.name', 'Owed Fixture']);
  write(cwd, '.gitignore', '.ai/harness/state/\n');
  write(cwd, '.ai/harness/policy.json', `${JSON.stringify({ context: { capability_registry_file: '.ai/context/capabilities.json' } })}\n`);
  write(cwd, '.ai/context/capabilities.json', `${JSON.stringify({
    version: 1,
    capabilities: [{
      id: 'core-owned',
      domain: 'core',
      name: 'owned',
      prefixes: ['src/owned'],
      contract_files: { agents: 'AGENTS.md', claude: 'CLAUDE.md' },
      architecture_module: 'docs/architecture/modules/core/owned.md',
      workstream_dir: 'tasks/workstreams/core/owned',
      lsp_profile: 'typescript-lsp',
      verification_hints: [],
    }],
  })}\n`);
  write(cwd, 'src/owned/a.ts', 'export const a = 1;\n');
  write(cwd, 'src/loose/existing.ts', 'export const existing = 1;\n');
  if (options.manifest !== false) write(cwd, PROJECTION_MANIFEST_PATH, '{"projectionDigest":"one"}\n');
  commit(cwd, 'base');
  git(cwd, ['checkout', '-q', '-b', 'feature']);
  return cwd;
}

function owedFor(cwd: string) {
  return owedCapabilities(cwd, resolveCapabilityOwnership(cwd, 'main'));
}

describe('owed-capability rule', () => {
  test('an edit of an owned file makes its capability owed and renders the line', () => {
    const cwd = ownedRepo();
    write(cwd, 'src/owned/a.ts', 'export const a = 2;\n');
    commit(cwd, 'change owned code');

    const owed = owedFor(cwd);
    expect(owed).toMatchObject({
      status: 'owed',
      manifest_change: null,
      capabilities: [{ id: 'core-owned', module_document: 'docs/architecture/modules/core/owned.md', paths: ['src/owned/a.ts'] }],
      new_unowned_paths: [],
    });
    const line = renderOwedCapabilities(owed)!;
    expect(line.split('\n')).toHaveLength(2);
    expect(line).toContain('[ArchitectureOwed]');
    expect(line).toContain('core-owned (docs/architecture/modules/core/owned.md)');
    expect(line).toContain('repo-harness architecture-projection check --json');
    expect(line).toContain('assets/skill-commands/repo-harness-architecture/references/worker.md');
  });

  test('no line when the manifest changed later in the branch; a later edit owes again', () => {
    const cwd = ownedRepo();
    write(cwd, 'src/owned/a.ts', 'export const a = 2;\n');
    commit(cwd, 'change owned code');
    write(cwd, PROJECTION_MANIFEST_PATH, '{"projectionDigest":"two"}\n');
    commit(cwd, 'refresh the projection');

    const cleared = owedFor(cwd)!;
    expect(cleared.status).toBe('clear');
    expect(cleared.manifest_change).toBe(git(cwd, ['rev-parse', 'HEAD']));
    expect(renderOwedCapabilities(cleared)).toBeNull();

    // An uncommitted edit after the manifest commit is after it.
    write(cwd, 'src/owned/a.ts', 'export const a = 3;\n');
    expect(owedFor(cwd)!.capabilities.map((capability) => capability.id)).toEqual(['core-owned']);

    // An uncommitted manifest change is the newest change, so nothing is owed.
    write(cwd, PROJECTION_MANIFEST_PATH, '{"projectionDigest":"three"}\n');
    expect(owedFor(cwd)).toMatchObject({ status: 'clear', manifest_change: 'working-tree' });
  });

  test('the manifest commit itself is not "after"; only new unowned files are listed', () => {
    const cwd = ownedRepo();
    write(cwd, 'src/owned/a.ts', 'export const a = 2;\n');
    write(cwd, PROJECTION_MANIFEST_PATH, '{"projectionDigest":"two"}\n');
    commit(cwd, 'change owned code with its projection');
    expect(owedFor(cwd)!.status).toBe('clear');

    write(cwd, 'src/owned/a.ts', 'export const a = 3;\n');
    write(cwd, 'src/loose/existing.ts', 'export const existing = 2;\n');
    write(cwd, 'src/loose/new.ts', 'export const added = 1;\n');
    const owed = owedFor(cwd)!;
    expect(owed.status).toBe('owed');
    expect(owed.new_unowned_paths).toEqual(['src/loose/new.ts']);
    expect(renderOwedCapabilities(owed)).toContain('New unowned source paths: src/loose/new.ts.');
  });

  test('a checkout without a projection manifest is not projected and owes nothing', () => {
    const cwd = ownedRepo({ manifest: false });
    write(cwd, 'src/owned/a.ts', 'export const a = 2;\n');
    expect(owedFor(cwd)).toMatchObject({ status: 'not_projected', capabilities: [] });
    expect(renderOwedCapabilities(owedFor(cwd))).toBeNull();
  });

  test('state owed --json applies the same rule to a base ref and never blocks', () => {
    const cwd = ownedRepo();
    write(cwd, 'src/owned/a.ts', 'export const a = 2;\n');
    commit(cwd, 'change owned code');
    const outcome = owedStateCommand({ base: 'main' }, {
      repoRoot: cwd,
      resolveOwnership: resolveCapabilityOwnership,
      owed: owedCapabilities,
    });
    expect(outcome.exitCode).toBe(0);
    expect(JSON.parse(outcome.stdout)).toEqual({
      protocol: 1,
      kind: 'repo-harness-owed-capabilities',
      base: 'main',
      status: 'owed',
      review_base: git(cwd, ['rev-parse', 'main']),
      manifest_change: null,
      capabilities: [{ id: 'core-owned', module_document: 'docs/architecture/modules/core/owned.md', paths: ['src/owned/a.ts'] }],
      new_unowned_paths: [],
      next: [
        'repo-harness architecture-projection check --json',
        'assets/skill-commands/repo-harness-architecture/references/worker.md',
      ],
    });

    const unknownBase = owedStateCommand({ base: 'no-such-ref' }, {
      repoRoot: cwd,
      resolveOwnership: resolveCapabilityOwnership,
      owed: owedCapabilities,
    });
    expect(unknownBase.exitCode).toBe(1);
    expect(unknownBase.stderr).toContain('review subject is unavailable');
  });
});
