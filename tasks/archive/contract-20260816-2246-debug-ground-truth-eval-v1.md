> **Archived**: 2026-08-16 22:46
> **Related Plan**: plans/archive/plan-20260816-1753-debug-ground-truth-eval-v1.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260816-2246

# Task Contract: debug-ground-truth-eval-v1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260816-1753-debug-ground-truth-eval-v1.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: verification-evals-checks
> **Last Updated**: 2026-08-16 17:53
> **Review File**: `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md`
> **Notes File**: `tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The reactive debug path has a strong prose evidence contract but no structurally blind regression benchmark. Without this slice, a diagnostic agent can appear successful because the prompt discloses the root cause, a mutable test is treated as truth, or infrastructure failure is collapsed into a diagnostic failure. This package adds an executable measurement boundary before any `/hunt` behavior is changed.

## Goal

Deliver a declared `debug-ground-truth-eval-v1` profile with four trusted TypeScript/Bun fixtures, host-owned hidden truth omitted from the trusted stub's assigned inputs/workspace, fresh deterministic replay, typed grading states, provenance hashes, and tests proving provider-workspace mutations cannot influence grading. Preserve the existing canonical 3x9 harness benchmark byte-for-byte. V1 does not claim process isolation for untrusted provider code.

## Scope

- In scope:
  - New standalone debug eval runner, public scenarios, hidden truth, four fixtures, deterministic stub/provider seam, fresh grader copies, report provenance, package entrypoint, tests, evaluator routing documentation, research record, and architecture/workflow sync.
- Out of scope:
  - modifying Waza `/hunt`, changing `root-cause-prover`, reusing the current skill runner's sandbox-bypassing provider path, hostile-code execution, gVisor/Docker adoption, live production debugging, patch generation, and changing the current profile benchmark report.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the trusted stub receives a hidden-truth byte/path/command through its assigned callback arguments or workspace, if changing stub-owned source/tests changes the fresh replay outcome, or if adding the profile requires modifying the canonical 3x9 scenario/report authority. The cheapest proof is a focused test that records the complete prompt/workspace projection and attempts path and symlink escape. Arbitrary injected callbacks share the host process and are explicitly not an untrusted-provider security boundary.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260816-1753-debug-ground-truth-eval-v1.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md`
- Notes file: `tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"debug-ground-truth-eval-deterministic","kind":"deterministic_test","paths":["*"]},{"id":"debug-ground-truth-eval-runtime-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - package.json
  - agents/fleet/harness-evaluator.md
  - .codex/agents/harness-evaluator.toml
  - docs/architecture/modules/verification/evals-checks.md
  - docs/researches/20260816-defending-code-debug-eval.md
  - evals/debug-hunt/
  - evals/fixtures/debug-hunt/
  - scripts/run-debug-ground-truth-eval.ts
  - tests/debug-ground-truth-eval.test.ts
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md
  - tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md
  - tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/run-debug-ground-truth-eval.ts
    - evals/debug-hunt/scenarios.json
    - evals/debug-hunt/ground-truth.json
    - tests/debug-ground-truth-eval.test.ts
    - docs/researches/20260816-defending-code-debug-eval.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md
  tests_pass:
    - path: tests/debug-ground-truth-eval.test.ts
  commands_succeed:
    - bun test tests/debug-ground-truth-eval.test.ts
    - bun run benchmark:debug -- --help
    - bun run benchmark:debug -- --provider stub
    - env -u CODEX_SESSION_ID -u CODEX_THREAD_ID -u CODEX_CI -u CODEX_PERMISSION_PROFILE -u CODEX_SANDBOX -u CODEX_SANDBOX_NETWORK_DISABLED -u REPO_HARNESS_SOURCE_ROOT -u REPO_HARNESS_NODE_BIN -u HOOK_HOST -u HOOK_RUN_ID -u CODEX_RUN_ID -u CLAUDE_SESSION_ID -u REPO_HARNESS_RUN_ID bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: hidden truth is host-only; all four deterministic cases exercise localization or abstention and fresh replay.
- Edge cases: path/symlink escape, malformed submission, provider error, no submission, grader error, provider-owned test mutation, and false-positive red herring.
- Regression risks: v1 proves prompt/workspace projection separation and fresh replay with a trusted in-process seam; it does not isolate arbitrary callback code. Executing hostile third-party code or a live provider remains explicitly unsupported.

## Rollback Point

- Commit / checkpoint:
- Revert strategy: revert the isolated `codex/debug-ground-truth-eval-v1` diff; no existing benchmark schema/report or debug runtime is migrated.
