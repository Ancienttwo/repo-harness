import { describe, expect, test } from 'bun:test';
import { createServer, type Socket } from 'node:net';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { requestHerdrObservation, herdrAgentSessionKey, herdrVersionCheck, HerdrVersionMismatchError, verifyHerdrVersion, HERDR_OBSERVATION_REVISION,
  HERDR_OBSERVATION_VERSION, HERDR_OBSERVATION_PROTOCOL } from '../../src/effects/terminal/herdr-observation';
import { createHerdrRuntimeTransport } from '../../src/effects/operator/herdr-runtime-transport';
import { configureRuntimeSource } from '../../src/effects/operator/runtime-source';
import { createRuntimeStatusObserver } from '../../src/effects/operator/runtime-status';
import { decodeRuntimeConfig } from '../../src/effects/operator/runtime-service';
import { startOperatorServer } from '../../src/effects/operator/server';
import { parseOperatorServeOptions } from '../../src/cli/commands/operator';
import type { RuntimeIdentity } from '../../src/core/operator/runtime-status';
import { taskRepository } from '../../src/effects/git/task-repository';
import { taskSessionDirectory } from '../../src/effects/terminal/task-session';

const hash = (value: string | Buffer) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const agentSession = { source: 'herdr:pi', agent: 'pi', kind: 'path', value: '/private/fixture-session.jsonl' };
const pane = { pane_id: 'w1:p1', terminal_id: 'terminal-1', workspace_id: 'w1', tab_id: 'w1:t1', focused: true,
  revision: 1, agent_status: 'working', agent_session: agentSession, cwd: '/private/fixture-repo', title: 'private title' };
const identity: RuntimeIdentity = { source_host: 'fixture', repository_id: hash('repository'), task: 'task-1', role: 'implementer', round: 1,
  pipeline_state_version: 7, request_id: 'request-1', context_sha256: hash('context'), runtime_session: 'runtime-1', attempt: 1,
  generation: 'intent-1', source_epoch: 0, herdr_session: 'fixture', terminal_id: pane.terminal_id, pane_id: pane.pane_id, agent_session: herdrAgentSessionKey(agentSession)! };

async function fixture() {
  const root = mkdtempSync('/tmp/rh-socket-'), path = join(root, 'herdr.sock');
  const sockets = new Set<Socket>(), subscriptions: { socket: Socket; id: string; types: Record<string, any>[] }[] = [];
  const requests: Record<string, any>[] = [];
  let version = '0.9.5', protocol = 22, panes: unknown[] = [pane], wrongId = false, globals = 0;
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    let input = '';
    socket.on('data', chunk => {
      input += chunk.toString(); const end = input.indexOf('\n'); if (end < 0) return;
      const request = JSON.parse(input.slice(0, end)); input = input.slice(end + 1); requests.push(request);
      const id = wrongId ? 'wrong-id' : request.id;
      if (request.method === 'ping') socket.write(JSON.stringify({ id, result: { type: 'pong', version, protocol, capabilities: { endpoint_protocol_generation: 1 } } }) + '\n');
      else if (request.method === 'session.snapshot') socket.write(JSON.stringify({ id, result: { type: 'session_snapshot', snapshot: { version, protocol, workspaces: [], tabs: [], panes, layouts: [], agents: [] } } }) + '\n');
      else if (request.method === 'events.subscribe') {
        const types = request.params.subscriptions;
        if (types.some((s: any) => s.type === 'pane.agent_status_changed' && (!s.pane_id || !panes.some((p: any) => p.pane_id === s.pane_id)))) {
          socket.write(JSON.stringify({ id, error: { code: 'pane_not_found', message: 'fixture' } }) + '\n'); return;
        }
        subscriptions.push({ socket, id, types });
        if (types.some((s: any) => s.type === 'pane.created')) globals++;
        socket.write(JSON.stringify({ id, result: { type: 'subscription_started' } }) + '\n');
      } else socket.write(JSON.stringify({ id, error: { code: 'unknown_method', message: 'fixture' } }) + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(path, resolve));
  return { root, endpoint: { socket_path: path, deadline_ms: 1000 }, requests, subscriptions,
    setVersion: (v: string, p = 22) => { version = v; protocol = p; }, setPanes: (p: unknown[]) => { panes = p; }, wrongId: () => { wrongId = true; }, globals: () => globals,
    event: (event: string) => { for (const s of subscriptions) if (!s.socket.destroyed) s.socket.write(JSON.stringify({ event, data: { private: '/private/path' } }) + '\n'); },
    disconnect: () => { subscriptions.find(s => !s.socket.destroyed && s.types.some(t => t.type === 'pane.created'))!.socket.destroy(); },
    lose: () => { const s = subscriptions.find(s => !s.socket.destroyed && s.types.some(t => t.type === 'pane.created'))!; s.socket.write(JSON.stringify({ id: s.id, error: { code: 'events_lost', message: 'private fixture error' } }) + '\n'); },
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); } };
}
async function until(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 400; i++) { if (await check()) return; await Bun.sleep(5); }
  throw new Error('fixture signal deadline');
}
async function observerFor(f: Awaited<ReturnType<typeof fixture>>, bindings: RuntimeIdentity[] = [identity]) {
  const owner = createHerdrRuntimeTransport(f.endpoint, 'fixture', 'fixture');
  const source = await configureRuntimeSource({ ...f.endpoint, source_host: 'fixture', herdr_session: 'fixture', source_revision: HERDR_OBSERVATION_REVISION,
    transport: owner.transport, bindings: async epoch => bindings.map(b => ({ ...b, source_epoch: epoch })) });
  const observer = createRuntimeStatusObserver(source); await observer.start();
  return { observer, close: () => { observer.stop(); owner.close(); } };
}

