import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { platform, tmpdir } from 'os';
import { basename, join } from 'path';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { WorkspaceError, WorkspaceManager } from '../../src/cli/mcp/workspaces';

function withWorkspaceRoot<T>(fn: (root: string, outside: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-workspace-'));
  const outside = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-workspace-outside-'));
  try {
    mkdirSync(join(root, 'docs', 'nested'), { recursive: true });
    mkdirSync(join(root, 'secrets'), { recursive: true });
    writeFileSync(join(root, 'docs', 'readme.md'), '# Readme\n');
    writeFileSync(join(root, 'secrets', 'token.txt'), 'secret\n');
    writeFileSync(join(outside, 'outside.md'), '# Outside\n');
    return fn(root, outside);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

function expectWorkspaceError(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`expected WorkspaceError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(code);
  }
}

const testWindows = platform() === 'win32' ? test : test.skip;

describe('MCP WorkspaceManager', () => {
  test('opens roots and child directories idempotently while enforcing traversal and limits', () => {
    withWorkspaceRoot((root, outside) => {
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [root] });
      const manager = new WorkspaceManager({ allowedRoots: [root], policy, maxWorkspaces: 2 });
      const [allowedRoot] = manager.listAllowedRoots();
      expect(allowedRoot?.id).toMatch(/^root_/);
      expect(allowedRoot?.canonicalPath).toBe(realpathSync(root));

      const rootWorkspace = manager.openWorkspace(allowedRoot.id);
      expect(rootWorkspace.id).toMatch(/^ws_/);
      expect(manager.openWorkspace(allowedRoot.id).id).toBe(rootWorkspace.id);

      const docsWorkspace = manager.openWorkspace(allowedRoot.id, 'docs');
      expect(docsWorkspace.id).not.toBe(rootWorkspace.id);
      expect(manager.openWorkspace(allowedRoot.id, './docs').id).toBe(docsWorkspace.id);

      expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id, '../outside'), 'TRAVERSAL_DENIED');
      expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id, `docs\\..\\${basename(outside)}`), 'TRAVERSAL_DENIED');
      expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id, outside), 'ABSOLUTE_PATH_DENIED');
      expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id, 'C:\\Users\\someone\\repo'), 'ABSOLUTE_PATH_DENIED');
      expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id, 'C:/Users/someone/repo'), 'ABSOLUTE_PATH_DENIED');
      expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id, '\\\\server\\share\\repo'), 'ABSOLUTE_PATH_DENIED');

      mkdirSync(join(root, 'third'));
      expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id, 'third'), 'WORKSPACE_LIMIT_REACHED');
      expectWorkspaceError(() => manager.resolve('ws_missing', '.'), 'WORKSPACE_NOT_FOUND');
    });
  });

  test('marks sensitive allowed roots unreadable and refuses to open them', () => {
    const parent = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-sensitive-root-'));
    try {
      const deniedRootCases = [
        '.git',
        '.ssh',
        'secrets',
        'credentials',
        'private/subdir',
        '.cache',
        'node_modules/pkg',
        'dist',
        'build',
        'coverage',
      ];

      for (const relativeRoot of deniedRootCases) {
        const sensitive = join(parent, ...relativeRoot.split('/'));
        mkdirSync(sensitive, { recursive: true });
        writeFileSync(join(sensitive, 'note.txt'), 'private data\n');

        const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [sensitive] });
        const manager = new WorkspaceManager({ allowedRoots: [sensitive], policy });
        const [allowedRoot] = manager.listAllowedRoots();
        expect(allowedRoot?.canonicalPath).toBe(realpathSync(sensitive));
        expect(allowedRoot?.readable).toBe(false);
        expectWorkspaceError(() => manager.openWorkspace(allowedRoot.id), 'ROOT_DENIED');

        const repoManager = new WorkspaceManager({ allowedRoots: [parent], policy });
        expectWorkspaceError(() => repoManager.ensureAllowedRoot(sensitive), 'ROOT_DENIED');
      }

      const symlinkTarget = join(parent, '.cache', 'via-link');
      const symlinkRoot = join(parent, 'linked-cache');
      mkdirSync(symlinkTarget, { recursive: true });
      symlinkSync(symlinkTarget, symlinkRoot, platform() === 'win32' ? 'junction' : 'dir');
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [symlinkRoot] });
      const manager = new WorkspaceManager({ allowedRoots: [symlinkRoot], policy });
      const [allowedRoot] = manager.listAllowedRoots();
      expect(allowedRoot?.canonicalPath).toBe(realpathSync(symlinkTarget));
      expect(allowedRoot?.readable).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test('revalidates roots and blocks symlink escapes, denied targets, and removed workspaces', () => {
    withWorkspaceRoot((root, outside) => {
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [root] });
      const manager = new WorkspaceManager({ allowedRoots: [root], policy });
      const [allowedRoot] = manager.listAllowedRoots();
      const workspace = manager.openWorkspace(allowedRoot.id);

      try {
        symlinkSync(join(root, 'docs', 'readme.md'), join(root, 'inside-link.md'));
        symlinkSync(join(outside, 'outside.md'), join(root, 'outside-link.md'));
        symlinkSync(join(root, 'secrets', 'token.txt'), join(root, 'secret-link.txt'));
        symlinkSync(join(root, 'docs'), join(root, 'docs-link'));
      } catch (_error) {
        return;
      }

      const inside = manager.resolve(workspace.id, 'inside-link.md', { requireFile: true });
      expect(inside.kind).toBe('symlink');
      expect(inside.canonicalPath).toBe(realpathSync(join(root, 'docs', 'readme.md')));

      const directoryLink = manager.resolve(workspace.id, 'docs-link');
      expect(directoryLink.kind).toBe('symlink');

      expectWorkspaceError(() => manager.resolve(workspace.id, 'outside-link.md', { requireFile: true }), 'OUTSIDE_ROOT');
      expectWorkspaceError(() => manager.resolve(workspace.id, 'secret-link.txt', { requireFile: true }), 'PATH_DENIED');
      expectWorkspaceError(() => manager.resolve(workspace.id, 'secrets', { requireDirectory: true }), 'PATH_DENIED');

      rmSync(root, { recursive: true, force: true });
      expectWorkspaceError(() => manager.resolve(workspace.id, '.'), 'PATH_NOT_FOUND');
    });
  });

  testWindows('blocks Windows junction escapes from allowed workspace roots', () => {
    withWorkspaceRoot((root, outside) => {
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [root] });
      const manager = new WorkspaceManager({ allowedRoots: [root], policy });
      const [allowedRoot] = manager.listAllowedRoots();
      const workspace = manager.openWorkspace(allowedRoot.id);

      try {
        symlinkSync(outside, join(root, 'outside-junction'), 'junction');
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'ENOTSUP' || code === 'EINVAL') return;
        throw error;
      }

      expectWorkspaceError(() => manager.resolve(workspace.id, 'outside-junction', { requireDirectory: true }), 'OUTSIDE_ROOT');
    });
  });
});
