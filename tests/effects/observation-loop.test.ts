import { describe, expect, test } from 'bun:test';

import {
  keepObservation,
  readRepository,
  replaceObservation,
  startObservationLoop,
} from '../../src/effects/observation-loop';

type Reason = 'cycle_failed' | 'pending';

describe('observation loop', () => {
  test('serves pending, then the value with the time the loop published it', async () => {
    const clock = { now: () => new Date('2026-11-10T00:00:00.000Z') };
    let resolve!: () => void;
    const loop = startObservationLoop<number, Reason>({
      cycle: () => new Promise((settle) => { resolve = () => settle({ state: 'observed', value: 7 }); }),
      keep: replaceObservation, failure: 'cycle_failed', interval_ms: 60_000, clock,
    });
    try {
      expect(loop.read()).toEqual({ state: 'pending' });
      resolve();
      await loop.settled();
      expect(loop.read()).toEqual({ state: 'observed', value: 7, observed_at: '2026-11-10T00:00:00.000Z' });
    } finally { await loop.close(); }
  });

  test('the keep rule is the parameter: one loop replaces a failed value, another keeps it at its own time', async () => {
    // A moving clock: a kept value must show the time of its own read, not the time of the failed cycle.
    let tick = 0;
    const movingClock = { now: () => new Date(Date.parse('2026-11-10T00:00:00.000Z') + 60_000 * tick++) };
    for (const [keep, expected] of [
      [replaceObservation, { state: 'unavailable', reason: 'cycle_failed' }],
      [keepObservation, { state: 'observed', value: 1, observed_at: '2026-11-10T00:00:00.000Z' }],
    ] as const) {
      tick = 0;
      let attempt = 0;
      const loop = startObservationLoop<number, Reason>({
        cycle: async () => (++attempt === 1 ? { state: 'observed', value: 1 } : { state: 'unavailable', reason: 'cycle_failed' }),
        keep, failure: 'cycle_failed', interval_ms: 1, clock: movingClock,
      });
      try {
        await loop.settled();
        expect(loop.read()).toEqual({ state: 'observed', value: 1, observed_at: '2026-11-10T00:00:00.000Z' });
        for (let tries = 0; tries < 200 && attempt < 2; tries++) { await Bun.sleep(5); await loop.settled(); }
        expect(attempt).toBeGreaterThan(1);
        await loop.settled();
        // The kept value keeps its first observation time while the loop clock has moved on.
        expect(loop.read()).toEqual(expected);
        expect(movingClock.now().toISOString()).not.toBe('2026-11-10T00:00:00.000Z');
      } finally { await loop.close(); }
    }
  });

  test('a cycle that throws publishes the loop failure reason through the same keep rule', async () => {
    const loop = startObservationLoop<number, Reason>({
      cycle: async () => { throw new Error('spawn failed'); },
      keep: keepObservation, failure: 'cycle_failed', interval_ms: 60_000,
    });
    try {
      await loop.settled();
      expect(loop.read()).toEqual({ state: 'unavailable', reason: 'cycle_failed' });
    } finally { await loop.close(); }
  });

  test('cycles never overlap, and close aborts the cycle in flight and starts no later one', async () => {
    let active = 0, peak = 0, runs = 0;
    let abort: (() => void) | null = null;
    const loop = startObservationLoop<number, Reason>({
      cycle: async ({ signal }) => {
        runs++; active++; peak = Math.max(peak, active);
        await new Promise<void>((settle) => { abort = settle; signal.addEventListener('abort', () => settle(), { once: true }); });
        active--;
        return { state: 'observed', value: runs };
      },
      keep: replaceObservation, failure: 'cycle_failed', interval_ms: 1,
    });
    for (let tries = 0; tries < 200 && abort === null; tries++) await Bun.sleep(5);
    expect(runs).toBe(1);
    const closed = loop.close();
    await closed;
    expect(loop.read()).toEqual({ state: 'pending' });
    await Bun.sleep(30);
    expect([runs, peak]).toEqual([1, 1]);
  });

  test('the first cycle waits for first_cycle_after; a publish mid-cycle serves one entry before the cycle ends', async () => {
    let releaseCycle!: () => void;
    const cycleGate = new Promise<void>((resolve) => { releaseCycle = resolve; });
    let releaseFirst!: () => void;
    const firstCycle = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const loop = startObservationLoop<string, Reason>({
      cycle: async ({ publish }) => {
        publish('first');
        // The cycle still runs here, so a reader sees the mid-cycle value, not the result.
        await cycleGate;
        return { state: 'observed', value: 'second' };
      },
      keep: replaceObservation, failure: 'cycle_failed', interval_ms: 60_000, first_cycle_after: firstCycle,
    });
    try {
      await Bun.sleep(20);
      expect(loop.read()).toEqual({ state: 'pending' });
      releaseFirst();
      for (let tries = 0; tries < 200 && loop.read().state !== 'observed'; tries++) await Bun.sleep(5);
      expect(loop.read()).toMatchObject({ state: 'observed', value: 'first' });
      releaseCycle();
      await loop.settled();
      expect(loop.read()).toMatchObject({ state: 'observed', value: 'second' });
    } finally { await loop.close(); }
  });

  test('the injected clock owns the gap timer, and a demand starts the next cycle at once unless the gap is long', async () => {
    // The clock of this test owns the timers, so a demand inside the gap is visible without a real sleep.
    const timers = new Map<number, () => void>();
    let nextTimer = 0;
    const clock = {
      now: () => new Date('2026-11-10T00:00:00.000Z'),
      setTimeout(run: () => void) { const key = ++nextTimer; timers.set(key, run); return key as unknown as ReturnType<typeof setTimeout>; },
      clearTimeout(handle: ReturnType<typeof setTimeout>) { timers.delete(handle as unknown as number); },
    };
    let runs = 0, gapMs = 0;
    const loop = startObservationLoop<number, Reason>({
      cycle: async () => ({ state: 'observed', value: ++runs }),
      keep: replaceObservation, failure: 'cycle_failed', interval_ms: () => gapMs,
      // A gap that the last cycle lengthened on purpose, as a low upstream budget does, stays.
      wakeable_gap: ms => ms <= 1000,
      clock,
    });
    try {
      await loop.settled();
      expect([runs, timers.size]).toEqual([1, 1]);
      loop.wake();
      expect(timers.size).toBe(0);
      await loop.settled();
      expect(runs).toBe(2);
      // A gap that a low budget lengthened stays: the next demand waits for the gap.
      gapMs = 600_000;
      loop.wake();
      await loop.settled();
      expect([runs, timers.size]).toEqual([3, 1]);
      loop.wake();
      expect([runs, timers.size]).toEqual([3, 1]);
    } finally { await loop.close(); }
    expect(timers.size).toBe(0);
  });

  test('a repository read serves pending before the first cycle and repository_not_found only after a complete one', () => {
    expect(readRepository({ state: 'pending' }, 'repo-a', 'pending')).toEqual({ reason: 'pending' });
    const partial = { state: 'observed' as const, observed_at: '2026-11-10T00:00:00.000Z',
      value: { registry: 'ok' as const, repositories: new Map([['repo-a', 1]]), complete: false } };
    expect(readRepository(partial, 'repo-b', 'pending')).toEqual({ reason: 'pending' });
    expect(readRepository({ ...partial, value: { ...partial.value, complete: true } }, 'repo-b', 'pending')).toEqual({ reason: 'repository_not_found' });
    expect(readRepository({ ...partial, value: { registry: 'failed' } }, 'repo-a', 'pending')).toEqual({ reason: 'registry_unavailable' });
    expect(readRepository(partial, 'repo-a', 'pending')).toEqual({ value: 1 });
  });
});
