/** An observation projection. It has no task transition authority. */
export const RUNTIME_OVERLAY_VERSION = 'repo-harness.runtime-overlay.v2' as const;
export const RUNTIME_STALE_AFTER_MS = 300_000;
export const RUNTIME_LIMIT = 512;
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
export interface RuntimeOverlay {
  projection_version: typeof RUNTIME_OVERLAY_VERSION; status: 'ready' | 'unavailable';
  observed_at: string | null; source_epoch: number; program_status: 'unsupported' | 'v1';
  unclaimed: number; badges: RuntimeBadge[];
}
export function unavailableRuntimeOverlay(epoch = 0): RuntimeOverlay {
  return { projection_version: RUNTIME_OVERLAY_VERSION, status: 'unavailable', observed_at: null,
    source_epoch: epoch, program_status: 'unsupported', unclaimed: 0, badges: [] };
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
export function decodeRuntimeOverlay(value: unknown): RuntimeOverlay {
  const v = record(value);
  exact(v, ['projection_version','status','observed_at','source_epoch','program_status','unclaimed','badges']);
  if (v.projection_version !== RUNTIME_OVERLAY_VERSION || !['ready','unavailable'].includes(v.status as string) || !['unsupported','v1'].includes(v.program_status as string) || !Array.isArray(v.badges) || v.badges.length > RUNTIME_LIMIT) throw new Error('runtime_overlay_invalid');
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
  const observed_at = runtimeTime(v.observed_at);
  if ((v.status === 'ready' && observed_at === null) || (badges.length && observed_at === null)) throw new Error('runtime_age_invalid');
  return { projection_version: RUNTIME_OVERLAY_VERSION, status: v.status as RuntimeOverlay['status'], observed_at,
    source_epoch: epoch, program_status: v.program_status as RuntimeOverlay['program_status'], unclaimed: runtimeInteger(v.unclaimed), badges };
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
  epoch: number, program: RuntimeOverlay['program_status'], now: number, connected = true, unclaimedCount = 0): RuntimeOverlay {
  if (bindings.length > RUNTIME_LIMIT || observations.length > RUNTIME_LIMIT) throw new Error('runtime_limit');
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
    badges.push({ ...observation, badge: observation.state, freshness });
  }
  return decodeRuntimeOverlay({ projection_version: RUNTIME_OVERLAY_VERSION, status: connected ? 'ready' : 'unavailable', observed_at: observedAt,
    source_epoch: epoch, program_status: program, unclaimed, badges });
}
