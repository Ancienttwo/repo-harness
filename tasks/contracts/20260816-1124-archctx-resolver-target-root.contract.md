# Task Contract: archctx-resolver-target-root

> **Status**: Active
> **Plan**: plans/plan-20260816-1124-archctx-resolver-target-root.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-16 11:24
> **Review File**: `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md`
> **Notes File**: `tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

每次 archctx 升版都重开一个「发版→全域刷新」窗口：全域 bun CLI 从自身 consumerRoot 解析到旧 archctx，撞上目标 repo 的新 projection_version，strict Stop gate 反复阻塞（0.14.x 与 2026-08-16 各实际发生一次）。repo 自己 vendor 的正确版本从未被解析。不修，0.4.4 时第三次复发。

## Goal

按源计划 plans/plan-20260816-1124-archctx-resolver-target-root.md：`resolvePackageLocalArchctx` 解析起点改为目标 repoRoot 优先——repo 依赖树 vendor 了 archctx 就必须精确匹配 policy 版本（不匹配即 throw，不用 CLI 的洗白），repo 完全没 vendor 才回到 CLI consumerRoot 现行为。三个回归场景测试（含未修代码上的 pre-fix failure artifact），删除 tasks/todos.md 已兑现的 deferred 条目。

## Scope

- In scope: src/effects/architecture/archctx-provider.ts、tests/architecture-projection-provider.test.ts（及必要的 orchestration 测试 fixture 对齐）、tasks/todos.md 条目删除。
- Out of scope: drain/queue/Stop gate 逻辑、archctx 版本锚点、REPO_HARNESS_NODE_BIN runtime 解析、多级 fallback 链。EXECUTION_BOUNDARY：未列项是禁区。
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

若回归场景 (a)（repo vendor 匹配版本 + CLI 根不匹配）在未修代码上并不失败，说明窗口成因不在解析起点，方向错误。最便宜证点：先写场景 (a) 测试跑一次未修代码，必须红。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: src/effects/architecture/archctx-provider.ts:153 用 `options.consumerRoot ?? findConsumerRoot()` 从运行中 CLI 的包根解析 archctx，目标 repoRoot vendor 的正确版本从未参与解析。
- repro: 全域 bun CLI（自带 archctx 0.4.2）对 policy projection_version=0.4.3 且 vendor 0.4.3 的本 repo 跑 `repo-harness architecture-projection drain --json` → `package-local archctx mismatch: expected archctx@0.4.3, got archctx@0.4.2`（2026-08-16 Stop gate 实录）。
- regression_guard: tests/architecture-projection-provider.test.ts
- pre_fix_failure_artifact: tasks/notes/prefix-artifacts/archctx-resolver-target-root.prefix.log

## Workflow Inventory

- Source plan: `plans/plan-20260816-1124-archctx-resolver-target-root.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md`
- Notes file: `tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md`
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
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md
  - tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md
  - tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md
  - tasks/notes/prefix-artifacts/
  - src/effects/architecture/archctx-provider.ts
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
    - tasks/notes/prefix-artifacts/archctx-resolver-target-root.prefix.log
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md
  tests_pass:
    - path: tests/architecture-projection-provider.test.ts
    - path: tests/architecture-projection-orchestration.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
