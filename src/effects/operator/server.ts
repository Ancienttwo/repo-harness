import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OperatorCollaborationSnapshotV1 } from '../../core/operator/collaboration-snapshot';
import {
  projectOperatorFleetSnapshot,
  type OperatorFleetSnapshotV1,
} from '../../core/operator/fleet-snapshot';
import {
  OperatorCollaborationError,
  assertOperatorCollaborationSnapshotIdentity,
  type OperatorCollaborationErrorCode,
  type ReadOperatorCollaborationSnapshotInput,
} from './collaboration';
import {
  FleetBoardError,
  type FleetBoardFatalErrorCode,
  type FleetBoardCollectorOptions,
} from '../fleet/board';
import {
  OperatorTaskMessageError,
  type OperatorTaskMessageErrorCode,
  type SendOperatorTaskMessageInput,
  type SendOperatorTaskMessageResult,
} from '../fleet/task-message-request';
import { TASK_MESSAGE_BODY_MAX_BYTES } from '../../core/fleet/task-message';
import type { FleetBoardSnapshotV1 } from '../../core/fleet/board';

export const OPERATOR_SERVER_PROTOCOL = 1 as const;
export const OPERATOR_SERVICE_NAME = 'repo-harness-operator' as const;
export const OPERATOR_DEFAULT_HOST = '127.0.0.1' as const;
export const OPERATOR_DEFAULT_PORT = 4318 as const;
export const OPERATOR_DEFAULT_MAX_CONCURRENCY = 4 as const;
export const OPERATOR_DEFAULT_TIMEOUT_MS = 30_000 as const;
const OPERATOR_WORKER_CLEANUP_GRACE_MS = 500;
const OPERATOR_FLEET_CONTROLLER_ACK_TIMEOUT_MS = 5_000;

const OPERATOR_DIAGNOSTIC_ACTION = 'Run `repo-harness fleet board --json` for diagnostics and retry.';
const OPERATOR_ASSET_ACTION = 'Build the operator UI with `bun run build:operator-web` and retry.';
const OPERATOR_REOBSERVE_ACTION = 'Refresh the board to re-observe the task, then retry.';
const OPERATOR_ADOPT_ACTION = 'Adopt the repository with `repo-harness adopt`, then refresh the board.';
const OPERATOR_COLLABORATION_ACTION = 'Check the repository collaboration store, then refresh the board.';

/**
 * The transport mirror of the task-message body limit. The protocol constant
 * stays the authority; the HTTP layer refuses an oversized request before it
 * spends a task lock proving the same thing.
 */
export const OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES = TASK_MESSAGE_BODY_MAX_BYTES;
/**
 * JSON escaping expands the body, so the envelope cap is deliberately looser
 * than the body cap. The decoded `body` field is what the body 413 is judged
 * on. A C0 control character can occupy six JSON bytes (`\\u00XX`) for each
 * one-byte UTF-8 input, which is the transport worst case. The fixed portion
 * is measured from the largest valid request shape, including the rendered
 * task/claim fence.
 */
const TASK_MESSAGE_REQUEST_FIXED_BYTES = Buffer.byteLength(JSON.stringify({
  message_id: '0'.repeat(36),
  scope: 'claim',
  body: '',
  expected_task_revision: '0'.repeat(64),
  expected_claim_id: '0'.repeat(36),
  expected_generation: Number.MAX_SAFE_INTEGER,
}), 'utf8') - Buffer.byteLength(JSON.stringify(''), 'utf8');
export const OPERATOR_TASK_MESSAGE_REQUEST_MAX_BYTES =
  TASK_MESSAGE_REQUEST_FIXED_BYTES + (TASK_MESSAGE_BODY_MAX_BYTES * 6) + Buffer.byteLength(JSON.stringify(''), 'utf8');
/**
 * The dispatcher's own matchers, exported so the inventory below and the test
 * that gates it compare the values `handleRequest` matches on rather than a
 * second copy of the same strings.
 */
export const OPERATOR_HEALTH_PATH = '/healthz' as const;
export const OPERATOR_FLEET_SNAPSHOT_PATH = '/api/v1/fleet/snapshot' as const;
export const OPERATOR_API_PATH_PREFIX = '/api' as const;
/** The static fallback has no path shape of its own; it is whatever is left. */
export const OPERATOR_STATIC_ASSET_PATTERN = '/*' as const;
export const OPERATOR_TASK_MESSAGE_ROUTE = /^\/api\/v1\/fleet\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([0-9a-f]{64})\/messages$/u;
/**
 * The repository id is matched loosely and resolved strictly, the same split the
 * task-message route already uses: the registry is the authority on which ids
 * exist, and duplicating its shape here would be a second opinion about it.
 */
export const OPERATOR_COLLABORATION_SNAPSHOT_ROUTE = /^\/api\/v1\/collaboration\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/snapshot$/u;
const DEFAULT_STATIC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../dist/operator-ui',
);

export interface OperatorRouteV1 {
  readonly id: string;
  readonly method: 'GET' | 'POST';
  /** The literal path, or the route regexp's source for a parameterized one. */
  readonly pattern: string;
  /** True only for a route that can change repository state. */
  readonly write: boolean;
}

/**
 * The complete route surface, as a value.
 *
 * The program's standing boundary is that the operator board has exactly one
 * browser write and it is the task message. Probing a running server proves that
 * the routes which exist behave, but it cannot prove which routes exist; this
 * inventory is what makes the claim structural, so adding a route without
 * declaring it here is caught by the same test that counts the writes.
 */
export const OPERATOR_ROUTES: readonly OperatorRouteV1[] = Object.freeze([
  Object.freeze({ id: 'health', method: 'GET', pattern: OPERATOR_HEALTH_PATH, write: false }),
  Object.freeze({ id: 'fleet_snapshot', method: 'GET', pattern: OPERATOR_FLEET_SNAPSHOT_PATH, write: false }),
  Object.freeze({
    id: 'collaboration_snapshot',
    method: 'GET',
    pattern: OPERATOR_COLLABORATION_SNAPSHOT_ROUTE.source,
    write: false,
  }),
  Object.freeze({ id: 'static_asset', method: 'GET', pattern: OPERATOR_STATIC_ASSET_PATTERN, write: false }),
  Object.freeze({ id: 'task_message', method: 'POST', pattern: OPERATOR_TASK_MESSAGE_ROUTE.source, write: true }),
] as const);

export type OperatorServerHost = '127.0.0.1' | '::1';

/** The route supplies cancellation to every asynchronous collaboration reader. */
export type OperatorCollaborationSnapshotReaderInput = ReadOperatorCollaborationSnapshotInput & {
  readonly signal: AbortSignal;
};

