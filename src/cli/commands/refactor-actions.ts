import type { RefactorDecision } from '../../core/refactor/provider-contract';
import { decideRecommendation } from '../../effects/refactor/archctx-provider';

/** `refactor decide` loads this module only after the architecture selection check. One archctx call decides a recorded suggestion or a fresh scan candidate. The limit must match the scan that produced the suggestion. */
export function decideRefactorRecommendation(root: string, recommendationId: string, decision: RefactorDecision, reason: string, importNodeLimit?: number, timeoutMs?: number): string {
  return decideRecommendation(recommendationId, decision, reason, root, {}, importNodeLimit, timeoutMs).status;
}
