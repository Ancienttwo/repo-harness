# Plan: Operator UI 改版（Architecture / Docs / Pipeline / Agent config）

> **Status**: Draft（等待 Aimpact 审阅；审阅前不写代码）
> **Created**: 20261005-0405
> **Slug**: operator-ui-revamp
> **Planning Source**: claude-plan
> **Orchestration Kind**: host-plan
> **Artifact Level**: work-package
> **Promotion Reason**: architecture_boundary
> **Verification Boundary**: 每个 phase 一个 PR；`bun run check:type`、受影响测试、`bun run build:operator-web`、真实浏览器截图
> **Rollback Surface**: 每个 phase 单独 `git revert <squash-commit>`；ledger 数据只增不改
> **Baseline**: `main@39d4e9edff716d0063d082fdb94ef811e74b9eba`
> **Spec**: `docs/spec.md`
> **Sources**: Claude 会话 "visualze"（2026-10-05 03:45 HKT 方案）；Dot 的评审（Aimpact 已全部接受）；Aimpact 附录（graph 库选型）

本文件位置说明：任务简报建议 `docs/plans/operator-ui-revamp.md`。仓库已有 plan 位置 `plans/`，命名规则是 `plan-YYYYMMDD-HHMM-<slug>.md`。所以本 plan 放在 `plans/`。

事实核对说明：下文的文件路径和行号都在 `39d4e9ed` 上核对过。没有核对的内容标为 **unverified**。从代码推断但没有运行的内容标为 **inferred**。

---

## 0. P1 / P2 / P3

**P1 地图（真实边界）**
- Operator 服务端：`src/effects/operator/server.ts`。前端：`src/operator-web/`。构建：`vite.operator.config.ts` → `dist/operator-ui`。
- 合约和 decoder：`src/core/operator/*`。读取器：`src/effects/operator/*`。
- Pipeline ledger：`src/core/pipeline/*`、`src/effects/pipeline/*`、`src/cli/commands/pipeline.ts`。
- 架构模型：`.archcontext/model/{nodes,relations,flows}`。生成文档：`docs/architecture/**`。
- Review packet：`src/effects/review/generic-review.ts`、`src/core/review/generic-review.ts`。
- 开发文档：`plans/prds`、`plans/sprints`、`plans/plan-*.md`、`tasks/contracts|reviews|notes`。头部解析器：`src/core/state/artifact-parsers.ts`。
- `.archcontext/model` 里没有节点覆盖 `src/effects/operator` 或 `src/operator-web`。Operator 现在不属于任何 capability。

**P2 一条真实路径（notify status）**
`src/core/operator/notify-status.ts` 定义 `NotifyStatusV1` → `src/effects/operator/notify-status.ts` 调用 `herdr`，secret 只报告 `configured|missing`（:48-68）→ `GET /api/v1/notify/status`（`server.ts:75`）→ `NotifyStatus.tsx:40` 用 `useObservationRefresh` 每 30 秒刷新（`useObservationRefresh.ts:3`）。本 plan 的每个新数据源都沿用这条模式：core 合约 + decoder，effects 读取器，GET 路由，前端轮询。

**P3 为什么现状是这样**
- #482（dd0cc107）把看板改为只读。`tests/effects/operator-write-boundary.test.ts:54` 断言写路由数量为 0。:62-68 扫描源码，只允许 `GET` 和 `HEAD`。
- 服务端没有 token，也没有 CSRF 防护。它只检查 loopback、Host 和 Origin。任何写路由都会被本机任何进程调用。
- 多份 PRD 写明「Operator Board 不增加 mutation」，例如 `plans/prds/20260828-2321-collaboration-substrate.prd.md:596`。
- 产品定位：Bot 是入口。Bot → repo-harness CLI → herdr 是唯一的指令通道。UI 的作用是降低 Bot 和人之间的信息差。

结论：本 plan 只扩展只读投影。所有写入仍然只走 CLI。

---

## 1. 目标与非目标

### 目标
1. **Architecture 工作区**：按模块查看架构。默认显示一跳视图，即调用方、模块、被调用方。显示模型事实、flows、验证命令和 §3 人写决策。
2. **Review prompt 导出**：新增 `repo-harness module review-prompt <capability-id> [--json]`。它是唯一来源。Bot 调用 CLI，UI 用 GET 显示同一个 core 输出，并提供复制。两者的 digest 必须相同。
3. **Docs 工作区**：把 PRD、Sprint、Plan、Contract、Review、Notes 和 capability 画成一张图（不是单父节点的树）。标出断链、状态冲突和停留过久的项。
4. **Pipeline 数据（D0）**：让 ledger 有真实数据。内容包括 Bot 事件接入、task/run 身份、幂等、一台在线主机上的一个权威 ledger、存储健康状态。
5. **Pipeline 可视化（D1）**：阶段轨道、门禁缺口和时间线。
6. **Agent config 页面**：只读清单，包括 CLAUDE.md/AGENTS.md 共享规则 drift、capability 本地合约文件、fleet 角色、engineer profile、skill、硬规则来源和 herdr dispatch 规则。

### 非目标
- 不加写路由，不在 UI 里派任务，不在 UI 里改文档或配置。
- 不嵌入 archctx Explorer，不启动 archctx daemon。
- 不做统一额度 tab。交互式会话没有 quota 或 token 账本（`docs/reference-configs/long-run-continuation.md:5`），不伪造数字。
- 不做 GPT Pro / MCP 配置面板（P2，最低优先级）。
- 不做桌面壳或菜单栏应用。
- 不做按 Bot 分开的数据库，不做 ledger 双写。
- 不新增 markdown 渲染库，也不新增前端 router 库。

---

## 2. 不变量

| # | 不变量 | 当前的强制点 | 本 plan 的义务 |
|---|---|---|---|
| I1 | Operator 只读 | `operator-write-boundary.test.ts:54`、:62-68；`server.ts:1444-1445` 返回 405 | 新路由都用 `method:'GET', write:false`。不改这两条断言 |
| I2 | 唯一指令通道：Bot → CLI → herdr | `pipeline.ts:20` 描述「never dispatches, merges or cleans」 | CLI `module review-prompt` 只输出文本，不派发 pane。UI 只显示和复制 |
| I3 | GET 白名单 | `OPERATOR_ROUTES`（`server.ts:93-109`），顺序在测试 :74-85 固定 | 每条新路由都登记在 `OPERATOR_ROUTES` 里。路径参数先匹配正则，再按索引查找，不能直接拼成文件路径 |
| I4 | 读取时不迁移、不派发、不建库 | pipeline 读取器只打开已发布的只读快照（`store.ts:131-134,174-187`） | 新读取器不打开 live DB，不创建目录，不调用 `herdr agent` 或 `pane` 写类动词 |
| I5 | 不泄露 secret 和私有路径 | `notify-status.ts:48-68` 只报告是否存在；`projection.ts:26` 用 `publicText` 替换路径 | 新输出只用仓库相对路径。secret 只报告 configured/missing。prompt 先经过脱敏 |
| I6 | 每个数据只有一个权威来源 | 模型以 `.archcontext/model` 为准；ledger 以单一 SQLite 为准 | UI 不重新推导权威值。权威值缺失时显示 `unknown`，不合成替代值 |
| I7 | CLI 和 UI 输出一致 | 新增 | 同一个确定性 builder，输出带 digest。用测试比较 CLI 和 GET 的 digest |
| I8 | 写入失败必须可见 | `pipeline.ts:14-17` 输出 JSON 错误和退出码 2-7 | 补上唯一的静默路径：快照导出失败（`store.ts:172` 只写 stderr） |

