# Task Review: self-host-adopt-boundary

> **Status**: Passed
> **Plan**: plans/plan-20260715-0401-self-host-adopt-boundary.md
> **Contract**: tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md
> **Notes File**: tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 04:30
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3f7d2164daa93066ba8a634b9ae0e386c986883c6a946c9618b2a820f7a6ad2e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7ecb762dd0fce80bbf08866e46dd518428218d2c

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: shared source-checkout predicate, adoption planner/cleanup/setup-check consumers, regression tests, and workflow artifacts named by the contract
- Actual files changed: intended contract scope only; review subject reports zero target-overlap paths
- Commands passed: 48 focused tests; typecheck; full suite 1476 pass / 1 skip / 0 fail; deploy SQL, architecture, task, strict workflow, inspection, adoption dry-run, setup-check, CodeGraph, and diff checks
- External acceptance: unavailable; maintainer instructed this workflow to skip `claude-review`, and no Claude pass is claimed
- Residual risks: the published and PATH-visible `0.10.0` CLI remains old until a follow-up release/install refresh; the branch tarball proof validates the fixed installed-runtime shape without mutating the real global install
- Reviewer action required: none for the maintainer-authorized merge waiver
- Rollback: revert the single boundary commit; no migration or persistent product data mutation

## Mode Evidence

- Selected route: isolated bugfix work-package in a contract worktree
- P1/P2/P3 evidence: captured plan maps planner, cleanup, and setup-check ownership; implementation notes record the shared authority decision
- Root cause or plan evidence: pre-fix artifact records installed-runtime/source-target path separation producing destructive source-script cleanup operations

## Verification Evidence

- Waza `/check` run: source-equivalent focused review completed in the isolated worktree; Claude review was skipped by maintainer instruction
- Commands run: `bun test tests/readme-dx.test.ts tests/cli/adoption-plan.test.ts tests/cli/init-hook.test.ts`; `bun run check:type`; `bun test`; root required checks; source adopt/setup probes; disposable installed-runtime probe; CodeGraph init/sync/check; `git diff --check`
- Manual checks: source dry-run returned zero operations; setup check reported `repo.adopt-refresh=na`; incomplete name-only fixture was not classified as source; explicit self-host apply remains blocked
- Supporting artifacts: `.ai/harness/runs/20260715-self-host-adopt-boundary-pre-fix.log`, plan, contract, notes, and this review
- Implementation notes reviewed: yes
- Run snapshot: full repository test 1476 pass / 1 skip / 0 fail in 501.78 seconds; CodeGraph 1.4.1 index up-to-date

## Manual Check Evidence

- [x] Evaluator review file recommends pass
  - Evidence: Human Review Card verdict and top-level Recommendation are pass for subject `sha256:3f7d2164daa93066ba8a634b9ae0e386c986883c6a946c9618b2a820f7a6ad2e`.
- [x] Source adopt dry-run planned zero operations
  - Evidence: `bun src/cli/index.ts adopt --repo . --dry-run --json` exited 0 with `summary.plannedTotal=0`, `operations=[]`, and warning `self-host-source-noop`.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: not run
> **External Source**: maintainer merge waiver
> **External Started**: not run
> **External Completed**: not run
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3f7d2164daa93066ba8a634b9ae0e386c986883c6a946c9618b2a820f7a6ad2e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7ecb762dd0fce80bbf08866e46dd518428218d2c
> **Benchmark Evidence SHA256**: unavailable

- P1 blockers: none in the implementation review; independent external acceptance remains unavailable by maintainer instruction
- P2 advisories: release/install refresh is still required before the PATH-visible CLI contains this fix
- Acceptance checklist: normalized subject and target revision recorded; installed and source runtime boundaries proven; no external verdict fabricated

## Behavior Diff Notes

- Before: source ownership depended on target path equaling the running package path, so a global CLI could plan deletion/untracking of canonical source scripts.
- After: canonical package/bin/source shape identifies the source checkout independent of runtime location; standard adopt returns a no-op warning and setup check reports downstream refresh as not applicable.
- Explicit `self-host` review mode remains fail closed, and ordinary downstream repositories still receive the normal adoption plan.

## Residual Risks / Follow-ups

- PATH-visible `repo-harness@0.10.0` does not yet contain this source fix. A patch release and official global refresh are required to change the real installed runtime.
- Independent external acceptance is unavailable under the maintainer waiver.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Direct source and disposable installed-runtime probes prove zero adopt operations and no refresh action. |
| Product depth | 8/10 | Corrects both destructive planning and the recommendation path from one shared boundary. |
| Design quality | 9/10 | One structural authority, path-independent and fail closed; no compatibility behavior. |
| Code quality | 9/10 | Narrow consumers, false-positive coverage, onboarding fixture correction, and full suite green. |

## Failing Items

- Canonical external acceptance remains unavailable; this does not change the local implementation recommendation.

## Retest Steps

- Re-run: `bun test tests/readme-dx.test.ts tests/cli/adoption-plan.test.ts tests/cli/init-hook.test.ts && bun run check:type`
- Re-check: `bun src/cli/index.ts adopt --repo . --dry-run --json && bun src/cli/index.ts setup check --target codex --check-updates --json`

## Summary

- The self-host source checkout can no longer enter the downstream adoption cleanup path when the CLI runs from another installation location. Local implementation review recommends pass; external acceptance remains explicitly unavailable and is not represented as a Claude pass.
