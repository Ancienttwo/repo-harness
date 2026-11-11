// One observation loop for the resident collectors (#2216). A collector reads an
// authority in a cycle; this module keeps the value with its observation time,
// and a GET reads that state, so a read starts no work. The loop copies the
// shape the board observer proved (#2165): one cycle in flight, the next one
// only after the previous one settles, and a close that aborts the running read
// and waits for it. The loop owns the gap timer, so a consumer that injects a
// clock also injects the timers of its retries and tests. A consumer with a
// demand inside the gap starts the next cycle at once through `wake`, unless a
// `wakeable_gap` rule refuses a gap that the last cycle lengthened on purpose.
//
// The states are `pending` (no cycle has published a value), `observed` (a value
// and the time the loop published it) and `unavailable` (why the last cycle
// found nothing to publish). A collector passes its cycle and its keep rule, so
// the result of a failed cycle is one defined choice per consumer.

export type ObservationState<T, F extends string> =
  | { readonly state: 'pending' }
  | { readonly state: 'observed'; readonly value: T; readonly observed_at: string }
  | { readonly state: 'unavailable'; readonly reason: F };

/**
 * What a failed cycle does to the older value. `observed_at` defaults to the
 * loop clock; a rule that keeps an older value passes that value's own time, so
 * a stale value shows the time it was read.
 */
export type ObservationKeepResult<T, F extends string> =
  | { readonly state: 'observed'; readonly value: T; readonly observed_at?: string }
  | { readonly state: 'unavailable'; readonly reason: F };

/** What a failed cycle does to the older value. Each consumer passes its own. */
export type ObservationKeep<T, F extends string> = (previous: ObservationState<T, F>, reason: F) => ObservationKeepResult<T, F>;

/** A failed cycle replaces the older value: no stale value is served as current. */
export const replaceObservation = <T, F extends string>(_previous: ObservationState<T, F>, reason: F): ObservationKeepResult<T, F> =>
  ({ state: 'unavailable', reason });

/** A failed cycle keeps the older value at its observation time; with no older value it publishes the reason. */
export const keepObservation = <T, F extends string>(previous: ObservationState<T, F>, reason: F): ObservationKeepResult<T, F> =>
  (previous.state === 'observed' ? { state: 'observed', value: previous.value, observed_at: previous.observed_at } : { state: 'unavailable', reason });

/** What one cycle found: a value, or the reason it found none. */
export type ObservationCycleResult<T, F extends string> =
  | { readonly state: 'observed'; readonly value: T }
  | { readonly state: 'unavailable'; readonly reason: F };

export interface ObservationCycleContext<T, F extends string> {
  /** Aborted by `close`; a cycle passes it to every process or request it starts. */
  readonly signal: AbortSignal;
  /** The state before this cycle starts, for a cycle that refines the older value. */
  readonly previous: ObservationState<T, F>;
  /** Publishes a value before the cycle settles, so a repository is served when its read returns. */
  publish(value: T): void;
  /** Publishes what a failed read does to the older value, so a slow later step does not delay it. */
  publishFailure(reason: F): void;
}

