import { describe, expect, test } from "bun:test";
import { assertRefactorCapabilities, assertRefactorRequest, RefactorProviderError } from "../../src/core/refactor/provider-contract";
import { REFACTOR_PROVIDER_VERSION, REFACTOR_SCAN_FEATURES } from "../../src/core/refactor/policy";

describe("refactor provider contract", () => {
  test("accepts only the exact stage version and feature set", () => {
    const stage = { provider_version: REFACTOR_PROVIDER_VERSION, required_features: [...REFACTOR_SCAN_FEATURES] };
    expect(() => assertRefactorCapabilities({ schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.2" }, features: [...REFACTOR_SCAN_FEATURES] }, stage)).not.toThrow();
    for (const value of [
      { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.4.8" }, features: [...REFACTOR_SCAN_FEATURES] },
      { schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version: "0.5.2" }, features: ["module-statistics-v1"] },
    ]) {
      try { assertRefactorCapabilities(value, stage); throw new Error("expected rejection"); }
      catch (error) { expect(error).toBeInstanceOf(RefactorProviderError); expect((error as RefactorProviderError).code).toBe("refactor_provider_version_mismatch"); }
    }
  });

  test("delegates request semantics to the upstream contract", () => {
    expect(() => assertRefactorRequest({ schemaVersion: "archcontext.refactor-request/v1", scope: { kind: "repository" } })).not.toThrow();
    expect(() => assertRefactorRequest({ schemaVersion: "archcontext.refactor-request/v1", scope: { kind: "paths", paths: ["/src/index.ts"] } })).toThrow("repo-relative POSIX paths");
  });
});
