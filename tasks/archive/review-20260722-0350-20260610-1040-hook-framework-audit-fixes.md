# Sprint Review: hook-framework-audit-fixes

> **Status**: Passed
> **Plan**: plans/plan-20260610-1040-hook-framework-audit-fixes.md
> **Contract**: tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md
> **Notes File**: tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-10 13:25 +0800
> **Recommendation**: pass for the verified full hook-framework audit plan, including Slice 5 downstream-chain/performance hardening

## Mode Evidence

- Selected route: Waza `/check` style review/ship closeout for the existing hook-framework audit branch and local dirty merge batch.
- P1/P2/P3 evidence: P1 boundary is the user-level host adapter -> shim -> repo `.ai/hooks/run-hook.sh` / TypeScript route registry -> hook scripts; P2 traced SessionStart trust/dispatch and prompt-guard review routing; P3 keeps the invariant that hooks are advisory-first except explicit gates, with stale advisory scripts skipped rather than failing trusted repos.
- Root cause or plan evidence: captured plan identified arbitrary repo hook execution, contract block rewrite loss, prompt-guard false positives, state write races, and dead-hook drift as the merge-critical fixes.

## Verification Evidence

- Waza `/check` run: this file records the local `/check` review evidence after code inspection and required command verification.
- Commands run:
  - `bun test tests/cli/install.test.ts tests/cli/status.test.ts tests/helper-scripts.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts` -> 192 pass, 0 fail.
  - `bun test` -> 607 pass, 6 skip, 0 fail.
  - `bash scripts/check-deploy-sql-order.sh` -> pass.
  - `bash scripts/check-task-sync.sh` -> pass.
  - `bash scripts/check-task-workflow.sh --strict` -> initially failed on the brain stub line limit for `docs/reference-configs/hook-operations.md` and stale resume freshness; compressed the repo/asset hook-operations docs to 80 lines, refreshed resume with `bash scripts/codex-handoff-resume.sh --cwd . --reason check-refresh`, then pass.
  - `bun scripts/inspect-project-state.ts --repo . --format text` -> pass, no drift signals or required decisions.
  - `bash scripts/migrate-project-template.sh --repo . --dry-run` -> pass.
  - `git diff --check` -> pass.
  - temp-`HOME` `bash scripts/repo-harness.sh install --target both` -> pass; Codex SessionStart produced 2 commands and trusted `/Users/chris/Projects/agentic-dev`.
- Manual checks: compared current dirty tree against `codex/hook-framework-audit-fixes`; untracked plan/contract/review/test files matched the linked worktree branch copies before Slice 5; Slice 5 was then implemented on `codex/hook-framework-slice-5` and verified in this review.
- Performance observations: `prompt-guard.sh` review prompt fixture -> real 0.43s x3; `post-edit-guard.sh` docs/reference-configs manifest-miss fixture -> real 0.18s x3 and skipped brain sync subprocess work.
- Supporting artifacts: plan, contract, review, notes, and `tasks/todo.md` with no remaining deferred hook-framework goal.
- Implementation notes reviewed: yes.
- Run snapshot: command outputs from this acceptance turn.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers: none observed in local verification.
- P2 advisories: already addressed in Slice 5: `[SyncChain] WARN`, pending request lifecycle, resolver stderr separation, generated timeout fields, `sync-brain-docs.sh` realpath containment, and measured prompt/brain-sync optimization.
- Acceptance checklist: merge batch behavior pass; required checks pass; installer smoke pass; workflow freshness and brain stub line budget repaired.

## Behavior Diff Notes

- Trust gate added to the bash shim and repo-harness installer; linked worktree trust follows the primary repo root.
- Contract block sync now refuses unbalanced markers in shell and TypeScript implementations.
- Prompt-guard now distinguishes review/audit bug mentions from actual bug-fix execution and keeps real health checks routed to `/health`.
- Hook state writes use a mkdir lock, event logs rotate on SessionStart, and stale advisory route scripts can be skipped with a drift warning.
- Absorbed/deprecated hook scripts were removed; security-sentinel, anti-simplification, and changelog-guard retained explicit runtime paths.

## Residual Risks / Follow-ups

- Already-installed user-level host settings need `repo-harness install --target both` or equivalent update before the new `timeout: 30` metadata is active outside this repo checkout.
- CodeGraph was unavailable for this checkout (`CodeGraph not initialized`), so structural review used source/diff/test evidence instead.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Verified trust gate, marker hardening, prompt routing, lock/rotation, dead-hook triage, and advisory drift behavior. |
| Product depth | 9/10 | Improves real host safety, stale-runtime upgrade behavior, and downstream sync observability/containment. |
| Design quality | 8/10 | Reuses existing shim/runtime/route registry boundaries and keeps advisory hooks non-blocking. |
| Code quality | 9/10 | Full suite and required checks pass; focused regression tests cover the risky paths. |

## Failing Items

- None for this merge batch.

## Retest Steps

- Re-run: `bun test`; `bash scripts/check-task-workflow.sh --strict`; temp-`HOME` `scripts/repo-harness.sh install --target both`.
- Re-check: `repo-harness doctor`/`repo-hook-scripts` after downstream repos refresh their `.ai/hooks` copies.

## Summary

- Pass. Merge the verified full hook-framework audit plan.
