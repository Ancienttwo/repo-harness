# Task Contract: me3-acceptance-followup

> **Status**: Active
> **Plan**: plans/plan-20260828-1100-me3-acceptance-followup.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-28 11:00
> **Review File**: `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md`
> **Notes File**: `tasks/notes/20260828-1100-me3-acceptance-followup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`engineer_thread_effect_status` advertises `readOnlyHint: true` while its read path takes an effect lock, prepares the store, and repairs `current.json`, so any Engineer holding a valid principal can make the harness mutate another Engineer's effect state through a tool declared read-only. Separately, the read-only argv frozen into every capability receipt and the argv actually spawned are two independent literals: a divergence would make admission compare an argv that dispatch never runs, silently weakening the read-only proof.

## Goal

1. Both `engineer_thread_effect_status` branches read through the pure-observation path (`observeProviderThreadEffects` / `observeProviderThreadEffectStatus`), which never creates store or lock paths and never rewrites `current.json`; the Engineer ownership check still precedes audit and return.
2. The spawned delegation argv in `delegated-run-store.ts` is derived from `CODEX_READ_ONLY_ARGV_TEMPLATE` by placeholder substitution, so the receipt template is the single source of truth.
3. `tasks/todos.md` row 44 carries a revisit trigger that names a live surface (the engineering-overlay two-pass read semantics) instead of the already-past ME-3A wiring.

## Scope

- In scope:
  - `src/effects/engineers/provider-thread-effect-store.ts`: export `observeProviderThreadEffectStatus` as the pure single-effect read, extracted from `observeProviderThreadEffects`, which now reuses it.
  - `src/cli/mcp/engineer-tools.ts`: route both status branches through the pure reads.
  - `src/effects/engineers/delegated-run-store.ts`: build the spawn argv from the frozen template by placeholder substitution.
  - `tests/cli/mcp-engineer-tools.test.ts`: assert an unknown or foreign `effect_id` leaves the Provider Thread Effect store byte-identical.
  - `tests/unit/me2a-me3b-readonly-delegation.test.ts`: assert the recorded process-receipt argv equals the substituted template, without a third literal.
  - `tasks/todos.md`: retarget the row-44 revisit trigger.
- Out of scope:
  - any other MCP tool, architecture projections, engineering-overlay semantics themselves, delegation admission logic, ME-3B writable paths.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

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
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260828-1100-me3-acceptance-followup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md`
- Notes file: `tasks/notes/20260828-1100-me3-acceptance-followup.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/cli/mcp/engineer-tools.ts
  - src/effects/engineers/provider-thread-effect-store.ts
  - src/effects/engineers/delegated-run-store.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - tests/unit/me2a-me3b-readonly-delegation.test.ts
  - tasks/todos.md
  - plans/plan-20260828-1100-me3-acceptance-followup.md
  - tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md
  - tasks/reviews/20260828-1100-me3-acceptance-followup.review.md
  - tasks/notes/20260828-1100-me3-acceptance-followup.notes.md
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
    - tasks/notes/20260828-1100-me3-acceptance-followup.notes.md
  tests_pass:
    - path: tests/cli/mcp-engineer-tools.test.ts
    - path: tests/unit/me2a-me3b-readonly-delegation.test.ts
    - path: tests/unit/me3a-provider-thread-effect.test.ts
    - path: tests/cli/engineer.test.ts
    - path: tests/cli/delegation.test.ts
    - path: tests/unit/me1c-module-inbox.test.ts
  commands_succeed:
    - bun run check:type
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
