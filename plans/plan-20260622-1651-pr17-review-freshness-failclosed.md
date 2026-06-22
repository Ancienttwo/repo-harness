# Plan: PR17 Review Freshness Fail-Closed

> **Status**: Executing
> **Created**: 20260622-1651
> **Slug**: pr17-review-freshness-failclosed
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md`
> **Task Review**: `tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md`
> **Implementation Notes**: `tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260622-1651-pr17-review-freshness-failclosed.md`
- Sprint contract: `tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md`
- Sprint review: `tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md`
- Implementation notes: `tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260622-1651-pr17-review-freshness-failclosed.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260622-1651-pr17-review-freshness-failclosed.md`.

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
- Contract file: `tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md`
- Review file: `tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md`
- Implementation notes file: `tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260622-1651-pr17-review-freshness-failclosed.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md`, `tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md`, and `tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260622-1651-pr17-review-freshness-failclosed.md`; after execution revert branch `codex/pr17-review-freshness-failclosed` or the generated task artifacts

## Captured Planning Output

# PR #17 Review Freshness Fail-Closed

External review (GPT) of PR #17 (`codex/single-source-review-main` @ 142b77a) found 0 P0 and 4 P1 blockers, all fail-open paths in the review-freshness gate. All 4 verified against real code. One unifying principle: **fail-closed whenever implementation content cannot be fully observed, or is not bound to the target/current state; only a genuinely missing rubric version stays warn-only.**

## Scope

In scope: 4 P1 fixes + 1 P2 (coupled) + dead-code removal + regression tests + projection sync.
Out of scope: projection design, release/tarball, version surface (review confirmed passing); minimal-change fingerprint (independent subsystem); review template body (`pending` correctly blocks now, no edit needed).

## Design

### P1-1 — v1 missing/pending fingerprint fail-closed
`assets/hooks/lib/workflow-state.sh::workflow_review_freshness_status` (L1370). Before the empty/pending/unknown branch, read `workflow_review_rubric_version`. If rubric is modern (`^[0-9]+$` and >=1) -> return new blocking state `missing`; if rubric absent/non-numeric (genuine legacy) -> keep `legacy_missing` (warn-only). Done gate `*)` already blocks `missing`. `assets/hooks/stop-orchestrator.sh` L393: add `missing` to the `stale|malformed|unknown` nudge case (non-blocking).

### P1-2 — bind base ref to target branch
`src/cli/hook/diff-fingerprint.ts`: `runReviewFingerprintCli` (L344) stop defaulting `--base` to `HEAD` (pass undefined when absent); `buildImplementationDiffFingerprint` (L230) return `status:'unknown'` when baseRef empty/undefined instead of HEAD fallback. `assets/hooks/lib/workflow-state.sh::workflow_current_review_fingerprint_json` (L1356): resolve `workflow_target_branch` and pass `--base "$target"`. Effect: `base_rev` tracks target tip; `target...HEAD` captures the real feature diff.

### P1-3 — hash collisions + git-error fail-closed
`src/cli/hook/diff-fingerprint.ts`: `gitText` return `{ok,text}`; track a `degraded` flag in `buildImplementationDiffFingerprint`. `hashGitPatch`: distinguish command-success-empty (`hashText('')`) from command-failure/maxBuffer-overflow (degraded) — drop the empty->hashUnknown conflation. Untracked content: remove the `>1MiB -> {large,size}` metadata-only branch; hash full content via sha256; size above a high ceiling (e.g. 50MiB) or read failure -> degraded (fail-closed, not skip). Path parsing: switch to `git status --porcelain=v1 -z` and `git diff --name-status -z --find-renames`, parse NUL/Buffer to preserve unicode/quoted paths. Any degraded -> `status:'unknown'`.

### P1-4 — external acceptance self-binds fingerprint
`assets/hooks/lib/workflow-state.sh::workflow_external_acceptance_status` (L1453). After the acceptance/reviewer/source/p1 checks, gated on section rubric version >=1: require the section's own `Reviewed Diff Fingerprint` == current fingerprint (well-formed sha256) and `Reviewed Scope` == `branch+staged+unstaged+untracked`; else `fail`. Legacy (no section rubric) -> skip (lenient, consistent with P1-1). Manual Override still bypasses first. Done runs freshness (top==current) before external, so the F1/F2 attack (top=F2, section=F1) blocks.

### P2 — operational-only commit no longer churns fingerprint
`src/cli/hook/diff-fingerprint.ts`: with P1-2 in place, `branch_diff_hash` (target...HEAD over implementation paths) carries committed implementation content, so drop raw `head_rev` from the hashed fingerprint payload. Operational-only commits (excluded paths) no longer change the fingerprint.

### Dead code
`assets/hooks/lib/minimal-change.sh::review_diff_fingerprint_json` (L79) has no caller repo-wide -> remove.

## Verification
`bun test` (review-freshness, hook-runtime, review-rubric); `bun run check:hooks` (projection drift 0); `bun run check:release`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-workflow.sh --strict`. Manual: reproduce the 4 attacks, confirm Done exit 2 each.

