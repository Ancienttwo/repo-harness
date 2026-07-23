# Task Review: evidence-ledger-genesis-authority

> **Status**: Reviewed
> **Plan**: plans/plan-20260723-2258-evidence-ledger-genesis-authority.md
> **Contract**: tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md
> **Notes File**: tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-23 23:14
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:85abb268d1880304c5d108965995c055788a696661a9b2af4e30cb0d998b8198
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7c5b3554062fd98f897ae2433ca60b8697b14e65

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: checks materializer, its focused D7/D8 regression
  suite, the existing projection-drift caller, and this package's workflow
  artifacts.
- Actual files changed: exactly three normalized review-subject paths plus
  plan/contract/review/notes and the generated deferred-ledger timestamp.
- Commands passed: focused suites 28 pass / 0 fail; `bun run check:type`;
  full `bun test` 2044 pass / 1 skip / 0 fail across 161 files; strict
  ContractVerify 17/17; deploy SQL, architecture, task-sync, strict workflow,
  inspect-project-state, and adopt dry-run gates.
- Residual risks: accepted-event replay remains linear in ledger length; this
  package adds no new scan, schema, migration, or compatibility path.
- Reviewer action required: none. Standard review found one architecture issue
  (content hash alone cannot distinguish byte-identical contract paths); it was
  fixed by requiring the existing exact `run_trace.contract.file`, and the
  targeted re-review returned no findings. Security review returned no findings.
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

- Waza `/check` run: standard depth; base review plus security and architecture
  specialists. One architecture HIGH fixed; both final specialist results have
  no findings.
- Commands run: `bun test tests/evidence-checks-materializer.test.ts
  tests/evidence-projection-drift.test.ts`; `bun run check:type`; strict
  ContractVerify; full `bun test`; repository required checks.
- Manual checks: pattern sweep confirmed the checks materializer no longer
  re-derives worktree identity; producer and attested-import preserve returned
  genesis identity; recovery-only contract-slug fallback is outside the checks
  projection and unchanged.
- Supporting artifacts:
  `.ai/harness/runs/evidence-ledger-genesis-authority.pre-fix.log` and
  `.ai/harness/runs/evidence-ledger-genesis-authority.full-test.log`.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/runs/`.

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

- PostBash-first evidence genesis now materializes valid verify evidence rather
  than leaving `checks/latest.json` permanently unsatisfied.
- Selection requires exact genesis worktree identity, subject hash, contract
  byte hash, contract path, and admitted trust class.
- Missing genesis or missing/mismatched run-trace contract identity fails
  closed before any passing projection is produced.

## Residual Risks / Follow-ups

- No follow-up is required for this package. Ledger replay scaling is existing
  architecture and was not worsened into an additional scan.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Reproduced PostBash-first failure and fixed it fail-closed |
| Product depth | 9/10 | Preserves worktree and contract identities without migration |
| Design quality | 9/10 | Architecture review's byte-identical-path hole was closed |
| Code quality | 9/10 | Focused, drift, type, and repository gates are green |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-checks-materializer.test.ts
  tests/evidence-projection-drift.test.ts`
- Re-check: PostBash-first provenance uses the genesis `worktree_id`; a
  byte-identical sibling contract path remains unsatisfied.

## Summary

- PASS. The materializer now follows immutable genesis authority and binds
  accepted evidence to the exact active contract bytes and path. The red-first
  regression, focused suites, typecheck, strict contract gate, and repository
  workflow gates all pass; no schema or compatibility behavior was introduced.