---

## 3. 现状清单（在 `39d4e9ed` 上核对）

### 3.1 Operator 服务端
- 路由表 `OPERATOR_ROUTES`：`src/effects/operator/server.ts:93-109`。全部是 `GET` 且 `write:false`。

  | id | 路径 |
  |---|---|
  | health | `/healthz`（:59） |
  | repository_snapshot | `/api/v1/fleet/repositories/<id>/snapshot`（:60） |
  | fleet_snapshot | `/api/v1/fleet/snapshot`（:61） |
  | collaboration_snapshot | `/api/v1/collaboration/<id>/snapshot`（:73） |
  | task_context / task_activity / task_diff | `/api/v1/fleet/tasks/<id>/<sha64>/{context,activity,diff}`（:65-67） |
  | pipelines | `/api/v1/pipelines`（:74） |
  | notify_status | `/api/v1/notify/status`（:75） |
  | static_asset | `/*`（:64） |
- 只接受 loopback：`assertLoopbackHost`（:173-179）。CLI 端也检查（`src/cli/commands/operator.ts:57-59`）。
- Host 头错误返回 421（:1434-1435）。URL authority 不一致也返回 421（:1454-1455）。Origin 错误返回 403（:1440-1441）。非 GET/HEAD 返回 405（:1444-1445）。
- 默认端口 4318（`OPERATOR_DEFAULT_PORT`，:42）。静态目录 `dist/operator-ui`（:76-79）。HTML 导航有 index 回退（:1588-1589）。
- `src/effects/operator/pipeline-status.ts:11` 运行 `repo-harness pipeline list --json --projection board`，超时 10 秒，maxBuffer 8 MiB。失败时保留上一次的 board，并标为 `unavailable`（:13-15）。

### 3.2 Operator 前端（React 19.3、Vite 8、TypeScript 7、测试用 happy-dom）
- 文件：`App.tsx`、`AutomationSummary.tsx`、`NotifyStatus.tsx`、`OrganizationSummary.tsx`、`PipelineBoard.tsx`、`PlanningView.tsx`、`TaskDiff.tsx`、`TaskEvidence.tsx`、`TaskHistory.tsx`、`i18n.ts`（en/zh，1657 行）、`styles.css`、`useObservationRefresh.ts`、`fixture.ts` 等。
- Tab：`ObservationView = 'planning' | 'delivery' | 'organization'`（`App.tsx:742`）。默认是 `organization`（:1573）。
- `organization` 面板（:1711）挂载 AutomationSummary、OrganizationSummary、NotifyStatusPanel 和 PipelineBoardPanel（:1712-1721）。
- 语义 token：`--surface-page|card|sunken`、`--text-strong|body|muted|inverse`（`styles.css:79-85`）。
- `vite.operator.config.ts`：`root` 是 `src/operator-web`，`outDir` 是 `dist/operator-ui`，`plugins:[react()]`。没有 `manualChunks`。
- 依赖里没有 graph、diagram 或 SVG 渲染库（`package.json`）。React 和 Vite 都是 devDependency。`prepack` 会运行 `build:operator-web`（`package.json:70`）。
- 前端和 operator 读取器都没有读取 archcontext、架构或文档的数据（grep 为 0）。

### 3.3 Pipeline ledger
- 主键 `(source_host, repository_id, task)`（`src/core/pipeline/types.ts:12`）。阶段有 10 个（:8）。admission 有 3 种（:10）。证据类型有 7 种（:23）。
- `PipelineRecord`（:46-57）包含 `counters{attempts, infra_retries, fix_loops, review_rounds, problem_fingerprints}`、`merge`、`resources{worktree, branch, pr, ...}` 和 `flags_attested`。
- `Run extends TaskRequest`，带 herdr `endpoint` 和 `pane`（:29-34）。
- 状态机：`advanceRecord`（`stage-machine.ts:4-46`）。返工边增加 `fix_loops` 和 `review_rounds`（:12-14）。前进门禁在 :17-40。
- **`gates.ts` 不完全是纯函数**：`currentSubject`、`requirementPass` 和 `latestPlan` 是纯函数。`refreshValidity`（:7-13）会改写 `evidence[].current` 和 `owner_approval.expired`。`requireGate`（:26）会抛出异常。
- Board 投影：`PipelineBoardV2`（`board.ts:11-15`）。卡片里不带 pane、endpoint、worktree 或 branch。标题和阻塞原因经过 `publicText`（`projection.ts:26,55-58`）。
- 存储：Bun SQLite。`REPO_HARNESS_PIPELINES_DB` 默认是 `/Volumes/D/repo-harness/pipelines/pipelines.db`（`store.ts:25`）。表定义在 :69-78。
- 写入方的位置检查 `requireLocation`（:36-48）：
  - 主机名必须等于 `REPO_HARNESS_PIPELINES_AUTHORITY_HOST`，默认是 `kitos`。
  - `/Volumes/D` 必须是一个已挂载的独立卷。
  - 文件系统类型必须在允许列表里。
  - 路径不能包含 `_share` 或 `_ops`。
  - 所有检查通过后才 `mkdir`（:58）。
- 读取方：`openSnapshot`（:174-187）打开 `?immutable=1&mode=ro` 的快照。在本机实际运行，返回 `{"status":"unavailable", ...}`，读取会失败关闭（verified）。
- 快照导出：`exportSnapshot`（:135-168），流程是 `VACUUM INTO`、integrity_check、chmod 0400、原子写指针。commit 之后导出失败只写一条 stderr 警告（:169-173）。
- CLI 子命令：`new|record|advance|status|list|ingest-event|export-snapshot`（`pipeline.ts:22-42`）。`status --events` 读取 transitions，倒序，默认 20 条，最多 100 条（`read.ts:27`）。
- 幂等：
  - `ingest-event` 按 `ingest_receipts` 主键 `(source, delivery_id)` 去重（`ingest.ts:15-18,64`）。不带 `--delivery-id` 时不去重。
  - 有效结果按 `terminal_key` 去重（`ingest.ts:37,55`）。
  - `record` 和 `advance` 用 `state_version` 做 CAS（`ledger.ts:112,131`），可选 `--command-key` 重放（:13-19）。
- `advance` 会通过 sourceAuthority 重新观察 subject（`ledger.ts:118-119`），然后过门禁。
- 失败可见：错误输出 `{"error":{code,retryable,message}}`，退出码 2 到 7（`pipeline.ts:14-17`，`store.ts:29-35`）。
- **数据缺口**：仓库里没有任何 Bot skill 或 agent 文件调用 `repo-harness pipeline`（grep 为 0）。ledger 目前没有真实数据。
- 部署：`docs/reference-configs/pipeline-observer.md:15-22` 指定 kitos Mac mini，:36 写明「No Mini deployment took place in this task」。

