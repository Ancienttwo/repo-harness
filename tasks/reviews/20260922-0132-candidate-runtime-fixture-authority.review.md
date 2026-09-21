# Task Review: candidate-runtime-fixture-authority

> **Status**: Pending
> **Plan**: plans/plan-20260922-0132-candidate-runtime-fixture-authority.md
> **Contract**: tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md
> **Notes File**: tasks/notes/20260922-0132-candidate-runtime-fixture-authority.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-22 01:32
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

> **Substantive Change SHA256**: `sha256:d71927b8967ed75c0d04234fb311444fa0c142644df89cbc3e39d98315fbf7d0`

## Scope and root cause

Test-only fixture repair: copyRuntimeFixture must modify the source-owned MANAGED_STOP_TIMEOUT_SECONDS in its disposable old runtime. The retained candidate stays at 150. Pre-fix existing tests: 6 pass, 2 fail, PRE_FIX_EXIT=1; both failures at the obsolete literal assertion before reconciliation. No new case/file or production change.

## Verification

All 11 canonical executable checks passed. Independent codex-plugin review approved semantic subject sha256:9213b38459930b40a3c4889a197039603d85b9db0e723d2a6850040ac2bcb755 against main 0d4371c3 with no findings. AcceptanceReceipt recording is the next closeout action. The existing test file is the regression guard. The branch-aware task-sync digest above binds the PR diff, including after archive. No true HOME or installed runtime is changed.

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

## Residual boundaries

Hosted CI is separate. This patch must be incorporated into the stage branches before their known baseline failure can be considered fixed; no merge is performed here.

## Independent review transcript

```json
{"verdict":"approve","summary":"No material blockers found in the exact three-file scope across all four change sources against the pinned base. The fixture targets the current timeout authority and preserves reconciliation assertions. Review was read-only; tests were not rerun.","findings":[],"next_steps":[]}
```
