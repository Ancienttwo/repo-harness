# Plan: Tests: fail-closed user-home isolation for the whole suite

> **Status**: Executing
> **Created**: 20260807-2321
> **Slug**: test-home-isolation
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: 20260807-leak-incidents
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: full bun test plus before/after real-home snapshot showing zero writes
> **Rollback Surface**: single commit, test config and test files only
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260807-2321-test-home-isolation.contract.md`
> **Task Review**: `tasks/reviews/20260807-2321-test-home-isolation.review.md`
> **Implementation Notes**: `tasks/notes/20260807-2321-test-home-isolation.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: 20260807-leak-incidents
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260807-2321-test-home-isolation.md`
- Sprint contract: `tasks/contracts/20260807-2321-test-home-isolation.contract.md`
- Sprint review: `tasks/reviews/20260807-2321-test-home-isolation.review.md`
- Implementation notes: `tasks/notes/20260807-2321-test-home-isolation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260807-2321-test-home-isolation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260807-2321-test-home-isolation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260807-2321-test-home-isolation.md`.

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
- Contract file: `tasks/contracts/20260807-2321-test-home-isolation.contract.md`
- Review file: `tasks/reviews/20260807-2321-test-home-isolation.review.md`
- Implementation notes file: `tasks/notes/20260807-2321-test-home-isolation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260807-2321-test-home-isolation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260807-2321-test-home-isolation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit, test config and test files only
- **Verification boundary**: full bun test plus before/after real-home snapshot showing zero writes
- **Review/acceptance boundary**: `tasks/reviews/20260807-2321-test-home-isolation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260807-2321-test-home-isolation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260807-2321-test-home-isolation.contract.md`, `tasks/reviews/20260807-2321-test-home-isolation.review.md`, and `tasks/notes/20260807-2321-test-home-isolation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260807-2321-test-home-isolation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit, test config and test files only

## Captured Planning Output

# Tests: fail-closed user-home isolation for the whole suite

## Problem

Tests that spawn CLI subprocesses or invoke scripts without an isolated `REPO_HARNESS_HOME` write into the operator's real `~/.repo-harness`. Empirically confirmed this week, three independent leak classes:

1. `init`-family tests have accumulated ~800 temp-path entries in the real `~/.repo-harness/registered-repos.json` (paths like `repo-harness-init-*`, `repo-harness-init-handoff-*`, `repo-harness-init-npx-*`), still growing 3-9 entries per full-suite run.
2. `scripts/acceptance-receipt.ts` invoked during tests rewrites the real `~/.repo-harness/gates/<id>/acceptance.latest.json`.
3. An `mcp-setup` test overwrote the operator's real `chatgpt.serverName` (fixed at the spawn site mid-slice, but the class stayed open — any future test with a missed env passthrough repeats it).

The per-test-site discipline ("remember to pass REPO_HARNESS_HOME to the child") has failed repeatedly; the class needs a structural fail-closed layer.

## Decision

Two layers, smallest structural change first:

1. **Suite-level default isolation (core)**: a bun test preload (via `bunfig.toml` `[test].preload`, or extend the existing preload if one exists) that, when `REPO_HARNESS_HOME` is not already set by the environment, sets it to a fresh per-run temp directory before any test module loads. Child processes inherit `process.env`, so even a spawn site that forgets explicit env passing lands in the isolated home. Explicitly set `REPO_HARNESS_HOME` (test-specific fixtures using their own temp home) keeps precedence — the preload only fills the dangerous default.
2. **Verification harness**: a leak probe proving the layer works — snapshot the real `~/.repo-harness` mtimes/hashes before and after a full suite run and assert zero writes (this is the acceptance evidence; the gatekeepers this week did it manually twice).

Out of scope: cleaning the ~800 already-leaked registry entries (operator-state operation, handled outside the slice by the orchestrator with a backup); adding any product CLI command; changing `repo-registry.ts` or any production code; the `gates/` receipt path when invoked by real operator flows (only test invocations must be isolated).

## Falsifier

If any test legitimately requires the real user home, that test is itself a leak bug, not a counterexample. If the preload breaks a substantial set of tests because they depend on `REPO_HARNESS_HOME` being unset (e.g. asserting the literal `~/.repo-harness` path in output), those assertions need the isolated path instead — direction holds unless the breakage reveals tests of real-home *resolution logic* that cannot be expressed under an override; report before widening.

## Task Breakdown

- [x] Add (or extend) the bun test preload setting `REPO_HARNESS_HOME` to a per-run temp dir when unset; document the precedence rule in a comment.
- [x] Full `bun test` green under the preload; fix any test whose assertions hardcode the real home path.
- [x] Leak probe: before/after snapshot of the real `~/.repo-harness` across a full suite run shows zero writes (registry entry count stable, gates receipt untouched, mcp files byte-identical).
- [x] `bun run check:type` green.

## Verification

`bun test` (full) with the before/after real-home snapshot as the primary evidence; `bun run check:type`.

## Rollback

Single commit touching test config/preload and test files only; revert restores prior behavior.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add (or extend) the bun test preload setting `REPO_HARNESS_HOME` to a per-run temp dir when unset; document the precedence rule in a comment.
- [x] Full `bun test` green under the preload; fix any test whose assertions hardcode the real home path.
- [x] Leak probe: before/after snapshot of the real `~/.repo-harness` across a full suite run shows zero writes (registry entry count stable, gates receipt untouched, mcp files byte-identical).
- [x] `bun run check:type` green.
