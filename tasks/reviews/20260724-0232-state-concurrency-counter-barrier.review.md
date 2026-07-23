# Task Review: state-concurrency-counter-barrier

> **Status**: Reviewed
> **Plan**: plans/plan-20260724-0232-state-concurrency-counter-barrier.md
> **Contract**: tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md
> **Notes File**: tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-24 02:46
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3d6499d3d8a25f6b2df7ba374f7fa3317b409acb21492af22d86683554ecafe0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a4c31ab143419b98f52fa52aaf6e5c01377af7b6

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the two affected state test files plus the bounded plan, contract, notes, review, and Todo ledger surfaces.
- Actual files changed: `tests/state/state-concurrency.test.ts`, `tests/state/effective-state-stability.test.ts`, `tasks/todos.md`, and the four task workflow artifacts linked above.
- Commands passed: deterministic pre-fix probe; controlled post-fix scheduler tests; 25 repeated targeted iterations; both complete affected test files; `bun run check:type`; `bash scripts/check-task-sync.sh`; `git diff --check`; strict ContractVerify; `verify-sprint --prepare-acceptance`.
- Residual risks: low; the production Effective State resolver is unchanged, and the fix only strengthens fixture readiness semantics.
- Reviewer action required: none.
- Rollback: revert `b1948157`; this restores the former test-only marker order and the deferred Todo row.

## Mode Evidence

- Selected route: `hunt` bugfix workflow.
- P1/P2/P3 evidence: P1 isolated the boundary to shell-backed test fixtures; P2 traced the child marker/counter publication into the parent's immediate counter read; P3 preserved the continuous-mutation design and moved readiness publication after initialization.
- Root cause or plan evidence: the child published `mutator-started` before creating `mutator-count`, so a valid scheduler preemption let the parent observe readiness and then fail with `ENOENT` before exercising the resolver.

## Verification Evidence

- Waza `/check` run: not separately invoked; the contract and sprint verification gates supplied the bounded acceptance evidence.
- Commands run: see Human Review Card; all exited zero after the fix.
- Manual checks: inspected all `mutator-started`/`mutator-count` sites and confirmed all three same-shape mutators publish readiness after the initial counter write.
- Supporting artifacts: `.ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/pre-fix.log`, `.ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/repeated-targeted.log`, `.ai/harness/checks/latest.json`.
- Implementation notes reviewed: `tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md`.
- Run snapshot: `.ai/harness/runs/run-20260724T024607-97332-20260724-0232-state-concurrency-counter-barrier.json`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:3d6499d3d8a25f6b2df7ba374f7fa3317b409acb21492af22d86683554ecafe0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a4c31ab143419b98f52fa52aaf6e5c01377af7b6
> **Verification Evidence SHA256**: sha256:3f771b1d260119d00d9181feac186990f262c364fef65e7c5043839132111bec
> **Issued At**: 2026-07-23T18:47:12.713Z

- Summary: Counter readiness now follows initial counter publication at all three affected test mutators; deterministic pre-fix and passing post-fix verification evidence confirm the race is closed.
- Findings: none

## Behavior Diff Notes

- Before: readiness meant only that the mutator process had started; the counter file could still be absent.
- After: readiness means the counter authority exists and continuous mutation is about to begin.
- Production behavior and test timing policy are unchanged.

## Residual Risks / Follow-ups

- No known remaining instance of this marker/counter race exists in `tests/`, `src/`, or `scripts/`.
- The unrelated evidence-ledger and install-agent-fleet deferred issues remain outside this contract.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Deterministic red-first evidence and controlled post-fix proof cover the scheduler boundary. |
| Product depth | 9/10 | The bounded test-infrastructure defect is fully resolved without changing product semantics. |
| Design quality | 10/10 | Readiness now encodes the exact initialization invariant the parent relies on. |
| Code quality | 10/10 | Three mechanical reorderings, no fallback, retry, sleep, or new abstraction. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/state/state-concurrency.test.ts tests/state/effective-state-stability.test.ts`.
- Re-check: `REPO_HARNESS_SOURCE_ROOT=$PWD repo-harness run verify-sprint` after the AcceptanceReceipt is recorded.

## Summary

- Pass. The race is reproduced before the fix, removed at all three live sites, and covered by passing contract and sprint evidence for the normalized subject above.
