可以集成，而且 `repo-harness` 的定位很适合做这件事。但我建议你**不要把它做成“ChatGPT Pro 代理”**，而是做成：

```text
repo-harness = AI workflow control plane
MCP = ChatGPT / Codex 进入这个 control plane 的接口
Codex = executor
ChatGPT = planner / reviewer
```

也就是：

```text
ChatGPT Web
  └─ MCP: repo-harness mcp serve
       └─ 读 repo-harness 状态
       └─ 写 PRD / sprint / plan / handoff
       └─ 生成 Codex /goal prompt

Codex CLI / IDE
  └─ repo-harness hooks + skills + contracts
       └─ 执行 plan
       └─ 跑 checks
       └─ 写 review evidence / handoff
```

这和你的 README 里已有方向高度一致：`repo-harness` 已经把 Claude/Codex session 变成 repo-local workflow，把 context、plans、handoffs、checks、review evidence 写回项目，让下一次 agent session 不靠 chat memory 续接；并且它本来就强调 Claude/Codex 通过 repo 文件保持一致，而不是通过同一个聊天线程保持一致。([GitHub][1])

---

## 先校正一个现实前提

不要把功能描述成“让 Codex 用 ChatGPT 网页版 Pro 模型”。这个基本不可产品化。更正确的卖点是：

> Bring ChatGPT planning into a repo-harness workflow via MCP, then hand execution to Codex.

另外，ChatGPT Web 里的自定义 MCP / Developer Mode 权限目前要看账号和 workspace。OpenAI Help Center 当前写的是：完整 MCP 支持，包括 write/modify actions，正在向 ChatGPT Business、Enterprise、Edu beta 推出，并且功能、UI、权限可能变化；同页也写到 Developer Mode / full MCP 在 ChatGPT Web 上面向 Business 和 Enterprise/Edu customers。([OpenAI Help Center][2])

所以你的 CLI 里最好不要假设每个个人 Pro 用户都能直接接 ChatGPT MCP。应该支持两种模式：

```text
A. ChatGPT 可用 MCP：
   ChatGPT -> repo-harness MCP -> repo files -> Codex

B. ChatGPT 不可用 MCP：
   ChatGPT 负责产出 PRD/plan 文本
   repo-harness ingest/capture 这些文本
   Codex 按 repo-harness workflow 执行
```

---

# 方案一：内部集成，做 `repo-harness mcp`

这是最值得做的产品化路线。

你现在的 README 明确写了当前边界：`repo-harness` 不是 agent gateway、product runtime、database service 或 MCP server；它的边界是 inspect repo、安装/刷新 workflow files、把 host events route 到 repo-local hooks、验证 workflow surfaces 一致。([GitHub][1])

所以不要一下子把它变成通用 agent gateway。更自然的增量是：

```text
repo-harness mcp serve
```

它只暴露 `repo-harness` 已经拥有的 workflow surfaces：

```text
docs/spec.md
plans/
plans/prds/
plans/sprints/
tasks/current.md
tasks/contracts/
tasks/reviews/
.ai/context/
.ai/harness/handoff/
.ai/harness/checks/
```

这些也正是你 README 里定义的 durable truth surface。([GitHub][1])

---

## 推荐 CLI 形态

可以加一个新 command group：

```bash
repo-harness mcp serve \
  --repo . \
  --transport stdio \
  --profile planner
```

或者给 ChatGPT Web 用 HTTP：

```bash
repo-harness mcp serve \
  --repo . \
  --transport http \
  --host 127.0.0.1 \
  --port 8765 \
  --profile planner \
  --write-policy planning-only
```

再加几个配置辅助命令：

```bash
repo-harness mcp doctor --repo .

repo-harness mcp configure codex \
  --repo . \
  --scope project \
  --transport stdio

repo-harness mcp print-chatgpt \
  --repo . \
  --url https://your-tunnel.example.com/mcp
```

