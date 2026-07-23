# repo-harness

`repo-harness` 把 Claude/Codex 的 AI 编程会话变成可复用、可恢复、可检查的
repo-local workflow。它提供 CLI 和 skill/runtime hooks，把上下文、计划、
handoff、检查结果和 review evidence 写回项目文件，让下一个 agent 会话可以从文件继续，
而不是依赖聊天记录。

它主要解决三件事：

- 用 tasks-first agent contract 快速接入已有仓库。
- 让 Claude 和 Codex 共享同一套计划、检查、handoff 和上下文边界。
- 用 CodeGraph 和渐进式 context loading 减少重复摸仓库结构的 token 消耗。

你只需要把完整 PRD/Sprint 发给 Agent；之后的工作就是 review and `next`，
或者启动 `/goal` 后 AFK。

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

仓库地址：`https://github.com/Ancienttwo/repo-harness`

## 为什么用 repo-harness

- **会话状态落在文件里，不在聊天记录里。** 不同 agent 会话——Claude、Codex、现在或之后——
  靠仓库而不是聊天线程保持同步。新会话启动时进程内的 session-context builder（`src/cli/hook/session-context.ts`）注入上一会话的
  resume packet（`.ai/harness/handoff/resume.md`、`tasks/current.md`）；会话结束和每次编辑后，
  `session-context`、`stop` 和 `mutation-observed` typed handlers 把下一份 handoff 写回。任务可以中途断开，下一个会话
  直接接上准确的下一步、阻塞点和改动文件，不用重新推断。
- **天生省 token。** 不靠每个会话重扫一遍仓库的 grep+read 循环，harness 用预建的 CodeGraph 索引做
  结构化查询（谁调用、调用谁、定义在哪），再用 `.ai/context/context-map.json` 和 `capabilities.json`
  做渐进式上下文加载：一份小而稳定的 root context（约 12KB），加上只在改到对应文件时才加载的
  capability 块。agent 读一份 1KB 的 capability 合约或查索引，而不是花上千 token 重新摸清结构。

接入后的仓库只需要理解几个 surface：

| Surface | 作用 |
| --- | --- |
| `docs/spec.md` 和 `docs/reference-configs/` | 共享标准和稳定产品意图，每个 agent 会话都能读取。 |
| `plans/`、`plans/prds/`、`plans/sprints/` | 实现前先沉淀 decision-complete work package。 |
| `tasks/contracts/`、`tasks/reviews/`、`.ai/harness/checks/` | 证明完成所需的 scope、verification 和 review evidence。 |
| `.ai/harness/handoff/` 和 `tasks/current.md` | session journal 与可恢复状态，从 workflow artifacts 派生，而不是依赖聊天记忆。 |

## Human Review Path

先读 `tasks/reviews/<task>.review.md`。`## Human Review Card` 是一屏决策面：
verdict、change type、预期/实际改动文件、已通过命令、external acceptance、
残余风险、reviewer action 和 rollback。然后检查 active contract、
`.ai/harness/checks/latest.json` 里的 latest trace，以及实际 diff。只有当 review
recommend pass、card verdict 为 pass，且 external acceptance 为 pass、not_required
或明确 manual override 时，才进入 closeout。

Unity、浏览器 E2E、mobile simulator、硬件测试和 staging smoke test 这类
运行时重验证器，可以把 external verification manifest 写到被忽略的 run-evidence
surface。当前这只是手动约定，不是 `repo-harness check` 已经会自动发现或 gate
的能力。详见
[`docs/reference-configs/external-tooling.md`](docs/reference-configs/external-tooling.md#external-verification-evidence)。

## Agent Tracking Path

Agent 先读 source artifacts，再读派生摘要：

| Agent reads first | Human reviews first |
| --- | --- |
| 当前用户 prompt 和引用文件 | `tasks/reviews/<task>.review.md` 的 Human Review Card |
| `AGENTS.md` / `CLAUDE.md` | changed files 和 diff |
| `.ai/harness/active-plan` 指向的 active plan | active contract 的 allowed paths 和 exit criteria |
| `tasks/contracts/` 下的 active contract | `.ai/harness/checks/latest.json` 和 run trace |
| `.ai/harness/handoff/` 下的 latest handoff | 残余风险和 rollback |

`tasks/current.md` 只是 orientation snapshot。如果它和 active plan、contract、
review、checks 或 handoff 冲突，以 source artifacts 为准。

## What's New

Release notes 见 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)，当前版本线是 `0.11.1`。

