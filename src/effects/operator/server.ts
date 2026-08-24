import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  projectOperatorFleetSnapshot,
  type OperatorFleetSnapshotV1,
} from '../../core/operator/fleet-snapshot';
import {
  collectFleetBoard,
  FleetBoardError,
  type FleetBoardCollectorOptions,
} from '../fleet/board';
import type { FleetBoardSnapshotV1 } from '../../core/fleet/board';

export const OPERATOR_SERVER_PROTOCOL = 1 as const;
export const OPERATOR_SERVICE_NAME = 'repo-harness-operator' as const;
export const OPERATOR_DEFAULT_HOST = '127.0.0.1' as const;
export const OPERATOR_DEFAULT_PORT = 4318 as const;
export const OPERATOR_DEFAULT_MAX_CONCURRENCY = 4 as const;
export const OPERATOR_DEFAULT_TIMEOUT_MS = 30_000 as const;

const OPERATOR_DIAGNOSTIC_ACTION = 'Run `repo-harness fleet board --json` for diagnostics and retry.';
const OPERATOR_ASSET_ACTION = 'Build the operator UI with `bun run build:operator-web` and retry.';
const DEFAULT_STATIC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../dist/operator-ui',
);

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
    if (requestOrigin !== undefined && requestOrigin !== expectedOrigin) {
      sendJson(response, 403, errorBody('origin_not_allowed', 'The request Origin is not allowed.'), headOnly);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(response, 405, errorBody('method_not_allowed', 'Only GET and HEAD are supported.'), false);
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