你的 CLI 现在已经有 `tools ensure/configure codegraph` 这种“显式外部工具生命周期”入口，而且源码注释里也已经把 detector、installer、MCP lifecycle 分开了；所以 `repo-harness mcp` 放在同一层级很顺。([GitHub][3])

`src/cli/index.ts` 目前已经集中注册 `init / install / adopt / run / tools / brain / docs` 等子命令，新增 `mcp` 只需要引入 `buildMcpCommand()` 并把 `'mcp'` 加进 `SUBCOMMANDS`。([GitHub][4])

---

# MCP tool 设计

不要先暴露通用 shell。先暴露 workflow tools。

## V0：只读 planner tools

这些可以默认安全开放：

```text
harness_status
harness_doctor
inspect_project_state
read_workflow_file
list_plans
list_prds
list_sprints
list_contracts
latest_handoff
latest_checks
```

含义：

```text
harness_status
  -> repo-harness status --json

harness_doctor
  -> repo-harness doctor --json

inspect_project_state
  -> scripts/inspect-project-state.ts 或等价 helper

read_workflow_file
  -> 只允许读 docs/spec.md、plans/**、tasks/**、.ai/context/**、.ai/harness/handoff/**
```

这样 ChatGPT 可以先做：

```text
读稳定产品意图
读当前 sprint / plan / task
读 handoff
读 checks/review evidence
然后给出下一步 plan
```

这和 `repo-harness` 的核心不变量一致：authority 在 file-backed plan、contract、review、checks、handoff，而不是 chat thread。([GitHub][1])

## V1：规划写入 tools

然后再加写入工具，但只允许写 workflow artifacts，不允许写业务源码：

```text
write_prd
write_sprint
write_plan
update_handoff
prepare_codex_goal_prompt
project_plan_to_contract
run_workflow_check
```

建议路径限制：

```text
write_prd
  -> plans/prds/*.prd.md

write_sprint
  -> plans/sprints/*.sprint.md

write_plan
  -> plans/plan-*.md

update_handoff
  -> .ai/harness/handoff/resume.md 或新的 planner handoff 文件

prepare_codex_goal_prompt
  -> 输出一段 Codex /goal prompt
  -> 可选写到 .ai/harness/handoff/codex-goal.md
```

`repo-harness` 已经有 Plan -> Approved -> Project -> Contract -> Review -> Closeout 的生命周期；README 里也写到 plan 可以通过 `capture-plan.sh --execute` 或 `plan-to-todo.sh --plan` 投射成 active markers、contract、review file、notes 等执行文件。([GitHub][1])

所以 MCP 里的 `project_plan_to_contract` 不应该自己重新实现逻辑，而应该调用你已有 helper。

你的 `repo-harness run` 当前就是“Run a bundled repo-harness workflow helper”，这正好可以作为 MCP server 内部调用 helper 的稳定入口。([GitHub][5])

## V2：可选 executor tools

这层要谨慎，默认关闭：

```text
run_codex_exec
run_checks
open_contract_worktree
closeout_contract
```

也就是：

```text
ChatGPT -> repo-harness MCP -> run_codex_exec -> codex exec
```

Codex 官方现在支持 `codex exec` 做非交互式脚本/CI 风格运行；官方文档说明它适合 pipeline、CLI workflow、预设 sandbox/approval settings 等场景。([OpenAI Developers][6])

但我建议：

```text
默认不要开 run_codex_exec
只有显式 --enable-codex-runner 才开
而且必须 approval prompt
```

例如：

```bash
repo-harness mcp serve \
  --repo . \
  --transport http \
  --profile planner \
  --write-policy planning-only \
  --enable-codex-runner=false
```

如果打开：

```bash
repo-harness mcp serve \
  --repo . \
  --transport http \
  --profile orchestrator \
  --write-policy planning-only \
  --enable-codex-runner \
  --codex-sandbox workspace-write
```

---

# 推荐架构

## 最稳的内置架构

