> **Archived**: 2026-08-14 01:18
> **Related Plan**: plans/archive/plan-20260813-2314-nested-capability-architecture-routing.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260814-0118

# Task Contract: nested-capability-architecture-routing

> **Status**: Fulfilled
> **Plan**: plans/plan-20260813-2314-nested-capability-architecture-routing.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-14 00:25
> **Review File**: `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md`
> **Notes File**: `tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`architecture-queue record` hard-codes one workspace directory level before
`src/**`. Nested workspaces therefore exit as `unrelated` before the canonical
capability resolver can route them, suppressing module-level drift requests.

## Goal

Route a source file under any registered nested workspace capability to that
capability's architecture request without weakening internal-path exclusions or
creating requests for unmatched source files.

## Scope

- In scope:
  - Resolve a registered capability before the final `unrelated` exit.
  - Classify a matched path containing a `src/` segment as `low source-change`.
  - Keep the packaged helper projection byte-aligned with the canonical script.
  - Add and red-green verify a Hyperliquid-shaped regression fixture.
- Out of scope:
  - fin-forecast capability registration, contract scope, Archcontext projection enablement, semantic architecture prose.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the standalone capability resolver does not match the nested prefix, or if a
matched nested `src/**` path still cannot produce a module request after moving
the final exit, the proposed routing point is not the root cause. The focused
architecture-queue fixture is the cheapest proof.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/architecture-queue.sh:313-324` only recognizes one-level workspace `src/**` paths, so `record_command` receives `none unrelated` and exits at the pre-resolver gate.
- repro: `bash scripts/architecture-queue.sh record --file packages/providers/hyperliquid/src/l1-lifecycle-evidence.ts` prints `(unrelated)` even when the nested prefix is registered in the regression fixture.
- regression_guard: tests/architecture-queue.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/nested-capability-architecture-routing/pre-fix.txt

## Workflow Inventory

- Source plan: `plans/plan-20260813-2314-nested-capability-architecture-routing.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md`
- Notes file: `tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md`
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
  - tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md
  - tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md
  - tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/architecture-queue.sh
  - assets/templates/helpers/architecture-queue.sh
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
    - tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md
  tests_pass:
    - path: tests/architecture-queue.test.ts
  commands_succeed:
    - REPO_HARNESS_NODE_BIN="$HOME/.nvm/versions/node/v24.18.0/bin/node" bash scripts/check-architecture-sync.sh
    - env -u REPO_HARNESS_NODE_BIN bun test --max-concurrency 4
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: registered nested `src/**` files route to their longest-prefix capability request at low severity.
- Edge cases: unmatched nested source stays unrelated; missing architecture-event helper preserves advisory skip before resolver failure for already classified paths.
- Regression risks: nested config/boundary severity remains unchanged and out of scope; canonical/generated helper parity is enforced.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
