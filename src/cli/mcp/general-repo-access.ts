import { createHash } from 'crypto';
import { closeSync, constants, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from 'fs';
import { basename, isAbsolute, relative, resolve, sep } from 'path';
import { readRegisteredRepoHarnessRepos, repoHarnessRepoIdFor, type RepoHarnessAccessMode } from '../../effects/repo-registry';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
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
}

export interface GeneralRepoToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

type RepoEntryType = 'file' | 'directory' | 'symlink' | 'other';
type SymlinkTargetKind = 'internal' | 'external' | 'none';

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
  readable: boolean;
  writable: boolean;
  symlink_target_kind: SymlinkTargetKind;
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
    symlinkTargetKind,
    readable,
  };
}

function commonFields(repo: RepoRecord, ignore: IgnorePolicy) {
  const rootStat = statSync(repo.canonicalRoot);
  const snapshotHash = sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${rootStat.mtimeMs}\0${rootStat.ctimeMs}`);
  return {
    repo_id: repo.repoId,
    snapshot_id: `snap_${snapshotHash.slice(0, 16)}`,
    index_revision: 0,
    ignore_digest: ignore.digest,
    stale: false,
    partial: false,
    next_cursor: null,
  };
}

function metadataForResolved(resolved: ResolvedRepoPath): ManifestEntry {
  let binary = false;
  let fileHash: string | undefined;
  if (resolved.readable) {
    const stat = statSync(resolved.canonicalPath);
    if (stat.isFile()) {
      binary = binaryProbe(resolved.canonicalPath);
      fileHash = sha256(readFileSync(resolved.canonicalPath));
    }
  }
  return {
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
}

function walkVisibleEntries(repo: RepoRecord, ignore: IgnorePolicy, startRelative = '.'): ManifestEntry[] {
  const start = resolveRepoPath(repo, startRelative, ignore, { allowRoot: true, allowExternalSymlinkMetadata: true });
  const entries: ManifestEntry[] = [];

  const visit = (absoluteDir: string, relativeDir: string): void => {
    const children = readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const childRelative = relativeDir === '.' ? child.name : `${relativeDir}/${child.name}`;
      const childAbsolute = resolve(absoluteDir, child.name);
      const ignored = isIgnored(ignore, childRelative);
      let resolvedChild: ResolvedRepoPath | null = null;
      if (!ignored) {
        try {
          resolvedChild = resolveRepoPath(repo, childRelative, ignore, { allowExternalSymlinkMetadata: true });
          entries.push(metadataForResolved(resolvedChild));
        } catch (_error) {
          // Ignore races and unreadable children at this layer; callers mark partial in later snapshot work.
        }
      }
      if (child.isDirectory()) {
        visit(childAbsolute, childRelative);
      } else if (resolvedChild?.type === 'directory') {
        visit(resolvedChild.canonicalPath, childRelative);
      }
    }
  };

  if (start.relativePath !== '.') entries.push(metadataForResolved(start));
  if (start.readable && statSync(start.canonicalPath).isDirectory()) visit(start.canonicalPath, start.relativePath);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
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

function readFilePayload(repo: RepoRecord, ignore: IgnorePolicy, args: Record<string, unknown>, maxBytes = HARD_READ_BYTES): Record<string, unknown> {
  if (args.line_range !== undefined && args.byte_range !== undefined) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'line_range and byte_range are mutually exclusive');
  }
  const target = resolveRepoPath(repo, args.path, ignore, { requireFile: true });
  const raw = readFileSync(target.canonicalPath);
  const fullHash = sha256(raw);
  const binary = raw.subarray(0, BINARY_PROBE_BYTES).includes(0);

  if (args.byte_range !== undefined) {
    const range = byteRange(args.byte_range, maxBytes);
    if (!range) throw new GeneralRepoAccessError('INVALID_RANGE', 'byte_range must be [start, length]');
    const [start, length] = range;
    const chunk = raw.subarray(start, start + length);
    return {
      ...commonFields(repo, ignore),
      path: target.relativePath,
      sha256: fullHash,
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
      ...commonFields(repo, ignore),
      path: target.relativePath,
      sha256: fullHash,
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
    ...commonFields(repo, ignore),
    path: target.relativePath,
    sha256: fullHash,
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
  return textResult({
    ...commonFields(repo, ignore),
    access_mode: repo.accessMode,
    writable: repo.accessMode === 'read_write',
    display_name: repo.displayName,
    registry_revision: repo.registryRevision,
    source: repo.source,
    read_tools: GENERAL_REPO_TOOLS.filter((tool) => tool !== 'get_repo_capabilities'),
    write_tools: repo.accessMode === 'read_write' ? [] : [],
    codegraph: {
      primary_backend: true,
      integrated: false,
      note: 'Sprint 1 uses filesystem fallback; CodeGraph adapter metadata merge is Sprint 2.',
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
  const entries = walkVisibleEntries(repo, ignore);
  const paged = pageEntries(entries, args.cursor, args.page_size);
  return textResult({
    ...commonFields(repo, ignore),
    entries: paged.page,
    next_cursor: paged.nextCursor,
    complete: true,
    page_complete: paged.nextCursor === null,
    counts: {
      entries: entries.length,
      files: entries.filter((entry) => entry.type === 'file').length,
      directories: entries.filter((entry) => entry.type === 'directory').length,
      symlinks: entries.filter((entry) => entry.type === 'symlink').length,
      unindexed: entries.filter((entry) => !entry.indexed).length,
    },
    manifest_digest: `sha256:${sha256(JSON.stringify(entries.map((entry) => [entry.path, entry.sha256 ?? '', entry.type])))}`,
  });
}

function listTree(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const root = resolveRepoPath(repo, args.path ?? '.', ignore, { allowRoot: true, requireDirectory: true });
  const depth = numberArg(args.depth, 1, 0, 6);
  const entries = walkVisibleEntries(repo, ignore, root.relativePath)
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
    ...commonFields(repo, ignore),
    path: root.relativePath,
    entries: paged.page,
    next_cursor: paged.nextCursor,
  });
}

function statFile(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const resolved = resolveRepoPath(repo, args.path, ignore);
  return textResult({
    ...commonFields(repo, ignore),
    ...metadataForResolved(resolved),
  });
}

function readFileTool(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  return textResult(readFilePayload(repo, ignore, args));
}

function readFiles(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
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
      const payload = readFilePayload(repo, ignore, request as Record<string, unknown>, remaining);
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
    ...commonFields(repo, ignore),
    partial,
    results,
    bytes_remaining: remaining,
  });
}

function searchText(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const query = String(args.query ?? '');
  if (!query) return errorResult('INVALID_RANGE', 'query is required');
  const mode = args.mode === 'regex' ? 'regex' : 'literal';
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const requestedPaths = Array.isArray(args.paths) && args.paths.length > 0 ? args.paths : ['.'];
  const candidates: ManifestEntry[] = [];
  for (const path of requestedPaths) {
    const resolved = resolveRepoPath(repo, path, ignore, { allowRoot: true });
    if (resolved.type === 'directory') {
      candidates.push(...walkVisibleEntries(repo, ignore, resolved.relativePath));
    } else {
      candidates.push(metadataForResolved(resolved));
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

  for (const entry of candidates.sort((a, b) => a.path.localeCompare(b.path))) {
    if (matches.length >= maxResults) break;
    if (entry.type !== 'file' || !entry.readable || seen.has(entry.path) || entry.binary || (entry.size ?? 0) > SEARCH_FILE_SCAN_BYTES) continue;
    seen.add(entry.path);
    const resolved = resolveRepoPath(repo, entry.path, ignore, { requireFile: true });
    const text = readFileSync(resolved.canonicalPath, 'utf-8');
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const column = regex ? line.search(regex) : line.toLowerCase().indexOf(needle);
      if (column < 0) continue;
      matches.push({
        path: entry.path,
        line: index + 1,
        column: column + 1,
        snippet: line.slice(Math.max(0, column - 60), column + 120),
        sha256: entry.sha256,
      });
      if (matches.length >= maxResults) break;
    }
  }

  return textResult({
    ...commonFields(repo, ignore),
    query,
    mode,
    matches,
    truncated: matches.length >= maxResults,
    backend: 'filesystem-fallback',
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