export interface OperatorServerOptions {
  readonly host?: string;
  /** Port 0 is accepted by the effect for ephemeral test servers. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly static_root?: string;
  readonly max_concurrency?: number;
  readonly timeout_ms?: number;
  readonly collect_fleet_board?: (
    options?: FleetBoardCollectorOptions,
  ) => Promise<FleetBoardSnapshotV1>;
  readonly read_collaboration_snapshot?: (
    input: OperatorCollaborationSnapshotReaderInput,
  ) => Promise<OperatorCollaborationSnapshotV1>;
  readonly send_task_message?: (
    input: SendOperatorTaskMessageInput & { readonly signal: AbortSignal },
  ) => SendOperatorTaskMessageResult | Promise<SendOperatorTaskMessageResult>;
}

export interface OperatorServerHandle {
  readonly host: OperatorServerHost;
  readonly port: number;
  readonly url: string;
  readonly close: () => Promise<void>;
}

export interface OperatorHealthResponseV1 {
  readonly ok: true;
  readonly service: typeof OPERATOR_SERVICE_NAME;
  readonly protocol: typeof OPERATOR_SERVER_PROTOCOL;
}

export interface OperatorErrorResponseV1 {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly next_action: string;
  };
}

export class OperatorServerError extends Error {
  constructor(
    readonly code: 'invalid_argument' | 'operator_assets_unavailable' | 'operator_server_unavailable',
    message: string,
    readonly status_code = 500,
  ) {
    super(message);
    this.name = 'OperatorServerError';
  }
}

function assertLoopbackHost(host: string | undefined): OperatorServerHost {
  const value = host ?? OPERATOR_DEFAULT_HOST;
  if (value !== '127.0.0.1' && value !== '::1') {
    throw new OperatorServerError('invalid_argument', 'operator server host must be 127.0.0.1 or ::1', 400);
  }
  return value;
}

function assertPort(port: number | undefined): number {
  const value = port ?? OPERATOR_DEFAULT_PORT;
  if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
    throw new OperatorServerError('invalid_argument', 'operator server port must be an integer from 0 through 65535', 400);
  }
  return value;
}

function assertCollectionOption(value: number | undefined, name: string, minimum: number, maximum: number): number {
  const result = value ?? (name === 'max_concurrency'
    ? OPERATOR_DEFAULT_MAX_CONCURRENCY
    : OPERATOR_DEFAULT_TIMEOUT_MS);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new OperatorServerError(
      'invalid_argument',
      `${name} must be an integer from ${minimum} through ${maximum}`,
      400,
    );
  }
  return result;
}

function jsonHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}

/**
 * A Content-Security-Policy governs a document, and the only documents this
 * server serves are the static ones. JSON responses deliberately carry none:
 * they are already served `nosniff`, so a browser cannot execute them as a
 * document, and a policy attached to a non-document would be a header a reader
 * has to reason about for no boundary it protects.
 */
export const OPERATOR_STATIC_CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" as const;

/** Every method the server implements, on every resource that refuses one. */
const OPERATOR_ALLOWED_METHODS = 'GET, HEAD, POST' as const;

function staticHeaders(contentType: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Content-Security-Policy': OPERATOR_STATIC_CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headOnly = false,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...jsonHeaders(),
    ...extraHeaders,
    'Content-Length': Buffer.byteLength(payload).toString(),
  });
  if (headOnly) response.end();
  else response.end(payload);
}

const OPERATOR_REFUSAL_PATH_MAX_CHARS = 200;

/**
 * The request target as the refusal log may state it: the path only, with the
 * query string dropped and the value JSON-quoted so a client-supplied control
 * character cannot forge a second log line.
 */
function refusalPath(request: IncomingMessage): string {
  const target = request.url ?? '/';
  const queryAt = target.indexOf('?');
  const path = queryAt < 0 ? target : target.slice(0, queryAt);
  return JSON.stringify(path.slice(0, OPERATOR_REFUSAL_PATH_MAX_CHARS));
}

/**
 * Refusals are invisible otherwise: an operator watching a board that silently
 * drops writes has nothing to look at. The line carries the decision and
 * nothing that could leak the request — no body, no headers, and in particular
 * no Origin, since the refused Origin is exactly the attacker-controlled string
 * a log reader would then be tempted to trust. stdout stays the single bound
 * URL line the CLI contract prints.
 */
function sendRefusal(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: OperatorErrorResponseV1,
  headOnly = false,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  process.stderr.write(
    `${OPERATOR_SERVICE_NAME} refused method=${request.method ?? 'GET'} status=${status} code=${body.error.code} path=${refusalPath(request)}\n`,
  );
  sendJson(response, status, body, headOnly, extraHeaders);
}

function errorBody(
  code: string,
  message: string,
  nextAction: string = OPERATOR_DIAGNOSTIC_ACTION,
): OperatorErrorResponseV1 {
  return Object.freeze({
    error: Object.freeze({ code, message, next_action: nextAction }),
  });
}

function publicFleetError(error: unknown): {
  readonly status: number;
  readonly body: OperatorErrorResponseV1;
} {
  if (error instanceof OperatorFleetTimeoutError) {
    return {
      status: 503,
      body: errorBody(
        'fleet_snapshot_timeout',
        'The Fleet snapshot timed out.',
        'Refresh the board and retry.',
      ),
    };
  }
  if (error instanceof FleetBoardError) {
    const messageByCode: Readonly<Record<FleetBoardError['code'], string>> = {
      fleet_registry_unavailable: 'Fleet registry cannot be read.',
      fleet_registry_invalid: 'Fleet registry is invalid.',
      fleet_board_argument_invalid: 'Fleet snapshot request is invalid.',
      fleet_watch_aborted_before_first_snapshot: 'Fleet snapshot collection was aborted.',
    };
    return {
      status: error.code === 'fleet_board_argument_invalid' ? 400 : 503,
      body: errorBody(error.code, messageByCode[error.code]),
    };
  }
  return {
    status: 503,
    body: errorBody('fleet_snapshot_unavailable', 'Fleet snapshot is unavailable.'),
  };
}

class OperatorFleetTimeoutError extends Error {
  readonly code = 'fleet_snapshot_timeout' as const;

  constructor() {
    super('fleet snapshot deadline exceeded');
    this.name = 'OperatorFleetTimeoutError';
  }
}

interface PublicFailure {
  readonly status: number;
  readonly message: string;
  readonly next_action: string;
}

/**
 * Every collaboration read failure as a fixed public sentence. The effect's own
 * message names a repository id and its cause carries a store path and a
 * provider diagnostic; the transport keeps the typed code and drops both.
 */
const COLLABORATION_FAILURES: Readonly<Record<OperatorCollaborationErrorCode, PublicFailure>> = Object.freeze({
  registry_unavailable: {
    status: 503,
    message: 'The fleet registry cannot be read.',
    next_action: OPERATOR_DIAGNOSTIC_ACTION,
  },
  repository_not_found: {
    status: 404,
    message: 'The repository is not in the fleet registry.',
    next_action: OPERATOR_ADOPT_ACTION,
  },
  collaboration_snapshot_unavailable: {
    status: 503,
    message: 'The collaboration store cannot be read.',
    next_action: OPERATOR_COLLABORATION_ACTION,
  },
  collaboration_repository_mismatch: {
    status: 500,
    message: 'The collaboration snapshot does not belong to the requested repository.',
    next_action: OPERATOR_COLLABORATION_ACTION,
  },
});

function publicCollaborationError(error: unknown): {
  readonly status: number;
  readonly body: OperatorErrorResponseV1;
} {
  if (error instanceof OperatorCollaborationBusyError) {
    return {
      status: 503,
      body: errorBody(
        'collaboration_snapshot_busy',
        'The collaboration snapshot service is busy.',
        'Wait for the current collaboration refresh to finish, then retry.',
      ),
    };
  }
  if (error instanceof OperatorCollaborationTimeoutError) {
    return {
      status: 503,
      body: errorBody(
        'collaboration_snapshot_timeout',
        'The collaboration snapshot timed out.',
        'Refresh the collaboration panel and retry.',
      ),
    };
  }
  if (error instanceof OperatorCollaborationError) {
    const failure = COLLABORATION_FAILURES[error.code];
    if (failure) {
      return { status: failure.status, body: errorBody(error.code, failure.message, failure.next_action) };
    }
  }
  return {
    status: 503,
    body: errorBody(
      'collaboration_snapshot_unavailable',
      'The collaboration store cannot be read.',
      OPERATOR_COLLABORATION_ACTION,
    ),
  };
}

class OperatorCollaborationTimeoutError extends Error {
  readonly code = 'collaboration_snapshot_timeout' as const;

  constructor() {
    super('collaboration snapshot deadline exceeded');
    this.name = 'OperatorCollaborationTimeoutError';
  }
}

class OperatorCollaborationBusyError extends Error {
  readonly code = 'collaboration_snapshot_busy' as const;

  constructor() {
    super('collaboration snapshot queue is full');
    this.name = 'OperatorCollaborationBusyError';
  }
}

const OPERATOR_COLLABORATION_REQUEST_ABORTED = Symbol('operator-collaboration-request-aborted');
const OPERATOR_TASK_MESSAGE_REQUEST_ABORTED = Symbol('operator-task-message-request-aborted');

type OperatorCollaborationWorkerResponse =
  | {
      readonly ok: true;
      readonly snapshot: OperatorCollaborationSnapshotV1;
    }
  | {
      readonly ok: false;
      readonly code: OperatorCollaborationErrorCode;
    };

