> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260811-2137-archctx-042-version-sync.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: archctx-042-version-sync

> **Status**: Active
> **Plan**: plans/plan-20260811-2137-archctx-042-version-sync.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-11 21:37
> **Review File**: `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md`
> **Notes File**: `tasks/notes/20260811-2137-archctx-042-version-sync.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

archctx / archctx-contracts 0.4.2 are published; the repo still pins 0.4.1 across
its binding points. Until they are synced, the strict architecture-projection Stop
gate blocks sessions in this repo, and the clean-room integration proof cannot be
regenerated (its checkout link step also breaks under bun 1.3 workspace layout).

## Goal

Every archctx version binding point in this repo reads 0.4.2, the axr5 clean-room
proof readback is regenerated against the published 0.4.2 packages (status
verified, contracts 0.4.2, dirtySourceUsed false), and the full test suite passes.

## Scope

- In scope: package.json + bun.lock archctx pins; `.ai/harness/policy.json`
  projection_version; `src/core/architecture/projection.ts`
  ARCHCTX_REQUIRED_VERSION; `assets/templates/helpers/ensure-task-workflow.sh`;
  `scripts/ensure-task-workflow.sh`; `scripts/lib/project-init-lib.sh`;
  `scripts/axr5-archctx-clean-room.ts` (VERSION + workspace-list link step +
  prepareReleaseVersion accepting an already-at-VERSION source as a no-op while
  still failing closed when the version declaration is missing + consumer
  `file:` dependency paths probing both bun install roots like
  installedPlatformPackage already does);
  `scripts/axr6-stop-host-cycle.ts`; `scripts/axr7-consumer-e2e.ts` (VERSION
  const only); five archctx fixture test files;
  `docs/verification/axr5-archctx-clean-room-readback.json` (regenerated).
- Out of scope: concurrent cross-review WIP in the primary worktree; npm publish
  of repo-harness 0.14.2; bun-global CLI refresh; historical records
  (`assets/skill-version.json` changelog, `deploy/release-checklists/`).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `bun scripts/axr5-archctx-clean-room.ts` still fails to resolve
`@archcontext/core` after the workspace-list link rewrite, the bun-1.3 linker
diagnosis is wrong — stop and hand back instead of layering further workarounds.
Cheapest proof point: the axr5 run itself.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260811-2137-archctx-042-version-sync.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md`
- Notes file: `tasks/notes/20260811-2137-archctx-042-version-sync.notes.md`
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
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md
  - tasks/reviews/20260811-2137-archctx-042-version-sync.review.md
  - tasks/notes/20260811-2137-archctx-042-version-sync.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/
  - package.json
  - bun.lock
  - .ai/harness/policy.json
  - assets/templates/helpers/ensure-task-workflow.sh
  - docs/verification/axr5-archctx-clean-room-readback.json
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
    - docs/verification/axr5-archctx-clean-room-readback.json
  artifacts_exist:
    - tasks/notes/20260811-2137-archctx-042-version-sync.notes.md
  tests_pass:
    - path: tests/architecture-projection-provider.test.ts
    - path: tests/architecture-projection-orchestration.test.ts
    - path: tests/stop-handler.test.ts
    - path: tests/state/operation-readiness.test.ts
    - path: tests/cli/global-runtime-init.test.ts
  commands_succeed:
    - bun test
    - bash scripts/check-architecture-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: branch `codex/archctx-042-version-sync` cut from `9799fc09`.
- Revert strategy: single revert of the merged version-sync commit; published npm
  packages and the arch-context repo are unaffected.
