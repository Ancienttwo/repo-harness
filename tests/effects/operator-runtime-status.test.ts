import { describe, expect, test, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { decodeRuntimeOverlay, projectRuntimeOverlay, RUNTIME_LIMIT, unavailableRuntimeOverlay, type RuntimeIdentity, type RuntimeObservation, type RuntimePaneObservation } from '../../src/core/operator/runtime-status';
import { createRuntimeStatusObserver, observeHerdrPane, observeProgramStatus, type RuntimeInvalidation, type RuntimeSnapshot } from '../../src/effects/operator/runtime-status';
import { configureRuntimeSource, RUNTIME_SOURCE_EVENTS, RUNTIME_SOURCE_PROTOCOL, type ConfiguredRuntimeSource } from '../../src/effects/operator/runtime-source';
import { startOperatorServer } from '../../src/effects/operator/server';

const at = '2026-10-08T00:00:00.000Z';
const identity: RuntimeIdentity = {
  source_host: 'fixture-host', repository_id: `sha256:${'a'.repeat(64)}`, task: 'task-1', role: 'implementer', round: 1, pipeline_state_version: 7,
  request_id: 'request-1', context_sha256: `sha256:${'b'.repeat(64)}`, runtime_session: 'runtime-1', attempt: 1,
  generation: 'generation-1', source_epoch: 0, herdr_session: 'fixture', terminal_id: 'terminal-1', pane_id: 'pane-1', agent_session: 'agent-1',
};
const pane = { pane_id: 'pane-1', terminal_id: 'terminal-1', agent_session: 'agent-1', revision: 1, agent_status: 'working' };
const observation = (changes: Partial<RuntimeObservation> = {}): RuntimeObservation => ({ identity, revision: 1, state: 'working', reason: 'unknown', changed_at: null, source: 'herdr-agent', ...changes });
const paneReport = (changes: Partial<RuntimePaneObservation> = {}): RuntimePaneObservation => ({ scope: 'pane', source: 'osc7501',
  pane: { source_host: identity.source_host, herdr_session: identity.herdr_session, terminal_id: identity.terminal_id, pane_id: identity.pane_id, agent_session: identity.agent_session },
  binding: identity, source_epoch: 2, revision: 1, state: 'working', reason: 'unknown', changed_at: at, ...changes });
const snapshot = (o = observation()): RuntimeSnapshot => ({ bindings: [o.identity], observations: [o] });
const project = (observations: RuntimeObservation[], bindings: RuntimeIdentity[] = [identity]) => projectRuntimeOverlay(bindings, observations, at, 0, 'v1', Date.parse(at));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe('structured runtime overlay', () => {
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

  test('optional program states remain distinct and only typed aborted means cancel', () => {
    for (const state of ['idle','working','blocked','settled','error','aborted','clear'] as const) {
      const o = observeProgramStatus({ protocol: 'repo-harness.program-status.v1', identity, revision: 1, state, reason: 'unknown', changed_at: at });
      expect(o.state).toBe(state === 'aborted' ? 'cancelled' : state);
    }
    for (const reason of ['permission','question','auth'] as const) {
      expect(observeProgramStatus({ protocol: 'repo-harness.program-status.v1', identity, revision: 1, state: 'blocked', reason, changed_at: at }).reason).toBe(reason);
    }
    const unsupported = projectRuntimeOverlay([identity], [observation({ source: 'program-v1', state: 'settled' })], at, 0, 'unsupported', Date.parse(at));
    expect(unsupported.badges).toEqual([]); expect(unsupported.unclaimed).toBe(1);
  });

  test('deduplicates, rejects conflicts and fences out-of-order revisions', () => {
    expect(project([observation(), observation({ source: 'program-v1', revision: 50, state: 'settled' })]).badges).toEqual([]);
    expect(project([observation(), observation()]).badges).toHaveLength(1);
    expect(project([observation(), observation({ state: 'idle' })]).badges).toEqual([]);
    expect(project([observation({ revision: 3 }), observation({ revision: 2, state: 'idle' })]).badges[0].state).toBe('working');
    expect(project([observation()], [identity, identity]).badges).toEqual([]);
    expect(project([observation()], [identity, { ...identity, request_id: 'request-2' }]).badges).toEqual([]);
  });

  test('clear removes the badge and does not turn into completion or cancellation', () => {
    const cleared = observation({ source: 'program-v1', state: 'clear', revision: 3 });
    expect(project([cleared])).toMatchObject({ status: 'ready', unclaimed: 0, badges: [] });
    expect(project([cleared, { ...cleared, state: 'working', revision: 2 }]).badges).toEqual([]);
    expect(project([cleared, { ...cleared, state: 'working' }])).toMatchObject({ unclaimed: 1, badges: [] });
  });

  test('pane scope is separate from task identity and rejects forged bindings and cancellation', () => {
    const overlay = projectRuntimeOverlay([identity], [], at, 0, 'v1', Date.parse(at), true, 0, [paneReport()]);
    expect(overlay).toMatchObject({ projection_version: 'repo-harness.runtime-overlay.v3', badges: [], pane_observations: [{ scope: 'pane', source: 'osc7501', state: 'working', binding: identity }] });
    for (const change of [{ scope: 'task' }, { state: 'cancelled' }, { source: 'program-v1' }, { msg: 'private' }, { binding: { ...identity, pane_id: 'wrong' } }]) {
      expect(() => projectRuntimeOverlay([identity], [], at, 0, 'v1', Date.parse(at), true, 0, [{ ...paneReport(), ...change } as RuntimePaneObservation])).toThrow();
    }
    expect(projectRuntimeOverlay([identity], [], at, 0, 'unsupported', Date.parse(at), true, 0, [paneReport()])).toMatchObject({ unclaimed: 1, pane_observations: [] });
    expect(projectRuntimeOverlay([identity], [], at, 0, 'v1', Date.parse(at), true, 0, [paneReport({ state: 'clear' })]).pane_observations).toEqual([]);
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
    expect(() => project([observation({ state: 'settled' })])).toThrow();
    expect(() => project(Array.from({ length: RUNTIME_LIMIT + 1 }, () => observation()))).toThrow();
    expect(() => decodeRuntimeOverlay({ ...overlay, badges: [overlay.badges[0], overlay.badges[0]] })).toThrow();
  });
});

describe('snapshot lifecycle', () => {
  test('pane observations keep epoch/revision fences and snapshot freshness independent of progress', async () => {
    let clock = Date.parse(at), current = [paneReport()], bindings = [identity], fail = false;
    const observer = createRuntimeStatusObserver({ program_status: 'v1', async subscribe() { return () => {}; }, async snapshot() {
      if (fail) throw new Error('fixture'); return { bindings, observations: [], pane_observations: current };
    } }, () => clock);
    try {
      await observer.start(); expect(observer.read().pane_observations[0]).toMatchObject({ scope: 'pane', state: 'working', freshness: 'fresh' });
      clock += 600_000; expect(observer.read().pane_observations[0]).toMatchObject({ freshness: 'stale', changed_at: at });
      fail = true; await observer.refresh(); expect(observer.read().observed_at).toBe(at); fail = false;
      current = [paneReport({ state: 'clear', revision: 3 })]; await observer.refresh(); expect(observer.read().pane_observations).toEqual([]);
      current = []; await observer.refresh();
      current = [paneReport({ revision: 2 })]; await observer.refresh(); expect(observer.read().pane_observations).toEqual([]);
      current = [paneReport({ revision: 4 })]; await observer.refresh(); expect(observer.read().pane_observations[0].state).toBe('working');
      current = [paneReport({ source_epoch: 3, revision: 5, state: 'blocked', reason: 'permission' })]; await observer.refresh();
      current = [paneReport({ source_epoch: 2, revision: 100, state: 'settled' })]; await observer.refresh();
      expect(observer.read().pane_observations[0]).toMatchObject({ source_epoch: 3, revision: 5, state: 'blocked', reason: 'permission' });
      bindings = [{ ...identity, round: 2, request_id: 'request-2', attempt: 2, generation: 'generation-2' }];
      current = [paneReport({ source_epoch: 3, revision: 5, state: 'blocked', reason: 'permission', binding: bindings[0] })]; await observer.refresh();
      expect(observer.read().pane_observations[0]).toMatchObject({ scope: 'pane', binding: bindings[0] }); expect(observer.read().badges).toEqual([]);
      observer.invalidate('disconnected'); expect(observer.read().pane_observations[0].freshness).toBe('disconnected');
    } finally { observer.stop(); }
  });

  test('same-revision pane conflicts stay hidden until a new report', async () => {
    let current = [paneReport(), paneReport({ state: 'idle' })];
    const observer = createRuntimeStatusObserver({ program_status: 'v1', async subscribe() { return () => {}; }, async snapshot() { return { bindings: [identity], observations: [], pane_observations: current }; } }, () => Date.parse(at));
    try {
      await observer.start(); expect(observer.read()).toMatchObject({ unclaimed: 1, pane_observations: [] });
      current = [paneReport()]; await observer.refresh(); expect(observer.read().pane_observations).toEqual([]);
      current = [paneReport({ revision: 2 })]; await observer.refresh(); expect(observer.read().pane_observations[0].state).toBe('working');
    } finally { observer.stop(); }
  });
  test('subscribes before snapshot; events during read force a serialized second read', async () => {
    const first = deferred<RuntimeSnapshot>(), second = deferred<RuntimeSnapshot>();
    let event!: (e: RuntimeInvalidation) => void, calls = 0, subscribed = false;
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe(cb) { event = cb; subscribed = true; return () => {}; },
      snapshot() { expect(subscribed).toBe(true); calls++; return calls === 1 ? first.promise : second.promise; } }, () => Date.parse(at));
    const started = observer.start(); await Promise.resolve();
    const parallel = observer.refresh(); event('updated'); first.resolve(snapshot(observation({ state: 'idle' })));
    await Promise.resolve(); await Promise.resolve();
    second.resolve(snapshot()); await started; await parallel;
    expect(calls).toBe(2); expect(observer.read().badges[0].state).toBe('working'); observer.stop();
  });

  test('successful snapshots update observation time only; failed refresh keeps original age; silence is stale, not failure', async () => {
    let clock = Date.parse(at), fail = false;
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { return () => {}; }, async snapshot() { if (fail) throw new Error('fixture'); return snapshot(); } }, () => clock);
    await observer.start(); clock += 600_000;
    expect(observer.read().badges[0]).toMatchObject({ state: 'working', freshness: 'stale', changed_at: null });
    fail = true; await observer.refresh(); expect(observer.read().observed_at).toBe(at); expect(observer.read().status).toBe('unavailable');
    fail = false; await observer.refresh(); expect(observer.read().observed_at).toBe(new Date(clock).toISOString());
    expect(observer.read().badges[0].changed_at).toBeNull(); observer.stop();
  });

  test('reconnect and lost events discard old epoch; disconnect shows original observation age', async () => {
    let event!: (e: RuntimeInvalidation) => void;
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe(cb) { event = cb; return () => {}; }, async snapshot(epoch) { return snapshot(observation({ identity: { ...identity, source_epoch: epoch } })); } }, () => Date.parse(at));
    await observer.start(); event('disconnected');
    expect(observer.read()).toMatchObject({ observed_at: at, status: 'unavailable' }); expect(observer.read().badges[0].freshness).toBe('disconnected');
    event('reconnect'); await observer.refresh(); expect(observer.read().source_epoch).toBe(1);
    event('events_lost'); await observer.refresh(); expect(observer.read().source_epoch).toBe(2); observer.stop();
  });

  test('same attempt cancel survives late done; tool error permits recovery; new attempts reset the fence', async () => {
    let o = observation({ source: 'program-v1', state: 'cancelled', revision: 2 });
    const observer = createRuntimeStatusObserver({ program_status: 'v1', async subscribe() { return () => {}; }, async snapshot() { return snapshot(o); } }, () => Date.parse(at));
    await observer.start(); o = observation({ source: 'program-v1', state: 'settled', revision: 3 }); await observer.refresh();
    expect(observer.read().badges[0].state).toBe('cancelled');
    o = observation({ identity: { ...identity, attempt: 2, generation: 'generation-2' }, source: 'program-v1', state: 'error', revision: 1 }); await observer.refresh();
    expect(observer.read().badges[0].state).toBe('error'); o = { ...o, state: 'working', revision: 2 }; await observer.refresh();
    expect(observer.read().badges[0].state).toBe('working');
    o = { ...o, state: 'idle', revision: 1 }; await observer.refresh(); expect(observer.read().badges[0].state).toBe('working'); observer.stop();
  });

  test('clear keeps its revision fence across missing data and permits a newer observation', async () => {
    let current = [observation({ source: 'program-v1', state: 'working', revision: 1 })];
    const observer = createRuntimeStatusObserver({ program_status: 'v1', async subscribe() { return () => {}; },
      async snapshot() { return { bindings: [identity], observations: current }; } }, () => Date.parse(at));
    try {
      await observer.start(); expect(observer.read().badges[0].state).toBe('working');
      current = [{ ...current[0], state: 'clear', revision: 3 }]; await observer.refresh();
      expect(observer.read()).toMatchObject({ status: 'ready', unclaimed: 0, badges: [] });
      current = []; await observer.refresh(); expect(observer.read().badges).toEqual([]);
      current = [observation({ source: 'program-v1', state: 'working', revision: 2 })]; await observer.refresh();
      expect(observer.read().badges).toEqual([]);
      current = [{ ...current[0], revision: 4 }]; await observer.refresh();
      expect(observer.read().badges[0].state).toBe('working');
    } finally { observer.stop(); }
  });

  test('a newer clear hides cancellation without accepting an older or ambiguous clear', async () => {
    let current = [observation({ source: 'program-v1', state: 'cancelled', revision: 3 })];
    const observer = createRuntimeStatusObserver({ program_status: 'v1', async subscribe() { return () => {}; },
      async snapshot() { return { bindings: [current[0].identity], observations: current }; } }, () => Date.parse(at));
    try {
      await observer.start();
      current = [{ ...current[0], state: 'clear', revision: 2 }]; await observer.refresh();
      expect(observer.read().badges[0].state).toBe('cancelled');
      current = [{ ...current[0], revision: 4 }, { ...current[0], state: 'working', revision: 4 }]; await observer.refresh();
      expect(observer.read().badges[0].state).toBe('cancelled');
      current = [observation({ source: 'program-v1', state: 'clear', revision: 5 })]; await observer.refresh();
      expect(observer.read()).toMatchObject({ status: 'ready', unclaimed: 0, badges: [] });
      current = [observation({ source: 'program-v1', state: 'settled', revision: 4 })]; await observer.refresh();
      expect(observer.read().badges).toEqual([]);
      current = [observation({ source: 'program-v1', state: 'working', revision: 6 })]; await observer.refresh();
      expect(observer.read().badges).toEqual([]);
      current = [observation({ identity: { ...identity, attempt: 2, generation: 'generation-2' }, source: 'program-v1', state: 'working', revision: 1 })];
      await observer.refresh(); expect(observer.read().badges[0].state).toBe('working');
    } finally { observer.stop(); }
  });

  test('conflicting revision stays unclaimed until a higher revision; cancellation fence survives an absent pane', async () => {
    let observations = [observation(), observation({ state: 'idle' })];
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { return () => {}; }, async snapshot() { return { bindings: [identity], observations }; } }, () => Date.parse(at));
    await observer.start(); expect(observer.read().badges).toEqual([]);
    observations = [observation()]; await observer.refresh(); expect(observer.read().badges).toEqual([]);
    observations = [observation({ revision: 2 })]; await observer.refresh(); expect(observer.read().badges[0].state).toBe('working'); observer.stop();
    let current = [observation({ source: 'program-v1', state: 'cancelled', revision: 2 })];
    const cancelled = createRuntimeStatusObserver({ program_status: 'v1', async subscribe() { return () => {}; }, async snapshot() { return { bindings: [identity], observations: current }; } }, () => Date.parse(at));
    await cancelled.start(); current = []; await cancelled.refresh(); expect(cancelled.read().badges).toEqual([]);
    current = [observation({ source: 'program-v1', state: 'settled', revision: 3 })]; await cancelled.refresh(); expect(cancelled.read().badges[0].state).toBe('cancelled'); cancelled.stop();
  });

  test('identity key permutations across snapshots do not create a persistent conflict', async () => {
    let current = observation();
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { return () => {}; }, async snapshot() { return snapshot(current); } }, () => Date.parse(at));
    await observer.start(); current = observation({ identity: Object.fromEntries(Object.entries(identity).reverse()) as unknown as RuntimeIdentity });
    await observer.refresh(); expect(observer.read().badges).toHaveLength(1); expect(observer.read().unclaimed).toBe(0);
    current = { ...current, state: 'idle' }; await observer.refresh(); expect(observer.read().badges).toEqual([]);
    current = { ...current, revision: 2 }; await observer.refresh(); expect(observer.read().badges[0].state).toBe('idle'); observer.stop();
  });

  test('unbound cancellation cannot poison a later verified binding', async () => {
    let bindings: RuntimeIdentity[] = [], current = observation({ source: 'program-v1', state: 'cancelled', revision: 2 });
    const observer = createRuntimeStatusObserver({ program_status: 'v1', async subscribe() { return () => {}; }, async snapshot() { return { bindings, observations: [current] }; } }, () => Date.parse(at));
    await observer.start(); expect(observer.read().unclaimed).toBe(1); expect(observer.read().badges).toEqual([]);
    bindings = [identity]; current = observation({ source: 'program-v1', state: 'working', revision: 1 }); await observer.refresh();
    expect(observer.read().badges[0].state).toBe('working'); observer.stop();
  });

  test('late pre-reconnect responses cannot replace the new epoch snapshot', async () => {
    const old = deferred<RuntimeSnapshot>(); let calls = 0;
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { return () => {}; }, snapshot(epoch) {
      calls++; return calls === 1 ? old.promise : Promise.resolve(snapshot(observation({ identity: { ...identity, source_epoch: epoch } })));
    } }, () => Date.parse(at));
    const start = observer.start(); await Promise.resolve(); observer.invalidate('reconnect');
    old.resolve(snapshot(observation({ state: 'idle' }))); await start;
    expect(observer.read()).toMatchObject({ source_epoch: 1, status: 'ready' }); expect(observer.read().badges[0].state).toBe('working'); observer.stop();
  });

  test('event storms and subscription failures fail closed without publishing unstable observations', async () => {
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { return () => {}; }, async snapshot() {
      observer.invalidate('updated'); return snapshot();
    } }, () => Date.parse(at));
    await observer.start(); expect(observer.read().status).toBe('unavailable'); observer.stop();
    const failed = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { throw new Error('fixture'); }, async snapshot() { throw new Error('must not read'); } });
    await failed.start(); expect(failed.read()).toEqual(unavailableRuntimeOverlay());
  });

  test('stop while subscribe is pending closes the late subscription and ignores its callbacks', async () => {
    const subscription = deferred<() => void>(); let invalidate!: (event: RuntimeInvalidation) => void, closes = 0, snapshots = 0;
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', subscribe(callback) { invalidate = callback; return subscription.promise; },
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
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', subscribe(callback) { callbacks.push(callback); return callbacks.length === 1 ? first.promise : second.promise; },
      async snapshot(epoch) { snapshots++; return snapshot(observation({ identity: { ...identity, source_epoch: epoch } })); } }, () => Date.parse(at));
    const oldStart = observer.start(); observer.stop(); const newStart = observer.start();
    second.resolve(() => { secondCloses++; }); await newStart; const current = observer.read();
    expect(current.source_epoch).toBe(1); expect(current.badges[0].state).toBe('working'); expect(snapshots).toBe(1);
    first.resolve(() => { firstCloses++; }); await oldStart;
    callbacks[0]('events_lost'); callbacks[0]('disconnected'); await Promise.resolve();
    expect(observer.read()).toEqual(current); expect(firstCloses).toBe(1); expect(secondCloses).toBe(0); expect(snapshots).toBe(1);
    callbacks[1]('updated'); await observer.refresh(); expect(snapshots).toBe(2);
    observer.stop(); expect(secondCloses).toBe(1);
  });

  test('old snapshot completion after restart cannot alter the new generation cache or pending fence', async () => {
    const oldRead = deferred<RuntimeSnapshot>(); let reads = 0;
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { return () => {}; }, snapshot(epoch) {
      reads++; return reads === 1 ? oldRead.promise : Promise.resolve(snapshot(observation({ identity: { ...identity, source_epoch: epoch } })));
    } }, () => Date.parse(at));
    const first = observer.start(); await Promise.resolve(); observer.stop(); await observer.start(); const current = observer.read();
    oldRead.resolve(snapshot(observation({ state: 'idle' }))); await first;
    expect(observer.read()).toEqual(current); expect(reads).toBe(2); observer.stop();
  });

  test('stopped observer rejects a slow response; untrusted caller mutations cannot alter cached identity', async () => {
    let slow = false; const response = deferred<RuntimeSnapshot>();
    const input = snapshot({ ...observation(), identity: { ...identity } });
    const observer = createRuntimeStatusObserver({ program_status: 'unsupported', async subscribe() { return () => {}; }, async snapshot() { return slow ? response.promise : input; } }, () => Date.parse(at));
    await observer.start(); input.bindings[0].task = 'caller-mutated';
    expect(observer.read().badges[0].identity.task).toBe('task-1');
    slow = true; const refresh = observer.refresh(); observer.stop(); response.resolve(snapshot()); await refresh;
    expect(observer.read().status).toBe('unavailable'); expect(observer.read().badges[0].freshness).toBe('disconnected');
  });
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
    expect((await fetch(`${server.url}/api/v1/runtime/status`, { method: 'POST' })).status).toBe(405);
    const pipeline = await fetch(`${server.url}/api/v1/pipelines`);
    expect(pipeline.status).toBe(200);
    expect(await pipeline.json()).toHaveProperty('projection_version', 'repo-harness.pipeline-board.v2');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(overlay)).toBe(before);
  } finally { for (const spy of spies) spy.mockRestore(); await server.close(); }
  const defaultServer = await startOperatorServer({ port: 0 });
  try { expect(await (await fetch(`${defaultServer.url}/api/v1/runtime/status`)).json()).toEqual(unavailableRuntimeOverlay()); }
  finally { await defaultServer.close(); }
});


