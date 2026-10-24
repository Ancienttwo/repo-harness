import type { RecommendationV3 } from "archctx-contracts";
import { ARCHCTX_REQUIRED_VERSION } from "../../core/architecture/projection";
import { canonicalize } from "../../core/evidence/canonical-json";
import {
  refactorEnvelopeData,
  RefactorProviderError,
  type RefactorScanResultV1,
} from "../../core/refactor/provider-contract";
import { ArchctxClientError, commandLabel, runPackageLocalArchctxJson, type ArchctxProviderOptions } from "../architecture/archctx-provider";

export type RefactorDecision = "accept" | "defer" | "reject";

export const REFACTOR_DEFAULT_TIMEOUT_MS = 120_000;
export const REFACTOR_MAX_TIMEOUT_MS = 600_000;

/** Package resolution refuses an installed archctx whose manifest is not the pinned version. */
function invoke(repoRoot: string, args: readonly string[], options: ArchctxProviderOptions, timeoutMs: number): unknown {
  try {
    return runPackageLocalArchctxJson(repoRoot, ARCHCTX_REQUIRED_VERSION, args, options, timeoutMs, true).value;
  } catch (error) {
    if (error instanceof RefactorProviderError) throw error;
    if (error instanceof ArchctxClientError && error.code === "RH_ARCHCTX_TIMEOUT") {
      throw new RefactorProviderError("refactor_provider_timeout", `${commandLabel(args)} timed out after ${timeoutMs} ms. Retry with --timeout-ms <larger value> (max ${REFACTOR_MAX_TIMEOUT_MS}).`, "raise-timeout-and-retry");
    }
    throw new RefactorProviderError("refactor_provider_unavailable", error instanceof Error ? error.message : String(error));
  }
}

export function runRefactorScan(repoRoot: string, options: ArchctxProviderOptions = {}, importNodeLimit?: number, timeoutMs = REFACTOR_DEFAULT_TIMEOUT_MS): RefactorScanResultV1 {
  const request = { schemaVersion: "archcontext.refactor-request/v1", scope: { kind: "repository" } };
  const value = invoke(repoRoot, ["refactor", "scan", "--request-json", canonicalize(request as never), ...importNodeLimitArgs(importNodeLimit), "--json"], options, timeoutMs);
  return refactorEnvelopeData(value, "refactor.scan", "archcontext.runtime-refactor-scan/v1") as unknown as RefactorScanResultV1;
}

/** Recorded suggestions the user has not decided yet. A scan no longer proposes these, because archctx suppresses a candidate whose fingerprint is already recorded. */
export function listOpenRecommendations(repoRoot: string, options: ArchctxProviderOptions = {}, timeoutMs = REFACTOR_DEFAULT_TIMEOUT_MS): readonly RecommendationV3[] {
  const data = refactorEnvelopeData(invoke(repoRoot, ["recommendations", "list", "--status", "open", "--json"], options, timeoutMs), "recommendations.list", "archcontext.runtime-recommendation-list/v1");
  if (!Array.isArray(data.recommendations)) throw new RefactorProviderError("refactor_provider_result_invalid", "recommendations.list returned no recommendations array");
  return data.recommendations as RecommendationV3[];
}

/** One call decides a recorded suggestion or a fresh scan candidate. archctx requires the scan's import node limit here. */
export function decideRecommendation(recommendationId: string, decision: RefactorDecision, reason: string, repoRoot: string, options: ArchctxProviderOptions = {}, importNodeLimit?: number, timeoutMs = REFACTOR_DEFAULT_TIMEOUT_MS): RecommendationV3 {
  const data = refactorEnvelopeData(invoke(repoRoot, ["recommendations", decision, "--id", recommendationId, "--reason", reason, ...importNodeLimitArgs(importNodeLimit), "--json"], options, timeoutMs),
    `recommendations.${decision}`, "archcontext.runtime-recommendation-lifecycle/v1");
  return data.recommendation as RecommendationV3;
}

function importNodeLimitArgs(importNodeLimit: number | undefined): string[] {
  return importNodeLimit === undefined ? [] : ["--import-node-limit", String(importNodeLimit)];
}
