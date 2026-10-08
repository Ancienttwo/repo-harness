import { decodeRuntimeIdentity, decodeRuntimeObservation, decodeRuntimePaneObservation, runtimePaneKey, projectRuntimeOverlay, runtimeIdentityKey, runtimeBindingKeys, runtimeInteger,
  unavailableRuntimeOverlay, RUNTIME_LIMIT, type RuntimeIdentity, type RuntimeObservation, type RuntimeOverlay, type RuntimePaneObservation } from '../../core/operator/runtime-status';

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
