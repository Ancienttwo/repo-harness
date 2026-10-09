import { readFileSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { decodeRuntimeIdentity, runtimeId, runtimeInteger, runtimeBindingKeys, unavailableRuntimeOverlay, NATIVE_RUNTIME_SOURCE_LIMIT, type RuntimeIdentity, type RuntimeOverlay } from '../../core/operator/runtime-status';
import { runtimeCaptureId } from '../../core/operator/runtime-capture';
import type { PipelineRecord } from '../../core/pipeline/types';
import { decodeRecord } from '../../core/pipeline/types';
import { projectedRuns, type LogObservation } from '../../core/pipeline/projection';
import { openSnapshot } from '../pipeline/store';
import { createHerdrRuntimeTransport } from './herdr-runtime-transport';
import { configureRuntimeSource } from './runtime-source';
import { createRuntimeStatusObserver, createNativeRuntimeStatusObserver } from './runtime-status';
import { readNativeRuntimeSnapshot, type NativeRuntimeSourceConfig } from './native-runtime-source';
import { HERDR_OBSERVATION_REVISION, validateObservationEndpoint } from '../terminal/herdr-observation';

export interface HerdrRuntimeConfig {
  protocol: 'repo-harness.runtime-config.v2'; kind: 'herdr'; source_host: string; herdr_session: string;
  socket_path: string; deadline_ms: number; bindings_path: string | null; pipeline_snapshot: string | null;
}
export interface NativeRuntimeConfig {
  protocol: 'repo-harness.runtime-config.v2'; kind: 'native'; sources: NativeRuntimeSourceConfig[];
}
export type RuntimeConfig = HerdrRuntimeConfig | NativeRuntimeConfig;
const digest = (bytes: string | Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
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
  if (v.kind !== 'herdr' || Object.keys(v).sort().join() !== ['bindings_path','deadline_ms','herdr_session','kind','pipeline_snapshot','protocol','socket_path','source_host'].join()) throw new Error('runtime_config_invalid');
  runtimeId(v.source_host); runtimeId(v.herdr_session); validateObservationEndpoint(v);
  for (const path of [v.bindings_path, v.pipeline_snapshot]) if (path !== null && (typeof path !== 'string' || !isAbsolute(path))) throw new Error('runtime_config_path');
  if ((v.bindings_path === null) !== (v.pipeline_snapshot === null)) throw new Error('runtime_config_binding');
  return { ...v };
}
/** Existing enrolled request + owned dispatch artifacts validate each explicitly supplied link. */
export function verifyRuntimeDispatchBindings(candidates: readonly RuntimeIdentity[], records: readonly PipelineRecord[], epoch: number,
  read: (path: string) => Buffer = readBounded, logs: LogObservation[] = []): RuntimeIdentity[] {
  runtimeInteger(epoch); runtimeBindingKeys(candidates);
  const marker = logs.map(log => log.kind).lastIndexOf('restore_epoch');
  const currentLogs = marker < 0 ? logs : logs.slice(marker + 1);
  const verified: RuntimeIdentity[] = [];
  for (const raw of candidates) {
    const identity = decodeRuntimeIdentity(raw);
    try {
      const record = records.find(r => r.source_host === identity.source_host && digest(r.repository_id) === identity.repository_id && r.task.value === identity.task && r.state_version === identity.pipeline_state_version);
      if (!record) continue;
      const matches = (r: PipelineRecord['runs'][number]) => r.role === identity.role && r.round === identity.round && r.request_id === identity.request_id && r.context_sha256 === identity.context_sha256;
      const storedEnrollment = record.observations.some(o => o.kind === 'enrollment' && o.source === 'outbox') && record.runs.some(matches);
      const loggedEnrollment = currentLogs.some(o => o.kind === 'enrollment' && o.source === 'outbox' && o.source_host === record.source_host && o.repository_id === record.repository_id && o.task === record.task.value && Array.isArray(o.payload.runs) && o.payload.runs.some(matches));
      if (!storedEnrollment && !loggedEnrollment) continue;
      const runs = projectedRuns(record, structuredClone(logs)), run = runs.find(matches);
      if (!run || run.pane.closed_at !== null || run.source_host !== identity.source_host || run.pane.host !== identity.source_host || run.pane.herdr_session !== identity.herdr_session || run.pane.pane_id !== identity.pane_id || run.attempt !== identity.attempt || run.endpoint.session !== identity.herdr_session || runs.some(r => r.role === run.role && r.round > run.round)) continue;
      const bytes = read(run.session_ref), binding = JSON.parse(bytes.toString());
      if (binding.protocol !== 2 || binding.runtime !== 'herdr' || binding.repository_id !== record.repository_id || binding.task !== identity.task || binding.role !== identity.role || binding.endpoint?.session !== identity.herdr_session || binding.pane_id !== identity.pane_id || binding.terminal_id !== identity.terminal_id || binding.ownership?.disposition !== 'created' || binding.ownership.intent_id !== identity.generation || binding.provider?.ownership?.disposition !== 'created' || binding.provider.ownership.intent_id !== identity.generation || digest(bytes) !== identity.runtime_session) continue;
      const request = JSON.parse(read(join(dirname(run.session_ref), `request-${identity.round}.json`)).toString());
      if (request.protocol !== 2 || request.task !== identity.task || request.role !== identity.role || request.round !== identity.round || request.request_id !== identity.request_id || request.context_sha256 !== identity.context_sha256 || request.context_ref !== run.context_ref || request.source_ref !== run.source_ref || request.result_ref !== run.result_ref || digest(read(request.context_ref)) !== identity.context_sha256) continue;
      const intent = JSON.parse(read(join(dirname(run.session_ref), 'intent.json')).toString());
      const pane = JSON.parse(read(join(dirname(run.session_ref), 'pane-created.json')).toString());
      const provider = JSON.parse(read(join(dirname(run.session_ref), 'provider-created.json')).toString());
      if (intent.intent_id !== identity.generation || intent.spec?.task !== identity.task || intent.spec?.role !== identity.role || intent.spec?.endpoint?.session !== identity.herdr_session || pane.intent_id !== identity.generation || pane.pane_id !== identity.pane_id || pane.terminal_id !== identity.terminal_id || provider.provider?.pid !== binding.provider.pid || provider.provider?.identity !== binding.provider.identity) continue;
      verified.push({ ...identity, source_epoch: epoch });
    } catch { /* Absent, changed or unverifiable artifacts remain unclaimed. */ }
  }
  return verified;
}
export function readRuntimeDispatchBindings(config: HerdrRuntimeConfig, epoch: number): RuntimeIdentity[] {
  if (config.bindings_path === null || config.pipeline_snapshot === null) return [];
  const raw = JSON.parse(readBounded(config.bindings_path).toString());
  if (Object.keys(raw).sort().join() !== 'bindings,protocol' || raw.protocol !== 'repo-harness.runtime-bindings.v2' || !Array.isArray(raw.bindings) || raw.bindings.length > 512) throw new Error('runtime_binding_manifest');
  const candidates = raw.bindings.map(decodeRuntimeIdentity);
  if (candidates.some((b: RuntimeIdentity) => b.source_host !== config.source_host || b.herdr_session !== config.herdr_session)) throw new Error('runtime_binding_scope');
  const opened = openSnapshot(config.pipeline_snapshot);
  try {
    const records = (opened.db.query('SELECT record FROM pipelines').all() as { record: string }[]).map(row => decodeRecord(JSON.parse(row.record)));
    const logs = opened.db.query('SELECT * FROM observations ORDER BY seq').all().map((row: any) => ({ ...row, payload: JSON.parse(row.payload) })) as LogObservation[];
    const marker = logs.map(log => log.kind).lastIndexOf('restore_epoch');
    if (marker >= 0 && logs[marker].payload.epoch !== opened.pointer.epoch) throw new Error('runtime_snapshot_epoch');
    return verifyRuntimeDispatchBindings(candidates, records, epoch, readBounded, logs);
  } finally { opened.db.close(); }
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
            bindings: async epoch => readRuntimeDispatchBindings(config, epoch) });
          if (closed) { transport.close(); return; }
          observer = createRuntimeStatusObserver(source); await observer.start();
          if (observer.read().observed_at === null) { observer.stop(); transport.close(); observer = null; }
        } else await observer.refresh();
      } catch { transport?.close(); observer?.stop(); observer = null; }
    })().finally(() => { pending = null; });
    return pending;
  };
  await refresh();
  const timer = setInterval(() => { void refresh(); }, 30_000); timer.unref();
  return { read: (): RuntimeOverlay => observer?.read() ?? unavailableRuntimeOverlay(),
    close: () => { closed = true; clearInterval(timer); observer?.stop(); transport?.close(); }, refresh };
}
