import { createHash, randomBytes } from 'crypto';
import { appendFileSync, closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync, type Dirent } from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { dlopen } from 'bun:ffi';
import { readRegisteredRepoHarnessRepos, repoHarnessRegisteredReposPath, repoHarnessRepoIdFor, type RepoHarnessAccessMode } from '../../effects/repo-registry';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { createCodeGraphCliAdapter, type CodeGraphRefreshResult, type CodeGraphRepoSnapshot, type GeneralRepoCodeGraphAdapter } from './codegraph-adapter';
import { globMatches, isPathInside } from './paths';
import { redactMcpText } from './redaction';
import type { McpAuditEntry, McpPolicy } from './types';

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
    beforeMutationCommit?: (event: { repoRoot: string; tool: string; paths: string[] }) => void;
    beforeNativeMoveCommit?: (event: { repoRoot: string; fromPath: string; toPath: string }) => void;
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
  rootIdentity: string;
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
  fileIdentity: string | null;
  rules: IgnoreRule[];
}

interface SnapshotRevisionValidation {
  stale: boolean;
  partial: boolean;
  walkerErrors: number;
  digest: string;
  ignore: IgnorePolicy;
}

interface VisibleEntrySnapshotBuild {
  snapshot: VisibleEntrySnapshot;
  ignore: IgnorePolicy;
}

interface ManifestPageSnapshotBuild extends VisibleEntrySnapshotBuild {
  counts: ManifestCounts;
  nextCursor: string | null;
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
  'apply_patch',
  'move_path',
  'delete_path',
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
const REPO_ROOT_IDENTITIES = new Map<string, string>();
const SNAPSHOT_CACHE = new Map<string, VisibleEntrySnapshot>();
const ENTRY_METADATA_CACHE = new Map<string, EntryMetadataCacheValue>();
const WRITE_TOOLS = new Set<string>(['write_file', 'apply_patch', 'move_path', 'delete_path', 'refresh_repo_index']);
const MCP_INDEX_EVENTS_RELATIVE_PATH = '.ai/harness/mcp/index-events.jsonl';
const MCP_MUTATION_LOCKS_RELATIVE_PATH = 'mcp/mutation-locks';
const MUTATION_LOCK_OWNER_FILE = 'owner.json';
const MCP_METRICS_RELATIVE_PATH = '.ai/harness/mcp/metrics.jsonl';
const MCP_TRACE_RELATIVE_PATH = '.ai/harness/mcp/trace.jsonl';
const MUTATION_FAULT_ENV = 'REPO_HARNESS_MCP_MUTATION_FAULT_POINT';
const PATH_ESCAPE_ERROR_CODES = new Set(['INVALID_RELATIVE_PATH', 'PATH_OUTSIDE_REPO', 'SYMLINK_ESCAPE']);

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
  const value = { error: { code, message: redactMcpText(message).text, retryable, details } };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

function audit(ctx: GeneralRepoToolContext, tool: string, status: 'ok' | 'blocked' | 'failed', input: unknown, targetPath?: string, error?: string, details: Partial<McpAuditEntry> = {}): void {
  tryWriteMcpAuditEntry(ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool,
    status,
    actor: `mcp:${ctx.policy.profile}`,
    result: status,
    targetPath,
    inputHash: hashMcpInput(input),
    ...details,
    error,
  });
}

function auditTargetPath(input: Record<string, unknown>): string | undefined {
  if (typeof input.path === 'string') return input.path;
  if (typeof input.from_path === 'string' && typeof input.to_path === 'string') return `${input.from_path} -> ${input.to_path}`;
  return undefined;
}

function auditPaths(input: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  if (typeof input.path === 'string') paths.add(input.path);
  if (typeof input.from_path === 'string') paths.add(input.from_path);
  if (typeof input.to_path === 'string') paths.add(input.to_path);
  if (Array.isArray(input.paths)) {
    for (const path of input.paths) {
      if (typeof path === 'string') paths.add(path);
    }
  }
  return [...paths];
}

function recordObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => recordObject(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((entry): entry is string => typeof entry === 'string');
  return values.length > 0 ? values : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function auditDetailsFromResult(result: GeneralRepoToolResult, input: Record<string, unknown>, durationMs: number, tool: string): Partial<McpAuditEntry> {
  const payload = recordObject(result.structuredContent);
  if (!payload) {
    return {
      repoId: stringField(input.repo_id),
      operation: tool,
      relativePaths: auditPaths(input),
      durationMs,
    };
  }
  const index = recordObject(payload.index);
  const diff = recordObject(payload.diff);
  const relativePaths = stringArray(index?.changed_paths)
    ?? stringArray(index?.refreshed_paths)
    ?? stringArray(payload.paths)
    ?? auditPaths(input);
  return {
    repoId: stringField(payload.repo_id) ?? stringField(input.repo_id),
    operation: stringField(payload.operation) ?? stringField(input.operation) ?? tool,
    relativePaths,
    mutationId: stringField(payload.mutation_id) ?? stringField(index?.mutation_id),
    indexInvalidationId: stringField(index?.invalidation_id),
    indexEventId: stringField(index?.event_id),
    indexState: stringField(payload.index_state) ?? stringField(index?.state),
    fileHashes: diff ? {
      before_sha256: typeof diff.before_sha256 === 'string' ? diff.before_sha256 : diff.before_sha256 === null ? null : undefined,
      after_sha256: typeof diff.after_sha256 === 'string' ? diff.after_sha256 : diff.after_sha256 === null ? null : undefined,
    } : undefined,
    durationMs,
  };
}

function auditDetailsFromError(error: GeneralRepoAccessError, input: Record<string, unknown>, durationMs: number, tool: string): Partial<McpAuditEntry> {
  return {
    repoId: stringField(input.repo_id),
    operation: tool,
    relativePaths: auditPaths(input),
    durationMs,
    errorCode: error.code,
  };
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

function mcpIndexEventsPath(repoRoot: string): string {
  return join(repoRoot, MCP_INDEX_EVENTS_RELATIVE_PATH);
}

function mcpMetricsPath(repoRoot: string): string {
  return join(repoRoot, MCP_METRICS_RELATIVE_PATH);
}

function mcpTracePath(repoRoot: string): string {
  return join(repoRoot, MCP_TRACE_RELATIVE_PATH);
}

function correlationId(tool: string): string {
  return `mcpcorr_${sha256(`${tool}\0${Date.now()}\0${randomBytes(8).toString('hex')}`).slice(0, 16)}`;
}

function indexEventId(repo: RepoRecord, eventType: string, seed: string): string {
  return `idxevt_${sha256(`${repo.repoId}\0${eventType}\0${seed}\0${Date.now()}\0${randomBytes(4).toString('hex')}`).slice(0, 16)}`;
}

function safeEventError(error: CodeGraphRefreshResult['error'] | undefined): Record<string, unknown> | undefined {
  if (!error) return undefined;
  return {
    code: error.code,
    message: redactMcpText(error.message).text,
    retryable: error.retryable,
  };
}

function tryWriteIndexEvent(ctx: GeneralRepoToolContext, repo: RepoRecord, event: Record<string, unknown>): string | null {
  const eventId = typeof event.event_id === 'string'
    ? event.event_id
    : indexEventId(repo, String(event.event_type ?? 'index_event'), JSON.stringify(event));
  try {
    const logPath = mcpIndexEventsPath(ctx.repoRoot);
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify({
      schema_version: 1,
      timestamp: new Date().toISOString(),
      event_id: eventId,
      repo_id: repo.repoId,
      ...event,
    })}\n`, 'utf-8');
    return eventId;
  } catch (_error) {
    return null;
  }
}

function readRecentIndexEvents(repoRoot: string): Record<string, unknown>[] {
  const logPath = mcpIndexEventsPath(repoRoot);
  if (!existsSync(logPath)) return [];
  try {
    return readFileSync(logPath, 'utf-8')
      .trimEnd()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-1000)
      .map((line) => JSON.parse(line))
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry));
  } catch (_error) {
    return [];
  }
}

function eventPathsOverlap(eventPaths: unknown, paths: string[]): boolean {
  const values = stringArray(eventPaths);
  if (!values) return false;
  const refreshPaths = new Set(cachePaths(paths));
  return values.some((path) => refreshPaths.has(path) || refreshPaths.has('.') || path === '.');
}

function latestIndexInvalidationEvent(ctx: GeneralRepoToolContext, repo: RepoRecord, mutationId: string, paths: string[]): Record<string, unknown> | null {
  const events = readRecentIndexEvents(ctx.repoRoot);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.event_type !== 'index_invalidation' || event.repo_id !== repo.repoId) continue;
    if (mutationId && event.mutation_id === mutationId) return event;
    if (!mutationId && eventPathsOverlap(event.relative_paths, paths)) return event;
  }
  return null;
}

function indexLagMsFrom(event: Record<string, unknown> | null, nowMs = Date.now()): number | undefined {
  if (!event || typeof event.timestamp !== 'string') return undefined;
  const startedAt = Date.parse(event.timestamp);
  if (!Number.isFinite(startedAt)) return undefined;
  return Math.max(0, nowMs - startedAt);
}

function indexRecovery(paths: string[], retryable = true): Record<string, unknown> {
  return {
    retryable,
    retry_tool: 'refresh_repo_index',
    retry_paths: paths,
    dead_letter_log: MCP_INDEX_EVENTS_RELATIVE_PATH,
    manual_recovery: 'bash scripts/ensure-codegraph.sh --sync',
  };
}

function tryAppendJsonLine(path: string, entry: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (_error) {
    // Observability must never change MCP tool behavior.
  }
}

function withCorrelationId(result: GeneralRepoToolResult, id: string): GeneralRepoToolResult {
  const payload = recordObject(result.structuredContent);
  if (!payload) return result;
  const nextPayload = { ...payload, correlation_id: id };
  return {
    ...result,
    structuredContent: nextPayload,
    content: [{ type: 'text', text: JSON.stringify(nextPayload, null, 2) }],
  };
}

function payloadCodeGraph(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return recordObject(payload?.codegraph);
}

function payloadIndex(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return recordObject(payload?.index);
}

function payloadRefresh(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return recordObject(payload?.refresh);
}

function payloadDiff(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return recordObject(payload?.diff);
}

function payloadPathDigest(payload: Record<string, unknown> | null, input: Record<string, unknown>): string {
  const snapshotCache = recordObject(payload?.snapshot_cache);
  const digest = stringField(snapshotCache?.path_digest);
  if (digest) return digest;
  return `sha256:${sha256(JSON.stringify(cachePaths(auditPaths(input))))}`;
}

function payloadPathCount(payload: Record<string, unknown> | null, input: Record<string, unknown>): number {
  const snapshotCache = recordObject(payload?.snapshot_cache);
  const paths = stringArray(snapshotCache?.paths);
  return paths?.length ?? cachePaths(auditPaths(input)).length;
}

function payloadBytesReturned(payload: Record<string, unknown> | null): number {
  let total = numberField(payload?.bytes_returned) ?? 0;
  for (const result of recordArray(payload?.results)) {
    total += numberField(result.bytes_returned) ?? 0;
  }
  return total;
}

function payloadBytesWritten(payload: Record<string, unknown> | null): number {
  const diff = payloadDiff(payload);
  return numberField(diff?.bytes_after) ?? 0;
}

function payloadFallbackUsed(payload: Record<string, unknown> | null): boolean {
  const values = [
    stringField(payload?.backend),
    ...recordArray(payload?.results).map((result) => stringField(result.backend)),
  ].filter((value): value is string => value !== undefined);
  return values.some((value) => value.includes('filesystem-fallback'));
}

function payloadIndexLagMs(payload: Record<string, unknown> | null): number | undefined {
  const index = payloadIndex(payload);
  const refresh = payloadRefresh(payload);
  return numberField(index?.index_lag_ms) ?? numberField(refresh?.index_lag_ms);
}

function resultErrorCode(payload: Record<string, unknown> | null): string | undefined {
  return stringField(recordObject(payload?.error)?.code);
}

function traceBackend(payload: Record<string, unknown> | null): string {
  const backend = stringField(payload?.backend);
  if (backend) return backend;
  const codeGraph = payloadCodeGraph(payload);
  if (codeGraph?.available === false) return 'filesystem-fallback';
  return 'codegraph-or-filesystem';
}

function writeToolObservability(ctx: GeneralRepoToolContext, tool: string, status: 'ok' | 'blocked' | 'failed', input: Record<string, unknown>, result: GeneralRepoToolResult | null, durationMs: number, id: string, errorCode?: string): void {
  const payload = recordObject(result?.structuredContent);
  const codeGraph = payloadCodeGraph(payload);
  const index = payloadIndex(payload);
  const refresh = payloadRefresh(payload);
  const effectiveErrorCode = errorCode ?? resultErrorCode(payload);
  const indexState = stringField(payload?.index_state) ?? stringField(index?.state);
  const indexLagMs = payloadIndexLagMs(payload);
  const manifestIncomplete = tool === 'repo_manifest' && payload?.complete === false;
  const reindexFailure = tool === 'refresh_repo_index' && (status !== 'ok' || indexState === 'failed');
  const writeConflict = effectiveErrorCode === 'REVISION_CONFLICT';
  const atomicWriteFailure = WRITE_TOOLS.has(tool) && (effectiveErrorCode === 'INJECTED_MUTATION_FAULT' || status === 'failed');
  const pathEscapeAttempt = effectiveErrorCode ? PATH_ESCAPE_ERROR_CODES.has(effectiveErrorCode) : false;

  const metric = {
    schema_version: 1,
    event_type: 'mcp_tool_metric',
    timestamp: new Date().toISOString(),
    correlation_id: id,
    repo_id: stringField(payload?.repo_id) ?? stringField(input.repo_id),
    tool,
    operation: stringField(payload?.operation) ?? tool,
    status,
    error_code: effectiveErrorCode,
    duration_ms: durationMs,
    codegraph_revision: stringField(payload?.index_revision) ?? stringField(codeGraph?.index_revision),
    codegraph_available: typeof codeGraph?.available === 'boolean' ? codeGraph.available : undefined,
    codegraph_latency_ms: numberField(codeGraph?.latency_ms),
    path_count: payloadPathCount(payload, input),
    path_digest: payloadPathDigest(payload, input),
    bytes_returned: payloadBytesReturned(payload),
    bytes_written: payloadBytesWritten(payload),
    partial: payload?.partial === true,
    fallback_used: payloadFallbackUsed(payload),
    filtered_path_count: numberField(codeGraph?.filtered_paths) ?? 0,
    manifest_parity_failure_count: tool === 'repo_manifest' ? numberField(codeGraph?.filtered_paths) ?? 0 : 0,
    manifest_incomplete: manifestIncomplete,
    snapshot_stale: effectiveErrorCode === 'SNAPSHOT_STALE',
    index_lagging: codeGraph?.index_lagging === true || indexState === 'index_lagging',
    index_lag_ms: indexLagMs,
    lagging_path_count: numberField(codeGraph?.lagging_path_count) ?? numberField(index?.lagging_path_count) ?? 0,
    write_conflict: writeConflict,
    atomic_write_failure: atomicWriteFailure,
    reindex_failure: reindexFailure,
    path_escape_attempt: pathEscapeAttempt,
  };

  const trace = {
    schema_version: 1,
    event_type: 'mcp_tool_trace',
    timestamp: metric.timestamp,
    correlation_id: id,
    trace_id: id,
    repo_id: metric.repo_id,
    tool,
    status,
    duration_ms: durationMs,
    error_code: effectiveErrorCode,
    route: ['mcp_tool_gateway', 'repo_policy', 'path_guard_ignore_policy', traceBackend(payload), 'response'],
    backend: traceBackend(payload),
    codegraph_revision: metric.codegraph_revision,
    index_state: indexState,
    source_index_event_id: stringField(index?.source_event_id) ?? stringField(refresh?.source_event_id),
    index_event_id: stringField(index?.event_id),
  };

  tryAppendJsonLine(mcpMetricsPath(ctx.repoRoot), metric);
  tryAppendJsonLine(mcpTracePath(ctx.repoRoot), trace);
}

function injectMutationFault(point: string): void {
  if ((process.env[MUTATION_FAULT_ENV] ?? '').trim() !== point) return;
  throw new GeneralRepoAccessError('INJECTED_MUTATION_FAULT', `injected mutation fault at ${point}`, { fault_point: point }, true);
}

function responseCacheKey(repo: RepoRecord, ignore: IgnorePolicy, snapshot: VisibleEntrySnapshot, scope: { tool: string; paths?: string[] }): { key: string; paths: string[]; pathDigest: string } {
  const paths = cachePaths(scope.paths);
  const pathDigest = `sha256:${sha256(JSON.stringify(paths))}`;
  const key = `cache_${sha256(`${repo.repoId}\0${repo.registryRevision}\0${ignore.digest}\0${snapshot.id}\0${scope.tool}\0${pathDigest}`).slice(0, 16)}`;
  return { key, paths, pathDigest };
}

interface MutationPathLock {
  relativePath: string;
  lockPath: string;
  ownerToken: string;
}

interface MutationLockOwner {
  repo_id: string;
  path: string;
  pid: number;
  token?: string;
  created_at: string;
}

function mutationLockRoot(repo: RepoRecord): string {
  const harnessHome = dirname(repoHarnessRegisteredReposPath());
  const lockRoot = resolve(harnessHome, MCP_MUTATION_LOCKS_RELATIVE_PATH, repo.repoId);
  mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
  try {
    const homeRealpath = realpathSync(harnessHome);
    const rootStats = lstatSync(lockRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      throw new GeneralRepoAccessError('LOCK_UNAVAILABLE', 'mutation lock root is not a trusted directory', {
        lock_root: MCP_MUTATION_LOCKS_RELATIVE_PATH,
      }, true);
    }
    const rootRealpath = realpathSync(lockRoot);
    if (!isPathInside(homeRealpath, rootRealpath)) {
      throw new GeneralRepoAccessError('LOCK_UNAVAILABLE', 'mutation lock root escapes repo-harness home', {
        lock_root: MCP_MUTATION_LOCKS_RELATIVE_PATH,
      }, true);
    }
  } catch (error) {
    if (error instanceof GeneralRepoAccessError) throw error;
    throw new GeneralRepoAccessError('LOCK_UNAVAILABLE', 'mutation lock root is unavailable', {
      lock_root: MCP_MUTATION_LOCKS_RELATIVE_PATH,
    }, true);
  }
  return lockRoot;
}

function mutationLockPath(lockRoot: string, relativePath: string): string {
  return resolve(lockRoot, `${sha256(relativePath).slice(0, 32)}.lock`);
}

function mutationLockOwnerPath(lockPath: string): string {
  return resolve(lockPath, MUTATION_LOCK_OWNER_FILE);
}

function readMutationLockOwner(lockPath: string): MutationLockOwner | null {
  try {
    const stats = lstatSync(lockPath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return null;
    const raw = readFileSync(mutationLockOwnerPath(lockPath), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const pid = typeof parsed.pid === 'number' ? parsed.pid : Number(parsed.pid);
    const owner = {
      repo_id: typeof parsed.repo_id === 'string' ? parsed.repo_id : '',
      path: typeof parsed.path === 'string' ? parsed.path : '',
      pid,
      token: typeof parsed.token === 'string' ? parsed.token : undefined,
      created_at: typeof parsed.created_at === 'string' ? parsed.created_at : '',
    };
    return owner.repo_id && owner.path && Number.isSafeInteger(owner.pid) && owner.pid > 0 ? owner : null;
  } catch (_error) {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    return code === 'EPERM';
  }
}

function tryReclaimStaleMutationLock(repo: RepoRecord, relativePath: string, lockPath: string): boolean {
  const owner = readMutationLockOwner(lockPath);
  if (!owner || owner.repo_id !== repo.repoId || owner.path !== relativePath || isProcessAlive(owner.pid)) {
    return false;
  }
  const reclaimPath = `${lockPath}.reclaim-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  try {
    renameSync(lockPath, reclaimPath);
    rmSync(reclaimPath, { recursive: true, force: true });
    return true;
  } catch (_error) {
    return false;
  }
}

function writeMutationLockOwner(repo: RepoRecord, relativePath: string, lockPath: string, ownerToken: string): void {
  const payload = `${JSON.stringify({
    repo_id: repo.repoId,
    path: relativePath,
    pid: process.pid,
    token: ownerToken,
    created_at: new Date().toISOString(),
  })}\n`;
  writeFileSync(mutationLockOwnerPath(lockPath), payload, { encoding: 'utf-8', mode: 0o600 });
}

function acquireMutationLocks(repo: RepoRecord, paths: string[]): MutationPathLock[] {
  const lockRoot = mutationLockRoot(repo);
  const locks: MutationPathLock[] = [];
  for (const relativePath of cachePaths(paths)) {
    const lockPath = mutationLockPath(lockRoot, relativePath);
    const ownerToken = randomBytes(16).toString('hex');
    let created = false;
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      created = true;
      writeMutationLockOwner(repo, relativePath, lockPath, ownerToken);
      locks.push({ relativePath, lockPath, ownerToken });
    } catch (error) {
      if (created) rmSync(lockPath, { recursive: true, force: true });
      releaseMutationLocks(locks);
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'EEXIST') {
        if (tryReclaimStaleMutationLock(repo, relativePath, lockPath)) {
          try {
            mkdirSync(lockPath, { mode: 0o700 });
            try {
              writeMutationLockOwner(repo, relativePath, lockPath, ownerToken);
              locks.push({ relativePath, lockPath, ownerToken });
              continue;
            } catch (retryOwnerError) {
              rmSync(lockPath, { recursive: true, force: true });
              throw retryOwnerError;
            }
          } catch (retryError) {
            if (typeof retryError === 'object' && retryError !== null && 'code' in retryError && String((retryError as { code?: unknown }).code) === 'EEXIST') {
              throw new GeneralRepoAccessError('REVISION_CONFLICT', 'path is locked by another repo mutation', { path: relativePath }, true);
            }
            throw retryError;
          }
        }
        throw new GeneralRepoAccessError('REVISION_CONFLICT', 'path is locked by another repo mutation', { path: relativePath }, true);
      }
      throw error;
    }
  }
  return locks;
}

