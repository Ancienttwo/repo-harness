import { describe, expect, test, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Socket } from 'node:net';
import { decodeRuntimeOverlay, projectRuntimeOverlay, nativeRuntimeFreshness, RUNTIME_LIMIT, unavailableRuntimeOverlay, type RuntimeIdentity, type RuntimeObservation } from '../../src/core/operator/runtime-status';
import { createRuntimeStatusObserver, createNativeRuntimeStatusObserver, observeHerdrPane, type RuntimeInvalidation, type RuntimeSnapshot } from '../../src/effects/operator/runtime-status';
import { decodeRuntimeConfig, startRuntimeService, type NativeRuntimeConfig, type HerdrRuntimeConfig } from '../../src/effects/operator/runtime-service';
import { readNativeRuntimeSnapshot, type NativeRuntimeSourceConfig } from '../../src/effects/operator/native-runtime-source';
import { RUNTIME_CAPTURE_MAX_BYTES, type RuntimeCaptureSnapshot } from '../../src/core/operator/runtime-capture';
import { configureRuntimeSource, RUNTIME_SOURCE_EVENTS, RUNTIME_SOURCE_PROTOCOL, type ConfiguredRuntimeSource } from '../../src/effects/operator/runtime-source';
import { HerdrVersionMismatchError, herdrVersionCheck } from '../../src/effects/terminal/herdr-observation';
import { startOperatorServer } from '../../src/effects/operator/server';

const at = '2026-10-08T00:00:00.000Z';
const identity: RuntimeIdentity = {
  source_host: 'fixture-host', repository_id: `sha256:${'a'.repeat(64)}`, task: 'task-1', role: 'implementer', round: 1, pipeline_state_version: 7,
  request_id: 'request-1', context_sha256: `sha256:${'b'.repeat(64)}`, runtime_session: 'runtime-1', attempt: 1,
  generation: 'generation-1', source_epoch: 0, herdr_session: 'fixture', terminal_id: 'terminal-1', pane_id: 'pane-1', agent_session: 'agent-1',
};
const pane = { pane_id: 'pane-1', terminal_id: 'terminal-1', agent_session: 'agent-1', revision: 1, agent_status: 'working' };
const observation = (changes: Partial<RuntimeObservation> = {}): RuntimeObservation => ({ identity, revision: 1, state: 'working', reason: 'unknown', changed_at: null, source: 'herdr-agent', ...changes });
const snapshot = (o = observation()): RuntimeSnapshot => ({ bindings: [o.identity], observations: [o] });
const project = (observations: RuntimeObservation[], bindings: RuntimeIdentity[] = [identity]) => projectRuntimeOverlay(bindings, observations, at, 0, Date.parse(at));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

const versionCheck = () => herdrVersionCheck({ version: '999.0.0', protocol: 999 });
const versionReason = () => {
  const { expected, actual } = versionCheck();
  return { code: 'herdr_version_mismatch' as const, expected, actual };
};

