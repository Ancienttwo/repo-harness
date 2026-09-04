import { describe, expect, test } from "bun:test";
import {
  moduleStatisticsSnapshotDigest,
  refactorAssessmentDigest,
  type ModuleStatisticsSnapshotV1,
  type RefactorAssessmentV1,
  type RefactorRequestV1,
} from "archctx-contracts";
import { runRefactorRecord, runRefactorScan, runRefactorVerify } from "../src/effects/refactor/archctx-provider";
import { RefactorProviderError } from "../src/core/refactor/provider-contract";
import { readRefactorPolicy } from "../src/core/refactor/policy";

const digest = (char: string) => `sha256:${char.repeat(64)}`;
const request: RefactorRequestV1 = { schemaVersion: "archcontext.refactor-request/v1", scope: { kind: "repository" }, expectedHeadSha: "a".repeat(40), expectedWorktreeDigest: digest("b") };

function measured() {
  const snapshotDraft: ModuleStatisticsSnapshotV1 = {
    schemaVersion: "archcontext.module-statistics/v1",
    repository: { repositoryId: "repo.test", storageRepositoryId: "storage.repo.test" },
    worktree: { workspaceId: "workspace.test", storageWorkspaceId: "storage.workspace.test", branch: "main", headSha: request.expectedHeadSha!, worktreeDigest: request.expectedWorktreeDigest! },
    modelDigest: digest("c"),
    codeFacts: { provider: "codegraph", version: "1.5.0", binaryDigest: digest("d"), indexedWorktreeDigest: request.expectedWorktreeDigest!, coverage: "complete", truncated: false, edgeLimit: 20000, reasonCodes: [] },
    modules: [],
    repositorySummary: { moduleCount: 0, undeclaredFootprintNodeCount: 0, ownedFileCount: 0, unownedFileCount: 0, multiplyOwnedFileCount: 0, crossModuleEdgeCount: 0, crossModuleCycleCount: 0, stronglyConnectedComponentCount: 0, unresolvedImportCount: 0, dynamicInvocationRiskCount: 0 },
    createdAt: "2026-09-04T00:00:00.000Z", snapshotDigest: digest("0"),
  };
  const snapshot = { ...snapshotDraft, snapshotDigest: moduleStatisticsSnapshotDigest(snapshotDraft) };
  const assessmentDraft: RefactorAssessmentV1 = {
    schemaVersion: "archcontext.refactor-assessment/v1", requestId: "request.test", statisticsSnapshotDigest: snapshot.snapshotDigest, modelDigest: snapshot.modelDigest, codeFactsDigest: digest("e"), requestedScope: request.scope, proposalDigest: null, observations: [], scale: null, scaleReasonCodes: [], affectedNodeIds: [], majorChangeReasons: [], pressure: { level: "low", score: 0, signalIds: [] }, confidence: { level: "high", callerCoverage: null, testsObserved: null, rollbackObserved: null, unresolvedEvidence: [] }, createdAt: "2026-09-04T00:00:01.000Z", assessmentDigest: digest("0"),
  };
  const assessment = { ...assessmentDraft, assessmentDigest: refactorAssessmentDigest(assessmentDraft) };
  return { snapshot, assessment };
}

function policy() { return readRefactorPolicy({ refactor: { mode: "off", provider: "archctx", stages: { scan: { provider_version: "0.5.3", required_features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] }, verify: { provider_version: "0.5.3", required_features: ["refactor-resolution-v1"] } }, require_cutover_closure: false, require_post_merge_measurement: false } }); }

