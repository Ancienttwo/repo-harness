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

### 4.5 Agent config 页面（一个只读页面，不是工作区）
- **共享规则块比较**：
  - 只比较**声明为共享**的块。每个块用稳定的规则 ID 作为键。
  - 现状：根目录 `CLAUDE.md` 和 `AGENTS.md` 里没有任何块标记或规则 ID（grep `<!--` 为 0）。现在只能按 `## ` 章节标题对齐：`Workflow`、`Code Optimization Principles`、`Testing` 和 `Handoff` 两边都有；`Claude Code` 和 `Codex` 是宿主章节。
  - 要按规则 ID 比较，需要先在两份文件里加共享块标记。这会修改两份根目录 agent 指令文件，需要 Aimpact 批准（§11 Q12）。批准之前，页面按章节标题对齐，并标明「无规则 ID，按标题对齐」。
  - **diff 不等于 drift**：页面显示 diff。只有声明为共享的块内容不同，才标成 drift。宿主章节的差异标成「host-specific（预期不同）」。
  - 永远不自动同步。
- **来源版本**：
  - 仓库内的文件显示**该文件自己的最后一次 commit**（`git log -1 -- <path>`）和 dirty 标记，不显示仓库的 HEAD。
  - 不在 git 里的全局文件（例如 `~/.claude/CLAUDE.md`）只显示 mtime 和 sha256，不显示内容。读取仓库外的文件需要批准（§11 Q10）。
- **Capability 本地合约**：capability → agents/claude 路径、文件是否存在、两份文件的共享块是否一致。
- **角色和 profile**：`agents/fleet/*.md`、engineer profile 和 SOP。
- **Skill 清单**：`assets/skills/*/SKILL.md` 和 `assets/skill-commands/*/SKILL.md` 的 frontmatter（name、description），按 anthropics/skills 的 SKILL.md frontmatter 约定解析。
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
| **@xyflow/react 12.12.0**（React Flow） | MIT | 1.22 MB，另有 `@xyflow/system` 0.69 MB | 3 个（zustand、classcat、@xyflow/system） | React 组件；peer `react >=17`，支持 React 19；节点可以用自己的 React 组件和 CSS token 渲染 | **推荐** |
| ＋ **@dagrejs/dagre 3.1.1** | MIT | 1.41 MB | 1 个（@dagrejs/graphlib） | 纯 JS 分层布局，适合 LR 方向的一跳图 | **推荐的布局库** |
| ＋ elkjs | EPL-2.0 OR GPL-3.0-or-later | 8.05 MB | 0 个 | 布局质量更好，但对 ≤20 个节点的一跳图是多余的 | 不选：license 更重，体积大 |
| dagre（旧包） | MIT | 0.84 MB | 2 个（graphlib、lodash） | 维护已经转到 `@dagrejs/dagre` | 不选 |
| Cytoscape.js | MIT | 5.70 MB | 0 个 | 命令式 canvas API，不是 React 组件；节点不能直接复用 CSS token 和 i18n | 备选（React Flow 被否决时用） |
| C4 model / Structurizr 风格视图 | Structurizr 工具链（unverified） | — | — | C4 是一种表示法，不是渲染库。archctx 已导出 `architecture.structurizr.json`，但 JS 端没有可嵌入的渲染器（unverified） | **只借用表示法**：capability 按 container 画，component 按 component 画 |
| Backstage catalog-graph | Apache-2.0 | 0.35 MB（只算自身） | 17 个，包括 `@material-ui/core` v4、`@backstage/core-components` 和 catalog-client | 需要 Backstage app 外壳和 catalog 后端；MUI v4 是 React 17 时代的库 | 不选 |
| Mermaid | MIT | 122 MB | 23 个 | 静态渲染，不支持点击聚焦 | 运行时不选。archctx 已生成 `.mmd`，静态导出继续用它 |
| D2 | MPL-2.0 | — | Go 二进制 | 需要外部工具链，在服务端渲染 | 不选 |
| LikeC4（参考） | MIT | 13.19 MB（likec4 1.59.4） | — | 它本身就用 xyflow + dagre + xstate。一个模型投影成多个视图，还有动态 flow 视图。archctx 已经能导出 `architecture.likec4` | **只借用模型/视图的思路**，不引入这个包 |

