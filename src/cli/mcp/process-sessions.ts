import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import { createHash } from 'crypto';
import { chmodSync, existsSync, realpathSync, statSync } from 'fs';
import { createRequire } from 'module';
import { dirname, isAbsolute, join, relative, resolve } from 'path';

const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MAX_RUNTIME_MS = 30 * 60 * 1_000;
const DEFAULT_RING_BYTES = 4 * 1024 * 1024;
const DEFAULT_COMPLETED_RETENTION_MS = 15 * 60 * 1_000;
const DEFAULT_INITIAL_YIELD_MS = 10_000;
const DEFAULT_POLL_YIELD_MS = 5_000;
const DEFAULT_INTERACTIVE_YIELD_MS = 250;
const MAX_YIELD_MS = 30_000;
const DEFAULT_RESPONSE_TOKENS = 10_000;
const MAX_RESPONSE_TOKENS = 100_000;
const APPROXIMATE_BYTES_PER_TOKEN = 4;
const MAX_COMMAND_BYTES = 64 * 1024;
const MAX_STDIN_BYTES = 64 * 1024;
const DEFAULT_TERMINATION_GRACE_MS = 2_000;
const MIN_TERMINATION_GRACE_MS = 10;

export const MCP_PROCESS_ENV_ALLOWLIST = [
  'HOME',
  'USER',
  'LOGNAME',
  'PATH',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
] as const;

const DENIED_ENV_KEY_PARTS = [
  'MCP',
  'TUNNEL',
  'OAUTH',
  'CODEX',
  'CLAUDE',
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSPHRASE',
  'API_KEY',
  'PRIVATE_KEY',
  'CREDENTIAL',
  'COOKIE',
  'AUTHORIZATION',
] as const;

export type ProcessCompletionReason =
  | 'exit'
  | 'signal'
  | 'timeout'
  | 'terminated'
  | 'owner_cleanup'
  | 'workspace_cleanup'
  | 'shutdown'
  | 'spawn_error';

export interface ProcessStartInput {
  ownerId: string;
  workspaceId: string;
  command: string;
  cwd: string;
  workspaceRoot: string;
  tty?: boolean;
  columns?: number;
  rows?: number;
  yieldTimeMs?: number;
  maxOutputTokens?: number;
}

export interface ProcessWriteInput {
  ownerId: string;
  workspaceId?: string;
  sessionId: number;
  chars?: string;
  interrupt?: boolean;
  columns?: number;
  rows?: number;
  yieldTimeMs?: number;
  maxOutputTokens?: number;
}

export interface ProcessTerminateInput {
  ownerId: string;
  workspaceId: string;
  sessionId: number;
  signal?: NodeJS.Signals;
}

export interface ProcessAuditMetadata {
  sessionId: number;
  ownerIdHash: string;
  workspaceId: string;
  commandHash: string;
  commandLength: number;
  tty: boolean;
  startedAt: string;
}

export interface ProcessCompletionEvent extends ProcessAuditMetadata {
  cwd: string;
  workspaceRoot: string;
  completedAt: string;
  durationMs: number;
  exitCode?: number;
  signal?: string;
  reason: ProcessCompletionReason;
  totalOutputBytes: number;
  droppedOutputBytes: number;
}

export interface ProcessSnapshot {
  sessionId: number;
  running: boolean;
  tty: boolean;
  output: string;
  outputTruncated: boolean;
  droppedOutputBytes: number;
  bufferedOutputBytes: number;
  exitCode?: number;
  signal?: string;
  reason?: ProcessCompletionReason;
  wallTimeMs: number;
  audit: ProcessAuditMetadata;
}

export interface ProcessPty {
  readonly pid: number;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): { dispose?(): void } | void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose?(): void } | void;
}

export interface ProcessPtySpawnInput {
  shellPath: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  columns: number;
  rows: number;
}

export type ProcessPtyFactory = (input: ProcessPtySpawnInput) => Promise<ProcessPty>;

export interface McpProcessSessionManagerOptions {
  maxConcurrent?: number;
  maxRuntimeMs?: number;
  ringBytes?: number;
  completedRetentionMs?: number;
  terminationGraceMs?: number;
  shellPath?: string;
  baseEnv?: NodeJS.ProcessEnv;
  configuredEnv?: Record<string, string>;
  now?: () => number;
  ptyFactory?: ProcessPtyFactory;
  onComplete?: (event: ProcessCompletionEvent) => void | Promise<void>;
  onCompletionError?: (error: unknown, event: ProcessCompletionEvent) => void;
}

