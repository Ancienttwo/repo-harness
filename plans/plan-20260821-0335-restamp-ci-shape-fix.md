# Plan: Fix PATH-dependent drain-shape test on main CI

> **Status**: Approved
> **Created**: 20260821-0335
> **Slug**: restamp-ci-shape-fix
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: PATH-scrubbed local run plus main CI green
> **Rollback Surface**: Single revert of one test-fixture commit
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260821-0335-restamp-ci-shape-fix.contract.md`
> **Task Review**: `tasks/reviews/20260821-0335-restamp-ci-shape-fix.review.md`
> **Implementation Notes**: `tasks/notes/20260821-0335-restamp-ci-shape-fix.notes.md`

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

- Active plan: `plans/plan-20260821-0335-restamp-ci-shape-fix.md`
- Sprint contract: `tasks/contracts/20260821-0335-restamp-ci-shape-fix.contract.md`
- Sprint review: `tasks/reviews/20260821-0335-restamp-ci-shape-fix.review.md`
- Implementation notes: `tasks/notes/20260821-0335-restamp-ci-shape-fix.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260821-0335-restamp-ci-shape-fix.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260821-0335-restamp-ci-shape-fix.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260821-0335-restamp-ci-shape-fix.md`.

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
- Contract file: `tasks/contracts/20260821-0335-restamp-ci-shape-fix.contract.md`
- Review file: `tasks/reviews/20260821-0335-restamp-ci-shape-fix.review.md`
- Implementation notes file: `tasks/notes/20260821-0335-restamp-ci-shape-fix.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260821-0335-restamp-ci-shape-fix.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260821-0335-restamp-ci-shape-fix.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert of one test-fixture commit
- **Verification boundary**: PATH-scrubbed local run plus main CI green
- **Review/acceptance boundary**: `tasks/reviews/20260821-0335-restamp-ci-shape-fix.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260821-0335-restamp-ci-shape-fix.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260821-0335-restamp-ci-shape-fix.contract.md`, `tasks/reviews/20260821-0335-restamp-ci-shape-fix.review.md`, and `tasks/notes/20260821-0335-restamp-ci-shape-fix.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260821-0335-restamp-ci-shape-fix.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert of one test-fixture commit

## Captured Planning Output

# Fix PATH-dependent drain-shape test red on main CI

## Goal

`tests/architecture-projection-restamp-cli.test.ts` "drain output shape" test passes on a clean runner: the fixture no longer leaves the manifest tracked-dirty (the shape lock asserts key order and no-publication-keys, which needs a drain invocation, not a dirty path), so the `disabled`-provider legacy cascade branch that requires `repo-harness` on PATH is never entered. Main CI returns green.

## Why

Post-merge CI on f565d319 is red (run 32409039529): the fixture writes an empty policy (provider disabled) plus a dirty manifest; `architecture-projection.ts:45-50` routes disabled drains into the legacy cascade, which fails when `repoHarnessRunnerAvailable` can't find repo-harness via PATH/REPO_HARNESS_CLI (`mutation-observed.ts:855-858`, `:798-802`). Developer machines mask it (global repo-harness on PATH); deterministic repro: strip `~/.bun/bin` from PATH and run the file (2 pass / 1 fail).

## Task Breakdown

- [ ] Fixture edit per option (a): drop the dirty-manifest setup from the shape-lock test (keep the other two tests unchanged); keep asserting the exact key order and absence of publication keys.
- [ ] Verify BOTH ways: plain `bun test tests/architecture-projection-restamp-cli.test.ts --timeout 60000` AND a PATH-scrubbed run (remove ~/.bun/bin from PATH) — both 3 pass / 0 fail.
- [ ] lessons.md: tests reaching `repoHarnessRunnerAvailable` are only meaningful on PATH-scrubbed runs or CI; developer-global repo-harness masks them.
- [ ] Commit (no AI attribution trailer), push main, watch CI to green.

## Exit Criteria

1. PATH-scrubbed local run of the file: 3 pass / 0 fail.
2. Main CI green on the fix commit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Fixture edit per option (a): drop the dirty-manifest setup from the shape-lock test (keep the other two tests unchanged); keep asserting the exact key order and absence of publication keys.
- [ ] Verify BOTH ways: plain `bun test tests/architecture-projection-restamp-cli.test.ts --timeout 60000` AND a PATH-scrubbed run (remove ~/.bun/bin from PATH) — both 3 pass / 0 fail.
- [ ] lessons.md: tests reaching `repoHarnessRunnerAvailable` are only meaningful on PATH-scrubbed runs or CI; developer-global repo-harness masks them.
- [ ] Commit (no AI attribution trailer), push main, watch CI to green.
