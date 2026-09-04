> **Archived**: 2026-09-05 03:33
> **Related Plan**: plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-0333
> **Archive Projection V1**: `plans/plan-20260905-0312-workflow-artifact-cleanup.md` => `plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/notes/20260905-0312-workflow-artifact-cleanup.notes.md` => `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0312-workflow-artifact-cleanup.contract.md` => `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0312-workflow-artifact-cleanup.review.md` => `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`

# Task Contract: workflow-artifact-cleanup

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md
> **Task Profile**: ledger-closeout
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 03:12
> **Review File**: `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`
> **Notes File**: `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The root workflow surface still contains thirteen historical Plan families whose
displayed statuses no longer match current execution authority. Leaving them in
place makes root inventory look active, obscures the current Sprint, and keeps
fulfilled deferred-goal text alongside live work. Cleanup must remain separate
from the parallel BRC4 worktree and must not invent missing acceptance evidence.

## Goal

Classify every root historical Plan, archive each family with a truthful
terminal outcome, prune only demonstrably fulfilled Todo content, and leave the
current Sprint and BRC4 worktree unchanged.

## Scope

- In scope:
  - The thirteen Plan families present under `plans/` before this cleanup.
  - Their declared Contract, Review, and Notes artifacts.
  - The fulfilled immutable-task-ID/dependency/acquire-next Todo row.
- Out of scope:
  - `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`.
  - The `codex/brc4-issue-batch-authoring` branch, linked worktree, and changes.
  - Product, runtime, architecture, test, release, or provider behavior.
- Taste constraints: terminal outcomes must report the evidence that exists;
  missing AcceptanceReceipts must never be reconstructed or inferred.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Any cleanup-branch change to the current Sprint, source, tests, architecture,
release artifacts, or BRC4-owned paths falsifies the scope. The parallel BRC4
process may legitimately advance its own worktree while this cleanup runs;
cheapest proof is the cleanup branch's final changed-path set.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`
- Notes file: `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
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
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/
  - .ai/harness/runs/
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
    - plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md
  commands_succeed:
    - repo-harness run classify-historical-plans -- --repo . --format tsv
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/check-architecture-sync.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
    - git diff --check
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: root workflow inventory contains only current authority.
- Edge cases: historical missing receipts use Superseded, never Completed.
- Regression risks: accidental overlap with BRC4 or the active Sprint.

## Rollback Point

- Commit / checkpoint: single contract-worktree publication.
- Revert strategy: revert the publication; archived artifacts preserve source bytes and projection mappings.
