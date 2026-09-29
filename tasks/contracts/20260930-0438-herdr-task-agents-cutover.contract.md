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

当前切片 H0：在隔离 fixture HOME、repo 和唯一 named Herdr session 中，证明两个不同 harness 的 deterministic participants 在 owner 退出后仍存活，新 owner 能从明确绑定继续发送请求，cleanup 保留 sentinel。盘点实际四 harness 的官方 CLI 能力；不声称模型认证或真实权限已验证。

## Scope

- In scope: Approved plan 修正、H0 composition proof、能力/退役 inventory、canonical 验证证据和 notes。
- Out of scope: H1–H6 production edits、default session 的控制/清理、mini canary、全局 installer/adoption、其他用户 agent。
- Taste constraints: 一个实际边界测试文件；无 production abstraction，无 compatibility；fixture control 在 CLI 调用前拒绝 default session。

## Stop Conditions

- 编辑超出当前 H0 allowed_paths 时停止并先更新 contract。
- H0 commit 完成后提交 [REQ-2]、SHA 与验证 evidence，等 advisor-gatekeeper PASS。
- runtime 当前身份/投递未知则报告并保留证据，不重放、不 signal 用户进程。
- 后续 H1/H4/H5 同样设置明确 PASS 检查点；未认证 harness 与未授权 mini 保留未闭环。

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
  - tests/herdr-task-lifecycle.test.ts
  - docs/researches/20260930-herdr-task-runtime-proof.md
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
    - tests/herdr-task-lifecycle.test.ts
    - docs/researches/20260930-herdr-task-runtime-proof.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "h0-herdr-composition",
      "kind": "command",
      "command": "bun test tests/herdr-task-lifecycle.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "\u771f\u5b9e PTY\u3001process \u4e0e\u6587\u4ef6\u6062\u590d\u8fb9\u754c\uff1bfake model \u4ec5\u7528\u4e8e\u786e\u5b9a\u6027 protocol\uff0cscope \u53ea\u9650 disposable fixture\u3002",
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
    }
  ]
}
```

## Acceptance Notes (Human Review)

- Existing herdr-transport 与 Claude review tests 分别验证 transport/单 provider lifecycle；未覆盖 root-linked topology 与 owner 退出后跨角色恢复。新 composition file 只拥有这个跨模块边界。
- 使用真实 Herdr + deterministic Codex/Claude named peers，不调用模型/登录；独立 fixture HOME。预算 60s，记录实际成本。
- H0 生产代码未变，保留 required integrity，不加 full-suite 或 typecheck。
- 实际 executable/help 不是认证、read-only 或 model proof。mini 未授权。
- 执行 refs 在 .ai/harness/runs/；durable conclusions 在 research，非显而易见偏差在 notes。

## Rollback Point

- Baseline: origin/main 43b7d72d；main checkout 原有 dirty 文件不变。
- H0 是 test/research/plan-only commit，可 revert 该 commit；fixture cleanup 只接触自己创建的 named session。
