# Plan: Effective State test retirement

> **Status**: Executing
> **Created**: 20260716-0222
> **Slug**: effective-state-test-retirement
> **Planning Source**: codex-plan
> **Orchestration Kind**: codex-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused Effective State tests, bun run check:type, bun scripts/check-state-boundaries.ts, bun scripts/sync-helper-sources.ts --check, one frozen-subject full bun test recorded as manual evidence, and strict workflow gates; no benchmark or release gate because production/package behavior is unchanged.
> **Rollback Surface**: Revert the test cleanup; no runtime source, product protocol, or data migration changes.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md`
> **Task Review**: `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md`
> **Implementation Notes**: `tasks/notes/20260716-0222-effective-state-test-retirement.notes.md`

## Agentic Routing
- Selected route: implementation
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260716-0222-effective-state-test-retirement.md`
- Sprint contract: `tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md`
- Sprint review: `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md`
- Implementation notes: `tasks/notes/20260716-0222-effective-state-test-retirement.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260716-0222-effective-state-test-retirement.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260716-0222-effective-state-test-retirement.md`.

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
- Contract file: `tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md`
- Review file: `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md`
- Implementation notes file: `tasks/notes/20260716-0222-effective-state-test-retirement.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260716-0222-effective-state-test-retirement.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the test cleanup; no runtime source, product protocol, or data migration changes.
- **Verification boundary**: Focused Effective State tests, bun run check:type, bun scripts/check-state-boundaries.ts, bun scripts/sync-helper-sources.ts --check, one frozen-subject full bun test recorded as manual evidence, and strict workflow gates; no benchmark or release gate because production/package behavior is unchanged.
- **Review/acceptance boundary**: `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260716-0222-effective-state-test-retirement.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md`, `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md`, and `tasks/notes/20260716-0222-effective-state-test-retirement.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the test cleanup; no runtime source, product protocol, or data migration changes.

## Captured Planning Output

# Effective State test retirement

P1: The ESA cutover already removed the monolithic state authority; the remaining supported surfaces are the Core/Effects resolver, thin CLI/hook/MCP adapters, the explicit one-shot migration, twelve golden fixtures, and the boundary checker.
P2: The old integration suites still repeat CLI rendering, cache/version, lock, freshness, guidance, and capability-validation assertions now owned by focused Core/Effects/adapter suites. Both golden and parity suites also duplicate one scenario setup table.
P3: Keep every approved public invariant and all twelve goldens, but assign each behavior to one test owner, retain only narrow public adapter smoke, route test-only type imports to their canonical Core owner, remove the completed one-shot benchmark harness, and make the test diff net negative. Existing package exports, production behavior, and package contents are out of scope.

## Task Breakdown
- [x] Consolidate the duplicated twelve-scenario fixture setup without changing golden files or parity coverage.
- [x] Retire old integration assertions that have equal or stronger focused owners.
- [x] Remove test-only old-path imports and the completed unreferenced benchmark harness while retaining existing package exports.
- [x] Run focused, type, boundary/helper, full test, and pre-review workflow structure verification.

## Acceptance
- Production runtime behavior is unchanged; no state, policy, lock, cache, MCP, hook, package, or evaluator semantics change.
- All twelve golden JSON files remain byte-identical and adapter parity still covers every golden scenario.
- The public state-snapshot hook and explicit one-shot legacy migration remain covered.
- Test and fixture LOC is net negative, with each deleted assertion mapped to a surviving owner.
- No 3x9 benchmark, release gate, Harness Loop sprint, or Skill Surface file is touched.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Consolidate the duplicated twelve-scenario fixture setup without changing golden files or parity coverage.
- [x] Retire old integration assertions that have equal or stronger focused owners.
- [x] Remove test-only old-path imports and the completed unreferenced benchmark harness while retaining existing package exports.
- [x] Run focused, type, boundary/helper, full test, and pre-review workflow structure verification.
