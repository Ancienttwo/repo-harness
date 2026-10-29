// Doc session reads (issue #1146): the diff a commit (#1023) publishes and
// the loss list a discard (#1023) deletes, each with its digest. One effect
// serves the CLI (`repo-harness operator doc-sessions`) and the HTTP routes;
// the server runs it in the bounded task-read child, so git never blocks the
// serve loop. A read writes nothing: no index refresh, no object, no lock.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import {
  DOC_SESSION_CHANGES_MAX, DOC_SESSION_PATCH_MAX_BYTES, decodeOperatorDocSessionDiff, decodeOperatorDocSessionLoss,
  docSessionDiffDigestInput, docSessionLossDigestInput, isDocSessionChange, isDocSessionLossPath,
  type DocSessionChange, type DocSessionChangeStatus, type DocSessionLossInput, type DocSessionReadFailure, type DocSessionTurn,
  type OperatorDocSessionDiffV1, type OperatorDocSessionLossV1,
} from '../../core/operator/doc-session-changes';
import { isRepositoryRelativePath } from '../../core/operator/doc-session-events';
import { decodeDocSessionRecord, type DocSessionRecordV1 } from '../../core/operator/doc-session-record';
import { isManagedWorktreePath, managedWorktreeRoot } from '../git/managed-worktree';
import { configuredGitBinary, gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { SessionObservationError } from '../sessions/admitted-source';
import { DocSessionEventsError, readDocSessionEvents, sessionDirectory } from './doc-session-events';
import { effectiveFilterCommands, refuseHiddenWorktreeEntries } from './task-diff';

export const OPERATOR_SESSION_DIFF_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/diff$/u;
export const OPERATOR_SESSION_LOSS_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/loss$/u;

const GIT_TIMEOUT_MS = 5_000;
const RECORD_MAX_BYTES = 1024 * 1024;
/** A changed file is read once to hash it; a larger one is refused rather than hashed. */
const FILE_MAX_BYTES = 16 * 1024 * 1024;
const ZERO_OID = /^0+$/u;

export class DocSessionReadError extends Error {
  constructor(readonly code: DocSessionReadFailure) { super(code); }
}
const fail = (code: DocSessionReadFailure): never => { throw new DocSessionReadError(code); };

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
/** `diff_sha256` of an observation; #1023 compares it with `expected_diff_sha256`. */
export const docSessionDiffSha256 = (baseCommit: string, changes: readonly DocSessionChange[]): string => sha256(docSessionDiffDigestInput(baseCommit, changes));
/** `loss_sha256` of an observation; #1023 compares it with `expected_loss_sha256`. */
export const docSessionLossSha256 = (loss: DocSessionLossInput): string => sha256(docSessionLossDigestInput(loss));

type Git = (cwd: string, args: string[], allowNoMatch?: boolean) => string;

export interface DocSessionGitRunner {
  /** UTF-8 stdout; a path that is not UTF-8 is refused. Exit 1 is empty output when `allowNoMatch`. */
  readonly text: Git;
  /** Raw stdout for the listed exit statuses. */
  readonly bytes: (cwd: string, args: string[], statuses?: readonly number[], input?: Buffer) => Buffer;
}

/**
 * Git without repository-selecting variables, optional locks, fsmonitor or a
 * pager, so a read neither moves to another repository nor writes the index.
 */
export function docSessionGitRunner(env: NodeJS.ProcessEnv): DocSessionGitRunner {
  const gitEnv = withoutRepositorySelectingGitEnv({ ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' });
  const bytes: DocSessionGitRunner['bytes'] = (cwd, args, statuses = [0], input) => {
    const result = gitSpawnSync(['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd, env: gitEnv, gitBin: configuredGitBinary(env), timeout: GIT_TIMEOUT_MS, maxBuffer: DOC_SESSION_PATCH_MAX_BYTES,
      stdio: ['pipe', 'pipe', 'pipe'], ...(input === undefined ? {} : { input }),
    });
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS') return fail('too_large');
    if (result.error !== undefined || result.status === null || !statuses.includes(result.status)) return fail('unavailable');
    return result.stdout;
  };
  const text: Git = (cwd, args, allowNoMatch = false) => {
    const out = bytes(cwd, args, allowNoMatch ? [0, 1] : [0]);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(out); } catch { return fail('path_unsupported'); }
  };
  return { text, bytes };
}

export interface ResolvedDocSession {
  readonly record: DocSessionRecordV1;
  /** Absolute; it never leaves the effect. */
  readonly worktree: string;
}

function readAll(fd: number, size: number): Buffer {
  const data = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const read = readSync(fd, data, offset, size - offset, offset);
    if (read === 0) break;
    offset += read;
  }
  return data.subarray(0, offset);
}

function readRecord(path: string): unknown {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? fail('session_not_found') : fail('unavailable'); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > RECORD_MAX_BYTES) return fail('unavailable');
    return JSON.parse(readAll(fd, stat.size).toString('utf8'));
  } catch (error) {
    if (error instanceof DocSessionReadError) throw error;
    return fail('unavailable');
  } finally { closeSync(fd); }
}