```text
ChatGPT Web
  |
  | HTTPS /mcp
  v
repo-harness mcp serve --profile planner
  |
  | read/write only repo-harness workflow files
  v
target repo
  |
  | /goal prompt or sprint file
  v
Codex CLI / IDE
  |
  | repo-harness hooks
  v
contracts / checks / reviews / handoff
```

这个版本最安全，因为 ChatGPT 只负责“想”和“写任务契约”，Codex 负责“做”。

## 更自动的架构

```text
ChatGPT Web
  |
  | MCP tool call: run_codex_task
  v
repo-harness MCP server
  |
  | spawn
  v
codex exec --cd <repo> --sandbox workspace-write "<goal>"
  |
  v
repo changes + checks + review evidence
```

这个版本更像你说的 hackathon 插件，但安全边界更难做。建议作为 experimental。

---

# Codex 侧怎么接 `repo-harness mcp`

Codex 官方 MCP 文档写到：MCP 可以把模型连接到工具和上下文；Codex CLI 和 IDE extension 都支持 MCP server，并且 MCP 配置默认在 `~/.codex/config.toml`，也可以放到 trusted project 的 `.codex/config.toml`。([OpenAI Developers][7])

所以你可以让 `repo-harness` 自动写 Codex 配置。

## stdio 配置

命令形式：

```bash
codex mcp add repo-harness -- \
  repo-harness mcp serve \
    --repo /path/to/repo \
    --transport stdio \
    --profile executor
```

或者直接写 `.codex/config.toml`：

```toml
[mcp_servers.repo_harness]
command = "repo-harness"
args = [
  "mcp",
  "serve",
  "--repo",
  "/path/to/repo",
  "--transport",
  "stdio",
  "--profile",
  "executor"
]

enabled_tools = [
  "harness_status",
  "read_workflow_file",
  "latest_handoff",
  "prepare_codex_goal_prompt",
  "run_workflow_check"
]

default_tools_approval_mode = "prompt"
```

Codex 支持 stdio MCP server，也支持 Streamable HTTP server；stdio 用 `command/args/env/cwd`，HTTP 用 `url`、bearer token 或 headers。([OpenAI Developers][7])

## HTTP 配置

本机给 Codex 用不需要公网 tunnel：

```toml
[mcp_servers.repo_harness]
url = "http://127.0.0.1:8765/mcp"

enabled_tools = [
  "harness_status",
  "read_workflow_file",
  "latest_handoff",
  "run_workflow_check"
]

default_tools_approval_mode = "prompt"
```

---

# ChatGPT Web 侧怎么接

ChatGPT Web 不能访问你电脑上的 `127.0.0.1`，所以 HTTP MCP 需要 HTTPS endpoint。OpenAI Apps SDK 文档写到，连接 ChatGPT 时要确保 MCP server 可通过 HTTPS 访问；本地开发可以用 Secure MCP Tunnel、ngrok 或 Cloudflare Tunnel。([OpenAI Developers][8])

本地：

```bash
repo-harness mcp serve \
  --repo /path/to/repo \
  --transport http \
  --host 127.0.0.1 \
  --port 8765 \
  --profile planner \
  --write-policy planning-only
```

然后 tunnel：

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

ChatGPT 里配置：

```text
Settings / Workspace Settings
→ Apps / Connectors
→ Create
→ MCP endpoint: https://<tunnel-domain>/mcp
→ Auth: Bearer / OAuth / no-auth for local testing only
→ Scan tools
```

---

# 安全策略：这部分很重要

`repo-harness mcp` 的默认策略应该非常保守。

## 默认不要暴露这些

```text
run_shell
apply_patch 到业务源码
读 .env
读 ~/.codex/auth.json
读 ~/.ssh
读 .git/config
读 credentials/secrets
直接执行 git push
直接执行 rm / mv / chmod / curl | sh
```

ChatGPT Developer Mode 文档也明确提醒，不安全或不可信 MCP server 会增加 prompt injection 等安全风险；写入/修改动作可能要求确认，有些高风险动作可能会被阻止。([OpenAI Help Center][2])

