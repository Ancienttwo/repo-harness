> **Archived**: 2026-07-06 16:56
> **Related Plan**: plans/archive/plan-20260706-1646-setup-adopt-refresh-check.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260706-1656

# Task Contract: setup-adopt-refresh-check

> **Status**: Fulfilled
> **Plan**: plans/plan-20260706-1646-setup-adopt-refresh-check.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-06 16:46
> **Review File**: `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md`
> **Notes File**: `tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Agents already get a read-only update advisory when the global
`repo-harness` package is stale, but they do not get the same setup-check signal
when the current adopted repo's workflow files would change under
`repo-harness adopt`. Without this check, local repos can drift silently after a
package update and the agent has to infer adoption refresh manually.

## Goal

Add a read-only `setup check --check-updates` advisory that reports whether the
current repo needs `repo-harness adopt` refresh, using the existing adoption
planner/dry-run summary as the authority and surfacing any required refresh as
an `agent_actions` item.

## Scope

- In scope:
  - Add a setup-check row for repo adoption refresh when update checks are
    requested.
  - Use the adoption planner summary to decide whether refresh is needed.
  - Add an Agent action for planned adoption operations, pointing at
    `repo-harness adopt --repo <repo>`.
  - Add focused tests for refresh needed, no refresh needed, and skipped
    update-check mode.
  - Update concise docs/release-prep wording only where the setup-check surface
    is already described.
- Out of scope:
  - Do not execute `repo-harness adopt` automatically.
  - Do not change adoption planner semantics.
  - Do not add a new command, daemon, hook, or background check.
  - Do not include generated `.archcontext/` scaffold files.
- Taste constraints: Keep this as a direct setup-check integration, not a new
  abstraction layer.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `repo-harness adopt --dry-run --json` cannot reliably represent no-op versus
refresh-needed state, this direction is wrong. Cheapest proof point:
`bun src/cli/index.ts adopt --dry-run --json --repo .` must expose
`summary.plannedTotal`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260706-1646-setup-adopt-refresh-check.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md`
- Notes file: `tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - docs/CHANGELOG.md
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - deploy/release-checklists/260706-repo-harness-0.9.1.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md
  - tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md
  - tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md
  - .ai/context/capabilities.json
  - src/cli/commands/init-hook.ts
  - src/cli/commands/adopt-plan.ts
  - src/core/adoption/
  - tests/cli/init-hook.test.ts
  - tests/cli/adoption-plan.test.ts
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
    - src/cli/commands/init-hook.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md
  tests_pass:
    - path: tests/cli/init-hook.test.ts
  commands_succeed:
    - bun test tests/cli/init-hook.test.ts tests/cli/adoption-plan.test.ts
    - bun run check:type
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
