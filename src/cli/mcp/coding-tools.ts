import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join, relative } from 'path';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { createCodeGraphCliAdapter, type GeneralRepoCodeGraphAdapter } from './codegraph-adapter';
import {
  CodingWorkspaceError,
  CodingWorkspaceManager,
  resolveCodingPath,
  type CodingWorkspace,
} from './coding-workspaces';
import {
  McpProcessError,
  McpProcessSessionManager,
  type ProcessCompletionEvent,
  type ProcessSnapshot,
} from './process-sessions';
import { redactMcpText } from './redaction';
import type { McpAuditEntry, McpPolicy } from './types';

export interface CodingToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface CodingToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface CodingToolContext {
  repoRoot: string;
  policy: McpPolicy;
  ownerId: string;
  workspaceManager: CodingWorkspaceManager;
  processManager: McpProcessSessionManager;
  codeGraphAdapter?: GeneralRepoCodeGraphAdapter;
  /** @internal Test-only fault boundary; the MCP server never supplies this. */
  testHooks?: {
    afterPatchCommit?: (event: { commitCount: number; path: string }) => void;
  };
}

interface PatchOperation {
  op: 'create' | 'replace' | 'delete' | 'move';
  path: string;
  content?: string;
  expectedSha256?: string;
  toPath?: string;
}

interface FileSnapshot {
  path: string;
  absolutePath: string;
  exists: boolean;
  content: Buffer;
  mode: number;
}

const MAX_READ_BYTES = 262_144;
const MAX_READ_LINES = 2_000;
const MAX_PATCH_OPERATIONS = 100;
const MAX_PATCH_FILE_BYTES = 1024 * 1024;
const MAX_DIFF_BYTES = 64 * 1024;
const DEFAULT_CODEGRAPH_ADAPTER = createCodeGraphCliAdapter();
const CODING_INDEX_EVENTS_PATH = '.ai/harness/mcp/index-events.jsonl';

function textResult(value: unknown): CodingToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    structuredContent: typeof value === 'string' ? undefined : value,
  };
}

function errorResult(code: string, message: string, details?: unknown): CodingToolResult {
  const value = { error: { code, message: redactMcpText(message).text, details } };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function audit(
  workspace: CodingWorkspace | undefined,
  ctx: CodingToolContext,
  tool: string,
  status: 'ok' | 'blocked' | 'failed',
  input: unknown,
  details: Partial<McpAuditEntry> = {},
): void {
  tryWriteMcpAuditEntry(workspace?.root ?? ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool,
    status,
    actor: 'mcp:coding',
    result: status,
    inputHash: hashMcpInput(input),
    repoId: workspace?.repoId,
    ...details,
  });
}

function indexEventPath(root: string): string {
  return join(root, CODING_INDEX_EVENTS_PATH);
}

function appendIndexEvent(root: string, event: Record<string, unknown>): string {
  const path = indexEventPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const eventId = typeof event.event_id === 'string' ? event.event_id : `idx_${randomUUID()}`;
  appendFileSync(path, `${JSON.stringify({ timestamp: new Date().toISOString(), event_id: eventId, ...event })}\n`, 'utf-8');
  return eventId;
}

