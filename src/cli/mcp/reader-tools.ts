import { createHash } from 'crypto';
import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'fs';
import { createReadStream } from 'fs';
import { opendir } from 'fs/promises';
import { createInterface } from 'readline';
import { join } from 'path';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { globMatches } from './paths';
import { redactMcpText } from './redaction';
import { repoHarnessPackageVersion } from './version';
import { WorkspaceError, WorkspaceManager, type McpWorkspace, type WorkspaceResolvedPath } from './workspaces';
import type { McpPolicy } from './types';

export interface ReaderToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface ReaderToolContext {
  repoRoot: string;
  policy: McpPolicy;
  workspaceManager: WorkspaceManager;
}

export interface ReaderToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

const EMPTY_SCHEMA = { type: 'object', additionalProperties: false };
const DEFAULT_TREE_DEPTH = 3;
const HARD_TREE_DEPTH = 6;
const DEFAULT_TREE_ENTRIES = 300;
const HARD_TREE_ENTRIES = 1000;
const DEFAULT_READ_BYTES = 65_536;
const HARD_READ_BYTES = 262_144;
const MAX_READ_LINES = 2_000;
const BINARY_PROBE_BYTES = 8 * 1024;
const DEFAULT_SEARCH_RESULTS = 50;
const HARD_SEARCH_RESULTS = 100;
const DEFAULT_SEARCH_FILES = 1000;
const HARD_SEARCH_FILES = 2000;
const DEFAULT_SEARCH_TIMEOUT_MS = 3000;
const HARD_SEARCH_TIMEOUT_MS = 5000;
const SEARCH_FILE_SCAN_BYTES = 1024 * 1024;
const SEARCH_SNIPPET_CHARS = 180;
const HARD_RESPONSE_BYTES = 262_144;

function textResult(value: unknown): ReaderToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    structuredContent: typeof value === 'string' ? undefined : value,
  };
}

