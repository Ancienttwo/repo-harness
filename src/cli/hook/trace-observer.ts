/**
 * Typed PostToolUse trace observer.
 *
 * The old `post-tool-observer.sh` route had two durable responsibilities:
 * append one JSONL trace record and emit the Codex plan-annotation advisory.
 * Both now happen in this single in-process handler.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import {
  normalizeRepoRelativePath,
  payloadString,
  payloadValue,
  type HookIdentity,
  type HookPayload,
} from './hook-input';
import { withExclusiveDirectoryLock } from '../../effects/locking/exclusive-directory-lock';

const TRACE_LOCK_PATH = '.ai/harness/state/claude-trace.lock';

export interface TraceObserverFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  realpathSync(path: string): string;
  statSync(path: string): { isFile(): boolean; readonly mtimeMs?: number };
  mkdirSync(path: string, options?: { readonly recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
  appendFileSync(path: string, data: string): void;
}

export interface TraceObserverDependencies {
  readonly fs?: TraceObserverFs;
  readonly now?: () => Date;
  readonly runGit?: (args: readonly string[]) => string;
}

export interface TraceObserverInput {
  readonly repoRoot: string;
  readonly payload: HookPayload;
  readonly identity: HookIdentity;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: TraceObserverDependencies;
}

export interface TraceObserverResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reason?: string;
}

const DEFAULT_FS: TraceObserverFs = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  realpathSync,
  statSync,
  mkdirSync: (path, options) => mkdirSync(path, options),
  writeFileSync: (path, data) => writeFileSync(path, data),
  appendFileSync: (path, data) => appendFileSync(path, data),
};

function valueString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value.trim())) return Number(value);
  return fallback;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, '_');
}

function runIdentifier(now: Date, pid: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `run-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pid}`;
}

function offsetTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const minutes = Math.abs(offset);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}`;
}

function sessionIdentifier(now: Date): string {
  return `session-${now.toISOString()}-${randomUUID()}`;
}

function sessionKey(repoRoot: string, identity: HookIdentity, fsApi: TraceObserverFs, now: Date): string {
  const explicit = identity.sessionId;
  if (explicit) {
    try {
      fsApi.mkdirSync(join(repoRoot, '.claude'), { recursive: true });
      fsApi.writeFileSync(join(repoRoot, '.claude/.session-id'), `${explicit}\n`);
    } catch { /* observer state is advisory */ }
    return explicit;
  }
  const sessionFile = join(repoRoot, '.claude/.session-id');
  try {
    const existing = fsApi.readFileSync(sessionFile, 'utf8').trim();
    if (existing) return existing;
  } catch { /* create below */ }
  const generated = sessionIdentifier(now);
  try {
    fsApi.mkdirSync(dirname(sessionFile), { recursive: true });
    fsApi.writeFileSync(sessionFile, `${generated}\n`);
  } catch { /* observer state is advisory */ }
  return generated;
}

function runId(payload: HookPayload, identity: HookIdentity, session: string, source: string, now: Date): string {
  if (identity.runId) return identity.runId;
  if (session) return `run-${sanitize(source || 'session')}-${sanitize(session)}`;
  const transcript = payloadString(payload, 'transcript_path');
  return transcript ? `run-transcript-${sanitize(transcript)}` : runIdentifier(now, process.pid);
}

function changedPlan(repoRoot: string, runGit: (args: readonly string[]) => string): string {
  let status = '';
  try { status = runGit(['status', '--porcelain=v1', '--untracked-files=no']); } catch { return ''; }
  for (const line of status.split('\n')) {
    const candidate = line.slice(3).trim();
    if (/^plans\/plan-.*\.md$/u.test(candidate)) return candidate;
  }
  return '';
}

function rotateTrace(tracePath: string, fsApi: TraceObserverFs): void {
  if (!fsApi.existsSync(tracePath)) return;
  let raw: string;
  try { raw = fsApi.readFileSync(tracePath, 'utf8'); } catch { return; }
  const lines = raw.split('\n');
  const lineCount = raw.endsWith('\n') ? lines.length - 1 : lines.length;
  if (lineCount <= 10000) return;
  const kept = lines.filter((line, index) => !(index === lines.length - 1 && line === '')).slice(-5000);
  fsApi.writeFileSync(tracePath, `${kept.join('\n')}\n`);
}

export function runTraceObserver(opts: TraceObserverInput): TraceObserverResult {
  const env = opts.env ?? process.env;
  const deps = opts.dependencies ?? {};
  const fsApi = deps.fs ?? DEFAULT_FS;
  const now = (deps.now ?? (() => new Date()))();
  const payload = opts.payload;
  const tracePath = join(opts.repoRoot, '.claude/.trace.jsonl');
  try {
    fsApi.mkdirSync(dirname(tracePath), { recursive: true });
    const session = sessionKey(opts.repoRoot, opts.identity, fsApi, now);
    const sessionSource = valueString(payload.source, 'unknown');
    const eventType = valueString(payload.hook_event_name, 'PostToolUse');
    const toolName = valueString(payload.tool_name, 'unknown');
    const filePath = normalizeRepoRelativePath(
      opts.repoRoot,
      payloadString(payload, 'file_path') || payloadString(payload, 'tool_input.file_path'),
    );
    const exitCode = numberValue(
      payloadValue(payload, 'tool_response.exit_code') ?? payload.exit_code ?? env.EXIT_CODE ?? '0',
      0,
    );
    const durationMs = numberValue(
      payload.duration_ms ?? payloadValue(payload, 'tool_response.duration_ms') ?? env.HOOK_DURATION_MS ?? '0',
      0,
    );
    const id = runId(payload, opts.identity, session, sessionSource, now);
    const agentName = env.CLAUDE_AGENT_NAME ?? env.CODEX_AGENT_NAME ?? env.HOOK_AGENT_NAME ?? 'unknown';
    const host = opts.identity.host;

    if (/^(?:mcp__codegraph__|codegraph_)/u.test(toolName)) {
      const marker = join(opts.repoRoot, '.claude/.codegraph-state', `${sanitize(session)}.used`);
      try {
        fsApi.mkdirSync(dirname(marker), { recursive: true });
        fsApi.writeFileSync(marker, '');
      } catch { /* advisory marker */ }
    }

    const record = {
      ts: offsetTimestamp(now),
      event_type: eventType,
      tool_name: toolName,
      file_path: filePath,
      exit_code: exitCode,
      duration_ms: durationMs,
      session_key: session,
      run_id: id,
      host,
      agent_name: agentName,
      session_source: sessionSource,
    };
    // Rotation rewrites the file from a snapshot. Every writer holds one lock
    // from that snapshot to its append, so no other append can fall between.
    withExclusiveDirectoryLock(realpathSync(opts.repoRoot), TRACE_LOCK_PATH, () => {
      rotateTrace(tracePath, fsApi);
      fsApi.appendFileSync(tracePath, `${JSON.stringify(record)}\n`);
    }, { reclaimStaleEmptyDirectory: true });

    let stdout = '';
    if (toolName === 'apply_patch') {
      const plan = changedPlan(opts.repoRoot, deps.runGit ?? ((args) => execFileSync('git', ['-C', opts.repoRoot, ...args], { encoding: 'utf8' })));
      if (plan) stdout = `[AnnotationGuard] ${plan} has annotations. Process all notes and revise. Do not implement yet.\n`;
    }
    return { exitCode: 0, stdout, stderr: '', reason: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stdout: '', stderr: `[TraceObserver] ${message}\n`, reason: 'write-failed' };
  }
}