## 工作原理

整体分三层，host-event 只有一条 typed runtime 路径：

1. **源码包层**：本仓库维护 CLI、CLI-backed command facades、templates、hook assets、
   workflow contract、tests 和 release gate。
2. **目标仓库合约层**：`repo-harness adopt` 或 migration 会写入 `docs/spec.md`、
   `plans/`、`tasks/`、`.ai/context/`、`.ai/harness/` 和 helper scripts；
   `.ai/hooks/lib/workflow-state.sh` 只作为 operator helper projection。
3. **Host adapter 层**：user-level `~/.claude/settings.json` 和 `~/.codex/hooks.json`
   把 Claude/Codex events 路由到 `repo-harness-hook`。runtime 先检查当前 repo 是否存在
   `.ai/harness/workflow-contract.json`；opt in 后由 route registry 按
   `event + routeId + matcher` 调用 exactly one typed handler。

minimal-change hooks 复用同一套路由 surface，不新增公开 adapter route。`SessionStart`
和允许执行的 prompt 只在 policy opt in 时打印 advisory context；只有显式启用
`post_edit_observer:true` 时，`PostToolUse.edit` 才会把有界改动信号写到
`.ai/harness/checks/minimal-change.latest.json`，`Stop` 把最新 review 摘要写进 handoff。
缺失或损坏的 policy 默认 off；即使配置 `mode: "enforce"` 也会归一化为 advisory 行为，
真正的 enforcement boundary 仍然是 tests、contracts 和 human review。

所有事件都通过同一条 `host adapter -> repo-harness-hook -> route registry ->
typed handler` 路径。`UserPromptSubmit.default` 由 `prompt` handler 负责 intent、
workflow state、quality gate 和 host-safe 输出；`PostToolUse.edit`、`PostToolUse.bash`
和 `Stop` 分别由 `mutation-observed`、`command-observed` 和 `stop` 处理。没有第二个
shell dispatcher，也不根据 host provider 选择另一套语义实现。

核心不变量：持久事实在仓库里，不在聊天窗口里。Typed handlers 只是加速器和 guardrail；
真正的 authority 是 plan、contract、review、checks 和 handoff 这些文件。

## 任务 Workflow：从 Plan 到 Closeout

下面这张图假设目标仓库已经安装 harness。它展示的是从 program sprint backlog
到单个 contract task 的正常闭环：先选择或形成任务，再投射到执行文件，需要时
checkout 隔离 worktree，在 hooks 保护下实现，然后验证、review、external acceptance，
必要时标记 sprint task 完成，最后 closeout。0.4.x 的 loop-system surface
新增 heartbeat 定时发现、state-snapshot/eval 证据、architecture queue freshness，
以及可选的 contract-run 委派，但 source of truth 仍然是 repo 内文件合约。

