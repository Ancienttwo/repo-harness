import { createHash } from 'crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, statSync } from 'fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path';
import {
  readRegisteredRepoHarnessRepos,
  repoHarnessRepoIdFor,
  type RepoHarnessAccessMode,
} from '../../../effects/repo-registry';
import { globMatches, isPathInside } from '../paths';
import type { McpPolicy } from '../types';

export interface RepoRecord {
  repoId: string;
  canonicalRoot: string;
  rootIdentity: string;
  displayName: string;
  accessMode: RepoHarnessAccessMode;
  registryRevision: string;
  source: 'current' | 'policy' | 'registered';
}

export interface IgnoreRule {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  anchored: boolean;
}

export interface IgnorePolicy {
  digest: string;
  fileIdentity: string | null;
  rules: IgnoreRule[];
}

export type RepoEntryType = 'file' | 'directory' | 'symlink' | 'other';
export type SymlinkTargetKind = 'internal' | 'external' | 'none';

export interface ResolvedRepoPath {
  repo: RepoRecord;
  relativePath: string;
  absolutePath: string;
  canonicalPath: string;
  type: RepoEntryType;
  size?: number;
  modifiedAt?: string;
  metadataSignature: string;
  contentFile: boolean;
  symlinkTargetKind: SymlinkTargetKind;
  readable: boolean;
  identity?: string;
  parentIdentity?: string;
}

export interface ResolvedRepoWritePath {
  repo: RepoRecord;
  relativePath: string;
  absolutePath: string;
  canonicalPath: string;
  parentRelativePath: string;
  parentCanonicalPath: string;
  existing?: ResolvedRepoPath;
}

export interface RepoAuthorityContext {
  repoRoot: string;
  policy: Pick<McpPolicy, 'allowedRoots'>;
}

export class GeneralRepoAccessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'GeneralRepoAccessError';
  }
}

const REPO_ROOT_IDENTITIES = new Map<string, string>();

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function statIdentity(stat: { dev: number | bigint; ino: number | bigint }): string {
  return `${stat.dev}:${stat.ino}`;
}

export function openNoFollow(path: string): number {
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  return openSync(path, constants.O_RDONLY | noFollow);
}

export function toPosixPath(value: string): string {
  return value.split(sep).join('/').replace(/\\+/g, '/');
}

function isWindowsAbsoluteLike(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^[a-zA-Z]:/.test(value) || value.startsWith('\\\\');
}

function canonicalDirectory(path: string): string | null {
  const absolute = resolve(path);
  try {
    if (!statSync(absolute).isDirectory()) return null;
    return realpathSync(absolute);
  } catch {
    return null;
  }
}

function directoryIdentity(path: string): string | null {
  try {
    const stats = statSync(path);
    if (!stats.isDirectory()) return null;
    return `${stats.dev}:${stats.ino}:${Math.trunc(stats.birthtimeMs)}`;
  } catch {
    return null;
  }
}

function expectedRootIdentity(canonicalRoot: string): string | null {
  const current = directoryIdentity(canonicalRoot);
  if (!current) return null;
  const expected = REPO_ROOT_IDENTITIES.get(canonicalRoot);
  if (expected) return expected;
  REPO_ROOT_IDENTITIES.set(canonicalRoot, current);
  return current;
}

function registryRevision(records: Array<{ id: string; path: string; accessMode: RepoHarnessAccessMode }>): string {
  return `registry_${sha256(JSON.stringify(records.map((entry) => ({
    id: entry.id,
    path: entry.path,
    accessMode: entry.accessMode,
  })).sort((a, b) => a.path.localeCompare(b.path)))).slice(0, 16)}`;
}

export function uniqueRepoRecords(ctx: RepoAuthorityContext): RepoRecord[] {
  const registered = readRegisteredRepoHarnessRepos({ adoptedOnly: true });
  const byPath = new Map<string, RepoRecord>();
  const known = new Map(registered.map((repo) => [repo.path, repo]));
  const canonicalRegistered = registered.map((repo) => ({
    id: repo.id,
    path: repo.path,
    accessMode: repo.accessMode,
  }));
  const revision = registryRevision(canonicalRegistered);

  const add = (rawPath: string, source: RepoRecord['source']): void => {
    const canonicalRoot = canonicalDirectory(rawPath);
    if (!canonicalRoot || byPath.has(canonicalRoot)) return;
    const rootIdentity = expectedRootIdentity(canonicalRoot);
    if (!rootIdentity) return;
    const registeredEntry = known.get(canonicalRoot);
    byPath.set(canonicalRoot, {
      repoId: registeredEntry?.id ?? repoHarnessRepoIdFor(canonicalRoot),
      canonicalRoot,
      rootIdentity,
      displayName: basename(canonicalRoot) || canonicalRoot,
      accessMode: registeredEntry?.accessMode ?? 'read_only',
      registryRevision: revision,
      source,
    });
  };

  add(ctx.repoRoot, 'current');
  for (const root of ctx.policy.allowedRoots ?? []) add(root, 'policy');
  for (const repo of registered) add(repo.path, 'registered');

  return Array.from(byPath.values()).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.canonicalRoot.localeCompare(b.canonicalRoot));
}

