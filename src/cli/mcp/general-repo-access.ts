import { createHash, randomBytes } from 'crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeSync, type Dirent } from 'fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path';
import { readRegisteredRepoHarnessRepos, repoHarnessRepoIdFor, type RepoHarnessAccessMode } from '../../effects/repo-registry';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { createCodeGraphCliAdapter, type CodeGraphRefreshResult, type CodeGraphRepoSnapshot, type GeneralRepoCodeGraphAdapter } from './codegraph-adapter';
import { globMatches, isPathInside } from './paths';
import type { McpPolicy } from './types';

export interface GeneralRepoToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface GeneralRepoToolContext {
  repoRoot: string;
  policy: McpPolicy;
  codeGraphAdapter?: GeneralRepoCodeGraphAdapter;
  testHooks?: {
    afterSnapshotWalk?: (event: { repoRoot: string; kind: 'complete' | 'manifest_page'; attempt: number }) => void;
  };
}

export interface GeneralRepoToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

type RepoEntryType = 'file' | 'directory' | 'symlink' | 'other';
type SymlinkTargetKind = 'internal' | 'external' | 'none';
type SnapshotState = 'ready' | 'index_lagging' | 'stale' | 'failed';
const ENTRY_REVISION: unique symbol = Symbol('entryRevision');

interface RepoRecord {
  repoId: string;
  canonicalRoot: string;
  displayName: string;
  accessMode: RepoHarnessAccessMode;
  registryRevision: string;
  source: 'current' | 'policy' | 'registered';
}

interface IgnoreRule {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  anchored: boolean;
}

interface IgnorePolicy {
  digest: string;
  rules: IgnoreRule[];
}

interface ResolvedRepoPath {
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

interface ResolvedRepoWritePath {
  repo: RepoRecord;
  relativePath: string;
  absolutePath: string;
  canonicalPath: string;
  parentRelativePath: string;
  parentCanonicalPath: string;
  existing?: ResolvedRepoPath;
}

interface ManifestEntry {
  [ENTRY_REVISION]?: string;
  path: string;
  type: RepoEntryType;
  size?: number;
  modified_at?: string;
  sha256?: string;
  binary?: boolean;
  indexed: boolean;
  codegraph_language?: string;
  codegraph_node_count?: number;
  codegraph_size?: number;
  codegraph_index_lagging?: boolean;
  readable: boolean;
  writable: boolean;
  symlink_target_kind: SymlinkTargetKind;
}

interface ManifestCounts {
  entries: number;
  files: number;
  directories: number;
  symlinks: number;
  indexed: number;
  unindexed: number;
  index_lagging: number;
  text: number;
  binary: number;
  content_deferred: number;
}

interface VisibleEntrySnapshot {
  id: string;
  repoId: string;
  repoRoot: string;
  coverage: 'complete' | 'page';
  content: 'exact' | 'metadata';
  state: SnapshotState;
  createdAtMs: number;
  createdAt: string;
  expiresAt: string;
  ttlMs: number;
  cacheKey: string;
  cacheHit: boolean;
  cacheSize: number;
  entries: ManifestEntry[];
  entriesByPath: Map<string, ManifestEntry>;
  manifestDigest: string;
  partial: boolean;
  walkerErrors: number;
  entryMetadataCacheHits: number;
  entryMetadataCacheMisses: number;
  codeGraph: CodeGraphRepoSnapshot;
  codeGraphFilteredPaths: number;
  codeGraphLaggingPaths: string[];
}

interface EntryMetadataCacheStats {
  hits: number;
  misses: number;
}

interface CodeGraphEntryMetadata {
  language?: string;
  nodeCount?: number;
  size?: number;
  lagging: boolean;
}

interface PendingWalkEntry {
  relativePath: string;
  absolutePath: string;
  dirent: Dirent;
}

interface EntryMetadataCacheValue {
  entry: ManifestEntry;
  lastUsedAtMs: number;
}

const GENERAL_REPO_TOOLS = [
  'get_repo_capabilities',
  'repo_manifest',
  'list_tree',
  'search_text',
  'read_file',
  'read_files',
  'stat_file',
  'write_file',
  'refresh_repo_index',
] as const;

const DEFAULT_PAGE_SIZE = 300;
const HARD_PAGE_SIZE = 1000;
const HARD_READ_BYTES = 262_144;
const MAX_READ_LINES = 2_000;
const BINARY_PROBE_BYTES = 8 * 1024;
const SEARCH_FILE_SCAN_BYTES = 1024 * 1024;
const DEFAULT_SEARCH_RESULTS = 50;
const HARD_SEARCH_RESULTS = 100;
const SNAPSHOT_TTL_MS = 5 * 60_000;
const MAX_SNAPSHOT_CACHE_ENTRIES = 16;
const MAX_ENTRY_METADATA_CACHE_ENTRIES = 200_000;
const MAX_LAGGING_PATHS_RETURNED = 50;
const MAX_SNAPSHOT_BUILD_ATTEMPTS = 2;
const DEFAULT_CODEGRAPH_ADAPTER = createCodeGraphCliAdapter();
const SNAPSHOT_CACHE = new Map<string, VisibleEntrySnapshot>();
const ENTRY_METADATA_CACHE = new Map<string, EntryMetadataCacheValue>();
const WRITE_TOOLS = new Set<string>(['write_file', 'refresh_repo_index']);

export type GeneralRepoToolName = typeof GENERAL_REPO_TOOLS[number];

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

function textResult(value: unknown): GeneralRepoToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    structuredContent: typeof value === 'string' ? undefined : value,
  };
}

