可以。建议把它做成 **repo-harness 内部 MCP sidecar + Codex 配置 Skill + 人工教程** 三件套，而不是把 `local-dev-mcp` 原样嵌进去。

核心判断：

```text
local-dev-mcp 的价值：
  证明 ChatGPT Connector 可以通过 MCP 访问本地开发环境，
  并提供 allowlist、denied_paths、OAuth、隧道、安全策略等参考实现。

repo-harness 应该做的：
  不暴露完整本地开发环境；
  只暴露 repo-harness workflow API：
  PRD / sprint / plan / contract / checks / review evidence / handoff / Codex goal prompt。
```

`local-dev-mcp` 当前就是“让 ChatGPT 通过 MCP 操作选定本地项目”的本地 MCP server，带项目 registry、denied paths、shell 风险分类、OAuth、redaction、localhost + HTTPS tunnel 这些安全控制；这些设计可以直接借鉴。([GitHub][1]) 但 `repo-harness` README 明确说它现在不是 agent gateway 或 MCP server，而是 repo-local workflow、hooks、checks、handoff 的协调层；所以这个功能最好作为可选 sidecar，而不是改变主产品边界。([GitHub][2])

本 PRD 的当前仓库路径是 `plans/prds/20260617-repo-harness-mcp-prd.md`。

---

# PRD: repo-harness ChatGPT MCP Connector

## 1. 项目名称

**repo-harness MCP Connector**

副标题：

> Connect ChatGPT planning to repo-harness workflows, then hand execution to Codex.

---

## 2. 背景

`repo-harness` 已经把 Claude / Codex coding sessions 变成 repo-local workflow：它把 context、plans、handoffs、checks、review evidence 写回项目文件，让不同 agent session 可以从文件续接，而不是依赖聊天记忆。([GitHub][2])

当前用户痛点是：ChatGPT Web 上的强规划模型适合做需求澄清、架构设计、PRD 拆解、风险评审，但它默认看不到本地 repo 的真实 workflow 状态；Codex 擅长本地执行、改代码、跑测试，但长期规划和上下文梳理仍然需要稳定的 repo-local artifact。

OpenAI Apps SDK / ChatGPT Connector 支持通过 MCP server 把外部工具暴露给 ChatGPT；ChatGPT 连接自定义 MCP server 时，需要一个可访问的 HTTPS `/mcp` endpoint，本地开发可用 Secure MCP Tunnel、ngrok 或 Cloudflare Tunnel。([OpenAI Developers][3]) Codex 侧也支持 MCP：Codex CLI 和 IDE extension 都支持 STDIO 和 Streamable HTTP MCP server，并且 MCP 配置可以放在 `~/.codex/config.toml` 或 trusted project 的 `.codex/config.toml`。([OpenAI Developers][4])

因此，`repo-harness` 可以新增一个内部 MCP server，把 ChatGPT 引入现有 repo-harness workflow：

```text
ChatGPT Web
  └─ MCP Connector
       └─ repo-harness mcp serve
            ├─ read: docs/spec.md, plans, tasks, checks, handoff
            ├─ write: PRD, sprint, plan, Codex goal prompt
            └─ no direct source-code editing in MVP

Codex CLI / IDE / App
  └─ repo-harness skill + hooks
       ├─ consume ChatGPT-generated plan / goal
       ├─ implement
       ├─ run checks
       └─ update review evidence + handoff
```

---

## 3. 问题陈述

用户现在要把 ChatGPT 规划能力和 Codex 执行能力串起来，通常需要手工 copy/paste：

```text
ChatGPT 里规划
→ 复制到本地
→ 手动写 PRD / sprint / task
→ 再复制给 Codex
→ Codex 执行
→ 再把结果复制回 ChatGPT 评审
```

这个过程的问题：

1. ChatGPT 看不到最新 repo-harness 状态，容易基于过时信息规划。
2. 规划输出不一定落到 repo-harness 标准 artifact 里。
3. Codex 收到的 goal prompt 不稳定，缺少 scope、checks、done evidence、handoff 要求。
4. ChatGPT 和 Codex 的职责边界不清，容易变成两个 agent 都在乱改代码。
5. ChatGPT Connector / MCP / tunnel / Codex config 配置步骤繁琐，不适合普通用户手动拼装。

---

## 4. 产品目标

### 4.1 核心目标

让用户用一条 repo-harness workflow 完成：

```text
ChatGPT 负责规划、拆解、评审；
Codex 负责实现、测试、修复；
repo-harness 负责把两者的状态固化到 repo 文件。
```

### 4.2 用户可见结果

用户完成配置后，可以在 ChatGPT 里说：

```text
Use repo-harness to inspect this repo and create a PRD for adding OAuth login.
Do not edit source code. Write the PRD and prepare a Codex goal prompt.
```

ChatGPT 通过 MCP 写入：

```text
plans/prds/add-oauth-login.prd.md
.ai/harness/handoff/codex-goal.md
```

然后用户在 Codex 里运行：

```text
Use the repo-harness ChatGPT handoff and execute the prepared Codex goal.
```

Codex 读取 PRD / sprint / goal，开始按 repo-harness 规则执行。

---

## 5. 非目标

MVP 不做这些：

```text
1. 不把 ChatGPT 网页版 Pro 模型包装成 Codex 可选模型。
2. 不让 ChatGPT 直接任意读写整个 repo。
3. 不默认暴露 arbitrary shell。
4. 不默认让 ChatGPT 调用 codex exec 自动改代码。
5. 不保存 ChatGPT / OpenAI 登录凭证。
6. 不把 tunnel、OAuth token、passphrase 写进 git。
7. 不承诺自动点击完成 ChatGPT Connector 创建流程。
```