function collaborationWorkerEnvironment(env: NodeJS.ProcessEnv | undefined): Record<string, string> | undefined {
  if (env === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function collaborationWorkerResponse(value: unknown): OperatorCollaborationWorkerResponse | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  if (value.ok === true && 'snapshot' in value && typeof value.snapshot === 'object' && value.snapshot !== null) {
    return { ok: true, snapshot: value.snapshot as OperatorCollaborationSnapshotV1 };
  }
  if (
    value.ok === false
    && 'code' in value
    && (value.code === 'registry_unavailable'
      || value.code === 'repository_not_found'
      || value.code === 'collaboration_snapshot_unavailable'
      || value.code === 'collaboration_repository_mismatch')
  ) {
    return { ok: false, code: value.code };
  }
  return null;
}

/**
 * The collaboration collector is synchronous and can block in filesystem or
 * provider reads. Run the production reader outside the HTTP event loop so the
 * route deadline can terminate the work rather than merely race a blocked turn.
 */
function readDefaultCollaborationSnapshot(
  input: OperatorCollaborationSnapshotReaderInput,
): Promise<OperatorCollaborationSnapshotV1> {
  return new Promise((resolveRead, rejectRead) => {
    const worker = new Worker(new URL('./collaboration-worker.ts', import.meta.url));
    let settled = false;
    const finish = (
      outcome:
        | { readonly ok: true; readonly snapshot: OperatorCollaborationSnapshotV1 }
        | { readonly ok: false; readonly error: unknown },
    ): void => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener('abort', onAbort);
      worker.terminate();
      if (outcome.ok) resolveRead(outcome.snapshot);
      else rejectRead(outcome.error);
    };
    const onAbort = (): void => finish({ ok: false, error: OPERATOR_COLLABORATION_REQUEST_ABORTED });
    input.signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = collaborationWorkerResponse(event.data);
      if (response === null) {
        finish({
          ok: false,
          error: new OperatorCollaborationError(
            'collaboration_snapshot_unavailable',
            'collaboration worker returned an invalid response',
          ),
        });
      } else if (response.ok) {
        try {
          assertOperatorCollaborationSnapshotIdentity(response.snapshot, input.repository_id);
        } catch (error) {
          finish({ ok: false, error });
          return;
        }
        finish({ ok: true, snapshot: response.snapshot });
      } else {
        finish({
          ok: false,
          error: new OperatorCollaborationError(response.code, `collaboration worker failed with ${response.code}`),
        });
      }
    };
    worker.onerror = (error) => {
      finish({
        ok: false,
        error: new OperatorCollaborationError(
          'collaboration_snapshot_unavailable',
          'collaboration worker failed',
          error,
        ),
      });
    };
    if (input.signal.aborted) {
      onAbort();
      return;
    }
    worker.postMessage({
      env: collaborationWorkerEnvironment(input.env),
      repository_id: input.repository_id,
    });
  });
}

type OperatorFleetCollectorResponse =
  | {
      readonly ok: true;
      readonly snapshot: FleetBoardSnapshotV1;
    }
  | {
      readonly ok: false;
      readonly code: FleetBoardFatalErrorCode;
    }
  | {
      readonly ok: false;
      readonly cancelled: true;
    };

function fleetCollectorResponse(value: unknown): OperatorFleetCollectorResponse | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  if (value.ok === true && 'snapshot' in value && typeof value.snapshot === 'object' && value.snapshot !== null) {
    return { ok: true, snapshot: value.snapshot as FleetBoardSnapshotV1 };
  }
  if (
    value.ok === false
    && 'code' in value
    && (value.code === 'fleet_registry_unavailable'
      || value.code === 'fleet_registry_invalid'
      || value.code === 'fleet_board_argument_invalid'
      || value.code === 'fleet_watch_aborted_before_first_snapshot')
  ) {
    return { ok: false, code: value.code };
  }
  if (value.ok === false && 'cancelled' in value && value.cancelled === true) {
    return { ok: false, cancelled: true };
  }
  return null;
}

type WindowsFleetControllerResponse =
  | { readonly type: 'assigned' }
  | { readonly type: 'cleanup_ack' }
  | { readonly type: 'cleanup_failed' };

function windowsFleetControllerResponse(value: unknown): WindowsFleetControllerResponse | null {
  if (typeof value !== 'object' || value === null || !('type' in value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'cleanup_ack' || record.type === 'cleanup_failed') return { type: record.type };
  if (record.type === 'assigned') return { type: 'assigned' };
  return null;
}

function writeChildJsonLine(child: ChildProcessWithoutNullStreams, value: unknown): boolean {
  if (child.stdin.destroyed || !child.stdin.writable) return false;
  try {
    child.stdin.write(`${JSON.stringify(value)}\n`);
    return true;
  } catch {
    return false;
  }
}

function childJsonLines(stream: NodeJS.ReadableStream, onValue: (value: unknown) => void): void {
  let buffered = '';
  stream.setEncoding('utf-8');
  stream.on('data', (chunk: string) => {
    buffered += chunk;
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      try { onValue(JSON.parse(line)); } catch { onValue(null); }
      newline = buffered.indexOf('\n');
    }
  });
}

