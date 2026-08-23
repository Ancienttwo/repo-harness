> **Archived**: 2026-08-23 13:07
> **Related Plan**: plans/archive/plan-20260823-0454-task-inbox-v1.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260823-1307

# Task Contract: task-inbox-v1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260823-0454-task-inbox-v1.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-23 04:55
> **Review File**: `tasks/reviews/20260823-0454-task-inbox-v1.review.md`
> **Notes File**: `tasks/notes/20260823-0454-task-inbox-v1.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

WP0-WP2 now provide durable publication identity, lifecycle recovery, readiness, and safe task acquisition, but workers still have no task-addressed communication channel. Using session IDs, transcripts, PTYs, or handoff files would create a second authority and would let claim-private messages cross takeover generations. WP3-A creates the bounded communication fact that WP4 may later project without changing task, lease, publication, or merge authority.

## Goal

Implement PRD v3 Module 6A Task Inbox V1: immutable task-message events, separate per-recipient delivery receipts, JSON CLI send/list/ack surfaces, and a Claude/Codex `UserPromptSubmit.inbox` hook. Claim-scoped delivery must be fenced to exact claim/generation, task-scoped delivery must follow takeover until one valid acknowledgement, hook rendering must be bounded and explicitly untrusted, and all message operations must preserve lease owner bytes exactly.

## Scope

- In scope: pure event/receipt contracts; canonical JSON/digests and body/count limits; git-common-dir create-if-absent storage; canonical task and lease fencing under the task lock; boundary-derived sender/recipient identity; `fleet message send`, `fleet inbox list`, `fleet inbox ack`; a typed cross-host `UserPromptSubmit.inbox` route; takeover, idempotency, malformed storage, and lease-byte invariance tests.
- Out of scope: MCP mirror, provider feedback/WP3, fleet board/WP4, daemon/webhook/SSE, PTY/tmux, CLI resume, session wake/liveness, transcript exchange, handoff/resume writes, lease schema/state changes, remote claims, broadcast delivery, compatibility aliases, or any change to `COORDINATION_PROTOCOL` and task digest domains.
- Taste constraints: message history is non-authoritative; no caller-supplied trust metadata or recipient paths; no liveness inference; no regex secret/transcript detector; hook content must not participate in prompt routing or workflow authorization.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if a current owner cannot be identified from the existing active-plan claim token and then revalidated against canonical task/lease/worktree facts, or if the host runtime cannot emit structured additional context from an independent `UserPromptSubmit` route on both Claude and Codex. Cheapest proof: focused hook fixtures must resolve exact C/G, show C/G superseded after takeover, deliver only task scope to C2/G+1, and keep the lease file byte-identical.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260823-0454-task-inbox-v1.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260823-0454-task-inbox-v1.review.md`
- Notes file: `tasks/notes/20260823-0454-task-inbox-v1.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"task-inbox-deterministic-contract","kind":"deterministic_test","paths":["src/core/fleet/task-message.ts","src/effects/fleet/task-inbox.ts","src/cli/commands/fleet.ts","src/cli/hook/task-inbox-handler.ts","src/cli/hook/route-registry.ts","src/cli/hook/handler-registry.ts","src/cli/hook/runtime.ts","src/core/loop/loop-event-protocol.ts","tests/unit/task-message-v1.test.ts","tests/unit/task-inbox-v1.test.ts","tests/cli/fleet-task-inbox.test.ts","tests/task-inbox-hook.test.ts","tests/loop-event-protocol.test.ts"]},{"id":"task-inbox-runtime-readback","kind":"runtime_readback","paths":["docs/architecture/.projection-manifest.json","docs/architecture/global-hook-runtime.md","scripts/hook-dispatch-diet-report.ts","src/cli/commands/fleet.ts","src/cli/hook/handler-registry.ts","src/cli/hook/route-registry.ts","src/cli/hook/runtime.ts","src/cli/hook/task-inbox-handler.ts","src/cli/installer/managed-entries.ts","src/core/fleet/task-message.ts","src/core/loop/loop-event-protocol.ts","src/effects/fleet/task-inbox.ts","tests/cli/doctor.test.ts","tests/cli/fleet-task-inbox.test.ts","tests/cli/init-hook.test.ts","tests/cli/install.test.ts","tests/cli/route-registry.test.ts","tests/cli/status.test.ts","tests/hook-contracts.test.ts","tests/hook-dispatch-diet-report.test.ts","tests/hook-runtime-characterization.test.ts","tests/install-profiles.test.ts","tests/loop-event-protocol.test.ts","tests/task-inbox-hook.test.ts","tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts","tests/unit/task-inbox-v1.test.ts","tests/unit/task-message-v1.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260823-0454-task-inbox-v1.contract.md
  - tasks/reviews/20260823-0454-task-inbox-v1.review.md
  - tasks/notes/20260823-0454-task-inbox-v1.notes.md
  - docs/architecture/.projection-manifest.json
  - src/core/fleet/task-message.ts
  - src/effects/fleet/task-inbox.ts
  - src/cli/commands/fleet.ts
  - src/cli/hook/task-inbox-handler.ts
  - src/cli/hook/route-registry.ts
  - src/cli/hook/handler-registry.ts
  - src/cli/hook/runtime.ts
  - src/cli/installer/managed-entries.ts
  - src/core/loop/loop-event-protocol.ts
  - scripts/hook-dispatch-diet-report.ts
  - docs/architecture/global-hook-runtime.md
  - tests/unit/task-message-v1.test.ts
  - tests/unit/task-inbox-v1.test.ts
  - tests/cli/fleet-task-inbox.test.ts
  - tests/task-inbox-hook.test.ts
  - tests/hook-runtime.test.ts
  - tests/hook-contracts.test.ts
  - tests/cli/route-registry.test.ts
  - tests/cli/install.test.ts
  - tests/cli/init-hook.test.ts
  - tests/cli/status.test.ts
  - tests/hook-dispatch-diet-report.test.ts
  - tests/loop-event-protocol.test.ts
  - tests/install-profiles.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts
  - tests/cli/doctor.test.ts
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
    - src/core/fleet/task-message.ts
    - src/effects/fleet/task-inbox.ts
    - src/cli/hook/task-inbox-handler.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260823-0454-task-inbox-v1.notes.md
  tests_pass:
    - path: tests/unit/task-message-v1.test.ts
    - path: tests/unit/task-inbox-v1.test.ts
    - path: tests/cli/fleet-task-inbox.test.ts
    - path: tests/task-inbox-hook.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/cli/install.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: one immutable event per message ID; task/claim scoped delivery with separate recipient receipts; CLI manual surfaces; real-turn cross-host hook delivery in a bounded untrusted block.
- Edge cases: identical retry, conflicting ID, malformed/symlink storage, UTF-8 byte limit, canonical revision drift, unowned claim, takeover supersession, task-scope global acknowledgement, missing/ambiguous claim token, count/total hook budget.
- Regression risks: changing installed hook route counts, Codex structured-output suppression, accidental prompt-classifier coupling, duplicate hook injection, lease write through a communication path, or unsafe recipient path construction.

## Rollback Point

- Commit / checkpoint: pre-WP3-A `1978de69`.
- Revert strategy: revert the single WP3-A publication unit; WP0-WP2 remain intact because Task Inbox owns no workflow authority.
