import { decodeRuntimeIdentity, runtimeId, runtimeInteger, runtimeBindingKeys, runtimeIdentityKey, RUNTIME_LIMIT, type RuntimeIdentity } from '../../core/operator/runtime-status';
import { observeHcTerminal, type RuntimeInvalidation, type RuntimeSource } from './runtime-status';

/** Normalized adapter contract, not a claim about Herdr's socket envelope. */
export const RUNTIME_SOURCE_PROTOCOL = 'repo-harness.runtime-source.v1';
export const RUNTIME_SOURCE_EVENTS = ['terminal.changed','reconnect','events_lost','disconnected'] as const;
export interface RuntimeSourceCapabilities {
  /** `hc_core` is the answering core's `core.id` (hc `server.status`). */
  protocol: typeof RUNTIME_SOURCE_PROTOCOL; source_host: string; hc_core: string; agent_status: true;
}
export interface StructuredRuntimeTransport {
  capabilities(signal: AbortSignal): Promise<unknown>;
  /** Transport failures stay internal; only the observer selects public failure facts. */
  subscribe(events: readonly string[], invalidate: (event: string, error?: unknown) => void, signal: AbortSignal): Promise<() => void>;
  snapshot(signal: AbortSignal): Promise<unknown>;
}
export interface ConfiguredRuntimeSource {
  source_host: string; deadline_ms: number;
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
function matches(value: Record<string, unknown>, source_host: string, hc_core: string): void {
  if (value.source_host !== source_host || value.hc_core !== hc_core) throw new Error('runtime_source_identity');
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
  runtimeId(config.source_host);
  if (!Number.isSafeInteger(config.deadline_ms) || config.deadline_ms < 1 || config.deadline_ms > 10_000) throw new Error('runtime_source_config');
  const raw = await deadline(config.deadline_ms, signal => config.transport.capabilities(signal));
  bounded(raw);
  const capabilities = object(raw, ['protocol','source_host','hc_core','agent_status']);
  // The core names itself; every later frame and binding must name the same core.
  const hc_core = runtimeId(capabilities.hc_core);
  matches(capabilities, config.source_host, hc_core);
  if (capabilities.protocol !== RUNTIME_SOURCE_PROTOCOL || capabilities.agent_status !== true) throw new Error('runtime_source_capability');
  return {
    async subscribe(invalidate) {
      let active = true;
      const callback = (event: string, error?: unknown) => {
        if (!active || !(RUNTIME_SOURCE_EVENTS as readonly string[]).includes(event)) return;
        const lifecycle = ['reconnect','events_lost','disconnected'].includes(event);
        invalidate(lifecycle && error !== undefined ? { type: 'failure', error } : lifecycle ? event as RuntimeInvalidation : 'updated');
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
        if (bindings.some(b => b.source_host !== config.source_host || b.hc_core !== hc_core || b.source_epoch !== epoch)) throw new Error('runtime_binding_identity');
        const raw = await config.transport.snapshot(signal);
        if (signal.aborted) throw new Error('runtime_source_timeout');
        bounded(raw);
        const frame = object(raw, ['protocol','source_host','hc_core','terminals']);
        matches(frame, config.source_host, hc_core);
        if (frame.protocol !== 'repo-harness.runtime-source.snapshot.v2' || !Array.isArray(frame.terminals) || frame.terminals.length > RUNTIME_LIMIT) throw new Error('runtime_source_frame');
        const after = (await config.bindings(epoch, signal)).map(decodeRuntimeIdentity);
        if (signal.aborted) throw new Error('runtime_source_timeout');
        const keys = (values: RuntimeIdentity[]) => JSON.stringify(values.map(runtimeIdentityKey).sort());
        if (keys(bindings) !== keys(after)) throw new Error('runtime_binding_changed');
        const observations = [];
        const bound = runtimeBindingKeys(bindings);
        let unclaimed = 0;
        for (const terminal of frame.terminals) {
          const matched = bindings.map(binding => observeHcTerminal(terminal, binding)).filter(value => value !== null);
          const routes = matched.filter(value => bound.has(runtimeIdentityKey(value.identity)));
          if (!routes.length) unclaimed++;
          observations.push(...matched);
        }
        return { bindings, observations, unclaimed };
      });
    },
  };
}
