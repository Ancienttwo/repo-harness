# Plan: Codegraph enablement: remove size heuristic, explicit opt-in only

> **Status**: Archived
> **Created**: 20260818-1636
> **Slug**: codegraph-explicit-optin
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: bun test + tsc + init dry-run
> **Rollback Surface**: revert install-profile.ts, policy.json tooling key, tests, one doc
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md`
> **Task Review**: `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md`
> **Implementation Notes**: `tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md`

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

- Active plan: `plans/plan-20260818-1636-codegraph-explicit-optin.md`
- Sprint contract: `tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md`
- Sprint review: `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md`
- Implementation notes: `tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-1636-codegraph-explicit-optin.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-1636-codegraph-explicit-optin.md`.

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
- Contract file: `tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md`
- Review file: `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md`
- Implementation notes file: `tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-1636-codegraph-explicit-optin.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert install-profile.ts, policy.json tooling key, tests, one doc
- **Verification boundary**: bun test + tsc + init dry-run
- **Review/acceptance boundary**: `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-1636-codegraph-explicit-optin.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md`, `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md`, and `tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert install-profile.ts, policy.json tooling key, tests, one doc

## Captured Planning Output

## Goal

Remove the implicit >=2000-tracked-files size heuristic from `profileEnablesCodegraph` so downstream codegraph enablement is purely explicit: `full` profile or `tooling.codegraph.enabled === true` in the target repo's `.ai/harness/policy.json`. This closes the documented-vs-actual gap with the CLAUDE.md contract ("downstream repos keep the global MCP default unless local policy opts in") and the repo's no-heuristic-fallback principle.

## Decision

User approved deleting the heuristic (fail closed to disabled) over documenting it. Decision boundary: changes downstream install semantics.

## Task Breakdown

- [x] `src/cli/installer/install-profile.ts:1159-1170`: delete the `git ls-files` count branch; return false when neither `full` profile nor explicit policy opt-in applies. Remove the now-dead `spawnSync` import (only remaining use is this branch).
- [x] Preserve self-host behavior: add `tooling.codegraph.enabled: true` to this repo's `.ai/harness/policy.json` so the self-host repo (2535 tracked files) keeps codegraph enabled explicitly instead of via the deleted heuristic.
- [x] Tests (`tests/install-profiles.test.ts`): keep existing full/minimal assertions; add coverage for (a) explicit policy opt-in -> true, (b) large repo without opt-in -> false.
- [x] Docs: `docs/reference-configs/install-profiles.md:94-95` reword "Minimal keeps CodeGraph conditional" to the explicit opt-in semantics.

## Out of Scope

User WIP files: `scripts/contract-worktree.sh`, `assets/templates/helpers/contract-worktree.sh`, `tasks/todos.md`, `docs/architecture/*` uncommitted changes.

## Verification

- `bun test tests/install-profiles.test.ts`
- `bun test`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bun src/cli/index.ts init --repo . --dry-run`

## Rollback

Single revert of the touched files; no data or migration surface.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `src/cli/installer/install-profile.ts:1159-1170`: delete the `git ls-files` count branch; return false when neither `full` profile nor explicit policy opt-in applies. Remove the now-dead `spawnSync` import (only remaining use is this branch).
- [x] Preserve self-host behavior: add `tooling.codegraph.enabled: true` to this repo's `.ai/harness/policy.json` so the self-host repo (2535 tracked files) keeps codegraph enabled explicitly instead of via the deleted heuristic.
- [x] Tests (`tests/install-profiles.test.ts`): keep existing full/minimal assertions; add coverage for (a) explicit policy opt-in -> true, (b) large repo without opt-in -> false.
- [x] Docs: `docs/reference-configs/install-profiles.md:94-95` reword "Minimal keeps CodeGraph conditional" to the explicit opt-in semantics.