function refreshCodingIndex(
  ctx: CodingToolContext,
  workspace: CodingWorkspace,
  paths: string[],
  mutationId: string,
  operation: string,
): { state: 'ready' | 'failed' | 'unavailable'; event_id: string; mutation_id: string; error?: string } {
  const invalidationId = `inv_${randomUUID()}`;
  try {
    const invalidationEventId = appendIndexEvent(workspace.root, {
      event_type: 'index_invalidation',
      status: 'pending',
      operation,
      mutation_id: mutationId,
      invalidation_id: invalidationId,
      relative_paths: paths.length > 0 ? paths : ['.'],
    });
    const adapter = ctx.codeGraphAdapter ?? DEFAULT_CODEGRAPH_ADAPTER;
    const refresh = adapter.refreshRepo?.(workspace.root, { paths });
    if (!refresh || !refresh.available || !refresh.refreshed) {
      const state = refresh ? 'failed' : 'unavailable';
      const safeRefreshError = refresh?.error
        ? { ...refresh.error, message: redactMcpText(refresh.error.message).text }
        : undefined;
      const eventId = appendIndexEvent(workspace.root, {
        event_type: 'index_refresh',
        status: state,
        operation,
        mutation_id: mutationId,
        source_event_id: invalidationEventId,
        invalidation_id: invalidationId,
        relative_paths: paths.length > 0 ? paths : ['.'],
        strategy: refresh?.strategy ?? 'unsupported',
        error: safeRefreshError,
        dead_letter: { retry_tool: 'local codegraph sync', retryable: refresh?.error?.retryable ?? true },
      });
      return { state, event_id: eventId, mutation_id: mutationId, error: safeRefreshError?.message ?? 'CodeGraph refresh is unavailable' };
    }
    const eventId = appendIndexEvent(workspace.root, {
      event_type: 'index_refresh',
      status: 'ready',
      operation,
      mutation_id: mutationId,
      source_event_id: invalidationEventId,
      invalidation_id: invalidationId,
      relative_paths: paths.length > 0 ? paths : ['.'],
      strategy: refresh.strategy,
      index_revision: refresh.indexRevision,
      latency_ms: refresh.latencyMs,
    });
    return { state: 'ready', event_id: eventId, mutation_id: mutationId };
  } catch (error) {
    const message = redactMcpText(error instanceof Error ? error.message : String(error)).text;
    let eventId = 'unrecorded';
    try {
      eventId = appendIndexEvent(workspace.root, {
        event_type: 'index_refresh',
        status: 'failed',
        operation,
        mutation_id: mutationId,
        invalidation_id: invalidationId,
        relative_paths: paths.length > 0 ? paths : ['.'],
        error: { code: 'INTERNAL_ADAPTER_ERROR', message, retryable: true },
        dead_letter: { retry_tool: 'local codegraph sync', retryable: true },
      });
    } catch {
      // Mutation success must remain observable even when runtime evidence storage is unavailable.
    }
    return { state: 'failed', event_id: eventId, mutation_id: mutationId, error: message };
  }
}

export function recordCodingProcessCompletion(ctx: CodingToolContext, event: ProcessCompletionEvent): void {
  const workspace = ctx.workspaceManager.getForAudit(event.workspaceId);
  if (!workspace) return;
  const index = refreshCodingIndex(ctx, workspace, [], `proc_${event.sessionId}`, 'exec_command');
  const relativeCwd = relative(event.workspaceRoot, event.cwd).split('\\').join('/') || '.';
  audit(workspace, ctx, 'exec_command', event.exitCode === 0 ? 'ok' : 'failed', { command_hash: event.commandHash }, {
    operation: 'exec_command',
    relativePaths: ['.'],
    mutationId: index.mutation_id,
    indexEventId: index.event_id,
    indexState: index.state,
    durationMs: event.durationMs,
    sessionId: event.sessionId,
    commandHash: event.commandHash,
    relativeCwd,
    exitCode: event.exitCode,
    signal: event.signal,
    totalOutputBytes: event.totalOutputBytes,
    droppedOutputBytes: event.droppedOutputBytes,
    errorCode: event.signal ? `SIGNAL_${event.signal}` : event.exitCode === 0 ? undefined : `EXIT_${String(event.exitCode ?? 'unknown')}`,
  });
}

