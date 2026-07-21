# Plan: Fix acceptance-receipt recorder/validator policy-key split (review_base vs merge_back.target)

> **Program**: unblocks acceptance-receipt recording for all control-clone worktrees (Sprint C acceptance machinery)
> **Status**: Approved
> **Created**: 20260722-0538
> **Slug**: receipt-subject-target-split
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: `tests/workflow-state-lib.test.ts` and `tests/prompt-handler.test.ts` (both red-then-green) + full `bun test` + `bun run check:type` + `bun run check:hooks` + `bun run check:helpers` + `repo-harness run check-task-workflow --strict` + `contract-run preflight --json` + `repo-harness run verify-sprint --prepare-acceptance`
> **Rollback Surface**: Revert branch `codex/receipt-subject-target-split`; no data migration, no schema change, no `policy.json` key renamed or added.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md`
> **Task Review**: `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md`
> **Implementation Notes**: `tasks/notes/20260722-0538-receipt-subject-target-split.notes.md`

## Agentic Routing
- Selected route: orchestrator-dispatched bugfix (decision-complete on arrival)
- Routing reason: root cause already proven by a prior diagnosis pass; orchestrator decided the fix direction (resolve the recorder from `review_base`, fail-closed) and dispatched implementation directly.
- Due diligence:
  - P1 map: see Root Cause Evidence below and the full callsite sweep in Detailed Design.
  - P2 trace: `workflow_current_review_subject_json` -> `workflow_current_review_subject_value` -> `scripts/verify-sprint.sh:550` embeds `review_subject_sha256` into verification evidence -> `scripts/acceptance-receipt.ts:212` compares it against its own `currentSubject(root, reviewBase(root))`.
  - P3 decision rationale: both policy keys are legitimate but mean different things (`merge_back.target` = where finished work lands; `review_base` = what review/acceptance subjects diff against); the defect is the recorder reading the wrong one, not the existence of two keys.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-0538-receipt-subject-target-split.md`
