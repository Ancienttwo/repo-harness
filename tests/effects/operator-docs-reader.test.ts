import { afterEach, beforeEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOCS_FILE_MAX_BYTES, DocsReadError, DocsReader } from '../../src/effects/operator/docs-reader';

const cleanup: string[] = [];
const readers: DocsReader[] = [];
let originalGitGlobal: string | undefined;
let originalGitSystem: string | undefined;
beforeEach(() => {
  originalGitGlobal = process.env.GIT_CONFIG_GLOBAL;
  originalGitSystem = process.env.GIT_CONFIG_NOSYSTEM;
  const configHome = mkdtempSync(join(tmpdir(), 'docs-reader-config-')); cleanup.push(configHome);
  const config = join(configHome, 'gitconfig'); writeFileSync(config, '');
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});
afterEach(() => {
  for (const reader of readers.splice(0)) reader.close();
  if (originalGitGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = originalGitGlobal;
  if (originalGitSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
  else process.env.GIT_CONFIG_NOSYSTEM = originalGitSystem;
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

function write(root: string, path: string, content: string | Buffer): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** A repository whose `main` holds the given files; `outside` is a sibling directory. */
function fixture(files: Record<string, string | Buffer>, links: Record<string, string> = {}) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'docs-reader-'))); cleanup.push(parent);
  const root = join(parent, 'repo'), outside = join(parent, 'outside');
  mkdirSync(root); mkdirSync(outside);
  writeFileSync(join(outside, 'secret.md'), 'outside secret\n');
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid');
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  for (const [path, target] of Object.entries(links)) { mkdirSync(join(root, path, '..'), { recursive: true }); symlinkSync(target, join(root, path)); }
  git(root, 'add', '-A', '-f'); git(root, 'commit', '-q', '-m', 'seed');
  return { root, outside, commit: git(root, 'rev-parse', 'HEAD') };
}

function reader(root: string, options: Partial<ConstructorParameters<typeof DocsReader>[0]> = {}): DocsReader {
  const value = new DocsReader({ root, defaultBranch: 'main', ...options });
  readers.push(value);
  return value;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(DocsReadError);
    return (error as DocsReadError).code;
  }
  throw new Error('read was not refused');
}

test('file returns the default branch blob with commit, digest and a clean worktree', async () => {
  const { root, commit } = fixture({ 'docs/guide.md': '# Guide\n', 'README.md': 'root\n' });
  const result = await reader(root).file('docs/guide.md');
  expect(result).toEqual({ path: 'docs/guide.md', commit, size: 8, sha256: hash('# Guide\n'), text: '# Guide\n', worktree_differs: false });
});

test('file serves the commit while it marks an edited or deleted worktree copy', async () => {
  const { root } = fixture({ 'docs/a.md': 'committed\n', 'docs/b.md': 'b\n' });
  writeFileSync(join(root, 'docs/a.md'), 'edited\n');
  unlinkSync(join(root, 'docs/b.md'));
  const docs = reader(root);
  const a = await docs.file('docs/a.md');
  expect(a.text).toBe('committed\n');
  expect(a.worktree_differs).toBe(true);
  expect((await docs.file('docs/b.md')).worktree_differs).toBe(true);
});

test('file follows the branch tip, not the checked-out HEAD', async () => {
  const { root } = fixture({ 'docs/a.md': 'v1\n' });
  const docs = reader(root);
  git(root, 'checkout', '-q', '-b', 'feature');
  write(root, 'docs/a.md', 'feature\n'); git(root, 'commit', '-q', '-am', 'feature');
  expect((await docs.file('docs/a.md')).text).toBe('v1\n');
  git(root, 'checkout', '-q', 'main');
  write(root, 'docs/a.md', 'v2\n'); git(root, 'commit', '-q', '-am', 'v2');
  const next = await docs.file('docs/a.md');
  expect(next.text).toBe('v2\n');
  expect(next.commit).toBe(git(root, 'rev-parse', 'main'));
});

