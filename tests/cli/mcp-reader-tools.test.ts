import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repoHarnessRepoIdFor, type RepoHarnessAccessMode } from '../../src/effects/repo-registry';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildReaderToolDefinitions, callReaderTool, createReaderToolContext, type ReaderToolContext } from '../../src/cli/mcp/reader-tools';
import { WorkspaceManager } from '../../src/cli/mcp/workspaces';
import type { GeneralRepoCodeGraphAdapter } from '../../src/cli/mcp/codegraph-adapter';

async function jsonTool(ctx: ReaderToolContext, name: string, args: Record<string, unknown> = {}) {
  const result = await callReaderTool(ctx, name, args);
  return JSON.parse(result.content[0].text);
}

function readJsonLines(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trimEnd()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mutationLockPath(repoId: string, relativePath: string): string {
  const harnessHome = process.env.REPO_HARNESS_HOME;
  if (!harnessHome) throw new Error('REPO_HARNESS_HOME is required for mutation lock tests');
  return join(harnessHome, 'mcp', 'mutation-locks', repoId, `${sha256(relativePath).slice(0, 32)}.lock`);
}

function writeMutationLockOwner(lockPath: string, owner: Record<string, unknown>): void {
  mkdirSync(lockPath, { recursive: true, mode: 0o700 });
  writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify(owner)}\n`, { encoding: 'utf-8', mode: 0o600 });
}

function exitedProcessPid(): number {
  const result = spawnSync(process.execPath, ['-e', '']);
  return typeof result.pid === 'number' && result.pid > 0 ? result.pid : 999999;
}

async function withMutationFault<T>(point: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.REPO_HARNESS_MCP_MUTATION_FAULT_POINT;
  try {
    process.env.REPO_HARNESS_MCP_MUTATION_FAULT_POINT = point;
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.REPO_HARNESS_MCP_MUTATION_FAULT_POINT;
    } else {
      process.env.REPO_HARNESS_MCP_MUTATION_FAULT_POINT = previous;
    }
  }
}

async function withReaderRepo<T>(fn: (repoRoot: string, ctx: ReaderToolContext) => Promise<T>, opts: { accessMode?: RepoHarnessAccessMode } = {}): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-reader-tools-'));
  const repoHarnessHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-home-'));
  const previousRepoHarnessHome = process.env.REPO_HARNESS_HOME;
  try {
    process.env.REPO_HARNESS_HOME = repoHarnessHome;
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    mkdirSync(join(repoRoot, 'secrets'), { recursive: true });
    mkdirSync(join(repoRoot, '.ssh'), { recursive: true });
    mkdirSync(join(repoRoot, 'ignored-dir'), { recursive: true });
    writeFileSync(join(repoRoot, '.gitignore'), 'ignored.md\nignored-dir/\n');
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'reader-fixture', private: true }, null, 2));
    writeFileSync(join(repoRoot, 'src', 'index.ts'), 'export const readerFixture = 1;\n');
    writeFileSync(join(repoRoot, 'docs', 'design.md'), ['# Design', 'authentication route', 'final line'].join('\n'));
    writeFileSync(join(repoRoot, 'docs', 'notes.txt'), 'Alpha\nbeta\nALPHA\n');
    writeFileSync(join(repoRoot, 'docs', 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    writeFileSync(join(repoRoot, 'docs', '.hidden.md'), '# Hidden\n');
    writeFileSync(join(repoRoot, '.env'), 'OPENAI_API_KEY=sk-testsecret\n');
    writeFileSync(join(repoRoot, 'secrets', 'token.txt'), 'TOKEN=secret\n');
    writeFileSync(join(repoRoot, '.ssh', 'id_rsa'), 'private\n');
    writeFileSync(join(repoRoot, 'ignored.md'), '# Ignored\n');
    writeFileSync(join(repoRoot, 'ignored-dir', 'note.md'), '# Ignored child\n');
    if (opts.accessMode) {
      const canonicalRoot = realpathSync(repoRoot);
      mkdirSync(join(repoRoot, '.ai', 'harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai', 'harness', 'policy.json'), '{}\n');
      mkdirSync(repoHarnessHome, { recursive: true });
      writeFileSync(join(repoHarnessHome, 'registered-repos.json'), `${JSON.stringify({
        version: 1,
        repos: [{
          id: repoHarnessRepoIdFor(canonicalRoot),
          path: canonicalRoot,
          accessMode: opts.accessMode,
          source: 'manual',
          registeredAt: '2026-06-23T00:00:00.000Z',
          lastSeenAt: '2026-06-23T00:00:00.000Z',
        }],
      }, null, 2)}\n`);
    }
    try {
      symlinkSync(repoRoot, join(repoRoot, 'docs', 'loop'));
    } catch (_error) {
      // Symlinks may be unavailable on some runners; tree must still be covered by ordinary directories.
    }
    const policy = getMcpPolicy('planner', {
      enableReader: true,
      allowedRoots: [repoRoot],
      generalRepo: { general_repo_read: true, fs_fallback: true, repo_write: opts.accessMode === 'read_write' },
    });
    const ctx = createReaderToolContext(repoRoot, policy, new WorkspaceManager({ allowedRoots: [repoRoot], policy }));
    return await fn(repoRoot, ctx);
  } finally {
    if (previousRepoHarnessHome === undefined) {
      delete process.env.REPO_HARNESS_HOME;
    } else {
      process.env.REPO_HARNESS_HOME = previousRepoHarnessHome;
    }
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(repoHarnessHome, { recursive: true, force: true });
  }
}

describe('MCP reader tools', () => {
  test('exposes reader and gated general repo tool registry with session-local workspaces', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      const definitions = buildReaderToolDefinitions();
      expect(definitions.map((tool) => tool.name)).toEqual([
        'reader_status',
        'list_allowed_roots',
        'open_workspace',
        'tree',
        'read_text',
        'get_repo_capabilities',
        'repo_manifest',
        'list_tree',
        'search_text',
        'read_file',
        'read_files',
        'stat_file',
        'write_file',
        'apply_patch',
        'move_path',
        'delete_path',
        'refresh_repo_index',
      ]);
      for (const definition of definitions) {
        if (definition.name === 'write_file' || definition.name === 'apply_patch' || definition.name === 'move_path' || definition.name === 'delete_path' || definition.name === 'refresh_repo_index') {
          expect(definition.annotations).toMatchObject({
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          });
        } else {
          expect(definition.annotations).toMatchObject({
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          });
        }
        expect(definition.inputSchema.additionalProperties).toBe(false);
      }

      const status = await jsonTool(ctx, 'reader_status');
      expect(status.capability).toBe('workspaceReader');
      expect(status.configured_root_count).toBe(1);
      expect(status.schema_hash).toMatch(/^[a-f0-9]{64}$/);

      const roots = await jsonTool(ctx, 'list_allowed_roots');
      const root = roots.roots[0];
      expect(root.path).toBeUndefined();
      expect(root.root_id).toMatch(/^root_/);
      expect(root.repo_id).toMatch(/^repo_/);
      expect(roots.repos.some((entry: { repo_id: string }) => entry.repo_id === root.repo_id)).toBe(true);

      const opened = await jsonTool(ctx, 'open_workspace', { root_id: root.root_id });
      expect(opened.workspace_id).toMatch(/^ws_/);

      const otherPolicy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [repoRoot] });
      const otherCtx = createReaderToolContext(repoRoot, otherPolicy, new WorkspaceManager({ allowedRoots: [repoRoot], policy: otherPolicy }));
      const denied = await jsonTool(otherCtx, 'tree', { workspace_id: opened.workspace_id });
      expect(denied.error.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  test('general repo rollout flags gate tool surface, writes, fallback, and rollback mode', async () => {
    await withReaderRepo(async (repoRoot) => {
      const repoId = repoHarnessRepoIdFor(realpathSync(repoRoot));
      const readOnlyPolicy = getMcpPolicy('planner', {
        enableReader: true,
        allowedRoots: [repoRoot],
        generalRepo: { general_repo_read: true, fs_fallback: true, repo_write: false },
      });
      const readOnlyTools = buildReaderToolDefinitions(readOnlyPolicy).map((tool) => tool.name);
      expect(readOnlyTools).toContain('repo_manifest');
      expect(readOnlyTools).toContain('read_file');
      expect(readOnlyTools).not.toContain('write_file');
      expect(readOnlyTools).not.toContain('refresh_repo_index');
      const readOnlyCtx = createReaderToolContext(repoRoot, readOnlyPolicy, new WorkspaceManager({ allowedRoots: [repoRoot], policy: readOnlyPolicy }));
      const blockedWrite = await jsonTool(readOnlyCtx, 'write_file', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        content: 'new\n',
        must_not_exist: true,
      });
      expect(blockedWrite.error.code).toBe('WRITE_DISABLED');

      const noFallbackPolicy = getMcpPolicy('planner', {
        enableReader: true,
        allowedRoots: [repoRoot],
        generalRepo: { general_repo_read: true, fs_fallback: false },
      });
      const noFallbackCtx = createReaderToolContext(repoRoot, noFallbackPolicy, new WorkspaceManager({ allowedRoots: [repoRoot], policy: noFallbackPolicy }));
      const manifest = await jsonTool(noFallbackCtx, 'repo_manifest', { repo_id: repoId, page_size: 1000 });
      expect(manifest.entries.some((entry: { path: string }) => entry.path === 'src/index.ts')).toBe(true);
      const unindexedRead = await jsonTool(noFallbackCtx, 'read_file', { repo_id: repoId, path: 'src/index.ts' });
      expect(unindexedRead.error.code).toBe('INDEX_UNAVAILABLE');

      const rollbackPolicy = getMcpPolicy('planner', {
        enableReader: true,
        allowedRoots: [repoRoot],
        generalRepo: { general_repo_read: false, rollback_to_legacy_tools: true },
      });
      const rollbackTools = buildReaderToolDefinitions(rollbackPolicy).map((tool) => tool.name);
      expect(rollbackTools).toContain('read_text');
      expect(rollbackTools).toContain('search_text');
      expect(rollbackTools).not.toContain('repo_manifest');
      expect(rollbackTools).not.toContain('read_file');
      expect(rollbackTools).not.toContain('write_file');
      const rollbackCtx = createReaderToolContext(repoRoot, rollbackPolicy, new WorkspaceManager({ allowedRoots: [repoRoot], policy: rollbackPolicy }));
      const blockedManifest = await jsonTool(rollbackCtx, 'repo_manifest', { repo_id: repoId });
      expect(blockedManifest.error.code).toBe('TOOL_NOT_AVAILABLE');
    });
  });

  test('general repo tools use repo_id, .ignore-only policy, and unredacted authorized reads', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      const outside = mkdtempSync(join(tmpdir(), 'repo-harness-general-reader-outside-'));
      try {
        writeFileSync(join(repoRoot, '.ignore'), 'ignored.md\nignored-dir/**\n!ignored-dir/visible.txt\n');
        writeFileSync(join(repoRoot, 'ignored-dir', 'visible.txt'), 'visible through negation\n');
        mkdirSync(join(repoRoot, 'unicode', 'drop'), { recursive: true });
        writeFileSync(join(repoRoot, 'unicode', '雪.md'), 'snow\n');
        writeFileSync(join(repoRoot, 'unicode', 'drop', 'note.md'), 'ignored directory child\n');
        const longRelativePath = `docs/${'long-segment-'.repeat(8)}file.txt`;
        writeFileSync(join(repoRoot, longRelativePath), 'long path content\n');
        writeFileSync(join(repoRoot, '#hash.txt'), 'escaped hash pattern\n');
        writeFileSync(join(repoRoot, '!bang.txt'), 'escaped bang pattern\n');
        writeFileSync(
          join(repoRoot, '.ignore'),
          [
            'ignored.md',
            'ignored-dir/**',
            '!ignored-dir/visible.txt',
            'unicode/drop/',
            '\\#hash.txt',
            '\\!bang.txt',
            '',
          ].join('\n'),
        );
        writeFileSync(join(repoRoot, 'docs', 'huge.txt'), 'x'.repeat(300_000));
        writeFileSync(join(outside, 'outside.txt'), 'outside\n');
        try {
          symlinkSync(join(outside, 'outside.txt'), join(repoRoot, 'docs', 'external-link.txt'));
        } catch (_error) {
          // Symlink creation can be unavailable on some runners; guarded read is covered when present.
        }

        const roots = await jsonTool(ctx, 'list_allowed_roots');
        const repoId = roots.roots[0].repo_id;

        const capabilities = await jsonTool(ctx, 'get_repo_capabilities', { repo_id: repoId });
        expect(capabilities.access_mode).toBe('read_only');
        expect(capabilities.write_tools).toEqual([]);
        expect(capabilities.repo_id).toBe(repoId);
        expect(capabilities.registry_revision).toMatch(/^registry_/);

        const readOnlyWrite = await jsonTool(ctx, 'write_file', {
          repo_id: repoId,
          path: 'docs/created-by-write.txt',
          content: 'blocked\n',
          must_not_exist: true,
        });
        expect(readOnlyWrite.error.code).toBe('WRITE_DISABLED');
        expect(existsSync(join(repoRoot, 'docs', 'created-by-write.txt'))).toBe(false);
        const readOnlyPatch = await jsonTool(ctx, 'apply_patch', {
          repo_id: repoId,
          path: 'docs/design.md',
          expected_sha256: 'unused',
          edits: [{ old_text: 'authentication', new_text: 'authorization' }],
        });
        expect(readOnlyPatch.error.code).toBe('WRITE_DISABLED');
        const readOnlyMove = await jsonTool(ctx, 'move_path', {
          repo_id: repoId,
          from_path: 'docs/design.md',
          to_path: 'docs/moved.md',
          expected_sha256: 'unused',
          must_not_exist: true,
        });
        expect(readOnlyMove.error.code).toBe('WRITE_DISABLED');
        const readOnlyDelete = await jsonTool(ctx, 'delete_path', {
          repo_id: repoId,
          path: 'docs/design.md',
          expected_sha256: 'unused',
        });
        expect(readOnlyDelete.error.code).toBe('WRITE_DISABLED');
        const readOnlyRefresh = await jsonTool(ctx, 'refresh_repo_index', { repo_id: repoId, paths: ['docs/design.md'] });
        expect(readOnlyRefresh.error.code).toBe('WRITE_DISABLED');

        const manifest = await jsonTool(ctx, 'repo_manifest', { repo_id: repoId, page_size: 1000 });
        const visiblePaths = manifest.entries.map((entry: { path: string }) => entry.path);
        expect(visiblePaths).toContain('.env');
        expect(visiblePaths).toContain('.gitignore');
        expect(visiblePaths).toContain('docs/.hidden.md');
        expect(visiblePaths).toContain(longRelativePath);
        expect(visiblePaths).toContain('ignored-dir/visible.txt');
        expect(visiblePaths).toContain('unicode/雪.md');
        expect(visiblePaths).not.toContain('.ignore');
        expect(visiblePaths).not.toContain('ignored.md');
        expect(visiblePaths).not.toContain('ignored-dir/note.md');
        expect(visiblePaths).not.toContain('unicode/drop');
        expect(visiblePaths).not.toContain('unicode/drop/note.md');
        expect(visiblePaths).not.toContain('#hash.txt');
        expect(visiblePaths).not.toContain('!bang.txt');
        expect(manifest.ignore_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(manifest.complete).toBe(true);

        const streamedManifest = await jsonTool(ctx, 'repo_manifest', { repo_id: repoId, page_size: 3 });
        expect(streamedManifest.entries).toHaveLength(3);
        expect(streamedManifest.next_cursor).toBe('3');
        expect(streamedManifest.snapshot_coverage).toBe('page');
        expect(streamedManifest.manifest_streaming).toBe(true);
        expect(streamedManifest.counts.content_deferred).toBeGreaterThan(0);
        const streamedRead = await jsonTool(ctx, 'read_file', {
          repo_id: repoId,
          path: 'src/index.ts',
          snapshot_id: streamedManifest.snapshot_id,
        });
        expect(streamedRead.error).toBeUndefined();
        expect(streamedRead.snapshot_id).toBe(streamedManifest.snapshot_id);
        const streamedSearch = await jsonTool(ctx, 'search_text', {
          repo_id: repoId,
          query: 'readerFixture',
          snapshot_id: streamedManifest.snapshot_id,
        });
        expect(streamedSearch.error).toBeUndefined();
        expect(streamedSearch.matches.some((match: { path: string }) => match.path === 'src/index.ts')).toBe(true);

        const tree = await jsonTool(ctx, 'list_tree', { repo_id: repoId, path: '.', depth: 3, page_size: 1000 });
        const treePaths = tree.entries.map((entry: { path: string }) => entry.path);
        expect(treePaths).toContain('.env');
        expect(treePaths).toContain('docs/.hidden.md');
        expect(treePaths).toContain('ignored-dir/visible.txt');
        expect(treePaths).not.toContain('ignored-dir/note.md');

        const stat = await jsonTool(ctx, 'stat_file', { repo_id: repoId, path: '.env' });
        expect(stat).toMatchObject({ path: '.env', type: 'file', indexed: false, readable: true, binary: false });
        expect(stat.sha256).toMatch(/^[a-f0-9]{64}$/);
        const longStat = await jsonTool(ctx, 'stat_file', { repo_id: repoId, path: longRelativePath });
        expect(longStat).toMatchObject({ path: longRelativePath, type: 'file', readable: true });

        const envRead = await jsonTool(ctx, 'read_file', { repo_id: repoId, path: '.env' });
        expect(envRead.content).toContain('sk-testsecret');
        expect(envRead.redactions).toBeUndefined();
        expect(envRead.sha256).toMatch(/^[a-f0-9]{64}$/);

        const range = await jsonTool(ctx, 'read_file', { repo_id: repoId, path: 'docs/design.md', line_range: [2, 2] });
        expect(range.content).toBe('authentication route');
        expect(range.start_line).toBe(2);
        expect(range.has_more).toBe(true);
        const huge = await jsonTool(ctx, 'read_file', { repo_id: repoId, path: 'docs/huge.txt' });
        expect(huge.has_more).toBe(true);
        expect(huge.next_cursor).toBe('byte:262144');
        const hugeNext = await jsonTool(ctx, 'read_file', { repo_id: repoId, path: 'docs/huge.txt', cursor: huge.next_cursor });
        expect(hugeNext.bytes_returned).toBe(37_856);
        expect(hugeNext.has_more).toBe(false);
        expect(hugeNext.next_cursor).toBeNull();

        const search = await jsonTool(ctx, 'search_text', { repo_id: repoId, query: 'sk-testsecret', paths: ['.env'] });
        expect(search.matches[0].snippet).toContain('sk-testsecret');
        expect(search.backend).toBe('filesystem-fallback');

        const batch = await jsonTool(ctx, 'read_files', {
          repo_id: repoId,
          requests: [
            { path: 'src/index.ts' },
            { path: 'ignored.md' },
            { path: 'docs/binary.bin', byte_range: [0, 4] },
          ],
        });
        expect(batch.partial).toBe(true);
        expect(batch.results[0].content).toContain('readerFixture');
        expect(batch.results[1].error.code).toBe('PATH_IGNORED');
        expect(batch.results[2]).toMatchObject({ encoding: 'base64', binary: true });

        const absolute = await jsonTool(ctx, 'read_file', { repo_id: repoId, path: join(repoRoot, 'src/index.ts') });
        expect(absolute.error.code).toBe('INVALID_RELATIVE_PATH');
        const unknownRepo = await jsonTool(ctx, 'stat_file', { repo_id: 'repo_missing', path: 'src/index.ts' });
        expect(unknownRepo.error.code).toBe('REPO_NOT_ALLOWED');
        if (existsSync(join(repoRoot, 'docs', 'external-link.txt'))) {
          const external = await jsonTool(ctx, 'read_file', { repo_id: repoId, path: 'docs/external-link.txt' });
          expect(external.error.code).toBe('SYMLINK_ESCAPE');
        }
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  test('.ignore symlink fails closed before policy content is read', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      const outside = mkdtempSync(join(tmpdir(), 'repo-harness-ignore-outside-'));
      try {
        const original = join(repoRoot, '.ignore');
        rmSync(original, { force: true });
        writeFileSync(join(outside, 'ignore-policy.txt'), '.env\n');
        try {
          symlinkSync(join(outside, 'ignore-policy.txt'), original);
        } catch (_error) {
          return;
        }
        const roots = await jsonTool(ctx, 'list_allowed_roots');
        const repoId = roots.roots[0].repo_id;
        const manifest = await jsonTool(ctx, 'repo_manifest', { repo_id: repoId });
        expect(manifest.error.code).toBe('SYMLINK_ESCAPE');
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  test('write_file is capability-gated, atomic, and guarded by revision preconditions', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      writeFileSync(join(repoRoot, '.ignore'), 'ignored.md\n');
      let indexedAfterRefresh = false;
      const refreshCalls: string[][] = [];
      const fakeCodeGraph: GeneralRepoCodeGraphAdapter = {
        discoverRepo() {
          const generatedPath = join(repoRoot, 'docs', 'generated.txt');
          return {
            available: true,
            integrated: true,
            source: 'test-double',
            indexRevision: indexedAfterRefresh ? 'index_after_write' : 'index_before_write',
            latencyMs: 1,
            files: indexedAfterRefresh && existsSync(generatedPath)
              ? [{ path: 'docs/generated.txt', language: 'text', nodeCount: 1, size: readFileSync(generatedPath).length }]
              : [],
          };
        },
        refreshRepo(_repoRoot, opts = {}) {
          refreshCalls.push(opts.paths ?? []);
          indexedAfterRefresh = true;
          return {
            available: true,
            refreshed: true,
            integrated: true,
            source: 'test-double',
            indexRevision: 'index_after_write',
            latencyMs: 2,
            strategy: 'repo-sync',
            requestedPaths: opts.paths ?? [],
            pathRefreshSupported: false,
            files: 1,
          };
        },
      };
      const writeCtx = createReaderToolContext(
        repoRoot,
        ctx.policy,
        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
        fakeCodeGraph,
      );
      const repoId = (await jsonTool(writeCtx, 'list_allowed_roots')).roots[0].repo_id;
      const capabilities = await jsonTool(writeCtx, 'get_repo_capabilities', { repo_id: repoId });
      expect(capabilities.access_mode).toBe('read_write');
      expect(capabilities.write_tools).toEqual(['write_file', 'apply_patch', 'move_path', 'delete_path', 'refresh_repo_index']);

      const missingCreatePrecondition = await jsonTool(writeCtx, 'write_file', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        content: 'first\n',
      });
      expect(missingCreatePrecondition.error.code).toBe('REVISION_CONFLICT');
      expect(existsSync(join(repoRoot, 'docs', 'generated.txt'))).toBe(false);

      const created = await jsonTool(writeCtx, 'write_file', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        content: 'first\n',
        must_not_exist: true,
      });
      expect(created.error).toBeUndefined();
      expect(created).toMatchObject({
        path: 'docs/generated.txt',
        operation: 'create',
        index_state: 'pending',
        before: { existed: false, sha256: null, size: 0 },
        index: { action: 'refresh_repo_index_required', changed_paths: ['docs/generated.txt'] },
      });
      expect(created.mutation_id).toMatch(/^mut_[a-f0-9]{16}$/);
      expect(created.index.invalidation_id).toMatch(/^idxinv_[a-f0-9]{16}$/);
      expect(created.index.refresh_tool).toBe('refresh_repo_index');
      expect(created.after.sha256).toMatch(/^[a-f0-9]{64}$/);
	      expect(created.diff.after_sha256).toBe(created.after.sha256);
	      expect(readFileSync(join(repoRoot, 'docs', 'generated.txt'), 'utf-8')).toBe('first\n');
	      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);
	      const indexEventsAfterCreate = readJsonLines(join(repoRoot, '.ai', 'harness', 'mcp', 'index-events.jsonl'));
	      const createdIndexEvent = indexEventsAfterCreate.find((entry) => entry.mutation_id === created.mutation_id);
	      expect(created.index.event_id).toBe(createdIndexEvent?.event_id);
	      expect(createdIndexEvent).toMatchObject({
	        event_type: 'index_invalidation',
	        status: 'pending',
	        repo_id: repoId,
	        operation: 'create',
	        mutation_id: created.mutation_id,
	        invalidation_id: created.index.invalidation_id,
	        relative_paths: ['docs/generated.txt'],
	        before_index_revision: 'index_before_write',
	        retry: {
	          retryable: true,
	          retry_tool: 'refresh_repo_index',
	          retry_paths: ['docs/generated.txt'],
	          manual_recovery: 'bash scripts/ensure-codegraph.sh --sync',
	        },
	      });
	      expect(JSON.stringify(createdIndexEvent)).not.toContain('first\n');

	      const readCreated = await jsonTool(writeCtx, 'read_file', { repo_id: repoId, path: 'docs/generated.txt' });
	      expect(readCreated.content).toBe('first\n');
      expect(readCreated.sha256).toBe(created.after.sha256);

      const targetExists = await jsonTool(writeCtx, 'write_file', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        content: 'duplicate\n',
        must_not_exist: true,
      });
      expect(targetExists.error.code).toBe('TARGET_EXISTS');
      expect(readFileSync(join(repoRoot, 'docs', 'generated.txt'), 'utf-8')).toBe('first\n');
      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);

      const conflict = await jsonTool(writeCtx, 'write_file', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        content: 'stale\n',
        expected_sha256: 'bad',
      });
      expect(conflict.error.code).toBe('REVISION_CONFLICT');
      expect(conflict.error.details.actual_sha256).toBe(created.after.sha256);
      expect(readFileSync(join(repoRoot, 'docs', 'generated.txt'), 'utf-8')).toBe('first\n');

      const replaced = await jsonTool(writeCtx, 'write_file', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        content: 'second\n',
        expected_sha256: created.after.sha256,
      });
      expect(replaced.error).toBeUndefined();
      expect(replaced.operation).toBe('replace');
      expect(replaced.before.sha256).toBe(created.after.sha256);
      expect(replaced.after.sha256).not.toBe(created.after.sha256);
      expect(replaced.diff.bytes_delta).toBe('second\n'.length - 'first\n'.length);

      const readReplaced = await jsonTool(writeCtx, 'read_file', { repo_id: repoId, path: 'docs/generated.txt' });
      expect(readReplaced.content).toBe('second\n');
      expect(readReplaced.sha256).toBe(replaced.after.sha256);
      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);
      const statReplaced = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/generated.txt' });
      expect(statReplaced.sha256).toBe(replaced.after.sha256);
      expect(statReplaced.indexed).toBe(false);
      const searchBeforeRefresh = await jsonTool(writeCtx, 'search_text', {
        repo_id: repoId,
        query: 'second',
        paths: ['docs/generated.txt'],
      });
      expect(searchBeforeRefresh.backend).toBe('codegraph-metadata+filesystem-fallback');
      expect(searchBeforeRefresh.matches).toMatchObject([{ path: 'docs/generated.txt', indexed: false }]);

	      const refreshed = await jsonTool(writeCtx, 'refresh_repo_index', {
	        repo_id: repoId,
	        paths: ['docs/generated.txt'],
	        mutation_id: replaced.mutation_id,
	      });
	      const refreshedEventId = refreshed.index.event_id;
	      const refreshedSourceEventId = refreshed.refresh.source_event_id;
	      expect(typeof refreshedEventId).toBe('string');
	      expect(typeof refreshedSourceEventId).toBe('string');
	      expect(refreshed).toMatchObject({
	        paths: ['docs/generated.txt'],
	        refreshed: true,
        index_state: 'ready',
        refresh: {
          strategy: 'repo-sync',
          requested_paths: ['docs/generated.txt'],
          path_refresh_supported: false,
	          before_index_revision: 'index_before_write',
	          adapter_index_revision: 'index_after_write',
	          after_index_revision: 'index_after_write',
	          indexed_files: 1,
	          source_event_id: refreshedSourceEventId,
	          mutation_id: replaced.mutation_id,
	          index_lag_ms: expect.any(Number),
	        },
	        index: {
	          state: 'ready',
	          action: 'refresh_complete',
	          refreshed_paths: ['docs/generated.txt'],
	          mutation_id: replaced.mutation_id,
	          event_id: refreshedEventId,
	          event_log: '.ai/harness/mcp/index-events.jsonl',
	          index_lag_ms: expect.any(Number),
	        },
	      });
	      expect(refreshCalls).toEqual([['docs/generated.txt']]);
	      const indexEventsAfterRefresh = readJsonLines(join(repoRoot, '.ai', 'harness', 'mcp', 'index-events.jsonl'));
	      const refreshEvent = indexEventsAfterRefresh.find((entry) => entry.event_type === 'index_refresh' && entry.mutation_id === replaced.mutation_id);
	      expect(refreshEvent?.event_id).toBe(refreshedEventId);
	      expect(refreshEvent).toMatchObject({
	        event_type: 'index_refresh',
	        status: 'ready',
	        repo_id: repoId,
	        operation: 'refresh_repo_index',
	        mutation_id: replaced.mutation_id,
	        source_event_id: refreshedSourceEventId,
	        relative_paths: ['docs/generated.txt'],
	        index_lag_ms: expect.any(Number),
	      });
	      const statAfterRefresh = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/generated.txt' });
      expect(statAfterRefresh).toMatchObject({
        indexed: true,
        codegraph_language: 'text',
        codegraph_node_count: 1,
        codegraph_size: 'second\n'.length,
      });

      const patched = await jsonTool(writeCtx, 'apply_patch', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        expected_sha256: statAfterRefresh.sha256,
        edits: [{ old_text: 'second\n', new_text: 'second patched\n' }],
      });
      expect(patched.error).toBeUndefined();
      expect(patched).toMatchObject({
        path: 'docs/generated.txt',
        operation: 'patch',
        before: { sha256: statAfterRefresh.sha256, size: 'second\n'.length },
        patch: { format: 'structured_edits', applied_count: 1 },
        index: { action: 'refresh_repo_index_required', changed_paths: ['docs/generated.txt'] },
      });
      expect(patched.mutation_id).toMatch(/^mut_[a-f0-9]{16}$/);
      expect(patched.index.invalidation_id).toMatch(/^idxinv_[a-f0-9]{16}$/);
      expect(patched.after.sha256).not.toBe(statAfterRefresh.sha256);
      expect(readFileSync(join(repoRoot, 'docs', 'generated.txt'), 'utf-8')).toBe('second patched\n');
      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);

      const stalePatch = await jsonTool(writeCtx, 'apply_patch', {
        repo_id: repoId,
        path: 'docs/generated.txt',
        expected_sha256: statAfterRefresh.sha256,
        edits: [{ old_text: 'second patched', new_text: 'stale write' }],
      });
      expect(stalePatch.error.code).toBe('REVISION_CONFLICT');
      expect(stalePatch.error.details.actual_sha256).toBe(patched.after.sha256);
      expect(readFileSync(join(repoRoot, 'docs', 'generated.txt'), 'utf-8')).toBe('second patched\n');

      writeFileSync(join(repoRoot, 'docs', 'ambiguous.txt'), 'same\nsame\n');
      const ambiguousStat = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/ambiguous.txt' });
      const ambiguousPatch = await jsonTool(writeCtx, 'apply_patch', {
        repo_id: repoId,
        path: 'docs/ambiguous.txt',
        expected_sha256: ambiguousStat.sha256,
        edits: [{ old_text: 'same', new_text: 'changed' }],
      });
      expect(ambiguousPatch.error.code).toBe('REVISION_CONFLICT');
      expect(readFileSync(join(repoRoot, 'docs', 'ambiguous.txt'), 'utf-8')).toBe('same\nsame\n');

      const occurrencePatch = await jsonTool(writeCtx, 'apply_patch', {
        repo_id: repoId,
        path: 'docs/ambiguous.txt',
        expected_sha256: ambiguousStat.sha256,
        edits: [{ old_text: 'same', new_text: 'changed', occurrence: 2 }],
      });
      expect(occurrencePatch.error).toBeUndefined();
      expect(readFileSync(join(repoRoot, 'docs', 'ambiguous.txt'), 'utf-8')).toBe('same\nchanged\n');

      writeFileSync(join(repoRoot, 'docs', 'unified.txt'), 'alpha\nbeta\ngamma\n');
      const unifiedStat = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/unified.txt' });
      const unifiedPatch = await jsonTool(writeCtx, 'apply_patch', {
        repo_id: repoId,
        path: 'docs/unified.txt',
        expected_sha256: unifiedStat.sha256,
        unified_diff: [
          '--- a/docs/unified.txt',
          '+++ b/docs/unified.txt',
          '@@ -1,3 +1,3 @@',
          ' alpha',
          '-beta',
          '+bravo',
          ' gamma',
        ].join('\n'),
      });
      expect(unifiedPatch.error).toBeUndefined();
      expect(unifiedPatch.patch).toMatchObject({ format: 'unified_diff', applied_count: 1 });
      expect(readFileSync(join(repoRoot, 'docs', 'unified.txt'), 'utf-8')).toBe('alpha\nbravo\ngamma\n');

      writeFileSync(join(repoRoot, 'docs', 'move-source.txt'), 'move me\n');
      const moveStat = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/move-source.txt' });
      const moveWithoutTargetPrecondition = await jsonTool(writeCtx, 'move_path', {
        repo_id: repoId,
        from_path: 'docs/move-source.txt',
        to_path: 'docs/moved.txt',
        expected_sha256: moveStat.sha256,
      });
      expect(moveWithoutTargetPrecondition.error.code).toBe('REVISION_CONFLICT');
      expect(existsSync(join(repoRoot, 'docs', 'move-source.txt'))).toBe(true);
      expect(existsSync(join(repoRoot, 'docs', 'moved.txt'))).toBe(false);

      const moved = await jsonTool(writeCtx, 'move_path', {
        repo_id: repoId,
        from_path: 'docs/move-source.txt',
        to_path: 'docs/moved.txt',
        expected_sha256: moveStat.sha256,
        must_not_exist: true,
      });
      expect(moved.error).toBeUndefined();
      expect(moved).toMatchObject({
        path: 'docs/moved.txt',
        operation: 'move',
        from_path: 'docs/move-source.txt',
        to_path: 'docs/moved.txt',
        before: { sha256: moveStat.sha256, size: 'move me\n'.length },
        index: { action: 'refresh_repo_index_required', changed_paths: ['docs/move-source.txt', 'docs/moved.txt'] },
      });
      expect(moved.after.sha256).toBe(moveStat.sha256);
      expect(existsSync(join(repoRoot, 'docs', 'move-source.txt'))).toBe(false);
      expect(readFileSync(join(repoRoot, 'docs', 'moved.txt'), 'utf-8')).toBe('move me\n');
      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);

      writeFileSync(join(repoRoot, 'docs', 'stale-move.txt'), 'original\n');
      const staleMoveStat = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/stale-move.txt' });
      writeFileSync(join(repoRoot, 'docs', 'stale-move.txt'), 'changed\n');
      const staleMove = await jsonTool(writeCtx, 'move_path', {
        repo_id: repoId,
        from_path: 'docs/stale-move.txt',
        to_path: 'docs/stale-moved.txt',
        expected_sha256: staleMoveStat.sha256,
        must_not_exist: true,
      });
      expect(staleMove.error.code).toBe('REVISION_CONFLICT');
      expect(readFileSync(join(repoRoot, 'docs', 'stale-move.txt'), 'utf-8')).toBe('changed\n');
      expect(existsSync(join(repoRoot, 'docs', 'stale-moved.txt'))).toBe(false);

      writeFileSync(join(repoRoot, 'docs', 'existing-target.txt'), 'target\n');
      const targetExistsMove = await jsonTool(writeCtx, 'move_path', {
        repo_id: repoId,
        from_path: 'docs/stale-move.txt',
        to_path: 'docs/existing-target.txt',
        expected_sha256: staleMove.error.details.actual_sha256,
        must_not_exist: true,
      });
      expect(targetExistsMove.error.code).toBe('TARGET_EXISTS');
      expect(readFileSync(join(repoRoot, 'docs', 'stale-move.txt'), 'utf-8')).toBe('changed\n');
      expect(readFileSync(join(repoRoot, 'docs', 'existing-target.txt'), 'utf-8')).toBe('target\n');

      const deleteStat = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/moved.txt' });
      const staleDelete = await jsonTool(writeCtx, 'delete_path', {
        repo_id: repoId,
        path: 'docs/moved.txt',
        expected_sha256: 'bad',
      });
      expect(staleDelete.error.code).toBe('REVISION_CONFLICT');
      expect(staleDelete.error.details.actual_sha256).toBe(deleteStat.sha256);
      expect(readFileSync(join(repoRoot, 'docs', 'moved.txt'), 'utf-8')).toBe('move me\n');

      const deleted = await jsonTool(writeCtx, 'delete_path', {
        repo_id: repoId,
        path: 'docs/moved.txt',
        expected_sha256: deleteStat.sha256,
      });
      expect(deleted.error).toBeUndefined();
	      expect(deleted).toMatchObject({
	        path: 'docs/moved.txt',
	        operation: 'delete',
	        before: { existed: true, sha256: deleteStat.sha256, size: 'move me\n'.length },
        after: { existed: false, sha256: null, size: 0 },
        deleted: { path: 'docs/moved.txt', type: 'file' },
        index: { action: 'refresh_repo_index_required', changed_paths: ['docs/moved.txt'] },
	      });
	      expect(existsSync(join(repoRoot, 'docs', 'moved.txt'))).toBe(false);
	      const readDeleted = await jsonTool(writeCtx, 'read_file', { repo_id: repoId, path: 'docs/moved.txt' });
	      expect(readDeleted.error.code).toBe('NOT_FOUND');
	      const refreshedAfterDelete = await jsonTool(writeCtx, 'refresh_repo_index', {
	        repo_id: repoId,
	        paths: ['docs/moved.txt'],
	        mutation_id: deleted.mutation_id,
	      });
	      expect(refreshedAfterDelete.error).toBeUndefined();
	      expect(refreshedAfterDelete).toMatchObject({
	        paths: ['docs/moved.txt'],
	        refreshed: true,
	        index: {
	          action: 'refresh_complete',
	          refreshed_paths: ['docs/moved.txt'],
	          mutation_id: deleted.mutation_id,
	          source_event_id: deleted.index.event_id,
	        },
	      });
	      expect(refreshCalls.at(-1)).toEqual(['docs/moved.txt']);

	      const directoryDelete = await jsonTool(writeCtx, 'delete_path', {
        repo_id: repoId,
        path: 'docs',
        expected_sha256: 'unused',
      });
      expect(directoryDelete.error.code).toBe('NOT_A_FILE');
      const recursiveDelete = await jsonTool(writeCtx, 'delete_path', {
        repo_id: repoId,
        path: 'docs',
        expected_sha256: 'unused',
        recursive: true,
      });
      expect(recursiveDelete.error.code).toBe('INVALID_RANGE');

      const ignored = await jsonTool(writeCtx, 'write_file', {
        repo_id: repoId,
        path: 'ignored.md',
        content: 'blocked\n',
        must_not_exist: true,
      });
      expect(ignored.error.code).toBe('PATH_IGNORED');
	      const missingParent = await jsonTool(writeCtx, 'write_file', {
	        repo_id: repoId,
	        path: 'missing-dir/file.txt',
	        content: 'blocked\n',
	        must_not_exist: true,
	      });
	      expect(missingParent.error.code).toBe('NOT_FOUND');

	      const failingCodeGraph: GeneralRepoCodeGraphAdapter = {
	        discoverRepo() {
	          return {
	            available: true,
	            integrated: true,
	            source: 'test-double',
	            indexRevision: 'index_before_failed_refresh',
	            latencyMs: 1,
	            files: [],
	          };
	        },
	        refreshRepo(_repoRoot, opts = {}) {
	          return {
	            available: false,
	            refreshed: false,
	            integrated: true,
	            source: 'test-double',
	            indexRevision: 'index_before_failed_refresh',
	            latencyMs: 4,
	            strategy: 'repo-sync',
	            requestedPaths: opts.paths ?? [],
	            pathRefreshSupported: false,
	            files: 0,
	            error: {
	              code: 'INDEX_UNAVAILABLE',
	              message: 'OPENAI_API_KEY=sk-testsecret refresh failed',
	              retryable: true,
	            },
	          };
	        },
	      };
	      const failingCtx = createReaderToolContext(
	        repoRoot,
	        ctx.policy,
	        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
	        failingCodeGraph,
	      );
	      const failedRefresh = await jsonTool(failingCtx, 'refresh_repo_index', {
	        repo_id: repoId,
	        paths: ['docs/generated.txt'],
	        mutation_id: patched.mutation_id,
	      });
	      expect(failedRefresh.error.code).toBe('INDEX_UNAVAILABLE');
	      expect(failedRefresh.error.retryable).toBe(true);
	      const failedRefreshEvent = readJsonLines(join(repoRoot, '.ai', 'harness', 'mcp', 'index-events.jsonl'))
	        .find((entry) => entry.event_type === 'index_refresh' && entry.status === 'failed' && entry.mutation_id === patched.mutation_id);
	      expect(failedRefreshEvent).toMatchObject({
	        operation: 'refresh_repo_index',
	        relative_paths: ['docs/generated.txt'],
	        error: { code: 'INDEX_UNAVAILABLE', retryable: true },
	        dead_letter: {
	          retry_tool: 'refresh_repo_index',
	          retry_paths: ['docs/generated.txt'],
	          manual_recovery: 'bash scripts/ensure-codegraph.sh --sync',
	        },
	      });
	      expect(JSON.stringify(failedRefreshEvent)).not.toContain('sk-testsecret');

	      const auditText = readFileSync(join(repoRoot, '.ai', 'harness', 'mcp', 'audit.log'), 'utf-8');
	      expect(auditText).toContain('"tool":"write_file"');
      expect(auditText).toContain('"tool":"apply_patch"');
      expect(auditText).toContain('"tool":"move_path"');
      expect(auditText).toContain('"tool":"delete_path"');
      expect(auditText).toContain('"status":"ok"');
      expect(auditText).toContain('"status":"blocked"');
      expect(auditText).not.toContain('first\n');
      expect(auditText).not.toContain('second\n');
      expect(auditText).not.toContain('second patched\n');
      expect(auditText).not.toContain('bravo');
	      expect(auditText).not.toContain('move me\n');
	      expect(auditText).not.toContain('changed\n');
	      expect(auditText).not.toContain('stale\n');
	      const auditEntries = readJsonLines(join(repoRoot, '.ai', 'harness', 'mcp', 'audit.log'));
	      const createdAudit = auditEntries.find((entry) => entry.tool === 'write_file' && entry.mutationId === created.mutation_id);
	      expect(createdAudit).toMatchObject({
	        status: 'ok',
	        actor: 'mcp:planner',
	        repoId,
	        operation: 'create',
	        relativePaths: ['docs/generated.txt'],
	        mutationId: created.mutation_id,
	        indexInvalidationId: created.index.invalidation_id,
	        indexEventId: created.index.event_id,
	        result: 'ok',
	        fileHashes: {
	          before_sha256: null,
	          after_sha256: created.after.sha256,
	        },
	      });
	      expect(typeof createdAudit?.durationMs).toBe('number');
	      const blockedDeleteAudit = auditEntries.find((entry) => entry.tool === 'delete_path' && entry.errorCode === 'REVISION_CONFLICT');
	      expect(blockedDeleteAudit).toMatchObject({
	        status: 'blocked',
	        repoId,
	        relativePaths: ['docs/moved.txt'],
	        result: 'blocked',
	        errorCode: 'REVISION_CONFLICT',
	      });
	      expect(JSON.stringify(auditEntries)).not.toContain('OPENAI_API_KEY=sk-testsecret refresh failed');
	    }, { accessMode: 'read_write' });
	  });

	  test('write mutations revalidate locked preconditions immediately before commit', async () => {
	    await withReaderRepo(async (repoRoot, ctx) => {
	      const tripped = new Set<string>();
	      const raceCtx = createReaderToolContext(
	        repoRoot,
	        ctx.policy,
	        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
	        undefined,
	        {
	          beforeMutationCommit(event) {
	            const trip = (name: string, fn: () => void): void => {
	              if (tripped.has(name)) return;
	              tripped.add(name);
	              fn();
	            };
	            if (event.tool === 'write_file' && event.paths.includes('docs/replace-race.txt')) {
	              trip('replace', () => writeFileSync(join(repoRoot, 'docs', 'replace-race.txt'), 'external replace\n'));
	            }
	            if (event.tool === 'write_file' && event.paths.includes('docs/create-race.txt')) {
	              trip('create', () => writeFileSync(join(repoRoot, 'docs', 'create-race.txt'), 'external create\n'));
	            }
	            if (event.tool === 'apply_patch' && event.paths.includes('docs/patch-race.txt')) {
	              trip('patch', () => writeFileSync(join(repoRoot, 'docs', 'patch-race.txt'), 'external patch\n'));
	            }
	            if (event.tool === 'move_path' && event.paths.includes('docs/move-target-race.txt')) {
	              trip('move', () => writeFileSync(join(repoRoot, 'docs', 'move-target-race.txt'), 'external move target\n'));
	            }
	            if (event.tool === 'delete_path' && event.paths.includes('docs/delete-race.txt')) {
	              trip('delete', () => writeFileSync(join(repoRoot, 'docs', 'delete-race.txt'), 'external delete\n'));
	            }
	          },
	        },
	      );
	      const repoId = (await jsonTool(raceCtx, 'list_allowed_roots')).roots[0].repo_id;

	      writeFileSync(join(repoRoot, 'docs', 'replace-race.txt'), 'old replace\n');
	      const replaceStat = await jsonTool(raceCtx, 'stat_file', { repo_id: repoId, path: 'docs/replace-race.txt' });
	      const replaceRace = await jsonTool(raceCtx, 'write_file', {
	        repo_id: repoId,
	        path: 'docs/replace-race.txt',
	        content: 'tool replace\n',
	        expected_sha256: replaceStat.sha256,
	      });
	      expect(replaceRace.error.code).toBe('REVISION_CONFLICT');
	      expect(readFileSync(join(repoRoot, 'docs', 'replace-race.txt'), 'utf-8')).toBe('external replace\n');

	      const createRace = await jsonTool(raceCtx, 'write_file', {
	        repo_id: repoId,
	        path: 'docs/create-race.txt',
	        content: 'tool create\n',
	        must_not_exist: true,
	      });
	      expect(createRace.error.code).toBe('TARGET_EXISTS');
	      expect(readFileSync(join(repoRoot, 'docs', 'create-race.txt'), 'utf-8')).toBe('external create\n');

	      writeFileSync(join(repoRoot, 'docs', 'patch-race.txt'), 'old patch\n');
	      const patchStat = await jsonTool(raceCtx, 'stat_file', { repo_id: repoId, path: 'docs/patch-race.txt' });
	      const patchRace = await jsonTool(raceCtx, 'apply_patch', {
	        repo_id: repoId,
	        path: 'docs/patch-race.txt',
	        expected_sha256: patchStat.sha256,
	        edits: [{ old_text: 'old patch\n', new_text: 'tool patch\n' }],
	      });
	      expect(patchRace.error.code).toBe('REVISION_CONFLICT');
	      expect(readFileSync(join(repoRoot, 'docs', 'patch-race.txt'), 'utf-8')).toBe('external patch\n');

	      writeFileSync(join(repoRoot, 'docs', 'move-source-race.txt'), 'move source\n');
	      const moveStat = await jsonTool(raceCtx, 'stat_file', { repo_id: repoId, path: 'docs/move-source-race.txt' });
	      const moveRace = await jsonTool(raceCtx, 'move_path', {
	        repo_id: repoId,
	        from_path: 'docs/move-source-race.txt',
	        to_path: 'docs/move-target-race.txt',
	        expected_sha256: moveStat.sha256,
	        must_not_exist: true,
	      });
	      expect(moveRace.error.code).toBe('TARGET_EXISTS');
	      expect(readFileSync(join(repoRoot, 'docs', 'move-source-race.txt'), 'utf-8')).toBe('move source\n');
	      expect(readFileSync(join(repoRoot, 'docs', 'move-target-race.txt'), 'utf-8')).toBe('external move target\n');

	      writeFileSync(join(repoRoot, 'docs', 'delete-race.txt'), 'delete source\n');
	      const deleteStat = await jsonTool(raceCtx, 'stat_file', { repo_id: repoId, path: 'docs/delete-race.txt' });
	      const deleteRace = await jsonTool(raceCtx, 'delete_path', {
	        repo_id: repoId,
	        path: 'docs/delete-race.txt',
	        expected_sha256: deleteStat.sha256,
	      });
	      expect(deleteRace.error.code).toBe('REVISION_CONFLICT');
	      expect(readFileSync(join(repoRoot, 'docs', 'delete-race.txt'), 'utf-8')).toBe('external delete\n');
	      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);
	      const locksDir = join(repoRoot, '.ai', 'harness', 'mcp', 'locks');
	      expect(existsSync(locksDir) ? readdirSync(locksDir) : []).toEqual([]);
	    }, { accessMode: 'read_write' });
	  });

	  test('write mutation locks ignore repo-local symlinked lock roots', async () => {
	    await withReaderRepo(async (repoRoot, ctx) => {
	      const externalLockRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-lock-escape-'));
	      try {
	        const repoMcpDir = join(repoRoot, '.ai', 'harness', 'mcp');
	        const repoLocksDir = join(repoMcpDir, 'locks');
	        mkdirSync(repoMcpDir, { recursive: true });
	        rmSync(repoLocksDir, { recursive: true, force: true });
	        try {
	          symlinkSync(externalLockRoot, repoLocksDir);
	        } catch (_error) {
	          return;
	        }

	        const writeCtx = createReaderToolContext(
	          repoRoot,
	          ctx.policy,
	          new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
	        );
	        const repoId = (await jsonTool(writeCtx, 'list_allowed_roots')).roots[0].repo_id;
	        const created = await jsonTool(writeCtx, 'write_file', {
	          repo_id: repoId,
	          path: 'docs/lock-safe.txt',
	          content: 'safe\n',
	          must_not_exist: true,
	        });

	        expect(created.error).toBeUndefined();
	        expect(readFileSync(join(repoRoot, 'docs', 'lock-safe.txt'), 'utf-8')).toBe('safe\n');
	        expect(readdirSync(externalLockRoot)).toEqual([]);
	        const harnessHome = process.env.REPO_HARNESS_HOME;
	        expect(typeof harnessHome).toBe('string');
	        const trustedLockRoot = join(harnessHome as string, 'mcp', 'mutation-locks', repoId);
	        expect(existsSync(trustedLockRoot)).toBe(true);
	        expect(readdirSync(trustedLockRoot)).toEqual([]);
	      } finally {
	        rmSync(externalLockRoot, { recursive: true, force: true });
	      }
	    }, { accessMode: 'read_write' });
	  });

	  test('write mutation reclaims dead owner directory locks before commit', async () => {
	    await withReaderRepo(async (repoRoot, ctx) => {
	      const repoId = (await jsonTool(ctx, 'list_allowed_roots')).roots[0].repo_id;
	      const relativePath = 'docs/stale-lock.txt';
	      const lockPath = mutationLockPath(repoId, relativePath);
	      writeMutationLockOwner(lockPath, {
	        repo_id: repoId,
	        path: relativePath,
	        pid: exitedProcessPid(),
	        token: 'dead-owner',
	        created_at: '2026-06-23T00:00:00.000Z',
	      });

	      const created = await jsonTool(ctx, 'write_file', {
	        repo_id: repoId,
	        path: relativePath,
	        content: 'recovered\n',
	        must_not_exist: true,
	      });

	      expect(created.error).toBeUndefined();
	      expect(readFileSync(join(repoRoot, relativePath), 'utf-8')).toBe('recovered\n');
	      expect(existsSync(lockPath)).toBe(false);
	    }, { accessMode: 'read_write' });
	  });

	  test('write mutation does not reclaim dead owner locks for a different path', async () => {
	    await withReaderRepo(async (repoRoot, ctx) => {
	      const repoId = (await jsonTool(ctx, 'list_allowed_roots')).roots[0].repo_id;
	      const relativePath = 'docs/mismatched-lock.txt';
	      const lockPath = mutationLockPath(repoId, relativePath);
	      writeMutationLockOwner(lockPath, {
	        repo_id: repoId,
	        path: 'docs/other-lock.txt',
	        pid: exitedProcessPid(),
	        token: 'mismatched-owner',
	        created_at: '2026-06-23T00:00:00.000Z',
	      });

	      const blocked = await jsonTool(ctx, 'write_file', {
	        repo_id: repoId,
	        path: relativePath,
	        content: 'blocked\n',
	        must_not_exist: true,
	      });

	      expect(blocked.error.code).toBe('REVISION_CONFLICT');
	      expect(existsSync(join(repoRoot, relativePath))).toBe(false);
	      expect(existsSync(lockPath)).toBe(true);
	      rmSync(lockPath, { recursive: true, force: true });
	    }, { accessMode: 'read_write' });
	  });

	  test('write mutation keeps live owner directory locks fail-closed', async () => {
	    await withReaderRepo(async (repoRoot, ctx) => {
	      const repoId = (await jsonTool(ctx, 'list_allowed_roots')).roots[0].repo_id;
	      const relativePath = 'docs/live-lock.txt';
	      const lockPath = mutationLockPath(repoId, relativePath);
	      writeMutationLockOwner(lockPath, {
	        repo_id: repoId,
	        path: relativePath,
	        pid: process.pid,
	        token: 'live-owner',
	        created_at: '2026-06-23T00:00:00.000Z',
	      });

	      const blocked = await jsonTool(ctx, 'write_file', {
	        repo_id: repoId,
	        path: relativePath,
	        content: 'blocked\n',
	        must_not_exist: true,
	      });

	      expect(blocked.error.code).toBe('REVISION_CONFLICT');
	      expect(existsSync(join(repoRoot, relativePath))).toBe(false);
	      expect(existsSync(lockPath)).toBe(true);
	      rmSync(lockPath, { recursive: true, force: true });
	    }, { accessMode: 'read_write' });
	  });

	  test('move_path commit does not use a hard-link then unlink commit sequence', () => {
	    const source = readFileSync(join(process.cwd(), 'src', 'cli', 'mcp', 'general-repo-access.ts'), 'utf-8');
	    const match = source.match(/function commitMoveNoOverwrite[\s\S]*?\r?\n}\r?\n\r?\nfunction invalidateRepoCaches/);
	    expect(match).not.toBeNull();
	    const body = match?.[0] ?? '';
	    expect(body).toContain('renameNoReplaceNative');
	    expect(body).not.toContain('linkSync(');
	    expect(body).not.toContain('rmSync(source.canonicalPath');
	  });

	  test('move_path native commit does not overwrite a target created after final preconditions', async () => {
	    await withReaderRepo(async (repoRoot, ctx) => {
	      const raceCtx = createReaderToolContext(
	        repoRoot,
	        ctx.policy,
	        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
	        undefined,
	        {
	          beforeNativeMoveCommit(event) {
	            if (event.toPath === 'docs/native-race-target.txt') {
	              writeFileSync(join(repoRoot, 'docs', 'native-race-target.txt'), 'external target\n');
	            }
	          },
	        },
	      );
	      const repoId = (await jsonTool(raceCtx, 'list_allowed_roots')).roots[0].repo_id;
	      writeFileSync(join(repoRoot, 'docs', 'native-race-source.txt'), 'source\n');
	      const sourceStat = await jsonTool(raceCtx, 'stat_file', { repo_id: repoId, path: 'docs/native-race-source.txt' });
	      const raced = await jsonTool(raceCtx, 'move_path', {
	        repo_id: repoId,
	        from_path: 'docs/native-race-source.txt',
	        to_path: 'docs/native-race-target.txt',
	        expected_sha256: sourceStat.sha256,
	        must_not_exist: true,
	      });

	      expect(raced.error.code).toBe('TARGET_EXISTS');
	      expect(readFileSync(join(repoRoot, 'docs', 'native-race-source.txt'), 'utf-8')).toBe('source\n');
	      expect(readFileSync(join(repoRoot, 'docs', 'native-race-target.txt'), 'utf-8')).toBe('external target\n');
	    }, { accessMode: 'read_write' });
	  });

	  test('write mutations cleanly abort injected pre-commit filesystem faults', async () => {
	    await withReaderRepo(async (repoRoot, ctx) => {
	      const writeCtx = createReaderToolContext(
	        repoRoot,
	        ctx.policy,
	        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
	      );
	      const repoId = (await jsonTool(writeCtx, 'list_allowed_roots')).roots[0].repo_id;

	      const createFault = await withMutationFault('atomic_write_before_rename', () => jsonTool(writeCtx, 'write_file', {
	        repo_id: repoId,
	        path: 'docs/fault-create.txt',
	        content: 'new\n',
	        must_not_exist: true,
	      }));
	      expect(createFault.error.code).toBe('INJECTED_MUTATION_FAULT');
	      expect(existsSync(join(repoRoot, 'docs', 'fault-create.txt'))).toBe(false);
	      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);

	      writeFileSync(join(repoRoot, 'docs', 'fault-replace.txt'), 'old\n');
	      const replaceStat = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/fault-replace.txt' });
	      const replaceFault = await withMutationFault('atomic_write_before_rename', () => jsonTool(writeCtx, 'write_file', {
	        repo_id: repoId,
	        path: 'docs/fault-replace.txt',
	        content: 'new\n',
	        expected_sha256: replaceStat.sha256,
	      }));
	      expect(replaceFault.error.code).toBe('INJECTED_MUTATION_FAULT');
	      expect(readFileSync(join(repoRoot, 'docs', 'fault-replace.txt'), 'utf-8')).toBe('old\n');
	      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);

	      const patchFault = await withMutationFault('atomic_write_before_rename', () => jsonTool(writeCtx, 'apply_patch', {
	        repo_id: repoId,
	        path: 'docs/fault-replace.txt',
	        expected_sha256: replaceStat.sha256,
	        edits: [{ old_text: 'old\n', new_text: 'patched\n' }],
	      }));
	      expect(patchFault.error.code).toBe('INJECTED_MUTATION_FAULT');
	      expect(readFileSync(join(repoRoot, 'docs', 'fault-replace.txt'), 'utf-8')).toBe('old\n');
	      expect(readdirSync(join(repoRoot, 'docs')).some((name) => name.includes('.repo-harness-'))).toBe(false);

	      writeFileSync(join(repoRoot, 'docs', 'fault-move.txt'), 'move\n');
	      const moveStat = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/fault-move.txt' });
	      const moveFault = await withMutationFault('move_before_rename', () => jsonTool(writeCtx, 'move_path', {
	        repo_id: repoId,
	        from_path: 'docs/fault-move.txt',
	        to_path: 'docs/fault-moved.txt',
	        expected_sha256: moveStat.sha256,
	        must_not_exist: true,
	      }));
	      expect(moveFault.error.code).toBe('INJECTED_MUTATION_FAULT');
	      expect(readFileSync(join(repoRoot, 'docs', 'fault-move.txt'), 'utf-8')).toBe('move\n');
	      expect(existsSync(join(repoRoot, 'docs', 'fault-moved.txt'))).toBe(false);

	      const deleteFault = await withMutationFault('delete_before_unlink', () => jsonTool(writeCtx, 'delete_path', {
	        repo_id: repoId,
	        path: 'docs/fault-move.txt',
	        expected_sha256: moveStat.sha256,
	      }));
	      expect(deleteFault.error.code).toBe('INJECTED_MUTATION_FAULT');
	      expect(readFileSync(join(repoRoot, 'docs', 'fault-move.txt'), 'utf-8')).toBe('move\n');
	      expect(readJsonLines(join(repoRoot, '.ai', 'harness', 'mcp', 'index-events.jsonl'))).toEqual([]);

	      const auditText = readFileSync(join(repoRoot, '.ai', 'harness', 'mcp', 'audit.log'), 'utf-8');
	      expect(auditText).toContain('"errorCode":"INJECTED_MUTATION_FAULT"');
	      expect(auditText).not.toContain('new\n');
	      expect(auditText).not.toContain('patched\n');
	      expect(auditText).not.toContain('move\n');
	    }, { accessMode: 'read_write' });
	  });

	  test('general repo tools merge CodeGraph metadata under the same guarded snapshot', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      writeFileSync(join(repoRoot, '.ignore'), 'ignored.md\n');
      const fakeCodeGraph: GeneralRepoCodeGraphAdapter = {
        discoverRepo() {
          return {
            available: true,
            integrated: true,
            source: 'test-double',
            indexRevision: 'index_fake1234',
            latencyMs: 3,
            files: [
              { path: 'src/index.ts', language: 'typescript', nodeCount: 2, size: 1 },
              { path: '.env', language: 'dotenv', nodeCount: 0, size: 29 },
              { path: 'ignored.md', language: 'markdown', nodeCount: 0, size: 10 },
              { path: '../outside.ts', language: 'typescript', nodeCount: 1, size: 10 },
              { path: '/tmp/outside.ts', language: 'typescript', nodeCount: 1, size: 10 },
              { path: 'C:/Users/example/outside.ts', language: 'typescript', nodeCount: 1, size: 10 },
              { path: 'docs/bad\0name.ts', language: 'typescript', nodeCount: 1, size: 10 },
              { path: 'missing.ts', language: 'typescript', nodeCount: 1, size: 10 },
            ],
          };
        },
      };
      const cgCtx = createReaderToolContext(
        repoRoot,
        ctx.policy,
        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
        fakeCodeGraph,
      );

      const repoId = (await jsonTool(cgCtx, 'list_allowed_roots')).roots[0].repo_id;
      const manifest = await jsonTool(cgCtx, 'repo_manifest', { repo_id: repoId, page_size: 1000 });
      const byPath = new Map(manifest.entries.map((entry: { path: string }) => [entry.path, entry]));
      expect(manifest.index_revision).toBe('index_fake1234');
      expect(manifest.snapshot_state).toBe('index_lagging');
      expect(manifest.snapshot_ttl_ms).toBe(300_000);
      expect(manifest.snapshot_created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(manifest.snapshot_expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(manifest.snapshot_cache).toMatchObject({
        hit: false,
        scope: 'repo_manifest',
        paths: ['.'],
        max_entries: 16,
        entry_metadata: {
          hits: expect.any(Number),
          misses: expect.any(Number),
          max_entries: 200_000,
        },
      });
      expect(manifest.snapshot_cache.key).not.toBe(manifest.snapshot_cache.snapshot_key);
      expect(manifest.codegraph).toMatchObject({
        integrated: true,
        available: true,
        source: 'test-double',
        indexed_files: 8,
        filtered_paths: 6,
        index_lagging: true,
        lagging_path_count: 2,
      });
      expect(manifest.codegraph.lagging_paths).toEqual(['missing.ts', 'src/index.ts']);
      expect(manifest.counts.indexed).toBe(2);
      expect(manifest.counts.index_lagging).toBe(1);
      expect(byPath.get('src/index.ts')).toMatchObject({
        indexed: true,
        codegraph_language: 'typescript',
        codegraph_node_count: 2,
        codegraph_index_lagging: true,
      });
      expect(byPath.get('.env')).toMatchObject({ indexed: true, codegraph_language: 'dotenv' });
      expect(byPath.get('docs/design.md')).toMatchObject({ indexed: false });
      expect(byPath.has('ignored.md')).toBe(false);

      const stat = await jsonTool(cgCtx, 'stat_file', { repo_id: repoId, path: 'src/index.ts', snapshot_id: manifest.snapshot_id });
      expect(stat.snapshot_id).toBe(manifest.snapshot_id);
      expect(stat.snapshot_cache.hit).toBe(true);
      expect(stat.snapshot_cache.scope).toBe('stat_file');
      expect(stat.snapshot_cache.paths).toEqual(['src/index.ts']);
      expect(stat.snapshot_cache.key).not.toBe(manifest.snapshot_cache.key);
      expect(stat.snapshot_cache.snapshot_key).toBe(manifest.snapshot_cache.snapshot_key);
      expect(stat).toMatchObject({ indexed: true, codegraph_language: 'typescript' });

      const read = await jsonTool(cgCtx, 'read_file', { repo_id: repoId, path: 'src/index.ts', snapshot_id: manifest.snapshot_id });
      expect(read.snapshot_id).toBe(manifest.snapshot_id);
      expect(read.snapshot_cache.hit).toBe(true);
      expect(read.snapshot_cache.scope).toBe('read_file');
      expect(read.snapshot_cache.paths).toEqual(['src/index.ts']);
      expect(read).toMatchObject({ indexed: true, backend: 'codegraph-indexed-filesystem-read' });

      const firstSearch = await jsonTool(cgCtx, 'search_text', {
        repo_id: repoId,
        query: 'alpha',
        paths: ['docs/notes.txt'],
        max_results: 1,
        snapshot_id: manifest.snapshot_id,
      });
      expect(firstSearch.snapshot_id).toBe(manifest.snapshot_id);
      expect(firstSearch.matches).toHaveLength(1);
      expect(firstSearch.next_cursor).toBe('1');
      const secondSearch = await jsonTool(cgCtx, 'search_text', {
        repo_id: repoId,
        query: 'alpha',
        paths: ['docs/notes.txt'],
        max_results: 1,
        cursor: firstSearch.next_cursor,
        snapshot_id: manifest.snapshot_id,
      });
      expect(secondSearch.matches[0].line).toBe(3);

      writeFileSync(join(repoRoot, 'src', 'index.ts'), 'export const readerFixture = 200;\n');
      const changed = await jsonTool(cgCtx, 'stat_file', { repo_id: repoId, path: 'src/index.ts' });
      expect(changed.snapshot_id).not.toBe(manifest.snapshot_id);
      expect(changed.snapshot_cache.hit).toBe(false);
      expect(changed.sha256).not.toBe((byPath.get('src/index.ts') as { sha256?: string }).sha256);
      const staleStatAfterChange = await jsonTool(cgCtx, 'stat_file', {
        repo_id: repoId,
        path: 'src/index.ts',
        snapshot_id: manifest.snapshot_id,
      });
      expect(staleStatAfterChange.error.code).toBe('SNAPSHOT_STALE');
      expect(staleStatAfterChange.error.retryable).toBe(true);
      const staleAfterChange = await jsonTool(cgCtx, 'read_file', {
        repo_id: repoId,
        path: 'src/index.ts',
        snapshot_id: manifest.snapshot_id,
      });
      expect(staleAfterChange.error.code).toBe('SNAPSHOT_STALE');
      expect(staleAfterChange.error.retryable).toBe(true);

      const stale = await jsonTool(cgCtx, 'read_file', { repo_id: repoId, path: 'src/index.ts', snapshot_id: 'snap_stale' });
      expect(stale.error.code).toBe('SNAPSHOT_STALE');
      expect(stale.error.retryable).toBe(true);
    });
  });

  test('general repo snapshots fail closed when repo changes during snapshot build', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      const repoId = (await jsonTool(ctx, 'list_allowed_roots')).roots[0].repo_id;
      let completeMutations = 0;
      const completeRaceCtx: ReaderToolContext = {
        ...ctx,
        testHooks: {
          afterSnapshotWalk(event) {
            if (event.kind !== 'complete' || completeMutations >= 2) return;
            completeMutations += 1;
            writeFileSync(join(repoRoot, 'src', `race-complete-${completeMutations}.ts`), `export const race = ${completeMutations};\n`);
          },
        },
      };

      const staleTree = await jsonTool(completeRaceCtx, 'list_tree', { repo_id: repoId, path: '.', depth: 2 });
      expect(staleTree.error.code).toBe('SNAPSHOT_STALE');
      expect(staleTree.error.retryable).toBe(true);
      expect(completeMutations).toBe(2);

      let pageMutations = 0;
      const pageRaceCtx: ReaderToolContext = {
        ...ctx,
        testHooks: {
          afterSnapshotWalk(event) {
            if (event.kind !== 'manifest_page' || pageMutations >= 2) return;
            pageMutations += 1;
            writeFileSync(join(repoRoot, 'src', `race-page-${pageMutations}.ts`), `export const pageRace = ${pageMutations};\n`);
          },
        },
      };

      const staleManifest = await jsonTool(pageRaceCtx, 'repo_manifest', { repo_id: repoId, page_size: 2 });
      expect(staleManifest.error.code).toBe('SNAPSHOT_STALE');
      expect(staleManifest.error.retryable).toBe(true);
      expect(pageMutations).toBe(2);
    });
  });

  test('general repo snapshot validation retries .ignore-only policy revision changes', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      const repoId = (await jsonTool(ctx, 'list_allowed_roots')).roots[0].repo_id;
      writeFileSync(join(repoRoot, '.ignore'), '');
      writeFileSync(join(repoRoot, 'docs', 'policy-race-tree-secret.txt'), 'tree secret\n');
      let completeMutations = 0;
      const completeRaceCtx: ReaderToolContext = {
        ...ctx,
        testHooks: {
          afterSnapshotWalk(event) {
            if (event.kind !== 'complete' || event.attempt !== 0 || completeMutations > 0) return;
            completeMutations += 1;
            writeFileSync(join(repoRoot, '.ignore'), 'docs/policy-race-tree-secret.txt\n');
          },
        },
      };

      const tree = await jsonTool(completeRaceCtx, 'list_tree', { repo_id: repoId, path: '.', depth: 2 });
      expect(tree.error).toBeUndefined();
      expect(tree.stale).toBe(false);
      expect(completeMutations).toBe(1);
      expect((tree.entries as Array<{ path: string }>).map((entry) => entry.path)).not.toContain('docs/policy-race-tree-secret.txt');

      writeFileSync(join(repoRoot, '.ignore'), '');
      writeFileSync(join(repoRoot, 'docs', 'policy-race-manifest-secret.txt'), 'manifest secret\n');
      let pageMutations = 0;
      const pageRaceCtx: ReaderToolContext = {
        ...ctx,
        testHooks: {
          afterSnapshotWalk(event) {
            if (event.kind !== 'manifest_page' || event.attempt !== 0 || pageMutations > 0) return;
            pageMutations += 1;
            writeFileSync(join(repoRoot, '.ignore'), 'docs/policy-race-manifest-secret.txt\n');
          },
        },
      };

      const manifest = await jsonTool(pageRaceCtx, 'repo_manifest', { repo_id: repoId, page_size: 100 });
      expect(manifest.error).toBeUndefined();
      expect(manifest.stale).toBe(false);
      expect(pageMutations).toBe(1);
      expect((manifest.entries as Array<{ path: string }>).map((entry) => entry.path)).not.toContain('docs/policy-race-manifest-secret.txt');

      writeFileSync(join(repoRoot, '.ignore'), '');
      const identityAttempts: number[] = [];
      const identityRaceCtx: ReaderToolContext = {
        ...ctx,
        testHooks: {
          afterSnapshotWalk(event) {
            if (event.kind !== 'complete') return;
            identityAttempts.push(event.attempt);
            if (event.attempt !== 0) return;
            rmSync(join(repoRoot, '.ignore'), { force: true });
            writeFileSync(join(repoRoot, '.ignore'), '');
          },
        },
      };

      const identityTree = await jsonTool(identityRaceCtx, 'list_tree', { repo_id: repoId, path: '.', depth: 1 });
      expect(identityTree.error).toBeUndefined();
      expect(identityTree.stale).toBe(false);
      expect(identityAttempts).toEqual([0, 1]);
    });
  });

  test('general repo security hardening fails closed on fuzzed inputs, partial walks, and raw adapter errors', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      writeFileSync(join(repoRoot, '.ignore'), 'ignored.md\n');
      const throwingCodeGraph: GeneralRepoCodeGraphAdapter = {
        discoverRepo() {
          return {
            available: true,
            integrated: true,
            source: 'test-double',
            indexRevision: 'index_throw_before',
            latencyMs: 1,
            files: [],
          };
        },
        refreshRepo() {
          throw new Error('OPENAI_API_KEY=sk-testsecret thrown from adapter');
        },
      };
      const secureCtx = createReaderToolContext(
        repoRoot,
        ctx.policy,
        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
        throwingCodeGraph,
      );
      const repoId = (await jsonTool(secureCtx, 'list_allowed_roots')).roots[0].repo_id;

      const invalidReadPaths = [
        { path: '../package.json', code: 'INVALID_RELATIVE_PATH' },
        { path: '/tmp/package.json', code: 'INVALID_RELATIVE_PATH' },
        { path: 'C:\\temp\\package.json', code: 'INVALID_RELATIVE_PATH' },
        { path: 'docs/bad\0name.txt', code: 'INVALID_RELATIVE_PATH' },
      ];
      for (const sample of invalidReadPaths) {
        const result = await jsonTool(secureCtx, 'read_file', { repo_id: repoId, path: sample.path });
        expect(result.error.code).toBe(sample.code);
      }

      const ignoredRefresh = await jsonTool(secureCtx, 'refresh_repo_index', {
        repo_id: repoId,
        paths: ['ignored.md'],
      });
      expect(ignoredRefresh.error.code).toBe('PATH_IGNORED');
      const traversalRefresh = await jsonTool(secureCtx, 'refresh_repo_index', {
        repo_id: repoId,
        paths: ['docs/../package.json'],
      });
      expect(traversalRefresh.error.code).toBe('INVALID_RELATIVE_PATH');

      const design = await jsonTool(secureCtx, 'stat_file', { repo_id: repoId, path: 'docs/design.md' });
      const badPatch = await jsonTool(secureCtx, 'apply_patch', {
        repo_id: repoId,
        path: 'docs/design.md',
        expected_sha256: design.sha256,
        unified_diff: [
          '@@ -1,0 +1,1 @@',
          '+OPENAI_API_KEY=sk-testsecret',
        ].join('\n'),
      });
      expect(badPatch.error.code).toBe('INVALID_RANGE');
      expect(readFileSync(join(repoRoot, 'docs', 'design.md'), 'utf-8')).toContain('authentication route');

      let danglingEntries = 0;
      for (let index = 0; index < 24; index += 1) {
        try {
          symlinkSync(join(repoRoot, 'docs', `deleted-during-walk-${index}.md`), join(repoRoot, 'docs', `dangling-during-walk-${index}.md`));
          danglingEntries += 1;
        } catch (_error) {
          // Symlinks may be unavailable on some runners; the parser/error redaction checks still cover this test.
          break;
        }
      }
      if (danglingEntries > 0) {
        const partialManifest = await jsonTool(secureCtx, 'repo_manifest', { repo_id: repoId, page_size: 1000 });
        expect(partialManifest.partial).toBe(true);
        expect(partialManifest.complete).toBe(false);
        expect(partialManifest.walker_errors).toBeGreaterThanOrEqual(danglingEntries);
      }
      if (process.platform !== 'win32' && process.getuid?.() !== 0) {
        const lockedDir = join(repoRoot, 'docs', 'permission-changed');
        mkdirSync(lockedDir, { recursive: true });
        writeFileSync(join(lockedDir, 'locked.txt'), 'locked\n');
        chmodSync(lockedDir, 0);
        try {
          const permissionManifest = await jsonTool(secureCtx, 'repo_manifest', { repo_id: repoId, page_size: 1000 });
          expect(permissionManifest.partial).toBe(true);
          expect(permissionManifest.complete).toBe(false);
          expect(permissionManifest.walker_errors).toBeGreaterThan(0);
        } finally {
          chmodSync(lockedDir, 0o700);
        }
      }

      writeFileSync(join(repoRoot, 'docs', 'budget-a.txt'), 'abcdef');
      writeFileSync(join(repoRoot, 'docs', 'budget-b.txt'), 'ghijkl');
      const budgetedBatch = await jsonTool(secureCtx, 'read_files', {
        repo_id: repoId,
        byte_budget: 5,
        requests: [{ path: 'docs/budget-a.txt' }, { path: 'docs/budget-b.txt' }],
      });
      expect(budgetedBatch.partial).toBe(true);
      expect(budgetedBatch.results[0]).toMatchObject({
        path: 'docs/budget-a.txt',
        bytes_returned: 5,
        has_more: true,
        next_cursor: 'byte:5',
      });
      expect(budgetedBatch.results[1].error.code).toBe('PAYLOAD_LIMIT_REACHED');

      const thrownRefresh = await jsonTool(secureCtx, 'refresh_repo_index', {
        repo_id: repoId,
        paths: ['docs/design.md'],
      });
      expect(thrownRefresh.error.code).toBe('INTERNAL_ADAPTER_ERROR');
      expect(JSON.stringify(thrownRefresh)).not.toContain('sk-testsecret');
      expect(JSON.stringify(thrownRefresh)).toContain('[REDACTED]');

      const auditText = readFileSync(join(repoRoot, '.ai', 'harness', 'mcp', 'audit.log'), 'utf-8');
      expect(auditText).not.toContain('sk-testsecret');
      expect(auditText).not.toContain('OPENAI_API_KEY=sk-testsecret');
      const indexEventsText = readFileSync(join(repoRoot, '.ai', 'harness', 'mcp', 'index-events.jsonl'), 'utf-8');
      expect(indexEventsText).not.toContain('sk-testsecret');
      expect(indexEventsText).not.toContain('OPENAI_API_KEY=sk-testsecret');
    }, { accessMode: 'read_write' });
  });

  test('general repo observability emits metrics and traces without content labels', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      const fakeCodeGraph: GeneralRepoCodeGraphAdapter = {
        discoverRepo() {
          return {
            available: true,
            integrated: true,
            source: 'test-double',
            indexRevision: 'index_observable',
            latencyMs: 7,
            files: [
              { path: 'docs/design.md', language: 'markdown', nodeCount: 2, size: 999 },
              { path: '../outside.ts', language: 'typescript', nodeCount: 1, size: 10 },
            ],
          };
        },
      };
      const obsCtx = createReaderToolContext(
        repoRoot,
        ctx.policy,
        new WorkspaceManager({ allowedRoots: [repoRoot], policy: ctx.policy }),
        fakeCodeGraph,
      );
      const repoId = (await jsonTool(obsCtx, 'list_allowed_roots')).roots[0].repo_id;

      const manifest = await jsonTool(obsCtx, 'repo_manifest', { repo_id: repoId, page_size: 20 });
      expect(manifest.correlation_id).toMatch(/^mcpcorr_[a-f0-9]{16}$/);
      expect(manifest.codegraph).toMatchObject({
        index_revision: 'index_observable',
        filtered_paths: 1,
        index_lagging: true,
        lagging_path_count: 1,
      });

      const fallbackRead = await jsonTool(obsCtx, 'read_file', { repo_id: repoId, path: '.env' });
      expect(fallbackRead.content).toContain('sk-testsecret');
      expect(fallbackRead.backend).toBe('filesystem-fallback');
      expect(fallbackRead.correlation_id).toMatch(/^mcpcorr_[a-f0-9]{16}$/);

      const blocked = await jsonTool(obsCtx, 'stat_file', { repo_id: repoId, path: '../outside.md' });
      expect(blocked.error.code).toBe('INVALID_RELATIVE_PATH');
      expect(blocked.correlation_id).toMatch(/^mcpcorr_[a-f0-9]{16}$/);

      const repeatedManifest = await jsonTool(obsCtx, 'repo_manifest', {
        repo_id: repoId,
        page_size: 20,
        snapshot_id: manifest.snapshot_id,
      });
      expect(repeatedManifest.snapshot_id).toBe(manifest.snapshot_id);
      expect(repeatedManifest.error).toBeUndefined();

      const metrics = readJsonLines(join(repoRoot, '.ai', 'harness', 'mcp', 'metrics.jsonl'));
      const traces = readJsonLines(join(repoRoot, '.ai', 'harness', 'mcp', 'trace.jsonl'));
      const metricText = JSON.stringify(metrics);
      const traceText = JSON.stringify(traces);
      expect(metricText).not.toContain('authentication route');
      expect(metricText).not.toContain('sk-testsecret');
      expect(metricText).not.toContain('docs/design.md');
      expect(metricText).not.toContain('outside');
      expect(traceText).not.toContain('authentication route');
      expect(traceText).not.toContain('sk-testsecret');
      expect(traceText).not.toContain('docs/design.md');
      expect(traceText).not.toContain('outside');

      const manifestMetric = metrics.find((entry) => entry.correlation_id === manifest.correlation_id);
      expect(manifestMetric).toMatchObject({
        event_type: 'mcp_tool_metric',
        repo_id: repoId,
        tool: 'repo_manifest',
        status: 'ok',
        codegraph_revision: 'index_observable',
        manifest_parity_failure_count: 1,
        index_lagging: true,
        lagging_path_count: 1,
      });
      expect(manifestMetric?.path_digest).toMatch(/^sha256:/);

      const readMetric = metrics.find((entry) => entry.correlation_id === fallbackRead.correlation_id);
      expect(readMetric).toMatchObject({
        tool: 'read_file',
        status: 'ok',
        fallback_used: true,
        bytes_returned: fallbackRead.bytes_returned,
        filtered_path_count: 1,
        manifest_parity_failure_count: 0,
      });

      const blockedMetric = metrics.find((entry) => entry.correlation_id === blocked.correlation_id);
      expect(blockedMetric).toMatchObject({
        tool: 'stat_file',
        status: 'blocked',
        error_code: 'INVALID_RELATIVE_PATH',
        path_escape_attempt: true,
      });

      const readTrace = traces.find((entry) => entry.correlation_id === fallbackRead.correlation_id);
      expect(readTrace).toMatchObject({
        event_type: 'mcp_tool_trace',
        trace_id: fallbackRead.correlation_id,
        tool: 'read_file',
        status: 'ok',
        backend: 'filesystem-fallback',
      });
      expect(readTrace?.route).toEqual(['mcp_tool_gateway', 'repo_policy', 'path_guard_ignore_policy', 'filesystem-fallback', 'response']);
    });
  });

  test('general repo tools fail closed when the repo root disappears or is replaced during runtime', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      const repoId = (await jsonTool(ctx, 'list_allowed_roots')).roots[0].repo_id;
      rmSync(repoRoot, { recursive: true, force: true });
      mkdirSync(repoRoot, { recursive: true });
      writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'replacement' }));
      const replacedRoot = await jsonTool(ctx, 'stat_file', { repo_id: repoId, path: 'package.json' });
      expect(replacedRoot.error.code).toBe('REPO_NOT_ALLOWED');
      expect(JSON.stringify(replacedRoot)).not.toContain(repoRoot);

      rmSync(repoRoot, { recursive: true, force: true });
      const missingRoot = await jsonTool(ctx, 'stat_file', { repo_id: repoId, path: 'package.json' });
      expect(missingRoot.error.code).toBe('REPO_NOT_ALLOWED');
      expect(JSON.stringify(missingRoot)).not.toContain(repoRoot);
    });
  });

  test('tree applies hidden, ignore, deny, symlink, and entry limits without leaking denied names', async () => {
    await withReaderRepo(async (_repoRoot, ctx) => {
      const root = (await jsonTool(ctx, 'list_allowed_roots')).roots[0];
      const opened = await jsonTool(ctx, 'open_workspace', { root_id: root.root_id });

      const defaultTree = await jsonTool(ctx, 'tree', { workspace_id: opened.workspace_id, path: '.', max_depth: 3 });
      const defaultPaths = defaultTree.entries.map((entry: { path: string }) => entry.path);
      expect(defaultPaths).toContain('package.json');
      expect(defaultPaths).toContain('src/index.ts');
      expect(defaultPaths).toContain('docs/design.md');
      expect(defaultPaths).not.toContain('docs/.hidden.md');
      expect(defaultPaths).not.toContain('.env');
      expect(defaultPaths).not.toContain('secrets');
      expect(defaultPaths).not.toContain('secrets/token.txt');
      expect(defaultPaths).not.toContain('.ssh');
      expect(defaultPaths).not.toContain('.ssh/id_rsa');
      expect(defaultPaths).not.toContain('ignored.md');
      expect(defaultPaths).not.toContain('ignored-dir');
      expect(defaultTree.blocked_entries).toBeGreaterThanOrEqual(2);

      const hiddenTree = await jsonTool(ctx, 'tree', { workspace_id: opened.workspace_id, path: '.', include_hidden: true, max_depth: 3 });
      const hiddenPaths = hiddenTree.entries.map((entry: { path: string }) => entry.path);
      expect(hiddenPaths).toContain('docs/.hidden.md');
      expect(hiddenPaths).not.toContain('.env');

      const limitedTree = await jsonTool(ctx, 'tree', { workspace_id: opened.workspace_id, path: '.', max_entries: 1 });
      expect(limitedTree.entries).toHaveLength(1);
      expect(limitedTree.truncated).toBe(true);
      expect(hiddenPaths.some((path: string) => path === 'docs/loop')).toBe(true);
    });
  });

  test('read_text chunks line ranges, rejects denied and binary files, and redacts returned text', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      writeFileSync(join(repoRoot, 'docs', 'large.md'), Array.from({ length: 2505 }, (_, index) => `line-${index + 1}`).join('\n'));
      writeFileSync(join(repoRoot, 'docs', 'single-line.md'), 'x'.repeat(4096));
      writeFileSync(join(repoRoot, 'docs', 'secret-note.md'), 'OPENAI_API_KEY=sk-testsecret\nsafe\n');
      const root = (await jsonTool(ctx, 'list_allowed_roots')).roots[0];
      const opened = await jsonTool(ctx, 'open_workspace', { root_id: root.root_id });

      const range = await jsonTool(ctx, 'read_text', {
        workspace_id: opened.workspace_id,
        path: 'docs/design.md',
        start_line: 2,
        end_line: 2,
      });
      expect(range.text).toBe('2: authentication route');
      expect(range.has_more).toBe(true);
      expect(range.next_start_line).toBe(3);
      expect(range.content_sha256).toMatch(/^[a-f0-9]{64}$/);

      const chunk = await jsonTool(ctx, 'read_text', {
        workspace_id: opened.workspace_id,
        path: 'docs/large.md',
        start_line: 1,
        end_line: 2505,
        line_numbers: false,
      });
      expect(chunk.end_line).toBe(2000);
      expect(chunk.has_more).toBe(true);
      expect(chunk.next_start_line).toBe(2001);

      const longLine = await jsonTool(ctx, 'read_text', {
        workspace_id: opened.workspace_id,
        path: 'docs/single-line.md',
        max_bytes: 1024,
        line_numbers: false,
      });
      expect(longLine.text).toHaveLength(1024);
      expect(longLine.bytes_returned).toBeLessThanOrEqual(1024);
      expect(longLine.truncated).toBe(true);
      expect(longLine.has_more).toBe(true);

      const redacted = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'docs/secret-note.md' });
      expect(redacted.text).not.toContain('sk-testsecret');
      expect(redacted.redactions.length).toBeGreaterThanOrEqual(1);

      const source = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'src/index.ts' });
      expect(source.text).toBe('1: export const readerFixture = 1;');
      const manifest = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'package.json', start_line: 2, end_line: 2 });
      expect(manifest.text).toBe('2:   "name": "reader-fixture",');

      const denied = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'secrets/token.txt' });
      expect(denied.error.code).toBe('PATH_DENIED');
      const binary = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'docs/binary.bin' });
      expect(binary.error.code).toBe('BINARY_FILE');
    });
  });

  test('search_text is literal, bounded, deterministic, redacted, and deny-aware', async () => {
    await withReaderRepo(async (repoRoot, ctx) => {
      writeFileSync(join(repoRoot, 'docs', 'secrets-in-text.md'), 'OPENAI_API_KEY=sk-testsecret is mentioned near authentication\n');
      const root = (await jsonTool(ctx, 'list_allowed_roots')).roots[0];
      const opened = await jsonTool(ctx, 'open_workspace', { root_id: root.root_id });

      const insensitive = await jsonTool(ctx, 'search_text', {
        workspace_id: opened.workspace_id,
        query: 'alpha',
        path: 'docs',
        glob: '**/*.txt',
      });
      expect(insensitive.matches.map((entry: { line: number }) => entry.line)).toEqual([1, 3]);

      const sensitive = await jsonTool(ctx, 'search_text', {
        workspace_id: opened.workspace_id,
        query: 'alpha',
        path: 'docs',
        glob: '**/*.txt',
        case_sensitive: true,
      });
      expect(sensitive.matches).toHaveLength(0);

      const redacted = await jsonTool(ctx, 'search_text', {
        workspace_id: opened.workspace_id,
        query: 'authentication',
        path: 'docs',
        max_results: 2,
      });
      expect(redacted.matches).toHaveLength(2);
      expect(redacted.truncated).toBe(true);
      expect(JSON.stringify(redacted.matches)).not.toContain('sk-testsecret');
      expect(redacted.matches.map((entry: { path: string }) => entry.path)).toEqual([...redacted.matches.map((entry: { path: string }) => entry.path)].sort());

      const denied = await jsonTool(ctx, 'search_text', { workspace_id: opened.workspace_id, query: 'TOKEN', path: 'secrets' });
      expect(denied.error.code).toBe('PATH_DENIED');
      const missingQuery = await jsonTool(ctx, 'search_text', { workspace_id: opened.workspace_id, query: '' });
      expect(missingQuery.error.code).toBe('MISSING_QUERY');
    });
  });
});
