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
  /** A board that the worker read and that passed the decoder. A throw makes the cache entry `board_unavailable`. */
  readonly on_board?: (repositoryId: string, board: BoardV1) => void;
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

  // Board facts: one resident worker reads one document at a time. The routes
  // read only these maps; a cycle replaces each entry when its read settles.
  const boards = new Map<string, BoardDocumentCache>();
  const parentsDocuments = new Map<string, BoardParentsCache>();
  const leases = new Map<string, { readonly repository_id: string; readonly parent: number; until: number }>();
  let factsRepositories: ReadonlySet<string> | null = null;
  let factsRegistryFailed = false;
  let worker: Worker | null = null;
  let nextRequest = 0;
  let factsWork: Promise<void> | null = null;
  let gap: { readonly cancel: CancelTimer; readonly wakeable: boolean } | null = null;

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
  async function ask(request: BoardWorkerQuery): Promise<BoardWorkerAnswer | 'timeout' | null> {
    if (observer.signal.aborted) return null;
    let current: Worker;
    // A failed spawn becomes the unavailable answer of each document; the next request tries a new worker.
    try { current = worker ??= startWorker(); } catch { return null; }
    const id = ++nextRequest;
    const line = await new Promise<string | null | 'timeout'>((resolve) => {
      const deadline = timer(observer.signal, () => resolve('timeout'), BOARD_FACTS_DEADLINE_MS);
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
  function readBoard(repositoryId: string, parent: number, answer: BoardWorkerAnswer | 'timeout' | null): BoardDocumentCache {
    if (answer === 'timeout') return { state: 'unavailable', reason: 'board_timeout' };
    if (answer === null) return { state: 'unavailable', reason: 'board_unavailable' };
    if (!answer.ok) return { state: 'unavailable', reason: answer.code as Extract<BoardDocumentCache, { state: 'unavailable' }>['reason'] };
    let value: BoardV1;
    try { value = decodeBoard(answer.value); if (value.parent.number !== parent) throw new Error('board of another parent'); }
    catch { return { state: 'unavailable', reason: 'board_invalid' }; }
    try { options.on_board?.(repositoryId, value); } catch { return { state: 'unavailable', reason: 'board_unavailable' }; }
    return { state: 'ready', value, etag: etagOf(value) };
  }
  /** Each open parent with a live seat, then each leased parent; parents with no answer yet come first. */
  function observedBoards(repositories: readonly Repository[]): { readonly repository: Repository; readonly parent: number }[] {
    const now = clock.now().getTime();
    for (const [key, lease] of leases) if (lease.until <= now) leases.delete(key);
    const observed = new Map<string, { readonly repository: Repository; readonly parent: number }>();
    for (const repository of repositories) {
      const parents = parentsDocuments.get(repository.id), seats = states.get(repository.id)?.cache;
      if (parents?.state === 'ready' && seats?.state === 'ready') {
        for (const parent of joinBoardParents(parents.value, seats.value).parents) {
          if (parent.seats > 0) observed.set(boardKey(repository.id, parent.number), { repository, parent: parent.number });
        }
      }
      for (const lease of leases.values()) if (lease.repository_id === repository.id) observed.set(boardKey(repository.id, lease.parent), { repository, parent: lease.parent });
    }
    return [...observed].sort(([left], [right]) => Number(boards.has(left)) - Number(boards.has(right))).map(([, board]) => board);
  }
  async function factsCycle(): Promise<number> {
    let repositories: readonly Repository[];
    try { repositories = ports.repositories(); }
    catch { factsRegistryFailed = true; boards.clear(); parentsDocuments.clear(); return FACTS_INTERVAL_MS; }
    factsRegistryFailed = false;
    factsRepositories = new Set(repositories.map(repository => repository.id));
    for (const id of parentsDocuments.keys()) if (!factsRepositories.has(id)) parentsDocuments.delete(id);
    // With no registered repository the worker does not start.
    if (repositories.length === 0) { boards.clear(); return FACTS_INTERVAL_MS; }
    const rate = await ask({ kind: 'rate_limit' });
    for (const repository of repositories) {
      const answer = await ask({ kind: 'parents', repo_root: repository.path });
      if (observer.signal.aborted) return FACTS_INTERVAL_MS;
      parentsDocuments.set(repository.id, readParents(answer));
    }
    const used = new Set<string>();
    for (const { repository, parent } of observedBoards(repositories)) {
      const key = boardKey(repository.id, parent);
      const answer = await ask({ kind: 'board', repo_root: repository.path, parent, key });
      if (observer.signal.aborted) return FACTS_INTERVAL_MS;
      boards.set(key, readBoard(repository.id, parent, answer));
      used.add(key);
    }
    for (const key of boards.keys()) if (!used.has(key)) boards.delete(key);
    await ask({ kind: 'retain', keys: [...used] });
    return cycleGap(rate !== null && rate !== 'timeout' && rate.ok ? rate.value as GitHubRateLimit : null);
  }
  function runFacts() {
    gap = null;
    // A cycle that throws keeps the documents it published; the server stays up and the next cycle retries.
    factsWork = factsCycle().catch(() => FACTS_INTERVAL_MS).then((ms) => {
      factsWork = null;
      if (observer.signal.aborted) return;
      gap = { cancel: timer(observer.signal, runFacts, ms), wakeable: ms <= FACTS_INTERVAL_MS };
    });
  }
  /** A new lease starts the next cycle at once unless a low GitHub budget set the gap. */
  function lease(repositoryId: string, parent: number) {
    if (factsRegistryFailed || (factsRepositories !== null && !factsRepositories.has(repositoryId))) return;
    const key = boardKey(repositoryId, parent), until = clock.now().getTime() + BOARD_LEASE_MS;
    const held = leases.get(key);
    if (held !== undefined) { held.until = until; return; }
    leases.set(key, { repository_id: repositoryId, parent, until });
    if (gap?.wakeable) { gap.cancel(); runFacts(); }
  }

  cycle();
  runFacts();
  return {
    seats(repositoryId: string): BoardSeatsCache {
      return registryFailed ? { state: 'unavailable', reason: 'registry_unavailable' }
        : states.get(repositoryId)?.cache ?? { state: 'unavailable', reason: 'repository_not_found' };
    },
    board(repositoryId: string, parent: number): BoardDocumentCache {
      lease(repositoryId, parent);
      if (factsRegistryFailed) return { state: 'unavailable', reason: 'registry_unavailable' };
      if (factsRepositories !== null && !factsRepositories.has(repositoryId)) return { state: 'unavailable', reason: 'repository_not_found' };
      return boards.get(boardKey(repositoryId, parent)) ?? { state: 'pending' };
    },
    parents(repositoryId: string): BoardParentsCache {
      if (factsRegistryFailed) return { state: 'unavailable', reason: 'registry_unavailable' };
      if (factsRepositories !== null && !factsRepositories.has(repositoryId)) return { state: 'unavailable', reason: 'repository_not_found' };
      return parentsDocuments.get(repositoryId) ?? { state: 'pending' };
    },
    close(): Promise<void> {
      if (closeWork !== null) return closeWork;
      observer.abort();
      const facts = (worker === null ? Promise.resolve() : retire(worker)).then(async () => { await factsWork; });
      closeWork = Promise.all([...states.values()].map(stop).concat(registryWork ?? [], facts)).then(() => {});
      return closeWork;
    },
  };
}
