import { lstatSync } from 'fs';
import { resolve, sep } from 'path';
import type { RecommendationV3, RefactorProposalV1, RefactorRequestV1 } from 'archctx-contracts';
import type { RefactorScanResultV1 } from '../../core/refactor/provider-contract';
import { runRefactorScan, type RefactorArchctxProviderOptions } from './archctx-provider';

export type RefactorDiscoveryErrorCode =
  | 'refactor_discovery_invalid'
  | 'refactor_candidate_not_found'
  | 'refactor_proposal_scope_invalid';

export class RefactorDiscoveryError extends Error {
  constructor(readonly code: RefactorDiscoveryErrorCode, message: string) {
    super(message);
    this.name = 'RefactorDiscoveryError';
  }
}

export interface RefactorDiscoveryCandidateV1 {
  readonly alias: string;
  readonly recommendationId: string;
  readonly recommendationFingerprint: string;
  readonly recommendation: RecommendationV3 & { category: 'structural_observation' };
}

export interface RefactorDiscoveryV1 {
  readonly scan: RefactorScanResultV1;
  readonly candidates: readonly RefactorDiscoveryCandidateV1[];
}

export function projectRefactorDiscovery(scan: RefactorScanResultV1): RefactorDiscoveryV1 {
  if (scan.request.proposal || scan.assessment.scale !== null || scan.assessment.proposalDigest !== null || scan.proposal !== undefined) {
    throw new RefactorDiscoveryError('refactor_discovery_invalid', 'discovery scan returned proposal-derived fields');
  }
  const observations = scan.proposedRecommendations.filter(
    (value): value is RecommendationV3 & { category: 'structural_observation' } => value.category === 'structural_observation',
  );
  if (observations.length !== scan.proposedRecommendations.length) {
    throw new RefactorDiscoveryError('refactor_discovery_invalid', 'discovery scan returned a non-observation recommendation');
  }
  const candidates = observations.map((recommendation, index) => Object.freeze({
    alias: `C${String(index + 1).padStart(2, '0')}`,
    recommendationId: recommendation.recommendationId,
    recommendationFingerprint: recommendation.fingerprint,
    recommendation,
  }));
  return Object.freeze({ scan, candidates: Object.freeze(candidates) });
}

function assertProposalFiles(repoRootInput: string, proposal: RefactorProposalV1): void {
  const repoRoot = resolve(repoRootInput);
  for (const path of proposal.scopePaths) {
    const absolute = resolve(repoRoot, path);
    if (absolute === repoRoot || !absolute.startsWith(`${repoRoot}${sep}`)) {
      throw new RefactorDiscoveryError('refactor_proposal_scope_invalid', `proposal scope path is not a repository file: ${path}`);
    }
    try {
      if (!lstatSync(absolute).isFile()) throw new Error('not a file');
    } catch {
      throw new RefactorDiscoveryError('refactor_proposal_scope_invalid', `proposal scope path is not a file: ${path}`);
    }
  }
}

export function discoverRefactorCandidates(
  request: RefactorRequestV1,
  repoRoot: string,
  options: RefactorArchctxProviderOptions = {},
): RefactorDiscoveryV1 {
  if (request.proposal) throw new RefactorDiscoveryError('refactor_discovery_invalid', 'discovery scan must not contain a proposal');
  return projectRefactorDiscovery(runRefactorScan(request, repoRoot, options));
}

export function assessRefactorProposal(
  input: {
    readonly discovery: RefactorDiscoveryV1;
    readonly candidateAlias: string;
    readonly proposal: RefactorProposalV1;
  },
  repoRoot: string,
  options: RefactorArchctxProviderOptions = {},
): { readonly candidate: RefactorDiscoveryCandidateV1; readonly scan: RefactorScanResultV1 } {
  const candidate = input.discovery.candidates.find((value) => value.alias === input.candidateAlias);
  if (!candidate) throw new RefactorDiscoveryError('refactor_candidate_not_found', `unknown discovery candidate: ${input.candidateAlias}`);
  assertProposalFiles(repoRoot, input.proposal);
  const scan = runRefactorScan({ ...input.discovery.scan.request, proposal: input.proposal }, repoRoot, options);
  return bindRefactorAssessment(candidate, input.proposal, scan);
}

export function bindRefactorAssessment(
  candidate: RefactorDiscoveryCandidateV1,
  proposal: RefactorProposalV1,
  scan: RefactorScanResultV1,
): { readonly candidate: RefactorDiscoveryCandidateV1; readonly scan: RefactorScanResultV1 } {
  if (scan.assessment.proposalDigest !== proposal.proposalDigest || scan.assessment.scale === null) {
    throw new RefactorDiscoveryError('refactor_discovery_invalid', 'proposal assessment did not return a proposal-bound scale');
  }
  return Object.freeze({ candidate, scan });
}
