import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, readSync, realpathSync, type Stats } from 'node:fs';
import { resolve } from 'node:path';
import { cleanupContentsDigestInput, type CleanupFileEvidence, type CleanupIndexEntry, type CleanupLossEvidence } from '../../core/operator/worktree-cleanup-observation';
import { isRepositoryRelativePath } from '../../core/operator/doc-session-events';
import { docSessionGitRunner, type DocSessionGitRunner } from './doc-session-changes';
import { worktreeId } from '../git/worktree-record';
import { cleanupDirectoryNames, openCleanupChild, openCleanupDirectory, UnsupportedCleanupPath, CleanupDirectoryTooLarge } from './cleanup-file-access';

export class CleanupObservationError extends Error {
  constructor(readonly code: 'changed' | 'unavailable' | 'unsupported' | 'too_large') { super(`cleanup_observation_${code}`); }
}
function fail(code: CleanupObservationError['code']): never { throw new CleanupObservationError(code); }
/** Server-resolved inventory target, never decoded from a request body. */
export interface CleanupObservationTarget {
  readonly repository: string;
  readonly worktree: string;
  readonly id: string;
  readonly kind: 'registered' | 'orphan';
}
export interface CleanupObservationOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly deadline: number;
  readonly max_entries?: number;
  readonly max_bytes?: number;
  /** Deterministic race fixture seam; no public route accepts this option. */
  readonly after_directory_open?: (relative: string) => void;
}
const sameStat = (a: Stats, b: Stats) =>
  a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const nul = (value: string) => value === '' ? [] : value.endsWith('\0') ? value.slice(0, -1).split('\0') : fail('unavailable');
const canonicalDirectory = (path: string) => {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) fail('unsupported');
  return stat;
};

function repositoryIdentity(target: CleanupObservationTarget, runner: DocSessionGitRunner): string {
  canonicalDirectory(target.repository);
  const common = realpathSync(resolve(target.repository, runner.text(target.repository, ['rev-parse', '--git-common-dir']).trim()));
  if (worktreeId(common, target.worktree) !== target.id) fail('changed');
  const listed = nul(runner.text(target.repository, ['worktree', 'list', '--porcelain', '-z']));
  const registered = listed.filter(field => field.startsWith('worktree ')).map(field => field.slice(9));
  if ((target.kind === 'registered') !== registered.includes(target.worktree)) fail('changed');
  if (target.kind === 'registered') {
    const actual = realpathSync(resolve(target.worktree, runner.text(target.worktree, ['rev-parse', '--git-common-dir']).trim()));
    if (actual !== common || runner.text(target.worktree, ['rev-parse', '--show-toplevel']).trim() !== target.worktree) fail('changed');
  }
  return common;
}