**提议方案（proposed，等待 Aimpact 决定；不锁定库）**：`@xyflow/react` + `@dagrejs/dagre`，两者都放在 devDependencies，打进 `dist/operator-ui`。
- 一跳子图在 core 里用纯函数计算，服务端返回 `{nodes, edges}`。前端只负责布局和交互，不在前端推导模型关系。
- 只在 Architecture chunk 里按需加载，Overview 的首屏体积不变。
- 静态导出不新增任何依赖。Docs 和 PR 场景继续用 archctx 生成的 Mermaid、Structurizr 和 LikeC4 文件。
- 如果 Aimpact 不批准新依赖，回退到 Cytoscape.js（也是新依赖），或者回退到 Dot 原来的自绘 SVG（附录已经否决这一项）。见 §11 Q1。

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
| architecture_review_prompt | `^/api/v1/repositories/<id>/architecture/modules/<cap>/review-prompt$`，查询参数白名单只有 `shard` | 与 CLI 共用的 builder | B |
| docs_graph | `^/api/v1/repositories/<id>/docs/graph$`，查询参数白名单只有 `scope=active\|all` | `readDocsGraph` | C |
| agent_config | `^/api/v1/repositories/<id>/agent-config$` | `readAgentConfig` | C |
| pipeline_health | `/api/v1/pipelines/health` | 运行 `repo-harness pipeline health --json` | D0 |
| pipeline_unsynced | `^/api/v1/repositories/<id>/pipelines/unsynced$` | 读取 `.ai/harness/runs/pipeline-unsynced/*.json`（只读，字段白名单） | D0 |
| pipeline_detail | `^/api/v1/pipelines/<sha64>$` | 运行 `repo-harness pipeline status --id <key> --events --projection public --json` | D1 |

- **SSE（proposed，等待 Aimpact 决定）**：服务端现在用 `node:http` 的 `createServer`（`server.ts:15,1616`），前端靠轮询，还没有 SSE。如果采用 SSE，它是一条 `GET` 路由，返回 `text/event-stream`，`write:false`，只推送「某个只读快照有新版本」的通知。前端收到通知后再调用对应的 GET。SSE 不传数据本身，也不接受客户端消息。写边界测试的两条断言不变。
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
  prompt_version: string;                     // 指令文本的版本，改指令就升版本
  repository_id: string;                      // 注册表 id 的 digest，不是路径
  capability_id: string; commit: string; mode: 'module'|'diff'; base: string|null; head: string|null;
  worktree_dirty_paths: string[];             // 范围内的未提交路径；内容仍取自 commit
  dirty_content_sha256: string|null;          // 范围内未提交内容的 hash；工作区干净时为 null
  model_sha256: string;                       // 本模块及一跳邻居的模型文件 hash
  doc_sha256: string|null;                    // 模块文档的 hash；文档缺失时为 null
  sources: { path; sha256; bytes; class: 'required'|'optional'; disposition: 'included'|'omitted'|'chunked' }[];
  budget: { input_cap_bytes: number; used_bytes: number; incomplete: boolean; omitted_sections: string[] };
  shard: { index: number; count: number };
  full_prompt_sha256: string;                 // 未分片的完整 prompt 文本的 hash
  prompt: string;                             // 本分片的文本
  digest: string;                             // sha256(规范化 JSON：上面除 shard、prompt 以外的全部字段)
};

// src/core/docs/docs-graph.ts
type DocsGraphV1 = { schema_version: 'repo-harness.docs-graph.v1'; commit: string; scope: 'active'|'all'; archived_count: number;
  nodes: { id: string /* 仓库相对路径或 capability id */; kind; status: string|null; updated: string|null }[];
  edges: { source; target; label: string /* 头部字段名 */ }[];
  issues: { kind: 'broken_link'|'status_conflict'|'stale'; node; detail; check_prompt?: string }[] };
