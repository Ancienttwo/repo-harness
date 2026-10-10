import type {
  ArchitectureRepositoryIdentityV1,
  ArchitectureWorktreeIdentityV1,
  ModuleStatisticsSnapshotV1,
  RecommendationV3,
  RefactorAssessmentV1,
  RefactorRequestV1,
} from "archctx-contracts";

export class RefactorProviderError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "RefactorProviderError"; }
}

export interface RefactorScanResultV1 {
  schemaVersion: "archcontext.runtime-refactor-scan/v1";
  repository: ArchitectureRepositoryIdentityV1;
  worktree: ArchitectureWorktreeIdentityV1;
  requestId: string;
  request: RefactorRequestV1;
  snapshot: ModuleStatisticsSnapshotV1;
  assessment: RefactorAssessmentV1;
  proposedRecommendations: RecommendationV3[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RefactorProviderError("refactor_provider_result_invalid", `${label} must be an object`);
  return value as Record<string, unknown>;
}

/** archctx validates its own results; this only unwraps the envelope and names the payload. */
export function refactorEnvelopeData(value: unknown, requestId: string, schemaVersion: string): Record<string, unknown> {
  const envelope = record(value, requestId);
  if (envelope.ok === false) {
    const error = record(envelope.error, `${requestId}.error`);
    throw new RefactorProviderError(typeof error.code === "string" ? error.code : "refactor_provider_result_invalid", typeof error.message === "string" ? error.message : `${requestId} failed`);
  }
  const data = record(envelope.data, `${requestId}.data`);
  if (envelope.schemaVersion !== "archcontext.envelope/v1" || data.schemaVersion !== schemaVersion) {
    throw new RefactorProviderError("refactor_provider_result_invalid", `${requestId} returned an unexpected result shape`);
  }
  return data;
}