export function buildCodingToolDefinitions(): CodingToolDefinition[] {
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
  const shell = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
  return [
    {
      name: 'open_workspace',
      description: 'Open an explicitly read-write registered repo for direct coding. Defaults to an isolated managed worktree; checkout mode must be explicit.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_id: { type: 'string' },
          mode: { enum: ['worktree', 'checkout'], default: 'worktree' },
          base_ref: { type: 'string', default: 'HEAD' },
        },
        required: ['repo_id'],
        additionalProperties: false,
      },
      annotations: write,
    },
    {
      name: 'read',
      description: 'Read one non-secret, non-.ignore text file inside an open coding workspace with hash and bounded line output.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_id: { type: 'string' },
          path: { type: 'string' },
          start_line: { type: 'number', minimum: 1 },
          end_line: { type: 'number', minimum: 1 },
          max_bytes: { type: 'number', minimum: 1024, maximum: MAX_READ_BYTES },
        },
        required: ['workspace_id', 'path'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'apply_patch',
      description: 'Atomically apply guarded create, replace, delete, and move operations inside one coding workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_id: { type: 'string' },
          operations: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_PATCH_OPERATIONS,
            items: {
              type: 'object',
              properties: {
                op: { enum: ['create', 'replace', 'delete', 'move'] },
                path: { type: 'string' },
                content: { type: 'string' },
                expected_sha256: { type: 'string' },
                to_path: { type: 'string' },
              },
              required: ['op', 'path'],
              additionalProperties: false,
            },
          },
        },
        required: ['workspace_id', 'operations'],
        additionalProperties: false,
      },
      annotations: write,
    },
    {
      name: 'exec_command',
      description: 'Run arbitrary Bash with local-user authority inside an open coding workspace. This is not a filesystem sandbox.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_id: { type: 'string' },
          cmd: { type: 'string' },
          tty: { type: 'boolean', default: false },
          columns: { type: 'number', minimum: 1, maximum: 1000 },
          rows: { type: 'number', minimum: 1, maximum: 1000 },
          working_directory: { type: 'string', default: '.' },
          yield_time_ms: { type: 'number', minimum: 0, maximum: 30000 },
          max_output_tokens: { type: 'number', minimum: 1, maximum: 100000 },
        },
        required: ['workspace_id', 'cmd'],
        additionalProperties: false,
      },
      annotations: shell,
    },
    {
      name: 'write_stdin',
      description: 'Poll or interact with a running coding process session, including input, Ctrl-C bytes, and PTY resize.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'number' },
          chars: { type: 'string' },
          interrupt: { type: 'boolean', description: 'Send Ctrl-C/SIGINT to the owned process session.' },
          columns: { type: 'number', minimum: 1, maximum: 1000 },
          rows: { type: 'number', minimum: 1, maximum: 1000 },
          yield_time_ms: { type: 'number', minimum: 0, maximum: 30000 },
          max_output_tokens: { type: 'number', minimum: 1, maximum: 100000 },
        },
        required: ['session_id'],
        additionalProperties: false,
      },
      annotations: shell,
    },
  ];
}

function readTool(ctx: CodingToolContext, args: Record<string, unknown>): CodingToolResult {
  const workspace = ctx.workspaceManager.get(String(args.workspace_id ?? ''));
  const target = resolveCodingPath(workspace, args.path, { intent: 'read' });
  if (target.kind !== 'file') throw new CodingWorkspaceError('NOT_A_FILE', 'read requires a regular file', { path: target.relativePath });
  const raw = readFileSync(target.canonicalPath);
  if (raw.includes(0)) throw new CodingWorkspaceError('BINARY_CONTENT', 'read supports UTF-8 text files only', { path: target.relativePath });
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const lines = text.split(/\r?\n/);
  const startLine = integer(args.start_line, 1, 1, Number.MAX_SAFE_INTEGER);
  const requestedEnd = integer(args.end_line, startLine + MAX_READ_LINES - 1, startLine, Number.MAX_SAFE_INTEGER);
  const endLine = Math.min(requestedEnd, startLine + MAX_READ_LINES - 1, lines.length);
  const maxBytes = integer(args.max_bytes, MAX_READ_BYTES, 1024, MAX_READ_BYTES);
  const selected: string[] = [];
  let bytes = 0;
  let truncated = false;
  for (let index = startLine - 1; index < endLine; index += 1) {
    const rendered = `${index + 1}: ${lines[index] ?? ''}`;
    const nextBytes = Buffer.byteLength(rendered) + (selected.length > 0 ? 1 : 0);
    if (bytes + nextBytes > maxBytes) {
      truncated = true;
      break;
    }
    selected.push(rendered);
    bytes += nextBytes;
  }
  audit(workspace, ctx, 'read', 'ok', args, { operation: 'read', relativePaths: [target.relativePath] });
  return textResult({
    workspace_id: workspace.id,
    path: target.relativePath,
    content: selected.join('\n'),
    sha256: sha256(raw),
    start_line: startLine,
    end_line: startLine + selected.length - 1,
    total_lines: lines.length,
    has_more: truncated || endLine < lines.length,
    next_start_line: truncated || endLine < lines.length ? startLine + selected.length : null,
    bytes_returned: bytes,
  });
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function patchOperations(args: Record<string, unknown>): PatchOperation[] {
  if (!Array.isArray(args.operations) || args.operations.length === 0 || args.operations.length > MAX_PATCH_OPERATIONS) {
    throw new CodingWorkspaceError('INVALID_PATCH', `operations must contain 1-${MAX_PATCH_OPERATIONS} items`);
  }
  return args.operations.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new CodingWorkspaceError('INVALID_PATCH', 'patch operation must be an object', { index });
    const entry = raw as Record<string, unknown>;
    const op = stringField(entry.op);
    if (!['create', 'replace', 'delete', 'move'].includes(op)) throw new CodingWorkspaceError('INVALID_PATCH', 'unsupported patch operation', { index, op });
    return {
      op: op as PatchOperation['op'],
      path: stringField(entry.path),
      content: typeof entry.content === 'string' ? entry.content : undefined,
      expectedSha256: stringField(entry.expected_sha256) || undefined,
      toPath: stringField(entry.to_path) || undefined,
    };
  });
}

