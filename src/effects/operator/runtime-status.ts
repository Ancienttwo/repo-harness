import { decodeRuntimeIdentity, decodeRuntimeObservation, decodeRuntimePaneObservation, runtimePaneKey, projectRuntimeOverlay, runtimeIdentityKey, runtimeBindingKeys, runtimeInteger,
  unavailableRuntimeOverlay, nativeRuntimeFreshness, RUNTIME_LIMIT, NATIVE_RUNTIME_SOURCE_LIMIT, type NativeRuntimeSourceSummary, type RuntimeIdentity, type RuntimeObservation, type RuntimeOverlay, type RuntimePaneObservation } from '../../core/operator/runtime-status';
import { decodeRuntimeCaptureSnapshot, type NativeRuntimeProvider, type RuntimeCaptureSnapshot } from '../../core/operator/runtime-capture';

/** Select only documented structured pane fields. No title, cwd or text inference. */
export function observeHerdrPane(value: unknown, binding: RuntimeIdentity): RuntimeObservation | null {
  const identity = decodeRuntimeIdentity(binding);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pane = value as Record<string, unknown>;
  if (pane.pane_id !== identity.pane_id || pane.terminal_id !== identity.terminal_id || pane.agent_session !== identity.agent_session) return null;
  const states = { idle: 'idle', working: 'working', blocked: 'blocked', done: 'done-unseen', unknown: 'unknown' } as const;
  const state = states[pane.agent_status as keyof typeof states] ?? 'unknown';
  return decodeRuntimeObservation({ identity, revision: runtimeInteger(pane.revision), state, reason: 'unknown', changed_at: null, source: 'herdr-agent' });
}
export interface ProgramStatusV1 {
  protocol: 'repo-harness.program-status.v1'; identity: RuntimeIdentity; revision: number;
  state: 'idle' | 'working' | 'blocked' | 'settled' | 'error' | 'aborted' | 'clear';
  reason: 'permission' | 'question' | 'auth' | 'unknown'; changed_at: string | null;
}
/** Optional future contract. This does not implement or negotiate OSC reception. */
export function observeProgramStatus(value: ProgramStatusV1): RuntimeObservation {
  if (!value || Object.keys(value).sort().join() !== ['protocol','identity','revision','state','reason','changed_at'].sort().join() ||
      value.protocol !== 'repo-harness.program-status.v1' || !['idle','working','blocked','settled','error','aborted','clear'].includes(value.state)) throw new Error('program_status_invalid');
  return decodeRuntimeObservation({ identity: value.identity, revision: value.revision,
    state: value.state === 'aborted' ? 'cancelled' : value.state, reason: value.reason, changed_at: value.changed_at, source: 'program-v1' });
}
export type RuntimeInvalidation = 'updated' | 'reconnect' | 'events_lost' | 'disconnected';
export interface RuntimeSnapshot {
  bindings: readonly RuntimeIdentity[]; observations: readonly RuntimeObservation[]; pane_observations?: readonly RuntimePaneObservation[]; unclaimed?: number;
}
/** A configured transport supplies bounded structured data, never subprocess output. */
export interface RuntimeSource {
  program_status: 'unsupported' | 'v1';
  subscribe(invalidate: (event: RuntimeInvalidation) => void): Promise<() => void>;
  snapshot(epoch: number): Promise<RuntimeSnapshot>;
}

