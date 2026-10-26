import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { JsonValue } from '../../core/evidence/types';
import {
  operatorWriteError,
  parseOperatorRequestId,
  runOperatorWrite,
  type OperatorWriteOperation,
  type OperatorWriteResponse,
} from './write-run';

/**
 * HTTP transport for console writes. The server has already checked Host,
 * Origin and Sec-Fetch-Site and matched a write route; this module checks the
 * media type, the body bound, the write token and the closed envelope, then
 * hands the decoded operation to the run that the CLI shares.
 */

export const OPERATOR_WRITE_BODY_MAX_BYTES = 64 * 1024;
export const OPERATOR_WRITE_BODY_DEADLINE_MS = 5_000;

export interface OperatorWriteRoute {
  readonly id: string;
  /** Matched against the whole pathname; capture groups become `params`. */
  readonly path: RegExp;
  /**
   * The closed decoder for the body without `request_id`. It must reject
   * unknown fields and throw on any invalid value.
   */
  readonly decode: (fields: Readonly<Record<string, unknown>>, params: readonly string[]) => OperatorWriteOperation;
}

export interface OperatorWriteReply extends OperatorWriteResponse {
  /** True when the channel refused the request before the run started. */
  readonly refused: boolean;
  /** The body was not read to its end, so the connection must not be reused. */
  readonly close: boolean;
}

/** Fresh for every serve process; a restarted server invalidates old pages. */
export function createOperatorWriteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Cookies are not port-scoped, so two servers on one host need two names. */
export function operatorWriteTokenCookieName(port: number): string {
  return `repo_harness_operator_write_${port}`;
}

export function operatorWriteTokenCookie(port: number, token: string): string {
  return `${operatorWriteTokenCookieName(port)}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

function refuse(status: number, code: string, message: string, nextAction: string, close = false): OperatorWriteReply {
  return { status, body: operatorWriteError(code, message, nextAction) as unknown as JsonValue, refused: true, close };
}

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  const [mediaType, ...parameters] = value.split(';').map(part => part.trim().toLowerCase());
  if (mediaType !== 'application/json') return false;
  return parameters.every(parameter => parameter === 'charset=utf-8');
}

/** Exactly one cookie with the expected name; a duplicate is ambiguous and refused. */
function presentedToken(request: IncomingMessage, cookieName: string): string | null {
  const header = request.headers.cookie;
  if (header === undefined) return null;
  const values = header.split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(`${cookieName}=`))
    .map(part => part.slice(cookieName.length + 1));
  return values.length === 1 ? values[0]! : null;
}

function tokenMatches(presented: string, expected: string): boolean {
  // Equal-length digests keep the comparison constant-time for any input length.
  const left = createHash('sha256').update(presented).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

type BodyRead = { readonly ok: true; readonly bytes: Buffer } | { readonly ok: false; readonly reply: OperatorWriteReply };

function readBody(request: IncomingMessage, deadlineMs: number): Promise<BodyRead> {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > OPERATOR_WRITE_BODY_MAX_BYTES)) {
    return Promise.resolve({ ok: false, reply: tooLarge() });
  }
  return new Promise((resolveRead) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (result: BodyRead) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      if (!result.ok) request.pause();
      resolveRead(result);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > OPERATOR_WRITE_BODY_MAX_BYTES) settle({ ok: false, reply: tooLarge() });
      else chunks.push(chunk);
    };
    const onEnd = () => settle({ ok: true, bytes: Buffer.concat(chunks) });
    const onError = () => settle({ ok: false, reply: refuse(400, 'invalid_request', 'The request body could not be read.', 'Retry the request.', true) });
    const timer = setTimeout(() => settle({
      ok: false,
      reply: refuse(408, 'body_timeout', 'The request body did not arrive before the deadline.', 'Retry the request with the same request_id.', true),
    }), deadlineMs);
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
  });
}

function tooLarge(): OperatorWriteReply {
  return refuse(413, 'body_too_large', `The request body is larger than ${OPERATOR_WRITE_BODY_MAX_BYTES} bytes.`, 'Send a smaller request.', true);
}

export interface OperatorWriteAdmission {
  readonly request: IncomingMessage;
  readonly route: OperatorWriteRoute;
  readonly params: readonly string[];
  readonly token: string;
  readonly port: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly body_deadline_ms?: number;
}

/** Steps 5 to 8 of the write order; any failure stops the request there. */
export async function handleOperatorWrite(input: OperatorWriteAdmission): Promise<OperatorWriteReply> {
  const { request } = input;
  if (!isJsonContentType(request.headers['content-type'])) {
    return refuse(415, 'unsupported_media_type', 'A write request must use Content-Type application/json.', 'Send the body as application/json.', true);
  }
  const body = await readBody(request, input.body_deadline_ms ?? OPERATOR_WRITE_BODY_DEADLINE_MS);
  if (!body.ok) return body.reply;

  const presented = presentedToken(request, operatorWriteTokenCookieName(input.port));
  if (presented === null || !tokenMatches(presented, input.token)) {
    return refuse(403, 'write_token_invalid', 'The write token is missing or not valid.', 'Reload the operator page, then retry.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.bytes.toString('utf-8'));
  } catch {
    return refuse(400, 'invalid_json', 'The request body is not valid JSON.', 'Send a JSON object.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return refuse(400, 'invalid_body', 'The request body must be a JSON object.', 'Send a JSON object.');
  }
  const { request_id: rawRequestId, ...fields } = parsed as Record<string, unknown>;
  const requestId = parseOperatorRequestId(rawRequestId);
  if (requestId === null) {
    return refuse(400, 'invalid_request_id', 'request_id must be a lower-case UUID.', 'Send a new lower-case UUID as request_id.');
  }
  let operation: OperatorWriteOperation;
  try {
    operation = input.route.decode(fields, input.params);
  } catch {
    return refuse(400, 'invalid_body', 'The request body does not match the route schema.', 'Remove unknown fields and correct the values, then retry.');
  }
  const outcome = await runOperatorWrite(requestId, operation, input.env);
  return { ...outcome, refused: false, close: false };
}
