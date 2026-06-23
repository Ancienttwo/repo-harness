import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
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
    const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [repoRoot] });
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
        'refresh_repo_index',
      ]);
      for (const definition of definitions) {
        if (definition.name === 'write_file' || definition.name === 'refresh_repo_index') {
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
      expect(capabilities.write_tools).toEqual(['write_file', 'refresh_repo_index']);

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
      });
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
        },
        index: {
          state: 'ready',
          action: 'refresh_complete',
          refreshed_paths: ['docs/generated.txt'],
        },
      });
      expect(refreshCalls).toEqual([['docs/generated.txt']]);
      const statAfterRefresh = await jsonTool(writeCtx, 'stat_file', { repo_id: repoId, path: 'docs/generated.txt' });
      expect(statAfterRefresh).toMatchObject({
        indexed: true,
        codegraph_language: 'text',
        codegraph_node_count: 1,
        codegraph_size: 'second\n'.length,
      });

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

      const auditText = readFileSync(join(repoRoot, '.ai', 'harness', 'mcp', 'audit.log'), 'utf-8');
      expect(auditText).toContain('"tool":"write_file"');
      expect(auditText).toContain('"status":"ok"');
      expect(auditText).toContain('"status":"blocked"');
      expect(auditText).not.toContain('first\n');
      expect(auditText).not.toContain('second\n');
      expect(auditText).not.toContain('stale\n');
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
        indexed_files: 5,
        filtered_paths: 3,
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
