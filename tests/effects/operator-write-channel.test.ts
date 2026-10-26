import { afterEach, describe, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { acquireExclusiveDirectoryLock } from '../../src/effects/locking/exclusive-directory-lock';
import { startOperatorServer, type OperatorServerHandle } from '../../src/effects/operator/server';
import { operatorAuditPath } from '../../src/effects/operator/write-audit';
import { handleOperatorWrite, operatorWriteTokenCookieName, type OperatorWriteRoute } from '../../src/effects/operator/write-channel';
import { OperatorWriteRefusal } from '../../src/effects/operator/write-run';

type Mode = 'ok' | 'refuse' | 'break_result_audit' | 'hold';

interface Harness {
  readonly server: OperatorServerHandle;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly executions: string[];
  cookie: string;
  release: () => void;
  /** The audit log as it stood when `break_result_audit` replaced it. */
  auditAtBreak: string;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * A test-only write route. The production write inventory stays empty; this
 * route exists only to drive the shared channel end to end.
 */
function echoRoute(harness: () => Harness): OperatorWriteRoute {
  return {
    id: 'test_echo',
    path: /^\/api\/v1\/test-echo\/([a-z]+)$/u,
    decode(fields, params) {
      const keys = Object.keys(fields).sort();
      if (keys.join(',') !== 'mode,value' || typeof fields.value !== 'string') throw new Error('closed decoder');
      const mode = fields.mode as Mode;
      if (!['ok', 'refuse', 'break_result_audit', 'hold'].includes(mode)) throw new Error('closed decoder');
      const value = fields.value;
      return {
        operation: 'test_echo',
        target: `echo:${params[0]}`,
        input: { mode, value },
        execute: async () => {
          const current = harness();
          current.executions.push(value);
          if (mode === 'refuse') throw new OperatorWriteRefusal(409, 'revision_conflict', 'The revision changed.', 'Reload and retry.');
          if (mode === 'break_result_audit') {
            // The action has run; now the result record cannot be appended.
            const audit = operatorAuditPath(current.env);
            current.auditAtBreak = readFileSync(audit, 'utf-8');
            rmSync(audit);
            mkdirSync(audit);
          }
          if (mode === 'hold') await new Promise<void>(resolveHold => { current.release = resolveHold; });
          return { status: 200, body: { echoed: value } };
        },
      };
    },
  };
}

async function startHarness(): Promise<Harness> {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-operator-write-'));
  const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-write-ui-'));
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
  let current: Harness | null = null;
  const env = { REPO_HARNESS_HOME: home };
  const server = await startOperatorServer({ port: 0, static_root: staticRoot, env, write_routes: [echoRoute(() => current!)] });
  const page = await fetch(`${server.url}/`);
  const setCookie = page.headers.get('set-cookie') ?? '';
  current = { server, env, home, executions: [], cookie: setCookie.split(';')[0]!, release: () => {}, auditAtBreak: '' };
  cleanups.push(async () => {
    current!.release();
    await server.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(staticRoot, { recursive: true, force: true });
  });
  return current;
}

function writeHeaders(harness: Harness, overrides: Record<string, string | null> = {}): Headers {
  const headers = new Headers({
    Origin: harness.server.url,
    'Sec-Fetch-Site': 'same-origin',
    'Content-Type': 'application/json',
    Cookie: harness.cookie,
  });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  return headers;
}

function post(harness: Harness, body: unknown, overrides: Record<string, string | null> = {}, path = '/api/v1/test-echo/alpha'): Promise<Response> {
  return fetch(harness.server.url + path, {
    method: 'POST',
    headers: writeHeaders(harness, overrides),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function auditRecords(harness: Harness): Record<string, unknown>[] {
  const path = operatorAuditPath(harness.env);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

describe('operator write channel', () => {
  test('the page response hands out a per-serve HttpOnly SameSite=Strict write token', async () => {
    const first = await startHarness();
    const second = await startHarness();
    const port = new URL(first.server.url).port;
    expect(first.cookie.startsWith(`${operatorWriteTokenCookieName(Number(port))}=`)).toBe(true);
    const header = (await fetch(`${first.server.url}/`)).headers.get('set-cookie')!;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/');
    expect(first.cookie.split('=')[1]).not.toBe(second.cookie.split('=')[1]);
    expect((await fetch(`${first.server.url}/healthz`)).headers.get('set-cookie')).toBeNull();
  });

  test('refuses cross-site, missing-token and wrong-media writes before anything runs', async () => {
    const harness = await startHarness();
    const body = { request_id: randomUUID(), mode: 'ok', value: 'v' };
    const refusals: [Record<string, string | null>, number, string][] = [
      [{ Origin: null }, 403, 'origin_required'],
      [{ Origin: 'http://attacker.example' }, 403, 'origin_not_allowed'],
      [{ 'Sec-Fetch-Site': null }, 403, 'fetch_site_not_allowed'],
      [{ 'Sec-Fetch-Site': 'cross-site' }, 403, 'fetch_site_not_allowed'],
      [{ 'Sec-Fetch-Site': 'same-site' }, 403, 'fetch_site_not_allowed'],
      [{ 'Content-Type': 'text/plain' }, 415, 'unsupported_media_type'],
      [{ 'Content-Type': 'application/x-www-form-urlencoded' }, 415, 'unsupported_media_type'],
      [{ 'Content-Type': 'application/json; charset=latin1' }, 415, 'unsupported_media_type'],
      [{ Cookie: null }, 403, 'write_token_invalid'],
      [{ Cookie: `${harness.cookie.split('=')[0]}=wrong` }, 403, 'write_token_invalid'],
      [{ Cookie: `${harness.cookie}; ${harness.cookie}` }, 403, 'write_token_invalid'],
    ];
    for (const [overrides, status, code] of refusals) {
      const response = await post(harness, body, overrides);
      expect([status, (await response.json()).error.code]).toEqual([status, code]);
    }
    const oversized = await post(harness, { request_id: randomUUID(), mode: 'ok', value: 'x'.repeat(64 * 1024) });
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).error.code).toBe('body_too_large');
    expect(harness.executions).toEqual([]);
    expect(auditRecords(harness)).toEqual([]);
  });

  test('admits POST only on a write route and GET never reaches a write route', async () => {
    const harness = await startHarness();
    const readRoute = await post(harness, { request_id: randomUUID(), mode: 'ok', value: 'v' }, {}, '/api/v1/fleet/snapshot');
    expect(readRoute.status).toBe(405);
    expect(readRoute.headers.get('allow')).toBe('GET, HEAD');
    const get = await fetch(`${harness.server.url}/api/v1/test-echo/alpha`);
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    const put = await fetch(`${harness.server.url}/api/v1/test-echo/alpha`, { method: 'PUT', headers: writeHeaders(harness), body: '{}' });
    expect(put.status).toBe(405);
    expect(harness.executions).toEqual([]);
  });

  test('the closed decoder refuses unknown fields and a malformed request_id', async () => {
    const harness = await startHarness();
    for (const [body, code] of [
      [{ request_id: randomUUID(), mode: 'ok', value: 'v', extra: true }, 'invalid_body'],
      [{ request_id: randomUUID(), value: 'v' }, 'invalid_body'],
      [{ request_id: 'not-a-uuid', mode: 'ok', value: 'v' }, 'invalid_request_id'],
      [{ request_id: randomUUID().toUpperCase(), mode: 'ok', value: 'v' }, 'invalid_request_id'],
      [{ mode: 'ok', value: 'v' }, 'invalid_request_id'],
      [[], 'invalid_body'],
      ['{"request_id":', 'invalid_json'],
    ] as const) {
      const response = await post(harness, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(code);
    }
    expect(harness.executions).toEqual([]);
  });

  test('records intent before the action and the result after it, and replays a repeated request', async () => {
    const harness = await startHarness();
    const requestId = randomUUID();
    const first = await post(harness, { request_id: requestId, mode: 'ok', value: 'v1' });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ echoed: 'v1' });
    const replay = await post(harness, { value: 'v1', mode: 'ok', request_id: requestId });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ echoed: 'v1' });
    expect(harness.executions).toEqual(['v1']);

    const records = auditRecords(harness);
    expect(records.map(record => record.phase)).toEqual(['intent', 'result']);
    expect(records[0]).toMatchObject({ request_id: requestId, operation: 'test_echo', target: 'echo:alpha' });
    expect(records[1]).toMatchObject({ request_id: requestId, status: 200, body: { echoed: 'v1' } });
    const text = readFileSync(operatorAuditPath(harness.env), 'utf-8');
    expect(text).not.toContain(harness.home);
    expect(text).not.toContain(harness.cookie.split('=')[1]);
  });

  test('the same request_id with different content returns 409 request_mismatch', async () => {
    const harness = await startHarness();
    const requestId = randomUUID();
    expect((await post(harness, { request_id: requestId, mode: 'ok', value: 'v1' })).status).toBe(200);
    for (const [body, path] of [
      [{ request_id: requestId, mode: 'ok', value: 'v2' }, '/api/v1/test-echo/alpha'],
      [{ request_id: requestId, mode: 'ok', value: 'v1' }, '/api/v1/test-echo/beta'],
    ] as const) {
      const response = await post(harness, body, {}, path);
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('request_mismatch');
    }
    expect(harness.executions).toEqual(['v1']);
  });

  test('a lost result record reports reconcile_required and never replays the action', async () => {
    const harness = await startHarness();
    const requestId = randomUUID();
    const first = await post(harness, { request_id: requestId, mode: 'break_result_audit', value: 'v1' });
    expect(first.status).toBe(409);
    expect((await first.json()).error).toMatchObject({ code: 'reconcile_required' });
    expect(harness.executions).toEqual(['v1']);

    // Restore the log as it stood after the intent record, then retry.
    const audit = operatorAuditPath(harness.env);
    rmSync(audit, { recursive: true });
    writeFileSync(audit, harness.auditAtBreak);
    expect(auditRecords(harness).map(record => record.phase)).toEqual(['intent']);
    const retry = await post(harness, { request_id: requestId, mode: 'break_result_audit', value: 'v1' });
    expect(retry.status).toBe(409);
    expect((await retry.json()).error.code).toBe('reconcile_required');
    expect(harness.executions).toEqual(['v1']);
  });

  test('an unwritable intent record stops the action before it runs', async () => {
    const harness = await startHarness();
    mkdirSync(operatorAuditPath(harness.env), { recursive: true });
    const response = await post(harness, { request_id: randomUUID(), mode: 'ok', value: 'v1' });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('audit_unavailable');
    expect(harness.executions).toEqual([]);
  });

  test('a malformed audit line fails closed', async () => {
    const harness = await startHarness();
    mkdirSync(join(harness.home, 'operator'), { recursive: true });
    writeFileSync(operatorAuditPath(harness.env), '{"protocol":1}\n');
    const response = await post(harness, { request_id: randomUUID(), mode: 'ok', value: 'v1' });
    expect(response.status).toBe(503);
    expect(harness.executions).toEqual([]);
  });

  test('a typed refusal is recorded and replayed without running again', async () => {
    const harness = await startHarness();
    const requestId = randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await post(harness, { request_id: requestId, mode: 'refuse', value: 'v1' });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: { code: 'revision_conflict', message: 'The revision changed.', next_action: 'Reload and retry.' } });
    }
    expect(harness.executions).toEqual(['v1']);
    expect(auditRecords(harness).map(record => record.phase)).toEqual(['intent', 'result']);
  });

  test('a busy target refuses a second write in this process and from another lock holder', async () => {
    const harness = await startHarness();
    const held = post(harness, { request_id: randomUUID(), mode: 'hold', value: 'held' });
    for (let attempt = 0; attempt < 200 && harness.executions.length === 0; attempt += 1) await Bun.sleep(5);
    const second = await post(harness, { request_id: randomUUID(), mode: 'ok', value: 'second' });
    expect(second.status).toBe(503);
    expect((await second.json()).error.code).toBe('busy');
    const otherTarget = await post(harness, { request_id: randomUUID(), mode: 'ok', value: 'other' }, {}, '/api/v1/test-echo/beta');
    expect(otherTarget.status).toBe(200);
    harness.release();
    expect((await held).status).toBe(200);

    const root = realpathSync(join(harness.home, 'operator'));
    const lockName = `locks/target-${createHash('sha256').update('echo:gamma').digest('hex').slice(0, 32)}`;
    const external = acquireExclusiveDirectoryLock(root, lockName);
    try {
      const blocked = await post(harness, { request_id: randomUUID(), mode: 'ok', value: 'blocked' }, {}, '/api/v1/test-echo/gamma');
      expect(blocked.status).toBe(503);
      expect((await blocked.json()).error.code).toBe('busy');
    } finally {
      external.release();
    }
    expect(harness.executions).toEqual(['held', 'other']);
  });

  test('a body that misses the deadline is refused', async () => {
    const stream = new PassThrough() as unknown as IncomingMessage;
    Object.assign(stream, { headers: { 'content-type': 'application/json', cookie: 'repo_harness_operator_write_1=t' } });
    let executed = false;
    const route: OperatorWriteRoute = {
      id: 'deadline', path: /^\/x$/u,
      decode: () => ({ operation: 'deadline', target: 'deadline', input: null, execute: async () => { executed = true; return { status: 200, body: null }; } }),
    };
    (stream as unknown as PassThrough).write('{"request_id":');
    const reply = await handleOperatorWrite({ request: stream, route, params: [], token: 't', port: 1, body_deadline_ms: 20 });
    expect(reply).toMatchObject({ status: 408, refused: true, close: true });
    expect(executed).toBe(false);
  });
});
