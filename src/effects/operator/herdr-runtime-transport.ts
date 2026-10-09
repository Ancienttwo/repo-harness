import { HERDR_OBSERVATION_REVISION, herdrAgentSessionKey, herdrObject, herdrProgramStatus, requestHerdrObservation, subscribeHerdrObservation, verifyHerdrVersion,
  type HerdrObservationEndpoint } from '../terminal/herdr-observation';
import type { StructuredRuntimeTransport } from './runtime-source';
import { RUNTIME_SOURCE_PROTOCOL } from './runtime-source';

/** Uses the pinned schema and exact 0.9.3/protocol-22 read methods. */
export function createHerdrRuntimeTransport(endpoint: HerdrObservationEndpoint, source_host: string, herdr_session: string) {
  let connections = new AbortController();
  let active = false, ready = false, generation = 0;
  let programStatus: boolean | undefined;
  let globalClose: (() => void) | null = null, statusClose: (() => void) | null = null;
  let statusKey = '', retry: ReturnType<typeof setTimeout> | null = null;
  let invalidate: (event: string) => void = () => {};
  const metadata = { source_host, herdr_session, source_revision: HERDR_OBSERVATION_REVISION };
  const globalSubscriptions = ['pane.created','pane.updated','pane.moved','pane.exited','pane.closed'].map(type => ({ type }));
  const lifecycleEvents: Record<string, string> = { pane_created: 'pane.created', pane_updated: 'pane.updated', pane_moved: 'pane.moved', pane_exited: 'pane.exited', pane_closed: 'pane.closed' };
  function closeConnections() {
    generation++; ready = false; statusKey = '';
    connections.abort(); connections = new AbortController();
    globalClose?.(); statusClose?.(); globalClose = null; statusClose = null;
  }
  function close() {
    active = false; if (retry) clearTimeout(retry); retry = null; closeConnections();
  }
  async function ping(signal?: AbortSignal) {
    const result = await requestHerdrObservation(endpoint, 'ping', signal ? AbortSignal.any([signal, connections.signal]) : connections.signal);
    if (result.type !== 'pong') throw new Error('herdr_runtime_ping');
    verifyHerdrVersion(result);
    const capability = herdrObject(result.capabilities).program_status_root_v1;
    if (capability !== undefined && typeof capability !== 'boolean') throw new Error('herdr_runtime_program_capability');
    const enabled = capability === true;
    if (programStatus !== undefined && programStatus !== enabled) throw new Error('herdr_runtime_program_capability_changed');
    programStatus = enabled;
  }
  function lost(code: string, connectionGeneration: number) {
    if (!active || connectionGeneration !== generation) return;
    closeConnections(); invalidate(code === 'events_lost' ? 'events_lost' : 'disconnected');
    const reconnect = async () => {
      retry = null; if (!active) return;
      try { await ping(); if (!active) return; await connectGlobal(); if (active) invalidate('reconnect'); }
      catch { if (active) retry = setTimeout(reconnect, 1000); }
    };
    retry = setTimeout(reconnect, 1000);
  }
  async function connectGlobal() {
    if (!active) throw new Error('herdr_runtime_stopped');
    const current = generation;
    const stop = await subscribeHerdrObservation(endpoint, globalSubscriptions, event => {
      if (active && current === generation && lifecycleEvents[event]) invalidate(lifecycleEvents[event]);
    }, code => lost(code, current), connections.signal);
    if (!active || current !== generation) { stop(); throw new Error('herdr_runtime_stopped'); }
    globalClose = stop; ready = true;
  }
  async function subscribeStatuses(paneIds: string[], signal: AbortSignal) {
    if (!active || signal.aborted) throw new Error('herdr_runtime_stopped');
    const key = JSON.stringify([...new Set(paneIds)].sort());
    if (key === statusKey) return;
    const current = generation;
    const stop = paneIds.length ? await subscribeHerdrObservation(endpoint,
      [...new Set(paneIds)].map(pane_id => ({ type: 'pane.agent_status_changed', pane_id })),
      event => { if (active && current === generation && event === 'pane.agent_status_changed') invalidate(event); }, code => lost(code, current), AbortSignal.any([signal, connections.signal])) : null;
    if (!active || current !== generation || signal.aborted) { stop?.(); throw new Error('herdr_runtime_stopped'); }
    statusClose?.(); statusClose = stop; statusKey = key;
    // The global subscription preceded bootstrap. Read again after exact status IDs are subscribed.
    invalidate('pane.updated');
  }
  const transport: StructuredRuntimeTransport = {
    async capabilities(signal) {
      await ping(signal);
      return { protocol: RUNTIME_SOURCE_PROTOCOL, ...metadata, agent_status: true, program_status: programStatus ? 'v1' : 'unsupported' };
    },
    async subscribe(_events, callback, signal) {
      if (active) throw new Error('herdr_runtime_subscribed');
      active = true; invalidate = callback;
      const abort = () => close(); signal.addEventListener('abort', abort, { once: true });
      try { if (signal.aborted) throw new Error('herdr_runtime_aborted'); await connectGlobal(); }
      catch (error) { close(); throw error; }
      finally { signal.removeEventListener('abort', abort); }
      return close;
    },
    async snapshot(signal) {
      if (!active || !ready) throw new Error('herdr_runtime_disconnected');
      const current = generation;
      const result = await requestHerdrObservation(endpoint, 'session.snapshot', AbortSignal.any([signal, connections.signal]));
      if (result.type !== 'session_snapshot') throw new Error('herdr_runtime_snapshot');
      const snapshot = herdrObject(result.snapshot); verifyHerdrVersion(snapshot);
      if (!Array.isArray(snapshot.panes) || snapshot.panes.length > 512 || !['workspaces','tabs','layouts','agents'].every(key => Array.isArray(snapshot[key]))) throw new Error('herdr_runtime_snapshot');
      const panes = snapshot.panes.map(raw => {
        const p = herdrObject(raw);
        if (typeof p.pane_id !== 'string' || typeof p.terminal_id !== 'string' || !Number.isSafeInteger(p.revision) || (p.revision as number) < 0 || !['idle','working','blocked','done','unknown'].includes(p.agent_status as string)) throw new Error('herdr_runtime_pane');
        if (!programStatus && p.program_status != null) throw new Error('herdr_runtime_program_capability');
        return { pane_id: p.pane_id, terminal_id: p.terminal_id, agent_status: p.agent_status, revision: p.revision, agent_session: herdrAgentSessionKey(p.agent_session),
          ...(programStatus && p.program_status != null ? { program_status: herdrProgramStatus(p.program_status) } : {}) };
      });
      if (new Set(panes.map(p => p.pane_id)).size !== panes.length) throw new Error('herdr_runtime_duplicate_pane');
      if (current !== generation || !active || signal.aborted) throw new Error('herdr_runtime_disconnected');
      await subscribeStatuses(panes.map(p => p.pane_id), signal);
      if (current !== generation || !ready || signal.aborted) throw new Error('herdr_runtime_disconnected');
      return { protocol: 'repo-harness.runtime-source.snapshot.v1', ...metadata, panes, program_status: [] };
    },
  };
  return { transport, close };
}
