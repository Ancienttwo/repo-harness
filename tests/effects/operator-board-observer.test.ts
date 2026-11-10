import { expect, test } from 'bun:test';
import { BOARD_SEATS_DEBOUNCE_MS, startBoardObserver, type BoardObserverOptions, type BoardObserverPorts } from '../../src/effects/operator/board-observer';
import { startOperatorServer } from '../../src/effects/operator/server';
import { RH_LABEL, type HcStreamItem, type HcTerminal } from '../../src/effects/terminal/herdr-core';
import { decodeBoardSeats } from '../../src/core/board/parents';
import { decodeBoard } from '../../src/core/board/board';
import board from '../../src/operator-web/fixtures/board-1474.json';

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
  const ports: BoardObserverPorts = {
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
  return { ports, clock, terminal, tick, emit, streams, now: () => now, reads: () => reads, branches: () => branches, timers: () => timers.size,
    rows(value: readonly HcTerminal[]) { rows = value; }, branch(value: string) { branch = value; }, remove() { registered = false; }, gate(value: Promise<void> | null) { snapshotGate = value; } };
}

test('seats observer debounces snapshots, events and missed snapshots, reconnects and serves cached documents within one poll', async () => {
  const f = fixture();
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  const server = await startOperatorServer({ port: 0, read_board_seats: observer.read, read_board: async () => decodeBoard(board) });
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
      expect(observer.read('repo-a').state).toBe('unavailable');
      expect(calls).toBe(1);
      await f.tick(999); expect(calls).toBe(1);
      await f.tick(1); expect(calls).toBe(2);
      await f.tick(1999); expect(calls).toBe(2);
      await f.tick(1); expect(calls).toBe(3);
      expect(observer.read('repo-a').state).toBe('ready');
    } finally { await observer.close(); }
    const ended = calls; await f.tick(60_000); expect(calls).toBe(ended);
  }
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
    expect(observer.read('repo-a').state).toBe('unavailable');
    for (let elapsed = 0; elapsed < 3000; elapsed += 50) { f.emit('event'); await f.tick(50); }
    expect(calls.map(at => at - started)).toEqual([100, 1100, 3100]);
    expect(observer.read('repo-a').state).toBe('ready');
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
    expect(observer.read('repo-a').state).toBe('unavailable');
    f.streams[0]!.end(); await f.tick(1000);
    expect(f.streams).toHaveLength(2);
    f.emit('snapshot'); await f.tick(100);
    expect(observer.read('repo-a').state).toBe('ready');
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
    expect(noRemote.read('repo-a')).toEqual({ state: 'unavailable', reason: 'parents_github_failed', cause: 'github_remote_missing' });
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
