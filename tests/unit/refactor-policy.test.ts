import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadRefactorPolicy, readRefactorPolicy } from "../../src/core/refactor/policy";

const expected = (mode: "off" | "shadow" | "active" = "off", require_cutover_closure = false) => ({
  mode, provider: "archctx" as const, proposal_author: "local" as const,
  stages: {
    scan: { provider_version: "0.5.7" as const, required_features: ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] },
    verify: { provider_version: "0.5.7" as const, required_features: ["refactor-resolution-v1"] },
  },
  workflow_routing: { module_refactor: "work_package" as const, cross_module_refactor: "refactor_sprint" as const, architecture_intervention: "human_architecture_approval" as const, proof_required: "investigation_only" as const, no_action: "record_and_stop" as const },
  maximum_modules_per_program: 10, maximum_parallel_modules: 3,
  require_cutover_closure, require_post_merge_measurement: false,
});

describe("refactor policy", () => {
  test("defaults missing policy to off and false", () => {
    expect(readRefactorPolicy({})).toEqual(expected());
  });
  test("accepts only the closed section", () => {
    expect(readRefactorPolicy({ refactor: { mode: "shadow", require_cutover_closure: true } })).toEqual(expected("shadow", true));
    expect(() => readRefactorPolicy({ refactor: { mode: "enabled" } })).toThrow();
    expect(() => readRefactorPolicy({ refactor: { require_cutover_closure: "true" } })).toThrow();
    expect(() => readRefactorPolicy({ refactor: { mode: "off", extra: true } })).toThrow();
    expect(() => readRefactorPolicy({ refactor: { maximum_modules_per_program: 2, maximum_parallel_modules: 3 } })).toThrow();
    expect(() => readRefactorPolicy({ refactor: { stages: { scan: expected().stages.scan, verify: { ...expected().stages.verify, provider_version: "0.5.1" } } } })).toThrow();
  });
  test("loads the workflow manifest and rejects malformed JSON", () => {
    const repo = mkdtempSync(join(tmpdir(), "refactor-policy-"));
    try {
      expect(loadRefactorPolicy(repo)).toEqual(expected());
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(join(repo, ".ai", "harness", "policy.json"), "not json\n");
      expect(() => loadRefactorPolicy(repo)).toThrow();
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
