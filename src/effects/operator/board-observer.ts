import { execFile } from 'node:child_process';
import { joinBoardParents, projectBoardSeats, type BoardParentsV1, type BoardSeatsV1 } from '../../core/board/parents';
import type { BoardSeatTerminalInputV1 } from '../../core/board/board';
import { withoutRepositorySelectingGitEnv } from '../git/runner';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { boardSeatTerminals, hcEvents, hcListAsync, RH_LABEL, type HcEventStream, type HcLabels, type HcListTerminal, type HcStreamItem } from '../terminal/herdr-core';
import { readHcSnapshot, type HcSnapshot } from './herdr-runtime-transport';

export const BOARD_SEATS_DEBOUNCE_MS = 100;
const RECONNECT_MS = 1000;
const FACTS_INTERVAL_MS = 30_000;

type Repository = { readonly id: string; readonly path: string };
export type BoardSeatsCache =
  | { readonly state: 'pending' }
  | { readonly state: 'unavailable'; readonly reason: 'registry_unavailable' | 'repository_not_found' | 'parents_github_failed' | 'parents_hc_failed' }
  | { readonly state: 'ready'; readonly value: BoardSeatsV1 };

export interface BoardObserverPorts {
  repositories(): readonly Repository[];
  identify(repository: Repository, signal: AbortSignal): Promise<string>;
  subscribe(labels: HcLabels, onItem: (item: HcStreamItem) => void): HcEventStream;
  snapshot(labels: HcLabels, signal: AbortSignal): Promise<HcSnapshot>;
  list(labels: HcLabels): Promise<readonly HcListTerminal[]>;
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
  const run = (program: string, args: readonly string[], cwd: string, signal: AbortSignal) => new Promise<string>((resolve, reject) => {
    execFile(program, [...args], { cwd, env: childEnv, signal, timeout: 10_000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error); else resolve(stdout.trim());
    });
  });
  return {
    repositories: () => readRepoHarnessRegistryStrictSnapshot({ env }).repos,
    async identify(repository, signal) {
      const text = await run(env.REPO_HARNESS_GH_BIN ?? 'gh', ['api', '--hostname', 'github.com', 'repos/{owner}/{repo}'], repository.path, signal);
      let value: { readonly id?: number } | null;
      try { value = JSON.parse(text); } catch { throw new Error('repository_id_invalid'); }
      const id = value?.id;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) throw new Error('repository_id_invalid');
      return String(id);
    },
    subscribe: (labels, onItem) => hcEvents(labels, onItem, { env }),
    snapshot: (labels, signal) => readHcSnapshot(labels, env, AbortSignal.any([signal, AbortSignal.timeout(10_000)])),
    list: labels => hcListAsync(labels, { env }),
    async branch(cwd, signal) {
      if (cwd === null) return null;
      try { return await run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd, signal) || null; }
      catch { return null; } // Detached HEAD, a removed directory and a failed git read have no branch.
    },
  };
}

