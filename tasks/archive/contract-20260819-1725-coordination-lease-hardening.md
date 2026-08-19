> **Archived**: 2026-08-19 17:25
> **Related Plan**: plans/archive/plan-20260819-1519-coordination-lease-hardening.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260819-1725

# Task Contract: coordination-lease-hardening

> **Status**: Fulfilled
> **Plan**: plans/plan-20260819-1519-coordination-lease-hardening.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-19 15:22
> **Review File**: `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md`
> **Notes File**: `tasks/notes/20260819-1519-coordination-lease-hardening.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The landed WP1 shared-lease plane (main `f5f4d8ce`) left five conformance deviations against
the approved spec (`docs/researches/20260819-GPT-kanban.md`, 落地状态与符合度修订 section).
Three of them keep the exact failure surfaces WP1 exists to close: a tree without the owning
claim token can still flip a claimed sprint row to `[x]` (inline `complete-task` has no lease
gate before the rewrite), a steal can land on a `completing` lease and erase the publication
window marker, and the owner record lacks the `generation` / `target_ref` /
`finish_transaction_key` fields that fencing history, canonical-ref validation, and finish
recovery need. The schema fields are on-disk schema: once the first live lease is written,
adding them becomes a protocol bump with a lease migration instead of a constant change.
Skipping this slice leaves false-completion and publication-window corruption open and closes
the migration-free window permanently.

## Goal

Close the HIGH deviations while `$GIT_COMMON_DIR/repo-harness/coordination/v1/` is still
absent or empty, per the plan's Task Breakdown T1-T6:

- owner record carries `generation` (claim mints 1, steal increments), `target_ref` (captured
  at claim; `begin-completion`/`reconcile` fail closed when their `--target-ref` disagrees),
  and `finish_transaction_key` (set by begin-completion from the closeout journal key);
  `parseLeaseOwnerRecord` rejects records missing them, protocol stays 1
- `stealLeaseRecord` rejects `state = completing`; `releaseLeaseRecord` accepts only
  `reserving` and `bound`
- inline `cmd_complete_task` refuses to rewrite a claimed row unless this worktree holds the
  matching claim token; rows with no lease complete unchanged
- `sprint claim`/`sprint steal` fail closed on a legacy in-flight marker without the v1
  `protocol.json` marker, and a missing `git` binary is an error, never a silent gate skip
- `recordCutoverInstalled` runs only after `runAdoptionApply` succeeds
- each closed deviation is pinned by a falsification test

Precondition (fail closed): if any lease exists under `coordination/v1/leases/`, stop and
hand back — this contract does not authorize a protocol bump or lease migration.

## Scope

- In scope: the owner-record schema fields and their validation; the steal/release state
  guards; the inline completion gate in `scripts/sprint-backlog.sh` plus its byte-identical
  template mirror; claim-side legacy fail-closed and the typed missing-git error; the init
  cutover marker ordering fix; falsification tests for each of the above.
- Out of scope: audit event log (`events/<task-id>.jsonl`), reconcile git-topology orphan
  cleanup, `completing -> bound` finish-abort recovery, reconcile finish-journal completion,
  claim-time canonical dirty check, bind-time `resumed` receipt, board projection (WP2), hook
  wiring (WP3), metadata relocation (WP4), any change to `AttemptReceiptV1`, any protocol
  version bump.
- Taste constraints: mirror the existing pure-projection split in `src/core/state/` and
  `src/effects/state/`; shell changes follow the existing style in `scripts/sprint-backlog.sh`;
  `assets/templates/helpers/` mirrors stay byte-identical.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if any lease record exists under `$GIT_COMMON_DIR/repo-harness/coordination/v1/leases/`.

## Falsifier

If the inline completion gate breaks the zero-coordination single-agent flow (a repo that
never claims must still complete inline rows exactly as before), the gate design is wrong.
Cheapest proof point: run the existing inline completion cases in `tests/sprint-backlog.test.ts`
with no lease store present before touching anything else.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260819-1519-coordination-lease-hardening.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md`
- Notes file: `tasks/notes/20260819-1519-coordination-lease-hardening.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"coordination-deterministic-suite","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260819-1519-coordination-lease-hardening.md
  - tasks/todos.md
  - tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md
  - tasks/reviews/20260819-1519-coordination-lease-hardening.review.md
  - tasks/notes/20260819-1519-coordination-lease-hardening.notes.md
  - src/core/state/coordination-identity.ts
  - src/effects/state/coordination-lease-store.ts
  - src/effects/state/coordination-cutover.ts
  - src/cli/commands/sprint.ts
  - src/cli/commands/init.ts
  - scripts/sprint-backlog.sh
  - assets/templates/helpers/sprint-backlog.sh
  - tests/
  # Amended after T1-T6 delivery: this work package's own changes stranded two
  # named call sites in contract-worktree.sh — begin-completion gained
  # --finish-transaction-key but the only holder of the closeout journal key
  # (sprint_lease_begin_completion) never passes it, and the T2 release guard
  # makes sprint_lease_release_after_publication (which runs at `completing`)
  # always fail into its warning path. Repairing call sites this change itself
  # invalidated is completing the change, not widening it; both files are named
  # exactly, no scripts/ or assets/ prefix is opened.
  - scripts/contract-worktree.sh
  - assets/templates/helpers/contract-worktree.sh
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
    - scripts/sprint-backlog.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260819-1519-coordination-lease-hardening.notes.md
  tests_pass:
    - path: tests/coordination-identity.test.ts
    - path: tests/coordination-lease-store.test.ts
    - path: tests/sprint-claim-concurrency.test.ts
    - path: tests/sprint-backlog.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - cmp scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh
    - cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base `d1114bed` on `codex/coordination-lease-hardening`
- Revert strategy: one synthesized publication commit, one revert; the empty-lease-store precondition guarantees no on-disk lease state depends on the new schema until this slice publishes
