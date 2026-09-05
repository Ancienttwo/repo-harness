import { recommendationV3InvariantIssues, refactorResolutionEvidenceInvariantIssues, type RecommendationV3, type RefactorResolutionEvidenceV1 } from 'archctx-contracts';

import { canonicalMessageDigest } from '../messages/mechanics';
import { validateRefactorExecutionBinding, type RefactorExecutionBindingV1 } from './execution-binding';
import { validateRefactorProgram, type RefactorProgramV1 } from './program';

export const REFACTOR_BOARD_PROTOCOL = 1 as const;
export type RefactorBoardArchitectureResult = 'open' | 'merged_pending_measurement' | 'resolved' | 'follow_up_required' | 'reconciliation_required' | 'superseded';
export interface RefactorBoardCardV1 {
  readonly recommendationId: string; readonly recommendationDigest: string; readonly candidateAlias: string; readonly route: string;
  readonly affectedNodeIds: readonly string[]; readonly execution: 'awaiting_approval' | 'awaiting_execution' | 'merged'; readonly architectureResult: RefactorBoardArchitectureResult;
  readonly resolutionDisposition: string | null; readonly executionBindingSha256: string | null; readonly resolutionDigest: string | null;
  readonly sources: { readonly route: 'repo-harness'; readonly execution: 'repo-harness'; readonly architectureResult: 'archctx' | 'repo-harness' };
}
export interface RefactorBoardV1 { readonly protocol: typeof REFACTOR_BOARD_PROTOCOL; readonly programId: string; readonly programDigest: string; readonly measuredHeadSha: string; readonly cards: readonly RefactorBoardCardV1[]; readonly boardDigest: string }
export class RefactorBoardError extends Error { readonly code = 'refactor_board_invalid' as const; constructor(message: string) { super(message); this.name = 'RefactorBoardError'; } }
function invalid(message: string): never { throw new RefactorBoardError(message); }

export function projectRefactorBoard(input: { readonly program: RefactorProgramV1; readonly measuredHeadSha: string; readonly recommendations: readonly RecommendationV3[]; readonly bindings: readonly RefactorExecutionBindingV1[]; readonly resolutions: readonly RefactorResolutionEvidenceV1[] }): RefactorBoardV1 {
  const program = validateRefactorProgram(input.program); if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(input.measuredHeadSha)) invalid('board requires an exact final main HEAD'); const recommendations = new Map<string, RecommendationV3>();
  for (const recommendation of input.recommendations) { const issues = recommendationV3InvariantIssues(recommendation); if (issues.length) invalid(`invalid recommendation authority: ${issues.join('; ')}`); const key = recommendation.recommendationId; if (recommendations.has(key)) invalid(`duplicate exact recommendation readback: ${recommendation.recommendationId}`); recommendations.set(key, recommendation); }
  const bindings = new Map<string, RefactorExecutionBindingV1>(); for (const entry of input.bindings) { const value = validateRefactorExecutionBinding(entry); const key = `${value.recommendationId}\0${value.recommendationDigest}`; if (bindings.has(key)) invalid(`duplicate execution binding: ${value.recommendationId}`); bindings.set(key, value); }
  const resolutions = new Map<string, RefactorResolutionEvidenceV1>(); for (const resolution of input.resolutions) { const issues = refactorResolutionEvidenceInvariantIssues(resolution); if (issues.length) invalid(`invalid resolution authority: ${issues.join('; ')}`); const key = resolution.recommendationId; if (resolutions.has(key)) invalid(`duplicate resolution evidence: ${resolution.recommendationId}`); resolutions.set(key, resolution); }
  const cards = program.bindings.map((programBinding): RefactorBoardCardV1 => {
    const key = `${programBinding.recommendationId}\0${programBinding.recommendationDigest}`; const recommendation = recommendations.get(programBinding.recommendationId); if (!recommendation || recommendation.fingerprint !== programBinding.recommendationDigest) invalid(`missing exact recommendation readback: ${programBinding.recommendationId}`);
    const binding = bindings.get(key) ?? null; const resolution = resolutions.get(programBinding.recommendationId) ?? null;
    if (resolution && (!binding || resolution.verifiedHeadSha !== input.measuredHeadSha)) invalid(`resolution is not measured at the exact board head: ${programBinding.recommendationId}`);
    let architectureResult: RefactorBoardArchitectureResult; let source: 'archctx' | 'repo-harness';
    if (recommendation.status === 'superseded') { architectureResult = 'superseded'; source = 'archctx'; }
    else if (!binding) { architectureResult = 'open'; source = 'archctx'; }
    else if (!resolution) { architectureResult = 'merged_pending_measurement'; source = 'repo-harness'; }
    else if (resolution.disposition === 'resolved' && recommendation.status === 'resolved') { architectureResult = 'resolved'; source = 'archctx'; }
    else if (resolution.disposition === 'resolved') { architectureResult = 'merged_pending_measurement'; source = 'repo-harness'; }
    else if (resolution.disposition === 'stale') { architectureResult = 'reconciliation_required'; source = 'archctx'; }
    else { architectureResult = 'follow_up_required'; source = 'archctx'; }
    return Object.freeze({ recommendationId: programBinding.recommendationId, recommendationDigest: programBinding.recommendationDigest, candidateAlias: programBinding.candidateAlias, route: program.route,
      affectedNodeIds: program.affectedNodeIds, execution: binding ? 'merged' : program.route === 'architecture_intervention' ? 'awaiting_approval' : 'awaiting_execution', architectureResult,
      resolutionDisposition: resolution?.disposition ?? null, executionBindingSha256: binding?.bindingSha256 ?? null, resolutionDigest: resolution?.resolutionDigest ?? null,
      sources: Object.freeze({ route: 'repo-harness', execution: 'repo-harness', architectureResult: source }) });
  });
  const basis = { protocol: REFACTOR_BOARD_PROTOCOL, programId: program.programId, programDigest: program.programDigest, measuredHeadSha: input.measuredHeadSha, cards } as const;
  return Object.freeze({ ...basis, cards: Object.freeze(cards), boardDigest: canonicalMessageDigest(basis) });
}

export function renderRefactorBoardMarkdown(board: RefactorBoardV1): string {
  const rows = board.cards.map((card) => `| \`${card.recommendationId}\` | ${card.route} | ${card.affectedNodeIds.join(', ')} | ${card.execution} | ${card.architectureResult}${card.resolutionDisposition ? ` (${card.resolutionDisposition})` : ''} |`);
  return `# Refactor Board: ${board.programId}\n\n> Projection: \`${board.boardDigest}\`\n> Measured HEAD: \`${board.measuredHeadSha}\`\n\n| Recommendation | Route | Modules | Execution | Architecture result |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
}