### 3.4 Bot → CLI → herdr
- `src/effects/terminal/herdr.ts` 用 `spawnSync` 运行 `herdr --session <s>`，不经过 shell，超时 10 秒（:28-35）。它会去掉 `HERDR_*` 环境变量（:15）。
- `task-agent` 路径（`src/effects/terminal/task-session.ts`）：
  - `startTaskAgent`（:422）写 `.ai/harness/runs/task-agents/<sha>/`（:356-372），依次是 intent → pane split → binding（:443-465）。
  - 启动失败写 `launch-unknown.json`（:458）。
  - `sendTaskRequest`（:585）写 `request-N.json`、运行 `herdr agent prompt`（:617）、写 `delivery-N.json`（`accepted` 或 `unknown`，:618-620）。
- Operator 不读取 task-agent 目录（grep 为 0）。
- notify 插件 `assets/herdr/webhook-notify/notify.mjs`（插件 id `aimpact.webhook-notify`，v0.2.0）：
  - 只处理 `pane.agent_status_changed` 事件，状态是 done 或 blocked（:30-32）。
  - payload（:45-51）没有 task、role、round、request 或 delivery id。
  - 没有重试队列（:97；`herdr-notify.md:108-109`）。

### 3.5 架构模型和文档
- `.archcontext/manifest.yaml`：`layout: split`（:17）、`root: .archcontext/model`（:18）、`commitToGit: true`（:12）、`contextBudgetBytes: 12288`（:39）。
- 模型：26 个 capability 节点、28 个 component 节点（28 个带 `parent:`）、52 条关系（全是 `kind: calls`）、34 个 flow。schema 版本是 `archcontext.node/v2`、`relation/v1` 和 `flow/v1`。
- Capability 节点字段示例：`capability.runtime-harness.verified-context.yaml`。字段包括 `responsibilities`（:7）、`source.include` 和 `entrypoints`（:15-20）、`extensions.contractFiles`（:62）、`lspProfile`（:65）和 `verification`（:66）。
- 关系字段：`{id, kind, source, target, intent}`。flow 字段：`participants`、`steps[].evidence` 和 `outcomes`。
- `archctx-contracts` 0.6.1（Apache-2.0）提供 `schemas/repo/architecture-{node,relation,flow}.schema.json` 和 `validateJsonSchema`（`src/validator.ts:40`）。依赖装在主 checkout 的 `node_modules`，本 worktree 没有装。
- `archctx` 0.6.1（Apache-2.0，单个 bundle 2.3 MB）提供下列命令：
  - `export likec4|structurizr|mermaid` 不需要 daemon，但每次导出整个模型（`archctx.mjs:50496-50503`）。
  - `explore` 和 `book` 需要 daemon（:50310-50338，:50953-50958）。
  - Explorer 拒绝写入（:32976）。
- 仓库里调用 archctx 的只有两处：`src/effects/architecture/archctx-provider.ts`（`projection run|readback`，:331、:408）和 `src/effects/refactor/archctx-provider.ts:96`。
- 版本常量：`src/core/architecture/projection.ts:16-18`。renderer 是 `archcontext.docs-renderer/v4`，layout 是 `archcontext.docs-layout/v1`，archctx 要求 `0.6.1`。
- `Bun.YAML.parse` 已经在用（`src/effects/engineers/profile-store.ts:111`）。解析 YAML 不需要新依赖。
- `docs/architecture/modules/<domain>/<cap>.md` 共 26 份。生成区由 `<!-- BEGIN/END ARCHCONTEXT:generated ... sourceDigest=... -->` 包住，例如 `verified-context.md:3-86`。人写章节是 §3（:88）、§4（:90）和 Optimization Backlog（:92），标题用繁体中文。
- **8/26 份模块文档的 §3 是空的**（本次统计）。
- `docs/architecture/diagrams/architecture.mmd`（110 行）、`architecture.structurizr.json` 和 `architecture.likec4` 都是生成文件。

### 3.6 Review packet
- `repo-harness review round` 的参数是 `--contract`、`--reviewer-repo`、`--herdr-endpoint` 和 `--verification`（四个都必填），以及 `--harness` 和 `--timeout-ms`（`src/cli/commands/review.ts:9-15`）。
- `runReviewRound`（`src/effects/review/generic-review.ts:158`）**先**启动 reviewer pane（:241），**然后**才拼装 packet（:247-255）。packet 包括固定指令、DOMAIN IDENTITY、PRIOR FINDINGS、CONTRACT、GOAL、PREPARED VERIFICATION 和 CURRENT SOURCE。
  - CURRENT SOURCE 由 `sourcePacket` 生成（:134-147），内容是 `git diff <target>` 加上完整的未跟踪文件。
  - packet 上限 10 MB（:256），写入 `packet-<round>.txt`（:257-259）。
  - packet 的构建和 pane 派发混在一个函数里。
- `ReviewOutput` 和 `validateReviewOutput`：`src/core/review/generic-review.ts:12-25`。
- 不存在按模块生成 review prompt 的命令。`module` 命令也不存在（grep 为 0）。

### 3.7 开发文档
- 头部格式是 blockquote `> **Key**: value`，没有 YAML frontmatter。示例：
  - PRD：`plans/prds/20260824-1653-verified-context-contracts.prd.md:3-11`（Status、Source Spec、Parent PRD、Depends On）。
  - Sprint：`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md:3-14`（Source PRD、Child PRD A-D）。
  - Contract：`tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md:3-12`（Plan、Capability ID、Review File、Notes File）。
- 数量：24 份 PRD、3 份 Sprint、`plans/` 下 2 份进行中的 plan、`plans/archive` 下 511 项、1 份进行中的 contract。全仓库头部里有 510 处 `Capability ID`，大部分在归档里。
- 解析器：`markdownHeader`（`artifact-parsers.ts:31`）、`planStatusFromText`（:126）、`planSlugFromPath`（:139）、`artifactStemFromPlan`（:144）、`planContractRelationshipConflicts`（:184）。
- `repo-harness docs` 只解析 `assets/reference-configs` 里的文档（`src/cli/commands/docs.ts:15`）。仓库里没有 PRD 或 Sprint 的目录索引。