## 默认只允许这些路径

```text
AGENTS.md
CLAUDE.md
docs/spec.md
docs/reference-configs/**
plans/**
tasks/current.md
tasks/contracts/**
tasks/reviews/**
tasks/notes/**
.ai/context/**
.ai/harness/handoff/**
.ai/harness/checks/**
```

## 默认 policy

```yaml
profiles:
  planner:
    read:
      - workflow_files
      - context_files
      - handoff
      - checks
    write:
      - plans/**
      - plans/prds/**
      - plans/sprints/**
      - .ai/harness/handoff/**
    execute:
      - repo-harness run check-task-workflow
    deny:
      - source_edits
      - arbitrary_shell
      - secrets
      - git_push

  executor:
    read:
      - workflow_files
    write:
      - tasks/reviews/**
      - .ai/harness/checks/**
      - .ai/harness/handoff/**
    execute:
      - repo-harness helpers
    deny:
      - arbitrary_shell_from_mcp
```

这样你的 MCP server 不是“本地电脑遥控器”，而是“repo-harness workflow API”。

---

# 代码落点建议

你的项目是 Bun/TypeScript CLI，`package.json` 也显示 bin 入口是 `src/cli/index.ts`，另有 `repo-harness-hook`。([GitHub][9])

建议新增：

```text
src/cli/commands/mcp.ts
src/cli/mcp/server.ts
src/cli/mcp/transports/stdio.ts
src/cli/mcp/transports/http.ts
src/cli/mcp/tools/status.ts
src/cli/mcp/tools/read-workflow-file.ts
src/cli/mcp/tools/write-plan.ts
src/cli/mcp/tools/prepare-codex-goal.ts
src/cli/mcp/policy.ts
src/cli/mcp/paths.ts
src/cli/mcp/codex-runner.ts   # experimental
```

`index.ts`：

```ts
import { buildMcpCommand } from './commands/mcp';

export const SUBCOMMANDS = [
  // ...
  'mcp',
] as const;

program.addCommand(buildMcpCommand());
```

伪代码：

```ts
export function buildMcpCommand(): Command {
  const mcp = new Command('mcp').description('Serve repo-harness workflow tools over MCP');

  mcp
    .command('serve')
    .requiredOption('--repo <path>', 'Target repository')
    .option('--transport <transport>', 'stdio|http', 'stdio')
    .option('--host <host>', 'HTTP host', '127.0.0.1')
    .option('--port <port>', 'HTTP port', '8765')
    .option('--profile <profile>', 'planner|executor|orchestrator', 'planner')
    .option('--write-policy <policy>', 'off|planning-only|workflow|execution', 'planning-only')
    .option('--enable-codex-runner', 'Expose experimental Codex runner tools')
    .action(async (opts) => {
      await serveRepoHarnessMcp(opts);
    });

  mcp
    .command('doctor')
    .requiredOption('--repo <path>')
    .action((opts) => {
      // validate opt-in marker, paths, policy, codex config, tunnel hints
    });

  mcp
    .command('configure')
    .argument('<target>', 'codex|chatgpt')
    .requiredOption('--repo <path>')
    .option('--scope <scope>', 'user|project', 'project')
    .option('--transport <transport>', 'stdio|http', 'stdio')
    .action((target, opts) => {
      // write ~/.codex/config.toml or print ChatGPT connector instructions
    });

  return mcp;
}
```

MCP server instructions 里建议写得很强：

```text
You are connected to repo-harness. This server exposes workflow artifacts,
not general filesystem access. Prefer reading docs/spec.md, plans, tasks,
handoff, and checks before proposing implementation. Do not edit application
source through this server. Produce PRDs, sprint files, plans, and Codex goal
prompts. Codex is the executor.
```

