import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, test } from 'bun:test';
import { repoHarnessRepoIdFor, setRepoHarnessAccessMode } from '../../src/effects/repo-registry';
import { callCodingTool, recordCodingProcessCompletion, type CodingToolContext } from '../../src/cli/mcp/coding-tools';
import {
  cleanupManagedCodingWorkspace,
  CodingWorkspaceError,
  CodingWorkspaceManager,
  listManagedCodingWorkspaces,
} from '../../src/cli/mcp/coding-workspaces';
import { McpProcessSessionManager } from '../../src/cli/mcp/process-sessions';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import type { GeneralRepoCodeGraphAdapter } from '../../src/cli/mcp/codegraph-adapter';
import { createCodeGraphCliAdapter } from '../../src/cli/mcp/codegraph-adapter';

const temporaryRoots: string[] = [];

function temporary(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(path);
  return path;
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parse(result: Awaited<ReturnType<typeof callCodingTool>>): any {
  return JSON.parse(result.content[0]?.text ?? '{}');
}

function fixture(): {
  repo: string;
  home: string;
  env: NodeJS.ProcessEnv;
  manager: CodingWorkspaceManager;
  processManager: McpProcessSessionManager;
  ctx: CodingToolContext;
  repoId: string;
} {
  const repo = temporary('repo-harness-coding-repo-');
  const home = temporary('repo-harness-coding-home-');
  mkdirSync(join(repo, '.ai/harness'), { recursive: true });
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, '_ops'), { recursive: true });
  mkdirSync(join(repo, '_ref'), { recursive: true });
  writeFileSync(join(repo, '.ai/harness/policy.json'), '{}\n');
  writeFileSync(join(repo, 'AGENTS.md'), '# Local instructions\n');
  writeFileSync(join(repo, 'src/a.txt'), 'alpha\n');
  writeFileSync(join(repo, 'src/b.txt'), 'bravo\n');
  writeFileSync(join(repo, '.env'), 'TOKEN=secret\n');
  writeFileSync(join(repo, '_ops/secret.txt'), 'secret\n');
  writeFileSync(join(repo, '_ref/reference.txt'), 'reference\n');
  writeFileSync(join(repo, '.ignore'), 'ignored.txt\n');
  writeFileSync(join(repo, '.gitignore'), '.ai/harness/mcp/\n');
  writeFileSync(join(repo, 'ignored.txt'), 'ignored\n');
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'tests@example.com');
  git(repo, 'config', 'user.name', 'Repo Harness Tests');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'fixture');

  const env = { ...process.env, REPO_HARNESS_HOME: home };
  const grant = setRepoHarnessAccessMode(repo, 'read_write', { env });
  expect(grant.authorizationRevision).toBe(1);
  const manager = new CodingWorkspaceManager(env);
  const adapter: GeneralRepoCodeGraphAdapter = {
    discoverRepo: () => ({ available: true, integrated: true, source: 'test-double', indexRevision: 'idx_1', files: [], latencyMs: 0 }),
    refreshRepo: (_root, opts = {}) => ({
      available: true,
      refreshed: true,
      integrated: true,
      source: 'test-double',
      indexRevision: 'idx_2',
      latencyMs: 0,
      strategy: 'repo-sync',
      requestedPaths: opts.paths ?? [],
      pathRefreshSupported: false,
      files: 2,
    }),
  };
  let ctx!: CodingToolContext;
  const processManager = new McpProcessSessionManager({
    baseEnv: env,
    onComplete: (event) => recordCodingProcessCompletion(ctx, event),
  });
  ctx = {
    repoRoot: repo,
    policy: getMcpPolicy('coding'),
    ownerId: 'owner-test',
    workspaceManager: manager,
    processManager,
    codeGraphAdapter: adapter,
  };
  return { repo, home, env, manager, processManager, ctx, repoId: repoHarnessRepoIdFor(grant.path) };
}

