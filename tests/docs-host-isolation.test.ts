import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDocsHostRuntimeId } from '../src/core/operator/docs-host-runtimes';
import { darwinTest } from './helpers/darwin-test';
import { tmpWorkspace } from './helpers/repo-fixture';
import { assertDocsHostPlatform, DOCS_HOST_PROJECTION_MANIFEST, docsHostProtectedProjection } from '../src/effects/review/docs-host-isolation';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

test('docs host refuses Linux and Windows with platform_unsupported', () => {
  for (const platform of ['linux', 'win32'] as const) {
    expect(() => assertDocsHostPlatform(platform)).toThrow('platform_unsupported');
  }
  // The launch allowlist is empty (#1234), so no runtime may start a docs host.
  for (const runtime of ['codex', 'claude', 'pi']) expect(isDocsHostRuntimeId(runtime)).toBe(false);
});

darwinTest('docs host protected projection refuses a symlink on a protected path', () => {
  const worktree = tmpWorkspace('docs-host'); roots.push(worktree);
  const docs = join(worktree, 'docs'), target = join(docs, 'architecture', 'index.md'), manifest = join(docs, 'architecture', '.projection-manifest.json');
  write(join(docs, 'guide.md'), '# Guide\n');
  write(target, 'GENERATED');
  write(manifest, JSON.stringify({ targets: { 'projection_target.architecture.index': { path: 'docs/architecture/index.md', ownership: 'mixed' } } }));
  // A symlink on a protected path would route a write to an open docs/ file. Each alias is restored after its check.
  rmSync(target); symlinkSync('../guide.md', target);
  expect(() => docsHostProtectedProjection(worktree)).toThrow('docs_host_projection_symlink_unsupported');
  rmSync(target); writeFileSync(target, 'GENERATED');
  renameSync(join(docs, 'architecture'), join(docs, 'real-architecture')); symlinkSync('real-architecture', join(docs, 'architecture'));
  expect(() => docsHostProtectedProjection(worktree)).toThrow('docs_host_projection_symlink_unsupported');
  rmSync(join(docs, 'architecture')); renameSync(join(docs, 'real-architecture'), join(docs, 'architecture'));
  renameSync(manifest, join(docs, 'manifest-source.json')); symlinkSync('../manifest-source.json', manifest);
  expect(() => docsHostProtectedProjection(worktree)).toThrow('docs_host_projection_symlink_unsupported');
  rmSync(manifest); renameSync(join(docs, 'manifest-source.json'), manifest);
  expect(() => docsHostProtectedProjection(worktree)).not.toThrow();
  rmSync(manifest);
  expect(docsHostProtectedProjection(worktree)).toContain(join(worktree, DOCS_HOST_PROJECTION_MANIFEST));
});
