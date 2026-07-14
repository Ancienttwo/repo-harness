# Task Contract: 3p-cli-skill-mcp-boundary

> **Status**: Partial
> **Plan**: plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: workflow-engine-contract-assets
> **Last Updated**: 2026-07-14 21:28
> **Review File**: `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md`
> **Notes File**: `tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The CLI/Skill/MCP boundary audit (2026-07-14) found the `run` helper facade is the only CLI surface an agent cannot discover from `--help` (46 helpers listed only on failure), the check skill maintained a required-check list that had already drifted from root `CLAUDE.md`, and no boundary stopped endpoint-rename skills from accumulating. Shipping wrong loses the fail-closed 1:1 description invariant; skipping leaves skill prose as the de facto CLI documentation.

## Goal

`repo-harness run --help` enumerates every contract helper with a one-line description sourced solely from `assets/workflow-contract.v1.json#helpers.descriptions` under fail-closed validation; `repo-harness-check` defers to the target repo's root `## Required Checks` as the single source of truth; the skill-granularity boundary is recorded in the skill-commands local contracts.

## Scope

- In scope: workflow contract descriptions map (48 entries after rebase), helper-runner validation, run-command help rendering, check-skill single-sourcing, skill-commands granularity bullets, architecture closeout for the contract-surface change.
- Out of scope: `run list` subcommand or per-helper `--help`, doctor surface changes (investigated, scopes already distinct), thin-skill consolidation, version bumps, changelog edits, user WIP files (gatekeeper agent defs, install-agent-fleet trio, tasks/todos.md ledger content).
- Taste constraints: (none beyond repo defaults)

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `run --help` enumeration or the descriptions map can drift from `helpers.scripts` without a failing test or contract error, the fail-closed design is wrong; cheapest proof: remove one description locally and confirm `listHelpers()` throws and `tests/cli/run.test.ts` fails.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md`
- Notes file: `tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and canonical `## External Acceptance Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/current.md
  - tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md
  - tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md
  - tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - assets/skill-commands/repo-harness-check/SKILL.md
  - assets/skill-commands/CLAUDE.md
  - assets/skill-commands/AGENTS.md
  - docs/architecture/
  - src/cli/commands/run.ts
  - src/cli/runtime/helper-runner.ts
  - tests/workflow-contract.test.ts
  - tests/cli/run.test.ts
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
    - assets/workflow-contract.v1.json
    - src/cli/commands/run.ts
    - tests/cli/run.test.ts
  artifacts_exist:
    - tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md
  tests_pass:
    - path: tests/workflow-contract.test.ts
    - path: tests/cli/run.test.ts
  commands_succeed:
    - cmp assets/workflow-contract.v1.json .ai/harness/workflow-contract.json
    - bash scripts/check-architecture-sync.sh
  manual_checks:
    - "repo-harness run --help lists every helpers.scripts entry with its description"
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: `run --help` renders the full helper enumeration; unknown-helper stderr behavior unchanged; contract parse errors surface in help text instead of crashing.
- Edge cases: upstream helper additions fail closed until a description is added (exercised live by the origin/main rebase adding 2 helpers).
- Regression risks: contract mirror drift (guarded by cmp + parity tests), description/script drift (guarded by fail-closed validation + tests).

## Rollback Point

- Commit / checkpoint: single commit on main (`feat: enumerate run helpers in --help and single-source skill contracts`).
- Revert strategy: `git revert` that commit; no data migration, no installed-repo write.