```

### 6.3 确定性和 digest
- 所有架构和文档读取器都**从 `HEAD` 提交读取**，用 `git cat-file` 或 `git show <commit>:<path>`，不读工作区。所以 CLI 和 UI 在同一个 commit 上得到相同的字节。
- 工作区的未提交改动不混进 prompt 内容。builder 列出 `worktree_dirty_paths`，并计算 `dirty_content_sha256`。所以「同一个快照」的定义是 commit 加上未提交内容的 hash。工作区一变，digest 就变。
- digest 是规范化 JSON（key 排序）的 sha256。同一个分片，CLI `--json` 和 GET 返回的对象逐字节相同。所有分片共用一个 digest。
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

### 6.7 Pipeline 详情的公开投影
- 在 `src/core/pipeline/projection.ts` 新增 `projectPipelineDetail(record, transitions)`，输出 board 卡片字段，加上 counters、`explainNextGate` 和 transitions。transitions 只保留 from、to、at、reason，reason 经过 `publicText`。
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
| 3 | 审批和收尾 | `assets/skill-commands/repo-harness-ship/SKILL.md:10-20`（返回 PR URL 和 head SHA） | 记录真实的批准或拒绝，以及 PR 和 head SHA。批准对应 `record --kind go`，它要求 subject、PR 和 target 完全匹配（`ledger.ts:84-89`） |

- 仓库里的这几个 skill 文件是 Bot 的入口说明。README:410 说任务执行已经移到「现有的 Bot skills」。外部 Bot runtime 是否还有自己的副本，**unverified**（§11 Q4）。

**最小事件集，以及它们和现有 CLI 的对应关系**

| 事件 | 现有 CLI | 说明 |
|---|---|---|
| `task_registered` | `pipeline new` | 主键是 `(source_host, repository_id, task)` |
| `dispatch_requested` | `pipeline record --kind request` | 身份字段取自 task-agent 写下的 `request-N.json` |
| `run_started` | `pipeline ingest-event --snapshot`（herdr pane 列表，带 `host` 和 `herdr_session`） | 用于判断 run 是否还在 |
| `stage_result` | `ingest-event`（完整身份）+ `record --kind evidence` | 先校验，再记成 observed 或 validated |
| `blocked` / `unblocked` | `advance --to blocked --reason …` / `advance --to <return_to>` | `stage-machine.ts:8-11` |
| `approve` | `record --kind go` | 需要真实的 Human 批准 |
| `reject` | **没有对应的 kind**。`revoke` 只能让已有的 go 失效（`ledger.ts:90`） | 缺口：D0 合约要决定新增 `reject` kind，还是记成 observation（§11 Q13） |
| `merge` | `record --kind external-merge`，然后 `advance --to merged` | 带 PR 和 squash SHA |
| `cleanup` | `advance --to cleanup` | 需要 8 项检查清单（`stage-machine.ts:36-40`） |

**每个事件带的字段**

| 字段 | 对应 |
|---|---|
| `event_id` | ingest 用 `--delivery-id`；record/advance 用 `--command-key`。两者都是幂等键 |
| `task_id` | `task` |
| `run_id` / `attempt` | `(role, round, request_id)`（`TaskRequest`，`task-session.ts:46-57`） |
| `stage` | 只是事件的标签，不是阶段声明。`ingest-event` 会拒绝事件里的 `phase` 和 `state_version` 字段（`ingest.ts:13`）。阶段只能由 `advance` 改变 |
| `source` | `--source`（默认 `herdr`） |
| `time` | 事件自己的时间放在 payload 里；ledger 写入时间由 ledger 记录 |
| SHA / evidence 引用 | `context_sha256`、subject 的 base/head、PR head SHA、证据 digest |

- D0 交付一份事件合约文档 `repo-harness.pipeline-event.v1`，以及对应的 fixture。它只描述上面的对应关系，**不新增存储表**。

**「未同步」状态**
- 现状：写入失败时，CLI 已经输出 JSON 错误和退出码 2-7。但 UI 看不到这次失败，因为失败的写入根本没有进入 ledger。
- 改法：写入失败时，CLI 额外写一份未同步回执到 `.ai/harness/runs/pipeline-unsynced/<event_id>.json`。这个目录已被 `.gitignore:70` 忽略。回执只包含 `event_id`、命令种类、task、错误码和时间，不包含 payload 原文或 secret。
- UI：Pipeline 视图读取这些回执（新增一条仓库范围的只读 GET），在对应的 task 上显示「未同步」。
- 恢复：Bot 用**同一个** `event_id` 重新运行**同一条** `repo-harness pipeline` 命令，这一步是幂等的。成功后由 CLI 删除回执。
- 恢复路径只调用 `repo-harness pipeline`，永远不重新运行 `task-agent start/send`。所以已经派发出去的工作不会被重新执行。Skill 文本要写明这一条。
- 快照导出失败另外记在 metadata 里，在 health 里显示（见下面「存储健康」）。

**台账主机还没确定时**
- 先交付合约和 fixture，再用一个临时 dev store：把 `REPO_HARNESS_PIPELINES_AUTHORITY_HOST` 设成本机名，把 `REPO_HARNESS_PIPELINES_DB` 设到临时目录。临时目录的文件系统类型能不能通过 `requireLocation` 的允许列表（darwin `[17,26]`），**unverified**，要先试一次。
- 这时 Pipeline 视图显示「未连接」。它和「空」是两个不同的状态：没有快照指针时是「未连接」；有快照但没有 record 时是「空」。
- dev store 里的数据只用于测试，选定主机以后直接丢弃，不迁移。

**主机确定以后**
- 一台在线主机，一个权威 ledger（`requireLocation` 已经支持这两个环境变量，位置检查的代码不用改）。不等 Mini，不给每个 Bot 单独建库，不做双写。
- notify 插件的 payload 增加 `delivery_id`，作为 ingest 的 `event_id`。herdr 事件本身有没有 id，**unverified**，D0 先确认。插件版本升到 0.3.0。

**存储健康**
- `store.ts` 把最近一次快照导出的结果（ok 或错误码，以及时间）写进 `metadata` 表，并随快照一起发布。
- 新增 `repo-harness pipeline health --json`。它只读快照和指针，输出快照年龄、epoch/commit_seq、最近一次导出结果、权威主机名、board coverage 和「未连接」状态。
- operator 新增 `pipeline_health` 路由。PipelineBoard 旁边显示一个健康条。

**涉及文件**
- 新增 `docs/reference-configs/pipeline-event.md`（事件合约）和 fixture。
- `src/effects/pipeline/store.ts`（导出状态）、`src/effects/pipeline/read.ts`（`readPipelineHealth`）、`src/cli/commands/pipeline.ts`（`health`，以及写入失败时的未同步回执）。
- `assets/herdr/webhook-notify/notify.mjs`、`herdr-plugin.toml`。
- `src/effects/operator/pipeline-status.ts`、`src/effects/operator/server.ts`、`src/core/operator/`（health 和未同步回执的 decoder）、`src/operator-web/PipelineBoard.tsx`。
- 三个接入点的 skill 文件：`SKILL.md`、`assets/skill-commands/repo-harness-check/SKILL.md`、`assets/skill-commands/repo-harness-ship/SKILL.md`。
- `docs/reference-configs/pipeline-observer.md`（权威主机和迁移步骤）。

**完成标准**
1. 只看 ledger，就能还原一条真实任务的全过程：阶段、run、证据、批准和合并。
2. 幂等：把全部事件重放一遍，`state_version` 不变，也没有重复记录。
3. 旧的 attempt 永远不会覆盖新状态：旧 round 或旧 `request_id` 的结果被忽略；旧 `state_version` 的写入返回 `rev_conflict`。
4. fixture 覆盖失败、返工、拒绝、冲突和崩溃（`crashed_unknown` 和 `launch-unknown.json`）。
5. 记录在 CLI 重启后仍然存在：一个新进程能读回同样的状态。
6. 写入失败时显示明确的「未同步」，并且不会重新执行已派发的工作。
7. 在非权威主机上，写入返回 `authority_unavailable`，并且没有创建任何目录。

**测试**（扩展 `tests/effects/pipeline-observer.test.ts`）
- **empty/stale/not connected**：没有指针时返回「未连接」；有快照但没有 record 时返回 `empty`；快照过旧时返回 `stale`。
- **duplicate/out-of-order events**：
  - 同一个 `event_id` 重复投递，结果是 `duplicate`。
  - `terminal_key` 重复时跳过。
  - 先收到 result，后收到 request，记成 `unclaimed` 或 `weak_observation`，不出现在 board 上。
  - 旧的 `state_version` 返回 `rev_conflict`。
  - 旧 round 的 result 晚到，不改变新 round 的状态。
- **herdr done 不算通过**：只有 done 事件时，阶段不变。
- **fail/rework/reject/conflict/crash** 各有一个 fixture。
- **重启**：写入后启动一个新进程读取，状态相同。
- **未同步**：让写入失败，回执出现；用同一个 `event_id` 重试成功后，回执消失；整个过程中没有调用 `task-agent`。
- **导出失败**：health 显示这次失败。
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
- 构建产物里图相关代码在单独的 chunk 里，Overview 的首屏 chunk 体积变化不超过 5%。
- 在真实浏览器里截图，三个模块状态分开显示。

**测试**
- **CLI/UI digest 一致**：`tests/cli/operator-serve.test.ts` 先启动服务器读取 review-prompt，再运行 CLI，比较两个 digest。
- **path escape**：`<cap>` 不合法、`<repo_id>` 未注册、查询参数不在白名单里，分别返回 404 或 400，并且不读取文件（用 fs spy 断言）。
- `tests/operator-web/operator-architecture.test.tsx`（新增）：模块列表的分组，三个状态分开显示，`unknown` 状态的显示，复制按钮的文本等于 CLI 命令。
- **图的画法**（core 投影测试）：
  - `parent:` 关系输出为包含关系，不输出为 `calls` 边。
  - 用一个带非 `calls` 关系的 fixture，断言它不会被标成调用边。
  - 一侧邻居超过阈值时，输出一个折叠节点和一个列表。
- **GET 安全**（§6.8）：
  - 响应只包含白名单字段。
  - 源码扫描：`src/operator-web` 里没有 `dangerouslySetInnerHTML`。
  - 用带假 token 和 webhook URL 的 fixture，断言输出里只有 `[redacted]` 或 `configured`。
- 写边界测试：`toEqual([])` 和 GET/HEAD 扫描的断言不变。

### Phase C：Docs 工作区 + Agent config 页面
**范围**
- 文档图读取器，复用 `markdownHeader` 和 `planContractRelationshipConflicts`。
- Docs 工作区。
- Agent config 读取器和页面（P1 配置清单，§4.5）。默认只读仓库内的文件。读仓库外的全局文件需要先批准（§11 Q10）。
- 设置类信息按 §4.6 的措辞显示：路由分成已配置和实际命中，通知分成三个状态。

**涉及文件**
- 新增 `src/core/docs/docs-graph.ts`、`src/effects/operator/docs-graph.ts`、`src/core/operator/agent-config.ts`、`src/effects/operator/agent-config.ts`、`src/operator-web/DocsWorkspace.tsx`、`src/operator-web/AgentConfig.tsx`。
- 修改 `server.ts`、`App.tsx`、`i18n.ts`。
- 如果 §11 Q12 获批：在 `CLAUDE.md` 和 `AGENTS.md` 里给共享块加上稳定规则 ID 标记。两份文件要一起改，并保持各自独立。

**验收标准**
- 当前仓库：活动范围内的 PRD、Sprint、plan 和 contract 全部出现在图上。断链数量和人工核对的结果一致。
- 一个 PRD 同时有 Parent PRD 和 Sprint 引用时，它在图上有两条入边。
- 根目录 CLAUDE.md 和 AGENTS.md：共享块的 drift 为 0；`## Claude Code` 和 `## Codex` 标为 host-specific。页面上 diff 和 drift 分开显示。
- 每个仓库内的文件显示它自己的最后一次 commit 和 dirty 标记，不显示仓库的 HEAD。
- 页面上没有任何同步或修复按钮。停留过久的项只显示检查 prompt。