export function resolveRepo(ctx: RepoAuthorityContext, repoId: unknown): RepoRecord {
  const id = String(repoId ?? '').trim();
  if (!id) throw new GeneralRepoAccessError('REPO_NOT_ALLOWED', 'repo_id is required');
  const repo = uniqueRepoRecords(ctx).find((entry) => entry.repoId === id);
  if (!repo) throw new GeneralRepoAccessError('REPO_NOT_ALLOWED', 'repo_id is not in the registered repo whitelist', { repo_id: id });
  const currentRoot = canonicalDirectory(repo.canonicalRoot);
  const currentIdentity = currentRoot ? directoryIdentity(currentRoot) : null;
  if (currentRoot !== repo.canonicalRoot || !currentIdentity || currentIdentity !== repo.rootIdentity) {
    throw new GeneralRepoAccessError('REPO_NOT_ALLOWED', 'registered repo root moved, was replaced, or is no longer readable', { repo_id: id });
  }
  return repo;
}

export function normalizeRepoRelativePath(input: unknown, opts: { allowRoot?: boolean } = {}): string {
  const raw = String(input ?? (opts.allowRoot ? '.' : '')).trim();
  if (!raw || raw.includes('\0') || isAbsolute(raw) || isWindowsAbsoluteLike(raw)) {
    throw new GeneralRepoAccessError('INVALID_RELATIVE_PATH', 'path must be repo-relative');
  }
  const normalized = toPosixPath(raw).replace(/^\.\/+/, '');
  const relativePath = normalized === '' || normalized === '.' ? '.' : normalized;
  if (relativePath === '.' && opts.allowRoot) return relativePath;
  if (relativePath === '.') throw new GeneralRepoAccessError('INVALID_RELATIVE_PATH', 'path must target a repo entry');
  if (relativePath.split('/').some((part) => part === '..')) {
    throw new GeneralRepoAccessError('INVALID_RELATIVE_PATH', 'path must not contain traversal segments', { path: raw });
  }
  return relativePath;
}

function parseIgnoreLine(line: string): IgnoreRule | null {
  const trimmedRight = line.trimEnd();
  const trimmed = trimmedRight.trimStart();
  if (!trimmed || trimmed.startsWith('#')) return null;
  let patternText = trimmed;
  let negated = false;
  if (patternText.startsWith('\\#') || patternText.startsWith('\\!')) {
    patternText = patternText.slice(1);
  } else if (patternText.startsWith('!')) {
    negated = true;
    patternText = patternText.slice(1);
  }
  const anchored = patternText.startsWith('/');
  const directoryOnly = patternText.endsWith('/');
  const pattern = patternText.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!pattern) return null;
  return { pattern, negated, directoryOnly, anchored };
}

export function readIgnorePolicy(repoRoot: string): IgnorePolicy {
  const ignorePath = resolve(repoRoot, '.ignore');
  if (!existsSync(ignorePath)) return { digest: `sha256:${sha256('')}`, fileIdentity: null, rules: [] };
  const before = lstatSync(ignorePath);
  if (before.isSymbolicLink()) {
    throw new GeneralRepoAccessError('SYMLINK_ESCAPE', '.ignore must be a regular repo-local file', { path: '.ignore' });
  }
  if (!before.isFile()) {
    throw new GeneralRepoAccessError('NOT_A_FILE', '.ignore must be a regular file', { path: '.ignore' });
  }
  const fd = openNoFollow(ignorePath);
  let buffer: Buffer;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || statIdentity(opened) !== statIdentity(before)) {
      throw new GeneralRepoAccessError('SNAPSHOT_STALE', '.ignore changed while it was being opened', { path: '.ignore' }, true);
    }
    buffer = readFileSync(fd);
  } finally {
    closeSync(fd);
  }
  const text = buffer.toString('utf-8');
  return {
    digest: `sha256:${sha256(text)}`,
    fileIdentity: statIdentity(before),
    rules: text.split(/\r?\n/).map(parseIgnoreLine).filter((rule): rule is IgnoreRule => rule !== null),
  };
}

