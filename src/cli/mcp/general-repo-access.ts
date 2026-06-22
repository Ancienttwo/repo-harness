import { createHash } from 'crypto';
import { closeSync, constants, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from 'fs';
import { basename, isAbsolute, relative, resolve, sep } from 'path';
import { readRegisteredRepoHarnessRepos, repoHarnessRepoIdFor, type RepoHarnessAccessMode } from '../../effects/repo-registry';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { createCodeGraphCliAdapter, type CodeGraphRepoSnapshot, type GeneralRepoCodeGraphAdapter } from './codegraph-adapter';
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
}

export interface GeneralRepoToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

type RepoEntryType = 'file' | 'directory' | 'symlink' | 'other';
type SymlinkTargetKind = 'internal' | 'external' | 'none';
type SnapshotState = 'ready' | 'index_lagging' | 'failed';

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
  symlinkTargetKind: SymlinkTargetKind;
  readable: boolean;
}

interface ManifestEntry {
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

interface VisibleEntrySnapshot {
  id: string;
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
const DEFAULT_CODEGRAPH_ADAPTER = createCodeGraphCliAdapter();
const SNAPSHOT_CACHE = new Map<string, VisibleEntrySnapshot>();
const ENTRY_METADATA_CACHE = new Map<string, EntryMetadataCacheValue>();

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

function numberArg(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
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
  const text = readFileSync(ignorePath, 'utf-8');
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

function binaryProbe(path: string): boolean {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    const buffer = Buffer.alloc(BINARY_PROBE_BYTES);
    const bytesRead = readSync(fd, buffer, 0, BINARY_PROBE_BYTES, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    closeSync(fd);
  }
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
  const metadataSignature = [
    fileStat.size,
    fileStat.mtimeMs,
    fileStat.ctimeMs,
    fileStat.mode,
    fileStat.ino,
    type,
    readable ? 'readable' : 'metadata-only',
  ].join(':');
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
    metadataSignature,
    symlinkTargetKind,
    readable,
  };
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
    stale: false,
    partial: snapshot.partial,
    next_cursor: null,
  };
}

function entryMetadataCacheKey(resolved: ResolvedRepoPath, ignore: IgnorePolicy): string {
  return `entry_${sha256(`${resolved.repo.repoId}\0${resolved.repo.registryRevision}\0${ignore.digest}\0${resolved.relativePath}\0${resolved.metadataSignature}`).slice(0, 16)}`;
}

function rememberEntryMetadata(key: string, entry: ManifestEntry): void {
  ENTRY_METADATA_CACHE.set(key, { entry: { ...entry }, lastUsedAtMs: Date.now() });
  while (ENTRY_METADATA_CACHE.size > MAX_ENTRY_METADATA_CACHE_ENTRIES) {
    const oldestKey = ENTRY_METADATA_CACHE.keys().next().value;
    if (oldestKey === undefined) break;
    ENTRY_METADATA_CACHE.delete(oldestKey);
  }
}

function metadataForResolved(resolved: ResolvedRepoPath, ignore: IgnorePolicy, stats?: EntryMetadataCacheStats): ManifestEntry {
  const cacheKey = entryMetadataCacheKey(resolved, ignore);
  const cached = ENTRY_METADATA_CACHE.get(cacheKey);
  if (cached) {
    stats && (stats.hits += 1);
    ENTRY_METADATA_CACHE.delete(cacheKey);
    ENTRY_METADATA_CACHE.set(cacheKey, { entry: cached.entry, lastUsedAtMs: Date.now() });
    return { ...cached.entry };
  }
  stats && (stats.misses += 1);
  let binary = false;
  let fileHash: string | undefined;
  if (resolved.readable) {
    const stat = statSync(resolved.canonicalPath);
    if (stat.isFile()) {
      binary = binaryProbe(resolved.canonicalPath);
      fileHash = sha256(readFileSync(resolved.canonicalPath));
    }
  }
  const entry = {
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
  rememberEntryMetadata(cacheKey, entry);
  return { ...entry };
}

function walkVisibleEntries(repo: RepoRecord, ignore: IgnorePolicy, startRelative = '.', stats: EntryMetadataCacheStats = { hits: 0, misses: 0 }): { entries: ManifestEntry[]; partial: boolean; walkerErrors: number } {
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
          resolvedChild = resolveRepoPath(repo, childRelative, ignore, { allowExternalSymlinkMetadata: true });
          entries.push(metadataForResolved(resolvedChild, ignore, stats));
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

  if (start.relativePath !== '.') entries.push(metadataForResolved(start, ignore, stats));
  if (start.readable && statSync(start.canonicalPath).isDirectory()) visit(start.canonicalPath, start.relativePath);
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), partial: walkerErrors > 0, walkerErrors };
}