function errorResult(code: string, message: string, details?: unknown, retryable = false): GeneralRepoToolResult {
  const value = { error: { code, message, retryable, details } };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

function audit(ctx: GeneralRepoToolContext, tool: string, status: 'ok' | 'blocked' | 'failed', input: unknown, targetPath?: string, error?: string): void {
  tryWriteMcpAuditEntry(ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool,
    status,
    targetPath,
    inputHash: hashMcpInput(input),
    error,
  });
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function statIdentity(stat: { dev: number; ino: number }): string {
  return `${stat.dev}:${stat.ino}`;
}

function openNoFollow(path: string): number {
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  return openSync(path, constants.O_RDONLY | noFollow);
}

function numberArg(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function booleanArg(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function cachePaths(paths: string[] | undefined): string[] {
  const normalized = (paths && paths.length > 0 ? paths : ['.'])
    .map((path) => toPosixPath(String(path || '.')).replace(/^\.\/+/, '') || '.');
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function responseCacheKey(repo: RepoRecord, ignore: IgnorePolicy, snapshot: VisibleEntrySnapshot, scope: { tool: string; paths?: string[] }): { key: string; paths: string[]; pathDigest: string } {
  const paths = cachePaths(scope.paths);
  const pathDigest = `sha256:${sha256(JSON.stringify(paths))}`;
  const key = `cache_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${snapshot.id}\0${scope.tool}\0${pathDigest}`).slice(0, 16)}`;
  return { key, paths, pathDigest };
}

function toPosixPath(value: string): string {
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

function registryRevision(records: Array<{ id: string; path: string; accessMode: RepoHarnessAccessMode }>): string {
  return `registry_${sha256(JSON.stringify(records.map((entry) => ({
    id: entry.id,
    path: entry.path,
    accessMode: entry.accessMode,
  })).sort((a, b) => a.path.localeCompare(b.path)))).slice(0, 16)}`;
}

function uniqueRepoRecords(ctx: GeneralRepoToolContext): RepoRecord[] {
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
    const registeredEntry = known.get(canonicalRoot);
    byPath.set(canonicalRoot, {
      repoId: registeredEntry?.id ?? repoHarnessRepoIdFor(canonicalRoot),
      canonicalRoot,
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

function resolveRepo(ctx: GeneralRepoToolContext, repoId: unknown): RepoRecord {
  const id = String(repoId ?? '').trim();
  if (!id) throw new GeneralRepoAccessError('REPO_NOT_ALLOWED', 'repo_id is required');
  const repo = uniqueRepoRecords(ctx).find((entry) => entry.repoId === id);
  if (!repo) throw new GeneralRepoAccessError('REPO_NOT_ALLOWED', 'repo_id is not in the registered repo whitelist', { repo_id: id });
  const currentRoot = canonicalDirectory(repo.canonicalRoot);
  if (currentRoot !== repo.canonicalRoot) {
    throw new GeneralRepoAccessError('REPO_NOT_ALLOWED', 'registered repo root moved or is no longer readable', { repo_id: id });
  }
  return repo;
}

function normalizeRepoRelativePath(input: unknown, opts: { allowRoot?: boolean } = {}): string {
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

function readIgnorePolicy(repoRoot: string): IgnorePolicy {
  const ignorePath = resolve(repoRoot, '.ignore');
  if (!existsSync(ignorePath)) return { digest: `sha256:${sha256('')}`, rules: [] };
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
    rules: text.split(/\r?\n/).map(parseIgnoreLine).filter((rule): rule is IgnoreRule => rule !== null),
  };
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

function isIgnored(policy: IgnorePolicy, relativePath: string): boolean {
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
  if (lstat.isSymbolicLink()) return 'symlink';
  if (lstat.isFile()) return 'file';
  if (lstat.isDirectory()) return 'directory';
  return 'other';
}

function metadataSignature(fileStat: ReturnType<typeof statSync>, type: RepoEntryType, readable: boolean): string {
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

function resolveRepoPath(repo: RepoRecord, inputPath: unknown, ignore: IgnorePolicy, opts: {
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

function leafName(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index < 0 ? relativePath : relativePath.slice(index + 1);
}

function assertRepoWriteEnabled(repo: RepoRecord): void {
  if (repo.accessMode !== 'read_write') {
    throw new GeneralRepoAccessError('WRITE_DISABLED', 'repo is read_only; mutation tools require read_write capability', {
      repo_id: repo.repoId,
      access_mode: repo.accessMode,
    });
  }
}

function refreshPathsArg(repo: RepoRecord, ignore: IgnorePolicy, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'paths must be an array of repo-relative paths');
  }
  const paths = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new GeneralRepoAccessError('INVALID_RELATIVE_PATH', 'paths must contain only strings');
    }
    const resolved = resolveRepoPath(repo, item, ignore, { allowRoot: true, allowExternalSymlinkMetadata: true });
    paths.add(resolved.relativePath);
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function resolveRepoWritePath(repo: RepoRecord, inputPath: unknown, ignore: IgnorePolicy): ResolvedRepoWritePath {
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

function resolveWalkedRepoPath(repo: RepoRecord, ignore: IgnorePolicy, relativePath: string, absolutePath: string, lstat: ReturnType<typeof lstatSync>): ResolvedRepoPath {
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

function revalidateResolvedPath(
  resolved: ResolvedRepoPath,
  ignore: IgnorePolicy,
  opened?: { dev: number; ino: number; isFile(): boolean },
): void {
  if (resolved.parentIdentity && statIdentity(statSync(dirname(resolved.absolutePath))) !== resolved.parentIdentity) {
    throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'path parent changed after guard resolution', { path: resolved.relativePath }, true);
  }
  const currentType = entryType(resolved.absolutePath);
  const currentCanonical = currentType === 'symlink' ? realpathSync(resolved.absolutePath) : realpathSync(resolved.absolutePath);
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

function readStableResolvedFile(resolved: ResolvedRepoPath, ignore: IgnorePolicy): Buffer {
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

function commonFields(repo: RepoRecord, ignore: IgnorePolicy, snapshot: VisibleEntrySnapshot, scope: { tool: string; paths?: string[] }) {
  const scopedCache = responseCacheKey(repo, ignore, snapshot, scope);
  return {
    repo_id: repo.repoId,
    snapshot_id: snapshot.id,
    snapshot_state: snapshot.state,
    snapshot_created_at: snapshot.createdAt,
    snapshot_expires_at: snapshot.expiresAt,
    snapshot_ttl_ms: snapshot.ttlMs,
    snapshot_cache: {
      key: scopedCache.key,
      snapshot_key: snapshot.cacheKey,
      scope: scope.tool,
      paths: scopedCache.paths,
      path_digest: scopedCache.pathDigest,
      hit: snapshot.cacheHit,
      size: snapshot.cacheSize,
      max_entries: MAX_SNAPSHOT_CACHE_ENTRIES,
      entry_metadata: {
        hits: snapshot.entryMetadataCacheHits,
        misses: snapshot.entryMetadataCacheMisses,
        size: ENTRY_METADATA_CACHE.size,
        max_entries: MAX_ENTRY_METADATA_CACHE_ENTRIES,
      },
    },
    index_revision: snapshot.codeGraph.indexRevision,
    ignore_digest: ignore.digest,
    stale: snapshot.state === 'stale',
    partial: snapshot.partial,
    next_cursor: null,
  };
}

function entryMetadataCacheKey(resolved: ResolvedRepoPath, ignore: IgnorePolicy, contentHash = true): string {
  return `entry_${sha256(`${resolved.repo.repoId}\0${resolved.repo.registryRevision}\0${ignore.digest}\0${resolved.relativePath}\0${resolved.metadataSignature}\0${contentHash ? 'content-hash' : 'metadata-only'}`).slice(0, 16)}`;
}

function rememberEntryMetadata(key: string, entry: ManifestEntry): void {
  ENTRY_METADATA_CACHE.set(key, { entry: { ...entry }, lastUsedAtMs: Date.now() });
  while (ENTRY_METADATA_CACHE.size > MAX_ENTRY_METADATA_CACHE_ENTRIES) {
    const oldestKey = ENTRY_METADATA_CACHE.keys().next().value;
    if (oldestKey === undefined) break;
    ENTRY_METADATA_CACHE.delete(oldestKey);
  }
}

function metadataForResolved(resolved: ResolvedRepoPath, ignore: IgnorePolicy, stats?: EntryMetadataCacheStats, opts: { contentHash?: boolean; cache?: boolean } = {}): ManifestEntry {
  const contentHash = opts.contentHash ?? true;
  const useCache = opts.cache ?? true;
  const cacheKey = useCache ? entryMetadataCacheKey(resolved, ignore, contentHash) : '';
  if (useCache) {
    const cached = ENTRY_METADATA_CACHE.get(cacheKey);
    if (cached) {
      stats && (stats.hits += 1);
      ENTRY_METADATA_CACHE.delete(cacheKey);
      ENTRY_METADATA_CACHE.set(cacheKey, { entry: cached.entry, lastUsedAtMs: Date.now() });
      return { ...cached.entry };
    }
  }
  stats && (stats.misses += 1);
  let binary: boolean | undefined = resolved.contentFile ? undefined : false;
  let fileHash: string | undefined;
  if (contentHash && resolved.readable && resolved.contentFile) {
    const raw = readStableResolvedFile(resolved, { digest: '', rules: [] });
    binary = raw.subarray(0, BINARY_PROBE_BYTES).includes(0);
    fileHash = sha256(raw);
  }
  const entry: ManifestEntry = {
    [ENTRY_REVISION]: resolved.metadataSignature,
    path: resolved.relativePath,
    type: resolved.type,
    size: resolved.size,
    modified_at: resolved.modifiedAt,
    sha256: fileHash,
    binary,
    indexed: false,
    readable: resolved.readable,
    writable: resolved.repo.accessMode === 'read_write' && resolved.readable,
    symlink_target_kind: resolved.symlinkTargetKind,
  };
  if (useCache) rememberEntryMetadata(cacheKey, entry);
  return { ...entry };
}

function walkVisibleEntries(repo: RepoRecord, ignore: IgnorePolicy, startRelative = '.', stats: EntryMetadataCacheStats = { hits: 0, misses: 0 }, opts: { contentHash?: boolean; cacheMetadata?: boolean } = {}): { entries: ManifestEntry[]; partial: boolean; walkerErrors: number } {
  const start = resolveRepoPath(repo, startRelative, ignore, { allowRoot: true, allowExternalSymlinkMetadata: true });
  const entries: ManifestEntry[] = [];
  let walkerErrors = 0;

  const visit = (absoluteDir: string, relativeDir: string): void => {
    let children;
    try {
      children = readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (_error) {
      walkerErrors += 1;
      return;
    }
    for (const child of children) {
      const childRelative = relativeDir === '.' ? child.name : `${relativeDir}/${child.name}`;
      const childAbsolute = resolve(absoluteDir, child.name);
      const ignored = isIgnored(ignore, childRelative);
      let resolvedChild: ResolvedRepoPath | null = null;
      if (!ignored) {
        try {
          const childLstat = lstatSync(childAbsolute);
          resolvedChild = resolveWalkedRepoPath(repo, ignore, childRelative, childAbsolute, childLstat);
          entries.push(metadataForResolved(resolvedChild, ignore, stats, { contentHash: opts.contentHash ?? true, cache: opts.cacheMetadata ?? true }));
        } catch (_error) {
          walkerErrors += 1;
        }
      }
      if (child.isDirectory()) {
        visit(childAbsolute, childRelative);
      } else if (resolvedChild?.type === 'directory') {
        visit(resolvedChild.canonicalPath, childRelative);
      }
    }
  };

  if (start.relativePath !== '.') entries.push(metadataForResolved(start, ignore, stats, { contentHash: opts.contentHash ?? true, cache: opts.cacheMetadata ?? true }));
  if (start.readable && start.type === 'directory') visit(start.canonicalPath, start.relativePath);
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), partial: walkerErrors > 0, walkerErrors };
}

function pushManifestChildren(pending: PendingWalkEntry[], absoluteDir: string, relativeDir: string): boolean {
  let children: Dirent[];
  try {
    children = readdirSync(absoluteDir, { withFileTypes: true });
  } catch (_error) {
    return false;
  }
  for (const child of children) {
    const childRelative = relativeDir === '.' ? child.name : `${relativeDir}/${child.name}`;
    pending.push({
      relativePath: childRelative,
      absolutePath: resolve(absoluteDir, child.name),
      dirent: child,
    });
  }
  pending.sort((a, b) => b.relativePath.localeCompare(a.relativePath));
  return true;
}

function isInternalRevisionPath(path: string): boolean {
  return path === '.ai/harness/mcp/audit.log' || path.startsWith('.ai/harness/mcp/');
}

function createManifestDigest() {
  const hash = createHash('sha256');
  hash.update('general-repo-manifest-v2\0');
  return {
    update(entry: ManifestEntry, revision = entry[ENTRY_REVISION] ?? entry.sha256 ?? ''): void {
      if (isInternalRevisionPath(entry.path)) return;
      hash.update(JSON.stringify([
        entry.path,
        revision,
        entry.type,
      ]));
      hash.update('\0');
    },
    digest(): string {
      return `sha256:${hash.digest('hex')}`;
    },
  };
}

function metadataDigest(entries: ManifestEntry[]): string {
  const digest = createManifestDigest();
  for (const entry of entries) digest.update(entry);
  return digest.digest();
}

function validateSnapshotRevision(repo: RepoRecord, ignore: IgnorePolicy, expectedDigest: string): { stale: boolean; partial: boolean; walkerErrors: number; digest: string } {
  const validation = walkVisibleEntries(repo, ignore, '.', { hits: 0, misses: 0 }, { contentHash: false, cacheMetadata: false });
  const digest = metadataDigest(validation.entries);
  return {
    stale: digest !== expectedDigest,
    partial: validation.partial,
    walkerErrors: validation.walkerErrors,
    digest,
  };
}

function snapshotState(codeGraph: CodeGraphRepoSnapshot, laggingCount: number, stale: boolean): SnapshotState {
  if (stale) return 'stale';
  return codeGraph.available && laggingCount > 0 ? 'index_lagging' : 'ready';
}

function staleSnapshotError(snapshot: VisibleEntrySnapshot): GeneralRepoAccessError {
  return new GeneralRepoAccessError('SNAPSHOT_STALE', 'repo changed while snapshot was being built', {
    snapshot_id: snapshot.id,
    manifest_digest: snapshot.manifestDigest,
  }, true);
}

function emptyManifestCounts(): ManifestCounts {
  return {
    entries: 0,
    files: 0,
    directories: 0,
    symlinks: 0,
    indexed: 0,
    unindexed: 0,
    index_lagging: 0,
    text: 0,
    binary: 0,
    content_deferred: 0,
  };
}

function addManifestCount(counts: ManifestCounts, entry: ManifestEntry): void {
  counts.entries += 1;
  if (entry.type === 'file') counts.files += 1;
  if (entry.type === 'directory') counts.directories += 1;
  if (entry.type === 'symlink') counts.symlinks += 1;
  if (entry.indexed) counts.indexed += 1;
  else counts.unindexed += 1;
  if (entry.codegraph_index_lagging) counts.index_lagging += 1;
  if (entry.type === 'file' && entry.binary === false) counts.text += 1;
  if (entry.type === 'file' && entry.binary === true) counts.binary += 1;
  if (entry.type === 'file' && entry.binary === undefined) counts.content_deferred += 1;
}

function countsForEntries(entries: ManifestEntry[]): ManifestCounts {
  const counts = emptyManifestCounts();
  for (const entry of entries) addManifestCount(counts, entry);
  return counts;
}

function codeGraphMetadataIndex(repo: RepoRecord, ignore: IgnorePolicy, codeGraph: CodeGraphRepoSnapshot): { byPath: Map<string, CodeGraphEntryMetadata>; filteredPaths: number; laggingPaths: Set<string> } {
  const byPath = new Map<string, CodeGraphEntryMetadata>();
  let filteredPaths = 0;
  const laggingPaths = new Set<string>();

  for (const file of codeGraph.files) {
    let relativePath = '';
    try {
      relativePath = normalizeRepoRelativePath(file.path);
      if (isIgnored(ignore, relativePath)) {
        filteredPaths += 1;
        continue;
      }
      const resolved = resolveRepoPath(repo, relativePath, ignore, { allowExternalSymlinkMetadata: true });
      if (resolved.type !== 'file') {
        filteredPaths += 1;
        continue;
      }
      const lagging = typeof file.size === 'number' && typeof resolved.size === 'number' && file.size !== resolved.size;
      byPath.set(resolved.relativePath, {
        language: file.language,
        nodeCount: file.nodeCount,
        size: file.size,
        lagging,
      });
      if (lagging) {
        laggingPaths.add(resolved.relativePath);
      }
    } catch (error) {
      filteredPaths += 1;
      if (error instanceof GeneralRepoAccessError && error.code === 'NOT_FOUND' && relativePath) {
        laggingPaths.add(relativePath);
      }
    }
  }

  return { byPath, filteredPaths, laggingPaths };
}

function applyCodeGraphMetadata(entry: ManifestEntry, metadata?: CodeGraphEntryMetadata): ManifestEntry {
  if (!metadata) return entry;
  entry.indexed = true;
  entry.codegraph_language = metadata.language;
  entry.codegraph_node_count = metadata.nodeCount;
  entry.codegraph_size = metadata.size;
  if (metadata.lagging) entry.codegraph_index_lagging = true;
  return entry;
}

function mergeCodeGraphMetadata(repo: RepoRecord, ignore: IgnorePolicy, entries: ManifestEntry[], codeGraph: CodeGraphRepoSnapshot): { entriesByPath: Map<string, ManifestEntry>; filteredPaths: number; laggingPaths: string[] } {
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const indexed = codeGraphMetadataIndex(repo, ignore, codeGraph);
  let filteredPaths = indexed.filteredPaths;

  for (const [path, metadata] of indexed.byPath) {
    const entry = entriesByPath.get(path);
    if (!entry) {
      filteredPaths += 1;
      continue;
    }
    applyCodeGraphMetadata(entry, metadata);
  }

  const laggingPaths = [...indexed.laggingPaths].sort((a, b) => a.localeCompare(b));
  return { entriesByPath, filteredPaths, laggingPaths };
}

function buildManifestPageSnapshot(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy, args: Record<string, unknown>, attempt = 0): { snapshot: VisibleEntrySnapshot; counts: ManifestCounts; nextCursor: string | null } {
  const createdAtMs = Date.now();
  const codeGraph = (ctx.codeGraphAdapter ?? DEFAULT_CODEGRAPH_ADAPTER).discoverRepo(repo.canonicalRoot);
  const indexed = codeGraphMetadataIndex(repo, ignore, codeGraph);
  const entryMetadataStats = { hits: 0, misses: 0 };
  const counts = emptyManifestCounts();
  const digest = createManifestDigest();
  const pageSize = numberArg(args.page_size, DEFAULT_PAGE_SIZE, 1, HARD_PAGE_SIZE);
  const offset = numberArg(args.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  const pageEntries: ManifestEntry[] = [];
  const pageByPath = new Map<string, ManifestEntry>();
  const pending: PendingWalkEntry[] = [];
  let walkerErrors = 0;

  const start = resolveRepoPath(repo, '.', ignore, { allowRoot: true, allowExternalSymlinkMetadata: true });
  if (start.readable && start.type === 'directory' && !pushManifestChildren(pending, start.canonicalPath, start.relativePath)) {
    walkerErrors += 1;
  }

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const ignored = isIgnored(ignore, current.relativePath);
    let resolvedChild: ResolvedRepoPath | null = null;
    if (!ignored) {
      try {
        const childLstat = lstatSync(current.absolutePath);
        resolvedChild = resolveWalkedRepoPath(repo, ignore, current.relativePath, current.absolutePath, childLstat);
        const includeContentHash = counts.entries >= offset && pageEntries.length < pageSize;
        const entry = applyCodeGraphMetadata(metadataForResolved(resolvedChild, ignore, entryMetadataStats, {
          contentHash: includeContentHash,
          cache: includeContentHash,
        }), indexed.byPath.get(resolvedChild.relativePath));
        digest.update(entry);
        addManifestCount(counts, entry);
        if (counts.entries > offset && pageEntries.length < pageSize) {
          pageEntries.push(entry);
          pageByPath.set(entry.path, entry);
        }
      } catch (_error) {
        walkerErrors += 1;
      }
    }

    if (current.dirent.isDirectory()) {
      if (!pushManifestChildren(pending, current.absolutePath, current.relativePath)) walkerErrors += 1;
    } else if (resolvedChild?.type === 'directory') {
      if (!pushManifestChildren(pending, resolvedChild.canonicalPath, current.relativePath)) walkerErrors += 1;
    }
  }

  const manifestDigest = digest.digest();
  ctx.testHooks?.afterSnapshotWalk?.({ repoRoot: repo.canonicalRoot, kind: 'manifest_page', attempt });
  const validation = validateSnapshotRevision(repo, ignore, manifestDigest);
  if (validation.stale && attempt + 1 < MAX_SNAPSHOT_BUILD_ATTEMPTS) {
    return buildManifestPageSnapshot(ctx, repo, ignore, args, attempt + 1);
  }
  const id = `snap_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${codeGraph.indexRevision}\0${manifestDigest}`).slice(0, 16)}`;
  const coverage: VisibleEntrySnapshot['coverage'] = offset === 0 && pageEntries.length === counts.entries ? 'complete' : 'page';
  const cacheKey = coverage === 'complete'
    ? `cache_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${id}`).slice(0, 16)}`
    : `cache_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${id}\0repo_manifest\0${offset}\0${pageSize}`).slice(0, 16)}`;
  const state = snapshotState(codeGraph, indexed.laggingPaths.size, validation.stale);
  const expiresAtMs = createdAtMs + SNAPSHOT_TTL_MS;
  const snapshot: VisibleEntrySnapshot = {
    id,
    repoId: repo.repoId,
    repoRoot: repo.canonicalRoot,
    coverage,
    content: coverage === 'complete' ? 'exact' : 'metadata',
    state,
    createdAtMs,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlMs: SNAPSHOT_TTL_MS,
    cacheKey,
    cacheHit: false,
    cacheSize: SNAPSHOT_CACHE.size,
    entries: pageEntries,
    entriesByPath: pageByPath,
    manifestDigest,
    partial: walkerErrors > 0 || validation.partial || validation.stale,
    walkerErrors: walkerErrors + validation.walkerErrors + (validation.stale ? 1 : 0),
    entryMetadataCacheHits: entryMetadataStats.hits,
    entryMetadataCacheMisses: entryMetadataStats.misses,
    codeGraph,
    codeGraphFilteredPaths: indexed.filteredPaths,
    codeGraphLaggingPaths: [...indexed.laggingPaths].sort((a, b) => a.localeCompare(b)),
  };
  const nextCursor = offset + pageEntries.length < counts.entries ? String(offset + pageEntries.length) : null;
  return { snapshot: rememberSnapshot(snapshot), counts, nextCursor };
}

