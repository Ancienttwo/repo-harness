import { decodeNativeRuntimeObservation, runtimeCaptureId, RUNTIME_CAPTURE_MAX_OBSERVATIONS, type NativeRuntimeObservation, type NativeRuntimeProvider, type RuntimeCaptureSnapshot } from './runtime-capture';

/** An observation projection. It has no task transition authority. */
export const RUNTIME_OVERLAY_VERSION = 'repo-harness.runtime-overlay.v4' as const;
export const RUNTIME_STALE_AFTER_MS = 300_000;
export const RUNTIME_LIMIT = 512;
export const NATIVE_RUNTIME_SOURCE_LIMIT = 8;
export interface NativeRuntimeSourceSummary {
  source_id: string; provider: NativeRuntimeProvider; generation: string | null;
  capture_status: RuntimeCaptureSnapshot['capture_status']; heartbeat_at: string | null;
  freshness: 'fresh' | 'stale' | 'disconnected' | 'unavailable'; observations: NativeRuntimeObservation[];
}
/** Each capture has its own clock. A file read cannot renew its heartbeat. */
export function nativeRuntimeFreshness(source: Pick<NativeRuntimeSourceSummary, 'capture_status' | 'heartbeat_at'>, now: number): NativeRuntimeSourceSummary['freshness'] {
  if (source.capture_status === 'unavailable' || source.heartbeat_at === null) return 'unavailable';
  const age = now - Date.parse(source.heartbeat_at);
  if (!Number.isFinite(age) || age < 0) return 'unavailable';
  if (source.capture_status === 'disconnected') return 'disconnected';
  return age > RUNTIME_STALE_AFTER_MS ? 'stale' : 'fresh';
}
export interface RuntimeIdentity {
  source_host: string; repository_id: string; task: string; role: string; round: number; pipeline_state_version: number;
  request_id: string; context_sha256: string; runtime_session: string; attempt: number;
  generation: string; source_epoch: number; herdr_session: string; terminal_id: string;
  pane_id: string; agent_session: string;
}
export type RuntimeState = 'unknown' | 'idle' | 'working' | 'blocked' | 'done-unseen' | 'settled' | 'error' | 'cancelled' | 'clear';
export type BlockReason = 'permission' | 'question' | 'auth' | 'unknown';
export interface RuntimeObservation {
  identity: RuntimeIdentity; revision: number; state: RuntimeState; reason: BlockReason;
  changed_at: string | null; source: 'herdr-agent' | 'program-v1';
}
export interface RuntimeBadge extends RuntimeObservation {
  badge: RuntimeState; freshness: 'fresh' | 'stale' | 'disconnected';
}
export interface RuntimePaneObservation {
  scope: 'pane'; source: 'osc7501';
  pane: Pick<RuntimeIdentity, 'source_host' | 'herdr_session' | 'terminal_id' | 'pane_id'> & { agent_session: string | null };
  /** Current card-to-pane routing only. This is not the report producer identity. */
  binding: RuntimeIdentity | null;
  source_epoch: number; revision: number;
  state: 'idle' | 'working' | 'blocked' | 'settled' | 'error' | 'clear';
  reason: BlockReason; changed_at: string | null;
}
export interface RuntimePaneBadge extends RuntimePaneObservation { freshness: RuntimeBadge['freshness'] }
export interface RuntimeOverlay {
  projection_version: typeof RUNTIME_OVERLAY_VERSION; status: 'ready' | 'unavailable';
  observed_at: string | null; source_epoch: number; program_status: 'unsupported' | 'v1';
  unclaimed: number; badges: RuntimeBadge[]; pane_observations: RuntimePaneBadge[]; native_sources: NativeRuntimeSourceSummary[];
}
export function unavailableRuntimeOverlay(epoch = 0): RuntimeOverlay {
  return { projection_version: RUNTIME_OVERLAY_VERSION, status: 'unavailable', observed_at: null,
    source_epoch: epoch, program_status: 'unsupported', unclaimed: 0, badges: [], pane_observations: [], native_sources: [] };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('runtime_invalid');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).sort().join() !== fields.sort().join()) throw new Error('runtime_fields_invalid');
}
export function runtimeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('runtime_counter_invalid');
  return value as number;
}
export function runtimeId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) throw new Error('runtime_identity_invalid');
  return value;
}
export function runtimeTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('runtime_time_invalid');
  return value;
}
export function decodeRuntimeIdentity(value: unknown): RuntimeIdentity {
  const v = record(value);
  exact(v, ['source_host','repository_id','task','role','round','pipeline_state_version','request_id','context_sha256','runtime_session','attempt','generation','source_epoch','herdr_session','terminal_id','pane_id','agent_session']);
  const result: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) result[key] = ['round','attempt','source_epoch','pipeline_state_version'].includes(key) ? runtimeInteger(item) : runtimeId(item);
  for (const field of ['repository_id','context_sha256']) if (!/^sha256:[a-f0-9]{64}$/.test(result[field] as string)) throw new Error('runtime_digest_invalid');
  return result as unknown as RuntimeIdentity;
}
export function runtimeIdentityKey(identity: RuntimeIdentity): string {
  return JSON.stringify(Object.entries(decodeRuntimeIdentity(identity)).sort(([a], [b]) => a.localeCompare(b)));
}
export function decodeRuntimeObservation(value: unknown): RuntimeObservation {
  const v = record(value);
  exact(v, ['identity','revision','state','reason','changed_at','source']);
  if (!['unknown','idle','working','blocked','done-unseen','settled','error','cancelled','clear'].includes(v.state as string) ||
      !['permission','question','auth','unknown'].includes(v.reason as string) || !['herdr-agent','program-v1'].includes(v.source as string)) throw new Error('runtime_state_invalid');
  if (v.state !== 'blocked' && v.reason !== 'unknown') throw new Error('runtime_reason_invalid');
  if (v.source === 'herdr-agent' && (!['unknown','idle','working','blocked','done-unseen'].includes(v.state as string) || v.reason !== 'unknown' || v.changed_at !== null)) throw new Error('runtime_capability_invalid');
  return { identity: decodeRuntimeIdentity(v.identity), revision: runtimeInteger(v.revision), state: v.state as RuntimeState,
    reason: v.reason as BlockReason, changed_at: runtimeTime(v.changed_at), source: v.source as RuntimeObservation['source'] };
}
export function runtimePaneKey(pane: RuntimePaneObservation['pane']): string {
  return JSON.stringify(['source_host','herdr_session','terminal_id','pane_id','agent_session'].map(key => key === 'agent_session' && pane.agent_session === null ? null : runtimeId(pane[key as keyof typeof pane])));
}
export function decodeRuntimePaneObservation(value: unknown): RuntimePaneObservation {
  const v = record(value);
  exact(v, ['scope','source','pane','binding','source_epoch','revision','state','reason','changed_at']);
  if (v.scope !== 'pane' || v.source !== 'osc7501' || !['idle','working','blocked','settled','error','clear'].includes(v.state as string) || !['permission','question','auth','unknown'].includes(v.reason as string) || (v.state !== 'blocked' && v.reason !== 'unknown')) throw new Error('runtime_pane_state_invalid');
  const rawPane = record(v.pane); exact(rawPane, ['source_host','herdr_session','terminal_id','pane_id','agent_session']);
  const pane = Object.fromEntries(Object.entries(rawPane).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, key === 'agent_session' && value === null ? null : runtimeId(value)])) as RuntimePaneObservation['pane'];
  const binding = v.binding === null ? null : decodeRuntimeIdentity(v.binding);
  if (binding && runtimePaneKey(binding) !== runtimePaneKey(pane)) throw new Error('runtime_pane_binding_invalid');
  return { scope: 'pane', source: 'osc7501', pane, binding, source_epoch: runtimeInteger(v.source_epoch), revision: runtimeInteger(v.revision),
    state: v.state as RuntimePaneObservation['state'], reason: v.reason as BlockReason, changed_at: runtimeTime(v.changed_at) };
}
export function decodeRuntimeOverlay(value: unknown): RuntimeOverlay {
  const v = record(value);
  exact(v, ['projection_version','status','observed_at','source_epoch','program_status','unclaimed','badges','pane_observations','native_sources']);
  if (v.projection_version !== RUNTIME_OVERLAY_VERSION || !['ready','unavailable'].includes(v.status as string) || !['unsupported','v1'].includes(v.program_status as string) || !Array.isArray(v.badges) || !Array.isArray(v.pane_observations) || v.badges.length + v.pane_observations.length > RUNTIME_LIMIT || !Array.isArray(v.native_sources) || v.native_sources.length > NATIVE_RUNTIME_SOURCE_LIMIT) throw new Error('runtime_overlay_invalid');
  const epoch = runtimeInteger(v.source_epoch), seen = new Set<string>();
  const badges = v.badges.map(raw => {
    const b = record(raw);
    exact(b, ['identity','revision','state','reason','changed_at','source','badge','freshness']);
    const { badge, freshness, ...observation } = b;
    const decoded = decodeRuntimeObservation(observation), key = runtimeIdentityKey(decoded.identity);
    if (seen.has(key) || decoded.identity.source_epoch !== epoch || badge !== decoded.state || !['fresh','stale','disconnected'].includes(freshness as string) || (decoded.source === 'program-v1' && v.program_status !== 'v1')) throw new Error('runtime_badge_invalid');
    seen.add(key);
    return { ...decoded, badge: decoded.state, freshness: freshness as RuntimeBadge['freshness'] };
  });
  const paneSeen = new Set<string>();
  const pane_observations = v.pane_observations.map(raw => {
    const p = record(raw), { freshness, ...observation } = p;
    const decoded = decodeRuntimePaneObservation(observation), key = runtimePaneKey(decoded.pane);
    if (paneSeen.has(key) || v.program_status !== 'v1' || (decoded.binding && decoded.binding.source_epoch !== epoch) || !['fresh','stale','disconnected'].includes(freshness as string) || decoded.state === 'clear') throw new Error('runtime_pane_badge_invalid');
    paneSeen.add(key); return { ...decoded, freshness: freshness as RuntimePaneBadge['freshness'] };
  });
  const observed_at = runtimeTime(v.observed_at);
  if ((v.status === 'ready' && observed_at === null) || ((badges.length || pane_observations.length) && observed_at === null)) throw new Error('runtime_age_invalid');
  const nativeSeen = new Set<string>();
  const native_sources = v.native_sources.map(raw => {
    const s = record(raw);
    exact(s, ['source_id','provider','generation','capture_status','heartbeat_at','freshness','observations']);
    const source_id = runtimeCaptureId(s.source_id);
    if (nativeSeen.has(source_id) || !['codex','claude','pi'].includes(s.provider as string) || !['connected','disconnected','unavailable'].includes(s.capture_status as string) || !['fresh','stale','disconnected','unavailable'].includes(s.freshness as string) || !Array.isArray(s.observations) || s.observations.length > RUNTIME_CAPTURE_MAX_OBSERVATIONS) throw new Error('runtime_native_source_invalid');
    nativeSeen.add(source_id);
    if (s.generation !== null && (typeof s.generation !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.generation))) throw new Error('runtime_native_generation_invalid');
    const heartbeat_at = runtimeTime(s.heartbeat_at), observations = s.observations.map(decodeNativeRuntimeObservation);
    if (observations.some(o => o.scope !== (s.provider === 'codex' ? 'session' : 'terminal')) || (s.provider !== 'codex' && observations.length > 1) || new Set(observations.map(o => o.session_id)).size !== observations.length) throw new Error('runtime_native_observation_invalid');
    if ((s.generation === null || heartbeat_at === null) && (s.capture_status !== 'unavailable' || s.freshness !== 'unavailable' || observations.length)) throw new Error('runtime_native_age_invalid');
    if ((s.capture_status === 'unavailable' && s.freshness !== 'unavailable') || (s.capture_status === 'disconnected' && s.freshness !== 'disconnected' && s.freshness !== 'unavailable') || (s.capture_status === 'connected' && s.freshness === 'disconnected')) throw new Error('runtime_native_freshness_invalid');
    return { source_id, provider: s.provider as NativeRuntimeProvider, generation: s.generation as string | null,
      capture_status: s.capture_status as NativeRuntimeSourceSummary['capture_status'], heartbeat_at,
      freshness: s.freshness as NativeRuntimeSourceSummary['freshness'], observations };
  });
  if (native_sources.length && (badges.length || pane_observations.length || v.program_status !== 'unsupported' || v.unclaimed !== 0)) throw new Error('runtime_mode_conflict');
  return { projection_version: RUNTIME_OVERLAY_VERSION, status: v.status as RuntimeOverlay['status'], observed_at,
    source_epoch: epoch, program_status: v.program_status as RuntimeOverlay['program_status'], unclaimed: runtimeInteger(v.unclaimed), badges, pane_observations, native_sources };
}
/** Only current, unique dispatch-to-pane bindings can claim an observation. */
export function runtimeBindingKeys(bindings: readonly RuntimeIdentity[]): Set<string> {
  if (bindings.length > RUNTIME_LIMIT) throw new Error('runtime_limit');
  const counts = new Map<string, number>(), panes = new Map<string, number>();
  const paneKey = (b: RuntimeIdentity) => JSON.stringify([b.source_host,b.herdr_session,b.terminal_id,b.pane_id]);
  for (const binding of bindings) {
    const key = runtimeIdentityKey(binding), pane = paneKey(binding);
    counts.set(key, (counts.get(key) ?? 0) + 1); panes.set(pane, (panes.get(pane) ?? 0) + 1);
  }
  return new Set(bindings.filter(binding => counts.get(runtimeIdentityKey(binding)) === 1 && panes.get(paneKey(binding)) === 1).map(runtimeIdentityKey));
}
/** Exact binding only. Ambiguous identities and pane reuse cannot claim a card. */
export function projectRuntimeOverlay(bindings: readonly RuntimeIdentity[], observations: readonly RuntimeObservation[], observedAt: string,
  epoch: number, program: RuntimeOverlay['program_status'], now: number, connected = true, unclaimedCount = 0, paneObservations: readonly RuntimePaneObservation[] = []): RuntimeOverlay {
  if (bindings.length > RUNTIME_LIMIT || observations.length + paneObservations.length > RUNTIME_LIMIT) throw new Error('runtime_limit');
  runtimeTime(observedAt); runtimeInteger(epoch);
  const bound = runtimeBindingKeys(bindings);
  const latest = new Map<string, RuntimeObservation>(), conflicts = new Set<string>(), sources = new Map<string, string>(), mixedSources = new Set<string>();
  let unclaimed = runtimeInteger(unclaimedCount);
  for (const raw of observations) {
    const observation = decodeRuntimeObservation(raw), key = runtimeIdentityKey(observation.identity);
    if (!bound.has(key) || observation.identity.source_epoch !== epoch || (observation.source === 'program-v1' && program !== 'v1')) { unclaimed++; continue; }
    if (sources.has(key) && sources.get(key) !== observation.source) mixedSources.add(key);
    sources.set(key, observation.source);
    const old = latest.get(key);
    if (!old || observation.revision > old.revision) { latest.set(key, observation); conflicts.delete(key); }
    else if (observation.revision === old.revision && JSON.stringify(observation) !== JSON.stringify(old)) conflicts.add(key);
  }
  const freshness = !connected ? 'disconnected' : now - Date.parse(observedAt) > RUNTIME_STALE_AFTER_MS ? 'stale' : 'fresh';
  const badges: RuntimeBadge[] = [];
  for (const [key, observation] of latest) {
    if (conflicts.has(key) || mixedSources.has(key)) { unclaimed++; continue; }
    // Clear keeps its revision fence but removes the visible observation.
    if (observation.state === 'clear') continue;
    badges.push({ ...observation, badge: observation.state, freshness });
  }
  const paneLatest = new Map<string, RuntimePaneObservation>(), paneConflicts = new Set<string>();
  for (const raw of paneObservations) {
    const observation = decodeRuntimePaneObservation(raw), key = runtimePaneKey(observation.pane);
    if (program !== 'v1' || (observation.binding && (!bound.has(runtimeIdentityKey(observation.binding)) || observation.binding.source_epoch !== epoch))) { unclaimed++; continue; }
    const old = paneLatest.get(key);
    if (!old || observation.source_epoch > old.source_epoch || (observation.source_epoch === old.source_epoch && observation.revision > old.revision)) { paneLatest.set(key, observation); paneConflicts.delete(key); }
    else if (observation.source_epoch === old.source_epoch && observation.revision === old.revision && JSON.stringify(observation) !== JSON.stringify(old)) paneConflicts.add(key);
  }
  const pane_observations: RuntimePaneBadge[] = [];
  for (const [key, observation] of paneLatest) {
    if (paneConflicts.has(key)) { unclaimed++; continue; }
    if (observation.state !== 'clear') pane_observations.push({ ...observation, freshness });
  }
  return decodeRuntimeOverlay({ projection_version: RUNTIME_OVERLAY_VERSION, status: connected ? 'ready' : 'unavailable', observed_at: observedAt,
    source_epoch: epoch, program_status: program, unclaimed, badges, pane_observations, native_sources: [] });
}
