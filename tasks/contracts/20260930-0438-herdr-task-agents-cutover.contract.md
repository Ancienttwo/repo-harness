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

当前切片 H1 / REQ-3b：修复 B1 stdin 完整输入、B2 显式 start deadline 与真实路径覆盖、B3 unbound receipt cleanup、B4 canonical spec 与公共 args 限制；共享 Herdr task-role 生命周期、write-ahead 与原子并发 start、文件 request/result 和 round budget、created/attached identity-safe cleanup。Claude review 必须调用提取后的共享实现，现有生命周期行为继续通过。H1 不调用真实模型；真实 harness capability 均为 unverified。

## Scope

- In scope: 下列明确文件中的 shared task-session、task-agent CLI、Herdr transport、Claude review consumers 和对应 focused coverage。
- Out of scope: H2 worktree orchestration、H3 fleet/campaign/MCP cutover、H4 old provider retirement、H5 installer/policy cutover、mini/真实模型 canary。
- H1 public schema 不含 Codex/Claude 专属 authority；新 CLI 不暴露 server stop，attached objects 不可 close/cancel。

## Stop Conditions

- Stop before paths outside H1 scope.
- 修正以新 commit 保留 b4b48c00，完成后向 advisor-gatekeeper 发 [REQ-3b] + SHA + canonical evidence；等 PASS 才进入 H2。
- 不在 default/mini 执行 cleanup 或测试，不动用户 pane/进程。真实 model canary 仅 H4 前通知 reviewer 后执行。
- uncertain start/delivery 保留 intent，reconcile Herdr live state；不得重放或新建替代 agent。

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
  - tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md
  - src/effects/terminal/herdr.ts
  - src/effects/terminal/task-session.ts
  - src/cli/commands/task-agent.ts
  - src/cli/index.ts
  - src/effects/review/claude-review-session.ts
  - src/effects/review/claude-review-host.ts
  - tests/herdr-task-lifecycle.test.ts
  - tests/claude-review.test.ts
  - tests/cli/task-agent.test.ts
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
    - src/effects/terminal/task-session.ts
    - src/cli/commands/task-agent.ts
    - tests/cli/task-agent.test.ts
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "h1-task-lifecycle",
      "kind": "command",
      "command": "bun test tests/herdr-task-lifecycle.test.ts tests/cli/task-agent.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "Real Herdr concurrent process start, interruption/reconciliation, file delivery and created-only identity cleanup; no model/auth invocation. REQ-3b changes behavior, so prior H1 baselines do not satisfy this correction.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "h1-claude-behavior",
      "kind": "command",
      "command": "REPO_HARNESS_TEST_EXPENSIVE=1 bun test tests/claude-review.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "Extraction changes existing real provider-host lifecycle. Preserve same-child rounds, startup/cancel/identity, findings, deadline and receipt behavior in disposable fixtures. REQ-3b changes behavior, so prior H1 baselines do not satisfy this correction.",
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
      "id": "h1-type",
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

- REQ-3b changes runtime behavior in B1–B4; both focused runtime suites must execute current_exact. Existing H1 baselines cannot authorize this patch.
- Extend existing composition coverage for production agent start (11s external readiness and 4s timeout), no binding cleanup and observed PID survivor, canonical key order, and public argv denial. No new test file or dependency.
- Existing Claude suite is the behavior boundary for restored full stdin and shared result/round primitives; no real model calls.
- Real Herdr needed for pane lifecycle/readiness/cleanup; all fixtures use private HOME/named sessions. Test file deadline 60s; whole canonical plan budget 120s.
- H2/H3/H5 carried gates are in notes; do not implement them in this correction. mini still unauthorized, real harness auth/read-only/resume unverified.

## Rollback Point

- Baseline: origin/main 43b7d72d；main checkout 原有 dirty 文件不变。
- H0 是 test/research/plan-only commit，可 revert 该 commit；fixture cleanup 只接触自己创建的 named session。
