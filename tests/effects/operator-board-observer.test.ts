import { expect, test } from 'bun:test';
import { BOARD_SEATS_DEBOUNCE_MS, startBoardObserver, type BoardObserverOptions, type BoardObserverPorts } from '../../src/effects/operator/board-observer';
import { startOperatorServer } from '../../src/effects/operator/server';
import { RH_LABEL, type HcStreamItem, type HcTerminal } from '../../src/effects/terminal/herdr-core';
import { decodeBoardParents, decodeBoardSeats } from '../../src/core/board/parents';
import parents from '../../src/operator-web/fixtures/board-parents.json';

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
  return { ports, clock, terminal, tick, emit, streams, now: () => now, reads: () => reads, branches: () => branches,
    rows(value: readonly HcTerminal[]) { rows = value; }, branch(value: string) { branch = value; }, remove() { registered = false; }, gate(value: Promise<void> | null) { snapshotGate = value; } };
}

test('seats observer debounces snapshots, events and missed snapshots, reconnects and serves cached documents within one poll', async () => {
  const f = fixture();
  const observer = startBoardObserver({ ports: f.ports, clock: f.clock });
  const server = await startOperatorServer({ port: 0, read_board_seats: observer.read });
  const path = `${server.url}/api/v1/repositories/repo-a/board/seats`;
  const seats = async () => decodeBoardSeats(await (await fetch(path)).json());
  try {
    expect((await fetch(path)).status).toBe(503);
    await f.tick(0); expect(f.streams).toHaveLength(1);
    f.rows([f.terminal('t1'), f.terminal('t2', { state: 'finished' }), f.terminal('t3', { labels: { [RH_LABEL.repository]: '1186405141', [RH_LABEL.service]: 'attention', [RH_LABEL.seat]: 'worker' } })]);
    f.emit('snapshot');
    await f.tick(BOARD_SEATS_DEBOUNCE_MS - 1); expect(f.reads()).toBe(0);
    await f.tick(1);
    const first = await seats();
    expect(first.seats.map(row => [row.address, row.agent, row.branch, row.status])).toEqual([['t1', 'hc-agent', 'feat/one', 'working']]);
    expect(first.observed_at).toBe(new Date(f.now()).toISOString());
    expect(observer.parents('repo-a', decodeBoardParents(parents))?.active_parent).toBe(1474);
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
    f.branch('feat/facts-cycle'); observer.refreshBranches('repo-a'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    expect((await seats()).seats[0]!.branch).toBe('feat/facts-cycle');

    f.rows([f.terminal('t4')]); f.emit('missed'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    expect((await seats()).seats.map(row => row.address)).toEqual(['t4']);
    f.streams[0]!.end(); await f.tick(1000);
    expect(f.streams).toHaveLength(2);
    expect((await fetch(path)).status).toBe(503);
    f.rows([]); f.emit('snapshot'); await f.tick(BOARD_SEATS_DEBOUNCE_MS);
    expect((await seats()).seats).toEqual([]);
    f.remove(); await f.tick(30_000);
    expect(f.streams[1]!.closed).toBe(true);
    expect((await fetch(path)).status).toBe(404);
  } finally { await observer.close(); await server.close(); }
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
