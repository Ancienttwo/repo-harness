# Plan: Strict isolation agreement and Fleet verification lifecycle

> **Status**: Approved
> **Created**: 20260905-1455
> **Slug**: isolated-worktree-readiness
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Four real Git cases, Fleet provider lifecycle, final full suite and six integrity checks
> **Rollback Surface**: Revert only the codex/isolated-worktree-readiness commits
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`

> **Task Review**: `tasks/reviews/20260905-isolated-worktree-readiness.review.md`
> **Workflow Profile**: standard

## Goal and approval
Finish the user-approved strict isolated-worktree readiness fix, including the subsequently approved Fleet provider timeout/teardown regression slice. Approval is the current user's 批准; this captures the accepted work and does not request a new decision.

## P1 Map
Effective State resolver owns strict isolation; the projector exports the requirement and the mutation guard consumes it. Four real Git fixtures plus the strict golden cover agreement. Fleet's real-provider test owns its temporary repository, provider script/counter, environment and collection lifecycle. Production Fleet containment and limiter work belongs to another active worktree.

## P2 Trace
The full run failed the stale strict-primary golden and then the 30-second Fleet provider test. The golden is corrected. Bun timeout does not cancel an async test body: a deterministic probe records the next test starting before the timed-out body resumes and throws. Teardown must cancel and drain the collection before restoring environment/removing fixtures. Investigate the in-repo provider counter's effect on local readiness tokens before changing fixture placement.

## P3 Decision
Keep the strict isolation single authority already implemented. Limit additional edits to the Fleet test fixture and its cancellation lifecycle; do not duplicate the other worktree's product changes or weaken concurrency assertions/time limits. A test-finish hook owns cancellation and draining. Move telemetry outside the observed repo only if a real hash/token probe proves contamination. At 10x observation load the expensive readiness sampling and synchronous Git reads remain the first limit, outside this slice.

## Scope
Allowed paths: src/cli/hook/mutation-guard.ts; src/core/state/project-effective-state.ts; src/effects/state/resolve-effective-state.ts; tests/mutation-guard.test.ts; tests/state/project-effective-state.test.ts; tests/state/cli-state-golden.test.ts; tests/state/fixtures/explicit-strict-without-path-signals.json; tests/effects/fleet-board.test.ts; docs/researches/20260905-agent-workflow-maintenance.md; tasks/reviews/20260905-isolated-worktree-readiness.review.md; this plan and the derived tasks/current.md snapshot.
Out of scope: optional maintenance Skill product integration, new schedulers, Fleet production containment/limiter changes, baseline reverse-import repair already owned by another task, host installation/release.

## Verification
Capture actual failing guard/probe evidence before its fix and run focused Fleet, merge-readiness and strict-state suites. Freeze the candidate before one final bun test --timeout 60000 (historical duration 40 minutes), run typecheck and the six required repository-integrity commands, retain honest failed or inherited evidence, and do not claim a green full suite from isolated reruns.

## Delivery
Record final root cause, regression evidence and scope in the existing review/research. Commit this worktree; merge into main only when main's actual HEAD and dirty paths permit preserving other work. Archive this plan after completion. No separate contract, implementation notes or todo scaffolding for the standard profile.

## Task Breakdown
- [x] Unify strict isolation in the resolver/projector/guard and verify four real Git cases.
- [x] Correct the strict-primary golden without weakening normalization or assertions.
- [x] Prove Fleet timeout lifecycle and any fixture instability, then fix the verified cause in the existing test.
- [x] Freeze the candidate, attempt final verification and record its actual diff-bound results.
- [ ] Resolve the recorded acceptance blockers before claiming a completed full regression or merge.
- [ ] Commit, safely merge and close the approved slice.

## Evidence Contract

- **State/progress path**: This plan's Task Breakdown.
- **Verification evidence**: Exact commands/results in `tasks/reviews/20260905-isolated-worktree-readiness.review.md` and temporary raw logs named there.
- **Evaluator rubric**: Preserve isolation agreement, four real provider cards/concurrency 2, subject stability and timeout failure visibility; final repository checks pass.
- **Stop condition**: All task items complete and the existing review recommends pass with no unresolved in-scope failure.
- **Rollback surface**: Revert only the commits from `codex/isolated-worktree-readiness`.

## Promotion Gate

- **Merge/PR unit**: The approved strict-isolation change and its blocking Fleet verification repair form this branch's delivery unit.
- **Rollback surface**: Revert this branch's commits without altering the separate main worktree's edits.
- **Verification boundary**: Four real Git fixtures, provider subject stability, timeout lifecycle probe, full suite and required repository checks.
- **Review/acceptance boundary**: `tasks/reviews/20260905-isolated-worktree-readiness.review.md` binds the exact substantive diff and actual verification limits.
- **High-risk surface**: Strict edit authorization remains resolver-owned and fail-closed; the Fleet delta is test-only.
- **Why not checklist row**: The approved runtime permission change has its own verification and rollback boundary.

## Current Blockers

The final full suite was interrupted by SIGTERM / exit 143 after 3,315 passing lines and one `verify-sprint` authority-change failure. Its cause is unproven. The standard active-plan workflow check also still requires a separate contract, contrary to the current profile guidance. The overlapping main-worktree changes belong to another task. Keep this candidate as a local checkpoint; no acceptance, merge or installed-runtime claim. Detailed evidence remains in the existing review and research report.
