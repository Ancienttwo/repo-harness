import {
  recommendationV3InvariantIssues,
  refactorRequestInvariantIssues,
  refactorResolutionEvidenceInvariantIssues,
  refactorScanInvariantIssues,
  refactorVerificationRequestInvariantIssues,
  type ArchitectureRepositoryIdentityV1,
  type ArchitectureWorktreeIdentityV1,
  type ModuleStatisticsSnapshotV1,
  type RecommendationV3,
  type RefactorAssessmentV1,
  type RefactorProposalV1,
  type RefactorRequestV1,
  type RefactorResolutionEvidenceV1,
  type RefactorVerificationRequestV1,
} from "archctx-contracts";
import { canonicalize } from "../evidence/canonical-json";
import type { RefactorProviderStage } from "./policy";

export type RefactorProviderErrorCode =
  | "refactor_provider_version_mismatch"
  | "refactor_provider_result_invalid"
  | "refactor_assessment_stale";

export class RefactorProviderError extends Error {
  constructor(readonly code: RefactorProviderErrorCode | string, message: string) { super(message); this.name = "RefactorProviderError"; }
}

export interface RefactorScanResultV1 {
  schemaVersion: "archcontext.runtime-refactor-scan/v1";
  repository: ArchitectureRepositoryIdentityV1;
  worktree: ArchitectureWorktreeIdentityV1;
  requestId: string;
  request: RefactorRequestV1;
  snapshot: ModuleStatisticsSnapshotV1;
  assessment: RefactorAssessmentV1;
  proposal?: RefactorProposalV1;
  proposedRecommendations: RecommendationV3[];
}

export interface RefactorRecordResultV1 {
  schemaVersion: "archcontext.runtime-refactor-record/v1";
  repository: ArchitectureRepositoryIdentityV1;
  worktree: ArchitectureWorktreeIdentityV1;
  assessmentDigest: string;
  recommendationIds: string[];
  recommendations: RecommendationV3[];
}

export interface RefactorVerifyResultV1 {
  schemaVersion: "archcontext.runtime-refactor-verify/v1";
  repository: ArchitectureRepositoryIdentityV1;
  worktree: ArchitectureWorktreeIdentityV1;
  recommendationId: string;
  disposition: string | null;
  evidence: RefactorResolutionEvidenceV1 | null;
}

export type RefactorRecommendationAuthorityV1 = RecommendationV3;

export interface RefactorRecommendationReadbackV1 {
  readonly headSha: string;
  readonly recommendations: readonly RecommendationV3[];
}
export interface RefactorResolutionRecordResultV1 { readonly recommendationId: string; readonly previousStatus: string; readonly nextStatus: 'resolved'; readonly recommendation: RecommendationV3 }

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RefactorProviderError("refactor_provider_result_invalid", `${label} must be an object`);
  return value as Record<string, unknown>;
}

export function assertRefactorCapabilities(value: unknown, stage: RefactorProviderStage): void {
  const input = record(value, "archctx capabilities");
  const pkg = record(input.package, "archctx capabilities.package");
  if (input.schemaVersion !== "archcontext.capabilities/v1" || pkg.name !== "archctx" || pkg.version !== stage.provider_version) {
    throw new RefactorProviderError("refactor_provider_version_mismatch", `expected archctx@${stage.provider_version} capabilities`);
  }
  if (!Array.isArray(input.features) || stage.required_features.some((feature) => !(input.features as unknown[]).includes(feature))) {
    throw new RefactorProviderError("refactor_provider_version_mismatch", `archctx@${stage.provider_version} is missing required refactor features`);
  }
}

export function assertRefactorRequest(value: RefactorRequestV1): void {
  const issues = refactorRequestInvariantIssues(value);
  if (issues.length) throw new RefactorProviderError("refactor_provider_result_invalid", `invalid refactor request: ${issues.join("; ")}`);
}

export function assertRefactorVerificationRequest(value: RefactorVerificationRequestV1): void {
  const issues = refactorVerificationRequestInvariantIssues(value);
  if (issues.length) throw new RefactorProviderError("refactor_provider_result_invalid", `invalid refactor verification request: ${issues.join("; ")}`);
}

