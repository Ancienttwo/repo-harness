import {
  REFACTOR_PROPOSAL_AUTHOR_KINDS,
  REFACTOR_PROPOSAL_AUTHOR_PAIRS,
  REFACTOR_PROPOSAL_AUTHOR_SOURCES,
  refactorProposalDigest,
  refactorProposalInvariantIssues,
  type ArchitectureTargetDeltaV1,
  type RecommendationAuthorV1,
  type RefactorKillListEntryV1,
  type RefactorProposalAuthorKind,
  type RefactorProposalAuthorSource,
  type RefactorProposalV1,
  type RefactorTargetOutcomeV1,
} from 'archctx-contracts';

const AUTHORING_FIELDS = new Set(['authoredBy', 'intent', 'scopePaths', 'targetDelta', 'targetOutcomes', 'killList']);

export type RefactorProposalAuthoringErrorCode =
  | 'AC_REFACTOR_PROPOSAL_UNAUTHORED'
  | 'refactor_proposal_invalid';

export class RefactorProposalAuthoringError extends Error {
  constructor(readonly code: RefactorProposalAuthoringErrorCode, message: string) {
    super(message);
    this.name = 'RefactorProposalAuthoringError';
  }
}

export interface RefactorProposalDraftV1 {
  readonly authoredBy: RecommendationAuthorV1;
  readonly intent: string;
  readonly scopePaths: string[];
  readonly targetDelta?: ArchitectureTargetDeltaV1;
  readonly targetOutcomes: RefactorTargetOutcomeV1[];
  readonly killList: RefactorKillListEntryV1[];
}

function authorIsAllowed(author: RecommendationAuthorV1): boolean {
  if (!(REFACTOR_PROPOSAL_AUTHOR_KINDS as readonly string[]).includes(author.kind)) return false;
  if (!(REFACTOR_PROPOSAL_AUTHOR_SOURCES as readonly string[]).includes(author.source)) return false;
  return REFACTOR_PROPOSAL_AUTHOR_PAIRS[author.kind as RefactorProposalAuthorKind]
    .includes(author.source as RefactorProposalAuthorSource);
}

export function authorRefactorProposal(input: RefactorProposalDraftV1): RefactorProposalV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RefactorProposalAuthoringError('refactor_proposal_invalid', 'proposal draft must be an object');
  }
  const unknown = Object.keys(input).filter((key) => !AUTHORING_FIELDS.has(key));
  if (unknown.length) {
    throw new RefactorProposalAuthoringError(
      'refactor_proposal_invalid',
      `proposal author cannot set fields outside the authoring contract: ${unknown.join(', ')}`,
    );
  }
  if (!input.authoredBy || !authorIsAllowed(input.authoredBy)) {
    throw new RefactorProposalAuthoringError(
      'AC_REFACTOR_PROPOSAL_UNAUTHORED',
      'refactor proposal author kind/source pair is not authorized',
    );
  }
  const draft = {
    schemaVersion: 'archcontext.refactor-proposal/v1' as const,
    authoredBy: input.authoredBy,
    intent: input.intent,
    scopePaths: [...input.scopePaths],
    ...(input.targetDelta ? { targetDelta: input.targetDelta } : {}),
    targetOutcomes: [...input.targetOutcomes],
    killList: [...input.killList],
  };
  const proposal = {
    ...draft,
    proposalDigest: refactorProposalDigest({ ...draft, proposalDigest: `sha256:${'0'.repeat(64)}` }),
  };
  const issues = refactorProposalInvariantIssues(proposal);
  if (issues.length) throw new RefactorProposalAuthoringError('refactor_proposal_invalid', issues.join('; '));
  return proposal;
}
