# Plan: Ship repo-harness-hook bin as prepack single-file bundle

> **Status**: Archived
> **Created**: 20260805-1745
> **Slug**: hook-entry-single-file-bundle
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260805-1745-hook-entry-single-file-bundle.md`; after execution revert branch `codex/hook-entry-single-file-bundle` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md`
> **Task Review**: `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md`
> **Implementation Notes**: `tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md`

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

- Active plan: `plans/plan-20260805-1745-hook-entry-single-file-bundle.md`
- Sprint contract: `tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md`
- Sprint review: `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md`
- Implementation notes: `tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260805-1745-hook-entry-single-file-bundle.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260805-1745-hook-entry-single-file-bundle.md`.

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
- Contract file: `tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md`
- Review file: `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md`
- Implementation notes file: `tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260805-1745-hook-entry-single-file-bundle.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260805-1745-hook-entry-single-file-bundle.md`; after execution revert branch `codex/hook-entry-single-file-bundle` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260805-1745-hook-entry-single-file-bundle.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md`, `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md`, and `tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260805-1745-hook-entry-single-file-bundle.md`; after execution revert branch `codex/hook-entry-single-file-bundle` or the explicitly reviewed diff.

## Captured Planning Output

## Problem

The globally installed `repo-harness-hook` bin executes `src/cli/hook-entry.ts` (multi-file TS graph) straight out of the live `~/.bun/install/global/node_modules/repo-harness` tree. During `bun install -g` reinstalls, host hooks firing mid-swap resolve a half-replaced import graph and hang until the host kills them at the 30s adapter timeout. Evidence: `.ai/harness/runs/hook-events.jsonl` shows the in-process handler at p50=2ms/max=62ms across 269 samples, while transcript-vs-telemetry reconciliation places every killed UserPromptSubmit run inside the 2026-07-23 global-reinstall window.

## Decision

Ship the `repo-harness-hook` bin as a publish-time single-file bundle (`dist/hook-entry.js`, built by `prepack` via `bun build --target=bun`). A single file swaps atomically during registry reinstalls, eliminating the half-tree resolution window. Managed adapter command strings, `timeout: 30`, and the `repo-harness` main bin stay byte-identical (no Codex re-trust, no settings churn).

Two bounded source changes are required to make the bundle behavior-preserving (probed and verified by the execution worker):
1. Bundling DCEs the `import.meta.main` receiver for the detached tooling-populate respawn in `session-context.ts`, and `import.meta.url` retargets the spawn to the bundle — so `hook-entry.ts` gains an explicit dispatch branch for `DETACHED_TOOLING_POPULATE_FLAG` calling the same exported function (one authority, two dispatch surfaces).
2. `post-bash-importer.ts` derives the package root from `import.meta.url`; bundled, its provider version collapses to an invented "0.0.0" (fail-open). The prepack build injects the real package version via `bun build --define`; the bundled path never emits "0.0.0".

Rejected alternative: making the global install ritual atomic — `rename(2)` cannot replace a non-empty directory and a wrapper script relocates the discipline problem without fixing the artifact.

Accepted residual: local `bun install -g <dir>` / `bun link` symlink installs bypass the bundle (bun runs no lifecycle scripts there, measured on bun 1.3.14); all observed failures are registry installs, which `prepack` covers.

## Task Breakdown

- [ ] Export `DETACHED_TOOLING_POPULATE_FLAG` from `src/cli/hook/session-context.ts` (receiver at import.meta.main stays intact)
- [ ] Add dispatch branch in `src/cli/hook-entry.ts` before `parseCliArgs`: static import of flag + `runDetachedToolingPopulate`, argv mapped identically to the session-context receiver
- [ ] Build-time version constant in `src/effects/evidence/post-bash-importer.ts` checked before the existing path-walk; injected via `--define` in the prepack build; bundled path never returns "0.0.0"
- [ ] `package.json`: add `prepack` bundle script (`bun build src/cli/hook-entry.ts --target=bun --outfile dist/hook-entry.js` + define + shebang), point bin `repo-harness-hook` at `dist/hook-entry.js`, include `dist/hook-entry.js` in `files`; add `dist/` to `.gitignore`
- [ ] Update `tests/bootstrap-files.test.ts` bin-target expectation
- [ ] Regression test for the hook-entry dispatch branch (red-green: fails on pre-change usage-error path, passes after)
- [ ] Verification bundle: shebang present, `runDetachedToolingPopulate` present in bundle, UserPromptSubmit + PostToolUse routes exit 0 via `bun dist/hook-entry.js`, telemetry record appended, injected version visible, `bash scripts/check-tarball-install-smoke.sh` passes, required checks pass

## Verification

`bun test`; `bash scripts/check-tarball-install-smoke.sh`; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts init --repo . --dry-run`; runtime probes of `dist/hook-entry.js` for UserPromptSubmit, PostToolUse, and `--detached-tooling-populate`.

## Rollback

Revert the single commit: bin mapping returns to `src/cli/hook-entry.ts`, prepack script and dispatch branch removed. No adapter or settings migration involved.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Export `DETACHED_TOOLING_POPULATE_FLAG` from `src/cli/hook/session-context.ts` (receiver at import.meta.main stays intact)
- [ ] Add dispatch branch in `src/cli/hook-entry.ts` before `parseCliArgs`: static import of flag + `runDetachedToolingPopulate`, argv mapped identically to the session-context receiver
- [ ] Build-time version constant in `src/effects/evidence/post-bash-importer.ts` checked before the existing path-walk; injected via `--define` in the prepack build; bundled path never returns "0.0.0"
- [ ] `package.json`: add `prepack` bundle script (`bun build src/cli/hook-entry.ts --target=bun --outfile dist/hook-entry.js` + define + shebang), point bin `repo-harness-hook` at `dist/hook-entry.js`, include `dist/hook-entry.js` in `files`; add `dist/` to `.gitignore`
- [ ] Update `tests/bootstrap-files.test.ts` bin-target expectation
- [ ] Regression test for the hook-entry dispatch branch (red-green: fails on pre-change usage-error path, passes after)
- [ ] Verification bundle: shebang present, `runDetachedToolingPopulate` present in bundle, UserPromptSubmit + PostToolUse routes exit 0 via `bun dist/hook-entry.js`, telemetry record appended, injected version visible, `bash scripts/check-tarball-install-smoke.sh` passes, required checks pass
