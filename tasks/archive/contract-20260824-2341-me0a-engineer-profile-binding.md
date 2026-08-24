> **Archived**: 2026-08-24 23:41
> **Related Plan**: plans/archive/plan-20260824-2126-me0a-engineer-profile-binding.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260824-2341

# Task Contract: me0a-engineer-profile-binding

> **Status**: Fulfilled
> **Plan**: plans/plan-20260824-2126-me0a-engineer-profile-binding.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-engineer-bindings
> **Last Updated**: 2026-08-24 23:39
> **Review File**: `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md`
> **Notes File**: `tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The persistent Module Engineer design needs one identity-independent, repository-backed contract before any Session carrier or worker delegation can be trusted. If ME-0A ships with duplicated capability authority, per-worktree binding state, or recoverable-looking but ambiguous crash states, later Principal, Claim, handoff, and Human Board slices would build authority on a non-deterministic foundation.

## Goal

Deliver the Approved ME-0A protocol and operator surface: exact Profile/Binding schemas and revisions, tracked Profile/SOP canaries backed by existing ArchContext capabilities, one crash-consistent Git-common-directory binding event/current store shared by linked worktrees, and bounded read/bootstrap CLI projections. The result must introduce no Session-originated mutation or task authority.

## Scope

- In scope: `ModuleEngineerProfileV1`, `EngineerBindingV1`, `EngineerBindingEventV1`, `EngineerBindingCurrentV1`; transitive contract revisions; tracked Profile/SOP loading; Git-common-dir event/current publication; operator-only `engineer` CLI; two canary Engineers; architecture/workstream/evidence updates.
- Out of scope: EngineerPrincipal, Session-authenticated mutation, ClaimActorReceipt, Task/Lease/Publication/Acceptance schema changes, delegation, messaging, Worker Host, Provider Session lifecycle, handoff, remote access, GUI, background repair, compatibility formats, or a second capability graph.
- Taste constraints: Fail closed on missing, malformed, stale, symlinked, or ambiguous state. Reuse existing canonical JSON, ArchContext parsing, Git-common-dir, locking, and durable-write primitives. Do not copy capability paths, entrypoints, interfaces, or checks into Profile files.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if an existing authoritative capability parser cannot validate both canary capability IDs without adding a second semantic parser.
- Stop if event-before-current durability cannot be expressed with the existing exclusive-lock and filesystem durability primitives.

## Falsifier

The direction is wrong if `capabilityRegistryFromArchcontextNodes` cannot reproduce the selected canonical records for both canary IDs, linked worktrees resolve different binding roots, or a crash boundary admits two valid current outcomes. Check parser parity first, then a real linked-worktree common-dir fixture, before treating store tests as acceptance evidence.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260824-2126-me0a-engineer-profile-binding.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md`
- Notes file: `tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"engineer-binding-deterministic-tests","kind":"deterministic_test","paths":["src/cli/commands/engineer.ts","src/core/engineers/profile-binding.ts","src/effects/engineers/binding-store.ts","src/effects/engineers/profile-store.ts"]},{"id":"engineer-cli-runtime-readback","kind":"runtime_readback","paths":["src/cli/commands/engineer.ts","src/core/engineers/profile-binding.ts","src/effects/engineers/binding-store.ts","src/effects/engineers/profile-store.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .archcontext/model/nodes/capability.runtime-harness.engineer-bindings.yaml
  - .archcontext/model/nodes/component.engineer-bindings.primary.yaml
  - .archcontext/model/relations/relation.engineer-bindings.primary.yaml
  - .archcontext/model/flows/flow.engineer-bindings.primary.yaml
  - .archcontext/projections/targets.json
  - docs/architecture/.projection-manifest.json
  - docs/architecture/changelog.md
  - docs/architecture/decisions/index.md
  - docs/architecture/diagrams/architecture.likec4
  - docs/architecture/diagrams/architecture.mmd
  - docs/architecture/diagrams/architecture.structurizr.json
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/engineer-bindings.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - tasks/workstreams/runtime-harness/engineer-bindings/me0a-profile-binding.md
  - agents/engineers/profiles/verification-evals-checks.json
  - agents/engineers/profiles/workflow-engine-contract-assets.json
  - agents/engineers/sops/verification-evals-checks.md
  - agents/engineers/sops/workflow-engine-contract-assets.md
  - src/core/engineers/profile-binding.ts
  - src/effects/engineers/profile-store.ts
  - src/effects/engineers/binding-store.ts
  - src/effects/locking/exclusive-directory-lock.ts
  - src/cli/commands/engineer.ts
  - src/cli/index.ts
  - tests/unit/engineer-profile-binding-v1.test.ts
  - tests/unit/engineer-binding-store.test.ts
  - tests/cli/engineer.test.ts
  - tests/capability-archcontext-export.test.ts
  - tests/architecture-projection-e2e.test.ts
  - plans/plan-20260824-2126-me0a-engineer-profile-binding.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md
  - tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md
  - tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md
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
    - .archcontext/model/nodes/capability.runtime-harness.engineer-bindings.yaml
    - .archcontext/model/nodes/component.engineer-bindings.primary.yaml
    - .archcontext/model/relations/relation.engineer-bindings.primary.yaml
    - .archcontext/model/flows/flow.engineer-bindings.primary.yaml
    - docs/architecture/modules/runtime-harness/engineer-bindings.md
    - tasks/workstreams/runtime-harness/engineer-bindings/me0a-profile-binding.md
    - src/core/engineers/profile-binding.ts
    - src/effects/engineers/profile-store.ts
    - src/effects/engineers/binding-store.ts
    - src/cli/commands/engineer.ts
    - agents/engineers/profiles/verification-evals-checks.json
    - agents/engineers/profiles/workflow-engine-contract-assets.json
    - agents/engineers/sops/verification-evals-checks.md
    - agents/engineers/sops/workflow-engine-contract-assets.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md
  tests_pass:
    - path: tests/unit/engineer-profile-binding-v1.test.ts
    - path: tests/unit/engineer-binding-store.test.ts
    - path: tests/cli/engineer.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: exact schemas/revisions, canary validation, one shared binding authority, operator CLI, and bounded bootstrap projection match the Approved PRD.
- Edge cases: N-way bind race; same-key resume/conflict; crash before event, after event, and after current; corrupt/missing current; symlink refusal; retire then rebind; linked-worktree sharing.
- Regression risks: existing Lease bytes and non-engineer CLI commands remain unchanged; full suite and required repository checks pass.

## Rollback Point

- Commit / checkpoint: pre-change branch base; final ME-0A commit recorded at closeout.
- Revert strategy: revert the isolated ME-0A commit. The versioned `engineers/v1` root is new and no existing Task, Lease, Publication, or Acceptance state is migrated.
