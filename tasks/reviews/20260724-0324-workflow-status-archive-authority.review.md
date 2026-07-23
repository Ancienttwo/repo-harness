# Task Review: workflow-status-archive-authority

> **Status**: Complete
> **Plan**: plans/plan-20260724-0324-workflow-status-archive-authority.md
> **Contract**: tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md
> **Notes File**: tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-24 04:31
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change + fail-closed historical classification
- Intended files changed: plan-lifecycle policy/projections, archive helper and mirrors, one shared classifier, focused tests, and package workflow artifacts.
- Actual files changed: exactly those families; no historical plan/contract/review was moved because the approved predicate yielded zero AUTO rows.
- Commands passed: 49 focused status/archive/classifier tests, one policy-terminal projection test, retired-name focused regression 5/0, full repository suite 2053 pass/1 skip/0 fail, TypeScript typecheck, all root checks, and final ContractVerify 14/14.
- Residual risks: existing historical root clutter remains visible by owner-approved design; 61 rows lack at least one exact sealed-terminal condition and are not silently migrated.
- Reviewer action required: none; final gate and typed Codex AcceptanceReceipt are complete.
- Rollback: revert the package; no historical migration or external state change occurred.

## Mode Evidence

- Selected route: parent-owned P1/P2/P3 work-package after explicit owner adjudication.
- P1/P2/P3 evidence: P1 maps policy, typed mutation guard, shell transition/terminal consumers, archive transaction, and durable artifacts; P2 traces policy projection through all three consumers and explicit sealed archive selection; P3 keeps live current-evidence behavior unchanged and makes historical mode explicit, exact, and fail closed.
- Root cause or plan evidence: `tasks/todos.md` named the three literal-list consumers and the 61-plan archive gap; the pre-apply classifier reproduced `AUTO=0/HOLD=61/EXCLUDE=1` under the approved model.

## Verification Evidence

- Waza `/check` run: not separately invoked; focused regression suite plus the final contract gate is the bounded acceptance surface.
- Commands run: `bun test` on four focused files (49/0), one exact helper-scripts policy test (1/0), `bun run check:type`, `bash -n`, `jq empty`, classifier JSON/TSV runs, and mirror `cmp` checks.
- Manual checks: reviewed all three consumer diffs, explicit `--evidence-mode` flow, declared artifact path validation, exact receipt identity/hash/time fields, and the 61-row audit.
- Supporting artifacts: `.ai/harness/runs/20260724-0324-workflow-status-archive-authority/classification.{json,tsv}` and the full durable TSV in implementation notes.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/runs/run-20260724T043007-31438-20260724-0324-workflow-status-archive-authority.json`.

## Manual Check Evidence

- [x] bun test passes once against frozen product source with 2053 pass, 1 skip, 0 fail
  - Evidence: exit 0 in 494.75s; ignored log `.ai/harness/runs/20260724-0324-workflow-status-archive-authority/full-test-third.log`; SHA-256 `12912e10c668ba818b9706aae5dd70e6db50104d761ffab6968f10fbb008dfb8`.
- [x] bun src/cli/index.ts adopt --repo . --dry-run succeeds; it is run outside verify-contract because adopt is intentionally classified as an evidence producer
  - Evidence: exit 0; `0 total, 0 planned, 0 skipped`; expected self-host warning confirms downstream adopt is not applicable.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:5d1727badb0093aa97f08852509084757ccef4f24f589b24e97263d4da7c3adb
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 96c908f75d6eb0ea91a0d8567525aa28aaf90554
> **Verification Evidence SHA256**: sha256:df33f947a6a0690eb9bc14d861a8c37fbd04cb2861a2accf8fd4d0cf43de0147
> **Issued At**: 2026-07-23T20:32:17.401Z

- Summary: Policy-owned lifecycle projections and sealed-terminal historical classification verified; 61 historical plans held, zero moved without the exact evidence triple.
- Findings: none

## Behavior Diff Notes

- Before: the known-status array coexisted with three literal semantic lists; historical Completed archives could only consume current checks.
- After: policy lifecycle anchors project pre-approval/transition/terminal roles; missing or incoherent policy fails closed. Historical archives require explicit sealed-terminal mode and the exact owner-approved triple.
- Default live Completed archive behavior is unchanged.

## Residual Risks / Follow-ups

- The sweep intentionally moves zero of 61 historical plans. Three have Fulfilled + pass but no typed receipt; newer Done + pass + receipt families are also HOLD because `Done` was not authorized as a synonym for `Fulfilled`.
- No migration, receipt synthesis, compatibility mapping, or reinterpretation remains hidden in the implementation.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | All named consumers and the explicit archive mode share tested authority. |
| Product depth | 10/10 | The zero-move result preserves evidence truth instead of optimizing for a smaller root directory. |
| Design quality | 9/10 | One ordered policy plus anchors; explicit historical mode avoids hidden fallback semantics. |
| Code quality | 9/10 | Shared classifier/archive predicate, mirror checks, path validation, and focused regressions. |

## Failing Items

- None.

## Retest Steps

- Re-run: not required; the receipt-bound finalizer completed without rerunning verification.
- Re-check: classifier counts remain `root=62`, `historical=61`, `AUTO=0`, `HOLD=61`, `EXCLUDE=1` before closeout.

## Summary

- Pass. Status lifecycle semantics now project from policy, sealed historical closeout is explicit and exact, and every current historical plan was classified without altering frozen evidence.
