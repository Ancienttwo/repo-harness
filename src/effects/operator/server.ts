import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OperatorCollaborationSnapshotV1 } from '../../core/operator/collaboration-snapshot';
import {
  projectOperatorFleetSnapshot,
  type OperatorFleetSnapshotV1,
} from '../../core/operator/fleet-snapshot';
import {
  OperatorCollaborationError,
  readOperatorCollaborationSnapshot,
  type OperatorCollaborationErrorCode,
  type ReadOperatorCollaborationSnapshotInput,
} from './collaboration';
import {
  collectFleetBoard,
  FleetBoardError,
  type FleetBoardCollectorOptions,
} from '../fleet/board';
import {
  OperatorTaskMessageError,
  sendOperatorTaskMessage,
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
 * than the body cap. The decoded `body` field is what the 413 is judged on.
 */
const OPERATOR_TASK_MESSAGE_REQUEST_MAX_BYTES = TASK_MESSAGE_BODY_MAX_BYTES * 4;
const TASK_MESSAGE_ROUTE = /^\/api\/v1\/fleet\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([0-9a-f]{64})\/messages$/u;
/**
 * The repository id is matched loosely and resolved strictly, the same split the
 * task-message route already uses: the registry is the authority on which ids
 * exist, and duplicating its shape here would be a second opinion about it.
 */
const COLLABORATION_SNAPSHOT_ROUTE = /^\/api\/v1\/collaboration\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/snapshot$/u;
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
  Object.freeze({ id: 'health', method: 'GET', pattern: '/healthz', write: false }),
  Object.freeze({ id: 'fleet_snapshot', method: 'GET', pattern: '/api/v1/fleet/snapshot', write: false }),
  Object.freeze({
    id: 'collaboration_snapshot',
    method: 'GET',
    pattern: COLLABORATION_SNAPSHOT_ROUTE.source,
    write: false,
  }),
  Object.freeze({ id: 'static_asset', method: 'GET', pattern: '/*', write: false }),
  Object.freeze({ id: 'task_message', method: 'POST', pattern: TASK_MESSAGE_ROUTE.source, write: true }),
] as const);

export type OperatorServerHost = '127.0.0.1' | '::1';

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
    input: ReadOperatorCollaborationSnapshotInput,
  ) => OperatorCollaborationSnapshotV1 | Promise<OperatorCollaborationSnapshotV1>;
  readonly send_task_message?: (
    input: SendOperatorTaskMessageInput,
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

function staticHeaders(contentType: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Content-Security-Policy': "default-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
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
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...jsonHeaders(),
    'Content-Length': Buffer.byteLength(payload).toString(),
  });
  if (headOnly) response.end();
  else response.end(payload);
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
});

function publicCollaborationError(error: unknown): {
  readonly status: number;
  readonly body: OperatorErrorResponseV1;
} {
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

function publicTaskMessageError(error: unknown): {
  readonly status: number;
  readonly body: OperatorErrorResponseV1;
} {
  if (error instanceof OperatorTaskMessageError) {
    const failure = TASK_MESSAGE_FAILURES[error.code];
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
}

/** Accept exactly the three transport fields; an unknown key is a rejected request. */
function decodeTaskMessageRequest(value: unknown): OperatorTaskMessageRequestV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 3 || keys[0] !== 'body' || keys[1] !== 'message_id' || keys[2] !== 'scope') return null;
  const { message_id: messageId, scope, body } = record;
  if (typeof messageId !== 'string' || messageId.length === 0) return null;
  if (scope !== 'task' && scope !== 'claim') return null;
  if (typeof body !== 'string') return null;
  return { message_id: messageId, scope, body };
}

type RequestBodyRead =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'too_large' | 'invalid' };