function posixProcessGroupAbsent(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(-pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

async function waitForPosixProcessGroupAbsence(pid: number | undefined): Promise<boolean> {
  const deadline = Date.now() + OPERATOR_FLEET_CONTROLLER_ACK_TIMEOUT_MS;
  while (!posixProcessGroupAbsent(pid) && Date.now() < deadline) await Bun.sleep(10);
  return posixProcessGroupAbsent(pid);
}

function signalPosixProcessGroup(pid: number | undefined, signal: NodeJS.Signals): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function fleetCollectorProcessPath(): string {
  return fileURLToPath(new URL('./fleet-collector-process.ts', import.meta.url));
}

function windowsFleetControllerPath(): string {
  return fileURLToPath(new URL('../../../assets/operator/fleet-windows-job-controller.ps1', import.meta.url));
}

/**
 * POSIX collection runs in a server-owned detached process group. Windows
 * collection is different: the server owns only the controller child, while
 * that Job owner creates the inert collector and assigns its exact handle
 * before forwarding the start payload. Provider descendants then inherit the
 * Job automatically.
 */
function readDefaultFleetSnapshot(
  input: Required<Pick<FleetBoardCollectorOptions, 'sequence' | 'max_concurrency' | 'timeout_ms'>> & {
    readonly env?: NodeJS.ProcessEnv;
    readonly signal: AbortSignal;
  },
): Promise<FleetBoardSnapshotV1> {
  if (input.signal.aborted) return Promise.reject(new OperatorFleetTimeoutError());
  return new Promise((resolveRead, rejectRead) => {
    const workerEnvironment = { ...process.env, ...collaborationWorkerEnvironment(input.env) };
    const collector = process.platform === 'win32'
      ? null
      : spawn(process.execPath, [fleetCollectorProcessPath()], {
        env: workerEnvironment,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        windowsHide: true,
      });
    const controller = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsFleetControllerPath()], {
        env: workerEnvironment,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      : null;
    let settled = false;
    let cancellationRequested = false;
    let collectorClosed = false;
    let controllerAssigned = controller === null;
    let controllerClosed = controller === null;
    let controllerFailed = false;
    let controllerCleanupAcknowledged = controller === null;
    let controllerCleanupRequested = false;
    let collectorResponse: OperatorFleetCollectorResponse | null = null;
    let intended: { readonly ok: true; readonly snapshot: FleetBoardSnapshotV1 } | { readonly ok: false; readonly error: unknown } | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    let acknowledgementTimer: ReturnType<typeof setTimeout> | null = null;
    let controllerCloseTimer: ReturnType<typeof setTimeout> | null = null;
    let posixFinalizing = false;
    const finish = (
      outcome:
        | { readonly ok: true; readonly snapshot: FleetBoardSnapshotV1 }
        | { readonly ok: false; readonly error: unknown },
    ): void => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener('abort', onAbort);
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      if (acknowledgementTimer !== null) clearTimeout(acknowledgementTimer);
      if (controllerCloseTimer !== null) clearTimeout(controllerCloseTimer);
      collector?.stdin.end();
      controller?.stdin.end();
      if (outcome.ok) resolveRead(outcome.snapshot);
      else rejectRead(outcome.error);
    };
    const unavailable = (message: string) => new FleetBoardError('fleet_registry_unavailable', message);
    const failWindowsController = (message: string): void => {
      if (settled || controller === null || controllerFailed) return;
      controllerFailed = true;
      intended = { ok: false, error: unavailable(message) };
      cancellationRequested = true;
      if (acknowledgementTimer !== null) {
        clearTimeout(acknowledgementTimer);
        acknowledgementTimer = null;
      }
      if (cleanupTimer !== null) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
      try { controller.kill('SIGKILL'); } catch { /* controller close remains the cleanup fence */ }
    };
    const requestWindowsCleanup = (terminate: boolean): void => {
      if (controller === null || controllerCleanupRequested || settled) return;
      controllerCleanupRequested = true;
      if (cleanupTimer !== null) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
      if (!writeChildJsonLine(controller, { type: terminate ? 'terminate' : 'cleanup' })) {
        failWindowsController('Fleet Windows Job controller is unavailable');
        return;
      }
      acknowledgementTimer = setTimeout(() => {
        failWindowsController('Fleet Windows Job controller did not acknowledge cleanup');
      }, OPERATOR_FLEET_CONTROLLER_ACK_TIMEOUT_MS);
    };
    const finalizePosix = (): void => {
      if (settled || collector === null || !collectorClosed || intended === null || posixFinalizing) return;
      posixFinalizing = true;
      void (async () => {
        if (!posixProcessGroupAbsent(collector.pid)) {
          signalPosixProcessGroup(collector.pid, 'SIGTERM');
          await Bun.sleep(OPERATOR_WORKER_CLEANUP_GRACE_MS);
          signalPosixProcessGroup(collector.pid, 'SIGKILL');
        }
        if (!await waitForPosixProcessGroupAbsence(collector.pid)) {
          finish({ ok: false, error: unavailable('Fleet collector process group did not exit') });
          return;
        }
        finish(intended);
      })();
    };
    const finalize = (): void => {
      if (controller !== null) {
        if (controllerFailed) {
          if (controllerClosed && intended !== null) finish(intended);
          return;
        }
        if (intended === null) return;
        if (!controllerAssigned) {
          failWindowsController('Fleet Windows Job controller returned a collector response before assignment');
          return;
        }
        if (!controllerCleanupRequested) requestWindowsCleanup(cancellationRequested);
        if (controllerCleanupAcknowledged && controllerClosed) finish(intended);
        return;
      }
      if (collector === null || !collectorClosed) return;
      if (intended === null) intended = { ok: false, error: unavailable('Fleet collector exited without a response') };
      if (cancellationRequested && cleanupTimer !== null) return;
      finalizePosix();
    };
    const recordCollectorResponse = (value: unknown): void => {
      const response = fleetCollectorResponse(value);
      if (response === null) {
        intended = { ok: false, error: unavailable('Fleet collector returned an invalid response') };
      } else if (response.ok) {
        collectorResponse = response;
        intended = cancellationRequested
          ? { ok: false, error: new OperatorFleetTimeoutError() }
          : { ok: true, snapshot: response.snapshot };
      } else if ('cancelled' in response) {
        collectorResponse = response;
        intended = { ok: false, error: new OperatorFleetTimeoutError() };
      } else {
        collectorResponse = response;
        intended = { ok: false, error: new FleetBoardError(response.code, `Fleet collector failed with ${response.code}`) };
      }
      finalize();
    };
    const onAbort = (): void => {
      if (settled || cancellationRequested) return;
      cancellationRequested = true;
      if (controller !== null) {
        if (!writeChildJsonLine(controller, { type: 'cancel' })) {
          failWindowsController('Fleet Windows Job controller cannot accept cooperative cancellation');
          return;
        }
      } else {
        if (collector === null || !writeChildJsonLine(collector, { type: 'cancel' })) {
          intended = { ok: false, error: unavailable('Fleet collector cannot accept cooperative cancellation') };
        }
        if (collector !== null) signalPosixProcessGroup(collector.pid, 'SIGTERM');
      }
      cleanupTimer = setTimeout(() => {
        cleanupTimer = null;
        intended = { ok: false, error: new OperatorFleetTimeoutError() };
        if (controller !== null) {
          requestWindowsCleanup(true);
        } else {
          if (collector === null) return;
          signalPosixProcessGroup(collector.pid, 'SIGKILL');
          void waitForPosixProcessGroupAbsence(collector.pid).then((absent) => {
            if (!absent) finish({ ok: false, error: unavailable('Fleet collector process group did not exit') });
            else finalize();
          });
        }
      }, OPERATOR_WORKER_CLEANUP_GRACE_MS);
    };
    input.signal.addEventListener('abort', onAbort, { once: true });
    if (collector !== null) {
      childJsonLines(collector.stdout, recordCollectorResponse);
      collector.stderr.resume();
      collector.once('error', (error) => {
        intended = { ok: false, error: unavailable(`Fleet collector failed: ${error.message}`) };
      });
      collector.once('close', () => {
        collectorClosed = true;
        if (cleanupTimer !== null) {
          clearTimeout(cleanupTimer);
          cleanupTimer = null;
        }
        if (collectorResponse === null && intended === null) intended = { ok: false, error: unavailable('Fleet collector exited without a response') };
        finalize();
      });
    }
    if (controller !== null) {
      childJsonLines(controller.stdout, (value) => {
        const response = windowsFleetControllerResponse(value);
        if (response === null) {
          recordCollectorResponse(value);
          return;
        }
        if (response.type === 'assigned') {
          if (controllerAssigned) {
            failWindowsController('Fleet Windows Job controller assigned more than one collector');
            return;
          }
          controllerAssigned = true;
          if (cancellationRequested) return;
          if (!writeChildJsonLine(controller, {
            type: 'start',
            sequence: input.sequence,
            max_concurrency: input.max_concurrency,
            timeout_ms: input.timeout_ms,
          })) {
            intended = { ok: false, error: unavailable('Fleet Windows Job controller cannot forward the assigned start payload') };
            requestWindowsCleanup(true);
          }
          return;
        }
        if (response.type === 'cleanup_ack') {
          controllerCleanupAcknowledged = true;
          if (acknowledgementTimer !== null) {
            clearTimeout(acknowledgementTimer);
            acknowledgementTimer = null;
          }
          controllerCloseTimer = setTimeout(() => {
            failWindowsController('Fleet Windows Job controller did not exit after cleanup acknowledgement');
          }, OPERATOR_FLEET_CONTROLLER_ACK_TIMEOUT_MS);
          finalize();
          return;
        }
        failWindowsController('Fleet Windows Job controller could not prove cleanup');
      });
      controller.stderr.resume();
      controller.once('error', (error) => {
        failWindowsController(`Fleet Windows Job controller failed: ${error.message}`);
      });
      controller.once('close', () => {
        controllerClosed = true;
        if (controllerCloseTimer !== null) {
          clearTimeout(controllerCloseTimer);
          controllerCloseTimer = null;
        }
        if (!controllerCleanupAcknowledged && !settled) {
          failWindowsController('Fleet Windows Job controller exited without cleanup acknowledgement');
        }
        finalize();
      });
      if (!writeChildJsonLine(controller, {
        type: 'launch',
        executable: process.execPath,
        collector_path: fleetCollectorProcessPath(),
      })) {
        failWindowsController('Fleet Windows Job controller cannot accept collector launch');
      }
    } else if (collector !== null && !writeChildJsonLine(collector, {
      type: 'start',
      env: collaborationWorkerEnvironment(input.env),
      sequence: input.sequence,
      max_concurrency: input.max_concurrency,
      timeout_ms: input.timeout_ms,
    })) {
      finish({ ok: false, error: unavailable('Fleet collector cannot accept start payload') });
    }
    if (input.signal.aborted) {
      onAbort();
    }
  });
}

type WorkerTaskMessageErrorCode = OperatorTaskMessageErrorCode;

type OperatorTaskMessageWorkerResponse =
  | {
      readonly ok: true;
      readonly result: SendOperatorTaskMessageResult;
    }
  | {
      readonly ok: false;
      readonly code: WorkerTaskMessageErrorCode;
    };

function taskMessageWorkerResponse(value: unknown): OperatorTaskMessageWorkerResponse | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  if (value.ok === true && 'result' in value && typeof value.result === 'object' && value.result !== null) {
    return { ok: true, result: value.result as SendOperatorTaskMessageResult };
  }
  if (
    value.ok === false
    && 'code' in value
    && (value.code === 'registry_unavailable'
      || value.code === 'repository_not_found'
      || value.code === 'repository_read_only'
      || value.code === 'canonical_sprint_unavailable'
      || value.code === 'canonical_source_stale'
      || value.code === 'task_not_found'
      || value.code === 'task_message_invalid'
      || value.code === 'task_message_unreadable'
      || value.code === 'message_id_conflict'
      || value.code === 'task_revision_mismatch'
      || value.code === 'task_not_pending'
      || value.code === 'task_unowned'
      || value.code === 'claim_mismatch'
      || value.code === 'recipient_unavailable'
      || value.code === 'task_message_transition_invalid')
  ) {
    return { ok: false, code: value.code };
  }
  return null;
}

