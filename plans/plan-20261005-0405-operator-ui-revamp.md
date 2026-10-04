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
> **Sources**: Claude 会话 "visualze"（2026-10-05 03:45 HKT 方案）；Dot 的评审（Aimpact 已全部接受）；Aimpact 附录（graph 库选型）；Aimpact Addendum 2（04:00-04:08 HKT：prior art、D0 细节、packet/GET 安全/图/Agent config/设置措辞）

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
6. **Agent config 页面**：一个只读页面，不是一个工作区。内容包括 CLAUDE.md/AGENTS.md 共享规则块的比较、capability 本地合约文件、fleet 角色、engineer profile、skill、硬规则来源和 herdr dispatch 规则。
7. **整体方向（proposed，等待 Aimpact 决定）**：前端用 React，图用 xyflow + dagre，diff 用 `@git-diff-view/react`，终端输出用只读 xterm 渲染。服务端只提供 GET 和 SSE，没有任何修改类端点，只读由架构保证。UI 上每一个「动作」按钮都改成「复制 Bot 命令」。

### 非目标
- 不加写路由，不在 UI 里派任务，不在 UI 里改文档或配置。
- 不嵌入 archctx Explorer，不启动 archctx daemon。
- 不做统一额度 tab。交互式会话没有 quota 或 token 账本（`docs/reference-configs/long-run-continuation.md:5`），不伪造数字。
- 不做 GPT Pro / MCP 配置面板（P2，最低优先级）。
- 不做桌面壳或菜单栏应用。
- 不做按 Bot 分开的数据库，不做 ledger 双写。
- 不新增 markdown 渲染库，也不新增前端 router 库。
- 不嵌入任何工作流引擎（Temporal、Argo、Dagster、Trigger.dev 等）。只借用它们的展示方式。
- 不复制 AGPL、无 license 或 source-available 项目的代码（见 §5A 的 license 注意事项）。
- 配置不做自动同步，不做自动修复。不一致只做标记。

---

## 2. 不变量

| # | 不变量 | 当前的强制点 | 本 plan 的义务 |
|---|---|---|---|
| I1 | Operator 只读 | `operator-write-boundary.test.ts:54`、:62-68；`server.ts:1444-1445` 返回 405 | 新路由都用 `method:'GET', write:false`。不改这两条断言 |
| I2 | 唯一指令通道：Bot → CLI → herdr | `pipeline.ts:20` 描述「never dispatches, merges or cleans」 | CLI `module review-prompt` 只输出文本，不派发 pane。UI 只显示和复制 |
| I3 | GET 白名单 | `OPERATOR_ROUTES`（`server.ts:93-109`），顺序在测试 :74-85 固定 | 每条新路由都登记在 `OPERATOR_ROUTES` 里。路径参数先匹配正则，再按索引查找，不能直接拼成文件路径 |
| I4 | GET 永远不建库、不迁移、不探测、不派发 | pipeline 读取器只打开已发布的只读快照（`store.ts:131-134,174-187`） | 新读取器不打开 live DB，不创建目录，不调用 `herdr agent` 或 `pane` 写类动词，不运行会启动外部进程或 daemon 的探测（例如 `browser-doctor`） |
| I5 | 不泄露 secret 和私有路径 | `notify-status.ts:48-68` 只报告是否存在；`projection.ts:26` 用 `publicText` 替换路径 | 服务端按字段白名单输出（§6.8）。只用仓库相对路径。token、webhook URL 和连接串一律隐藏。prompt 先经过脱敏 |
| I9 | UI 不触发动作 | 新增 | 每个「动作」只显示一条可以复制的 Bot 命令。UI 不发出任何请求去执行它 |
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
- **数据缺口**：仓库里没有任何 Bot skill 或 agent 文件调用 `repo-harness pipeline`（grep 为 0）。本机查询返回 `unavailable`。已部署的 ledger 有没有真实数据，没有查询过，所以**unverified**。能确认的只有：仓库内没有调用方。
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

### 3.9 与代码不一致的文档（计划在 Phase A 修正，见 §9）
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
  2. `generated_summary`：生成区是否新鲜。当前没有可用的读取来源，固定显示 `unknown`（见 §6.4 的功能缺口说明）。不在本地重新计算 digest。
  3. `section3`：`present` 或 `pending`，表示 §3 有没有非空内容。这是直接观察到的事实。
- **模块页**：
  - 一跳图：左边是调用方，中间是模块和它的子 component，右边是被调用方。点击邻居节点会切到以它为中心的一跳图。默认不显示全图。
  - 边的画法按语义区分：
    - 只有 `kind: calls` 的关系画成带方向的调用箭头。现在 52 条关系都是 `calls`。
    - `parent:` 是包含关系，不是调用。子 component 画在模块框里面，不画箭头。
    - 以后模型里出现无方向或其他种类的关系时，画成无箭头的虚线并标出种类，绝不画成调用箭头。
  - 节点过多时折叠：任意一侧（调用方或被调用方）超过阈值（建议 8 个，等待 Aimpact 决定）时，这一侧折叠成一个「N 个模块」节点，展开后是一个列表，不是更多的图节点。
  - 模型事实：responsibilities、entrypoints → sinks、相关 flow 的 steps 和 outcomes、verification 命令。
  - §3 原文：用等宽文本显示，不渲染 markdown。
  - 关联文档：头部 `Capability ID` 等于这个模块的 contract 和 plan。
  - Review prompt 面板：显示 digest、预算使用量、被省略的章节和分片。提供「复制」按钮，和 Bot 要运行的同一条 CLI 命令。

### 4.3 Docs 工作区
- 一张有类型的图。节点类型是 prd、sprint、plan、contract、review、notes、capability 和 spec。边来自头部字段：`Parent PRD`、`Source PRD`、`Child PRD *`、`Depends On`（只取路径值）、`Plan`、`Task Contract`、`Capability ID`、`Review File`、`Notes File`、`Source Spec`。一个节点可以有多个父节点。
- **`Child PRD *` 的解析**：`markdownHeader` 按完整 label 匹配（`artifact-parsers.ts:31-34`）。Sprint 的真实 label 带 slot 和状态，例如 `Child PRD A (Active)`（`20260828-2321-collaborative-work-exchange-agent-succession.sprint.md:8-11`）。解析规则：`Child PRD <槽位> (<声明的状态>)` 拆成槽位、目标路径和声明的状态三部分。边保留原始 header 文本作为 label。
- 问题标记分成三类，互不混用：
  - **断链**：头部引用的路径不存在。
  - **关系冲突**（`relationship_conflict`）：复用 `planContractRelationshipConflicts`（`artifact-parsers.ts:184-198`）。注意它只比较 plan 和 contract 的路径关系，不读 Status。
  - **状态冲突**（`status_conflict`）：单独实现。**文档的批准状态和程序的激活状态是两个维度**：真实文档同时有 `> **Status**: Approved` 和 `> **Activation**: Deferred — Phase 2`（例如 `plans/prds/20260828-2321-work-exchange-independent-review.prd.md:2-4`），这不是冲突。规则：
    1. contract 头部 `Status: Active`，但它指向的 plan 头部 `Status` 是 Draft 或 Approved（不是 Executing）。
    2. Sprint 的 Child PRD 标签带 `Deferred` 时，对照子 PRD 自己的 `Activation` 字段。子 PRD 的 Activation 也是 Deferred 时**不算冲突**。子 PRD 没有 Activation 字段或含义不明时显示 `unknown`，不依据 `Approved` 推断它是激活的。只有两边 Activation 明确相反时才报冲突。
  - **停留过久**：`Executing` 或 `Active` 超过阈值。处理方式只有一种：给出一条「检查 prompt」文本让人复制给 Bot。UI 不执行任何动作，也不判定任务失败。
- **`updated` 的来源**：头部有 `**Updated**:` 时用它；没有时用该文件自己的最后一次 commit 时间。都没有时是 `null`。阈值见 §11 Q8。
- 归档（`plans/archive`、`tasks/archive`）默认不画，只显示数量。可以用白名单参数 `?scope=all` 切换，结果有节点上限。
- 文档内容不在 UI 里渲染。UI 显示仓库相对路径并提供复制。

### 4.4 Pipeline 工作区（D1）
- **阶段轨道**：10 个阶段横向排开。高亮当前阶段。显示 `fix_loops`、`review_rounds` 和 `infra_retries`。
- **门禁缺口**：显示下一道门禁还缺什么，例如「缺 full_suite」或「reviewer 和 implementer 是同一个 harness」。数据来自无副作用的 explain 函数（§6.6）。
- **时间线**：显示 transitions，最多 100 条。
- **存储健康**（D0 已上线）：快照年龄、epoch/commit_seq、最近一次导出的结果、权威主机和覆盖率。

### 4.5 Agent config 页面（一个只读页面，不是工作区）
- **共享规则块比较**：
  - 只比较**声明为共享**的块。每个块用稳定的规则 ID 作为键。
  - 现状：根目录 `CLAUDE.md` 和 `AGENTS.md` 里没有任何块标记或规则 ID（grep `<!--` 为 0）。两边各有四个共享主题章节：`Workflow`、`Code Optimization Principles`、`Testing` 和 `Handoff`；`Claude Code` 和 `Codex` 是宿主章节。
  - **没有规则 ID 时，不做 drift 判定**：页面对应章节显示文本 diff，drift 一律显示 `not-declared`。标题对应不能证明块已声明共享，也不能证明规则逐项对应。标题对齐只用于排版。
  - 要做真正的 drift 判定，需要先在两份文件里加共享块标记和稳定规则 ID。这会修改两份根目录 agent 指令文件，需要 Aimpact 批准（§11 Q9）。
  - **diff 不等于 drift**：页面显示 diff。只有声明为共享的块内容不同，才标成 drift。宿主章节的差异标成「host-specific（预期不同）」。
  - 永远不自动同步。
- **来源版本**：
  - 仓库内的文件显示**该文件自己的最后一次 commit**（`git log -1 -- <path>`）和 dirty 标记，不显示仓库的 HEAD。
  - 不在 git 里的全局文件（例如 `~/.claude/CLAUDE.md`）只显示 mtime 和 sha256，不显示内容。读取仓库外的文件需要批准（§11 Q7）。