/** Explicit lifecycle outside GET. Events invalidate snapshots; they never update task state. */
export function createRuntimeStatusObserver(source: RuntimeSource, now: () => number = Date.now) {
  let lifecycle = 0;
  let epoch = 0, version = 0, connected = false, started = false, subscribed = false, stopSubscription: (() => void) | null = null;
  let last: { snapshot: RuntimeSnapshot; at: string } | null = null;
  let pending: Promise<void> | null = null;
  let failed = false;
  const revisions = new Map<string, RuntimeObservation[]>();
  const cancelled = new Set<string>();
  const paneRevisions = new Map<string, RuntimePaneObservation[]>();
  function invalidate(event: RuntimeInvalidation) {
    if (!started) return;
    version++;
    failed = true;
    if (event === 'reconnect' || event === 'events_lost') { epoch++; last = null; revisions.clear(); cancelled.clear(); paneRevisions.clear(); }
    connected = event !== 'disconnected';
    if (subscribed && connected) void Promise.resolve().then(refresh);
  }
  async function collect(owner: number) {
    // Bound event storms. Unstable data is not published. A caller can retry later.
    for (let retry = 0; retry < 3 && connected && started && owner === lifecycle; retry++) {
      const readVersion = version, readEpoch = epoch;
      try {
        const snapshot = await source.snapshot(readEpoch);
        if (readVersion !== version || readEpoch !== epoch || !connected || !started || owner !== lifecycle) continue;
        const at = new Date(now()).toISOString();
        // Validate all input before updating the cache or revision fence.
        projectRuntimeOverlay(snapshot.bindings, snapshot.observations, at, epoch, source.program_status, now(), true, snapshot.unclaimed ?? 0, snapshot.pane_observations);
        const next = new Map<string, RuntimeObservation[]>();
        const bound = runtimeBindingKeys(snapshot.bindings), unclaimed: RuntimeObservation[] = [];
        for (const raw of snapshot.observations) {
          const observation = decodeRuntimeObservation(raw), key = runtimeIdentityKey(observation.identity);
          if (!bound.has(key) || observation.identity.source_epoch !== epoch || (observation.source === 'program-v1' && source.program_status !== 'v1')) { unclaimed.push(observation); continue; }
          const group = next.get(key) ?? [];
          if (group.length && group[0].source !== observation.source) throw new Error('runtime_source_conflict');
          if (!group.length || observation.revision > group[0].revision) next.set(key, [observation]);
          else if (observation.revision === group[0].revision && !group.some(old => JSON.stringify(old) === JSON.stringify(observation))) {
            // Two variants suffice to keep this revision ambiguous.
            if (group.length < 2) group.push(observation);
          }
        }
        for (const [key, incoming] of next) {
          const old = revisions.get(key);
          if (!old) continue;
          if (old[0].source !== incoming[0].source) throw new Error('runtime_source_conflict');
          // Cancel blocks revival of this attempt. A newer clear can hide it.
          const clearsCancel = incoming.length === 1 && incoming[0].state === 'clear' && incoming[0].revision > old[0].revision;
          if (((cancelled.has(key) || (old.length === 1 && old[0].state === 'cancelled')) && !clearsCancel) || old[0].revision > incoming[0].revision) next.set(key, old);
          else if (old[0].revision === incoming[0].revision) {
            const variants = [...old, ...incoming].filter((item, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index);
            next.set(key, variants.slice(0, 2));
          }
        }
        const observations = [...unclaimed, ...[...next.values()].flat()];
        const nextPanes = new Map<string, RuntimePaneObservation[]>();
        for (const raw of snapshot.pane_observations ?? []) {
          const incoming = decodeRuntimePaneObservation(raw), key = runtimePaneKey(incoming.pane);
          const old = nextPanes.get(key) ?? paneRevisions.get(key);
          if (!old || incoming.source_epoch > old[0].source_epoch || (incoming.source_epoch === old[0].source_epoch && incoming.revision > old[0].revision)) nextPanes.set(key, [incoming]);
          else {
            // The binding routes the current card. It does not identify the emitter.
            const retained = old.map(item => ({ ...item, binding: incoming.binding }));
            if (incoming.source_epoch === old[0].source_epoch && incoming.revision === old[0].revision && !retained.some(item => JSON.stringify(item) === JSON.stringify(incoming))) retained.push(incoming);
            nextPanes.set(key, retained.slice(0, 2));
          }
        }
        const pane_observations = [...nextPanes.values()].flat();
        projectRuntimeOverlay(snapshot.bindings, observations, at, epoch, source.program_status, now(), true, snapshot.unclaimed ?? 0, pane_observations);
        const retained = new Map([...revisions, ...next]);
        const retainedPanes = new Map([...paneRevisions, ...nextPanes]);
        if (retained.size + retainedPanes.size > RUNTIME_LIMIT) throw new Error('runtime_revision_limit');
        last = { snapshot: { bindings: snapshot.bindings.map(decodeRuntimeIdentity), observations, pane_observations, unclaimed: snapshot.unclaimed ?? 0 }, at };
        revisions.clear(); for (const [key, group] of retained) revisions.set(key, group);
        paneRevisions.clear(); for (const [key, group] of retainedPanes) paneRevisions.set(key, group);
        for (const [key, group] of next) if (group.length === 1 && group[0].state === 'cancelled') cancelled.add(key);
        failed = false; return;
      } catch { if (owner === lifecycle && started) failed = true; return; }
    }
    if (owner === lifecycle && started) failed = true;
  }
  function refresh(): Promise<void> {
    if (!started || !connected || !subscribed) return Promise.resolve();
    if (!pending) {
      const request = collect(lifecycle).finally(() => { if (pending === request) pending = null; });
      pending = request;
    }
    return pending;
  }
  return {
    async start() {
      if (started) throw new Error('runtime_already_started');
      if (lifecycle > 0) { epoch++; version++; last = null; revisions.clear(); cancelled.clear(); paneRevisions.clear(); }
      const owner = ++lifecycle;
      started = true; connected = true; subscribed = false;
      try {
        const close = await source.subscribe(event => { if (owner === lifecycle && started) invalidate(event); });
        if (owner !== lifecycle || !started) { close(); return; }
        stopSubscription = close; subscribed = true; await refresh();
      } catch {
        if (owner === lifecycle) { started = false; subscribed = false; connected = false; failed = true; }
      }
    },
    refresh,
    invalidate,
    read(): RuntimeOverlay {
      if (!last) return unavailableRuntimeOverlay(epoch);
      const overlay = projectRuntimeOverlay(last.snapshot.bindings, last.snapshot.observations, last.at, epoch, source.program_status, now(), connected, last.snapshot.unclaimed ?? 0, last.snapshot.pane_observations);
      return failed ? { ...overlay, status: 'unavailable' } : overlay;
    },
    stop() { lifecycle++; version++; started = false; subscribed = false; connected = false; failed = true; pending = null; stopSubscription?.(); stopSubscription = null; },
  };
}

export interface NativeRuntimeSource {
  source_id: string; provider: NativeRuntimeProvider;
  snapshot(): Promise<RuntimeCaptureSnapshot>;
}
interface NativeRuntimeFence {
  generation: string; sequence: number; content: string; rejected_through: number;
  retired: Set<string>;
}
/** Native sources have separate clocks and no dispatch binding authority. */
export function createNativeRuntimeStatusObserver(sources: readonly NativeRuntimeSource[], now: () => number = Date.now) {
  if (!sources.length || sources.length > NATIVE_RUNTIME_SOURCE_LIMIT || new Set(sources.map(s => s.source_id)).size !== sources.length) throw new Error('runtime_native_sources');
  const fences = new Map<string, NativeRuntimeFence>();
  const unavailable = (source: NativeRuntimeSource): NativeRuntimeSourceSummary => ({ source_id: source.source_id, provider: source.provider,
    generation: null, capture_status: 'unavailable', heartbeat_at: null, freshness: 'unavailable', observations: [] });
  let summaries = sources.map(unavailable), observedAt: string | null = null;
  let started = false, stopped = false, pending: Promise<void> | null = null;
  async function collect() {
    const next: NativeRuntimeSourceSummary[] = [];
    for (const source of sources) {
      if (stopped) return;
      try {
        const snapshot = decodeRuntimeCaptureSnapshot(await source.snapshot()), clock = now();
        if (stopped) return;
        if (snapshot.source_id !== source.source_id || snapshot.provider !== source.provider) throw new Error('runtime_native_identity');
        const old = fences.get(source.source_id), content = JSON.stringify(snapshot);
        if (old) {
          if (snapshot.generation !== old.generation) {
            if (old.retired.has(snapshot.generation) || old.retired.size >= RUNTIME_LIMIT) throw new Error('runtime_native_generation');
          } else {
            if (snapshot.sequence < old.sequence || (snapshot.sequence === old.sequence && content !== old.content)) {
              old.rejected_through = Math.max(old.rejected_through, old.sequence);
              throw new Error('runtime_native_sequence');
            }
            if (snapshot.sequence <= old.rejected_through) throw new Error('runtime_native_sequence');
          }
        }
        if (Date.parse(snapshot.heartbeat_at) > clock || snapshot.observations.some(o => Date.parse(o.event_received_at) > clock || (o.changed_at !== null && Date.parse(o.changed_at) > clock))) throw new Error('runtime_native_future');
        const retired = old?.retired ?? new Set<string>();
        if (old && old.generation !== snapshot.generation) retired.add(old.generation);
        fences.set(source.source_id, { generation: snapshot.generation, sequence: snapshot.sequence, content, retired,
          rejected_through: old?.generation === snapshot.generation ? old.rejected_through : -1 });
        next.push({ source_id: snapshot.source_id, provider: snapshot.provider, generation: snapshot.generation,
          capture_status: snapshot.capture_status, heartbeat_at: snapshot.heartbeat_at,
          freshness: nativeRuntimeFreshness(snapshot, clock), observations: snapshot.capture_status === 'unavailable' ? [] : snapshot.observations });
      } catch { next.push(unavailable(source)); }
    }
    if (!stopped) { summaries = next; observedAt = new Date(now()).toISOString(); }
  }
  function refresh(): Promise<void> {
    if (!started || stopped) return Promise.resolve();
    if (!pending) pending = collect().finally(() => { pending = null; });
    return pending;
  }
  return {
    async start() { if (started || stopped) throw new Error('runtime_already_started'); started = true; await refresh(); },
    refresh,
    read(): RuntimeOverlay {
      const native_sources = summaries.map(source => ({ ...structuredClone(source), freshness: stopped ? 'unavailable' as const : nativeRuntimeFreshness(source, now()) }));
      return { ...unavailableRuntimeOverlay(), status: !stopped && native_sources.some(s => s.freshness === 'fresh' || s.freshness === 'stale') ? 'ready' : 'unavailable',
        observed_at: observedAt, native_sources };
    },
    stop() { stopped = true; },
  };
}
