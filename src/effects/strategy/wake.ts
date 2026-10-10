import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { coalesceStrategyWakes, STRATEGY_WAKE_LIMITS, type StrategyWakeSession } from '../../core/strategy/wake';
import { validateProposal } from '../../core/strategy/contracts';
import { collectStrategyContext, strategyHash, type StrategyCollectionOptions, type StrategyCollectionEffects } from './context';

/** A one-shot synthetic-host boundary. No provider, resume, task or controller effects. */
export function exportStrategyWakePacket(repo: string, session: StrategyWakeSession, raw: string,
  options: StrategyCollectionOptions = {}, effects: StrategyCollectionEffects = {}) {
  if (strategyHash(realpathSync(resolve(repo))) !== session.repositoryId) throw new Error('Wake worktree mismatch');
  const wake = coalesceStrategyWakes(session, raw);
  if (!wake.selected) return { ...wake, status: 'empty' as const, packet: null, validation: null };
  const packet = collectStrategyContext(repo, { ...options, limits: {
    totalBytes: Math.min(options.limits?.totalBytes ?? STRATEGY_WAKE_LIMITS.sourceBytes, STRATEGY_WAKE_LIMITS.sourceBytes),
    durationMs: Math.min(options.limits?.durationMs ?? STRATEGY_WAKE_LIMITS.durationMs, STRATEGY_WAKE_LIMITS.durationMs),
  } }, effects);
  if (wake.selected.contextDigest !== packet.digest) return { ...wake, status: 'stale' as const, packet, validation: null };
  const validation = wake.proposal === null ? null : validateProposal(wake.proposal, packet);
  return { ...wake, status: validation && validation.status !== 'reviewable' ? validation.status : 'exported' as const, packet, validation };
}
