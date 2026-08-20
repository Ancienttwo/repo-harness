> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260819-2155-finish-auto-cleanup.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: finish-auto-cleanup

> **Status**: Active
> **Plan**: plans/plan-20260819-2155-finish-auto-cleanup.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-19 21:55
> **Review File**: `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md`
> **Notes File**: `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The fail-closed `contract-worktree cleanup --slug` path already exists, but
nothing invokes it after a successful `finish --merge`. Merged contract
worktrees therefore accumulate on disk (12 stale worktrees, ~3.7GB observed on
this machine), and every stale worktree keeps a `codex/<slug>` branch plus a
`.ai/harness/worktrees/<slug>.json` metadata record alive, so later
coordination and lease reconciliation reason over worktrees that no longer
correspond to live work.

## Goal

At the tail of `finish --merge`, after the publication transaction is committed
and its EXIT trap is disarmed, attempt `cleanup --slug` as a subprocess run from
the target primary worktree. On success the worktree directory, the
`codex/<slug>` branch, and the `.ai/harness/worktrees/<slug>.json` record are
gone. On refusal the command degrades to a stderr hint naming the manual
`repo-harness run contract-worktree cleanup` invocation and finish still exits
0 — a refusal must never unwind a publication that already landed.

## Scope

- In scope:
  - `scripts/contract-worktree.sh` `finish_worktree` tail (cleanup attempt plus
    the refusal hint)
  - the byte-identical mirror `assets/templates/helpers/contract-worktree.sh`
  - `tests/contract-worktree-single-publication.test.ts` adaptation (read
    `sourceHead` from the `Source-Worktree-Head:` trailer; run git calls from
    the primary worktree) plus the new auto-cleanup regression describe block
  - `tests/continuation-conformance.test.ts` adaptation (capture ledger
    evidence before finish, or assert against the published tree)
- Out of scope:
  - `finish --no-merge` paths
  - any policy knob or opt-out for the cleanup attempt
  - the batch `repo-harness run ship-worktrees --cleanup-merged` flow
  - `cleanup_worktree`'s own fail-closed dirty-tree logic
- Taste constraints: user-facing hints in this helper use the
  `repo-harness run contract-worktree ...` form, never a repo-local
  `bash scripts/...` path that downstream package installs do not have.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the cleanup attempt can reach `finish_transaction_abort`, the direction is
wrong: an automatic cleanup refusal would then unwind a publication commit that
already landed on the target branch. Cheapest proof point: confirm the cleanup
block sits after `finish_transaction_commit` and that a refused cleanup leaves
finish's exit status at 0 — covered by the new regression describe block in
`tests/contract-worktree-single-publication.test.ts`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260819-2155-finish-auto-cleanup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md`
- Notes file: `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"contract-worktree-deterministic-suite","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260819-2155-finish-auto-cleanup.md
  - tasks/todos.md
  - tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md
  - tasks/reviews/20260819-2155-finish-auto-cleanup.review.md
  - tasks/notes/20260819-2155-finish-auto-cleanup.notes.md
  - scripts/contract-worktree.sh
  - assets/templates/helpers/contract-worktree.sh
  - tests/contract-worktree-single-publication.test.ts
  - tests/continuation-conformance.test.ts
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
    - scripts/contract-worktree.sh
    - assets/templates/helpers/contract-worktree.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260819-2155-finish-auto-cleanup.notes.md
  tests_pass:
    - path: tests/contract-worktree-single-publication.test.ts
    - path: tests/contract-worktree-squash-cleanup.test.ts
    - path: tests/contract-worktree-closeout-journal.test.ts
    - path: tests/continuation-conformance.test.ts
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bash -n scripts/contract-worktree.sh
    - cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: `finish --merge` publishes as before, then removes the
  merged worktree, its `codex/<slug>` branch, and its metadata record; a
  refused cleanup prints a two-line stderr hint and leaves finish at exit 0.
- Edge cases: cleanup runs as a subprocess with cwd and
  `REPO_HARNESS_TARGET_REPO_ROOT` set to the target primary worktree, because
  the parent process exported that variable as the linked worktree and the
  child would otherwise refuse; nothing runs after the cleanup block, so the
  process deleting its own cwd is safe.
- Regression risks: cleanup must stay strictly after
  `finish_transaction_commit` so a refusal cannot reach
  `finish_transaction_abort`; the two scripts must stay byte-identical.

## Rollback Point

- Commit / checkpoint: `main@e2a67b9657bc378a7cb1a580b4558b77f7af1c72`
- Revert strategy: single revert of the two-script edit plus the test
  adaptations; no data migration and no configuration change.
