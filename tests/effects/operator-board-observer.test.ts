import { expect, spyOn, test } from 'bun:test';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { BOARD_FACTS_DEADLINE_MS, BOARD_LEASE_MS, BOARD_SEATS_DEBOUNCE_MS, startBoardObserver, type BoardObserverOptions, type BoardObserverPorts } from '../../src/effects/operator/board-observer';
import { answerBoardWorkerRequest, type BoardWorkerRequest } from '../../src/effects/operator/board-observer-worker';
import { createKeyedSources } from '../../src/effects/board/keyed-sources';
import { startOperatorServer } from '../../src/effects/operator/server';
import { RH_LABEL, type HcStreamItem, type HcTerminal } from '../../src/effects/terminal/herdr-core';
import { decodeBoardSeats } from '../../src/core/board/parents';
import { decodeBoard } from '../../src/core/board/board';
import board from '../../src/operator-web/fixtures/board-1474.json';
import boardParents from '../../src/operator-web/fixtures/board-parents.json';

type WorkerReply = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: string };
/** Each fake worker records its requests; a reply of null never answers, as a blocked worker. */
function workers() {
  const spawned: { readonly requests: BoardWorkerRequest[]; killed: boolean }[] = [];
  let reply = (request: BoardWorkerRequest): WorkerReply | null => request.kind === 'rate_limit' ? { ok: false, code: 'rate_limit_unavailable' }
    : request.kind === 'parents' ? { ok: true, value: boardParents } : request.kind === 'board' ? { ok: true, value: { ...board, parent: { ...board.parent, number: request.parent } } } : { ok: true, value: null };
  const spawnWorker = () => {
    const child = new EventEmitter() as childProcess.ChildProcess;
    const stdin = new PassThrough(), stdout = new PassThrough(), record = { requests: [] as BoardWorkerRequest[], killed: false };
    spawned.push(record);
    Object.assign(child, { stdin, stdout, pid: undefined, kill() { record.killed = true; child.emit('close', null, 'SIGKILL'); return true; } });
    createInterface({ input: stdin }).on('line', (line) => {
      const request = JSON.parse(line) as BoardWorkerRequest;
      record.requests.push(request);
      const answer = reply(request);
      if (answer !== null) stdout.write(`${JSON.stringify({ id: request.id, ...answer })}\n`);
    });
    return child;
  };
  return { spawnWorker, spawned, reply(next: typeof reply) { reply = next; } };
}

/** The fake worker answers on stream ticks, outside the fake clock. */
async function until(condition: () => boolean) {
  for (let turn = 0; turn < 500 && !condition(); turn++) await new Promise(resolve => setTimeout(resolve, 2));
  expect(condition()).toBe(true);
}

