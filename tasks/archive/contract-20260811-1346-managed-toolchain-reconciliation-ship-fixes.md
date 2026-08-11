> **Archived**: 2026-08-11 13:46
> **Related Plan**: plans/archive/plan-20260811-1124-managed-toolchain-reconciliation-ship-fixes.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260811-1346

# Task Contract: managed-toolchain-reconciliation-ship-fixes

> **Status**: Fulfilled
> **Plan**: plans/plan-20260811-1124-managed-toolchain-reconciliation-ship-fixes.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-11 11:24
> **Review File**: `tasks/reviews/20260811-1124-managed-toolchain-reconciliation-ship-fixes.review.md`
> **Notes File**: `tasks/notes/20260811-1124-managed-toolchain-reconciliation-ship-fixes.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The existing 0.14.2 candidate changes global package repair, external skill refresh,
ArchContext acceptance, and generated architecture authority. Review reproduced
destructive partial failure, mutable default supply-chain input, stale projection,
and readiness-contract drift; merging those states would make a routine update
unsafe and would publish architecture evidence that does not match its source model.

## Goal

Deliver one reviewable 0.14.2 candidate that preserves the intended exact
ArchContext/CodeGraph runtime readback while failing closed without uninstalling a
working CLI, keeps mutable third-party refresh explicit, removes unauthenticated
accepted-change CLI authority, synchronizes canonical ArchContext tracking and
generated docs, and passes the repository release gates before PR merge.

## Scope

- In scope: the existing local 0.14.2 candidate, verified review fixes, workflow
  artifacts needed to authorize the repair, generated architecture projection,
  tests, package/install smoke, PR CI, merge, and main readback.
- Out of scope: npm publication, tag/GitHub Release creation, registry mutation,
  live host Waza/Mermaid refresh, and a new immutable external-skill distribution
  protocol.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a fixture can remove the installed CLI after a failed
repair, ordinary update executes mutable external providers without opt-in, raw
CLI strings can create accepted architecture authority, or architecture sync does
not include the new capability. Targeted tests and `check-architecture-sync` are
the cheapest proof points.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260811-1124-managed-toolchain-reconciliation-ship-fixes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260811-1124-managed-toolchain-reconciliation-ship-fixes.review.md`
- Notes file: `tasks/notes/20260811-1124-managed-toolchain-reconciliation-ship-fixes.notes.md`
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
  - .ai/harness/policy.json
  - .archcontext/
  - .github/workflows/ci.yml
  - .gitignore
  - README.md
  - README.es.md
  - README.fr.md
  - README.ja.md
  - README.zh-CN.md
  - assets/
  - bun.lock
  - deploy/
  - docs/
  - package.json
  - plans/
  - scripts/
  - src/
  - tasks/todos.md
  - tasks/lessons.md
  - tasks/contracts/20260811-1124-managed-toolchain-reconciliation-ship-fixes.contract.md
  - tasks/reviews/20260811-1124-managed-toolchain-reconciliation-ship-fixes.review.md
  - tasks/notes/20260811-1124-managed-toolchain-reconciliation-ship-fixes.notes.md
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
    - .archcontext/model/nodes/capability.runtime-harness.global-runtime-reconciliation.yaml
    - deploy/release-checklists/260810-repo-harness-0.14.2.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260811-1124-managed-toolchain-reconciliation-ship-fixes.notes.md
  tests_pass:
    - path: tests/cli/global-runtime-init.test.ts
    - path: tests/cli/run.test.ts
    - path: tests/architecture-projection-provider.test.ts
    - path: tests/architecture-projection-orchestration.test.ts
  commands_succeed:
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
```

## Acceptance Notes (Human Review)

- Functional behavior: ordinary `update` preserves the installed CLI on dependency mismatch, verifies the candidate runtime before host projection, and does not refresh mutable external providers without explicit opt-in.
- Edge cases: `--no-cli` still verifies the mandatory runtime closure; destination conflicts fail before any host mutation; capability-only ArchContext repositories remain status-ready while projection apply still requires the complete model.
- Regression risks: the first-invocation upgrade handoff depends on the packaged sync script and is covered by an installed-candidate fixture; external Waza/Mermaid refresh remains mutable but is explicitly outside the default update path and outside this release slice.

## Rollback Point

- Commit / checkpoint: the single reviewed candidate commit on `codex/managed-toolchain-reconciliation-ship-fixes`.
- Revert strategy: revert the merged candidate commit; no npm publication, tag, GitHub Release, or live host mutation is part of this slice.
