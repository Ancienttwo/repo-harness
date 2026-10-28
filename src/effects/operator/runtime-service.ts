import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { runtimeId, unavailableRuntimeOverlay, NATIVE_RUNTIME_SOURCE_LIMIT, type RuntimeOverlay } from '../../core/operator/runtime-status';
import { runtimeCaptureId } from '../../core/operator/runtime-capture';
import { createHerdrRuntimeTransport } from './herdr-runtime-transport';
import { configureRuntimeSource } from './runtime-source';
import { createRuntimeStatusObserver, createNativeRuntimeStatusObserver, runtimeUnavailableReason } from './runtime-status';
import { readNativeRuntimeSnapshot, type NativeRuntimeSourceConfig } from './native-runtime-source';
import { HERDR_OBSERVATION_REVISION, validateObservationEndpoint } from '../terminal/herdr-observation';

export interface HerdrRuntimeConfig {
  protocol: 'repo-harness.runtime-config.v2'; kind: 'herdr'; source_host: string; herdr_session: string;
  socket_path: string; deadline_ms: number;
}
export interface NativeRuntimeConfig {
  protocol: 'repo-harness.runtime-config.v2'; kind: 'native'; sources: NativeRuntimeSourceConfig[];
}
export type RuntimeConfig = HerdrRuntimeConfig | NativeRuntimeConfig;
function readBounded(path: string): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('runtime_config_file');
  const bytes = readFileSync(path); if (bytes.length > 1024 * 1024) throw new Error('runtime_config_file');
  return bytes;
}
export function decodeRuntimeConfig(value: unknown): RuntimeConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('runtime_config_invalid');
  const v = value as RuntimeConfig;
  if (v.protocol !== 'repo-harness.runtime-config.v2') throw new Error('runtime_config_invalid');
  if (v.kind === 'herdr' && ('bindings_path' in v || 'pipeline_snapshot' in v)) {
    throw new Error('runtime_config_retired_fields: remove bindings_path and pipeline_snapshot; task bindings are no longer supported');
  }
  if (v.kind === 'native') {
    if (Object.keys(v).sort().join() !== 'kind,protocol,sources' || !Array.isArray(v.sources) || !v.sources.length || v.sources.length > NATIVE_RUNTIME_SOURCE_LIMIT) throw new Error('runtime_config_invalid');
    const ids = new Set<string>(), paths = new Set<string>();
    const sources = v.sources.map(source => {
      if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).sort().join() !== 'provider,snapshot_path,source_id' || !['codex','claude','pi'].includes(source.provider)) throw new Error('runtime_config_source');
      const source_id = runtimeCaptureId(source.source_id);
      if (typeof source.snapshot_path !== 'string' || !isAbsolute(source.snapshot_path) || ids.has(source_id) || paths.has(source.snapshot_path)) throw new Error('runtime_config_source');
      ids.add(source_id); paths.add(source.snapshot_path);
      return { source_id, provider: source.provider, snapshot_path: source.snapshot_path };
    });
    return { protocol: v.protocol, kind: 'native', sources };
  }
  if (v.kind !== 'herdr' || Object.keys(v).sort().join() !== ['deadline_ms','herdr_session','kind','protocol','socket_path','source_host'].join()) throw new Error('runtime_config_invalid');
  runtimeId(v.source_host); runtimeId(v.herdr_session); validateObservationEndpoint(v);
  return { ...v };
}
/** Starts only from explicit configuration, before HTTP admission. No GET source work. */
export async function startRuntimeService(path: string) {
  if (!isAbsolute(path)) throw new Error('runtime_config_path');
  const config = decodeRuntimeConfig(JSON.parse(readBounded(path).toString()));
  if (config.kind === 'native') {
    const observer = createNativeRuntimeStatusObserver(config.sources.map(source => ({ source_id: source.source_id, provider: source.provider,
      snapshot: () => readNativeRuntimeSnapshot(source) })));
    await observer.start();
    const timer = setInterval(() => { void observer.refresh(); }, 30_000); timer.unref();
    return { read: observer.read, refresh: observer.refresh, close: () => { clearInterval(timer); observer.stop(); } };
  }
  let unavailable = unavailableRuntimeOverlay();
  let closed = false, pending: Promise<void> | null = null;
  let observer: ReturnType<typeof createRuntimeStatusObserver> | null = null;
  let transport: ReturnType<typeof createHerdrRuntimeTransport> | null = null;
  const refresh = () => {
    if (closed) return Promise.resolve();
    if (!pending) pending = (async () => {
      try {
        if (!observer) {
          transport = createHerdrRuntimeTransport(config, config.source_host, config.herdr_session);
          const source = await configureRuntimeSource({ ...config, source_revision: HERDR_OBSERVATION_REVISION, transport: transport.transport,
            bindings: async () => [] });
          if (closed) { transport.close(); return; }
          observer = createRuntimeStatusObserver(source); await observer.start();
          const initial = observer.read();
          if (initial.observed_at === null) { unavailable = initial; observer.stop(); transport.close(); observer = null; }
        } else await observer.refresh();
      } catch (error) {
        unavailable = unavailableRuntimeOverlay(0, runtimeUnavailableReason(error));
        transport?.close(); observer?.stop(); observer = null;
      }
    })().finally(() => { pending = null; });
    return pending;
  };
  await refresh();
  const timer = setInterval(() => { void refresh(); }, 30_000); timer.unref();
  return { read: (): RuntimeOverlay => observer?.read() ?? structuredClone(unavailable),
    close: () => { closed = true; clearInterval(timer); observer?.stop(); transport?.close(); }, refresh };
}
