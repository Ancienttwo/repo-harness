import { createHash } from 'crypto';
import { REFACTOR_CANARY_IDS, type RefactorActivationLevel } from '../../src/core/refactor/activation';
import { advanceRefactorActivation, appendRefactorCanaryReceipt } from '../../src/effects/refactor/activation-store';

export function activateRefactorFixture(repoRoot: string, repositoryId: string, targetRevision: string, level: Exclude<RefactorActivationLevel, 'off'>): void {
  const observed = '2026-09-04T00:00:00.000Z';
  for (const canaryId of REFACTOR_CANARY_IDS) appendRefactorCanaryReceipt(repoRoot, { canaryId, repositoryId, targetRevision, passed: true, evidenceRefs: [{ locator: `fixture/${canaryId}`, sha256: `sha256:${createHash('sha256').update(canaryId).digest('hex')}` }], observedAt: observed });
  for (const next of ['shadow', 'active_module', 'active_cross_module'] as const) { advanceRefactorActivation({ repo_root: repoRoot, repository_id: repositoryId, target_revision: targetRevision, next_level: next, observed_at: observed }); if (next === level) break; }
}
