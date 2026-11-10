import { projectBoardSeats, type BoardSeatsV1 } from '../../core/board/parents';
import type { BoardSeatTerminalInputV1 } from '../../core/board/board';
import { githubRemoteRepository } from '../../core/board/source';
import { readLocalRepositoryIdAsync } from '../board/collect';
import { gitExecFile, withoutRepositorySelectingGitEnv } from '../git/runner';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { boardSeatTerminals, hcEvents, hcListAsync, RH_LABEL, type HcEventStream, type HcLabels, type HcListTerminal, type HcStreamItem } from '../terminal/herdr-core';
import { readHcSnapshot, type HcSnapshot } from './herdr-runtime-transport';

export const BOARD_SEATS_DEBOUNCE_MS = 100;
const RETRY_MIN_MS = 1000;
const FACTS_INTERVAL_MS = 30_000;

type Repository = { readonly id: string; readonly path: string };
export type BoardSeatsCache =
  | { readonly state: 'pending' }
  | { readonly state: 'unavailable'; readonly reason: 'registry_unavailable' | 'repository_not_found' | 'parents_github_failed' | 'parents_hc_failed'; readonly cause?: 'github_remote_missing' }
  | { readonly state: 'ready'; readonly value: BoardSeatsV1 };

export interface BoardObserverPorts {
  repositories(): readonly Repository[];
  identify(repository: Repository, signal: AbortSignal): Promise<string | null>;
  subscribe(labels: HcLabels, onItem: (item: HcStreamItem) => void, signal: AbortSignal): HcEventStream;
  snapshot(labels: HcLabels, signal: AbortSignal): Promise<HcSnapshot>;
  list(labels: HcLabels, signal: AbortSignal): Promise<readonly HcListTerminal[]>;
  branch(cwd: string | null, signal: AbortSignal): Promise<string | null>;
}

export interface BoardObserverOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly ports?: BoardObserverPorts;
  readonly clock?: {
    now(): Date;
    setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
    clearTimeout(timer: ReturnType<typeof setTimeout>): void;
  };
}

function observerPorts(env: NodeJS.ProcessEnv): BoardObserverPorts {
  const childEnv = withoutRepositorySelectingGitEnv(env);
  delete childEnv.GH_REPO;
  return {
    repositories: () => readRepoHarnessRegistryStrictSnapshot({ env }).repos,
    async identify(repository, signal) {
      const id = await readLocalRepositoryIdAsync({ repo_root: repository.path, env: childEnv, signal }, url => githubRemoteRepository(url) !== null);
      return id === null ? null : String(id);
    },
    subscribe: (labels, onItem, signal) => hcEvents(labels, onItem, { env, signal }),
    snapshot: (labels, signal) => readHcSnapshot(labels, env, signal),
    list: (labels, signal) => hcListAsync(labels, { env, signal }),
    async branch(cwd, signal) {
      if (cwd === null) return null;
      try { return (await gitExecFile(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, env: childEnv, signal, timeout: 10_000 })).trim() || null; }
      catch (error) { if (signal.aborted) throw error; return null; }
    },
  };
}

type CancelTimer = () => void;
interface RetryState { timer: CancelTimer | null; delay: number }
interface RepositoryState {
  readonly repository: Repository;
  readonly abort: AbortController;
  readonly work: Set<Promise<void>>;
  cache: BoardSeatsCache;
  labels: HcLabels | null;
  stream: HcEventStream | null;
  generation: number;
  seq: number;
  connected: boolean;
  readonly refreshRetry: RetryState;
  readonly connectRetry: RetryState;
  debounce: CancelTimer | null;
  pending: Promise<void> | null;
  request: AbortController | null;
  identifying: boolean;
  stopping: Promise<void> | null;
  dirty: boolean;
  allBranches: boolean;
  terminals: Map<string, { readonly signature: string; readonly value: BoardSeatTerminalInputV1 }>;
}

/** Cancel siblings on a failed read, then wait until every child has ended. */
async function ownedReads<T extends readonly Promise<unknown>[]>(reads: T, abort: AbortController): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  try { return await Promise.all(reads); }
  catch (error) { abort.abort(); await Promise.allSettled(reads); throw error; }
}

