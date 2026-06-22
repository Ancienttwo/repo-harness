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
  test('versioned schema freezes the Sprint 0 reader tool surface', () => {
    const schema = readJson(SCHEMA_PATH);
    expect(schema.properties.version.const).toBe('1');
    expect(schema.properties.policy.properties.content_exclusion.const).toBe('.ignore');
    expect(schema.properties.policy.properties.implicit_redaction.const).toBe(false);
    expect(schema['x-repo-harness-tools'].map((tool: { name: string }) => tool.name)).toEqual(TOOL_NAMES);
    expect(schema.properties.common_response_fields.items.enum).toEqual(COMMON_RESPONSE_FIELDS);

    for (const tool of schema['x-repo-harness-tools']) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect(tool.output_schema.additionalProperties).toBe(false);
      expect(tool.input_schema.properties.repo_id).toEqual({ type: 'string' });
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