afterEach(() => {
  delete process.env.REPO_HARNESS_MCP_CODING_PATCH_FAULT_AFTER;
  for (const path of temporaryRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('coding MCP workspace and file tools', () => {
  test('defaults to an isolated worktree without exposing absolute paths and supports guarded patch plus shell', async () => {
    const state = fixture();
    try {
      const opened = parse(await callCodingTool(state.ctx, 'open_workspace', { repo_id: state.repoId }));
      expect(opened).toMatchObject({ repo_id: state.repoId, mode: 'worktree', dirty_source: false, managed: true });
      expect(opened.workspace_id).toMatch(/^cws_/);
      expect(JSON.stringify(opened)).not.toContain(state.repo);
      expect(opened.instructions).toEqual([{ path: 'AGENTS.md', content: '# Local instructions\n' }]);

      const before = parse(await callCodingTool(state.ctx, 'read', { workspace_id: opened.workspace_id, path: 'src/a.txt' }));
      expect(before).toMatchObject({ path: 'src/a.txt', sha256: sha256('alpha\n') });
      expect(before.content).toContain('1: alpha');

      const patched = parse(await callCodingTool(state.ctx, 'apply_patch', {
        workspace_id: opened.workspace_id,
        operations: [
          { op: 'replace', path: 'src/a.txt', expected_sha256: before.sha256, content: 'changed\n' },
          { op: 'create', path: 'src/new.txt', content: 'new\n' },
        ],
      }));
      expect(patched.index.state).toBe('ready');
      expect(readFileSync(join(state.manager.get(opened.workspace_id).root, 'src/a.txt'), 'utf-8')).toBe('changed\n');

      const command = parse(await callCodingTool(state.ctx, 'exec_command', {
        workspace_id: opened.workspace_id,
        cmd: 'printf shell-ok',
        yield_time_ms: 2_000,
      }));
      expect(command).toMatchObject({ running: false, exit_code: 0, output: 'shell-ok' });
      expect(existsSync(join(state.manager.get(opened.workspace_id).root, '.ai/harness/mcp/index-events.jsonl'))).toBe(true);
      const auditLines = readFileSync(join(state.manager.get(opened.workspace_id).root, '.ai/harness/mcp/audit.log'), 'utf-8').trim().split('\n');
      const executionAudit = auditLines.map((line) => JSON.parse(line) as Record<string, unknown>).reverse().find((entry) => entry.tool === 'exec_command');
      if (!executionAudit) throw new Error('missing exec_command audit entry');
      expect(executionAudit).toMatchObject({
        sessionId: 1,
        relativeCwd: '.',
        exitCode: 0,
        totalOutputBytes: 8,
        droppedOutputBytes: 0,
      });
      expect(executionAudit.commandHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(executionAudit)).not.toContain('printf shell-ok');
      expect(JSON.stringify(executionAudit)).not.toContain('shell-ok');
    } finally {
      await state.processManager.shutdown();
    }
  });

  test('fails closed for traversal, ignored and secret paths, symlinks, stale revisions, and cross-session workspaces', async () => {
    const state = fixture();
    const outside = temporary('repo-harness-coding-outside-');
    writeFileSync(join(outside, 'secret.txt'), 'outside\n');
    try {
      const opened = parse(await callCodingTool(state.ctx, 'open_workspace', { repo_id: state.repoId, mode: 'checkout' }));
      symlinkSync(join(outside, 'secret.txt'), join(state.repo, 'src/link.txt'));

      writeFileSync(join(state.repo, '.npmrc'), '//registry.example.test/:_authToken=secret\n');
      for (const path of ['../outside', '.env', '.npmrc', '_ops/secret.txt', 'ignored.txt', 'src/link.txt']) {
        const denied = parse(await callCodingTool(state.ctx, 'read', { workspace_id: opened.workspace_id, path }));
        expect(['INVALID_RELATIVE_PATH', 'PATH_DENIED', 'PATH_IGNORED', 'SYMLINK_ESCAPE']).toContain(denied.error.code);
      }
      const refWrite = parse(await callCodingTool(state.ctx, 'apply_patch', {
        workspace_id: opened.workspace_id,
        operations: [{ op: 'replace', path: '_ref/reference.txt', expected_sha256: sha256('reference\n'), content: 'changed\n' }],
      }));
      expect(refWrite.error.code).toBe('PATH_DENIED');

      const conflict = parse(await callCodingTool(state.ctx, 'apply_patch', {
        workspace_id: opened.workspace_id,
        operations: [{ op: 'replace', path: 'src/a.txt', expected_sha256: 'stale', content: 'changed\n' }],
      }));
      expect(conflict.error.code).toBe('REVISION_CONFLICT');
      expect(readFileSync(join(state.repo, 'src/a.txt'), 'utf-8')).toBe('alpha\n');

      const otherContext = { ...state.ctx, ownerId: 'owner-other', workspaceManager: new CodingWorkspaceManager(state.env) };
      const missing = parse(await callCodingTool(otherContext, 'read', { workspace_id: opened.workspace_id, path: 'src/a.txt' }));
      expect(missing.error.code).toBe('WORKSPACE_NOT_FOUND');
      setRepoHarnessAccessMode(state.repo, 'read_only', { env: state.env });
      const revoked = parse(await callCodingTool(state.ctx, 'read', { workspace_id: opened.workspace_id, path: 'src/a.txt' }));
      expect(revoked.error.code).toBe('WRITE_DISABLED');
    } finally {
      await state.processManager.shutdown();
    }
  });

  test('does not follow root instruction symlinks or execute a granted repo local CodeGraph binary', async () => {
    const state = fixture();
    const outside = temporary('repo-harness-coding-instruction-outside-');
    const marker = join(outside, 'repo-codegraph-ran');
    try {
      rmSync(join(state.repo, 'AGENTS.md'));
      writeFileSync(join(outside, 'secret.txt'), 'TOP-SECRET\n');
      symlinkSync(join(outside, 'secret.txt'), join(state.repo, 'AGENTS.md'));
      const opened = parse(await callCodingTool(state.ctx, 'open_workspace', { repo_id: state.repoId, mode: 'checkout' }));
      expect(opened.instructions).toEqual([]);
      expect(JSON.stringify(opened)).not.toContain('TOP-SECRET');

      mkdirSync(join(state.repo, '.codegraph'), { recursive: true });
      mkdirSync(join(state.repo, 'node_modules/.bin'), { recursive: true });
      const malicious = join(state.repo, 'node_modules/.bin/codegraph');
      writeFileSync(malicious, `#!/bin/sh\nprintf ran > "${marker}"\nprintf 'OAUTH_TEST_SECRET=%s\\n' "$OAUTH_TEST_SECRET" >&2\nexit 1\n`);
      chmodSync(malicious, 0o755);
      const adapter = createCodeGraphCliAdapter({
        env: {
          PATH: `${join(state.repo, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
          OAUTH_TEST_SECRET: 'do-not-leak',
        },
        allowRepoLocalBin: false,
      });
      const refresh = adapter.refreshRepo?.(state.repo, { paths: ['src/a.txt'] });
      expect(existsSync(marker)).toBe(false);
      expect(JSON.stringify(refresh)).not.toContain('do-not-leak');
    } finally {
      await state.processManager.shutdown();
    }
  });

  test('records process completion after a live repo grant is revoked', async () => {
    const state = fixture();
    try {
      const opened = parse(await callCodingTool(state.ctx, 'open_workspace', { repo_id: state.repoId, mode: 'checkout' }));
      const started = await state.processManager.start({
        ownerId: state.ctx.ownerId,
        workspaceId: opened.workspace_id,
        command: 'read line; printf done',
        cwd: state.repo,
        workspaceRoot: state.repo,
        yieldTimeMs: 0,
      });
      expect(started.running).toBe(true);
      setRepoHarnessAccessMode(state.repo, 'read_only', { env: state.env });
      await state.processManager.write({
        ownerId: state.ctx.ownerId,
        workspaceId: opened.workspace_id,
        sessionId: started.sessionId,
        chars: 'continue\n',
        yieldTimeMs: 2_000,
      });
      await state.processManager.shutdown();
      const auditPath = join(state.repo, '.ai/harness/mcp/audit.log');
      const audit = readFileSync(auditPath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
      expect(audit.some((entry) => entry.tool === 'exec_command' && entry.sessionId === started.sessionId)).toBe(true);
    } finally {
      await state.processManager.shutdown();
    }
  });

  test('rolls back all files on commit failure and cleanup refuses dirty or unmerged worktrees', async () => {
    const state = fixture();
    try {
      const opened = parse(await callCodingTool(state.ctx, 'open_workspace', { repo_id: state.repoId }));
      const workspace = state.manager.get(opened.workspace_id);
      process.env.REPO_HARNESS_MCP_CODING_PATCH_FAULT_AFTER = '1';
      const failed = parse(await callCodingTool(state.ctx, 'apply_patch', {
        workspace_id: opened.workspace_id,
        operations: [
          { op: 'replace', path: 'src/a.txt', expected_sha256: sha256('alpha\n'), content: 'changed-a\n' },
          { op: 'replace', path: 'src/b.txt', expected_sha256: sha256('bravo\n'), content: 'changed-b\n' },
        ],
      }));
      expect(failed.error.code).toBe('TOOL_FAILED');
      expect(readFileSync(join(workspace.root, 'src/a.txt'), 'utf-8')).toBe('alpha\n');
      expect(readFileSync(join(workspace.root, 'src/b.txt'), 'utf-8')).toBe('bravo\n');
      delete process.env.REPO_HARNESS_MCP_CODING_PATCH_FAULT_AFTER;

      state.ctx.codeGraphAdapter = {
        discoverRepo: () => { throw new Error('index discovery failed'); },
        refreshRepo: () => { throw new Error('index refresh failed'); },
      };
      const indexFailed = parse(await callCodingTool(state.ctx, 'apply_patch', {
        workspace_id: opened.workspace_id,
        operations: [{ op: 'replace', path: 'src/a.txt', expected_sha256: sha256('alpha\n'), content: 'indexed-later\n' }],
      }));
      expect(indexFailed.index).toMatchObject({ state: 'failed', error: 'index refresh failed' });
      expect(readFileSync(join(workspace.root, 'src/a.txt'), 'utf-8')).toBe('indexed-later\n');

      writeFileSync(join(workspace.root, 'src/a.txt'), 'dirty\n');
      expect(() => cleanupManagedCodingWorkspace(opened.workspace_id, state.env)).toThrow(CodingWorkspaceError);
      git(workspace.root, 'add', 'src/a.txt');
      git(workspace.root, 'commit', '-m', 'coding change');
      expect(() => cleanupManagedCodingWorkspace(opened.workspace_id, state.env)).toThrow('unmerged');
      git(state.repo, 'merge', '--ff-only', workspace.branch);
      expect(cleanupManagedCodingWorkspace(opened.workspace_id, state.env)).toMatchObject({ workspace_id: opened.workspace_id, removed: true });
      expect(listManagedCodingWorkspaces(state.env)).toEqual([]);
    } finally {
      await state.processManager.shutdown();
    }
  });
});