function snapshotFor(workspace: CodingWorkspace, path: string, allowMissing = true): FileSnapshot {
  const target = resolveCodingPath(workspace, path, { intent: 'write', allowMissing });
  if (!target.exists) return { path: target.relativePath, absolutePath: target.canonicalPath, exists: false, content: Buffer.alloc(0), mode: 0o666 };
  if (target.kind !== 'file') throw new CodingWorkspaceError('NOT_A_FILE', 'patch operations support regular files only', { path: target.relativePath });
  const link = lstatSync(target.canonicalPath);
  if (link.isSymbolicLink()) throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'patch operations do not follow symlinks', { path: target.relativePath });
  return {
    path: target.relativePath,
    absolutePath: target.canonicalPath,
    exists: true,
    content: readFileSync(target.canonicalPath),
    mode: statSync(target.canonicalPath).mode,
  };
}

function assertExpected(snapshot: FileSnapshot, expected: string | undefined): void {
  if (!snapshot.exists) throw new CodingWorkspaceError('NOT_FOUND', 'patch target does not exist', { path: snapshot.path });
  const actual = sha256(snapshot.content);
  if (!expected || expected !== actual) {
    throw new CodingWorkspaceError('REVISION_CONFLICT', 'expected_sha256 does not match current file', { path: snapshot.path, actual_sha256: actual });
  }
}

