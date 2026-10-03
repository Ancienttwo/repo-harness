# Task Contract: delegation-template

> **Status**: Active
> **Plan**: plans/plan-20260912-2303-delegation-template.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-12 23:03
> **Review File**: `tasks/reviews/20260912-2303-delegation-template.review.md`
> **Notes File**: `tasks/notes/20260912-2303-delegation-template.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`tests/effects/collaboration-contribution-collector.test.ts` rebuilds the C4 delegation
fixture 17 times per run, and each rebuild spends a `git init`, two commits and one real
`bun src/cli/index.ts delegation capability` child process before the first assertion. If
this ships wrong the failure is silent rather than slow: this file is the only coverage of
the contribution collector's crash-and-converge matrix and of the actor/destination
binding, so a fixture that leaked state between tests would let all 35 tests pass for the
wrong reason.

## Goal

`createCollaborationDelegationFixture` is built once per distinct argument list in that
file and every later test receives a pristine materialization with the same isolation a
rebuild gives. `fixtureTemplate` gains a synchronous path and a workspace-path selector
instead of a second parallel mechanism. Every test title, count and assertion is
unchanged, proven by a before/after JUnit `testcase name` diff.

## Scope

- In scope:
  - `tests/helpers/repo-fixture.ts`: `fixtureTemplate` accepts a synchronous builder and an
    explicit `workspacePaths` selector; the snapshot store becomes index-keyed.
  - `tests/effects/collaboration-contribution-collector.test.ts`: route the delegation
    fixture through the template and dispose it in `afterAll`.
- Out of scope:
  - `src/`, `scripts/`, `.github/`.
  - Every assertion, test title and test body.
  - `tests/helpers/collaboration-delegation-fixture.ts` itself: it stays a synchronous
    builder with an unchanged signature, so `scripts/c9-collaboration-canary.ts` and the
    six sibling suites that import it keep working untouched.
- Taste constraints: one mechanism. A second consumer of the synchronous path would
  justify extracting more; one consumer justifies only relaxing what exists.

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

- Source plan: `plans/plan-20260912-2303-delegation-template.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260912-2303-delegation-template.review.md`
- Notes file: `tasks/notes/20260912-2303-delegation-template.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"affected-suites","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - tests/helpers/repo-fixture.ts
  - tests/effects/collaboration-contribution-collector.test.ts
  - plans/plan-20260912-2303-delegation-template.md
  - tasks/todos.md
  - tasks/contracts/20260912-2303-delegation-template.contract.md
  - tasks/reviews/20260912-2303-delegation-template.review.md
  - tasks/notes/20260912-2303-delegation-template.notes.md
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
    - tests/helpers/repo-fixture.ts
  artifacts_exist:
    - tasks/notes/20260912-2303-delegation-template.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "collaboration-contribution-collector",
      "kind": "package_test",
      "path": "tests/effects/collaboration-contribution-collector.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The rewired suite: its 35 tests are the behavioural contract the template must preserve.",
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
      "necessity": "Existing fixtureTemplate consumer; the template's store layout and materialize path changed underneath it.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "brc10-lifecycle",
      "kind": "package_test",
      "path": "tests/effects/brc10-lifecycle.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing fixtureTemplate consumer; the template's store layout and materialize path changed underneath it.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "campaign-authoring-resume",
      "kind": "package_test",
      "path": "tests/effects/campaign-authoring-resume.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing fixtureTemplate consumer; the template's store layout and materialize path changed underneath it.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "campaign-closeout",
      "kind": "package_test",
      "path": "tests/effects/campaign-closeout.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing fixtureTemplate consumer; the template's store layout and materialize path changed underneath it.",
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
      "necessity": "The overloaded template signature must type-check against every existing call site.",
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

- Changed behavior/boundary, existing covering tests and remaining gap: test plumbing only.
  The 35 tests in the rewired suite keep their own assertions as the behavioural coverage,
  and the four campaign suites cover the template path that already existed.
- New test case/file rationale, or why existing coverage is sufficient: no new test. The
  template's only contract is a pristine tree per caller, which is exactly what the five
  suites assert by passing unchanged.
- Selected check IDs and why their coverage is sufficient; omitted coverage: the five
  `package_test` checks are the complete consumer set of `fixtureTemplate` plus the rewired
  suite. The six other files that import
  `tests/helpers/collaboration-delegation-fixture.ts` are not in the diff — that helper's
  signature and body are unchanged — but all six plus `scripts/c9-collaboration-canary.ts`'s
  suite surface were run green anyway and are recorded in the notes file. The remaining
  checks are the repository integrity set.
- Full/expensive check justification and expected cost, if applicable: no full suite. The
  change touches one test file and one test helper; every consumer of the changed helper
  exports is named and run directly, and CI runs the full suite on the PR.
- Execution/baseline references, subject, current delta and disposition: baseline and
  post-change runs were taken on the same machine in the same session. The JUnit
  `testcase name` multisets are identical (35 entries), and the suite reports the same
  35 pass / 0 fail / 355 expect() calls before and after, in 87s before and 62s after.
- Residual risks and incomplete observations: the template hands every caller the same
  frozen fixture object, so the shared `role_profile`, `capability` and
  `claim_actor_receipt` values are shared references rather than copies; only the bytes on
  disk are unshared. No test in this suite mutates them. A future fixture that baked a
  third absolute path outside the selector's list would not be restored, and
  `fixtureTemplate` would not notice.

## Rollback Point

- Commit / checkpoint: `origin/main` at the branch point of `codex/delegation-template`.
- Revert strategy: revert the single commit; no product code, migration or state is
  involved.
