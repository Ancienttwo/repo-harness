import { spawn, type ChildProcess } from 'node:child_process';
import { devNull } from 'node:os';
import { fileURLToPath } from 'node:url';
import { decodeBoardParents, joinBoardParents, projectBoardSeats, type BoardParentsV1, type BoardSeatsV1 } from '../../core/board/parents';
import { decodeBoard, type BoardSeatTerminalInputV1, type BoardV1 } from '../../core/board/board';
import { githubRemoteRepository } from '../../core/board/source';
import { sha256Hex } from '../../core/evidence/sha256';
import type { BoardParentsReadFailure, BoardReadFailure } from '../../core/operator/board-read';
import { readLocalRepositoryIdAsync } from '../board/collect';
import { gitExecFile, withoutRepositorySelectingGitEnv } from '../git/runner';
import { spawnRegisteredProcessGroup } from '../process-group-registry';
import { terminateProcessGroup } from '../process-group-termination';
import type { BoardWorkerAnswer, BoardWorkerQuery, GitHubRateLimit } from './board-observer-worker';
import { executionChildEnvironment } from './execution-collector';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { boardSeatTerminals, hcEvents, hcListAsync, RH_LABEL, type HcEventStream, type HcLabels, type HcListTerminal, type HcStreamItem } from '../terminal/herdr-core';
import { readHcSnapshot, type HcSnapshot } from './herdr-runtime-transport';
import { replaceObservation, startObservationLoop, type ObservationCycleResult } from '../observation-loop';

export const BOARD_SEATS_DEBOUNCE_MS = 100;
const RETRY_MIN_MS = 1000;
const FACTS_INTERVAL_MS = 30_000;
/** One board read makes several GitHub reads and one merge readiness read per open pull request. */
export const BOARD_FACTS_DEADLINE_MS = 90_000;
/** A board GET keeps its parent observed for this long (#2155 D2). */
export const BOARD_LEASE_MS = 10 * 60_000;
/** Below this share of the GitHub budget the gap between cycles grows in proportion. */
const RATE_LIMIT_LOW_SHARE = 0.25;
const RATE_LIMIT_GAP_MAX_MS = 15 * 60_000;
const WORKER_TERMINATION_GRACE_MS = 500;
const WORKER_OUTPUT_LIMIT = 16 * 1024 * 1024;
const WORKER_ENTRY = fileURLToPath(new URL('./board-observer-worker.ts', import.meta.url));

type Repository = { readonly id: string; readonly path: string };
export type BoardSeatsCache =
  | { readonly state: 'pending' }
  | { readonly state: 'unavailable'; readonly reason: 'registry_unavailable' | 'repository_not_found' | 'parents_github_failed' | 'parents_hc_failed'; readonly cause?: 'github_remote_missing' }
  | { readonly state: 'ready'; readonly value: BoardSeatsV1 };
/** The last read of one facts document. `pending` until the worker has read it once. */
export type BoardFactsCache<T, F extends string> =
  | { readonly state: 'pending' }
  | { readonly state: 'unavailable'; readonly reason: F }
  | { readonly state: 'ready'; readonly value: T; readonly etag: string };
export type BoardDocumentCache = BoardFactsCache<BoardV1, Exclude<BoardReadFailure, 'board_parent_invalid' | 'board_pending'>>;
export type BoardParentsCache = BoardFactsCache<BoardParentsV1, Exclude<BoardParentsReadFailure, 'parents_pending' | 'parents_hc_failed'>>;
/**
 * The documents that the facts loop publishes: the last read of each parent list,
 * keyed by repository id, and of each board, keyed by `<repository id>#<parent>`.
 * A cycle publishes this value when each read settles, so a reader sees a document
 * before the cycle ends.
 */
interface BoardFactsDocuments {
  readonly parents: ReadonlyMap<string, BoardParentsCache>;
  readonly boards: ReadonlyMap<string, BoardDocumentCache>;
}
/** The reason that a failed registry or facts read gives the board and parents routes. */
const REGISTRY_FAILURE = 'registry_unavailable';
/** The reason that a facts cycle which threw names; the cycle keeps the documents that it published. */
const FACTS_FAILURE = 'board_facts_cycle_failed';
type FactsFailure = typeof REGISTRY_FAILURE | typeof FACTS_FAILURE;
const NO_BOARD_DOCUMENTS: BoardFactsDocuments = Object.freeze({ parents: new Map<string, BoardParentsCache>(), boards: new Map<string, BoardDocumentCache>() });