ChatGPT Developer Mode / full MCP 的可用性取决于用户账号、workspace、admin 权限和当前 rollout；OpenAI Help Center 当前说明 full MCP write/modify support 仍在向 Business、Enterprise、Edu beta 推出，UI、权限和功能可能变化。([OpenAI Help Center][5]) 所以产品必须支持“手动教程 + 半自动配置”，不能把 ChatGPT UI 配置视为 100% 可自动化 API。

---

## 6. 目标用户

### Persona A: Solo developer

已经用 Codex 做代码执行，希望 ChatGPT 做复杂规划、PRD、架构拆解。

### Persona B: Agent workflow power user

已经采用 `repo-harness` 管理 Claude / Codex handoff，希望加入 ChatGPT 作为 planner / reviewer。

### Persona C: Team lead / reviewer

不一定亲自写代码，但希望 ChatGPT 能读 repo-harness artifacts，生成 sprint / review checklist，然后交给 Codex 执行。

---

## 7. 用户故事

### Story 1: 配置 ChatGPT Connector

作为用户，我希望运行：

```bash
repo-harness mcp setup chatgpt --repo .
```

之后得到：

```text
- 本地 MCP server 配置
- 本地 HTTP endpoint
- 可选 tunnel endpoint
- ChatGPT Connector 手动步骤
- 安全检查结果
```

这样我可以把 ChatGPT 连接到当前 repo-harness workflow。

### Story 2: 让 ChatGPT 生成 PRD

作为用户，我希望在 ChatGPT 里说：

```text
Use repo-harness to inspect current project state and write a PRD for feature X.
```

ChatGPT 可以读取 `docs/spec.md`、`tasks/current.md`、`.ai/harness/handoff/`、`plans/`，然后写入 `plans/prds/*.prd.md`。

### Story 3: 生成 Codex goal prompt

作为用户，我希望 ChatGPT 规划完成后自动生成一份 Codex 可以直接执行的 goal prompt：

```text
.ai/harness/handoff/codex-goal.md
```

里面包含：

```text
- source of truth
- scope
- allowed files
- forbidden files
- required checks
- done evidence
- handoff update requirement
```

### Story 4: Codex 读取 handoff 执行

作为用户，我希望 Codex 能通过 repo-harness Skill 自动发现 ChatGPT 写好的 handoff，并执行：

```bash
codex
```

然后输入：

```text
Use repo-harness-chatgpt-bridge. Execute the latest Codex goal.
```

### Story 5: 可选自动配置 Codex MCP

作为用户，我希望运行：

```bash
repo-harness mcp setup codex --repo . --scope project
```

自动写入 `.codex/config.toml`，让 Codex 也能使用同一个 repo-harness MCP server。Codex 官方支持用 `codex mcp` 或直接编辑 `config.toml` 配置 MCP server。([OpenAI Developers][4])

---

## 8. 产品方案总览

### 8.1 新增 CLI group

```bash
repo-harness mcp
```

子命令：

```bash
repo-harness mcp serve
repo-harness mcp doctor
repo-harness mcp setup chatgpt
repo-harness mcp setup codex
repo-harness mcp print-chatgpt-guide
repo-harness mcp install-skill
repo-harness mcp tunnel
repo-harness mcp stop
```

### 8.2 新增 Codex Skill

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
```

用途：

```text
- 帮 Codex 配置 repo-harness MCP
- 帮 Codex 检查 ChatGPT Connector 前置条件
- 生成或更新 ChatGPT 人工设置教程
- 读取 ChatGPT 生成的 Codex goal
- 把 goal 投射到 repo-harness task / contract / review workflow
```

Codex Skills 是官方支持的能力扩展格式：一个 skill 目录包含 `SKILL.md`，可选 scripts、references、assets；Codex CLI、IDE extension 和 Codex app 都可以使用 skills。([OpenAI Developers][6])

### 8.3 新增人工教程

生成：

```text
docs/repo-harness-chatgpt-mcp-setup.md
```

内容：

```text
1. 启动 repo-harness MCP server
2. 启动 tunnel
3. 在 ChatGPT 开启 Developer Mode
4. 创建 Connector
5. 输入 /mcp endpoint
6. 扫描工具
7. 测试 read-only prompt
8. 写 PRD
9. 交给 Codex 执行
```

---

## 9. 自动化配置策略

### 9.1 可以完全自动化的部分

这些可以由 CLI 或 Codex Skill 自动完成：

```text
- 检查 repo-harness 是否 adopt
- 检查 git repo
- 检查 Codex CLI 是否安装
- 生成 MCP local config
- 生成 passphrase / token
- 写入 .gitignore
- 写入 .codex/config.toml
- 安装 repo-local Codex Skill
- 启动本地 MCP server
- 检查 /health 和 /mcp
- 生成 ChatGPT Connector 教程
- 生成 tunnel 命令
```

### 9.2 半自动化的部分

这些可以辅助，但不应该默认全自动：

```text
- Cloudflare Tunnel / ngrok 配置
- OAuth authorization flow
- ChatGPT Connector 创建
- ChatGPT workspace Developer Mode 开启
```

原因是这些步骤涉及用户账号、workspace admin 权限、2FA、浏览器 session、UI 变化和安全确认。`local-dev-mcp` 的 README 也明确说明，Codex / Claude Code 等本地 coding agent 可以准备 server 和 endpoint，但不能替用户完成 ChatGPT 账号里的 Developer Mode app creation；用户需要在 ChatGPT Web 里完成连接步骤。([GitHub][1])

### 9.3 Computer Use 支持策略

可以支持一个 **experimental assisted setup**，但不作为主路径。

OpenAI 2026 年 4 月的 Codex 更新说明 Codex app 可以通过 background computer use 看、点、输入来操作用户电脑上的应用；但这类 UI 自动化适合做辅助，不适合作为配置的唯一方案。([OpenAI][7])

推荐产品策略：

```text
Default:
  repo-harness 生成教程，用户手动完成 ChatGPT Connector。

