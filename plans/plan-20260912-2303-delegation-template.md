# Plan: Template the collaboration delegation fixture

> **Status**: Executing
> **Created**: 20260912-2303
> **Slug**: delegation-template
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260912-2303-delegation-template.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260912-2303-delegation-template.md`; after execution revert branch `codex/delegation-template` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260912-2303-delegation-template.contract.md`
> **Task Review**: `tasks/reviews/20260912-2303-delegation-template.review.md`
> **Implementation Notes**: `tasks/notes/20260912-2303-delegation-template.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260912-2303-delegation-template.md`
- Sprint contract: `tasks/contracts/20260912-2303-delegation-template.contract.md`
- Sprint review: `tasks/reviews/20260912-2303-delegation-template.review.md`
- Implementation notes: `tasks/notes/20260912-2303-delegation-template.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260912-2303-delegation-template.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260912-2303-delegation-template.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260912-2303-delegation-template.md`.

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
- Contract file: `tasks/contracts/20260912-2303-delegation-template.contract.md`
- Review file: `tasks/reviews/20260912-2303-delegation-template.review.md`
- Implementation notes file: `tasks/notes/20260912-2303-delegation-template.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260912-2303-delegation-template.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260912-2303-delegation-template.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260912-2303-delegation-template.md`; after execution revert branch `codex/delegation-template` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260912-2303-delegation-template.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260912-2303-delegation-template.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260912-2303-delegation-template.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260912-2303-delegation-template.contract.md`, `tasks/reviews/20260912-2303-delegation-template.review.md`, and `tasks/notes/20260912-2303-delegation-template.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260912-2303-delegation-template.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260912-2303-delegation-template.md`; after execution revert branch `codex/delegation-template` or the explicitly reviewed diff.

## Captured Planning Output

## Context

`tests/effects/collaboration-contribution-collector.test.ts` rebuilt the C4
delegation fixture 17 times per run: each rebuild runs `git init`, two commits,
a `.codex` copy, and one real `bun src/cli/index.ts delegation capability` child
process. Baseline isolate run: 87s for 35 tests.

PR #421 already landed `fixtureTemplate()` in `tests/helpers/repo-fixture.ts`,
but it only accepts an async builder and only snapshots a `{ root, home }`
workspace. The delegation fixture is a synchronous builder consumed by
synchronous test bodies, and its workspace field is `repoRoot`.

## Decision

Relax `fixtureTemplate()` rather than add a parallel API:

- an overload pair lets `materialize()` mirror the builder, so a synchronous
  builder keeps a synchronous call site and the 35 existing test bodies stay
  synchronous;
- an optional `workspacePaths` selector names the directories to snapshot, so a
  fixture that does not use the `{ root, home }` shape is expressible;
- the store layout becomes index-keyed instead of `root`/`home`-keyed.

The template boundary stops at the expensive builder. Each test still receives
unshared bytes restored into the fixture's own paths, because
`repoHarnessRepoIdFor()` hashes the repository root verbatim.

Cleanup ownership moves to the call site: the builder's `roots` argument is
discarded and `delegationFixture()` registers both directories for `afterEach`,
because on a cache hit the builder never runs.

## Task Breakdown

- [x] Relax `fixtureTemplate()` to support a synchronous builder and a workspace
      path selector.
- [x] Rewire `collaboration-contribution-collector.test.ts` onto the template.
- [x] Prove zero test loss and no cross-file leakage.

## Verification Plan

- `bun test --timeout 180000 tests/effects/collaboration-contribution-collector.test.ts`
- `bun test --timeout 180000 tests/effects/campaign-worker.test.ts`
- `bun test --timeout 180000 tests/effects/collaboration-*.test.ts`
- `bun run check:type`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Relax `fixtureTemplate()` to support a synchronous builder and a workspace
- [x] Rewire `collaboration-contribution-collector.test.ts` onto the template.
- [x] Prove zero test loss and no cross-file leakage.