function releaseMutationLocks(locks: MutationPathLock[]): void {
  for (const lock of locks.reverse()) {
    try {
      const owner = readMutationLockOwner(lock.lockPath);
      if (owner?.pid === process.pid && owner.token === lock.ownerToken) {
        rmSync(lock.lockPath, { recursive: true, force: true });
      }
    } catch (_error) {
      // Best-effort cleanup: never hide the mutation result behind lock cleanup.
    }
  }
}

function withMutationLocks<T>(repo: RepoRecord, paths: string[], fn: () => T): T {
  const locks = acquireMutationLocks(repo, paths);
  try {
    return fn();
  } finally {
    releaseMutationLocks(locks);
  }
}

function beforeMutationCommit(ctx: GeneralRepoToolContext, repo: RepoRecord, tool: string, paths: string[]): void {
  ctx.testHooks?.beforeMutationCommit?.({ repoRoot: repo.canonicalRoot, tool, paths: cachePaths(paths) });
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

function resolveRepo(ctx: GeneralRepoToolContext, repoId: unknown): RepoRecord {
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

function sameIgnorePolicyRevision(left: IgnorePolicy, right: IgnorePolicy): boolean {
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
    const raw = readStableResolvedFile(resolved, { digest: '', fileIdentity: null, rules: [] });
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
  return path === '.ai' || path === '.ai/harness' || path === '.ai/harness/mcp' || path.startsWith('.ai/harness/mcp/');
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

function validateSnapshotRevision(repo: RepoRecord, ignore: IgnorePolicy, expectedDigest: string): SnapshotRevisionValidation {
  const validationIgnore = readIgnorePolicy(repo.canonicalRoot);
  const validation = walkVisibleEntries(repo, validationIgnore, '.', { hits: 0, misses: 0 }, { contentHash: false, cacheMetadata: false });
  const digest = metadataDigest(validation.entries);
  const finalIgnore = readIgnorePolicy(repo.canonicalRoot);
  return {
    stale: digest !== expectedDigest || !sameIgnorePolicyRevision(ignore, validationIgnore) || !sameIgnorePolicyRevision(validationIgnore, finalIgnore),
    partial: validation.partial,
    walkerErrors: validation.walkerErrors,
    digest,
    ignore: finalIgnore,
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

function buildManifestPageSnapshot(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy, args: Record<string, unknown>, attempt = 0): ManifestPageSnapshotBuild {
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
    return buildManifestPageSnapshot(ctx, repo, validation.ignore, args, attempt + 1);
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
  return { snapshot: rememberSnapshot(snapshot), counts, nextCursor, ignore: validation.stale ? validation.ignore : ignore };
}

function buildVisibleEntrySnapshot(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy, opts: { contentHash?: boolean } = {}, attempt = 0): VisibleEntrySnapshotBuild {
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
    return buildVisibleEntrySnapshot(ctx, repo, validation.ignore, opts, attempt + 1);
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
  return { snapshot: rememberSnapshot(snapshot), ignore: validation.stale ? validation.ignore : ignore };
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

function assertTextPatchable(raw: Buffer, path: string): string {
  if (raw.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
    throw new GeneralRepoAccessError('BINARY_CONTENT', 'apply_patch requires text content', { path });
  }
  return raw.toString('utf-8');
}

function findOccurrences(text: string, needle: string): number[] {
  const matches: number[] = [];
  let index = text.indexOf(needle);
  while (index >= 0) {
    matches.push(index);
    index = text.indexOf(needle, index + Math.max(needle.length, 1));
  }
  return matches;
}

function replaceTextAt(text: string, start: number, oldText: string, newText: string): string {
  return `${text.slice(0, start)}${newText}${text.slice(start + oldText.length)}`;
}

function patchOccurrenceArg(value: unknown, matchCount: number, editIndex: number): number {
  if (value === undefined) {
    if (matchCount !== 1) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'patch edit precondition is ambiguous or missing', {
        edit_index: editIndex,
        match_count: matchCount,
      });
    }
    return 1;
  }
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'edit occurrence must be a positive integer', { edit_index: editIndex });
  }
  if (parsed > matchCount) {
    throw new GeneralRepoAccessError('REVISION_CONFLICT', 'patch edit occurrence does not exist', {
      edit_index: editIndex,
      occurrence: parsed,
      match_count: matchCount,
    });
  }
  return parsed;
}

function applyStructuredPatchEdits(beforeText: string, edits: unknown): { text: string; applied: Array<Record<string, unknown>>; format: 'structured_edits' } {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'edits must be a non-empty array');
  }
  let text = beforeText;
  const applied: Array<Record<string, unknown>> = [];
  for (let index = 0; index < edits.length; index += 1) {
    const editIndex = index + 1;
    const edit = edits[index];
    if (typeof edit !== 'object' || edit === null || Array.isArray(edit)) {
      throw new GeneralRepoAccessError('INVALID_RANGE', 'each edit must be an object', { edit_index: editIndex });
    }
    const raw = edit as Record<string, unknown>;
    if (typeof raw.old_text !== 'string' || raw.old_text.length === 0 || typeof raw.new_text !== 'string') {
      throw new GeneralRepoAccessError('INVALID_RANGE', 'each edit requires non-empty old_text and string new_text', { edit_index: editIndex });
    }
    const matches = findOccurrences(text, raw.old_text);
    const occurrence = patchOccurrenceArg(raw.occurrence, matches.length, editIndex);
    const start = matches[occurrence - 1];
    if (start === undefined) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'patch edit precondition does not match', { edit_index: editIndex });
    }
    text = replaceTextAt(text, start, raw.old_text, raw.new_text);
    applied.push({
      edit_index: editIndex,
      mode: 'old_text',
      occurrence,
      old_sha256: sha256(raw.old_text),
      new_sha256: sha256(raw.new_text),
      bytes_before: Buffer.byteLength(raw.old_text, 'utf-8'),
      bytes_after: Buffer.byteLength(raw.new_text, 'utf-8'),
    });
  }
  return { text, applied, format: 'structured_edits' };
}

