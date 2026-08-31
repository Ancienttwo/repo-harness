> **Archived**: 2026-08-31 08:57
> **Related Plan**: plans/archive/plan-20260830-1903-r1-provider-neutral-agent-runtime.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260831-0857

# Task Contract: r1-provider-neutral-agent-runtime

> **Status**: Fulfilled
> **Plan**: plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 19:51
> **Review File**: `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md`
> **Notes File**: `tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Task Board can currently wake only the singleton Codex Provider Thread effect. Adding tmux directly to that provider-shaped surface would make pane identity, process success, and transcript output compete with Task/Lease, Engineer Binding, Inbox receipt, Publication, and Acceptance authority. R1 establishes one provider-neutral runtime-effect boundary before a second harness is admitted, so every Host action remains at-most-once and every positive delivery remains receipt-proven.

## Goal

Replace the active Provider Thread V1 runtime with one closed Agent Runtime V2 protocol for `codex-app-thread | tmux-cli-agent`, including persist-first journals, exact Task/Module receipt correlation, stale Claim/Lease/Binding fences, one-shot terminal-only V1 retirement, closed Host executors, renamed CLI/MCP/read projections, and server-owned Fleet delivery/reachability fields, while preserving Task/Lease/Collaboration/Publication/Acceptance authority and semantics.

## Scope

- In scope: V2 schemas and immutable store; Task-to-Binding proof; exact Task/Module receipt correlation; closed Codex App Thread and local already-bound tmux notification executors; `off | shadow | active` feature policy; V1 terminal-only retirement transaction; runtime-effect CLI/MCP/overlay naming; Fleet/operator read-model protocol bump; focused fault, migration, adapter, projection, and removal tests; accepted architecture projection and workflow closeout.
- Out of scope: creating or owning tmux sessions/panes; raw shell or arbitrary key injection; message content in argv/stdin/env/output parsing/logs; retries, cross-adapter fallback, provider/model routing, broadcast, Task ownership transitions, new Collaboration actors, Board-owned runtime state, or C8 browser presentation.
- Taste constraints: schema-first closed unions, deterministic observations, typed fail-closed recovery, and no V1 alias or dual decoder. The adapter action surface is exactly `notify_inbox`; successful process execution is never delivery evidence.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is invalid if an already-bound tmux endpoint cannot be notified using only an opaque bounded control reference, or if exact receipt correlation cannot prove the same message, delivery attempt, recipient generation, and effect without reading pane output. The cheapest proof is a focused adapter spy plus one local tmux canary before Fleet projection work: assert one argv-safe tmux process call, empty stdin/env additions, zero message-body bytes, and no `observed_success` until the canonical inbox receipt exists.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md`
- Notes file: `tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"r1-agent-runtime-contract-tests","kind":"deterministic_test","paths":["*"]},{"id":"codex-app-thread-live-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - AGENTS.md
  - CLAUDE.md
  - .archcontext/
  - docs/architecture/
  - docs/spec.md
  - docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md
  - tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md
  - tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md
  - tasks/workstreams/runtime-harness/agent-runtime-effects/
  - tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md
  - .ai/context/capabilities.json
  - .ai/harness/policy.json
  - .claude/templates/
  - src/
  - tests/
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
    - src/core/engineers/agent-runtime-effect.ts
    - src/effects/engineers/agent-runtime-effect-store.ts
    - src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts
    - src/effects/engineers/agent-runtime-adapters/tmux-cli-agent.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md
  tests_pass:
    - path: tests/unit/r1-provider-neutral-agent-runtime.test.ts
    - path: tests/unit/r1-agent-runtime-adapters.test.ts
  commands_succeed:
    - bun test tests/unit/r1-provider-neutral-agent-runtime.test.ts tests/unit/r1-agent-runtime-adapters.test.ts --timeout 60000
    - bun run check:type
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: PASS requires both adapters to produce the same closed action/observation protocol and exact inbox receipts to be the only positive-delivery authority.
- Edge cases: stale Claim/Lease/Binding, missing runtime or endpoint, unknown process outcome, lost receipt, non-terminal V1 records, adversarial pane output, and mode/adapter disablement all fail closed with zero retry or fallback.
- Regression risks: public CLI/MCP rename, one-shot V1 retirement, Board DTO protocol bump, and Git-common-dir journal migration are the independent review boundary.

## Rollback Point

- Commit / checkpoint: pre-R1 branch HEAD `24e6055476d30b1873bc4fff5c31ec4555fb6913`; accepted architecture boundary is retained as the design record.
- Revert strategy: set `agent_runtime.mode=off`, revert the unaccepted R1 implementation while preserving immutable V2 journals, and never revive the V1 runtime command or reader.