/** The clock of a loop: the observation time of a published value and the gap timer after a settled cycle. */
export interface ObservationClock {
  now(): Date;
  /** The gap timer. The default is the global timer. */
  setTimeout?(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout?(handle: ReturnType<typeof setTimeout>): void;
}

export interface ObservationLoopOptions<T, F extends string> {
  readonly cycle: (context: ObservationCycleContext<T, F>) => Promise<ObservationCycleResult<T, F>>;
  /** What a failed cycle does to the older value. */
  readonly keep: ObservationKeep<T, F>;
  /** The reason a cycle that throws names. */
  readonly failure: F;
  /** The gap after a settled cycle; a function reads the value that the last cycle chose. */
  readonly interval_ms: number | (() => number);
  /** The first cycle starts when this settles. */
  readonly first_cycle_after?: Promise<void>;
  /**
   * A demand inside the gap may start the next cycle at once. It cannot shorten a
   * gap that the last cycle lengthened on purpose, such as a low upstream budget.
   */
  readonly wakeable_gap?: (gap_ms: number) => boolean;
  readonly clock?: ObservationClock;
}

export interface ObservationLoop<T, F extends string> {
  /** The published state. Never starts work. */
  readonly read: () => ObservationState<T, F>;
  /** Resolves when the cycle in flight, if any, has settled. */
  readonly settled: () => Promise<void>;
  /** Starts the cycle of the pending gap at once, unless `wakeable_gap` refuses that gap. */
  readonly wake: () => void;
  readonly close: () => Promise<void>;
}

/** Collect at start, or once `first_cycle_after` settles, then after each settled cycle. Cycles never overlap. */
export function startObservationLoop<T, F extends string>(options: ObservationLoopOptions<T, F>): ObservationLoop<T, F> {
  const clock: ObservationClock = options.clock ?? { now: () => new Date() };
  const setTimer = clock.setTimeout ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = clock.clearTimeout ?? ((handle: ReturnType<typeof setTimeout>) => clearTimeout(handle));
  const control = new AbortController();
  const gap = () => (typeof options.interval_ms === 'function' ? options.interval_ms() : options.interval_ms);
  let state: ObservationState<T, F> = { state: 'pending' };
  let generation = 0;
  let closed = false;
  let closing: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timer_gap_ms = 0;
  let inflight: Promise<void> | null = null;

  const observed = (value: T, at?: string): ObservationState<T, F> => ({ state: 'observed', value, observed_at: at ?? clock.now().toISOString() });
  const settle = (result: ObservationKeepResult<T, F>): ObservationState<T, F> =>
    result.state === 'observed' ? observed(result.value, 'observed_at' in result ? result.observed_at : undefined) : { state: 'unavailable', reason: result.reason };

  const cycle = (): Promise<void> => {
    const mine = ++generation;
    const previous = state;
    const current = () => !closed && mine === generation;
    const context: ObservationCycleContext<T, F> = {
      signal: control.signal,
      previous,
      publish: (value: T) => { if (current()) state = observed(value); },
      publishFailure: (reason: F) => { if (current()) state = settle(options.keep(previous, reason)); },
    };
    const work = (async () => {
      try {
        const result = await options.cycle(context);
        if (!current()) return;
        // A cycle that found no value applies the same keep rule as a cycle that threw.
        state = settle(result.state === 'observed' ? result : options.keep(previous, result.reason));
      } catch {
        // A cycle that throws applies its keep rule; the server stays up and the next cycle retries.
        if (current()) state = settle(options.keep(previous, options.failure));
      }
    })().then(() => {
      inflight = null;
      if (closed) return;
      timer_gap_ms = gap();
      timer = setTimer(() => { timer = undefined; void cycle(); }, timer_gap_ms);
      timer.unref?.();
    });
    inflight = work;
    return work;
  };

  if (options.first_cycle_after === undefined) void cycle();
  else inflight = options.first_cycle_after.then(() => (closed ? undefined : cycle()));

  return Object.freeze({
    read: () => state,
    settled: () => inflight ?? Promise.resolve(),
    wake: () => {
      // A cycle in flight starts the next one after it settles; a lengthened gap stays.
      if (closed || timer === undefined) return;
      if (options.wakeable_gap !== undefined && !options.wakeable_gap(timer_gap_ms)) return;
      clearTimer(timer);
      timer = undefined;
      void cycle();
    },
    close: () => {
      if (closing !== null) return closing;
      closed = true;
      if (timer !== undefined) { clearTimer(timer); timer = undefined; }
      control.abort();
      closing = (async () => { await inflight; })();
      return closing;
    },
  });
}

/**
 * The published value of a collector that reads every registered repository.
 * `registry: 'failed'` means no repository is readable, and every read then
 * reports `registry_unavailable`. `complete` is false while a cycle publishes
 * its repositories one by one, so a repository that the map does not name yet is
 * pending, not missing.
 */
export type RepositoryObservation<V> =
  | { readonly registry: 'failed' }
  | { readonly registry: 'ok'; readonly repositories: ReadonlyMap<string, V>; readonly complete: boolean };

/**
 * The one-repository read of a repository observation. `pending` is served before
 * the first cycle; a repository that a complete cycle does not name is
 * `repository_not_found`.
 */
export function readRepository<V, F extends string>(
  state: ObservationState<RepositoryObservation<V>, F>, repositoryId: string, pending: F,
): { readonly value: V } | { readonly reason: F | 'repository_not_found' | 'registry_unavailable' } {
  if (state.state === 'pending') return { reason: pending };
  if (state.state === 'unavailable') return { reason: state.reason };
  const published = state.value;
  if (published.registry === 'failed') return { reason: 'registry_unavailable' };
  const value = published.repositories.get(repositoryId);
  if (value !== undefined) return { value };
  return { reason: published.complete ? 'repository_not_found' : pending };
}