function sendDefaultTaskMessage(
  input: SendOperatorTaskMessageInput,
  signal: AbortSignal,
): Promise<SendOperatorTaskMessageResult> {
  if (signal.aborted) return Promise.reject(OPERATOR_TASK_MESSAGE_REQUEST_ABORTED);
  return new Promise((resolveWrite, rejectWrite) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./task-message-process.ts', import.meta.url))],
      {
        env: { ...process.env, ...collaborationWorkerEnvironment(input.env) },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let settled = false;
    let aborting = false;
    let invalidOutput = false;
    let spawnError: Error | null = null;
    let stdout = '';
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (
      outcome:
        | { readonly ok: true; readonly result: SendOperatorTaskMessageResult }
        | { readonly ok: false; readonly error: unknown },
    ): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (killTimer !== null) clearTimeout(killTimer);
      if (outcome.ok) resolveWrite(outcome.result);
      else rejectWrite(outcome.error);
    };
    const onAbort = (): void => {
      if (settled || aborting) return;
      aborting = true;
      try { child.kill('SIGTERM'); } catch { /* the process may already have exited */ }
      killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* the process may already have exited */ }
      }, OPERATOR_WORKER_CLEANUP_GRACE_MS);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 65_536 && !invalidOutput) {
        invalidOutput = true;
        try { child.kill('SIGKILL'); } catch { /* the process may already have exited */ }
      }
    });
    child.stderr.resume();
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (status) => {
      if (aborting || signal.aborted) {
        finish({ ok: false, error: OPERATOR_TASK_MESSAGE_REQUEST_ABORTED });
        return;
      }
      if (invalidOutput || spawnError !== null || status !== 0) {
        finish({
          ok: false,
          error: new OperatorTaskMessageError('task_message_unreadable', 'task-message process failed', spawnError),
        });
        return;
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(stdout);
      } catch (error) {
        finish({
          ok: false,
          error: new OperatorTaskMessageError('task_message_unreadable', 'task-message process returned invalid JSON', error),
        });
        return;
      }
      const response = taskMessageWorkerResponse(decoded);
      if (response === null) {
        finish({ ok: false, error: new OperatorTaskMessageError('task_message_unreadable', 'task-message process returned an invalid response') });
      } else if (response.ok) {
        finish({ ok: true, result: response.result });
      } else {
        finish({ ok: false, error: new OperatorTaskMessageError(response.code as OperatorTaskMessageErrorCode, `task-message process failed with ${response.code}`) });
      }
    });
    child.stdin.on('error', () => {
      // A cancellation may close stdin before the request bytes are flushed.
    });
    child.stdin.end(JSON.stringify({ input: { ...input, env: undefined } }));
    if (signal.aborted) {
      onAbort();
      return;
    }
  });
}

interface PublicTaskMessageFailure {
  readonly status: number;
  readonly message: string;
  readonly next_action: string;
}

/**
 * Every failure the write path can surface, restated as a fixed public
 * sentence. The effect's own message may name a repository root or a sprint
 * path; the transport keeps the typed code and drops the diagnostic text.
 */
const TASK_MESSAGE_FAILURES: Readonly<Record<OperatorTaskMessageErrorCode, PublicTaskMessageFailure>> = Object.freeze({
  registry_unavailable: {
    status: 503,
    message: 'The fleet registry cannot be read.',
    next_action: OPERATOR_DIAGNOSTIC_ACTION,
  },
  repository_not_found: {
    status: 404,
    message: 'The repository is not in the fleet registry.',
    next_action: 'Adopt the repository with `repo-harness adopt`, then refresh the board.',
  },
  repository_read_only: {
    status: 403,
    message: 'The repository is registered read only.',
    next_action: 'Re-register the repository with read_write access to send task messages.',
  },
  canonical_sprint_unavailable: {
    status: 503,
    message: 'The canonical sprint authority cannot be read.',
    next_action: OPERATOR_DIAGNOSTIC_ACTION,
  },
  task_not_found: {
    status: 404,
    message: 'The task is not in the canonical sprint.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  task_message_invalid: {
    status: 400,
    message: 'The task message is invalid.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  task_message_unreadable: {
    status: 503,
    message: 'The task inbox cannot be read.',
    next_action: OPERATOR_DIAGNOSTIC_ACTION,
  },
  message_id_conflict: {
    status: 409,
    message: 'A different message already used this message id.',
    next_action: 'Compose the message again so it gets a new id.',
  },
  task_revision_mismatch: {
    status: 409,
    message: 'The canonical task definition moved since the snapshot.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  canonical_source_stale: {
    status: 409,
    message: 'The active task board authority changed since the snapshot.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  task_not_pending: {
    status: 409,
    message: 'This task no longer accepts messages.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  task_unowned: {
    status: 409,
    message: 'The task has no owner that can receive this message.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  claim_mismatch: {
    status: 409,
    message: 'The task owner changed while the message was being sent.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  recipient_unavailable: {
    status: 409,
    message: 'The task has no bound owner session to receive this message.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
  task_message_transition_invalid: {
    status: 409,
    message: 'The task message delivery state does not allow this write.',
    next_action: OPERATOR_REOBSERVE_ACTION,
  },
});

class OperatorTaskMessageTimeoutError extends Error {
  readonly code = 'task_message_timeout' as const;

  constructor() {
    super('task-message deadline exceeded');
    this.name = 'OperatorTaskMessageTimeoutError';
  }
}

function publicTaskMessageError(error: unknown): {
  readonly status: number;
  readonly body: OperatorErrorResponseV1;
} {
  if (error instanceof OperatorTaskMessageTimeoutError) {
    return {
      status: 503,
      body: errorBody(
        'task_message_timeout',
        'The task message outcome is unknown because the request timed out.',
        'Retry the exact same message_id, body, and fence. If it committed, the existing message will be returned without a duplicate.',
      ),
    };
  }
  if (error instanceof OperatorTaskMessageError) {
    const failure = TASK_MESSAGE_FAILURES[error.code as WorkerTaskMessageErrorCode];
    if (failure) {
      return { status: failure.status, body: errorBody(error.code, failure.message, failure.next_action) };
    }
  }
  return {
    status: 503,
    body: errorBody('task_message_unavailable', 'The task message could not be stored.', OPERATOR_DIAGNOSTIC_ACTION),
  };
}

export interface OperatorTaskMessageRequestV1 {
  readonly message_id: string;
  readonly scope: 'task' | 'claim';
  readonly body: string;
  readonly expected_task_revision: string;
  readonly expected_claim_id: string | null;
  readonly expected_generation: number | null;
}

/** Accept exactly the transport fields; an unknown key is a rejected request. */
function decodeTaskMessageRequest(value: unknown): OperatorTaskMessageRequestV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 6
    || keys[0] !== 'body'
    || keys[1] !== 'expected_claim_id'
    || keys[2] !== 'expected_generation'
    || keys[3] !== 'expected_task_revision'
    || keys[4] !== 'message_id'
    || keys[5] !== 'scope') return null;
  const {
    message_id: messageId,
    scope,
    body,
    expected_task_revision: expectedTaskRevision,
    expected_claim_id: expectedClaimId,
    expected_generation: expectedGeneration,
  } = record;
  if (typeof messageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(messageId)) return null;
  if (scope !== 'task' && scope !== 'claim') return null;
  if (typeof body !== 'string') return null;
  if (typeof expectedTaskRevision !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedTaskRevision)) return null;
  if (scope === 'task') {
    if (expectedClaimId !== null || expectedGeneration !== null) return null;
  } else {
    if (typeof expectedClaimId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(expectedClaimId)
      || typeof expectedGeneration !== 'number'
      || !Number.isSafeInteger(expectedGeneration)
      || expectedGeneration < 1) return null;
  }
  return {
    message_id: messageId,
    scope,
    body,
    expected_task_revision: expectedTaskRevision,
    expected_claim_id: expectedClaimId,
    expected_generation: expectedGeneration,
  };
}

