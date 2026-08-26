> **Archived**: 2026-08-26 16:10
> **Related Plan**: plans/archive/plan-20260826-1247-me4a-bound-task-freeze-handoff.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260826-1610

# Task Contract: me4a-bound-task-freeze-handoff

> **Status**: Fulfilled
> **Plan**: plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-bound-task-freezes
> **Last Updated**: 2026-08-26 12:48
> **Review File**: `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md`
> **Notes File**: `tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Binding rotation currently permits replacing or retiring a Session-backed Engineer while its Claim still owns a worktree. If that worktree is dirty or unverified, the control plane loses the exact residual-state fence and can imply a transfer that never occurred. ME-4A must refuse that transition and freeze exact evidence without creating a successor authority.

## Goal

Deliver the approved ME-4A inspect/freeze/refusal boundary: closed canonical `TaskFreezeReceiptV1`, exact double-read observation and stale verification, immutable git-common persistence, active-Claim Binding rotation refusal, and bounded CLI inspect/create/verify commands with no takeover surface.

## Scope

- In scope: task/Claim/Lease/Binding/WorkEnvelope/Git/check/hypothesis/writer-grant fences; immutable receipt; stale detection; Human choices; narrow Binding guard; capability projection and tests.
- Out of scope: successor election, untracked content transport, automatic release/reacquire, execution takeover, writable delegation, Provider runtime, Publication/Acceptance mutation, ME-4B and ME-2B.
- Taste constraints: preserve existing Lease, ClaimActorReceipt and EngineerBinding wire authority; fail closed on any unavailable or changed source; inventory names never carry file bytes.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a dirty/unverified live Claim can still rotate Binding, if inspection changes Lease/Binding bytes, if one source changes between reads without `changed_during_read`, if a later source change verifies an old receipt, or if any command/effect claims takeover. The cheapest proof is `bun test tests/unit/me4a-bound-task-freeze-handoff.test.ts --timeout 60000`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md`
- Notes file: `tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me4a-full-repository-verification","kind":"deterministic_test","paths":["*"]}]}
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
  - tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md
  - tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md
  - tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md
  - .ai/context/capabilities.json
  - .archcontext/model/
  - .claude/templates/
  - docs/architecture/
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - tasks/workstreams/runtime-harness/bound-task-freezes/
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md
    - docs/architecture/modules/runtime-harness/bound-task-freezes.md
  tests_pass:
    - path: tests/unit/me4a-bound-task-freeze-handoff.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: one exact live bound task is double-read and either classified clean or frozen with closed reasons; Binding rotation cannot transfer the Claim.
- Edge cases: zero/multiple Claims, stale Binding/Claim/Lease/WorkEnvelope, changed source bytes, symlink/non-file observations, immutable receipt conflict and post-freeze staleness fail closed.
- Regression risks: the new guard intentionally rejects replace/retire while any live Claim exists; callers must use the existing explicit release path first.

## Rollback Point

- Commit / checkpoint: exact ME-4A frozen subject recorded by the final AcceptanceReceipt.
- Revert strategy: revert task-freeze core/effect/CLI/capability files and the narrow Binding live-Claim guard as one unit; immutable receipts remain inert historical evidence.
