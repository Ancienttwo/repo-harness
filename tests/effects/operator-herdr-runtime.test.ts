import { describe, expect, test } from 'bun:test';
import { createServer, type Socket } from 'node:net';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { requestHerdrObservation, herdrAgentSessionKey, HERDR_OBSERVATION_REVISION } from '../../src/effects/terminal/herdr-observation';
import { createHerdrRuntimeTransport } from '../../src/effects/operator/herdr-runtime-transport';
import { configureRuntimeSource } from '../../src/effects/operator/runtime-source';
import { createRuntimeStatusObserver } from '../../src/effects/operator/runtime-status';
import { decodeHerdrRuntimeConfig, readRuntimeDispatchBindings, verifyRuntimeDispatchBindings } from '../../src/effects/operator/runtime-service';
import { startOperatorServer } from '../../src/effects/operator/server';
import { parseOperatorServeOptions } from '../../src/cli/commands/operator';
import type { RuntimeIdentity } from '../../src/core/operator/runtime-status';
import { preparePipelineSQLite } from '../helpers/pipeline-sqlite-fixture';
import { PipelineStore, snapshotPointerPath } from '../../src/effects/pipeline/store';
import { mutatePipeline, newPipeline } from '../../src/effects/pipeline/ledger';
import type { PipelineRecord } from '../../src/core/pipeline/types';
import { ingestEvent, observations } from '../../src/effects/pipeline/ingest';
import { taskRepository } from '../../src/effects/terminal/task-worktree';
import { taskSessionDirectory, harnessCapabilities } from '../../src/effects/terminal/task-session';
import type { LogObservation } from '../../src/core/pipeline/projection';

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
  let version = '0.9.3', protocol = 22, panes: unknown[] = [pane], wrongId = false, globals = 0;
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
    for (const [version, protocol] of [['0.9.2',22],['0.9.3',21]] as const) {
      const f = await fixture(), owner = createHerdrRuntimeTransport(f.endpoint, 'fixture', 'fixture');
      try { f.setVersion(version, protocol); await expect(owner.transport.capabilities(new AbortController().signal)).rejects.toThrow('version'); }
      finally { owner.close(); await f.close(); }
    }
  });

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
    const config = { protocol: 'repo-harness.herdr-runtime-config.v1', ...f.endpoint, source_host: 'fixture', herdr_session: 'fixture', bindings_path: null, pipeline_snapshot: null };
    const path = join(f.root, 'runtime.json'); writeFileSync(path, JSON.stringify(config));
    const server = await startOperatorServer({ port: 0, runtime_status_config: path });
    try {
      const before = f.requests.length;
      const response = await fetch(`${server.url}/api/v1/runtime/status`), body = await response.json();
      expect(body).toMatchObject({ projection_version: 'repo-harness.runtime-overlay.v2', status: 'ready', unclaimed: 1, badges: [] });
      expect(f.requests.length).toBe(before); expect(JSON.stringify(body)).not.toContain('/private/');
      expect(parseOperatorServeOptions({ runtimeStatusConfig: path }).runtime_status_config).toBe(path);
      expect(() => parseOperatorServeOptions({ runtimeStatusConfig: 'relative.json' })).toThrow();
      expect(() => decodeHerdrRuntimeConfig({ ...config, bindings_path: '/tmp/bindings.json' })).toThrow();
    } finally { await server.close(); await f.close(); }
  });
});

