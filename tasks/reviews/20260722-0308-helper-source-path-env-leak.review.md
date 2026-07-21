# Task Review: helper-source-path-env-leak

> **Status**: Pending
> **Plan**: plans/plan-20260722-0308-helper-source-path-env-leak.md
> **Contract**: tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md
> **Notes File**: tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 03:09
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | frontend
- Intended files changed:
- Actual files changed:
- Commands passed:
- Residual risks:
- Reviewer action required: inspect diff and card
- Rollback:

## Mode Evidence

- Selected route:
- P1/P2/P3 evidence:
- Root cause or plan evidence:

## Verification Evidence

- Waza `/check` run:
- Commands run:
- Manual checks:
- Supporting artifacts:
- Implementation notes reviewed:
- Run snapshot:

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:702e8e3589f8d329585dfe468a8beb2f9da6d2a7d389453329a8a032fd62eff7
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 38395599764e1927db0f2216715978101f6f5d6b
> **Verification Evidence SHA256**: sha256:b9b5a6a20e67570d5522bdac5a8e78cb3820daf4f32036843f69648714dde8fb
> **Issued At**: 2026-07-21T21:08:09.341Z

- Summary: Deterministic red-then-green for the REPO_HARNESS_HELPER_SOURCE_PATH cross-helper leak: decoy regression test failed pre-fix (PRE_FIX_EXIT=1) and passes post-fix; 14 sites guarded with basename-match fallback; twins byte-parity via sync:helpers; verify-sprint acid test fully green; same-basename forwarding tests unaffected.
- Findings: none

## Behavior Diff Notes

- ...

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

- ...

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...
