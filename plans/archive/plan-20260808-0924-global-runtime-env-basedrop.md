# Plan: Fix global-runtime commandEnv single-key record on the npx path

> **Status**: Archived
> **Created**: 20260808-0924
> **Slug**: global-runtime-env-basedrop
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: pr-169-class-sweep-closeout
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: regression guard RED-to-GREEN plus full bun test
> **Rollback Surface**: single commit; revert restores prior behavior
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md`
> **Task Review**: `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md`
> **Implementation Notes**: `tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: pr-169-class-sweep-closeout
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260808-0924-global-runtime-env-basedrop.md`
- Sprint contract: `tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md`
- Sprint review: `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md`
- Implementation notes: `tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260808-0924-global-runtime-env-basedrop.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260808-0924-global-runtime-env-basedrop.md`.

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
- Contract file: `tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md`
- Review file: `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md`
- Implementation notes file: `tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260808-0924-global-runtime-env-basedrop.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit; revert restores prior behavior
- **Verification boundary**: regression guard RED-to-GREEN plus full bun test
- **Review/acceptance boundary**: `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260808-0924-global-runtime-env-basedrop.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md`, `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md`, and `tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit; revert restores prior behavior

## Captured Planning Output

# Fix global-runtime commandEnv single-key record on the npx path (class-sweep closeout)

## Problem

`src/cli/commands/global-runtime.ts:271-277` `commandEnv` carries the same base-dropping shape fixed in #169's `initCommandEnv`: for an npx-cache source with no caller env it builds `{ AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" }` — a single-key environment record. Downstream, that record reaches consumers that read it as an environment (`withProcessEnv` key-swaps it into `process.env`; `readInstalledProfile(env)` → `installProfileStatePath` resolves `env.HOME ?? homedir()`), so both levers are missing whenever a caller-supplied override should have applied. Today it is masked in production because `homedir()` equals process-start HOME, but the shape is the proven-dangerous one. `bindBunRuntimeEnv` (`global-runtime.ts:124` region) shares the family and needs the same disposition (fix or verified-inert report).

## Decision (design question resolved)

The pre-work question — "can commandEnv still return undefined?" — dissolves on reading the consumers: `undefined` has a well-defined meaning everywhere downstream (`withProcessEnv`'s `if (!env) return fn()` runs against the live `process.env`; `readInstalledProfile` defaults to `process.env`). `undefined` is not the bug; the single-key record is. Therefore: copy the exact post-fix shape of `initCommandEnv` (#169):

```ts
function commandEnv(sourceRoot, env?) {
  if (!isNpxCacheSource(sourceRoot)) return env;
  if (env?.AGENTIC_DEV_LINK_INSTALLED_COPIES !== undefined) return env;
  return { ...(env ?? process.env), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" };
}
```

Non-npx callers keep the exact `env`-through (including `undefined`); npx-with-flag keeps env untouched; only the npx-no-flag branch changes base. No signature change, no contract flip. `bindBunRuntimeEnv`: same treatment if it constructs a partial record consumed as an environment; verified-inert report in notes otherwise.

## Root cause evidence plan (bugfix profile)

- regression_guard: tests/cli/global-runtime.test.ts — npx-cache-source setup-global path with `REPO_HARNESS_HOME`/marker set in `process.env` must resolve installed-profile state (or equivalent observable) under the override, not the real home. RED on unfixed code, artifact captured.
- pre_fix_failure_artifact: .ai/harness/checks/pre-fix-global-runtime-env.log

## Task Breakdown

- [x] Regression guard in `tests/cli/global-runtime.test.ts` (RED captured on unfixed code).
- [x] Fix `commandEnv` to the #169 shape; disposition `bindBunRuntimeEnv` (fix or verified-inert report).
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run` green.

## Verification

Regression guard RED→GREEN; full suite; typecheck; init dry-run.

## Rollback

Single commit; revert restores prior behavior.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Regression guard in `tests/cli/global-runtime.test.ts` (RED captured on unfixed code).
- [x] Fix `commandEnv` to the #169 shape; disposition `bindBunRuntimeEnv` (fix or verified-inert report).
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run` green.