export function sameIgnorePolicyRevision(left: IgnorePolicy, right: IgnorePolicy): boolean {
  return left.digest === right.digest && left.fileIdentity === right.fileIdentity;
}

function pathMatchesPattern(pattern: string, path: string, anchored: boolean): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  if (anchored) return globMatches(pattern, path);
  if (!pattern.includes('/')) {
    return path.split('/').some((segment) => globMatches(pattern, segment));
  }
  return globMatches(pattern, path) || globMatches(`**/${pattern}`, path);
}

function ignoreRuleMatches(rule: IgnoreRule, relativePath: string): boolean {
  const path = relativePath.replace(/\\/g, '/');
  if (rule.directoryOnly) {
    const pattern = rule.pattern;
    if (path === pattern || path.startsWith(`${pattern}/`)) return true;
    if (!rule.anchored) {
      const parts = path.split('/');
      return parts.some((_, index) => {
        const suffix = parts.slice(index).join('/');
        return suffix === pattern || suffix.startsWith(`${pattern}/`);
      });
    }
    return false;
  }
  return pathMatchesPattern(rule.pattern, path, rule.anchored);
}

export function isIgnored(policy: IgnorePolicy, relativePath: string): boolean {
  if (relativePath === '.ignore') return true;
  let ignored = false;
  for (const rule of policy.rules) {
    if (ignoreRuleMatches(rule, relativePath)) ignored = !rule.negated;
  }
  return ignored;
}

function entryType(path: string): RepoEntryType {
  const lstat = lstatSync(path);
  if (lstat.isSymbolicLink()) return 'symlink';
  const fileStat = statSync(path);
  if (fileStat.isFile()) return 'file';
  if (fileStat.isDirectory()) return 'directory';
  return 'other';
}

function entryTypeFromStat(lstat: ReturnType<typeof lstatSync>): RepoEntryType {
  if (!lstat) return 'other';
  if (lstat.isSymbolicLink()) return 'symlink';
  if (lstat.isFile()) return 'file';
  if (lstat.isDirectory()) return 'directory';
  return 'other';
}

export function metadataSignature(fileStat: ReturnType<typeof statSync>, type: RepoEntryType, readable: boolean): string {
  if (!fileStat) return '';
  return [
    fileStat.size,
    fileStat.mtimeMs,
    fileStat.ctimeMs,
    fileStat.mode,
    fileStat.ino,
    type,
    readable ? 'readable' : 'metadata-only',
  ].join(':');
}

export function resolveRepoPath(repo: RepoRecord, inputPath: unknown, ignore: IgnorePolicy, opts: {
  requireFile?: boolean;
  requireDirectory?: boolean;
  allowRoot?: boolean;
  allowExternalSymlinkMetadata?: boolean;
} = {}): ResolvedRepoPath {
  const relativePath = normalizeRepoRelativePath(inputPath, { allowRoot: opts.allowRoot });
  if (relativePath !== '.' && isIgnored(ignore, relativePath)) {
    throw new GeneralRepoAccessError('PATH_IGNORED', 'path is excluded by .ignore', { path: relativePath });
  }
  const absolutePath = relativePath === '.' ? repo.canonicalRoot : resolve(repo.canonicalRoot, relativePath);
  if (!isPathInside(repo.canonicalRoot, absolutePath)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'path escapes repo root', { path: relativePath });
  }
  if (!existsSync(absolutePath)) {
    throw new GeneralRepoAccessError('NOT_FOUND', 'path does not exist', { path: relativePath });
  }

  const lstat = lstatSync(absolutePath);
  const type = entryType(absolutePath);
  let canonicalPath = absolutePath;
  let symlinkTargetKind: SymlinkTargetKind = 'none';
  let readable = true;

  if (type === 'symlink') {
    canonicalPath = realpathSync(absolutePath);
    const inside = isPathInside(repo.canonicalRoot, canonicalPath);
    symlinkTargetKind = inside ? 'internal' : 'external';
    readable = inside;
    if (!inside && !opts.allowExternalSymlinkMetadata) {
      throw new GeneralRepoAccessError('SYMLINK_ESCAPE', 'symlink target escapes repo root', { path: relativePath });
    }
  } else {
    canonicalPath = realpathSync(absolutePath);
  }

  if (readable && !isPathInside(repo.canonicalRoot, canonicalPath)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'path escapes repo root', { path: relativePath });
  }
  if (readable) {
    const physicalRelative = toPosixPath(relative(repo.canonicalRoot, canonicalPath)) || '.';
    if (physicalRelative !== '.' && isIgnored(ignore, physicalRelative)) {
      throw new GeneralRepoAccessError('PATH_IGNORED', 'symlink target is excluded by .ignore', { path: relativePath });
    }
  }

  const fileStat = readable ? statSync(canonicalPath) : lstat;
  const parentStat = statSync(dirname(absolutePath));
  if (opts.requireFile && (!readable || !fileStat.isFile())) {
    throw new GeneralRepoAccessError('NOT_A_FILE', 'path is not a regular file', { path: relativePath });
  }
  if (opts.requireDirectory && (!readable || !fileStat.isDirectory())) {
    throw new GeneralRepoAccessError('NOT_FOUND', 'path is not a directory', { path: relativePath });
  }

  return {
    repo,
    relativePath,
    absolutePath,
    canonicalPath,
    type,
    size: fileStat.isFile() ? fileStat.size : undefined,
    modifiedAt: fileStat.mtime.toISOString(),
    metadataSignature: metadataSignature(fileStat, type, readable),
    contentFile: readable && fileStat.isFile(),
    symlinkTargetKind,
    readable,
    identity: readable ? statIdentity(fileStat) : undefined,
    parentIdentity: statIdentity(parentStat),
  };
}

