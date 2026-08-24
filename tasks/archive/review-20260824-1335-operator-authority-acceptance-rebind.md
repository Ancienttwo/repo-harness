> **Archived**: 2026-08-24 13:35
> **Related Plan**: plans/archive/plan-20260824-1252-operator-authority-acceptance-rebind.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260824-1335

# Task Review: operator-authority-acceptance-rebind

> **Status**: Passed
> **Plan**: plans/plan-20260824-1252-operator-authority-acceptance-rebind.md
> **Contract**: tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md
> **Notes File**: tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-24 12:52
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3a0c8a8209c4b68bd9c8b60eefdbb572a2aaaf2f481559a4ae9ab58a06e4302e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 75f50b909d50e980f8a372208f55aa42665a2db9

## Human Review Card

- Verdict: pass
- Change type: code-change, bugfix, security boundary
- Intended files changed: exact Operator authority validation, focused server
  regression, durable lesson, and acceptance workflow evidence.
- Actual files changed: the correction is isolated to
  `src/effects/operator/server.ts`, `tests/cli/operator-serve.test.ts`, and
  `tasks/lessons.md`; this receipt reviews the entire normalized PR candidate.
- Commands passed: focused Operator/Fleet/UI tests, typecheck, full repository
  suite, root required checks, runtime hostile-authority readback, and exact-head
  remote PR checks.
- Residual risks: remote serving and auth/RBAC remain explicit non-goals;
  provider observation latency remains the first 10x-scale bottleneck.
- Reviewer action required: none after fresh AcceptanceReceipt and merge seal.
- Rollback: revert `24ed0178` and the bounded re-acceptance workflow before PR
  readiness.

## Mode Evidence

- Selected route: parent security review with API authority threat modeling and
  Waza `/check` acceptance discipline.
- P1/P2/P3 evidence: captured in the approved plan; the HTTP listener owns
  request authority, Fleet owns domain facts, and the receipt/gate own merge
  evidence.
- Root cause or plan evidence:
  `plans/plan-20260824-1252-operator-authority-acceptance-rebind.md` and the
  pre-fix failure artifact.

## Verification Evidence

- Waza `/check` run: PASS after adversarial assumption, composition, cascade,
  and abuse review; no P0/P1 findings remain.
- Commands run: contract Exit Criteria plus exact runtime authority readback and
  GitHub check inspection.
- Manual checks: hostile Host 421, hostile Origin 403, valid authority 200,
  collector calls 1.
- Supporting artifacts: `.ai/harness/checks/latest.json`, pre-fix failure log,
  typed AcceptanceReceipt, and installed merge seal.
- Implementation notes reviewed: yes.
- Run snapshot: populated by `verify-sprint --prepare-acceptance`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:3a0c8a8209c4b68bd9c8b60eefdbb572a2aaaf2f481559a4ae9ab58a06e4302e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 75f50b909d50e980f8a372208f55aa42665a2db9
> **Verification Evidence SHA256**: sha256:341d05517e1d74103f9afd9fabf1d402b453dab949f6bafdf234b604d7aac9e6
> **Issued At**: 2026-08-24T05:35:16.756Z

- Summary: Post-fix adversarial review passed: exact Host and supplied Origin are pinned before routing and Fleet collection; hostile requests fail closed, valid authority succeeds, pre-fix regression evidence and all contract checks pass, with no P0 or P1 findings.
- Findings: none

## Behavior Diff Notes

- Adds exact Host and supplied-Origin pinning before any Operator route or Fleet
  collection while preserving the existing read-only API and UI behavior.

## Residual Risks / Follow-ups

- No open correctness blocker. Strict IP authority is intentional and matches
  the CLI URL; remote exposure remains out of scope.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Host/Origin rejection and valid-path behavior are covered. |
| Product depth | 9/10 | The localhost trust boundary is explicit without widening v1 scope. |
| Design quality | 10/10 | Exact authority is simple, visible, and fail closed. |
| Code quality | 10/10 | Constant-time pre-routing check with focused regressions. |

## Failing Items

- None.

## Retest Steps

- Re-run: `repo-harness run verify-sprint --prepare-acceptance --contract tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md`
- Re-check: send hostile Host and Origin headers, then the exact configured
  authority, and confirm collector invocation count.

## Summary

- PASS. The previous DNS-rebinding blocker is closed, the normal path remains
  healthy, and no P0/P1 finding remains. Fresh receipt and merge seal are the
  delivery gates.
