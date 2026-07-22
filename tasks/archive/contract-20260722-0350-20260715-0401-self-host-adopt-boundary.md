# Task Contract: self-host-adopt-boundary

> **Status**: Fulfilled
> **Plan**: plans/plan-20260715-0401-self-host-adopt-boundary.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-15 04:01
> **Review File**: `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md`
> **Notes File**: `tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The installed CLI currently treats the repo-harness source checkout as a downstream adopted repository because self-host detection compares the target path with the running package root. A setup-check recommendation can therefore lead an operator toward an `adopt` plan that deletes and untracks canonical source scripts.

## Goal

Make self-host source-checkout recognition independent of the running package location. Standard downstream adoption must be a no-op for the source checkout, setup check must not emit `repo.adopt-refresh`, and explicit self-host review mode must remain fail closed.

## Scope

- In scope: one structural source-checkout predicate shared by adoption planning, generated cleanup, and setup check; focused regression coverage; workflow evidence.
- Out of scope: applying downstream adoption to the source checkout; changing explicit self-host review mode; unrelated adapter, Waza, CodeGraph, or documentation refresh.
- Taste constraints: fail closed; no path-location heuristic, compatibility alias, fallback parser, or second source authority.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a structurally incomplete repository named `repo-harness` is classified as the source checkout, or explicit self-host review mode stops blocking apply, the predicate is too broad. Cheapest proof: focused adoption-plan tests with a false-positive fixture and the existing self-host apply assertion.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/core/adoption/standard-plan.ts:isSelfHostedSourceRepo` recognizes self-host only when `repoRoot` equals the running package root, which is false for an npm-installed CLI targeting the source checkout.
- repro: run `repo-harness adopt --repo /Users/kito/Projects/repo-harness --dry-run --json` from the Bun-global `0.10.0` install and observe 35 `remove` plus 35 `gitUntrack` source-script operations.
- regression_guard: tests/cli/adoption-plan.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260715-self-host-adopt-boundary-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260715-0401-self-host-adopt-boundary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md`
- Notes file: `tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and canonical `## External Acceptance Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md
  - tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md
  - tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
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
    - src/core/adoption/source-checkout.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md
  tests_pass:
    - path: tests/cli/adoption-plan.test.ts
    - path: tests/cli/init-hook.test.ts
    - path: tests/readme-dx.test.ts
  commands_succeed:
    - bun test tests/readme-dx.test.ts tests/cli/adoption-plan.test.ts tests/cli/init-hook.test.ts
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - bun src/cli/index.ts run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Source adopt dry-run planned zero operations"
```

## Acceptance Notes (Human Review)

- Functional behavior: installed and source CLIs produce no downstream adopt operations or refresh action for this source checkout.
- Edge cases: a name-only `repo-harness` fixture is not classified as source; explicit self-host review mode remains blocked.
- Regression risks: downstream adopted repositories must continue to receive normal standard adoption plans.

## Rollback Point

- Commit / checkpoint: branch `codex/self-host-adopt-boundary`.
- Revert strategy: revert the single boundary commit; no migration or persistent data mutation is introduced.
