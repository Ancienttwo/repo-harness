# repo-harness

Repo-local agentic development harness CLI and skill runtime for Claude/Codex
workflows.

[English](README.md) | [简体中文](README.zh-CN.md)

仓库地址：`https://github.com/Ancienttwo/repo-harness`

`repo-harness` 是一个把 AI 编程流程落到仓库文件里的工作流 harness。它既是
`repo-harness` CLI 和 skill runtime 的源码仓库，也是它自己生成给下游项目的
repo-local workflow 的自托管样例。

## 产品做什么

`repo-harness` 把 AI 辅助开发从“聊天记录里的口头协调”变成“仓库里的可审查状态”。
它会在目标仓库里安装一套小而明确的文件合约，让 Claude、Codex 和人类对下面几件事有同一个事实来源：

- 稳定的产品意图是什么
- 哪个 plan 已经批准进入执行
- 当前 sprint contract 允许改哪些范围
- 哪些 checks、review 和 evidence 证明任务真的完成
- hooks 应该如何提醒、拦截、记录 trace，并在会话之间 handoff

它不是 agent gateway、产品运行时、数据库服务或 MCP server。产品边界很清楚：
检查目标仓库，安装或刷新 workflow 文件，把 Claude/Codex 的 host events 路由到
repo-local hooks，然后验证这些 workflow surfaces 仍然一致。

## 工作原理

整体分三层：

1. **源码包层**：本仓库维护 CLI、command skill facades、templates、hook assets、
   workflow contract、tests 和 release gate。
2. **目标仓库合约层**：`repo-harness init` 或 migration 会写入 `docs/spec.md`、
   `plans/`、`tasks/`、`.ai/context/`、`.ai/harness/`、helper scripts 和
   `.ai/hooks/`。
3. **Host adapter 层**：user-level `~/.claude/settings.json` 和 `~/.codex/hooks.json`
   把 Claude/Codex events 路由到 `repo-harness-hook`。hook entrypoint 会先检查当前
   repo 是否存在 `.ai/harness/workflow-contract.json`；没有 opt in 就静默退出，有 opt in
   才进入当前仓库的 `.ai/hooks/*`。

对 `UserPromptSubmit` 来说，公开 adapter contract 仍然是
`repo-harness-hook UserPromptSubmit --route default`。CLI route registry 会把这个
route dispatch 到 `.ai/hooks/prompt-guard.sh`。Shell hook 继续负责 host JSON 解析、
workflow 文件读取、plan capture 副作用、quality gate 渲染，以及 host-safe
stdout/stderr。Prompt intent 和 workflow state 的决策交给
`repo-harness-hook prompt-guard-decide` 背后的 TypeScript decision engine；它从显式
decision table 里返回一个 action enum。这样 host 配置不变，但最容易出错的
classifier/state-machine 层不再散落在 shell 条件分支里。

核心不变量：持久事实在仓库里，不在聊天窗口里。Hooks 只是加速器和 guardrail；
真正的 authority 是 plan、contract、review、checks 和 handoff 这些文件。

## 任务 Workflow：从 Plan 到 Closeout

下面这张图假设目标仓库已经安装 harness。它展示的是单个任务的正常闭环：
先形成 plan，再投射到 sprint contract，需要时 checkout 隔离 worktree，在 hooks 保护下实现，
然后验证、review、external acceptance，最后 closeout。