- **Capability 本地合约**：capability → agents/claude 路径、文件是否存在、两份文件的共享块是否一致。
- **角色和 profile**：`agents/fleet/*.md`、engineer profile 和 SOP。
- **Skill 清单**：`assets/skills/*/SKILL.md` 和 `assets/skill-commands/*/SKILL.md` 的 frontmatter（name、description），按 anthropics/skills 的约定解析。实现入口：SKILL.md 的头部是 YAML frontmatter，用 `Bun.YAML.parse` 解析，不新增依赖。仓库里现在有没有现成的 SKILL.md frontmatter 解析函数，**unverified**；有就复用，没有就写一个小的读取函数。
- **硬规则**：作为「来源 + diff」显示，包括 CLAUDE.md/AGENTS.md 的规则章节和 `policy.json` 的 `guards`、`enforcement`、`merge_gate` 原值。不做规则引擎。
- **AGENTS.md 就近生效**：对每个 capability 的源码路径，显示哪一份 AGENTS.md/CLAUDE.md 离它最近，也就是理论上会生效的那一份。
- **「哪个 agent 实际加载了它」不在这一页**。这需要每次运行都留下加载回执（文件版本和 hash）。这项移到 D 线（§7 D 线后续），并要求新增回执。
- **Herdr**：
  - herdr 的实时结构（session、tab、pane）属于可视化，放到 P1 的 pane/worker 概览。
  - pane 布局规则（`external-tooling.md:235-265`）和 hook 路由（`src/cli/hook/route-registry.ts:68` 的 `ROUTES`）显示为只读设置。
  - 运行状态和规则不一致时只做标记，不自动修复。所有值都先脱敏。
- 优先级：配置清单是 P1，在 Phase C 交付。

### 4.6 设置类信息的措辞（适用于所有页面）
- **路由**：「已配置的路由」和「实际命中的路由」分开显示。已配置的来自 `ROUTES`（`route-registry.ts:68`）。实际命中的来自 hook 事件日志 `.ai/harness/runs/hook-events.jsonl`（`event-telemetry.ts:16`，读取函数 `readHookEventTelemetry` 在 :399，带 `route_id`）。这份日志写入失败时不报错（fail open），所以命中数只是下限。
- **通知**分三个状态：
  1. 配置存在：现有 `notify-status` 的 configured/missing。
  2. 发送被接受：插件日志里的投递结果（`last_delivery`，`notify-status.ts:150`）。
  3. 已收到：需要 Bot 回执。现在仓库里没有这类数据，显示 `unknown`。
- **额度**：只显示官方来源的数字，并带上取数时间。没有官方来源时不显示，不估算。
- **worktree 视图**（P2）：不显示「可以安全清理」。只显示「清理前提还缺：…」。没有最近一次检查时显示 `unknown`。

---

## 5. 架构图选型（附录要求）

约束保持不变：默认一跳；数据来自 `.archcontext/model`；不用 daemon；只读。现有栈是 React 19.3、Vite 8、TypeScript 7，构建产物是静态 `dist/operator-ui`，前端依赖都是 devDependency。

npm registry 数据在 2026-10-05 用 `npm view` 查询（verified）。gzip 后的 bundle 大小没有测量（**unverified**），在 B 阶段用构建产物测量。

| 选项 | License | 解包大小 | 直接依赖 | 是否适合当前栈 | 结论 |
|---|---|---|---|---|---|
| **@xyflow/react 12.12.0**（React Flow） | MIT | 1.22 MB，另有 `@xyflow/system` 0.0.83 0.69 MB | 3 个（zustand、classcat、@xyflow/system） | React 组件；peer `react >=17`，支持 React 19；节点可以用自己的 React 组件和 CSS token 渲染 | **推荐** |
| ＋ **@dagrejs/dagre 3.1.1** | MIT | 1.41 MB | 1 个（@dagrejs/graphlib） | 纯 JS 分层布局，适合 LR 方向的一跳图 | **推荐的布局库** |
| ＋ elkjs 0.12.0 | EPL-2.0 OR GPL-3.0-or-later | 8.05 MB | 0 个 | 布局质量更好，但对 ≤20 个节点的一跳图是多余的 | 不选：license 更重，体积大 |
| dagre 0.8.5（旧包） | MIT | 0.84 MB | 2 个（graphlib、lodash） | 维护已经转到 `@dagrejs/dagre` | 不选 |
| Cytoscape.js 3.34.3 | MIT | 5.70 MB | 0 个 | 命令式 canvas API，不是 React 组件；节点不能直接复用 CSS token 和 i18n | 备选（React Flow 被否决时用） |
| C4 model / Structurizr 风格视图 | Structurizr 工具链（unverified） | — | — | C4 是一种表示法，不是渲染库。archctx 已导出 `architecture.structurizr.json`，但 JS 端没有可嵌入的渲染器（unverified） | **只借用表示法**：capability 按 container 画，component 按 component 画 |
| @backstage/plugin-catalog-graph 0.6.8 | Apache-2.0 | 0.35 MB（只算自身） | 17 个，包括 `@material-ui/core` v4、`@backstage/core-components` 和 catalog-client | 需要 Backstage app 外壳和 catalog 后端；MUI v4 是 React 17 时代的库 | 不选 |
| Mermaid 12.1.0 | MIT | 122 MB | 23 个 | 静态渲染。官方支持节点点击回调和外链（mermaid.js.org flowchart interaction），但没有一跳聚焦视图，体积和安全面也大 | 运行时不选。archctx 已生成 `.mmd`，静态导出继续用它 |
| D2 | MPL-2.0 | — | Go 二进制 | 需要外部工具链，在服务端渲染 | 不选 |
| LikeC4（参考） | MIT | 13.19 MB（likec4 1.59.4） | — | 它本身就用 xyflow + dagre + xstate。一个模型投影成多个视图，还有动态 flow 视图。archctx 已经能导出 `architecture.likec4` | **只借用模型/视图的思路**，不引入这个包 |

**提议方案（proposed，等待 Aimpact 决定；不锁定库）**：`@xyflow/react` + `@dagrejs/dagre`，两者都放在 devDependencies，打进 `dist/operator-ui`。
- **依赖成本的边界**：表里只列了每个包固定版本下的**直接**依赖。`@xyflow/system` 0.0.83 的直接依赖共 9 个：运行时是 `d3-drag`、`d3-interpolate`、`d3-selection`、`d3-zoom` 四个，另有五个 `@types/*` 包（包括 `@types/d3-transition`；`d3-transition` 本身不是直接依赖，npm registry 2026-10-05 查询）。完整传递闭包和每个传递依赖的 license 都**没有统计，unverified**，留到引入依赖的阶段验证。不能用顶层 MIT 推断整个依赖图的 license。B 阶段用构建产物测量实际打包体积。
- 一跳子图在 core 里用纯函数计算，服务端返回 `{nodes, edges}`。前端只负责布局和交互，不在前端推导模型关系。
- 只在 Architecture chunk 里按需加载，Overview 的首屏体积不变。
- 静态导出不新增任何依赖。Docs 和 PR 场景继续用 archctx 生成的 Mermaid、Structurizr 和 LikeC4 文件。
- 如果 Aimpact 不批准新依赖，回退到 Cytoscape.js（也是新依赖）。自绘 SVG 已经被任务附录否决，不再是选项。见 §11 Q1。

---

## 5A. Prior art / OSS reuse（按模块）

本节的结论都是 **proposed，等待 Aimpact 决定**。本节不锁定任何库。
- 「仓库」一列的 license 来自 Addendum 2 的调研（GitHub API，2026-10-05，Aimpact 提供），我没有重新核对。
- npm 包的 license 和版本是我在 2026-10-05 用 `npm view` 重新核对的（verified）。

### 5A.1 Architecture 图
- 候选：React Flow（`@xyflow/react` 12.12.0，MIT）+ `@dagrejs/dagre` 3.1.1（MIT）。比较见 §5。
- 参考 LikeC4（`likec4` 1.59.4，MIT）：同一个模型投影成多个视图，flow 用动态视图展示。可以借用的部分是：
  - 一跳视图和全图视图从同一个 core 投影里取数据。
  - 把 `flows/*.yaml` 的 steps 画成按步骤编号的动态视图（P1）。
- xstate（5.33.2，MIT）不需要。视图状态只有「中心节点」和「折叠状态」两个，React 自己的 state 就够了。
- 提议：xyflow + dagre，借用 LikeC4 的模型/视图思路。

### 5A.2 Docs 索引
- 参考 Backlog.md（`backlog.md` 1.53.0，MIT，Bun，用 markdown 和 frontmatter 的 status 驱动本地 web 看板）：
  - 可以借用：状态列视图，以及「文件就是数据，UI 只读」的模式。
  - 不引入它的运行时。
- gray-matter（4.0.3，MIT）和 velite（0.4.0，MIT，用 Zod 校验）**和当前仓库不匹配**。原因：仓库文档的头部是 blockquote `> **Key**: value`，不是 YAML frontmatter（§3.7）。现有的 `markdownHeader`（`artifact-parsers.ts:31`）已经能解析，所以不新增依赖。如果以后文档改用 frontmatter，再重新评估这两个库。
- 参考 Quartz 的图视图：只借用局部图和反向链接的展示思路。文档图用的渲染组件和 Architecture 一样，也是 xyflow，不另引入一套。
- 提议：沿用现有解析器，渲染组件和 Architecture 共用。

### 5A.3 Pipeline
- 借用展示方式，不嵌入任何引擎：
  - Temporal UI：事件历史按 run 和 attempt 分组。用于 D1 的时间线。
  - Argo Workflows：阶段徽章（状态色加图标）。用于阶段轨道。
  - Dagster 和 Trigger.dev：甘特式时间线。作为 D1 的可选视图，横轴是 transitions 的时间。
- xstate 是可选项。阶段机已经在 `stage-machine.ts` 里，不需要再用 xstate 重写。只有在前端需要画出状态机图时，才考虑用它的可视化格式。
- 提议：自己写组件，借用以上三种展示方式。

### 5A.4 多 agent 看板（P1 pane/worker 概览）
- `h0x91b/dev-3.0`（Apache-2.0，Bun + React + tmux + worktree，有一列「Has Questions」）：只作参考。「Has Questions」对应我们的 `waiting_input` 和 `waiting_approval`。
- ccmanager（MIT）：借用 busy/waiting/idle 的检测思路。我们的数据来源是 herdr 的 `agent_status` 和 ledger 的 run 状态，不读终端屏幕。
- opensessions（**没有 license**）：只借用「agent 主动推送状态」的思路，不复制任何代码。这个思路对应 D0 的事件接入。
- 终端输出：如果要显示 `herdr agent read` 的历史，提议用只读 xterm（`@xterm/xterm` 6.0.0，MIT，解包 5.92 MB）。不接键盘输入，不连接 pty。P1 再决定。
- diff：现有 `TaskDiff.tsx` 可以换成 `@git-diff-view/react`（0.1.7，MIT，解包 1.31 MB）。这一项是可选的，单独评估。0.x 版本说明 API 可能还不稳定。

