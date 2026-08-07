# Plan: Adoption gitignore: directory-level .repo-harness/ rule

> **Status**: Executing
> **Created**: 20260807-1128
> **Slug**: gitignore-dir-level-repo-harness
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: repo-harness-migration-review-slice-1
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: bun test, check:type, init dry-run, git check-ignore probe
> **Rollback Surface**: single commit; revert restores per-file entries
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md`
> **Task Review**: `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md`
> **Implementation Notes**: `tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: repo-harness-migration-review-slice-1
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md`
- Sprint contract: `tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md`
- Sprint review: `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md`
- Implementation notes: `tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md`.

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
- Contract file: `tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md`
- Review file: `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md`
- Implementation notes file: `tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit; revert restores per-file entries
- **Verification boundary**: bun test, check:type, init dry-run, git check-ignore probe
- **Review/acceptance boundary**: `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md`, `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md`, and `tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit; revert restores per-file entries

## Captured Planning Output

# Adoption gitignore: directory-level .repo-harness/ rule (Slice 1)

## Problem

The downstream gitignore template `src/core/adoption/gitignore-plan.ts` lists only two per-file `.repo-harness/` entries (`chatgpt-browser.local.json`, `chatgpt-browser.tokens.json`) — both files no current code writes — while the four files the MCP server actually persists (`mcp.local.json`, `mcp.tokens.json`, `mcp.oauth.json`, `mcp.oauth-tokens.json`, the last holding OAuth access/refresh tokens and dynamic clients) are absent. The only compensation is `setup.ts` appending entries during `mcp setup chatgpt` with repo scope. A user who never runs setup and starts `repo-harness mcp serve --transport http` directly gets tokens written to `<repo>/.repo-harness/` in NOT-IGNORED state. This repo's own `.gitignore` has the same fail-open shape: per-file entries only, so any new file under `.repo-harness/` defaults to tracked.

## Decision (Slice 1 of the .repo-harness migration review — zero behavior change)

Replace per-file `.repo-harness/` ignore entries with a single directory-level `.repo-harness/` rule:

1. `src/core/adoption/gitignore-plan.ts`: the managed-block content drops the two dead per-file lines in favor of one `.repo-harness/` line.
2. This repo's own `.gitignore`: consolidate all scattered `.repo-harness/*` per-file entries into one directory-level `.repo-harness/` entry.
3. Check any other authored surface that projects gitignore content for downstream repos (e.g. `assets/templates/gitignore.template`) and apply the same directory-level rule if it carries `.repo-harness` entries; report if none do.

Out of scope (deferred to Slice 2, a separate decision): retiring the repo config scope, `setup.ts` `ensureGitignoreEntries` compensation removal, `McpConfigScope` changes, moving `chatgpt-browser.local.json` to user level. The setup-time per-file compensation lines becoming redundant next to the directory rule is acceptable — gitignore semantics tolerate the overlap, and removal belongs to Slice 2.

## Task Breakdown

- [ ] Apply the directory-level rule in `gitignore-plan.ts` managed block, this repo's `.gitignore`, and any other gitignore-projecting template found.
- [ ] Update any tests/fixtures asserting the old per-file managed-block content; add or extend a test asserting the managed block ignores the whole `.repo-harness/` directory.
- [ ] Verify `git check-ignore -q .repo-harness/anything.json` reports IGNORED in this repo.
- [ ] Full `bun test` green, `bun run check:type` green, and `bun src/cli/index.ts init --repo . --dry-run` consistent (adoption planner touched).

## Verification

`bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`, `git check-ignore -q .repo-harness/anything.json`, plus repo required checks.

## Rollback

Single commit; revert restores per-file entries.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Apply the directory-level rule in `gitignore-plan.ts` managed block, this repo's `.gitignore`, and any other gitignore-projecting template found.
- [x] Update any tests/fixtures asserting the old per-file managed-block content; add or extend a test asserting the managed block ignores the whole `.repo-harness/` directory.
- [x] Verify `git check-ignore -q .repo-harness/anything.json` reports IGNORED in this repo.
- [x] Full `bun test` green, `bun run check:type` green, and `bun src/cli/index.ts init --repo . --dry-run` consistent (adoption planner touched).
