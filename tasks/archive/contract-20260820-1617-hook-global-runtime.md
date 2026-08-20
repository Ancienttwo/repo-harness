> **Archived**: 2026-08-20 16:17
> **Related Plan**: plans/archive/plan-20260528-1436-hook-global-runtime.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1617

# Sprint Contract: hook-global-runtime

> **Status**: Partial
> **Plan**: plans/plan-20260528-1436-hook-global-runtime.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-05-28 14:58
> **Review File**: `tasks/reviews/hook-global-runtime.review.md`
> **Notes File**: `tasks/notes/hook-global-runtime.notes.md`

## Goal

Build the `agentic-dev` global CLI (类 codegraph install pattern, 但其为 hook runtime 不是 MCP server) 作为 Codex (`~/.codex/hooks.json`) 和 Claude Code (`~/.claude/settings.json`) 的 hook 主入口。项目 opt-in 经 `.ai/harness/workflow-contract.json` marker; 所有 workflow artifacts (.ai/harness/*, plans/*, tasks/*) 保持 repo-local。消除"每开一个新 repo 都要双 host trust + 复制 hook adapter"的高频痛点。

- **Phase 0 deliverable**: dual-host operational smoke 验证 loading + trust UX 行为, 产出 `docs/architecture/global-hook-runtime.md` Host Operational Matrix 章节
- **Phase 1 deliverable**: CLI 二进制 (`install` / `hook` / `status` / `doctor` / `migrate` 5 子命令) 经 GitHub Releases 分发, 新项目 init 不再写 `.codex/hooks.json` 或 `.claude/settings.json` hook 段; 自迁移 agentic-dev 自己作向前兼容证明

## Scope

- In scope:
  - `agentic-dev` CLI 入口 + 5 子命令 (`install` / `hook` / `status` / `doctor` / `migrate`)
  - Multi-target installer (`codex` / `claude` registry pattern, 参考 `_ref/codegraph/src/installer/targets/registry.ts:20-29`)
  - Phase 0 canary 脚本 (`scripts/canary-global-hook.sh`)
  - `assets/workflow-contract.v1.json` + `.ai/harness/workflow-contract.json` 加 `hookRuntime` 字段 (contract version bump)
  - `scripts/migrate-project-template.sh` + `scripts/lib/project-init-lib.sh`: 新项目不再写项目级 hook adapter
  - `docs/architecture/global-hook-runtime.md` (新) 含 Host Operational Matrix + Trust UX 章节
  - `docs/reference-configs/external-tooling.md` 加 `agentic-dev` CLI 安装步骤
  - `scripts/check-agent-tooling.sh` 加 `agentic-dev --version` + global hook installed 检测
  - `.ai/harness/policy.json` 加 hookRuntime policy
  - `CLAUDE.md` + `AGENTS.md` Operating Rules 加一行 hook runtime 说明
  - Distribution: GitHub Releases 多 arch binary (`pkg` 打包 Node) + `install.sh` (curl-bash) + `install.ps1` (PowerShell), 抄 `_ref/codegraph/install.sh`/`install.ps1` 模式
  - 自迁移 agentic-dev 自身验证 + 跨项目 (1-2 个真实 repo) 验证
- Out of scope (Future Direction):
  - Approach B (sealed hooks: `.ai/hooks/*` + `lib/workflow-state.sh` 下沉到 CLI bundle)
  - Cross-repo task aggregation (`agentic-dev status --all` 跨 repo 视图)
  - MCP server 暴露 workflow state
  - 兼容保留项目级 hook adapter；Phase 1 通过迁移清理 legacy `.codex/hooks.json` 和 `.claude/settings.json` hook 段
  - Bun → Rust/Go 语言迁移 (Phase 2+ 视分发需求)
  - 加 cursor/opencode/gemini 等额外 target (留 registry 扩展点即可)

## Workflow Inventory

- Source plan: `plans/plan-20260528-1436-hook-global-runtime.md`
- Todo projection: `tasks/todo.md`
- Review file: `tasks/reviews/hook-global-runtime.review.md`
- Notes file: `tasks/notes/hook-global-runtime.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  # Docs
  - docs/spec.md
  - docs/architecture/global-hook-runtime.md
  - docs/reference-configs/external-tooling.md
  # Plans / Tasks
  - plans/
  - tasks/todo.md
  - tasks/contracts/hook-global-runtime.contract.md
  - tasks/reviews/hook-global-runtime.review.md
  - tasks/notes/hook-global-runtime.notes.md
  # Harness contract surface
  - .ai/context/capabilities.json
  - .ai/harness/workflow-contract.json
  - .ai/harness/policy.json
  - assets/templates/helpers/check-task-workflow.sh
  - assets/workflow-contract.v1.json
  # Scripts (Phase 0 canary + Phase 1D template/check updates)
  - scripts/canary-global-hook.sh
  - scripts/check-task-workflow.sh
  - scripts/agentic-dev.sh
  - scripts/hook-shim.sh
  - scripts/migrate-project-template.sh
  - scripts/lib/project-init-lib.sh
  - scripts/check-agent-tooling.sh
  # Root-level CLI / build surface (Phase 1A scaffold + Phase 1F distribution)
  - package.json
  - bun.lock
  - tsconfig.json
  - install.sh
  - install.ps1
  - CLAUDE.md
  - AGENTS.md
  # CI release pipeline (Phase 1F)
  - .github/workflows/release.yml
  # Source / tests
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/index.ts
    - src/cli/commands/install.ts
    - src/cli/commands/hook.ts
    - src/cli/commands/status.ts
    - src/cli/commands/doctor.ts
    - src/cli/commands/migrate.ts
    - src/cli/installer/targets/registry.ts
    - src/cli/installer/targets/codex.ts
    - src/cli/installer/targets/claude.ts
    - src/cli/installer/types.ts
    - scripts/canary-global-hook.sh
    - docs/architecture/global-hook-runtime.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/hook-global-runtime.notes.md
    - tasks/reviews/hook-global-runtime.review.md
  tests_pass:
    - path: tests/cli/install.test.ts
    - path: tests/cli/hook.test.ts
    - path: tests/cli/registry.test.ts
  commands_succeed:
    - bun test
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - bash scripts/check-agent-tooling.sh --host both
  qa_scores:
    - dimension: functionality
      min: 7
    - dimension: idempotency
      min: 8
  manual_checks:
    - "Phase 0 canary: log captured in docs/architecture/global-hook-runtime.md Host Operational Matrix 章节"
    - "agentic-dev install --target both --location global 写 ~/.codex/hooks.json + ~/.claude/settings.json 成功且幂等 (重运行 action=unchanged)"
    - "agentic-dev install --target codex --location local 报错 (Codex 仅支持 global, 参考 _ref/codegraph/src/installer/targets/codex.ts:57-59)"
    - "新项目 init 不再生成 .codex/hooks.json 或 .claude/settings.json hook 段"
    - "agentic-dev hook PreToolUse Edit 在 opt-in repo (有 .ai/harness/workflow-contract.json) 调用 .ai/hooks/pre-edit-guard.sh; 在 non-opt-in repo 静默 exit 0"
    - "agentic-dev doctor 正确报告 CLI version + 两 host install 状态 + trust state + fallback paths"
    - "agentic-dev migrate <repo> 删除旧 .codex/hooks.json，并从 .claude/settings.json / settings.local.json 去掉 hooks 段"
    - "自迁移 agentic-dev 自身后, 现有 hook 行为 (PreToolUse/PostToolUse/SessionStart/UserPromptSubmit/Stop) 仍然触发, .ai/harness/* 仍正常写入"
    - "tasks/reviews/hook-global-runtime.review.md 记录 evaluator pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