function lineStartOffset(text: string, lineNumber: number): number {
  if (lineNumber <= 1) return 0;
  let offset = 0;
  let currentLine = 1;
  while (currentLine < lineNumber) {
    const next = text.indexOf('\n', offset);
    if (next < 0) return text.length;
    offset = next + 1;
    currentLine += 1;
  }
  return offset;
}

function applyUnifiedDiffPatch(beforeText: string, diff: unknown): { text: string; applied: Array<Record<string, unknown>>; format: 'unified_diff' } {
  if (typeof diff !== 'string' || diff.trim().length === 0) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'unified_diff must be a non-empty string');
  }
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  let text = beforeText;
  let lineDelta = 0;
  const applied: Array<Record<string, unknown>> = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const header = lines[cursor] ?? '';
    if (!header || header.startsWith('--- ') || header.startsWith('+++ ')) {
      cursor += 1;
      continue;
    }
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
    if (!match) {
      throw new GeneralRepoAccessError('INVALID_RANGE', 'unified_diff contains an unsupported line', { line: cursor + 1 });
    }
    const oldStart = Number(match[1]);
    const oldLines: string[] = [];
    const newLines: string[] = [];
    cursor += 1;
    while (cursor < lines.length && !(lines[cursor] ?? '').startsWith('@@ ')) {
      const line = lines[cursor] ?? '';
      if (line.startsWith('--- ') || line.startsWith('+++ ')) break;
      if (line.startsWith('\\ No newline at end of file')) {
        cursor += 1;
        continue;
      }
      if (line.startsWith(' ')) {
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      } else if (line.startsWith('-')) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith('+')) {
        newLines.push(line.slice(1));
      } else if (line === '' && cursor === lines.length - 1) {
        cursor += 1;
        break;
      } else {
        throw new GeneralRepoAccessError('INVALID_RANGE', 'unified_diff hunk contains an unsupported line', { line: cursor + 1 });
      }
      cursor += 1;
    }
    if (oldLines.length === 0) {
      throw new GeneralRepoAccessError('INVALID_RANGE', 'unified_diff pure insertion hunks require surrounding context');
    }
    const oldBlock = oldLines.join('\n');
    const newBlock = newLines.join('\n');
    const expectedOffset = lineStartOffset(text, oldStart + lineDelta);
    if (!text.startsWith(oldBlock, expectedOffset)) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'unified_diff hunk precondition does not match', {
        hunk_index: applied.length + 1,
        old_start: oldStart,
      });
    }
    text = replaceTextAt(text, expectedOffset, oldBlock, newBlock);
    lineDelta += newLines.length - oldLines.length;
    applied.push({
      hunk_index: applied.length + 1,
      old_start: oldStart,
      old_lines: oldLines.length,
      new_lines: newLines.length,
      old_sha256: sha256(oldBlock),
      new_sha256: sha256(newBlock),
    });
  }
  if (applied.length === 0) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'unified_diff contains no hunks');
  }
  return { text, applied, format: 'unified_diff' };
}

