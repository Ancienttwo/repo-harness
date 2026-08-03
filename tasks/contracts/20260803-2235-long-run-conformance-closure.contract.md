# Task Contract: long-run-conformance-closure

> **Status**: Active
> **Plan**: plans/plan-20260803-2235-long-run-conformance-closure.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-03 22:35
> **Review File**: `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md`
> **Notes File**: `tasks/notes/20260803-2235-long-run-conformance-closure.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Long-run continuation is safe only when the documented tick can be executed
literally and destructive closeout has exactly one owner. The completed
anti-drift sprint currently has three acceptance gaps: the receipt ordering
asks for an after-token before it exists, the conformance fixture bypasses
public command sequencing, and concurrent finish/ship processes can both pass
the journal's check-then-act guard. Shipping that state turns recovery and
stall protection into single-host conventions instead of enforced contracts.

## Goal

Make the continuation protocol executable as written, make its disposable-repo
proof exercise the public host command order, and make finish/ship closeout
single-owner before any lifecycle or external effect. Preserve Effective State
and the Sprint marker as the only next-work authority, then refresh and smoke
the installed CLI after source verification passes.

## Scope

- In scope: Git-common-dir closeout ownership for finish and ship; explicit
  recovery interaction with that ownership; concurrent regression coverage;
  tick ordering; conformance command/gate sequencing; durable research wording;
  source and installed-runtime verification.
- Out of scope: scheduler, daemon, timer, quota/token ledger, journal GC,
  automatic stale-lock reclaim, automatic crash resume, new task authority,
  compatibility aliases, release publishing, and unrelated deferred goals.
- Taste constraints: one owner and one authority per datum; fail closed instead
  of guessing; use existing shell/helper boundaries; keep source/template helper
  projections byte-identical; do not add a second transaction abstraction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

- Direction is falsified if two same-worktree closeouts can both cross the owner
  boundary or either loser reaches lifecycle, merge, push, or shared journal
  writes. Cheapest proof: an adversarial two-process fixture held at the claim
  boundary before production implementation.
- Direction is falsified if conformance still passes after deleting or
  reordering an envelope-named command or documented gate step.
- Deployment closure is falsified if the refreshed installed CLI still lacks
  `state next` or `state attempt`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/contract-worktree.sh:572-638` and its ship/template mirror perform a non-atomic scan-before-mkdir journal begin, while `docs/reference-configs/long-run-continuation.md:15-16` records a receipt before the closing envelope that supplies its required after token.
- repro: run two same-worktree `contract-worktree finish --merge` processes while the first is paused before journal begin, and separately follow the documented tick using only observed envelope tokens.
- regression_guard: tests/contract-worktree-closeout-journal.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260803-2235-long-run-conformance-closure/pre-fix-concurrent-closeout.log

## Workflow Inventory

- Source plan: `plans/plan-20260803-2235-long-run-conformance-closure.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md`
- Notes file: `tasks/notes/20260803-2235-long-run-conformance-closure.notes.md`
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
  - docs/spec.md
  - docs/reference-configs/long-run-continuation.md
  - docs/researches/20260803-loopx-comparative-analysis.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md
  - tasks/reviews/20260803-2235-long-run-conformance-closure.review.md
  - tasks/notes/20260803-2235-long-run-conformance-closure.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/contract-worktree.sh
  - scripts/ship-worktrees.sh
  - assets/templates/helpers/contract-worktree.sh
  - assets/templates/helpers/ship-worktrees.sh
  - tests/contract-worktree-closeout-journal.test.ts
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - docs/reference-configs/long-run-continuation.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260803-2235-long-run-conformance-closure.notes.md
    - .ai/harness/runs/20260803-2235-long-run-conformance-closure/pre-fix-concurrent-closeout.log
  tests_pass:
    - path: tests/contract-worktree-closeout-journal.test.ts
    - path: tests/continuation-conformance.test.ts
  commands_succeed:
    - bun test tests/contract-worktree-closeout-journal.test.ts tests/continuation-conformance.test.ts tests/continuation-envelope.test.ts tests/continuation-attempt.test.ts
    - bun run check:type
    - bun scripts/sync-helper-sources.ts --check
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: exactly one same-worktree closeout owns finish/ship;
  receipt tokens are captured envelope-to-envelope; conformance executes public
  command order; installed CLI smoke passes after refresh.
- Edge cases: simultaneous begin before status publication, SIGKILL leaving an
  owner claim, explicit abort/reconcile, completed replay, and stable
  no-progress halt after receipt publication.
- Regression risks: a lock that becomes a second recovery authority, automatic
  stale reclaim, helper projection drift, or a conformance stub that can pass
  without executing the public protocol.

## Rollback Point

- Commit / checkpoint: baseline `737dcdce3668abd63d5fb9381a74a04d4ebb8322`.
- Revert strategy: revert the isolated `codex/long-run-conformance-closure`
  commit; if user-level CLI refresh fails, reinstall the prior `0.12.2` package.