### 3.8 Agent config 数据源（仓库内）
- 根目录 `CLAUDE.md`（7214 B）和 `AGENTS.md`（7326 B）只有一个 diff hunk，就是宿主章节：`## Claude Code` 对应 `## Codex`。共享规则重复写在两份文件里，这是有意的设计。
- 26 个 capability 节点声明了 `extensions.contractFiles`，对应 5 组 AGENTS/CLAUDE 文件，10 个文件都存在。分别在仓库根目录、`src/core/engineers/`、`assets/hooks/`、`scripts/` 和 `assets/`。
- `agents/fleet/` 有 7 个角色文件。`agents/engineers/profiles/` 有 2 个 JSON。`agents/engineers/sops/` 有 2 个 MD。读取函数是 `listEngineerProfiles`（`profile-store.ts:214-235`），只读 git 跟踪的文件。
- `assets/skills/` 有 6 个 skill。`.ai/context/context-map.json` 有 10 个 `discoverable_contexts`。`.ai/harness/policy.json` 有 34 个顶层 key，包括 `guards`、`enforcement` 和 `merge_gate`。
- 参考文档同步：`scripts/sync-reference-configs.ts`，规范源是 `assets/reference-configs`（25 份），目标是 `docs/reference-configs`（35 份，其中 10 份只在 docs 里）。本次没有运行检查，所以当前是否 drift 为 **unverified**。
- Herdr dispatch 规则：`docs/reference-configs/external-tooling.md:235-265`。herdr 运行时的会话和 pane 状态在 herdr 里，不在仓库里。
- notify 状态只覆盖 6 个 secret 中的 3 个（`src/core/operator/notify-status.ts:2`），也不报告 `*_NOTIFY_DONE` 开关。

### 3.9 与代码不一致的文档（本 plan 不修，见 §9）
- `README.md:521-524` 说看板「carries exactly one write action」。代码里写路由为 0。
- `tasks/todos.md:63` 说三个消息相关文件等待删除批准。它们已经被 46fa65ef（#510）删掉。

---

## 4. 产品形态

### 4.1 导航
顶层导航分五项：**Overview / Architecture / Docs / Pipeline / Agent config**。
- Overview 就是现有的看板。保留 `planning|delivery|organization` 三个子 tab，不改它们的行为。
- PipelineBoard 在 D1 从 `organization` 面板移到 Pipeline 工作区。
- 工作区的选择保存在 `location.hash` 里。用平台自带的功能，不加 router 依赖。服务端已经有 HTML index 回退。
- 每个工作区用 `React.lazy` 加 `import()` 加载。Vite 会自动拆出独立 chunk，不需要配置 `manualChunks`（inferred；在 B 阶段的构建产物里确认）。

### 4.2 Architecture 工作区
- **模块列表**：按 domain 分组。domain 是 id 前缀，模型里没有 domain 节点。每一行显示三个**独立**状态，不合并成一个绿色「已同步」：
  1. `model_valid`：节点、关系和 flow 是否通过 `archctx-contracts` 的 JSON Schema 校验。
  2. `generated_summary`：生成区是否新鲜。只从权威来源读取（见 §6.4）。权威来源不可用时显示 `unknown`，不在本地重新计算 digest。
  3. `section3`：`present` 或 `pending`，表示 §3 有没有非空内容。这是直接观察到的事实。
- **模块页**：
  - 一跳图：左边是调用方，中间是模块和它的子 component，右边是被调用方。点击邻居节点会切到以它为中心的一跳图。默认不显示全图。
  - 模型事实：responsibilities、entrypoints → sinks、相关 flow 的 steps 和 outcomes、verification 命令。
  - §3 原文：用等宽文本显示，不渲染 markdown。
  - 关联文档：头部 `Capability ID` 等于这个模块的 contract 和 plan。
  - Review prompt 面板：显示 digest、预算使用量、被省略的章节和分片。提供「复制」按钮，和 Bot 要运行的同一条 CLI 命令。

### 4.3 Docs 工作区
- 一张有类型的图。节点类型是 prd、sprint、plan、contract、review、notes、capability 和 spec。边来自头部字段：`Parent PRD`、`Source PRD`、`Child PRD *`、`Depends On`（只取路径值）、`Plan`、`Capability ID`、`Review File`、`Notes File`、`Source Spec`。一个节点可以有多个父节点。
- 问题标记：
  - **断链**：头部引用的路径不存在。
  - **状态冲突**：复用 `planContractRelationshipConflicts`。
  - **停留过久**：`Executing` 或 `Active` 超过阈值。处理方式只有一种：给出一条「检查 prompt」文本让人复制给 Bot。UI 不执行任何动作，也不判定任务失败。
- 归档（`plans/archive`、`tasks/archive`）默认不画，只显示数量。可以用白名单参数 `?scope=all` 切换，结果有节点上限。
- 文档内容不在 UI 里渲染。UI 显示仓库相对路径并提供复制。

### 4.4 Pipeline 工作区（D1）
- **阶段轨道**：10 个阶段横向排开。高亮当前阶段。显示 `fix_loops`、`review_rounds` 和 `infra_retries`。
- **门禁缺口**：显示下一道门禁还缺什么，例如「缺 full_suite」或「reviewer 和 implementer 是同一个 harness」。数据来自无副作用的 explain 函数（§6.6）。
- **时间线**：显示 transitions，最多 100 条。
- **存储健康**（D0 已上线）：快照年龄、epoch/commit_seq、最近一次导出的结果、权威主机和覆盖率。

### 4.5 Agent config 页面
- 共享规则 drift：按章节比较根目录 `CLAUDE.md` 和 `AGENTS.md`。宿主章节标为「host-specific（预期不同）」，不算 drift。只有共享章节不一致才算 drift。
- Capability 本地合约：capability → agents/claude 路径、文件是否存在、两份文件的共享内容是否一致。
- 角色和 profile：`agents/fleet/*.md`、engineer profile 和 SOP。
- Skill 清单：`assets/skills/*/SKILL.md` 的 frontmatter（name、description）。
- 硬规则：作为「来源 + diff」显示，包括 CLAUDE.md/AGENTS.md 的规则章节和 `policy.json` 的 `guards`、`enforcement`、`merge_gate` 原值。不做规则引擎。
- Herdr：链接到 dispatch 规则文档，并显示 notify 插件的 assets 版本。运行时 notify 状态复用现有路由。

---

## 5. 架构图选型（附录要求）

约束保持不变：默认一跳；数据来自 `.archcontext/model`；不用 daemon；只读。现有栈是 React 19.3、Vite 8、TypeScript 7，构建产物是静态 `dist/operator-ui`，前端依赖都是 devDependency。

npm registry 数据在 2026-10-05 用 `npm view` 查询（verified）。gzip 后的 bundle 大小没有测量（**unverified**），在 B 阶段用构建产物测量。