interface ManagedProcess {
  readonly pid?: number;
  write(data: string): void;
  resize?(columns: number, rows: number): void;
  signal(signal: NodeJS.Signals): void;
}

interface ProcessSession {
  id: number;
  ownerId: string;
  workspaceId: string;
  command: string;
  commandHash: string;
  commandLength: number;
  cwd: string;
  workspaceRoot: string;
  tty: boolean;
  columns: number;
  rows: number;
  startedAtMs: number;
  completedAtMs?: number;
  process?: ManagedProcess;
  ring: ByteRingBuffer;
  totalOutputBytes: number;
  totalDroppedOutputBytes: number;
  running: boolean;
  exitCode?: number;
  signal?: string;
  reason?: ProcessCompletionReason;
  exitPromise: Promise<void>;
  resolveExit: () => void;
  activityVersion: number;
  activityWaiters: Set<() => void>;
  runtimeTimer?: ReturnType<typeof setTimeout>;
  retentionTimer?: ReturnType<typeof setTimeout>;
  escalationTimer?: ReturnType<typeof setTimeout>;
  requestedReason?: ProcessCompletionReason;
  completionEmitted: boolean;
}

export class McpProcessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'McpProcessError';
  }
}

class ByteRingBuffer {
  private chunks: Buffer[] = [];
  private retainedBytes = 0;
  private droppedSinceDrain = 0;

  constructor(private readonly capacityBytes: number) {}

  get size(): number {
    return this.retainedBytes;
  }

  append(data: Buffer): number {
    if (data.length === 0) return 0;
    this.chunks.push(data);
    this.retainedBytes += data.length;

    let dropped = 0;
    while (this.retainedBytes > this.capacityBytes && this.chunks.length > 0) {
      const overflow = this.retainedBytes - this.capacityBytes;
      const first = this.chunks[0];
      if (!first) break;
      if (first.length <= overflow) {
        this.chunks.shift();
        this.retainedBytes -= first.length;
        dropped += first.length;
      } else {
        this.chunks[0] = first.subarray(overflow);
        this.retainedBytes -= overflow;
        dropped += overflow;
      }
    }
    this.droppedSinceDrain += dropped;
    return dropped;
  }

  drain(maxBytes: number): { output: string; droppedBytes: number; bufferedBytes: number } {
    let remaining = Math.min(maxBytes, this.retainedBytes);
    const output: Buffer[] = [];
    while (remaining > 0 && this.chunks.length > 0) {
      const first = this.chunks[0];
      if (!first) break;
      if (first.length <= remaining) {
        output.push(first);
        this.chunks.shift();
        this.retainedBytes -= first.length;
        remaining -= first.length;
      } else {
        output.push(first.subarray(0, remaining));
        this.chunks[0] = first.subarray(remaining);
        this.retainedBytes -= remaining;
        remaining = 0;
      }
    }
    const droppedBytes = this.droppedSinceDrain;
    this.droppedSinceDrain = 0;
    return {
      output: Buffer.concat(output).toString('utf-8'),
      droppedBytes,
      bufferedBytes: this.retainedBytes,
    };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new McpProcessError('INVALID_LIMIT', `${name} must be a non-negative integer`);
  }
  return Math.min(value, maximum);
}

function boundedPositiveOption(value: number | undefined, fallback: number, maximum: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new McpProcessError('INVALID_LIMIT', `${name} must be a positive integer`);
  }
  return Math.min(value, maximum);
}

function terminalDimension(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 1_000) {
    throw new McpProcessError('INVALID_TERMINAL_SIZE', `${name} must be an integer between 1 and 1000`);
  }
  return value;
}

function deniedEnvironmentKey(key: string): boolean {
  const upper = key.toUpperCase();
  return DENIED_ENV_KEY_PARTS.some((part) => upper.includes(part));
}

