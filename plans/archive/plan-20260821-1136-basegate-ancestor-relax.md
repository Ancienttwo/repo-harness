# Plan: Relax verify-sprint base sync guard to ancestor check

> **Status**: Archived
> **Created**: 20260821-1136
> **Slug**: basegate-ancestor-relax
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Ahead/behind/diverged fixture matrix, twin parity, full suite, unchanged sibling criteria
> **Rollback Surface**: Single revert restores the equality criterion in both twins
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md`
> **Task Review**: `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md`
> **Implementation Notes**: `tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260821-1136-basegate-ancestor-relax.md`
- Sprint contract: `tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md`
- Sprint review: `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md`
- Implementation notes: `tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260821-1136-basegate-ancestor-relax.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260821-1136-basegate-ancestor-relax.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md`
- Review file: `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md`
- Implementation notes file: `tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260821-1136-basegate-ancestor-relax.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert restores the equality criterion in both twins
- **Verification boundary**: Ahead/behind/diverged fixture matrix, twin parity, full suite, unchanged sibling criteria
- **Review/acceptance boundary**: `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260821-1136-basegate-ancestor-relax.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md`, `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md`, and `tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert restores the equality criterion in both twins

## Captured Planning Output

# Relax verify-sprint base_ref_unsynchronized to ancestor check

## Goal

`verify-sprint --prepare-acceptance` (and any other caller of the same base-sync guard in `scripts/verify-sprint.sh:444-453`) no longer fails when local `main` is strictly AHEAD of `origin/main` (fast-forwardable): the criterion changes from commit equality (`main^{commit} != main@{upstream}^{commit}`) to `git merge-base --is-ancestor <upstream> <local>` — fail only when local main is behind or has diverged from its upstream. Both script twins (scripts/ + assets/templates/helpers/) stay byte-identical via the sync tooling.

## Why

The equality criterion blocked the ship chain three times on 2026-08-20/21 (unpushed parallel publication commit; two re-freeze rounds), each costing a rebase + ~13-minute evidence re-freeze. The guard's own comment describes the harm as "lags its own remote-tracking ref" — local-ahead does not constitute that harm: acceptance evidence binds target_ref/target_revision to origin/main (still real), and stale-fork publication regression is separately guarded by contract-worktree finish's `merge-base --is-ancestor "$frozen_base_sha" "$current_branch"` check (`scripts/contract-worktree.sh:1830`) plus `tests/verify-sprint-rebase-base-guard.test.ts`. Design source: deep-reasoner companion finding, 2026-08-21 restamp design pass.

## Frozen decisions

1. New criterion: fail iff upstream exists AND NOT `git merge-base --is-ancestor <upstream-sha> <local-sha>`. Local == upstream passes (ancestor of itself); local ahead passes; local behind fails; diverged fails. No-upstream behavior unchanged from today (preserve whatever the current branch does when `@{upstream}` is missing — read the code first, do not invent).
2. Error output keeps the same `reason=` token shape but the reason for the new failure mode must say what is actually wrong (behind/diverged), and the remediation line must name the actual fix (`git pull --ff-only` / reconcile divergence). If downstream tests or docs pin the literal `base_ref_unsynchronized` string, keep the token and only adjust the human message — check `rg -n "base_ref_unsynchronized"` across tests/, docs/, assets/ first and reconcile.
3. Both twins updated through `bun scripts/sync-helper-sources.ts --write`; parity stays guarded by the existing byte-identity tests.
4. Tests in the existing verify-sprint test surface: ahead-of-origin → gate passes; behind → fails; diverged → fails; equal → passes. Reuse the existing fixture idiom in tests/verify-sprint-*.test.ts.
5. Out of scope: the restamp ahead-of-origin advisory (stays as-is; informative), contract-worktree finish gates, acceptance-receipt semantics, any other verify-sprint criteria.

## Task Breakdown

- [x] Slice 1 — read the current guard (scripts/verify-sprint.sh:~444-453) + `rg base_ref_unsynchronized` across the repo; implement frozen decisions 1-2 in scripts/verify-sprint.sh; sync twin via sync-helper-sources --write. Verify: `bun test tests/helper-scripts.test.ts --timeout 60000` (parity green).
- [x] Slice 2 — tests per frozen decision 4. Verify: `bun test tests/verify-sprint-*.test.ts tests/helper-scripts.test.ts --timeout 60000`.
- [x] Slice 3 — full gates: full suite (nohup+log+EXIT), `bun run check:type`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, `bun src/cli/index.ts init --repo . --dry-run`.

## Exit Criteria

1. A fixture where local main is 1+ commits ahead of origin/main passes the base-sync guard; behind and diverged fixtures fail with an accurate message.
2. Script twins byte-identical (parity tests green).
3. Full suite 0 fail; no other verify-sprint criterion behavior changed (existing verify-sprint tests green unmodified except the new cases).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Slice 1 — read the current guard (scripts/verify-sprint.sh:~444-453) + `rg base_ref_unsynchronized` across the repo; implement frozen decisions 1-2 in scripts/verify-sprint.sh; sync twin via sync-helper-sources --write. Verify: `bun test tests/helper-scripts.test.ts --timeout 60000` (parity green).
- [x] Slice 2 — tests per frozen decision 4. Verify: `bun test tests/verify-sprint-*.test.ts tests/helper-scripts.test.ts --timeout 60000`.
- [x] Slice 3 — full gates: full suite (nohup+log+EXIT), `bun run check:type`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, `bun src/cli/index.ts init --repo . --dry-run`.