test('dispatch binding verification uses enrolled requests and owned artifacts; no pane/cwd inference', () => {
  const binding = { protocol: 2, runtime: 'herdr', repository_id: 'repository', task: identity.task, role: identity.role,
    endpoint: { session: 'fixture' }, pane_id: pane.pane_id, terminal_id: pane.terminal_id, ownership: { disposition: 'created', intent_id: 'intent-1' },
    provider: { pid: 42, identity: 'fixture-process', ownership: { disposition: 'created', intent_id: 'intent-1' } } };
  const bytes = Buffer.from(JSON.stringify(binding)), candidate = { ...identity, runtime_session: hash(bytes) };
  const request = { protocol: 2, task: identity.task, role: identity.role, round: 1, request_id: identity.request_id, context_sha256: identity.context_sha256, context_ref: '/fixture/context.txt', source_ref: '/fixture/source.txt', result_ref: '/fixture/result.json' };
  const artifacts: Record<string, Buffer> = {
    '/fixture/context.txt': Buffer.from('context'), '/fixture/binding.json': bytes, '/fixture/request-1.json': Buffer.from(JSON.stringify(request)),
    '/fixture/intent.json': Buffer.from(JSON.stringify({ intent_id: 'intent-1', spec: { task: identity.task, role: identity.role, endpoint: { session: 'fixture' } } })),
    '/fixture/pane-created.json': Buffer.from(JSON.stringify({ intent_id: 'intent-1', pane_id: pane.pane_id, terminal_id: pane.terminal_id })),
    '/fixture/provider-created.json': Buffer.from(JSON.stringify({ provider: binding.provider })),
  };
  const record = { source_host: identity.source_host, repository_id: 'repository', task: { value: identity.task }, state_version: 7,
    observations: [{ kind: 'enrollment', source: 'outbox' }], runs: [{ ...request, source_host: identity.source_host, attempt: 1, session_ref: '/fixture/binding.json', endpoint: { session: 'fixture' }, pane: { closed_at: null, pane_id: pane.pane_id, host: identity.source_host, herdr_session: 'fixture' } }] } as unknown as PipelineRecord;
  const before = JSON.stringify(record), read = (path: string) => artifacts[path];
  expect(verifyRuntimeDispatchBindings([candidate], [record], 3, read)).toEqual([{ ...candidate, source_epoch: 3 }]);
  for (const changes of [{ request_id: 'wrong' }, { generation: 'wrong' }, { terminal_id: 'wrong' }, { pipeline_state_version: 8 }, { runtime_session: 'wrong' }, { attempt: 2 }]) {
    expect(verifyRuntimeDispatchBindings([{ ...candidate, ...changes }], [record], 0, read)).toEqual([]);
  }
  expect(verifyRuntimeDispatchBindings([candidate], [{ ...record, observations: [] }], 0, read)).toEqual([]);
  const empty = { ...record, observations: [], runs: [] };
  const enrollment: LogObservation = { source_host: record.source_host, repository_id: record.repository_id, task: record.task.value,
    role: null, round: null, request_id: null, kind: 'enrollment', source: 'outbox', observed_at: '2026-10-08T00:00:00.000Z', terminal_key: null, payload: { runs: structuredClone(record.runs) } };
  const logsBefore = JSON.stringify(enrollment);
  expect(verifyRuntimeDispatchBindings([candidate], [empty], 3, read, [enrollment])).toEqual([{ ...candidate, source_epoch: 3 }]);
  for (const changed of [{ source: 'herdr' }, { source_host: 'wrong' }, { repository_id: 'wrong' }, { task: 'wrong' }]) {
    expect(verifyRuntimeDispatchBindings([candidate], [empty], 3, read, [{ ...enrollment, ...changed }])).toEqual([]);
  }
  const restore = { ...enrollment, kind: 'restore_epoch', payload: { epoch: 2 } };
  expect(verifyRuntimeDispatchBindings([candidate], [empty], 3, read, [enrollment, restore])).toEqual([]);
  expect(verifyRuntimeDispatchBindings([candidate], [empty], 3, read, [restore, enrollment])).toHaveLength(1);
  expect(JSON.stringify(enrollment)).toBe(logsBefore);
  delete artifacts['/fixture/provider-created.json']; expect(verifyRuntimeDispatchBindings([candidate], [record], 0, read)).toEqual([]);
  expect(JSON.stringify(record)).toBe(before);
});