/**
 * The session record and its worktree. The worktree must still be the managed
 * linked worktree of the registered repository, on the session branch.
 */
export function resolveDocSession(env: NodeJS.ProcessEnv, sessionId: string, git: Git = docSessionGitRunner(env).text): ResolvedDocSession {
  let directory: string;
  try { directory = sessionDirectory(env, sessionId); }
  catch (error) { return fail(error instanceof DocSessionEventsError && error.code === 'session_not_found' ? 'session_not_found' : 'unavailable'); }
  let record: DocSessionRecordV1;
  try { record = decodeDocSessionRecord(readRecord(join(directory, 'session.json'))); }
  catch (error) { if (error instanceof DocSessionReadError) throw error; return fail('unavailable'); }
  if (record.session_id !== sessionId) return fail('unavailable');
  let repoPath: string, root: string;
  try {
    const repo = readRepoHarnessRegistryStrictSnapshot({ env }).repos.find(entry => entry.id === record.repository_id);
    if (repo === undefined) return fail('worktree_changed');
    repoPath = realpathSync(repo.path);
    root = managedWorktreeRoot(env);
  } catch (error) { if (error instanceof DocSessionReadError) throw error; return fail('unavailable'); }
  if (!isManagedWorktreePath(record.worktree, root, basename(repoPath))) return fail('worktree_changed');
  try {
    const entry = lstatSync(record.worktree);
    if (!entry.isDirectory() || realpathSync(record.worktree) !== record.worktree) return fail('worktree_changed');
  } catch (error) {
    if (error instanceof DocSessionReadError) throw error;
    return fail((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'worktree_missing' : 'unavailable');
  }
  const commonDirectory = (cwd: string) => realpathSync(resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir']).trim()));
  let same: boolean;
  try {
    same = realpathSync(git(record.worktree, ['rev-parse', '--show-toplevel']).trim()) === record.worktree
      && commonDirectory(record.worktree) === commonDirectory(repoPath)
      && git(record.worktree, ['symbolic-ref', '--quiet', 'HEAD'], true).trim() === `refs/heads/${record.branch}`;
  } catch (error) { if (error instanceof DocSessionReadError) throw error; return fail('worktree_changed'); }
  if (!same) return fail('worktree_changed');
  return { record, worktree: record.worktree };
}

const STATUS: Readonly<Record<string, DocSessionChangeStatus>> = { A: 'added', M: 'modified', D: 'deleted', T: 'type_changed' };
const REGULAR = new Set(['100644', '100755']);

/** The file's bytes, read without following a symlink; a directory above it may not leave the worktree. */
function readWorktreeFile(worktree: string, path: string): Buffer {
  const full = join(worktree, path);
  let fd: number;
  try {
    const parent = realpathSync(dirname(full));
    if (parent !== worktree && !parent.startsWith(`${worktree}/`)) return fail('path_unsupported');
    fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error instanceof DocSessionReadError) throw error;
    // ELOOP: the path became a symlink. A path that went away changed during the read.
    return fail((error as NodeJS.ErrnoException).code === 'ELOOP' ? 'path_unsupported' : 'stale');
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return fail('path_unsupported');
    if (stat.size > FILE_MAX_BYTES) return fail('too_large');
    return readAll(fd, stat.size);
  } finally { closeSync(fd); }
}

/** Filter drivers with an effective `clean` or `process` command: git runs them when it reads a path that names them. */
function filterDrivers(runner: DocSessionGitRunner, worktree: string): Set<string> {
  const driver = (key: string) => key.slice('filter.'.length, key.lastIndexOf('.'));
  return new Set([...effectiveFilterCommands(worktree, runner.text)].filter(([, command]) => command !== '').map(([key]) => driver(key)));
}

/**
 * Refuses when a path git reads names a configured filter driver, because the
 * read would run that command in the server. A driver that no read path uses,
 * such as an installed git-lfs, does not refuse. The worktree's own
 * `.gitattributes` counts: the agent can write it.
 */
function refuseUsedFilters(runner: DocSessionGitRunner, worktree: string, paths: readonly string[]): void {
  const drivers = filterDrivers(runner, worktree);
  if (drivers.size === 0 || paths.length === 0) return;
  const output = new TextDecoder().decode(runner.bytes(worktree, ['check-attr', '-z', '--stdin', 'filter'], [0], Buffer.from(`${paths.join('\0')}\0`)));
  const fields = output === '' ? [] : output.slice(0, -1).split('\0');
  if (fields.length !== paths.length * 3) return fail('unavailable');
  for (let index = 2; index < fields.length; index += 3) if (drivers.has(fields[index]!)) fail('filters_unsupported');
}

const pathsFrom = (listed: string): string[] => listed === '' ? [] : listed.slice(0, -1).split('\0');

function worktreeFileMode(worktree: string, path: string): string {
  if (!isRepositoryRelativePath(path)) return fail('path_unsupported');
  try {
    const entry = lstatSync(join(worktree, path));
    if (!entry.isFile()) return fail('path_unsupported');
    return (entry.mode & 0o100) !== 0 ? '100755' : '100644';
  } catch (error) { if (error instanceof DocSessionReadError) throw error; return fail('stale'); }
}

/** Cached diff compares tree and index objects; it does not read working-file content. */
function observeIndexChanges(runner: DocSessionGitRunner, worktree: string, head: string): DocSessionChange[] {
  const tokens = pathsFrom(runner.text(worktree, ['diff', '--cached', '--raw', '-z', '--no-renames', '--no-abbrev', head, '--']));
  if (tokens.length % 2 !== 0) return fail('unavailable');
  const changes: DocSessionChange[] = [];
  for (let offset = 0; offset < tokens.length; offset += 2) {
    const header = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])$/u.exec(tokens[offset]!);
    if (header === null) return fail('unavailable');
    const [, oldMode, newMode, oldOid, newOid, letter] = header;
    if (letter === 'U') return fail('index_unsupported');
    const status = STATUS[letter!];
    if (status === undefined) return fail('unavailable');
    const change: DocSessionChange = {
      path: tokens[offset + 1]!, status, tracked: true,
      old_mode: status === 'added' ? null : oldMode!, old_oid: status === 'added' ? null : oldOid!,
      new_mode: status === 'deleted' ? null : newMode!, new_oid: status === 'deleted' ? null : newOid!,
    };
    if (!isDocSessionChange(change)) return fail('path_unsupported');
    changes.push(change);
  }
  return changes;
}