### 5A.5 Agent config 查看
- 自己写只读解析器，不引入第三方配置管理工具。
- 参考 ruler（MIT）整理的各 agent 配置文件位置，用来列出 Claude、Codex 等工具的配置路径。只引用路径清单，不引入 ruler 本身。ruler 会同步规则，这和本 plan 的「永不自动同步」冲突。
- SKILL.md frontmatter 按 anthropics/skills 的约定解析。
- AGENTS.md 按「就近文件生效」的规则计算。
- MCP Inspector 只放一个外部链接，不嵌入。

### 5A.6 License 注意事项
| 项目 | 情况 | 允许的用法 |
|---|---|---|
| vibe-kanban | 已不维护 | 只借用模式 |
| claude-squad、opcode、claudecodeui | AGPL | 只借用模式，不复制代码 |
| opensessions、agent-viewer | 没有 license | 只借用思路，不复制代码 |
| superset、inngest、restate、cmux | source-available | 只借用模式，不复制代码 |

规则：只有 MIT 或 Apache-2.0 的 npm 包可以作为依赖候选，而且每个都要单独批准。其他项目一行代码也不复制。

---

## 6. 数据模型和 API

### 6.1 新 GET 路由（全部 `method:'GET', write:false`）

架构和文档按仓库区分。`{repo_id}` 只在注册表里查找，路径来自注册表，不来自请求。这与 `repository_snapshot` 的做法相同。

| id | 路径 | 读取器 | Phase |
|---|---|---|---|
| architecture_modules | `^/api/v1/repositories/<id>/architecture/modules$` | `readArchitectureModuleIndex` | B |
| architecture_module | `^/api/v1/repositories/<id>/architecture/modules/<cap>$` | `readArchitectureModule` | B |
| architecture_review_prompt | `^/api/v1/repositories/<id>/architecture/modules/<cap>/review-prompt$`，查询参数白名单：`shard`、`mode=module\|diff`、`base`、`head`。`mode=diff` 必须同时给出 `base` 和 `head`，服务端先解析成固定 SHA | 与 CLI 共用的 builder | B |
| docs_graph | `^/api/v1/repositories/<id>/docs/graph$`，查询参数白名单只有 `scope=active\|all` | `readDocsGraph` | C |
| agent_config | `^/api/v1/repositories/<id>/agent-config$` | `readAgentConfig` | C |
| pipeline_health | `/api/v1/pipelines/health` | 运行 `repo-harness pipeline health --json` | D0 |
| pipeline_unsynced | `^/api/v1/repositories/<id>/pipelines/unsynced$` | 读取 `.ai/harness/runs/pipeline-unsynced/*.json`（只读，字段白名单） | D0 |
| pipeline_detail | `^/api/v1/repositories/<id>/pipelines/detail$`，查询参数白名单：`source_host`、`task`（URL 编码）。**HTTP 只接收公开身份**：注册表 repo id（路径）、`source_host` 和 `task`（board 卡片上都有） | 服务端解析内部身份：注册表 → 仓库路径 → 复用 `taskRepository` 的 common-directory 逻辑（`task-worktree.ts:13-15`，和 CLI 同一个函数，不是重新推导）得到内部 `repository_id`，然后在服务端调用 `pipeline status --source-host … --repository-id … --task … --events --projection public --json`（`pipeline.ts:13,35` 的现有 selector，不新增 `--id` 别名）。仓库未注册或解析不唯一时返回 404。内部 `repository_id` 是 Git common 目录的绝对路径（`common-directory.ts:12-13`），只出现在服务端，HTTP 请求和响应都不得包含它 | D1 |

- **SSE（proposed，等待 Aimpact 决定）**：服务端现在用 `node:http` 的 `createServer`（`server.ts:15,1616`），前端靠轮询，还没有 SSE。如果采用 SSE，它是一条 `GET` 路由，返回 `text/event-stream`，`write:false`，只推送「某个只读快照有新版本」的通知。前端收到通知后再调用对应的 GET。SSE 不传数据本身，也不接受客户端消息。写边界测试的两条断言不变。
- `<cap>` 必须匹配 `^capability\.[a-z0-9-]+(\.[a-z0-9-]+)+$`，并且必须存在于模型索引里。不匹配时返回 404，不读取任何文件。
- 白名单以外的查询参数一律返回 400。
- `OPERATOR_ROUTES` 的顺序断言（`operator-write-boundary.test.ts:74-85`）要追加新 id。这是**必要的测试改动**：只追加 id，`toEqual([])` 和 GET/HEAD 扫描这两条断言不变。PR 里要逐项说明。

### 6.2 core 合约（新文件放在 `src/core/`）

```ts
// src/core/architecture/module-view.ts
type ModuleState = { model_valid: 'valid'|'invalid'|'unknown'; generated_summary: 'fresh'|'stale'|'unknown'; section3: 'present'|'pending' };
type ModuleIndexV1 = { schema_version: 'repo-harness.architecture-modules.v1'; commit: string; modules: { id; domain; name; status; components: number; state: ModuleState }[] };
type ModuleGraph = { center: string;
  nodes: ({ id; kind: 'capability'|'component'; name; role: 'center'|'child'|'caller'|'callee' }
         | { id; kind: 'group'; role: 'caller'|'callee'; count: number; members: { id; name }[] })[];  // 折叠组也有稳定 id（如 group.caller.<中心 id>），边可以引用它
  edges: { source; target; intent; relation_kind: string; direction: 'directed'|'undirected' }[] };  // 折叠时由 core 投影把边的一端改写成 group id；前端不改写边
type ModuleDetailV1 = { schema_version: 'repo-harness.architecture-module.v1'; commit: string; module: /* model facts */; graph: ModuleGraph; flows: /* steps/outcomes */; section3: string|null; linked_docs: { path; kind; status }[]; state: ModuleState };

// src/core/review/module-review-prompt.ts
type ModuleReviewPromptV1 = {
  schema_version: 'repo-harness.module-review-prompt.v1';
  prompt_version: string;                     // 指令文本的版本，改指令就升版本
  repository_id: string;                      // 注册表 id 的 digest，不是路径
  capability_id: string; commit: string; mode: 'module'|'diff'; base: string|null; head: string|null;
  worktree_dirty_paths: string[];             // 范围内的未提交路径；内容仍取自 commit
  dirty_content_sha256: string|null;          // 范围内未提交内容的 hash；工作区干净时为 null
  model_sha256: string;                       // 本模块及一跳邻居的模型文件 hash
  doc_sha256: string|null;                    // 模块文档的 hash；文档缺失时为 null
  sources: { path; sha256; bytes; class: 'required'|'optional'; disposition: 'included'|'omitted'|'chunked' }[];
  budget: { input_cap_bytes: number; used_bytes: number; incomplete: boolean; omitted_sections: string[] };  // used_bytes 和 omitted_sections 是整包字段，所有分片相同
  shard: { index: number; count: number; bytes: number };  // bytes 是本分片的大小
  full_prompt_sha256: string;                 // 未分片的完整 prompt 文本的 hash
  prompt: string;                             // 本分片的文本
  digest: string;                             // sha256(规范化 JSON：上面除 shard、prompt 以外的全部字段)
};

// src/core/docs/docs-graph.ts
type DocsGraphV1 = { schema_version: 'repo-harness.docs-graph.v1'; commit: string; scope: 'active'|'all'; archived_count: number;
  nodes: { id: string /* 仓库相对路径或 capability id */; kind; status: string|null; updated: string|null }[];
  edges: { source; target; label: string /* 头部字段名 */ }[];
  issues: { kind: 'broken_link'|'relationship_conflict'|'status_conflict'|'stale'; node; detail; check_prompt?: string }[] };
```

### 6.3 确定性和 digest
- 所有架构和文档读取器都**从 `HEAD` 提交读取**，用 `git cat-file` 或 `git show <commit>:<path>`，不读工作区。所以 CLI 和 UI 在同一个 commit 上得到相同的字节。
- 工作区的未提交改动不混进 prompt 内容。builder 列出 `worktree_dirty_paths`，并计算 `dirty_content_sha256`。所以「同一个快照」的定义是 commit 加上未提交内容的 hash。工作区一变，digest 就变。
- digest 是规范化 JSON（key 排序）的 sha256。同一个分片，CLI `--json` 和 GET 返回的对象逐字节相同。所有分片共用一个 digest。
- **缓存规则**：
  - 只有不可变的原始字节按 `(commit, path)` 缓存，例如模型文件和模块文档的内容。不写磁盘。
  - **完整 packet 不做进程内缓存**。每次请求都重新构建。这样 HEAD 从 C1 变到 C2、manifest 预算变化、schema 或 prompt 版本变化、关联文档变化，都自动反映在下一次构建里，不存在旧 packet 被常驻 GET 返回的问题。
  - **构建后的复查比较内容 hash，不是路径列表**：builder 完成后，重读范围内每个未提交文件并比较 sha256。有变化就重建一次。重建后仍有变化，说明工作区正在被并发修改，返回 `worktree_changed_during_read` 失败，不输出可能自相矛盾的 packet。
- **分片字段**：`budget.used_bytes` 和 `omitted_sections` 是整包字段，所有分片相同。每个分片自己的大小放在 `shard.bytes`。章节顺序固定。每个分片的输入上限都是同一个 12288 字节。

### 6.4 三个模块状态的来源
- `model_valid`：用 `archctx-contracts` 的 `validateJsonSchema` 和仓库自带的 schema 校验。如果在进程内加载失败（例如本仓库的 Bun 运行时不能直接 import 它的 TS 源码，**unverified**），状态是 `unknown`，不另写一个解析器。
- `generated_summary`：**当前没有安全的读取来源，固定返回 `unknown`**。已核对的原因（verified，源码追踪）：`architecture-projection status` 会运行 `inspectArchitectureProjectionReadiness`，它调用 `archctxCapabilities` 并启动 `archctx capabilities --json`（`archctx-provider.ts:256-259,299`）；还会运行 `inspectArchitectureProjectionAcceptanceState`，它获取独占目录锁，锁实现会 `mkdir` 并写锁文件（`projection-acceptance.ts:446-448`，`exclusive-directory-lock.ts:177,422`）。所以这个命令是探测加写锁，不是读取器，禁止出现在 GET 调用链里。它的 readiness 输出也不包含模块文档生成区的新鲜度。
- **功能缺口**：仓库里目前没有「每个模块生成区是否新鲜」的已发布证据。模块文档的生成区标记里有 `sourceDigest` 和 `outputDigest`（例如 `verified-context.md:3`），但要在本地比较它们就得重新计算模型侧 digest，这违反 I6。所以 UI 只把这两个 digest 当作信息字符串显示，不做比较，状态固定 `unknown`。
- **以后的出路（不在本 plan 范围）**：让 `architecture-projection apply` 在发布时写一份每个模块的新鲜度回执，UI 读这份回执。这需要单独批准。
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
- **共享 builder 的输入合约**：`composeReviewPacket` 的输入是 `{指令常量（带 prompt_version）、身份 digest（context_sha256、subject_sha256）、prior findings、contract 文本、goal 文本、verification 文本、source packet 文本}`。两个使用方各自准备这些输入，然后各自选择渲染方式：
  - `review round` 的渲染包含运行身份行（`actual_harness` 等，`generic-review.ts:249-252` 的 DOMAIN IDENTITY 和 provider value 说明）。
  - `module review-prompt` 的渲染不包含运行身份。它不伪造 `request_id`、`context_sha256`、`subject_sha256`、`actual_harness` 或 `actual_model`。