```mermaid
flowchart TD
  Program["Program goal 或 release theme"] --> Sprint{"需要 sprint layer?"}
  Sprint -->|是| SprintDoc["Sprint PRD + backlog<br/>plans/prds/*.prd.md"]
  SprintDoc --> NextTask["选择下一个 sprint task<br/>sprint-backlog.sh next"]
  Sprint -->|否| UserTask["用户任务或 planning prompt"]
  Heartbeat["Heartbeat triage<br/>scripts/heartbeat-triage.sh<br/>.ai/harness/triage/"] --> UserTask
  NextTask --> UserTask

  UserTask --> Discovery["前置调查<br/>P1 map, P2 trace, P3 decision"]
  Discovery --> LoopEvidence["路由变更时的 loop evidence<br/>state-snapshot --json<br/>route-nl-vs-ts / cutover gate"]
  LoopEvidence --> PlanDraft["Draft plan<br/>plans/plan-*.md"]
  PlanDraft --> PlanReview{"Plan 是否可执行?"}
  PlanReview -->|否| Refine["收敛 scope 和 evidence contract"]
  Refine --> PlanDraft
  PlanReview -->|是| Approve["Approved plan<br/>Status: Approved"]

  Approve --> Project["投射到执行面<br/>capture-plan.sh --execute<br/>或 plan-to-todo.sh --plan"]
  Project --> Active["Active markers<br/>.ai/harness/active-plan<br/>.ai/harness/active-worktree"]
  Project --> SprintActive["Sprint projection<br/>active-sprint marker<br/>tasks/current.md"]
  Project --> Contract["Sprint contract<br/>tasks/contracts/YYYYMMDD-HHMM-task-slug.contract.md"]
  Project --> ReviewFile["Review file<br/>tasks/reviews/YYYYMMDD-HHMM-task-slug.review.md"]
  Project --> Notes["Task notes<br/>tasks/notes/YYYYMMDD-HHMM-task-slug.notes.md"]

  Contract --> Delegation["Delegation contract<br/>budget / permission_scope / roles"]
  Delegation --> Delegate{"是否使用 contract-run 委派?"}
  Delegate -->|是| ContractRun["Worker/verifier child run<br/>scripts/contract-run.ts"]
  Delegate -->|否| WorktreePolicy{"是否需要 contract worktree?"}
  WorktreePolicy -->|是| Checkout["Checkout 隔离 worktree<br/>contract-worktree.sh start --plan<br/>branch codex/task-slug"]
  WorktreePolicy -->|否| CurrentTree["使用当前 worktree<br/>小任务或明确允许的 slice"]
  Checkout --> Implement
  CurrentTree --> Implement
  ContractRun --> Changes

  Implement["编辑和运行命令"] --> PreHooks["Pre-edit guards<br/>PlanStatusGuard, ContractScopeGuard, WorktreeGuard"]
  PreHooks -->|blocked| ScopeFix["修正 plan、contract、worktree 或 scope"]
  ScopeFix --> Implement
  PreHooks -->|allowed| Changes["代码、文档、测试或配置改动"]
  Changes --> PostHooks["Post-edit / post-bash hooks<br/>trace, drift request, handoff, check evidence"]
  PostHooks --> ArchQueue["Architecture queue<br/>architecture-queue.sh record/reindex<br/>check-architecture-sync.sh"]
  ArchQueue --> Verify["运行验证<br/>tests plus repo workflow checks"]

  Verify --> Checks["结构化 evidence<br/>.ai/harness/checks/latest.json<br/>.ai/harness/runs/*.json"]
  Checks --> CheckReview["Evaluator review<br/>Waza /check -> review file"]
  CheckReview --> External["External acceptance advice<br/>或明确 manual override"]
  External --> DoneGate{"Contract、checks、review、acceptance 是否通过?"}
  DoneGate -->|否| Repair["修复失败 evidence 或实现"]
  Repair --> Implement
  DoneGate -->|是| SprintComplete{"存在 active sprint task?"}
  SprintComplete -->|是| MarkSprint["标记 backlog item 完成<br/>sprint-backlog.sh complete-task"]
  SprintComplete -->|否| Closeout["Closeout<br/>scripts/contract-worktree.sh finish"]
  MarkSprint --> Closeout

  Closeout --> Commit["提交 contract branch"]
  Commit --> Merge["Fast-forward target branch"]
  Merge --> Archive["归档 plan/todo 并刷新 handoff"]
  Archive --> Cleanup["清理已合并 worktree<br/>contract-worktree.sh cleanup"]
  Cleanup --> Done["可审查的已完成任务"]
```

## 长周期产品 Loop

Greenfield 和 Brownfield 工作先由 parent agent 完成 discovery 和工程计划判断，
不要直接让 Codex 从原始聊天长期滚动：

1. contract 产生前，parent agent 先调用 `geju` 打开格局，再用自身的 repo/runtime
   能力完成 P1/P2/P3，并把确认后的产品意图、架构、风险、falsifier 和 evidence
   contract 冻结进开发文档。
2. 把这些文档转成 `plans/prds/` 下的 PRD Sprint，并为每个 execution
   slice 写清有序 backlog 和详细 sub-plan。