function dataOf(value: unknown, requestId: string): Record<string, unknown> {
  const envelope = record(value, requestId);
  if (envelope.schemaVersion === "archcontext.envelope/v1" && envelope.ok === false) {
    const error = record(envelope.error, `${requestId}.error`);
    throw new RefactorProviderError(typeof error.code === "string" ? error.code : "refactor_provider_result_invalid", typeof error.message === "string" ? error.message : `${requestId} failed`);
  }
  if (envelope.schemaVersion !== "archcontext.envelope/v1" || envelope.ok !== true || envelope.requestId !== requestId) {
    throw new RefactorProviderError("refactor_provider_result_invalid", `${requestId} returned an invalid envelope`);
  }
  return record(envelope.data, `${requestId}.data`);
}

function identity(data: Record<string, unknown>, expectedHeadSha?: string, expectedWorktreeDigest?: string): ArchitectureWorktreeIdentityV1 {
  const worktree = record(data.worktree, "refactor result worktree") as unknown as ArchitectureWorktreeIdentityV1;
  if (typeof worktree.headSha !== "string" || typeof worktree.worktreeDigest !== "string") throw new RefactorProviderError("refactor_provider_result_invalid", "refactor result worktree identity is invalid");
  if ((expectedHeadSha && worktree.headSha !== expectedHeadSha) || (expectedWorktreeDigest && worktree.worktreeDigest !== expectedWorktreeDigest)) {
    throw new RefactorProviderError("refactor_assessment_stale", "refactor provider returned a different HEAD or worktree digest");
  }
  return worktree;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalize(left as never) === canonicalize(right as never);
}

function repository(data: Record<string, unknown>): ArchitectureRepositoryIdentityV1 {
  const value = record(data.repository, "refactor result repository") as unknown as ArchitectureRepositoryIdentityV1;
  if (typeof value.repositoryId !== "string" || !value.repositoryId || typeof value.storageRepositoryId !== "string" || !value.storageRepositoryId) {
    throw new RefactorProviderError("refactor_provider_result_invalid", "refactor result repository identity is invalid");
  }
  return value;
}

export function assertRefactorScanResult(value: unknown, request: RefactorRequestV1): RefactorScanResultV1 {
  const data = dataOf(value, "refactor.scan");
  if (data.schemaVersion !== "archcontext.runtime-refactor-scan/v1") throw new RefactorProviderError("refactor_provider_result_invalid", "refactor scan schemaVersion is invalid");
  const resultRepository = repository(data);
  const resultWorktree = identity(data, request.expectedHeadSha, request.expectedWorktreeDigest);
  if (!sameJson(data.request, request)) throw new RefactorProviderError("refactor_provider_result_invalid", "refactor scan request identity is invalid");
  const snapshot = data.snapshot as ModuleStatisticsSnapshotV1;
  const assessment = data.assessment as RefactorAssessmentV1;
  const proposal = data.proposal as RefactorProposalV1 | undefined;
  const issues = refactorScanInvariantIssues({ snapshot, assessment, ...(proposal ? { proposal } : {}) });
  if (issues.length) throw new RefactorProviderError("refactor_provider_result_invalid", `invalid refactor scan result: ${issues.join("; ")}`);
  if (!sameJson(snapshot.repository, resultRepository) || !sameJson(snapshot.worktree, resultWorktree)) {
    throw new RefactorProviderError("refactor_provider_result_invalid", "refactor scan identity disagrees with its statistics snapshot");
  }
  if (!Array.isArray(data.proposedRecommendations)) throw new RefactorProviderError("refactor_provider_result_invalid", "refactor scan recommendations must be an array");
  for (const recommendation of data.proposedRecommendations as RecommendationV3[]) {
    const recommendationIssues = recommendationV3InvariantIssues(recommendation);
    if (recommendationIssues.length) throw new RefactorProviderError("refactor_provider_result_invalid", `invalid proposed recommendation: ${recommendationIssues.join("; ")}`);
  }
  return data as unknown as RefactorScanResultV1;
}

export function assertRefactorRecordResult(value: unknown, expectedAssessmentDigest: string, expectedWorktreeDigest: string): RefactorRecordResultV1 {
  const data = dataOf(value, "refactor.record");
  if (data.schemaVersion !== "archcontext.runtime-refactor-record/v1") throw new RefactorProviderError("refactor_provider_result_invalid", "refactor record schemaVersion is invalid");
  repository(data);
  identity(data, undefined, expectedWorktreeDigest);
  if (data.assessmentDigest !== expectedAssessmentDigest) throw new RefactorProviderError("refactor_provider_result_invalid", "refactor record assessment identity is invalid");
  if (!Array.isArray(data.recommendations) || !Array.isArray(data.recommendationIds)) throw new RefactorProviderError("refactor_provider_result_invalid", "refactor record recommendations are invalid");
  for (const recommendation of data.recommendations as RecommendationV3[]) {
    const issues = recommendationV3InvariantIssues(recommendation);
    if (issues.length) throw new RefactorProviderError("refactor_provider_result_invalid", `invalid recorded recommendation: ${issues.join("; ")}`);
  }
  return data as unknown as RefactorRecordResultV1;
}

