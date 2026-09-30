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

REQ-5 放行 D：删除 codex-plugin provider/companion/discovery/readiness/install 与对应旧 source/policy/projection；skill references 同切。direct Codex 和既有 Claude domain acceptance 保留，不泛化 provenance。

## Scope

- In scope: exact plugin provider 公共入口/安装/检查/文档、source enum/policy/projection及其 fixture tests/source模板。
- Out of scope: direct codex exec、native-child/delegation/contract-run/campaign、Receipt provenance 泛化、真实模型/mini/global install/用户自装 plugin。
- D 独立 commit/canonical 后 CHECKPOINT-3；H3/H4 尚未验收。

## Stop Conditions

- 无默认 focus/session 或 direct CLI fallback；现有 enabled/agent/path/timeout/redaction 保护保持。
- 结束后只关闭 created peer，attached parent/server 保留；timeout 必须 cancel，unknown 不重放。
- audit 无 endpoint/home/config 明文；每新增项对齐验收或既有保护，不做预留设计。

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
  - tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md
  - tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md
  - src/cli/index.ts
  - src/cli/commands/init.ts
  - src/cli/commands/cross-review.ts
  - src/core/review/cross-review.ts
  - src/effects/review/cross-review-runner.ts
  - src/effects/review/codex-plugin-provider.ts
  - src/effects/evidence/checks-materializer.ts
  - scripts/acceptance-receipt.ts
  - assets/templates/helpers/acceptance-receipt.ts
  - scripts/plan-to-todo.sh
  - assets/templates/helpers/plan-to-todo.sh
  - scripts/harness-trace-grade.sh
  - assets/templates/helpers/harness-trace-grade.sh
  - scripts/check-agent-tooling.sh
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/hooks/lib/workflow-state.sh
  - .ai/hooks/.projection.json
  - .ai/hooks/lib/workflow-state.sh
  - assets/skills/repo-harness-cross-review/SKILL.md
  - assets/skills/repo-harness-cross-review/references/codex-mode.md
  - assets/skills/repo-harness-cross-review/references/codex-plugin-mode.md
  - assets/reference-configs/agentic-development-flow.md
  - assets/reference-configs/sprint-contracts.md
  - assets/reference-configs/external-tooling.md
  - docs/reference-configs/agentic-development-flow.md
  - docs/reference-configs/sprint-contracts.md
  - docs/reference-configs/external-tooling.md
  - tests/cli/cross-review.test.ts
  - tests/cli/init.test.ts
  - tests/check-agent-tooling.test.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/acceptance-receipt.test.ts
  - tests/evidence-checks-materializer.test.ts
  - tests/plan-to-todo.test.ts
  - tests/bootstrap-files.test.ts
  - tests/historical-plan-classifier.test.ts
  - tests/archive-evidence-gates.test.ts
  - tests/prompt-handler.test.ts
  - tests/unit/me4c-integration-product-acceptance.test.ts
  - tests/unit/merge-readiness-v1-effect.test.ts
  - tests/skill-surface/cross-review-package.test.ts
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
      "id": "h3-D-provider",
      "kind": "command",
      "command": "bun test tests/cli/cross-review.test.ts tests/skill-surface/cross-review-package.test.ts tests/acceptance-receipt.test.ts tests/evidence-checks-materializer.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Retired provider/receipt source rejects; direct Codex advisory and exact domain receipt checks remain, fixture-only.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "h3-D-installed-readiness",
      "kind": "command",
      "command": "bun test tests/cli/init.test.ts tests/check-agent-tooling.test.ts tests/cli/global-runtime-init.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "No plugin install/probe/readiness dependency; fixture HOME/protected ownership and actual install composition guards retained.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "h3-D-policy-consumers",
      "kind": "command",
      "command": "bun test tests/plan-to-todo.test.ts tests/bootstrap-files.test.ts tests/historical-plan-classifier.test.ts tests/archive-evidence-gates.test.ts tests/prompt-handler.test.ts tests/unit/me4c-integration-product-acceptance.test.ts tests/unit/merge-readiness-v1-effect.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "Codex plugin source removed from generated policy/JQ/trace/record readers; exact acceptance joins remain fixture-only.",
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