function applyPatchContent(beforeText: string, args: Record<string, unknown>): { raw: Buffer; format: 'structured_edits' | 'unified_diff'; applied: Array<Record<string, unknown>> } {
  const hasEdits = args.edits !== undefined;
  const hasUnifiedDiff = args.unified_diff !== undefined;
  if (hasEdits === hasUnifiedDiff) {
    throw new GeneralRepoAccessError('INVALID_RANGE', 'provide exactly one of edits or unified_diff');
  }
  const patched = hasEdits ? applyStructuredPatchEdits(beforeText, args.edits) : applyUnifiedDiffPatch(beforeText, args.unified_diff);
  if (patched.text === beforeText) {
    throw new GeneralRepoAccessError('REVISION_CONFLICT', 'patch produced no content change');
  }
  return { raw: Buffer.from(patched.text, 'utf-8'), format: patched.format, applied: patched.applied };
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

function atomicWriteFile(target: ResolvedRepoWritePath, raw: Buffer, mode: number, opts: { noOverwrite?: boolean; beforeCommit?: () => void } = {}): void {
  const tempPath = resolve(target.parentCanonicalPath, `.${leafName(target.relativePath)}.repo-harness-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}.tmp`);
  if (!isPathInside(target.parentCanonicalPath, tempPath)) {
    throw new GeneralRepoAccessError('PATH_OUTSIDE_REPO', 'temporary write path escapes parent directory', { path: target.relativePath });
  }
  const fd = openSync(tempPath, 'wx', mode);
  let committed = false;
  try {
    try {
      writeSync(fd, raw, 0, raw.length, 0);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    opts.beforeCommit?.();
    injectMutationFault('atomic_write_before_rename');
    if (opts.noOverwrite) {
      try {
        linkSync(tempPath, target.canonicalPath);
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
        if (code === 'EEXIST') {
          throw new GeneralRepoAccessError('TARGET_EXISTS', 'target already exists at commit time', { path: target.relativePath }, true);
        }
        throw error;
      }
    } else {
      renameSync(tempPath, target.canonicalPath);
    }
    committed = true;
    fsyncDirectoryBestEffort(target.parentCanonicalPath);
  } finally {
    if (!committed || opts.noOverwrite) rmSync(tempPath, { force: true });
  }
}

function readMutationFile(resolved: ResolvedRepoPath, ignore: IgnorePolicy): { raw: Buffer; sha256: string; mode: number } {
  const raw = readStableResolvedFile(resolved, ignore);
  return {
    raw,
    sha256: sha256(raw),
    mode: statSync(resolved.canonicalPath).mode & 0o777,
  };
}

function revisionConflict(path: string, expectedHash: string, actualHash?: string | null): GeneralRepoAccessError {
  return new GeneralRepoAccessError('REVISION_CONFLICT', 'file changed before mutation commit', {
    path,
    expected_sha256: expectedHash,
    actual_sha256: actualHash ?? null,
  }, true);
}

function assertExpectedHash(path: string, expectedHash: string, actualHash: string): void {
  if (expectedHash !== actualHash) {
    throw revisionConflict(path, expectedHash, actualHash);
  }
}

function readExpectedExistingWriteTarget(repo: RepoRecord, ignore: IgnorePolicy, path: unknown, expectedHash: string): { target: ResolvedRepoWritePath; raw: Buffer; beforeHash: string; mode: number } {
  const target = resolveRepoWritePath(repo, path, ignore);
  if (!target.existing) {
    throw revisionConflict(target.relativePath, expectedHash, null);
  }
  const current = readMutationFile(target.existing, ignore);
  assertExpectedHash(target.relativePath, expectedHash, current.sha256);
  return { target, raw: current.raw, beforeHash: current.sha256, mode: current.mode };
}

function assertWriteTargetAbsent(target: ResolvedRepoWritePath): void {
  if (target.existing || existsSync(target.absolutePath) || existsSync(target.canonicalPath)) {
    throw new GeneralRepoAccessError('TARGET_EXISTS', 'target already exists', { path: target.relativePath }, true);
  }
}

type DarwinRenameLibrary = {
  symbols: {
    renamex_np: (oldPath: Buffer, newPath: Buffer, flags: number) => number;
  };
};

type LinuxSyscallLibrary = {
  symbols: {
    syscall: (syscallNumber: number, oldDirFd: number, oldPath: Buffer, newDirFd: number, newPath: Buffer, flags: number) => bigint;
  };
};

type WindowsMoveFileLibrary = {
  symbols: {
    MoveFileExW: (oldPath: Buffer, newPath: Buffer, flags: number) => boolean;
  };
};

let darwinRenameLibrary: DarwinRenameLibrary | null = null;
let linuxSyscallLibrary: LinuxSyscallLibrary | null = null;
let windowsMoveFileLibrary: WindowsMoveFileLibrary | null = null;

function cPath(value: string): Buffer {
  if (value.includes('\0')) {
    throw new GeneralRepoAccessError('INVALID_RELATIVE_PATH', 'path contains a nul byte');
  }
  return Buffer.from(`${value}\0`);
}

function windowsPath(value: string): Buffer {
  if (value.includes('\0')) {
    throw new GeneralRepoAccessError('INVALID_RELATIVE_PATH', 'path contains a nul byte');
  }
  return Buffer.from(`${value}\0`, 'utf16le');
}

function darwinRenameNoReplace(sourcePath: string, targetPath: string): number {
  const lib = darwinRenameLibrary ??= dlopen('/usr/lib/libSystem.B.dylib', {
    renamex_np: { args: ['cstring', 'cstring', 'u32'], returns: 'i32' },
  }) as unknown as DarwinRenameLibrary;
  return lib.symbols.renamex_np(cPath(sourcePath), cPath(targetPath), 0x00000004);
}

function linuxRenameNoReplace(sourcePath: string, targetPath: string): number {
  const syscallNumber = process.arch === 'x64' ? 316 : process.arch === 'arm64' ? 276 : null;
  if (syscallNumber === null) return -1;
  const lib = linuxSyscallLibrary ??= dlopen('libc.so.6', {
    syscall: { args: ['i64', 'i32', 'cstring', 'i32', 'cstring', 'u32'], returns: 'i64' },
  }) as unknown as LinuxSyscallLibrary;
  const result = lib.symbols.syscall(syscallNumber, -100, cPath(sourcePath), -100, cPath(targetPath), 1);
  return result === 0n ? 0 : -1;
}

function windowsRenameNoReplace(sourcePath: string, targetPath: string): number {
  const lib = windowsMoveFileLibrary ??= dlopen('kernel32.dll', {
    MoveFileExW: { args: ['ptr', 'ptr', 'u32'], returns: 'bool' },
  }) as unknown as WindowsMoveFileLibrary;
  return lib.symbols.MoveFileExW(windowsPath(sourcePath), windowsPath(targetPath), 0x00000008) ? 0 : -1;
}

function renameNoReplaceNative(sourcePath: string, targetPath: string): number {
  if (process.platform === 'darwin') return darwinRenameNoReplace(sourcePath, targetPath);
  if (process.platform === 'linux') return linuxRenameNoReplace(sourcePath, targetPath);
  if (process.platform === 'win32') return windowsRenameNoReplace(sourcePath, targetPath);
  return -1;
}

function commitMoveNoOverwrite(source: ResolvedRepoPath, target: ResolvedRepoWritePath, beforeCommit: () => void, beforeNativeCommit?: () => void): void {
  beforeCommit();
  injectMutationFault('move_before_rename');
  beforeNativeCommit?.();
  let result = -1;
  try {
    result = renameNoReplaceNative(source.canonicalPath, target.canonicalPath);
  } catch (error) {
    throw new GeneralRepoAccessError('MOVE_COMMIT_FAILED', 'atomic no-overwrite move failed', {
      from_path: source.relativePath,
      path: target.relativePath,
      platform: process.platform,
      cause: error instanceof Error ? error.message : String(error),
    }, true);
  }
  if (result !== 0) {
    if (existsSync(target.canonicalPath)) {
      throw new GeneralRepoAccessError('TARGET_EXISTS', 'move target already exists at commit time', { path: target.relativePath }, true);
    }
    if (!existsSync(source.canonicalPath)) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'move source disappeared before commit', {
        path: source.relativePath,
        actual_sha256: null,
      }, true);
    }
    throw new GeneralRepoAccessError('MOVE_COMMIT_FAILED', 'atomic no-overwrite move is unavailable on this platform or filesystem', {
      from_path: source.relativePath,
      path: target.relativePath,
      platform: process.platform,
      arch: process.arch,
    }, true);
  }
  fsyncDirectoryBestEffort(dirname(source.canonicalPath));
  if (dirname(source.canonicalPath) !== target.parentCanonicalPath) fsyncDirectoryBestEffort(target.parentCanonicalPath);
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

function mutationResult(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy, target: ResolvedRepoWritePath, opts: {
  operation: 'create' | 'replace' | 'patch' | 'move';
  beforeHash: string | null;
  beforeSize: number;
  tool?: string;
  responsePath?: string;
  changedPaths?: string[];
  extra?: Record<string, unknown>;
}): GeneralRepoToolResult {
  const after = resolveRepoPath(repo, target.relativePath, ignore, { requireFile: true });
  const afterRaw = readFileSync(after.canonicalPath);
  const afterHash = sha256(afterRaw);
  const afterEntry = metadataForResolved(after, ignore);
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const { snapshot, ignore: snapshotIgnore } = built;
  const indexedEntry = snapshot.entriesByPath.get(target.relativePath);
  const indexState = mutationIndexState(snapshot);
  const changedPaths = cachePaths(opts.changedPaths ?? [target.relativePath]);
  const responsePath = opts.responsePath ?? target.relativePath;
  const mutationTool = opts.tool ?? (opts.operation === 'patch' ? 'apply_patch' : 'write_file');
  const mutationId = `mut_${sha256(`${repo.repoId}\0${changedPaths.join('\0')}\0${opts.beforeHash ?? 'new'}\0${afterHash}\0${Date.now()}`).slice(0, 16)}`;
  const invalidationId = `idxinv_${sha256(`${mutationId}\0${snapshot.codeGraph.indexRevision}\0${target.relativePath}`).slice(0, 16)}`;
  const indexEventId = tryWriteIndexEvent(ctx, repo, {
    event_type: 'index_invalidation',
    status: 'pending',
    operation: opts.operation,
    mutation_id: mutationId,
    invalidation_id: invalidationId,
    relative_paths: changedPaths,
    index_state: indexState,
    before_index_revision: snapshot.codeGraph.indexRevision,
    file_hashes: {
      before_sha256: opts.beforeHash,
      after_sha256: afterHash,
    },
    retry: indexRecovery(changedPaths, snapshot.codeGraph.available),
  });

  return textResult({
    ...commonFields(repo, snapshotIgnore, snapshot, { tool: mutationTool, paths: changedPaths }),
    path: responsePath,
    operation: opts.operation,
    mutation_id: mutationId,
    before: {
      existed: opts.beforeHash !== null,
      sha256: opts.beforeHash,
      size: opts.beforeSize,
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
      bytes_before: opts.beforeSize,
      bytes_after: afterRaw.length,
      bytes_delta: afterRaw.length - opts.beforeSize,
      before_sha256: opts.beforeHash,
      after_sha256: afterHash,
    },
    ...opts.extra,
    index_state: indexState,
    index: {
      state: indexState,
      action: snapshot.codeGraph.available ? 'refresh_repo_index_required' : 'codegraph_unavailable',
      changed_paths: changedPaths,
      mutation_id: mutationId,
      invalidation_id: invalidationId,
      event_id: indexEventId,
      event_log: MCP_INDEX_EVENTS_RELATIVE_PATH,
      refresh_tool: 'refresh_repo_index',
      before_index_revision: snapshot.codeGraph.indexRevision,
    },
    codegraph: codeGraphSummary(snapshot),
  });
}

function deleteMutationResult(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy, deleted: ManifestEntry, beforeHash: string, beforeSize: number): GeneralRepoToolResult {
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const { snapshot, ignore: snapshotIgnore } = built;
  const indexState = mutationIndexState(snapshot);
  const mutationId = `mut_${sha256(`${repo.repoId}\0${deleted.path}\0${beforeHash}\0deleted\0${Date.now()}`).slice(0, 16)}`;
  const invalidationId = `idxinv_${sha256(`${mutationId}\0${snapshot.codeGraph.indexRevision}\0${deleted.path}`).slice(0, 16)}`;
  const indexEventId = tryWriteIndexEvent(ctx, repo, {
    event_type: 'index_invalidation',
    status: 'pending',
    operation: 'delete',
    mutation_id: mutationId,
    invalidation_id: invalidationId,
    relative_paths: [deleted.path],
    index_state: indexState,
    before_index_revision: snapshot.codeGraph.indexRevision,
    file_hashes: {
      before_sha256: beforeHash,
      after_sha256: null,
    },
    retry: indexRecovery([deleted.path], snapshot.codeGraph.available),
  });

  return textResult({
    ...commonFields(repo, snapshotIgnore, snapshot, { tool: 'delete_path', paths: [deleted.path] }),
    path: deleted.path,
    operation: 'delete',
    mutation_id: mutationId,
    before: {
      existed: true,
      sha256: beforeHash,
      size: beforeSize,
    },
    after: {
      existed: false,
      sha256: null,
      size: 0,
    },
    deleted,
    diff: {
      format: 'summary',
      bytes_before: beforeSize,
      bytes_after: 0,
      bytes_delta: -beforeSize,
      before_sha256: beforeHash,
      after_sha256: null,
    },
    index_state: indexState,
    index: {
      state: indexState,
      action: snapshot.codeGraph.available ? 'refresh_repo_index_required' : 'codegraph_unavailable',
      changed_paths: [deleted.path],
      mutation_id: mutationId,
      invalidation_id: invalidationId,
      event_id: indexEventId,
      event_log: MCP_INDEX_EVENTS_RELATIVE_PATH,
      refresh_tool: 'refresh_repo_index',
      before_index_revision: snapshot.codeGraph.indexRevision,
    },
    codegraph: codeGraphSummary(snapshot),
  });
}

function readFilePayload(ctx: GeneralRepoToolContext, repo: RepoRecord, ignore: IgnorePolicy, snapshot: VisibleEntrySnapshot, args: Record<string, unknown>, maxBytes = HARD_READ_BYTES, tool = 'read_file', verifySnapshotEntry = false): Record<string, unknown> {
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
  if (!indexed && !ctx.policy.generalRepo.fs_fallback) {
    throw new GeneralRepoAccessError('INDEX_UNAVAILABLE', 'filesystem fallback is disabled for unindexed file content', {
      path: target.relativePath,
      fs_fallback: false,
    }, true);
  }
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
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const { snapshot, ignore: snapshotIgnore } = built;
  assertSnapshotFresh(args, snapshot);
  return textResult({
    ...commonFields(repo, snapshotIgnore, snapshot, { tool: 'get_repo_capabilities' }),
    access_mode: repo.accessMode,
    writable: repo.accessMode === 'read_write' && ctx.policy.generalRepo.repo_write,
    display_name: repo.displayName,
    registry_revision: repo.registryRevision,
    source: repo.source,
    read_tools: GENERAL_REPO_TOOLS.filter((tool) => tool !== 'get_repo_capabilities' && !WRITE_TOOLS.has(tool)),
    write_tools: repo.accessMode === 'read_write' && ctx.policy.generalRepo.repo_write ? [...WRITE_TOOLS] : [],
    rollout: {
      general_repo_read: ctx.policy.generalRepo.general_repo_read,
      repo_write: ctx.policy.generalRepo.repo_write,
      fs_fallback: ctx.policy.generalRepo.fs_fallback,
      shadow_compare: ctx.policy.generalRepo.shadow_compare,
      canary_repos: ctx.policy.generalRepo.canary_repos,
      rollback_to_legacy_tools: ctx.policy.generalRepo.rollback_to_legacy_tools,
    },
    codegraph: {
      primary_backend: true,
      ...codeGraphSummary(snapshot),
      note: snapshot.codeGraph.available
        ? 'CodeGraph inventory is merged as indexed metadata; secure filesystem walking remains the manifest source of truth.'
        : ctx.policy.generalRepo.fs_fallback
          ? 'CodeGraph is unavailable for this repo; authorized filesystem fallback remains active.'
          : 'CodeGraph is unavailable for this repo; filesystem fallback is disabled by rollout policy.',
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
  const initialTarget = resolveRepoWritePath(repo, args.path, ignore);
  const { raw, encoding } = writeContentBuffer(args);
  const expectedHash = typeof args.expected_sha256 === 'string' ? args.expected_sha256.trim() : '';
  const mustNotExist = booleanArg(args.must_not_exist, false);

  return withMutationLocks(repo, [initialTarget.relativePath], () => {
    const target = resolveRepoWritePath(repo, args.path, ignore);
    const existed = target.existing !== undefined;
    let beforeHash: string | null = null;
    let beforeSize = 0;
    let mode = 0o666;

    if (target.existing) {
      if (mustNotExist) {
        throw new GeneralRepoAccessError('TARGET_EXISTS', 'target already exists', { path: target.relativePath });
      }
      const current = readMutationFile(target.existing, ignore);
      beforeHash = current.sha256;
      beforeSize = current.raw.length;
      mode = current.mode;
      if (!expectedHash) {
        throw new GeneralRepoAccessError('REVISION_CONFLICT', 'expected_sha256 is required when replacing an existing file', {
          path: target.relativePath,
          actual_sha256: beforeHash,
        });
      }
      assertExpectedHash(target.relativePath, expectedHash, beforeHash);
      atomicWriteFile(target, raw, mode, {
        beforeCommit: () => {
          beforeMutationCommit(ctx, repo, 'write_file', [target.relativePath]);
          readExpectedExistingWriteTarget(repo, ignore, target.relativePath, expectedHash);
        },
      });
    } else {
      if (!mustNotExist) {
        throw new GeneralRepoAccessError('REVISION_CONFLICT', 'must_not_exist: true is required when creating a new file', {
          path: target.relativePath,
        });
      }
      assertWriteTargetAbsent(target);
      atomicWriteFile(target, raw, mode, {
        noOverwrite: true,
        beforeCommit: () => {
          beforeMutationCommit(ctx, repo, 'write_file', [target.relativePath]);
          const latest = resolveRepoWritePath(repo, target.relativePath, ignore);
          assertWriteTargetAbsent(latest);
        },
      });
    }

    invalidateRepoCaches(repo);

    return mutationResult(ctx, repo, ignore, target, {
      operation: existed ? 'replace' : 'create',
      beforeHash,
      beforeSize,
      extra: { encoding },
    });
  });
}

function applyPatchTool(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  assertRepoWriteEnabled(repo);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const initialTarget = resolveRepoWritePath(repo, args.path, ignore);
  const expectedHash = typeof args.expected_sha256 === 'string' ? args.expected_sha256.trim() : '';

  return withMutationLocks(repo, [initialTarget.relativePath], () => {
    const target = resolveRepoWritePath(repo, args.path, ignore);
    if (!target.existing) {
      throw new GeneralRepoAccessError('NOT_FOUND', 'apply_patch requires an existing file', { path: target.relativePath });
    }
    if (!expectedHash) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'expected_sha256 is required when applying a patch', { path: target.relativePath });
    }
    const current = readMutationFile(target.existing, ignore);
    const beforeHash = current.sha256;
    assertExpectedHash(target.relativePath, expectedHash, beforeHash);
    const beforeText = assertTextPatchable(current.raw, target.relativePath);
    const patched = applyPatchContent(beforeText, args);

    atomicWriteFile(target, patched.raw, current.mode, {
      beforeCommit: () => {
        beforeMutationCommit(ctx, repo, 'apply_patch', [target.relativePath]);
        readExpectedExistingWriteTarget(repo, ignore, target.relativePath, expectedHash);
      },
    });
    invalidateRepoCaches(repo);

    return mutationResult(ctx, repo, ignore, target, {
      operation: 'patch',
      beforeHash,
      beforeSize: current.raw.length,
      extra: {
        patch: {
          format: patched.format,
          applied_count: patched.applied.length,
          applied: patched.applied,
        },
      },
    });
  });
}

function movePathTool(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  assertRepoWriteEnabled(repo);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const initialSource = resolveRepoPath(repo, args.from_path, ignore, { requireFile: true });
  const initialTarget = resolveRepoWritePath(repo, args.to_path, ignore);
  const expectedHash = typeof args.expected_sha256 === 'string' ? args.expected_sha256.trim() : '';
  const mustNotExist = booleanArg(args.must_not_exist, false);

  return withMutationLocks(repo, [initialSource.relativePath, initialTarget.relativePath], () => {
    const source = resolveRepoPath(repo, args.from_path, ignore, { requireFile: true });
    if (source.type === 'symlink') {
      throw new GeneralRepoAccessError('SYMLINK_ESCAPE', 'move_path does not move symlinks', { path: source.relativePath });
    }
    const current = readMutationFile(source, ignore);
    const beforeHash = current.sha256;
    if (!expectedHash) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'expected_sha256 is required when moving a file', {
        path: source.relativePath,
        actual_sha256: beforeHash,
      });
    }
    assertExpectedHash(source.relativePath, expectedHash, beforeHash);
    const target = resolveRepoWritePath(repo, args.to_path, ignore);
    if (!mustNotExist) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'must_not_exist: true is required when moving to a new target', {
        path: target.relativePath,
      });
    }
    assertWriteTargetAbsent(target);

    commitMoveNoOverwrite(source, target, () => {
      beforeMutationCommit(ctx, repo, 'move_path', [source.relativePath, target.relativePath]);
      const latestSource = resolveRepoPath(repo, source.relativePath, ignore, { requireFile: true });
      const latest = readMutationFile(latestSource, ignore);
      assertExpectedHash(source.relativePath, expectedHash, latest.sha256);
      const latestTarget = resolveRepoWritePath(repo, target.relativePath, ignore);
      assertWriteTargetAbsent(latestTarget);
    }, () => {
      ctx.testHooks?.beforeNativeMoveCommit?.({
        repoRoot: repo.canonicalRoot,
        fromPath: source.relativePath,
        toPath: target.relativePath,
      });
    });
    invalidateRepoCaches(repo);

    return mutationResult(ctx, repo, ignore, target, {
      operation: 'move',
      tool: 'move_path',
      responsePath: target.relativePath,
      changedPaths: [source.relativePath, target.relativePath],
      beforeHash,
      beforeSize: current.raw.length,
      extra: {
        from_path: source.relativePath,
        to_path: target.relativePath,
        move: {
          source_sha256: beforeHash,
          target_must_not_exist: true,
        },
      },
    });
  });
}

