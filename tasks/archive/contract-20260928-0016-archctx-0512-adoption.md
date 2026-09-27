> **Archived**: 2026-09-28 00:16
> **Related Plan**: plans/archive/plan-20260926-2343-archctx-0512-adoption.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260928-0016
> **Archive Projection V1**: `plans/plan-20260926-2343-archctx-0512-adoption.md` => `plans/archive/plan-20260926-2343-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/notes/20260926-2343-archctx-0512-adoption.notes.md` => `tasks/archive/notes-20260928-0016-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/contracts/20260926-2343-archctx-0512-adoption.contract.md` => `tasks/archive/contract-20260928-0016-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/reviews/20260926-2343-archctx-0512-adoption.review.md` => `tasks/archive/review-20260928-0016-archctx-0512-adoption.md`

# Task Contract: archctx-0512-adoption

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260926-2343-archctx-0512-adoption.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-09-26 00:11
> **Review File**: `tasks/archive/review-20260928-0016-archctx-0512-adoption.md`
> **Notes File**: `tasks/archive/notes-20260928-0016-archctx-0512-adoption.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why
The consumer must select the real corrected ADR renderer without weakening exact-version checks.

## Goal
Adopt published ArchContext 0.5.12 through a consumer whose registry lock, dependency pins and installed runtime agree; preserve the validated Bun executable across installation subprocesses.

## Scope
Owner approved merge, publication and normal downstream adoption on 2026-09-27. Complete dependency/default-version adoption, regenerate the registry lock only from published packages, and fix the single reproduced validated-launcher handoff defect blocking installation. Preserve historical AXR evidence. This supersedes the earlier candidate-only boundary. On 2026-09-27 the owner also approved current proof-only projection reconciliation and plan admission repair; daemon-owned architecture projections may be refreshed, without changing semantic model nodes.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A valid projection-profile node with source globs/exclusions must yield its declared contract targets; unsafe paths and malformed identities must still fail before provider execution.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260926-2343-archctx-0512-adoption.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260928-0016-archctx-0512-adoption.md`
- Notes file: `tasks/archive/notes-20260928-0016-archctx-0512-adoption.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "release-gate", "kind": "deterministic_test", "paths": ["*"]}, {"id": "release-tarball-runtime", "kind": "runtime_readback", "paths": ["*"]}]}
```

The release-tarball-runtime oracle is the real installed tarball smoke nested inside `release-gate`; it has no second execution. Source review of the validated Bun handoff at `26423656` passed independently; final acceptance binds the later registry lock and frozen release execution.

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/researches/20260927-bun-temporary-directory-startup.md
  - docs/architecture/.projection-manifest.json
  - bun.lock
  - src/cli/commands/global-runtime.ts
  - scripts/install-agent-fleet.sh
  - assets/templates/helpers/install-agent-fleet.sh
  - tests/install-agent-fleet.test.ts
  - docs/CHANGELOG.md
  - deploy/release-checklists/260924-repo-harness-0.19.3.md
  - scripts/axr5-archctx-clean-room.ts
  - scripts/axr6-stop-host-cycle.ts
  - scripts/axr7-consumer-e2e.ts
  - package.json
  - .ai/harness/policy.json
  - tests/architecture-projection-continuation.test.ts
  - tests/refactor-archctx-provider.test.ts
  - tests/stop-handler-restamp-publication.test.ts
  - tests/unit/refactor-discovery-proposal-authoring.test.ts
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/ensure-task-workflow.sh
  - tests/unit/refactor-shadow-entry.test.ts
  - scripts/lib/project-init-lib.sh
  - tests/architecture-projection-orchestration.test.ts
  - tests/unit/refactor-provider-contract.test.ts
  - tests/unit/refactor-policy.test.ts
  - tests/unit/refactor-recommendations.test.ts
  - tests/architecture-projection-late-write-receipt.test.ts
  - tests/state/operation-readiness.test.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/architecture-projection-provider.test.ts
  - src/core/refactor/policy.ts
  - src/core/architecture/projection.ts
  - plans/archive/plan-20260926-2343-archctx-0512-adoption.md
  - tasks/archive/contract-20260928-0016-archctx-0512-adoption.md
  - tasks/archive/notes-20260928-0016-archctx-0512-adoption.md
  - tasks/archive/review-20260928-0016-archctx-0512-adoption.md
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
      "id": "release-gate",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "One release execution owns source checks, all tests including launcher and fleet guards, real-install cases and tarball smoke; do not rerun nested components separately",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR",
          "BUN_TEST_ISOLATE_FILES",
          "BUN_TEST_JOBS",
          "BUN_TEST_MAX_CONCURRENCY"
        ]
      },
      "command": "BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release"
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun run check:reference-configs"
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

- Changed behavior/boundary, existing covering tests and remaining gap:
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable:
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