3. 创建 Codex Goal，目标指向该 sprint 文件。repo-harness 之后就可以按既有
   plan -> contract -> worktree -> verification flow 逐项投射和执行。

这个交接让长周期 loop 更精准：parent agent 负责前置判断，PRD Sprint 是 durable
source of truth，Codex Goal mode 只围绕具体 sprint 恢复和推进，而不是反复重新解释原始聊天。

## 前 5 分钟

<p align="center">
  <img src="docs/images/repo-harness-install-donkey-carrot.png" alt="repo-harness 安装引导的 pixel art 驴和萝卜 banner" width="900">
</p>

这是评估一个真实仓库是否适合接入该 workflow 的最快路径。它把机器级 runtime
bootstrap 和 repo-local contract install 分开，所以 dry-run 能先展示会改什么，
再决定是否应用。

前置条件：Git working tree、`bash`、`bun`（用于后续验证和 template assembly）。
`jq` 可选；做 `--dry-run` 时推荐，应用 settings merge 时更有用。

### 1. 安装 CLI

默认路径不需要 Node.js：installer 使用 Bun >= 1.1.35 作为 runtime。如果机器上
没有 Bun 或版本更旧，它会先安装或升级 Bun，再安装 `repo-harness` CLI。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

如果 Bun >= 1.1.35 已经在 `PATH` 上，可以跳过 shell installer。旧的 self-managed
Bun 从这些 direct path 启动时，`repo-harness install` 会先升级同一个 binary 再继续；
如果 Bun 由 package manager 管理，则 fail closed 并提示对应的升级命令（例如
`brew upgrade bun` 或 `scoop update bun`），不会覆盖 package-manager-owned 文件：

```bash
# Bun 一步 bootstrap
bunx repo-harness@latest install

# 或者先安装持久化 CLI
bun add -g repo-harness
repo-harness install

# npx 备选；仍要求 Bun 已在 PATH 上，因为 CLI runtime 是 Bun
npx -y repo-harness@latest install
```

### 2. 先做一次 host runtime bootstrap

```bash
repo-harness install
```

`install` 是首次全局引导入口。它把当前 npm 包安装成全局 CLI，刷新 repo-harness
skill aliases，安装 user-level hook adapters，配置 Waza runtime skills，把 brain
root 持久化到 `~/.repo-harness/config.json`，并配置 CodeGraph MCP。这个命令是
幂等的：如果 CLI 已经来自 Bun global package source，它会跳过 CLI 重装，但仍继续
刷新 host runtime pieces。它不会把当前目录默认迁移成 repo-local workflow。
`repo-harness init` 保留为兼容 alias，给已有脚本用。

如果要让 Agent 做只读 bootstrap audit，运行 `repo-harness setup check
--json`；需要版本和已接入仓库刷新提示时加 `--check-updates`。`setup check`
不是 runtime hook：它不会写 user-level files、安装更新、执行 `adopt` 或注册
adapters，只输出带 reason、risk、targets、可选 command 和 verification 的
`agent_actions`，由 Agent 再显式执行。
`repo-harness init-hook` 保留为兼容 alias。

### 安装和刷新例子

```bash
# 包更新后刷新 user-level CLI/runtime。
repo-harness update

# 移除管理的 host adapters，不动 sibling 或第三方 hooks。
repo-harness uninstall

# 只安装 host hook adapters（旧版 adapter-only surface）。
repo-harness install --target both --location global

# 只读修复建议，不写文件。
repo-harness update --check

# 刷新已接入仓库里的 repo-local workflow 文件。
repo-harness adopt --repo /path/to/repo
```

### 3. 预览 repo-local contract

```bash
repo-harness adopt --dry-run
```

在目标仓库根目录运行 dry-run。它会报告将要创建或刷新的 spec、task state、
helper runtime、hook adapter target 和 verification files。它不会创建应用技术栈；
已有仓库走 `repo-harness adopt`，新项目或新模块走 `repo-harness-setup` 的 scaffold mode。

### 4. 应用后验证 workflow

```bash
repo-harness adopt
bash scripts/check-task-workflow.sh --strict
bun test
```