| 选项 | License | 解包大小 | 直接依赖 | 是否适合当前栈 | 结论 |
|---|---|---|---|---|---|
| **@xyflow/react 12.12.0**（React Flow） | MIT | 1.22 MB，另有 `@xyflow/system` 0.69 MB | 3 个（zustand、classcat、@xyflow/system） | React 组件；peer `react >=17`，支持 React 19；节点可以用自己的 React 组件和 CSS token 渲染 | **推荐** |
| ＋ **@dagrejs/dagre 3.1.1** | MIT | 1.41 MB | 1 个（@dagrejs/graphlib） | 纯 JS 分层布局，适合 LR 方向的一跳图 | **推荐的布局库** |
| ＋ elkjs | EPL-2.0 OR GPL-3.0-or-later | 8.05 MB | 0 个 | 布局质量更好，但对 ≤20 个节点的一跳图是多余的 | 不选：license 更重，体积大 |
| dagre（旧包） | MIT | 0.84 MB | 2 个（graphlib、lodash） | 维护已经转到 `@dagrejs/dagre` | 不选 |
| Cytoscape.js | MIT | 5.70 MB | 0 个 | 命令式 canvas API，不是 React 组件；节点不能直接复用 CSS token 和 i18n | 备选（React Flow 被否决时用） |
| C4 model / Structurizr 风格视图 | Structurizr 工具链（unverified） | — | — | C4 是一种表示法，不是渲染库。archctx 已导出 `architecture.structurizr.json`，但 JS 端没有可嵌入的渲染器（unverified） | **只借用表示法**：capability 按 container 画，component 按 component 画 |
| Backstage catalog-graph | Apache-2.0 | 0.35 MB（只算自身） | 17 个，包括 `@material-ui/core` v4、`@backstage/core-components` 和 catalog-client | 需要 Backstage app 外壳和 catalog 后端；MUI v4 是 React 17 时代的库 | 不选 |
| Mermaid | MIT | 122 MB | 23 个 | 静态渲染，不支持点击聚焦 | 运行时不选。archctx 已生成 `.mmd`，静态导出继续用它 |
| D2 | MPL-2.0 | — | Go 二进制 | 需要外部工具链，在服务端渲染 | 不选 |

**推荐方案**：`@xyflow/react` + `@dagrejs/dagre`，两者都放在 devDependencies，打进 `dist/operator-ui`。
- 一跳子图在 core 里用纯函数计算，服务端返回 `{nodes, edges}`。前端只负责布局和交互，不在前端推导模型关系。
- 只在 Architecture chunk 里按需加载，Overview 的首屏体积不变。
- 静态导出不新增任何依赖。Docs 和 PR 场景继续用 archctx 生成的 Mermaid、Structurizr 和 LikeC4 文件。
- 如果 Aimpact 不批准新依赖，回退到 Cytoscape.js（也是新依赖），或者回退到 Dot 原来的自绘 SVG（附录已经否决这一项）。见 §11 Q1。

---

## 6. 数据模型和 API

### 6.1 新 GET 路由（全部 `method:'GET', write:false`）

架构和文档按仓库区分。`{repo_id}` 只在注册表里查找，路径来自注册表，不来自请求。这与 `repository_snapshot` 的做法相同。

| id | 路径 | 读取器 | Phase |
|---|---|---|---|
| architecture_modules | `^/api/v1/repositories/<id>/architecture/modules$` | `readArchitectureModuleIndex` | B |
| architecture_module | `^/api/v1/repositories/<id>/architecture/modules/<cap>$` | `readArchitectureModule` | B |
| architecture_review_prompt | `^/api/v1/repositories/<id>/architecture/modules/<cap>/review-prompt$`，查询参数白名单只有 `shard` | 与 CLI 共用的 builder | B |
| docs_graph | `^/api/v1/repositories/<id>/docs/graph$`，查询参数白名单只有 `scope=active\|all` | `readDocsGraph` | C |
| agent_config | `^/api/v1/repositories/<id>/agent-config$` | `readAgentConfig` | C |
| pipeline_health | `/api/v1/pipelines/health` | 运行 `repo-harness pipeline health --json` | A（D0） |
| pipeline_detail | `^/api/v1/pipelines/<sha64>$` | 运行 `repo-harness pipeline status --id <key> --events --projection public --json` | D1 |

- `<cap>` 必须匹配 `^capability\.[a-z0-9-]+(\.[a-z0-9-]+)+$`，并且必须存在于模型索引里。不匹配时返回 404，不读取任何文件。
- 白名单以外的查询参数一律返回 400。
- `OPERATOR_ROUTES` 的顺序断言（`operator-write-boundary.test.ts:74-85`）要追加新 id。这是**必要的测试改动**：只追加 id，`toEqual([])` 和 GET/HEAD 扫描这两条断言不变。PR 里要逐项说明。

### 6.2 core 合约（新文件放在 `src/core/`）

```ts
// src/core/architecture/module-view.ts
type ModuleState = { model_valid: 'valid'|'invalid'|'unknown'; generated_summary: 'fresh'|'stale'|'unknown'; section3: 'present'|'pending' };
type ModuleIndexV1 = { schema_version: 'repo-harness.architecture-modules.v1'; commit: string; modules: { id; domain; name; status; components: number; state: ModuleState }[] };
type ModuleGraph = { center: string; nodes: { id; kind: 'capability'|'component'; name; role: 'center'|'child'|'caller'|'callee' }[]; edges: { source; target; intent }[] };
type ModuleDetailV1 = { schema_version: 'repo-harness.architecture-module.v1'; commit: string; module: /* model facts */; graph: ModuleGraph; flows: /* steps/outcomes */; section3: string|null; linked_docs: { path; kind; status }[]; state: ModuleState };

// src/core/review/module-review-prompt.ts
type ModuleReviewPromptV1 = {
  schema_version: 'repo-harness.module-review-prompt.v1';
  capability_id: string; commit: string; mode: 'module'|'diff'; base?: string; head?: string;
  worktree_dirty_paths: string[];            // 只列出路径；内容取自 commit
  sources: { path; sha256; bytes; disposition: 'included'|'omitted'|'truncated' }[];
  budget: { limit_bytes: number; used_bytes: number; incomplete: boolean; omitted_sections: string[] };
  shard: { index: number; count: number };
  prompt: string; digest: string;             // sha256(canonical JSON，不含 digest 字段)
};

// src/core/docs/docs-graph.ts
type DocsGraphV1 = { schema_version: 'repo-harness.docs-graph.v1'; commit: string; scope: 'active'|'all'; archived_count: number;
  nodes: { id: string /* 仓库相对路径或 capability id */; kind; status: string|null; updated: string|null }[];
  edges: { source; target; label: string /* 头部字段名 */ }[];
  issues: { kind: 'broken_link'|'status_conflict'|'stale'; node; detail; check_prompt?: string }[] };
```

### 6.3 确定性和 digest
- 所有架构和文档读取器都**从 `HEAD` 提交读取**，用 `git cat-file` 或 `git show <commit>:<path>`，不读工作区。所以 CLI 和 UI 在同一个 commit 上得到相同的字节。
- 工作区的未提交改动只作为 `worktree_dirty_paths` 列出，不混进内容。
- digest 是规范化 JSON（key 排序）的 sha256。CLI `--json` 和 GET 返回同一个对象。
- 结果按 `commit` 缓存在进程内存里，不写磁盘。

### 6.4 三个模块状态的来源
- `model_valid`：用 `archctx-contracts` 的 `validateJsonSchema` 和仓库自带的 schema 校验。如果在进程内加载失败（例如本仓库的 Bun 运行时不能直接 import 它的 TS 源码，**unverified**），状态是 `unknown`，不另写一个解析器。
- `generated_summary`：只用 `repo-harness architecture-projection status --json` 的输出（`architecture-projection.ts:42`）。它在读取时有没有副作用、需不需要 daemon，都是 **unverified**。A 阶段先在临时仓库里探测。如果有副作用或者需要 daemon，就固定返回 `unknown`，后续再决定（§11 Q8）。
- `section3`：解析模块文档，看 `## 3.` 和下一个 `## ` 之间有没有非空行。