export function buildMcpProcessEnvironment(options: {
  baseEnv?: NodeJS.ProcessEnv;
  configuredEnv?: Record<string, string>;
  tty?: boolean;
} = {}): Record<string, string> {
  const baseEnv = options.baseEnv ?? process.env;
  const env: Record<string, string> = {};
  for (const key of MCP_PROCESS_ENV_ALLOWLIST) {
    const value = baseEnv[key];
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(options.configuredEnv ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new McpProcessError('ENV_KEY_INVALID', 'configured environment key is invalid', { key });
    }
    if (deniedEnvironmentKey(key)) {
      throw new McpProcessError('ENV_KEY_DENIED', 'configured environment key is denied for coding processes', { key });
    }
    env[key] = value;
  }
  env.NO_COLOR = '1';
  env.PAGER = 'cat';
  env.GIT_PAGER = 'cat';
  env.GH_PAGER = 'cat';
  env.TERM = options.tty ? 'xterm-256color' : 'dumb';
  return env;
}

function canonicalWorkingDirectory(cwd: string, workspaceRoot: string): { cwd: string; workspaceRoot: string } {
  try {
    const canonicalRoot = realpathSync(workspaceRoot);
    const canonicalCwd = realpathSync(cwd);
    if (!statSync(canonicalRoot).isDirectory() || !statSync(canonicalCwd).isDirectory()) {
      throw new McpProcessError('WORKING_DIRECTORY_DENIED', 'workspace root and working directory must be directories');
    }
    const relationship = relative(canonicalRoot, canonicalCwd);
    if (relationship !== '' && (isAbsolute(relationship) || relationship === '..' || relationship.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))) {
      throw new McpProcessError('WORKING_DIRECTORY_DENIED', 'working directory is outside the workspace root');
    }
    return { cwd: canonicalCwd, workspaceRoot: canonicalRoot };
  } catch (error) {
    if (error instanceof McpProcessError) throw error;
    throw new McpProcessError('WORKING_DIRECTORY_DENIED', 'workspace root or working directory is unavailable');
  }
}

function defaultShellPath(): string {
  return process.platform === 'win32' ? 'bash.exe' : '/bin/bash';
}

function ensureNodePtySpawnHelperExecutable(): void {
  if (process.platform === 'win32') return;
  const require = createRequire(import.meta.url);
  const packageRoot = resolve(dirname(require.resolve('node-pty')), '..');
  const candidates = [
    join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    join(packageRoot, 'build', 'Release', 'spawn-helper'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) chmodSync(candidate, 0o755);
  }
}

async function defaultPtyFactory(input: ProcessPtySpawnInput): Promise<ProcessPty> {
  if (process.versions.bun) {
    throw new McpProcessError('PTY_UNAVAILABLE', 'node-pty is unavailable in the Bun runtime');
  }
  let nodePty: typeof import('node-pty');
  try {
    nodePty = await import('node-pty');
  } catch (_error) {
    throw new McpProcessError('PTY_UNAVAILABLE', 'PTY support requires the optional node-pty dependency');
  }
  try {
    ensureNodePtySpawnHelperExecutable();
    return nodePty.spawn(input.shellPath, input.args, {
      cwd: input.cwd,
      env: input.env,
      name: 'xterm-256color',
      cols: input.columns,
      rows: input.rows,
    });
  } catch (_error) {
    throw new McpProcessError('PTY_UNAVAILABLE', 'PTY could not be started');
  }
}

export class McpProcessSessionManager {
  private readonly sessions = new Map<number, ProcessSession>();
  private readonly maxConcurrent: number;
  private readonly maxRuntimeMs: number;
  private readonly ringBytes: number;
  private readonly completedRetentionMs: number;
  private readonly terminationGraceMs: number;
  private readonly shellPath: string;
  private readonly environment: Record<string, string>;
  private readonly now: () => number;
  private readonly ptyFactory: ProcessPtyFactory;
  private readonly onComplete?: McpProcessSessionManagerOptions['onComplete'];
  private readonly onCompletionError?: McpProcessSessionManagerOptions['onCompletionError'];
  private startingCount = 0;
  private nextSessionId = 1;
  private shuttingDown = false;
  private shutdownPromise?: Promise<void>;

