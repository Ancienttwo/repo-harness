# Task Contract: herdr-task-agents-cutover

> **Status**: Active
> **Plan**: plans/plan-20260930-0438-herdr-task-agents-cutover.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-09-30 04:44
> **Review File**: `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md`
> **Notes File**: `tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

任务拥有持续的多 harness 参与者；Herdr 是唯一托管与寻址 authority。先以 H0 证明 root-linked topology、跨 owner 恢复与精确清理，避免把未成立的 runtime 假设带入原子 cutover。

## Goal

REQ-5 SIMPLIFY：净删除过度 host journal/schema/adapter/containment 设计，binding 回 protocol2。协作 provider 的 result/collect 原样可用；host 角色的 CLI result 拒绝，read/collect 不读 outbox，其 domain consumer 原路径不变。只保留现有 Claude host 的单调 working/idle/blocked 状态上报。

## Scope

- In scope: explicit shared task-session、原 Claude host/session、CLI 和原有 tests，移除 task-host-result.ts。
- Out of scope: campaign/containment/delegation（暂停），新的 host/adapter，真实模型/mini/global install。
- 净删除 commit canonical 后迁 MCP goal 至持久 Herdr，然后 [REQ-5 CHECKPOINT] 等回复。

## Stop Conditions

- 新增类型/字段/文件必须指向验收标准或既有保护；不能为未知将来实现预留。
- 不改 main dirty、w8:p1、mini、真实 ~/.codex ~/.claude；无真实模型调用。
- host domain consumer 不经 provider claim 出 Receipt；普通协作 claim 仍可读/collect。

## Falsifier

首个 proof point：真实 Herdr + 两个 deterministic harness peers，root-linked worktree → owner 1 投递退出 → owner 2 读绑定继续 → task panes/processes 精确清理，sentinel 存活。若官方 Herdr topology/identity API 无法证明这些条件则停止，不保留旧 runtime 作为替代。

## Root Cause Evidence

Not applicable: 新运行边界的 feasibility proof，Task Profile 为 code-change。

## Workflow Inventory

- Source plan: `plans/plan-20260930-0438-herdr-task-agents-cutover.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md`
- Notes file: `tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md`
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
{"protocol": 1, "reviewer": "Claude", "user_waiver": "forbidden"}
```

Current advisor-gatekeeper 的阶段性 PASS 是 H0 检查点，不伪造最终 AcceptanceReceipt；H4 迁移正式 receipt provenance 后由同一指定 reviewer 验收候选。

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260930-0438-herdr-task-agents-cutover.md
  - tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md
  - tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md
  - tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md
  - docs/researches/20260930-herdr-task-runtime-proof.md
  - src/core/engineers/task-host-result.ts
  - src/effects/terminal/task-session.ts
  - src/effects/terminal/task-role-profiles.ts
  - src/cli/commands/task-agent.ts
  - src/effects/review/claude-review-host.ts
  - src/effects/review/claude-review-session.ts
  - tests/cli/task-agent.test.ts
  - tests/herdr-task-lifecycle.test.ts
  - tests/claude-review.test.ts
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
    runner_invocations: 0
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: edit_and_gatekeep
      purpose: H0_execution_owner
    verifier:
      mode: read_only
      purpose: designated_advisor_gatekeeper
  runner:
    preferred:
      - herdr
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/terminal/task-session.ts
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "h3-host-authority",
      "kind": "command",
      "command": "bun test tests/herdr-task-lifecycle.test.ts tests/cli/task-agent.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "Host ownership startup/recovery plus existing private lifecycle and protected authority falsifiers.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "h3-review-binding",
      "kind": "command",
      "command": "REPO_HARNESS_TEST_EXPENSIVE=1 bun test tests/claude-review.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "Existing 21-case review behavior plus pre-fix Herdr status/ACK/unknown/free-text host seam falsifiers; no real model calls.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture-sync",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "project-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "adoption-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md required repository integrity; no apply or global install.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "h3-type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Exported shared runtime and CLI types cross review consumers; compiler checks this new cross-module boundary.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

- H1 PASS [REQ-3b] recorded in review/notes. H2 changes behavior; focused runtime and consumer suites execute current_exact.
- All real Herdr experiments use private HOME/unique named sessions and explicit IDs, no default-user inventory mutation or model/auth calls.
- Claude teardown root cause: catch-and-delete destroyed ledger/socket despite cancel failure; regression must fail before fix and prove identity-fenced completion before fixture deletion.
- Git authoritative common-dir/worktree readers reused, no filename-derived primary identity or fallback to caller root.
- Consumer checks retain Git merge/dirty/locked gates; runtime uncertainty refuses deletion. Typical entire canonical budget 300s, individual test file max 60s. No new full suite.
- mini and real model permissions/resume remain unverified; H3/H4/H5 carried gates stay in notes.

## Rollback Point

- Baseline: origin/main 43b7d72d；main checkout 原有 dirty 文件不变。
- H0 是 test/research/plan-only commit，可 revert 该 commit；fixture cleanup 只接触自己创建的 named session。
