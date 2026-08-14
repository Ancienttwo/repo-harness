# Task Contract: architecture-queue-idempotent-events

> **Status**: Fulfilled
> **Plan**: plans/plan-20260814-0157-architecture-queue-idempotent-events.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-15 00:58
> **Review File**: `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md`
> **Notes File**: `tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Every Stop recomputes the current dirty path set. Without an idempotency boundary at the queue writer, a still-pending file is recorded as a new architecture event solely because wall-clock time advanced, leaving tracked architecture cards and their derived index permanently dirty.

## Goal

Repeated `architecture-queue record` calls for the same pending file and unchanged semantic routing must leave the request card, architecture index, and append-only event log byte-identical while genuine new files or changed routing fields continue to update the queue.

## Scope

- In scope: semantic no-op detection; one locked queue transaction across audit event, request card, and index; canonical card authority validation; symlink-safe atomic writes; packaged helper projection; focused regression tests and workflow evidence.
- Out of scope: architecture classification, capability resolution, ArchContext projection policy, request archival, and any existing downstream WIP.
- Taste constraints: Preserve fail-closed helper output handling and the existing `[ArchitectureDrift] Request:` contract for real updates.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a repeated unchanged record must create a distinct queue edit for correctness, or if the proposed comparison suppresses a genuine new file/routing change, the direction is wrong. The cheapest proof is a fixture that records A, records B, then records A again and compares card/index/event bytes while asserting B remains recorded.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/architecture-event.ts` `upsertRequest` merged by `file_path` but always preferred the incoming later `ts`, while `scripts/architecture-queue.sh` always appended and reindexed, so an unchanged pending path became a new durable event on every Stop.
- repro: run `repo-harness run architecture-queue record --file .ai/harness/policy.json` twice in a repository with a pending root request and compare `docs/architecture/requests/root.md`, `docs/architecture/index.md`, and `.ai/harness/architecture/events.jsonl`.
- regression_guard: tests/architecture-queue.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/architecture-queue-idempotent-events-pre-fix.txt

## Workflow Inventory

- Source plan: `plans/plan-20260814-0157-architecture-queue-idempotent-events.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md`
- Notes file: `tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"sha256:87cd8b2f319b93ec0c20ceee263cfee3b0ec9eafafb064e14cd94156a9c94afc","kind":"deterministic_test","paths":["*"]},{"id":"architecture-queue-runtime","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260814-0157-architecture-queue-idempotent-events.md
  - tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md
  - tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md
  - tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md
  - scripts/architecture-event.ts
  - scripts/architecture-queue.sh
  - scripts/archive-architecture-request.sh
  - assets/templates/helpers/architecture-event.ts
  - assets/templates/helpers/architecture-queue.sh
  - assets/templates/helpers/archive-architecture-request.sh
  - tests/architecture-queue.test.ts
  - tests/architecture-event.test.ts
  - tests/architecture-sync.test.ts
  - tests/archive-evidence-gates.test.ts
  - tests/helper-scripts.test.ts
  - tests/stop-handler.test.ts
  - src/cli/hook/session-context.ts
  - tests/session-context.test.ts
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
    - scripts/architecture-event.ts
    - scripts/architecture-queue.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/architecture-queue-idempotent-events-pre-fix.txt
    - tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md
  tests_pass:
    - path: tests/architecture-queue.test.ts
  commands_succeed:
    - bun test tests/architecture-queue.test.ts tests/architecture-event.test.ts
    - bun run check:helpers
    - bash scripts/architecture-queue.sh reindex --check
```

## Acceptance Notes (Human Review)

- Functional behavior: unchanged repeated pending-file observations perform no durable architecture queue write.
- Edge cases: a previously observed file repeated after another file remains a no-op; a genuinely different file still increments open edits.
- Safety cases: interruption recovery, concurrent records, symlink escape, malformed/forged/non-Pending cards, mixed severity, and Markdown pipe paths fail closed or converge without loss.
- Regression risks: semantic comparison must include routing/module/contract fields so a capability remap cannot be suppressed.

## Rollback Point

- Commit / checkpoint: branch `codex/architecture-queue-idempotent`
- Revert strategy: revert the two canonical helpers, their two packaged projections, the focused test, and this workflow package together.
