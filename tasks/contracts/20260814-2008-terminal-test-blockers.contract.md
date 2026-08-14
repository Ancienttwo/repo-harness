# Task Contract: terminal-test-blockers

> **Status**: Fulfilled
> **Plan**: plans/plan-20260814-2008-terminal-test-blockers.md
> **Task Profile**: bugfix
> **Owner**: ancienttwo
> **Capability ID**: verification-evals-checks
> **Last Updated**: 2026-08-14 21:10
> **Review File**: `tasks/reviews/20260814-2008-terminal-test-blockers.review.md`
> **Notes File**: `tasks/notes/20260814-2008-terminal-test-blockers.notes.md`

## Why

The hook-effect work package cannot obtain a terminal full-suite receipt because one process guardrail file exits 137 after passing its visible assertions and one immutable benchmark install test times out with a live child. These must be diagnosed independently rather than waived as hook-effect failures.

## Goal

Restore deterministic, bounded terminal completion for both tests while preserving descendant cleanup, immutable runtime artifact reuse, and fail-closed behavior.

## Scope

- In scope: only the two failing paths and their direct process/benchmark owners.
- Out of scope: hook-effect production code, architecture projection, timeout inflation, skipped tests, release, and compatibility fallbacks.
- Taste constraints: root cause before edits; red-green is mandatory; do not weaken process-group or source-authority invariants.

## Stop Conditions

- Stop if a fix requires a path outside Allowed Paths.
- Stop after three disproved hypotheses.
- Stop if the repro cannot distinguish an implementation defect from the Codex sandbox or external registry state.

## Falsifier

The direction is falsified if either failure disappears on the unchanged source under a complete equivalent runtime, or if a candidate fix cannot make a new regression guard fail when reverted.

## Root Cause Evidence

### closeout-runner-guardrails

- root_cause: `tests/unit/closeout-runner-guardrails.test.ts:246` accepts an empty `ps` result as `Number('') === 0` at line 257, so the finally cleanup at line 277 calls `process.kill(0, SIGKILL)` and kills Bun's own process group with exit 137.
- repro: `env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test tests/unit/closeout-runner-guardrails.test.ts`
- regression_guard: `tests/unit/closeout-runner-guardrails.test.ts`
- pre_fix_failure_artifact: `.ai/harness/runs/terminal-test-blockers/closeout-runner-pre-fix.log`

### benchmark-artifact-reuse

- root_cause: `tests/harness-benchmark-matrix.test.ts:324-331` invokes `bun add -g` on a tarball whose `package/package.json` still declares runtime dependencies but whose payload contains no dependency closure; `isolatedHarnessEnvironment()` isolates install destinations only, so Bun must resolve those dependencies through the registry and the synchronous child fails or remains live when that external authority is unavailable.
- repro: `NPM_CONFIG_CACHE=/private/tmp/repo-harness-terminal-test-blockers-pre-fix-npm-cache npm_config_cache=/private/tmp/repo-harness-terminal-test-blockers-pre-fix-npm-cache NPM_CONFIG_REGISTRY=http://127.0.0.1:9 npm_config_registry=http://127.0.0.1:9 BUN_CONFIG_REGISTRY=http://127.0.0.1:9 env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test tests/harness-benchmark-matrix.test.ts --test-name-pattern 'reuses one packed artifact'`
- regression_guard: `tests/harness-benchmark-matrix.test.ts`
- pre_fix_failure_artifact: `.ai/harness/runs/terminal-test-blockers/benchmark-reuse-pre-fix.log`

## Workflow Inventory

- Source plan: `plans/plan-20260814-2008-terminal-test-blockers.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review: `tasks/reviews/20260814-2008-terminal-test-blockers.review.md`
- Notes: `tasks/notes/20260814-2008-terminal-test-blockers.notes.md`
- Runtime evidence: `.ai/harness/runs/terminal-test-blockers/`

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260814-2008-terminal-test-blockers.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260814-2008-terminal-test-blockers.contract.md
  - tasks/notes/20260814-2008-terminal-test-blockers.notes.md
  - tasks/reviews/20260814-2008-terminal-test-blockers.review.md
  - .ai/harness/runs/terminal-test-blockers/
  - tests/unit/closeout-runner-guardrails.test.ts
  - src/effects/process-runner.ts
  - src/effects/process-supervisor.ts
  - src/effects/process-group-launcher.ts
  - tests/harness-benchmark-matrix.test.ts
  - scripts/run-harness-profile-benchmark.ts
```

## Exit Criteria

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260814-2008-terminal-test-blockers.md
    - tasks/contracts/20260814-2008-terminal-test-blockers.contract.md
    - tasks/reviews/20260814-2008-terminal-test-blockers.review.md
  artifacts_exist:
    - .ai/harness/runs/terminal-test-blockers/closeout-runner-pre-fix.log
    - .ai/harness/runs/terminal-test-blockers/benchmark-reuse-pre-fix.log
  tests_pass:
    - path: tests/unit/closeout-runner-guardrails.test.ts
    - path: tests/harness-benchmark-matrix.test.ts
  commands_succeed:
    - env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test tests/unit/closeout-runner-guardrails.test.ts
    - env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test tests/harness-benchmark-matrix.test.ts
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test
    - git diff --check
  manual_checks:
    - "No timeout was increased and no assertion was skipped"
    - "No descendant or expensive-run token survives either focused test"
    - "The packed artifact and source authority remain byte-stable across two installs"
```

## Rollback Point

- Base: `b2fd1379a5eca9e18eee011482f59fb9cfd27954`