**测试**
- **missing/broken**：头部路径不存在时，产生 `broken_link`。
- **multi-parent**：图里保留两条边，不丢掉任何一条。
- **archive bound**：默认 `scope=active`；`scope=all` 时有节点上限。
- **path escape**：头部值是 `../../etc/passwd` 时，不读取这个文件，记为 `broken_link`。
- **secret redaction**：Agent config 里任何 secret 都只报告 configured 或 missing。用一个带假值的 policy fixture 断言，值不会出现在输出里。
- **共享块比较**：
  - 只有声明为共享的块参与 drift 判定。
  - 宿主章节不同，不算 drift。
  - 共享块的内容不同，算 drift。
  - 比较过程不写任何文件（用 fs spy 断言）。
- **来源版本**：一个文件改了但没有提交，它的 dirty 标记为 true；其他文件的最后一次 commit 不受影响。
- **实际命中的路由**：用一份 hook 事件日志 fixture 计数；日志缺失时显示 `unknown`，不显示 0。

### Phase D1：Pipeline 可视化
**前提**：数据线的 D0 已经完成真实接入，并且满足 D0 的完成标准。

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

**D 线后续：哪个 agent 实际加载了哪份配置**
- 这需要每次运行都留下加载回执：加载了哪些文件，以及它们的版本和 hash。现在没有这样的回执。
- 先在 task-agent 启动时写回执，再在 Pipeline 详情里显示。Agent config 页面只显示「理论上就近生效」的那一份，不声称它实际被加载了。
- 这一项单独审批。