function fixture() {
  let now = Date.parse('2026-11-10T00:00:00Z'), id = 0;
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  const clock: NonNullable<BoardObserverOptions['clock']> = {
    now: () => new Date(now),
    setTimeout(run, ms) { const key = ++id; timers.set(key, { at: now + ms, run }); return key as unknown as ReturnType<typeof setTimeout>; },
    clearTimeout(timer) { timers.delete(timer as unknown as number); },
  };
  const flush = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
  const tick = async (ms: number) => {
    const target = now + ms;
    await flush();
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].run(); await flush();
    }
    now = target; await flush();
  };
  const terminal = (address: string, extra: Partial<HcTerminal> = {}): HcTerminal => ({
    address, name: address, state: 'live', labels: { [RH_LABEL.repository]: '1186405141', [RH_LABEL.seat]: 'worker', [RH_LABEL.parent]: '1474' },
    status: { state: 'working', app: 'not-the-agent' }, status_ms: now, turn: 1, cwd: `/repo/${address}`, pid: null, foreground: null, reason: null, ...extra,
  });
  let rows: readonly HcTerminal[] = [terminal('t1')], branch = 'feat/one', registered = true;
  let reads = 0, branches = 0, seq = 1;
  let snapshotGate: Promise<void> | null = null;
  const streams: { readonly emit: (item: HcStreamItem) => void; readonly end: () => void; closed: boolean }[] = [];
  const worker = workers();
  const ports: BoardObserverPorts = {
    spawnWorker: worker.spawnWorker,
    repositories: () => registered ? [{ id: 'repo-a', path: '/repo' }] : [],
    identify: async () => '1186405141',
    subscribe(labels, emit) {
      expect(labels).toEqual({ [RH_LABEL.repository]: '1186405141' });
      let end!: () => void;
      const done = new Promise<void>(resolve => { end = resolve; });
      const stream = { emit, end, closed: false }; streams.push(stream);
      return { done, close() { stream.closed = true; end(); } };
    },
    async snapshot() { reads++; const value = { seq, terminals: rows }; if (snapshotGate) await snapshotGate; return value; },
    list: async () => rows.filter(row => row.state === 'live').map(row => ({ address: row.address, name: row.name, state: row.state, agent: 'hc-agent' })),
    branch: async () => { branches++; return branch; },
  };
  const emit = (type: 'snapshot' | 'event' | 'missed') => {
    seq++;
    streams.at(-1)!.emit(type === 'event' ? { type, seq, terminal: 't1', event: 'status', data: {} } : { type, seq, terminals: rows });
  };
  return { ports, clock, worker, terminal, tick, emit, streams, now: () => now, reads: () => reads, branches: () => branches, timers: () => timers.size,
    rows(value: readonly HcTerminal[]) { rows = value; }, branch(value: string) { branch = value; },
    remove() { registered = false; }, register() { registered = true; }, gate(value: Promise<void> | null) { snapshotGate = value; } };
}