- Sprint contract: `tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md`
- Sprint review: `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md`
- Implementation notes: `tasks/notes/20260722-0538-receipt-subject-target-split.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree.
- Execution isolation: this is a control-clone worktree (`/Users/kito/Projects/repo-harness-wt-receipt-subject-target-split`, branch `codex/receipt-subject-target-split`, forked from fresh `origin/main`), isolated from the primary checkout.

## Approach
### Strategy
Fix the one wrong-key callsite that actually causes the reported failure (`assets/hooks/lib/workflow-state.sh`'s `workflow_current_review_subject_json`), sweep every other `workflow_target_branch`/`merge_back.target`/`review-subject --target` callsite for the same shape, fix the one sibling that shares it (`src/cli/hook/prompt-handler.ts`'s review-subject advisory hint), and leave every genuine merge-back-mechanics callsite untouched. No compatibility fallback, no dual-read, no alias key.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Fix the recorder to read `review_base` (fail-closed) | Matches the validator exactly; single source of truth for "what ref does acceptance diff against" | None identified | **Chosen** |
| Make the validator read `merge_back.target` instead | Also unifies the two sides | Wrong semantics: acceptance must diff against the review base (e.g. `origin/main`), not the eventual merge destination; would silently misreport the implementation surface whenever a worktree branches from a fresher ref than its own merge target | Rejected |
| Add a compatibility key that reads either | Never breaks existing callers | Explicit dual authority; violates the repo's no-compat-code principle and hides the real defect | Rejected |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `assets/hooks/lib/workflow-state.sh` | edit | `workflow_current_review_subject_json` resolves target from `.worktree_strategy.review_base` via `workflow_policy_get`, fail-closed (no output) when unset/empty; no more call to `workflow_target_branch()` |
| `.ai/hooks/lib/workflow-state.sh` | generated | `bun run sync:hooks` projection of the above |
| `src/cli/hook/prompt-handler.ts` | edit | `currentTargetBranch` renamed `currentReviewBaseRef`, resolves `.worktree_strategy.review_base` fail-closed (throws; sole caller already wraps in try/catch); `emitReviewHints`'s `[AcceptanceSubject]` hint now binds to the same ref the real acceptance-receipt validator will check |
| `tests/workflow-state-lib.test.ts` | edit | new regression test: control-clone fixture (local `main` one commit behind `origin/main`), asserts recorder (`workflow_current_review_subject_value`) equals validator (`review-subject --target origin/main`); red pre-fix, green post-fix |
| `tests/prompt-handler.test.ts` | edit | sibling regression test for the `prompt-handler.ts` hint, same divergent-ref shape; red pre-fix, green post-fix |

### Root Cause Evidence (bugfix profile)
- root_cause: `assets/hooks/lib/workflow-state.sh:1317` (`.ai/hooks/lib/workflow-state.sh:1317` generated twin) `workflow_current_review_subject_json` resolved its diff target via `workflow_target_branch()` (`:438`, reads `.worktree_strategy.merge_back.target`) instead of `.worktree_strategy.review_base` -- the key `scripts/acceptance-receipt.ts:178` `reviewBase()` diffs against. `scripts/verify-sprint.sh:550` embeds the recorder's (wrong-key) subject into verification evidence as `review_subject_sha256`; `scripts/acceptance-receipt.ts:212` then compares it against its own (`review_base`-scoped) recomputation and fails "verification evidence is stale for the current subject" on any mismatch.
- repro: `repo-harness-hook review-subject --target main --format json` vs `--target origin/main --format json` return different `review_subject_sha256` whenever local `main` lags `origin/main` by even one commit -- the standard control-clone worktree pattern (task branch cut from fresh `origin/main`, local `main` in the same clone left behind).
- regression_guard: `tests/workflow-state-lib.test.ts` ("recorder path resolves the review target from worktree_strategy.review_base, matching the acceptance-receipt validator, even when local main lags origin/main")
- pre_fix_failure_artifact: `.ai/harness/runs/receipt-subject-target-split-pre-fix.log`

### Callsite Sweep (grep `workflow_target_branch`, `merge_back.target`, `review-subject --target`)
| Callsite | Resolves | Disposition |
|---|---|---|
| `workflow-state.sh` `workflow_current_review_subject_json` (recorder) | was `merge_back.target` | **Fixed** -> `review_base`, fail-closed |
| `src/cli/hook/prompt-handler.ts` `emitReviewHints` `[AcceptanceSubject]` hint | was `merge_back.target` via `currentTargetBranch` | **Fixed** -> `review_base` via `currentReviewBaseRef`, fail-closed (throws, caught by existing advisory try/catch) |
| `workflow-state.sh` `workflow_cleanup_candidate` (:540) | `merge_back.target` | Kept -- decides whether a worktree branch is merged into the merge destination, for cleanup |
| `workflow-state.sh` `workflow_next_action` (:629, :639) | `merge_back.target` | Kept -- "finish"/"cleanup" guidance compares current branch to the merge destination |
| `scripts/refresh-current-status.sh` `target_branch()` (:70-82, used :360) | `merge_back.target` | Kept -- pure status-dashboard display of branch vs. merge destination |
| `scripts/archive-workflow.sh` `predict_archive_manifest` (:190-221) | `merge_back.target` | Kept -- checks out the merge destination in a scratch clone to predict post-merge archive file hashes; never computes a review subject |
| `scripts/check-architecture-sync.sh` `target_branch` (:19,:204, used :158-159) | `merge_back.target` | Kept -- architecture-drift gate diffs against the merge destination for a different purpose (doc staleness), not an acceptance/review subject |
| `scripts/ship-worktrees.sh` (:691), `scripts/contract-worktree.sh` (several) | `merge_back.target` | Kept -- genuine merge-back mechanics (shipping/finishing a worktree) |
| `src/cli/hook/session-context.ts` `workflowTargetBranch` (used :829, "Target branch snapshot") | `merge_back.target` | Kept -- informational display of the merge destination's `tasks/current.md`, not a subject computation |
| `src/effects/state/resolve-effective-state.ts` (:349-358) | `review_base` first, falls back to `merge_back.target` then `base_branch` then `main` | **Already correct** -- prioritizes `review_base`; no change |
| `scripts/merge-gate.ts` | neither -- `--base <ref>` is an explicit CLI argument from the caller; only reads `merge_gate.enabled` from the policy at that base SHA | **Not affected** -- no recorder/validator split exists here; unchanged |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fail-closed recorder silently produces no subject when `review_base` is missing on an older/adopted repo's policy.json | Low | Medium | `scripts/lib/project-init-lib.sh`/`src/core/adoption/standard-plan.ts` scaffolds already default `review_base`; verified present in this repo's own `.ai/harness/policy.json` |
| `currentReviewBaseRef` throwing changes `prompt-handler.ts` behavior when `review_base` absent | Low | Low | Sole call site already wraps in try/catch (`/* advisory only */`); falls back to the existing `unknown`/`unknown` hint text, never a crash |
| Renaming `currentTargetBranch` breaks an external caller | Low | Low | Private, non-exported function; grep confirmed the definition and its one call site are the only references in the repo |

## Task Contracts
- Contract file: `tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md`
- Review file: `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md`
- Implementation notes file: `tasks/notes/20260722-0538-receipt-subject-target-split.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md --strict`
- Active plan rule: this plan is written to `.ai/harness/active-plan` and the owning worktree to `.ai/harness/active-worktree`. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: branch `codex/receipt-subject-target-split`, one PR.
- **Rollback surface**: revert the branch; no data migration, no schema, no policy key changes.
- **Verification boundary**: see header.
- **Review/acceptance boundary**: `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: none -- one bash function, one small TS helper rename/refactor, both covered by new red-then-green tests; no gate semantics changed.
- **Why not checklist row**: independent verification boundary (own red-then-green regression evidence), own rollback surface, and a completed root-cause diagnosis distinct from any other in-flight package.