test('tree lists readable docs files with size and sha256 only', async () => {
  const { root, commit } = fixture({
    'docs/a.md': 'a\n',
    'docs/nested/b.md': 'bb\n',
    'docs/.env': 'TOKEN=x\n',
    'docs/keys/server.pem': 'pem\n',
    'docs/big.md': 'x'.repeat(DOCS_FILE_MAX_BYTES + 1),
    'docs/image.bin': Buffer.from([0xff, 0xfe, 0x00]),
    'src/code.ts': 'export {};\n',
  }, { 'docs/link.md': '../src/code.ts', 'docs/out.md': '../../outside/secret.md' });
  const result = await reader(root).tree();
  expect(result).toEqual({ commit, files: [
    { path: 'docs/a.md', size: 2, sha256: hash('a\n') },
    { path: 'docs/nested/b.md', size: 3, sha256: hash('bb\n') },
  ] });
});

test('tree drops a file whose worktree path escapes through a symlink', async () => {
  const { root, outside } = fixture({ 'docs/a.md': 'a\n', 'docs/b.md': 'b\n' });
  unlinkSync(join(root, 'docs/b.md'));
  symlinkSync(join(outside, 'secret.md'), join(root, 'docs/b.md'));
  expect((await reader(root).tree()).files.map(file => file.path)).toEqual(['docs/a.md']);
});

