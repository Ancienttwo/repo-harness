# Task Contract: terminal-plans-sweep

> **Status**: Fulfilled
> **Plan**: plans/plan-20260722-0350-terminal-plans-sweep.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-22 03:52
> **Review File**: `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md`
> **Notes File**: `tasks/notes/20260722-0350-terminal-plans-sweep.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

~80 terminal plans accumulated in `plans/` root because per-plan `archive-workflow --outcome Completed` demands fresh plan-bound verify evidence that frozen history cannot produce. Root workflow surfaces must represent active work only (root contract rule); the owner delegated the evidence model: fail-closed one-shot migration — archive only on unambiguous terminal proof, hold everything ambiguous for a human pass, never guess.

## Goal

1. Classify every `plans/*.md` root file (dry-run table first): AUTO when the plan's own `Status` header is terminal (Completed/Done/Complete/Archived/Superseded/Abandoned) OR its stem-matched contract is `Fulfilled` with a pass-recommending review; HOLD on anything ambiguous; EXCLUDE the active set (`plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md`, `plan-20260715-1140-skill-surface-discovery-convergence.md`, `plan-20260721-1743-sprint-strict-queue-enforcement.md`).
2. Migrate the AUTO set with archive-workflow semantics: plan `Status` → `Archived`, move to `plans/archive/`; stem-matched contract/notes/review files move to `tasks/archive/{contract,notes,review}-<stamp>-<slug>.md`; unmatched artifacts stay.
3. Single bookkeeping pass: one todos snapshot (`tasks/archive/todo-<stamp>-terminal-plans-sweep.md`) + one `refresh-current-status --write`.
4. Append the full per-plan classification table (status found, contract status, review verdict, decision) to the notes file as the audit record; report the HOLD list.

## Scope

- In scope: `plans/` root files and `plans/archive/`, stem-matched `tasks/contracts|notes|reviews` moves into `tasks/archive/`, `tasks/current.md` refresh, this package's contract/notes/review artifacts.
- Out of scope (fail closed): any change to helper scripts, gates, or `archive-workflow` semantics; the EXCLUDE set; any HOLD-classified file; `plans/sprints/`, `plans/prds/`; `evals/**`; anything outside plans/tasks.
- EXECUTION_BOUNDARY: absent requirements are forbidden design space; a plan without terminal proof stays in place — misfiled history is worse than visible backlog.

## Stop Conditions

- Stop and hand back if any migration would touch a file outside Allowed Paths.
- Stop if an Exit Criteria command cannot run.
- Stop if the dry-run classification contradicts the EXCLUDE list or yields zero AUTO entries.
- Stop on any PreToolUse guard block — no retries; return the guard JSON.

## Falsifier

If any AUTO-classified plan turns out to be live work, the terminal-proof rules are wrong. Cheapest check: the dry-run table's AUTO rows must all show an explicit terminal marker in the table itself.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source plan: `plans/plan-20260722-0350-terminal-plans-sweep.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md`
- Notes file: `tasks/notes/20260722-0350-terminal-plans-sweep.notes.md`
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
  - plans/
  - tasks/
  - tests/
  - .ai/hooks/
```

## Evidence Requirements

```yaml
evidence_requirements:
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tasks/current.md
    - tasks/notes/20260722-0350-terminal-plans-sweep.notes.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
  commands_succeed:
    - repo-harness run check-task-workflow --strict
    - bash scripts/check-task-sync.sh
    - bun test tests/helper-scripts.test.ts
    - bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts
```

## Acceptance Notes (Human Review)

- Functional behavior: plans root reduced to EXCLUDE + HOLD sets; every AUTO move mirrored by an audit-table row with explicit terminal proof; artifact families moved with exact stem matches only.
- Edge cases: legacy plans without standard headers (the two `repo-harness-v0.5-refactor-plan*.md`) classify by header presence — no header → HOLD; unknown status strings → HOLD.
- Regression risks: none to runtime code; task-sync and strict checks guard the workflow-surface consistency.

## Rollback Point

- Commit / checkpoint: branch `codex/terminal-plans-sweep` forked from `00f6dd56`; no commits at dispatch time.
- Revert strategy: revert/delete the branch — pure renames and header flips.
