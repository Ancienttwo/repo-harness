import { decodeAdmittedTaskActivity, parseAdmittedTaskActivityRequest, type AdmittedTaskActivityRequest, type AdmittedTaskActivity } from '../../core/operator/admitted-task-activity';
import { decodeAdmittedTaskSessions, isTaskSessionsRequest, type AdmittedTaskSessionsRequest, type AdmittedTaskSessions } from '../../core/sessions/task-sessions';
import { startRuntimeService } from './runtime-service';
import { startDevActivityCollector } from '../dev-activity/collector';
import { decodeDevActivitySnapshot, unavailableDevActivitySnapshot } from '../../core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../core/dev-activity/types';
import { startSetupCollector } from '../setup/collector';
import { decodeSetupSnapshot, unavailableSetupSnapshot } from '../../core/setup/decode';
import type { SetupSnapshotV1 } from '../../core/setup/types';
import { startBotAccessCollector, type BotAccessCacheV1 } from './bot-access';
import { decodeBotAccessSnapshot } from '../../core/operator/bot-access';
import { startCliInventoryCollector, type CliUsageSource } from '../setup/cli-inventory';
import { decodeCliInventory, unavailableCliInventory, type CliInventorySnapshotV1 } from '../../core/setup/cli-inventory';
import { decodeRuntimeOverlay, unavailableRuntimeOverlay, type RuntimeOverlay } from '../../core/operator/runtime-status';
import { ARCHITECTURE_FAILURES, parseArchitectureRequest, decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt, OPERATOR_ARCHITECTURE_MODULES_ROUTE, OPERATOR_ARCHITECTURE_MODULE_ROUTE, OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE } from '../../core/operator/architecture';
export { OPERATOR_ARCHITECTURE_MODULES_ROUTE, OPERATOR_ARCHITECTURE_MODULE_ROUTE, OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE } from '../../core/operator/architecture';
import { decodeNotifyStatus, type NotifyStatusV1 } from '../../core/operator/notify-status';
import { readNotifyStatus, type NotifyStatusReadInput } from './notify-status';
import { decodeOperatorTaskHistory, parseTaskHistoryRequest, TASK_HISTORY_FAILURES, type OperatorTaskHistoryRequest, type OperatorTaskHistory } from '../../core/operator/task-history';
import { createHash, randomUUID } from 'node:crypto';
import { decodeAdmittedTaskContext, type AdmittedTaskContext } from '../../core/operator/admitted-task-context';
import { Worker as ObservationWorker } from 'node:worker_threads';
import { decodeOperatorTaskActivity, parseTaskActivityRequest, TASK_ACTIVITY_FAILURES, type OperatorTaskActivityRequest, type OperatorTaskActivity } from '../../core/operator/task-activity';
import { decodeOperatorTaskDiff, parseTaskDiffRequest, type OperatorTaskDiff } from '../../core/operator/task-diff';
import { SESSION_OBSERVATION_FAILURES, type AdmittedSessionSelector } from '../../core/sessions/session-selector';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { reapOrphanedProcessGroups, spawnRegisteredProcessGroup } from '../process-group-registry';
import { terminateProcessGroup, type ProcessGroupTermination } from '../process-group-termination';
import { basename, dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOperatorWriteToken, handleOperatorWrite, operatorWriteTokenCookie, type OperatorWriteRoute } from './write-channel';

import type { OperatorRepositorySnapshotV1 } from '../../core/operator/repository-snapshot';
import {
  projectOperatorFleetSnapshot,
  type OperatorFleetSnapshotV1,
} from '../../core/operator/fleet-snapshot';
import {
  OperatorRepositoryError,
  assertOperatorRepositorySnapshotIdentity,
  type OperatorRepositoryErrorCode,
  type ReadOperatorRepositorySnapshotInput,
} from './repository-snapshot';
import {
  FleetBoardError,
  type FleetBoardFatalErrorCode,
  type FleetBoardCollectorOptions,
} from '../fleet/board';
import type { FleetBoardSnapshotV2 } from '../../core/fleet/board';

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
const OPERATOR_REPOSITORY_ACTION = 'Check the repository repository store, then refresh the board.';

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
export const OPERATOR_TASK_CONTEXT_ROUTE = /^\/api\/v1\/fleet\/task-sessions\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/context$/u;
export const OPERATOR_TASK_HISTORY_ROUTE = /^\/api\/v1\/fleet\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([0-9a-f]{64})\/context$/u;
export const OPERATOR_TASK_ACTIVITY_ROUTE = /^\/api\/v1\/fleet\/task-sessions\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/activity$/u;
export const OPERATOR_HISTORICAL_TASK_ACTIVITY_ROUTE = /^\/api\/v1\/fleet\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([0-9a-f]{64})\/history\/activity$/u;
export const OPERATOR_TASK_SESSIONS_ROUTE = /^\/api\/v1\/fleet\/task-sessions\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/u;
export const OPERATOR_TASK_DIFF_ROUTE = /^\/api\/v1\/fleet\/task-sessions\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/diff$/u;
/**
 * The repository id is matched loosely and resolved strictly, the same split the
 * repository snapshot route uses: the registry is the authority on which ids
 * exist, and duplicating its shape here would be a second opinion about it.
 */
export const OPERATOR_REPOSITORY_SNAPSHOT_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/snapshot$/u;
export const OPERATOR_RUNTIME_STATUS_PATH = '/api/v1/runtime/status' as const;
export const OPERATOR_NOTIFY_STATUS_PATH = '/api/v1/notify/status' as const;
export const OPERATOR_DEV_ACTIVITY_PATH = '/api/v1/dev-activity' as const;
export const OPERATOR_SETUP_PATH = '/api/v1/setup' as const;
export const OPERATOR_BOT_ACCESS_PATH = '/api/v1/bot-access' as const;
export const OPERATOR_CLI_INVENTORY_PATH = '/api/v1/cli-inventory' as const;
const DEFAULT_STATIC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../dist/operator-ui',
);

export interface OperatorRouteV1 {
  readonly id: string;
  readonly method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** The literal path, or the route regexp's source for a parameterized one. */
  readonly pattern: string;
  /** True only for a route that can change repository state. */
  readonly write: boolean;
}

/**
 * The complete read-only route surface, as a value.
 */