export function assertRefactorRecommendationReadback(value: unknown, expectedHeadSha: string): RefactorRecommendationReadbackV1 {
  const data = dataOf(value, "book.recommendations");
  if (data.schemaVersion !== "archcontext.architecture-book-recommendations/v1" || !Array.isArray(data.recommendations)) {
    throw new RefactorProviderError("refactor_provider_result_invalid", "ArchContext recommendation readback is invalid");
  }
  const freshness = record(data.freshness, "book recommendations freshness");
  const worktree = record(freshness.worktree, "book recommendations freshness.worktree");
  if (worktree.headSha !== expectedHeadSha) throw new RefactorProviderError("refactor_assessment_stale", "ArchContext recommendation readback is not bound to the authorized HEAD");
  const recommendations: RecommendationV3[] = [];
  for (const recommendation of data.recommendations as RecommendationV3[]) {
    const issues = recommendationV3InvariantIssues(recommendation);
    if (issues.length) throw new RefactorProviderError("refactor_provider_result_invalid", `invalid recommendation readback: ${issues.join("; ")}`);
    recommendations.push(Object.freeze(recommendation));
  }
  return Object.freeze({ headSha: expectedHeadSha, recommendations: Object.freeze(recommendations) });
}

export function assertAcceptedRefactorRecommendations(value: unknown, expectedHeadSha: string): readonly RefactorRecommendationAuthorityV1[] {
  const readback = assertRefactorRecommendationReadback(value, expectedHeadSha);
  return Object.freeze(readback.recommendations.filter((entry) => entry.status === 'accepted'));
}

export function assertRefactorResolutionRecord(value: unknown, recommendationId: string): RefactorResolutionRecordResultV1 {
  const data = dataOf(value, 'recommendations.resolve');
  if (data.schemaVersion !== 'archcontext.runtime-recommendation-lifecycle/v1' || data.action !== 'resolve' || data.recommendationId !== recommendationId || data.nextStatus !== 'resolved') throw new RefactorProviderError('refactor_provider_result_invalid', 'ArchContext resolution record is invalid');
  const recommendation = data.recommendation as RecommendationV3; const issues = recommendationV3InvariantIssues(recommendation);
  if (issues.length || recommendation.recommendationId !== recommendationId || recommendation.status !== 'resolved') throw new RefactorProviderError('refactor_provider_result_invalid', `invalid resolved recommendation readback: ${issues.join('; ')}`);
  return Object.freeze({ recommendationId, previousStatus: String(data.previousStatus), nextStatus: 'resolved', recommendation });
}

export function assertRefactorVerifyResult(value: unknown, request: RefactorVerificationRequestV1): RefactorVerifyResultV1 {
  const data = dataOf(value, "refactor.verify");
  if (data.schemaVersion !== "archcontext.runtime-refactor-verify/v1" || data.recommendationId !== request.recommendationId) throw new RefactorProviderError("refactor_provider_result_invalid", "refactor verify subject is invalid");
  repository(data);
  const resultWorktree = identity(data, request.expectedHeadSha, request.expectedWorktreeDigest);
  if (data.evidence !== null) {
    const evidence = data.evidence as RefactorResolutionEvidenceV1;
    const issues = refactorResolutionEvidenceInvariantIssues(evidence);
    if (issues.length) throw new RefactorProviderError("refactor_provider_result_invalid", `invalid refactor verify evidence: ${issues.join("; ")}`);
    if (evidence.recommendationId !== request.recommendationId || evidence.disposition !== data.disposition || evidence.verifiedHeadSha !== resultWorktree.headSha || evidence.verifiedWorktreeDigest !== resultWorktree.worktreeDigest) {
      throw new RefactorProviderError("refactor_provider_result_invalid", "refactor verify evidence identity disagrees with its result envelope");
    }
    if (!sameJson(evidence.executionEvidenceRefs, request.executionEvidenceRefs ?? [])) throw new RefactorProviderError('refactor_provider_result_invalid', 'refactor verify evidence does not bind the requested execution evidence');
  }
  return data as unknown as RefactorVerifyResultV1;
}
