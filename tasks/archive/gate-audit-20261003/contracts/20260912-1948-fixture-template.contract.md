# Task Contract: fixture-template

> **Status**: Active
> **Plan**: plans/plan-20260912-1948-fixture-template.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-12 19:48
> **Review File**: `tasks/reviews/20260912-1948-fixture-template.review.md`
> **Notes File**: `tasks/notes/20260912-1948-fixture-template.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Four campaign-lifecycle suites rebuild the same disposable repository fixture once per
test, which is the dominant cost of each file. If this ships wrong the failure is not a
slow suite but a silent one: a fixture shared across tests that leaks state would make
these suites pass for the wrong reason, and they are the only coverage of campaign
closeout, recovery, worker settlement and authoring resume.

## Goal

`historicalPlanningFixture` and the authoring-resume fixture are built once per distinct
argument list per file, and every later test receives a pristine materialization with the
same isolation a rebuild gives. Every test title, count and assertion in the four files is
unchanged, proven by a before/after JUnit `testcase name` diff.

## Scope

- In scope:
  - `tests/helpers/repo-fixture.ts`: `tmpWorkspaceIn` and `fixtureTemplate`.
  - `tests/effects/campaign-closeout.test.ts`, `tests/effects/brc10-lifecycle.test.ts`,
    `tests/effects/campaign-worker.test.ts`,
    `tests/effects/campaign-authoring-resume.test.ts`: route the fixture builders through
    the template and dispose the templates in `afterAll`.
- Out of scope:
  - `src/`, `scripts/`, `.github/`.
  - Every assertion, test title and test body.
  - `tests/helpers/collaboration-delegation-fixture.ts`: its builder is synchronous and
    names its workspace `repoRoot`, so it needs a second mechanism rather than this one.
- Taste constraints: no per-test read-only/read-write classification; isolation stays
  structural, not a maintained list.

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

- Source plan: `plans/plan-20260912-1948-fixture-template.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260912-1948-fixture-template.review.md`
- Notes file: `tasks/notes/20260912-1948-fixture-template.notes.md`
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
  - tests/effects/campaign-closeout.test.ts
  - tests/effects/brc10-lifecycle.test.ts
  - tests/effects/campaign-worker.test.ts
  - tests/effects/campaign-authoring-resume.test.ts
  - plans/plan-20260912-1948-fixture-template.md
  - tasks/todos.md
  - tasks/contracts/20260912-1948-fixture-template.contract.md
  - tasks/reviews/20260912-1948-fixture-template.review.md
  - tasks/notes/20260912-1948-fixture-template.notes.md
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
    - tasks/notes/20260912-1948-fixture-template.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "campaign-closeout",
      "kind": "package_test",
      "path": "tests/effects/campaign-closeout.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Fixture consumer whose builders now materialize from a template.",
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
      "necessity": "Fixture consumer whose builders now materialize from a template.",
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
      "necessity": "Fixture consumer whose builders now materialize from a template.",
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
      "necessity": "Fixture consumer whose builders now materialize from a template.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "new-plan",
      "kind": "package_test",
      "path": "tests/new-plan.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing tmpWorkspace consumer, covering the repo-fixture refactor that moved its body into tmpWorkspaceIn.",
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
      "necessity": "The new generic template signature must type-check against every call site.",
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

- Changed behavior/boundary, existing covering tests and remaining gap: only test plumbing
  changes. The four suites keep their own assertions as the behavioral coverage; the new
  `fixtureTemplate` has no separate unit test because its only contract — a pristine tree
  per caller — is exactly what those suites assert by passing unchanged.
- New test case/file rationale, or why existing coverage is sufficient: no new test. Adding
  one would restate the four suites' isolation requirement in a weaker form.
- Selected check IDs and why their coverage is sufficient; omitted coverage: the four
  `package_test` checks are the complete consumer set of the changed fixture path;
  `new-plan` covers the additive `tmpWorkspace` refactor for the other `repo-fixture.ts`
  consumers, whose call sites are unchanged and covered by `check-type`. The remaining
  checks are the repository integrity set.
- Full/expensive check justification and expected cost, if applicable: no full suite. The
  change touches four test files and one test helper; every consumer of the changed helper
  exports is named and run directly, and CI runs the full suite on the PR.
- Execution/baseline references, subject, current delta and disposition: baseline and
  post-change runs were taken on the same machine in the same session; the JUnit
  `testcase name` multisets are byte-identical (171 entries), and the combined four-file
  run reports the same 77 pass / 4 skip / 0 fail / 493 expect() calls before and after.
- Residual risks and incomplete observations: a future fixture that bakes a *second*
  absolute path outside `root` and `home` would need that path added to the template, and
  `fixtureTemplate` would not notice. `tests/helpers/collaboration-delegation-fixture.ts`
  is untouched and still rebuilds per test.

## Rollback Point

- Commit / checkpoint: `origin/main` at the branch point of `codex/fixture-template`.
- Revert strategy: revert the single commit; no product code, migration or state is
  involved.