/** Each repository owns its children and timers. Removal and close drain that owner. */
export function startBoardObserver(options: BoardObserverOptions = {}) {
  const ports = options.ports ?? observerPorts({ ...process.env, ...options.env });
  const clock: NonNullable<BoardObserverOptions['clock']> = options.clock ?? { now: () => new Date(), setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: handle => clearTimeout(handle) };
  const observer = new AbortController();
  const states = new Map<string, RepositoryState>();
  let registryFailed = false;
  let registryWork: Promise<void> | null = null;
  let closeWork: Promise<void> | null = null;

  function timer(signal: AbortSignal, callback: () => void, ms: number): CancelTimer {
    let handle: ReturnType<typeof setTimeout>;
    const cancel = () => { clock.clearTimeout(handle); signal.removeEventListener('abort', cancel); };
    handle = clock.setTimeout(() => { cancel(); if (!signal.aborted) callback(); }, ms);
    handle.unref?.();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    return cancel;
  }
  const track = (state: RepositoryState, work: Promise<void>) => {
    state.work.add(work); void work.finally(() => state.work.delete(work));
  };
  const active = (state: RepositoryState) => !observer.signal.aborted && !state.abort.signal.aborted;
  const current = (state: RepositoryState, generation: number) => active(state) && generation === state.generation;
  function retry(state: RepositoryState, slot: RetryState, run: () => void) {
    if (!active(state) || slot.timer !== null) return;
    slot.timer = timer(state.abort.signal, () => { slot.timer = null; run(); }, slot.delay);
    slot.delay = Math.min(slot.delay * 2, FACTS_INTERVAL_MS);
  }
  function schedule(state: RepositoryState, allBranches = false) {
    state.dirty = true; state.allBranches ||= allBranches;
    if (!active(state) || !state.connected || state.refreshRetry.timer !== null || state.debounce !== null || state.pending !== null) return;
    state.debounce = timer(state.abort.signal, () => { state.debounce = null; refresh(state); }, BOARD_SEATS_DEBOUNCE_MS);
  }
  function refresh(state: RepositoryState) {
    if (!active(state) || !state.connected || state.labels === null || state.pending !== null || state.refreshRetry.timer !== null) return;
    const generation = state.generation, labels = state.labels, allBranches = state.allBranches;
    state.dirty = false; state.allBranches = false;
    const request = new AbortController();
    state.request = request;
    const signal = AbortSignal.any([state.abort.signal, request.signal]);
    const deadline = timer(state.abort.signal, () => request.abort(), 10_000);
    const work = (async () => {
      try {
        const snapshotRead = ports.snapshot(labels, signal).then(value => ({ ...value, observedAt: clock.now().toISOString() }));
        const listRead = ports.list(labels, signal);
        await ownedReads([snapshotRead, listRead], request);
        const snapshot = await snapshotRead, listed = await listRead;
        const agents = new Map(listed.filter(terminal => terminal.state === 'live').map(terminal => [terminal.address, terminal.agent]));
        const rows = boardSeatTerminals(snapshot.terminals.filter(terminal => terminal.state === 'live'
          && terminal.labels[RH_LABEL.repository] === labels[RH_LABEL.repository] && agents.has(terminal.address))
          .map(terminal => ({ ...terminal, agent: agents.get(terminal.address)! }))).filter(terminal => terminal.labels.seat !== undefined);
        const observations = await ownedReads(rows.map(async ({ cwd, ...terminal }) => {
          const signature = JSON.stringify({ cwd, ...terminal });
          const previous = state.terminals.get(terminal.address);
          const value = !allBranches && previous?.signature === signature ? previous.value
            : { ...terminal, branch: await ports.branch(cwd, signal) };
          return { signature, value };
        }), request);
        if (!current(state, generation)) return;
        state.terminals = new Map(observations.map(observation => [observation.value.address, observation]));
        state.cache = { state: 'ready', value: projectBoardSeats(labels[RH_LABEL.repository]!, snapshot.observedAt, observations.map(observation => observation.value)) };
        state.refreshRetry.delay = RETRY_MIN_MS;
      } catch {
        if (current(state, generation)) {
          state.cache = { state: 'unavailable', reason: 'parents_hc_failed' };
          state.dirty = true;
          retry(state, state.refreshRetry, () => refresh(state));
        }
      }
    })().finally(() => {
      deadline(); request.abort(); state.request = null; state.pending = null;
      if (active(state) && state.dirty) schedule(state);
    });
    state.pending = work; track(state, work);
  }
  function connect(state: RepositoryState) {
    if (!active(state)) return;
    const generation = ++state.generation;
    state.seq = -1; state.connected = false;
    const lost = () => {
      if (!current(state, generation)) return;
      state.generation++; state.connected = false; state.stream = null;
      state.request?.abort();
      state.debounce?.(); state.debounce = null;
      state.cache = { state: 'pending' }; state.dirty = true;
      retry(state, state.connectRetry, () => connect(state));
    };
    try {
      const stream = ports.subscribe(state.labels!, item => {
        if (!current(state, generation) || item.seq <= state.seq) return;
        state.seq = item.seq;
        if (!state.connected) state.connectRetry.delay = RETRY_MIN_MS;
        state.connected = true;
        schedule(state, item.type !== 'event');
      }, state.abort.signal);
      state.stream = stream;
      track(state, stream.done.then(lost, lost));
    } catch { lost(); }
  }
  function identify(state: RepositoryState) {
    if (!active(state) || state.identifying) return;
    state.identifying = true;
    const work = (async () => {
      try {
        const id = await ports.identify(state.repository, state.abort.signal);
        if (!active(state)) return;
        if (id === null) { state.cache = { state: 'unavailable', reason: 'parents_github_failed', cause: 'github_remote_missing' }; return; }
        state.labels = { [RH_LABEL.repository]: id }; connect(state);
      } catch {
        if (!active(state)) return;
        state.cache = { state: 'unavailable', reason: 'parents_github_failed' };
        retry(state, state.connectRetry, () => identify(state));
      }
    })().finally(() => { state.identifying = false; });
    track(state, work);
  }
  function start(repository: Repository) {
    const state: RepositoryState = { repository, abort: new AbortController(), work: new Set(), cache: { state: 'pending' }, labels: null,
      stream: null, generation: 0, seq: -1, connected: false,
      refreshRetry: { timer: null, delay: RETRY_MIN_MS }, connectRetry: { timer: null, delay: RETRY_MIN_MS }, debounce: null,
      pending: null, request: null, identifying: false, stopping: null, dirty: false, allBranches: false, terminals: new Map() };
    states.set(repository.id, state);
    const facts = () => {
      timer(state.abort.signal, () => {
        if (state.labels === null && state.connectRetry.timer === null) identify(state);
        else if (state.connected) schedule(state, true);
        facts();
      }, FACTS_INTERVAL_MS);
    };
    facts(); identify(state);
  }
  function stop(state: RepositoryState): Promise<void> {
    if (state.stopping !== null) return state.stopping;
    state.abort.abort(); state.stream?.close();
    state.stopping = Promise.allSettled([...state.work]).then(() => {});
    return state.stopping;
  }
  function cycle() {
    registryWork = (async () => {
      try {
        const repositories = ports.repositories(); registryFailed = false;
        const byId = new Map(repositories.map(repository => [repository.id, repository]));
        const retired: Promise<void>[] = [];
        for (const [id, state] of states) if (byId.get(id)?.path !== state.repository.path) { states.delete(id); retired.push(stop(state)); }
        await Promise.all(retired);
        if (observer.signal.aborted) return;
        for (const repository of repositories) if (!states.has(repository.id)) start(repository);
      } catch {
        registryFailed = true;
        const retired = [...states.values()]; states.clear();
        await Promise.all(retired.map(stop));
      }
      if (!observer.signal.aborted) timer(observer.signal, cycle, FACTS_INTERVAL_MS);
    })();
  }
  cycle();
  return {
    read(repositoryId: string): BoardSeatsCache {
      return registryFailed ? { state: 'unavailable', reason: 'registry_unavailable' }
        : states.get(repositoryId)?.cache ?? { state: 'unavailable', reason: 'repository_not_found' };
    },
    close(): Promise<void> {
      if (closeWork !== null) return closeWork;
      observer.abort();
      closeWork = Promise.all([...states.values()].map(stop).concat(registryWork ?? [])).then(() => {});
      return closeWork;
    },
  };
}