Codex MCP 文档也建议 MCP server 的 `instructions` 用来放跨工具 workflow、约束和 rate limits，并且前 512 个字符要自包含，因为 Codex 会用它决定如何使用 server。([OpenAI Developers][7])

---

# 如果不做内部集成：现在就能用的 workflow

不改 `repo-harness` 也能接进这个流程。做法是让 ChatGPT 通过别的 local-dev MCP 读仓库，但规定它**只产出 repo-harness artifacts**，然后让 Codex 继续走 `repo-harness`。

## 1. 初始化目标 repo

```bash
cd /path/to/repo

repo-harness install --target codex
repo-harness adopt --repo .
repo-harness tools ensure codegraph --repo . --init --sync
repo-harness tools configure codegraph --target codex --location global --repo .
repo-harness doctor
```

`repo-harness adopt` 会把 `docs/spec.md`、`plans/`、`tasks/`、`.ai/context/`、`.ai/harness/`、helper scripts、`.ai/hooks/` 等写入目标 repo；host adapters 则通过 user-level `~/.claude/settings.json` 和 `~/.codex/hooks.json` 把 Claude/Codex 事件 route 进 `repo-harness-hook`。([GitHub][1])

## 2. 配好本地 MCP

可以先用现成 local-dev MCP，只暴露你的目标 repo，并把写权限限制到这些路径：

```text
docs/spec.md
plans/**
tasks/**
.ai/context/**
.ai/harness/**
```

不要让 ChatGPT 直接改 `src/**`、`app/**`、`packages/**` 这类业务源码。

## 3. 给 ChatGPT 的固定 prompt

```text
你现在通过 MCP 连接到了一个已经 adopt repo-harness 的仓库。

职责：
- 你是 planner/reviewer，不是 executor。
- 你可以读取 repo-harness workflow files。
- 你只能写 PRD、sprint、plan、handoff，不要修改业务源码。
- 执行交给 Codex。

请按顺序：
1. 读取 docs/spec.md
2. 读取 .ai/harness/handoff/resume.md
3. 读取 tasks/current.md
4. 检查 plans/prds、plans/sprints、plans/ 下是否已有相关计划
5. 生成或更新一个 plans/prds/<slug>.prd.md 或 plans/sprints/<slug>.sprint.md
6. 最后输出一段可以直接交给 Codex 的 /goal prompt

Codex /goal prompt 必须包含：
- source of truth 文件路径
- first task
- allowed files/scope
- required checks
- done evidence
- handoff update requirement
```

## 4. ChatGPT 产出后，本地检查

```bash
git diff -- docs plans tasks .ai

repo-harness run check-task-workflow -- --strict
# 或者项目里已有脚本：
bash scripts/check-task-workflow.sh --strict
```

## 5. 交给 Codex 执行

交互式：

```bash
codex
```

然后粘贴 ChatGPT 生成的 `/goal`：

```text
/goal Use plans/sprints/<slug>.sprint.md as the source of truth.

Follow repo-harness:
1. Select the next sprint item.
2. Project it into the active contract.
3. Implement only the scoped files.
4. Run required checks.
5. Update review evidence.
6. Update handoff.
7. Stop when the contract is complete or blocked.
```

或者非交互式：

```bash
codex exec \
  --cd . \
  --sandbox workspace-write \
  "$(cat .ai/harness/handoff/codex-goal.md)"
```

Codex 官方安全文档也建议非交互运行使用 `codex exec --sandbox workspace-write`，而不是危险的 bypass/sandbox 关闭模式。([OpenAI Developers][10])

---

# repo-harness 在这个 workflow 里的位置

最清晰的产品叙事是：

```text
ChatGPT provides high-quality planning.
Codex provides high-quality execution.
repo-harness provides durable coordination.
```

对应你的现有 surfaces：