Optional:
  Codex Skill 提供 assisted setup prompt，让 Codex computer use 打开浏览器并跟随教程点击。
  用户必须手动输入登录、2FA、workspace admin approval、MCP passphrase。
```

---

## 10. 系统架构

### 10.1 MVP 架构

```text
┌────────────────────┐
│ ChatGPT Web         │
│ Planner / Reviewer  │
└─────────┬──────────┘
          │ HTTPS /mcp
          ▼
┌────────────────────────────┐
│ repo-harness mcp serve      │
│ profile: planner            │
│ transport: streamable-http  │
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────────────┐
│ target repo                 │
│ docs/spec.md                │
│ plans/prds/*.prd.md         │
│ plans/sprints/*.sprint.md   │
│ tasks/current.md            │
│ tasks/contracts/*           │
│ tasks/reviews/*             │
│ .ai/harness/handoff/*       │
│ .ai/harness/checks/*        │
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────┐
│ Codex CLI / IDE     │
│ Executor            │
└────────────────────┘
```

### 10.2 Optional orchestrator 架构

后续版本可以加：

```text
ChatGPT
  └─ MCP tool: run_codex_goal
       └─ repo-harness mcp serve
            └─ codex exec --sandbox workspace-write
```

但这个必须默认关闭。Codex 非交互模式官方建议使用 `codex exec`，并且自动化时应显式设置 sandbox / approval；默认 `codex exec` 是 read-only sandbox，允许编辑时使用 `--sandbox workspace-write`。([OpenAI Developers][8]) Codex 安全文档也建议常见自动执行用 `workspace-write` + approval，而不是危险的 bypass sandbox 模式。([OpenAI Developers][9])

---

## 11. 功能需求

## FR1: MCP server

新增命令：

```bash
repo-harness mcp serve \
  --repo . \
  --transport http \
  --host 127.0.0.1 \
  --port 8765 \
  --profile planner
```

也支持 STDIO：

```bash
repo-harness mcp serve \
  --repo . \
  --transport stdio \
  --profile planner
```

ChatGPT 使用 HTTP + HTTPS tunnel；Codex 本地使用 STDIO 或 HTTP。ChatGPT Apps SDK 文档要求连接 ChatGPT 的 MCP endpoint 可通过 HTTPS 访问，本地开发可以使用 Secure MCP Tunnel、ngrok 或 Cloudflare Tunnel。([OpenAI Developers][3])

---

## FR2: MCP server profiles

支持三种 profile。

### planner

给 ChatGPT 用。

```yaml
profile: planner
read:
  - AGENTS.md
  - CLAUDE.md
  - SKILL.md
  - docs/spec.md
  - docs/reference-configs/**
  - plans/**
  - tasks/current.md
  - tasks/contracts/**
  - tasks/reviews/**
  - tasks/notes/**
  - .ai/context/**
  - .ai/harness/handoff/**
  - .ai/harness/checks/**
write:
  - plans/prds/**
  - plans/sprints/**
  - plans/plan-*.md
  - .ai/harness/handoff/codex-goal.md
  - .ai/harness/handoff/chatgpt-plan.md
execute:
  - repo-harness doctor --json
  - repo-harness status --json
  - repo-harness run check-task-workflow -- --strict
deny:
  - src/**
  - app/**
  - packages/**
  - .env
  - .env.*
  - .ssh/**
  - ~/.codex/**
  - ~/.ssh/**
  - node_modules/**
  - dist/**
  - build/**
```

### executor

给 Codex 用。

```yaml
profile: executor
read:
  - plans/**
  - tasks/**
  - docs/spec.md
  - .ai/context/**
  - .ai/harness/**
write:
  - tasks/reviews/**
  - .ai/harness/checks/**
  - .ai/harness/handoff/**
execute:
  - repo-harness doctor --json
  - repo-harness run check-task-workflow -- --strict
deny:
  - arbitrary_shell_from_mcp
```

### orchestrator

实验功能，默认关闭。

```yaml
profile: orchestrator
tools:
  - run_codex_goal
requires:
  - --enable-codex-runner
  - explicit user confirmation
```

---

## FR3: MCP tools

MCP tools 要按 user intent 设计，而不是暴露底层文件系统。Apps SDK 文档建议 tool descriptor 包含 name、title、input schema、output schema、metadata，并正确设置 read/write annotations；read-only tools 应设置 `readOnlyHint: true`。([OpenAI Developers][10])

### Read-only tools

| Tool                           | 用途                          | ChatGPT 是否可自动调用 |
| ------------------------------ | --------------------------- | --------------- |
| `harness_status`               | 返回 repo-harness status JSON | 是               |
| `harness_doctor`               | 返回 doctor JSON              | 是               |
| `list_workflow_files`          | 列出可读 workflow artifacts     | 是               |
| `read_workflow_file`           | 读取 allowlist 内文件            | 是               |
| `latest_handoff`               | 读取最新 handoff/resume         | 是               |
| `latest_checks`                | 读取 checks summary           | 是               |
| `list_prds`                    | 列出 PRD                      | 是               |
| `list_sprints`                 | 列出 sprint                   | 是               |
| `summarize_repo_harness_state` | 返回压缩状态摘要                    | 是               |

### Write tools

| Tool                  | 用途                                    | 确认策略      |
| --------------------- | ------------------------------------- | --------- |
| `write_prd`           | 写 `plans/prds/*.prd.md`               | 需要确认      |
| `write_sprint`        | 写 `plans/sprints/*.sprint.md`         | 需要确认      |
| `write_plan`          | 写 `plans/plan-*.md`                   | 需要确认      |
| `write_codex_goal`    | 写 `.ai/harness/handoff/codex-goal.md` | 需要确认      |
| `append_handoff_note` | 追加 planner handoff                    | 需要确认      |
| `run_workflow_check`  | 跑 repo-harness workflow check         | 需要确认或 ask |

### Experimental tools

| Tool                    | 用途                      | 默认    |
| ----------------------- | ----------------------- | ----- |
| `run_codex_goal`        | 调用 `codex exec` 执行 goal | 禁用    |
| `open_diff_summary`     | 读取 git diff 摘要          | 禁用或只读 |
| `prepare_review_prompt` | 生成 review prompt        | 可启用   |

---

## FR4: Server instructions

MCP server 初始化时返回 `instructions`，供 ChatGPT / Codex 理解这个 server 的职责。Codex MCP 文档也建议 server instructions 放跨工具 workflow、约束和 rate limits，并且前 512 字符自包含。([OpenAI Developers][4])

建议 instructions：

```text
repo-harness exposes repo-local workflow artifacts, not general filesystem access.
Use it to read product intent, plans, contracts, checks, reviews, and handoff.
For ChatGPT, act as planner/reviewer: write PRDs, sprints, plans, and Codex goal prompts.
Do not edit application source through this server. Codex is the executor.
Before writing a plan, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans.
```

---

## FR5: ChatGPT Connector setup command

```bash
repo-harness mcp setup chatgpt --repo .
```

输出：

```text
[repo-harness mcp] Repo: /path/to/repo
[repo-harness mcp] Profile: planner
[repo-harness mcp] Local endpoint: http://127.0.0.1:8765/mcp
[repo-harness mcp] ChatGPT endpoint: <requires tunnel>
[repo-harness mcp] Auth: OAuth passphrase generated
[repo-harness mcp] Config: .repo-harness/mcp.local.json
[repo-harness mcp] Guide: docs/repo-harness-chatgpt-mcp-setup.md
```

如果 tunnel 已配置：

```text
ChatGPT Connector URL:
https://<tunnel-domain>/mcp
```

如果没有：

```text
Next:
  cloudflared tunnel --url http://127.0.0.1:8765
```

---

## FR6: Codex setup command

```bash
repo-harness mcp setup codex --repo . --scope project
```

生成 `.codex/config.toml`：

```toml
[mcp_servers.repo_harness]
command = "repo-harness"
args = [
  "mcp",
  "serve",
  "--repo",
  ".",
  "--transport",
  "stdio",
  "--profile",
  "executor"
]
enabled_tools = [
  "harness_status",
  "read_workflow_file",
  "latest_handoff",
  "latest_checks",
  "write_codex_goal",
  "run_workflow_check"
]
default_tools_approval_mode = "prompt"
```

Codex MCP 配置官方支持 `[mcp_servers.<server-name>]`，STDIO server 使用 `command` / `args` / `env` / `cwd`，HTTP server 使用 `url`，并支持 `enabled_tools`、`disabled_tools`、`default_tools_approval_mode` 等配置。([OpenAI Developers][4])

---

## FR7: Codex Skill

新增：

```text
.agents/skills/repo-harness-chatgpt-bridge/
  SKILL.md
  references/
    chatgpt-connector-manual.md
    workflow.md
  scripts/
    check-mcp-setup.ts
    install-codex-mcp.ts
    prepare-chatgpt-guide.ts
```

### SKILL.md 草案

```markdown
---
name: repo-harness-chatgpt-bridge
description: Use when setting up or operating the repo-harness ChatGPT MCP Connector, bridging ChatGPT planning artifacts into Codex execution through repo-harness PRDs, sprints, checks, and handoffs.
---

You are operating inside a repo-harness adopted repository.

Responsibilities:
1. Treat ChatGPT as planner/reviewer and Codex as executor.
2. Do not store or print secrets, OAuth passphrases, tunnel tokens, or ~/.codex/auth.json.
3. Prefer repo-harness CLI commands over manual file edits.
4. Keep ChatGPT write access limited to PRD, sprint, plan, and handoff artifacts.
5. Before execution, read:
   - docs/spec.md
   - tasks/current.md
   - .ai/harness/handoff/resume.md
   - .ai/harness/handoff/codex-goal.md
6. If the user asks to set up ChatGPT Connector:
   - run repo-harness mcp doctor
   - run repo-harness mcp setup chatgpt --repo .
   - generate the manual setup guide
   - do not attempt to log into ChatGPT unless the user explicitly requests computer-use assisted setup
7. If computer-use assisted setup is requested:
   - never type passwords, 2FA codes, OAuth passphrases, or admin approvals without user instruction
   - stop before final Create/Approve actions and ask the user to verify
8. If the user asks to execute the latest ChatGPT plan:
   - read .ai/harness/handoff/codex-goal.md
   - run repo-harness workflow checks
   - execute only the scoped task
   - update review evidence and handoff
```

---

## FR8: Manual tutorial generation

```bash
repo-harness mcp print-chatgpt-guide --repo .
```

或者：

```bash
repo-harness mcp setup chatgpt --repo . --write-guide
```

生成：

```text
docs/repo-harness-chatgpt-mcp-setup.md
```

教程内容必须包含：

```text
1. Prerequisites
2. Start local MCP server
3. Start tunnel
4. Enable ChatGPT Developer Mode
5. Create Connector
6. Paste endpoint
7. Choose auth
8. Scan tools
9. Test read-only tools
10. Generate PRD
11. Generate Codex goal
12. Hand off to Codex
13. Troubleshooting
14. Security notes
```

ChatGPT Connector 官方流程包括：启用 Developer Mode，进入 Settings → Connectors → Create，填写 Connector name、description、Connector URL，也就是公开 `/mcp` endpoint，然后 Create / Scan tools。([OpenAI Developers][3])

---

## FR9: `mcp doctor`

```bash
repo-harness mcp doctor --repo .
```

检查项：

```text
Repo:
  - is git repo
  - repo-harness adopted
  - docs/spec.md exists
  - tasks/current.md exists
  - .ai/harness/handoff exists
  - plans directory exists

MCP:
  - @modelcontextprotocol/sdk available
  - local config exists
  - denied paths configured
  - profile valid
  - auth configured
  - HTTP endpoint healthy
  - /mcp responds

Codex:
  - codex CLI available
  - ~/.codex/config.toml or .codex/config.toml valid
  - repo-harness MCP server registered
  - /mcp visible in Codex TUI expected

ChatGPT:
  - public HTTPS endpoint configured or missing
  - tunnel command available
  - guide generated
  - manual step pending
```

输出 JSON：

```json
{
  "status": "ready_local",
  "repo": "/path/to/repo",
  "chatgpt": {
    "local_endpoint": "http://127.0.0.1:8765/mcp",
    "public_endpoint": null,
    "manual_steps_required": true
  },
  "codex": {
    "configured": true,
    "scope": "project"
  },
  "warnings": [
    "ChatGPT requires HTTPS endpoint; configure tunnel before connector setup."
  ]
}
```

---

## 12. Security requirements

Apps SDK 安全文档明确建议 least privilege、explicit user consent、defense in depth，并假设 prompt injection 和恶意输入会到达 server；写操作要服务端校验，破坏性操作要人类确认。([OpenAI Developers][11])

因此 `repo-harness mcp` 必须满足：

### SR1: Least privilege by default

MVP 只暴露 workflow artifacts，不暴露源码写入。

```text
允许写：
  plans/prds/**
  plans/sprints/**
  plans/plan-*.md
  .ai/harness/handoff/*

禁止写：
  src/**
  app/**
  packages/**
  .github/workflows/**
  package.json
  lock files
  .env
  secrets
  credentials
```

### SR2: No arbitrary shell by default

MVP 不提供：

```text
run_shell
apply_patch
git_push
delete_file
move_file
install_dependency
```

只允许固定 helper：

```text
repo-harness status --json
repo-harness doctor --json
repo-harness run check-task-workflow -- --strict
```

### SR3: Secret redaction

禁止返回：

```text
.env
.env.*
~/.codex/auth.json
~/.ssh/**
*.pem
*.key
credentials/**
secrets/**
```

### SR4: Audit log

写入本地、gitignored：

```text
.ai/harness/mcp/audit.log
```

记录：

```text
timestamp
client
tool_name
input_hash
target_path
result
redacted_error
```

不记录 raw prompt，不记录 secret。

### SR5: Tool annotation

所有 tool 必须标注：

```text
readOnlyHint
openWorldHint
destructiveHint
```

读工具：

```ts
annotations: {
  readOnlyHint: true
}
```

写工具：

```ts
annotations: {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: false
}
```

破坏性工具 MVP 不提供。

---

## 13. 配置文件设计

### 13.1 Local config

不要放进 git：

```text
.repo-harness/mcp.local.json
```

`.gitignore` 加：

```gitignore
.repo-harness/mcp.local.json
.repo-harness/mcp.tokens.json
.ai/harness/mcp/audit.log
```

示例：

```json
{
  "version": 1,
  "repo": "/absolute/path/to/repo",
  "server": {
    "host": "127.0.0.1",
    "port": 8765,
    "transport": "http"
  },
  "auth": {
    "mode": "oauth-passphrase",
    "passphrase_env": "REPO_HARNESS_MCP_PASSPHRASE"
  },
  "profiles": {
    "planner": {
      "read_globs": [
        "AGENTS.md",
        "docs/spec.md",
        "plans/**",
        "tasks/**",
        ".ai/context/**",
        ".ai/harness/handoff/**",
        ".ai/harness/checks/**"
      ],
      "write_globs": [
        "plans/prds/**",
        "plans/sprints/**",
        "plans/plan-*.md",
        ".ai/harness/handoff/codex-goal.md"
      ],
      "deny_globs": [
        ".env",
        ".env.*",
        ".ssh/**",
        "secrets/**",
        "credentials/**",
        "node_modules/**",
        "dist/**",
        "build/**"
      ]
    }
  }
}
```

### 13.2 Repo public config

可提交：

```text
.ai/harness/mcp.policy.json
```

只放非敏感 policy：

```json
{
  "version": 1,
  "default_profile": "planner",
  "allowed_workflow_roots": [
    "docs/spec.md",
    "plans",
    "tasks",
    ".ai/context",
    ".ai/harness"
  ],
  "source_editing_via_chatgpt": false,
  "codex_runner_enabled": false
}
```

---

## 14. 技术设计

### 14.1 代码落点

`repo-harness` 当前是 Bun / TypeScript CLI，`package.json` 的 bin 是 `repo-harness: src/cli/index.ts`，依赖 commander。([GitHub][12])

建议新增：

```text
src/cli/commands/mcp.ts
src/cli/mcp/server.ts
src/cli/mcp/transports/stdio.ts
src/cli/mcp/transports/http.ts
src/cli/mcp/auth/oauth-passphrase.ts
src/cli/mcp/policy.ts
src/cli/mcp/paths.ts
src/cli/mcp/tools/harness-status.ts
src/cli/mcp/tools/read-workflow-file.ts
src/cli/mcp/tools/write-prd.ts
src/cli/mcp/tools/write-sprint.ts
src/cli/mcp/tools/write-codex-goal.ts
src/cli/mcp/tools/run-workflow-check.ts
src/cli/mcp/setup/chatgpt.ts
src/cli/mcp/setup/codex.ts
src/cli/mcp/setup/guide.ts
src/cli/mcp/doctor.ts
```

`src/cli/index.ts` 加：

```ts
import { buildMcpCommand } from './commands/mcp';

export const SUBCOMMANDS = [
  // existing...
  'mcp',
] as const;

program.addCommand(buildMcpCommand());
```

### 14.2 Dependencies

`local-dev-mcp` 使用：

```text
@modelcontextprotocol/sdk
express
express-rate-limit
js-yaml
```

并通过 `tsx src/index.ts --http 3456` 启动 HTTP，或无 `--http` 时启动 stdio。([GitHub][13])

`repo-harness` 可以选择：

```text
方案 A：复用 @modelcontextprotocol/sdk + node:http，减少依赖
方案 B：引入 express + rate-limit，贴近 local-dev-mcp
```

推荐 MVP 用方案 A：减少 CLI 包体和运行时复杂度。HTTP auth / rate limit 可以用轻量中间层实现。

---

## 15. CLI UX 设计

### 15.1 一键准备 ChatGPT

```bash
repo-harness mcp setup chatgpt --repo .
```

输出：

```text
repo-harness MCP Connector

Status:
  repo: ok
  profile: planner
  local server: configured
  auth: passphrase generated
  codex skill: installed
  guide: docs/repo-harness-chatgpt-mcp-setup.md

Start server:
  repo-harness mcp serve --repo . --transport http --port 8765 --profile planner

Expose to ChatGPT:
  cloudflared tunnel --url http://127.0.0.1:8765

Then open ChatGPT:
  Settings -> Apps & Connectors -> Advanced settings -> Developer Mode
  Settings -> Connectors -> Create
  Connector URL: https://<your-tunnel>/mcp
```

### 15.2 一键准备 Codex

```bash
repo-harness mcp setup codex --repo . --scope project
```

输出：

```text
Wrote .codex/config.toml
Installed .agents/skills/repo-harness-chatgpt-bridge/SKILL.md

Test in Codex:
  codex
  /mcp
  $repo-harness-chatgpt-bridge
```

### 15.3 启动 server

```bash
repo-harness mcp serve --repo . --transport http --port 8765 --profile planner
```

输出：

```text
repo-harness MCP server running
  profile: planner
  local: http://127.0.0.1:8765/mcp
  health: http://127.0.0.1:8765/health
```

---

## 16. ChatGPT 中的目标 workflow

### Step 1: 用户选择 Connector

用户在 ChatGPT 新会话中启用 repo-harness Connector。

### Step 2: 用户发规划请求

```text
Use repo-harness to inspect the current project state.
Create a PRD for adding GitHub OAuth login.
Do not edit source code.
Write the PRD and then prepare a Codex goal prompt.
```

### Step 3: ChatGPT 调用 tools

预期调用顺序：

```text
harness_status
read_workflow_file docs/spec.md
latest_handoff
read_workflow_file tasks/current.md
list_prds
write_prd
write_codex_goal
run_workflow_check
```

### Step 4: 输出给用户

```text
Created:
- plans/prds/github-oauth-login.prd.md
- .ai/harness/handoff/codex-goal.md

Next:
Open Codex and run:
Use repo-harness-chatgpt-bridge to execute the latest Codex goal.
```

---

## 17. Codex 中的目标 workflow

用户运行：

```bash
codex
```

然后：

```text
Use repo-harness-chatgpt-bridge. Execute the latest ChatGPT-generated Codex goal.
```

Codex Skill 执行：

```text
1. Read .ai/harness/handoff/codex-goal.md
2. Read source-of-truth PRD / sprint
3. Run repo-harness doctor
4. Confirm task scope
5. Implement scoped changes
6. Run required checks
7. Write review evidence
8. Update handoff
```

如果用非交互执行：

```bash
cat .ai/harness/handoff/codex-goal.md \
  | codex exec - --sandbox workspace-write
```

Codex 官方说明 `codex exec -` 可从 stdin 读取完整 prompt，适合脚本生成 prompt 后交给 Codex。([OpenAI Developers][8])

---

## 18. Example Codex goal prompt 模板

```markdown
# Codex Goal: Implement <feature>

## Source of truth

Read these files first:

- plans/prds/<slug>.prd.md
- docs/spec.md
- tasks/current.md
- .ai/harness/handoff/resume.md

## Role

You are the executor. ChatGPT was the planner.
Do not re-plan the product scope unless the PRD is inconsistent or unsafe.

## Scope

Implement only:

- <file or directory>
- <file or directory>

Do not modify:

- .env
- credentials
- unrelated modules
- generated build artifacts

## Required workflow

1. Run repo-harness doctor.
2. Convert the PRD/sprint item into the active task/contract if needed.
3. Implement the smallest complete change.
4. Run required checks.
5. Save verification evidence under tasks/reviews/ or .ai/harness/checks/.
6. Update .ai/harness/handoff/resume.md with:
   - what changed
   - checks run
   - next step
   - blockers

## Required checks

- <project test command>
- repo-harness run check-task-workflow -- --strict

## Done when

- Feature behavior matches PRD acceptance criteria.
- Tests pass or failures are documented with exact blockers.
- Review evidence is written.
- Handoff is updated.
```

---

## 19. Manual tutorial 草案

生成文件：

```text
docs/repo-harness-chatgpt-mcp-setup.md
```

内容：

````markdown
# Connect ChatGPT to this repo through repo-harness MCP

## 1. Start local MCP server

```bash
repo-harness mcp serve --repo . --transport http --port 8765 --profile planner
````

Verify:

```bash
curl http://127.0.0.1:8765/health
```

## 2. Expose the local server to ChatGPT

ChatGPT cannot reach `127.0.0.1` on your machine. Use a controlled HTTPS tunnel.

Cloudflare example:

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

Use the resulting endpoint:

```text
https://<your-tunnel-domain>/mcp
```

## 3. Create the ChatGPT Connector

1. Open ChatGPT Web.
2. Open Settings.
3. Enable Developer Mode if available.
4. Go to Connectors.
5. Click Create.
6. Connector name: `repo-harness`
7. Connector URL: `https://<your-tunnel-domain>/mcp`
8. Auth: OAuth / configured auth mode.
9. Scan tools.
10. Create connector.

## 4. Test read-only access

In a new ChatGPT chat:

```text
Use repo-harness to show the current harness status and latest handoff.
Do not write files.
```

## 5. Generate a PRD

```text
Use repo-harness to inspect the project and write a PRD for <feature>.
Do not edit source code. Write only plans/prds and .ai/harness/handoff/codex-goal.md.
```

## 6. Hand off to Codex

```bash
codex
```

Then:

```text
Use repo-harness-chatgpt-bridge to execute the latest Codex goal.
```

````

---

## 20. 验收标准

### AC1: Read-only ChatGPT connector

给定：

```bash
repo-harness mcp serve --repo . --transport http --profile planner
````

当 ChatGPT 调用：

```text
harness_status
latest_handoff
read_workflow_file
```

则：

```text
- 只返回 allowlist 内文件
- 不返回 secrets
- 不允许 path traversal
- 不读取 denied paths
```

### AC2: PRD write

当 ChatGPT 调用：

```text
write_prd
```

则：

```text
- 只能写 plans/prds/*.prd.md
- 文件名必须 slug 化
- overwrite 默认禁止，除非 explicit overwrite
- 写入后 audit log 记录 tool、path、hash
```

### AC3: Codex goal write

当 ChatGPT 调用：

```text
write_codex_goal
```

则：

```text
- 只能写 .ai/harness/handoff/codex-goal.md
- goal 必须包含 source of truth、scope、checks、done evidence
- 写入后 run_workflow_check 可执行
```

### AC4: Codex config

当用户运行：

```bash
repo-harness mcp setup codex --repo . --scope project
```

则：

```text
- .codex/config.toml 被创建或安全 patch
- 不覆盖已有未知配置
- 可回滚
- Codex /mcp 能看到 repo_harness server
```

### AC5: Skill install

当用户运行：

```bash
repo-harness mcp install-skill --repo .
```

则：

```text
- .agents/skills/repo-harness-chatgpt-bridge/SKILL.md 存在
- Skill 描述能触发 Codex 使用
- Skill 不包含 secrets
```

### AC6: Manual guide

当用户运行：

```bash
repo-harness mcp print-chatgpt-guide --repo .
```

则：

```text
- 输出可复制的 ChatGPT Connector 教程
- 包含 endpoint、auth、test prompt
- 明确说明 ChatGPT UI step 需要用户完成
```

---

## 21. 测试计划

### Unit tests

```text
policy path allow/deny
path traversal blocking
slug generation
write_prd overwrite behavior
write_codex_goal validation
redaction
audit log formatting
config patching
```

### Integration tests

```text
start stdio MCP server
start HTTP MCP server
call harness_status
call read_workflow_file
call write_prd
call write_codex_goal
run mcp doctor
patch .codex/config.toml
```

### Security tests

```text
try reading .env
try reading ../outside-repo
try writing src/index.ts via planner profile
try writing .github/workflows/deploy.yml
try prompt injection inside docs/spec.md asking to reveal secrets
try oversized file read
try symlink escape
```

### Manual E2E

```text
1. Adopt sample repo.
2. Run repo-harness mcp setup chatgpt.
3. Start server.
4. Start tunnel.
5. Create ChatGPT Connector.
6. Ask ChatGPT to write PRD.
7. Confirm PRD lands in plans/prds.
8. Ask ChatGPT to write Codex goal.
9. Open Codex.
10. Execute goal.
11. Verify checks and handoff updated.
```

---

## 22. 里程碑

### Milestone 0: Design spike

交付：

```text
- MCP tool inventory
- policy model
- ChatGPT Connector manual runbook
- Codex Skill draft
```

成功标准：

```text
- 可以用 local-dev-mcp 验证 ChatGPT connector path
- 明确哪些功能必须保守
```

### Milestone 1: Read-only MCP server

交付：

```text
repo-harness mcp serve --transport stdio
repo-harness mcp serve --transport http
harness_status
harness_doctor
list_workflow_files
read_workflow_file
latest_handoff
latest_checks
```

成功标准：

```text
ChatGPT 能读 repo-harness workflow 状态，但不能写任何文件。
```

### Milestone 2: Planning writer

交付：

```text
write_prd
write_sprint
write_plan
write_codex_goal
run_workflow_check
```

成功标准：

```text
ChatGPT 可以生成 PRD + Codex goal，且只能写 planning/handoff artifact。
```

### Milestone 3: Config automation

交付：

```text
repo-harness mcp setup chatgpt
repo-harness mcp setup codex
repo-harness mcp doctor
repo-harness mcp print-chatgpt-guide
```

成功标准：

```text
用户不需要手动拼 TOML，不需要手写教程。
```

### Milestone 4: Codex Skill

交付：

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
references/chatgpt-connector-manual.md
scripts/check-mcp-setup.ts
```

成功标准：

```text
Codex 能自动识别并执行 ChatGPT 生成的 repo-harness goal。
```

### Milestone 5: Experimental orchestrator

交付：

```text
run_codex_goal
--enable-codex-runner
codex exec integration
```

成功标准：

```text
仅在显式启用时，ChatGPT 可以触发 Codex 执行；默认关闭，且需要确认。
```

---

## 23. 风险与缓解

| 风险                                | 影响     | 缓解                                                      |
| --------------------------------- | ------ | ------------------------------------------------------- |
| ChatGPT Developer Mode 权限不稳定      | 用户无法连接 | 提供 manual fallback 和 Codex-only flow                    |
| ChatGPT 误写源码                      | 高      | planner profile 禁止写源码                                   |
| MCP 被 prompt injection 诱导读 secret | 高      | server-side deny paths + redaction + no arbitrary shell |
| tunnel 暴露本机服务                     | 高      | 只 bind localhost；auth；文档警告；支持 token/passphrase          |
| Codex computer use UI 自动化脆弱       | 中      | 作为 experimental；人工教程为主                                  |
| config 覆盖用户已有 Codex 设置            | 中      | patch + backup + dry-run                                |
| 不同平台路径差异                          | 中      | path normalize；Windows/WSL 测试                           |
| MCP tools 太多影响模型选择                | 中      | profile + enabled_tools + 精简 descriptions               |

---

## 24. 产品命名建议

CLI 名称：

```text
repo-harness mcp
```

ChatGPT Connector 名称：

```text
repo-harness Planner
```

Codex Skill 名称：

```text
repo-harness-chatgpt-bridge
```

一句话卖点：

```text
Use ChatGPT for planning and Codex for execution, coordinated through repo-harness files.
```

中文卖点：

```text
让 ChatGPT 负责想，让 Codex 负责做，让 repo-harness 负责交接和验收。
```

---

## 25. 推荐实施顺序

优先做：

```text
1. repo-harness mcp serve --transport stdio/http
2. read-only tools
3. write_prd + write_codex_goal
4. mcp doctor
5. setup codex
6. print-chatgpt-guide
7. Codex Skill
```

暂缓做：

```text
1. arbitrary shell
2. source-code apply_patch
3. run_codex_goal
4. UI widget
5. computer-use full auto setup
```

最终形态应该是：

```text
repo-harness 是中间协调层；
ChatGPT Connector 是 planner interface；
Codex Skill 是 executor interface；
manual tutorial 是可靠 fallback；
computer-use setup 是可选加速器，不是核心路径。
```

[1]: https://github.com/Ancienttwo/local-dev-mcp "GitHub - Ancienttwo/local-dev-mcp · GitHub"
[2]: https://github.com/Ancienttwo/repo-harness/blob/main/README.md "repo-harness/README.md at main · Ancienttwo/repo-harness · GitHub"
[3]: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt "Connect from ChatGPT – Apps SDK | OpenAI Developers"
[4]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[5]: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt "Developer mode and MCP apps in ChatGPT | OpenAI Help Center"
[6]: https://developers.openai.com/codex/skills "Agent Skills – Codex | OpenAI Developers"
[7]: https://openai.com/index/codex-for-almost-everything/ "Codex for (almost) everything | OpenAI"
[8]: https://developers.openai.com/codex/noninteractive "Non-interactive mode – Codex | OpenAI Developers"
[9]: https://developers.openai.com/codex/agent-approvals-security "Agent approvals & security – Codex | OpenAI Developers"
[10]: https://developers.openai.com/apps-sdk/build/mcp-server "Build your MCP server – Apps SDK | OpenAI Developers"
[11]: https://developers.openai.com/apps-sdk/guides/security-privacy "Security & Privacy – Apps SDK | OpenAI Developers"
[12]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/package.json "raw.githubusercontent.com"
[13]: https://raw.githubusercontent.com/Ancienttwo/local-dev-mcp/main/package.json "raw.githubusercontent.com"