function deletePathTool(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  assertRepoWriteEnabled(repo);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const recursive = booleanArg(args.recursive, false);
  const initialTarget = resolveRepoPath(repo, args.path, ignore);
  const expectedHash = typeof args.expected_sha256 === 'string' ? args.expected_sha256.trim() : '';

  return withMutationLocks(repo, [initialTarget.relativePath], () => {
    const target = resolveRepoPath(repo, args.path, ignore);
    if (target.type === 'directory') {
      if (recursive) {
        throw new GeneralRepoAccessError('INVALID_RANGE', 'recursive delete is disabled in v1', { path: target.relativePath, recursive });
      }
      throw new GeneralRepoAccessError('NOT_A_FILE', 'delete_path only deletes regular files; directory deletion is disabled', {
        path: target.relativePath,
        recursive: false,
      });
    }
    if (target.type === 'symlink') {
      throw new GeneralRepoAccessError('SYMLINK_ESCAPE', 'delete_path does not delete symlinks', { path: target.relativePath });
    }
    if (!target.contentFile) {
      throw new GeneralRepoAccessError('NOT_A_FILE', 'delete_path only deletes regular files', { path: target.relativePath });
    }
    const current = readMutationFile(target, ignore);
    const beforeHash = current.sha256;
    if (!expectedHash) {
      throw new GeneralRepoAccessError('REVISION_CONFLICT', 'expected_sha256 is required when deleting a file', {
        path: target.relativePath,
        actual_sha256: beforeHash,
      });
    }
    assertExpectedHash(target.relativePath, expectedHash, beforeHash);
    const deleted = metadataForResolved(target, ignore, undefined, { contentHash: true, cache: false });

    beforeMutationCommit(ctx, repo, 'delete_path', [target.relativePath]);
    const latest = resolveRepoPath(repo, target.relativePath, ignore, { requireFile: true });
    const latestFile = readMutationFile(latest, ignore);
    assertExpectedHash(target.relativePath, expectedHash, latestFile.sha256);
    injectMutationFault('delete_before_unlink');
    rmSync(target.canonicalPath);
    fsyncDirectoryBestEffort(dirname(target.canonicalPath));
    invalidateRepoCaches(repo);

    return deleteMutationResult(ctx, repo, ignore, deleted, beforeHash, current.raw.length);
  });
}

