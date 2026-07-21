# Task Contract: receipt-subject-target-split

> **Status**: Active
> **Plan**: plans/plan-20260722-0538-receipt-subject-target-split.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: runtime-harness-hook-adapters
> **Last Updated**: 2026-07-22 05:38
> **Review File**: `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md`
> **Notes File**: `tasks/notes/20260722-0538-receipt-subject-target-split.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The acceptance-evidence recorder and the acceptance-receipt validator resolved the review subject against DIFFERENT `.ai/harness/policy.json` keys. `scripts/verify-sprint.sh` embeds `review_subject_sha256` into verification evidence by calling `workflow_current_review_subject_value` (`assets/hooks/lib/workflow-state.sh`), which resolved its diff target via `workflow_target_branch()` (`.worktree_strategy.merge_back.target`). `scripts/acceptance-receipt.ts`'s validator always recomputes the same subject via `reviewBase()` (`.worktree_strategy.review_base`). Whenever local `main` lagged `origin/main` -- the standard control-clone worktree pattern this repo's own workflow uses -- the two refs diverged, so the two sides silently diffed against different content and every receipt failed "verification evidence is stale for the current subject", even on genuinely correct work. Left unfixed, every control-clone worktree whose local `main` is not kept fast-forwarded to `origin/main` cannot record a passing AcceptanceReceipt.

## Goal

1. Fix the recorder (`assets/hooks/lib/workflow-state.sh`'s `workflow_current_review_subject_json`) to resolve its diff target from `.worktree_strategy.review_base`, fail-closed (no output, no fallback to `base_branch`/`main`) when unset or empty -- mirroring `reviewBase()`'s own fail-closed behavior. Regenerate `.ai/hooks/lib/workflow-state.sh` via `bun run sync:hooks`.
2. Sweep every other `workflow_target_branch`/`.worktree_strategy.merge_back.target`/`review-subject --target` callsite across `.ai/hooks/`, `assets/hooks/`, `scripts/`, `assets/templates/helpers/`, and `src/` for the same wrong-key shape. Fix the one sibling that shares it (`src/cli/hook/prompt-handler.ts`'s `[AcceptanceSubject]` advisory hint, via `currentTargetBranch` -> renamed `currentReviewBaseRef`, resolving `review_base` fail-closed). Leave every genuine merge-back-mechanics callsite (`workflow_cleanup_candidate`, `workflow_next_action`, `refresh-current-status.sh`, `archive-workflow.sh`'s `predict_archive_manifest`, `check-architecture-sync.sh`, `ship-worktrees.sh`, `contract-worktree.sh`, `session-context.ts`'s "Target branch snapshot" display) untouched -- they genuinely need the merge destination, not the review base. Confirm `src/effects/state/resolve-effective-state.ts` already resolves `review_base` first (no change needed) and that `scripts/merge-gate.ts` takes `--base` as an explicit CLI argument with no policy-key resolution of its own (no change needed, no split exists).
3. No compatibility fallback, no dual-read, no alias key.

## Scope

- In scope: `assets/hooks/lib/workflow-state.sh` (+ `.ai/hooks/` generated projection via `bun run sync:hooks`), `src/cli/hook/prompt-handler.ts`, `tests/workflow-state-lib.test.ts`, `tests/prompt-handler.test.ts`, this plan/contract/review/notes.
- Out of scope: any change to `scripts/acceptance-receipt.ts` (the validator is already correct), `scripts/verify-sprint.sh` (calls the now-fixed recorder function unchanged), `scripts/merge-gate.ts` (no split exists), `src/effects/state/resolve-effective-state.ts` (already resolves `review_base` first), any genuine merge-back-mechanics callsite named in the sweep, any `.ai/harness/policy.json` key rename/addition, pushing, opening/merging a PR, benchmark runs, `--force` of any kind.
- Taste constraints: match surrounding bash/TS style; keep the fail-closed shape identical to `reviewBase()`'s (no default, no silent fallback).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if any PreToolUse guard blocks an edit -- do not retry more than the documented fallback; return BLOCKED with the guard JSON if the Bash read-modify-write fallback also fails.

## Falsifier

If the recorder's subject (via `workflow_current_review_subject_value`) still differs from the validator's own recomputation (`buildReviewSubject(root, { targetRef: reviewBase(root) })`) after the fix, in a fixture where local `main` lags `origin/main`, the fix is wrong. Cheapest proof point: `tests/workflow-state-lib.test.ts`'s new regression test.

## Root Cause Evidence

Required when Task Profile is `bugfix`.

- root_cause: `assets/hooks/lib/workflow-state.sh:1317` (`.ai/hooks/lib/workflow-state.sh:1317` generated twin) `workflow_current_review_subject_json` resolved its diff target via `workflow_target_branch()` (`:438`, reads `.worktree_strategy.merge_back.target`) instead of `.worktree_strategy.review_base` -- the key `scripts/acceptance-receipt.ts:178` `reviewBase()` diffs against. `scripts/verify-sprint.sh:550` embeds the recorder's (wrong-key) subject into verification evidence as `review_subject_sha256`; `scripts/acceptance-receipt.ts:212` compares it against its own (`review_base`-scoped) recomputation and fails "verification evidence is stale for the current subject" on any mismatch.
- repro: `repo-harness-hook review-subject --target main --format json` vs `--target origin/main --format json` return different `review_subject_sha256` whenever local `main` lags `origin/main` by even one commit -- the standard control-clone worktree pattern (task branch cut from fresh `origin/main`, local `main` in the same clone left behind).
- regression_guard: tests/workflow-state-lib.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/receipt-subject-target-split-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260722-0538-receipt-subject-target-split.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-0538-receipt-subject-target-split.review.md`
- Notes file: `tasks/notes/20260722-0538-receipt-subject-target-split.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/
  - assets/hooks/
  - .ai/hooks/
  - src/cli/hook/
  - tests/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/hooks/lib/workflow-state.sh
    - .ai/hooks/lib/workflow-state.sh
    - src/cli/hook/prompt-handler.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/receipt-subject-target-split-pre-fix.log
    - tasks/notes/20260722-0538-receipt-subject-target-split.notes.md
  tests_pass:
    - path: tests/workflow-state-lib.test.ts
    - path: tests/prompt-handler.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:helpers
    - repo-harness run check-task-workflow --strict
```

## Acceptance Notes (Human Review)

- Functional behavior: recorder and validator now bind to the same ref (`review_base`); an AcceptanceReceipt no longer fails "stale" purely because local `main` lagged `origin/main` in a control-clone worktree.
- Edge cases: `review_base` missing/empty (fails closed, no silent default); `prompt-handler.ts`'s hint when `review_base` is absent (falls back to the existing `unknown`/`unknown` advisory text via its pre-existing try/catch, never crashes).
- Regression risks: any other callsite reading `merge_back.target` for genuine merge-back mechanics must stay unchanged -- verified by the full callsite sweep recorded in the plan and this contract's Why/Goal sections.

## Rollback Point

- Commit / checkpoint: branch `codex/receipt-subject-target-split` forked from `61b5ec5960bd5bd763a0c02ebadbe37cba5a2c5f` (fresh `origin/main`).
- Revert strategy: revert/delete the branch; no data migration, no schema, no policy key changes.
