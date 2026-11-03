import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { runtimeId, unavailableRuntimeOverlay, NATIVE_RUNTIME_SOURCE_LIMIT, type RuntimeOverlay } from '../../core/operator/runtime-status';
import { runtimeCaptureId } from '../../core/operator/runtime-capture';
import { createHerdrCoreRuntimeTransport } from './herdr-runtime-transport';
import { configureRuntimeSource } from './runtime-source';
import { createRuntimeStatusObserver, createNativeRuntimeStatusObserver, runtimeUnavailableReason } from './runtime-status';
import { readNativeRuntimeSnapshot, type NativeRuntimeSourceConfig } from './native-runtime-source';

/** The core is the one the server's environment selects (`HC_SESSION` / `HC_SOCKET`); it names itself by `core.id`. */
export interface HerdrCoreRuntimeConfig {
  protocol: 'repo-harness.runtime-config.v2'; kind: 'herdr-core'; source_host: string; deadline_ms: number;
}
export interface NativeRuntimeConfig {
  protocol: 'repo-harness.runtime-config.v2'; kind: 'native'; sources: NativeRuntimeSourceConfig[];
}
export type RuntimeConfig = HerdrCoreRuntimeConfig | NativeRuntimeConfig;
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
  // #1478: classic Herdr is retired; there is no translation of a classic config.
  if ((v as { kind: string }).kind === 'herdr') {
    throw new Error('runtime_config_classic_herdr_retired: write {"protocol":"repo-harness.runtime-config.v2","kind":"herdr-core","source_host":"<host>","deadline_ms":<ms>}');
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
  if (v.kind !== 'herdr-core' || Object.keys(v).sort().join() !== ['deadline_ms','kind','protocol','source_host'].join()) throw new Error('runtime_config_invalid');
  runtimeId(v.source_host);
  if (!Number.isSafeInteger(v.deadline_ms) || v.deadline_ms < 1 || v.deadline_ms > 10_000) throw new Error('runtime_config_invalid');
  return { ...v };
}
/** Starts only from explicit configuration, before HTTP admission. No GET source work. */
export async function startRuntimeService(path: string, env: NodeJS.ProcessEnv = process.env) {
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
  let transport: ReturnType<typeof createHerdrCoreRuntimeTransport> | null = null;
  const refresh = () => {
    if (closed) return Promise.resolve();
    if (!pending) pending = (async () => {
      try {
        if (!observer) {
          transport = createHerdrCoreRuntimeTransport(config.source_host, env);
          const source = await configureRuntimeSource({ source_host: config.source_host, deadline_ms: config.deadline_ms, transport: transport.transport,
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