/** The memory reads of the board routes. No read starts a process. */
export interface BoardObserverReads {
  seats(repositoryId: string): BoardSeatsCache;
  /** Also adds or renews the lease of the parent. */
  board(repositoryId: string, parent: number): BoardDocumentCache;
  parents(repositoryId: string): BoardParentsCache;
}

export interface BoardObserverPorts {
  repositories(): readonly Repository[];
  identify(repository: Repository, signal: AbortSignal): Promise<string | null>;
  subscribe(labels: HcLabels, onItem: (item: HcStreamItem) => void, signal: AbortSignal): HcEventStream;
  snapshot(labels: HcLabels, signal: AbortSignal): Promise<HcSnapshot>;
  list(labels: HcLabels, signal: AbortSignal): Promise<readonly HcListTerminal[]>;
  branch(cwd: string | null, signal: AbortSignal): Promise<string | null>;
  /** The resident facts worker: a group leader on POSIX that answers one JSON line for each request line. */
  spawnWorker(): ChildProcess;
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
    spawnWorker: () => spawnBoardWorker(env),
  };
}

/**
 * The registered root alone selects the repository: no GH_REPO or Git
 * repository override reaches the worker. Each gh read runs in its root, and
 * Bun loads no bunfig.toml or .env from a repository or from the server cwd.
 */
export function spawnBoardWorker(env: NodeJS.ProcessEnv): ChildProcess {
  const workerEnv: NodeJS.ProcessEnv = { ...executionChildEnvironment(env), GH_PROMPT_DISABLED: '1' };
  delete workerEnv.GH_REPO;
  return spawnRegisteredProcessGroup('operator-board-observer', () => spawn(process.execPath, ['--no-env-file', `--config=${devNull}`, WORKER_ENTRY], {
    env: workerEnv, stdio: ['pipe', 'pipe', 'ignore'], detached: process.platform !== 'win32', windowsHide: true,
  }));
}

/** The gap after a cycle: the base interval, longer in proportion when the GitHub budget is low. */
function cycleGap(rate: GitHubRateLimit | null): number {
  const share = rate === null ? 1 : rate.remaining / rate.limit;
  if (share >= RATE_LIMIT_LOW_SHARE) return FACTS_INTERVAL_MS;
  return Math.min(RATE_LIMIT_GAP_MAX_MS, FACTS_INTERVAL_MS * RATE_LIMIT_LOW_SHARE / Math.max(share, 1 / rate!.limit));
}

const etagOf = (value: unknown) => `"${sha256Hex(JSON.stringify(value))}"`;
const boardKey = (repositoryId: string, parent: number) => `${repositoryId}#${parent}`;
const boardRepository = (key: string) => key.slice(0, key.lastIndexOf('#'));
/**
 * The registry applied to the published documents: a removed repository loses its parent
 * list and each of its boards at once, so a low GitHub budget cannot keep it served.
 */
const applyFactsRegistry = (documents: BoardFactsDocuments, registered: ReadonlySet<string>): BoardFactsDocuments => ({
  parents: new Map([...documents.parents].filter(([id]) => registered.has(id))),
  boards: new Map([...documents.boards].filter(([key]) => registered.has(boardRepository(key)))),
});

