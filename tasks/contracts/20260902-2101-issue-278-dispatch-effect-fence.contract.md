# Task Contract: issue-278-dispatch-effect-fence

> **Status**: Active
> **Plan**: plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-02 21:01
> **Review File**: `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md`
> **Notes File**: `tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The collaboration dispatch fence is currently a call-site pre-step in `src/cli/commands/delegation.ts` and
`scripts/c9-collaboration-dispatch-runner.ts`. A non-CLI controller (agent task automation, MCP, a future
scheduler) that calls `dispatchDelegatedRun()` directly reaches the Codex host action with no live binding
check, so injected coordination context that no `CollaborationRunContextBindingV1` accounts for can reach a
Worker. "Every caller remembers a pre-step" is not a stable invariant and regresses silently the moment a
second production dispatch surface is added.

## Goal

`dispatchDelegatedRun()` in `src/effects/engineers/delegated-run-store.ts` enforces
`fenceCollaborationDispatch()` itself, inside the dispatch lock and before any state mutation or host action,
so no caller can reach the host action for a collaboration run without a live binding. `delegation_only` runs
still dispatch with no binding, refusal codes are unchanged, and the CLI and C9 pre-steps are deleted because
the effect now owns the edge.

## Scope

- In scope:
  - `src/effects/engineers/delegated-run-store.ts`: compose the fence into `dispatchDelegatedRun()`.
  - `src/cli/commands/delegation.ts`: delete the redundant pre-step and rename the handler to the dispatch verb it now is.
  - `scripts/c9-collaboration-dispatch-runner.ts`: delete the redundant pre-step.
  - `src/effects/collaboration/context-delivery.ts`: rewrite the fence ownership comments; no behavior change.
  - `tests/effects/collaboration-dispatch-effect-fence.test.ts` and `tests/effects/collaboration-dispatch-fence-composed.test.ts`: direct-effect and composed-path acceptance.
  - `.archcontext/model/` selectors and flows plus `docs/architecture/` projection: move the declared edge from the CLI adapter to the dispatch effect.
  - `tasks/todos.md`: delete the fulfilled deferred-goal row.
- Out of scope: a second dispatch implementation; inferring collaboration intent from a prompt; weakening binding revision, run identity or context-delivery checks; any fallback that dispatches after a fence error; task identity (`coordination-identity.ts`) and scheduling dependency authority (`scheduling.ts`), which sibling contracts own.
- Taste constraints: keep the single dispatch semantics; the fence is one call at the top of the locked section, not a new abstraction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the fence cannot run inside the dispatch effect without a second dispatch path or a
weakened check. Cheapest proof point first: `tests/effects/collaboration-dispatch-effect-fence.test.ts` — a
direct `dispatchDelegatedRun()` call for a collaboration run with no binding must fail with
`binding_missing`, leave the run at `intent_persisted`, and persist zero launch claims. If that call cannot be
refused from inside the effect, or if the delegation-only case starts requiring a binding, the composition is
wrong and the pre-step shape must stay.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md`
- Notes file: `tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"issue-278-dispatch-fence","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/
  - tests/
  - scripts/
  - .archcontext/model/
  - docs/architecture/
  - docs/spec.md
  - AGENTS.md
  - CLAUDE.md
  - tasks/todos.md
  - plans/
  - tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md
  - tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md
  - tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md
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
    - plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md
  artifacts_exist:
    - tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md
    - tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md
    - tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md
  tests_pass:
    - path: tests/effects/collaboration-dispatch-effect-fence.test.ts
    - path: tests/effects/collaboration-dispatch-fence-composed.test.ts
    - path: tests/cli/collaboration.test.ts
    - path: tests/effects/collaboration-context-delivery.test.ts
  commands_succeed:
    - bun test --timeout 60000
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
