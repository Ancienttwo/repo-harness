# Task Contract: operator-board-redesign

> **Status**: Active
> **Plan**: plans/plan-20260828-2326-operator-board-redesign.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-28 23:26
> **Review File**: `tasks/reviews/20260828-2326-operator-board-redesign.review.md`
> **Notes File**: `tasks/notes/20260828-2326-operator-board-redesign.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The operator board is the only human rendering surface for fleet task state (CLI `fleet board` requires `--json`). Today it is an acceptance shell: real 64-hex `task_id`s render as unreadable card titles (the human label from the sprint Task cell is read into `BoardTaskInput.row` but dropped by the projection), the attention list is unsorted and cause-free, `feedback.no_progress` is decoded but never rendered, and the read-only boundary blocks the user-approved task-message channel. If this ships wrong, the operator either cannot triage (misses user-owned blockers) or the single write action leaks beyond its fence (message sent against a torn snapshot or into a read_only repo).

## Goal

Rebuild `src/operator-web/` as an attention-first decision surface per the approved plan (`plans/plan-20260828-2326-operator-board-redesign.md`, frozen decisions section): single priority-ordered worklist + persistent detail pane + persistent status bar, human task labels projected additively into `FleetBoardCardV1` with `FLEET_BOARD_PROTOCOL` bumped to 2, and one write action — a task-message composer wired to a new `POST /api/v1/fleet/tasks/{repository_id}/{task_id}/messages` endpoint wrapping the existing `sendTaskMessage` effect with `sender_kind: 'operator'`.

## Scope

- In scope: `src/core/fleet/board.ts`, `src/effects/fleet/board.ts`, `src/operator-web/**` (including a new dictionary-based zh/en i18n module `src/operator-web/i18n.ts`, no third-party i18n library, default locale en), `src/effects/operator/server.ts`, and their tests (`tests/operator-web/**`, board/fleet projection tests, operator server tests); the plan's WP-A/WP-B/WP-C task breakdown.
- Out of scope: `sendTaskMessage` effect internals and the task-message protocol (`src/core/fleet/task-message.ts` semantics stay untouched except reading existing constants); CLI commands; `FleetBoardInboxSummaryV1` receipt-state extension (deferred, recorded in tasks/todos.md); any second write action; SSE/watch endpoints; release/publish.
- Taste constraints: the accent color marks human-write affordances only; semantic colors (user=amber, agent=neutral blue, external=purple, danger=red for real failures only) are separate from the accent; minimum text size 11px, text contrast ≥ 4.5:1, non-text indicators ≥ 3:1 with a non-color secondary encoding.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if projecting `row.task`/`row.index` turns out to require a non-additive change to `BoardTaskInput` collection (that widens authority and needs a parent decision).

## Falsifier

Direction is wrong if real sprint `task` cells are not usable labels (long free-text markdown instead of short titles). Cheapest proof: `rg -m 6 "^\|" plans/archive/*.sprint.md` — verified 2026-08-28, cells are short work-package titles ("WP1 crash-durable closeout transaction"), so the label projection wins. Also wrong if the worklist regroups so aggressively that stage distribution becomes invisible; proof point is the detail-pane empty state carrying the repo × stage matrix.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260828-2326-operator-board-redesign.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260828-2326-operator-board-redesign.review.md`
- Notes file: `tasks/notes/20260828-2326-operator-board-redesign.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"board-projection-and-operator-tests","kind":"deterministic_test","paths":["*"]},{"id":"operator-ui-browser-readback","kind":"runtime_readback","paths":["src/operator-web/","src/effects/operator/server.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - README.md
  - docs/design/DESIGN-local-human-control-board-v1.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260828-2326-operator-board-redesign.contract.md
  - tasks/reviews/20260828-2326-operator-board-redesign.review.md
  - tasks/notes/20260828-2326-operator-board-redesign.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/check-tarball-install-smoke.sh
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
    - tasks/notes/20260828-2326-operator-board-redesign.notes.md
  tests_pass:
    - path: tests/board-projection.test.ts
    - path: tests/board-snapshot-consistency.test.ts
    - path: tests/operator-web/operator-ui.test.tsx
    - path: tests/operator-web/operator-interactions.test.tsx
  commands_succeed:
    - bun run check:type
    - bun run build:operator-web
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

- Commit / checkpoint: worktree base `97468edb` (main @ 0.17.1)
- Revert strategy: single feature branch `codex/operator-board-redesign`; protocol bump and UI rebuild land atomically, so reverting the merge restores protocol 1 and the old UI together. No data migration, no persisted state.