## Evidence Contract

- **State/progress path**: this plan's Task Breakdown; `tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md`; `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md`; `tasks/notes/20260722-0538-receipt-subject-target-split.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/receipt-subject-target-split-pre-fix.log`, full `bun test` output
- **Evaluator rubric**: `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md` must record a passing Waza `/check`-style recommendation
- **Stop condition**: all task breakdown items complete, sprint verification passes, review recommends pass
- **Rollback surface**: revert branch `codex/receipt-subject-target-split`; no data migration, no schema.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1 verify the reported root cause directly (re-read `workflow-state.sh:1322`, `acceptance-receipt.ts:178/212`) before changing anything
- [x] T2 sweep every `workflow_target_branch`/`merge_back.target`/`review-subject --target` callsite in `.ai/hooks/`, `assets/hooks/`, `scripts/`, `assets/templates/helpers/`, `src/`; classify each as recorder-fix vs. genuine-merge-back-keep
- [x] T3 add the regression guard to `tests/workflow-state-lib.test.ts` (control-clone fixture, local `main` behind `origin/main`); capture pre-fix red evidence to `.ai/harness/runs/receipt-subject-target-split-pre-fix.log`
- [x] T4 fix `assets/hooks/lib/workflow-state.sh`'s `workflow_current_review_subject_json` to resolve `review_base`, fail-closed; regenerate `.ai/hooks/` via `bun run sync:hooks`
- [x] T5 fix the sibling `src/cli/hook/prompt-handler.ts` `[AcceptanceSubject]` hint (rename `currentTargetBranch` -> `currentReviewBaseRef`, resolve `review_base` fail-closed); add its own red-then-green regression test in `tests/prompt-handler.test.ts`
- [x] T6 full verification: named suites green, full `bun test` green, `check:type`, `check:hooks`, `check:helpers`, `check-task-workflow --strict`, `contract-run preflight --json`, `verify-sprint --prepare-acceptance`
- [x] T7 lifecycle docs (this plan, contract, review, notes) and local commit