  constructor(options: McpProcessSessionManagerOptions = {}) {
    this.maxConcurrent = boundedPositiveOption(options.maxConcurrent, DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT, 'maxConcurrent');
    this.maxRuntimeMs = boundedPositiveOption(options.maxRuntimeMs, DEFAULT_MAX_RUNTIME_MS, DEFAULT_MAX_RUNTIME_MS, 'maxRuntimeMs');
    this.ringBytes = boundedPositiveOption(options.ringBytes, DEFAULT_RING_BYTES, DEFAULT_RING_BYTES, 'ringBytes');
    this.completedRetentionMs = boundedPositiveOption(
      options.completedRetentionMs,
      DEFAULT_COMPLETED_RETENTION_MS,
      DEFAULT_COMPLETED_RETENTION_MS,
      'completedRetentionMs',
    );
    this.terminationGraceMs = boundedPositiveOption(
      options.terminationGraceMs,
      DEFAULT_TERMINATION_GRACE_MS,
      DEFAULT_TERMINATION_GRACE_MS,
      'terminationGraceMs',
    );
    if (this.terminationGraceMs < MIN_TERMINATION_GRACE_MS) {
      throw new McpProcessError('INVALID_LIMIT', `terminationGraceMs must be at least ${MIN_TERMINATION_GRACE_MS}`);
    }
    this.shellPath = options.shellPath ?? defaultShellPath();
    this.environment = buildMcpProcessEnvironment({ baseEnv: options.baseEnv, configuredEnv: options.configuredEnv });
    this.now = options.now ?? Date.now;
    this.ptyFactory = options.ptyFactory ?? defaultPtyFactory;
    this.onComplete = options.onComplete;
    this.onCompletionError = options.onCompletionError;
  }

  get runningCount(): number {
    return Array.from(this.sessions.values()).filter((session) => session.running).length;
  }

  get retainedCount(): number {
    return this.sessions.size;
  }

  async start(input: ProcessStartInput): Promise<ProcessSnapshot> {
    if (this.shuttingDown) throw new McpProcessError('PROCESS_MANAGER_CLOSED', 'process manager is shutting down');
    this.validateStartInput(input);
    if (this.runningCount + this.startingCount >= this.maxConcurrent) {
      throw new McpProcessError('PROCESS_LIMIT_REACHED', `at most ${this.maxConcurrent} coding processes may run concurrently`);
    }

    this.startingCount += 1;
    let reservationHeld = true;
    try {
      const paths = canonicalWorkingDirectory(input.cwd, input.workspaceRoot);
      const session = this.createSession(input, paths);
      if (input.tty) await this.startPty(session);
      else this.startPipe(session);
      this.sessions.set(session.id, session);
      this.startingCount -= 1;
      reservationHeld = false;
      if (session.running) this.startRuntimeTimer(session);

      const yieldTimeMs = boundedInteger(input.yieldTimeMs, DEFAULT_INITIAL_YIELD_MS, MAX_YIELD_MS, 'yieldTimeMs');
      await this.waitForExit(session, yieldTimeMs);
      return this.snapshot(session, input.maxOutputTokens);
    } finally {
      if (reservationHeld) this.startingCount -= 1;
    }
  }