## Projection
After editing `assets/hooks/*`, run `bun run sync:hooks` to regenerate `.ai/hooks/*` mirror + `assets/hooks/projection.json` marker; commit them. `src/cli/hook/diff-fingerprint.ts` is not projected.

## Rollback
All changes are gate-tightening on an unmerged PR branch. No migration, data, or external state. Revert via git; worst case the gate is too strict and a specific classification is loosened. Package 0.8.0 unpublished, PR unmerged -> zero production impact.

## Task Breakdown
- [ ] P1-3: diff-fingerprint.ts — gitText ok-flag, hashGitPatch empty-vs-error, untracked full sha256 + ceiling fail-closed, `-z` NUL path parsing, degraded -> status unknown
- [ ] P1-2: diff-fingerprint.ts base-ref fail-closed (no HEAD fallback) + workflow-state.sh pass `--base "$(workflow_target_branch)"`
- [ ] P2: diff-fingerprint.ts drop head_rev from hashed fingerprint payload
- [ ] P1-1: workflow-state.sh rubric-aware `missing` state + stop-orchestrator.sh nudge case
- [ ] P1-4: workflow-state.sh external acceptance self-binds fingerprint/scope (rubric-gated)
- [ ] Dead code: remove review_diff_fingerprint_json from minimal-change.sh
- [ ] Tests: review-freshness.test.ts boundary regressions (target moved, unicode untracked, >1MiB untracked, git-error -> unknown)
- [ ] Tests: hook-runtime.test.ts external fixture adds rubric/fingerprint/scope + Done e2e (freshness blocking states, external F1/F2 binding)
- [ ] Projection: bun run sync:hooks; commit .ai/hooks mirror + projection.json marker
- [ ] Verify: bun test, bun run check:hooks, bun run check:release, repo required checks

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] P1-3: diff-fingerprint.ts — gitText ok-flag, hashGitPatch empty-vs-error, untracked full sha256 + ceiling fail-closed, `-z` NUL path parsing, degraded -> status unknown
- [ ] P1-2: diff-fingerprint.ts base-ref fail-closed (no HEAD fallback) + workflow-state.sh pass `--base "$(workflow_target_branch)"`
- [ ] P2: diff-fingerprint.ts drop head_rev from hashed fingerprint payload
- [ ] P1-1: workflow-state.sh rubric-aware `missing` state + stop-orchestrator.sh nudge case
- [ ] P1-4: workflow-state.sh external acceptance self-binds fingerprint/scope (rubric-gated)
- [ ] Dead code: remove review_diff_fingerprint_json from minimal-change.sh
- [ ] Tests: review-freshness.test.ts boundary regressions (target moved, unicode untracked, >1MiB untracked, git-error -> unknown)
- [ ] Tests: hook-runtime.test.ts external fixture adds rubric/fingerprint/scope + Done e2e (freshness blocking states, external F1/F2 binding)
- [ ] Projection: bun run sync:hooks; commit .ai/hooks mirror + projection.json marker
- [ ] Verify: bun test, bun run check:hooks, bun run check:release, repo required checks
