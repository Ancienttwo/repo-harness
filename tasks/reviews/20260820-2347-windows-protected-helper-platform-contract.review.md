# Task Review: windows-protected-helper-platform-contract

> **Status**: Pending
> **Plan**: plans/plan-20260820-2347-windows-protected-helper-platform-contract.md
> **Contract**: tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md
> **Notes File**: tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-20 23:47
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:0e34b23c7a5b05f93c948c26c22a296bec6447d2129bb946dba7bc16a002b81d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7ce86fdd

## Human Review Card

- Verdict: fail on the frozen pre-remediation subject; deterministic retest pending
- Change type: bugfix
- Intended files changed: protected-helper runtime, four helper surfaces/mirrors, host install/update wiring, tests, CI, and contract docs
- Actual files changed: within the task contract's `allowed_paths`
- Commands passed: pre-review focused suite, typecheck, full test suite, root checks, package/dry-run verification
- Residual risks: repaired subject has no remaining external-review invocation under the one-review circuit budget; real Windows execution remains a CI-only oracle
- Reviewer action required: typed user waiver after deterministic verification, followed by Windows CI
- Rollback: revert branch `codex/windows-protected-helper-platform-contract`

## Mode Evidence

- Selected route: protected execution/trust-boundary bugfix
- P1/P2/P3 evidence: captured in the source plan and implementation notes
- Root cause or plan evidence: task contract Root Cause Evidence plus pre-fix regression artifact

## Verification Evidence

- Waza `/check` run: prepare-acceptance passed before external review; post-remediation rerun pending
- Commands run: see `.ai/harness/checks/latest.json` and implementation notes
- Manual checks: one external Claude semantic review against the frozen subject
- Supporting artifacts: pre-fix regression and `.ai/harness/checks/latest.json`
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- External review identified two release-blocking defects: packaged-root
  detection used POSIX separators on Windows, and the required ship path invoked
  `jq` despite its documented optional status.
- Six P2 trust/robustness gaps covered caller overrides on direct TypeScript
  invocation, bare-Git lock acquisition, temp authority, structured resolution
  errors, Windows smoke isolation, and realpath-escape test coverage.
- All eight findings have code/test remediation in the current working subject;
  the external verdict remains fail because that provider reviewed the earlier
  frozen subject and may not be invoked again for this work package.

## Residual Risks / Follow-ups

- ...

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- Typed AcceptanceReceipt is unavailable until final deterministic verification
  is frozen and the user-waiver authority is explicitly recorded.

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...
