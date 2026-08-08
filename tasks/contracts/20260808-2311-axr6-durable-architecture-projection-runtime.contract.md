# Task Contract: axr6-durable-architecture-projection-runtime

> **Status**: Active
> **Plan**: plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md
> **Task Profile**: code-change
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-08 23:11
> **Review File**: `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md`
> **Notes File**: `tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

AXR5 已固定 typed provider boundary，但真实 Stop path 仍逐 path 调旧 helper，并可能在
subprocess 非零退出后删除 pending event。若直接自动化，架构更新会丢事件、重复触发或
被 projection 自己写出的 docs/context 形成循环。

## Goal

把 enabled ArchContext provider 接进 durable Stop runtime：十个 edit path 合并为一个
120 秒 bounded job；pending/running/receipt/dead-letter 原子持久化；typed refresh signal
exactly-once 消费；三次失败后 dead-letter；Stop host timeout 150 秒，其余 route 30 秒。

## Scope

- In scope: PostEditJournalEventV2 bounded migration；projection job store/orchestrator；
  refresh consumer；Stop/manual drain/SessionStart wiring；Claude/Codex managed timeout；
  chaos、installer 与真实 host-cycle tests。
- Out of scope:
  - 10-doc adoption、capability authority cutover、npm publish、registry dependency pin、strict-by-default policy。
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

若十个 eligible paths 触发多于一个 provider process，或 exit/timeout/stale snapshot 后
source event 消失，或 projection-owned path 产生第二个 job，则方向被证伪。最便宜 proof
是 `tests/architecture-projection-orchestration.test.ts` 的 injected runner + temporary repo。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md`
- Notes file: `tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md`
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
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md
  - tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md
  - tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/workflow-contract.json
  - .ai/harness/policy.json
  - .gitignore
  - .claude/templates/
  - assets/
  - docs/reference-configs/
  - scripts/
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/architecture/projection-jobs.ts
    - src/effects/architecture/projection-orchestrator.ts
    - src/effects/architecture/refresh-consumer.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md
  tests_pass:
    - path: tests/architecture-projection-orchestration.test.ts
    - path: tests/mutation-observed.test.ts
    - path: tests/stop-handler.test.ts
    - path: tests/install-profiles.test.ts
    - path: tests/session-context.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
```

## Acceptance Notes (Human Review)

- Functional behavior: one Stop drains at most one aggregate job and commits receipt before ack。
- Edge cases: exit/signal/timeout/corrupt JSON/stale snapshot/partial refresh/duplicate signal/crash replay。
- Regression risks: Stop latency budget、existing non-architecture deferred consumers、installer sibling hooks。

## Rollback Point

- Commit / checkpoint: AXR6 implementation commit on `codex/axr6-durable-architecture-projection-runtime`.
- Revert strategy: revert AXR6 as one unit；preserve runtime receipts/dead letters as evidence。