describe('structured runtime overlay', () => {
  test('requires the v6 reason field and accepts only bounded unavailable version facts', () => {
    const reason = versionReason(), overlay = unavailableRuntimeOverlay(0, reason);
    expect(decodeRuntimeOverlay(overlay)).toEqual(overlay);
    expect(decodeRuntimeOverlay({ ...overlay, reason: { ...reason, actual: { version: null, protocol: null } } }).reason?.actual).toEqual({ version: null, protocol: null });
    const { reason: omitted, ...missing } = overlay;
    expect(omitted).toEqual(reason);
    for (const invalid of [
      missing,
      { ...overlay, projection_version: 'repo-harness.runtime-overlay.v5' },
      { ...overlay, status: 'ready', observed_at: at },
      { ...overlay, reason: { ...reason, message: '/private/secret' } },
      { ...overlay, reason: { ...reason, actual: { ...reason.actual, version: '/private/secret' } } },
      { ...overlay, reason: { ...reason, actual: { ...reason.actual, protocol: -1 } } },
      { ...overlay, reason: { ...reason, expected: { ...reason.expected, revision: '/private/secret' } } },
    ]) expect(() => decodeRuntimeOverlay(invalid)).toThrow();
    expect(project([observation()]).reason).toBeNull();
  });
  test('Herdr maps only documented structured states and strips raw fields', () => {
    for (const [input, state] of [['idle','idle'],['working','working'],['blocked','blocked'],['done','done-unseen'],['unknown','unknown'],['aborted','unknown']] as const) {
      const result = observeHerdrPane({ ...pane, agent_status: input, title: 'private-secret', cwd: '/private/path', text: 'auth-secret' }, identity)!;
      expect(result.state).toBe(state);
      expect(result.reason).toBe('unknown');
      expect(result.changed_at).toBeNull();
      expect(JSON.stringify(result)).not.toMatch(/private-secret|auth-secret|\"title\"|\"cwd\"|\"text\"/);
    }
    for (const key of ['pane_id','terminal_id','agent_session']) expect(observeHerdrPane({ ...pane, [key]: 'reused' }, identity)).toBeNull();
    expect(() => observeHerdrPane({ ...pane, revision: -1 }, identity)).toThrow();
  });

  test('deduplicates, rejects conflicts and fences out-of-order revisions', () => {
    expect(project([observation(), observation()]).badges).toHaveLength(1);
    expect(project([observation(), observation({ state: 'idle' })]).badges).toEqual([]);
    expect(project([observation({ revision: 3 }), observation({ revision: 2, state: 'idle' })]).badges[0].state).toBe('working');
    expect(project([observation()], [identity, identity]).badges).toEqual([]);
    expect(project([observation()], [identity, { ...identity, request_id: 'request-2' }]).badges).toEqual([]);
  });

  test('same-revision identity key permutations are semantic duplicates, not conflicts', () => {
    const reordered = Object.fromEntries(Object.entries(identity).reverse()) as unknown as RuntimeIdentity;
    const result = project([observation(), observation({ identity: reordered })]);
    expect(result.badges).toHaveLength(1); expect(result.unclaimed).toBe(0);
    expect(project([observation(), observation({ identity: reordered, state: 'idle' })]).badges).toEqual([]);
  });

  test('every dispatch and runtime identity field is required; reuse and moves are unclaimed', () => {
    for (const key of Object.keys(identity) as (keyof RuntimeIdentity)[]) {
      const changed = { ...identity, [key]: typeof identity[key] === 'number' ? (identity[key] as number) + 1 : key.endsWith('sha256') || key === 'repository_id' ? `sha256:${'c'.repeat(64)}` : 'other' };
      const result = project([observation({ identity: changed })]);
      expect(result.badges).toEqual([]); expect(result.unclaimed).toBe(1);
    }
  });

  test('bounds payloads and rejects unknown fields, raw paths and invented Herdr completion', () => {
    const overlay = project([observation()]);
    expect(() => decodeRuntimeOverlay({ ...overlay, raw_terminal: 'secret' })).toThrow();
    expect(() => project([observation({ identity: { ...identity, task: '/private/path' } })])).toThrow();
    expect(() => project([observation({ state: 'settled' as RuntimeObservation['state'] })])).toThrow();
    expect(() => project(Array.from({ length: RUNTIME_LIMIT + 1 }, () => observation()))).toThrow();
    expect(() => decodeRuntimeOverlay({ ...overlay, badges: [overlay.badges[0], overlay.badges[0]] })).toThrow();
  });
});

describe('snapshot lifecycle', () => {
  test('preserves startup and snapshot version failures, clears generic failures and recovers', async () => {
    let failure: Error | null = new HerdrVersionMismatchError(versionCheck());
    const observer = createRuntimeStatusObserver({ async subscribe() {
      if (failure) throw failure;
      return () => {};
    }, async snapshot(epoch) {
      if (failure) throw failure;
      return snapshot(observation({ identity: { ...identity, source_epoch: epoch } }));
    } }, () => Date.parse(at));
    try {
      await observer.start();
      expect(observer.read()).toEqual(unavailableRuntimeOverlay(0, versionReason()));
      failure = null; await observer.start();
      expect(observer.read()).toMatchObject({ status: 'ready', reason: null });
      failure = new HerdrVersionMismatchError(versionCheck()); await observer.refresh();
      expect(observer.read()).toMatchObject({ status: 'unavailable', reason: versionReason() });
      const returned = observer.read();
      returned.reason!.actual.version = 'caller-mutated';
      expect(observer.read().reason).toEqual(versionReason());
      failure = new Error('/private/secret version mismatch'); await observer.refresh();
      expect(observer.read()).toMatchObject({ status: 'unavailable', reason: null });
      expect(JSON.stringify(observer.read())).not.toContain('/private/secret');
      failure = null; await observer.refresh();
      expect(observer.read()).toMatchObject({ status: 'ready', reason: null });
    } finally { observer.stop(); }
  });

  test('preserves a version failure before the first snapshot and clears it on disconnect', async () => {
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, async snapshot() {
      throw new HerdrVersionMismatchError(versionCheck());
    } });
    try {
      await observer.start();
      expect(observer.read()).toEqual(unavailableRuntimeOverlay(0, versionReason()));
      observer.invalidate('disconnected');
      expect(observer.read()).toEqual(unavailableRuntimeOverlay());
    } finally { observer.stop(); }
  });

  test('subscribes before snapshot; events during read force a serialized second read', async () => {
    const first = deferred<RuntimeSnapshot>(), second = deferred<RuntimeSnapshot>();
    let event!: (e: RuntimeInvalidation) => void, calls = 0, subscribed = false;
    const observer = createRuntimeStatusObserver({ async subscribe(cb) { event = cb; subscribed = true; return () => {}; },
      snapshot() { expect(subscribed).toBe(true); calls++; return calls === 1 ? first.promise : second.promise; } }, () => Date.parse(at));
    const started = observer.start(); await Promise.resolve();
    const parallel = observer.refresh(); event('updated'); first.resolve(snapshot(observation({ state: 'idle' })));
    await Promise.resolve(); await Promise.resolve();
    second.resolve(snapshot()); await started; await parallel;
    expect(calls).toBe(2); expect(observer.read().badges[0].state).toBe('working'); observer.stop();
  });

  test('successful snapshots update observation time only; failed refresh keeps original age; silence is stale, not failure', async () => {
    let clock = Date.parse(at), fail = false;
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, async snapshot() { if (fail) throw new Error('fixture'); return snapshot(); } }, () => clock);
    await observer.start(); clock += 600_000;
    expect(observer.read().badges[0]).toMatchObject({ state: 'working', freshness: 'stale', changed_at: null });
    fail = true; await observer.refresh(); expect(observer.read().observed_at).toBe(at); expect(observer.read().status).toBe('unavailable');
    fail = false; await observer.refresh(); expect(observer.read().observed_at).toBe(new Date(clock).toISOString());
    expect(observer.read().badges[0].changed_at).toBeNull(); observer.stop();
  });

  test('reconnect and lost events discard old epoch; disconnect shows original observation age', async () => {
    let event!: (e: RuntimeInvalidation) => void;
    const observer = createRuntimeStatusObserver({ async subscribe(cb) { event = cb; return () => {}; }, async snapshot(epoch) { return snapshot(observation({ identity: { ...identity, source_epoch: epoch } })); } }, () => Date.parse(at));
    await observer.start(); event('disconnected');
    expect(observer.read()).toMatchObject({ observed_at: at, status: 'unavailable' }); expect(observer.read().badges[0].freshness).toBe('disconnected');
    event('reconnect'); await observer.refresh(); expect(observer.read().source_epoch).toBe(1);
    event('events_lost'); await observer.refresh(); expect(observer.read().source_epoch).toBe(2); observer.stop();
  });

  test('conflicting revision stays unclaimed until a higher revision', async () => {
    let observations = [observation(), observation({ state: 'idle' })];
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, async snapshot() { return { bindings: [identity], observations }; } }, () => Date.parse(at));
    await observer.start(); expect(observer.read().badges).toEqual([]);
    observations = [observation()]; await observer.refresh(); expect(observer.read().badges).toEqual([]);
    observations = [observation({ revision: 2 })]; await observer.refresh(); expect(observer.read().badges[0].state).toBe('working'); observer.stop();
  });

  test('identity key permutations across snapshots do not create a persistent conflict', async () => {
    let current = observation();
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, async snapshot() { return snapshot(current); } }, () => Date.parse(at));
    await observer.start(); current = observation({ identity: Object.fromEntries(Object.entries(identity).reverse()) as unknown as RuntimeIdentity });
    await observer.refresh(); expect(observer.read().badges).toHaveLength(1); expect(observer.read().unclaimed).toBe(0);
    current = { ...current, state: 'idle' }; await observer.refresh(); expect(observer.read().badges).toEqual([]);
    current = { ...current, revision: 2 }; await observer.refresh(); expect(observer.read().badges[0].state).toBe('idle'); observer.stop();
  });

  test('late pre-reconnect responses cannot replace the new epoch snapshot', async () => {
    const old = deferred<RuntimeSnapshot>(); let calls = 0;
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, snapshot(epoch) {
      calls++; return calls === 1 ? old.promise : Promise.resolve(snapshot(observation({ identity: { ...identity, source_epoch: epoch } })));
    } }, () => Date.parse(at));
    const start = observer.start(); await Promise.resolve(); observer.invalidate('reconnect');
    old.resolve(snapshot(observation({ state: 'idle' }))); await start;
    expect(observer.read()).toMatchObject({ source_epoch: 1, status: 'ready' }); expect(observer.read().badges[0].state).toBe('working'); observer.stop();
  });

  test('event storms and subscription failures fail closed without publishing unstable observations', async () => {
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, async snapshot() {
      observer.invalidate('updated'); return snapshot();
    } }, () => Date.parse(at));
    await observer.start(); expect(observer.read().status).toBe('unavailable'); observer.stop();
    const failed = createRuntimeStatusObserver({ async subscribe() { throw new Error('fixture'); }, async snapshot() { throw new Error('must not read'); } });
    await failed.start(); expect(failed.read()).toEqual(unavailableRuntimeOverlay());
  });

  test('stop while subscribe is pending closes the late subscription and ignores its callbacks', async () => {
    const subscription = deferred<() => void>(); let invalidate!: (event: RuntimeInvalidation) => void, closes = 0, snapshots = 0;
    const observer = createRuntimeStatusObserver({ subscribe(callback) { invalidate = callback; return subscription.promise; },
      async snapshot() { snapshots++; return snapshot(); } });
    const start = observer.start(); observer.stop(); const stopped = observer.read();
    subscription.resolve(() => { closes++; }); await start;
    expect(closes).toBe(1); expect(snapshots).toBe(0);
    for (const event of ['updated','reconnect','events_lost','disconnected'] as const) invalidate(event);
    await Promise.resolve(); expect(observer.read()).toEqual(stopped); expect(snapshots).toBe(0);
  });

  test('restart owns a new generation; late old subscription cannot overwrite or close the new one', async () => {
    const first = deferred<() => void>(), second = deferred<() => void>();
    const callbacks: ((event: RuntimeInvalidation) => void)[] = []; let firstCloses = 0, secondCloses = 0, snapshots = 0;
    const observer = createRuntimeStatusObserver({ subscribe(callback) { callbacks.push(callback); return callbacks.length === 1 ? first.promise : second.promise; },
      async snapshot(epoch) { snapshots++; return snapshot(observation({ identity: { ...identity, source_epoch: epoch } })); } }, () => Date.parse(at));
    const oldStart = observer.start(); observer.stop(); const newStart = observer.start();
    second.resolve(() => { secondCloses++; }); await newStart; const current = observer.read();
    expect(current.source_epoch).toBe(1); expect(current.badges[0].state).toBe('working'); expect(snapshots).toBe(1);
    first.resolve(() => { firstCloses++; }); await oldStart;
    callbacks[0]('events_lost'); callbacks[0]('disconnected');
    callbacks[0]({ type: 'failure', error: new HerdrVersionMismatchError(versionCheck()) }); await Promise.resolve();
    expect(observer.read()).toEqual(current); expect(firstCloses).toBe(1); expect(secondCloses).toBe(0); expect(snapshots).toBe(1);
    callbacks[1]('updated'); await observer.refresh(); expect(snapshots).toBe(2);
    observer.stop(); expect(secondCloses).toBe(1);
  });

  test('old snapshot completion after restart cannot alter the new generation cache or pending fence', async () => {
    const oldRead = deferred<RuntimeSnapshot>(); let reads = 0;
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, snapshot(epoch) {
      reads++; return reads === 1 ? oldRead.promise : Promise.resolve(snapshot(observation({ identity: { ...identity, source_epoch: epoch } })));
    } }, () => Date.parse(at));
    const first = observer.start(); await Promise.resolve(); observer.stop(); await observer.start(); const current = observer.read();
    oldRead.resolve(snapshot(observation({ state: 'idle' }))); await first;
    expect(observer.read()).toEqual(current); expect(reads).toBe(2); observer.stop();
  });

  test('stopped observer rejects a slow response; untrusted caller mutations cannot alter cached identity', async () => {
    let slow = false; const response = deferred<RuntimeSnapshot>();
    const input = snapshot({ ...observation(), identity: { ...identity } });
    const observer = createRuntimeStatusObserver({ async subscribe() { return () => {}; }, async snapshot() { return slow ? response.promise : input; } }, () => Date.parse(at));
    await observer.start(); input.bindings[0].task = 'caller-mutated';
    expect(observer.read().badges[0].identity.task).toBe('task-1');
    slow = true; const refresh = observer.refresh(); observer.stop(); response.resolve(snapshot()); await refresh;
    expect(observer.read().status).toBe('unavailable'); expect(observer.read().badges[0].freshness).toBe('disconnected');
  });
});

