import type { RecommendationV3 } from "archctx-contracts";
import { ARCHCTX_REQUIRED_VERSION } from "../../core/architecture/projection";
import { canonicalize } from "../../core/evidence/canonical-json";
import {
  assertRefactorProviderVersion,
  refactorEnvelopeData,
  RefactorProviderError,
  type RefactorScanResultV1,
} from "../../core/refactor/provider-contract";
import { runPackageLocalArchctxJson, type ArchctxProviderOptions } from "../architecture/archctx-provider";

export type RefactorDecision = "accept" | "defer" | "reject";

const checkedRoots = new Set<string>();

function invoke(repoRoot: string, args: readonly string[], options: ArchctxProviderOptions): unknown {
  try {
    if (!checkedRoots.has(repoRoot)) {
      assertRefactorProviderVersion(runPackageLocalArchctxJson(repoRoot, ARCHCTX_REQUIRED_VERSION, ["capabilities", "--json"], options, 10_000).value, ARCHCTX_REQUIRED_VERSION);
      checkedRoots.add(repoRoot);
    }
    return runPackageLocalArchctxJson(repoRoot, ARCHCTX_REQUIRED_VERSION, args, options, 120_000, true).value;
  } catch (error) {
    if (error instanceof RefactorProviderError) throw error;
    throw new RefactorProviderError("refactor_provider_unavailable", error instanceof Error ? error.message : String(error));
  }
}

export function runRefactorScan(repoRoot: string, options: ArchctxProviderOptions = {}): RefactorScanResultV1 {
  const request = { schemaVersion: "archcontext.refactor-request/v1", scope: { kind: "repository" } };
  const value = invoke(repoRoot, ["refactor", "scan", "--request-json", canonicalize(request as never), "--json"], options);
  return refactorEnvelopeData(value, "refactor.scan", "archcontext.runtime-refactor-scan/v1") as unknown as RefactorScanResultV1;
}

export function readRecommendationRecords(repoRoot: string, options: ArchctxProviderOptions = {}): readonly RecommendationV3[] {
  const data = refactorEnvelopeData(invoke(repoRoot, ["book", "recommendations", "--json"], options), "book.recommendations", "archcontext.architecture-book-recommendations/v1");
  return Array.isArray(data.recommendations) ? data.recommendations as RecommendationV3[] : [];
}

/** Puts a scan's observations into the ArchContext lifecycle ledger so they can take a decision. */
export function recordRefactorScan(scan: RefactorScanResultV1, repoRoot: string, options: ArchctxProviderOptions = {}): void {
  refactorEnvelopeData(invoke(repoRoot, ["refactor", "record", "--assessment-digest", assessmentDigestOf(scan),
    "--expected-worktree-digest", scan.worktree.worktreeDigest, "--json"], options), "refactor.record", "archcontext.runtime-refactor-record/v1");
}

export function decideRecommendation(recommendationId: string, decision: RefactorDecision, reason: string, repoRoot: string, options: ArchctxProviderOptions = {}): RecommendationV3 {
  const data = refactorEnvelopeData(invoke(repoRoot, ["recommendations", decision, "--id", recommendationId, "--reason", reason, "--json"], options),
    `recommendations.${decision}`, "archcontext.runtime-recommendation-lifecycle/v1");
  return data.recommendation as RecommendationV3;
}

function assessmentDigestOf(scan: RefactorScanResultV1): string {
  const observation = scan.proposedRecommendations.find((entry) => entry.category === "structural_observation");
  if (!observation || observation.category !== "structural_observation") throw new RefactorProviderError("refactor_provider_result_invalid", "refactor scan has no observation to record");
  return observation.payload.assessmentDigest;
}
