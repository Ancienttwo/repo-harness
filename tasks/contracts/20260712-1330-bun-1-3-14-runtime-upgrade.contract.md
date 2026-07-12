# Task Contract: bun-1-3-14-runtime-upgrade

> **Status**: Active
> **Plan**: plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 13:32
> **Review File**: `tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md`
> **Notes File**: `tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The hosted runtime remains pinned to Bun 1.3.10 even though 1.3.14 is the current
stable release. A pin-only upgrade is unsafe because 1.3.14 exposes buffered
stdout truncation at immediate process-exit boundaries, corrupting architecture
JSON and hook control output.

## Goal

Run repository CI and hook transports on Bun 1.3.14 while preserving complete
stdout/stderr payloads and every existing public CLI, hook, and schema contract.

## Scope

- In scope: exact CI pin update; synchronous writes at exit-adjacent architecture
  and hook boundaries; source/template parity; current runtime documentation.
- Out of scope: raising the package engine floor; dependency upgrades; public API,
  schema, hook route, or compatibility-layer changes; unrelated BDD² work.
- Taste constraints: keep one output contract, no retry/fallback path, and no new dependency.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If Bun 1.3.14 cannot emit the complete architecture JSON or the existing hook/full
test suites regress after synchronous writes, retain the 1.3.10 pin. The cheapest
proof is the direct event-json byte count plus `tests/architecture-queue.test.ts`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md`
- Notes file: `tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .github/workflows/ci.yml
  - assets/templates/helpers/architecture-event.ts
  - docs/researches/repo-harness 钩子时延与 LLM 提供商限流归因研究报告.md
  - scripts/architecture-event.ts
  - src/cli/hook-entry.ts
  - src/cli/hook/runtime.ts
  - src/cli/index.ts
  - plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md
  - tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md
  - tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
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
    - .github/workflows/ci.yml
    - scripts/architecture-event.ts
    - assets/templates/helpers/architecture-event.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md
  tests_pass:
    - path: tests/architecture-queue.test.ts
    - path: tests/hook-runtime.test.ts
  commands_succeed:
    - bun test
    - bunx tsc --noEmit --pretty false
    - bun scripts/sync-helper-sources.ts --check
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: both hosted jobs select Bun 1.3.14; architecture and hook
  output is complete before process exit.
- Edge cases: multi-kilobyte JSON, hook decision JSON, review fingerprints,
  minimal-change reports, stderr failures, generated helper copies.
- Regression risks: changing write timing or stream destination; validate exact
  bytes and existing protocol tests rather than adding a parallel transport.

## Rollback Point

- Commit / checkpoint: Bun 1.3.14 upgrade PR.
- Revert strategy: revert the PR to restore 1.3.10; no persisted state rollback.
