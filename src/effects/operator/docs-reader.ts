import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { REPOSITORY_SELECTING_GIT_ENV, spawnGit } from '../git/runner';

/**
 * Read-only `docs/**` reader for the operator console (PRD G7).
 * Content comes from the default branch tip through one long-lived
 * `git cat-file --batch-command` process per repository. A read spawns no
 * other process. The worktree is used only to check the physical path and to
 * tell if the worktree copy differs from the served blob; its bytes are never
 * returned. Errors carry only repo-relative paths.
 */
export const DOCS_ROOT = 'docs';
export const DOCS_FILE_MAX_BYTES = 512 * 1024;
export const DOCS_TREE_MAX_FILES = 5_000;
export const DOCS_GIT_TIMEOUT_MS = 5_000;

export type DocsReadErrorCode =
  | 'path_invalid'
  | 'path_denied'
  | 'path_escape'
  | 'not_found'
  | 'not_a_file'
  | 'too_large'
  | 'not_text'
  | 'branch_invalid'
  | 'repo_unavailable'
  | 'branch_missing'
  | 'timeout'
  | 'git_read_failed'
  | 'closed';

export class DocsReadError extends Error {
  constructor(readonly code: DocsReadErrorCode, readonly path?: string) {
    super(path ? `${code}: ${path}` : code);
    this.name = 'DocsReadError';
  }
}

export interface DocsTreeFile { path: string; size: number; sha256: string }
export interface DocsTree { commit: string; files: DocsTreeFile[] }
export interface DocsFile {
  path: string;
  commit: string;
  size: number;
  sha256: string;
  text: string;
  /** The worktree copy is missing, is not the same regular file, or has other bytes. */
  worktree_differs: boolean;
}

export interface DocsReaderOptions {
  /** Repository root of a registered primary checkout. */
  root: string;
  /** Default branch name, for example `main`. The caller owns how it is found. */
  defaultBranch: string;
  timeoutMs?: number;
  gitBin?: string;
  env?: NodeJS.ProcessEnv;
}

type GitObject = { oid: string; type: string; size: number; bytes: Buffer | null };
type TreeEntry = { mode: string; name: string; oid: string };
type BlobFacts = { size: number; sha256: string; text: boolean };
type Pending = { resolve: (value: GitObject | null) => void; reject: (error: DocsReadError) => void; contents: boolean; timer: ReturnType<typeof setTimeout> };

const REGULAR_FILE = new Set(['100644', '100755']);
const TREE_MODE = '40000';
const HEX_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SAFE_NAME = /^[^\x00-\x1f\x7f\\]+$/;

/** Secret-bearing names. Every segment of the logical and the physical path is checked. */
// Case-insensitive: macOS and Windows file systems fold case, so `.ENV` opens `.env`.
const DENIED_SEGMENTS: readonly RegExp[] = [
  /^\.git$/i,
  /^\.env/i,
  /^\.(?:ssh|aws|gnupg|docker|kube)$/i,
  /^\.(?:npmrc|yarnrc|yarnrc\.yml|pypirc|netrc|pgpass|git-credentials)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /^(?:credentials|secrets)(?:\.(?:json|ya?ml|toml|ini))?$/i,
];

export function docsPathDenied(path: string): boolean {
  return path.split('/').some(segment => DENIED_SEGMENTS.some(pattern => pattern.test(segment)));
}

function inDocs(path: string): boolean {
  return path.startsWith(`${DOCS_ROOT}/`);
}

/** A repo-relative POSIX path with no empty, `.` or `..` segment. */
export function normalizeDocsPath(input: unknown): string {
  if (typeof input !== 'string' || !input || input.length > 4096 || isAbsolute(input) || !SAFE_NAME.test(input)) {
    throw new DocsReadError('path_invalid');
  }
  if (input.split('/').some(part => !part || part === '.' || part === '..')) throw new DocsReadError('path_invalid');
  if (!inDocs(input)) throw new DocsReadError('path_denied', input);
  if (docsPathDenied(input)) throw new DocsReadError('path_denied', input);
  return input;
}