test('reads outside docs, of .env and of .git are refused', async () => {
  const { root } = fixture({ 'docs/a.md': 'a\n', 'docs/.env': 'TOKEN=x\n', 'docs/.env.local': 'TOKEN=y\n', '.env': 'TOKEN=z\n', 'src/code.ts': 'x\n' });
  const docs = reader(root);
  expect(await refusal(docs.file('.env'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.env'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.env.local'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.ENV'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.Env.local'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.GIT/config'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.SSH/ID_RSA'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.NPMRC'))).toBe('path_denied');
  expect(await refusal(docs.file('.git/config'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/.git/config'))).toBe('path_denied');
  expect(await refusal(docs.file('src/code.ts'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/../.git/config'))).toBe('path_invalid');
  expect(await refusal(docs.file('/etc/passwd'))).toBe('path_invalid');
  expect(await refusal(docs.file('docs/a.md\n'))).toBe('path_invalid');
});

test('a committed symlink is refused whether it points inside or outside the repository', async () => {
  const { root } = fixture({ 'src/code.ts': 'x\n', 'docs/a.md': 'a\n' }, {
    'docs/out.md': '../../outside/secret.md',
    'docs/code.md': '../src/code.ts',
    'docs/git.md': '../.git/config',
  });
  const docs = reader(root);
  expect(await refusal(docs.file('docs/out.md'))).toBe('path_escape');
  expect(await refusal(docs.file('docs/code.md'))).toBe('path_escape');
  expect(await refusal(docs.file('docs/git.md'))).toBe('path_escape');
});

test('a worktree symlink that escapes docs is refused on the physical path', async () => {
  const { root, outside } = fixture({ 'docs/a.md': 'a\n', 'docs/b.md': 'b\n', 'docs/c.md': 'c\n', 'docs/d.md': 'd\n' });
  const swap = (path: string, target: string) => { unlinkSync(join(root, path)); symlinkSync(target, join(root, path)); };
  swap('docs/a.md', join(outside, 'secret.md'));
  swap('docs/b.md', '../.git/config');
  swap('docs/c.md', join(outside, 'missing.md'));
  swap('docs/d.md', 'd.md');
  const docs = reader(root);
  expect(await refusal(docs.file('docs/a.md'))).toBe('path_escape');
  expect(await refusal(docs.file('docs/b.md'))).toBe('path_escape');
  expect(await refusal(docs.file('docs/c.md'))).toBe('path_escape');
  expect(await refusal(docs.file('docs/d.md'))).toBe('path_escape');
});

test('a docs directory symlinked out of the repository is refused', async () => {
  const { root, outside } = fixture({ 'docs/secret.md': 'committed\n', 'docs/credentials.json': '{}\n', 'docs/secrets/a.md': 'a\n' });
  rmSync(join(root, 'docs'), { recursive: true });
  symlinkSync(outside, join(root, 'docs'));
  const docs = reader(root);
  expect(await refusal(docs.file('docs/secret.md'))).toBe('path_escape');
  expect(await refusal(docs.file('docs/credentials.json'))).toBe('path_denied');
  expect(await refusal(docs.file('docs/secrets/a.md'))).toBe('path_denied');
  expect((await docs.tree()).files).toEqual([]);
});

test('an internal worktree symlink inside docs is readable and marked as differing', async () => {
  const { root } = fixture({ 'docs/a.md': 'a\n', 'docs/b.md': 'a\n' });
  unlinkSync(join(root, 'docs/b.md'));
  symlinkSync('a.md', join(root, 'docs/b.md'));
  const result = await reader(root).file('docs/b.md');
  expect(result.text).toBe('a\n');
  expect(result.worktree_differs).toBe(true);
});

test('a worktree FIFO in place of a committed file is marked as differing without blocking', async () => {
  const { root } = fixture({ 'docs/a.md': 'a\n' });
  unlinkSync(join(root, 'docs/a.md'));
  execFileSync('mkfifo', [join(root, 'docs/a.md')]);
  const result = await reader(root).file('docs/a.md');
  expect(result.text).toBe('a\n');
  expect(result.worktree_differs).toBe(true);
});

test('size, encoding and missing paths have their own refusals', async () => {
  const { root } = fixture({ 'docs/big.md': 'x'.repeat(DOCS_FILE_MAX_BYTES + 1), 'docs/image.bin': Buffer.from([0xff, 0xfe]), 'docs/dir/a.md': 'a\n' });
  const docs = reader(root);
  expect(await refusal(docs.file('docs/big.md'))).toBe('too_large');
  expect(await refusal(docs.file('docs/image.bin'))).toBe('not_text');
  expect(await refusal(docs.file('docs/none.md'))).toBe('not_found');
  expect(await refusal(docs.file('docs/dir'))).toBe('not_a_file');
});

test('a removed repository root is refused without an absolute path', () => {
  const { root } = fixture({ 'docs/a.md': 'a\n' });
  rmSync(root, { recursive: true, force: true });
  let error: unknown;
  try { new DocsReader({ root, defaultBranch: 'main' }); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(DocsReadError);
  expect((error as DocsReadError).code).toBe('repo_unavailable');
  expect((error as DocsReadError).message).not.toContain(root);
});

test('a missing default branch and an unsafe branch name are refused', async () => {
  const { root } = fixture({ 'docs/a.md': 'a\n' });
  expect(await refusal(reader(root, { defaultBranch: 'trunk' }).file('docs/a.md'))).toBe('branch_missing');
  expect(() => new DocsReader({ root, defaultBranch: '--output=x' })).toThrow(DocsReadError);
});

test('one cat-file worker serves every read, and a hung worker times out and is replaced', async () => {
  const { root } = fixture({ 'docs/a.md': 'a\n' });
  const bin = join(root, '..', 'bin'); mkdirSync(bin);
  const log = join(bin, 'spawns.log');
  const shim = join(bin, 'git');
  // The shim hangs on its first start, then runs the real git.
  writeFileSync(shim, `#!/bin/sh\necho start >> '${log}'\nif [ "$(wc -l < '${log}')" -eq 1 ]; then exec sleep 30; fi\nexec '${execFileSync('which', ['git'], { encoding: 'utf8' }).trim()}' "$@"\n`);
  chmodSync(shim, 0o755);
  const docs = reader(root, { gitBin: shim, timeoutMs: 3_000 });
  expect(await refusal(docs.file('docs/a.md'))).toBe('timeout');
  expect((await docs.file('docs/a.md')).text).toBe('a\n');
  await docs.tree();
  await docs.file('docs/a.md');
  expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(2);
});

test('close ends the worker and refuses later reads', async () => {
  const { root } = fixture({ 'docs/a.md': 'a\n' });
  const docs = reader(root);
  await docs.file('docs/a.md');
  docs.close();
  expect(await refusal(docs.file('docs/a.md'))).toBe('closed');
});