function parentRelativePath(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index < 0 ? '.' : relativePath.slice(0, index) || '.';
}

export function leafName(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index < 0 ? relativePath : relativePath.slice(index + 1);
}

export function assertRepoWriteEnabled(repo: RepoRecord): void {
  if (repo.accessMode !== 'read_write') {
    throw new GeneralRepoAccessError('WRITE_DISABLED', 'repo is read_only; mutation tools require read_write capability', {
      repo_id: repo.repoId,
      access_mode: repo.accessMode,
    });
  }
}

export function refreshPathsArg(repo: RepoRecord, ignore: IgnorePolicy, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'paths must be an array of repo-relative paths');
  }
  const paths = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new GeneralRepoAccessError('INVALID_RELATIVE_PATH', 'paths must contain only strings');
    }
    const relativePath = normalizeRepoRelativePath(item, { allowRoot: true });
    if (relativePath !== '.' && isIgnored(ignore, relativePath)) {
      throw new GeneralRepoAccessError('PATH_IGNORED', 'path is excluded by .ignore', { path: relativePath });
    }
    const absolutePath = relativePath === '.' ? repo.canonicalRoot : resolve(repo.canonicalRoot, relativePath);
    if (!isPathInside(repo.canonicalRoot, absolutePath)) {
      throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'path escapes repo root', { path: relativePath });
    }
    if (existsSync(absolutePath)) {
      const resolved = resolveRepoPath(repo, relativePath, ignore, { allowRoot: true, allowExternalSymlinkMetadata: true });
      paths.add(resolved.relativePath);
    } else {
      paths.add(relativePath);
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function resolveRepoWritePath(repo: RepoRecord, inputPath: unknown, ignore: IgnorePolicy): ResolvedRepoWritePath {
  const relativePath = normalizeRepoRelativePath(inputPath);
  if (isIgnored(ignore, relativePath)) {
    throw new GeneralRepoAccessError('PATH_IGNORED', 'path is excluded by .ignore', { path: relativePath });
  }
  const absolutePath = resolve(repo.canonicalRoot, relativePath);
  if (!isPathInside(repo.canonicalRoot, absolutePath)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'path escapes repo root', { path: relativePath });
  }

  if (existsSync(absolutePath)) {
    const existing = resolveRepoPath(repo, relativePath, ignore, { requireFile: true });
    if (existing.type === 'symlink') {
      throw new GeneralRepoAccessError('SYMLINK_ESCAPE', 'write_file does not write through symlinks', { path: relativePath });
    }
    return {
      repo,
      relativePath,
      absolutePath,
      canonicalPath: existing.canonicalPath,
      parentRelativePath: parentRelativePath(relativePath),
      parentCanonicalPath: realpathSync(dirname(existing.canonicalPath)),
      existing,
    };
  }

  const parentRelative = parentRelativePath(relativePath);
  const parent = resolveRepoPath(repo, parentRelative, ignore, { allowRoot: true, requireDirectory: true });
  if (!parent.readable || parent.symlinkTargetKind === 'external') {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'write parent escapes repo root', { path: relativePath });
  }
  const canonicalPath = resolve(parent.canonicalPath, leafName(relativePath));
  if (!isPathInside(repo.canonicalRoot, canonicalPath)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'path escapes repo root', { path: relativePath });
  }
  const physicalRelative = toPosixPath(relative(repo.canonicalRoot, canonicalPath)) || '.';
  if (physicalRelative !== '.' && isIgnored(ignore, physicalRelative)) {
    throw new GeneralRepoAccessError('PATH_IGNORED', 'write target is excluded by .ignore', { path: relativePath });
  }

  return {
    repo,
    relativePath,
    absolutePath,
    canonicalPath,
    parentRelativePath: parent.relativePath,
    parentCanonicalPath: parent.canonicalPath,
  };
}

