import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildReaderToolDefinitions, callReaderTool, createReaderToolContext, type ReaderToolContext } from '../../src/cli/mcp/reader-tools';
import { WorkspaceManager } from '../../src/cli/mcp/workspaces';

async function jsonTool(ctx: ReaderToolContext, name: string, args: Record<string, unknown> = {}) {
  const result = await callReaderTool(ctx, name, args);
  return JSON.parse(result.content[0].text);
}

async function withReaderRepo<T>(fn: (repoRoot: string, ctx: ReaderToolContext) => Promise<T>): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-reader-tools-'));
  try {
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
    try {
      symlinkSync(repoRoot, join(repoRoot, 'docs', 'loop'));
    } catch (_error) {
      // Symlinks may be unavailable on some runners; tree must still be covered by ordinary directories.
    }
    const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [repoRoot] });
    const ctx = createReaderToolContext(repoRoot, policy, new WorkspaceManager({ allowedRoots: [repoRoot], policy }));
    return await fn(repoRoot, ctx);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe('MCP reader tools', () => {
  test('exposes exactly the read-only reader tool registry and session-local workspaces', async () => {
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
      ]);
      for (const definition of definitions) {
        expect(definition.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
        expect(definition.inputSchema.additionalProperties).toBe(false);
      }

      const status = await jsonTool(ctx, 'reader_status');
      expect(status.capability).toBe('workspaceReader');
      expect(status.configured_root_count).toBe(1);
      expect(status.schema_hash).toMatch(/^[a-f0-9]{64}$/);

      const roots = await jsonTool(ctx, 'list_allowed_roots');
      const root = roots.roots.find((entry: { path: string }) => entry.path === realpathSync(repoRoot));
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
        expect(capabilities.repo_id).toBe(repoId);
        expect(capabilities.registry_revision).toMatch(/^registry_/);

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