### 6.5 Review prompt builder
- **默认模式是单模块**。prompt 的内容依次是：
  1. 模型事实，即 responsibilities、entrypoints/sinks 和 verification 命令。
  2. 一跳关系和 intent。
  3. 相关 flow。
  4. §3 原文。如果 §3 为空，写一行 `§3 pending`。
  5. 关联的 contract/plan 列表（只有路径和状态）。
  6. 固定的 review 指令和输出格式。输出格式与 `ReviewOutput` 一致：verdict、summary、findings{id, severity P0-P3, status, message}。
- **不放「最近的 commit」**，也不用它冒充 base 或 head。
- **diff 模式**：`--base <rev> --head <rev>` 两个参数都必须给出，先解析成 SHA，再加上 `git diff base head -- <source.include>`。缺任何一个都会报错，没有默认值。
- **共享的部分**：把 `generic-review.ts:249-251` 的固定指令文本，以及 ReviewOutput 的格式说明，抽成一个 core 常量，`review round` 和 `module review-prompt` 都用它。`module review-prompt` 不调用 `runReviewRound`，不启动 pane，不写 packet 文件。真正的派发仍然由 Bot 通过 `review round` 或 `task-agent` 完成。这样不会出现第二条 review-round 路径。
- **context 构建和 pane 派发分开**：本 plan 先新增一个纯 builder。`runReviewRound` 里的 packet 拼装在 :247-255，发生在 pane 启动（:241）之后。把这段移到 builder 是可选的后续改动，不在本 plan 的范围里，因为它会改变 review round 的行为面（§11 Q9）。
- **12 KB 预算和「自包含」的冲突**：
  - 预算从 `.archcontext/manifest.yaml` 的 `runtime.contextBudgetBytes` 读取，现在是 12288。不在代码里写死。
  - 超出预算时，按固定的章节优先级装入。放不下的章节写进 `omitted_sections`，并在 `sources` 里列出路径和 sha256，同时设置 `incomplete: true`。
  - `--shard <n>` 按同样的顺序输出第 n 个分片。每个分片带 `shard.count` 和同一个 `digest`（digest 只算一次，覆盖全部内容）。
  - 不做静默截断。
- **脱敏**：§3 和 contract 文本在进入 prompt 之前先经过现有的 MCP 脱敏模块（`src/cli/mcp/redaction.ts`，文件已存在；它的规则是否适用于这里为 **unverified**，A 阶段核对）。检测到 secret 时直接失败，返回 `secret_detected` 和对应路径。不发布一个已被改动的 prompt。
- **路径**：只输出仓库相对路径。读取前先对路径做 realpath，必须在仓库根目录以内。

### 6.6 门禁 explain（无副作用）
- 新增纯函数 `explainNextGate(record, now): { from, to, satisfied: boolean, missing: string[] }`，放在 `src/core/pipeline/gates.ts`。
- 它先 `structuredClone(record)`，在副本上调用 `refreshValidity`，然后复用 `requirementPass` 和 `stage-machine.ts` 里的门禁条件，只返回缺口，不抛异常。
- 门禁条件要和 `advanceRecord` 共用同一组判断，避免出现两份规则。具体做法是把 :17-40 的条件抽成一张表，`advanceRecord` 和 `explainNextGate` 都读这张表。`advanceRecord` 的行为保持不变，由现有的 `pipeline-observer.test.ts` 保证。

### 6.7 Pipeline 详情的公开投影
- 在 `src/core/pipeline/projection.ts` 新增 `projectPipelineDetail(record, transitions)`，输出 board 卡片字段，加上 counters、`explainNextGate` 和 transitions。transitions 只保留 from、to、at、reason，reason 经过 `publicText`。
- 不包含 pane、endpoint、worktree、branch 或私有路径。

---

## 7. 分期

顺序：**A + D0 → 轻量 B → C + Agent config → D1 → P1 其余项 → P2**。每个 phase 一个 PR。分工按 Model Division：后端、CLI 和测试由 Codex 做，前端由 Claude 做。每个 phase 结束时运行：
- `bun run check:type`
- `bun run test:files <受影响的测试> --timeout 60000 --max-concurrency 1`
- 涉及前端时运行 `bun run build:operator-web`，并在真实浏览器里打开截图。

### Phase A：模型读取器 + `module review-prompt` CLI
**范围**
- core 纯函数：模型索引、一跳图、模块状态、prompt builder（预算、分片、digest）。
- effects：从 `HEAD` 读取模型和模块文档，`Bun.YAML.parse`，schema 校验，脱敏。
- CLI：`repo-harness module review-prompt <cap> [--json] [--shard n] [--base r --head r]`，以及 `repo-harness module list [--json]`。

**涉及文件**
- 新增 `src/core/architecture/module-view.ts`、`src/core/review/module-review-prompt.ts`、`src/effects/architecture/model-reader.ts`、`src/cli/commands/module.ts`。
- 修改 `src/cli/index.ts`（注册命令）、`src/core/review/generic-review.ts`（导出共享的指令常量）、`src/effects/review/generic-review.ts`（引用该常量，packet 字节保持不变）。

**验收标准**
- 对 26 个 capability 中的任意一个，同一个 commit 上连续运行两次，digest 相同。
- 超出预算时 `incomplete:true`，`omitted_sections` 不为空，所有分片拼起来能覆盖全部章节。
- 只给 `--base` 或只给 `--head` 时，退出码非 0。
- `review round` 的 packet 字节和改动前相同。

**测试**（新行为需要新文件，名字是建议）
- `tests/unit/module-review-prompt.test.ts`：
  - 确定性和 digest。
  - **missing**：capability 不存在、模块文档缺失、§3 为空。
  - **dirty**：工作区有改动时内容不变，`worktree_dirty_paths` 列出改动路径。
  - **oversize**：分片和 omitted 列表。
  - **path escape**：`source.include` 里的 `../`、绝对路径和符号链接都被拒绝。
  - **secret redaction**：§3 里放一个假 token，构建失败并返回 `secret_detected`。
- `tests/cli/module.test.ts`：`--json` 的形状和退出码。
- 扩展 `tests/generic-review.test.ts`：断言 packet 字节不变。

### Phase D0（与 A 一起，单独一个 PR）：ledger 真实数据
**范围**
- **一台在线主机，一个权威 ledger**。选定一台在线主机，设置 `REPO_HARNESS_PIPELINES_AUTHORITY_HOST` 和 `REPO_HARNESS_PIPELINES_DB`。`requireLocation` 已经支持这两个变量，位置检查的代码不用改。不等 Mini，不给每个 Bot 单独建库。
- **事件接入**：
  - notify 插件的 payload 增加 `delivery_id`。值取自 herdr 事件 id；如果 herdr 事件没有 id，A 阶段先确认（**unverified**）。插件版本升到 0.3.0。
  - Bot 收到 webhook 后运行 `repo-harness pipeline ingest-event --payload - --source herdr --delivery-id <id>`。
  - 同一个 delivery 重复投递，结果是 `duplicate`。