```mermaid
flowchart TD
  UserTask["用户任务或 planning prompt"] --> Discovery["前置调查<br/>P1 map, P2 trace, P3 decision"]
  Discovery --> PlanDraft["Draft plan<br/>plans/plan-*.md"]
  PlanDraft --> PlanReview{"Plan 是否可执行?"}
  PlanReview -->|否| Refine["收敛 scope 和 evidence contract"]
  Refine --> PlanDraft
  PlanReview -->|是| Approve["Approved plan<br/>Status: Approved"]

  Approve --> Project["投射到执行面<br/>capture-plan.sh --execute<br/>或 plan-to-todo.sh --plan"]
  Project --> Active["Active markers<br/>.ai/harness/active-plan<br/>.ai/harness/active-worktree"]
  Project --> Contract["Sprint contract<br/>tasks/contracts/task-slug.contract.md"]
  Project --> ReviewFile["Review file<br/>tasks/reviews/task-slug.review.md"]
  Project --> Notes["Task notes<br/>tasks/notes/task-slug.notes.md"]

  Contract --> WorktreePolicy{"是否需要 contract worktree?"}
  WorktreePolicy -->|是| Checkout["Checkout 隔离 worktree<br/>contract-worktree.sh start --plan<br/>branch codex/task-slug"]
  WorktreePolicy -->|否| CurrentTree["使用当前 worktree<br/>小任务或明确允许的 slice"]
  Checkout --> Implement
  CurrentTree --> Implement

  Implement["编辑和运行命令"] --> PreHooks["Pre-edit guards<br/>PlanStatusGuard, ContractScopeGuard, WorktreeGuard"]
  PreHooks -->|blocked| ScopeFix["修正 plan、contract、worktree 或 scope"]
  ScopeFix --> Implement
  PreHooks -->|allowed| Changes["代码、文档、测试或配置改动"]
  Changes --> PostHooks["Post-edit / post-bash hooks<br/>trace, drift request, handoff, check evidence"]
  PostHooks --> Verify["运行验证<br/>tests plus repo workflow checks"]

  Verify --> Checks["结构化 evidence<br/>.ai/harness/checks/latest.json<br/>.ai/harness/runs/*.json"]
  Checks --> CheckReview["Evaluator review<br/>Waza /check -> review file"]
  CheckReview --> External["External acceptance advice<br/>或明确 manual override"]
  External --> DoneGate{"Contract、checks、review、acceptance 是否通过?"}
  DoneGate -->|否| Repair["修复失败 evidence 或实现"]
  Repair --> Implement
  DoneGate -->|是| Closeout["Closeout<br/>scripts/contract-worktree.sh finish"]

  Closeout --> Commit["提交 contract branch"]
  Commit --> Merge["Fast-forward target branch"]
  Merge --> Archive["归档 plan/todo 并刷新 handoff"]
  Archive --> Cleanup["清理已合并 worktree<br/>contract-worktree.sh cleanup"]
  Cleanup --> Done["可审查的已完成任务"]
```

## 前 5 分钟

这是评估一个真实仓库是否适合接入该 workflow 的最快路径。

### 安装或刷新本地 runtime

```bash
npx -y repo-harness init
```

npm package release line 是 `0.1.x`；生成的 workflow compatibility model line
单独以 `5.x` 追踪。`repo-harness@0.1.3` 发布的是改名后的 CLI、Claude/Codex
user-level hook adapter bootstrap、AI-native scaffold overlays、typed prompt-guard
decision engine、Waza runtime skill sync、`diagram-design` sync，以及 maintainer
发布 npm 前使用的 release gate。

如果从源码 checkout 工作：

```bash
git clone https://github.com/Ancienttwo/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness
bun src/cli/index.ts init
```

本地路径模型：

- 源码仓库：`~/Projects/repo-harness`
- Claude skill aliases：`~/.claude/skills/repo-harness`、`~/.claude/skills/repo-harness-skill`
- Codex discoverable skill alias：`~/.codex/skills/repo-harness`
- Codex compatibility fallback alias：`~/.codex/skills/repo-harness-skill`

`~/Projects/repo-harness` 是唯一可编辑 source of truth。本地 Claude/Codex 路径是
symlink-backed runtime entrypoints。退休的 `project-initializer` runtime 目录会被
`scripts/sync-codex-installed-copies.sh` 清理。

### 最小前置条件

- Git working tree
- `bash`
- `bun`，用于后续验证和 template assembly
- `jq` 可选；做 `--dry-run` 时推荐安装，应用 settings merge 时更有用

### 从这里开始

已有仓库从 repo root 执行：

```bash
npx -y repo-harness init --dry-run
```

dry-run 报告正确后再应用：

```bash
npx -y repo-harness init
```

新项目或新模块使用 `repo-harness-scaffold` command skill。已有仓库使用
`repo-harness-init`；它会安装或刷新 harness，不会创建应用技术栈。

### 成功长什么样

命令最后应该输出 `=== Migration Report ===`，并包含：

- `Project hooks synced from:`：生成的 hook 行为来自哪里
- `Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json`：adapter 层在哪里
- `Host hook adapters are user-level:`：提醒安装 global adapters，并信任 `~/.codex/hooks.json`
- `Workflow migration:`：repo-local harness surfaces 的创建或刷新计划
- `Helper scripts:`：应用后会得到的操作工具链
- `--- External Tooling ---`：gstack/Waza/gbrain 路由以及 advisory 安装/更新提示

### 接着跑的两个命令

```bash
bash scripts/check-task-workflow.sh --strict
bun test
```

如果 dry-run 输出不对，先停在这里，阅读
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)。

## Hook Authority Map

- `.ai/hooks/` 是唯一应该优先编辑的 shared hook implementation。
- `~/.claude/settings.json` 是 user-level Claude adapter，负责 dispatch 到 opted-in repos。
- `~/.codex/hooks.json` 是 user-level Codex adapter，dispatch 到同一个 runner。
- Repo-local `.claude/settings.json` 和 `.codex/hooks.json` hook adapters 是 legacy project-level config，迁移时应退休。
- Codex 必须在 Settings 里信任 `~/.codex/hooks.json`，hooks 才会执行。
- 调试顺序：user-level adapter config -> `repo-harness-hook` 或 fallback `repo-harness hook` -> route registry -> `.ai/hooks/*`。