- **ReviewOutput 身份由派发方绑定**：`validateReviewOutput` 检查精确的字段集合（`src/core/review/generic-review.ts:28`），包括 request、context、subject 和运行身份。模块 prompt 只要求 reviewer 返回 provider value。这些身份字段由真正的派发方（Bot 通过 `review round` 或 `task-agent`）在派发时绑定。
- **共享的部分**：把 `generic-review.ts:249-251` 的固定指令文本，以及 ReviewOutput 的格式说明，抽成一个 core 常量，并带上 `prompt_version`。`review round` 和 `module review-prompt` 都用它。`module review-prompt` 不调用 `runReviewRound`，不启动 pane，不写 packet 文件。真正的派发仍然由 Bot 通过 `review round` 或 `task-agent` 完成。这样不会出现第二条 review-round 路径。
- **先把 context 构建和 pane 派发分开**（Dot 要求先做这一步，放在 Phase A）：
  - 现状：`runReviewRound` 先启动 reviewer pane（`generic-review.ts:241`），然后才拼装 packet（:247-255）。
  - 拼装需要的输入在 pane 启动前都已经有了：`context` 和 `identity`（:176-177）、`session.actual_harness`（:199）、`round`（:203），prior findings 只依赖 `round` 和会话目录（:246）。
  - 改法：新增纯函数 `composeReviewPacket(input)`，放在 `src/core/review/`。`runReviewRound` 在 `client.start` **之前**调用它，把 packet 写入 `packet-<round>.txt`，然后再启动 pane。
  - 行为约束：packet 的字节内容不变。packet 已存在但内容不同时，仍然抛出 `review_packet_changed_before_send`（:259）。拼装失败时，不启动 pane。
- **packet 合约**：每个 prompt 带这些字段：仓库（`repository_id`）、capability ID、mode、base/head、未提交内容 hash、模型和文档 hash、schema 版本和 prompt 版本（§6.2）。在同一个快照上，CLI 和 UI 必须得到相同的 digest。
- **12 KB 是输入上限，不是输出截断点**：
  - 上限从 `.archcontext/manifest.yaml` 的 `runtime.contextBudgetBytes` 读取，现在是 12288。不在代码里写死。
  - 章节分成必需和可选两类：
    - 必需：身份字段、模型事实、一跳关系、review 指令和输出格式。
    - 可选：flow、§3 原文、关联文档列表。
  - 必需章节永远不省略。
  - 可选章节按固定优先级装入。整章放不下时，把它写进 `omitted_sections`，在 `sources` 里列出路径和 sha256，并设置 `incomplete: true`。
  - 超出上限的内容分到后续分片（`--shard <n>`），而不是删掉。必需章节如果自己就超过上限，也同样分片。
  - 永远不做静默截断。每个分片都标明 `index/count`。
- **脱敏**：§3 和 contract 文本在进入 prompt 之前先经过现有的 MCP 脱敏模块（`src/cli/mcp/redaction.ts`，文件已存在；它的规则是否适用于这里为 **unverified**，A 阶段核对）。检测到 secret 时直接失败，返回 `secret_detected` 和对应路径。不发布一个已被改动的 prompt。
- **路径**：只输出仓库相对路径。读取前先对路径做 realpath，必须在仓库根目录以内。

### 6.6 门禁 explain（无副作用）
- 新增纯函数 `explainNextGate(record, now): { from, to, satisfied: boolean, missing: string[] }`，放在 `src/core/pipeline/gates.ts`。
- 它先 `structuredClone(record)`，在副本上调用 `refreshValidity`，然后复用 `requirementPass` 和 `stage-machine.ts` 里的门禁条件，只返回缺口，不抛异常。
- 门禁条件要和 `advanceRecord` 共用同一组判断，避免出现两份规则。具体做法是把 :17-40 的条件抽成一张表，`advanceRecord` 和 `explainNextGate` 都读这张表。`advanceRecord` 的行为保持不变，由现有的 `pipeline-observer.test.ts` 保证。

### 6.7 当前 attempt 规则（P1-03）
- **现状缺口**：`ledger.ts:48-53` 保留全部 round。`ingest.ts:48-56` 接受任何已登记且身份相符的 round。`projection.ts:11-13` 把结果应用到对应的 run，没有「当前 attempt」约束。门禁判断用的是 `record.runs.some(r => r.result_state === 'validated')`（`stage-machine.ts:23`）。所以在已有新 round 时，旧 round 的晚到结果仍能满足这项条件。CAS 只保护 record 的写版本，不约束 run 的先后。
- **规则**：每个 `(task, role)` 只有一个当前 attempt。**当前 attempt 是 round 最高的 run。同 round 不做到达顺序仲裁**：`(role, round)` 的身份在登记时冻结，`request_id` 或 `context_sha256` 不一致会抛 `request_identity`（`ledger.ts:48-53`），所以同一 round 不存在「后来的登记者获胜」，纯函数也不需要读 transitions 的 `seq`（run 和 record 都没有这个字段）。
- **旧 attempt 的结果**：保留为历史，记在它自己的 run 上。它们**不得**更新当前状态，也**不得**满足当前阶段的门禁条件。
- **实现**：在 `src/core/pipeline/` 新增 `currentRun(record, role)` 辅助函数，只用 `record.runs`。`stage-machine.ts` 里所有「存在某个 validated 结果」之类的判断改用 `currentRun`。改动范围（owning files）：`ingest.ts`、`ledger.ts`、`projection.ts`、`stage-machine.ts`、`gates.ts`。
- **归属 phase**：这一整项——helper、门禁和投影的修改、反例测试——都属于 **D0**（D0 的完成标准第 3 条要求它）。**D1 只消费这些规则，不再修改语义**。

### 6.7A Pipeline 详情的公开投影
- 在 `src/core/pipeline/projection.ts` 新增 `projectPipelineDetail(record, transitions)`，输出 board 卡片字段，加上 counters、`explainNextGate` 和 transitions。transitions 只保留 from、to、`seq`、at、reason，reason 经过 `publicText`。
- **排序用现有的 `seq`**（`read.ts:27` 按 seq 倒序；transitions 表有 `seq` 和 `ts`，`store.ts:73`，没有逐事件的 commit_seq）。快照水位（epoch/commit_seq）和事件序号（seq）是两个概念，输出里分开标。
- 不包含 pane、endpoint、worktree、branch 或私有路径。

### 6.8 GET 安全规则（所有新路由）
- **服务端字段白名单**：每个响应都由 core 投影函数逐字段构造，然后经过 decoder。不直接把文件或 record 序列化后返回。没有列在白名单里的字段一律不输出。
- **限制仓库和路径**：
  - 仓库只能用注册表 id 指定。
  - 文件路径只来自模型或文档头部，读取前先做 realpath，必须在仓库根目录以内。
  - 请求里的任何值都不会直接拼成路径。
- **Markdown/HTML 清洗**：服务端只返回纯文本。前端用 React 的文本节点渲染，不用 `dangerouslySetInnerHTML`。这条规则用一个源码扫描测试固定下来，写法和现有的 GET/HEAD 扫描一样。
- **编辑器链接**：默认只提供仓库相对路径的复制。如果以后要加 `vscode://` 这类链接，只能由服务端从白名单前缀和已校验的相对路径生成，并且不暴露绝对路径。不接受客户端拼出来的链接。
- **隐藏的值**：token、webhook URL、带凭据的连接串（`scheme://user:pass@`）、`url-token` 形式的 endpoint，一律替换成 `configured` 或 `[redacted]`。用一份带假值的 fixture 扫描所有新路由的输出。
- **GET 不做的事**：不建库，不迁移，不探测，不派发（I4）。pipeline 相关路由只读已发布的快照，或者调用只读 CLI。
- **整条调用链检查（不只是 HTTP 动词）**：设计本身就使用只读子进程（pipeline CLI、git、herdr pane list）和 immutable SQLite 快照，所以约束不是「零子进程」，而是**只允许列出的只读操作**：
  - **只读子进程 argv 白名单**：`git` 只允许 `cat-file`、`show`、`log`、`diff`，且必须带 `--no-optional-locks --no-ext-diff --no-textconv`；`repo-harness` 只允许 `pipeline list|status|health` 这类只读子命令；`herdr` 只允许 `pane list`。一律不经 shell。白名单以外的 argv 组合在测试里必须失败。
  - **唯一的 snapshot adapter**：只有这一个模块允许 import `bun:sqlite`，并且只以 `?immutable=1&mode=ro` 打开。其他读取器模块不得 import `Database`。
  - **仍然禁止的事**：打开 live DB，获取写锁，初始化或 mkdir，运行探测（例如 `archctx capabilities`），调用任何 mutation 或派发动词。
  - **行为检查，不只扫 import 名称**：集成测试记录 GET 和 HEAD 期间的全部子进程 argv 和文件系统副作用（含委托模块的调用）。断言只有白名单内的进程，零写入、零新建目录、零新数据库文件。`execFile` 一类的间接调用也要覆盖。
  - 只检查 `method === 'GET'` 和 405 不够。这条适用于所有新路由。

---

## 7. 分期

顺序是**两条并行线**：
- **产品线**：A → 轻量 B → C（含 Agent config）。
- **数据线**：D0（合约 + fixture + 试点）→ 真实接入 → D1。

D0 不阻塞 A、B、C，只阻塞 D1。两条线都完成后，再做 P1 其余项，然后是 P2。每个 phase 一个 PR。分工按 Model Division：后端、CLI 和测试由 Codex 做，前端由 Claude 做。每个 phase 结束时运行：
- `bun run check:type`
- `bun run test:files <受影响的测试> --timeout 60000 --max-concurrency 1`
- 涉及前端时运行 `bun run build:operator-web`，并在真实浏览器里打开截图。

### Phase A：模型读取器 + `module review-prompt` CLI
**范围**
- core 纯函数：模型索引、一跳图、模块状态、prompt builder（预算、分片、digest）。
- effects：从 `HEAD` 读取模型和模块文档，`Bun.YAML.parse`，schema 校验，脱敏。
- CLI：`repo-harness module review-prompt <cap> [--json] [--shard n] [--base r --head r]`，以及 `repo-harness module list [--json]`。
- 先做：把 `review round` 的 packet 构建和 pane 派发分开（§6.5）。