/** One public row per lost path. Index-only versions remain visible even when the working file matches HEAD. */
function lossFiles(loss: Pick<DocSessionLossInput, 'changes' | 'index'>): DocSessionChange[] {
  const files = new Map<string, DocSessionChange>();
  for (const change of [...loss.changes, ...loss.index]) if (!files.has(change.path)) files.set(change.path, change);
  return [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/**
 * The changes of the worktree against `side` (a commit): tracked paths from
 * `git diff --raw`, untracked ones from `ls-files`. Each present path is a
 * regular file; its id is the blob `git add` would store (`hash-object`
 * without `-w`, so nothing is written). A symlink or a submodule is refused.
 */
export function observeDocSessionChanges(runner: DocSessionGitRunner, worktree: string, side: string): DocSessionChange[] {
  const hashed = (path: string, input: Buffer): string => {
    const oid = new TextDecoder().decode(runner.bytes(worktree, ['hash-object', '--stdin', `--path=${path}`], [0], input)).trim();
    return oid || fail('unavailable');
  };
  // ls-files only enumerates names. Raw diff can run clean/process filters even
  // for a stat-only or racy entry, so admit every candidate before comparing.
  const tracked = pathsFrom(runner.text(worktree, ['ls-files', '--cached', '-z']));
  const others = pathsFrom(runner.text(worktree, ['ls-files', '--others', '--exclude-standard', '-z']));
  refuseUsedFilters(runner, worktree, [...new Set([...tracked, ...others])]);
  const raw = runner.text(worktree, ['diff', '--raw', '-z', '--no-renames', '--no-abbrev', '--ignore-submodules=none', side, '--']);
  const tokens = raw === '' ? [] : raw.slice(0, -1).split('\0');
  if (tokens.length % 2 !== 0) return fail('unavailable');
  // Counted before any file is read, so an oversized worktree costs no hashing.
  if (tokens.length / 2 + others.length > DOC_SESSION_CHANGES_MAX) return fail('too_large');
  const changes: DocSessionChange[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const header = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])$/u.exec(tokens[index]!);
    const path = tokens[index + 1]!;
    if (header === null) return fail('unavailable');
    const [, oldMode, newMode, oldOid, , letter] = header;
    if (letter === 'U') return fail('index_unsupported');
    const status = STATUS[letter!];
    if (status === undefined) return fail('unavailable');
    if (!isRepositoryRelativePath(path)) return fail('path_unsupported');
    const exists = status !== 'deleted';
    if (oldMode === '160000' || (exists && !REGULAR.has(newMode!))) return fail('path_unsupported');
    const change: DocSessionChange = {
      path, status, tracked: true,
      old_mode: status === 'added' ? null : oldMode!, old_oid: status === 'added' || ZERO_OID.test(oldOid!) ? null : oldOid!,
      new_mode: exists ? newMode! : null, new_oid: exists ? hashed(path, readWorktreeFile(worktree, path)) : null,
    };
    // Without an index refresh, git lists a file whose stat changed but whose content did not.
    if (status === 'modified' && change.old_oid === change.new_oid && change.old_mode === change.new_mode) continue;
    changes.push(change);
  }
  for (const path of others) {
    const mode = worktreeFileMode(worktree, path);
    changes.push({ path, status: 'added', tracked: false, old_mode: null, old_oid: null, new_mode: mode, new_oid: hashed(path, readWorktreeFile(worktree, path)) });
  }
  if (!changes.every(isDocSessionChange)) return fail('unavailable');
  return changes.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function turnOf(env: NodeJS.ProcessEnv, sessionId: string): DocSessionTurn {
  try { return readDocSessionEvents(env, sessionId, null).activity; }
  catch (error) { return fail(error instanceof DocSessionEventsError && error.code === 'session_not_found' ? 'session_not_found' : 'unavailable'); }
}

/**
 * Runs `observe` twice around `project`; a difference between the two is a
 * change during the read (409 stale), so the projection matches its digest.
 */
function stable<T>(observe: () => T, key: (value: T) => string, project: (value: T) => void): T {
  const before = observe();
  project(before);
  const after = observe();
  if (key(before) !== key(after)) return fail('stale');
  return before;
}

/** Preserve unexpected exceptions for the CLI exit status; HTTP sanitizes them in the read worker. */
function read<T>(run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof DocSessionReadError) throw error;
    if (error instanceof SessionObservationError) return fail(error.code);
    throw error;
  }
}

