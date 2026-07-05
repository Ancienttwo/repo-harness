# Task Contract: authority-closure

> **Status**: Partial
> **Plan**: plans/plan-20260705-1938-authority-closure.md
> **Task Profile**: code-change
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-05 20:40
> **Review File**: `tasks/reviews/20260705-1938-authority-closure.review.md`
> **Notes File**: `tasks/notes/20260705-1938-authority-closure.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

think→contract、check→exit_criteria 已由 dev-loop 落地，但 hunt 的 root-cause 标准还只是一句 prose、geju 的产物没有 contract 承载、Codex 舰队没有 repo 内定义。这些规则若留在 live skill 里，就是第二套没版本化、会漂移的 authority：同一份 contract 交给不同宿主的 worker 会产出不同执行路径，verifier 证明不了 worker 有没有按隐藏方法论走。若跳过本任务，bugfix 可以无行为证据混过 gate，geju 结论停留在 ambient context，双舰队分层只存在于用户级配置、无法随 repo 分发。

## Goal

按 `plans/plan-20260705-1938-authority-closure.md`（2026-07-05 Fable 复审修订版）完成 13 个切片（T1 T2 / H0-H3 / G1 G2 / C1-C3 / G3 / F1）：模板五副本对齐并新增 Falsifier 与 Root Cause Evidence 节；`task_profile: bugfix` 在两处枚举落位并触发双侧（contract-run.ts + verify-contract.sh）pre-fix 失败证据 gate，共享实体 fixtures 保证同输入同判定；geju 进 policy 与文档镜像、产物冻结 advisory 上线；`.claude/agents/` 入库、`.codex/agents/*.toml` 对称舰队建立、`codex-subagent` runner 标签落 policy；F1 全量验证电池全绿。

## Scope

- In scope:
  - contract 模板全部五副本 + helper 镜像的对齐与新节（## Falsifier、## Root Cause Evidence、`bun run typecheck`→`bun run check:type`）
  - `scripts/verify-contract.sh`、`scripts/harness-trace-grade.sh`、`scripts/contract-run.ts`（+镜像）的 bugfix gate 与枚举扩展
  - `tests/fixtures/root-cause/` 共享 fixtures、`tests/fixtures/harness-traces/bugfix-pass.json`、相关测试文件
  - `.ai/harness/policy.json` 的 `hai_stack` 条目与 `codex-subagent` runner + 两个种子面（ensure-task-workflow(+镜像)、project-init-lib）
  - `docs/reference-configs/{sprint-contracts,external-tooling,agentic-development-flow}.md` 及各自 `assets/reference-configs/` 镜像、`contract-brief-example.md` bugfix 黄金范例
  - `scripts/plan-to-todo.sh`(+镜像) 渲染后 [Geju] advisory
  - `.claude/agents/` 三定义入库、`.gitignore` `.codex/agents` 例外、`.codex/agents/*.toml` 三件
  - `assets/skill-commands/{repo-harness-prd,repo-harness-plan,repo-harness-check}/SKILL.md` 与 `manifest.json` 教学段
- Out of scope:
  - fork/vendor Waza 或 hai-stack 技能本体；把推理过程压成 checklist
  - 通用行为验证引擎；两套解析器的共享库重构
  - root-cause / Falsifier 升为全局必检；bugfix 误标/省略的机器启发式
  - 重复注入 EXECUTION_BOUNDARY 条款（intent-boundary 已落全部 runner 面，仅 F1 断言存在）
  - README×5 与 evals.json 中的 geju 文案

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- 计划各切片的 **STOP** 条件命中即停：把实际观察写进回报与 notes 的 Open Questions，不绕过、不猜测合并、不放宽断言弄绿。
- C2 冒烟若显示 codex 0.141.0 不支持项目级 `.codex/agents/`：挂起 C2 并记录证据，其余切片照常。

## Workflow Inventory

- Source plan: `plans/plan-20260705-1938-authority-closure.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260705-1938-authority-closure.review.md`
- Notes file: `tasks/notes/20260705-1938-authority-closure.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260705-1938-authority-closure.contract.md
  - tasks/reviews/20260705-1938-authority-closure.review.md
  - tasks/notes/20260705-1938-authority-closure.notes.md
  - assets/templates/
  - .claude/templates/
  - .claude/agents/
  - .codex/agents/
  - .gitignore
  - .ai/harness/policy.json
  - .ai/hooks/
  - scripts/
  - src/
  - tests/
  - docs/reference-configs/
  - assets/reference-configs/
  - assets/skill-commands/
  - assets/hooks/
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - .claude/agents/deep-reasoner.md
    - .claude/agents/fast-worker.md
    - .claude/agents/gatekeeper.md
    - tests/fixtures/harness-traces/bugfix-pass.json
  artifacts_exist:
    - tasks/notes/20260705-1938-authority-closure.notes.md
  files_contain:
    - path: assets/templates/contract.template.md
      pattern: "## Falsifier"
    - path: assets/templates/contract.template.md
      pattern: "## Root Cause Evidence"
    - path: scripts/verify-contract.sh
      pattern: "bugfix"
    - path: scripts/harness-trace-grade.sh
      pattern: "bugfix"
    - path: scripts/contract-run.ts
      pattern: "incomplete_root_cause"
    - path: .ai/harness/policy.json
      pattern: "hai_stack"
    - path: .ai/harness/policy.json
      pattern: "codex-subagent"
    - path: docs/reference-configs/sprint-contracts.md
      pattern: "Root Cause Evidence"
  tests_pass:
    - path: tests/contract-run.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/action-command-skills.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
    - diff -q scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh
    - diff -q scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
    - diff -q scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh
    - diff -q scripts/harness-trace-grade.sh assets/templates/helpers/harness-trace-grade.sh
    - diff -q .claude/templates/contract.template.md assets/templates/contract.template.md
    - diff -q docs/reference-configs/sprint-contracts.md assets/reference-configs/sprint-contracts.md
    - diff -q docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md
    - diff -q docs/reference-configs/agentic-development-flow.md assets/reference-configs/agentic-development-flow.md
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "C2 smoke output recorded in notes, or C2 suspended with STOP evidence"
```

## Acceptance Notes (Human Review)

- Functional behavior: bugfix 黄金范例过 contract-run preflight 与 verify-contract --strict；缺 pre-fix artifact 的 bugfix contract 被双侧同判拒；非 bugfix contract 行为不变（exit_criteria-only 承诺仅按 H1 显式扩展）；plan-to-todo 渲染后出现 [Geju] advisory 且 exit code 不变。
- Edge cases: task_profile 缺失=legacy 放行（已拍板缺省语义）；artifact 为通过运行（含 " 0 fail"）必须被拒；`.codex/agents/*.toml` 不再被 gitignore；C2 冒烟失败走挂起而非硬失败。
- Regression risks: 模板五副本对齐动了 ensure-task-workflow/project-init-lib 种子（migrate dry-run + create-project-dirs 测试兜）；sprint-contracts.md 承诺文案变更需与 assets 镜像成对；harness-trace-grade 枚举扩展不得影响既有五 profile fixtures。

## Rollback Point

- Commit / checkpoint: base `a409656`（origin/main）
- Revert strategy: revert branch `codex/authority-closure` 或按切片独立 revert（镜像/种子对成对 revert；C1=删除复制入库文件；C2=删 `.codex/agents/` + 撤 .gitignore 例外）；无数据迁移。
