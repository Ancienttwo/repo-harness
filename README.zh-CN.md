<div align="center">

# repo-harness

### 面向 Claude 与 Codex 编程会话的 file-backed 可复现 workflow

<img src="docs/images/repo-harness-hook-carrot.png" alt="repo-harness hooks 借助 repo-local workflow state，引导 Codex 与 Claude 向前推进" width="900">

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.1.35-black.svg)](https://bun.sh)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**把完整的 PRD 或 Sprint 交给 agent；之后你的循环只剩 review 和 `next`，或者启动 `/goal` 然后 AFK。**

</div>

`repo-harness` 提供一套 CLI 加 skill/runtime hooks，把 context、plan、handoff、
checks 和 review evidence 写回项目文件，让下一个 agent 会话从文件而不是聊天
记忆里继续。它用 tasks-first agent contract 接入已有仓库，让 Claude 和 Codex
保持一致。

## 目录

- [快速开始](#快速开始)
- [为什么用 repo-harness](#为什么用-repo-harness)
- [核心特性](#核心特性)
- [工作原理](#工作原理)
- [任务 Workflow](#任务-workflow)
- [Hooks](#hooks)
- [MCP Connector](#mcp-connector)
- [审查产出](#审查产出)
- [Skills](#skills)
- [Maintainer Reference](#maintainer-reference)
- [致谢](#致谢)
- [当前 Release](#当前-release)
- [许可证](#许可证)

## 快速开始

### 1. 安装 CLI

前置条件：一个 Git working tree、`bash` 和 `bun`；`jq` 可选。不需要
Node.js——installer 使用 Bun >= 1.1.35 作为 runtime，需要时会先安装或升级
Bun。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

如果 Bun >= 1.1.35 已经在 PATH 上，可以跳过 shell installer。由包管理器
安装的 Bun 会 fail closed，并提示对应的升级命令（如 `brew upgrade bun`），
而不是覆盖包管理器管理的文件。

```bash
bunx repo-harness@latest install     # Bun one-shot bootstrap
bun add -g repo-harness              # or install the persistent CLI first
repo-harness install
npx -y repo-harness@latest install   # npx fallback; the CLI still runs on Bun
```

### 2. 引导 host runtime

```bash
repo-harness install
```

这个全局 bootstrap 会把 npm 包安装成全局 CLI，刷新 repo-harness 的 skill
aliases，安装 user-level hook adapters，并记录一份明确的 install profile。
它是幂等的，不会把 repo-local workflow 文件应用到当前目录。`--dry-run
--json` 会先列出将要安装、跳过和移除的组件。Profile、原生 Codex delegation authority、
刷新命令，以及只读的 `setup check` audit，见
[`install-profiles.md`](docs/reference-configs/install-profiles.md)。

### 3. 预览 repo-local contract

```bash
repo-harness init --dry-run
```

在目标仓库根目录运行这条命令。它会报告将要创建或刷新的 specs、task
state、helper runtime、hook adapter target 和 verification files。它从不
创建 application stack；新项目和新模块改用 `repo-harness-setup` 的
scaffold mode。

### 4. 应用并验证

```bash
repo-harness init
bash scripts/check-task-workflow.sh --strict
bun test
```

### 成功之后是这样

应用命令最后会输出 `=== Migration Report ===`，说明生成的 hook 行为来自
哪里、user-level `~/.claude/settings.json` 与 `~/.codex/hooks.json` 的
adapter target、被创建或刷新的 repo-local surfaces、
`.ai/harness/scripts/*` helper runtime，以及一段 `--- External Tooling
---` readiness block。此后，稳定意图落在 `docs/spec.md`，执行状态落在
`plans/` 和 `tasks/`，resume 状态落在 `.ai/harness/handoff/`。如果 dry
run 结果看起来不对，先停下来读
[`hook-operations.md`](docs/reference-configs/hook-operations.md)。

### 更新与移除

```bash
repo-harness update          # refresh user-level CLI and runtime pieces
repo-harness update --check  # read-only repair guidance, no writes
repo-harness uninstall       # remove managed host adapters only
```

## 为什么用 repo-harness

- **会话状态落在文件里，而不是聊天记忆里。** 不同的 Claude 和 Codex 会话
  靠仓库保持协调。`SessionStart` 注入上一个会话的 resume packet，`Stop`
  写下 handoff，每次 edit 都记一条小的 journal event。一个会话可以在任务
  中途结束，下一个会话直接接上准确的下一步、blocker 和改动过的文件，不
  需要重新推导。
- **天生省 token。** Harness 不靠每个会话重新扫一遍仓库的 grep-and-read
  循环，而是靠预建的 CodeGraph 索引做结构化查询，配合渐进式 context
  loading：一份稳定的约 12KB root context，加上只在你改到的文件需要时才
  加载的 capability 块。Agent 读一份约 1KB 的 capability contract，而
  不是重新摸索结构。
- **自带 review-ready 的证据。** 每个任务都会留下一份 contract、结构化的
  check 证据和一张 review card。人工决策面就是一屏——verdict、intended
  vs actual files、commands passed、residual risk、rollback——而不是
  靠还原 agent 自称做过什么来判断。

在接入后的仓库里，surface 刻意保持精简：

| Surface | 作用 |
| --- | --- |
| `docs/spec.md` 和 `docs/reference-configs/` | 每个 agent 会话都能读到的共享标准和稳定产品意图。 |
| `plans/`、`plans/prds/`、`plans/sprints/` | 开工前就已 decision-complete 的 work package。 |
| `tasks/contracts/`、`tasks/reviews/`、`.ai/harness/checks/` | 证明工作完成所需的 scope、verification 和 review evidence。 |
| `.ai/harness/handoff/` 和 `tasks/current.md` | session journal 和可恢复状态，从 workflow artifact 派生，而不是依赖聊天记忆。 |

## 核心特性

| | |
| --- | --- |
| **会话状态落在文件里** | Plan、contract、check 和 handoff 都留在仓库里，新会话从 artifact 而不是聊天线程恢复 |
| **Typed hook runtime** | 八条共享 managed route 加三条 Codex-only delegation route，每条都绑定唯一一个 typed in-process handler，在 edit boundary 上做 fail-closed guard |
| **Plan → Contract → Review** | 从 approved plan 到 projected contract、隔离 worktree、结构化证据，再到可审查 closeout 的完整生命周期 |
| **渐进式 context loading** | 约 12KB 的稳定 root context，加上只为实际改动文件加载的约 1KB capability contract |
| **CodeGraph 集成** | 用预建索引回答调用者、被调用者、定义位置这类结构化查询，取代反复的 grep-and-read |
| **MCP planner sidecar** | ChatGPT 读取真实仓库状态并写出 PRD/Sprint/Goal artifact；Codex 负责执行，默认没有源码写入权限 |
| **Claude + Codex 对齐** | 一份 user-level adapter contract、一份 workflow contract，以及两个 host 共用的一套 repo-local artifact |

## 工作原理

1. **源码包层**：本仓库负责 CLI、command facade、template、typed hook
   handler、operator-helper asset、workflow contract、test 和 release
   gate。
2. **目标仓库 contract 层**：`repo-harness init` 或 migration 会写入
   repo-local 文件，例如 `docs/spec.md`、`plans/`、`tasks/`、
   `.ai/context/`、`.ai/harness/`、helper script 和 `.ai/hooks/`。
3. **Host adapter 层**：user-level 的 `~/.claude/settings.json` 和
   `~/.codex/hooks.json` 把 Claude/Codex 的事件路由进 `repo-harness-hook`。

对于没有 opt-in 的仓库，hook entrypoint 会静默退出。对于已经 opt-in 的
仓库，route registry 会把公开的 event tuple 绑定到唯一一个打包好的
typed handler。`.ai/hooks/` 只保存 operator-helper projection，从来不是
host-event dispatcher。

核心不变量是：持久事实活在仓库里，而不是聊天线程里。Hook 只是
accelerator 和 guardrail；真正的 authority 是 file-backed 的 plan、
contract、review、checks 和 handoff artifact。Prompt 层面的
plan/spec/contract gate 只是 advisory routing；硬性 enforcement 落在
edit boundary 上。Handler 内部实现、minimal-change surface 和 policy
mode，见 [`hook-operations.md`](docs/reference-configs/hook-operations.md)
和
[`minimal-change-hooks.md`](docs/reference-configs/minimal-change-hooks.md)。

## 任务 Workflow

这张图假设 harness 已经安装好。它展示的是从 program sprint backlog 到
单个 contract task 的正常生命周期：选择任务，把它投射成执行文件，在
policy 要求时 checkout contract worktree，在 hook 保护下实现，然后
验证、review、closeout。

```mermaid
flowchart TD
  Program["Program goal or release theme"] --> Sprint{"Sprint layer needed?"}
  Sprint -->|yes| PRD["Upper-layer PRD<br/>plans/prds/*.prd.md"]
  PRD --> SprintDoc["Sprint backlog<br/>plans/sprints/*.sprint.md"]
  SprintDoc --> NextTask["Select next sprint task<br/>sprint-backlog.sh next"]
  Sprint -->|no| UserTask["User task or planning prompt"]
  Heartbeat["Heartbeat triage<br/>scripts/heartbeat-triage.sh<br/>.ai/harness/triage/"] --> UserTask
  NextTask --> UserTask

  UserTask --> Discovery["Due diligence<br/>P1 map, P2 trace, P3 decision"]
  Discovery --> LoopEvidence["Loop evidence when routing changes<br/>state-snapshot --json<br/>route-nl-vs-ts / cutover gate"]
  LoopEvidence --> PlanDraft["Draft plan<br/>plans/plan-*.md"]
  PlanDraft --> PlanReview{"Plan ready for execution?"}
  PlanReview -->|no| Refine["Refine plan, scope, evidence contract"]
  Refine --> PlanDraft
  PlanReview -->|yes| Approve["Approved plan<br/>Status: Approved"]

  Approve --> Project["Project plan into execution<br/>capture-plan.sh --execute<br/>or plan-to-todo.sh --plan"]
  Project --> Active["Active markers<br/>.ai/harness/active-plan<br/>.ai/harness/active-worktree"]
  Project --> SprintActive["Sprint projection<br/>active-sprint marker<br/>tasks/current.md"]
  Project --> Contract["Sprint contract<br/>tasks/contracts/YYYYMMDD-HHMM-task-slug.contract.md"]
  Project --> ReviewFile["Review file<br/>tasks/reviews/YYYYMMDD-HHMM-task-slug.review.md"]
  Project --> Notes["Task notes<br/>tasks/notes/YYYYMMDD-HHMM-task-slug.notes.md"]

  Contract --> Delegation["Delegation contract<br/>budget / permission_scope / roles"]
  Delegation --> Delegate{"Use contract-run delegation?"}
  Delegate -->|yes| ContractRun["Worker/verifier child run<br/>scripts/contract-run.ts"]
  Delegate -->|no| WorktreePolicy{"Contract worktree required?"}
  WorktreePolicy -->|yes| Checkout["Checkout isolated worktree<br/>contract-worktree.sh start --plan<br/>branch codex/task-slug"]
  WorktreePolicy -->|no| CurrentTree["Use current worktree<br/>small or explicitly allowed slice"]
  Checkout --> Implement
  CurrentTree --> Implement
  ContractRun --> Changes

  Implement["Edit and run commands"] --> PreHooks["Pre-edit guards<br/>PlanStatusGuard, ContractScopeGuard, WorktreeGuard"]
  PreHooks -->|blocked| ScopeFix["Fix plan, contract, worktree, or scope"]
  ScopeFix --> Implement
  PreHooks -->|allowed| Changes["Code, docs, tests, or config changes"]
  Changes --> PostHooks["Post-edit and post-bash hooks<br/>trace, drift request, handoff, check evidence"]
  PostHooks --> ArchQueue["Architecture queue<br/>architecture-queue.sh record/reindex<br/>check-architecture-sync.sh"]
  ArchQueue --> Verify["Run verification<br/>tests plus repo workflow checks"]

  Verify --> Checks["Structured evidence<br/>.ai/harness/checks/latest.json<br/>.ai/harness/runs/*.json"]
  Checks --> CheckReview["Evaluator review<br/>Waza /check -> review file"]
  CheckReview --> External["External acceptance advice<br/>or explicit manual override"]
  External --> DoneGate{"Contract, checks, review, and acceptance pass?"}
  DoneGate -->|no| Repair["Repair failing evidence or implementation"]
  Repair --> Implement
  DoneGate -->|yes| SprintComplete{"Sprint task active?"}
  SprintComplete -->|yes| MarkSprint["Mark backlog item complete<br/>sprint-backlog.sh complete-task"]
  SprintComplete -->|no| Closeout["Closeout<br/>scripts/contract-worktree.sh finish"]
  MarkSprint --> Closeout

  Closeout --> Commit["Commit contract branch"]
  Commit --> Merge["Fast-forward target branch"]
  Merge --> Archive["Archive plan/todo and refresh handoff"]
  Archive --> Cleanup["Cleanup merged worktree<br/>contract-worktree.sh cleanup"]
  Cleanup --> Done["Reviewable completed task"]
```

面向长周期的产品 loop，在 Codex 开始循环执行之前，先把 discovery 和
工程 plan 判断留给 parent agent：`geju` 打开 pre-contract frame，parent
agent 完成 P1/P2/P3，把确认的方向冻结进 `plans/prds/` 下的上层 PRD，
以及 `plans/sprints/` 下的有序 sprint backlog，然后用 Codex Goal 指向
那份 sprint 文件。PRD 保持为上层 source of truth，backlog 是持久的
执行队列，这样 resume 之后的 Goal 会话就不需要重新解释原始聊天。见
[`agentic-development-flow.md`](docs/reference-configs/agentic-development-flow.md)
和
[`workflow-orchestration.md`](docs/reference-configs/workflow-orchestration.md)。

## Hooks

安装好的 adapter 拥有八条共享的 managed hook route。Route tuple
`event + routeId + matcher` 是稳定的 contract；每个 tuple 绑定唯一一个
typed in-process handler。

| Route | Matcher | Handler | Function |
| --- | --- | --- | --- |
| `SessionStart.default` | all sessions | `src/cli/hook/session-context.ts` (in-process builder) | 在开工前注入之前的 handoff、sprint 状态、minimal-change 指引，以及只读的 config-security 发现项。 |
| `PreToolUse.edit` | `Edit\|Write` | `src/cli/hook/mutation-guard.ts` (in-process handler) | 在实现性 edit 之前，强制执行 worktree policy 和 plan/contract 就绪检查。 |
| `PreToolUse.subagent` | `Task\|Agent\|SendUserMessage` | `src/cli/hook/subagent-handler.ts` | 让 delegated 工作始终经由 parent session 回流，避免泄漏未经确认的 completion 声明。 |
| `PostToolUse.edit` | `Edit\|Write` | `src/cli/hook/mutation-observed.ts` (in-process handler) | 每次符合条件的 edit 最多写一条带 dirty bits 的小 journal event；contract verification、architecture/context/capability sync 和 minimal-change 证据都延后到 Stop 才跑，而不是每次 edit 都跑。 |
| `PostToolUse.bash` | `Bash` | `src/cli/hook/command-observed.ts` | 观察命令结果并捕获 verification 证据，不替代命令本身的 runner。 |
| `PostToolUse.always` | all tools | `src/cli/hook/trace-observer.ts` | 提供低噪音、常驻的 trace 和 runtime observation。 |
| `UserPromptSubmit.default` | all prompts | `src/cli/hook/prompt-handler.ts` | 对 prompt intent 分类，路由 planning/check 提示，并渲染 host-safe 的 workflow 指引。 |
| `Stop.default` | session stop | `src/cli/hook/stop-handler.ts` (in-process handler) | 收尾 handoff，并防止在 draft-plan 未解决或 completion 证据有缺口时结束会话。 |

Codex 还会额外安装三条 Codex-only 的 bounded-delegation route——
`UserPromptSubmit.delegation`、`SubagentStart.context` 和
`SubagentStop.quality`，全部绑定到 `src/cli/hook/subagent-handler.ts`；
Claude 只保留共享的 `PreToolUse.subagent` return-channel route。

`repo-harness-hook` 和它的 typed handler registry 是 host-event
runtime；`~/.claude/settings.json` 和 `~/.codex/hooks.json` 是
user-level adapter，Codex 必须先在 Settings 里把这个文件标记为
trusted，这些 hook 才会运行。Repo-local 的 `.claude/settings.json` 和
`.codex/hooks.json` 是需要退休的 legacy config。按顺序 debug：adapter
config -> `repo-harness-hook` -> route registry -> typed handler。

当某个 hook 挡住工作时，先读 terminal 里结构化输出的 `guard`、
`reason`、`fix`、`failure_class` 和 `run_id`。持久记录在
`.ai/harness/failures/latest.jsonl`，相关 tool activity 在
`.claude/.trace.jsonl`。常见的 guard 有 `PlanStatusGuard`（没有 active
或可执行的 plan）、`ContractGuard`（缺少 contract scaffold，或者在
contract 通过之前就声称完成）和 `WorktreeGuard`（从错误的 worktree
写入）。完整 playbook 见
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)。

## MCP Connector

作为可选 sidecar，`repo-harness mcp` 通过默认的 `planner` profile 把
workflow artifact 暴露给 MCP client。ChatGPT 读取真实仓库状态，把一个
想法推进过 PRD、checklist Sprint 和 Codex goal handoff artifact——默认
没有源码写入权限、没有任意 shell 执行，也没有默认 runner。Codex 仍然是
执行者。

```bash
repo-harness mcp setup chatgpt --repo .
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

把这个本地 server 通过 HTTPS tunnel 暴露出去，注册 `/mcp` URL，human
workflow 就是：

1. ChatGPT 通过 MCP 读取 repo-harness 的 workflow 文件。
2. ChatGPT 用 `write_prd_from_idea` 写一份 PRD。
3. ChatGPT 用 `write_checklist_sprint` 写一份 checklist Sprint。
4. ChatGPT 用 `prepare_codex_goal_from_sprint` 准备好
   `.ai/harness/handoff/codex-goal.md`。
5. Codex 运行 host-native 的 `/goal` prompt，逐个 stage 已完成的 Sprint
   phase。

通用的 repo reader/writer 工具、snapshot 与 index 一致性、server
profile，以及 opt-in 的 dev runner，见
[`general-repo-mcp.md`](docs/reference-configs/general-repo-mcp.md)。
Direct-coding profile 见
[`chatgpt-coding-mcp.md`](docs/reference-configs/chatgpt-coding-mcp.md)。
Index-stale、CodeGraph-down 和 rollback 操作见
[`general-repo-mcp-codegraph.md`](deploy/runbooks/general-repo-mcp-codegraph.md)。

## 审查产出

先看 `tasks/reviews/<task>.review.md`。它的 `## Human Review Card` 是
一屏决策面：verdict、change type、intended vs actual files、commands
passed、external acceptance、residual risk、reviewer action、
rollback。然后再检查 active contract、`.ai/harness/checks/latest.json`
里的最新 trace，以及实际改动的文件。只有当 review 建议 pass、card 的
verdict 是 pass，且 external acceptance 是 pass、`not_required` 或
明确的 override 时，才能接受这次交付。

Agent 会先读 source artifact，再读派生出来的摘要：

| Agent 先读 | Human 先看 |
| --- | --- |
| 当前用户 prompt 和引用的文件 | `tasks/reviews/<task>.review.md` 的 Human Review Card |
| `AGENTS.md` / `CLAUDE.md` | 改动的文件和 diff |
| `.ai/harness/active-plan` 里的 active plan | Active contract 的 allowed paths 和 exit criteria |
| `tasks/contracts/` 里的 active contract | `.ai/harness/checks/latest.json` 和 run trace |
| `.ai/harness/handoff/` 里的最新 handoff | 残余风险和 rollback |

`tasks/current.md` 只是一份 orientation snapshot。如果它和 active
plan、contract、review、checks 或 handoff 有分歧，以 source artifact
为准。

Runtime 较重的 validator（Unity、浏览器 E2E、mobile simulator、硬件
rig、staging smoke test）可以把 external verification manifest 发布到
被忽略的 run-evidence surface——目前这只是人工约定，还不是
`repo-harness check` 会自动执行的 gate。见
[external tooling](docs/reference-configs/external-tooling.md#external-verification-evidence)。

## Skills

Canonical 的 rule-owner package 放在 `assets/skills/` 和
`assets/skill-commands/` 下，让 host skill discovery 保持在有限范围
内，真正的 execution 仍由 CLI 和 hooks 负责。

| Skill | 作用 |
| --- | --- |
| `repo-harness` | 根路由 Skill，无条件同步到每个 profile |
| `repo-harness-setup` | Init、migrate、upgrade、repair、scaffold 和 capability-configuration 各 mode；仅 router-only |
| `repo-harness-plan` | 创建一份 decision-complete plan，或者 review 已有的 plan |
| `repo-harness-product` | 面向上层产品规划的 PRD、Sprint 和 Goal mode |
| `repo-harness-check` | Workflow 和 release check，附带 deploy-readiness reference |
| `repo-harness-ship` | 校验完成的 worktree，push 分支并开 PR |
| `repo-harness-architecture` | Architecture 文档、drift request 和图表，不需要完整刷新 harness |
| `repo-harness-cross-review` | Host-aware 的 Claude/Codex 独立 cross-model review |
| `claude-plan` | Codex 端 provider skill：面向设计分叉或高风险决策的独立 Claude plan mode consult；不是用户直呼入口 |
| `repo-harness-chatgpt` | Oracle browser/GPT Pro consult、MCP Connector setup 和 bridge handoff；仅限显式 setup |
| `merge-gate`（外部） | Exact-candidate 的 final gate；repo-harness 本身不附带 merge-gate Skill——见 [external tooling](docs/reference-configs/external-tooling.md) |

规划链路刻意分层：

```text
idea -> PRD mode -> Sprint mode -> Goal mode
```

`repo-harness init` 面向已有仓库；`repo-harness-setup` 的 scaffold
mode 创建新项目或新模块。`hooks-init`、`docs-init` 和
`create-project-dirs` 是内部步骤，不是公开命令。各 mode 的路由边界见
[`agentic-development-flow.md`](docs/reference-configs/agentic-development-flow.md)
和 `repo-harness docs show harness-overview`。

## Maintainer Reference

修改 package 本身需要一份 source checkout：

```bash
git clone https://github.com/Ancienttwo/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness && bun src/cli/index.ts update
```

这份 checkout 是唯一可编辑的 source of truth；本地 Claude/Codex 的
skill 路径是 symlink-backed 的 runtime entrypoint，由
`scripts/sync-codex-installed-copies.sh` 重建。

`bun run check:ci` 是唯一的 CI-equivalent gate；`bun run
check:release` 只是在委托给它之前，多加一步 npm unpublished-version
preflight。

```bash
bun run check:ci                    # the whole gate
repo-harness docs list              # runtime reference docs, resolved from the package
repo-harness docs show harness-overview
bun scripts/assemble-template.ts --plan C --name "MyProject"
```

Hook 变更只更新一次 canonical 的 `assets/hooks/`，然后跑 `bun run
sync:hooks`，并在验证里包含 `bun run check:hooks`。Reference doc 的
canonical 版本在 `assets/reference-configs/` 下，并投射到
`docs/reference-configs/`；`bun run check:reference-configs` 用来
验证这次投射。

## 致谢

`repo-harness` 是围绕一小组外部 skill、仓库和 agent runtime 搭建起来
的，它们塑造了这套 workflow contract。它们不是普通的 bundled
dependency。

| 工具或仓库 | 用途 | 依赖形态 |
| --- | --- | --- |
| [Hylarucoder](https://x.com/hylarucoder) / Geju | P1/P2/P3 due-diligence 方法和 Geju 实践，塑造了这套 workflow 里 planning、tracing 和 decision-rationale 的纪律 | 方法论贡献和致谢；不是 bundled dependency |
| [TW93](https://x.com/HiTw93) 的 Waza，包括 `think`、`hunt`、`check` 和 `health` | 日常 planning、bug hunt、verification、health check，以及 Codex-first 的 skill sync | 通过 skills CLI 安装进 host skill root |
| `mermaid` | 为架构文档中的 Mermaid fenced blocks 提供 authoring 和 review 支持 | Runtime-referenced 的外部 skill，不会 vendor 进生成的仓库，也不会生成 standalone HTML |
| CodeGraph（`@colbymchenry/codegraph`） | 为这个 self-host 仓库提供 symbol-aware 导航、impact tracing 和 readiness check | 本仓库的 dev dependency；生成的仓库默认保持 global-MCP-first，除非 policy 显式开启 |
| [Peter Steinberger](https://x.com/steipete) 的 [Oracle](https://github.com/steipete/oracle)（`@steipete/oracle`，MIT） | `chatgpt-browser` 的 Oracle provider 为 `gptpro` consult 默认 shell 出去调用的 GPT Pro / ChatGPT Web 浏览器 consult 引擎 | 外部解析的 binary（`--oracle-bin`、`REPO_HARNESS_ORACLE_BIN`、`node_modules/.bin` 或 `PATH`）；从不自动下载，缺失 binary 会硬失败 `ORACLE_NOT_INSTALLED` |
| OpenAI Codex | repo-local 实现和验证的主要执行 agent；commit 实质包含 Codex 产出内容时，也承担 GitHub contributor attribution | 外部 agent runtime；attribution 是显式的 commit trailer，不是隐藏的 hook automation |

### GitHub 贡献者署名

当 Codex 对某次 commit 有实质贡献时，在 message 末尾用 GitHub 标准的
co-author trailer：

```text
Co-authored-by: codex <codex@openai.com>
```

保持这条 trailer 逐 commit 显式添加、可见；不要把它固化进下游
repo-harness 的 commit script 或 hook，除非目标仓库采用同样的
policy。

## 当前 Release

- npm package：`repo-harness@0.14.2`
- Generated workflow stamp：`repo-harness@0.14.2+template@0.14.2`
- GitHub repository：`Ancienttwo/repo-harness`
- Release notes 和 history：[`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## 许可证

MIT——见 [`LICENSE`](LICENSE)。