export const OPERATOR_ROUTES: readonly OperatorRouteV1[] = Object.freeze([
  Object.freeze({ id: 'health', method: 'GET', pattern: OPERATOR_HEALTH_PATH, write: false }),
  Object.freeze({ id: 'fleet_snapshot', method: 'GET', pattern: OPERATOR_FLEET_SNAPSHOT_PATH, write: false }),
  Object.freeze({
    id: 'repository_snapshot',
    method: 'GET',
    pattern: OPERATOR_REPOSITORY_SNAPSHOT_ROUTE.source,
    write: false,
  }),
  Object.freeze({ id: 'task_history', method: 'GET', pattern: OPERATOR_TASK_HISTORY_ROUTE.source, write: false }),
  Object.freeze({ id: 'task_context', method: 'GET', pattern: OPERATOR_TASK_CONTEXT_ROUTE.source, write: false }),
  Object.freeze({ id: 'historical_task_activity', method: 'GET', pattern: OPERATOR_HISTORICAL_TASK_ACTIVITY_ROUTE.source, write: false }),
  Object.freeze({ id: 'task_activity', method: 'GET', pattern: OPERATOR_TASK_ACTIVITY_ROUTE.source, write: false }),
  Object.freeze({ id: 'task_sessions', method: 'GET', pattern: OPERATOR_TASK_SESSIONS_ROUTE.source, write: false }),
  Object.freeze({ id: 'task_diff', method: 'GET', pattern: OPERATOR_TASK_DIFF_ROUTE.source, write: false }),
  Object.freeze({ id: 'runtime_status', method: 'GET', pattern: OPERATOR_RUNTIME_STATUS_PATH, write: false }),
  Object.freeze({ id: 'notify_status', method: 'GET', pattern: OPERATOR_NOTIFY_STATUS_PATH, write: false }),
  Object.freeze({ id: 'dev_activity', method: 'GET', pattern: OPERATOR_DEV_ACTIVITY_PATH, write: false }),
  Object.freeze({ id: 'setup', method: 'GET', pattern: OPERATOR_SETUP_PATH, write: false }),
  Object.freeze({ id: 'bot_access', method: 'GET', pattern: OPERATOR_BOT_ACCESS_PATH, write: false }),
  Object.freeze({ id: 'cli_inventory', method: 'GET', pattern: OPERATOR_CLI_INVENTORY_PATH, write: false }),
  Object.freeze({ id: 'architecture_modules', method: 'GET', pattern: OPERATOR_ARCHITECTURE_MODULES_ROUTE.source, write: false }),
  Object.freeze({ id: 'architecture_module', method: 'GET', pattern: OPERATOR_ARCHITECTURE_MODULE_ROUTE.source, write: false }),
  Object.freeze({ id: 'architecture_review_prompt', method: 'GET', pattern: OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE.source, write: false }),
  Object.freeze({ id: 'static_asset', method: 'GET', pattern: OPERATOR_STATIC_ASSET_PATTERN, write: false }),
] as const);

export type OperatorServerHost = '127.0.0.1' | '::1';

/** The route supplies cancellation to every asynchronous repository reader. */
export type OperatorRepositorySnapshotReaderInput = ReadOperatorRepositorySnapshotInput & {
  readonly signal: AbortSignal;
};

export interface OperatorServerOptions {
  /** Cache read only. Observation lifecycle runs outside the HTTP request. */
  readonly read_runtime_status?: () => RuntimeOverlay;
  readonly runtime_status_config?: string;
  readonly read_task_history?: (input: OperatorTaskHistoryRequest & { readonly signal: AbortSignal }) => Promise<OperatorTaskHistory>;
  readonly read_task_context?: (input: AdmittedSessionSelector & { readonly signal: AbortSignal }) => Promise<AdmittedTaskContext>;
  readonly read_admitted_task_activity?: (input: AdmittedTaskActivityRequest & { readonly signal: AbortSignal }) => Promise<AdmittedTaskActivity>;
  readonly read_task_activity?: (input: OperatorTaskActivityRequest & { readonly signal: AbortSignal }) => Promise<OperatorTaskActivity>;
  readonly read_task_sessions?: (input: AdmittedTaskSessionsRequest & { readonly signal: AbortSignal }) => Promise<AdmittedTaskSessions>;
  readonly read_task_diff?: (input: AdmittedSessionSelector & { readonly signal: AbortSignal }) => Promise<OperatorTaskDiff>;
  readonly read_notify_status?: (input: NotifyStatusReadInput) => Promise<NotifyStatusV1>;
  /** Dev Activity cache reader. GET serves only this cache; it never collects. */
  readonly read_dev_activity?: () => DevActivitySnapshotV2;
  /** Start the in-process Dev Activity collector (operator serve). Ignored when a cache reader is injected. */
  readonly dev_activity_collector?: boolean;
  /** Setup snapshot cache reader. GET serves only this cache; it never runs setup check. */
  readonly read_setup?: () => SetupSnapshotV1;
  /** Start the in-process setup collector (operator serve). Ignored when a cache reader is injected. */
  readonly setup_collector?: boolean;
  /** Bot access cache reader. GET serves only this cache; it never runs the doctor or Herdr. */
  readonly read_bot_access?: () => BotAccessCacheV1;
  /** Start the in-process Bot access collector (operator serve). Ignored when a cache reader is injected. */
  readonly bot_access_collector?: boolean;
  /** CLI inventory cache reader. GET serves only this cache; it never probes a package manager. */
  readonly read_cli_inventory?: () => CliInventorySnapshotV1;
  /**
   * Start the in-process CLI inventory collector (operator serve). The caller
   * names the hook telemetry it reads for agent use. Ignored when a cache reader is injected.
   */
  readonly cli_inventory_collector?: { readonly usage_sources: () => readonly CliUsageSource[] };
  readonly host?: string;
  /** Port 0 is accepted by the effect for ephemeral test servers. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly static_root?: string;
  readonly max_concurrency?: number;
  readonly timeout_ms?: number;
  readonly collect_fleet_board?: (
    options?: FleetBoardCollectorOptions,
  ) => Promise<FleetBoardSnapshotV2>;
  readonly read_repository_snapshot?: (
    input: OperatorRepositorySnapshotReaderInput,
  ) => Promise<OperatorRepositorySnapshotV1>;
  /**
   * Write routes admitted for POST. Each one must match a `POST`, `write: true`
   * entry of the route inventory, or the server does not start. Production
   * passes none: no business write is open yet.
   */
  readonly write_routes?: readonly OperatorWriteRoute[];
  /** The route inventory write routes bind to. Production uses OPERATOR_ROUTES; only tests inject another. */
  readonly route_inventory?: readonly OperatorRouteV1[];
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

/** The methods a read resource implements; a write route implements POST only. */
const OPERATOR_ALLOWED_METHODS = 'GET, HEAD' as const;
const OPERATOR_WRITE_ALLOWED_METHODS = 'POST' as const;

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
  if (error instanceof OperatorFleetBusyError) return { status: 503, body: errorBody('fleet_snapshot_busy', 'Fleet observation queue is full.') };
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
      fleet_repository_not_found: 'Repository is not registered.',
      fleet_board_argument_invalid: 'Fleet snapshot request is invalid.',
      fleet_watch_aborted_before_first_snapshot: 'Fleet snapshot collection was aborted.',
    };
    return {
      status: error.code === 'fleet_repository_not_found' ? 404 : error.code === 'fleet_board_argument_invalid' ? 400 : 503,
      body: errorBody(error.code, messageByCode[error.code]),
    };
  }
  return {
    status: 503,
    body: errorBody('fleet_snapshot_unavailable', 'Fleet snapshot is unavailable.'),
  };
}

class OperatorFleetBusyError extends Error {}

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
 * Every repository read failure as a fixed public sentence. The effect's own
 * message names a repository id and its cause carries a store path and a
 * provider diagnostic; the transport keeps the typed code and drops both.
 */
