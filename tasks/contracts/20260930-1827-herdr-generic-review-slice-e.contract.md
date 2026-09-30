# Task Contract: herdr-generic-review-slice-e design

> **Status**: Draft
> **Plan**: plans/plan-20260930-1827-herdr-generic-review-slice-e.md
> **Task Profile**: docs-only
> **Owner**: chris
> **Capability ID**: root
> **Review File**: `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md`
> **Notes File**: `tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md`

## Why

用户已决定旧claude-review按umbrella plan退役为generic review，现有deep-reasoner/fleet配置和task-agent是唯一review角色/运行边界。R6真实Claude/Herdr/sandbox/Result与quota后GO尚未取得，当前只准备原子设计和可核对的探针，不以假proof删除已有能力。

## Goal

交付Draft work-package plan/contract、ignored probe/预期表/目标8硬10预算，无模型deterministic校验；发送CHECKPOINT-6等明确GO。未来实施须整体writer/verifier/source/policy/projection/close atomic cutover，无新host/adapter/registry或alias。

## Scope

- In scope: E设计/contract/notes、ignored脚本预算/预期，无模型解析、参数/预算/选择规则校验；记录campaign A和同轮probe。
- Out of scope: 当前PR464内容/merge、生产代码修改/旧CLI/source/host删除、paused/H5/campaign implementation、真实模型未GO调用、全局安装/mini/default/main dirty。

## Stop Conditions

- 任何真实模型命令之前必须已核对脚本/预期/预算并收到用户GO。8目标/10硬上限，first unexpected failure stop，不重试、不post-send切harness。
- owner只从已有binding/parent证明；未知要求explicit harness。explicit override无fallback；唯一默认fallback仅可证明start前opposite executable missing；ambiguous launch报错/cancel不fallback。
- execution result是claim；terminal sentinel仅观察，不能mintReceipt。没有readonly/domain来源完整证据就unverified/unsupported，不退旧路径。

## Falsifier

首个最便宜proof是readonly真实provider是否能读linked request、提交execution result，以及primary/外部owner record是否真拒写。任何来源/权限/cleanup签名不成立即停止，而非加兼容层或降低保护。

## Root Cause Evidence

Not applicable: design-only proposal, not production bugfix.

## Workflow Inventory

- Current design plan/contract/notes under stem20260930-1827-herdr-generic-review-slice-e。
- Review保持pending，只有实际评审才写；tasks/todos不作活动清单。
- Ignored `.ai/harness/runs/review-design` owns probes/budget/results；durable script SHA/结论进notes，真运行状态独立private fixture，不是default/userrepo。
- Branch codex/herdr-generic-review-design派生PR464，不动PRbranch实现；实施批准后再收窄contract到具体源文件，不src/**。

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"forbidden"}
```

这是当前设计评审政策，不预先铸未来generic domain Receipt；未来schema原子切换另需R6证明。

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260930-1827-herdr-generic-review-slice-e.md
  - tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md
  - tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md
  - .ai/harness/runs/review-design/canary-budget.json
  - .ai/harness/runs/review-design/canary.ts
  - .ai/harness/runs/review-design/expected-results.md
  - .ai/harness/runs/review-design/probe-manifest.json
```

## Evidence Requirements

```yaml
evidence_requirements:
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
      purpose: E_design_and_probe_preparation_only
    verifier:
      mode: read_only
      purpose: designated_advisor_review
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "E0-no-model-probe",
      "kind": "command",
      "command": "bun .ai/harness/runs/review-design/canary.ts --verify",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Budget/argv/source/route deterministic checks only; never spawn server/provider/model.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-references",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "E0-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repo integrity for design artifacts only; no global apply/provider invocation.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Exit Criteria

```yaml
exit_criteria:
  - Draft plan/contract and ignored executable probes/expectations/budget exist with exact script SHA.
  - E0 deterministic verification exits 0 with model_call_count 0 and no src/tests mutation.
  - CHECKPOINT-6 includes owner/opposite/explicit/preflight-only fallback, atomic writer/verifier/policy/source/projection/close path, campaign A and actual unknowns.
  - No actual model before reviewed GO; no old path removed or real capability falsely certified.
```