- **task/run 身份**：
  - Bot skill 在 `task-agent start` 之后运行 `pipeline new` 和 `pipeline record --kind request`，带上 `(repository_id, task, role, round, request_id, context_sha256)`。
  - 这些值都来自 task-agent 已经写下的 `request-N.json`，Bot 不自己编造。
- **`record` 只是观察，`advance` 需要授权和证据**。Bot skill 只在拿到证据，例如 typecheck 或 review 的结果之后，才调用 `advance`。门禁仍然由 `advanceRecord` 判定。
- **写入失败必须可见**：
  - Bot skill 规定：pipeline CLI 退出码非 0 时，把 `error.code` 发到人能看到的频道，不重试 `gate_not_satisfied`。
  - `store.ts` 把最近一次快照导出的结果（ok 或错误码，以及时间）写进 `metadata` 表，并随快照一起发布。
- **存储健康**：新增 `repo-harness pipeline health --json`。它只读快照和指针，输出快照年龄、epoch/commit_seq、最近一次导出结果、权威主机名和 board coverage。operator 新增 `pipeline_health` 路由，PipelineBoard 旁边显示一个简单的健康条。

**涉及文件**
- `assets/herdr/webhook-notify/notify.mjs`、`herdr-plugin.toml`。
- `src/effects/pipeline/store.ts`（导出状态）、`src/effects/pipeline/read.ts`（`readPipelineHealth`）、`src/cli/commands/pipeline.ts`（`health`）。
- `src/effects/operator/pipeline-status.ts`、`src/effects/operator/server.ts`、`src/core/operator/`（health 的 decoder）、`src/operator-web/PipelineBoard.tsx`。
- Bot skill 入口 `SKILL.md`。具体要改哪个文件，以及外部 Bot runtime 归谁负责，见 §11 Q4。
- `docs/reference-configs/pipeline-observer.md`（权威主机和迁移步骤）。

**验收标准**
- 在权威主机上，Bot 连续派发 3 个真实任务。每个任务在 ledger 里都有 record，transitions 里至少有一次阶段前进。
- 同一个 delivery 投递两次，ledger 里只有一条接收记录。
- 让快照导出失败一次，health 显示这次失败。
- 在非权威主机上，写入返回 `authority_unavailable`，也没有创建任何目录。

**测试**（扩展 `tests/effects/pipeline-observer.test.ts`）
- **empty/stale ledger**：没有快照时返回 `unavailable`；快照过旧时返回 `stale`。
- **duplicate/out-of-order events**：
  - 同一个 delivery_id 重复投递，结果是 `duplicate`。
  - terminal_key 重复时跳过。
  - 先收到 result，后收到 request，记为 `unclaimed` 或 `weak_observation`，不出现在 board 上。
  - `state_version` 过期时返回 `rev_conflict`。
- **export failure surfaced**：导出失败后，health 里的状态与失败一致。
- `tests/cli/operator-serve.test.ts`：`pipeline_health` 只接受 GET，其他方法返回 405。

### Phase B（轻量）：Architecture 工作区
**范围**：3 条 architecture 路由；顶层导航；模块列表和模块页；一跳图（`@xyflow/react` + `@dagrejs/dagre`，按需加载）；复制 prompt；i18n（en/zh）；在 `.archcontext/model` 里给 operator 补一个只读 capability 节点（需要先批准，见 §11 Q5）。

**涉及文件**
- `src/effects/operator/server.ts`（路由）、`src/effects/operator/architecture.ts`（新增，调用 A 阶段的读取器）、`src/core/operator/architecture.ts`（decoder）。
- 新增 `src/operator-web/ArchitectureWorkspace.tsx`、`ModuleGraph.tsx`；修改 `App.tsx`（导航）、`i18n.ts`、`styles.css`。
- `package.json`（2 个 devDependency）、`bun.lock`。
- `tests/effects/operator-write-boundary.test.ts`（追加路由 id）。

**验收标准**
- 对同一个 capability，GET 返回的 `digest` 等于 CLI `--json` 返回的 `digest`。
- 构建产物里图相关代码在单独的 chunk 里，Overview 的首屏 chunk 体积变化不超过 5%。
- 在真实浏览器里截图，三个模块状态分开显示。

**测试**
- **CLI/UI digest 一致**：`tests/cli/operator-serve.test.ts` 先启动服务器读取 review-prompt，再运行 CLI，比较两个 digest。
- **path escape**：`<cap>` 不合法、`<repo_id>` 未注册、查询参数不在白名单里，分别返回 404 或 400，并且不读取文件（用 fs spy 断言）。
- `tests/operator-web/operator-architecture.test.tsx`（新增）：模块列表的分组，三个状态分开显示，`unknown` 状态的显示，复制按钮的文本等于 CLI 命令。
- 写边界测试：`toEqual([])` 和 GET/HEAD 扫描的断言不变。

### Phase C：Docs 工作区 + Agent config 页面
**范围**
- 文档图读取器，复用 `markdownHeader` 和 `planContractRelationshipConflicts`。
- Docs 工作区。
- Agent config 读取器（只读仓库内的文件）和页面。

**涉及文件**
- 新增 `src/core/docs/docs-graph.ts`、`src/effects/operator/docs-graph.ts`、`src/core/operator/agent-config.ts`、`src/effects/operator/agent-config.ts`、`src/operator-web/DocsWorkspace.tsx`、`src/operator-web/AgentConfig.tsx`。
- 修改 `server.ts`、`App.tsx`、`i18n.ts`。

**验收标准**
- 当前仓库：活动范围内的 PRD、Sprint、plan 和 contract 全部出现在图上。断链数量和人工核对的结果一致。
- 一个 PRD 同时有 Parent PRD 和 Sprint 引用时，它在图上有两条入边。
- 根目录 CLAUDE.md 和 AGENTS.md 的 drift 结果是：共享章节 drift 为 0，`## Claude Code` 和 `## Codex` 标为 host-specific。
- 停留过久的项只显示检查 prompt，没有任何按钮会改变状态。

**测试**
- **missing/broken**：头部路径不存在时，产生 `broken_link`。
- **multi-parent**：图里保留两条边，不丢掉任何一条。
- **archive bound**：默认 `scope=active`；`scope=all` 时有节点上限。
- **path escape**：头部值是 `../../etc/passwd` 时，不读取这个文件，记为 `broken_link`。
- **secret redaction**：Agent config 里任何 secret 都只报告 configured 或 missing。用一个带假值的 policy fixture 断言，值不会出现在输出里。

### Phase D1：Pipeline 可视化
**范围**：`explainNextGate`、`projectPipelineDetail`、`pipeline status --projection public`、`pipeline_detail` 路由、Pipeline 工作区（阶段轨道、门禁缺口、时间线）；把 PipelineBoard 从 `organization` 移到这个工作区。