应用后，目标仓库应该得到一套可审查的 file-backed contract，而不是 tool-specific
聊天配置。agent 应该能在 `docs/spec.md` 找到稳定意图，在 `plans/` 和 `tasks/`
找到执行状态，在 `.ai/harness/handoff/` 找到可恢复状态。

新项目或新模块用 `repo-harness-setup` 的 scaffold mode 代替 `adopt`；它会安装或
刷新 harness，不会创建应用技术栈。维护者编辑 package 源码需要 source checkout
—— 见 [Maintainer Reference](#maintainer-reference)。

### 成功长什么样

命令最后应该输出 `=== Migration Report ===`，并包含：

- `Project hooks synced from:`：生成的 hook 行为来自哪里
- `Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json`：adapter 层在哪里
- `Host hook adapters are user-level:`：提醒安装 global adapters，并信任 `~/.codex/hooks.json`
- `Workflow migration:`：repo-local harness surfaces 的创建或刷新计划
- `Helper runtime:`：应用后会得到的操作工具链
- `--- External Tooling ---`：parent/Geju planning 指引，以及 Waza 和 CodeGraph readiness 与 advisory 安装/更新提示

如果 dry-run 输出不对，先停在这里，阅读
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)。

## MCP Connector Quickstart

作为可选 sidecar，`repo-harness mcp` 只把 workflow artifacts 暴露给 MCP 客户端。
ChatGPT 充当读取状态、把想法推过 PRD、checklist Sprint 和 Codex goal handoff 的
planner/reviewer —— 没有源码写入权限、没有任意 shell 执行、也没有默认 Codex
runner。Codex 仍然是执行者。

这个 sidecar 假设 CLI 已经按上面「前 5 分钟」装好。当你想让 ChatGPT
对着真实仓库状态做规划、由 Codex 执行生成的 file-backed Sprint 时用它。

```bash
repo-harness mcp setup chatgpt --repo .
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

把这个本地 server 通过 HTTPS tunnel 暴露出去，再用 `/mcp` URL 创建一个
ChatGPT Connector。生成的指南写到：

```text
docs/repo-harness-chatgpt-mcp-setup.md
```

human workflow 是：

1. ChatGPT 通过 MCP 读取 repo-harness workflow 文件。
2. ChatGPT 用 `write_prd_from_idea` 写 PRD。
3. ChatGPT 用 `write_checklist_sprint` 写 checklist Sprint。
4. ChatGPT 用 `prepare_codex_goal_from_sprint` 准备 `.ai/harness/handoff/codex-goal.md`。
5. Codex 运行 host-native `/goal` prompt，逐个 stage 完成的 Sprint phase。

最后一步 handoff 的本地兜底：

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md
```