function validBranch(name: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.startsWith('-') && !name.startsWith('/') && !name.endsWith('/')
    && !name.includes('..') && !name.includes('//') && !name.endsWith('.lock');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function utf8(bytes: Buffer): string | null {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}

/**
 * One `git cat-file --batch-command` process. Requests are answered in order.
 * A timeout or an unexpected exit fails every pending request and ends the
 * process; the next request starts a new one.
 */
class CatFileWorker {
  private child: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private readonly pending: Pending[] = [];
  private closed = false;

  constructor(private readonly root: string, private readonly timeoutMs: number, private readonly gitBin: string | undefined, private readonly env: NodeJS.ProcessEnv) {}

  info(name: string): Promise<GitObject | null> { return this.request(name, false); }
  contents(name: string): Promise<GitObject | null> { return this.request(name, true); }

  close(): void {
    this.closed = true;
    this.fail(new DocsReadError('closed'));
  }

  private request(name: string, contents: boolean): Promise<GitObject | null> {
    if (this.closed) return Promise.reject(new DocsReadError('closed'));
    const child = this.child ?? this.start();
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => this.fail(new DocsReadError('timeout')), this.timeoutMs);
      this.pending.push({ resolve: resolvePromise, reject: rejectPromise, contents, timer });
      child.stdin!.write(`${contents ? 'contents' : 'info'} ${name}\n`);
    });
  }

  private start(): ChildProcess {
    const env: NodeJS.ProcessEnv = { ...this.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
    for (const key of REPOSITORY_SELECTING_GIT_ENV) delete env[key];
    // stderr is discarded: it can hold absolute paths (PRD N4).
    const child = spawnGit(['--no-optional-locks', 'cat-file', '--batch-command'], {
      cwd: this.root, env, gitBin: this.gitBin, stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.child = child;
    this.buffer = Buffer.alloc(0);
    child.stdout!.on('data', (chunk: Buffer) => {
      if (this.child !== child) return;
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    child.stdin!.on('error', () => { if (this.child === child) this.fail(new DocsReadError('git_read_failed')); });
    child.on('error', () => { if (this.child === child) this.fail(new DocsReadError('git_read_failed')); });
    child.on('exit', () => { if (this.child === child) this.fail(new DocsReadError('git_read_failed')); });
    return child;
  }

  private drain(): void {
    while (this.pending.length > 0) {
      const newline = this.buffer.indexOf(10);
      if (newline < 0) return;
      const header = this.buffer.subarray(0, newline).toString('latin1');
      const head = this.pending[0];
      if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
        this.buffer = this.buffer.subarray(newline + 1);
        this.settle(null);
        continue;
      }
      const match = /^([0-9a-f]{40}|[0-9a-f]{64}) (blob|tree|commit|tag) (\d+)$/.exec(header);
      if (!match) return this.fail(new DocsReadError('git_read_failed'));
      const size = Number(match[3]);
      if (!head.contents) {
        this.buffer = this.buffer.subarray(newline + 1);
        this.settle({ oid: match[1], type: match[2], size, bytes: null });
        continue;
      }
      const begin = newline + 1;
      if (this.buffer.length < begin + size + 1) return;
      if (this.buffer[begin + size] !== 10) return this.fail(new DocsReadError('git_read_failed'));
      const bytes = Buffer.from(this.buffer.subarray(begin, begin + size));
      this.buffer = this.buffer.subarray(begin + size + 1);
      this.settle({ oid: match[1], type: match[2], size, bytes });
    }
  }

  private settle(value: GitObject | null): void {
    const head = this.pending.shift()!;
    clearTimeout(head.timer);
    head.resolve(value);
  }

  private fail(error: DocsReadError): void {
    const child = this.child;
    this.child = null;
    this.buffer = Buffer.alloc(0);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    for (const entry of this.pending.splice(0)) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
  }
}

function parseTree(bytes: Buffer, oidBytes: number): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    const nul = space < 0 ? -1 : bytes.indexOf(0, space);
    if (space < 0 || nul < 0 || bytes.length < nul + 1 + oidBytes) throw new DocsReadError('git_read_failed');
    const mode = bytes.subarray(offset, space).toString('latin1');
    const raw = bytes.subarray(space + 1, nul);
    const oid = bytes.subarray(nul + 1, nul + 1 + oidBytes).toString('hex');
    offset = nul + 1 + oidBytes;
    // A name that is not UTF-8 or holds control bytes cannot be requested; skip it.
    const name = utf8(raw);
    if (name === null || !SAFE_NAME.test(name)) continue;
    entries.push({ mode, name, oid });
  }
  return entries;
}

export class DocsReader {
  readonly root: string;
  private readonly ref: string;
  private readonly worker: CatFileWorker;
  private readonly facts = new Map<string, BlobFacts>();
  private listing: { commit: string; files: { path: string; oid: string; facts: BlobFacts }[] } | null = null;

  constructor(options: DocsReaderOptions) {
    if (!validBranch(options.defaultBranch)) throw new DocsReadError('branch_invalid');
    // The native error names the absolute root; only the code may leave this module.
    try { this.root = realpathSync(options.root); } catch { throw new DocsReadError('repo_unavailable'); }
    this.ref = `refs/heads/${options.defaultBranch}^{commit}`;
    this.worker = new CatFileWorker(this.root, options.timeoutMs ?? DOCS_GIT_TIMEOUT_MS, options.gitBin, options.env ?? process.env);
  }

  close(): void { this.worker.close(); }

  /** Readable files under `docs/` at the default branch tip. */
  async tree(): Promise<DocsTree> {
    const { commit, tree } = await this.tip();
    let listing = this.listing;
    if (listing?.commit !== commit) {
      const files: { path: string; oid: string; facts: BlobFacts }[] = [];
      const docs = (await this.treeEntries(tree, commit.length)).find(entry => entry.name === DOCS_ROOT);
      if (docs?.mode === TREE_MODE) await this.walk(docs.oid, DOCS_ROOT, commit.length, files);
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      // Facts of blobs that left the tree are dropped, so the cache follows one commit.
      const keep = new Set(files.map(file => file.oid));
      for (const oid of this.facts.keys()) if (!keep.has(oid)) this.facts.delete(oid);
      listing = this.listing = { commit, files };
    }
    const files: DocsTreeFile[] = [];
    for (const file of listing.files) {
      if (!file.facts.text || file.facts.size > DOCS_FILE_MAX_BYTES) continue;
      try { this.physical(file.path); } catch (error) { if (error instanceof DocsReadError) continue; throw error; }
      files.push({ path: file.path, size: file.facts.size, sha256: file.facts.sha256 });
    }
    return { commit, files };
  }

  /** One file's committed text, commit and digest, and whether the worktree copy differs. */
  async file(input: unknown): Promise<DocsFile> {
    const path = normalizeDocsPath(input);
    const worktree = this.physical(path);
    const { commit, tree } = await this.tip();
    const parts = path.split('/');
    let current = tree;
    for (let index = 0; index < parts.length; index++) {
      const entry = (await this.treeEntries(current, commit.length)).find(item => item.name === parts[index]);
      if (!entry) throw new DocsReadError('not_found', path);
      // A committed symlink or submodule on the path can point anywhere.
      if (entry.mode === '120000' || entry.mode === '160000') throw new DocsReadError('path_escape', path);
      const last = index === parts.length - 1;
      if (!last) {
        if (entry.mode !== TREE_MODE) throw new DocsReadError('not_found', path);
        current = entry.oid;
        continue;
      }
      if (!REGULAR_FILE.has(entry.mode)) throw new DocsReadError('not_a_file', path);
      const info = await this.worker.info(entry.oid);
      if (!info || info.type !== 'blob') throw new DocsReadError('git_read_failed', path);
      if (info.size > DOCS_FILE_MAX_BYTES) throw new DocsReadError('too_large', path);
      const blob = await this.worker.contents(entry.oid);
      if (!blob?.bytes || blob.type !== 'blob') throw new DocsReadError('git_read_failed', path);
      const text = utf8(blob.bytes);
      if (text === null) throw new DocsReadError('not_text', path);
      return {
        path, commit, size: blob.size, sha256: sha256(blob.bytes), text,
        worktree_differs: worktree === null || worktree.path !== path || !this.sameBytes(worktree.absolute, blob.bytes),
      };
    }
    throw new DocsReadError('not_found', path);
  }

  private async tip(): Promise<{ commit: string; tree: string }> {
    const object = await this.worker.contents(this.ref);
    if (!object) throw new DocsReadError('branch_missing');
    if (object.type !== 'commit' || !object.bytes) throw new DocsReadError('git_read_failed');
    const tree = /^tree ([0-9a-f]{40}|[0-9a-f]{64})\n/.exec(object.bytes.toString('latin1'))?.[1];
    if (!tree || tree.length !== object.oid.length) throw new DocsReadError('git_read_failed');
    return { commit: object.oid, tree };
  }

  private async treeEntries(oid: string, hexLength: number): Promise<TreeEntry[]> {
    if (!HEX_OID.test(oid)) throw new DocsReadError('git_read_failed');
    const object = await this.worker.contents(oid);
    if (!object?.bytes || object.type !== 'tree') throw new DocsReadError('git_read_failed');
    return parseTree(object.bytes, hexLength / 2);
  }

  private async walk(oid: string, prefix: string, hexLength: number, files: { path: string; oid: string; facts: BlobFacts }[]): Promise<void> {
    for (const entry of await this.treeEntries(oid, hexLength)) {
      const path = `${prefix}/${entry.name}`;
      if (entry.mode === TREE_MODE) {
        if (!docsPathDenied(path)) await this.walk(entry.oid, path, hexLength, files);
        continue;
      }
      if (!REGULAR_FILE.has(entry.mode) || docsPathDenied(path)) continue;
      if (files.length >= DOCS_TREE_MAX_FILES) throw new DocsReadError('too_large', DOCS_ROOT);
      files.push({ path, oid: entry.oid, facts: await this.blobFacts(entry.oid) });
    }
  }

  private async blobFacts(oid: string): Promise<BlobFacts> {
    const cached = this.facts.get(oid);
    if (cached) return cached;
    const info = await this.worker.info(oid);
    if (!info || info.type !== 'blob') throw new DocsReadError('git_read_failed');
    let facts: BlobFacts = { size: info.size, sha256: '', text: false };
    if (info.size <= DOCS_FILE_MAX_BYTES) {
      const blob = await this.worker.contents(oid);
      if (!blob?.bytes) throw new DocsReadError('git_read_failed');
      facts = { size: blob.size, sha256: sha256(blob.bytes), text: utf8(blob.bytes) !== null };
    }
    this.facts.set(oid, facts);
    return facts;
  }

  /**
   * Resolves the worktree path with realpath and checks the physical path
   * against the allow and deny lists. Returns null when the worktree has no
   * entry at the path. A dangling or looping symlink is an escape.
   */
  private physical(path: string): { path: string; absolute: string } | null {
    const parts = path.split('/');
    for (let count = parts.length; count >= 1; count--) {
      const logical = resolve(this.root, ...parts.slice(0, count));
      let real: string;
      try { real = realpathSync(logical); } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ELOOP') throw new DocsReadError('path_escape', path);
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw new DocsReadError('git_read_failed', path);
        let present = false;
        try { lstatSync(logical); present = true; } catch { /* absent */ }
        if (present) throw new DocsReadError('path_escape', path);
        continue;
      }
      const scoped = relative(this.root, real);
      if (scoped === '' || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) throw new DocsReadError('path_escape', path);
      const physical = [...scoped.split(sep), ...parts.slice(count)].join('/');
      if (!inDocs(physical) || docsPathDenied(physical)) throw new DocsReadError('path_escape', path);
      return count === parts.length ? { path: physical, absolute: real } : null;
    }
    return null;
  }

  private sameBytes(absolute: string, expected: Buffer): boolean {
    let fd: number;
    // O_NONBLOCK: opening a FIFO or device would otherwise block the event loop before fstat can reject it.
    try { fd = openSync(absolute, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)); } catch { return false; }
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size !== expected.length) return false;
      const actual = Buffer.alloc(expected.length + 1);
      let read = 0;
      while (read < actual.length) {
        const count = readSync(fd, actual, read, actual.length - read, read);
        if (count === 0) break;
        read += count;
      }
      return read === expected.length && actual.subarray(0, read).equals(expected);
    } finally {
      closeSync(fd);
    }
  }
}