**涉及文件**
- 新增 `src/core/architecture/module-view.ts`、`src/core/review/module-review-prompt.ts`、`src/core/review/review-packet.ts`（`composeReviewPacket` 和指令常量）、`src/effects/architecture/model-reader.ts`、`src/cli/commands/module.ts`。
- 修改：
  - `src/cli/index.ts`：注册命令。
  - `src/core/review/generic-review.ts`：导出共享的指令常量。
  - `src/effects/review/generic-review.ts`：在 `client.start` 之前调用 `composeReviewPacket`，packet 字节不变。

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
- `tests/cli/module.test.ts`：`--json` 的形状和退出码；同一个快照上，两次调用的 digest 相同；改动一个范围内文件但不提交，digest 改变，`dirty_content_sha256` 不为 null。
- 扩展 `tests/generic-review.test.ts`：
  - packet 字节和改动前相同。
  - packet 文件在 `client.start` 之前写入。
  - 拼装失败时，`client.start` 没有被调用。

### 数据线 Phase D0：先保证记录可靠（合约 + fixture + 一条真实任务链试点）
**范围**
- 只在 repo-harness 本仓库做。用一条真实任务链作为试点。
- D0 的目标是记录可靠。只有门禁证据满足时才调用 `advance`。
- 试点只观察，不新增阻塞门禁。pipeline 写入失败不会阻止 Bot 继续工作，只会显示「未同步」。
- D0 不阻塞 A、B、C，只阻塞 D1。

**只有三个接入点**（文件在 `39d4e9ed` 上核对过）

| # | 接入点 | 仓库里的文件 | 做什么 |
|---|---|---|---|
| 1 | 接收和派发 | 根目录 `SKILL.md:9,16-18`（Bot 入口，第 3 步 execute）；派发命令 `src/cli/commands/task-agent.ts` | 复用同一个 task id：`task-agent start` 的 `task` 字段，就是 `pipeline new` 主键里的 `task`。派发前运行 `pipeline new`，派发后运行 `record --kind request` |
| 2 | 结果收集 | `assets/skill-commands/repo-harness-check/SKILL.md:9`（verify）、`assets/skills/repo-harness-cross-review/references/generic-review.md`；herdr webhook → Bot → `ingest-event` | herdr 的 `done` 只记成一条**通知**，不算阶段通过。现有代码已经这样处理：没有完整身份的 done/blocked 事件会记成 `weak_observation`（`ingest.ts`）。阶段结果只来自经过 sourceAuthority 校验的 result 和 `record --kind evidence` |
| 3 | 审批和收尾 | `assets/skill-commands/repo-harness-ship/SKILL.md:10-20`（返回 PR URL 和 head SHA） | 记录真实的批准或拒绝，以及 PR 和 head SHA。批准对应 `record --kind go`，它要求 subject、PR 和 target 完全匹配（`ledger.ts:84-89`）。合并路径见下面事件表的 `merge` 行 |

- 仓库里的这几个 skill 文件是 Bot 的入口说明。README:410 说任务执行已经移到「现有的 Bot skills」。外部 Bot runtime 是否还有自己的副本，**unverified**（§11 Q4）。

**最小事件集，以及它们和现有 CLI 的对应关系**

| 事件 | 现有 CLI | 说明 |
|---|---|---|
| `task_registered` | `pipeline new --idem-key <event_id>` | 主键是 `(source_host, repository_id, task)`。**必须带 `--idem-key`**：不带时重复创建返回 `rev_conflict`（`ledger.ts:41-42`），不会成功重放 |
| `dispatch_requested` | `pipeline record --kind request` | 身份字段取自 task-agent 写下的 `request-N.json` |
| `run_started` | `pipeline ingest-event --snapshot`（herdr pane 列表，带 `host` 和 `herdr_session`） | 用于判断 run 是否还在 |
| `stage_result` | `ingest-event`（完整身份）+ `record --kind evidence` | 先校验，再记成 observed 或 validated |
| `blocked` / `unblocked` | `advance --to blocked --reason …` / `advance --to <return_to>` | `stage-machine.ts:8-11` |
| `approve` | `record --kind go` | 需要真实的 Human 批准 |
| `reject` | `record --kind observation`（payload kind `reject`，带原因和 PR/head SHA） | 现有的 observation kind 已经能记录这类事实（`ledger.ts:97-101`），阶段不变。`revoke` 是另一回事：它只能让**已有的** go 失效（`ledger.ts:90`）。如果要求拒绝也改变阶段（例如推进到 blocked），需要新的语义，见 §11 Q10 |
| `merge`（正常批准后合并） | `record --kind observation`（payload kind `merge_fact`），然后 `advance --to merged` | 这条路径才会在 `merge-ask → merged` 时消费 go（`stage-machine.ts:31-35`，`ledger.ts:120-126`） |
| `merge`（外部事实，没有记录批准） | `record --kind external-merge`，**后面不跟 advance** | `external-merge` 自己会把阶段设为 `merged`（`ledger.ts:91-94`），并把 `approval_not_recorded` 设为 true。之后再 `advance --to merged` 会变成 `merged → merged`，被 `stage-machine.ts:41` 拒绝。两条路径各有一个 fixture：检查 go 是否被消费、admission 的值和重放结果 |
| `cleanup` | `advance --to cleanup` | 需要 8 项检查清单（`stage-machine.ts:36-40`） |

**每个事件带的字段**

| 字段 | 对应 |
|---|---|
| `event_id` | 三类命令各有自己的幂等参数：`new` 用 `--idem-key`；`record` 和 `advance` 用 `--command-key`；`ingest-event` 用 `--source` 加 `--delivery-id`。键由 Bot 确定性地生成（规则写进事件合约文档，例如 `<source>:<task>:<kind>:<序号或内容 digest>`），并保存在该任务的 task-agent 会话目录里 |
| `task_id` | `task` |
| `run_id` / `attempt` | `(role, round, request_id)`（`TaskRequest`，`task-session.ts:46-57`） |
| `stage` | 只是事件的标签，不是阶段声明。`ingest-event` 会拒绝事件里的 `phase` 和 `state_version` 字段（`ingest.ts:13`）。阶段只能由 `advance` 改变 |
| `source` | `--source`（默认 `herdr`） |
| `time` | 事件自己的时间放在 payload 里；ledger 写入时间由 ledger 记录 |
| SHA / evidence 引用 | `context_sha256`、subject 的 base/head、PR head SHA、证据 digest |

- D0 交付一份事件合约文档 `repo-harness.pipeline-event.v1`，以及对应的 fixture。它只描述上面的对应关系，**不新增存储表**。

**「未同步」状态**
- 现状：写入失败时，CLI 已经输出 JSON 错误和退出码 2-7。但 UI 看不到这次失败，因为失败的写入根本没有进入 ledger。
- **回执的归属**：回执由**发出这条命令的 checkout** 拥有，写在它的 `.ai/harness/runs/pipeline-unsynced/<event_id>.json`。这个目录已被 `.gitignore:70` 忽略。试点假设 operator serve 和 pipeline 写入方在同一台主机上；如果不是，UI 只显示本机的回执，并标明这个限制。
- **回执内容（足以跨进程重建同一条命令）**：按命令分别列出**全部**进入幂等 hash 的输入（hash 是 `digest(wire({...input, command_key: undefined}))`，`ledger.ts:107-110`），不能共用一张缺项的混合表：
  - `new`：`--source-host`、`--repository-id`、`--task`、`--title`、`--adopt-task`、`--root`、`--issue`、`--brief`、`--idem-key` 等实际给出的创建输入。
  - `record`：key 三元组、`kind`、payload、原 `state_version`、`command_key`。
  - `advance`：key 三元组、`--to`、**`--reason`（blocked 和返工边必填，进入 hash）**、原 `state_version`、`command_key`。
  - `ingest-event`：`--source`、`--delivery-id`、是否 `--snapshot`，以及 payload 或快照的引用。
  payload 一律用**不可变引用加 sha256**（指向已经写好的文件，例如 `request-N.json`），不复制原文，不包含 secret。引用丢失或内容改变后，按回执重放必须被明确拒绝。
- 特殊状态：重放遇到 `rev_conflict` 时，回执更新为冲突状态，不自动重试。回执本身写失败时，CLI 的错误输出加上 `unsynced_receipt_write_failed`。**这条失败只有 CLI 输出这一个证据，UI 和 health 看不到它**；health 不给这条命令标 `unknown`。UI 的覆盖说明要写明：未同步回执是 best-effort，回执写失败时以 CLI 报错为准。
- UI：Pipeline 视图读取这些回执（新增一条仓库范围的只读 GET），在对应的 task 上显示「未同步」。
- 恢复：Bot 用**同一个** `event_id` 和同一份 payload 重新运行**同一条** `repo-harness pipeline` 命令，这一步是幂等的。成功后由 CLI 删除回执。
- 恢复路径只调用 `repo-harness pipeline`，永远不重新运行 `task-agent start/send`。所以已经派发出去的工作不会被重新执行。Skill 文本要写明这一条。

**台账主机还没确定时**
- 先交付合约和 fixture，再用一个临时 dev store：把 `REPO_HARNESS_PIPELINES_AUTHORITY_HOST` 设成本机名，把 `REPO_HARNESS_PIPELINES_DB` 设到临时目录。临时目录的文件系统类型能不能通过 `requireLocation` 的允许列表（darwin `[17,26]`），**unverified**，要先试一次。
- 这时 Pipeline 视图显示「未连接」。它和「空」是两个不同的状态：没有快照指针时是「未连接」；有快照但没有 record 时是「空」。
- dev store 里的数据只用于测试，选定主机以后直接丢弃，不迁移。

**主机确定以后**
- 一台在线主机，一个权威 ledger（`requireLocation` 已经支持这两个环境变量，位置检查的代码不用改）。不等 Mini，不给每个 Bot 单独建库，不做双写。
- notify 插件的 payload 增加 `delivery_id`，作为 ingest 的 `event_id`。herdr 事件本身有没有 id，**unverified**，D0 先确认。插件版本升到 0.3.0。
- **旧插件一次性退役**：各主机完成单次升级后，旧插件停用。没有 `delivery_id` 的旧 payload 仍然接入，但在 health 和覆盖统计里标为 `incomplete`，**不计入**可靠覆盖（完成标准第 1 条要求有幂等键的事件）。不保留无限期的兼容路径。

