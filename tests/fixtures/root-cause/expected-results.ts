// Shared root-cause gate fixture expectations.
//
// Both the TypeScript gate (scripts/contract-run.ts, exercised from
// tests/contract-run.test.ts) and the bash gate (scripts/verify-contract.sh, exercised
// from tests/helper-scripts.test.ts) import this same table and run it against the same
// contract fixture files in this directory, so the two independent implementations are
// proven against identical inputs and identical expected outcomes. Do not hand-copy this
// table into either test file — that would silently reintroduce the two-implementation
// drift this gate exists to prevent.
export interface RootCauseFixtureCase {
  /** Human-readable case name, used in test titles. */
  name: string;
  /** File name under tests/fixtures/root-cause/, e.g. "bugfix-pass.contract.md". */
  contractFile: string;
  /** Whether the root-cause gate should accept this contract. */
  expectOk: boolean;
  /**
   * A substring that must appear somewhere in the gate's reported issues/failure
   * messages when expectOk is false. Not asserted when expectOk is true.
   */
  expectIssueSubstring?: string;
}

export const ROOT_CAUSE_FIXTURE_CASES: RootCauseFixtureCase[] = [
  {
    name: "bugfix contract with complete root cause evidence passes",
    contractFile: "bugfix-pass.contract.md",
    expectOk: true,
  },
  {
    name: "bugfix contract with a placeholder regression_guard fails",
    contractFile: "missing-guard.contract.md",
    expectOk: false,
    expectIssueSubstring: "regression_guard",
  },
  {
    name: "bugfix contract whose regression_guard is not listed under tests_pass fails",
    contractFile: "guard-not-in-tests-pass.contract.md",
    expectOk: false,
    expectIssueSubstring: "tests_pass",
  },
  {
    name: "bugfix contract whose pre_fix_failure_artifact does not exist fails",
    contractFile: "artifact-missing.contract.md",
    expectOk: false,
    expectIssueSubstring: "does not exist",
  },
  {
    name: "bugfix contract whose pre_fix_failure_artifact is a captured passing run fails",
    contractFile: "artifact-passing-run.contract.md",
    expectOk: false,
    expectIssueSubstring: "PRE_FIX_EXIT",
  },
  {
    name: "bugfix contract whose pre_fix_failure_artifact has no PRE_FIX_EXIT line fails",
    contractFile: "artifact-missing-exit-line.contract.md",
    expectOk: false,
    expectIssueSubstring: "PRE_FIX_EXIT",
  },
  {
    name: "non-bugfix contract skips the root cause gate entirely",
    contractFile: "non-bugfix-skip.contract.md",
    expectOk: true,
  },
];
