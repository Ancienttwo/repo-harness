# Task Contract: expensive-test-gate

> **Status**: Active
> **Plan**: plans/plan-20260913-0250-expensive-test-gate.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-13 02:50
> **Review File**: `tasks/reviews/20260913-0250-expensive-test-gate.review.md`
> **Notes File**: `tasks/notes/20260913-0250-expensive-test-gate.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Two test files spend almost all of their wall clock on real external work:
`tests/harness-benchmark-matrix.test.ts` packs the whole repository with `npm
pack` and installs the tarball into an isolated HOME, and
`tests/claude-review.test.ts` drives the real pinned `herdr` binary. Every
hosted pull request and every `main` push pays that cost through the
`functional` lane. If the gate ships wrong the release lane silently stops
executing them and the packaging/review-session regressions they own become
unguarded.

## Goal

One environment variable, `REPO_HARNESS_TEST_EXPENSIVE`, gates the two real
install cases in `tests/harness-benchmark-matrix.test.ts` and the whole of
`tests/claude-review.test.ts`. `scripts/check-ci.sh` exports it in the `all`
lane only, so local and release callers (`bun run check:release` reaches the
`all` lane) keep full coverage while the hosted `functional` lane skips them.
A guard test binds the lane wiring and the shared variable name; no test title
disappears from the JUnit report.

## Scope

- In scope: `tests/harness-benchmark-matrix.test.ts` (two `prepareBenchmarkRuntimeArtifact()` cases), all of `tests/claude-review.test.ts`, the `all`-lane export in `scripts/check-ci.sh`, the new `tests/expensive-test-gate.test.ts`, and one release-lane paragraph in `assets/reference-configs/release-deploy.md` with its `docs/reference-configs/` projection.
- Out of scope: `src/`, `.github/workflows/ci.yml` (including the now-unneeded "Install pinned Herdr runtime" step), `tasks/todos.md` hand edits, any other plan, and any assertion or title inside the gated tests.
- Taste constraints: follow the existing `test.skipIf(!process.env.BRC_TEST_CONTAINER_IMAGE)` precedent in `tests/effects/brc10-lifecycle.test.ts`; the skip must read as a gate, never as a failure.

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

- Source plan: `plans/plan-20260913-0250-expensive-test-gate.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260913-0250-expensive-test-gate.review.md`
- Notes file: `tasks/notes/20260913-0250-expensive-test-gate.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"expensive-test-gate","kind":"deterministic_test","paths":["tests/expensive-test-gate.test.ts"]},{"id":"check-ci-job-split","kind":"deterministic_test","paths":["tests/check-ci-job-split.test.ts"]}]}
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
  - tasks/contracts/20260913-0250-expensive-test-gate.contract.md
  - tasks/reviews/20260913-0250-expensive-test-gate.review.md
  - tasks/notes/20260913-0250-expensive-test-gate.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - tests/
  - scripts/check-ci.sh
  - assets/reference-configs/release-deploy.md
  - docs/reference-configs/release-deploy.md
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
    - tests/expensive-test-gate.test.ts
  artifacts_exist:
    - tasks/notes/20260913-0250-expensive-test-gate.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "benchmark-matrix-gate-off",
      "kind": "package_test",
      "path": "tests/harness-benchmark-matrix.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves the hosted functional lane keeps the other 29 cases green and skips exactly the two real pack/install cases.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "benchmark-matrix-gate-on",
      "kind": "command",
      "command": "REPO_HARNESS_TEST_EXPENSIVE=1 bun test --timeout 180000 tests/harness-benchmark-matrix.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "Proves the release lane still runs the two real pack/install cases green; distinct input environment from the gate-off run.",
      "inputs": {
        "env": [
          "REPO_HARNESS_TEST_EXPENSIVE"
        ]
      }
    },
    {
      "id": "claude-review-gate-off",
      "kind": "package_test",
      "path": "tests/claude-review.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves the hosted functional lane skips the whole real-herdr file instead of failing on a missing runtime.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "claude-review-gate-on",
      "kind": "command",
      "command": "REPO_HARNESS_TEST_EXPENSIVE=1 bun test --timeout 180000 tests/claude-review.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "Proves the release lane still runs every real-herdr review session case green; distinct input environment from the gate-off run.",
      "inputs": {
        "env": [
          "REPO_HARNESS_TEST_EXPENSIVE"
        ]
      }
    },
    {
      "id": "expensive-test-gate",
      "kind": "package_test",
      "path": "tests/expensive-test-gate.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The new guard: the all lane exports the variable, the functional lane does not, and both gated files use that exact name.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-ci-job-split",
      "kind": "package_test",
      "path": "tests/check-ci-job-split.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The existing lane authority; the new export must not change lane independence or the Required / CI aggregate.",
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
      "necessity": "The new guard test and the two gate declarations must type-check.",
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
      "necessity": "The reference-config edit is authored in assets/ and projected into docs/; this proves no drift.",
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
      "necessity": "Required repository integrity check; the digest is bound to the origin/main merge base.",
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
    },
    {
      "id": "check-ci-governance",
      "kind": "command",
      "command": "bash scripts/check-ci.sh governance",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The edited lane script must still complete its governance lane end to end.",
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

- Changed behavior/boundary, existing covering tests and remaining gap: only which lane executes two expensive test surfaces. `tests/check-ci-job-split.test.ts` already owns lane independence but says nothing about test-cost scheduling, which is the gap the new guard closes.
- New test case/file rationale, or why existing coverage is sufficient: `tests/expensive-test-gate.test.ts` exists because a rename of the variable on one side would silently drop release coverage while every other check stays green. It was mutation-checked: renaming the export fails the name assertion, and moving the export outside the `all` branch fails the lane assertion.
- Selected check IDs and why their coverage is sufficient; omitted coverage: the four gate-off/gate-on runs are the behavior itself, the two lane tests are the wiring, and the remaining IDs are the repository-integrity set. No full local suite: this slice changes test scheduling, one shell export and one document, and no product code. Hosted `Required / CI` remains the full-coverage authority.
- Full/expensive check justification and expected cost, if applicable: the two gate-on runs are `expensive` because they are exactly the real `npm pack`/global-install and real `herdr` cost being gated; they are the only way to prove the release lane still passes. Measured cost below.
- Execution/baseline references, subject, current delta and disposition: pre-change baselines on this branch were 62.73s (31 pass) for the benchmark file and 38.98s (20 pass) for the review file. After the change, gate off is 2.57s (29 pass / 2 skip) and 0.023s (20 skip); gate on is 55.99s (31 pass) and 39.22s (20 pass). The JUnit `<testcase name>` multiset is byte-identical to baseline in all four runs.
- Residual risks and incomplete observations: the hosted functional lane no longer exercises the one pure schema case inside `tests/claude-review.test.ts`; whole-file gating was chosen because `unstartedSession()` resolves `Bun.which('herdr')` and every other case drives a real server. `tests/harness-benchmark-matrix.test.ts` keeps a third real install (`bun add -g <fixture dir>` at the Git-clean mode-drift case) ungated: it installs a three-file fixture package, not the repository, and the approved scope fixes the gated count at two.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