面向 agent 的 Skill 安装在：

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
```

这个 Skill 告诉 Codex 如何消费 ChatGPT 产出的 PRD/Sprint/Goal artifacts，
而不给 ChatGPT 源码写入或 shell 执行权限。

Dev Mode 可以选择通过 MCP 开启本地 agent 执行，默认关闭。当用户启用
`orchestrator` profile 并打开 dev runner 设置后，ChatGPT 可以调用
`run_agent_goal`，它只读取 `.ai/harness/handoff/codex-goal.md`，并通过
`codex exec` 或 `claude -p` 这类被允许的本地 CLI 运行这段固定 handoff。

```bash
repo-harness mcp serve --repo . --transport http --profile orchestrator --enable-dev-runner --dev-runner-agents codex
```

这个设置只面向本地 Developer Mode，有超时上限、有审计，不是任意 shell。

## Hook Authority Map

`repo-harness-hook` 是唯一 host-event runtime。user-level adapter 只负责送入事件，
route registry 按稳定的 `event + routeId + matcher` tuple 调用 exactly one typed handler。
`assets/hooks/lib/workflow-state.sh` 与 `.ai/hooks/lib/workflow-state.sh` 仅供 operator
helpers 检查 workflow state，不是 dispatcher。

- `~/.claude/settings.json`：user-level Claude adapter。
- `~/.codex/hooks.json`：user-level Codex adapter；必须在 Codex Settings 中信任。
- Repo-local `.claude/settings.json` / `.codex/hooks.json`：迁移时退休的 legacy 输入。
- 产品 handler 变更在 `src/cli/hook/`；asset projection 用 `bun run sync:hooks` 同步。

The installed adapter owns the managed hook routes. Each route invokes one typed
handler; 不存在第二套 shell runtime，也不存在 provider-specific runtime。

| Route | Matcher | Typed handler | Function |
| --- | --- | --- | --- |
| `SessionStart.default` | all sessions | `src/cli/hook/session-context.ts` (in-process builder) | Injects prior handoff, sprint status, and read-only config-security findings before work starts. |
| `PreToolUse.edit` | `Edit|Write` | `src/cli/hook/mutation-guard.ts` (in-process handler) | Enforces worktree policy and plan/contract readiness before implementation edits. |
| `PreToolUse.subagent` | `Task|Agent|SendUserMessage` | `subagent` | Keeps delegated work returning through the parent session instead of leaking completion claims. |
| `PostToolUse.edit` | `Edit|Write` | `mutation-observed` | Records the edit journal and controlled-file observations. |
| `PostToolUse.bash` | `Bash` | `command-observed` | Observes command results and captures verification evidence without replacing the command runner. |
| `PostToolUse.always` | all tools | `trace-observer` | Provides low-noise always-on trace and runtime observation. |
| `UserPromptSubmit.default` | all prompts | `prompt` | Classifies prompt intent, routes planning/check/hunt hints, and renders host-safe workflow guidance. |
| `Stop.default` | session stop | `src/cli/hook/stop-handler.ts` (in-process handler) | Finalizes handoff and guards against ending with unresolved draft-plan or completion evidence gaps. |

`SessionStart` 运行进程内的 session-context builder，一次性组装出上下文：

```mermaid
flowchart LR
  SessionStart["Claude/Codex SessionStart"] --> Adapter["user-level adapter"]
  Adapter --> Entry["repo-harness-hook SessionStart --route default"]
  Entry --> Ctx["session-context.ts<br/>in-process builder"]
  Ctx --> Resume["恢复 + sprint + handoff 上下文"]
  Ctx --> Sec["security scan<br/>只读配置扫描，按指纹门控"]
  Resume --> SSOut["SessionStart additionalContext<br/>上次会话状态 + SecurityConfig 发现项"]
  Sec --> SSOut
```

Prompt guard 多一个内部步骤：

```mermaid
flowchart LR
  Host["Claude/Codex UserPromptSubmit"] --> Adapter["user-level adapter"]
  Adapter --> CLI["repo-harness-hook UserPromptSubmit --route default"]
  CLI --> Route["route registry"]
  Route --> Handler["prompt handler<br/>typed decision table"]
  Handler --> RouteHint["Waza 路由提示<br/>显式 think/规划优先匹配 → /think"]
  Handler --> HostOutput["host-safe allow, advice, block, or done gate output"]
```

Typed handler 拥有该 route 的输入解析、文件状态读取和声明的副作用；runtime 只负责
统一 host 输出 shaping。AcceptanceReceipt 是 closeout authority，review Markdown 只是投影。

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
- Typed hook runtime：`src/cli/hook/`（通过 `repo-harness-hook` 运行）
- Operator helper projection：`.ai/hooks/lib/workflow-state.sh`
- User-level adapter layer：`~/.claude/settings.json`、`~/.codex/hooks.json`
- Active execution surface：`tasks/`
- Plan source of truth：`plans/`
- Durable progress：`tasks/workstreams/`
- Release history：`docs/CHANGELOG.md`

## 当前 Release

- npm package：`repo-harness@0.11.1`
- Generated workflow stamp：`repo-harness@0.11.1+template@0.11.1`
- GitHub repository：`Ancienttwo/repo-harness`
- Release history：[`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## 致谢