function buildVisibleEntrySnapshot(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy, opts: { contentHash?: boolean } = {}, attempt = 0): VisibleEntrySnapshot {
  const createdAtMs = Date.now();
  const codeGraph = (ctx.codeGraphAdapter ?? DEFAULT_CODEGRAPH_ADAPTER).discoverRepo(repo.canonicalRoot);
  const entryMetadataStats = { hits: 0, misses: 0 };
  const contentHash = opts.contentHash ?? true;
  const walked = walkVisibleEntries(repo, ignore, '.', entryMetadataStats, { contentHash, cacheMetadata: contentHash });
  const merged = mergeCodeGraphMetadata(repo, ignore, walked.entries, codeGraph);
  const manifestDigest = metadataDigest(walked.entries);
  ctx.testHooks?.afterSnapshotWalk?.({ repoRoot: repo.canonicalRoot, kind: 'complete', attempt });
  const validation = validateSnapshotRevision(repo, ignore, manifestDigest);
  if (validation.stale && attempt + 1 < MAX_SNAPSHOT_BUILD_ATTEMPTS) {
    return buildVisibleEntrySnapshot(ctx, repo, ignore, opts, attempt + 1);
  }
  const id = `snap_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${codeGraph.indexRevision}\0${manifestDigest}`).slice(0, 16)}`;
  const cacheKey = contentHash
    ? `cache_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${id}`).slice(0, 16)}`
    : `cache_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${id}\0metadata-only`).slice(0, 16)}`;
  const state = snapshotState(codeGraph, merged.laggingPaths.length, validation.stale);
  const expiresAtMs = createdAtMs + SNAPSHOT_TTL_MS;
  const snapshot: VisibleEntrySnapshot = {
    id,
    repoId: repo.repoId,
    repoRoot: repo.canonicalRoot,
    coverage: 'complete',
    content: contentHash ? 'exact' : 'metadata',
    state,
    createdAtMs,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlMs: SNAPSHOT_TTL_MS,
    cacheKey,
    cacheHit: false,
    cacheSize: SNAPSHOT_CACHE.size,
    entries: walked.entries,
    entriesByPath: merged.entriesByPath,
    manifestDigest,
    partial: walked.partial || validation.partial || validation.stale,
    walkerErrors: walked.walkerErrors + validation.walkerErrors + (validation.stale ? 1 : 0),
    entryMetadataCacheHits: entryMetadataStats.hits,
    entryMetadataCacheMisses: entryMetadataStats.misses,
    codeGraph,
    codeGraphFilteredPaths: merged.filteredPaths,
    codeGraphLaggingPaths: merged.laggingPaths,
  };
  return rememberSnapshot(snapshot);
}

function rememberSnapshot(snapshot: VisibleEntrySnapshot): VisibleEntrySnapshot {
  if (snapshot.state === 'stale') {
    return {
      ...snapshot,
      cacheSize: SNAPSHOT_CACHE.size,
    };
  }
  const now = Date.now();
  for (const [key, cached] of SNAPSHOT_CACHE) {
    if (Date.parse(cached.expiresAt) <= now) SNAPSHOT_CACHE.delete(key);
  }

  const cached = SNAPSHOT_CACHE.get(snapshot.cacheKey);
  if (cached && cached.id === snapshot.id && Date.parse(cached.expiresAt) > now) {
    const cacheHit = {
      ...cached,
      cacheHit: true,
      cacheSize: SNAPSHOT_CACHE.size,
      entryMetadataCacheHits: snapshot.entryMetadataCacheHits,
      entryMetadataCacheMisses: snapshot.entryMetadataCacheMisses,
    };
    SNAPSHOT_CACHE.set(snapshot.cacheKey, cacheHit);
    return cacheHit;
  }

  SNAPSHOT_CACHE.set(snapshot.cacheKey, snapshot);
  while (SNAPSHOT_CACHE.size > MAX_SNAPSHOT_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestCreatedAt = Number.POSITIVE_INFINITY;
    for (const [key, cachedSnapshot] of SNAPSHOT_CACHE) {
      if (cachedSnapshot.createdAtMs < oldestCreatedAt) {
        oldestCreatedAt = cachedSnapshot.createdAtMs;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    SNAPSHOT_CACHE.delete(oldestKey);
  }

  return {
    ...snapshot,
    cacheSize: SNAPSHOT_CACHE.size,
  };
}

function snapshotCoversPaths(snapshot: VisibleEntrySnapshot, paths?: string[], opts: { requireHashes?: boolean } = {}): boolean {
  if (!paths || paths.length === 0) return snapshot.coverage === 'complete' && (!opts.requireHashes || snapshot.content === 'exact');
  if (snapshot.coverage !== 'complete' && paths.some((path) => !snapshot.entriesByPath.has(path))) return false;
  if (snapshot.coverage === 'complete' && paths.some((path) => !snapshot.entriesByPath.has(path))) return false;
  if (opts.requireHashes && paths.some((path) => typeof snapshot.entriesByPath.get(path)?.sha256 !== 'string')) return false;
  return true;
}

function cachedSnapshotById(repo: RepoRecord, snapshotId: unknown, paths?: string[], opts: { requireHashes?: boolean } = {}): VisibleEntrySnapshot | null {
  const requested = typeof snapshotId === 'string' ? snapshotId.trim() : '';
  if (!requested) return null;
  const now = Date.now();
  for (const [key, cached] of SNAPSHOT_CACHE) {
    if (Date.parse(cached.expiresAt) <= now) {
      SNAPSHOT_CACHE.delete(key);
      continue;
    }
    if (cached.id === requested && cached.repoId === repo.repoId && cached.repoRoot === repo.canonicalRoot && snapshotCoversPaths(cached, paths, opts)) {
      const cacheHit = {
        ...cached,
        cacheHit: true,
        cacheSize: SNAPSHOT_CACHE.size,
      };
      SNAPSHOT_CACHE.set(key, cacheHit);
      return cacheHit;
    }
  }
  return null;
}

function assertSnapshotFresh(args: Record<string, unknown>, snapshot: VisibleEntrySnapshot): void {
  if (snapshot.state === 'stale') {
    throw staleSnapshotError(snapshot);
  }
  const requested = typeof args.snapshot_id === 'string' ? args.snapshot_id.trim() : '';
  if (requested && requested !== snapshot.id) {
    throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'requested snapshot_id does not match current repo snapshot', {
      requested_snapshot_id: requested,
      current_snapshot_id: snapshot.id,
    }, true);
  }
}

function codeGraphSummary(snapshot: VisibleEntrySnapshot): Record<string, unknown> {
  return {
    integrated: snapshot.codeGraph.integrated,
    available: snapshot.codeGraph.available,
    source: snapshot.codeGraph.source,
    index_revision: snapshot.codeGraph.indexRevision,
    latency_ms: snapshot.codeGraph.latencyMs,
    indexed_files: snapshot.codeGraph.files.length,
    filtered_paths: snapshot.codeGraphFilteredPaths,
    index_lagging: snapshot.codeGraphLaggingPaths.length > 0,
    lagging_path_count: snapshot.codeGraphLaggingPaths.length,
    lagging_paths: snapshot.codeGraphLaggingPaths.slice(0, MAX_LAGGING_PATHS_RETURNED),
    error: snapshot.codeGraph.error,
  };
}

function pageEntries<T>(entries: T[], cursor: unknown, pageSize: unknown): { page: T[]; nextCursor: string | null } {
  const offset = numberArg(cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  const size = numberArg(pageSize, DEFAULT_PAGE_SIZE, 1, HARD_PAGE_SIZE);
  const page = entries.slice(offset, offset + size);
  const next = offset + page.length < entries.length ? String(offset + page.length) : null;
  return { page, nextCursor: next };
}

function lineRange(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const start = Number(value[0]);
  const end = Number(value[1]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  return [start, Math.min(end, start + MAX_READ_LINES - 1)];
}

function byteRange(value: unknown, maxLength: number): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const start = Number(value[0]);
  const length = Number(value[1]);
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length < 1) return null;
  return [start, Math.min(length, maxLength)];
}

function assertSnapshotEntryCurrent(snapshot: VisibleEntrySnapshot, path: string, actualHash: string): void {
  const snapshotEntry = snapshot.entriesByPath.get(path);
  if (!snapshotEntry || snapshotEntry.sha256 !== actualHash) {
    throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'requested snapshot_id does not match current file revision', {
      requested_snapshot_id: snapshot.id,
      path,
    }, true);
  }
}

function writeContentBuffer(args: Record<string, unknown>): { raw: Buffer; encoding: 'utf-8' | 'base64' } {
  if (typeof args.content !== 'string') {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'content must be a string');
  }
  const encoding = args.encoding === 'base64' ? 'base64' : args.encoding === undefined || args.encoding === 'utf-8' ? 'utf-8' : null;
  if (!encoding) throw new GeneralRepoAccessError('INVALID_RANGE', 'encoding must be utf-8 or base64');
  return { raw: Buffer.from(args.content, encoding), encoding };
}

function fsyncDirectoryBestEffort(path: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    fsyncSync(fd);
  } catch (_error) {
    // Some filesystems/platforms do not allow directory fsync; the same-directory rename remains atomic.
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch (_error) {
        // Ignore close failures on best-effort directory fsync.
      }
    }
  }
}

function atomicWriteFile(target: ResolvedRepoWritePath, raw: Buffer, mode: number): void {
  const tempPath = resolve(target.parentCanonicalPath, `.${leafName(target.relativePath)}.repo-harness-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}.tmp`);
  if (!isPathInside(target.parentCanonicalPath, tempPath)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'temporary write path escapes parent directory', { path: target.relativePath });
  }
  const fd = openSync(tempPath, 'wx', mode);
  let renamed = false;
  try {
    try {
      writeSync(fd, raw, 0, raw.length, 0);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tempPath, target.canonicalPath);
    renamed = true;
    fsyncDirectoryBestEffort(target.parentCanonicalPath);
  } finally {
    if (!renamed) rmSync(tempPath, { force: true });
  }
}

function invalidateRepoCaches(repo: RepoRecord): void {
  for (const [key, snapshot] of SNAPSHOT_CACHE) {
    if (snapshot.repoId === repo.repoId && snapshot.repoRoot === repo.canonicalRoot) SNAPSHOT_CACHE.delete(key);
  }
  ENTRY_METADATA_CACHE.clear();
}

function mutationIndexState(snapshot: VisibleEntrySnapshot): 'pending' | 'failed' {
  return snapshot.codeGraph.available ? 'pending' : 'failed';
}

function refreshedIndexState(snapshot: VisibleEntrySnapshot): 'ready' | 'index_lagging' | 'failed' {
  if (!snapshot.codeGraph.available) return 'failed';
  return snapshot.codeGraphLaggingPaths.length > 0 ? 'index_lagging' : 'ready';
}

function indexRefreshError(refresh: CodeGraphRefreshResult): GeneralRepoAccessError {
  const error = refresh.error;
  return new GeneralRepoAccessError(error?.code ?? 'INDEX_UNAVAILABLE', error?.message ?? 'CodeGraph refresh failed', {
    strategy: refresh.strategy,
    requested_paths: refresh.requestedPaths,
    path_refresh_supported: refresh.pathRefreshSupported,
    index_revision: refresh.indexRevision,
  }, error?.retryable ?? true);
}

function readFilePayload(repo: RepoRecord, ignore: IgnorePolicy, snapshot: VisibleEntrySnapshot, args: Record<string, unknown>, maxBytes = HARD_READ_BYTES, tool = 'read_file', verifySnapshotEntry = false): Record<string, unknown> {
  if (args.line_range !== undefined && args.byte_range !== undefined) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'line_range and byte_range are mutually exclusive');
  }
  let cursorByteStart: number | null = null;
  const cursor = typeof args.cursor === 'string' ? args.cursor.trim() : '';
  if (cursor && args.line_range === undefined && args.byte_range === undefined) {
    const match = /^(byte|line):([0-9]+)$/.exec(cursor);
    if (!match) throw new GeneralRepoAccessError('INVALID_RANGE', 'cursor must use byte:<offset> or line:<line>');
    const offset = Number(match[2]);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new GeneralRepoAccessError('INVALID_RANGE', 'cursor offset is invalid');
    if (match[1] === 'byte') cursorByteStart = offset;
    if (match[1] === 'line') args = { ...args, line_range: [Math.max(1, offset), Math.max(1, offset) + MAX_READ_LINES - 1] };
  }
  const target = resolveRepoPath(repo, args.path, ignore, { requireFile: true });
  const snapshotEntry = snapshot.entriesByPath.get(target.relativePath);
  const indexed = snapshotEntry?.indexed ?? false;
  const fields = commonFields(repo, ignore, snapshot, { tool, paths: [target.relativePath] });
  const raw = readStableResolvedFile(target, ignore);
  const fullHash = sha256(raw);
  if (verifySnapshotEntry) assertSnapshotEntryCurrent(snapshot, target.relativePath, fullHash);
  const binary = raw.subarray(0, BINARY_PROBE_BYTES).includes(0);

  if (args.byte_range !== undefined || cursorByteStart !== null) {
    const range = cursorByteStart !== null ? [cursorByteStart, maxBytes] as [number, number] : byteRange(args.byte_range, maxBytes);
    if (!range) throw new GeneralRepoAccessError('INVALID_RANGE', 'byte_range must be [start, length]');
    const [start, length] = range;
    const chunk = raw.subarray(start, start + length);
    return {
      ...fields,
      path: target.relativePath,
      sha256: fullHash,
      indexed,
      backend: indexed ? 'codegraph-indexed-filesystem-read' : 'filesystem-fallback',
      encoding: 'base64',
      content: chunk.toString('base64'),
      bytes_returned: chunk.length,
      has_more: start + chunk.length < raw.length,
      next_cursor: start + chunk.length < raw.length ? `byte:${start + chunk.length}` : null,
      binary,
    };
  }

  if (binary) {
    throw new GeneralRepoAccessError('BINARY_CONTENT', 'binary content requires byte_range', { path: target.relativePath });
  }

  const text = raw.toString('utf-8');
  if (args.line_range !== undefined) {
    const range = lineRange(args.line_range);
    if (!range) throw new GeneralRepoAccessError('INVALID_RANGE', 'line_range must be [start_line, end_line]');
    const [start, end] = range;
    const lines = text.split(/\r?\n/);
    const selected = lines.slice(start - 1, end).join('\n');
    const bytes = Buffer.byteLength(selected, 'utf-8');
    if (bytes > maxBytes) {
      throw new GeneralRepoAccessError('PAYLOAD_LIMIT_REACHED', 'line_range exceeds response byte budget', { max_bytes: maxBytes });
    }
    return {
      ...fields,
      path: target.relativePath,
      sha256: fullHash,
      indexed,
      backend: indexed ? 'codegraph-indexed-filesystem-read' : 'filesystem-fallback',
      encoding: 'utf-8',
      content: selected,
      start_line: start,
      end_line: Math.min(end, lines.length),
      bytes_returned: bytes,
      has_more: end < lines.length,
      next_cursor: end < lines.length ? `line:${end + 1}` : null,
      binary: false,
    };
  }

  const bytes = raw.subarray(0, maxBytes);
  const content = bytes.toString('utf-8');
  return {
    ...fields,
    path: target.relativePath,
    sha256: fullHash,
    indexed,
    backend: indexed ? 'codegraph-indexed-filesystem-read' : 'filesystem-fallback',
    encoding: 'utf-8',
    content,
    bytes_returned: Buffer.byteLength(content, 'utf-8'),
    has_more: bytes.length < raw.length,
    next_cursor: bytes.length < raw.length ? `byte:${bytes.length}` : null,
    binary: false,
  };
}

function getRepoCapabilities(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  assertSnapshotFresh(args, snapshot);
  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'get_repo_capabilities' }),
    access_mode: repo.accessMode,
    writable: repo.accessMode === 'read_write',
    display_name: repo.displayName,
    registry_revision: repo.registryRevision,
    source: repo.source,
    read_tools: GENERAL_REPO_TOOLS.filter((tool) => tool !== 'get_repo_capabilities' && !WRITE_TOOLS.has(tool)),
    write_tools: repo.accessMode === 'read_write' ? [...WRITE_TOOLS] : [],
    codegraph: {
      primary_backend: true,
      ...codeGraphSummary(snapshot),
      note: snapshot.codeGraph.available
        ? 'CodeGraph inventory is merged as indexed metadata; secure filesystem walking remains the manifest source of truth.'
        : 'CodeGraph is unavailable for this repo; authorized filesystem fallback remains active.',
    },
    limits: {
      max_page_size: HARD_PAGE_SIZE,
      max_read_bytes: HARD_READ_BYTES,
      max_read_lines: MAX_READ_LINES,
    },
  });
}

function writeFileTool(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  assertRepoWriteEnabled(repo);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const target = resolveRepoWritePath(repo, args.path, ignore);
  const { raw, encoding } = writeContentBuffer(args);
  const expectedHash = typeof args.expected_sha256 === 'string' ? args.expected_sha256.trim() : '';
  const mustNotExist = booleanArg(args.must_not_exist, false);
  const existed = target.existing !== undefined;

  let beforeHash: string | null = null;
  let beforeSize = 0;
  let mode = 0o666;
  if (target.existing) {
    if (mustNotExist) {
      throw new GeneralRepoAccessError('TARGET_EXISTS', 'target already exists', { path: target.relativePath });
    }
    const beforeRaw = readFileSync(target.existing.canonicalPath);
    beforeHash = sha256(beforeRaw);
    beforeSize = beforeRaw.length;
    mode = statSync(target.existing.canonicalPath).mode & 0o777;
    if (!expectedHash) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'expected_sha256 is required when replacing an existing file', {
        path: target.relativePath,
        actual_sha256: beforeHash,
      });
    }
    if (expectedHash !== beforeHash) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'file changed after it was read', {
        path: target.relativePath,
        expected_sha256: expectedHash,
        actual_sha256: beforeHash,
      });
    }
  } else if (!mustNotExist) {
    throw new GeneralRepoAccessError('REVISION_CONFLICT', 'must_not_exist: true is required when creating a new file', {
      path: target.relativePath,
    });
  }

  atomicWriteFile(target, raw, mode);
  invalidateRepoCaches(repo);

  const after = resolveRepoPath(repo, target.relativePath, ignore, { requireFile: true });
  const afterRaw = readFileSync(after.canonicalPath);
  const afterHash = sha256(afterRaw);
  const afterEntry = metadataForResolved(after, ignore);
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const indexedEntry = snapshot.entriesByPath.get(target.relativePath);
  const indexState = mutationIndexState(snapshot);
  const mutationId = `mut_${sha256(`${repo.repoId}\0${target.relativePath}\0${beforeHash ?? 'new'}\0${afterHash}\0${Date.now()}`).slice(0, 16)}`;
  const invalidationId = `idxinv_${sha256(`${mutationId}\0${snapshot.codeGraph.indexRevision}\0${target.relativePath}`).slice(0, 16)}`;

  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'write_file', paths: [target.relativePath] }),
    path: target.relativePath,
    operation: existed ? 'replace' : 'create',
    mutation_id: mutationId,
    encoding,
    before: {
      existed,
      sha256: beforeHash,
      size: beforeSize,
    },
    after: {
      ...afterEntry,
      indexed: indexedEntry?.indexed ?? false,
      codegraph_language: indexedEntry?.codegraph_language,
      codegraph_node_count: indexedEntry?.codegraph_node_count,
      codegraph_size: indexedEntry?.codegraph_size,
      codegraph_index_lagging: indexedEntry?.codegraph_index_lagging,
    },
    diff: {
      format: 'summary',
      bytes_before: beforeSize,
      bytes_after: afterRaw.length,
      bytes_delta: afterRaw.length - beforeSize,
      before_sha256: beforeHash,
      after_sha256: afterHash,
    },
    index_state: indexState,
    index: {
      state: indexState,
      action: snapshot.codeGraph.available ? 'refresh_repo_index_required' : 'codegraph_unavailable',
      changed_paths: [target.relativePath],
      mutation_id: mutationId,
      invalidation_id: invalidationId,
      refresh_tool: 'refresh_repo_index',
      before_index_revision: snapshot.codeGraph.indexRevision,
    },
    codegraph: codeGraphSummary(snapshot),
  });
}

function refreshRepoIndex(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  assertRepoWriteEnabled(repo);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const paths = refreshPathsArg(repo, ignore, args.paths);
  const refreshScope = paths.length > 0 ? paths : ['.'];
  const before = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const adapter = ctx.codeGraphAdapter ?? DEFAULT_CODEGRAPH_ADAPTER;
  if (!adapter.refreshRepo) {
    throw new GeneralRepoAccessError('INDEX_UNAVAILABLE', 'CodeGraph adapter does not support explicit refresh', {
      paths: refreshScope,
    }, true);
  }

  const refresh = adapter.refreshRepo(repo.canonicalRoot, { paths });
  invalidateRepoCaches(repo);
  if (!refresh.available || !refresh.refreshed) {
    throw indexRefreshError(refresh);
  }
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const indexState = refreshedIndexState(snapshot);

  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'refresh_repo_index', paths: refreshScope }),
    paths: refreshScope,
    refreshed: true,
    index_state: indexState,
    refresh: {
      strategy: refresh.strategy,
      requested_paths: refresh.requestedPaths,
      path_refresh_supported: refresh.pathRefreshSupported,
      latency_ms: refresh.latencyMs,
      before_index_revision: before.codeGraph.indexRevision,
      adapter_index_revision: refresh.indexRevision,
      after_index_revision: snapshot.codeGraph.indexRevision,
      indexed_files: refresh.files,
    },
    index: {
      state: indexState,
      action: indexState === 'ready' ? 'refresh_complete' : 'refresh_complete_with_lag',
      refreshed_paths: refreshScope,
      before_index_revision: before.codeGraph.indexRevision,
      after_index_revision: snapshot.codeGraph.indexRevision,
    },
    codegraph: codeGraphSummary(snapshot),
  });
}

function repoManifest(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const streamed = buildManifestPageSnapshot(ctx, repo, ignore, args);
  const snapshot = streamed.snapshot;
  assertSnapshotFresh(args, snapshot);
  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'repo_manifest', paths: ['.'] }),
    entries: snapshot.entries,
    next_cursor: streamed.nextCursor,
    complete: !snapshot.partial,
    page_complete: streamed.nextCursor === null,
    manifest_streaming: true,
    snapshot_coverage: snapshot.coverage,
    counts: streamed.counts,
    manifest_digest: snapshot.manifestDigest,
    walker_errors: snapshot.walkerErrors,
    codegraph: codeGraphSummary(snapshot),
  });
}

function listTree(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const root = resolveRepoPath(repo, args.path ?? '.', ignore, { allowRoot: true, requireDirectory: true });
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  assertSnapshotFresh(args, snapshot);
  const depth = numberArg(args.depth, 1, 0, 6);
  const entries = snapshot.entries
    .filter((entry) => entry.path !== root.relativePath)
    .filter((entry) => {
      const relation = root.relativePath === '.'
        ? entry.path
        : entry.path.startsWith(`${root.relativePath}/`) ? entry.path.slice(root.relativePath.length + 1) : '';
      if (!relation) return false;
      return relation.split('/').length <= depth + 1;
    });
  const paged = pageEntries(entries, args.cursor, (args.page_size ?? DEFAULT_PAGE_SIZE));
  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'list_tree', paths: [root.relativePath] }),
    path: root.relativePath,
    entries: paged.page,
    next_cursor: paged.nextCursor,
    codegraph: codeGraphSummary(snapshot),
  });
}

function statFile(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const resolved = resolveRepoPath(repo, args.path, ignore);
  const cachedSnapshot = cachedSnapshotById(repo, args.snapshot_id, [resolved.relativePath], { requireHashes: true });
  if (cachedSnapshot) {
    const current = metadataForResolved(resolved, ignore);
    const cachedEntry = cachedSnapshot.entriesByPath.get(resolved.relativePath);
    if (!cachedEntry || cachedEntry.sha256 !== current.sha256) {
      throw new GeneralRepoAccessError('SNAPSHOT_STALE', 'requested snapshot_id does not match current file revision', {
        requested_snapshot_id: cachedSnapshot.id,
        path: resolved.relativePath,
      }, true);
    }
    const entry = {
      ...current,
      indexed: cachedEntry.indexed,
      codegraph_language: cachedEntry.codegraph_language,
      codegraph_node_count: cachedEntry.codegraph_node_count,
      codegraph_size: cachedEntry.codegraph_size,
      codegraph_index_lagging: cachedEntry.codegraph_index_lagging,
    };
    return textResult({
      ...commonFields(repo, ignore, cachedSnapshot, { tool: 'stat_file', paths: [resolved.relativePath] }),
      ...entry,
      codegraph: codeGraphSummary(cachedSnapshot),
    });
  }
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore);
  assertSnapshotFresh(args, snapshot);
  const entry = snapshot.entriesByPath.get(resolved.relativePath) ?? metadataForResolved(resolved, ignore);
  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'stat_file', paths: [resolved.relativePath] }),
    ...entry,
    codegraph: codeGraphSummary(snapshot),
  });
}

function readFileTool(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const requestedPath = typeof args.snapshot_id === 'string' && args.snapshot_id.trim()
    ? [resolveRepoPath(repo, args.path, ignore, { requireFile: true }).relativePath]
    : undefined;
  const cachedSnapshot = cachedSnapshotById(repo, args.snapshot_id, requestedPath, { requireHashes: true });
  if (cachedSnapshot) {
    return textResult({
      ...readFilePayload(repo, ignore, cachedSnapshot, args, HARD_READ_BYTES, 'read_file', true),
      codegraph: codeGraphSummary(cachedSnapshot),
    });
  }
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  assertSnapshotFresh(args, snapshot);
  return textResult({
    ...readFilePayload(repo, ignore, snapshot, args),
    codegraph: codeGraphSummary(snapshot),
  });
}

function readFiles(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const cachedSnapshot = cachedSnapshotById(repo, args.snapshot_id, undefined, { requireHashes: true });
  const snapshot = cachedSnapshot ?? buildVisibleEntrySnapshot(ctx, repo, ignore);
  if (!cachedSnapshot) assertSnapshotFresh(args, snapshot);
  const requests = Array.isArray(args.requests) ? args.requests : [];
  const byteBudget = numberArg(args.byte_budget, HARD_READ_BYTES, 1, HARD_READ_BYTES);
  let remaining = byteBudget;
  const results: unknown[] = [];
  let partial = false;

  for (const request of requests) {
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      results.push({ error: { code: 'INVALID_RELATIVE_PATH', message: 'request must be an object', retryable: false } });
      partial = true;
      continue;
    }
    if (remaining <= 0) {
      results.push({ path: (request as { path?: unknown }).path, error: { code: 'PAYLOAD_LIMIT_REACHED', message: 'byte budget exhausted', retryable: true } });
      partial = true;
      continue;
    }
    try {
      const payload = readFilePayload(repo, ignore, snapshot, request as Record<string, unknown>, remaining, 'read_files', Boolean(cachedSnapshot));
      remaining -= Number(payload.bytes_returned ?? 0);
      results.push(payload);
    } catch (error) {
      partial = true;
      if (error instanceof GeneralRepoAccessError) {
        results.push({ path: (request as { path?: unknown }).path, error: { code: error.code, message: error.message, retryable: error.retryable, details: error.details } });
      } else {
        results.push({ path: (request as { path?: unknown }).path, error: { code: 'INTERNAL_ADAPTER_ERROR', message: error instanceof Error ? error.message : String(error), retryable: false } });
      }
    }
  }

  return textResult({
    ...commonFields(repo, ignore, snapshot, {
      tool: 'read_files',
      paths: requests
        .map((request) => (typeof request === 'object' && request !== null && !Array.isArray(request) ? String((request as { path?: unknown }).path ?? '') : ''))
        .filter((path) => path.length > 0),
    }),
    partial: partial || snapshot.partial,
    results,
    bytes_remaining: remaining,
    codegraph: codeGraphSummary(snapshot),
  });
}

function searchText(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const query = String(args.query ?? '');
  if (!query) return errorResult('INVALID_RANGE', 'query is required');
  const mode = args.mode === 'regex' ? 'regex' : 'literal';
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  assertSnapshotFresh(args, snapshot);
  const requestedPaths = Array.isArray(args.paths) && args.paths.length > 0 ? args.paths : ['.'];
  const candidates: ManifestEntry[] = [];
  for (const path of requestedPaths) {
    const resolved = resolveRepoPath(repo, path, ignore, { allowRoot: true });
    if (resolved.type === 'directory') {
      candidates.push(...snapshot.entries.filter((entry) => (
        resolved.relativePath === '.'
          ? true
          : entry.path === resolved.relativePath || entry.path.startsWith(`${resolved.relativePath}/`)
      )));
    } else {
      candidates.push(snapshot.entriesByPath.get(resolved.relativePath) ?? metadataForResolved(resolved, ignore));
    }
  }
  const seen = new Set<string>();
  let regex: RegExp | null = null;
  if (mode === 'regex') {
    try {
      regex = new RegExp(query);
    } catch (_error) {
      throw new GeneralRepoAccessError('INVALID_RANGE', 'query is not a valid regular expression');
    }
  }
  const needle = query.toLowerCase();
  const matches: Record<string, unknown>[] = [];
  const maxResults = numberArg(args.max_results, DEFAULT_SEARCH_RESULTS, 1, HARD_SEARCH_RESULTS);
  const offset = numberArg(args.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  let seenMatches = 0;

  for (const entry of candidates.sort((a, b) => a.path.localeCompare(b.path))) {
    if (matches.length >= maxResults + 1) break;
    if (entry.type !== 'file' || !entry.readable || seen.has(entry.path) || entry.binary || (entry.size ?? 0) > SEARCH_FILE_SCAN_BYTES) continue;
    seen.add(entry.path);
    const resolved = resolveRepoPath(repo, entry.path, ignore, { requireFile: true });
    const raw = readStableResolvedFile(resolved, ignore);
    const text = raw.toString('utf-8');
    const fileHash = entry.sha256 ?? sha256(raw);
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const column = regex ? line.search(regex) : line.toLowerCase().indexOf(needle);
      if (column < 0) continue;
      if (seenMatches < offset) {
        seenMatches += 1;
        continue;
      }
      matches.push({
        path: entry.path,
        line: index + 1,
        column: column + 1,
        snippet: line.slice(Math.max(0, column - 60), column + 120),
        sha256: fileHash,
        indexed: entry.indexed,
        backend: entry.indexed ? 'codegraph-indexed-filesystem-search' : 'filesystem-fallback',
      });
      seenMatches += 1;
      if (matches.length >= maxResults + 1) break;
    }
  }
  const returned = matches.slice(0, maxResults);
  const nextCursor = matches.length > maxResults ? String(offset + maxResults) : null;

  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'search_text', paths: requestedPaths.map((path) => String(path)) }),
    query,
    mode,
    matches: returned,
    truncated: nextCursor !== null,
    next_cursor: nextCursor,
    backend: snapshot.codeGraph.available ? 'codegraph-metadata+filesystem-fallback' : 'filesystem-fallback',
    codegraph: codeGraphSummary(snapshot),
  });
}

export function listGeneralRepoRecords(ctx: GeneralRepoToolContext): Array<{ repo_id: string; display_name: string; readable: boolean; access_mode: RepoHarnessAccessMode; source: RepoRecord['source'] }> {
  return uniqueRepoRecords(ctx).map((repo) => ({
    repo_id: repo.repoId,
    display_name: repo.displayName,
    readable: true,
    access_mode: repo.accessMode,
    source: repo.source,
  }));
}

export function isGeneralRepoTool(name: string): name is GeneralRepoToolName {
  return (GENERAL_REPO_TOOLS as readonly string[]).includes(name);
}

export function hasGeneralRepoArgs(args: Record<string, unknown>): boolean {
  return typeof args.repo_id === 'string' && args.repo_id.trim().length > 0;
}

export function buildGeneralRepoToolDefinitions(): GeneralRepoToolDefinition[] {
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const writeTool = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
  const repoSchema = {
    type: 'object',
    properties: { repo_id: { type: 'string' } },
    required: ['repo_id'],
    additionalProperties: false,
  };
  return [
    { name: 'get_repo_capabilities', description: 'Return read/write mode, index capabilities, and limits for a registered repo.', inputSchema: repoSchema, annotations: readOnly },
    {
      name: 'repo_manifest',
      description: 'Return the complete non-.ignore repo inventory with indexed/readable metadata.',
      inputSchema: {
        type: 'object',
        properties: { repo_id: { type: 'string' }, snapshot_id: { type: 'string' }, cursor: { type: 'string' }, page_size: { type: 'number' } },
        required: ['repo_id'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'list_tree',
      description: 'List non-.ignore children under a repo-relative directory with stable pagination.',
      inputSchema: {
        type: 'object',
        properties: { repo_id: { type: 'string' }, path: { type: 'string', default: '.' }, depth: { type: 'number' }, cursor: { type: 'string' }, page_size: { type: 'number' }, snapshot_id: { type: 'string' } },
        required: ['repo_id'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'search_text',
      description: 'Search allowed repo text using CodeGraph first and policy-consistent fallback when needed.',
      inputSchema: {
        type: 'object',
        properties: { repo_id: { type: 'string' }, query: { type: 'string' }, mode: { enum: ['literal', 'regex'] }, paths: { type: 'array', items: { type: 'string' } }, cursor: { type: 'string' }, snapshot_id: { type: 'string' }, max_results: { type: 'number' } },
        required: ['repo_id', 'query'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'read_file',
      description: 'Read one allowed file by line or byte range with hash and continuation metadata.',
      inputSchema: {
        type: 'object',
        properties: { repo_id: { type: 'string' }, path: { type: 'string' }, line_range: { type: 'array' }, byte_range: { type: 'array' }, snapshot_id: { type: 'string' }, cursor: { type: 'string' } },
        required: ['repo_id', 'path'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'read_files',
      description: 'Read a bounded batch of allowed files with per-item success or failure.',
      inputSchema: {
        type: 'object',
        properties: { repo_id: { type: 'string' }, requests: { type: 'array' }, snapshot_id: { type: 'string' }, byte_budget: { type: 'number' } },
        required: ['repo_id', 'requests'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'stat_file',
      description: 'Return metadata for one allowed file, directory, or symlink.',
      inputSchema: {
        type: 'object',
        properties: { repo_id: { type: 'string' }, path: { type: 'string' }, snapshot_id: { type: 'string' } },
        required: ['repo_id', 'path'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'write_file',
      description: 'Create or replace one repo-relative file in a read_write repo using revision preconditions and atomic same-directory rename.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_id: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
          encoding: { enum: ['utf-8', 'base64'] },
          expected_sha256: { type: 'string' },
          must_not_exist: { type: 'boolean' },
        },
        required: ['repo_id', 'path', 'content'],
        additionalProperties: false,
      },
      annotations: writeTool,
    },
    {
      name: 'refresh_repo_index',
      description: 'Synchronize CodeGraph for a read_write repo after mutations and return the new index/snapshot state.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_id: { type: 'string' },
          paths: { type: 'array', items: { type: 'string' } },
        },
        required: ['repo_id'],
        additionalProperties: false,
      },
      annotations: writeTool,
    },
  ];
}

export async function callGeneralRepoTool(ctx: GeneralRepoToolContext, name: string, args: Record<string, unknown> = {}): Promise<GeneralRepoToolResult> {
  try {
    let result: GeneralRepoToolResult;
    switch (name) {
      case 'get_repo_capabilities':
        result = getRepoCapabilities(ctx, args);
        break;
      case 'repo_manifest':
        result = repoManifest(ctx, args);
        break;
      case 'list_tree':
        result = listTree(ctx, args);
        break;
      case 'search_text':
        result = searchText(ctx, args);
        break;
      case 'read_file':
        result = readFileTool(ctx, args);
        break;
      case 'read_files':
        result = readFiles(ctx, args);
        break;
      case 'stat_file':
        result = statFile(ctx, args);
        break;
      case 'write_file':
        result = writeFileTool(ctx, args);
        break;
      case 'refresh_repo_index':
        result = refreshRepoIndex(ctx, args);
        break;
      default:
        return errorResult('INTERNAL_ADAPTER_ERROR', `tool is not a general repo reader tool: ${name}`);
    }
    audit(ctx, name, 'ok', args, typeof args.path === 'string' ? args.path : undefined);
    return result;
  } catch (error) {
    if (error instanceof GeneralRepoAccessError) {
      audit(ctx, name, 'blocked', args, typeof args.path === 'string' ? args.path : undefined, error.message);
      return errorResult(error.code, error.message, error.details, error.retryable);
    }
    audit(ctx, name, 'failed', args, typeof args.path === 'string' ? args.path : undefined, error instanceof Error ? error.message : String(error));
    return errorResult('INTERNAL_ADAPTER_ERROR', error instanceof Error ? error.message : String(error));
  }
}