**发布状态和存储健康**
- **三个发布状态**：`not committed`（写入失败，见未同步回执）、`committed but not published`（COMMIT 成功，快照导出失败）、`published`。已核对的缺口（verified）：导出在 COMMIT 之后尝试三次，失败只写 stderr（`store.ts:169-173`）；这时指针仍指向旧快照，旧快照里没有这次失败；首次失败时甚至没有可读快照。所以**不能**只靠快照内容报告导出失败。
- **writer 侧的发布证据，覆盖崩溃窗口**（已核对：`ledger.ts:136` 的顺序是 `boundary('commit')` → `publishAfterCommit`；现有测试 A3 已有 worker 在 commit 边界被 SIGKILL 的 fixture，`pipeline-observer.test.ts:106-113`）：
  1. **COMMIT 之前**，writer 先原子写发布意图文件 `<db>.publication-intent.json`，内容是目标 watermark 和时间。
  2. **导出尝试之后**，写发布状态文件 `{status: ok|failed, error_code, at, watermark}`，成功时删除意图文件。
  3. **writer 侧重启对账（writer-only）**：任何 writer 打开 store 时先看意图文件。意图存在且 live DB 的 watermark 已达到目标 → 属于 committed-but-not-published，先做一次发布专用导出，再清掉意图。意图存在但 live watermark 没到目标 → COMMIT 没有发生（SQLite 事务已回滚），丢弃意图。GET 永远不打开 live DB，所以 UI 在意图文件存在时显示 `pending`（等待 writer 对账），**不**断言 committed-but-not-published；只有 writer 校验过 live watermark 后，状态才变成确定的。
  4. 指针已更新但状态文件写失败时，health 以指针的 watermark 为准，把过期的状态文件标记为 `stale`。
- **幂等重放要补发布**：已核对（verified）：`record`/`advance` 命中 command-key 时直接返回缓存结果（`ledger.ts:33,111`），`ingest-event` 命中 delivery-id 时直接返回（`ingest.ts:15-17`），都不会再次发布。所以「已提交未发布」后重放同一条命令，UI 不会恢复同步。改法：幂等命中返回前，先重试一次发布（发布是只读导出，不是 mutation）。另加一条发布专用的 CLI：`repo-harness pipeline publish-snapshot`，只导出当前已提交状态，不做任何 mutation，也不调用 task-agent。
- 新增 `repo-harness pipeline health --json`。它读快照（年龄、epoch/commit_seq、coverage）、指针旁边的发布状态文件和「未连接」状态。operator 与 writer 不同主机时，发布状态显示 `unknown`。
- operator 新增 `pipeline_health` 路由。PipelineBoard 旁边显示一个健康条。

**涉及文件**
- 新增 `docs/reference-configs/pipeline-event.md`（事件合约）和 fixture。
- `src/effects/pipeline/store.ts`（发布意图和发布状态文件）、`src/effects/pipeline/read.ts`（`readPipelineHealth`）、`src/cli/commands/pipeline.ts`（`health`、`publish-snapshot`，以及写入失败时的未同步回执）。
- R-02 的 owning files 也在这个 phase 改：`src/core/pipeline/{stage-machine,gates,projection}.ts`、`src/effects/pipeline/{ledger,ingest}.ts`。
- `assets/herdr/webhook-notify/notify.mjs`、`herdr-plugin.toml`。
- `src/effects/operator/pipeline-status.ts`、`src/effects/operator/server.ts`、`src/core/operator/`（health 和未同步回执的 decoder）、`src/operator-web/PipelineBoard.tsx`。
- 三个接入点的 skill 文件：`SKILL.md`、`assets/skill-commands/repo-harness-check/SKILL.md`、`assets/skill-commands/repo-harness-ship/SKILL.md`。
- `docs/reference-configs/pipeline-observer.md`（权威主机和迁移步骤）。

**完成标准**
1. 只看 ledger，就能还原一条真实任务的全过程：阶段、run、证据、批准和合并。
2. 幂等：把全部事件重放一遍，`state_version` 不变，也没有重复记录。
3. 旧的 attempt 永远不会覆盖新状态（§6.7）：旧 round 的晚到 validated 结果不得满足当前阶段的门禁条件；旧 `state_version` 的写入返回 `rev_conflict`；旧结果仍保留在历史里。
4. fixture 覆盖失败、返工、拒绝、冲突和崩溃（`crashed_unknown` 和 `launch-unknown.json`）。
5. 记录在 CLI 重启后仍然存在：一个新进程能读回同样的状态。
6. 写入失败时显示明确的「未同步」，并且不会重新执行已派发的工作。「已提交未发布」的状态也能被看到，并且重放或 `publish-snapshot` 能恢复发布。
8. （补充）合并的两条路径都正确：批准合并消费 go；外部事实合并不做 advance，`approval_not_recorded` 为 true。
7. 在非权威主机上，写入返回 `authority_unavailable`，ledger 路径上没有创建任何目录或文件。调用方 checkout 里的未同步回执目录**允许**创建，这一条验收只约束 ledger 路径。

**测试**（扩展 `tests/effects/pipeline-observer.test.ts`）
- **empty/stale/not connected**：没有指针时返回「未连接」；有快照但没有 record 时返回 `empty`；快照过旧时返回 `stale`。
- **duplicate/out-of-order events**：
  - 同一个 `event_id` 重复投递，结果是 `duplicate`。
  - `terminal_key` 重复时跳过。
  - 先收到 result，后收到 request，记成 `unclaimed` 或 `weak_observation`，不出现在 board 上。
  - 旧的 `state_version` 返回 `rev_conflict`。
  - 旧 round 的 result 晚到，不改变新 round 的状态，也不满足当前阶段的门禁条件（§6.7）。
- **herdr done 不算通过**：只有 done 事件时，阶段不变。
- **fail/rework/reject/conflict/crash** 各有一个 fixture，外加两个合并 fixture（批准合并消费 go；外部事实合并不 advance）。
- **stale attempt**：新 round pending，旧 round 的 validated 晚到，门禁不满足；同 round 错 `request_id` 被忽略。
- **重启**：写入后启动一个新进程读取，状态相同。
- **未同步**：让写入失败，回执出现；回执里有完整命令身份和 payload 引用；用同一个 `event_id` 重试成功后，回执消失；payload 缺失或内容改变时，重放被明确拒绝；整个过程中没有调用 `task-agent`。
- **发布失败和崩溃窗口**五种：首次导出失败（没有快照，health 显示 failed）；已有旧快照时失败（指针不变，health 显示 failed + 旧快照年龄）；COMMIT 前退出（事务回滚，意图被对账丢弃，状态回到 not committed）；COMMIT 后、发布前退出（意图存在，health 显示 `pending`，writer 重启对账后发布成功并转 `published`）；指针已发布但状态文件写失败（health 以指针为准，状态文件标 `stale`）。崩溃窗口复用现有 A3 fixture 的 worker 手法。
- **回执写失败**：错误输出带 `unsynced_receipt_write_failed`；ledger 路径零目录创建的断言不受回执目录影响。
- `tests/cli/operator-serve.test.ts`：`pipeline_health` 和未同步回执路由只接受 GET，其他方法返回 405。

### Phase B（轻量）：Architecture 工作区
**范围**：3 条 architecture 路由；顶层导航；模块列表和模块页；一跳图（`@xyflow/react` + `@dagrejs/dagre`，按需加载）；复制 prompt；i18n（en/zh）；在 `.archcontext/model` 里给 operator 补一个只读 capability 节点（需要先批准，见 §11 Q5）。

**涉及文件**
- `src/effects/operator/server.ts`（路由）、`src/effects/operator/architecture.ts`（新增，调用 A 阶段的读取器）、`src/core/operator/architecture.ts`（decoder）。
- 新增 `src/operator-web/ArchitectureWorkspace.tsx`、`ModuleGraph.tsx`；修改 `App.tsx`（导航）、`i18n.ts`、`styles.css`。
- `package.json`（2 个 devDependency）、`bun.lock`。
- `tests/effects/operator-write-boundary.test.ts`（追加路由 id）。

**验收标准**
- 对同一个 capability，GET 返回的 `digest` 等于 CLI `--json` 返回的 `digest`。
- 构建产物里图相关代码在单独的 chunk 里，Overview 的首屏 chunk 体积变化不超过 5%，并记录实际的完整依赖闭包和 gzip 体积。
- 在真实浏览器里截图，三个模块状态分开显示。

**测试**
- **CLI/UI digest 一致**：`tests/cli/operator-serve.test.ts` 先启动服务器读取 review-prompt，再运行 CLI，比较两个 digest。module 模式和 diff 模式各比一次。
- **GET 调用链（§6.8）**：argv 白名单测试加 snapshot adapter 唯一性测试；集成测试逐个调用新路由（GET 和 HEAD 都测），记录子进程 argv 和文件系统副作用，断言零写入、零新库、白名单外零进程。
- **path escape**：`<cap>` 不合法、`<repo_id>` 未注册、查询参数不在白名单里，分别返回 404 或 400，并且不读取文件（用 fs spy 断言）。
- `tests/operator-web/operator-architecture.test.tsx`（新增）：模块列表的分组，三个状态分开显示，`unknown` 状态的显示，复制按钮的文本等于 CLI 命令。
- **图的画法**（core 投影测试）：
  - `parent:` 关系输出为包含关系，不输出为 `calls` 边。
  - 用一个带非 `calls` 关系的 fixture，断言它不会被标成调用边。
  - 一侧邻居超过阈值时，输出一个折叠节点和一个列表。
  - 折叠前后：每条边两端的 id 都能在 nodes 里找到；折叠只改写被折叠侧的端点，成员和关系可追溯。
- **GET 安全**（§6.8）：
  - 响应只包含白名单字段。
  - 源码扫描：`src/operator-web` 里没有 `dangerouslySetInnerHTML`。
  - 用带假 token 和 webhook URL 的 fixture，断言输出里只有 `[redacted]` 或 `configured`。
- 写边界测试：`toEqual([])` 和 GET/HEAD 扫描的断言不变。

### Phase C：Docs 工作区 + Agent config 页面
**范围**
- 文档图读取器，复用 `markdownHeader` 和 `planContractRelationshipConflicts`。
- Docs 工作区。
- Agent config 读取器和页面（P1 配置清单，§4.5）。默认只读仓库内的文件。读仓库外的全局文件需要先批准（§11 Q7）。
- 设置类信息按 §4.6 的措辞显示：路由分成已配置和实际命中，通知分成三个状态。

**涉及文件**
- 新增 `src/core/docs/docs-graph.ts`、`src/effects/operator/docs-graph.ts`、`src/core/operator/agent-config.ts`、`src/effects/operator/agent-config.ts`、`src/operator-web/DocsWorkspace.tsx`、`src/operator-web/AgentConfig.tsx`。
- 修改 `server.ts`、`App.tsx`、`i18n.ts`。
- 如果 §11 Q9 获批：在 `CLAUDE.md` 和 `AGENTS.md` 里给共享块加上稳定规则 ID 标记。两份文件要一起改，并保持各自独立。