function isInternalRevisionPath(path: string): boolean {
  return path === '.ai/harness/mcp/audit.log' || path.startsWith('.ai/harness/mcp/');
}

function metadataDigest(entries: ManifestEntry[]): string {
  return `sha256:${sha256(JSON.stringify(entries.filter((entry) => !isInternalRevisionPath(entry.path)).map((entry) => [
    entry.path,
    entry.sha256 ?? '',
    entry.type,
    entry.indexed ? 'indexed' : 'unindexed',
  ])))}`;
}

function mergeCodeGraphMetadata(repo: RepoRecord, ignore: IgnorePolicy, entries: ManifestEntry[], codeGraph: CodeGraphRepoSnapshot): { entriesByPath: Map<string, ManifestEntry>; filteredPaths: number; laggingPaths: string[] } {
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
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
      const entry = entriesByPath.get(resolved.relativePath);
      if (!entry || resolved.type !== 'file') {
        filteredPaths += 1;
        continue;
      }
      entry.indexed = true;
      entry.codegraph_language = file.language;
      entry.codegraph_node_count = file.nodeCount;
      entry.codegraph_size = file.size;
      if (typeof file.size === 'number' && typeof entry.size === 'number' && file.size !== entry.size) {
        entry.codegraph_index_lagging = true;
        laggingPaths.add(resolved.relativePath);
      }
    } catch (error) {
      filteredPaths += 1;
      if (error instanceof GeneralRepoAccessError && error.code === 'NOT_FOUND' && relativePath) {
        laggingPaths.add(relativePath);
      }
    }
  }

  return { entriesByPath, filteredPaths, laggingPaths: [...laggingPaths].sort((a, b) => a.localeCompare(b)) };
}

function buildVisibleEntrySnapshot(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy): VisibleEntrySnapshot {
  const createdAtMs = Date.now();
  const codeGraph = (ctx.codeGraphAdapter ?? DEFAULT_CODEGRAPH_ADAPTER).discoverRepo(repo.canonicalRoot);
  const entryMetadataStats = { hits: 0, misses: 0 };
  const walked = walkVisibleEntries(repo, ignore, '.', entryMetadataStats);
  const merged = mergeCodeGraphMetadata(repo, ignore, walked.entries, codeGraph);
  const manifestDigest = metadataDigest(walked.entries);
  const id = `snap_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${codeGraph.indexRevision}\0${manifestDigest}`).slice(0, 16)}`;
  const cacheKey = `cache_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${id}`).slice(0, 16)}`;
  const state: SnapshotState = codeGraph.available && merged.laggingPaths.length > 0
    ? 'index_lagging'
    : 'ready';
  const expiresAtMs = createdAtMs + SNAPSHOT_TTL_MS;
  const snapshot: VisibleEntrySnapshot = {
    id,
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
    partial: walked.partial,
    walkerErrors: walked.walkerErrors,
    entryMetadataCacheHits: entryMetadataStats.hits,
    entryMetadataCacheMisses: entryMetadataStats.misses,
    codeGraph,
    codeGraphFilteredPaths: merged.filteredPaths,
    codeGraphLaggingPaths: merged.laggingPaths,
  };
  return rememberSnapshot(snapshot);
}