感谢 [Hylarucoder](https://x.com/hylarucoder) 的方法论贡献。`repo-harness`
里的 P1/P2/P3 due-diligence 方法，以及 Geju 实践对 planning、trace 和
decision rationale 的要求，来自他的贡献与启发。

感谢 [TW93](https://x.com/HiTw93) 创作 Waza；`think`、`hunt`、`check`
和 `health` 这些核心 skill 构成了 `repo-harness` 的日常 planning、bug hunt
和 verification 节奏。

感谢 [Peter Steinberger](https://x.com/steipete) 创作 Oracle（`@steipete/oracle`，MIT）；它是
`chatgpt-browser` 默认的 GPT Pro / ChatGPT Web 浏览器 consult 引擎，Oracle provider
通过 spawn 外部 oracle 二进制完成 `gptpro` consult，从不自动下载，缺失即硬失败。

感谢 OpenAI Codex 作为本仓库主要执行 agent 参与实现、验证和收口。

### GitHub Contributor Attribution

Codex 对某个 commit 有实质贡献时，GitHub contributor 署名使用显式 trailer：

```text
Co-authored-by: codex <codex@openai.com>
```

这条署名保持逐 commit 显式添加，不把它藏进下游 `repo-harness` commit 脚本或 hook
里，除非目标仓库自己采用同样策略。

## Action Command Skills

canonical rule-owner package 分布在 `assets/skills/`（已激活的 canonical package）
和 `assets/skill-commands/`（原地演进的幸存者）；它们保留 host skill discovery
的边界，真正执行由 CLI 和 hooks 负责：

- Router：`repo-harness`（root Skill，无条件同步到每个 profile）
- Setup layer：`repo-harness-setup`（adopt/init、migrate、upgrade、repair、
  scaffold、capability-configuration 各 mode；仅 router-only，不被任何 profile
  自动发现）
- Planning：`repo-harness-plan`（创建 decision-complete plan，或 review 已有 plan）
- Product planning layer：`repo-harness-product`（PRD / Sprint / Goal 三种
  mode；PRD mode 先激活 `$geju` 做格局判断，再优先用 Claude `claude -p --model
  opus` 起草 PRD，Codex 只做 fallback；Sprint mode 把 PRD 拆成 `plans/sprints/`
  里的有序 backlog，每行先用 `$think` 展开再进 contract 流程；Goal mode 从详细
  PRD 或 Sprint 文档准备 Codex/Claude `/goal` prompt，缺文档时先要求补文档）
- Verification：`repo-harness-check`（workflow/release 检查，附带
  deploy-readiness reference）
- Release：`repo-harness-ship`
- Architecture：`repo-harness-architecture`
- Cross-model review：`repo-harness-cross-review`（host-aware，strict profile
  下两个 host 都会安装）
- ChatGPT 集成：`repo-harness-chatgpt`（Oracle browser / GPT Pro consult 与
  continuation、MCP Connector setup、bridge handoff、read-back evidence；仅限
  explicit setup，product planning 从不隐式安装）

规划链路按层推进：

```text
idea -> repo-harness-product（PRD mode） -> repo-harness-product（Sprint mode，from-prd） -> repo-harness-product（Goal mode）
```

`repo-harness-product` 的 PRD mode 处理产品想法：先跑 `$geju` direction pass，
再用 Claude `claude -p --model opus` 起草 PRD，Codex 只在 Claude 不可用或失败时
fallback。用它的 Sprint mode（`from-prd <plans/prds/*.prd.md>`）把已批准 PRD 拆成
带 machine-checkable acceptance 的 Sprint backlog；Goal mode 只在已有详细 PRD 或
Sprint artifact 后使用，用它生成有边界的 Codex/Claude `/goal` prompt，并把
PRD/Sprint 保持为 source of truth。缺少这份文档时，Goal mode 必须先要求补文档，
而不是从聊天上下文直接开工。

`repo-harness adopt` 用于已有仓库；`repo-harness-setup` 的 scaffold mode 创建新
项目或模块。`hooks-init`、`docs-init` 和 `create-project-dirs` 是内部步骤，不是
公共 commands。

## Maintainer Reference

维护者编辑 package 源码需要 source checkout：

```bash
git clone https://github.com/Ancienttwo/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness
bun src/cli/index.ts update
```

`~/Projects/repo-harness` 是唯一可编辑 source of truth；本地 Claude/Codex 路径
（`~/.claude/skills/repo-harness`、`~/.codex/skills/repo-harness`）是 symlink-backed
runtime entrypoints。只有 `~/.codex/skills/repo-harness` 暴露 `SKILL.md` 和
`assets/skill-commands/`；`scripts/sync-codex-installed-copies.sh` 重建这些 alias
并清理退休的 `repo-harness-skill` / `project-initializer` 目录。脚本默认把 runtime
路径链回源码仓库；设 `AGENTIC_DEV_LINK_INSTALLED_COPIES=0` 走 copy-based staging，
或用 `CODEX_SKILLS_ROOT` / `CLAUDE_SKILLS_ROOT` 指定其他 root。

### 检查本仓库 workflow contract

跑 [Verification](#verification) 里的完整 gate；`bun run check:ci` 是单条
CI-equivalent 命令。

### Runtime reference docs

Generic repo-harness runtime/reference docs live in the installed package under
`assets/reference-configs/` and are resolved through the CLI:

```bash
repo-harness docs list
repo-harness docs path harness-overview
repo-harness docs show harness-overview
```

Initializer 和 runtime 默认（question flow、plan menu、template vars、外部工具
路由）记录在 `harness-overview.md` 的 **Initializer and Runtime Model** 一节。
Generated and migrated repos still keep `docs/reference-configs/*.md`, but
those files are deterministic pointer stubs. Repo-local workflow state,
policy, checks, runs, handoff packets, context maps, and helper snapshots stay
under `.ai/`.

### Template assembly

```bash
bun scripts/assemble-template.ts --plan C --name "MyProject"
bun scripts/assemble-template.ts --target agents --plan C --name "MyProject"
```

### Verification

发布前 review 使用唯一 CI-equivalent gate：

```bash
bun run check:ci
```

这个 gate 展开为下面这些 repo-owned checks；`bun run check:release` 只是在委托同一个 gate 前增加 npm 版本未发布检查。

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --eval route-workflow-check
```


### Local benchmark skeleton

```bash
bun run benchmark:skills --eval route-workflow-check
```

Eval output is the release/readiness evidence path; dry-run benchmark wiring is only a smoke and is not skill-effectiveness evidence.


### Run one eval across both Claude and Codex

```bash
bun run benchmark:skills --eval repair-agents-task-sync
```

## Key Files

- Skill spec：`SKILL.md`
- Root routing docs：`CLAUDE.md`、`AGENTS.md`
- Plan mapping：`assets/plan-map.json`
- Question-pack：`assets/initializer-question-pack.v4.json`
- Shared hooks：`assets/hooks/`
- Runtime reference docs: `assets/reference-configs/` via `repo-harness docs`
- Workflow contract：`assets/workflow-contract.v1.json`
- Hook operations reference：`docs/reference-configs/hook-operations.md`
- Template assembler：`scripts/assemble-template.ts`
- State inspector：`scripts/inspect-project-state.ts`
- External tooling detector: `scripts/check-agent-tooling.sh`
- Scaffolding scripts:
  - `scripts/init-project.sh`
  - `scripts/create-project-dirs.sh`
- Canonical adoption planner: `src/core/adoption/standard-plan.ts`

## Generated vs Self-Hosted Hook Projection

- 下游 hook 行为由 `assets/hooks/` 和 `assets/reference-configs/` 定义。
- 本仓库通过 `.ai/hooks/` dogfood 同一套 hook runtime，但这棵树由 `assets/hooks/projection.json` 生成。
- 每个 hook 变更只应更新 canonical `assets/hooks/`，运行 `bun run sync:hooks`，并在验证里包含 `bun run check:hooks`。

## Package Manager Defaults

- 通用默认优先级：`bun > pnpm > npm`
- **Plan G/H**（Python-centric）默认以 **`uv`** 作为 primary package manager。

## Runtime Profiles

- `Plan-only (recommended)`（默认）
- `Plan + Permissionless`
- `Standard (ask before each action)`

配置在 `assets/initializer-question-pack.v4.json`，由 `scripts/initializer-question-pack.ts` 消费。

## Verification

发布 review 使用唯一 CI-equivalent gate：

```bash
bun run check:ci
```

这个 gate 展开为下面这些 repo-owned checks；`bun run check:release` 只是在委托同一个 gate 前增加 npm unpublished-version preflight。

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --eval route-workflow-check
```