export function resolveWalkedRepoPath(repo: RepoRecord, ignore: IgnorePolicy, relativePath: string, absolutePath: string, lstat: ReturnType<typeof lstatSync>): ResolvedRepoPath {
  if (!isPathInside(repo.canonicalRoot, absolutePath)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'path escapes repo root', { path: relativePath });
  }

  const type = entryTypeFromStat(lstat);
  let canonicalPath = absolutePath;
  let symlinkTargetKind: SymlinkTargetKind = 'none';
  let readable = true;
  let fileStat = lstat;
  const parentStat = statSync(dirname(absolutePath));

  if (type === 'symlink') {
    canonicalPath = realpathSync(absolutePath);
    const inside = isPathInside(repo.canonicalRoot, canonicalPath);
    symlinkTargetKind = inside ? 'internal' : 'external';
    readable = inside;
    if (inside) {
      fileStat = statSync(canonicalPath);
      const physicalRelative = toPosixPath(relative(repo.canonicalRoot, canonicalPath)) || '.';
      if (physicalRelative !== '.' && isIgnored(ignore, physicalRelative)) {
        throw new GeneralRepoAccessError('PATH_IGNORED', 'symlink target is excluded by .ignore', { path: relativePath });
      }
    }
  }

  return {
    repo,
    relativePath,
    absolutePath,
    canonicalPath,
    type,
    size: fileStat?.isFile() ? Number(fileStat.size) : undefined,
    modifiedAt: fileStat?.mtime.toISOString() ?? '',
    metadataSignature: fileStat ? metadataSignature(fileStat, type, readable) : '',
    contentFile: readable && !!fileStat?.isFile(),
    symlinkTargetKind,
    readable,
    identity: readable && fileStat ? statIdentity(fileStat) : undefined,
    parentIdentity: statIdentity(parentStat),
  };
}

function revalidateResolvedPath(
  resolved: ResolvedRepoPath,
  ignore: IgnorePolicy,
  opened?: { dev: number; ino: number; isFile(): boolean },
): void {
  if (resolved.parentIdentity && statIdentity(statSync(dirname(resolved.absolutePath))) !== resolved.parentIdentity) {
    throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'path parent changed after guard resolution', { path: resolved.relativePath }, true);
  }
  const currentCanonical = realpathSync(resolved.absolutePath);
  if (!isPathInside(resolved.repo.canonicalRoot, currentCanonical)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'path escapes repo root after open', { path: resolved.relativePath });
  }
  const physicalRelative = toPosixPath(relative(resolved.repo.canonicalRoot, currentCanonical)) || '.';
  if (physicalRelative !== '.' && isIgnored(ignore, physicalRelative)) {
    throw new GeneralRepoAccessError('PATH_IGNORED', 'path target is excluded by .ignore after open', { path: resolved.relativePath });
  }
  const currentStat = statSync(currentCanonical);
  if (resolved.identity && statIdentity(currentStat) !== resolved.identity) {
    throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'path changed after guard resolution', { path: resolved.relativePath }, true);
  }
  if (opened) {
    if (!opened.isFile()) {
      throw new GeneralRepoAccessError('NOT_A_FILE', 'opened path is not a regular file', { path: resolved.relativePath });
    }
    if (resolved.identity && statIdentity(opened) !== resolved.identity) {
      throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'opened file changed after guard resolution', { path: resolved.relativePath }, true);
    }
  }
}

export function readStableResolvedFile(resolved: ResolvedRepoPath, ignore: IgnorePolicy): Buffer {
  const fd = openNoFollow(resolved.canonicalPath);
  try {
    const opened = fstatSync(fd);
    revalidateResolvedPath(resolved, ignore, opened);
    const openedSignature = metadataSignature(opened, resolved.type, true);
    const data = readFileSync(fd);
    const after = fstatSync(fd);
    if (statIdentity(after) !== statIdentity(opened) || metadataSignature(after, resolved.type, true) !== openedSignature) {
      throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'file changed while it was being read', { path: resolved.relativePath }, true);
    }
    return data;
  } finally {
    closeSync(fd);
  }
}