describe('configured synthetic source adapter', () => {
  function fixture(program_status: 'unsupported' | 'v1' = 'unsupported') {
    const config: ConfiguredRuntimeSource = {
      source_host: identity.source_host, herdr_session: identity.herdr_session,
      source_revision: '4dc23bb15d4a2fd2c093abfb509f903c3015bf56', deadline_ms: 1000,
      bindings: async epoch => [{ ...identity, source_epoch: epoch }],
      transport: {
        capabilities: async () => ({ protocol: RUNTIME_SOURCE_PROTOCOL, source_host: identity.source_host, herdr_session: identity.herdr_session,
          source_revision: '4dc23bb15d4a2fd2c093abfb509f903c3015bf56', agent_status: true, program_status }),
        subscribe: async () => () => {},
        snapshot: async () => ({ protocol: 'repo-harness.runtime-source.snapshot.v1', source_host: identity.source_host,
          herdr_session: identity.herdr_session, source_revision: '4dc23bb15d4a2fd2c093abfb509f903c3015bf56', panes: [pane], program_status: [] }),
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
    for (const changes of [{ source_host: 'different-host' }, { herdr_session: 'different-session' }, { source_revision: 'b'.repeat(40) }, { agent_status: false }, { program_status: 'osc7501' }, { unknown: true }]) {
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

  test('optional program data requires explicit capability and never mixes revision domains', async () => {
    const program = { protocol: 'repo-harness.program-status.v1', identity, revision: 1, state: 'blocked', reason: 'question', changed_at: at };
    const config = fixture(), frame = config.transport.snapshot;
    config.transport.snapshot = async signal => ({ ...await frame(signal) as object, program_status: [program] });
    const unsupported = await configureRuntimeSource(config); await expect(unsupported.snapshot(0)).rejects.toThrow('runtime_source_capability');
    const enabled = fixture('v1'); enabled.transport.snapshot = config.transport.snapshot;
    const source = await configureRuntimeSource(enabled), observed = await source.snapshot(0);
    expect(observed.observations).toHaveLength(1); expect(observed.observations[0]).toMatchObject({ state: 'blocked', reason: 'question', source: 'program-v1' });
    expect(projectRuntimeOverlay(observed.bindings, observed.observations, at, 0, 'v1', Date.parse(at)).badges[0].state).toBe('blocked');
  });

  test('root terminal facts route only through stable unique bindings and never become task observations', async () => {
    const config = fixture('v1'), original = config.transport.snapshot;
    config.transport.snapshot = async signal => ({ ...await original(signal) as object, panes: [{ ...pane, program_status: {
      protocol: 'repo-harness.program-status.v1', source_epoch: 2, revision: 1, state: 'blocked', reason: 'question', changed_at: at,
    } }] });
    const source = await configureRuntimeSource(config);
    let result = await source.snapshot(0);
    expect(result.observations).toEqual([]); expect(result.pane_observations?.[0]).toMatchObject({ scope: 'pane', binding: identity, state: 'blocked', reason: 'question' });
    config.bindings = async () => [identity, { ...identity, task: 'task-2' }];
    const ambiguous = await configureRuntimeSource(config); result = await ambiguous.snapshot(0);
    expect(result).toMatchObject({ observations: [], unclaimed: 1, pane_observations: [{ scope: 'pane', binding: null }] });
    config.bindings = async () => []; const unbound = await configureRuntimeSource(config);
    expect(await unbound.snapshot(0)).toMatchObject({ unclaimed: 1, pane_observations: [{ binding: null }] });
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