Prompt guard 多一个内部步骤：

```mermaid
flowchart LR
  Host["Claude/Codex UserPromptSubmit"] --> Adapter["user-level adapter"]
  Adapter --> CLI["repo-harness-hook UserPromptSubmit --route default"]
  CLI --> Route["route registry"]
  Route --> Shell[".ai/hooks/prompt-guard.sh"]
  Shell --> Decision["repo-harness-hook prompt-guard-decide<br/>TypeScript decision table"]
  Decision --> Action["single action enum"]
  Action --> Shell
  Shell --> HostOutput["host-safe allow, advice, block, or done gate output"]
```

Shell 层仍然拥有文件系统 authority 和副作用。TypeScript 只拥有 classifier 加
`intent x plan state` decision table。

## Hook Failure Playbook

hook block 工作时，先看 terminal 里的结构化输出。核心字段是
`guard`、`reason`、`fix`、`failure_class` 和 `run_id`。

- Failure log：`.ai/harness/failures/latest.jsonl`
- Trace log：`.claude/.trace.jsonl`
- 深入指南：[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)

常见 guards：

- `PlanStatusGuard`：没有 active plan，或 plan 还不能执行
- `ContractGuard`：approved execution 还没有生成 contract/review/notes scaffold
- `ContractGuard`：任务还没通过 contract verification 就声称完成
- `WorktreeGuard`：在强制 linked worktree 策略下，从 primary worktree 写入

## Repo Workflow

- Root routing docs：`CLAUDE.md`、`AGENTS.md`
- Shared hook layer：`.ai/hooks/`
- User-level adapter layer：`~/.claude/settings.json`、`~/.codex/hooks.json`
- Active execution surface：`tasks/`
- Plan source of truth：`plans/`
- Durable progress：`tasks/workstreams/`
- Release history：`docs/CHANGELOG.md`

## 当前 Release

- npm package：`repo-harness@0.1.3`
- Generated workflow compatibility：`5.2.3`
- GitHub repository：`Ancienttwo/repo-harness`
- Release history：[`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Current Model (5.2.3)

- Question flow 使用 **12 grouped decision points**，先推断 harness defaults。
- Plan menu 分层：**Core Plans (A-F)** 优先，**Custom Presets (G-K)** 只在需要时出现。
- Skill routing inspection-first：
  - `scripts/inspect-project-state.ts`
  - `scripts/migrate-workflow-docs.ts`
  - `assets/workflow-contract.v1.json`
- Generated repos 默认使用 repo-local harness flow：
  - `docs/spec.md -> plans/ -> tasks/contracts/ -> tasks/reviews/ -> .ai/context/context-map.json -> .ai/harness/*`
- `repo-harness init` 会刷新 runtime pieces：
  - `repo-harness` skill aliases
  - global Codex/Claude hook adapters
  - Waza skills：`check`、`design`、`health`、`hunt`、`learn`、`read`、`think`、`write`
  - 如果 source copy 存在，同步 `diagram-design`
- 其他外部工具保持 advisory-only：
  - `bash scripts/check-agent-tooling.sh --host both --check-updates`
  - 不自动设置 gstack、gbrain、CodeGraph MCP、daemon 或 provider

## Action Command Skills

公共 command skill facades 在 `assets/skill-commands/`：

- Planning / review：`repo-harness-plan`、`repo-harness-review`、`repo-harness-autoplan`
- Repo workflow actions：`repo-harness-init`、`repo-harness-migrate`、`repo-harness-upgrade`、`repo-harness-capability`、`repo-harness-architecture`、`repo-harness-handoff`、`repo-harness-deploy`、`repo-harness-repair`、`repo-harness-check`
- Project creation：`repo-harness-scaffold`

`repo-harness-init` 用于已有仓库；`repo-harness-scaffold` 用于创建新项目或模块。
`hooks-init`、`docs-init` 和 `create-project-dirs` 是内部步骤，不是公共 commands。

## Maintainer Reference

### 检查本仓库 workflow contract

```bash
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

### Template assembly

```bash
bun scripts/assemble-template.ts --plan C --name "MyProject"
bun scripts/assemble-template.ts --target agents --plan C --name "MyProject"
```

### Verification

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --dry-run
```

## Key Files

- Skill spec：`SKILL.md`
- Root routing docs：`CLAUDE.md`、`AGENTS.md`
- Plan mapping：`assets/plan-map.json`
- Question-pack：`assets/initializer-question-pack.v4.json`
- Shared hooks：`assets/hooks/`
- Workflow contract：`assets/workflow-contract.v1.json`
- Hook operations reference：`docs/reference-configs/hook-operations.md`
- Template assembler：`scripts/assemble-template.ts`
- State inspector：`scripts/inspect-project-state.ts`
- Legacy-doc migrator：`scripts/migrate-workflow-docs.ts`
