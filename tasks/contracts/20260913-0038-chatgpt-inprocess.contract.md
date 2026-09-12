# Task Contract: chatgpt-inprocess

> **Status**: Active
> **Plan**: plans/plan-20260913-0038-chatgpt-inprocess.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-13 00:38
> **Review File**: `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md`
> **Notes File**: `tasks/notes/20260913-0038-chatgpt-inprocess.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`tests/cli/chatgpt-browser.test.ts` spends roughly 15 seconds of its runtime on Bun cold
starts: 77 call sites each spawn a fresh `bun src/cli/index.ts`, and every one of those
re-parses the entire CLI module tree. If this ships wrong the failure is silent rather
than slow: an in-process runner that returns before the command finished would let
assertions read stale output, and this file is the only coverage of the chatgpt browser
command surface, secret scanning and Oracle provider behavior.

## Goal

`runChatgpt()` executes the CLI in the test process through `runCli`, preserving the
`{ status, stdout, stderr }` shape, the per-call `cwd` and `env` semantics and the exit
codes. Every test title, count and assertion in the file is unchanged, proven by a
before/after JUnit `testcase name` multiset comparison, and the measured per-file elapsed
time drops.

## Scope

- In scope:
  - `tests/helpers/cli-in-process.ts`: new `runCliInProcess` runner.
  - `tests/cli/chatgpt-browser.test.ts`: `runChatgpt`, `withRepo`, `bindChromeProfile` and
    the call sites that must await them.
- Out of scope:
  - `src/`, `scripts/`, `.github/`.
  - Every assertion and test title.
  - Tests that call `runBrowserConsult`/`runBrowserFollowup` or the CDP helpers directly:
    they already run in-process.
- Taste constraints: the completion barrier belongs in the helper with its reason stated
  at that boundary, not spread across call sites.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260913-0038-chatgpt-inprocess.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md`
- Notes file: `tasks/notes/20260913-0038-chatgpt-inprocess.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"chatgpt-browser-suite","kind":"deterministic_test","paths":["tests/cli/chatgpt-browser.test.ts","tests/helpers/cli-in-process.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md
  - tasks/reviews/20260913-0038-chatgpt-inprocess.review.md
  - tasks/notes/20260913-0038-chatgpt-inprocess.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed. Populate artifact requirements only
for deliverables this task actually owns; do not create a spec, notes or report
merely to fill this template.

```yaml
exit_criteria:
  files_exist: []
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "chatgpt-browser",
      "kind": "package_test",
      "path": "tests/cli/chatgpt-browser.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The only consumer of the new in-process runner and the subject of this change.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "global-runtime-init",
      "kind": "package_test",
      "path": "tests/cli/global-runtime-init.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The other in-process runCli consumer; it shares the process the runner now patches.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The new helper's exported types must check against its call sites.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check for substantive changes.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check for substantive changes.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check for substantive changes.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-architecture-sync",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check for substantive changes.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check for substantive changes.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check; the digest is bound to the merge base.",
      "inputs": {
        "env": [
          "REPO_HARNESS_DIFF_BASE",
          "REPO_HARNESS_DIFF_MODE"
        ]
      }
    },
    {
      "id": "init-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check for substantive changes.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

Author the actual checks using [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
The empty array is not permission to omit required repository checks: retain it
only when no executable criterion applies and explain why in Acceptance Notes.
Prefer existing covering tests; creating a task-named test or adding typecheck
is not a template requirement. For each selected check declare `id`, `kind`,
`cwd`, `phase`, `cost`, `evidence_policy`, `necessity`, `inputs.env`, and its
`command` or `path`. Declare the same execution once, including checks nested
inside aggregate scripts. Use `baseline_with_delta` only with an immutable
baseline and named current delta checks; never infer it from paths or command text.

## Acceptance Notes (Human Review)

- Changed behavior/boundary, existing covering tests and remaining gap: only the test
  runtime changed. `tests/cli/chatgpt-browser.test.ts` now drives the CLI in-process
  through `runCliInProcess`; every assertion, title and count is unchanged, proven by an
  identical 55-entry JUnit `testcase name` multiset and 553 `expect()` calls before and
  after. One call site keeps a real child process because `Bun.which` resolves against the
  process's startup PATH; the reason is recorded at that call site and in the notes.
- New test case/file rationale, or why existing coverage is sufficient: no new test cases.
  The new file is a helper, and the changed file is its only consumer.
- Selected check IDs and why their coverage is sufficient; omitted coverage:
  `chatgpt-browser` is the changed file; `global-runtime-init` is the other in-process
  `runCli` consumer and shares the process this runner patches; `check-type` covers the new
  helper's signatures; the remaining ids are the required repository-integrity checks.
- Full/expensive check justification and expected cost, if applicable: none. The change is
  confined to one test file and one new test helper, with no product source touched.
- Execution/baseline references, subject, current delta and disposition: baseline
  `tests/cli/chatgpt-browser.test.ts` at 58.36 s wall / 40.27 s CPU on `origin/main`;
  current 39.54 s wall / 9.23 s CPU. Both runs shared the machine with a parallel test
  load, so the wall figures are noisy and the CPU figure carries the result.
- Residual risks and incomplete observations: the completion barrier assumes each
  `chatgpt` action's terminal statement writes to stdout or reaches its error exit. An
  action that keeps working after its final log would let a test read early; the assumption
  is stated at the helper boundary, and a command that produces neither signal fails with a
  named error instead of returning a wrong result.

## Rollback Point

- Commit / checkpoint: `origin/main` at 95eddaa9.
- Revert strategy: revert this commit; it touches only the two test paths.
