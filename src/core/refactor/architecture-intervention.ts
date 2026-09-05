import { recommendationV3InvariantIssues, type RecommendationV3 } from 'archctx-contracts';

import { canonicalMessageDigest } from '../messages/mechanics';
import { assertRefactorProgramRecommendationAuthority, validateRefactorProgram, type RefactorProgramV1 } from './program';

export interface RefactorArchitectureInterventionV1 {
  readonly programId: string;
  readonly recommendationId: string;
  readonly recommendationDigest: string;
  readonly affectedNodeIds: readonly string[];
  readonly majorChangeReasons: readonly string[];
  readonly targetDelta: NonNullable<Extract<RecommendationV3, { category: 'refactor_proposal' }>['payload']['targetDelta']>;
  readonly approvalReference: string;
  readonly readiness: 'approval_required' | 'target_resolution_required';
  readonly interventionDigest: string;
}

export class RefactorArchitectureInterventionError extends Error {
  readonly code = 'refactor_architecture_intervention_invalid' as const;
  constructor(message: string) { super(message); this.name = 'RefactorArchitectureInterventionError'; }
}

function invalid(message: string): never { throw new RefactorArchitectureInterventionError(message); }
function same(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }

export function projectRefactorArchitectureIntervention(
  programInput: RefactorProgramV1,
  recommendation: RecommendationV3,
): RefactorArchitectureInterventionV1 {
  const program = validateRefactorProgram(programInput);
  if (program.route !== 'architecture_intervention' || program.scale !== 'architecture') invalid('program is not an architecture intervention');
  const issues = recommendationV3InvariantIssues(recommendation);
  if (issues.length) invalid(`recommendation readback is invalid: ${issues.join('; ')}`);
  if (recommendation.status !== 'accepted' || recommendation.category !== 'refactor_proposal' || recommendation.payload.scale !== 'architecture') invalid('architecture recommendation is not accepted');
  assertRefactorProgramRecommendationAuthority(program, [recommendation]);
  const binding = program.bindings.find((entry) => entry.recommendationId === recommendation.recommendationId);
  if (!binding || binding.recommendationDigest !== recommendation.fingerprint || binding.executionBoundary !== 'architecture_intervention') invalid('architecture recommendation does not match its Program binding');
  if (!same(program.affectedNodeIds, recommendation.payload.affectedNodeIds) || !same(program.majorChangeReasons, recommendation.payload.majorChangeReasons)) invalid('architecture recommendation disagrees with the Program assessment projection');
  if (!recommendation.payload.targetDelta) invalid('architecture recommendation has no targetDelta');
  const basis = {
    programId: program.programId, recommendationId: recommendation.recommendationId,
    recommendationDigest: recommendation.fingerprint, affectedNodeIds: [...program.affectedNodeIds], majorChangeReasons: [...program.majorChangeReasons],
    targetDelta: recommendation.payload.targetDelta,
  };
  const interventionDigest = canonicalMessageDigest(basis);
  return Object.freeze({ ...basis, affectedNodeIds: Object.freeze(basis.affectedNodeIds), majorChangeReasons: Object.freeze(basis.majorChangeReasons),
    approvalReference: `refactor.intervention.${interventionDigest.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    readiness: recommendation.payload.targetDelta.unresolvedTargets.length ? 'target_resolution_required' : 'approval_required', interventionDigest });
}