const REPOSITORY_FAILURES: Readonly<Record<OperatorRepositoryErrorCode, PublicFailure>> = Object.freeze({
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
  repository_snapshot_unavailable: {
    status: 503,
    message: 'The repository store cannot be read.',
    next_action: OPERATOR_REPOSITORY_ACTION,
  },
  repository_mismatch: {
    status: 500,
    message: 'The repository snapshot does not belong to the requested repository.',
    next_action: OPERATOR_REPOSITORY_ACTION,
  },
});

function publicRepositoryError(error: unknown): {
  readonly status: number;
  readonly body: OperatorErrorResponseV1;
} {
  if (error instanceof OperatorRepositoryBusyError) {
    return {
      status: 503,
      body: errorBody(
        'repository_snapshot_busy',
        'The repository snapshot service is busy.',
        'Wait for the current repository refresh to finish, then retry.',
      ),
    };
  }
  if (error instanceof OperatorRepositoryTimeoutError) {
    return {
      status: 503,
      body: errorBody(
        'repository_snapshot_timeout',
        'The repository snapshot timed out.',
        'Refresh the repository panel and retry.',
      ),
    };
  }
  if (error instanceof OperatorRepositoryError) {
    const failure = REPOSITORY_FAILURES[error.code];
    if (failure) {
      return { status: failure.status, body: errorBody(error.code, failure.message, failure.next_action) };
    }
  }
  return {
    status: 503,
    body: errorBody(
      'repository_snapshot_unavailable',
      'The repository store cannot be read.',
      OPERATOR_REPOSITORY_ACTION,
    ),
  };
}

class OperatorRepositoryTimeoutError extends Error {
  readonly code = 'repository_snapshot_timeout' as const;

  constructor() {
    super('repository snapshot deadline exceeded');
    this.name = 'OperatorRepositoryTimeoutError';
  }
}

class OperatorRepositoryBusyError extends Error {
  readonly code = 'repository_snapshot_busy' as const;

  constructor() {
    super('repository snapshot queue is full');
    this.name = 'OperatorRepositoryBusyError';
  }
}

const OPERATOR_REPOSITORY_REQUEST_ABORTED = Symbol('operator-repository-request-aborted');

type OperatorRepositoryWorkerResponse =
  | {
      readonly ok: true;
      readonly snapshot: OperatorRepositorySnapshotV1;
    }
  | {
      readonly ok: false;
      readonly code: OperatorRepositoryErrorCode;
    };

// Observation children are read-only. Git must not fetch promised objects,
// take optional locks or prompt. Apply these last so caller values cannot reopen them.
const OPERATOR_READ_ONLY_GIT_ENVIRONMENT = { GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } as const;