describe("refactor archctx provider", () => {
  test("handshakes once and validates a scan result bound to the requested identity", () => {
    const calls: string[][] = [];
    const run = (_binary: string, args: readonly string[]) => {
      calls.push([...args]);
      const value = args[0] === "capabilities"
        ? { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3", "refactor-resolution-v1"] }
        : { schemaVersion: "archcontext.envelope/v1", ok: true, requestId: "refactor.scan", data: { schemaVersion: "archcontext.runtime-refactor-scan/v1", repository: measured().snapshot.repository, worktree: measured().snapshot.worktree, requestId: "request.test", request, ...measured(), proposedRecommendations: [] } };
      return { status: 0, signal: null, stdout: JSON.stringify(value), stderr: "" };
    };
    const result = runRefactorScan(request, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run });
    expect(result.worktree.headSha).toBe(request.expectedHeadSha!);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.slice(0, 2)).toEqual(["refactor", "scan"]);
  });

  test("rejects stale identity and missing features before returning data", () => {
    const scanRun = (_binary: string, args: readonly string[]) => ({ status: 0, signal: null, stderr: "", stdout: JSON.stringify(args[0] === "capabilities" ? { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: ["module-statistics-v1"] } : {}) });
    expect(() => runRefactorScan(request, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run: scanRun })).toThrow(RefactorProviderError);
    const staleRun = (_binary: string, args: readonly string[]) => {
      const measuredResult = measured();
      const value = args[0] === "capabilities"
        ? { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] }
        : { schemaVersion: "archcontext.envelope/v1", ok: true, requestId: "refactor.scan", data: { schemaVersion: "archcontext.runtime-refactor-scan/v1", repository: measuredResult.snapshot.repository, worktree: { ...measuredResult.snapshot.worktree, headSha: "c".repeat(40) }, requestId: "request.test", request, ...measuredResult, proposedRecommendations: [] } };
      return { status: 0, signal: null, stderr: "", stdout: JSON.stringify(value) };
    };
    try { runRefactorScan(request, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run: staleRun }); throw new Error("expected stale"); }
    catch (error) { expect((error as RefactorProviderError).code).toBe("refactor_assessment_stale"); }
  });

  test("rejects a scan envelope that is not bound to the exact request and snapshot identity", () => {
    const invalidRun = (_binary: string, args: readonly string[]) => {
      const measuredResult = measured();
      const value = args[0] === "capabilities"
        ? { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] }
        : { schemaVersion: "archcontext.envelope/v1", ok: true, requestId: "refactor.scan", data: { schemaVersion: "archcontext.runtime-refactor-scan/v1", repository: measuredResult.snapshot.repository, worktree: measuredResult.snapshot.worktree, requestId: "request.test", request: { ...request, expectedHeadSha: "c".repeat(40) }, ...measuredResult, proposedRecommendations: [] } };
      return { status: 0, signal: null, stderr: "", stdout: JSON.stringify(value) };
    };
    expect(() => runRefactorScan(request, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run: invalidRun })).toThrow("request identity");
  });

  test("record and verify use their frozen CLI contracts and preserve upstream errors", () => {
    const calls: string[][] = [];
    const run = (_binary: string, args: readonly string[]) => {
      calls.push([...args]);
      let value: unknown;
      if (args[0] === "capabilities") value = { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3", "refactor-resolution-v1"] };
      else if (args[1] === "record") value = { schemaVersion: "archcontext.envelope/v1", ok: true, requestId: "refactor.record", data: { schemaVersion: "archcontext.runtime-refactor-record/v1", repository: measured().snapshot.repository, worktree: measured().snapshot.worktree, assessmentDigest: digest("f"), recommendationIds: [], recommendations: [] } };
      else value = { schemaVersion: "archcontext.envelope/v1", ok: true, requestId: "refactor.verify", data: { schemaVersion: "archcontext.runtime-refactor-verify/v1", repository: measured().snapshot.repository, worktree: measured().snapshot.worktree, recommendationId: "recommendation.test", disposition: null, evidence: null } };
      return { status: 0, signal: null, stdout: JSON.stringify(value), stderr: "" };
    };
    expect(runRefactorRecord(digest("f"), request.expectedWorktreeDigest!, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run }).recommendationIds).toEqual([]);
    expect(runRefactorVerify({ schemaVersion: "archcontext.refactor-verification-request/v1", recommendationId: "recommendation.test", expectedHeadSha: request.expectedHeadSha, expectedWorktreeDigest: request.expectedWorktreeDigest }, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run }).evidence).toBeNull();
    expect(calls.filter((args) => args[0] === "capabilities")).toHaveLength(2);

    const upstreamError = (_binary: string, args: readonly string[]) => ({ status: args[0] === "capabilities" ? 0 : 1, signal: null, stderr: "", stdout: JSON.stringify(args[0] === "capabilities" ? { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3", "refactor-resolution-v1"] } : { schemaVersion: "archcontext.envelope/v1", ok: false, requestId: "refactor.scan", error: { code: "AC_REFACTOR_STALE", message: "stale" } }) });
    try { runRefactorScan(request, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run: upstreamError }); throw new Error("expected error"); }
    catch (error) { expect((error as RefactorProviderError).code).toBe("AC_REFACTOR_STALE"); }
  });

  test("rejects record output for a different assessment", () => {
    const run = (_binary: string, args: readonly string[]) => ({ status: 0, signal: null, stderr: "", stdout: JSON.stringify(args[0] === "capabilities"
      ? { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] }
      : { schemaVersion: "archcontext.envelope/v1", ok: true, requestId: "refactor.record", data: { schemaVersion: "archcontext.runtime-refactor-record/v1", repository: measured().snapshot.repository, worktree: measured().snapshot.worktree, assessmentDigest: digest("e"), recommendationIds: [], recommendations: [] } }) });
    expect(() => runRefactorRecord(digest("f"), request.expectedWorktreeDigest!, process.cwd(), { consumerRoot: process.cwd(), refactorPolicy: policy(), run })).toThrow("assessment identity");
  });
});
