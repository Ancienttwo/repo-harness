import { decodeRuntimeIdentity, decodeRuntimePaneObservation, runtimeId, runtimeInteger, runtimeBindingKeys, runtimeIdentityKey, RUNTIME_LIMIT, type RuntimeIdentity, type RuntimePaneObservation } from '../../core/operator/runtime-status';
import { observeHerdrPane, observeProgramStatus, type ProgramStatusV1, type RuntimeInvalidation, type RuntimeSource } from './runtime-status';

/** Normalized adapter contract, not a claim about Herdr's socket envelope. */
export const RUNTIME_SOURCE_PROTOCOL = 'repo-harness.runtime-source.v1';
export const RUNTIME_SOURCE_EVENTS = ['pane.agent_status_changed','pane.created','pane.updated','pane.moved','pane.exited','pane.closed','reconnect','events_lost','disconnected'] as const;
export interface RuntimeSourceCapabilities {
  protocol: typeof RUNTIME_SOURCE_PROTOCOL; source_host: string; herdr_session: string;
  source_revision: string; agent_status: true; program_status: 'unsupported' | 'v1';
}
export interface StructuredRuntimeTransport {
  capabilities(signal: AbortSignal): Promise<unknown>;
  subscribe(events: readonly string[], invalidate: (event: string) => void, signal: AbortSignal): Promise<() => void>;
  snapshot(signal: AbortSignal): Promise<unknown>;
}
export interface ConfiguredRuntimeSource {
  source_host: string; herdr_session: string; source_revision: string; deadline_ms: number;
  transport: StructuredRuntimeTransport;
  /** Explicit owner-supplied identity. The adapter never synthesizes it. */
  bindings(epoch: number, signal: AbortSignal): Promise<readonly RuntimeIdentity[]>;
}
function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...fields].sort().join()) throw new Error('runtime_source_shape');
  return value as Record<string, unknown>;
}
function bounded(value: unknown): void {
  // Transport must also enforce this byte limit before JSON parsing.
  const bytes = JSON.stringify(value);
  if (typeof bytes !== 'string' || Buffer.byteLength(bytes) > 1024 * 1024) throw new Error('runtime_source_limit');
}
function matches(value: Record<string, unknown>, config: ConfiguredRuntimeSource): void {
  if (value.source_host !== config.source_host || value.herdr_session !== config.herdr_session || value.source_revision !== config.source_revision) throw new Error('runtime_source_identity');
}
function deadline<T>(ms: number, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('runtime_source_timeout')); }, ms);
  });
  return Promise.race([Promise.resolve().then(() => read(controller.signal)), timeout]).finally(() => clearTimeout(timer));
}
/** Explicit setup outside HTTP. Tests can supply a synthetic structured transport. */
export async function configureRuntimeSource(config: ConfiguredRuntimeSource): Promise<RuntimeSource> {
  config = { ...config };
  runtimeId(config.source_host); runtimeId(config.herdr_session);
  if (!/^[a-f0-9]{40}$/.test(config.source_revision) || !Number.isSafeInteger(config.deadline_ms) || config.deadline_ms < 1 || config.deadline_ms > 10_000) throw new Error('runtime_source_config');
  const raw = await deadline(config.deadline_ms, signal => config.transport.capabilities(signal));
  bounded(raw);
  const capabilities = object(raw, ['protocol','source_host','herdr_session','source_revision','agent_status','program_status']);
  matches(capabilities, config);
  if (capabilities.protocol !== RUNTIME_SOURCE_PROTOCOL || capabilities.agent_status !== true || !['unsupported','v1'].includes(capabilities.program_status as string)) throw new Error('runtime_source_capability');
  const program_status = capabilities.program_status as RuntimeSource['program_status'];
  return {
    program_status,
    async subscribe(invalidate) {
      let active = true;
      const callback = (event: string) => {
        if (!active || !(RUNTIME_SOURCE_EVENTS as readonly string[]).includes(event)) return;
        const lifecycle = ['reconnect','events_lost','disconnected'].includes(event);
        invalidate(lifecycle ? event as RuntimeInvalidation : 'updated');
      };
      // A late subscription completion must be closed after a deadline failure.
      const unsubscribe = await deadline(config.deadline_ms, async signal => {
        const close = await config.transport.subscribe(RUNTIME_SOURCE_EVENTS, callback, signal);
        if (signal.aborted) { active = false; close(); throw new Error('runtime_source_timeout'); }
        return close;
      }).catch(error => { active = false; throw error; });
      return () => { active = false; unsubscribe(); };
    },
    async snapshot(epoch) {
      runtimeInteger(epoch);
      return deadline(config.deadline_ms, async signal => {
        // Keep binding and source reads serial. Recheck subscriptions in the observer.
        const bindings = (await config.bindings(epoch, signal)).map(decodeRuntimeIdentity);
        if (signal.aborted) throw new Error('runtime_source_timeout');
        runtimeBindingKeys(bindings);
        if (bindings.some(b => b.source_host !== config.source_host || b.herdr_session !== config.herdr_session || b.source_epoch !== epoch)) throw new Error('runtime_binding_identity');
        const raw = await config.transport.snapshot(signal);
        if (signal.aborted) throw new Error('runtime_source_timeout');
        bounded(raw);
        const frame = object(raw, ['protocol','source_host','herdr_session','source_revision','panes','program_status']);
        matches(frame, config);
        if (frame.protocol !== 'repo-harness.runtime-source.snapshot.v1' || !Array.isArray(frame.panes) || !Array.isArray(frame.program_status) || frame.panes.length + frame.program_status.length > RUNTIME_LIMIT) throw new Error('runtime_source_frame');
        if (program_status === 'unsupported' && frame.program_status.length) throw new Error('runtime_source_capability');
        const after = (await config.bindings(epoch, signal)).map(decodeRuntimeIdentity);
        if (signal.aborted) throw new Error('runtime_source_timeout');
        const keys = (values: RuntimeIdentity[]) => JSON.stringify(values.map(runtimeIdentityKey).sort());
        if (keys(bindings) !== keys(after)) throw new Error('runtime_binding_changed');
        const observations = [];
        const pane_observations: RuntimePaneObservation[] = [];
        const bound = runtimeBindingKeys(bindings);
        let unclaimed = 0;
        for (const pane of frame.panes) {
          const matched = bindings.map(binding => observeHerdrPane(pane, binding)).filter(value => value !== null);
          const root = pane && typeof pane === 'object' ? (pane as Record<string, unknown>).program_status : undefined;
          const routes = matched.filter(value => bound.has(runtimeIdentityKey(value.identity)));
          if (root !== undefined) {
            if (program_status !== 'v1') throw new Error('runtime_source_capability');
            const p = pane as Record<string, unknown>, status = object(root, ['protocol','revision','source_epoch','changed_at','state','reason']);
            if (status.protocol !== 'repo-harness.program-status.v1') throw new Error('runtime_source_program');
            pane_observations.push(decodeRuntimePaneObservation({ scope: 'pane', source: 'osc7501',
              pane: { source_host: config.source_host, herdr_session: config.herdr_session, terminal_id: p.terminal_id, pane_id: p.pane_id, agent_session: p.agent_session },
              binding: routes.length === 1 ? routes[0].identity : null, source_epoch: status.source_epoch, revision: status.revision,
              state: status.state, reason: status.reason, changed_at: status.changed_at }));
          }
          if (!routes.length) unclaimed++;
          if (program_status === 'unsupported') observations.push(...matched);
        }
        observations.push(...frame.program_status.map(value => observeProgramStatus(value as ProgramStatusV1)));
        return { bindings, observations, pane_observations, unclaimed };
      });
    },
  };
}