function errorResult(code: string, message: string, details?: unknown): ReaderToolResult {
  const value = { error: { code, message: redactMcpText(message).text, details } };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

function errorFromWorkspace(error: unknown): ReaderToolResult {
  if (error instanceof WorkspaceError) {
    return errorResult(error.code, error.message, error.details);
  }
  return errorResult('TOOL_FAILED', error instanceof Error ? error.message : String(error));
}

function audit(ctx: ReaderToolContext, tool: string, status: 'ok' | 'blocked' | 'failed', input: unknown, targetPath?: string, error?: string): void {
  tryWriteMcpAuditEntry(ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool,
    status,
    targetPath,
    inputHash: hashMcpInput(input),
    error,
  });
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

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf-8') <= maxBytes) return value;
  const chars = Array.from(value);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = chars.slice(0, mid).join('');
    if (Buffer.byteLength(candidate, 'utf-8') <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return chars.slice(0, low).join('');
}

function isProbablyBinaryPrefix(path: string): boolean {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(BINARY_PROBE_BYTES);
    const bytesRead = readSync(fd, buffer, 0, BINARY_PROBE_BYTES, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    closeSync(fd);
  }
}

function entryType(absolutePath: string): 'file' | 'directory' | 'symlink' | 'other' {
  const lstat = lstatSync(absolutePath);
  if (lstat.isSymbolicLink()) return 'symlink';
  const fileStat = statSync(absolutePath);
  if (fileStat.isFile()) return 'file';
  if (fileStat.isDirectory()) return 'directory';
  return 'other';
}

function schemaHash(): string {
  return sha256(JSON.stringify(buildReaderToolDefinitions()));
}

function workspacePayload(workspace: McpWorkspace): Record<string, unknown> {
  return {
    workspace_id: workspace.id,
    root_id: workspace.rootId,
    display_name: workspace.displayName,
    capability: 'read-only',
  };
}

export function buildReaderToolDefinitions(): ReaderToolDefinition[] {
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const pathSchema = {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      path: { type: 'string', default: '.' },
      max_depth: { type: 'number', minimum: 0, maximum: HARD_TREE_DEPTH },
      max_entries: { type: 'number', minimum: 1, maximum: HARD_TREE_ENTRIES },
      include_hidden: { type: 'boolean' },
    },
    required: ['workspace_id'],
    additionalProperties: false,
  };
  return [
    { name: 'reader_status', description: 'Return read-only repo-harness MCP workspace reader capability status and limits.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'list_allowed_roots', description: 'List configured filesystem roots that can be opened as read-only workspaces.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    {
      name: 'open_workspace',
      description: 'Open an allowed root or child directory as a session-local read-only workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          root_id: { type: 'string' },
          path: { type: 'string', default: '.' },
        },
        required: ['root_id'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    { name: 'tree', description: 'List files and directories under an opened workspace path while applying deny rules and limits.', inputSchema: pathSchema, annotations: readOnly },
    {
      name: 'read_text',
      description: 'Read a text file from an opened workspace by line range with byte limits, line numbers, hash, and redaction metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_id: { type: 'string' },
          path: { type: 'string' },
          start_line: { type: 'number', minimum: 1 },
          end_line: { type: 'number', minimum: 1 },
          max_bytes: { type: 'number', minimum: 1024, maximum: HARD_READ_BYTES },
          line_numbers: { type: 'boolean' },
        },
        required: ['workspace_id', 'path'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
    {
      name: 'search_text',
      description: 'Search text files under an opened workspace using literal matching, limits, and deny rules.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_id: { type: 'string' },
          query: { type: 'string', minLength: 1, maxLength: 512 },
          path: { type: 'string', default: '.' },
          glob: { type: 'string' },
          case_sensitive: { type: 'boolean' },
          max_results: { type: 'number', minimum: 1, maximum: HARD_SEARCH_RESULTS },
          max_files: { type: 'number', minimum: 1, maximum: HARD_SEARCH_FILES },
          timeout_ms: { type: 'number', minimum: 1, maximum: HARD_SEARCH_TIMEOUT_MS },
        },
        required: ['workspace_id', 'query'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
  ];
}

export function isReaderTool(name: string): boolean {
  return buildReaderToolDefinitions().some((tool) => tool.name === name);
}

function readerStatus(ctx: ReaderToolContext): ReaderToolResult {
  return textResult({
    status: 'ok',
    server: 'repo-harness-mcp',
    package_version: repoHarnessPackageVersion(),
    profile: ctx.policy.profile,
    capability: 'workspaceReader',
    read_only: true,
    configured_root_count: ctx.workspaceManager.listAllowedRoots().filter((root) => root.readable).length,
    open_workspace_count: ctx.workspaceManager.openWorkspaceCount,
    schema_hash: schemaHash(),
    limits: {
      max_workspaces: 16,
      max_tree_depth: HARD_TREE_DEPTH,
      max_tree_entries: HARD_TREE_ENTRIES,
      max_search_files: HARD_SEARCH_FILES,
      max_search_results: HARD_SEARCH_RESULTS,
      search_timeout_ms: HARD_SEARCH_TIMEOUT_MS,
      max_response_bytes: HARD_READ_BYTES,
    },
  });
}

function listAllowedRoots(ctx: ReaderToolContext): ReaderToolResult {
  return textResult({
    roots: ctx.workspaceManager.listAllowedRoots().map((root) => ({
      root_id: root.id,
      display_name: root.displayName,
      path: root.canonicalPath,
      readable: root.readable,
    })),
  });
}

function openWorkspace(ctx: ReaderToolContext, args: Record<string, unknown>): ReaderToolResult {
  const rootId = String(args.root_id ?? '').trim();
  if (!rootId) return errorResult('MISSING_ROOT_ID', 'open_workspace requires root_id');
  try {
    return textResult(workspacePayload(ctx.workspaceManager.openWorkspace(rootId, String(args.path ?? '.'))));
  } catch (error) {
    audit(ctx, 'open_workspace', 'blocked', args, undefined, error instanceof Error ? error.message : String(error));
    return errorFromWorkspace(error);
  }
}

function pushBoundedEntry(entries: Record<string, unknown>[], entry: Record<string, unknown>, byteCounter: { bytes: number }): boolean {
  const bytes = Buffer.byteLength(JSON.stringify(entry));
  if (byteCounter.bytes + bytes > HARD_RESPONSE_BYTES) return false;
  entries.push(entry);
  byteCounter.bytes += bytes;
  return true;
}

async function tree(ctx: ReaderToolContext, args: Record<string, unknown>): Promise<ReaderToolResult> {
  let start: WorkspaceResolvedPath;
  try {
    start = ctx.workspaceManager.resolve(String(args.workspace_id ?? ''), args.path ?? '.', { requireDirectory: false });
  } catch (error) {
    return errorFromWorkspace(error);
  }
  if (start.kind !== 'directory') {
    return textResult({
      workspace_id: start.workspace.id,
      path: start.relativePath,
      entries: [{
        path: start.relativePath,
        type: start.kind,
        size: start.size,
        modified_at: start.modifiedAt,
      }],
      truncated: false,
      blocked_entries: 0,
      symlink_entries: start.kind === 'symlink' ? 1 : 0,
    });
  }

  const maxDepth = numberArg(args.max_depth, DEFAULT_TREE_DEPTH, 0, HARD_TREE_DEPTH);
  const maxEntries = numberArg(args.max_entries, DEFAULT_TREE_ENTRIES, 1, HARD_TREE_ENTRIES);
  const includeHidden = booleanArg(args.include_hidden, false);
  const entries: Record<string, unknown>[] = [];
  let blockedEntries = 0;
  let symlinkEntries = 0;
  let truncated = false;
  const responseBytes = { bytes: 0 };

  const walk = async (absoluteDir: string, relativeDir: string, depth: number): Promise<void> => {
    if (entries.length >= maxEntries) {
      truncated = true;
      return;
    }
    let children = [];
    try {
      const dir = await opendir(absoluteDir);
      for await (const child of dir) {
        children.push(child);
      }
      children = children.sort((a, b) => a.name.localeCompare(b.name));
    } catch (_error) {
      blockedEntries += 1;
      return;
    }
    for (const child of children) {
      if (entries.length >= maxEntries) {
        truncated = true;
        return;
      }
      if (!includeHidden && child.name.startsWith('.')) continue;
      const childRelative = relativeDir === '.' ? child.name : `${relativeDir}/${child.name}`;
      let resolved: WorkspaceResolvedPath;
      try {
        resolved = ctx.workspaceManager.resolve(start.workspace.id, childRelative);
      } catch (_error) {
        blockedEntries += 1;
        continue;
      }
      const kind = entryType(resolved.absolutePath);
      if (kind === 'symlink') symlinkEntries += 1;
      const added = pushBoundedEntry(entries, {
        path: childRelative,
        type: kind,
        size: resolved.size,
        modified_at: resolved.modifiedAt,
      }, responseBytes);
      if (!added) {
        truncated = true;
        return;
      }
      if (kind === 'directory' && depth < maxDepth) {
        await walk(resolved.absolutePath, childRelative, depth + 1);
        if (truncated) return;
      }
    }
  };

  await walk(start.absolutePath, start.relativePath, 0);
  audit(ctx, 'tree', 'ok', args, start.relativePath);
  return textResult({
    workspace_id: start.workspace.id,
    path: start.relativePath,
    entries,
    truncated,
    blocked_entries: blockedEntries,
    symlink_entries: symlinkEntries,
  });
}

async function readText(ctx: ReaderToolContext, args: Record<string, unknown>): Promise<ReaderToolResult> {
  let target: WorkspaceResolvedPath;
  try {
    target = ctx.workspaceManager.resolve(String(args.workspace_id ?? ''), args.path, { requireFile: true });
  } catch (error) {
    return errorFromWorkspace(error);
  }
  if (isProbablyBinaryPrefix(target.absolutePath)) return errorResult('BINARY_FILE', 'binary files are not supported');

  const startLine = numberArg(args.start_line, 1, 1, Number.MAX_SAFE_INTEGER);
  const requestedEnd = args.end_line === undefined ? startLine + MAX_READ_LINES - 1 : numberArg(args.end_line, startLine, startLine, Number.MAX_SAFE_INTEGER);
  const endLine = Math.min(requestedEnd, startLine + MAX_READ_LINES - 1);
  const maxBytes = numberArg(args.max_bytes, DEFAULT_READ_BYTES, 1024, HARD_READ_BYTES);
  const lineNumbers = booleanArg(args.line_numbers, true);
  const selected: string[] = [];
  let currentLine = 0;
  let bytesReturned = 0;
  let hasMore = false;
  let truncated = false;

  const stream = createReadStream(target.absolutePath, { encoding: 'utf-8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      currentLine += 1;
      if (currentLine < startLine) continue;
      if (currentLine > endLine) {
        hasMore = true;
        break;
      }
      const rendered = lineNumbers ? `${currentLine}: ${line}` : line;
      const separatorBytes = selected.length > 0 ? Buffer.byteLength('\n') : 0;
      const renderedBytes = Buffer.byteLength(rendered);
      if (bytesReturned + separatorBytes + renderedBytes > maxBytes) {
        const remainingBytes = maxBytes - bytesReturned - separatorBytes;
        if (remainingBytes > 0) {
          const truncatedLine = truncateUtf8(rendered, remainingBytes);
          selected.push(truncatedLine);
          bytesReturned += separatorBytes + Buffer.byteLength(truncatedLine);
        }
        truncated = true;
        hasMore = true;
        break;
      }
      selected.push(rendered);
      bytesReturned += separatorBytes + renderedBytes;
    }
  } finally {
    reader.close();
    stream.destroy();
  }
  const text = selected.join('\n');
  const redacted = redactMcpText(text);
  const actualEndLine = selected.length > 0 ? startLine + selected.length - 1 : startLine - 1;
  audit(ctx, 'read_text', 'ok', args, target.relativePath);
  return textResult({
    workspace_id: target.workspace.id,
    path: target.relativePath,
    text: redacted.text,
    start_line: startLine,
    end_line: actualEndLine,
    line_numbers: lineNumbers,
    bytes_returned: Buffer.byteLength(redacted.text),
    has_more: hasMore,
    next_start_line: hasMore ? actualEndLine + 1 : undefined,
    content_sha256: sha256(Buffer.from(text, 'utf-8')),
    redactions: redacted.redactions,
    truncated,
  });
}

function collectSearchFiles(
  ctx: ReaderToolContext,
  workspaceId: string,
  absoluteDir: string,
  relativeDir: string,
  options: { glob?: string; deadline: number; maxFiles: number },
  out: string[],
  counters: { blocked: number; skipped: number; truncated: boolean; timedOut: boolean },
): void {
  if (Date.now() > options.deadline) {
    counters.timedOut = true;
    return;
  }
  if (out.length >= options.maxFiles) {
    counters.truncated = true;
    return;
  }
  let children;
  try {
    children = readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch (_error) {
    counters.blocked += 1;
    return;
  }
  for (const child of children) {
    if (Date.now() > options.deadline) {
      counters.timedOut = true;
      return;
    }
    if (child.name.startsWith('.')) continue;
    const childRelative = relativeDir === '.' ? child.name : `${relativeDir}/${child.name}`;
    let resolved: WorkspaceResolvedPath;
    try {
      resolved = ctx.workspaceManager.resolve(workspaceId, childRelative);
    } catch (_error) {
      counters.blocked += 1;
      continue;
    }
    const kind = entryType(resolved.absolutePath);
    if (kind === 'directory') {
      collectSearchFiles(ctx, workspaceId, resolved.absolutePath, childRelative, options, out, counters);
      if (counters.timedOut || counters.truncated) return;
    } else if (kind === 'file') {
      if (options.glob && !globMatches(options.glob, childRelative)) continue;
      out.push(childRelative);
      if (out.length >= options.maxFiles) {
        counters.truncated = true;
        return;
      }
    } else {
      counters.skipped += 1;
    }
  }
}

function snippetFor(line: string, column: number): string {
  const start = Math.max(0, column - 60);
  return line.slice(start, start + SEARCH_SNIPPET_CHARS);
}

function searchText(ctx: ReaderToolContext, args: Record<string, unknown>): ReaderToolResult {
  const query = String(args.query ?? '');
  if (query.trim().length === 0) return errorResult('MISSING_QUERY', 'search_text requires a non-empty literal query');
  if (query.length > 512) return errorResult('QUERY_TOO_LONG', 'search_text query is limited to 512 characters');
  let start: WorkspaceResolvedPath;
  try {
    start = ctx.workspaceManager.resolve(String(args.workspace_id ?? ''), args.path ?? '.', { requireDirectory: true });
  } catch (error) {
    return errorFromWorkspace(error);
  }
  const caseSensitive = booleanArg(args.case_sensitive, false);
  const needle = caseSensitive ? query : query.toLowerCase();
  const glob = typeof args.glob === 'string' && args.glob.trim() ? args.glob.trim() : undefined;
  const maxResults = numberArg(args.max_results, DEFAULT_SEARCH_RESULTS, 1, HARD_SEARCH_RESULTS);
  const maxFiles = numberArg(args.max_files, DEFAULT_SEARCH_FILES, 1, HARD_SEARCH_FILES);
  const timeoutMs = numberArg(args.timeout_ms, DEFAULT_SEARCH_TIMEOUT_MS, 1, HARD_SEARCH_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  const files: string[] = [];
  const counters = { blocked: 0, skipped: 0, truncated: false, timedOut: false };
  collectSearchFiles(ctx, start.workspace.id, start.absolutePath, start.relativePath, { glob, deadline, maxFiles }, files, counters);

  const matches: Record<string, unknown>[] = [];
  const responseBytes = { bytes: 0 };
  for (const file of files) {
    if (Date.now() > deadline) {
      counters.timedOut = true;
      break;
    }
    if (matches.length >= maxResults) {
      counters.truncated = true;
      break;
    }
    let resolved: WorkspaceResolvedPath;
    try {
      resolved = ctx.workspaceManager.resolve(start.workspace.id, file, { requireFile: true });
    } catch (_error) {
      counters.blocked += 1;
      continue;
    }
    if ((resolved.size ?? 0) > SEARCH_FILE_SCAN_BYTES || isProbablyBinaryPrefix(resolved.absolutePath)) {
      counters.skipped += 1;
      continue;
    }
    const lines = readFileSync(resolved.absolutePath, 'utf-8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (Date.now() > deadline) {
        counters.timedOut = true;
        break;
      }
      const haystack = caseSensitive ? lines[index] : lines[index].toLowerCase();
      const column = haystack.indexOf(needle);
      if (column < 0) continue;
      const redacted = redactMcpText(snippetFor(lines[index], column));
      const added = pushBoundedEntry(matches, {
        path: resolved.relativePath,
        line: index + 1,
        column: column + 1,
        snippet: redacted.text,
        redactions: redacted.redactions,
      }, responseBytes);
      if (!added || matches.length >= maxResults) {
        counters.truncated = true;
        break;
      }
    }
    if (counters.timedOut || counters.truncated) break;
  }

  audit(ctx, 'search_text', 'ok', args, start.relativePath);
  return textResult({
    workspace_id: start.workspace.id,
    query,
    path: start.relativePath,
    glob,
    matches,
    files_scanned: files.length,
    files_skipped: counters.skipped,
    blocked_files: counters.blocked,
    truncated: counters.truncated,
    timed_out: counters.timedOut,
  });
}

export async function callReaderTool(ctx: ReaderToolContext, name: string, args: Record<string, unknown> = {}): Promise<ReaderToolResult> {
  try {
    switch (name) {
      case 'reader_status':
        audit(ctx, name, 'ok', args);
        return readerStatus(ctx);
      case 'list_allowed_roots':
        audit(ctx, name, 'ok', args);
        return listAllowedRoots(ctx);
      case 'open_workspace':
        return openWorkspace(ctx, args);
      case 'tree':
        return tree(ctx, args);
      case 'read_text':
        return readText(ctx, args);
      case 'search_text':
        return searchText(ctx, args);
      default:
        return errorResult('TOOL_NOT_AVAILABLE_FOR_CAPABILITY', `tool is not available for workspace reader capability: ${name}`);
    }
  } catch (error) {
    audit(ctx, name, 'failed', args, undefined, error instanceof Error ? error.message : String(error));
    return errorResult('TOOL_FAILED', error instanceof Error ? error.message : String(error));
  }
}

export function createReaderToolContext(repoRoot: string, policy: McpPolicy, workspaceManager?: WorkspaceManager): ReaderToolContext {
  return {
    repoRoot,
    policy,
    workspaceManager: workspaceManager ?? new WorkspaceManager({ allowedRoots: policy.allowedRoots ?? [], policy }),
  };
}

export function localReaderSmokeFile(repoRoot: string): string {
  return join(repoRoot, 'README.md');
}
