import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, relative, sep } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const SCHEMA_PATH = join(ROOT, 'assets/mcp/general-repo-reader-tools.v1.schema.json');
const FIXTURE_ROOT = join(ROOT, 'tests/fixtures/mcp-codegraph-access/repo');
const FIXTURE_OUTSIDE = join(ROOT, 'tests/fixtures/mcp-codegraph-access/outside/outside.txt');

const TOOL_NAMES = [
  'get_repo_capabilities',
  'repo_manifest',
  'list_tree',
  'search_text',
  'read_file',
  'read_files',
  'stat_file',
  'write_file',
  'refresh_repo_index',
];

const COMMON_RESPONSE_FIELDS = [
  'repo_id',
  'snapshot_id',
  'snapshot_state',
  'snapshot_created_at',
  'snapshot_expires_at',
  'snapshot_ttl_ms',
  'snapshot_cache',
  'index_revision',
  'ignore_digest',
  'stale',
  'partial',
  'next_cursor',
];

interface IgnoreRule {
  pattern: string;
  negated: boolean;
}

interface ManifestEntry {
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  indexed: boolean;
  readable: boolean;
  symlinkTargetKind: 'internal' | 'external' | 'none';
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

function schemaTypeMatches(value: unknown, type: string): boolean {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function resolveSchemaRef(root: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema ref: ${ref}`);
  return ref.slice(2).split('/').reduce<unknown>((node, part) => {
    if (typeof node !== 'object' || node === null) throw new Error(`Invalid schema ref: ${ref}`);
    return (node as Record<string, unknown>)[part];
  }, root);
}

function validateJsonSchema(schema: unknown, value: unknown, root: Record<string, unknown>, path = '$'): SchemaValidationResult {
  if (typeof schema !== 'object' || schema === null) return { valid: true, errors: [] };
  const schemaObject = schema as Record<string, unknown>;
  if (typeof schemaObject.$ref === 'string') {
    return validateJsonSchema(resolveSchemaRef(root, schemaObject.$ref), value, root, path);
  }

  const errors: string[] = [];
  if (schemaObject.const !== undefined && value !== schemaObject.const) {
    errors.push(`${path} expected const ${JSON.stringify(schemaObject.const)}`);
  }
  if (Array.isArray(schemaObject.enum) && !schemaObject.enum.includes(value)) {
    errors.push(`${path} expected enum member`);
  }
  if (typeof schemaObject.type === 'string' && !schemaTypeMatches(value, schemaObject.type)) {
    errors.push(`${path} expected type ${schemaObject.type}`);
    return { valid: false, errors };
  }
  if (Array.isArray(schemaObject.required)) {
    const valueObject = value as Record<string, unknown>;
    for (const key of schemaObject.required) {
      if (typeof key === 'string' && !(key in valueObject)) errors.push(`${path}.${key} is required`);
    }
  }
  if (Array.isArray(schemaObject.oneOf)) {
    const matches = schemaObject.oneOf.filter((candidate) => validateJsonSchema(candidate, value, root, path).valid);
    if (matches.length !== 1) errors.push(`${path} expected exactly one oneOf match, got ${matches.length}`);
  }
  if (schemaObject.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const properties = schemaObject.properties as Record<string, unknown>;
    const valueObject = value as Record<string, unknown>;
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in valueObject) {
        errors.push(...validateJsonSchema(childSchema, valueObject[key], root, `${path}.${key}`).errors);
      }
    }
    if (schemaObject.additionalProperties === false) {
      for (const key of Object.keys(valueObject)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
      }
    }
  }
  if (schemaObject.items && Array.isArray(value)) {
    value.forEach((entry, index) => {
      errors.push(...validateJsonSchema(schemaObject.items, entry, root, `${path}[${index}]`).errors);
    });
  }

  return { valid: errors.length === 0, errors };
}

function sampleSuccessPayload(toolName: string): Record<string, unknown> {
  const common = {
    repo_id: 'repo_fixture',
    snapshot_id: 'snap_fixture',
    index_revision: 1,
    ignore_digest: `sha256:${'a'.repeat(64)}`,
    stale: false,
    partial: false,
    next_cursor: null,
  };
  switch (toolName) {
    case 'get_repo_capabilities':
      return {
        repo_id: 'repo_fixture',
        access_mode: 'read_only',
        read_tools: TOOL_NAMES,
        write_tools: [],
        limits: { max_read_bytes: 1024 },
      };
    case 'repo_manifest':
      return { ...common, entries: [], complete: true };
    case 'list_tree':
      return { ...common, entries: [] };
    case 'search_text':
      return { ...common, matches: [] };
    case 'read_file':
      return { ...common, path: 'README.md', sha256: 'b'.repeat(64), content: 'ok' };
    case 'read_files':
      return { ...common, results: [] };
    case 'stat_file':
      return { ...common, path: 'README.md', type: 'file', indexed: true, readable: true };
    case 'write_file':
      return {
        ...common,
        path: 'README.md',
        mutation_id: `mut_${'c'.repeat(16)}`,
        before: { existed: false, sha256: null, size: 0 },
        after: { sha256: 'd'.repeat(64), size: 2 },
        diff: { format: 'summary', bytes_before: 0, bytes_after: 2, bytes_delta: 2, before_sha256: null, after_sha256: 'd'.repeat(64) },
        index_state: 'pending',
      };
    case 'refresh_repo_index':
      return {
        ...common,
        paths: ['README.md'],
        refreshed: true,
        index_state: 'ready',
        refresh: { strategy: 'repo-sync', requested_paths: ['README.md'], path_refresh_supported: false },
        index: { state: 'ready', action: 'refresh_complete', refreshed_paths: ['README.md'] },
      };
    default:
      throw new Error(`Missing sample payload for ${toolName}`);
  }
}

function sampleErrorPayload(): Record<string, unknown> {
  return {
    error: {
      code: 'REPO_NOT_ALLOWED',
      message: 'repo_id is not in the registered repo whitelist',
      retryable: false,
      details: { repo_id: 'missing' },
    },
  };
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function validateRepoRelativePath(path: string): 'ok' | 'INVALID_RELATIVE_PATH' {
  const trimmed = path.trim();
  if (trimmed.length === 0) return 'INVALID_RELATIVE_PATH';
  if (isAbsolute(trimmed) || /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) {
    return 'INVALID_RELATIVE_PATH';
  }
  if (trimmed.split(/[\\/]+/).some((part) => part === '..')) return 'INVALID_RELATIVE_PATH';
  return 'ok';
}

function copyFixture(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      copyFixture(from, to);
    } else if (entry.isFile()) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}

function readIgnoreRules(root: string): IgnoreRule[] {
  return readFileSync(join(root, '.ignore'), 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => ({
      pattern: line.startsWith('!') ? line.slice(1) : line,
      negated: line.startsWith('!'),
    }));
}

function matchesIgnorePattern(pattern: string, path: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (!pattern.includes('/')) {
    return path.split('/').includes(pattern);
  }
  return path === pattern;
}

function isIgnored(path: string, rules: IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (matchesIgnorePattern(rule.pattern, path)) ignored = !rule.negated;
  }
  return ignored;
}

function walk(root: string, dir = root): string[] {
  const paths: string[] = [];
  for (const child of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(dir, child.name);
    const relativePath = toPosixPath(relative(root, absolute));
    paths.push(relativePath);
    if (child.isDirectory()) paths.push(...walk(root, absolute));
  }
  return paths;
}

function manifestFromSecureWalker(root: string, indexedPaths: Set<string>): { ignoreDigest: string; entries: ManifestEntry[] } {
  const canonicalRoot = realpathSync(root);
  const ignoreText = readFileSync(join(root, '.ignore'), 'utf-8');
  const rules = readIgnoreRules(root);
  const entries: ManifestEntry[] = [];

  for (const path of walk(root)) {
    if (path === '.ignore') continue;
    if (isIgnored(path, rules)) continue;

    const absolutePath = join(root, path);
    const lstat = lstatSync(absolutePath);
    let symlinkTargetKind: ManifestEntry['symlinkTargetKind'] = 'none';
    let readable = true;

    if (lstat.isSymbolicLink()) {
      const target = realpathSync(absolutePath);
      const relation = relative(canonicalRoot, target);
      const inside = relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
      symlinkTargetKind = inside ? 'internal' : 'external';
      readable = inside;
    }

    entries.push({
      path,
      type: lstat.isDirectory() ? 'dir' : lstat.isSymbolicLink() ? 'symlink' : lstat.isFile() ? 'file' : 'other',
      indexed: indexedPaths.has(path),
      readable,
      symlinkTargetKind,
    });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { ignoreDigest: `sha256:${sha256(ignoreText)}`, entries };
}

describe('general repo CodeGraph contract', () => {
  test('versioned schema freezes the general repo reader plus write/index-sync surface', () => {
    const schema = readJson(SCHEMA_PATH);
    expect(schema.properties.version.const).toBe('1');
    expect(schema.properties.policy.properties.content_exclusion.const).toBe('.ignore');
    expect(schema.properties.policy.properties.implicit_redaction.const).toBe(false);
    expect(schema['x-repo-harness-tools']).toBeUndefined();
    expect(schema.tools.map((tool: { name: string }) => tool.name)).toEqual(TOOL_NAMES);
    expect(schema.properties.common_response_fields.items.enum).toEqual(COMMON_RESPONSE_FIELDS);

    for (const tool of schema.tools) {
      expect(validateJsonSchema(schema.$defs.tool, tool, schema).errors).toEqual([]);
      if (tool.name === 'write_file' || tool.name === 'refresh_repo_index') {
        expect(tool.annotations).toEqual({
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        });
        if (tool.name === 'write_file') {
          expect(tool.input_schema.required).toEqual(['repo_id', 'path', 'content']);
          expect(tool.input_schema.properties.expected_sha256).toEqual({ type: 'string' });
          expect(tool.input_schema.properties.must_not_exist).toEqual({ type: 'boolean' });
        } else {
          expect(tool.input_schema.required).toEqual(['repo_id']);
          expect(tool.input_schema.properties.paths.items).toEqual({ type: 'string' });
        }
      } else {
        expect(tool.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect(tool.input_schema.properties.repo_id).toEqual({ type: 'string' });
      expect(validateJsonSchema(tool.output_schema, sampleSuccessPayload(tool.name), schema).errors).toEqual([]);
      expect(validateJsonSchema(tool.output_schema, sampleErrorPayload(), schema).errors).toEqual([]);
    }
  });

  test('fixture manifest uses .ignore only and treats CodeGraph inventory as metadata', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'repo-harness-codegraph-contract-'));
    const repoRoot = join(tempRoot, 'repo');
    try {
      copyFixture(FIXTURE_ROOT, repoRoot);
      writeFileSync(join(repoRoot, 'empty.txt'), '');
      writeFileSync(join(repoRoot, 'large.txt'), `${'large-line\n'.repeat(4096)}`);
      writeFileSync(join(repoRoot, 'binary.bin'), Buffer.from([0, 1, 2, 3, 255]));
      symlinkSync(join(repoRoot, 'docs/nested/guide.md'), join(repoRoot, 'internal-link.md'));
      symlinkSync(join(repoRoot, 'internal-link.md'), join(repoRoot, 'internal-chain.md'));
      symlinkSync(FIXTURE_OUTSIDE, join(repoRoot, 'external-link.txt'));

      const fakeCodeGraphIndexed = new Set([
        'README.md',
        'src/app.ts',
        'docs/nested/guide.md',
      ]);
      const manifest = manifestFromSecureWalker(repoRoot, fakeCodeGraphIndexed);
      const visiblePaths = manifest.entries.map((entry) => entry.path);

      expect(manifest.ignoreDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(visiblePaths).toContain('.env.allowed');
      expect(visiblePaths).toContain('.gitignore');
      expect(visiblePaths).toContain('.config');
      expect(visiblePaths).toContain('.config/settings.json');
      expect(visiblePaths).toContain('docs/.hidden.md');
      expect(visiblePaths).toContain('gitignored-but-visible.txt');
      expect(visiblePaths).toContain('generated/keep/gitignored-visible.txt');
      expect(visiblePaths).toContain('generated/drop/keep-visible.txt');
      expect(visiblePaths).toContain('unknown.widget');
      expect(visiblePaths).toContain('empty.txt');
      expect(visiblePaths).toContain('large.txt');
      expect(visiblePaths).toContain('binary.bin');
      expect(visiblePaths).not.toContain('ignored-secret.txt');
      expect(visiblePaths).not.toContain('generated/drop/ignored.txt');

      const unindexedVisible = manifest.entries.filter((entry) => entry.path === 'unknown.widget' || entry.path === 'docs/.hidden.md');
      expect(unindexedVisible.every((entry) => entry.indexed === false && entry.readable === true)).toBe(true);

      const externalLink = manifest.entries.find((entry) => entry.path === 'external-link.txt');
      expect(externalLink).toMatchObject({
        type: 'symlink',
        readable: false,
        symlinkTargetKind: 'external',
      });
      const internalLink = manifest.entries.find((entry) => entry.path === 'internal-link.md');
      expect(internalLink).toMatchObject({
        type: 'symlink',
        readable: true,
        symlinkTargetKind: 'internal',
      });
      const internalChain = manifest.entries.find((entry) => entry.path === 'internal-chain.md');
      expect(internalChain).toMatchObject({
        type: 'symlink',
        readable: true,
        symlinkTargetKind: 'internal',
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('fixture models path and race cases required by the write/read contract', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'repo-harness-codegraph-race-contract-'));
    const repoRoot = join(tempRoot, 'repo');
    try {
      copyFixture(FIXTURE_ROOT, repoRoot);

      expect(validateRepoRelativePath('../outside.txt')).toBe('INVALID_RELATIVE_PATH');
      expect(validateRepoRelativePath('/tmp/outside.txt')).toBe('INVALID_RELATIVE_PATH');
      expect(validateRepoRelativePath('C:\\Users\\me\\repo')).toBe('INVALID_RELATIVE_PATH');
      expect(validateRepoRelativePath('docs/nested/guide.md')).toBe('ok');

      const target = join(repoRoot, 'src/app.ts');
      const expectedSha = fileSha256(target);
      writeFileSync(target, 'export const fixtureValue = "changed concurrently";\n');
      expect(fileSha256(target)).not.toBe(expectedSha);

      const deleted = join(repoRoot, 'docs/nested/guide.md');
      rmSync(deleted);
      expect(existsSync(deleted)).toBe(false);

      const renameTarget = join(repoRoot, 'generated/keep/renamed.txt');
      const tempWrite = join(repoRoot, 'generated/keep/.renamed.tmp');
      writeFileSync(tempWrite, 'atomic rename candidate\n');
      renameSync(tempWrite, renameTarget);
      expect(readFileSync(renameTarget, 'utf-8')).toBe('atomic rename candidate\n');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('fixture keeps the expected S0 edge cases in version control', () => {
    const required = [
      '.ignore',
      '.env.allowed',
      '.gitignore',
      '.config/settings.json',
      'docs/.hidden.md',
      'docs/nested/guide.md',
      'unknown.widget',
      'gitignored-but-visible.txt',
      'generated/drop/ignored.txt',
      'generated/drop/keep-visible.txt',
    ];

    for (const path of required) {
      expect(existsSync(join(FIXTURE_ROOT, path))).toBe(true);
    }
  });
});