### P1 其余项（两条线都完成后，每项单独批准）
- pane/worker 概览：
  - 读取 task-agent 目录，需要新的公开投影。
  - 显示 herdr 的实时结构，只做可视化。
  - 借用 busy/waiting/idle 和「Has Questions」的思路（§5A.4）。
  - 只读 xterm 是可选项。
- PR/merge 队列。
- 通知路由视图：notify 状态的 6 个 key 都报告是否存在，并显示 `*_NOTIFY_DONE` 开关。通知按三个状态显示（§4.6）。

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
| 新依赖的体积和维护 | 构建产物变大 | 按需加载；B 阶段测量 chunk 体积；两个库都是 MIT，传递依赖共 4 个 |
| `archctx-contracts` 是 TS 源码包，运行时能否直接加载是 unverified | `model_valid` 一直是 `unknown` | A 阶段先探测；不行就显示 unknown，不另写解析器 |
| `architecture-projection status` 在读取时可能有副作用 | 违反 I4 | A 阶段在临时仓库里探测；有副作用就固定返回 unknown |
| prompt 里带出 secret | 外泄 | 检测到 secret 就失败；测试覆盖 |
| CLI 和 UI 输出漂移 | 人和 Bot 看到不同的内容 | 共用 builder 和 digest；B 阶段的测试比较两者 |
| 归档文档很多（500 多项） | 响应慢，图太乱 | 默认不画归档；有节点上限；按 commit 缓存 |
| D1 抽取门禁条件表 | 改变 `advanceRecord` 的行为 | 现有测试不改并且全部通过；一个 PR 同时改断言和实现时，按规则做一次只读的 tests-bent review |
| operator 服务多个仓库 | 读错仓库 | 只按注册表 id 解析仓库路径，并做 realpath 检查 |
| 把 packet 构建挪到 pane 启动之前 | 改变 `review round` 的行为 | packet 字节不变；断言「拼装失败时不启动 pane」；同一个 PR 改测试断言时做 tests-bent review |
| 「拒绝」没有对应的 record kind | 审批接入点不完整 | D0 合约先决定（§11 Q13）；决定前，拒绝只记成通知，不改变阶段 |
| 外部 Bot runtime 不使用仓库里的 skill 文件 | 三个接入点改了也不生效 | 试点用一条真实任务链核对；核对不通过就停在合约和 fixture 阶段 |
| 未同步回执留在本机 | 另一台机器上看不到 | 回执是仓库范围的；UI 只显示当前机器上的回执，并注明这一点 |
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
- **notify 插件**：升到 0.3.0 以后，各主机要重新运行 `repo-harness herdr notify install`。旧插件发出的 payload 没有 `delivery_id`，Bot 收到这种 payload 时，按「不去重」接入，并在 health 里计数。
- **导航**：Overview 保留现有的三个子 tab，现有的 URL 和截图不受影响。PipelineBoard 在 D1 移动。
- **数据结构**：不改动现有的路由或响应 schema，只新增 schema 版本。
- **架构模型**：给 operator 补 capability 节点，走正常的 architecture-projection 流程（需要批准，见 §11 Q5）。
- **与代码不一致的文档**：`README.md:521-524` 和 `tasks/todos.md:63` 建议在 Phase A 的 PR 里一起修正（§11 Q7）。