  async write(input: ProcessWriteInput): Promise<ProcessSnapshot> {
    const session = this.getOwnedSession(input.ownerId, input.workspaceId, input.sessionId);
    const columns = input.columns === undefined ? undefined : terminalDimension(input.columns, session.columns, 'columns');
    const rows = input.rows === undefined ? undefined : terminalDimension(input.rows, session.rows, 'rows');
    const chars = input.chars ?? '';
    const interactionRequested = Boolean(input.interrupt || chars.length > 0 || columns !== undefined || rows !== undefined);
    if (!session.running && interactionRequested) {
      throw new McpProcessError('PROCESS_NOT_RUNNING', 'completed process sessions only support output polling');
    }
    if ((columns !== undefined || rows !== undefined) && !session.process?.resize) {
      throw new McpProcessError('PTY_REQUIRED', 'terminal resize requires a PTY process');
    }
    if (columns !== undefined || rows !== undefined) {
      session.columns = columns ?? session.columns;
      session.rows = rows ?? session.rows;
      session.process?.resize?.(session.columns, session.rows);
    }
    if (Buffer.byteLength(chars, 'utf-8') > MAX_STDIN_BYTES) {
      throw new McpProcessError('STDIN_TOO_LARGE', `write_stdin input exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    const containsCtrlC = chars.includes('\u0003');
    if (session.running && (input.interrupt || containsCtrlC)) {
      if (session.tty && session.process) {
        session.process.write('\u0003');
      } else {
        session.process?.signal('SIGINT');
      }
    }
    const writable = containsCtrlC ? chars.replaceAll('\u0003', '') : chars;
    if (session.running && writable.length > 0) session.process?.write(writable);
    if (session.running && (interactionRequested || session.ring.size === 0)) {
      const fallback = interactionRequested ? DEFAULT_INTERACTIVE_YIELD_MS : DEFAULT_POLL_YIELD_MS;
      const yieldTimeMs = boundedInteger(input.yieldTimeMs, fallback, MAX_YIELD_MS, 'yieldTimeMs');
      await this.waitForActivity(session, yieldTimeMs);
    }
    return this.snapshot(session, input.maxOutputTokens);
  }

  terminateSession(input: ProcessTerminateInput): ProcessSnapshot {
    const session = this.getOwnedSession(input.ownerId, input.workspaceId, input.sessionId);
    if (session.running) this.requestTermination(session, 'terminated', input.signal ?? 'SIGTERM');
    return this.snapshot(session);
  }

  terminateOwner(ownerId: string): number {
    return this.terminateMatching((session) => session.ownerId === ownerId, 'owner_cleanup');
  }

  terminateWorkspace(ownerId: string, workspaceId: string): number {
    return this.terminateMatching(
      (session) => session.ownerId === ownerId && session.workspaceId === workspaceId,
      'workspace_cleanup',
    );
  }

  reapExpired(): number {
    const now = this.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.running || session.reason === undefined) continue;
      const completedAt = session.completedAtMs ?? session.startedAtMs;
      if (now - completedAt < this.completedRetentionMs) continue;
      this.removeSession(id);
      removed += 1;
    }
    return removed;
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shuttingDown = true;
    this.shutdownPromise = (async () => {
      const running = Array.from(this.sessions.values()).filter((session) => session.running);
      for (const session of running) this.requestTermination(session, 'shutdown', 'SIGTERM');
      await Promise.all(running.map((session) => this.waitForExit(session, this.terminationGraceMs + 250)));
      for (const id of Array.from(this.sessions.keys())) this.removeSession(id);
    })();
    return this.shutdownPromise;
  }

  private validateStartInput(input: ProcessStartInput): void {
    if (!input.ownerId.trim() || !input.workspaceId.trim()) {
      throw new McpProcessError('PROCESS_OWNER_REQUIRED', 'ownerId and workspaceId are required');
    }
    if (!input.command.trim()) throw new McpProcessError('COMMAND_REQUIRED', 'command must not be empty');
    if (Buffer.byteLength(input.command, 'utf-8') > MAX_COMMAND_BYTES) {
      throw new McpProcessError('COMMAND_TOO_LARGE', `command exceeds ${MAX_COMMAND_BYTES} bytes`);
    }
    terminalDimension(input.columns, 80, 'columns');
    terminalDimension(input.rows, 24, 'rows');
  }

  private createSession(
    input: ProcessStartInput,
    paths: { cwd: string; workspaceRoot: string },
  ): ProcessSession {
    let resolveExit = (): void => undefined;
    const exitPromise = new Promise<void>((resolvePromise) => {
      resolveExit = resolvePromise;
    });
    return {
      id: this.nextSessionId++,
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      command: input.command,
      commandHash: sha256(input.command),
      commandLength: input.command.length,
      cwd: paths.cwd,
      workspaceRoot: paths.workspaceRoot,
      tty: input.tty === true,
      columns: terminalDimension(input.columns, 80, 'columns'),
      rows: terminalDimension(input.rows, 24, 'rows'),
      startedAtMs: this.now(),
      ring: new ByteRingBuffer(this.ringBytes),
      totalOutputBytes: 0,
      totalDroppedOutputBytes: 0,
      running: true,
      exitPromise,
      resolveExit,
      activityVersion: 0,
      activityWaiters: new Set(),
      completionEmitted: false,
    };
  }

  private startPipe(session: ProcessSession): void {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.shellPath, ['-c', session.command], {
        cwd: session.cwd,
        env: { ...this.environment, TERM: 'dumb' },
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: 'pipe',
      });
    } catch (_error) {
      this.appendOutput(session, Buffer.from('process failed to start\n'));
      this.finish(session, undefined, undefined, 'spawn_error');
      return;
    }
    session.process = {
      pid: child.pid,
      write: (data) => child.stdin.write(data),
      signal: (signal) => signalProcessTree(child.pid, signal, child),
    };
    child.stdout.on('data', (data: Buffer) => this.appendOutput(session, data));
    child.stderr.on('data', (data: Buffer) => this.appendOutput(session, data));
    child.stdin.on('error', () => {
      if (session.running) this.appendOutput(session, Buffer.from('process stdin is unavailable\n'));
    });
    child.on('error', () => {
      this.appendOutput(session, Buffer.from('process failed to start\n'));
      this.finish(session, undefined, undefined, 'spawn_error');
    });
    child.on('close', (code, signal) => {
      this.finish(session, code ?? undefined, signal ?? undefined);
    });
  }

  private async startPty(session: ProcessSession): Promise<void> {
    let pty: ProcessPty;
    try {
      pty = await this.ptyFactory({
        shellPath: this.shellPath,
        args: ['-c', session.command],
        cwd: session.cwd,
        env: { ...this.environment, TERM: 'xterm-256color' },
        columns: session.columns,
        rows: session.rows,
      });
    } catch (error) {
      if (error instanceof McpProcessError) throw error;
      throw new McpProcessError('PTY_UNAVAILABLE', 'PTY could not be started');
    }
    session.process = {
      pid: pty.pid,
      write: (data) => pty.write(data),
      resize: (columns, rows) => pty.resize(columns, rows),
      signal: (signal) => signalPtyTree(pty, signal),
    };
    pty.onData((data) => this.appendOutput(session, Buffer.from(data)));
    pty.onExit(({ exitCode, signal }) => {
      this.finish(session, exitCode, signal ? String(signal) : undefined);
    });
  }

  private startRuntimeTimer(session: ProcessSession): void {
    session.runtimeTimer = setTimeout(() => {
      if (session.running) this.requestTermination(session, 'timeout', 'SIGTERM');
    }, this.maxRuntimeMs);
    session.runtimeTimer.unref?.();
  }

  private appendOutput(session: ProcessSession, data: Buffer): void {
    if (data.length === 0) return;
    session.totalOutputBytes += data.length;
    session.totalDroppedOutputBytes += session.ring.append(data);
    this.notifyActivity(session);
  }

  private notifyActivity(session: ProcessSession): void {
    session.activityVersion += 1;
    for (const resolveWaiter of session.activityWaiters) resolveWaiter();
    session.activityWaiters.clear();
  }

  private finish(
    session: ProcessSession,
    exitCode?: number,
    signal?: string,
    explicitReason?: ProcessCompletionReason,
  ): void {
    if (!session.running) return;
    session.running = false;
    session.exitCode = exitCode;
    session.signal = signal;
    session.reason = explicitReason ?? session.requestedReason ?? (signal ? 'signal' : 'exit');
    session.completedAtMs = this.now();
    session.command = '';
    if (session.runtimeTimer) clearTimeout(session.runtimeTimer);
    if (session.escalationTimer) clearTimeout(session.escalationTimer);
    session.resolveExit();
    this.notifyActivity(session);
    session.retentionTimer = setTimeout(() => this.removeSession(session.id), this.completedRetentionMs);
    session.retentionTimer.unref?.();
    this.emitCompletion(session);
  }

  private emitCompletion(session: ProcessSession): void {
    if (session.completionEmitted) return;
    session.completionEmitted = true;
    const event: ProcessCompletionEvent = {
      ...this.auditMetadata(session),
      cwd: session.cwd,
      workspaceRoot: session.workspaceRoot,
      completedAt: new Date(session.completedAtMs ?? this.now()).toISOString(),
      durationMs: this.wallTimeMs(session),
      exitCode: session.exitCode,
      signal: session.signal,
      reason: session.reason ?? 'exit',
      totalOutputBytes: session.totalOutputBytes,
      droppedOutputBytes: session.totalDroppedOutputBytes,
    };
    if (!this.onComplete) return;
    try {
      const result = this.onComplete(event);
      void Promise.resolve(result).catch((error) => this.onCompletionError?.(error, event));
    } catch (error) {
      this.onCompletionError?.(error, event);
    }
  }

  private requestTermination(session: ProcessSession, reason: ProcessCompletionReason, signal: NodeJS.Signals): void {
    if (!session.running) return;
    session.requestedReason = reason;
    try {
      session.process?.signal(signal);
    } catch (_error) {
      // The process may have exited between the ownership check and signal delivery.
    }
    if (signal === 'SIGKILL') return;
    if (session.escalationTimer) clearTimeout(session.escalationTimer);
    session.escalationTimer = setTimeout(() => {
      if (!session.running) return;
      try {
        session.process?.signal('SIGKILL');
      } catch (_error) {
        // The process may have exited before escalation.
      }
    }, this.terminationGraceMs);
    session.escalationTimer.unref?.();
  }

  private terminateMatching(predicate: (session: ProcessSession) => boolean, reason: ProcessCompletionReason): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (!session.running || !predicate(session)) continue;
      this.requestTermination(session, reason, 'SIGTERM');
      count += 1;
    }
    return count;
  }

  private getOwnedSession(ownerId: string, workspaceId: string | undefined, sessionId: number): ProcessSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId || (workspaceId !== undefined && session.workspaceId !== workspaceId)) {
      throw new McpProcessError('PROCESS_ACCESS_DENIED', 'process session is unavailable for this coding authorization and workspace');
    }
    return session;
  }

  private async waitForExit(session: ProcessSession, yieldTimeMs: number): Promise<void> {
    if (!session.running || yieldTimeMs === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        session.exitPromise,
        new Promise<void>((resolvePromise) => {
          timer = setTimeout(resolvePromise, yieldTimeMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async waitForActivity(session: ProcessSession, yieldTimeMs: number): Promise<void> {
    if (!session.running || yieldTimeMs === 0) return;
    const baseline = session.activityVersion;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveActivity = (): void => undefined;
    const activity = new Promise<void>((resolvePromise) => {
      resolveActivity = resolvePromise;
      session.activityWaiters.add(resolvePromise);
    });
    if (session.activityVersion !== baseline) {
      session.activityWaiters.delete(resolveActivity);
      return;
    }
    try {
      await Promise.race([
        activity,
        session.exitPromise,
        new Promise<void>((resolvePromise) => {
          timer = setTimeout(resolvePromise, yieldTimeMs);
        }),
      ]);
    } finally {
      session.activityWaiters.delete(resolveActivity);
      if (timer) clearTimeout(timer);
    }
  }

  private snapshot(session: ProcessSession, requestedOutputTokens?: number): ProcessSnapshot {
    const maxOutputTokens = boundedPositiveOption(
      requestedOutputTokens,
      DEFAULT_RESPONSE_TOKENS,
      MAX_RESPONSE_TOKENS,
      'maxOutputTokens',
    );
    const drained = session.ring.drain(maxOutputTokens * APPROXIMATE_BYTES_PER_TOKEN);
    return {
      sessionId: session.id,
      running: session.running,
      tty: session.tty,
      output: drained.output,
      outputTruncated: drained.droppedBytes > 0,
      droppedOutputBytes: drained.droppedBytes,
      bufferedOutputBytes: drained.bufferedBytes,
      exitCode: session.exitCode,
      signal: session.signal,
      reason: session.reason,
      wallTimeMs: this.wallTimeMs(session),
      audit: this.auditMetadata(session),
    };
  }

  private auditMetadata(session: ProcessSession): ProcessAuditMetadata {
    return {
      sessionId: session.id,
      ownerIdHash: sha256(session.ownerId),
      workspaceId: session.workspaceId,
      commandHash: session.commandHash,
      commandLength: session.commandLength,
      tty: session.tty,
      startedAt: new Date(session.startedAtMs).toISOString(),
    };
  }

  private wallTimeMs(session: ProcessSession): number {
    return Math.max(0, (session.completedAtMs ?? this.now()) - session.startedAtMs);
  }

  private removeSession(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.runtimeTimer) clearTimeout(session.runtimeTimer);
    if (session.retentionTimer) clearTimeout(session.retentionTimer);
    if (session.escalationTimer) clearTimeout(session.escalationTimer);
    for (const resolveWaiter of session.activityWaiters) resolveWaiter();
    session.activityWaiters.clear();
    this.sessions.delete(sessionId);
  }
}

function signalProcessTree(
  pid: number | undefined,
  signal: NodeJS.Signals,
  child?: ChildProcessWithoutNullStreams,
): void {
  if (!pid) {
    child?.kill(signal);
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (_error) {
    try {
      child?.kill(signal);
    } catch (_childError) {
      // The process has already exited.
    }
  }
}

function signalPtyTree(pty: ProcessPty, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && pty.pid > 0) {
    try {
      process.kill(-pty.pid, signal);
      return;
    } catch (_error) {
      // node-pty may not expose a process-group leader on every platform.
    }
  }
  try {
    pty.kill(signal);
  } catch (_error) {
    // The process has already exited.
  }
}