```text
ChatGPT reads:
  docs/spec.md
  plans/**
  tasks/current.md
  .ai/context/**
  .ai/harness/handoff/**
  .ai/harness/checks/**

ChatGPT writes:
  plans/prds/*.prd.md
  plans/sprints/*.sprint.md
  plans/plan-*.md
  .ai/harness/handoff/codex-goal.md

Codex reads:
  same workflow files
  AGENTS.md / repo instructions
  active contract

Codex writes:
  source code
  tests
  tasks/reviews/**
  .ai/harness/checks/**
  .ai/harness/handoff/**
```

这正好贴合你 README 里的 long-running loop：先在强 planner 里 front-load discovery 和 engineering-plan judgment，把结果变成 `plans/prds/`，再变成 `plans/sprints/`，然后在 Codex 里创建指向 sprint file 的 Goal，由 harness 把每个 sprint item 投射进 plan -> contract -> worktree -> verification 流程。([GitHub][1])

---

# 我会按这个顺序做

## Milestone 1：MCP read-only server

目标：ChatGPT / Codex 都能读 repo-harness 状态。

实现：

```text
repo-harness mcp serve --transport stdio --profile planner
repo-harness mcp serve --transport http --profile planner
```

工具：

```text
harness_status
harness_doctor
read_workflow_file
list_workflow_files
latest_handoff
latest_checks
```

## Milestone 2：planning writer

目标：ChatGPT 可以产出 durable plan，但不能碰业务源码。

工具：

```text
write_prd
write_sprint
write_plan
prepare_codex_goal_prompt
run_workflow_check
```

## Milestone 3：Codex config generator

目标：用户一条命令把 MCP 加到 Codex。

```bash
repo-harness mcp configure codex --repo . --scope project
```

生成：

```toml
[mcp_servers.repo_harness]
command = "repo-harness"
args = ["mcp", "serve", "--repo", ".", "--transport", "stdio", "--profile", "executor"]
default_tools_approval_mode = "prompt"
```

## Milestone 4：ChatGPT connector helper

目标：用户一条命令得到 ChatGPT 设置说明。

```bash
repo-harness mcp print-chatgpt --repo .
```

输出：

```text
1. Start local server:
   repo-harness mcp serve --repo . --transport http --port 8765 --profile planner

2. Start tunnel:
   cloudflared tunnel --url http://127.0.0.1:8765

3. Add MCP endpoint in ChatGPT:
   https://<domain>/mcp
```

## Milestone 5：experimental Codex runner

目标：让 ChatGPT 可以通过 MCP 触发 Codex，但默认关闭。

```bash
repo-harness mcp serve \
  --repo . \
  --profile orchestrator \
  --enable-codex-runner
```

工具：

```text
run_codex_task
```

内部执行：

```bash
codex exec --cd <repo> --sandbox workspace-write "<prompt>"
```

---

## 最终建议

把它作为 `repo-harness` 的一个 optional sidecar：

```text
repo-harness mcp serve
```

不要改成“ChatGPT Pro bridge”。你的核心资产不是模型代理，而是：

```text
repo-local durable workflow
+ hooks
+ contracts
+ checks
+ handoff
+ Codex/Claude alignment
```

MCP 只是让 ChatGPT Web 也能进入这套 workflow。这样既能复刻“强 planner + 强 executor”的效果，也不会破坏 `repo-harness` 现在很清晰的产品边界。

[1]: https://github.com/Ancienttwo/repo-harness "GitHub - Ancienttwo/repo-harness · GitHub"
[2]: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt "Developer mode and MCP apps in ChatGPT | OpenAI Help Center"
[3]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/src/cli/commands/tools.ts "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/src/cli/index.ts "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/src/cli/commands/run.ts "raw.githubusercontent.com"
[6]: https://developers.openai.com/codex/noninteractive?utm_source=chatgpt.com "Non-interactive mode – Codex"
[7]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[8]: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt "Connect from ChatGPT – Apps SDK | OpenAI Developers"
[9]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/package.json "raw.githubusercontent.com"
[10]: https://developers.openai.com/codex/agent-approvals-security?utm_source=chatgpt.com "Agent approvals & security – Codex"