---

## 10. 依赖、文件和抽象的理由

- **新依赖**：提议只有 `@xyflow/react` 和 `@dagrejs/dagre`，都是 devDependency。理由是附录要求使用成熟的社区方案。§5 比较了 8 个选项。`@git-diff-view/react` 和 `@xterm/xterm` 只是候选（§5A.4），每个都要单独批准。本 plan 不锁定任何库。gray-matter 和 velite 不需要，因为现有解析器已经够用。
- **新抽象**：
  - ReviewOutput 指令常量：有两个真实使用方，`review round` 和 `module review-prompt`。
  - 门禁条件表：有两个真实使用方，`advanceRecord` 和 `explainNextGate`。
  - `composeReviewPacket`：有两个真实使用方，`review round` 和 `module review-prompt`。它也满足 Dot 的要求：把 context 构建和 pane 派发分开。
  - 不新增其他共享层。
- **新文件**：每个新数据源按现有模式新增一个 core 文件、一个 effects 文件和一个前端组件。没有额外的 wrapper。

---

## 11. 需要 Aimpact 决定的问题

1. **新依赖**：是否批准 `@xyflow/react` 12 和 `@dagrejs/dagre` 3 作为 devDependency？不批准时，选 Cytoscape.js，还是回到自绘 SVG？§5A 的其他候选（`@git-diff-view/react`、只读 xterm）是否进入评估？
2. **权威 ledger 主机**：D0 用哪台在线主机？DB 路径用什么？这两项决定 `REPO_HARNESS_PIPELINES_AUTHORITY_HOST` 和 `REPO_HARNESS_PIPELINES_DB` 的值。
3. **notify 插件 v0.3.0**：是否批准在 payload 里加 `delivery_id`，并在各主机重新安装插件？
4. **Bot skill 的归属**：仓库里三个接入点的文件已经找到（§7 D0）。外部 Bot runtime 是否直接使用这些文件？如果它有自己的副本，由谁改，在哪里改？试点用哪一条真实任务链？
5. **架构归属**：是否在 `.archcontext/model` 里新增一个只读的 operator capability 节点？
6. **P1 的顺序**：pane/worker 概览、PR/merge 队列和通知路由，是否都排在 D1 之后，并且每项单独审批？
7. **文档修正**：`README.md:521-524` 和 `tasks/todos.md:63` 是否在 Phase A 的 PR 里一起修？
8. **`generated_summary` 的来源**：如果 `architecture-projection status` 在读取时有副作用或者需要 daemon，是否接受这一项长期显示 `unknown`？
9. **review round 的 packet 拼装**：按 Dot 的要求，本 plan 在 Phase A 里把 packet 拼装移到 pane 启动之前，并保持 packet 字节不变（§6.5）。请确认这一项改动可以和 `module review-prompt` 放在同一个 PR 里。
10. **Agent config 的边界**：这个页面是否可以读取仓库外的全局文件（只取 mtime 和 sha256，不取内容）？是否可以按 notify-status 的先例，调用 herdr 子进程读取仓库外的状态？
11. **停留过久的阈值**：`Executing` 或 `Active` 状态超过多少天，算「停留过久」？
12. **共享块标记**：是否在 `CLAUDE.md` 和 `AGENTS.md` 里给共享块加稳定规则 ID 标记？不加的话，比较只能按章节标题对齐。
13. **拒绝事件**：`reject` 是新增一个 record kind，还是记成 observation？现有的 `revoke` 只能让已有的 go 失效。
14. **未同步回执**：是否同意写在仓库范围的 `.ai/harness/runs/pipeline-unsynced/`？这个目录已被 git 忽略。
15. **SSE**：是否采用 SSE 推送「快照有新版本」的通知？还是继续用 30 秒轮询？
16. **折叠阈值**：一跳图的一侧超过多少个节点时折叠？建议值是 8。