function indexEntries(text: string): CleanupIndexEntry[] {
  return nul(text).map(field => {
    const match = /^(\d{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([0-3])\t([\s\S]+)$/u.exec(field);
    if (!match || !isRepositoryRelativePath(match[4])) return fail('unsupported');
    if (!['100644', '100755', '120000'].includes(match[1]!)) return fail('unsupported');
    return { mode: match[1]!, oid: match[2]!, stage: Number(match[3]), path: match[4]! };
  }).sort((a, b) => a.path.localeCompare(b.path, 'en') || a.stage - b.stage);
}
function headEntries(runner: DocSessionGitRunner, path: string, head: string): Map<string, { mode: string; oid: string }> {
  const result = new Map<string, { mode: string; oid: string }>();
  for (const field of nul(runner.text(path, ['ls-tree', '-r', '-z', '--full-tree', head]))) {
    const match = /^(\d{6}) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(field);
    if (!match || !isRepositoryRelativePath(match[3]) || !['100644', '100755', '120000'].includes(match[1]!)) fail('unsupported');
    result.set(match[3]!, { mode: match[1]!, oid: match[2]! });
  }
  return result;
}

function scanFiles(root: string, format: 'sha1' | 'sha256', options: CleanupObservationOptions): CleanupFileEvidence[] {
  const rootStat = canonicalDirectory(root), files: CleanupFileEvidence[] = [];
  const maxEntries = options.max_entries ?? 20_000, maxBytes = options.max_bytes ?? 512 * 1024 * 1024;
  let bytes = 0;
  const bound = () => { if (Date.now() >= options.deadline) fail('unavailable'); if (files.length >= maxEntries || bytes > maxBytes) fail('too_large'); };
  const visit = (directory: number, prefix: string) => {
    bound();
    const before = fstatSync(directory);
    if (!before.isDirectory() || before.dev !== rootStat.dev) fail('unsupported');
    options.after_directory_open?.(prefix);
    const names = cleanupDirectoryNames(directory, maxEntries);
    for (const name of names) {
      bound();
      const relative = prefix ? `${prefix}/${name}` : name;
      if (!isRepositoryRelativePath(relative)) fail('unsupported');
      const opened = openCleanupChild(directory, name), stat = opened.stat;
      try {
        if (stat.dev !== rootStat.dev) fail('unsupported');
        if (name === '.git' && (prefix !== '' || !stat.isFile())) fail('unsupported');
        if (stat.isDirectory()) {
          files.push({ path: relative, kind: 'directory', mode: stat.mode & 0o7777, size: 0, sha256: null, git_oid: null });
          visit(opened.fd, relative);
        } else if (stat.isSymbolicLink() && opened.link !== null) {
          const link = opened.link; bytes += link.length; bound();
          files.push({ path: relative, kind: 'symlink', mode: stat.mode & 0o7777, size: link.length,
            sha256: createHash('sha256').update(link).digest('hex'), git_oid: createHash(format).update(`blob ${link.length}\0`).update(link).digest('hex') });
        } else if (stat.isFile()) {
          bytes += stat.size; bound();
          const raw = createHash('sha256'), blob = createHash(format).update(`blob ${stat.size}\0`);
          const buffer = Buffer.alloc(64 * 1024); let offset = 0;
          while (offset < stat.size) {
            if (Date.now() >= options.deadline) fail('unavailable');
            const count = readSync(opened.fd, buffer, 0, Math.min(buffer.length, stat.size - offset), offset);
            if (!count) fail('changed');
            raw.update(buffer.subarray(0, count)); blob.update(buffer.subarray(0, count)); offset += count;
          }
          if (!sameStat(stat, fstatSync(opened.fd))) fail('changed');
          files.push({ path: relative, kind: 'file', mode: stat.mode & 0o7777, size: stat.size, sha256: raw.digest('hex'), git_oid: blob.digest('hex') });
        } else fail('unsupported');
        const current = openCleanupChild(directory, name);
        try { if (!sameStat(stat, current.stat)) fail('changed'); } finally { closeSync(current.fd); }
      } finally { closeSync(opened.fd); }
    }
    if (!sameStat(before, fstatSync(directory)) || cleanupDirectoryNames(directory, maxEntries).join('\0') !== names.join('\0')) fail('changed');
  };
  const rootFd = openCleanupDirectory(root);
  try { if (!sameStat(rootStat, fstatSync(rootFd))) fail('changed'); visit(rootFd, ''); }
  finally { closeSync(rootFd); }
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function once(target: CleanupObservationTarget, options: CleanupObservationOptions, runner: DocSessionGitRunner): CleanupLossEvidence {
  const stat = canonicalDirectory(target.worktree);
  repositoryIdentity(target, runner);
  let head: string | null = null, branch: string | null = null, format: 'sha1' | 'sha256' = 'sha1';
  let index: CleanupIndexEntry[] = [], commits: string[] = [], ignored: string[] = [];
  let remoteRefs: { name: string; oid: string }[] = [];
  let headFiles = new Map<string, { mode: string; oid: string }>();
  if (target.kind === 'registered') {
    const git = (args: string[]) => runner.text(target.worktree, args).trimEnd();
    if (git(['rev-parse', '--is-shallow-repository']) !== 'false') fail('unsupported');
    const algorithm = git(['rev-parse', '--show-object-format']);
    if (algorithm !== 'sha1' && algorithm !== 'sha256') fail('unsupported');
    format = algorithm;
    head = git(['rev-parse', '--verify', 'HEAD^{commit}']); if (!oidPattern.test(head)) fail('unavailable');
    branch = runner.text(target.worktree, ['symbolic-ref', '--quiet', 'HEAD'], true).trim() || null;
    if (branch !== null && !branch.startsWith('refs/heads/')) fail('unsupported');
    index = indexEntries(runner.text(target.worktree, ['ls-files', '--stage', '-z']));
    headFiles = headEntries(runner, target.worktree, head);
    // No session base: every unpublished ancestor can be lost with this branch.
    commits = git(['rev-list', '--topo-order', '--reverse', head, '--not', '--remotes']).split('\n').filter(Boolean);
    if (!commits.every(oid => oidPattern.test(oid))) fail('unavailable');
    remoteRefs = git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/remotes/']).split('\n').filter(Boolean).map(line => {
      const space = line.indexOf(' '), oid = line.slice(0, space), name = line.slice(space + 1);
      if (!oidPattern.test(oid) || !name.startsWith('refs/remotes/')) return fail('unavailable');
      return { name, oid };
    });
    ignored = nul(runner.text(target.worktree, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).sort();
    if (!ignored.every(isRepositoryRelativePath)) fail('unsupported');
  }
  const files = scanFiles(target.worktree, format, options);
  const changed = new Set<string>();
  for (const file of files) {
    if (file.path === '.git' || file.kind === 'directory' || ignored.includes(file.path)) continue;
    const tracked = headFiles.get(file.path);
    const mode = file.kind === 'symlink' ? '120000' : (file.mode & 0o100) ? '100755' : '100644';
    if (!tracked || tracked.oid !== file.git_oid || tracked.mode !== mode) changed.add(file.path);
  }
  for (const file of files) if (file.kind === 'directory' && !files.some(other => other.path.startsWith(file.path + '/'))) changed.add(file.path);
  const present = new Set(files.map(file => file.path));
  for (const path of headFiles.keys()) if (!present.has(path)) changed.add(path);
  const staged = new Map(index.map(entry => [entry.path, entry]));
  for (const [path, original] of headFiles) {
    const entry = staged.get(path);
    if (!entry || entry.stage !== 0 || entry.oid !== original.oid || entry.mode !== original.mode) changed.add(path);
  }
  for (const entry of index) if (!headFiles.has(entry.path) || entry.stage !== 0) changed.add(entry.path);
  if (commits.length + files.length + index.length > (options.max_entries ?? 20_000)) fail('too_large');
  if (!sameStat(stat, lstatSync(target.worktree))) fail('changed');
  return { kind: target.kind, identity: { dev: stat.dev, ino: stat.ino, birthtime_ms: stat.birthtimeMs }, branch, head_commit: head,
    files, index, changed_paths: [...changed].sort(), ignored, commits, remote_refs: remoteRefs };
}

/** No writes, filters, status refresh or Git invocation inside an orphan directory. Two complete reads must agree. */
export function observeCleanupLoss(target: CleanupObservationTarget, options: CleanupObservationOptions): CleanupLossEvidence {
  try {
    if (!Number.isFinite(options.deadline) || options.deadline <= Date.now()) fail('unavailable');
    const base = docSessionGitRunner({ ...options.env, GIT_NO_REPLACE_OBJECTS: '1' });
    const runner: DocSessionGitRunner = {
      text: (...args) => { if (Date.now() >= options.deadline) fail('unavailable'); return base.text(...args); },
      bytes: (...args) => { if (Date.now() >= options.deadline) fail('unavailable'); return base.bytes(...args); },
    };
    const first = once(target, options, runner), second = once(target, options, runner);
    if (cleanupContentsDigestInput(first) !== cleanupContentsDigestInput(second)) fail('changed');
    return second;
  } catch (error) {
    if (error instanceof CleanupObservationError) throw error;
    if (error instanceof UnsupportedCleanupPath) fail('unsupported');
    if (error instanceof CleanupDirectoryTooLarge) fail('too_large');
    throw new CleanupObservationError('unavailable');
  }
}
