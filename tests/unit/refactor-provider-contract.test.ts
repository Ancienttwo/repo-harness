import { describe, expect, test } from "bun:test";
import type { RecommendationV3 } from "archctx-contracts";
import { assertAcceptedRefactorRecommendations, assertRefactorCapabilities, assertRefactorRequest, RefactorProviderError } from "../../src/core/refactor/provider-contract";
import { REFACTOR_PROVIDER_VERSION, REFACTOR_SCAN_FEATURES } from "../../src/core/refactor/policy";

describe("refactor provider contract", () => {
  test("accepts only the exact stage version and feature set", () => {
    const stage = { provider_version: REFACTOR_PROVIDER_VERSION, required_features: [...REFACTOR_SCAN_FEATURES] };
    expect(() => assertRefactorCapabilities({ schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.6" }, features: [...REFACTOR_SCAN_FEATURES] }, stage)).not.toThrow();
    for (const value of [
      { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.3" }, features: [...REFACTOR_SCAN_FEATURES] },
      { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.4.8" }, features: [...REFACTOR_SCAN_FEATURES] },
      { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.6" }, features: ["module-statistics-v1"] },
    ]) {
      try { assertRefactorCapabilities(value, stage); throw new Error("expected rejection"); }
      catch (error) { expect(error).toBeInstanceOf(RefactorProviderError); expect((error as RefactorProviderError).code).toBe("refactor_provider_version_mismatch"); }
    }
  });

  test("delegates request semantics to the upstream contract", () => {
    expect(() => assertRefactorRequest({ schemaVersion: "archcontext.refactor-request/v1", scope: { kind: "repository" } })).not.toThrow();
    expect(() => assertRefactorRequest({ schemaVersion: "archcontext.refactor-request/v1", scope: { kind: "paths", paths: ["/src/index.ts"] } })).toThrow("repo-relative POSIX paths");
  });

  test("returns complete accepted lifecycle records bound to the provider readback", () => {
    const recommendation: RecommendationV3 = {
      schemaVersion: 'archcontext.recommendation/v3', recommendationId: 'recommendation.1', runId: 'run.1', fingerprint: `sha256:${'a'.repeat(64)}`,
      subject: 'node.a', status: 'accepted', confidence: 'high', enforcement: 'advisory', risk: 'low', uncertainty: 'low', evidenceBindingIds: [], explanation: [],
      authoredBy: { kind: 'daemon', id: 'archctxd', source: 'daemon' }, subjectSelectorId: 'node.a', relations: {}, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:01:00.000Z',
      category: 'structural_observation', payload: { assessmentDigest: `sha256:${'b'.repeat(64)}`, kind: 'cycle', affectedNodeIds: ['node.a'], baselineSnapshotDigest: `sha256:${'c'.repeat(64)}`, derivedOutcomes: [] },
    };
    const envelope = { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'book.recommendations', data: { schemaVersion: 'archcontext.architecture-book-recommendations/v1', recommendations: [recommendation, { ...recommendation, recommendationId: 'recommendation.2', status: 'open' }], freshness: { worktree: { headSha: '1'.repeat(40) } } } };
    expect(assertAcceptedRefactorRecommendations(envelope, '1'.repeat(40))).toEqual([recommendation]);
    expect(() => assertAcceptedRefactorRecommendations(envelope, '2'.repeat(40))).toThrow('authorized HEAD');
  });
});
