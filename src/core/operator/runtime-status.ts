import { decodeNativeRuntimeObservation, runtimeCaptureId, RUNTIME_CAPTURE_MAX_OBSERVATIONS, type NativeRuntimeObservation, type NativeRuntimeProvider, type RuntimeCaptureSnapshot } from './runtime-capture';

/** An observation projection. It has no task transition authority. */
export const RUNTIME_OVERLAY_VERSION = 'repo-harness.runtime-overlay.v6' as const;
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
export type RuntimeState = 'unknown' | 'idle' | 'working' | 'blocked' | 'done-unseen';
export type BlockReason = 'permission' | 'question' | 'auth' | 'unknown';
export interface RuntimeObservation {
  identity: RuntimeIdentity; revision: number; state: RuntimeState; reason: BlockReason;
  changed_at: string | null; source: 'herdr-agent';
}
export interface RuntimeBadge extends RuntimeObservation {
  badge: RuntimeState; freshness: 'fresh' | 'stale' | 'disconnected';
}
export interface RuntimeUnavailableReason {
  code: 'herdr_version_mismatch';
  expected: { version: string; protocol: number; revision: string };
  actual: { version: string | null; protocol: number | null };
}
export interface RuntimeOverlay {
  projection_version: typeof RUNTIME_OVERLAY_VERSION; status: 'ready' | 'unavailable'; reason: RuntimeUnavailableReason | null;
  observed_at: string | null; source_epoch: number;
  unclaimed: number; badges: RuntimeBadge[]; native_sources: NativeRuntimeSourceSummary[];
}
export function unavailableRuntimeOverlay(epoch = 0, reason: RuntimeUnavailableReason | null = null): RuntimeOverlay {
  return { projection_version: RUNTIME_OVERLAY_VERSION, status: 'unavailable', reason, observed_at: null,
    source_epoch: epoch, unclaimed: 0, badges: [], native_sources: [] };
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
  if (!['unknown','idle','working','blocked','done-unseen'].includes(v.state as string) || v.source !== 'herdr-agent') throw new Error('runtime_state_invalid');
  if (v.reason !== 'unknown' || v.changed_at !== null) throw new Error('runtime_capability_invalid');
  return { identity: decodeRuntimeIdentity(v.identity), revision: runtimeInteger(v.revision), state: v.state as RuntimeState,
    reason: v.reason as BlockReason, changed_at: runtimeTime(v.changed_at), source: v.source as RuntimeObservation['source'] };
}
function decodeRuntimeUnavailableReason(value: unknown): RuntimeUnavailableReason | null {
  if (value === null) return null;
  const reason = record(value); exact(reason, ['code','expected','actual']);
  if (reason.code !== 'herdr_version_mismatch') throw new Error('runtime_unavailable_reason_invalid');
  const expected = record(reason.expected), actual = record(reason.actual);
  exact(expected, ['version','protocol','revision']); exact(actual, ['version','protocol']);
  const version = (value: unknown): string => {
    if (typeof value !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(value)) throw new Error('runtime_version_invalid');
    return value;
  };
  if (typeof expected.revision !== 'string' || !/^[a-f0-9]{40}$/.test(expected.revision)) throw new Error('runtime_revision_invalid');
  return { code: 'herdr_version_mismatch', expected: { version: version(expected.version), protocol: runtimeInteger(expected.protocol), revision: expected.revision },
    actual: { version: actual.version === null ? null : version(actual.version), protocol: actual.protocol === null ? null : runtimeInteger(actual.protocol) } };
}
export function decodeRuntimeOverlay(value: unknown): RuntimeOverlay {
  const v = record(value);
  exact(v, ['projection_version','status','reason','observed_at','source_epoch','unclaimed','badges','native_sources']);
  if (v.projection_version !== RUNTIME_OVERLAY_VERSION || !['ready','unavailable'].includes(v.status as string) || !Array.isArray(v.badges) || v.badges.length > RUNTIME_LIMIT || !Array.isArray(v.native_sources) || v.native_sources.length > NATIVE_RUNTIME_SOURCE_LIMIT) throw new Error('runtime_overlay_invalid');
  const reason = decodeRuntimeUnavailableReason(v.reason);
  if (reason !== null && (v.status !== 'unavailable' || v.native_sources.length)) throw new Error('runtime_unavailable_reason_invalid');
  const epoch = runtimeInteger(v.source_epoch), seen = new Set<string>();
  const badges = v.badges.map(raw => {
    const b = record(raw);
    exact(b, ['identity','revision','state','reason','changed_at','source','badge','freshness']);
    const { badge, freshness, ...observation } = b;
    const decoded = decodeRuntimeObservation(observation), key = runtimeIdentityKey(decoded.identity);
    if (seen.has(key) || decoded.identity.source_epoch !== epoch || badge !== decoded.state || !['fresh','stale','disconnected'].includes(freshness as string)) throw new Error('runtime_badge_invalid');
    seen.add(key);
    return { ...decoded, badge: decoded.state, freshness: freshness as RuntimeBadge['freshness'] };
  });
  const observed_at = runtimeTime(v.observed_at);
  if ((v.status === 'ready' && observed_at === null) || (badges.length && observed_at === null)) throw new Error('runtime_age_invalid');
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
  if (native_sources.length && (badges.length || v.unclaimed !== 0)) throw new Error('runtime_mode_conflict');
  return { projection_version: RUNTIME_OVERLAY_VERSION, status: v.status as RuntimeOverlay['status'], reason, observed_at,
    source_epoch: epoch, unclaimed: runtimeInteger(v.unclaimed), badges, native_sources };
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
  epoch: number, now: number, connected = true, unclaimedCount = 0): RuntimeOverlay {
  if (bindings.length > RUNTIME_LIMIT || observations.length > RUNTIME_LIMIT) throw new Error('runtime_limit');
  runtimeTime(observedAt); runtimeInteger(epoch);
  const bound = runtimeBindingKeys(bindings);
  const latest = new Map<string, RuntimeObservation>(), conflicts = new Set<string>();
  let unclaimed = runtimeInteger(unclaimedCount);
  for (const raw of observations) {
    const observation = decodeRuntimeObservation(raw), key = runtimeIdentityKey(observation.identity);
    if (!bound.has(key) || observation.identity.source_epoch !== epoch) { unclaimed++; continue; }
    const old = latest.get(key);
    if (!old || observation.revision > old.revision) { latest.set(key, observation); conflicts.delete(key); }
    else if (observation.revision === old.revision && JSON.stringify(observation) !== JSON.stringify(old)) conflicts.add(key);
  }
  const freshness = !connected ? 'disconnected' : now - Date.parse(observedAt) > RUNTIME_STALE_AFTER_MS ? 'stale' : 'fresh';
  const badges: RuntimeBadge[] = [];
  for (const [key, observation] of latest) {
    if (conflicts.has(key)) { unclaimed++; continue; }
    badges.push({ ...observation, badge: observation.state, freshness });
  }
  return decodeRuntimeOverlay({ projection_version: RUNTIME_OVERLAY_VERSION, status: connected ? 'ready' : 'unavailable', reason: null, observed_at: observedAt,
    source_epoch: epoch, unclaimed, badges, native_sources: [] });
}