async function readBoundedRequestBody(request: IncomingMessage, maxBytes: number): Promise<RequestBodyRead> {
  const declared = request.headers['content-length'];
  if (typeof declared !== 'string') return { ok: false, reason: 'invalid' };
  const length = Number(declared);
  if (!Number.isSafeInteger(length) || length < 0) return { ok: false, reason: 'invalid' };
  if (length > maxBytes) return { ok: false, reason: 'too_large' };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.byteLength;
    if (size > maxBytes) return { ok: false, reason: 'too_large' };
    chunks.push(buffer);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf-8') };
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
  const collect = options.collect_fleet_board ?? collectFleetBoard;
  const readCollaboration = options.read_collaboration_snapshot ?? readOperatorCollaborationSnapshot;
  const send = options.send_task_message ?? sendOperatorTaskMessage;
  let inFlight: Promise<OperatorFleetSnapshotV1> | null = null;

  const snapshot = (): Promise<OperatorFleetSnapshotV1> => {
    if (inFlight !== null) return inFlight;
    const pending = collect({
      env: options.env,
      max_concurrency: maxConcurrency,
      timeout_ms: timeoutMs,
    }).then(projectOperatorFleetSnapshot);
    inFlight = pending;
    pending.then(
      () => { if (inFlight === pending) inFlight = null; },
      () => { if (inFlight === pending) inFlight = null; },
    );
    return pending;
  };

  const handleTaskMessage = async (
    request: IncomingMessage,
    response: ServerResponse,
    repositoryId: string,
    taskId: string,
  ): Promise<void> => {
    const read = await readBoundedRequestBody(request, OPERATOR_TASK_MESSAGE_REQUEST_MAX_BYTES);
    if (!read.ok) {
      if (read.reason === 'too_large') {
        sendJson(response, 413, errorBody(
          'task_message_body_too_large',
          `The message body must be at most ${OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES} bytes.`,
          'Shorten the message, then send it again.',
        ));
      } else {
        sendJson(response, 400, errorBody('invalid_request', 'The request body is invalid.', OPERATOR_REOBSERVE_ACTION));
      }
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(read.text);
    } catch (_error) {
      sendJson(response, 400, errorBody('invalid_request', 'The request body is not valid JSON.', OPERATOR_REOBSERVE_ACTION));
      return;
    }
    const payload = decodeTaskMessageRequest(parsed);
    if (payload === null) {
      sendJson(response, 400, errorBody('invalid_request', 'The request body is invalid.', OPERATOR_REOBSERVE_ACTION));
      return;
    }
    if (Buffer.byteLength(payload.body, 'utf-8') > OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES) {
      sendJson(response, 413, errorBody(
        'task_message_body_too_large',
        `The message body must be at most ${OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES} bytes.`,
        'Shorten the message, then send it again.',
      ));
      return;
    }
    try {
      const result = await send({
        env: options.env,
        repository_id: repositoryId,
        task_id: taskId,
        message_id: payload.message_id,
        scope: payload.scope,
        body: payload.body,
      });
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
      const failure = publicTaskMessageError(error);
      sendJson(response, failure.status, failure.body);
    }
  };

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? 'GET';
    const headOnly = method === 'HEAD';
    const expectedAuthority = expectedRequestAuthority(host, request);
    const requestHost = request.headers.host?.trim().toLowerCase();
    if (expectedAuthority === null || requestHost !== expectedAuthority) {
      sendJson(response, 421, errorBody('host_not_allowed', 'The request Host is not allowed.'), headOnly);
      return;
    }
    const expectedOrigin = `http://${expectedAuthority}`;
    const requestOrigin = request.headers.origin;
    if (requestOrigin === undefined) {
      // A read may come from curl; the one write may not. A browser always
      // sends Origin on POST, so a missing header is never the board itself.
      if (method === 'POST') {
        sendJson(response, 403, errorBody(
          'origin_required',
          'The request Origin is required for writes.',
          'Send the message from the operator board on this loopback origin.',
        ));
        return;
      }
    } else if (requestOrigin !== expectedOrigin) {
      sendJson(response, 403, errorBody('origin_not_allowed', 'The request Origin is not allowed.'), headOnly);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      sendJson(response, 405, errorBody('method_not_allowed', 'Only GET, HEAD, and POST are supported.'), false);
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url ?? '/', expectedOrigin);
      if (url.origin !== expectedOrigin) {
        sendJson(response, 421, errorBody('host_not_allowed', 'The request URL authority is not allowed.'), headOnly);
        return;
      }
    } catch (_error) {
      sendJson(response, 400, errorBody('invalid_request', 'The request URL is invalid.'), headOnly);
      return;
    }
    const pathname = url.pathname;

    const taskMessageRoute = TASK_MESSAGE_ROUTE.exec(pathname);
    if (method === 'POST' && taskMessageRoute === null) {
      sendJson(response, 405, errorBody('method_not_allowed', 'Only the task message route accepts POST.'), false);
      return;
    }
    if (taskMessageRoute !== null) {
      if (method !== 'POST') {
        sendJson(response, 405, errorBody('method_not_allowed', 'The task message route accepts POST only.'), false);
        return;
      }
      await handleTaskMessage(request, response, taskMessageRoute[1]!, taskMessageRoute[2]!);
      return;
    }

    if (pathname === '/healthz') {
      const health: OperatorHealthResponseV1 = {
        ok: true,
        service: OPERATOR_SERVICE_NAME,
        protocol: OPERATOR_SERVER_PROTOCOL,
      };
      sendJson(response, 200, health, headOnly);
      return;
    }

    if (pathname === '/api/v1/fleet/snapshot') {
      try {
        sendJson(response, 200, await snapshot(), headOnly);
      } catch (error) {
        const failure = publicFleetError(error);
        sendJson(response, failure.status, failure.body, headOnly);
      }
      return;
    }

    const collaborationRoute = COLLABORATION_SNAPSHOT_ROUTE.exec(pathname);
    if (collaborationRoute !== null) {
      // POST reached 405 above; this route reads and nothing else.
      try {
        const collaboration = await readCollaboration({
          env: options.env,
          repository_id: collaborationRoute[1]!,
        });
        sendJson(response, 200, collaboration, headOnly);
      } catch (error) {
        const failure = publicCollaborationError(error);
        sendJson(response, failure.status, failure.body, headOnly);
      }
      return;
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      sendJson(response, 404, errorBody('not_found', 'The requested operator API route does not exist.'), headOnly);
      return;
    }

    const requestedFile = fileIfSafe(staticRoot, pathname);
    const file = requestedFile ?? (isHtmlNavigation(request, pathname) ? fallbackIndex(staticRoot) : null);
    if (file === null) {
      if (pathname === '/' || isHtmlNavigation(request, pathname)) {
        sendJson(response, 503, errorBody('operator_assets_unavailable', 'Operator UI assets are unavailable.', OPERATOR_ASSET_ACTION), headOnly);
      } else {
        sendJson(response, 404, errorBody('not_found', 'The requested operator asset does not exist.'), headOnly);
      }
      return;
    }

    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch (_error) {
      sendJson(response, 503, errorBody('operator_assets_unavailable', 'Operator UI assets are unavailable.', OPERATOR_ASSET_ACTION), headOnly);
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
      sendJson(response, 500, errorBody('operator_server_unavailable', 'Operator server failed to handle the request.'));
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