**涉及文件**
- `src/core/pipeline/{gates,stage-machine,projection}.ts`、`src/cli/commands/pipeline.ts`。
- `src/effects/operator/{pipeline-status,server}.ts`。
- 新增 `src/operator-web/PipelineWorkspace.tsx`；修改 `PipelineBoard.tsx`、`App.tsx`。

**验收标准**
- 对每种 `transition_not_allowed` 和 `gate_not_satisfied` 的情况，`explainNextGate` 给出的缺口和 `advanceRecord` 的拒绝原因一致。
- 详情输出里不包含 pane、endpoint、worktree、branch 或绝对路径。

**测试**
- `explainNextGate` 调用前后，输入 record 深度相等，证明它没有副作用。
- `advanceRecord` 原有的测试全部不改，并且全部通过。
- **empty/stale ledger**：详情返回 `unavailable` 或 `stale`。
- **out-of-order**：transitions 按 `at` 倒序排列，并带 `commit_seq`。
- **path escape**：`<sha64>` 不合法时返回 404。
- 用一个带私有路径的 fixture，断言输出里只有 `[private path]`。

### P1 其余项（D1 之后，每项单独批准）
- pane/worker 概览：读取 task-agent 目录，需要新的公开投影。
- PR/merge 队列。
- 通知路由视图：notify 状态的 6 个 key 都报告是否存在，并显示 `*_NOTIFY_DONE` 开关。

### P2（最低优先级）
- worktree 视图：不显示绿色的「可以安全清理」。
- 模型分级。
- 磁盘深度用量。
- GPT Pro / MCP 额度和配置面板。

---

## 8. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| Bot 不按规定调用 pipeline CLI | Pipeline 工作区一直是空的 | D0 的验收标准要求有真实任务数据；health 显示 coverage；D1 必须在 D0 验收之后才开始 |
| 权威主机离线 | ledger 有缺口（pipeline-observer.md:5 说这是 telemetry gap） | health 显示快照年龄；Bot 把写入失败报给人；不做双写 |
| notify 投递会丢失，没有重试 | 时间线不完整 | `delivery_id` 去重；task-agent 的 request 记录作为第二个来源；coverage 显示缺口 |
| 新依赖的体积和维护 | 构建产物变大 | 按需加载；B 阶段测量 chunk 体积；两个库都是 MIT，传递依赖共 4 个 |
| `archctx-contracts` 是 TS 源码包，运行时能否直接加载是 unverified | `model_valid` 一直是 `unknown` | A 阶段先探测；不行就显示 unknown，不另写解析器 |
| `architecture-projection status` 在读取时可能有副作用 | 违反 I4 | A 阶段在临时仓库里探测；有副作用就固定返回 unknown |
| prompt 里带出 secret | 外泄 | 检测到 secret 就失败；测试覆盖 |
| CLI 和 UI 输出漂移 | 人和 Bot 看到不同的内容 | 共用 builder 和 digest；B 阶段的测试比较两者 |
| 归档文档很多（500 多项） | 响应慢，图太乱 | 默认不画归档；有节点上限；按 commit 缓存 |
| D1 抽取门禁条件表 | 改变 `advanceRecord` 的行为 | 现有测试不改并且全部通过；一个 PR 同时改断言和实现时，按规则做一次只读的 tests-bent review |
| operator 服务多个仓库 | 读错仓库 | 只按注册表 id 解析仓库路径，并做 realpath 检查 |

---

## 9. 迁移说明

- **ledger 位置**：D0 用环境变量把权威 ledger 放在一台在线主机上。以后迁移到 Mini 时，顺序是：
  1. 停止所有写入方，并把 Bot skill 切到只报错。
  2. `export-snapshot`，然后复制快照文件。
  3. 在新主机上运行 `PRAGMA integrity_check`，并比较 epoch、commit_seq 和 sha256。
  4. 修改两台主机的环境变量。
  5. 恢复写入。

  整个过程不做双写，也不保留旧路径作为回退。
- **notify 插件**：升到 0.3.0 以后，各主机要重新运行 `repo-harness herdr notify install`。旧插件发出的 payload 没有 `delivery_id`，Bot 收到这种 payload 时，按「不去重」接入，并在 health 里计数。
- **导航**：Overview 保留现有的三个子 tab，现有的 URL 和截图不受影响。PipelineBoard 在 D1 移动。
- **数据结构**：不改动现有的路由或响应 schema，只新增 schema 版本。
- **架构模型**：给 operator 补 capability 节点，走正常的 architecture-projection 流程（需要批准，见 §11 Q5）。
- **与代码不一致的文档**：`README.md:521-524` 和 `tasks/todos.md:63` 建议在 Phase A 的 PR 里一起修正（§11 Q7）。

---

## 10. 依赖、文件和抽象的理由

- **新依赖**：只有 `@xyflow/react` 和 `@dagrejs/dagre`，都是 devDependency。理由是附录要求使用成熟的社区方案。§5 比较了 7 个选项。
- **新抽象**：
  - ReviewOutput 指令常量：有两个真实使用方，`review round` 和 `module review-prompt`。
  - 门禁条件表：有两个真实使用方，`advanceRecord` 和 `explainNextGate`。
  - 不新增其他共享层。
- **新文件**：每个新数据源按现有模式新增一个 core 文件、一个 effects 文件和一个前端组件。没有额外的 wrapper。

---

## 11. 需要 Aimpact 决定的问题

1. **新依赖**：是否批准 `@xyflow/react` 12 和 `@dagrejs/dagre` 3 作为 devDependency？不批准时，选 Cytoscape.js，还是回到自绘 SVG？
2. **权威 ledger 主机**：D0 用哪台在线主机？DB 路径用什么？这两项决定 `REPO_HARNESS_PIPELINES_AUTHORITY_HOST` 和 `REPO_HARNESS_PIPELINES_DB` 的值。
3. **notify 插件 v0.3.0**：是否批准在 payload 里加 `delivery_id`，并在各主机重新安装插件？
4. **Bot skill 的归属**：D0 要改的是仓库根目录的 `SKILL.md`，还是外部 Bot runtime？由谁改，在哪里改？
5. **架构归属**：是否在 `.archcontext/model` 里新增一个只读的 operator capability 节点？
6. **P1 的顺序**：pane/worker 概览、PR/merge 队列和通知路由，是否都排在 D1 之后，并且每项单独审批？
7. **文档修正**：`README.md:521-524` 和 `tasks/todos.md:63` 是否在 Phase A 的 PR 里一起修？
8. **`generated_summary` 的来源**：如果 `architecture-projection status` 在读取时有副作用或者需要 daemon，是否接受这一项长期显示 `unknown`？
9. **review round 的 packet 拼装**：本 plan 只共享指令常量，不重构 `runReviewRound`。是否需要另开一个任务，把 packet 拼装移到 pane 启动之前？
10. **Agent config 的边界**：这个页面是否只读仓库内的文件？还是可以按 notify-status 的先例，调用 herdr 子进程读取仓库外的状态？
11. **停留过久的阈值**：`Executing` 或 `Active` 状态超过多少天，算「停留过久」？
