> **Archived**: 2026-09-13 13:39
> **Related Plan**: plans/archive/plan-20260913-1143-release-0191-current.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260913-1339
> **Archive Projection V1**: `plans/plan-20260913-1143-release-0191-current.md` => `plans/archive/plan-20260913-1143-release-0191-current.md`
> **Archive Projection V1**: `tasks/notes/20260913-1143-release-0191-current.notes.md` => `tasks/archive/notes-20260913-1339-release-0191-current.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1143-release-0191-current.contract.md` => `tasks/archive/contract-20260913-1339-release-0191-current.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1143-release-0191-current.review.md` => `tasks/archive/review-20260913-1339-release-0191-current.md`

# Task Review: release-0191-current

> **Status**: Accepted
> **Plan**: plans/archive/plan-20260913-1143-release-0191-current.md
> **Contract**: tasks/archive/contract-20260913-1339-release-0191-current.md
> **Notes File**: tasks/archive/notes-20260913-1339-release-0191-current.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-13 11:43
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:1430b87ee143afb592859686ab41700f21df1aa93d970b10616c476bbf5a0c69
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7f6fcd1f143e77fd007f43d39e9fe5a7029583fb

## Human Review Card

- Verdict: PASS with owner acceptance; full canonical release verification passed.
- Change type: release preparation with bounded bugfixes.
- Boundary: release filing, fixture process startup/path identity, test environment
  and concurrency synchronization, and benchmark archive compression.
- Deterministic review: existing assertions, fixture root identity, production
  deadlines, four-file pool and real-install coverage are retained.
- Residual risk: MCP/global runtime cold-start causes are inferred from loaded
  failures; Fleet retry remains unchanged. All seven prior failures passed in
  the final full gate; this establishes candidate readiness without asserting
  an individually measured root cause for the intermittent cases.
- Rollback: abandon the unpublished branch; preserve the old tag and npm absence.

## Mode Evidence

- Selected route: Waza check ship follow-through; bounded hunt for gate failures.
- P1/P2/P3: captured plan and implementation notes map package publication,
  process fixtures, request-lock admission and archive preparation.
- Root cause evidence: the contract binds the reproduced lane failure; notes
  preserve the delayed admission reproduction and all canonical failed runs.

## Verification Evidence

- Focused files: tooling/CodeGraph/resolver/doctor hardlink pool passes 61 tests
  and 478 assertions; global runtime passes 43 tests; MCP passes 18/197;
  lane guard passes 2/13; delayed admission guard passes 1/5.
- Benchmark artifact/mutation guard passes in 21.13 seconds with its original
  30-second limit. Two real installs pass in 32.62 seconds under the original
  60-second limit. One overlapping compression run still timed out; final
  acceptance depends on the four-file aggregate.
- Typecheck and diff whitespace checks passed.
- Canonical final evidence: `run-20260913T132245-32390-20260913-1143-release-0191-current.json`;
  release execution `vx-1d380329781f4342a7b9` passed in 741727 ms at `29245bb6`.
  The complete four-file aggregate includes all 447 test files, required integrity
  checks, package creation and real tarball installation smoke.
- Semantic review history: the documentation-only subject passed its one review.
  That decision does not cover the subsequently expanded test/script diff.
  The owner subsequently approved the reported repairs and continued publication;
  the typed disposition is user_waiver (owner acceptance).

## Manual Check Evidence

The contract declares no additional manual-check requirement. Published registry,
tag and installed-runtime observations follow the accepted merge boundary.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:1430b87ee143afb592859686ab41700f21df1aa93d970b10616c476bbf5a0c69
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7f6fcd1f143e77fd007f43d39e9fe5a7029583fb
> **Verification Evidence SHA256**: sha256:6f22a5f2a1702d6202d38bff9048b4cd650c8acd123d14722070b95074e9cb6f
> **Issued At**: 2026-09-13T05:38:20.455Z

- Summary: Owner approved the current repaired 0.19.1 candidate after all prior failed cases passed, and authorized release continuation. Final full release execution vx-1d380329781f4342a7b9 passed at 29245bb6; completed plan checkboxes record that approved outcome. Expanded implementation closes with owner acceptance, not the earlier documentation-only external pass.
- Findings: none

## Behavior Diff Notes

The nested functional lane derives its own environment. Concurrent verification
uses an explicit release marker. Shell fixtures share a prepared inode while
retaining each original executable path. The local benchmark archive uses a
lower gzip compression level and retains its full dependency closure.

## Residual Risks / Follow-ups

Publication, hosted CI and exact installed-runtime readback remain pending.
The complete candidate gate and typed owner acceptance are satisfied.