test('actual snapshot reconciliation recovers enrollment → board and runtime badge; record runs stay empty', async () => {
  preparePipelineSQLite(); const f = await fixture();
  const path = join(f.root, 'pipeline.db'), env = { ...process.env, REPO_HARNESS_PIPELINES_DB: path, REPO_HARNESS_PIPELINES_AUTHORITY_HOST: hostname() };
  const store = new PipelineStore({ env }); let server: Awaited<ReturnType<typeof startOperatorServer>> | null = null;
  try {
    const root = join(f.root, 'repo'); mkdirSync(root);
    execFileSync('git', ['init', '-q', '-b', 'main', root], { env });
    const repository = taskRepository(root), source_host = hostname();
    const key = { source_host, repository_id: repository.repository_id, task: identity.task };
    newPipeline(store, { ...key, root, adopt_task: identity.task });
    mutatePipeline(store, key, { op: 'record', kind: 'observation', state_version: store.read(key).state_version, payload: { kind: 'session', source: 'registration', data: { role: identity.role } } });
    const record = store.read(key);
    const dir = taskSessionDirectory(root, identity.task, identity.role); mkdirSync(dir, { recursive: true });
    const outbox = join(root, '.ai/harness/runs/task-agent-outbox', basename(dir)); mkdirSync(outbox, { recursive: true });
    const request = { protocol: 2 as const, task: identity.task, role: identity.role, round: 1, request_id: '123e4567-e89b-42d3-a456-426614174000', context_sha256: hash('context'),
      context_ref: join(outbox, 'context-1.txt'), source_ref: join(root, 'source.txt'), result_ref: join(outbox, 'result-1.json'),
      result_contract: { required_fields: ['request_id', 'context_sha256', 'value'], atomic_write: 'temp_rename' as const, submission: { command: 'repo-harness task-agent result', repo: root, task: identity.task, role: identity.role, round: 1 } } };
    const binding = { protocol: 2, runtime: 'herdr', repository_id: repository.repository_id, execution_root: root, task: identity.task, role: identity.role, endpoint: { session: 'fixture' }, pane_id: pane.pane_id, terminal_id: pane.terminal_id,
      workspace_id: 'w1', shell: { pid: 42, identity: 'fixture-shell' }, agent_name: 'fixture', host: null, harness_kind: 'codex', capabilities: harnessCapabilities('codex'), max_requests: 20,
      ownership: { disposition: 'created', intent_id: 'intent-1' }, provider: { pid: 42, identity: 'fixture-process', ownership: { disposition: 'created', intent_id: 'intent-1' } } };
    const bindingBytes = JSON.stringify(binding);
    for (const [name, value] of Object.entries({ 'binding.json': binding, 'request-1.json': request, 'intent.json': { intent_id: 'intent-1', spec: { task: identity.task, role: identity.role, endpoint: { session: 'fixture' }, harness_kind: binding.harness_kind, max_requests: binding.max_requests } },
      'pane-created.json': { intent_id: 'intent-1', pane_id: pane.pane_id, terminal_id: pane.terminal_id }, 'provider-created.json': binding })) writeFileSync(join(dir, name), JSON.stringify(value));
    writeFileSync(request.context_ref, 'context'); writeFileSync(request.source_ref, 'source');
    const beforeIngest = JSON.stringify(record);
    expect(ingestEvent(store, { host: source_host, herdr_session: 'fixture', result: { panes: [pane] } }, { snapshot: true }).status).toBe('observed');
    expect(store.read(key).runs).toEqual([]);
    expect(JSON.stringify(store.read(key))).toBe(beforeIngest);
    expect(observations(store).find(o => o.kind === 'enrollment' && o.source === 'outbox')?.payload.runs).toHaveLength(1);
    const candidate = { ...identity, source_host, repository_id: hash(repository.repository_id), pipeline_state_version: record.state_version, request_id: request.request_id, runtime_session: hash(bindingBytes) };
    const bindingsPath = join(f.root, 'runtime-bindings.json'); writeFileSync(bindingsPath, JSON.stringify({ protocol: 'repo-harness.runtime-bindings.v2', bindings: [candidate] }));
    const configPath = join(f.root, 'runtime.json'); writeFileSync(configPath, JSON.stringify({ protocol: 'repo-harness.herdr-runtime-config.v1', ...f.endpoint, source_host, herdr_session: 'fixture', bindings_path: bindingsPath, pipeline_snapshot: snapshotPointerPath(path) }));
    const beforeRecord = JSON.stringify(store.read(key));
    server = await startOperatorServer({ port: 0, env, runtime_status_config: configPath });
    const overlay = await (await fetch(`${server.url}/api/v1/runtime/status`)).json(); expect(overlay.badges[0].state).toBe('working');
    const board = await (await fetch(`${server.url}/api/v1/pipelines`)).json(); expect(board.cards[0].state_version).toBe(candidate.pipeline_state_version);
    expect(board.cards[0].phase).toBe('plan'); expect(board.cards[0].runs[0].result_state).toBe('missing');
    const request2 = { ...request, round: 2, request_id: '123e4567-e89b-42d3-a456-426614174001', context_sha256: hash('context-2'), context_ref: join(outbox, 'context-2.txt'), result_ref: join(outbox, 'result-2.json'), result_contract: { ...request.result_contract, submission: { ...request.result_contract.submission, round: 2 } } };
    writeFileSync(join(dir, 'request-2.json'), JSON.stringify(request2)); writeFileSync(request2.context_ref, 'context-2');
    expect(ingestEvent(store, { host: source_host, herdr_session: 'fixture', result: { panes: [pane] } }, { snapshot: true }).status).toBe('observed');
    expect(store.read(key).state_version).toBe(candidate.pipeline_state_version); expect(store.read(key).runs).toEqual([]);
    const config = decodeHerdrRuntimeConfig(JSON.parse(readFileSync(configPath, 'utf8')));
    expect(readRuntimeDispatchBindings(config, 0)).toEqual([]); // Old round shares terminal/session but is no longer current.
    f.event('pane_updated');
    await until(async () => (await (await fetch(`${server!.url}/api/v1/runtime/status`)).json()).badges.length === 0);
    const currentBoard = await (await fetch(`${server.url}/api/v1/pipelines`)).json(); expect(currentBoard.cards[0].runs.map((r: any) => r.round)).toEqual([1, 2]);
    expect(currentBoard.cards[0].state_version).toBe(candidate.pipeline_state_version);
    const currentCandidate = { ...candidate, round: 2, attempt: 2, request_id: request2.request_id, context_sha256: request2.context_sha256 };
    writeFileSync(bindingsPath, JSON.stringify({ protocol: 'repo-harness.runtime-bindings.v2', bindings: [currentCandidate] }));
    expect(readRuntimeDispatchBindings(config, 0)).toEqual([currentCandidate]);
    f.event('pane_updated');
    await until(async () => (await (await fetch(`${server!.url}/api/v1/runtime/status`)).json()).badges[0]?.identity.round === 2);
    const before = readFileSync(path);
    f.setPanes([{ ...pane, agent_status: 'done', revision: 2 }]); f.event('pane.agent_status_changed');
    await until(async () => (await (await fetch(`${server!.url}/api/v1/runtime/status`)).json()).badges[0]?.state === 'done-unseen');
    const result = await (await fetch(`${server.url}/api/v1/runtime/status`)).json(); expect(result.badges[0].state).toBe('done-unseen');
    expect(result.badges[0].identity).toEqual(currentCandidate);
    expect(JSON.stringify(store.read(key))).toBe(beforeRecord); expect(readFileSync(path)).toEqual(before);
    expect(JSON.stringify(result)).not.toMatch(/private|fixture-process|context.txt/);
  } finally { await server?.close(); store.close(); await f.close(); }
});