function fullFileDiff(path: string, before: Buffer | null, after: Buffer | null): string {
  const beforeText = before?.toString('utf-8') ?? '';
  const afterText = after?.toString('utf-8') ?? '';
  const oldLines = beforeText.length ? beforeText.replace(/\n$/, '').split('\n') : [];
  const newLines = afterText.length ? afterText.replace(/\n$/, '').split('\n') : [];
  return [
    `--- ${before === null ? '/dev/null' : `a/${path}`}`,
    `+++ ${after === null ? '/dev/null' : `b/${path}`}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n');
}

function applyPatchTool(ctx: CodingToolContext, args: Record<string, unknown>): CodingToolResult {
  const workspace = ctx.workspaceManager.get(String(args.workspace_id ?? ''));
  const operations = patchOperations(args);
  const snapshots = new Map<string, FileSnapshot>();
  const final = new Map<string, { content: Buffer | null; mode: number }>();
  const results: Array<Record<string, unknown>> = [];
  const touched = new Set<string>();

  const getSnapshot = (path: string): FileSnapshot => {
    const normalized = resolveCodingPath(workspace, path, { intent: 'write', allowMissing: true }).relativePath;
    const existing = snapshots.get(normalized);
    if (existing) return existing;
    const snapshot = snapshotFor(workspace, normalized);
    snapshots.set(normalized, snapshot);
    return snapshot;
  };

  for (const operation of operations) {
    const source = getSnapshot(operation.path);
    if (touched.has(source.path)) throw new CodingWorkspaceError('INVALID_PATCH', 'a path may appear in only one patch operation', { path: source.path });
    touched.add(source.path);
    if (operation.op === 'create') {
      if (source.exists) throw new CodingWorkspaceError('TARGET_EXISTS', 'create target already exists', { path: source.path });
      if (operation.content === undefined) throw new CodingWorkspaceError('INVALID_PATCH', 'create requires content', { path: source.path });
      const content = Buffer.from(operation.content, 'utf-8');
      if (content.length > MAX_PATCH_FILE_BYTES) throw new CodingWorkspaceError('PAYLOAD_LIMIT_REACHED', 'patch file exceeds size limit', { path: source.path });
      final.set(source.path, { content, mode: 0o666 });
      results.push({ op: 'create', path: source.path, before_sha256: null, after_sha256: sha256(content) });
    } else if (operation.op === 'replace') {
      assertExpected(source, operation.expectedSha256);
      if (operation.content === undefined) throw new CodingWorkspaceError('INVALID_PATCH', 'replace requires content', { path: source.path });
      const content = Buffer.from(operation.content, 'utf-8');
      if (content.length > MAX_PATCH_FILE_BYTES) throw new CodingWorkspaceError('PAYLOAD_LIMIT_REACHED', 'patch file exceeds size limit', { path: source.path });
      final.set(source.path, { content, mode: source.mode });
      results.push({ op: 'replace', path: source.path, before_sha256: sha256(source.content), after_sha256: sha256(content) });
    } else if (operation.op === 'delete') {
      assertExpected(source, operation.expectedSha256);
      final.set(source.path, { content: null, mode: source.mode });
      results.push({ op: 'delete', path: source.path, before_sha256: sha256(source.content), after_sha256: null });
    } else {
      assertExpected(source, operation.expectedSha256);
      if (!operation.toPath) throw new CodingWorkspaceError('INVALID_PATCH', 'move requires to_path', { path: source.path });
      const destination = getSnapshot(operation.toPath);
      if (destination.exists || touched.has(destination.path)) throw new CodingWorkspaceError('TARGET_EXISTS', 'move target already exists or is already touched', { path: destination.path });
      touched.add(destination.path);
      final.set(source.path, { content: null, mode: source.mode });
      final.set(destination.path, { content: source.content, mode: source.mode });
      results.push({ op: 'move', path: source.path, to_path: destination.path, before_sha256: sha256(source.content), after_sha256: sha256(source.content) });
    }
  }

  for (const [path, state] of final) {
    const current = snapshotFor(workspace, path);
    const expected = snapshots.get(path);
    if (!expected || current.exists !== expected.exists || (current.exists && sha256(current.content) !== sha256(expected.content))) {
      throw new CodingWorkspaceError('REVISION_CONFLICT', 'file changed during patch preflight', { path });
    }
    if (state.content && state.content.length > MAX_PATCH_FILE_BYTES) throw new CodingWorkspaceError('PAYLOAD_LIMIT_REACHED', 'patch file exceeds size limit', { path });
  }

  const patchId = randomBytes(8).toString('hex');
  const temporary = new Map<string, string>();
  const backups = new Map<string, string>();
  const committed: string[] = [];
  try {
    for (const [path, state] of final) {
      if (state.content === null) continue;
      const target = snapshots.get(path)!;
      const temp = `${target.absolutePath}.repo-harness-mcp-${patchId}.tmp`;
      writeFileSync(temp, state.content, { mode: state.mode });
      chmodSync(temp, state.mode);
      temporary.set(path, temp);
    }
    let commitCount = 0;
    for (const [path, state] of final) {
      const target = snapshots.get(path)!;
      if (target.exists) {
        const backup = `${target.absolutePath}.repo-harness-mcp-${patchId}.bak`;
        renameSync(target.absolutePath, backup);
        backups.set(path, backup);
      }
      // Mark the path before the final rename so rollback also restores a
      // target when the rename itself fails after its backup was created.
      committed.push(path);
      if (state.content !== null) renameSync(temporary.get(path)!, target.absolutePath);
      commitCount += 1;
      ctx.testHooks?.afterPatchCommit?.({ commitCount, path });
    }
  } catch (error) {
    for (const path of committed.reverse()) {
      const target = snapshots.get(path)!;
      rmSync(target.absolutePath, { force: true });
      const backup = backups.get(path);
      if (backup && existsSync(backup)) renameSync(backup, target.absolutePath);
    }
    for (const temp of temporary.values()) rmSync(temp, { force: true });
    for (const backup of backups.values()) rmSync(backup, { force: true });
    throw error;
  }
  for (const backup of backups.values()) rmSync(backup, { force: true });
  for (const temp of temporary.values()) rmSync(temp, { force: true });

  const mutationId = `mut_${randomUUID()}`;
  const paths = [...final.keys()];
  const index = refreshCodingIndex(ctx, workspace, paths, mutationId, 'apply_patch');
  let diff = operations.map((operation) => {
    const source = snapshots.get(resolveCodingPath(workspace, operation.path, { intent: 'write', allowMissing: true }).relativePath)!;
    if (operation.op === 'move' && operation.toPath) {
      return [fullFileDiff(source.path, source.content, null), fullFileDiff(resolveCodingPath(workspace, operation.toPath, { intent: 'write', allowMissing: true }).relativePath, null, source.content)].join('\n');
    }
    const state = final.get(source.path)!;
    return fullFileDiff(source.path, source.exists ? source.content : null, state.content);
  }).join('\n');
  let diffTruncated = false;
  if (Buffer.byteLength(diff) > MAX_DIFF_BYTES) {
    diff = Buffer.from(diff).subarray(0, MAX_DIFF_BYTES).toString('utf-8');
    diffTruncated = true;
  }
  audit(workspace, ctx, 'apply_patch', 'ok', args, {
    operation: 'apply_patch',
    relativePaths: paths,
    mutationId,
    indexEventId: index.event_id,
    indexState: index.state,
  });
  return textResult({
    workspace_id: workspace.id,
    mutation_id: mutationId,
    operations: results,
    diff,
    diff_truncated: diffTruncated,
    index,
  });
}

function processResult(snapshot: ProcessSnapshot): CodingToolResult {
  return textResult({
    session_id: snapshot.sessionId,
    running: snapshot.running,
    tty: snapshot.tty,
    exit_code: snapshot.exitCode,
    signal: snapshot.signal,
    reason: snapshot.reason,
    wall_time_ms: snapshot.wallTimeMs,
    output: snapshot.output,
    output_truncated: snapshot.outputTruncated,
    dropped_output_bytes: snapshot.droppedOutputBytes,
    buffered_output_bytes: snapshot.bufferedOutputBytes,
  });
}

export async function callCodingTool(ctx: CodingToolContext, name: string, args: Record<string, unknown>): Promise<CodingToolResult> {
  let workspace: CodingWorkspace | undefined;
  try {
    if (name === 'open_workspace') {
      const repoId = String(args.repo_id ?? '').trim();
      const mode = args.mode === 'checkout' ? 'checkout' : 'worktree';
      const result = ctx.workspaceManager.open(repoId, mode, String(args.base_ref ?? 'HEAD'));
      workspace = ctx.workspaceManager.get(result.workspace_id);
      audit(workspace, ctx, name, 'ok', args, { operation: 'open_workspace', relativePaths: ['.'] });
      return textResult(result);
    }
    if (name === 'read') return readTool(ctx, args);
    if (name === 'apply_patch') return applyPatchTool(ctx, args);
    if (name === 'exec_command') {
      workspace = ctx.workspaceManager.get(String(args.workspace_id ?? ''));
      const command = String(args.cmd ?? '');
      if (!command.trim()) throw new McpProcessError('INVALID_COMMAND', 'exec_command requires a non-empty cmd');
      const cwd = ctx.workspaceManager.workingDirectory(workspace.id, args.working_directory ?? '.');
      const snapshot = await ctx.processManager.start({
        ownerId: ctx.ownerId,
        workspaceId: workspace.id,
        command,
        cwd,
        workspaceRoot: workspace.root,
        tty: args.tty === true,
        columns: integer(args.columns, 80, 1, 1000),
        rows: integer(args.rows, 24, 1, 1000),
        yieldTimeMs: integer(args.yield_time_ms, 10_000, 0, 30_000),
        maxOutputTokens: integer(args.max_output_tokens, 10_000, 1, 100_000),
      });
      return processResult(snapshot);
    }
    if (name === 'write_stdin') {
      const snapshot = await ctx.processManager.write({
        ownerId: ctx.ownerId,
        sessionId: integer(args.session_id, -1, -1, Number.MAX_SAFE_INTEGER),
        chars: typeof args.chars === 'string' ? args.chars : undefined,
        interrupt: args.interrupt === true,
        columns: args.columns === undefined ? undefined : integer(args.columns, 80, 1, 1000),
        rows: args.rows === undefined ? undefined : integer(args.rows, 24, 1, 1000),
        yieldTimeMs: integer(args.yield_time_ms, 1_000, 0, 30_000),
        maxOutputTokens: integer(args.max_output_tokens, 10_000, 1, 100_000),
      });
      return processResult(snapshot);
    }
    return errorResult('UNKNOWN_TOOL', `unknown coding MCP tool: ${name}`);
  } catch (error) {
    const code = error instanceof CodingWorkspaceError || error instanceof McpProcessError ? error.code : 'TOOL_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    audit(workspace, ctx, name, code === 'TOOL_FAILED' ? 'failed' : 'blocked', args, { operation: name, errorCode: code });
    return errorResult(code, message, error instanceof CodingWorkspaceError ? error.details : undefined);
  }
}

export function isCodingTool(name: string): boolean {
  return buildCodingToolDefinitions().some((tool) => tool.name === name);
}