type RequestBodyRead =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'envelope_too_large' | 'invalid' | 'aborted' };

function readBoundedRequestBody(
  request: IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<RequestBodyRead> {
  const declared = request.headers['content-length'];
  if (typeof declared !== 'string') return Promise.resolve({ ok: false, reason: 'invalid' });
  const length = Number(declared);
  if (!Number.isSafeInteger(length) || length < 0) return Promise.resolve({ ok: false, reason: 'invalid' });
  if (length > maxBytes) return Promise.resolve({ ok: false, reason: 'envelope_too_large' });
  return new Promise((resolveRead) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const cleanup = (): void => {
      signal.removeEventListener('abort', onAbort);
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', onError);
    };
    const finish = (result: RequestBodyRead): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveRead(result);
    };
    const onAbort = (): void => {
      request.pause();
      finish({ ok: false, reason: 'aborted' });
    };
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maxBytes || size > length) {
        request.pause();
        finish({ ok: false, reason: 'envelope_too_large' });
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = (): void => {
      if (size !== length) finish({ ok: false, reason: 'invalid' });
      else finish({ ok: true, text: Buffer.concat(chunks).toString('utf-8') });
    };
    const onError = (): void => finish({ ok: false, reason: signal.aborted ? 'aborted' : 'invalid' });
    signal.addEventListener('abort', onAbort, { once: true });
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    if (signal.aborted) onAbort();
  });
}

