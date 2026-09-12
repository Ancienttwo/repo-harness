# Task Contract: auto-campaign-template

> **Status**: Active
> **Plan**: plans/plan-20260913-0144-auto-campaign-template.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-13 01:44
> **Review File**: `tasks/reviews/20260913-0144-auto-campaign-template.review.md`
> **Notes File**: `tasks/notes/20260913-0144-auto-campaign-template.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`tests/auto-campaign-skill.test.ts` rebuilds a git repository plus a full
`scripts/sync-codex-installed-copies.sh` install (three Bun child processes and two
package rsyncs) once per test. That fixture cost dominates the file's runtime and is
paid three times for two distinct install profiles. If it stays, every CI run keeps
buying the same install twice.

## Goal

Route `fixture()` in `tests/auto-campaign-skill.test.ts` through the existing
`fixtureTemplate` helper so the expensive install is built once per install profile and
restored per test, with identical test names, assertions and isolation.

## Scope

- In scope: `tests/auto-campaign-skill.test.ts` only.
- Out of scope: `src/`, `scripts/`, `.github/`, `tests/helpers/repo-fixture.ts`, any test assertion or test title, and the per-call `draft()` child process that is the behaviour under test.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the snapshot did not carry the complete fixture state, a later test would observe
leftover or missing install state: the cheapest proof point is the third test, which
asserts the `minimal` profile installs no `auto-campaign` directory, together with the
second test's assertion that no authorization is stored after the first test minted one.
Both pass, so in-place restore carries the full state.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260913-0144-auto-campaign-template.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260913-0144-auto-campaign-template.review.md`
- Notes file: `tasks/notes/20260913-0144-auto-campaign-template.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"auto-campaign-skill","kind":"deterministic_test","paths":["tests/auto-campaign-skill.test.ts"]}]}
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
  - tasks/contracts/20260913-0144-auto-campaign-template.contract.md
  - tasks/reviews/20260913-0144-auto-campaign-template.review.md
  - tasks/notes/20260913-0144-auto-campaign-template.notes.md
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
  files_exist:
    - tests/auto-campaign-skill.test.ts
  artifacts_exist:
    - tasks/notes/20260913-0144-auto-campaign-template.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "auto-campaign-skill",
      "kind": "package_test",
      "path": "tests/auto-campaign-skill.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The only changed file; proves the templated fixture keeps every assertion and the per-profile isolation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "campaign-worker",
      "kind": "package_test",
      "path": "tests/effects/campaign-worker.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing fixtureTemplate consumer, run co-resident to prove the shared template registry stays per-file correct in one process.",
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
      "necessity": "The new synchronous template call site must type-check against the helper's overloads.",
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

- Changed behavior/boundary, existing covering tests and remaining gap: test-only change in one file; the file's own three tests are the complete coverage of the fixture they build.
- New test case/file rationale, or why existing coverage is sufficient: no new test. The change must be invisible to assertions, so the existing file plus an unchanged JUnit testcase-name multiset is the correct proof.
- Selected check IDs and why their coverage is sufficient; omitted coverage: `auto-campaign-skill` isolated and co-resident with `campaign-worker`, plus the required repository-integrity checks. No product source changed, so no other suite is affected and no full-suite run is justified.
- Full/expensive check justification and expected cost, if applicable: none; no expensive criterion applies.
- Execution/baseline references, subject, current delta and disposition: paired local runs of the same worktree, `bun test --timeout 180000 tests/auto-campaign-skill.test.ts`: 77.69s before, 61.36s after (an earlier pair measured 81.86s -> 69.87s). Co-resident with `tests/effects/campaign-worker.test.ts`: 18 pass in 98.36s.
- Residual risks and incomplete observations: the snapshot copies two full package installs, so part of the saved rsync/Bun-startup cost returns as a directory copy; the win is the removed duplicate build for the `full` profile, not a linear 3x reduction.

## Rollback Point

- Commit / checkpoint: `b9628876` (origin/main at branch creation).
- Revert strategy: revert the single commit; the change is confined to one test file plus workflow artifacts.