/** `GET /api/v1/sessions/{sid}/diff`: the worktree against the session base, with `diff_sha256`. */
export function readDocSessionDiff(env: NodeJS.ProcessEnv, sessionId: string): OperatorDocSessionDiffV1 {
  return read(() => {
    const runner = docSessionGitRunner(env);
    const { record, worktree } = resolveDocSession(env, sessionId, runner.text);
    const base = record.base_commit;
    let patch = '';
    let binary = new Set<string>();
    const observed = stable(() => {
      refuseHiddenWorktreeEntries(worktree, runner.text);
      return { head: runner.text(worktree, ['rev-parse', '--verify', 'HEAD^{commit}']).trim(), changes: observeDocSessionChanges(runner, worktree, base) };
    }, value => `${value.head}\n${docSessionDiffDigestInput(base, value.changes)}`, ({ changes }) => {
      const display = ['--no-ext-diff', '--no-textconv', '--no-color', '--src-prefix=a/', '--dst-prefix=b/'];
      const numstat = runner.text(worktree, ['diff', '--numstat', '-z', '--no-renames', '--ignore-submodules=none', ...display, base, '--']);
      binary = new Set((numstat === '' ? [] : numstat.slice(0, -1).split('\0')).filter(line => line.startsWith('-\t-\t')).map(line => line.slice(4)));
      const parts = [runner.bytes(worktree, ['diff', '--no-renames', '--ignore-submodules=none', '--submodule=short', ...display, base, '--'])];
      for (const change of changes.filter(entry => !entry.tracked)) {
        const part = runner.bytes(worktree, ['diff', '--no-index', ...display, '--', '/dev/null', change.path], [0, 1]);
        if (/^Binary files /mu.test(part.subarray(0, 4096).toString('latin1'))) binary.add(change.path);
        parts.push(part);
      }
      const bytes = Buffer.concat(parts);
      if (bytes.length > DOC_SESSION_PATCH_MAX_BYTES) fail('too_large');
      try { patch = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { fail('encoding_unsupported'); }
    });
    return decodeOperatorDocSessionDiff({
      protocol: 1, kind: 'operator_docs_session_diff', session_id: sessionId, base_commit: base, head_commit: observed.head,
      turn: turnOf(env, sessionId),
      files: observed.changes.map(change => ({ path: change.path, status: change.status, tracked: change.tracked, binary: binary.has(change.path) })),
      patch, diff_sha256: docSessionDiffSha256(base, observed.changes), observed_at: new Date().toISOString(),
    }, { session_id: sessionId });
  });
}

/** Everything a discard deletes: changes against HEAD, ignored entries, commits no remote holds, and whether the branch was pushed. */
export function observeDocSessionLoss(runner: DocSessionGitRunner, record: DocSessionRecordV1, worktree: string): DocSessionLossInput {
  refuseHiddenWorktreeEntries(worktree, runner.text);
  const head = runner.text(worktree, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const changes = observeDocSessionChanges(runner, worktree, head);
  const index = observeIndexChanges(runner, worktree, head);
  const listed = runner.text(worktree, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']);
  const ignored = listed === '' ? [] : listed.slice(0, -1).split('\0');
  if (!ignored.every(isDocSessionLossPath)) return fail('path_unsupported');
  const leaves = pathsFrom(runner.text(worktree, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']));
  const commits = runner.text(worktree, ['rev-list', `${record.base_commit}..${head}`, '--not', '--remotes']).split('\n').filter(Boolean);
  const slug = record.branch.slice('docs/'.length);
  const pushed = runner.text(worktree, ['for-each-ref', '--format=%(refname)', 'refs/remotes/']).split('\n')
    .some(ref => new RegExp(`^refs/remotes/[^/]+/docs/${slug}$`, 'u').test(ref));
  if (lossFiles({ changes, index }).length + leaves.length + commits.length > DOC_SESSION_CHANGES_MAX) return fail('too_large');
  const ignored_leaves = leaves.map(path => ({
    path, mode: worktreeFileMode(worktree, path),
    // Ignored loss binds the bytes removal deletes, without Git conversions.
    oid: new TextDecoder().decode(runner.bytes(worktree, ['hash-object', '--stdin', '--no-filters'], [0], readWorktreeFile(worktree, path))).trim(),
  }));
  return { head_commit: head, changes, index, ignored: ignored.sort(), ignored_leaves, commits, pushed };
}

/** `GET /api/v1/sessions/{sid}/loss`: the discard loss list, with `loss_sha256`. */
export function readDocSessionLoss(env: NodeJS.ProcessEnv, sessionId: string): OperatorDocSessionLossV1 {
  return read(() => {
    const runner = docSessionGitRunner(env);
    const { record, worktree } = resolveDocSession(env, sessionId, runner.text);
    const loss = stable(() => observeDocSessionLoss(runner, record, worktree), docSessionLossDigestInput, () => {});
    return decodeOperatorDocSessionLoss({
      protocol: 1, kind: 'operator_docs_session_loss', session_id: sessionId, head_commit: loss.head_commit, turn: turnOf(env, sessionId),
      files: lossFiles(loss).map(change => ({ path: change.path, status: change.status, tracked: change.tracked })),
      ignored: loss.ignored, commits: loss.commits, pushed: loss.pushed, loss_sha256: docSessionLossSha256(loss), observed_at: new Date().toISOString(),
    }, { session_id: sessionId });
  });
}