function contentType(pathname: string): string {
  switch (extname(pathname).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

/**
 * The write accepts exactly one representation. Origin equality is the CSRF
 * barrier and stays ahead of this check, but a simple cross-site form post can
 * only ever declare a form media type, so refusing anything but JSON removes
 * the shape entirely rather than relying on one header alone. Parameters are
 * allowed because a browser appends `charset`; duplicated Content-Type headers
 * arrive joined and fail closed.
 */
function isJsonRequest(request: IncomingMessage): boolean {
  const declared = request.headers['content-type'];
  if (typeof declared !== 'string') return false;
  return declared.split(';', 1)[0]!.trim().toLowerCase() === 'application/json';
}

function fileIfSafe(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_error) {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (relative.length === 0 || isAbsolute(relative) || relative.split('/').includes('..')) return null;
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  try {
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${sep}`)) return null;
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return candidate;
  } catch (_error) {
    return null;
  }
}

function fallbackIndex(root: string): string | null {
  return fileIfSafe(root, '/');
}

function isHtmlNavigation(request: IncomingMessage, pathname: string): boolean {
  if (pathname === '/') return true;
  if (extname(pathname) !== '') return false;
  const accept = request.headers.accept ?? '';
  return accept.includes('text/html');
}

function safePathRoot(root: string): string {
  return resolve(root);
}

function expectedRequestAuthority(host: OperatorServerHost, request: IncomingMessage): string | null {
  const localPort = request.socket.localPort;
  if (!Number.isSafeInteger(localPort)) return null;
  const authorityHost = host === '::1' ? `[${host}]` : host;
  return `${authorityHost}:${localPort}`;
}

export async function startOperatorServer(
  options: OperatorServerOptions = {},
): Promise<OperatorServerHandle> {
  const host = assertLoopbackHost(options.host);
  const port = assertPort(options.port);
  const maxConcurrency = assertCollectionOption(options.max_concurrency, 'max_concurrency', 1, 16);
  const timeoutMs = assertCollectionOption(options.timeout_ms, 'timeout_ms', 1_000, 30_000);
  const staticRoot = safePathRoot(options.static_root ?? DEFAULT_STATIC_ROOT);
  const collect = options.collect_fleet_board;
  const readCollaboration = options.read_collaboration_snapshot ?? readDefaultCollaborationSnapshot;
  const send = options.send_task_message;
  let inFlight: Promise<OperatorFleetSnapshotV1> | null = null;
  let nextSnapshotSequence = 1;
  let activeFleetCanceller: (() => void) | null = null;
  let activeFleetSubscribers = 0;
  let activeTaskMessageWriters = 0;
  const activeTaskMessageCancellers = new Set<() => void>();
  const activeTaskMessageCompletions = new Set<Promise<void>>();
  const activeCollaborationRequestCancellers = new Set<() => void>();
  const collaborationObservations = new Map<string, CollaborationObservation>();
  const collaborationQueue: CollaborationObservation[] = [];
  const collaborationQueueCapacity = maxConcurrency * 2;
  let activeCollaborationWorkers = 0;

  interface CollaborationObservation {
    readonly repositoryId: string;
    readonly controller: AbortController;
    readonly promise: Promise<OperatorCollaborationSnapshotV1>;
    readonly resolve: (snapshot: OperatorCollaborationSnapshotV1) => void;
    readonly reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout> | null;
    subscribers: number;
    started: boolean;
    settled: boolean;
  }

  const drainCollaborationQueue = (): void => {
    while (activeCollaborationWorkers < maxConcurrency && collaborationQueue.length > 0) {
      const next = collaborationQueue.shift()!;
      if (next.settled || next.subscribers === 0) continue;
      startCollaborationObservation(next);
    }
  };

  const settleCollaborationObservation = (
    observation: CollaborationObservation,
    outcome:
      | { readonly ok: true; readonly snapshot: OperatorCollaborationSnapshotV1 }
      | { readonly ok: false; readonly error: unknown },
  ): void => {
    if (observation.settled) return;
    observation.settled = true;
    if (observation.timer !== null) clearTimeout(observation.timer);
    if (observation.started) activeCollaborationWorkers -= 1;
    else {
      const queuedAt = collaborationQueue.indexOf(observation);
      if (queuedAt >= 0) collaborationQueue.splice(queuedAt, 1);
    }
    if (collaborationObservations.get(observation.repositoryId) === observation) {
      collaborationObservations.delete(observation.repositoryId);
    }
    if (outcome.ok) observation.resolve(outcome.snapshot);
    else observation.reject(outcome.error);
    drainCollaborationQueue();
  };

  const cancelCollaborationObservation = (observation: CollaborationObservation, error: unknown): void => {
    if (observation.settled) return;
    observation.controller.abort();
    settleCollaborationObservation(observation, { ok: false, error });
  };

  const startCollaborationObservation = (observation: CollaborationObservation): void => {
    if (observation.settled || observation.subscribers === 0) return;
    observation.started = true;
    activeCollaborationWorkers += 1;
    Promise.resolve().then(() => readCollaboration({
      env: options.env,
      repository_id: observation.repositoryId,
      signal: observation.controller.signal,
    })).then(
      (snapshot) => settleCollaborationObservation(observation, { ok: true, snapshot }),
      (error) => settleCollaborationObservation(observation, { ok: false, error }),
    );
  };

  const acquireCollaborationObservation = (repositoryId: string): CollaborationObservation => {
    const existing = collaborationObservations.get(repositoryId);
    if (existing !== undefined) {
      existing.subscribers += 1;
      return existing;
    }
    if (activeCollaborationWorkers >= maxConcurrency && collaborationQueue.length >= collaborationQueueCapacity) {
      throw new OperatorCollaborationBusyError();
    }
    let resolveObservation!: (snapshot: OperatorCollaborationSnapshotV1) => void;
    let rejectObservation!: (error: unknown) => void;
    const observation: CollaborationObservation = {
      repositoryId,
      controller: new AbortController(),
      promise: new Promise<OperatorCollaborationSnapshotV1>((resolveObservationPromise, rejectObservationPromise) => {
        resolveObservation = resolveObservationPromise;
        rejectObservation = rejectObservationPromise;
      }),
      resolve: (snapshot) => resolveObservation(snapshot),
      reject: (error) => rejectObservation(error),
      timer: null,
      subscribers: 1,
      started: false,
      settled: false,
    };
    observation.timer = setTimeout(() => {
      cancelCollaborationObservation(observation, new OperatorCollaborationTimeoutError());
    }, timeoutMs);
    collaborationObservations.set(repositoryId, observation);
    if (activeCollaborationWorkers < maxConcurrency) startCollaborationObservation(observation);
    else collaborationQueue.push(observation);
    return observation;
  };

  const releaseCollaborationObservation = (observation: CollaborationObservation): void => {
    if (observation.subscribers === 0) return;
    observation.subscribers -= 1;
    if (observation.subscribers === 0 && !observation.settled) {
      cancelCollaborationObservation(observation, OPERATOR_COLLABORATION_REQUEST_ABORTED);
    }
  };

  const snapshot = (): Promise<OperatorFleetSnapshotV1> => {
    if (inFlight !== null) return inFlight;
    const sequence = nextSnapshotSequence;
    nextSnapshotSequence += 1;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    const pending = (collect === undefined
      ? readDefaultFleetSnapshot({
        env: options.env,
        sequence,
        max_concurrency: maxConcurrency,
        timeout_ms: timeoutMs,
        signal: controller.signal,
      })
      : Promise.resolve().then(() => collect({
        env: options.env,
        sequence,
        max_concurrency: maxConcurrency,
        timeout_ms: timeoutMs,
        signal: controller.signal,
      }))).then(projectOperatorFleetSnapshot);
    inFlight = pending;
    /**
     * Cancellation retires the shared observation immediately, exactly as the
     * collaboration path drops its observation the moment it is cancelled. The
     * collector's abort path is not instantaneous — it drains a cleanup grace
     * period and then waits for the process group to disappear — so a request
     * that arrives inside that window would otherwise be handed the dying
     * promise and answered with its failure. A page reload right after the
     * previous page closed its connection is exactly that request.
     */
    const cancelFleet = () => {
      if (inFlight === pending) inFlight = null;
      if (activeFleetCanceller === cancelFleet) activeFleetCanceller = null;
      controller.abort();
    };
    activeFleetCanceller = cancelFleet;
    pending.then(
      () => {
        clearTimeout(deadline);
        if (inFlight === pending) inFlight = null;
        if (activeFleetCanceller === cancelFleet) activeFleetCanceller = null;
      },
      () => {
        clearTimeout(deadline);
        if (inFlight === pending) inFlight = null;
        if (activeFleetCanceller === cancelFleet) activeFleetCanceller = null;
      },
    );
    return pending;
  };

  const handleFleetSnapshot = async (
    request: IncomingMessage,
    response: ServerResponse,
    headOnly: boolean,
  ): Promise<void> => {
    activeFleetSubscribers += 1;
    let finished = false;
    let released = false;
    let clientDisconnected = false;
    const release = (): void => {
      if (released) return;
      released = true;
      activeFleetSubscribers -= 1;
      if (!finished && activeFleetSubscribers === 0) activeFleetCanceller?.();
    };
    const onClientDisconnect = (): void => {
      if (finished) return;
      clientDisconnected = true;
      release();
    };
    request.once('aborted', onClientDisconnect);
    response.once('close', onClientDisconnect);
    try {
      const current = await snapshot();
      if (clientDisconnected || response.destroyed) return;
      finished = true;
      sendJson(response, 200, current, headOnly);
    } catch (error) {
      if (clientDisconnected || response.destroyed) return;
      finished = true;
      const failure = publicFleetError(error);
      sendRefusal(request, response, failure.status, failure.body, headOnly);
    } finally {
      finished = true;
      release();
      request.removeListener('aborted', onClientDisconnect);
      response.removeListener('close', onClientDisconnect);
    }
  };

  const handleTaskMessage = async (
    request: IncomingMessage,
    response: ServerResponse,
    repositoryId: string,
    taskId: string,
  ): Promise<void> => {
    /**
     * The write is bounded by the same `max_concurrency` the collaboration
     * reads are, and for the same reason: each admitted write owns a child
     * process. There is no queue, because the board only ever has one send in
     * flight, so a caller above the cap is not a browser waiting its turn.
     */
    if (activeTaskMessageWriters >= maxConcurrency) {
      sendRefusal(request, response, 503, errorBody(
        'task_message_busy',
        'The task message service is busy.',
        'Wait for the current message to finish, then send it again.',
      ), false, { 'Retry-After': '1' });
      return;
    }
    activeTaskMessageWriters += 1;
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolvePending) => { resolveCompletion = resolvePending; });
    activeTaskMessageCompletions.add(completion);
    const controller = new AbortController();
    let finished = false;
    let clientDisconnected = false;
    let serverClosing = false;
    let timeoutExpired = false;
    let rejectCancellation: ((reason: unknown) => void) | null = null;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cancel = (reason: 'client_disconnect' | 'server_shutdown'): void => {
      if (finished) return;
      if (reason === 'client_disconnect') clientDisconnected = true;
      else serverClosing = true;
      controller.abort();
      if (reason === 'server_shutdown' && !response.destroyed) response.destroy();
      rejectCancellation?.(OPERATOR_TASK_MESSAGE_REQUEST_ABORTED);
    };
    const onClientDisconnect = () => cancel('client_disconnect');
    const cancelForServerClose = () => cancel('server_shutdown');
    request.once('aborted', onClientDisconnect);
    response.once('close', onClientDisconnect);
    activeTaskMessageCancellers.add(cancelForServerClose);
    const timer = setTimeout(() => {
      if (finished) return;
      timeoutExpired = true;
      controller.abort();
      rejectCancellation?.(new OperatorTaskMessageTimeoutError());
    }, timeoutMs);
    try {
      const read = await Promise.race([
        readBoundedRequestBody(request, OPERATOR_TASK_MESSAGE_REQUEST_MAX_BYTES, controller.signal),
        cancellation,
      ]);
      if (!read.ok) {
        if (read.reason === 'aborted') {
          throw timeoutExpired ? new OperatorTaskMessageTimeoutError() : OPERATOR_TASK_MESSAGE_REQUEST_ABORTED;
        }
        finished = true;
        if (read.reason === 'envelope_too_large') {
          sendRefusal(request, response, 413, errorBody(
            'task_message_envelope_too_large',
            'The task message request envelope is too large.',
            'Shorten the request, then send it again.',
          ));
        } else {
          sendRefusal(request, response, 400, errorBody('invalid_request', 'The request body is invalid.', OPERATOR_REOBSERVE_ACTION));
        }
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(read.text);
      } catch (_error) {
        finished = true;
        sendRefusal(request, response, 400, errorBody('invalid_request', 'The request body is not valid JSON.', OPERATOR_REOBSERVE_ACTION));
        return;
      }
      const payload = decodeTaskMessageRequest(parsed);
      if (payload === null) {
        finished = true;
        sendRefusal(request, response, 400, errorBody('invalid_request', 'The request body is invalid.', OPERATOR_REOBSERVE_ACTION));
        return;
      }
      if (Buffer.byteLength(payload.body, 'utf-8') > OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES) {
        finished = true;
        sendRefusal(request, response, 413, errorBody(
          'task_message_body_too_large',
          `The message body must be at most ${OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES} bytes.`,
          'Shorten the message, then send it again.',
        ));
        return;
      }
      const input: SendOperatorTaskMessageInput = {
        env: options.env,
        repository_id: repositoryId,
        task_id: taskId,
        message_id: payload.message_id,
        scope: payload.scope,
        expected_task_revision: payload.expected_task_revision,
        expected_claim_id: payload.expected_claim_id,
        expected_generation: payload.expected_generation,
        body: payload.body,
      };
      const result = send === undefined
        ? await sendDefaultTaskMessage({ ...input, env: collaborationWorkerEnvironment(input.env) }, controller.signal)
        : await Promise.race([
            Promise.resolve().then(() => send({ ...input, signal: controller.signal })),
            cancellation,
          ]);
      if (clientDisconnected || serverClosing || response.destroyed) return;
      finished = true;
      sendJson(response, result.created ? 201 : 200, {
        ok: true,
        protocol: OPERATOR_SERVER_PROTOCOL,
        repository_id: result.repository_id,
        task_id: result.task_id,
        message_id: result.message_id,
        scope: result.scope,
        created: result.created,
      });
    } catch (error) {
      if (clientDisconnected || serverClosing || response.destroyed) return;
      finished = true;
      if (timeoutExpired) response.shouldKeepAlive = false;
      const failure = publicTaskMessageError(timeoutExpired ? new OperatorTaskMessageTimeoutError() : error);
      sendRefusal(request, response, failure.status, failure.body);
    } finally {
      finished = true;
      activeTaskMessageWriters -= 1;
      clearTimeout(timer);
      activeTaskMessageCancellers.delete(cancelForServerClose);
      activeTaskMessageCompletions.delete(completion);
      resolveCompletion();
      request.removeListener('aborted', onClientDisconnect);
      response.removeListener('close', onClientDisconnect);
    }
  };

  const handleCollaborationSnapshot = async (
    request: IncomingMessage,
    response: ServerResponse,
    repositoryId: string,
    headOnly = false,
  ): Promise<void> => {
    let observation: CollaborationObservation;
    try {
      observation = acquireCollaborationObservation(repositoryId);
    } catch (error) {
      const failure = publicCollaborationError(error);
      sendRefusal(request, response, failure.status, failure.body, headOnly);
      return;
    }
    let finished = false;
    let clientDisconnected = false;
    let serverClosing = false;
    let released = false;
    let rejectCancellation: ((reason: unknown) => void) | null = null;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const release = (): void => {
      if (released) return;
      released = true;
      releaseCollaborationObservation(observation);
    };
    const cancel = (reason: 'client_disconnect' | 'server_shutdown'): void => {
      if (finished) return;
      if (reason === 'client_disconnect') clientDisconnected = true;
      else serverClosing = true;
      release();
      if (reason === 'server_shutdown' && !response.destroyed) response.destroy();
      rejectCancellation?.(OPERATOR_COLLABORATION_REQUEST_ABORTED);
    };
    const onClientDisconnect = () => cancel('client_disconnect');
    const cancelForServerClose = () => cancel('server_shutdown');
    request.once('aborted', onClientDisconnect);
    response.once('close', onClientDisconnect);
    activeCollaborationRequestCancellers.add(cancelForServerClose);
    try {
      const collaboration = await Promise.race([
        observation.promise,
        cancellation,
      ]);
      if (clientDisconnected || serverClosing || response.destroyed) return;
      finished = true;
      sendJson(response, 200, collaboration, headOnly);
    } catch (error) {
      if (clientDisconnected || serverClosing || response.destroyed) return;
      finished = true;
      const failure = publicCollaborationError(error);
      sendRefusal(request, response, failure.status, failure.body, headOnly);
    } finally {
      finished = true;
      release();
      activeCollaborationRequestCancellers.delete(cancelForServerClose);
      request.removeListener('aborted', onClientDisconnect);
      response.removeListener('close', onClientDisconnect);
    }
  };

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? 'GET';
    const headOnly = method === 'HEAD';
    const expectedAuthority = expectedRequestAuthority(host, request);
    const requestHost = request.headers.host?.trim().toLowerCase();
    if (expectedAuthority === null || requestHost !== expectedAuthority) {
      sendRefusal(request, response, 421, errorBody('host_not_allowed', 'The request Host is not allowed.'), headOnly);
      return;
    }
    const expectedOrigin = `http://${expectedAuthority}`;
    const requestOrigin = request.headers.origin;
    if (requestOrigin === undefined) {
      // A read may come from curl; the one write may not. A browser always
      // sends Origin on POST, so a missing header is never the board itself.
      if (method === 'POST') {
        sendRefusal(request, response, 403, errorBody(
          'origin_required',
          'The request Origin is required for writes.',
          'Send the message from the operator board on this loopback origin.',
        ));
        return;
      }
    } else if (requestOrigin !== expectedOrigin) {
      sendRefusal(request, response, 403, errorBody('origin_not_allowed', 'The request Origin is not allowed.'), headOnly);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only GET, HEAD, and POST are supported.'), false, {
        Allow: OPERATOR_ALLOWED_METHODS,
      });
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url ?? '/', expectedOrigin);
      if (url.origin !== expectedOrigin) {
        sendRefusal(request, response, 421, errorBody('host_not_allowed', 'The request URL authority is not allowed.'), headOnly);
        return;
      }
    } catch (_error) {
      sendRefusal(request, response, 400, errorBody('invalid_request', 'The request URL is invalid.'), headOnly);
      return;
    }
    const pathname = url.pathname;

    const taskMessageRoute = OPERATOR_TASK_MESSAGE_ROUTE.exec(pathname);
    if (method === 'POST' && taskMessageRoute === null) {
      sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only the task message route accepts POST.'), false, {
        Allow: OPERATOR_ALLOWED_METHODS,
      });
      return;
    }
    if (taskMessageRoute !== null) {
      if (method !== 'POST') {
        sendRefusal(request, response, 405, errorBody('method_not_allowed', 'The task message route accepts POST only.'), false, {
          Allow: OPERATOR_ALLOWED_METHODS,
        });
        return;
      }
      if (!isJsonRequest(request)) {
        sendRefusal(request, response, 415, errorBody(
          'unsupported_media_type',
          'The task message request must be sent as application/json.',
          'Send the message from the operator board on this loopback origin.',
        ));
        return;
      }
      await handleTaskMessage(request, response, taskMessageRoute[1]!, taskMessageRoute[2]!);
      return;
    }

    if (pathname === OPERATOR_HEALTH_PATH) {
      const health: OperatorHealthResponseV1 = {
        ok: true,
        service: OPERATOR_SERVICE_NAME,
        protocol: OPERATOR_SERVER_PROTOCOL,
      };
      sendJson(response, 200, health, headOnly);
      return;
    }

    if (pathname === OPERATOR_FLEET_SNAPSHOT_PATH) {
      await handleFleetSnapshot(request, response, headOnly);
      return;
    }

    const collaborationRoute = OPERATOR_COLLABORATION_SNAPSHOT_ROUTE.exec(pathname);
    if (collaborationRoute !== null) {
      // POST reached 405 above; this route reads and nothing else.
      await handleCollaborationSnapshot(request, response, collaborationRoute[1]!, headOnly);
      return;
    }

    /**
     * The API prefix is claimed case-insensitively while the routes above stay
     * exact, because the static fallback resolves case-insensitively on macOS
     * and Windows: `/API/v1/fleet/snapshot` matched no API route, fell through
     * to the SPA shell, and answered a navigation with 200 HTML. Anything under
     * the API prefix that reached here is a missing API route and says so.
     */
    const apiPathname = pathname.toLowerCase();
    if (apiPathname === OPERATOR_API_PATH_PREFIX || apiPathname.startsWith(`${OPERATOR_API_PATH_PREFIX}/`)) {
      sendRefusal(request, response, 404, errorBody('not_found', 'The requested operator API route does not exist.'), headOnly);
      return;
    }

    const requestedFile = fileIfSafe(staticRoot, pathname);
    const file = requestedFile ?? (isHtmlNavigation(request, pathname) ? fallbackIndex(staticRoot) : null);
    if (file === null) {
      if (pathname === '/' || isHtmlNavigation(request, pathname)) {
        sendRefusal(request, response, 503, errorBody('operator_assets_unavailable', 'Operator UI assets are unavailable.', OPERATOR_ASSET_ACTION), headOnly);
      } else {
        sendRefusal(request, response, 404, errorBody('not_found', 'The requested operator asset does not exist.'), headOnly);
      }
      return;
    }

    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch (_error) {
      sendRefusal(request, response, 503, errorBody('operator_assets_unavailable', 'Operator UI assets are unavailable.', OPERATOR_ASSET_ACTION), headOnly);
      return;
    }
    const headers = {
      ...staticHeaders(contentType(file)),
      'Content-Length': body.byteLength.toString(),
    };
    response.writeHead(200, headers);
    if (headOnly) response.end();
    else response.end(body);
  };

  const server: Server = createServer((request, response) => {
    void handleRequest(request, response).catch((_error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendRefusal(request, response, 500, errorBody('operator_server_unavailable', 'Operator server failed to handle the request.'));
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    throw new OperatorServerError('operator_server_unavailable', 'Operator server did not expose a TCP address.');
  }
  const actualPort = address.port;
  const urlHost = host === '::1' ? `[${host}]` : host;
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    activeFleetCanceller?.();
    for (const cancel of activeTaskMessageCancellers) cancel();
    for (const cancel of activeCollaborationRequestCancellers) cancel();
    await Promise.allSettled([...activeTaskMessageCompletions]);
    if (!server.listening) return;
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error?: Error) => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') rejectClose(error);
        else resolveClose();
      });
    });
  };

  return Object.freeze({
    host,
    port: actualPort,
    url: `http://${urlHost}:${actualPort}`,
    close,
  });
}