function refreshRepoIndex(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  assertRepoWriteEnabled(repo);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const paths = refreshPathsArg(repo, ignore, args.paths);
  const refreshScope = paths.length > 0 ? paths : ['.'];
  const mutationId = typeof args.mutation_id === 'string' ? args.mutation_id.trim() : '';
  const sourceEvent = latestIndexInvalidationEvent(ctx, repo, mutationId, refreshScope);
  const sourceEventId = typeof sourceEvent?.event_id === 'string' ? sourceEvent.event_id : undefined;
  const sourceMutationId = typeof sourceEvent?.mutation_id === 'string' ? sourceEvent.mutation_id : mutationId || undefined;
  const sourceInvalidationId = typeof sourceEvent?.invalidation_id === 'string' ? sourceEvent.invalidation_id : undefined;
  const beforeBuild = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const before = beforeBuild.snapshot;
  const adapter = ctx.codeGraphAdapter ?? DEFAULT_CODEGRAPH_ADAPTER;
  if (!adapter.refreshRepo) {
    tryWriteIndexEvent(ctx, repo, {
      event_type: 'index_refresh',
      status: 'failed',
      operation: 'refresh_repo_index',
      mutation_id: sourceMutationId,
      source_event_id: sourceEventId,
      invalidation_id: sourceInvalidationId,
      relative_paths: refreshScope,
      before_index_revision: before.codeGraph.indexRevision,
      strategy: 'unsupported',
      index_lag_ms: indexLagMsFrom(sourceEvent),
      error: { code: 'INDEX_UNAVAILABLE', message: 'CodeGraph adapter does not support explicit refresh', retryable: true },
      dead_letter: indexRecovery(refreshScope, true),
    });
    throw new GeneralRepoAccessError('INDEX_UNAVAILABLE', 'CodeGraph adapter does not support explicit refresh', {
      paths: refreshScope,
    }, true);
  }

  let refresh: CodeGraphRefreshResult;
  try {
    refresh = adapter.refreshRepo(repo.canonicalRoot, { paths });
  } catch (error) {
    tryWriteIndexEvent(ctx, repo, {
      event_type: 'index_refresh',
      status: 'failed',
      operation: 'refresh_repo_index',
      mutation_id: sourceMutationId,
      source_event_id: sourceEventId,
      invalidation_id: sourceInvalidationId,
      relative_paths: refreshScope,
      before_index_revision: before.codeGraph.indexRevision,
      strategy: 'repo-sync',
      index_lag_ms: indexLagMsFrom(sourceEvent),
      error: {
        code: 'INTERNAL_ADAPTER_ERROR',
        message: redactMcpText(error instanceof Error ? error.message : String(error)).text,
        retryable: false,
      },
      dead_letter: indexRecovery(refreshScope, false),
    });
    throw error;
  }
  invalidateRepoCaches(repo);
  if (!refresh.available || !refresh.refreshed) {
    tryWriteIndexEvent(ctx, repo, {
      event_type: 'index_refresh',
      status: 'failed',
      operation: 'refresh_repo_index',
      mutation_id: sourceMutationId,
      source_event_id: sourceEventId,
      invalidation_id: sourceInvalidationId,
      relative_paths: refreshScope,
      before_index_revision: before.codeGraph.indexRevision,
      adapter_index_revision: refresh.indexRevision,
      strategy: refresh.strategy,
      path_refresh_supported: refresh.pathRefreshSupported,
      latency_ms: refresh.latencyMs,
      index_lag_ms: indexLagMsFrom(sourceEvent),
      error: safeEventError(refresh.error),
      dead_letter: indexRecovery(refreshScope, refresh.error?.retryable ?? true),
    });
    throw indexRefreshError(refresh);
  }
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const { snapshot, ignore: snapshotIgnore } = built;
  const indexState = refreshedIndexState(snapshot);
  const indexLagMs = indexLagMsFrom(sourceEvent);
  const indexEventId = tryWriteIndexEvent(ctx, repo, {
    event_type: 'index_refresh',
    status: indexState,
    operation: 'refresh_repo_index',
    mutation_id: sourceMutationId,
    source_event_id: sourceEventId,
    invalidation_id: sourceInvalidationId,
    relative_paths: refreshScope,
    before_index_revision: before.codeGraph.indexRevision,
    adapter_index_revision: refresh.indexRevision,
    after_index_revision: snapshot.codeGraph.indexRevision,
    strategy: refresh.strategy,
    path_refresh_supported: refresh.pathRefreshSupported,
    latency_ms: refresh.latencyMs,
    indexed_files: refresh.files,
    index_lag_ms: indexLagMs,
    lagging_path_count: snapshot.codeGraphLaggingPaths.length,
    lagging_paths: snapshot.codeGraphLaggingPaths.slice(0, MAX_LAGGING_PATHS_RETURNED),
    recovery: indexState === 'ready' ? undefined : indexRecovery(refreshScope, true),
  });

  return textResult({
    ...commonFields(repo, snapshotIgnore, snapshot, { tool: 'refresh_repo_index', paths: refreshScope }),
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
      source_event_id: sourceEventId,
      mutation_id: sourceMutationId,
      index_lag_ms: indexLagMs,
    },
    index: {
      state: indexState,
      action: indexState === 'ready' ? 'refresh_complete' : 'refresh_complete_with_lag',
      refreshed_paths: refreshScope,
      mutation_id: sourceMutationId,
      source_event_id: sourceEventId,
      event_id: indexEventId,
      event_log: MCP_INDEX_EVENTS_RELATIVE_PATH,
      index_lag_ms: indexLagMs,
      lagging_path_count: snapshot.codeGraphLaggingPaths.length,
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
    ...commonFields(repo, streamed.ignore, snapshot, { tool: 'repo_manifest', paths: ['.'] }),
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
  resolveRepoPath(repo, args.path ?? '.', ignore, { allowRoot: true, requireDirectory: true });
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const { snapshot, ignore: snapshotIgnore } = built;
  assertSnapshotFresh(args, snapshot);
  const root = resolveRepoPath(repo, args.path ?? '.', snapshotIgnore, { allowRoot: true, requireDirectory: true });
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
    ...commonFields(repo, snapshotIgnore, snapshot, { tool: 'list_tree', paths: [root.relativePath] }),
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
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore);
  const { snapshot, ignore: snapshotIgnore } = built;
  assertSnapshotFresh(args, snapshot);
  const currentResolved = resolveRepoPath(repo, args.path, snapshotIgnore);
  const entry = snapshot.entriesByPath.get(currentResolved.relativePath) ?? metadataForResolved(currentResolved, snapshotIgnore);
  return textResult({
    ...commonFields(repo, snapshotIgnore, snapshot, { tool: 'stat_file', paths: [currentResolved.relativePath] }),
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
      ...readFilePayload(ctx, repo, ignore, cachedSnapshot, args, HARD_READ_BYTES, 'read_file', true),
      codegraph: codeGraphSummary(cachedSnapshot),
    });
  }
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const { snapshot, ignore: snapshotIgnore } = built;
  assertSnapshotFresh(args, snapshot);
  return textResult({
    ...readFilePayload(ctx, repo, snapshotIgnore, snapshot, args),
    codegraph: codeGraphSummary(snapshot),
  });
}

