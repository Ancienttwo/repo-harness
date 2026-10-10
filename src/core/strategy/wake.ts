/** Host-owned wake ordering for read-only exports. No scheduling or dispatch. */
export interface StrategyWake {
  eventId: string; sequence: number; contextDigest: string;
  reason: 'owner_request' | 'sources_changed' | 'outcome_observed' | 'resume';
}
export interface StrategyWakeSession {
  version: 1; repositoryId: string; epoch: string; watermark: number; seen: StrategyWake[];
}
export const STRATEGY_WAKE_LIMITS = Object.freeze({ requestBytes: 16384, events: 32, retainedEvents: 64, sourceBytes: 1048576, durationMs: 5000 });
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Wake object required');
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(v).sort().join(',') !== expected.sort().join(',')) throw new Error('Invalid wake fields');
}
function bounded(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(v)) throw new Error('Invalid wake identity');
}
function digest(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) throw new Error('Invalid wake digest');
}
function parseWake(value: unknown): StrategyWake {
  const v = obj(value); keys(v, ['eventId', 'sequence', 'contextDigest', 'reason']);
  bounded(v.eventId); digest(v.contextDigest);
  if (!Number.isSafeInteger(v.sequence) || (v.sequence as number) < 0) throw new Error('Invalid wake sequence');
  if (typeof v.reason !== 'string' || !['owner_request', 'sources_changed', 'outcome_observed', 'resume'].includes(v.reason)) throw new Error('Invalid wake reason');
  return { eventId: v.eventId, sequence: v.sequence as number, contextDigest: v.contextDigest, reason: v.reason as StrategyWake['reason'] };
}
export function createStrategyWakeSession(repositoryId: string, epoch: string): StrategyWakeSession {
  digest(repositoryId); bounded(epoch);
  return { version: 1, repositoryId, epoch, watermark: -1, seen: [] };
}
function signature(event: StrategyWake): string { return JSON.stringify(event); }
/** Sequence is assigned by the host. Receipt state lives only in caller memory. */
export function coalesceStrategyWakes(session: StrategyWakeSession, raw: string) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > STRATEGY_WAKE_LIMITS.requestBytes) throw new Error('Wake request byte limit exceeded');
  const state = obj(session); keys(state, ['version', 'repositoryId', 'epoch', 'watermark', 'seen']);
  digest(session.repositoryId); bounded(session.epoch);
  if (session.version !== 1 || !Number.isSafeInteger(session.watermark) || session.watermark < -1
    || !Array.isArray(session.seen) || session.seen.length > STRATEGY_WAKE_LIMITS.retainedEvents) throw new Error('Invalid wake session');
  const prior = session.seen.map(parseWake);
  if (prior.some(e => e.sequence > session.watermark)) throw new Error('Invalid wake watermark');
  const input = obj(JSON.parse(raw)); keys(input, ['version', 'repositoryId', 'epoch', 'events', 'proposal', 'capabilityClaims']);
  if (input.version !== 1 || input.repositoryId !== session.repositoryId || input.epoch !== session.epoch) throw new Error('Wake repository or epoch mismatch');
  if (!Array.isArray(input.events) || input.events.length > STRATEGY_WAKE_LIMITS.events) throw new Error('Wake event limit exceeded');
  const claims = obj(input.capabilityClaims); keys(claims, ['readOnly', 'resume']);
  if (typeof claims.readOnly !== 'boolean' || typeof claims.resume !== 'boolean') throw new Error('Invalid host capability claims');
  const events = input.events.map(parseWake).sort((a, b) => a.sequence - b.sequence || a.eventId.localeCompare(b.eventId, 'en'));
  const byId = new Map<string, StrategyWake>(); const bySequence = new Map<number, StrategyWake>();
  for (const event of [...prior, ...events]) {
    if ((byId.has(event.eventId) && signature(byId.get(event.eventId)!) !== signature(event))
      || (bySequence.has(event.sequence) && signature(bySequence.get(event.sequence)!) !== signature(event))) throw new Error('Conflicting wake identity or sequence');
    byId.set(event.eventId, event); bySequence.set(event.sequence, event);
  }
  const fresh = [...new Map(events.filter(e => e.sequence > session.watermark).map(e => [e.eventId, e])).values()];
  const selected = fresh.at(-1) ?? null;
  const retained = [...byId.values()].sort((a, b) => a.sequence - b.sequence).slice(-STRATEGY_WAKE_LIMITS.retainedEvents);
  const next: StrategyWakeSession = { ...session, watermark: selected?.sequence ?? session.watermark, seen: retained };
  return { session: next, selected, coalesced: Math.max(0, fresh.length - 1), ignored: events.length - fresh.length, proposal: input.proposal,
    capabilityStatus: 'unverified' as const, mode: 'context_packet_only' as const, executionAuthorized: false as const };
}
