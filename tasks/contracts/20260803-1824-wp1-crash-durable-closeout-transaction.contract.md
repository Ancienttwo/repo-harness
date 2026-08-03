# Task Contract: wp1-crash-durable-closeout-transaction

> **Status**: Active
> **Plan**: plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-03 18:24
> **Review File**: `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md`
> **Notes File**: `tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Closeout (contract-worktree finish, ship-worktrees) mutates `plans/`, `tasks/`,
three `.ai/harness/` pointers, `.claude/.plan-state`, and HEAD, but its rollback
snapshot lives in `mktemp -d` and `original_head` only in a shell variable,
recoverable solely via an EXIT trap (`assets/templates/helpers/contract-worktree.sh:459-509`;
same shape in `ship-worktrees.sh:123-191`). Ship additionally pushes before
creating the PR (`ship_linked_pr`, `ship-worktrees.sh:491`). A SIGKILL, power
loss, or closed terminal mid-closeout therefore leaves a half-completed state
with **no discoverable, verifiable recovery entry** — the verified defect from
`docs/researches/20260803-loopx-comparative-analysis.md` §7.1. Unattended
long-run execution (this sprint's goal) makes such interrupts routine, so this
is the safety precondition for every later WP.

## Goal

Make finish and ship crash-durable via `CloseoutJournalV1`: a per-operation
transaction journal under
`<git-common-dir>/repo-harness/transactions/<operation>/<transaction-key>/`
with a deterministic transaction key bound to (repo identity, worktree,
operation, plan/contract, original HEAD, target/base SHA). Phases
`prepared → implementation_committed → gate_sealed → lifecycle_applied →
lifecycle_committed → merged|pushed → pr_observed → complete`, each persisted
via temp file + fsync + atomic rename before the phase's effect is considered
committed; the pre-closeout snapshot and original HEAD move into the journal
directory so they outlive the process. Normal finish/ship invocations fail
closed when an `in_progress` journal exists for the same key. Recovery is an
explicit subcommand surface: `recover inspect` (report), `recover abort`
(restore pre-closeout state; allowed only before any merge/push phase),
`recover reconcile` (after an external effect: verify what already happened
and complete only the missing steps — e.g. post-push interrupt completes only
PR creation; never roll back remote effects). No auto-resume anywhere.

## Scope

- In scope: `contract-worktree.sh` (finish transaction) and
  `ship-worktrees.sh` (ship transaction) — edited in their canonical location
  `scripts/` and projected into `assets/templates/helpers/` by
  `bun scripts/sync-helper-sources.ts --write`, since `scripts/` is the source
  of truth and `assets/templates/helpers/` is the byte-identical projection
  enforced by `tests/helper-scripts.test.ts`; a shared journal helper if the
  two scripts need one, new fault-injection + journal tests under `tests/`,
  the contract's notes file.
- Out of scope: WP2/WP3/WP4 surfaces (`state next`, attempt receipts,
  conformance doc); any change to `src/` state resolution (the journal
  no-read guard is proven by tests, not by editing resolvers);
  `.ai/harness/policy.json` (pending architecture request — do not touch);
  auto-resume; any journal read path in Effective State or collectors.
- Taste constraints: match the existing helper style (bash, `set -euo
  pipefail` conventions already in the scripts); journal payloads are plain
  JSON files; no new runtime dependencies.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if making a phase durable would require changing the *order* of
  existing closeout effects in a way that alters observable finish/ship
  semantics beyond adding journal writes and fail-closed re-entry — that is a
  design fork for the parent, not a worker decision.

## Falsifier

Direction is wrong if per-phase SIGKILL injection shows the existing EXIT
trap already yields a discoverable, verifiable recovery entry (journal
redundant), or if `git rev-parse --git-common-dir` is unreliable inside the
linked worktrees these helpers run in. Cheapest proof point first: in a
fixture repo, `kill -9` the finish helper between the lifecycle commit and
merge, then demonstrate from a fresh process that no on-disk pointer locates
the snapshot or original HEAD (this is the defect; if it cannot be
demonstrated, stop and hand back).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md`
- Sprint: `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md` (WP1 spec)
- Research: `docs/researches/20260803-loopx-comparative-analysis.md` (§7.1 + addendum)
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md`
- Notes file: `tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md`
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
  - scripts/contract-worktree.sh
  - scripts/ship-worktrees.sh
  - assets/templates/helpers/
  - tests/
  # plans/ directory scope (scaffold default restored): finish machinery moves
  # the plan into plans/archive/ and back-fills the sprint backlog row.
  - plans/
  - tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md
  - tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md
  - tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md
  # tasks/todos.md: sprint start-task machinery stamps it and closeout adds the
  # gatekeeper-recommended GC deferred-goal row; ledger writes are sanctioned.
  - tasks/todos.md
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/templates/helpers/contract-worktree.sh
    - assets/templates/helpers/ship-worktrees.sh
    - tests/contract-worktree-closeout-journal.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md
  tests_pass:
    - path: tests/contract-worktree-closeout-journal.test.ts
    - path: tests/contract-worktree-squash-cleanup.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/sprint-backlog.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: SIGKILL at every journal phase leaves a discoverable
  journal; `recover inspect` locates snapshot + original HEAD from a fresh
  process; rerun after recover never duplicates a push or merge; post-push
  interrupt reconciles to only the missing `pr_observed` step.
- Edge cases: journal for a different worktree/key must not block this one;
  `recover abort` refused after merge/push phases; identical re-invocation of
  a `complete` transaction is a no-op replay, not a second closeout.
- Regression risks: normal (uninterrupted) finish/ship behavior must be
  byte-identical in observable outputs except journal writes; a test proves
  Effective State resolution output is identical with and without an
  `in_progress` journal present (no-read guard).

## Rollback Point

- Commit / checkpoint: worktree branch `codex/wp1-crash-durable-closeout-transaction` based on `5d6a9e411390ffc971acfb4097d70abc80ef3156`.
- Revert strategy: discard the branch/worktree; no primary-tree state is touched before finish.