**验收标准**
- 当前仓库：活动范围内的 PRD、Sprint、plan 和 contract 全部出现在图上。断链数量和人工核对的结果一致。
- 一个 PRD 同时有 Parent PRD 和 Sprint 引用时，它在图上有两条入边。
- 根目录 CLAUDE.md 和 AGENTS.md：没有加共享块标记时，diff 可见，drift 显示 `not-declared`；`## Claude Code` 和 `## Codex` 标为 host-specific。只有 Q9 获批加标记之后，才做 drift 判定。
- 每个仓库内的文件显示它自己的最后一次 commit 和 dirty 标记，不显示仓库的 HEAD。
- 页面上没有任何同步或修复按钮。停留过久的项只显示检查 prompt。

**测试**
- **missing/broken**：头部路径不存在时，产生 `broken_link`。
- **multi-parent**：图里保留两条边，不丢掉任何一条。
- **archive bound**：默认 `scope=active`；`scope=all` 时有节点上限。
- **path escape**：头部值是 `../../etc/passwd` 时，不读取这个文件，记为 `broken_link`。
- **secret redaction**：Agent config 里任何 secret 都只报告 configured 或 missing。用一个带假值的 policy fixture 断言，值不会出现在输出里。
- **共享块比较**：
  - 没有规则 ID 时，drift 是 `not-declared`，页面只显示文本 diff。
  - 加了标记的 fixture：只有声明为共享的块参与 drift 判定；宿主章节不同不算 drift；共享块内容不同算 drift。
  - 比较过程不写任何文件（用 fs spy 断言）。
- **状态冲突**：fixture 用真实 header 格式（sprint 的 `Child PRD A (Active)` 写法）。一个「Approved + Activation: Deferred」的 fixture 断言**不报**冲突；一个 Activation 明确相反的 fixture 断言报冲突；`relationship_conflict` 和 `status_conflict` 分开报出。
- **来源版本**：一个文件改了但没有提交，它的 dirty 标记为 true；其他文件的最后一次 commit 不受影响。
- **实际命中的路由**：用一份 hook 事件日志 fixture 计数；日志缺失时显示 `unknown`，不显示 0。

### Phase D1：Pipeline 可视化
**前提**：数据线的 D0 已经完成真实接入，并且满足 D0 的完成标准。

**范围**：`explainNextGate`、`projectPipelineDetail`、`pipeline status --projection public`（沿用现有三个 selector，见 N-02 的映射）、`pipeline_detail` 路由、Pipeline 工作区（阶段轨道、门禁缺口、时间线）；把 PipelineBoard 从 `organization` 移到这个工作区。`currentRun` 和 attempt 规则已在 D0 完成，这里只消费。

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
- **out-of-order**：transitions 按 `seq` 倒序排列（现有稳定序号，`read.ts:27`）；输出同时带快照水位（epoch/commit_seq）和逐事件的 `seq`，两者分开。
- **path escape 和身份映射**：查询参数缺一个、或值包含控制字符时返回 400；未知 task 返回 404；用 board 公开卡片（digest 形态）走通「卡片 → 详情」，并断言 HTTP 请求和响应里都没有内部 Git 路径。
- 用一个带私有路径的 fixture，断言输出里只有 `[private path]`。

**D 线后续：哪个 agent 实际加载了哪份配置**
- 这需要每次运行都留下加载回执：加载了哪些文件，以及它们的版本和 hash。现在没有这样的回执。
- 最小合约：task-agent 启动时写 `config-inventory.json` 到会话目录：`{files: [{path, sha256, size}], at, harness, session, status: 'snapshot', loaded: 'unknown'}`。这是**启动前快照**，证明 launcher 观察过这些文件。它**不能**证明外部 harness 消费了它们。
- **只有消费侧确认才能标 `loaded`**：需要 harness 或 runtime 在运行中确认它读过的配置版本和 hash，并绑定到 session/run/request。这个确认机制现在不存在，需要新增运行时功能，单独审批。在那之前，UI 的措辞是「启动快照（snapshot）」和「预期（expected）」，`loaded` 一律显示 `unknown`。
- 验收：快照里的 hash 和文件内容一致；文件后来变了，快照不变；页面区分「文件存在」和「运行时确认加载」两种状态，不把前者说成后者。

### P1 其余项（两条线都完成后，每项单独批准；以下是每项的最小合约）

**pane/worker 概览**
- 读取权限：task-agent 会话目录（`.ai/harness/runs/task-agents/*`）。herdr 实时结构通过只读 `herdr pane list --json`（现有只读动词）。
- 文件：`src/core/operator/pane-overview.ts`（投影：pane、agent、状态、任务的对应，私有路径用 `publicText`）、`src/effects/operator/pane-overview.ts`、`src/operator-web/PaneOverview.tsx`。
- API：`GET /api/v1/panes/overview`。
- 新鲜度：每次请求现读 herdr，超时后显示 `unknown`。
- 验收：一跳列表覆盖 waiting_input 和 waiting_approval（「Has Questions」思路，§5A.4）；不显示 endpoint 或绝对路径；只读 xterm 是可选项，单独评估。
- 测试：fixture 覆盖 running、waiting、crashed；405 非 GET；私有路径投影。

**PR/merge 队列**
- 读取权限：ledger 快照（`merge.ask`、`merge.owner_approval`、`merge.external_merge`、`resources.pr`）。
- 文件：`projectPipelineDetail` 的扩展投影、`src/operator-web/MergeQueue.tsx`。
- API：复用 `pipeline_detail`，不新增路由。
- 新鲜度：跟随快照。
- 验收：显示等待 go、go 已过期、外部合并未记录批准三类；没有审批按钮，只有复制的 Bot 命令。
- 测试：三类 fixture；重放不产生重复条目。

**通知路由视图**
- 读取权限：`notify-status` 现有读取器（presence only）加插件日志。
- 文件：`src/core/operator/notify-status.ts`（key 列表从 3 个扩到 6 个，加 `*_NOTIFY_DONE` 开关）、`src/effects/operator/notify-status.ts`、`src/operator-web/NotifyStatus.tsx`。
- API：复用 `notify_status` 路由，schema 版本升级。
- 新鲜度：30 秒轮询（现有 hook）。
- 验收：6 个 key 都显示 configured/missing；四个开关显示 on/off；通知按三个状态显示（§4.6）。
- 测试：fixture 断言 6 个 key 和开关都有输出，且值不泄露。

### P2（最低优先级）
- worktree 视图：不显示绿色的「可以安全清理」。只显示「清理前提还缺：…」；没有最近一次检查时显示 `unknown`（§4.6）。
- 模型分级。
- 磁盘深度用量。
- GPT Pro / MCP 额度和配置面板：额度只显示官方来源的数字，并带上取数时间（§4.6）。MCP Inspector 只放外部链接。

---

## 8. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| Bot 不按规定调用 pipeline CLI | Pipeline 工作区一直是空的 | D0 的验收标准要求有真实任务数据；health 显示 coverage；D1 必须在 D0 验收之后才开始 |
| 权威主机离线 | ledger 有缺口（pipeline-observer.md:5 说这是 telemetry gap） | health 显示快照年龄；Bot 把写入失败报给人；不做双写 |
| notify 投递会丢失，没有重试 | 时间线不完整 | `delivery_id` 去重；task-agent 的 request 记录作为第二个来源；coverage 显示缺口 |
| 新依赖的体积和维护 | 构建产物变大 | 按需加载；B 阶段测量 chunk 体积和完整依赖闭包。两个顶层包 MIT；直接依赖共 4 个；`@xyflow/system` 另有 9 个直接依赖（d3-*）；完整闭包 license 未测（unverified） |
| `archctx-contracts` 是 TS 源码包，运行时能否直接加载是 unverified | `model_valid` 一直是 `unknown` | A 阶段先探测；不行就显示 unknown，不另写解析器 |
| 模块文档新鲜度没有可用证据 | `generated_summary` 一直是 `unknown` | 已核对 `architecture-projection status` 有探测和写锁，已从 GET 移除（P1-01）。缺口写进 §6.4；出路是 projection apply 发布新鲜度回执，单独批准 |
| prompt 里带出 secret | 外泄 | 检测到 secret 就失败；测试覆盖 |
| CLI 和 UI 输出漂移 | 人和 Bot 看到不同的内容 | 共用 builder 和 digest；B 阶段的测试比较两者 |
| 归档文档很多（500 多项） | 响应慢，图太乱 | 默认不画归档；有节点上限；只缓存不可变的原始读取（§6.3） |
| D1 抽取门禁条件表 | 改变 `advanceRecord` 的行为 | 现有测试不改并且全部通过；一个 PR 同时改断言和实现时，按规则做一次只读的 tests-bent review |
| operator 服务多个仓库 | 读错仓库 | 只按注册表 id 解析仓库路径，并做 realpath 检查 |
| 把 packet 构建挪到 pane 启动之前 | 改变 `review round` 的行为 | packet 字节不变；断言「拼装失败时不启动 pane」；同一个 PR 改测试断言时做 tests-bent review |
| 拒绝后是否要改变阶段 | 事件语义不完整 | observation kind 已能记录 reject 事实（`ledger.ts:97-101`）。是否要推进阶段由 §11 Q10 决定；决定前，拒绝只记事实，不改阶段 |
| 外部 Bot runtime 不使用仓库里的 skill 文件 | 三个接入点改了也不生效 | 试点用一条真实任务链核对；核对不通过就停在合约和 fixture 阶段 |
| 未同步回执留在本机 | 另一台机器上看不到 | 回执归发出命令的 checkout 所有（§7 D0）；试点假设 operator 和 writer 同主机；跨主机时 UI 标明限制 |
| 复制了不兼容 license 的代码 | 法律风险 | §5A.6 规定只借用模式；依赖只考虑 MIT 或 Apache-2.0，并且每个单独批准 |
| SSE 连接 | 新的长连接 GET 路由 | proposed；只推送版本通知，不传数据；`write:false`；需要批准 |

---

## 9. 迁移说明