function readFiles(ctx: GeneralRepoToolContext, args: Record<string, unknown>): GeneralRepoToolResult {
  const repo = resolveRepo(ctx, args.repo_id);
  const ignore = readIgnorePolicy(repo.canonicalRoot);
  const cachedSnapshot = cachedSnapshotById(repo, args.snapshot_id, undefined, { requireHashes: true });
  let snapshot = cachedSnapshot;
  let snapshotIgnore = ignore;
  if (!snapshot) {
    const built = buildVisibleEntrySnapshot(ctx, repo, ignore);
    snapshot = built.snapshot;
    snapshotIgnore = built.ignore;
    assertSnapshotFresh(args, snapshot);
  }
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
      const payload = readFilePayload(ctx, repo, snapshotIgnore, snapshot, request as Record<string, unknown>, remaining, 'read_files', Boolean(cachedSnapshot));
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
    ...commonFields(repo, snapshotIgnore, snapshot, {
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
  const built = buildVisibleEntrySnapshot(ctx, repo, ignore, { contentHash: false });
  const { snapshot, ignore: snapshotIgnore } = built;
  assertSnapshotFresh(args, snapshot);
  const requestedPaths = Array.isArray(args.paths) && args.paths.length > 0 ? args.paths : ['.'];
  const candidates: ManifestEntry[] = [];
  for (const path of requestedPaths) {
    const resolved = resolveRepoPath(repo, path, snapshotIgnore, { allowRoot: true });
    if (resolved.type === 'directory') {
      candidates.push(...snapshot.entries.filter((entry) => (
        resolved.relativePath === '.'
          ? true
          : entry.path === resolved.relativePath || entry.path.startsWith(`${resolved.relativePath}/`)
      )));
    } else {
      candidates.push(snapshot.entriesByPath.get(resolved.relativePath) ?? metadataForResolved(resolved, snapshotIgnore));
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
  let fallbackDisabledSkipped = 0;

  for (const entry of candidates.sort((a, b) => a.path.localeCompare(b.path))) {
    if (matches.length >= maxResults + 1) break;
    if (entry.type !== 'file' || !entry.readable || seen.has(entry.path) || entry.binary || (entry.size ?? 0) > SEARCH_FILE_SCAN_BYTES) continue;
    if (!entry.indexed && !ctx.policy.generalRepo.fs_fallback) {
      fallbackDisabledSkipped += 1;
      continue;
    }
    seen.add(entry.path);
    const resolved = resolveRepoPath(repo, entry.path, snapshotIgnore, { requireFile: true });
    const raw = readStableResolvedFile(resolved, snapshotIgnore);
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
    ...commonFields(repo, snapshotIgnore, snapshot, { tool: 'search_text', paths: requestedPaths.map((path) => String(path)) }),
    query,
    mode,
    matches: returned,
    truncated: nextCursor !== null,
    partial: snapshot.partial || fallbackDisabledSkipped > 0,
    fallback_disabled_skipped: fallbackDisabledSkipped,
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

export function isGeneralRepoWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
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
      name: 'apply_patch',
      description: 'Apply structured text edits or a guarded unified diff to one existing repo-relative file using an expected_sha256 precondition.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_id: { type: 'string' },
          path: { type: 'string' },
          expected_sha256: { type: 'string' },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                old_text: { type: 'string' },
                new_text: { type: 'string' },
                occurrence: { type: 'number' },
              },
              required: ['old_text', 'new_text'],
              additionalProperties: false,
            },
          },
          unified_diff: { type: 'string' },
        },
        required: ['repo_id', 'path', 'expected_sha256'],
        additionalProperties: false,
      },
      annotations: writeTool,
    },
    {
      name: 'move_path',
      description: 'Move one existing repo-relative file to a new repo-relative path using source hash and target-existence preconditions.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_id: { type: 'string' },
          from_path: { type: 'string' },
          to_path: { type: 'string' },
          expected_sha256: { type: 'string' },
          must_not_exist: { type: 'boolean' },
        },
        required: ['repo_id', 'from_path', 'to_path', 'expected_sha256', 'must_not_exist'],
        additionalProperties: false,
      },
      annotations: writeTool,
    },
    {
      name: 'delete_path',
      description: 'Delete one existing repo-relative regular file using an expected_sha256 precondition; directory and recursive deletes are disabled in v1.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_id: { type: 'string' },
          path: { type: 'string' },
          expected_sha256: { type: 'string' },
          recursive: { type: 'boolean' },
        },
        required: ['repo_id', 'path', 'expected_sha256'],
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
          mutation_id: { type: 'string' },
        },
        required: ['repo_id'],
        additionalProperties: false,
      },
      annotations: writeTool,
    },
  ];
}

export async function callGeneralRepoTool(ctx: GeneralRepoToolContext, name: string, args: Record<string, unknown> = {}): Promise<GeneralRepoToolResult> {
  const startedAtMs = Date.now();
  const callCorrelationId = correlationId(name);
  try {
    if (ctx.policy.generalRepo.rollback_to_legacy_tools || !ctx.policy.generalRepo.general_repo_read) {
      throw new GeneralRepoAccessError('TOOL_NOT_AVAILABLE', 'general repo tools are disabled by MCP rollout policy', {
        general_repo_read: ctx.policy.generalRepo.general_repo_read,
        rollback_to_legacy_tools: ctx.policy.generalRepo.rollback_to_legacy_tools,
      });
    }
    if (WRITE_TOOLS.has(name) && !ctx.policy.generalRepo.repo_write) {
      throw new GeneralRepoAccessError('WRITE_DISABLED', 'general repo write tools are disabled by MCP rollout policy', {
        repo_write: false,
      });
    }
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
      case 'apply_patch':
        result = applyPatchTool(ctx, args);
        break;
      case 'move_path':
        result = movePathTool(ctx, args);
        break;
      case 'delete_path':
        result = deletePathTool(ctx, args);
        break;
      case 'refresh_repo_index':
        result = refreshRepoIndex(ctx, args);
        break;
      default:
        return errorResult('INTERNAL_ADAPTER_ERROR', `tool is not a general repo reader tool: ${name}`);
    }
    const durationMs = Date.now() - startedAtMs;
    const correlated = withCorrelationId(result, callCorrelationId);
    audit(ctx, name, 'ok', args, auditTargetPath(args), undefined, {
      ...auditDetailsFromResult(correlated, args, durationMs, name),
      correlationId: callCorrelationId,
    });
    writeToolObservability(ctx, name, 'ok', args, correlated, durationMs, callCorrelationId);
    return correlated;
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    if (error instanceof GeneralRepoAccessError) {
      const message = redactMcpText(error.message).text;
      const result = withCorrelationId(errorResult(error.code, message, error.details, error.retryable), callCorrelationId);
      audit(ctx, name, 'blocked', args, auditTargetPath(args), message, {
        ...auditDetailsFromError(error, args, durationMs, name),
        correlationId: callCorrelationId,
      });
      writeToolObservability(ctx, name, 'blocked', args, result, durationMs, callCorrelationId, error.code);
      return result;
    }
    const message = redactMcpText(error instanceof Error ? error.message : String(error)).text;
    const result = withCorrelationId(errorResult('INTERNAL_ADAPTER_ERROR', message), callCorrelationId);
    audit(ctx, name, 'failed', args, auditTargetPath(args), message, {
      repoId: stringField(args.repo_id),
      operation: name,
      relativePaths: auditPaths(args),
      durationMs,
      correlationId: callCorrelationId,
      errorCode: 'INTERNAL_ADAPTER_ERROR',
    });
    writeToolObservability(ctx, name, 'failed', args, result, durationMs, callCorrelationId, 'INTERNAL_ADAPTER_ERROR');
    return result;
  }
}
