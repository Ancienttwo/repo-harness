import { describe, expect, test } from "bun:test";

// Unrelated always-passing guard used only by guard-not-in-tests-pass.contract.md's
// exit_criteria.tests_pass, so that fixture's Root Cause Evidence regression_guard
// (regression-guard.test.ts) is genuinely absent from the tests_pass list it references.
describe("other-guard fixture placeholder", () => {
  test("stays green", () => {
    expect(true).toBe(true);
  });
});
