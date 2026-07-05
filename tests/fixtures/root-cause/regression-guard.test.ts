import { describe, expect, test } from "bun:test";

// Fixture regression guard for the bugfix root-cause evidence gate (see
// docs/reference-configs/contract-brief-example-bugfix.md and the shared expectation
// table in tests/fixtures/root-cause/expected-results.ts). This file represents the
// POST-fix state and must always pass; the paired pre-fix-failure.log fixture is a real
// captured run of this same assertion against the UNFIXED implementation below (an
// unconditional `return true`), produced with the exact recipe documented under the
// contract template's `## Root Cause Evidence` section before this fix was applied.
function isNonEmptyLabel(label: string): boolean {
  return label.length > 0;
}

describe("isNonEmptyLabel example root-cause regression guard", () => {
  test("treats an explicit zero-width label as empty, not falsy-true", () => {
    expect(isNonEmptyLabel("")).toBe(false);
  });
});