interface Worker {
  readonly child: ChildProcess;
  readonly exited: Promise<void>;
  waiting: ((line: string | null) => void) | null;
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
  /** A force request stays pending until a successful refresh publishes that revision. */
  branchesRequested: number;
  branchesObserved: number;
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
  // Owns the repository children: their streams, timers and reads. The two observation loops own the cycles.
  const lifecycle = new AbortController();
  const states = new Map<string, RepositoryState>();
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
  const active = (state: RepositoryState) => !lifecycle.signal.aborted && !state.abort.signal.aborted;
  const current = (state: RepositoryState, generation: number) => active(state) && generation === state.generation;
  function retry(state: RepositoryState, slot: RetryState, run: () => void) {
    if (!active(state) || slot.timer !== null) return;
    slot.timer = timer(state.abort.signal, () => { slot.timer = null; run(); }, slot.delay);
    slot.delay = Math.min(slot.delay * 2, FACTS_INTERVAL_MS);
  }
  function schedule(state: RepositoryState, allBranches = false) {
    state.dirty = true;
    if (allBranches) state.branchesRequested++;
    if (!active(state) || !state.connected || state.refreshRetry.timer !== null || state.debounce !== null || state.pending !== null) return;
    state.debounce = timer(state.abort.signal, () => { state.debounce = null; refresh(state); }, BOARD_SEATS_DEBOUNCE_MS);
  }
  function refresh(state: RepositoryState) {
    if (!active(state) || !state.connected || state.labels === null || state.pending !== null || state.refreshRetry.timer !== null) return;
    const generation = state.generation, labels = state.labels, branchRevision = state.branchesRequested;
    const allBranches = branchRevision !== state.branchesObserved;
    state.dirty = false;
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
        if (allBranches) state.branchesObserved = branchRevision;
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
      pending: null, request: null, identifying: false, stopping: null, dirty: false, branchesRequested: 0, branchesObserved: 0, terminals: new Map() };
    states.set(repository.id, state);
    // The 30 s force-refresh of one child, which reads the branches again even when no signature changed.
    const forceRefresh = () => {
      timer(state.abort.signal, () => {
        if (state.labels === null && state.connectRetry.timer === null) identify(state);
        else if (state.connected) schedule(state, true);
        forceRefresh();
      }, FACTS_INTERVAL_MS);
    };
    forceRefresh(); identify(state);
  }
  function stop(state: RepositoryState): Promise<void> {
    if (state.stopping !== null) return state.stopping;
    state.abort.abort(); state.stream?.close();
    state.stopping = Promise.allSettled([...state.work]).then(() => {});
    return state.stopping;
  }
  /** Each child that a registry cycle removed, so close waits for its drain as well. */
  const draining = new Set<Promise<void>>();
  const drain = (retired: readonly RepositoryState[]): Promise<void> => {
    const stops = retired.map(stop);
    for (const work of stops) { draining.add(work); void work.finally(() => draining.delete(work)); }
    return Promise.all(stops).then(() => {});
  };
  /**
   * The repository ids whose facts documents a registry removal or a failed registry
   * read dropped. Their older document is not served again when the repository
   * returns inside a long facts gap; the facts cycle clears the id when it publishes
   * a new read, so a returned repository is pending, as the deleted maps were on main.
   */
  const dropped = new Set<string>();
  /**
   * The registry cycle of the observer: each registered repository gains one child,
   * and a child leaves when its repository leaves the registry or changes its path.
   * A failed read stops every child, because no child can serve a repository that
   * the registry cannot name. The cycle waits for each stopped child, so the state
   * map never names a child that still runs. A removal and a failed read also drop
   * the facts documents of the affected ids at once, as the two maps did on main.
   */
  const registry = startObservationLoop<readonly Repository[], typeof REGISTRY_FAILURE>({
    cycle: async () => {
      let repositories: readonly Repository[];
      try { repositories = ports.repositories(); }
      catch {
        const retired = [...states.values()];
        // A document exists only for a repository that had a child, so these ids cover every document to drop.
        for (const state of retired) dropped.add(state.repository.id);
        states.clear();
        await drain(retired);
        return { state: 'unavailable', reason: REGISTRY_FAILURE };
      }
      const byId = new Map(repositories.map(repository => [repository.id, repository]));
      const retired: RepositoryState[] = [];
      for (const [id, state] of states) {
        if (byId.get(id)?.path === state.repository.path) continue;
        // Only a repository that left the registry drops its documents; a new path keeps the same id and document.
        if (!byId.has(id)) dropped.add(id);
        states.delete(id); retired.push(state);
      }
      await drain(retired);
      // A close starts no child, so no child timer outlives the observer.
      if (lifecycle.signal.aborted) return { state: 'observed', value: repositories };
      // A child starts in this cycle, so a GET that follows the cycle already finds its state.
      for (const repository of repositories) if (!states.has(repository.id)) start(repository);
      return { state: 'observed', value: repositories };
    },
    keep: replaceObservation,
    failure: REGISTRY_FAILURE,
    interval_ms: FACTS_INTERVAL_MS,
    clock,
  });

  // Board facts: one resident worker reads one document at a time. The routes
  // read only the published documents; a cycle publishes each entry when its read settles.
  const leases = new Map<string, { readonly repository_id: string; readonly parent: number; until: number }>();
  let worker: Worker | null = null;
  let nextRequest = 0;
  /** The gap after the last settled facts cycle: 30 s, longer below a low GitHub budget. */
  let factsGapMs = FACTS_INTERVAL_MS;

  function startWorker(): Worker {
    const child = ports.spawnWorker();
    let resolveExit!: () => void;
    const started: Worker = { child, exited: new Promise(resolve => { resolveExit = resolve; }), waiting: null };
    let buffer = '';
    const answer = (line: string | null) => { const waiting = started.waiting; started.waiting = null; waiting?.(line); };
    const ended = () => { if (worker === started) worker = null; answer(null); resolveExit(); };
    child.once('close', ended);
    child.once('error', ended);
    child.stdin!.on('error', () => {});
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      buffer += chunk;
      for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        answer(line);
      }
      if (buffer.length > WORKER_OUTPUT_LIMIT) void retire(started);
    });
    return started;
  }
  /** Kill the worker's process group. The next request starts a new worker with empty stores. */
  async function retire(retired: Worker): Promise<void> {
    if (worker === retired) worker = null;
    const waiting = retired.waiting; retired.waiting = null; waiting?.(null);
    if (retired.child.pid !== undefined) await terminateProcessGroup(retired.child.pid, WORKER_TERMINATION_GRACE_MS).catch(() => {});
    else retired.child.kill('SIGKILL');
    await retired.exited;
  }
  /** One request under the deadline. Null: the worker did not start, crashed, wrote an invalid answer or the observer closed. */
  async function ask(request: BoardWorkerQuery, signal: AbortSignal): Promise<BoardWorkerAnswer | 'timeout' | null> {
    if (signal.aborted) return null;
    let current: Worker;
    // A failed spawn becomes the unavailable answer of each document; the next request tries a new worker.
    try { current = worker ??= startWorker(); } catch { return null; }
    const id = ++nextRequest;
    const line = await new Promise<string | null | 'timeout'>((resolve) => {
      const deadline = timer(signal, () => resolve('timeout'), BOARD_FACTS_DEADLINE_MS);
      current.waiting = value => { deadline(); resolve(value); };
      current.child.stdin!.write(`${JSON.stringify({ ...request, id })}\n`);
    });
    if (line === 'timeout') { await retire(current); return 'timeout'; }
    let answer: BoardWorkerAnswer | null = null;
    try { answer = line === null ? null : JSON.parse(line) as BoardWorkerAnswer; } catch { /* invalid answer */ }
    if (answer?.id !== id || typeof answer.ok !== 'boolean') { await retire(current); return null; }
    return answer;
  }
  function readParents(answer: BoardWorkerAnswer | 'timeout' | null): BoardParentsCache {
    if (answer === 'timeout') return { state: 'unavailable', reason: 'parents_timeout' };
    if (answer === null) return { state: 'unavailable', reason: 'parents_unavailable' };
    if (!answer.ok) return { state: 'unavailable', reason: answer.code as Extract<BoardParentsCache, { state: 'unavailable' }>['reason'] };
    try { const value = decodeBoardParents(answer.value); return { state: 'ready', value, etag: etagOf(value) }; }
    catch { return { state: 'unavailable', reason: 'parents_invalid' }; }
  }
  function readBoard(parent: number, answer: BoardWorkerAnswer | 'timeout' | null): BoardDocumentCache {
    if (answer === 'timeout') return { state: 'unavailable', reason: 'board_timeout' };
    if (answer === null) return { state: 'unavailable', reason: 'board_unavailable' };
    if (!answer.ok) return { state: 'unavailable', reason: answer.code as Extract<BoardDocumentCache, { state: 'unavailable' }>['reason'] };
    let value: BoardV1;
    try { value = decodeBoard(answer.value); if (value.parent.number !== parent) throw new Error('board of another parent'); }
    catch { return { state: 'unavailable', reason: 'board_invalid' }; }
    return { state: 'ready', value, etag: etagOf(value) };
  }
  /** Each open parent with a live seat, then each leased parent; parents with no answer yet come first. */
  function observedBoards(repositories: readonly Repository[], parents: ReadonlyMap<string, BoardParentsCache>, boards: ReadonlyMap<string, BoardDocumentCache>): { readonly repository: Repository; readonly parent: number }[] {
    const now = clock.now().getTime();
    for (const [key, lease] of leases) if (lease.until <= now) leases.delete(key);
    const observed = new Map<string, { readonly repository: Repository; readonly parent: number }>();
    for (const repository of repositories) {
      const parentsRead = parents.get(repository.id), seats = states.get(repository.id)?.cache;
      if (parentsRead?.state === 'ready' && seats?.state === 'ready') {
        for (const parent of joinBoardParents(parentsRead.value, seats.value).parents) {
          if (parent.seats > 0) observed.set(boardKey(repository.id, parent.number), { repository, parent: parent.number });
        }
      }
      for (const lease of leases.values()) if (lease.repository_id === repository.id) observed.set(boardKey(repository.id, lease.parent), { repository, parent: lease.parent });
    }
    return [...observed].sort(([left], [right]) => Number(boards.has(left)) - Number(boards.has(right))).map(([, board]) => board);
  }
  /**
   * The registry answer for one repository id. The registry loop is the one reader
   * of the registry, so a removal and a failed read apply here at once, even while
   * a low GitHub budget holds the next facts cycle back.
   */
  function registrationOf(repositoryId: string): 'registered' | 'absent' | 'registry_unavailable' | 'unknown' {
    const state = registry.read();
    if (state.state === 'pending') return 'unknown';
    if (state.state === 'unavailable') return 'registry_unavailable';
    return state.value.some(repository => repository.id === repositoryId) ? 'registered' : 'absent';
  }
  /**
   * One resident worker reads one document at a time. The cycle publishes its
   * documents as each read settles, so a reader sees a document before the cycle
   * ends, and it returns the documents that it published, also when it stops or
   * throws, as the shared maps did on main; only a registry that a cycle cannot
   * read empties them. The gap after a cycle is 30 s; below 25 % of the lower
   * GitHub REST or GraphQL budget it grows in proportion, up to 15 min, and a
   * lease then does not shorten it.
   */
  const facts = startObservationLoop<BoardFactsDocuments, FactsFailure>({
    cycle: async ({ signal, previous, publish }) => {
      const read = registry.read();
      // The registry loop starts the children; a facts cycle reads a registry that a cycle has read.
      if (read.state !== 'observed') { factsGapMs = FACTS_INTERVAL_MS; return { state: 'unavailable', reason: REGISTRY_FAILURE }; }
      const repositories = read.value;
      // With no registered repository the worker does not start.
      if (repositories.length === 0) { factsGapMs = FACTS_INTERVAL_MS; return { state: 'observed', value: NO_BOARD_DOCUMENTS }; }
      // A dropped id stays out of the served set until this cycle publishes a new read for it.
      const registered = new Set(repositories.map(repository => repository.id).filter(id => !dropped.has(id)));
      // Each cycle starts from the previous documents, so a repository that this cycle has not reached keeps its older documents.
      const before = previous.state === 'observed' ? applyFactsRegistry(previous.value, registered) : NO_BOARD_DOCUMENTS;
      const parents = new Map(before.parents);
      const boards = new Map(before.boards);
      const published = (): ObservationCycleResult<BoardFactsDocuments, FactsFailure> => ({ state: 'observed', value: { parents: new Map(parents), boards: new Map(boards) } });
      try {
        const rate = await ask({ kind: 'rate_limit' }, signal);
        for (const repository of repositories) {
          const answer = await ask({ kind: 'parents', repo_root: repository.path }, signal);
          // A close ends the cycle here, and the documents that it published stay served.
          if (signal.aborted) return published();
          parents.set(repository.id, readParents(answer));
          // The new read replaces the dropped document of the id.
          dropped.delete(repository.id);
          // A parent list is served when its read returns, not when the cycle ends.
          publish({ parents: new Map(parents), boards: new Map(boards) });
        }
        const used = new Set<string>();
        for (const { repository, parent } of observedBoards(repositories, parents, boards)) {
          const key = boardKey(repository.id, parent);
          const answer = await ask({ kind: 'board', repo_root: repository.path, parent, key }, signal);
          if (signal.aborted) return published();
          boards.set(key, readBoard(parent, answer));
          used.add(key);
          // A board is served when its read returns, not when the cycle ends.
          publish({ parents: new Map(parents), boards: new Map(boards) });
        }
        for (const key of [...boards.keys()]) if (!used.has(key)) boards.delete(key);
        // A board that this cycle did not read leaves the served set, instead of waiting for the next cycle.
        publish({ parents: new Map(parents), boards: new Map(boards) });
        await ask({ kind: 'retain', keys: [...used] }, signal);
        factsGapMs = cycleGap(rate !== null && rate !== 'timeout' && rate.ok ? rate.value as GitHubRateLimit : null);
        return published();
      } catch {
        // The server stays up and the next cycle retries; the documents that this cycle published stay served,
        // and a cycle that threw goes back to the base gap, as `catch(() => FACTS_INTERVAL_MS)` did on main.
        factsGapMs = FACTS_INTERVAL_MS;
        return published();
      }
    },
    // The cycle returns its own result above, so the only unavailable result is a registry that a cycle cannot
    // read: that read empties the documents, as the caches did on main.
    keep: replaceObservation,
    failure: FACTS_FAILURE,
    interval_ms: () => factsGapMs,
    wakeable_gap: ms => ms <= FACTS_INTERVAL_MS,
    // The first facts cycle reads the registry that the first registry cycle published.
    first_cycle_after: registry.settled(),
    clock,
  });
  /**
   * The published documents. The registry loop is the one authority for the
   * registered set, so a document whose repository left the registry is not served
   * after the removal, even while a low budget holds the next facts cycle back. A
   * dropped id is not served either, so a repository that returned before the next
   * facts cycle stays pending instead of showing a document from before the removal.
   */
  const documents = (): BoardFactsDocuments => {
    const state = facts.read(), read = registry.read();
    if (state.state !== 'observed' || read.state !== 'observed') return NO_BOARD_DOCUMENTS;
    return applyFactsRegistry(state.value, new Set(read.value.map(repository => repository.id).filter(id => !dropped.has(id))));
  };
  /** A new lease starts the next cycle at once unless a low GitHub budget set the gap. */
  function lease(repositoryId: string, parent: number) {
    const answer = registrationOf(repositoryId);
    if (answer === 'absent' || answer === 'registry_unavailable') return;
    const key = boardKey(repositoryId, parent), until = clock.now().getTime() + BOARD_LEASE_MS;
    const held = leases.get(key);
    if (held !== undefined) { held.until = until; return; }
    leases.set(key, { repository_id: repositoryId, parent, until });
    facts.wake();
  }

  return {
    seats(repositoryId: string): BoardSeatsCache {
      return registrationOf(repositoryId) === 'registry_unavailable' ? { state: 'unavailable', reason: 'registry_unavailable' }
        : states.get(repositoryId)?.cache ?? { state: 'unavailable', reason: 'repository_not_found' };
    },
    board(repositoryId: string, parent: number): BoardDocumentCache {
      lease(repositoryId, parent);
      const registration = registrationOf(repositoryId);
      if (registration === 'registry_unavailable') return { state: 'unavailable', reason: 'registry_unavailable' };
      if (registration === 'absent') return { state: 'unavailable', reason: 'repository_not_found' };
      return documents().boards.get(boardKey(repositoryId, parent)) ?? { state: 'pending' };
    },
    parents(repositoryId: string): BoardParentsCache {
      const registration = registrationOf(repositoryId);
      if (registration === 'registry_unavailable') return { state: 'unavailable', reason: 'registry_unavailable' };
      if (registration === 'absent') return { state: 'unavailable', reason: 'repository_not_found' };
      return documents().parents.get(repositoryId) ?? { state: 'pending' };
    },
    close(): Promise<void> {
      if (closeWork !== null) return closeWork;
      lifecycle.abort();
      const factsClosed = facts.close();
      // The worker answers the request in flight with null, so the facts cycle settles without its deadline.
      const workerClosed = (worker === null ? Promise.resolve() : retire(worker)).then(() => factsClosed);
      closeWork = Promise.all([registry.close(), factsClosed, workerClosed, ...[...states.values()].map(stop), ...[...draining]]).then(() => {});
      return closeWork;
    },
  };
}