- **ledger 位置**：D0 用环境变量把权威 ledger 放在一台在线主机上。以后迁移到 Mini 时，顺序是：
  1. 停止所有写入方，并把 Bot skill 切到只报错。
  2. `export-snapshot`，然后复制快照文件。
  3. 在新主机上运行 `PRAGMA integrity_check`，并比较 epoch、commit_seq 和 sha256。
  4. 修改两台主机的环境变量。
  5. 恢复写入。

  整个过程不做双写，也不保留旧路径作为回退。
  - **搬迁细节**：**保留历史的迁移只能从完整、已验证的快照恢复**。从零建库是另一个空 ledger（epoch=1、commit_seq=0，没有 pipelines、idem_keys 和 ingest_receipts，`store.ts:70-77`），不能满足「历史、watermark 和幂等连续」的验收，所以它不是迁移的正常分支，已从本 plan 删除。原 `source_host`、`repository_id` 和 source authority 路由全部不变，只换 writer authority。任何写入前，先在新主机上成功执行一次快照发布，接管快照指针。task-agent 会话目录留在各自的 checkout 里不动。
  - **发布状态的单一权威**：发布状态只有发布意图文件和发布状态文件这一个权威（§7 D0）。**不改 `metadata` 表的 schema**，health 是发布文件的确定性投影。这样不存在两份可能漂移的状态，也不需要 schema 升级。
  - **restore 分支**：如果实施时走现有 restore 路径，就沿用 restore 自己的 epoch/reverify 语义（`store.ts:91` 的 `assertWritable` 会拒绝 restore 未完成的写入；细节 **unverified**，实施时核对），不把它和「连续 epoch」的迁移验收混用。一个搬迁只选一条路径，PR 里写明选了哪条。
  - **迁移测试**：迁移前后 watermark 相同；幂等记录重放结果相同；新进程读回一致；旧 writer 对新位置写入被拒绝；迁移后第一条新写入和第一次重放都成功。
- **notify 插件**：升到 0.3.0 以后，各主机要重新运行 `repo-harness herdr notify install`。旧插件完成单次升级后停用。没有 `delivery_id` 的旧 payload 接入时标为 `incomplete`，不计入可靠覆盖。
- **与代码不一致的文档**：本 plan 在 Phase A 的 PR 里修正 `README.md:521-524`（写动作描述）和 `tasks/todos.md:63`（三个文件已被 #510 删除）。这两处事实已核对，不再作为问题征求批准；如有异议请在审阅时提出。
- **导航**：Overview 保留现有的三个子 tab，现有的 URL 和截图不受影响。PipelineBoard 在 D1 移动。
- **数据结构**：不改动现有的路由或响应 schema，只新增 schema 版本。
- **架构模型**：给 operator 补 capability 节点，走正常的 architecture-projection 流程（需要批准，见 §11 Q5）。

---

## 10. 依赖、文件和抽象的理由

- **新依赖**：提议只有 `@xyflow/react` 和 `@dagrejs/dagre`，都是 devDependency。理由是附录要求使用成熟的社区方案。§5 按固定版本比较了 9 个选项。`@git-diff-view/react` 和 `@xterm/xterm` 只是候选（§5A.4），每个都要单独批准。本 plan 不锁定任何库。完整依赖闭包和 license 没有统计（§5）。gray-matter 和 velite 不需要，因为现有解析器已经够用（§5A.2）。
- **新抽象**：
  - ReviewOutput 指令常量：有两个真实使用方，`review round` 和 `module review-prompt`。
  - 门禁条件表：有两个真实使用方，`advanceRecord` 和 `explainNextGate`。
  - `composeReviewPacket`：有两个真实使用方，`review round` 和 `module review-prompt`。它也满足 Dot 的要求：把 context 构建和 pane 派发分开。
  - 不新增其他共享层。
- **新文件**：每个新数据源按现有模式新增一个 core 文件、一个 effects 文件和一个前端组件。没有额外的 wrapper。

---

## 11. 需要 Aimpact 决定的问题

1. **新依赖**：是否批准 `@xyflow/react` 12 和 `@dagrejs/dagre` 3 作为 devDependency？不批准时的备选是 Cytoscape.js。§5A 的其他候选（`@git-diff-view/react`、只读 xterm）是否进入评估？
2. **权威 ledger 主机**：D0 用哪台在线主机？DB 路径用什么？这两项决定 `REPO_HARNESS_PIPELINES_AUTHORITY_HOST` 和 `REPO_HARNESS_PIPELINES_DB` 的值。
3. **notify 插件 v0.3.0**：是否批准在 payload 里加 `delivery_id`，并在各主机做一次升级后停用旧插件？
4. **Bot skill 的归属**：仓库里三个接入点的文件已经找到（§7 D0）。外部 Bot runtime 是否直接使用这些文件？如果它有自己的副本，由谁改，在哪里改？试点用哪一条真实任务链？
5. **架构归属**：是否在 `.archcontext/model` 里新增一个只读的 operator capability 节点？
6. **P1 的顺序**：三个 P1 项的最小合约已经写进 §7。它们是否仍然排在两条线全部完成之后？
7. **Agent config 的边界**：这个页面是否可以读取仓库外的全局文件（只取 mtime 和 sha256，不取内容）？是否可以按 notify-status 的先例，调用 herdr 子进程读取仓库外的状态？
8. **停留过久的阈值**：`Executing` 或 `Active` 状态超过多少天，算「停留过久」？
9. **共享块标记**：是否在 `CLAUDE.md` 和 `AGENTS.md` 里给共享块加稳定规则 ID 标记？不加时，drift 只能显示 `not-declared`（§4.5）。
10. **拒绝的语义**：observation kind 已能记录 reject 事实。是否还要求拒绝改变阶段（例如推进到 blocked）？要求的话需要新的门禁语义。
11. **未同步回执的同主机假设**：试点是否可以假设 operator serve 和 pipeline 写入方在同一台主机？不可以的话，接受跨主机时显示 `unknown` 吗？
12. **SSE**：是否采用 SSE 推送「快照有新版本」的通知？还是继续用 30 秒轮询？
13. **折叠阈值**：一跳图的一侧超过多少个节点时折叠？建议值是 8。

---

## 12. 审查响应（Codex 只读评审，2026-10-05，NO-GO）

全部 15 条 findings 都接受，没有异议。逐条处置：

| Finding | 处置 | 位置 |
|---|---|---|
| P1-01 status 命令有探测和写锁 | 从 GET 移除；`generated_summary` 固定 `unknown` 并写明功能缺口；新增整条调用链检查 | §6.4、§6.8、Phase B 测试、§8 |
| P1-02 导出失败不可见，重放不补发布 | 三态发布状态；writer 侧发布状态文件；幂等命中补发布；新增 `publish-snapshot`；四种失败测试 | §7 D0 存储健康、完成标准、测试 |
| P1-03 旧 attempt 无约束 | 新增 §6.7 当前 attempt 规则、`currentRun`、owning files 和反例测试 | §6.7、§7 D0 |
| P1-04 merge 路径绕过 go 消费 | 事件表拆成两条合并路径；external-merge 后不 advance；两个 fixture | §7 D0 事件表 |
| P2-01 创建幂等和旧插件 | `new --idem-key` 写进事件表和字段表；旧插件一次性退役，旧 payload 标 incomplete | §7 D0、§9 |
| P2-02 回执不足 | 回执加完整命令身份和 payload 引用；定义归属 checkout、rev_conflict、回执写失败 | §7 D0 未同步 |
| P2-03 缓存与分片合约冲突 | 原始读取按 (commit, path) 缓存；packet 按合约身份；分片字段拆分 | §6.2、§6.3 |
| P2-04 diff 无 GET 入口，身份未闭合 | 路由白名单加成对 base/head；builder 输入合约；身份由派发方绑定；diff 模式 digest 测试 | §6.1、§6.5、Phase B |
| P2-05 docs 图字段缺失 | 加 `Task Contract`；Child PRD 解析规则；relationship 和 status 分开；两条真实状态规则 | §4.3、§6.2、Phase C |
| P2-06 图和时间线丢字段 | ModuleGraph 加 relation_kind、direction 和折叠组合约；时间线用 seq | §6.2、§6.7A、D1 |
| P2-07 标题回退不满足规则 ID | 无 ID 时 drift 为 `not-declared`，只显示 diff | §4.5、Phase C、Q9 |
| P2-08 依赖闭包不实 | 写明 @xyflow/system 的 9 个直接依赖；闭包标 unverified；不用顶层 license 推断闭包 | §5、§8、§10 |
| P2-09 P1 余项和 metadata 迁移 | 三个 P1 项各补最小合约；metadata 一次性迁移规则；搬迁细节和迁移测试 | §7 P1、§9 |
| P3-01 结论超出证据 | ledger 数据情况标 unverified；SKILL.md frontmatter 解析入口写明 | §3.3、§4.5 |
| P3-02 已知事实留在问题清单 | Q1 删除自绘 SVG；Q7 改为计划动作；Q8、Q9 移除；Q13 改写；Mermaid 行更正 | §5、§9、§11、§12 |

### 第二轮复核（R-01..R-08、N-01..N-03）

| Item | 处置 | 位置 |
|---|---|---|
| R-01 COMMIT 后不可观察 | 发布意图文件在 COMMIT 前写；writer 重启对账；UI 在意图存在时显示 `pending`，不声称 committed；五种崩溃/失败窗口各有测试 | §7 D0 发布状态 |
| R-02 attempt 仲裁和 phase 顺序 | 当前 run = 最高 round；同 round 身份冻结（`request_identity`），不做到达仲裁，不依赖 seq；helper、门禁、投影修改和测试全部移到 D0；D1 只消费 | §6.7、§7 D0/D1 |
| R-03 回执不是精确 replay input | 按四类命令分别列出全部 hash 输入（含 advance 的 `--reason`）；payload 用引用加 sha256；回执写失败只有 CLI 证据，health 不标 unknown；「零目录」验收只约束 ledger 路径 | §7 D0 未同步 |
| R-04 缓存仍可返回旧 packet | 改为完全不缓存 packet，每次构建；复查比较内容 sha256 而非路径；仍变化则 `worktree_changed_during_read` 失败 | §6.3、Phase A |
| R-05 把批准和激活混为一谈 | 分开 `Status` 和 `Activation` 两个维度；Deferred 对 Deferred 不是冲突；缺 Activation 显示 unknown；真实 header 做「不冲突」fixture | §4.3、Phase C |
| R-06 折叠组没有 id | group 节点带稳定 id；core 投影改写边端点；测试断言每条边端点存在 | §6.2、Phase B |
| R-07 依赖名单精度 | 运行时直接依赖是 d3-drag/interpolate/selection/zoom，`d3-transition` 只有 @types；比较表全部补上固定版本 | §5 |
| R-08 迁移分支和双份状态 | 删除「从零开始」分支；只从已验证快照恢复；发布状态单一权威是发布文件，不改 metadata schema；restore 语义不与连续 epoch 验收混用 | §9 |
| N-01 零进程验收与设计冲突 | 改为只读子进程 argv 白名单（git/pipeline/herdr）、唯一 snapshot adapter、行为级副作用检查，覆盖 GET 和 HEAD | §6.8、Phase B |
| N-02 详情 API 身份映射 | HTTP 只接收公开身份（注册表 repo id + source_host + task）；服务端复用 `taskRepository` 的逻辑解析内部 id 后再调 CLI；请求和响应不得含内部 Git 路径，有测试 | §6.1、D1 |
| N-03 启动 hash 不是加载证明 | 改名 config-inventory，status=`snapshot`，`loaded=unknown`；只有运行时消费确认才能标 loaded，单独审批 | §7 D 线后续 |