function repositoryWorkerEnvironment(env: NodeJS.ProcessEnv | undefined): Record<string, string> | undefined {
  if (env === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function repositoryWorkerResponse(value: unknown): OperatorRepositoryWorkerResponse | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  if (value.ok === true && 'snapshot' in value && typeof value.snapshot === 'object' && value.snapshot !== null) {
    return { ok: true, snapshot: value.snapshot as OperatorRepositorySnapshotV1 };
  }
  if (
    value.ok === false
    && 'code' in value
    && (value.code === 'registry_unavailable'
      || value.code === 'repository_not_found'
      || value.code === 'repository_snapshot_unavailable'
      || value.code === 'repository_mismatch')
  ) {
    return { ok: false, code: value.code };
  }
  return null;
}

/**
 * The repository collector is synchronous and can block in filesystem or
 * provider reads. Run the production reader outside the HTTP event loop so the
 * route deadline can terminate the work rather than merely race a blocked turn.
 */
function readDefaultRepositorySnapshot(
  input: OperatorRepositorySnapshotReaderInput,
): Promise<OperatorRepositorySnapshotV1> {
  return new Promise((resolveRead, rejectRead) => {
    const worker = new ObservationWorker(new URL('./repository-snapshot-worker.ts', import.meta.url), {
      workerData: {
        env: repositoryWorkerEnvironment(input.env),
        repository_id: input.repository_id,
      },
      env: { ...process.env, ...OPERATOR_READ_ONLY_GIT_ENVIRONMENT },
    });
    let settled = false;
    let result:
      | { readonly ok: true; readonly snapshot: OperatorRepositorySnapshotV1 }
      | { readonly ok: false; readonly error: unknown }
      | undefined;
    const finish = (
      outcome:
        | { readonly ok: true; readonly snapshot: OperatorRepositorySnapshotV1 }
        | { readonly ok: false; readonly error: unknown },
    ): void => {
      if (settled) return;
      settled = true;
      result = outcome;
      input.signal.removeEventListener('abort', onAbort);
      // The outer subscription can finish at its deadline, but this promise
      // continues owning capacity until the worker's exit event.
      void worker.terminate().catch(() => {});
    };
    const onAbort = (): void => finish({ ok: false, error: OPERATOR_REPOSITORY_REQUEST_ABORTED });
    input.signal.addEventListener('abort', onAbort, { once: true });
    worker.once('exit', () => {
      input.signal.removeEventListener('abort', onAbort);
      if (result?.ok) resolveRead(result.snapshot);
      else rejectRead(result?.error ?? new OperatorRepositoryError('repository_snapshot_unavailable', 'repository worker exited without a response'));
    });
    worker.once('message', (value: unknown) => {
      const response = repositoryWorkerResponse(value);
      if (response === null) {
        finish({
          ok: false,
          error: new OperatorRepositoryError(
            'repository_snapshot_unavailable',
            'repository worker returned an invalid response',
          ),
        });
      } else if (response.ok) {
        try {
          assertOperatorRepositorySnapshotIdentity(response.snapshot, input.repository_id);
        } catch (error) {
          finish({ ok: false, error });
          return;
        }
        finish({ ok: true, snapshot: response.snapshot });
      } else {
        finish({
          ok: false,
          error: new OperatorRepositoryError(response.code, `repository worker failed with ${response.code}`),
        });
      }
    });
    worker.once('error', (error) => {
      finish({
        ok: false,
        error: new OperatorRepositoryError(
          'repository_snapshot_unavailable',
          'repository worker failed',
          error,
        ),
      });
    });
    if (input.signal.aborted) {
      onAbort();
      return;
    }
  });
}

type OperatorFleetCollectorResponse =
  | {
      readonly ok: true;
      readonly snapshot: FleetBoardSnapshotV2;
    }
  | {
      readonly ok: false;
      readonly code: FleetBoardFatalErrorCode | 'fleet_snapshot_unavailable';
    }
  | {
      readonly ok: false;
      readonly cancelled: true;
    };

function fleetCollectorResponse(value: unknown): OperatorFleetCollectorResponse | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  if (value.ok === true && 'protocol' in value && value.protocol === 2 && 'snapshot' in value && typeof value.snapshot === 'object' && value.snapshot !== null) {
    return { ok: true, snapshot: value.snapshot as FleetBoardSnapshotV2 };
  }
  if (
    value.ok === false
    && 'code' in value
    && (value.code === 'fleet_snapshot_unavailable'
      || value.code === 'fleet_registry_unavailable'
      || value.code === 'fleet_registry_invalid'
      || value.code === 'fleet_repository_not_found'
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

// A collector without a PID or a signal failure cannot prove the group exited.
const UNCONFIRMED_COLLECTOR_TERMINATION: ProcessGroupTermination = { confirmed: false, forced: true };

function terminateCollectorProcessGroup(pid: number | undefined): Promise<ProcessGroupTermination> {
  if (pid === undefined) return Promise.resolve(UNCONFIRMED_COLLECTOR_TERMINATION);
  return terminateProcessGroup(pid, OPERATOR_WORKER_CLEANUP_GRACE_MS, {
    confirmMs: OPERATOR_FLEET_CONTROLLER_ACK_TIMEOUT_MS,
  }).catch(() => UNCONFIRMED_COLLECTOR_TERMINATION);
}

function fleetCollectorProcessPath(): string {
  return fileURLToPath(new URL('./fleet-collector-process.ts', import.meta.url));
}

function windowsFleetControllerPath(): string {
  return fileURLToPath(new URL('../../../assets/operator/fleet-windows-job-controller.ps1', import.meta.url));
}

/**
 * POSIX collection runs in a server-owned, registered detached process group. Windows
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
): Promise<FleetBoardSnapshotV2> {
  return readSupervisedOperatorProcess({
    process_path: fleetCollectorProcessPath(), env: input.env, signal: input.signal,
    start: { type:'start', protocol:2,
      scope: {kind:'fleet'},
      sequence:input.sequence, max_concurrency:input.max_concurrency, timeout_ms:input.timeout_ms,
      ...(process.platform === 'win32' ? {} : {env:repositoryWorkerEnvironment(input.env)}),
    },
    response: value => {
      const response = fleetCollectorResponse(value);
      return response?.ok
        ? { ok: true, snapshot: response.snapshot }
        : response;
    },
    failure: code => code === 'fleet_snapshot_unavailable'
      ? new Error('Fleet observation unavailable')
      : new FleetBoardError(code as FleetBoardFatalErrorCode, `Fleet collector failed with ${code}`),
  });
}

class OperatorTaskReadError extends Error {
  constructor(readonly code: string) { super(code); }
}

type SupervisedReadResponse<T> =
  | { readonly ok: true; readonly snapshot: T }
  | { readonly ok: false; readonly code: string }
  | { readonly ok: false; readonly cancelled: true };

function readSupervisedOperatorProcess<T>(input: {
  readonly process_path: string;
  readonly start: Readonly<Record<string, unknown>>;
  readonly response: (value: unknown) => SupervisedReadResponse<T> | null;
  readonly failure: (code: string) => Error;
  readonly env?: NodeJS.ProcessEnv;
  readonly signal: AbortSignal;
}): Promise<T> {
  if (input.signal.aborted) return Promise.reject(new OperatorFleetTimeoutError());
  return new Promise((resolveRead, rejectRead) => {
    const workerEnvironment = { ...process.env, ...repositoryWorkerEnvironment(input.env), ...OPERATOR_READ_ONLY_GIT_ENVIRONMENT };
    const collector = process.platform === 'win32'
      ? null
      : spawnRegisteredProcessGroup('operator-collector', () => spawn(process.execPath, [input.process_path], {
        env: workerEnvironment,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        windowsHide: true,
      }));
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
    let collectorResponse: SupervisedReadResponse<T> | null = null;
    let intended: { readonly ok: true; readonly snapshot: T } | { readonly ok: false; readonly error: unknown } | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    let acknowledgementTimer: ReturnType<typeof setTimeout> | null = null;
    let controllerCloseTimer: ReturnType<typeof setTimeout> | null = null;
    let posixFinalizing = false;
    let posixCancellationPending = false;
    const finish = (
      outcome:
        | { readonly ok: true; readonly snapshot: T }
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
      const outcome = intended;
      void terminateCollectorProcessGroup(collector.pid).then((termination) => {
        if (!termination.confirmed) finish({ ok: false, error: unavailable('Fleet collector process group did not exit') });
        else finish(outcome);
      });
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
      if (posixCancellationPending) return;
      finalizePosix();
    };
    const recordCollectorResponse = (value: unknown): void => {
      const response = input.response(value);
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
        intended = { ok: false, error: input.failure(response.code) };
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
        cleanupTimer = setTimeout(() => {
          cleanupTimer = null;
          intended = { ok: false, error: new OperatorFleetTimeoutError() };
          requestWindowsCleanup(true);
        }, OPERATOR_WORKER_CLEANUP_GRACE_MS);
        return;
      }
      if (collector === null || !writeChildJsonLine(collector, { type: 'cancel' })) {
        intended = { ok: false, error: unavailable('Fleet collector cannot accept cooperative cancellation') };
      }
      if (collector === null) return;
      posixCancellationPending = true;
      void terminateCollectorProcessGroup(collector.pid).then((termination) => {
        posixCancellationPending = false;
        // A collector that outlives the cooperative grace period has timed out,
        // whatever it reported before the forced kill.
        if (termination.forced) intended = { ok: false, error: new OperatorFleetTimeoutError() };
        if (!termination.confirmed) finish({ ok: false, error: unavailable('Fleet collector process group did not exit') });
        else finalize();
      });
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
          if (!writeChildJsonLine(controller, input.start)) {
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
        collector_path: input.process_path,
      })) {
        failWindowsController('Fleet Windows Job controller cannot accept collector launch');
      }
    } else if (collector !== null && !writeChildJsonLine(collector, input.start)) {
      finish({ ok: false, error: unavailable('Fleet collector cannot accept start payload') });
    }
    if (input.signal.aborted) {
      onAbort();
    }
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
  const readRepository = options.read_repository_snapshot ?? readDefaultRepositorySnapshot;
  let nextSnapshotSequence = 1;
  const activeRepositoryRequestCancellers = new Set<() => void>();
  const repositoryObservations = new Map<string, RepositoryObservation>();
  const repositoryQueue: RepositoryObservation[] = [];
  const repositoryQueueCapacity = maxConcurrency * 2;
  const repositoryCompletions = new Set<Promise<void>>();
  const activeTaskReadCancellers = new Set<() => void>();
  const activeTaskReadCompletions = new Set<Promise<void>>();
  let activeRepositoryWorkers = 0;

  interface RepositoryObservation {
    readonly repositoryId: string;
    readonly key: string;
    readonly controller: AbortController;
    readonly promise: Promise<OperatorRepositorySnapshotV1>;
    readonly resolve: (snapshot: OperatorRepositorySnapshotV1) => void;
    readonly reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout> | null;
    subscribers: number;
    started: boolean;
    settled: boolean;
  }

  const drainRepositoryQueue = (): void => {
    if (closed) return;
    while (activeRepositoryWorkers < maxConcurrency && repositoryQueue.length > 0) {
      const next = repositoryQueue.shift()!;
      if (next.settled || next.subscribers === 0) continue;
      startRepositoryObservation(next);
    }
  };

  const settleRepositoryObservation = (
    observation: RepositoryObservation,
    outcome:
      | { readonly ok: true; readonly snapshot: OperatorRepositorySnapshotV1 }
      | { readonly ok: false; readonly error: unknown },
  ): void => {
    if (observation.settled) return;
    observation.settled = true;
    if (observation.timer !== null) clearTimeout(observation.timer);
    if (!observation.started) {
      const queuedAt = repositoryQueue.indexOf(observation);
      if (queuedAt >= 0) repositoryQueue.splice(queuedAt, 1);
      if (repositoryObservations.get(observation.key) === observation) repositoryObservations.delete(observation.key);
    }
    if (outcome.ok) observation.resolve(outcome.snapshot);
    else observation.reject(outcome.error);
  };

  const cancelRepositoryObservation = (observation: RepositoryObservation, error: unknown): void => {
    if (observation.settled) return;
    observation.controller.abort();
    settleRepositoryObservation(observation, { ok: false, error });
  };

  const startRepositoryObservation = (observation: RepositoryObservation): void => {
    if (closed || observation.settled || observation.subscribers === 0) return;
    observation.started = true;
    activeRepositoryWorkers += 1;
    const completion = Promise.resolve().then(() => {
      if (observation.controller.signal.aborted) throw OPERATOR_REPOSITORY_REQUEST_ABORTED;
      return readRepository({
      env: options.env,
      repository_id: observation.repositoryId,
      signal: observation.controller.signal,
      });
    }).then(
      (snapshot) => settleRepositoryObservation(observation, { ok: true, snapshot }),
      (error) => settleRepositoryObservation(observation, { ok: false, error }),
    ).finally(() => {
      activeRepositoryWorkers -= 1;
      if (repositoryObservations.get(observation.key) === observation) repositoryObservations.delete(observation.key);
      repositoryCompletions.delete(completion);
      drainRepositoryQueue();
    });
    repositoryCompletions.add(completion);
  };

  const acquireRepositoryObservation = (repositoryId: string): RepositoryObservation => {
    if (closed) throw OPERATOR_REPOSITORY_REQUEST_ABORTED;
    const key = repositoryId;
    const existing = repositoryObservations.get(key);
    if (existing !== undefined) {
      if (existing.settled) throw new OperatorRepositoryBusyError();
      existing.subscribers += 1;
      return existing;
    }
    if (activeRepositoryWorkers >= maxConcurrency && repositoryQueue.length >= repositoryQueueCapacity) {
      throw new OperatorRepositoryBusyError();
    }
    let resolveObservation!: (snapshot: OperatorRepositorySnapshotV1) => void;
    let rejectObservation!: (error: unknown) => void;
    const observation: RepositoryObservation = {
      repositoryId, key,
      controller: new AbortController(),
      promise: new Promise<OperatorRepositorySnapshotV1>((resolveObservationPromise, rejectObservationPromise) => {
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
      cancelRepositoryObservation(observation, new OperatorRepositoryTimeoutError());
    }, timeoutMs);
    repositoryObservations.set(key, observation);
    if (activeRepositoryWorkers < maxConcurrency) startRepositoryObservation(observation);
    else repositoryQueue.push(observation);
    return observation;
  };

  const releaseRepositoryObservation = (observation: RepositoryObservation): void => {
    if (observation.subscribers === 0) return;
    observation.subscribers -= 1;
    if (observation.subscribers === 0 && !observation.settled) {
      cancelRepositoryObservation(observation, OPERATOR_REPOSITORY_REQUEST_ABORTED);
    }
  };

  interface FleetObservation {
    readonly key: string;
    readonly sequence: number;
    readonly controller: AbortController;
    readonly promise: Promise<OperatorFleetSnapshotV1>;
    readonly resolve: (snapshot: OperatorFleetSnapshotV1) => void;
    readonly reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout> | null;
    subscribers: number;
    settled: boolean;
  }
  const fleetObservations = new Map<string, FleetObservation>();
  const fleetQueue: FleetObservation[] = [];
  const fleetCompletions = new Set<Promise<void>>();
  const serviceEpoch = randomUUID();
  let activeFleetObservation: FleetObservation | null = null;
  let fleetClosing = false;

  const settleFleetObservation = (observation: FleetObservation, outcome:
    { readonly ok: true; readonly value: OperatorFleetSnapshotV1 } | { readonly ok: false; readonly error: unknown }): void => {
    if (observation.settled) return;
    observation.settled = true;
    if (observation.timer !== null) clearTimeout(observation.timer);
    if (fleetObservations.get(observation.key) === observation) fleetObservations.delete(observation.key);
    const index = fleetQueue.indexOf(observation);
    if (index >= 0) fleetQueue.splice(index, 1);
    if (outcome.ok) observation.resolve(outcome.value);
    else observation.reject(outcome.error);
  };

  const cancelFleetObservation = (observation: FleetObservation): void => {
    observation.controller.abort();
    settleFleetObservation(observation, { ok: false, error: new OperatorFleetTimeoutError() });
    // Retirement changes subscription identity, never the active process slot.
    drainFleetQueue();
  };

  const drainFleetQueue = (): void => {
    if (fleetClosing || activeFleetObservation !== null) return;
    const observation = fleetQueue.shift();
    if (observation === undefined) return;
    activeFleetObservation = observation;
    const input = {
      env: options.env,
      sequence: observation.sequence,
      max_concurrency: maxConcurrency,
      timeout_ms: timeoutMs,
      signal: observation.controller.signal,
    };
    const completion = Promise.resolve().then(() => {
      if (observation.controller.signal.aborted) throw new OperatorFleetTimeoutError();
      return collect === undefined ? readDefaultFleetSnapshot(input) : Promise.resolve(collect(input));
    }).then((raw) => {
      const value = projectOperatorFleetSnapshot(raw, serviceEpoch, basename);
      if (value.sequence !== observation.sequence) throw new Error('Fleet generation mismatch');
      settleFleetObservation(observation, { ok: true, value });
    }).catch((error: unknown) => {
      settleFleetObservation(observation, { ok: false, error });
    }).finally(() => {
      // The production promise settles only after process-group/Job cleanup.
      // Injected readers are held to the same settlement boundary.
      activeFleetObservation = null;
      fleetCompletions.delete(completion);
      drainFleetQueue();
    });
    fleetCompletions.add(completion);
  };

  const acquireFleetObservation = (): FleetObservation => {
    if (fleetClosing) throw new OperatorFleetTimeoutError();
    const key = 'fleet';
    const current = fleetObservations.get(key);
    if (current !== undefined) { current.subscribers += 1; return current; }
    if (activeFleetObservation !== null && fleetQueue.length >= maxConcurrency * 2) throw new OperatorFleetBusyError();
    let resolveObservation!: FleetObservation['resolve'];
    let rejectObservation!: FleetObservation['reject'];
    const observation: FleetObservation = {
      key, sequence: nextSnapshotSequence++, controller: new AbortController(),
      promise: new Promise((resolve, reject) => { resolveObservation = resolve; rejectObservation = reject; }),
      resolve: (value) => resolveObservation(value), reject: (error) => rejectObservation(error),
      timer: null, subscribers: 1, settled: false,
    };
    observation.timer = setTimeout(() => cancelFleetObservation(observation), timeoutMs);
    fleetObservations.set(key, observation);
    fleetQueue.push(observation);
    drainFleetQueue();
    return observation;
  };

  const handleFleetSnapshot = async (
    request: IncomingMessage,
    response: ServerResponse,
    headOnly: boolean,
  ): Promise<void> => {
    let observation: FleetObservation;
    try { observation = acquireFleetObservation(); }
    catch (error) {
      const failure = publicFleetError(error);
      sendRefusal(request, response, failure.status, failure.body, headOnly);
      return;
    }
    let released = false;
    let clientDisconnected = false;
    const release = (): void => {
      if (released) return;
      released = true;
      observation.subscribers -= 1;
      if (observation.subscribers === 0 && !observation.settled) cancelFleetObservation(observation);
    };
    const onClientDisconnect = (): void => { clientDisconnected = true; release(); };
    request.once('aborted', onClientDisconnect);
    response.once('close', onClientDisconnect);
    try {
      const current = await observation.promise;
      if (clientDisconnected || response.destroyed) return;
      sendJson(response, 200, current, headOnly);
    } catch (error) {
      if (clientDisconnected || response.destroyed) return;
      const failure = publicFleetError(error);
      sendRefusal(request, response, failure.status, failure.body, headOnly);
    } finally {
      release();
      request.removeListener('aborted', onClientDisconnect);
      response.removeListener('close', onClientDisconnect);
    }
  };

  const handleRepositorySnapshot = async (
    request: IncomingMessage,
    response: ServerResponse,
    repositoryId: string,
    headOnly = false,
  ): Promise<void> => {
    let observation: RepositoryObservation;
    try {
      observation = acquireRepositoryObservation(repositoryId);
    } catch (error) {
      const failure = publicRepositoryError(error);
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
      releaseRepositoryObservation(observation);
    };
    const cancel = (reason: 'client_disconnect' | 'server_shutdown'): void => {
      if (finished) return;
      if (reason === 'client_disconnect') clientDisconnected = true;
      else serverClosing = true;
      release();
      if (reason === 'server_shutdown' && !response.destroyed) {
        const failure = publicRepositoryError(OPERATOR_REPOSITORY_REQUEST_ABORTED);
        sendJson(response, failure.status, failure.body, headOnly);
      }
      rejectCancellation?.(OPERATOR_REPOSITORY_REQUEST_ABORTED);
    };
    const onClientDisconnect = () => cancel('client_disconnect');
    const cancelForServerClose = () => cancel('server_shutdown');
    request.once('aborted', onClientDisconnect);
    response.once('close', onClientDisconnect);
    activeRepositoryRequestCancellers.add(cancelForServerClose);
    try {
      const repository = await Promise.race([
        observation.promise,
        cancellation,
      ]);
      if (clientDisconnected || serverClosing || response.destroyed) return;
      finished = true;
      assertOperatorRepositorySnapshotIdentity(repository, repositoryId);
      sendJson(response, 200, repository, headOnly);
    } catch (error) {
      if (clientDisconnected || serverClosing || response.destroyed) return;
      finished = true;
      const failure = publicRepositoryError(error);
      sendRefusal(request, response, failure.status, failure.body, headOnly);
    } finally {
      finished = true;
      release();
      activeRepositoryRequestCancellers.delete(cancelForServerClose);
      request.removeListener('aborted', onClientDisconnect);
      response.removeListener('close', onClientDisconnect);
    }
  };

  const handleBoundedTaskRead = <TRequest extends object, TSnapshot>(
    response: ServerResponse, headOnly: boolean, input: TRequest,
    decode: (value: unknown, request: TRequest) => TSnapshot,
    failures: readonly string[], kind: 'context' | 'activity' | 'admitted_activity' | 'diff' | 'sessions' | 'history' | 'architecture',
    injected?: (request: TRequest & { readonly signal: AbortSignal }) => Promise<TSnapshot>,
    failureStatus: (failure: string) => number = failure => failure === 'history_unavailable' || failure === 'task_not_found' ? 404 : failure === 'stale' ? 409 : failure === 'too_large' ? 413 : 503,
    cacheRequest?: IncomingMessage,
  ): void => {
    if (closed) { sendJson(response,503,{code:'unavailable'},headOnly); return; }
    if (activeTaskReadCancellers.size >= maxConcurrency) { sendJson(response,503,{code:'busy'},headOnly); return; }
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => finish('unavailable');
    const release = () => activeTaskReadCancellers.delete(cancel);
    const finish = (failure?: string, snapshot?: TSnapshot) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.abort();
      response.removeListener('close',cancel);
      if (response.destroyed) return;
      if (failure) sendJson(response, failureStatus(failure),{code:failure},headOnly);
      else if (cacheRequest) {
        const etag = `"${createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}"`;
        if (cacheRequest.headers['if-none-match'] === etag) {
          response.writeHead(304, { ...jsonHeaders(), ETag: etag }); response.end();
        } else sendJson(response, 200, snapshot, headOnly, { ETag: etag });
      } else sendJson(response,200,snapshot,headOnly);
    };
    const accept = (value: unknown) => {
      try { finish(undefined,decode(value,input)); }
      catch { finish('unavailable'); }
    };
    activeTaskReadCancellers.add(cancel);
    response.once('close',cancel);
    timer = setTimeout(()=>finish('timeout'),timeoutMs);
    const pending = injected
      ? Promise.resolve().then(()=>{
        if (controller.signal.aborted) throw new OperatorTaskReadError('unavailable');
        return injected({...input,signal:controller.signal});
      })
      : readSupervisedOperatorProcess<TSnapshot>({
        process_path:fileURLToPath(new URL('./task-read-process.ts',import.meta.url)),
        env:options.env,
        signal:controller.signal,
        start:{type:'start',protocol:1,kind,request:input,env:repositoryWorkerEnvironment(options.env)},
        response:value=>{
          if (!value || typeof value !== 'object') return null;
          const record=value as Record<string,unknown>;
          if (record.ok === true && Object.keys(record).length === 2 && 'snapshot' in record) {
            try { return {ok:true,snapshot:decode(record.snapshot,input)}; } catch { return null; }
          }
          if (record.ok === false && Object.keys(record).length === 2 && typeof record.code === 'string' && failures.includes(record.code)) {
            return {ok:false,code:record.code};
          }
          if (record.ok === false && Object.keys(record).length === 2 && record.cancelled === true) return {ok:false,cancelled:true};
          return null;
        },
        failure:code=>new OperatorTaskReadError(code),
      });
    // The supervisor settles only after process-tree cleanup, including blocked sync Git.
    const completion = pending.then(accept,error=>finish(error instanceof OperatorTaskReadError ? error.code : 'unavailable')).finally(release);
    activeTaskReadCompletions.add(completion);
    void completion.finally(()=>activeTaskReadCompletions.delete(completion));
  };

  const writeToken = createOperatorWriteToken();
  const writeRoutes = options.write_routes ?? [];
  // The inventory is the one write authority: a handler it does not declare
  // as a POST write route is a second authority, so the server refuses to start.
  const routeInventory = options.route_inventory ?? OPERATOR_ROUTES;
  for (const route of writeRoutes) {
    const entry = routeInventory.find(candidate => candidate.id === route.id);
    if (entry?.method !== 'POST' || entry.write !== true || entry.pattern !== route.path.source) {
      throw new OperatorServerError('invalid_argument', `write route ${JSON.stringify(route.id)} has no matching POST write entry in the route inventory`, 400);
    }
  }
  const matchWriteRoute = (pathname: string): { readonly route: OperatorWriteRoute; readonly params: readonly string[] } | null => {
    for (const route of writeRoutes) {
      const match = route.path.exec(pathname);
      if (match !== null && match[0] === pathname) return { route, params: match.slice(1) };
    }
    return null;
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
    if (requestOrigin !== undefined && requestOrigin !== expectedOrigin) {
      sendRefusal(request, response, 403, errorBody('origin_not_allowed', 'The request Origin is not allowed.'), headOnly);
      return;
    }
    // A write is identified before it is routed: it must name this service as
    // its Origin and come from a same-origin fetch, whatever path it targets.
    const write = method === 'POST';
    if (write && requestOrigin === undefined) {
      sendRefusal(request, response, 403, errorBody('origin_required', 'A write request must send the Origin of this service.', 'Send the request from the operator page.'));
      return;
    }
    if (write && request.headers['sec-fetch-site'] !== 'same-origin') {
      sendRefusal(request, response, 403, errorBody('fetch_site_not_allowed', 'A write request must be a same-origin fetch.', 'Send the request from the operator page.'));
      return;
    }
    if (!write && method !== 'GET' && method !== 'HEAD') {
      sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only GET and HEAD are supported.'), false, {
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
    const writeMatch = matchWriteRoute(pathname);
    if (write) {
      if (writeMatch === null) {
        sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only GET and HEAD are supported.'), false, {
          Allow: OPERATOR_ALLOWED_METHODS,
        });
        return;
      }
      const reply = await handleOperatorWrite({
        request,
        route: writeMatch.route,
        params: writeMatch.params,
        token: writeToken,
        port: request.socket.localPort!,
        env: options.env,
      });
      const replyHeaders: Readonly<Record<string, string>> = reply.close ? { Connection: 'close' } : {};
      if (reply.refused) sendRefusal(request, response, reply.status, reply.body as unknown as OperatorErrorResponseV1, false, replyHeaders);
      else sendJson(response, reply.status, reply.body, false, replyHeaders);
      return;
    }
    if (writeMatch !== null) {
      sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only POST is supported.'), headOnly, {
        Allow: OPERATOR_WRITE_ALLOWED_METHODS,
      });
      return;
    }
    const fetchSite = request.headers['sec-fetch-site'];
    if (pathname.startsWith('/api/') && fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      sendJson(response, 403, { code: 'fetch_site_not_allowed' }, headOnly); return;
    }
    if (pathname.startsWith('/api/v1/repositories/') && pathname.includes('/architecture/modules')) {
      let input;
      try { input = parseArchitectureRequest(url); }
      catch { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
      if (!input) { sendJson(response, 404, { code: 'capability_not_found' }, headOnly); return; }
      handleBoundedTaskRead(response, headOnly, input, (value, request) => {
        const result = request.kind === 'architecture_modules' ? decodeArchitectureModuleIndex(value)
          : request.kind === 'architecture_module' ? decodeArchitectureModuleDetail(value) : decodeArchitectureReviewPrompt(value);
        if ('capability_id' in request && ('module' in result ? result.module.id !== request.capability_id
          : 'capability_id' in result && result.capability_id !== request.capability_id)) throw new Error('identity');
        return result;
      }, ARCHITECTURE_FAILURES, 'architecture', undefined, code =>
        code === 'timeout' ? 504 : code.endsWith('_not_found') ? 404 : code === 'invalid_request' || code === 'shard_out_of_range' ? 400
          : code === 'worktree_changed_during_read' ? 409 : code === 'unavailable' || code === 'busy' ? 503 : 422, request);
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

    if (pathname === OPERATOR_RUNTIME_STATUS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Runtime status takes no query parameters.', 'Remove query parameters.'), headOnly);
        return;
      }
      try {
        sendJson(response, 200, decodeRuntimeOverlay((options.read_runtime_status ?? runtimeService?.read ?? unavailableRuntimeOverlay)()), headOnly);
      } catch {
        sendJson(response, 200, unavailableRuntimeOverlay(), headOnly);
      }
      return;
    }

    if (pathname === OPERATOR_DEV_ACTIVITY_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Dev activity accepts no query selectors.'), headOnly);
        return;
      }
      let snapshot: DevActivitySnapshotV2;
      try {
        snapshot = decodeDevActivitySnapshot((options.read_dev_activity ?? devActivity?.read ?? unavailableDevActivitySnapshot)());
      } catch {
        snapshot = unavailableDevActivitySnapshot();
      }
      sendJson(response, 200, snapshot, headOnly);
      return;
    }

    if (pathname === OPERATOR_SETUP_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Setup accepts no query selectors.'), headOnly);
        return;
      }
      let setupSnapshot: SetupSnapshotV1;
      try {
        setupSnapshot = decodeSetupSnapshot((options.read_setup ?? setup?.read ?? unavailableSetupSnapshot)());
      } catch {
        setupSnapshot = unavailableSetupSnapshot('setup_check_invalid');
      }
      sendJson(response, 200, setupSnapshot, headOnly);
      return;
    }

    if (pathname === OPERATOR_BOT_ACCESS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Bot access accepts no query selectors.'), headOnly);
        return;
      }
      const cache = (options.read_bot_access ?? botAccess?.read ?? (() => ({ state: 'pending' }) as const))();
      if (cache.state === 'pending') {
        sendRefusal(request, response, 503, errorBody('bot_access_pending', 'The first Bot access collection has not finished.', 'Retry in a few seconds.'), headOnly);
        return;
      }
      if (cache.state === 'failed') {
        sendRefusal(request, response, 503, cache.reason === 'herdr_session_invalid'
          ? errorBody('herdr_session_invalid', 'The Herdr session name is invalid.', 'Restart `repo-harness operator serve` with a valid HERDR_SESSION.')
          : errorBody('bot_access_unavailable', 'Bot access is unavailable.', 'Restart `repo-harness operator serve`.'), headOnly);
        return;
      }
      let snapshot;
      try { snapshot = decodeBotAccessSnapshot(cache.snapshot); }
      catch {
        sendRefusal(request, response, 503, errorBody('bot_access_invalid', 'The Bot access snapshot failed validation.'), headOnly);
        return;
      }
      sendJson(response, 200, snapshot, headOnly);
      return;
    }

    if (pathname === OPERATOR_CLI_INVENTORY_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'CLI inventory accepts no query selectors.'), headOnly);
        return;
      }
      let inventory: CliInventorySnapshotV1;
      try {
        inventory = decodeCliInventory((options.read_cli_inventory ?? cliInventory?.read ?? unavailableCliInventory)());
      } catch {
        inventory = unavailableCliInventory('collection_failed');
      }
      sendJson(response, 200, inventory, headOnly);
      return;
    }

    if (pathname === OPERATOR_NOTIFY_STATUS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Notify status accepts no query selectors.'), headOnly);
        return;
      }
      try {
        const status = decodeNotifyStatus(await (options.read_notify_status ?? readNotifyStatus)({ env: options.env }));
        sendJson(response, 200, status, headOnly);
      } catch {
        sendRefusal(request, response, 503, errorBody('notify_status_unavailable', 'Notify status is unavailable.'), headOnly);
      }
      return;
    }

    const contextRoute = OPERATOR_TASK_CONTEXT_ROUTE.exec(pathname);
    if(contextRoute!==null){
      let input:AdmittedSessionSelector;
      try{input=parseTaskDiffRequest(contextRoute[1]!,url.searchParams);}
      catch{sendRefusal(request,response,400,errorBody('invalid_request','Context requires an explicit admitted session selector.'),headOnly);return;}
      handleBoundedTaskRead(response,headOnly,input,decodeAdmittedTaskContext,SESSION_OBSERVATION_FAILURES,'context',options.read_task_context);
      return;
    }
    const historyRoute=OPERATOR_TASK_HISTORY_ROUTE.exec(pathname);
    if(historyRoute!==null){
      let input:OperatorTaskHistoryRequest;
      try{input=parseTaskHistoryRequest(historyRoute[1]!,historyRoute[2]!,url.searchParams);}
      catch{sendRefusal(request,response,400,errorBody('invalid_request','History requires an explicit historical selector.'),headOnly);return;}
      handleBoundedTaskRead(response,headOnly,input,decodeOperatorTaskHistory,TASK_HISTORY_FAILURES,'history',options.read_task_history);
      return;
    }
    const admittedActivityRoute = OPERATOR_TASK_ACTIVITY_ROUTE.exec(pathname);
    if (admittedActivityRoute !== null) {
      let input: AdmittedTaskActivityRequest;
      try { input = parseAdmittedTaskActivityRequest(admittedActivityRoute[1]!, url.searchParams); }
      catch { sendRefusal(request,response,400,errorBody('invalid_request','Activity requires an explicit admitted session selector.'),headOnly); return; }
      handleBoundedTaskRead(response,headOnly,input,decodeAdmittedTaskActivity,[...TASK_ACTIVITY_FAILURES,...SESSION_OBSERVATION_FAILURES],
        'admitted_activity',options.read_admitted_task_activity);
      return;
    }
    const activityRoute = OPERATOR_HISTORICAL_TASK_ACTIVITY_ROUTE.exec(pathname);
    if (activityRoute !== null) {
      let input: OperatorTaskActivityRequest;
      try { input = parseTaskActivityRequest(activityRoute[1]!,activityRoute[2]!,url.searchParams); }
      catch { sendRefusal(request,response,400,errorBody('invalid_request','Invalid activity selector.'),headOnly); return; }
      handleBoundedTaskRead(response,headOnly,input,decodeOperatorTaskActivity,TASK_ACTIVITY_FAILURES,
        'activity',options.read_task_activity);
      return;
    }

    const sessionsRoute = OPERATOR_TASK_SESSIONS_ROUTE.exec(pathname);
    if (sessionsRoute !== null) {
      const input = { repository_id: sessionsRoute[1]! };
      if (url.searchParams.size || !isTaskSessionsRequest(input)) {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Session discovery accepts only a registered repository.'), headOnly);
        return;
      }
      handleBoundedTaskRead(response, headOnly, input, decodeAdmittedTaskSessions, SESSION_OBSERVATION_FAILURES,
        'sessions', options.read_task_sessions);
      return;
    }

    const diffRoute = OPERATOR_TASK_DIFF_ROUTE.exec(pathname);
    if (diffRoute !== null) {
      if (closed) {
        sendJson(response, 503, { code: 'unavailable' }, headOnly);
        return;
      }
      let input: AdmittedSessionSelector;
      try { input = parseTaskDiffRequest(diffRoute[1]!, url.searchParams); }
      catch {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'A task diff requires an explicit admitted session selector.'), headOnly);
        return;
      }
      handleBoundedTaskRead(response, headOnly, input, decodeOperatorTaskDiff, SESSION_OBSERVATION_FAILURES,
        'diff', options.read_task_diff,
        failure => failure === 'stale' ? 409 : 503);
      return;
    }

    const repositoryRoute = OPERATOR_REPOSITORY_SNAPSHOT_ROUTE.exec(pathname);
    if (repositoryRoute !== null) {
      if (url.searchParams.size > 0) {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Repository snapshots do not accept query parameters.'), headOnly);
        return;
      }
      await handleRepositorySnapshot(request, response, repositoryRoute[1]!, headOnly);
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
    const fileType = contentType(file);
    const headers = {
      ...staticHeaders(fileType),
      'Content-Length': body.byteLength.toString(),
      // The page response is the only place the write token is handed out.
      ...(fileType.startsWith('text/html') ? { 'Set-Cookie': operatorWriteTokenCookie(request.socket.localPort!, writeToken) } : {}),
    };
    response.writeHead(200, headers);
    if (headOnly) response.end();
    else response.end(body);
  };

  if (options.runtime_status_config && options.read_runtime_status) throw new OperatorServerError('invalid_argument', 'Select runtime config or cache reader.', 400);
  // Collector groups of a server that died with SIGKILL have no other owner.
  reapOrphanedProcessGroups();
  const runtimeService = options.runtime_status_config ? await startRuntimeService(options.runtime_status_config) : null;
  const devActivity = options.dev_activity_collector && !options.read_dev_activity
    ? startDevActivityCollector({
      env: options.env,
      read_runtime: options.read_runtime_status ?? runtimeService?.read ?? null,
    })
    : null;
  const setup = options.setup_collector && !options.read_setup ? startSetupCollector({ env: options.env }) : null;
  const botAccess = options.bot_access_collector && !options.read_bot_access ? startBotAccessCollector({ env: options.env }) : null;
  const cliInventory = options.cli_inventory_collector && !options.read_cli_inventory
    ? startCliInventoryCollector({ env: options.env, usage_sources: options.cli_inventory_collector.usage_sources })
    : null;
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
      runtimeService?.close();
      void devActivity?.close();
      void setup?.close();
      void botAccess?.close();
      void cliInventory?.close();
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
  let closeCompletion: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closeCompletion) return closeCompletion;
    closed = true;
    runtimeService?.close();
    fleetClosing = true;
    closeCompletion = Promise.resolve().then(async () => {
      await Promise.all([devActivity?.close(), setup?.close(), botAccess?.close(), cliInventory?.close()]);
      // Close admission and cancel every owner before waiting for any one of
      // them: a retiring Fleet read must not leave other queues launching work.
      for (const observation of [...fleetObservations.values()]) cancelFleetObservation(observation);
      for (const observation of [...repositoryObservations.values()]) cancelRepositoryObservation(observation, OPERATOR_REPOSITORY_REQUEST_ABORTED);
      for (const cancel of activeTaskReadCancellers) cancel();
      for (const cancel of activeRepositoryRequestCancellers) cancel();
      await Promise.allSettled([
        ...fleetCompletions, ...repositoryCompletions,
        ...activeTaskReadCompletions,
      ]);
      if (!server.listening) return;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error?: Error) => {
          if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') rejectClose(error);
          else resolveClose();
        });
      });
    });
    return closeCompletion;
  };

  return Object.freeze({
    host,
    port: actualPort,
    url: `http://${urlHost}:${actualPort}`,
    close,
  });
}