describe('official Herdr socket observation', () => {
  test('uses official request/response frames, exact status subscriptions and private-safe projection', async () => {
    const f = await fixture(); let owner: Awaited<ReturnType<typeof observerFor>> | null = null;
    try {
      owner = await observerFor(f);
      expect(owner.observer.read().badges[0].state).toBe('working');
      expect(f.requests[0]).toMatchObject({ method: 'ping', params: {} });
      const global = f.requests.findIndex(r => r.method === 'events.subscribe');
      const snapshot = f.requests.findIndex(r => r.method === 'session.snapshot'); expect(global).toBeLessThan(snapshot);
      const status = f.requests.find(r => r.method === 'events.subscribe' && r.params.subscriptions.some((s: any) => s.type === 'pane.agent_status_changed'))!;
      expect(status.params.subscriptions).toEqual([{ type: 'pane.agent_status_changed', pane_id: pane.pane_id }]);
      expect(f.requests.filter(r => r.method === 'session.snapshot').length).toBeGreaterThan(1);
      expect(JSON.stringify(owner.observer.read())).not.toMatch(/private|fixture-session|cwd|title/);
      f.setPanes([{ ...pane, agent_status: 'blocked', revision: 2 }]); f.event('pane.agent_status_changed');
      await until(() => owner!.observer.read().badges[0]?.state === 'blocked');
      expect(owner.observer.read().badges[0].reason).toBe('unknown');
    } finally { owner?.close(); await f.close(); }
  });

  test('wrong response ID, unverified server version and malformed session references fail closed', async () => {
    const f = await fixture();
    try {
      f.wrongId(); await expect(requestHerdrObservation(f.endpoint, 'ping')).rejects.toThrow('response_id');
      expect(() => herdrAgentSessionKey({ ...agentSession, raw_terminal: 'secret' })).toThrow();
    } finally { await f.close(); }
    for (const [version, protocol] of [['0.9.2',22],['0.9.5',21]] as const) {
      const f = await fixture(), owner = createHerdrRuntimeTransport(f.endpoint, 'fixture', 'fixture');
      try { f.setVersion(version, protocol); await expect(owner.transport.capabilities(new AbortController().signal)).rejects.toThrow('version'); }
      finally { owner.close(); await f.close(); }
    }
  });

  test('a version mismatch names the expected pin and the observed server version', async () => {
    const expected = { version: HERDR_OBSERVATION_VERSION, protocol: HERDR_OBSERVATION_PROTOCOL, revision: HERDR_OBSERVATION_REVISION };
    expect(expected).toEqual({ version: '0.9.5', protocol: 22, revision: '2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01' });
    expect(herdrVersionCheck({ version: '0.9.5', protocol: 22 })).toEqual({ state: 'aligned', expected, actual: { version: '0.9.5', protocol: 22 } });
    expect(herdrVersionCheck({ version: '0.9.3', protocol: 23 })).toEqual({ state: 'mismatch', expected, actual: { version: '0.9.3', protocol: 23 } });
    // An unreadable value is reported as unknown, never echoed.
    expect(herdrVersionCheck({ version: '/Users/me/herdr 0.9.3', protocol: '23' }).actual).toEqual({ version: null, protocol: null });
    let error: unknown;
    try { verifyHerdrVersion({ version: '0.9.3', protocol: 23 }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(HerdrVersionMismatchError);
    expect((error as HerdrVersionMismatchError).check).toEqual({ state: 'mismatch', expected, actual: { version: '0.9.3', protocol: 23 } });
    expect((error as Error).message).toBe('herdr_observation_version: expected 0.9.5 protocol 22 (revision 2ecf19a9); actual 0.9.3 protocol 23');

    const f = await fixture(), owner = createHerdrRuntimeTransport(f.endpoint, 'fixture', 'fixture');
    try {
      f.setVersion('0.9.3', 23);
      const failure = await owner.transport.capabilities(new AbortController().signal).then(() => null, (caught: unknown) => caught);
      expect(failure).toBeInstanceOf(HerdrVersionMismatchError);
      expect((failure as HerdrVersionMismatchError).check.actual).toEqual({ version: '0.9.3', protocol: 23 });
    } finally { owner.close(); await f.close(); }
  });

  test('a reconnect version mismatch reaches the overlay and aligned recovery clears it', async () => {
    const f = await fixture(), owner = createHerdrRuntimeTransport(f.endpoint, 'fixture', 'fixture');
    let mismatch!: () => void, reconnected!: () => void;
    const mismatchObserved = new Promise<void>(resolve => { mismatch = resolve; });
    const reconnectObserved = new Promise<void>(resolve => { reconnected = resolve; });
    const subscribe = owner.transport.subscribe;
    owner.transport.subscribe = (events, invalidate, signal) => subscribe(events, (event, error) => {
      invalidate(event, error);
      if (error instanceof HerdrVersionMismatchError) mismatch();
      if (event === 'reconnect') reconnected();
    }, signal);
    const source = await configureRuntimeSource({ ...f.endpoint, source_host: 'fixture', herdr_session: 'fixture', source_revision: HERDR_OBSERVATION_REVISION,
      transport: owner.transport, bindings: async epoch => [{ ...identity, source_epoch: epoch }] });
    const observer = createRuntimeStatusObserver(source);
    try {
      await observer.start();
      const initialEpoch = observer.read().source_epoch, globals = f.globals();
      expect(observer.read()).toMatchObject({ status: 'ready', reason: null });
      f.setVersion('0.9.3', 23); f.disconnect();
      await mismatchObserved;
      expect(observer.read()).toMatchObject({ status: 'unavailable', reason: { code: 'herdr_version_mismatch',
        expected: { version: HERDR_OBSERVATION_VERSION, protocol: HERDR_OBSERVATION_PROTOCOL, revision: HERDR_OBSERVATION_REVISION },
        actual: { version: '0.9.3', protocol: 23 } } });
      expect(JSON.stringify(observer.read())).not.toMatch(/private|message|stack/);
      expect(f.globals()).toBe(globals);
      f.setVersion(HERDR_OBSERVATION_VERSION, HERDR_OBSERVATION_PROTOCOL);
      await reconnectObserved; await observer.refresh();
      expect(observer.read()).toMatchObject({ status: 'ready', reason: null });
      expect(observer.read().source_epoch).toBeGreaterThan(initialEpoch);
      expect(observer.read().badges[0].state).toBe('working');
      expect(f.globals()).toBeGreaterThan(globals);
    } finally { observer.stop(); owner.close(); await f.close(); }
  }, 10_000);

  test('lost events resubscribe before resnapshot and advance source epoch; reused panes stay unclaimed', async () => {
    const f = await fixture(), owner = await observerFor(f);
    try {
      const before = owner.observer.read().source_epoch, globals = f.globals(); f.lose();
      await until(() => owner.observer.read().status === 'unavailable');
      await until(() => f.globals() > globals && owner.observer.read().status === 'ready');
      expect(owner.observer.read().source_epoch).toBeGreaterThan(before);
      f.setPanes([{ ...pane, terminal_id: 'reused-terminal', revision: 3 }]); f.event('pane_moved');
      await until(() => owner.observer.read().badges.length === 0 && owner.observer.read().unclaimed === 1);
    } finally { owner.close(); await f.close(); }
  });

  test('explicit service config connects before GET; absent dispatch identity remains unclaimed', async () => {
    const f = await fixture();
    const config = { protocol: 'repo-harness.runtime-config.v2', kind: 'herdr', ...f.endpoint, source_host: 'fixture', herdr_session: 'fixture' };
    const path = join(f.root, 'runtime.json'); writeFileSync(path, JSON.stringify(config));
    const server = await startOperatorServer({ port: 0, runtime_status_config: path });
    try {
      const before = f.requests.length;
      const response = await fetch(`${server.url}/api/v1/runtime/status`), body = await response.json();
      expect(body).toMatchObject({ projection_version: 'repo-harness.runtime-overlay.v6', status: 'ready', unclaimed: 1, badges: [] });
      expect(f.requests.length).toBe(before); expect(JSON.stringify(body)).not.toContain('/private/');
      expect(parseOperatorServeOptions({ runtimeStatusConfig: path }).runtime_status_config).toBe(path);
      expect(() => parseOperatorServeOptions({ runtimeStatusConfig: 'relative.json' })).toThrow();
      expect(() => decodeRuntimeConfig({ ...config, bindings_path: '/tmp/bindings.json' })).toThrow();
    } finally { await server.close(); await f.close(); }
  });
});
