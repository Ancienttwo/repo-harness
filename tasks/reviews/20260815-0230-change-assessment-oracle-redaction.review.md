# Task Review: change-assessment-oracle-redaction

> **Status**: Complete
> **Plan**: plans/plan-20260815-0230-change-assessment-oracle-redaction.md
> **Contract**: tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md
> **Notes File**: tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-15 02:36
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:576fcabbcc8e52a922491b11017db7e02b7e42c25ae8d8abdbbb499458b2a81d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: f12380487cb882040251251309666f3927edfed7

## Human Review Card

- Verdict: pass.
- Change type: bugfix.
- Intended files changed: redaction classifier and two regression suites.
- Actual files changed: exactly those three normalized subject paths; workflow artifacts are excluded evidence.
- Commands passed: 54 focused tests, typecheck, and contract verification 18/18.
- Residual risks: future fingerprinted identifier arrays with different field names still require explicit typed classification.
- Reviewer action required: none.
- Rollback: revert the structural exemption and regressions together.

## Mode Evidence

- Selected route: root-cause regression and security-boundary review.
- P1/P2/P3 evidence: the plan maps event writer to materializer to AcceptanceReceipt, traces the exact long-ID corruption, and selects a path-specific exemption.
- Root cause or plan evidence: pre-fix artifact records expected plaintext oracle ID versus received `sha256:...`, exit 1.

## Verification Evidence

- Waza `/check` run: focused bugfix gate.
- Commands run: focused three-file Bun test set, `bun run check:type`, strict contract verification.
- Manual checks: unrelated `id` remains entropy-redacted; known-secret oracle ID remains redacted; real assessment/packet materializes byte-identically.
- Supporting artifacts: `.ai/harness/runs/20260815-change-assessment-oracle-redaction-pre-fix.log`.
- Implementation notes reviewed: yes.
- Run snapshot: contract 18/18 pass.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:576fcabbcc8e52a922491b11017db7e02b7e42c25ae8d8abdbbb499458b2a81d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: f12380487cb882040251251309666f3927edfed7
> **Verification Evidence SHA256**: sha256:8c292c00e30b1df151b552609ce0db4c0780f99e2f62ec33c5bb8cbc9a38826b
> **Issued At**: 2026-08-14T18:51:44.788Z

- Summary: User explicitly instructed go on after being informed that PR #190 requires an independent persistent typed user waiver; all focused, self-hosted, and hosted checks passed.
- Findings: none

## Behavior Diff Notes

- Only `required_oracles/<array-index>/id` gains entropy exemption.
- Known-secret matching remains unconditional and unrelated IDs retain existing behavior.
- No fingerprint is recomputed or accepted through compatibility logic.

## Residual Risks / Follow-ups

- None for the reported release blocker.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Reproduced failure becomes green end to end. |
| Product depth | 10/10 | Fix restores the authoritative acceptance path. |
| Design quality | 10/10 | Structural exemption is narrower than a key-wide exception. |
| Code quality | 10/10 | Small pure change with positive and negative guards. |

## Failing Items

- None.

## Retest Steps

- Run the three focused suites and typecheck.
- Run hosted CI on the exact commit.

## Summary

- PASS: smallest coherent fix; no P0/P1/P2 findings.