/** One resident invalidation stream per repository. HTTP reads only the published documents. */
export function startBoardObserver(options: BoardObserverOptions = {}) {
  const ports = options.ports ?? observerPorts({ ...process.env, ...options.env });
  const clock: NonNullable<BoardObserverOptions['clock']> = options.clock ?? { now: () => new Date(), setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: handle => clearTimeout(handle) };
  const states = new Map<string, {
    readonly repository: Repository;
    readonly abort: AbortController;
    cache: BoardSeatsCache;
    labels: HcLabels | null;
    stream: HcEventStream | null;
    generation: number;
    seq: number;
    timer: ReturnType<typeof setTimeout> | null;
    pending: Promise<void> | null;
    dirty: boolean;
    allBranches: boolean;
    terminals: Map<string, { readonly signature: string; readonly value: BoardSeatTerminalInputV1 }>;
  }>();
  type State = ReturnType<typeof states.get> & {};
  let closed = false, registryFailed = false;
  const streams = new Set<HcEventStream>();
  const work = new Set<Promise<void>>();
  const track = (pending: Promise<void>) => { work.add(pending); void pending.finally(() => work.delete(pending)); };
  const timer = (callback: () => void, ms: number) => { const handle = clock.setTimeout(callback, ms); handle.unref?.(); return handle; };
  const clear = (state: State) => { if (state.timer !== null) clock.clearTimeout(state.timer); state.timer = null; };
  const current = (state: State, generation: number) => !closed && !state.abort.signal.aborted && generation === state.generation;

  function schedule(state: State, allBranches = false) {
    state.dirty = true; state.allBranches ||= allBranches;
    if (state.timer !== null || state.pending !== null || state.labels === null) return;
    state.timer = timer(() => { state.timer = null; refresh(state); }, BOARD_SEATS_DEBOUNCE_MS);
  }

  function refresh(state: State) {
    if (state.labels === null || closed || state.abort.signal.aborted) return;
    const generation = state.generation, labels = state.labels, allBranches = state.allBranches;
    state.dirty = false; state.allBranches = false;
    const pending = (async () => {
      try {
        const [snapshot, listed] = await Promise.all([
          ports.snapshot(labels, state.abort.signal).then(value => ({ ...value, observedAt: clock.now().toISOString() })), ports.list(labels),
        ]);
        const agents = new Map(listed.filter(terminal => terminal.state === 'live').map(terminal => [terminal.address, terminal.agent]));
        const rows = boardSeatTerminals(snapshot.terminals.filter(terminal => terminal.state === 'live'
          && terminal.labels[RH_LABEL.repository] === labels[RH_LABEL.repository] && agents.has(terminal.address))
          .map(terminal => ({ ...terminal, agent: agents.get(terminal.address)! }))).filter(terminal => terminal.labels.seat !== undefined);
        const next = new Map<string, { readonly signature: string; readonly value: BoardSeatTerminalInputV1 }>();
        await Promise.all(rows.map(async ({ cwd, ...terminal }) => {
          const signature = JSON.stringify({ cwd, ...terminal });
          const previous = state.terminals.get(terminal.address);
          const value = !allBranches && previous?.signature === signature ? previous.value
            : { ...terminal, branch: await ports.branch(cwd, state.abort.signal) };
          next.set(terminal.address, { signature, value });
          return value;
        }));
        if (!current(state, generation)) return;
        state.terminals = next;
        state.cache = { state: 'ready', value: projectBoardSeats(labels[RH_LABEL.repository]!, snapshot.observedAt, rows.map(row => next.get(row.address)!.value)) };
      } catch {
        if (current(state, generation)) state.cache = { state: 'unavailable', reason: 'parents_hc_failed' };
      }
    })().finally(() => {
      state.pending = null;
      if (!closed && !state.abort.signal.aborted && state.dirty) schedule(state);
    });
    state.pending = pending; track(pending);
  }

  function connect(state: State) {
    const generation = ++state.generation;
    state.seq = -1;
    const lost = () => {
      if (!current(state, generation)) return;
      state.generation++; clear(state); state.stream = null;
      state.cache = { state: 'unavailable', reason: 'parents_hc_failed' };
      state.timer = timer(() => { state.timer = null; connect(state); }, RECONNECT_MS);
    };
    try {
      const stream = ports.subscribe(state.labels!, item => {
        if (!current(state, generation) || item.seq <= state.seq) return;
        state.seq = item.seq;
        schedule(state, item.type !== 'event');
      });
      state.stream = stream; streams.add(stream);
      void stream.done.then(lost, lost).finally(() => streams.delete(stream));
    } catch { lost(); }
  }

  function start(repository: Repository) {
    const state: State = { repository, abort: new AbortController(), cache: { state: 'pending' }, labels: null,
      stream: null, generation: 0, seq: -1, timer: null, pending: null, dirty: false, allBranches: false, terminals: new Map() };
    states.set(repository.id, state);
    const identify = async () => {
      try {
        const id = await ports.identify(repository, state.abort.signal);
        if (closed || state.abort.signal.aborted) return;
        state.labels = { [RH_LABEL.repository]: id }; connect(state);
      } catch {
        if (closed || state.abort.signal.aborted) return;
        state.cache = { state: 'unavailable', reason: 'parents_github_failed' };
        state.timer = timer(() => { state.timer = null; track(identify()); }, RECONNECT_MS);
      }
    };
    track(identify());
  }

  const stop = (state: State) => { state.abort.abort(); clear(state); state.stream?.close(); };
  let cycleTimer: ReturnType<typeof setTimeout> | null = null;
  function cycle() {
    if (closed) return;
    try {
      const repositories = ports.repositories(); registryFailed = false;
      const ids = new Set(repositories.map(repository => repository.id));
      for (const [id, state] of states) if (!ids.has(id) || repositories.find(repository => repository.id === id)!.path !== state.repository.path) { stop(state); states.delete(id); }
      for (const repository of repositories) {
        const state = states.get(repository.id);
        if (state === undefined) start(repository); else schedule(state, true);
      }
    } catch {
      registryFailed = true;
      for (const state of states.values()) stop(state);
      states.clear();
    }
    cycleTimer = timer(cycle, FACTS_INTERVAL_MS);
  }
  cycle();
  const read = (repositoryId: string): BoardSeatsCache => registryFailed ? { state: 'unavailable', reason: 'registry_unavailable' }
    : states.get(repositoryId)?.cache ?? { state: 'unavailable', reason: 'repository_not_found' };
  return {
    read,
    /** A board facts cycle refreshes every seat branch, even when hc sends no event. */
    refreshBranches(repositoryId: string) { const state = states.get(repositoryId); if (state) schedule(state, true); },
    /** The worker's observed-parent selection shares the browser's join. */
    parents(repositoryId: string, parents: BoardParentsV1) {
      const seats = read(repositoryId);
      return seats.state === 'ready' ? joinBoardParents(parents, seats.value) : null;
    },
    async close() {
      closed = true;
      if (cycleTimer !== null) clock.clearTimeout(cycleTimer);
      for (const state of states.values()) stop(state);
      await Promise.allSettled([...work, ...[...streams].map(stream => stream.done)]);
    },
  };
}