function rememberSnapshot(snapshot: VisibleEntrySnapshot): VisibleEntrySnapshot {
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

function assertSnapshotFresh(args: Record<string, unknown>, snapshot: VisibleEntrySnapshot): void {
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

function readFilePayload(repo: RepoRecord, ignore: IgnorePolicy, snapshot: VisibleEntrySnapshot, args: Record<string, unknown>, maxBytes = HARD_READ_BYTES, tool = 'read_file'): Record<string, unknown> {
  if (args.line_range !== undefined && args.byte_range !== undefined) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'line_range and byte_range are mutually exclusive');
  }
  const target = resolveRepoPath(repo, args.path, ignore, { requireFile: true });
  const snapshotEntry = snapshot.entriesByPath.get(target.relativePath);
  const indexed = snapshotEntry?.indexed ?? false;
  const fields = commonFields(repo, ignore, snapshot, { tool, paths: [target.relativePath] });
  const raw = readFileSync(target.canonicalPath);
  const fullHash = sha256(raw);
  const binary = raw.subarray(0, BINARY_PROBE_BYTES).includes(0);

  if (args.byte_range !== undefined) {
    const range = byteRange(args.byte_range, maxBytes);
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
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore);
  assertSnapshotFresh(args, snapshot);
  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'get_repo_capabilities' }),
    access_mode: repo.accessMode,
    writable: repo.accessMode === 'read_write',
    display_name: repo.displayName,
    registry_revision: repo.registryRevision,
    source: repo.source,
    read_tools: GENERAL_REPO_TOOLS.filter((tool) => tool !== 'get_repo_capabilities'),
    write_tools: repo.accessMode === 'read_write' ? [] : [],
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

function repoManifest(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore);
  assertSnapshotFresh(args, snapshot);
  const entries = snapshot.entries;
  const paged = pageEntries(entries, args.cursor, args.page_size);
  return textResult({
    ...commonFields(repo, ignore, snapshot, { tool: 'repo_manifest', paths: ['.'] }),
    entries: paged.page,
    next_cursor: paged.nextCursor,
    complete: !snapshot.partial,
    page_complete: paged.nextCursor === null,
    counts: {
      entries: entries.length,
      files: entries.filter((entry) => entry.type === 'file').length,
      directories: entries.filter((entry) => entry.type === 'directory').length,
      symlinks: entries.filter((entry) => entry.type === 'symlink').length,
      indexed: entries.filter((entry) => entry.indexed).length,
      unindexed: entries.filter((entry) => !entry.indexed).length,
      index_lagging: entries.filter((entry) => entry.codegraph_index_lagging).length,
      text: entries.filter((entry) => entry.type === 'file' && entry.binary === false).length,
      binary: entries.filter((entry) => entry.type === 'file' && entry.binary === true).length,
    },
    manifest_digest: snapshot.manifestDigest,
    walker_errors: snapshot.walkerErrors,
    codegraph: codeGraphSummary(snapshot),
  });
}

function listTree(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const root = resolveRepoPath(repo, args.path ?? '.', ignore, { allowRoot: true, requireDirectory: true });
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore);
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
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore);
  assertSnapshotFresh(args, snapshot);
  return textResult({
    ...readFilePayload(repo, ignore, snapshot, args),
    codegraph: codeGraphSummary(snapshot),
  });
}

function readFiles(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore);
  assertSnapshotFresh(args, snapshot);
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
      const payload = readFilePayload(repo, ignore, snapshot, request as Record<string, unknown>, remaining, 'read_files');
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
  const snapshot = buildVisibleEntrySnapshot(ctx, repo, ignore);
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
    const text = readFileSync(resolved.canonicalPath, 'utf-8');
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
        sha256: entry.sha256,
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
