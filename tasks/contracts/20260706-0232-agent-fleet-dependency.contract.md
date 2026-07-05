# Task Contract: agent-fleet-dependency

> **Status**: Fulfilled
> **Plan**: plans/plan-20260706-0232-agent-fleet-dependency.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-06 02:35
> **Review File**: `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md`
> **Notes File**: `tasks/notes/20260706-0232-agent-fleet-dependency.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

harness loop 的委派环路（orchestrator→deep-reasoner/fast-worker→gatekeeper）依赖用户全局舰队定义，但 repo-harness 对它零感知：不声明、不检测、不安装。装完 repo-harness 跑 init，环路依赖是断的——下游用户拿到的是没有舰队的委派工作流，自托管侧靠手工维护 `~/.claude/agents` 与 `~/.codex/agents`。若跳过本任务，舰队作为依赖面永远游离在 policy/readiness 体系之外，与 waza/hai_stack/codegraph 的管理方式不对称。

## Goal

按 `plans/plan-20260706-0232-agent-fleet-dependency.md` 完成 6 个切片（P1/P2/P3/P4/P5/PF）：`fable_agents` 进 policy external_tooling（自托管 auto-install-on-init、种子默认 advisory 的双值先例）；`scripts/install-agent-fleet.sh` 安装器上线（上游 .md 直装 Claude 侧 + 映射表生成 Codex TOML 且 byte 复现三份 golden + never-clobber/--force）+ helpers 三处清单登记；`check-agent-tooling.sh` 新增 detectAgentFleet 并接 strict-readiness；init/migrate 按 policy 分级装配（dry-run 绝不写 HOME）；external-tooling 文档 + 镜像；PF 电池全绿。

## Scope

- In scope:
  - `.ai/harness/policy.json` `fable_agents` 条目 + project-init-lib/ensure-task-workflow 双种子面(+ensure 镜像)
  - `scripts/install-agent-fleet.sh`（新）+ helper 镜像 + `assets/workflow-contract.v1.json`/`.ai/harness/workflow-contract.json` 成对登记 + `pi_install_helpers()` 默认清单
  - `scripts/check-agent-tooling.sh`(+镜像)：HOSTS.agentsDir、detectAgentFleet、strict gate 新增 fleet 失败类
  - `scripts/lib/project-init-lib.sh` `pi_maybe_install_agent_fleet()` + `init-project.sh`/`migrate-project-template.sh` 调用点
  - `tests/install-agent-fleet.test.ts`（新）与 check-agent-tooling/migration-script/create-project-dirs.runtime/workflow-contract/helper-scripts 测试扩展
  - `docs/reference-configs/external-tooling.md` + `assets/reference-configs/` 镜像
- Out of scope:
  - 舰队文件塞进 npm 包或 repo 种子（上游唯一：Fable-agents）
  - 版本锁/lockfile、卸载器、逐 agent 选装、--json 输出、TOML→md 反向同步
  - 削弱/改动 codegraph 既有 strict 判断
  - `.claude/agents`、`.codex/agents` 仓库内定义与三份 golden TOML 的内容变更（golden 只读；生成器不一致时 STOP 不改 golden）
  - init 失败阻断（安装 fail-open，readiness 门才是权威）
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- 计划各切片 STOP 命中即停（P2 golden 复现失败、P4 dry-run 写 HOME 红线、strict gate 波及 codegraph 测试、helpers 计数断言无法自然扩展）。
- 测试中出现任何真实网络调用 → 停（必须 fixture 源 + 假 curl）。

## Falsifier

若 codex-cli 对 `.codex/agents/*.toml` 的识别始终不成立（authority-closure 遗留的 manual verification pending 被证伪），Codex 侧生成安装的价值坍缩为文件摆设——最便宜验证点是 todos 里的交互式 `/agent` 检查，应先于大规模推广做掉。其次：若三份 golden TOML 无法被映射表纯函数复现（P2 STOP），说明「从 .md 生成」的单一上游前提存在非规则性例外，需使用者裁决以哪边为准。

## Workflow Inventory

- Source plan: `plans/plan-20260706-0232-agent-fleet-dependency.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md`
- Notes file: `tasks/notes/20260706-0232-agent-fleet-dependency.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md
  - tasks/reviews/20260706-0232-agent-fleet-dependency.review.md
  - tasks/notes/20260706-0232-agent-fleet-dependency.notes.md
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - assets/workflow-contract.v1.json
  - assets/templates/helpers/
  - scripts/
  - tests/
  - docs/reference-configs/
  - assets/reference-configs/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
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
      - codex-subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/install-agent-fleet.sh
    - assets/templates/helpers/install-agent-fleet.sh
    - tests/install-agent-fleet.test.ts
  artifacts_exist:
    - tasks/notes/20260706-0232-agent-fleet-dependency.notes.md
  files_contain:
    - path: .ai/harness/policy.json
      pattern: "fable_agents"
    - path: .ai/harness/policy.json
      pattern: "auto-install-on-init"
    - path: assets/workflow-contract.v1.json
      pattern: "install-agent-fleet.sh"
    - path: scripts/check-agent-tooling.sh
      pattern: "agentsDir"
    - path: scripts/lib/project-init-lib.sh
      pattern: "pi_maybe_install_agent_fleet"
    - path: docs/reference-configs/external-tooling.md
      pattern: "fable_agents"
  tests_pass:
    - path: tests/install-agent-fleet.test.ts
    - path: tests/check-agent-tooling.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/migration-script.test.ts
    - path: tests/workflow-contract.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - diff -q scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh
    - diff -q scripts/install-agent-fleet.sh assets/templates/helpers/install-agent-fleet.sh
    - diff -q scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh
    - diff -q assets/workflow-contract.v1.json .ai/harness/workflow-contract.json
    - diff -q docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: fixture 源 + 假 HOME 全流程安装 6 文件；幂等二跑全 up-to-date；本地改动报 drift 不覆盖、--force 覆盖；生成 TOML byte 复现三份 golden；空 HOME 下 `check-agent-tooling --strict-readiness` 退出 2；policy=advisory 时 init 只打提示行且 HOME 零写入；policy=auto + apply 模式装入；migrate dry-run 断言 HOME 零写入。
- Edge cases: 上游部分 fetch 失败=部分安装+汇总；坏 frontmatter fail-closed 跳过；`~` 展开；`REPO_HARNESS_FLEET_SOURCE_DIR` 本地源覆盖；merge 语义下已有用户 policy 不丢键。
- Regression risks: helpers 清单 47→48 的三处一致性（workflow-contract 双 json + 镜像目录 + pi_install_helpers 默认清单）；strict gate 新增不得波及 codegraph 判断；ensure-task-workflow 种子块改动过 migrate dry-run。

## Rollback Point

- Commit / checkpoint: base `43ad4de`（本地 main）
- Revert strategy: revert branch `codex/agent-fleet-dependency`；全局目录写入幂等且 never-clobber，卸载=删除两目录下各三文件（文档列明清单）；无数据迁移。
