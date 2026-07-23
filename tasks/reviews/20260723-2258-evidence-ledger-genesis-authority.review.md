# Task Review: evidence-ledger-genesis-authority

> **Status**: Reviewed
> **Plan**: plans/plan-20260723-2258-evidence-ledger-genesis-authority.md
> **Contract**: tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md
> **Notes File**: tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-23 23:58
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:b3f3463dd2f84b0759a15ab730d467d076e304abfce68d7032fbef76084c328f
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7c5b3554062fd98f897ae2433ca60b8697b14e65

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: checks materializer and its two direct test callers,
  archive prediction helper plus packaged mirror and regression suite, and this
  package's workflow artifacts.
- Actual files changed: exactly six normalized review-subject paths plus
  plan/contract/review/notes and the generated deferred-ledger timestamp.
- Commands passed: evidence suites 28 pass / 0 fail; archive gate suite 10 pass
  / 0 fail; `bun run check:type`; full `bun test` 2045 pass / 1 skip / 0 fail
  across 161 files; strict ContractVerify 18/18; repository required checks.
- Residual risks: accepted-event replay remains linear in ledger length. The
  archive predictor's `preverified` mode must remain internal and unavailable
  to CLI/env callers; current code has exactly one private call site.
- Reviewer action required: none. Initial review found one architecture issue
  (content hash alone cannot distinguish byte-identical contract paths); it was
  fixed by requiring the existing exact `run_trace.contract.file`. Deep closeout
  review then rejected caller-forgeable env and marker designs; the final
  parent-gate/in-process design passed both security and architecture re-review
  with no findings.
- Rollback: revert the isolated package; no ledger data migration or cleanup is
  required.

## Mode Evidence

- Selected route: bug-hunt followed by standard Waza `/check`.
- P1/P2/P3 evidence: captured in the plan and implementation notes; immutable
  genesis is worktree authority, while contract bytes and path form the active
  contract identity.
- Root cause or plan evidence: deterministic pre-fix run recorded
  `status=unsatisfied` with `PRE_FIX_EXIT=1` when PostBash-first genesis used
  `ws-0123456789ab`.

## Verification Evidence

- Waza `/check` run: Deep; base review plus security and architecture
  specialists. Three HIGH findings across the original materializer and two
  intermediate archive designs were fixed; both final specialist results have
  no findings.
- Commands run: `bun test tests/evidence-checks-materializer.test.ts
  tests/evidence-projection-drift.test.ts`; `bun test
  tests/archive-evidence-gates.test.ts`; `bun run check:type`; full `bun test`;
  repository required checks.
- Manual checks: pattern sweep confirmed the checks materializer no longer
  re-derives worktree identity; producer and attested-import preserve returned
  genesis identity; ordinary Completed archive cannot reuse a same-HEAD source
  receipt through the retired environment or forged-marker paths; source and
  packaged archive helpers are byte-identical.
- Supporting artifacts:
  `.ai/harness/runs/evidence-ledger-genesis-authority.pre-fix.log` and
  `.ai/harness/runs/evidence-ledger-genesis-authority.full-test.log`.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/runs/`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:b3f3463dd2f84b0759a15ab730d467d076e304abfce68d7032fbef76084c328f
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7c5b3554062fd98f897ae2433ca60b8697b14e65
> **Verification Evidence SHA256**: sha256:a4df9ac8ac1062e458a93156b486b569d7ad97cb73bd2789e42a9ca60423123f
> **Issued At**: 2026-07-23T16:13:31.610Z

- Summary: PostBash-first genesis and root-bound archive prediction regressions fixed; Deep security and architecture reviews plus focused, type, full-suite, and workflow gates passed.
- Findings: none

## Behavior Diff Notes

- PostBash-first evidence genesis now materializes valid verify evidence rather
  than leaving `checks/latest.json` permanently unsatisfied.
- Selection requires exact genesis worktree identity, subject hash, contract
  byte hash, contract path, and admitted trust class.
- Missing genesis or missing/mismatched run-trace contract identity fails
  closed before any passing projection is produced.
- Completed manifest prediction verifies the root-bound receipt at its source,
  proves exact source/scratch binding, and exposes no alternate acceptance root
  to ordinary CLI execution.

## Residual Risks / Follow-ups

- Ledger replay scaling is existing architecture and was not worsened into an
  additional scan. Active-to-Fulfilled prediction parity shares the production
  promotion helper; the focused test currently exercises a Fulfilled source,
  so exact Active archive hash parity remains a low-risk future regression
  candidate rather than a closeout blocker.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Reproduced both authority failures and fixed them fail-closed |
| Product depth | 9/10 | Preserves worktree and contract identities without migration |
| Design quality | 9/10 | Byte-identical path and cross-root receipt holes were closed |
| Code quality | 9/10 | Focused, archive, type, and full-suite gates are green |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-checks-materializer.test.ts
  tests/evidence-projection-drift.test.ts`
- Re-run: `bun test tests/archive-evidence-gates.test.ts`
- Re-check: PostBash-first provenance uses the genesis `worktree_id`; a
  byte-identical sibling contract path remains unsatisfied; an ordinary
  same-HEAD clone with forged env/marker cannot reuse the source receipt.

## Summary

- PASS. The materializer now follows immutable genesis authority and binds
  accepted evidence to the exact active contract bytes and path. Archive
  prediction preserves root-bound receipt authority through a parent gate and
  private scratch mutation. Red-first regression, focused suites, Deep review,
  typecheck, and full suite pass; no schema or compatibility behavior was
  introduced.
