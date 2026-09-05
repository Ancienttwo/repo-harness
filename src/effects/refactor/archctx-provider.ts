import type { RecommendationV3, RefactorRequestV1, RefactorVerificationRequestV1 } from "archctx-contracts";
import { canonicalize } from "../../core/evidence/canonical-json";
import {
  assertRefactorCapabilities,
  assertAcceptedRefactorRecommendations,
  assertRefactorRecommendationReadback,
  assertRefactorResolutionRecord,
  assertRefactorRecordResult,
  assertRefactorRequest,
  assertRefactorScanResult,
  assertRefactorVerificationRequest,
  assertRefactorVerifyResult,
  RefactorProviderError,
  type RefactorRecordResultV1,
  type RefactorRecommendationReadbackV1,
  type RefactorResolutionRecordResultV1,
  type RefactorScanResultV1,
  type RefactorVerifyResultV1,
} from "../../core/refactor/provider-contract";
import { loadRefactorPolicy, type RefactorPolicy, type RefactorProviderStage } from "../../core/refactor/policy";
import { runPackageLocalArchctxJson, type ArchctxProviderOptions } from "../architecture/archctx-provider";

export interface RefactorArchctxProviderOptions extends ArchctxProviderOptions { refactorPolicy?: RefactorPolicy }

function invoke(
  repoRoot: string,
  stage: RefactorProviderStage,
  args: readonly string[],
  options: RefactorArchctxProviderOptions,
): unknown {
  try {
    const capabilities = runPackageLocalArchctxJson(repoRoot, stage.provider_version, ["capabilities", "--json"], options, 10_000).value;
    assertRefactorCapabilities(capabilities, stage);
    return runPackageLocalArchctxJson(repoRoot, stage.provider_version, args, options, 120_000, true).value;
  } catch (error) {
    if (error instanceof RefactorProviderError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const code = /mismatch|expected archctx@|not found|is missing/.test(message)
      ? "refactor_provider_version_mismatch"
      : "refactor_provider_result_invalid";
    throw new RefactorProviderError(code, message);
  }
}

export function runRefactorScan(request: RefactorRequestV1, repoRoot: string, options: RefactorArchctxProviderOptions = {}): RefactorScanResultV1 {
  assertRefactorRequest(request);
  const policy = options.refactorPolicy ?? loadRefactorPolicy(repoRoot);
  const value = invoke(repoRoot, policy.stages.scan, ["refactor", "scan", "--request-json", canonicalize(request as never), "--json"], options);
  return assertRefactorScanResult(value, request);
}

export function runRefactorRecord(
  assessmentDigest: string,
  expectedWorktreeDigest: string,
  repoRoot: string,
  options: RefactorArchctxProviderOptions = {},
): RefactorRecordResultV1 {
  if (!/^sha256:[a-f0-9]{64}$/.test(assessmentDigest) || !/^sha256:[a-f0-9]{64}$/.test(expectedWorktreeDigest)) {
    throw new RefactorProviderError("refactor_provider_result_invalid", "refactor record digests must be canonical sha256 values");
  }
  const policy = options.refactorPolicy ?? loadRefactorPolicy(repoRoot);
  const value = invoke(repoRoot, policy.stages.scan, ["refactor", "record", "--assessment-digest", assessmentDigest, "--expected-worktree-digest", expectedWorktreeDigest, "--json"], options);
  return assertRefactorRecordResult(value, assessmentDigest, expectedWorktreeDigest);
}

export function readAcceptedRefactorRecommendations(
  expectedHeadSha: string,
  repoRoot: string,
  options: RefactorArchctxProviderOptions = {},
): readonly RecommendationV3[] {
  const policy = options.refactorPolicy ?? loadRefactorPolicy(repoRoot);
  const value = invoke(repoRoot, policy.stages.scan, ["book", "recommendations", "--json"], options);
  return assertAcceptedRefactorRecommendations(value, expectedHeadSha);
}

export function readRefactorRecommendationRecords(
  expectedHeadSha: string,
  repoRoot: string,
  options: RefactorArchctxProviderOptions = {},
): RefactorRecommendationReadbackV1 {
  const policy = options.refactorPolicy ?? loadRefactorPolicy(repoRoot);
  const value = invoke(repoRoot, policy.stages.scan, ["book", "recommendations", "--json"], options);
  return assertRefactorRecommendationReadback(value, expectedHeadSha);
}

export function recordRefactorResolution(
  recommendationId: string,
  resolutionDigest: string,
  expectedWorktreeDigest: string,
  reason: string,
  repoRoot: string,
  options: RefactorArchctxProviderOptions = {},
): RefactorResolutionRecordResultV1 {
  if (!recommendationId || !/^sha256:[a-f0-9]{64}$/u.test(resolutionDigest) || !/^sha256:[a-f0-9]{64}$/u.test(expectedWorktreeDigest) || !reason.trim()) throw new RefactorProviderError('refactor_provider_result_invalid', 'resolution record input is invalid');
  const policy = options.refactorPolicy ?? loadRefactorPolicy(repoRoot);
  const value = invoke(repoRoot, policy.stages.verify, ['recommendations', 'resolve', '--id', recommendationId, '--reason', reason, '--expected-worktree-digest', expectedWorktreeDigest, '--evidence-digest', resolutionDigest, '--json'], options);
  return assertRefactorResolutionRecord(value, recommendationId);
}

export function runRefactorVerify(request: RefactorVerificationRequestV1, repoRoot: string, options: RefactorArchctxProviderOptions = {}): RefactorVerifyResultV1 {
  assertRefactorVerificationRequest(request);
  const policy = options.refactorPolicy ?? loadRefactorPolicy(repoRoot);
  const value = invoke(repoRoot, policy.stages.verify, ["refactor", "verify", "--request-json", canonicalize(request as never), "--json"], options);
  return assertRefactorVerifyResult(value, request);
}