test('seats observer debounces snapshots, events and missed snapshots, reconnects and serves cached documents within one poll', async () => {
  const f = fixture();
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  const server = await startOperatorServer({ port: 0, board_cache: observer });
  const path = `${server.url}/api/v1/repositories/repo-a/board/seats`;
  const seats = async () => decodeBoardSeats(await (await fetch(path)).json());
  try {
    expect((await fetch(path)).status).toBe(202);
    await f.tick(0); expect(f.streams).toHaveLength(1);
    f.rows([f.terminal('t1'), f.terminal('t2', { state: 'finished' }), f.terminal('t3', { labels: { [RH_LABEL.repository]: '1186405141', [RH_LABEL.service]: 'attention', [RH_LABEL.seat]: 'worker' } })]);
    f.emit('snapshot');
    await f.tick(BOARD_SEATS_DEBOUNCE_MS - 1); expect(f.reads()).toBe(0);
    await f.tick(1);
    const first = await seats();
    expect(first.seats.map(row => [row.address, row.agent, row.branch, row.status])).toEqual([['t1', 'hc-agent', 'feat/one', 'working']]);
    expect(first.observed_at).toBe(new Date(f.now()).toISOString());
    const response = await fetch(path), tag = response.headers.get('etag')!;
    await response.text();
    expect((await fetch(path, { headers: { 'If-None-Match': tag } })).status).toBe(304);
    expect((await fetch(path, { method: 'HEAD' })).headers.get('etag')).toBe(tag);
    const calls = f.reads(); await seats(); await seats(); expect(f.reads()).toBe(calls);

    f.branch('feat/two');
    f.rows([f.terminal('t1', { status: { state: 'blocked' } })]);
    f.emit('event'); f.emit('event');
    await f.tick(BOARD_SEATS_DEBOUNCE_MS + 3000);
    expect((await seats()).seats[0]!.branch).toBe('feat/two');
    expect((await seats()).seats[0]!.status).toBe('blocked');
    expect(f.reads()).toBe(calls + 1);
    const branchReads = f.branches();
    f.emit('event'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    expect(f.branches()).toBe(branchReads);
    f.branch('feat/facts-cycle');
    const beforeFacts = f.reads();
    // The first board GET leases 1474 and starts a facts cycle; the polls then answer from memory.
    await fetch(`${server.url}/api/v1/repositories/repo-a/board?parent=1474`);
    await until(() => f.worker.spawned[0]!.requests.filter(request => request.kind === 'retain').length === 2);
    for (let poll = 0; poll < 3; poll++) expect((await fetch(`${server.url}/api/v1/repositories/repo-a/board?parent=1474`)).status).toBe(200);
    await f.tick(3000); expect(f.reads()).toBe(beforeFacts);
    await f.tick(30_000);
    expect((await seats()).seats[0]!.branch).toBe('feat/facts-cycle');

    f.rows([f.terminal('t4')]); f.emit('missed'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    expect((await seats()).seats.map(row => row.address)).toEqual(['t4']);
    f.streams[0]!.end(); await f.tick(1000);
    expect(f.streams).toHaveLength(2);
    expect((await fetch(path)).status).toBe(202);
    f.rows([]); f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    expect((await seats()).seats).toEqual([]);
    f.remove(); await f.tick(30_000);
    expect(f.streams[1]!.closed).toBe(true);
    expect((await fetch(path)).status).toBe(404);
  } finally { await observer.close(); await server.close(); }
});

test('failed snapshot and list reads recover on an owned retry without a stream event', async () => {
  for (const failedPort of ['snapshot', 'list'] as const) {
    const f = fixture();
    const original = f.ports[failedPort];
    let calls = 0;
    if (failedPort === 'snapshot') f.ports.snapshot = async (...args) => { if (++calls < 3) throw new Error('transient'); return (original as BoardObserverPorts['snapshot'])(...args); };
    else f.ports.list = async (...args) => { if (++calls < 3) throw new Error('transient'); return (original as BoardObserverPorts['list'])(...args); };
    const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
    try {
      await f.tick(0); f.emit('snapshot'); await f.tick(100);
      expect(observer.seats('repo-a').state).toBe('unavailable');
      expect(calls).toBe(1);
      await f.tick(999); expect(calls).toBe(1);
      await f.tick(1); expect(calls).toBe(2);
      await f.tick(1999); expect(calls).toBe(2);
      await f.tick(1); expect(calls).toBe(3);
      expect(observer.seats('repo-a').state).toBe('ready');
    } finally { await observer.close(); }
    const ended = calls; await f.tick(60_000); expect(calls).toBe(ended);
  }
});

test('a failed periodic refresh retains branch demand through a retry with unchanged terminal signatures', async () => {
  for (const failedPort of ['snapshot', 'list'] as const) {
    const f = fixture();
    let fail = false;
    if (failedPort === 'snapshot') {
      const original = f.ports.snapshot;
      f.ports.snapshot = async (...args) => { if (fail) { fail = false; throw new Error('transient'); } return original(...args); };
    } else {
      const original = f.ports.list;
      f.ports.list = async (...args) => { if (fail) { fail = false; throw new Error('transient'); } return original(...args); };
    }
    const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
    try {
      await f.tick(0); f.emit('snapshot'); await f.tick(100);
      expect(f.branches()).toBe(1);
      f.branch('feat/after-period'); fail = true;
      await f.tick(30_000);
      expect(observer.seats('repo-a').state).toBe('unavailable');
      expect(f.branches()).toBe(1);
      await f.tick(1000);
      const ready = observer.seats('repo-a');
      expect(ready.state).toBe('ready');
      expect(ready.state === 'ready' && ready.value.seats[0]!.branch).toBe('feat/after-period');
      expect(f.branches()).toBe(2);
      f.emit('event'); await f.tick(100);
      expect(f.branches()).toBe(2);
    } finally { await observer.close(); }
  }
});

test('an older successful branch read does not acknowledge a newer force-refresh request', async () => {
  const f = fixture();
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  try {
    await f.tick(0); f.emit('snapshot'); await f.tick(100);
    const original = f.ports.branch;
    let release!: () => void, hold = true;
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.ports.branch = async (...args) => { const value = await original(...args); if (hold) { hold = false; await gate; } return value; };
    f.branch('feat/first-period'); await f.tick(30_000);
    expect(f.branches()).toBe(2);
    f.branch('feat/newer-request'); f.emit('missed'); release(); await f.tick(100);
    const ready = observer.seats('repo-a');
    expect(ready.state === 'ready' && ready.value.seats[0]!.branch).toBe('feat/newer-request');
    expect(f.branches()).toBe(3);
  } finally { await observer.close(); }
});

test('a busy stream cannot bypass refresh backoff or queue an immediate read after a dirty failure', async () => {
  const f = fixture();
  const original = f.ports.list;
  const calls: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.ports.list = async (...args) => {
    calls.push(f.now());
    if (calls.length === 1) await gate;
    if (calls.length < 3) throw new Error('transient');
    return original(...args);
  };
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  try {
    await f.tick(0); const started = f.now();
    f.emit('snapshot'); await f.tick(100);
    f.emit('event'); release(); await f.tick(0);
    expect(observer.seats('repo-a').state).toBe('unavailable');
    for (let elapsed = 0; elapsed < 3000; elapsed += 50) { f.emit('event'); await f.tick(50); }
    expect(calls.map(at => at - started)).toEqual([100, 1100, 3100]);
    expect(observer.seats('repo-a').state).toBe('ready');
  } finally { await observer.close(); }
  const ended = calls.length; await f.tick(60_000); expect(calls).toHaveLength(ended);
});

test('a failed refresh and stream end keep independent reconnect and refresh retries', async () => {
  const f = fixture();
  const original = f.ports.list;
  let calls = 0;
  f.ports.list = async (...args) => { if (++calls === 1) throw new Error('transient'); return original(...args); };
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  try {
    await f.tick(0); f.emit('snapshot'); await f.tick(100);
    expect(observer.seats('repo-a').state).toBe('unavailable');
    f.streams[0]!.end(); await f.tick(1000);
    expect(f.streams).toHaveLength(2);
    f.emit('snapshot'); await f.tick(100);
    expect(observer.seats('repo-a').state).toBe('ready');
  } finally { await observer.close(); }
});

test('removal and close cancel both pending retry states and leave no timer or new child', async () => {
  for (const action of ['remove', 'close'] as const) {
    const f = fixture();
    let calls = 0;
    f.ports.list = async () => { calls++; throw new Error('offline'); };
    const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
    await f.tick(0);
    if (action === 'remove') await f.tick(29_000);
    f.emit('snapshot'); await f.tick(100);
    f.streams[0]!.end(); await f.tick(0);
    expect(calls).toBe(1);
    if (action === 'remove') { f.remove(); await f.tick(900); }
    await observer.close();
    expect(f.timers()).toBe(0);
    await f.tick(120_000);
    expect(calls).toBe(1); expect(f.streams).toHaveLength(1);
  }
});

test('identity failures back off to the facts interval and a missing remote is a typed unavailable result', async () => {
  const f = fixture();
  const calls: number[] = [];
  f.ports.identify = async () => { calls.push(f.now()); throw new Error('offline'); };
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  await f.tick(120_000);
  expect(calls.map(at => at - calls[0]!)).toEqual([0, 1000, 3000, 7000, 15000, 31000, 61000, 91000]);
  await observer.close(); await f.tick(60_000); expect(calls).toHaveLength(8);
  const missing = fixture(); missing.ports.identify = async () => null;
  const noRemote = startBoardObserver({ ports: missing.ports, clock: missing.clock });
  try {
    await missing.tick(0);
    expect(noRemote.seats('repo-a')).toEqual({ state: 'unavailable', reason: 'parents_github_failed', cause: 'github_remote_missing' });
    expect(missing.streams).toHaveLength(0);
  } finally { await noRemote.close(); }
});

test('repository removal and close abort a pending list and wait until that child has ended', async () => {
  for (const action of ['remove', 'close'] as const) {
    const f = fixture();
    let signal!: AbortSignal, release!: () => void, ended = false;
    f.ports.list = async (_labels, abort) => {
      signal = abort;
      await new Promise<void>(resolve => { release = resolve; });
      ended = true;
      return [];
    };
    const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
    await f.tick(0);
    if (action === 'remove') await f.tick(29_000);
    f.emit('snapshot'); await f.tick(100);
    expect(signal.aborted).toBe(false);
    let closed = false;
    let close: Promise<void> | null = null;
    if (action === 'remove') { f.remove(); await f.tick(900); }
    else { close = observer.close().then(() => { closed = true; }); await f.tick(0); }
    expect(signal.aborted).toBe(true);
    expect(ended).toBe(false); expect(closed).toBe(false);
    release(); await f.tick(0);
    await (close ?? observer.close());
    expect(ended).toBe(true);
    expect(f.streams[0]!.closed).toBe(true);
    const reads = f.reads(); await f.tick(60_000); expect(f.reads()).toBe(reads);
  }
});

test('a reconnect during a pending snapshot discards the old result, drains the new invalidation and closes with the server', async () => {
  const f = fixture();
  const server = await startOperatorServer({ port: 0, board_observer: { ports: f.ports, clock: f.clock } });
  try {
    await f.tick(0);
    let release!: () => void;
    f.gate(new Promise<void>(resolve => { release = resolve; }));
    f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    f.streams[0]!.end(); await f.tick(1000);
    f.rows([f.terminal('t9')]); f.emit('snapshot');
    f.gate(null); release(); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    const response = await fetch(`${server.url}/api/v1/repositories/repo-a/board/seats`);
    expect(decodeBoardSeats(await response.json()).seats.map(row => row.address)).toEqual(['t9']);
  } finally { await server.close(); }
  expect(f.streams.at(-1)!.closed).toBe(true);
});

test('board facts: an observed board answers from memory with no process, an unobserved parent is leased, and a blocked worker is killed at its deadline', async () => {
  const f = fixture();
  const home = mkdtempSync(join(tmpdir(), 'board-facts-'));
  const server = await startOperatorServer({ port: 0, env: { REPO_HARNESS_HOME: home }, board_observer: { ports: f.ports, clock: f.clock } });
  const path = (parent: number) => `${server.url}/api/v1/repositories/repo-a/board?parent=${parent}`;
  const code = async (response: Response) => [response.status, ((await response.json()) as { error: { code: string } }).error.code];
  const requests = () => f.worker.spawned.flatMap(worker => worker.requests);
  const cycles = () => requests().filter(request => request.kind === 'retain').length;
  const boards = (worker = 0) => f.worker.spawned[worker]!.requests.flatMap(request => request.kind === 'board' ? [request.parent] : []);
  const spawns = [spyOn(childProcess, 'spawn'), spyOn(childProcess, 'spawnSync'), spyOn(childProcess, 'execFile')];
  try {
    await until(() => cycles() === 1);
    await f.tick(0); f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    // The next cycle observes 1474: an open parent with a live seat.
    await f.tick(30_000); await until(() => cycles() === 2);
    expect(boards()).toEqual([1474]);
    const ready = await fetch(path(1474)), tag = ready.headers.get('etag')!;
    expect([ready.status, decodeBoard(await ready.json()).parent.number]).toEqual([200, 1474]);
    expect((await fetch(path(1474), { headers: { 'If-None-Match': tag } })).status).toBe(304);
    for (const spy of spawns) expect(spy).not.toHaveBeenCalled();
    // 1651 has no seat: the GET answers board_pending, and its lease starts the next cycle at once.
    await until(() => cycles() === 3);
    expect(await code(await fetch(path(1651)))).toEqual([503, 'board_pending']);
    await until(() => cycles() === 4);
    expect(boards().slice(-2)).toEqual([1651, 1474]);
    expect((await fetch(path(1651))).status).toBe(200);

    // The worker blocks on 1474. The server still answers, and the deadline kills the worker.
    const answer = (request: BoardWorkerRequest) => request.kind === 'board' && request.parent === 1474 ? null
      : request.kind === 'board' ? { ok: true as const, value: { ...board, parent: { ...board.parent, number: request.parent } } } : { ok: true as const, value: request.kind === 'parents' ? boardParents : null };
    f.worker.reply(answer);
    await f.tick(30_000); await until(() => boards().length === 5);
    expect((await fetch(path(1474))).status).toBe(200);
    expect(f.worker.spawned[0]!.killed).toBe(false);
    await f.tick(BOARD_FACTS_DEADLINE_MS);
    expect(f.worker.spawned[0]!.killed).toBe(true);
    expect(await code(await fetch(path(1474)))).toEqual([504, 'board_timeout']);
    // A new worker, with empty stores, reads the rest of the cycle; the next cycle reads 1474 again.
    await until(() => cycles() === 5);
    f.worker.reply(request => request.kind === 'board' ? { ok: true, value: { ...board, parent: { ...board.parent, number: request.parent } } } : answer(request));
    await f.tick(30_000); await until(() => cycles() === 6);
    expect(boards(1)).toEqual([1651, 1474, 1651]);
    expect((await fetch(path(1474))).status).toBe(200);
    for (const spy of spawns) expect(spy).not.toHaveBeenCalled();
  } finally {
    for (const spy of spawns) spy.mockRestore();
    await server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test('board facts: a low GitHub budget lengthens the gap between cycles', async () => {
  const f = fixture();
  f.worker.reply(request => request.kind === 'rate_limit' ? { ok: true, value: { remaining: 50, limit: 5000 } } : { ok: true, value: request.kind === 'parents' ? boardParents : null });
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  const cycles = () => f.worker.spawned[0]!.requests.filter(request => request.kind === 'retain').length;
  try {
    await until(() => f.worker.spawned.length === 1 && cycles() === 1);
    // 1 % of the budget remains: the 30 s gap grows to 30 s × 0.25 / 0.01 = 750 s.
    await f.tick(749_000); expect(cycles()).toBe(1);
    await f.tick(1_000); await until(() => cycles() === 2);
  } finally { await observer.close(); }
});

test('board facts: a worker that does not start leaves typed unavailable documents, the server keeps answering and the next cycle retries', async () => {
  const f = fixture();
  const spawn = f.ports.spawnWorker;
  let failures = 0;
  f.ports.spawnWorker = () => { failures++; throw new Error('spawn failed'); };
  const server = await startOperatorServer({ port: 0, board_observer: { ports: f.ports, clock: f.clock } });
  const parents = `${server.url}/api/v1/repositories/repo-a/board/parents`;
  const code = async (response: Response) => [response.status, ((await response.json()) as { error: { code: string } }).error.code];
  try {
    await until(() => failures >= 2);
    await f.tick(0);
    expect(await code(await fetch(parents))).toEqual([503, 'parents_unavailable']);
    f.ports.spawnWorker = spawn;
    await f.tick(30_000);
    await until(() => f.worker.spawned[0]?.requests.some(request => request.kind === 'retain') === true);
    expect((await fetch(parents)).status).toBe(200);
  } finally { await server.close(); }
});

test('board facts: each cycle removes the board documents and worker stores that it did not read', async () => {
  const f = fixture();
  const home = mkdtempSync(join(tmpdir(), 'board-retain-'));
  const server = await startOperatorServer({ port: 0, env: { REPO_HARNESS_HOME: home }, board_observer: { ports: f.ports, clock: f.clock } });
  const path = (parent: number) => `${server.url}/api/v1/repositories/repo-a/board?parent=${parent}`;
  const retains = () => f.worker.spawned[0]!.requests.flatMap(request => request.kind === 'retain' ? [request.keys] : []);
  try {
    await until(() => f.worker.spawned.length === 1 && retains().length === 1);
    await f.tick(0); f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    // A GET leases 1651, which has no seat, and starts a cycle that reads it with 1474.
    await fetch(path(1651));
    await until(() => retains().length === 2);
    expect(retains()[1]).toEqual(['repo-a#1474', 'repo-a#1651']);
    expect((await fetch(path(1651))).status).toBe(200);
    // The lease ends: the next cycle reads only 1474, retains only its store and drops the 1651 document.
    // Cycles keep running while the clock passes the lease; the cycle after the lease end retains only 1474.
    await f.tick(BOARD_LEASE_MS); await f.tick(30_000);
    await until(() => retains().at(-1)?.length === 1);
    expect(retains().at(-1)).toEqual(['repo-a#1474']);
    expect(((await (await fetch(path(1651))).json()) as { error: { code: string } }).error.code).toBe('board_pending');
  } finally { await server.close(); rmSync(home, { recursive: true, force: true }); }
  // The worker side of `retain`: only the listed stores stay.
  const stores = new Map([['repo-a#1474', createKeyedSources()], ['repo-a#1651', createKeyedSources()]]);
  expect(answerBoardWorkerRequest({ id: 7, kind: 'retain', keys: ['repo-a#1474'] }, stores, {} as never)).toEqual({ id: 7, ok: true, value: null });
  expect([...stores.keys()]).toEqual(['repo-a#1474']);
});

test('board facts: a failed registry read drops the documents of a repository that returns inside the long gap', async () => {
  const f = fixture();
  const home = mkdtempSync(join(tmpdir(), 'board-registry-failed-'));
  const server = await startOperatorServer({ port: 0, env: { REPO_HARNESS_HOME: home }, board_observer: { ports: f.ports, clock: f.clock } });
  const parents = `${server.url}/api/v1/repositories/repo-a/board/parents`;
  const code = async (response: Response) => [response.status, ((await response.json()) as { error: { code: string } }).error.code];
  const retains = () => f.worker.spawned[0]!.requests.filter(request => request.kind === 'retain').length;
  const repositories = f.ports.repositories;
  try {
    await until(() => f.worker.spawned.length === 1 && retains() === 1);
    // 1 % of the GitHub budget remains, so the facts cycle that serves repo-a is followed by a 750 s gap.
    f.worker.reply(request => request.kind === 'rate_limit' ? { ok: true, value: { remaining: 50, limit: 5000 } }
      : { ok: true, value: request.kind === 'parents' ? boardParents : null });
    await f.tick(30_000); await until(() => retains() === 2);
    expect((await fetch(parents)).status).toBe(200);
    // The registry read fails: the documents are dropped at once, as the cleared maps did on main.
    f.ports.repositories = () => { throw new Error('registry unreadable'); };
    await f.tick(30_000);
    expect(await code(await fetch(parents))).toEqual([503, 'registry_unavailable']);
    // The registry reads again inside the same gap: the id stays dropped, so its old document is not served again.
    f.ports.repositories = repositories;
    await f.tick(30_000);
    expect(retains()).toBe(2);
    expect(await code(await fetch(parents))).toEqual([503, 'parents_pending']);
  } finally { await server.close(); rmSync(home, { recursive: true, force: true }); }
});

test('board facts: a blocked board read mid-cycle serves the earlier document, and a parent no cycle read is pending', async () => {
  const f = fixture();
  const home = mkdtempSync(join(tmpdir(), 'board-midcycle-'));
  const server = await startOperatorServer({ port: 0, env: { REPO_HARNESS_HOME: home }, board_observer: { ports: f.ports, clock: f.clock } });
  const path = (parent: number) => `${server.url}/api/v1/repositories/repo-a/board?parent=${parent}`;
  const code = async (response: Response) => [response.status, ((await response.json()) as { error: { code: string } }).error.code];
  const cycles = () => f.worker.spawned.flatMap(worker => worker.requests).filter(request => request.kind === 'retain').length;
  const boardReads = () => f.worker.spawned[0]!.requests.filter(request => request.kind === 'board').length;
  try {
    await until(() => cycles() === 1);
    await f.tick(0); f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    await f.tick(30_000); await until(() => cycles() === 2);
    expect((await fetch(path(1474))).status).toBe(200);
    // The next cycle blocks on its board read, so the document of the earlier cycle is the one served.
    f.worker.reply(request => request.kind === 'board' ? null : { ok: true, value: request.kind === 'parents' ? boardParents : null });
    // Two settled cycles, then a cycle whose board read the worker never answers.
    await f.tick(30_000); await f.tick(30_000); await f.tick(30_000);
    await until(() => boardReads() === 3);
    const during = await fetch(path(1474));
    expect([during.status, decodeBoard(await during.json()).parent.number]).toEqual([200, 1474]);
    // A parent that no cycle has read is pending, not a document with no value.
    expect(await code(await fetch(path(9999)))).toEqual([503, 'board_pending']);
  } finally { await server.close(); rmSync(home, { recursive: true, force: true }); }
});

test('board facts: a repository that the registry cycle removes during a long gap stops serving its documents before the next facts cycle', async () => {
  const f = fixture();
  const home = mkdtempSync(join(tmpdir(), 'board-removal-'));
  const server = await startOperatorServer({ port: 0, env: { REPO_HARNESS_HOME: home }, board_observer: { ports: f.ports, clock: f.clock } });
  const path = `${server.url}/api/v1/repositories/repo-a/board?parent=1474`, parents = `${server.url}/api/v1/repositories/repo-a/board/parents`;
  const code = async (response: Response) => [response.status, ((await response.json()) as { error: { code: string } }).error.code];
  const retains = () => f.worker.spawned[0]!.requests.filter(request => request.kind === 'retain').length;
  try {
    await until(() => f.worker.spawned.length === 1 && retains() === 1);
    await f.tick(0); f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    // 1 % of the GitHub budget remains: the cycle that the lease starts reads 1474, then waits 750 s.
    f.worker.reply(request => request.kind === 'rate_limit' ? { ok: true, value: { remaining: 50, limit: 5000 } }
      : request.kind === 'board' ? { ok: true, value: board } : { ok: true, value: request.kind === 'parents' ? boardParents : null });
    await fetch(path);
    await until(() => retains() === 2);
    expect([(await fetch(path)).status, (await fetch(parents)).status]).toEqual([200, 200]);
    f.remove();
    await f.tick(30_000);
    expect(retains()).toBe(2);
    expect(await code(await fetch(path))).toEqual([404, 'repository_not_found']);
    expect(await code(await fetch(parents))).toEqual([404, 'repository_not_found']);
    // The repository returns inside the same 750 s gap: no facts cycle has read it again, so its documents stay dropped
    // and each route answers its pending code, as the deleted maps did on main, instead of the document from before.
    f.register();
    await f.tick(30_000);
    expect(retains()).toBe(2);
    expect(await code(await fetch(path))).toEqual([503, 'board_pending']);
    expect(await code(await fetch(parents))).toEqual([503, 'parents_pending']);
    // The next facts cycle reads the parent list again, so the dropped id leaves the dropped set.
    await f.tick(750_000); await until(() => retains() === 3);
    expect((await fetch(parents)).status).toBe(200);
    // A board is read only for a parent with a live seat, so the restarted child reads its snapshot first.
    f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    await f.tick(750_000); await until(() => retains() === 4);
    expect((await fetch(path)).status).toBe(200);
  } finally { await server.close(); rmSync(home, { recursive: true, force: true }); }
});