test.skipIf(!['darwin','linux'].includes(process.platform))('runtime service retains a rejected Herdr ping reason without probing on reads', async () => {
  const root = mkdtempSync('/tmp/rh-runtime-reason-'), socketPath = join(root, 'herdr.sock'), configPath = join(root, 'runtime.json');
  const sockets = new Set<Socket>();
  let requests = 0, service: Awaited<ReturnType<typeof startRuntimeService>> | null = null;
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    let input = '';
    socket.on('data', chunk => {
      input += chunk.toString(); const end = input.indexOf('\n'); if (end < 0) return;
      const request = JSON.parse(input.slice(0, end)); input = input.slice(end + 1); requests++;
      socket.end(JSON.stringify({ id: request.id, result: { type: 'pong', version: '999.0.0', protocol: 999, capabilities: {} } }) + '\n');
    });
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
    writeFileSync(configPath, JSON.stringify({ protocol: 'repo-harness.runtime-config.v2', kind: 'herdr', source_host: 'fixture', herdr_session: 'fixture', socket_path: socketPath, deadline_ms: 1000 }));
    service = await startRuntimeService(configPath);
    expect(service.read()).toEqual(unavailableRuntimeOverlay(0, versionReason()));
    const result = service.read(); result.reason!.expected.version = 'caller-mutated';
    expect(service.read().reason).toEqual(versionReason()); expect(requests).toBe(1);
    await service.refresh();
    expect(service.read()).toEqual(unavailableRuntimeOverlay(0, versionReason())); expect(requests).toBe(2);
  } finally {
    service?.close(); for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test('GET and HEAD use only the injected cache; no subprocess or canonical state mutation', async () => {
  const overlay = project([observation()]), before = JSON.stringify(overlay);
  const server = await startOperatorServer({ port: 0, read_runtime_status: () => overlay });
  const spies = [spyOn(childProcess, 'spawn'), spyOn(childProcess, 'spawnSync'), spyOn(childProcess, 'execFile'), spyOn(childProcess, 'execFileSync')];
  try {
    const response = await fetch(`${server.url}/api/v1/runtime/status`); expect(response.status).toBe(200);
    expect(await response.json()).toEqual(overlay);
    const head = await fetch(`${server.url}/api/v1/runtime/status`, { method: 'HEAD' }); expect(head.status).toBe(200); expect(await head.text()).toBe('');
    expect((await fetch(`${server.url}/api/v1/runtime/status?host=fixture`)).status).toBe(400);
    expect((await fetch(`${server.url}/api/v1/runtime/status`, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
    const pipeline = await fetch(`${server.url}/api/v1/pipelines`);
    expect(pipeline.status).toBe(404);
    expect(await pipeline.json()).toMatchObject({ error: { code: 'not_found' } });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(overlay)).toBe(before);
  } finally { for (const spy of spies) spy.mockRestore(); await server.close(); }
  const defaultServer = await startOperatorServer({ port: 0 });
  try { expect(await (await fetch(`${defaultServer.url}/api/v1/runtime/status`)).json()).toEqual(unavailableRuntimeOverlay()); }
  finally { await defaultServer.close(); }
});

describe('configured synthetic source adapter', () => {
  function fixture() {
    const config: ConfiguredRuntimeSource = {
      source_host: identity.source_host, herdr_session: identity.herdr_session,
      source_revision: '4dc23bb15d4a2fd2c093abfb509f903c3015bf56', deadline_ms: 1000,
      bindings: async epoch => [{ ...identity, source_epoch: epoch }],
      transport: {
        capabilities: async () => ({ protocol: RUNTIME_SOURCE_PROTOCOL, source_host: identity.source_host, herdr_session: identity.herdr_session,
          source_revision: '4dc23bb15d4a2fd2c093abfb509f903c3015bf56', agent_status: true }),
        subscribe: async () => () => {},
        snapshot: async () => ({ protocol: 'repo-harness.runtime-source.snapshot.v1', source_host: identity.source_host,
          herdr_session: identity.herdr_session, source_revision: '4dc23bb15d4a2fd2c093abfb509f903c3015bf56', panes: [pane] }),
      },
    };
    return config;
  }

  test('configures explicit capabilities before subscription, binds structured panes and counts unbound panes', async () => {
    const config = fixture(), calls: string[] = [];
    let callback!: (event: string) => void, closed = false;
    const cap = config.transport.capabilities, frame = config.transport.snapshot;
    config.transport.capabilities = async signal => { calls.push('capabilities'); return cap(signal); };
    config.transport.subscribe = async (events, cb) => { expect(events).toEqual(RUNTIME_SOURCE_EVENTS); calls.push('subscribe'); callback = cb; return () => { closed = true; }; };
    config.bindings = async epoch => { calls.push('bindings'); return [{ ...identity, source_epoch: epoch }]; };
    config.transport.snapshot = async signal => { calls.push('snapshot'); return { ...await frame(signal) as object, panes: [pane, { ...pane, pane_id: 'unbound-pane' }] }; };
    const source = await configureRuntimeSource(config), observer = createRuntimeStatusObserver(source, () => Date.parse(at));
    expect(calls).toEqual(['capabilities']); await observer.start();
    expect(calls).toEqual(['capabilities','subscribe','bindings','snapshot','bindings']);
    expect(observer.read().unclaimed).toBe(1); expect(observer.read().badges[0].state).toBe('working');
    const before = calls.length; callback('unrelated-event'); await Promise.resolve(); expect(calls.length).toBe(before);
    callback('pane.moved'); await observer.refresh(); expect(calls.length).toBeGreaterThan(before);
    observer.stop(); expect(closed).toBe(true);
  });

  test('fails closed for unsupported capabilities, conflicting source identity and oversized payloads', async () => {
    for (const changes of [{ source_host: 'different-host' }, { herdr_session: 'different-session' }, { source_revision: 'b'.repeat(40) }, { agent_status: false }, { unknown: true }]) {
      const config = fixture(), cap = config.transport.capabilities;
      config.transport.capabilities = async signal => ({ ...await cap(signal) as object, ...changes });
      await expect(configureRuntimeSource(config)).rejects.toThrow();
    }
    const config = fixture(), frame = config.transport.snapshot;
    config.transport.snapshot = async signal => ({ ...await frame(signal) as object, panes: [{ ...pane, text: 'x'.repeat(1024 * 1024) }] });
    const source = await configureRuntimeSource(config); await expect(source.snapshot(0)).rejects.toThrow('runtime_source_limit');
    config.transport.snapshot = async signal => ({ ...await frame(signal) as object, herdr_session: 'wrong' });
    await expect(source.snapshot(0)).rejects.toThrow('runtime_source_identity');
  });

  test('requires complete bindings for the requested epoch and refuses a switch during snapshot read', async () => {
    const config = fixture(); let reads = 0;
    config.bindings = async () => [{ ...identity, request_id: ++reads === 1 ? 'request-1' : 'request-2' }];
    const source = await configureRuntimeSource(config);
    await expect(source.snapshot(0)).rejects.toThrow('runtime_binding_changed');
    config.bindings = async () => [identity]; await expect(source.snapshot(1)).rejects.toThrow('runtime_binding_identity');
    config.bindings = async () => [{ ...identity, generation: undefined } as unknown as RuntimeIdentity];
    const missingBinding = await configureRuntimeSource(config);
    await expect(missingBinding.snapshot(0)).rejects.toThrow('runtime_identity_invalid');
  });

  test('capability deadlines abort and late subscription completion closes its resource', async () => {
    const config = fixture(); config.deadline_ms = 1; let aborted = false;
    config.transport.capabilities = signal => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); });
    await expect(configureRuntimeSource(config)).rejects.toThrow('runtime_source_timeout'); expect(aborted).toBe(true);
    const late = fixture(); late.deadline_ms = 1; const subscription = deferred<() => void>(); let closed = false;
    late.transport.subscribe = async () => subscription.promise;
    const source = await configureRuntimeSource(late);
    await expect(source.subscribe(() => {})).rejects.toThrow('runtime_source_timeout');
    subscription.resolve(() => { closed = true; }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(closed).toBe(true);
  });

  test('configured observation starts outside GET; HTTP cache reads do not call transport or binding producer', async () => {
    const config = fixture(); let calls = 0;
    const frame = config.transport.snapshot;
    config.transport.snapshot = async signal => { calls++; return frame(signal); };
    const source = await configureRuntimeSource(config), observer = createRuntimeStatusObserver(source, () => Date.parse(at));
    await observer.start(); const before = calls;
    const server = await startOperatorServer({ port: 0, read_runtime_status: observer.read });
    try {
      const response = await fetch(`${server.url}/api/v1/runtime/status`);
      expect((await response.json()).badges[0].state).toBe('working'); expect(calls).toBe(before);
    } finally { await server.close(); observer.stop(); }
  });
});

const nativeGeneration = '123e4567-e89b-42d3-a456-426614174000';
function nativeSnapshot(changes: Partial<RuntimeCaptureSnapshot> = {}): RuntimeCaptureSnapshot {
  return { protocol: 'repo-harness.runtime-capture.v1', source_id: 'source-1', generation: nativeGeneration, sequence: 1,
    provider: 'codex', format: 'codex-app-server', capture_status: 'connected', heartbeat_at: at,
    observations: [{ scope: 'session', session_id: 'session-1', turn_id: 'turn-1', state: 'working', reason: 'unknown', event_received_at: at, changed_at: null }], ...changes };
}
function nativeFile(root: string, source_id = 'source-1', provider: NativeRuntimeSourceConfig['provider'] = 'codex'): NativeRuntimeSourceConfig {
  return { source_id, provider, snapshot_path: join(root, `${source_id}.json`) };
}
function replaceNativeFile(config: NativeRuntimeSourceConfig, value: unknown) {
  const temporary = `${config.snapshot_path}.new`;
  writeFileSync(temporary, JSON.stringify(value)); renameSync(temporary, config.snapshot_path);
}
function nativeObserver(configs: NativeRuntimeSourceConfig[], now: () => number) {
  return createNativeRuntimeStatusObserver(configs.map(config => ({ source_id: config.source_id, provider: config.provider, snapshot: () => readNativeRuntimeSnapshot(config) })), now);
}

describe('native runtime observation cache', () => {
  test('config v2 is a closed single-mode union with explicit bounded unique sources', () => {
    const source = { source_id: 'source-1', provider: 'codex', snapshot_path: '/tmp/explicit-native.json' };
    const config: NativeRuntimeConfig = { protocol: 'repo-harness.runtime-config.v2', kind: 'native', sources: [{ ...source, provider: 'codex' }] };
    expect(decodeRuntimeConfig(config)).toEqual(config);
    const herdr: HerdrRuntimeConfig = { protocol: 'repo-harness.runtime-config.v2', kind: 'herdr', source_host: 'host', herdr_session: 'session', socket_path: '/tmp/explicit-herdr.sock', deadline_ms: 1000 };
    expect(decodeRuntimeConfig(herdr)).toEqual(herdr);
    for (const invalid of [
      { ...config, protocol: 'repo-harness.runtime-config.v1' }, { ...herdr, protocol: 'repo-harness.herdr-runtime-config.v1' },
      { ...config, socket_path: '/tmp/herdr.sock' }, { ...herdr, sources: [source] },
      { ...config, sources: [] }, { ...config, sources: Array.from({ length: 9 }, (_, i) => ({ ...source, source_id: `source-${i}`, snapshot_path: `/tmp/${i}.json` })) },
      { ...config, sources: [source, { ...source, snapshot_path: '/tmp/other.json' }] },
      { ...config, sources: [source, { ...source, source_id: 'source-2' }] },
      ...[{ snapshot_path: 'relative.json' }, { provider: 'unknown' }, { source_id: '/private/path' }, { token: 'secret' }].map(change => ({ ...config, sources: [{ ...source, ...change }] })),
    ]) expect(() => decodeRuntimeConfig(invalid)).toThrow();
  });

  test('retired Herdr binding keys give an explicit config repair error', () => {
    const config = { protocol: 'repo-harness.runtime-config.v2', kind: 'herdr', source_host: 'host', herdr_session: 'session', socket_path: '/tmp/explicit-herdr.sock', deadline_ms: 1000 };
    for (const fields of [
      { bindings_path: null },
      { pipeline_snapshot: null },
      { bindings_path: null, pipeline_snapshot: null },
      { bindings_path: '/tmp/bindings.json', pipeline_snapshot: '/tmp/snapshot.json' },
    ]) {
      expect(() => decodeRuntimeConfig({ ...config, ...fields })).toThrow(
        'runtime_config_retired_fields: remove bindings_path and pipeline_snapshot; task bindings are no longer supported',
      );
    }
  });

  test('each source uses its own heartbeat; successful reads do not advance event or heartbeat time', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-age-')), first = nativeFile(root), second = nativeFile(root, 'source-2', 'pi');
    let clock = Date.parse(at) + 600_000;
    const observer = nativeObserver([first, second], () => clock);
    try {
      replaceNativeFile(first, nativeSnapshot());
      replaceNativeFile(second, nativeSnapshot({ source_id: second.source_id, provider: 'pi', format: 'osc7501', heartbeat_at: new Date(clock).toISOString(), observations: [{ scope: 'terminal', session_id: null, turn_id: null, state: 'idle', reason: 'unknown', event_received_at: at, changed_at: null }] }));
      await observer.start();
      expect(observer.read().native_sources.map(s => s.freshness)).toEqual(['stale', 'fresh']);
      expect(observer.read()).toMatchObject({ status: 'ready', badges: [], unclaimed: 0 });
      clock += 60_000; await observer.refresh();
      expect(observer.read().native_sources[0]).toMatchObject({ freshness: 'stale', heartbeat_at: at, observations: [{ event_received_at: at }] });
      expect(observer.read().native_sources[1]).toMatchObject({ freshness: 'fresh', observations: [{ event_received_at: at }] });
      clock += 300_000;
      expect(observer.read().native_sources.map(s => s.freshness)).toEqual(['stale', 'stale']);
      expect(observer.read().observed_at).toBe(new Date(Date.parse(at) + 660_000).toISOString());
      expect(nativeRuntimeFreshness({ capture_status: 'connected', heartbeat_at: new Date(clock + 1).toISOString() }, clock)).toBe('unavailable');
    } finally { observer.stop(); rmSync(root, { recursive: true, force: true }); }
  });

  test('atomic replacement keeps sequence fences; rollback and conflicts cannot revive old state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-fence-')), config = nativeFile(root), observer = nativeObserver([config], () => Date.parse(at));
    const write = async (value: RuntimeCaptureSnapshot) => { replaceNativeFile(config, value); await observer.refresh(); return observer.read().native_sources[0]; };
    try {
      replaceNativeFile(config, nativeSnapshot({ sequence: 5 })); await observer.start();
      expect(observer.read().native_sources[0].observations[0].state).toBe('working');
      expect(await write(nativeSnapshot({ sequence: 5, generation: nativeGeneration.toUpperCase() }))).toMatchObject({ generation: nativeGeneration, freshness: 'fresh' });
      expect(await write(nativeSnapshot({ sequence: 4 }))).toMatchObject({ freshness: 'unavailable', observations: [] });
      expect(await write(nativeSnapshot({ sequence: 5 }))).toMatchObject({ freshness: 'unavailable', observations: [] });
      expect(await write(nativeSnapshot({ sequence: 6 }))).toMatchObject({ freshness: 'fresh', observations: [{ state: 'working' }] });
      const idle = nativeSnapshot({ sequence: 6, observations: [{ ...nativeSnapshot().observations[0], state: 'idle' }] });
      expect(await write(idle)).toMatchObject({ freshness: 'unavailable', observations: [] });
      expect(await write(nativeSnapshot({ sequence: 6 }))).toMatchObject({ freshness: 'unavailable', observations: [] });
      expect(await write(nativeSnapshot({ sequence: 7 }))).toMatchObject({ freshness: 'fresh' });
      const generation = '123e4567-e89b-42d3-a456-426614174001';
      expect(await write(nativeSnapshot({ generation, sequence: 0, observations: [] }))).toMatchObject({ generation, freshness: 'fresh', observations: [] });
      expect(await write(nativeSnapshot({ sequence: 100 }))).toMatchObject({ freshness: 'unavailable', observations: [] });
      expect(await write(nativeSnapshot({ sequence: 100, generation: nativeGeneration.toUpperCase() }))).toMatchObject({ freshness: 'unavailable', observations: [] });
      expect(await write(nativeSnapshot({ generation, sequence: 1, observations: [] }))).toMatchObject({ generation, freshness: 'fresh', observations: [] });
    } finally { observer.stop(); rmSync(root, { recursive: true, force: true }); }
  });

  test('missing, malformed, wrong identity, private fields and future timestamps fail closed per source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-bad-')), bad = nativeFile(root), good = nativeFile(root, 'source-2');
    const observer = nativeObserver([bad, good], () => Date.parse(at));
    try {
      replaceNativeFile(good, nativeSnapshot({ source_id: good.source_id })); await observer.start();
      const assertBad = () => {
        const overlay = observer.read();
        expect(overlay.native_sources[0]).toEqual({ source_id: bad.source_id, provider: 'codex', generation: null, capture_status: 'unavailable', heartbeat_at: null, freshness: 'unavailable', observations: [] });
        expect(overlay.native_sources[1].freshness).toBe('fresh');
        expect(JSON.stringify(overlay)).not.toMatch(/snapshot_path|private|raw_error|token|prompt|tool_arguments/);
      };
      assertBad();
      for (const value of [
        {}, { ...nativeSnapshot(), source_id: 'different-source' },
        { ...nativeSnapshot(), provider: 'pi', format: 'osc7501', observations: [] },
        { ...nativeSnapshot(), prompt: 'private-secret' },
        { ...nativeSnapshot(), observations: [{ ...nativeSnapshot().observations[0], tool_arguments: 'private-secret' }] },
        nativeSnapshot({ heartbeat_at: '2026-10-08T00:00:00.001Z' }),
        nativeSnapshot({ observations: [{ ...nativeSnapshot().observations[0], event_received_at: '2026-10-08T00:00:00.001Z' }] }),
        nativeSnapshot({ observations: [{ ...nativeSnapshot().observations[0], changed_at: '2026-10-08T00:00:00.001Z' }] }),
      ]) { replaceNativeFile(bad, value); await observer.refresh(); assertBad(); }
      writeFileSync(bad.snapshot_path, '{not-json'); await observer.refresh(); assertBad();
      replaceNativeFile(bad, nativeSnapshot({ sequence: 2 })); await observer.refresh();
      expect(observer.read().native_sources[0].freshness).toBe('fresh');
      replaceNativeFile(bad, nativeSnapshot({ sequence: 3, capture_status: 'disconnected' })); await observer.refresh();
      expect(observer.read().native_sources[0]).toMatchObject({ capture_status: 'disconnected', freshness: 'disconnected', observations: [{ state: 'working' }] });
      replaceNativeFile(bad, nativeSnapshot({ sequence: 4, capture_status: 'unavailable' })); await observer.refresh();
      expect(observer.read().native_sources[0]).toMatchObject({ capture_status: 'unavailable', freshness: 'unavailable', observations: [] });
    } finally { observer.stop(); rmSync(root, { recursive: true, force: true }); }
  });

  test('reader refuses symlinks, directories, oversized files and excessive observations', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-read-')), config = nativeFile(root), other = nativeFile(root, 'other');
    try {
      replaceNativeFile(other, nativeSnapshot()); symlinkSync(other.snapshot_path, config.snapshot_path);
      await expect(readNativeRuntimeSnapshot(config)).rejects.toThrow('runtime_native_file');
      rmSync(config.snapshot_path); mkdirSync(config.snapshot_path);
      await expect(readNativeRuntimeSnapshot(config)).rejects.toThrow('runtime_native_file');
      rmSync(config.snapshot_path, { recursive: true });
      if (process.platform !== 'win32') {
        childProcess.execFileSync('mkfifo', [config.snapshot_path]);
        await expect(readNativeRuntimeSnapshot(config)).rejects.toThrow('runtime_native_file'); rmSync(config.snapshot_path);
      }
      writeFileSync(config.snapshot_path, ' '.repeat(RUNTIME_CAPTURE_MAX_BYTES + 1));
      await expect(readNativeRuntimeSnapshot(config)).rejects.toThrow('runtime_native_file');
      replaceNativeFile(config, nativeSnapshot({ observations: Array.from({ length: 65 }, (_, i) => ({ ...nativeSnapshot().observations[0], session_id: `session-${i}` })) }));
      await expect(readNativeRuntimeSnapshot(config)).rejects.toThrow('runtime_capture_limit');
      replaceNativeFile(config, nativeSnapshot());
      expect(await readNativeRuntimeSnapshot(config)).toEqual(nativeSnapshot());
      expect(readdirSync(root).sort()).toEqual(['other.json', 'source-1.json']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('reader refuses replacement and symlink races between lstat and open', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-race-')), config = nativeFile(root), target = nativeFile(root, 'target');
    const actualOpen = fsPromises.open;
    let spy: ReturnType<typeof spyOn> | null = null;
    try {
      replaceNativeFile(config, nativeSnapshot()); replaceNativeFile(target, nativeSnapshot());
      spy = spyOn(fsPromises, 'open').mockImplementation(async (...args: Parameters<typeof actualOpen>) => {
        replaceNativeFile(config, nativeSnapshot({ sequence: 2 }));
        return actualOpen(...args);
      });
      await expect(readNativeRuntimeSnapshot(config)).rejects.toThrow('runtime_native_file');
      spy.mockRestore(); spy = null;
      spy = spyOn(fsPromises, 'open').mockImplementation(async (...args: Parameters<typeof actualOpen>) => {
        rmSync(config.snapshot_path); symlinkSync(target.snapshot_path, config.snapshot_path);
        return actualOpen(...args);
      });
      await expect(readNativeRuntimeSnapshot(config)).rejects.toThrow();
    } finally { spy?.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });

  test('native-only service collects before HTTP; GET never reads sources, writes files or starts children', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-http-')), config = nativeFile(root), configPath = join(root, 'runtime.json');
    let server: Awaited<ReturnType<typeof startOperatorServer>> | null = null;
    const spies: { mockRestore(): void }[] = [];
    try {
      const captured = nativeSnapshot({ heartbeat_at: new Date().toISOString() }); replaceNativeFile(config, captured);
      writeFileSync(configPath, JSON.stringify({ protocol: 'repo-harness.runtime-config.v2', kind: 'native', sources: [config] }));
      server = await startOperatorServer({ port: 0, runtime_status_config: configPath });
      const first = await (await fetch(`${server.url}/api/v1/runtime/status`)).json();
      expect(first).toMatchObject({ projection_version: 'repo-harness.runtime-overlay.v6', status: 'ready', badges: [], native_sources: [{ source_id: config.source_id, freshness: 'fresh', observations: [{ state: 'working', event_received_at: at }] }] });
      rmSync(config.snapshot_path);
      const before = readdirSync(root).map(name => [name, readFileSync(join(root, name), 'utf8')]);
      const open = spyOn(fsPromises, 'open'), lstat = spyOn(fsPromises, 'lstat'); spies.push(open, lstat);
      const spawn = spyOn(childProcess, 'spawn'), spawnSync = spyOn(childProcess, 'spawnSync'); spies.push(spawn, spawnSync);
      for (let i = 0; i < 3; i++) {
        const response = await fetch(`${server.url}/api/v1/runtime/status`); expect(response.status).toBe(200);
        expect(await response.json()).toEqual(first);
      }
      expect(open).not.toHaveBeenCalled(); expect(lstat).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled(); expect(spawnSync).not.toHaveBeenCalled();
      expect(readdirSync(root).map(name => [name, readFileSync(join(root, name), 'utf8')])).toEqual(before);
      expect((await fetch(`${server.url}/api/v1/runtime/status`, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      expect(JSON.stringify(first)).not.toContain(root);
    } finally { for (const spy of spies) spy.mockRestore(); await server?.close(); rmSync(root, { recursive: true, force: true }); }
  });

  test('service close stops owned refresh and does not change the snapshot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-close-')), config = nativeFile(root), configPath = join(root, 'runtime.json');
    try {
      replaceNativeFile(config, nativeSnapshot({ heartbeat_at: new Date().toISOString() }));
      writeFileSync(configPath, JSON.stringify({ protocol: 'repo-harness.runtime-config.v2', kind: 'native', sources: [config] }));
      const service = await startRuntimeService(configPath), before = readFileSync(config.snapshot_path);
      service.close(); await service.refresh();
      expect(service.read()).toMatchObject({ status: 'unavailable', native_sources: [{ freshness: 'unavailable' }] });
      expect(readFileSync(config.snapshot_path)).toEqual(before); expect(readdirSync(root).sort()).toEqual(['runtime.json', 'source-1.json']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('native refresh coalesces reads and stop discards a late snapshot', async () => {
    const late = deferred<RuntimeCaptureSnapshot>(); let reads = 0, nextReads = 0;
    const observer = createNativeRuntimeStatusObserver([
      { source_id: 'source-1', provider: 'codex', snapshot: () => { reads++; return late.promise; } },
      { source_id: 'source-2', provider: 'codex', snapshot: async () => { nextReads++; return nativeSnapshot({ source_id: 'source-2' }); } },
    ], () => Date.parse(at));
    const start = observer.start(), parallel = observer.refresh();
    expect(reads).toBe(1); expect(nextReads).toBe(0);
    observer.stop(); late.resolve(nativeSnapshot()); await start; await parallel; await observer.refresh();
    expect(reads).toBe(1); expect(nextReads).toBe(0);
    expect(observer.read()).toMatchObject({ status: 'unavailable', observed_at: null, native_sources: [{ observations: [] }, { observations: [] }] });
  });

  test('overlay v6 rejects mixed authority, raw fields, duplicate sources and older schemas', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-native-overlay-')), config = nativeFile(root), observer = nativeObserver([config], () => Date.parse(at));
    try {
      replaceNativeFile(config, nativeSnapshot()); await observer.start(); const overlay = observer.read();
      expect(decodeRuntimeOverlay(overlay)).toEqual(overlay);
      for (const invalid of [
        { ...overlay, projection_version: 'repo-harness.runtime-overlay.v3' },
        { ...overlay, native_sources: [...overlay.native_sources, ...overlay.native_sources] },
        { ...overlay, native_sources: [{ ...overlay.native_sources[0], snapshot_path: '/private/path' }] },
        { ...overlay, native_sources: [{ ...overlay.native_sources[0], heartbeat_at: null }] },
        { ...overlay, native_sources: [{ ...overlay.native_sources[0], capture_status: 'unavailable' }] },
        { ...overlay, badges: project([observation()]).badges },
      ]) expect(() => decodeRuntimeOverlay(invalid)).toThrow();
    } finally { observer.stop(); rmSync(root, { recursive: true, force: true }); }
  });
});
