# Multica 多 harness 看板：可萃取机制与适用边界

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## 研究范围与结论

用户要求克隆并研究 `https://github.com/multica-ai` 的多 harness 看板。组织的核心平台为 [multica-ai/multica](https://github.com/multica-ai/multica)，已克隆到 `~/projects/multica`。

- 外部源码基线：`7a438bd5b8bf39afd54259a7eb0971390e50a8ef`。本文 Multica 路径及行号均指此版本。
- repo-harness 对照基线：`a3fb4db2b9f411d6e7bc5184807275e9aa471378`。
- 方法：静态调用链核对、已有文档对照、查看随仓库提供的 `apps/docs/public/images/docs/quickstart-run-result.webp`。未启动 Multica 服务、安装依赖、运行测试或真实 agent；截图不是本次运行验收。
- 本次只增加研究文档，不改变 Sprint 范围、产品实现或执行授权。

值得吸收的是任务周围的执行可见性、明确的 runtime 身份、共享活动快照和恢复协议。我们的 Fleet 已有任务、Claim、Lease、消息及验收权威，应在其上增加可读投影。现有 attention-first worklist 与单一 Task Message 写入口继续成立。

关键限制：所查 Multica 链路只管理平台自己入队、claim 和启动的 run。没有发现自动扫描 tmux、纳管任意已有 Codex／Claude 进程的入口。它的 session resume 来自自身 task 历史，因此不能直接解决现有 BRC9 会话的发现、附着和消息传递。

## P1 — 对象和权威地图

| 对象 | Multica 的职责 | repo-harness 的对应及边界 |
| --- | --- | --- |
| Issue | 持久目标、assignee、讨论、业务状态 | Task / Work Package / Sprint；canonical task revision 仍是身份依据 |
| Run（内部 AgentTask） | 一次执行、触发来源、runtime、结果、历史 | TaskAutomationAttempt / campaign worker evidence；不能将进程结束等同验收完成 |
| Agent | 可分配的身份及 provider 配置 | Engineer / adapter identity；展示名不提供执行权 |
| Runtime / daemon | 机器、provider、在线状态与执行容量 | Agent Runtime endpoint、binding generation、Lease liveness；不能以 hostname 或 pane title 猜绑定 |
| Transcript | run 的统一消息与工具时间线 | 可作为观察面；验收继续绑定 exact subject 和 receipt |

Multica 对应入口：`packages/core/types/agent.ts:281` 的 AgentTask；`server/pkg/agent/builtin_runtimes.go:8` 的 provider descriptor；`packages/views/runtimes/components/runtime-machines.ts:96` 的机器分组。

我们的 Fleet card 当前含 task/revision、claim/generation、publication、feedback 和 inbox runtime 摘要，没有完整 session 身份及 run 历史：`src/core/fleet/board.ts:51`。浏览器 transport 保留来源语义而不重算，见 `src/core/operator/fleet-snapshot.ts:121`。

## P2 — 一次派发到看板的链路

Multica：Issue assignment → `maybeEnqueueOnAssign` → `EnqueueTaskForIssue` → 数据库 task queue → daemon 先取得本机 slot → claim 绑定 daemon/runtime/workspace → 准备目录 → `Backend.Execute` → `Session.Messages` / `Session.Result` → 消息批次及终态回传 → WebSocket 通知 → Query cache 失效并重取 → Issue 的活动标记和 Execution log。

可复核入口：

- 入队：`server/internal/service/issue.go:727`，`server/internal/service/task.go:1270`。
- 先取得执行 slot 再 claim：`server/internal/daemon/daemon.go:4987`。
- claim 归属及凭据：`server/internal/handler/daemon.go:1649`，`server/internal/service/task.go:3745`。
- 统一执行契约：`server/pkg/agent/agent.go:17`、`:142`。
- 消息上报及终态：`server/internal/daemon/daemon.go:8782`、`:8992`。
- 断线重取：`packages/core/realtime/use-realtime-sync.ts:1749`。

压力点是跨层状态不能混用：Issue assignee 不等于正在运行的进程 owner，runtime 在线不等于任务有进展，run completed 不等于代码已验收或已合并。

## P3 — 萃取取舍

### 1. 优先：在任务详情汇总执行观察

Multica 的卡片只显示简短 Working / Queued 信号；详情把当前 run 放前面，过去 run 折叠，提供触发原因、时间和 transcript。业务状态与执行状态并列，用户无需进入每个终端找进度。

证据：`packages/views/issues/surface/activity.ts:22`、`:44`；`packages/views/issues/components/issue-agent-activity-indicator.tsx:45`；`packages/views/issues/components/execution-log-section.tsx:77`、`:90`、`:105`。

应用到我们：先为当前 task/claim 展示 adapter、最近通知 observation、delivery/reachability、失败原因。两轮 Claude 讨论后，首包明确收窄为投递证据，不展示原始 endpoint 或历史列表；notify effect 不是 worker run。保留 Task Message 的唯一写入口。

当前入口：`src/operator-web/App.tsx:850` 已显示 effect digest、delivery、reachability、failure；`src/core/engineers/agent-runtime-effect.ts:145` 已有 host/endpoint/adapter/binding generation 与 observation 链。这是投影增量，不要求另建 run 数据库。

### 2. 优先：机器存活、执行活动和任务完成分开呈现

Multica 明确显示 `waiting_local_directory`，避免把等待本地目录锁误报成执行中或失败；runtime UI 还区分 recently_lost、offline、long_offline。

证据：`packages/views/issues/components/execution-log-section.tsx:96`；`packages/core/runtimes/derive-health.ts:14`；机器以 daemon 分组见 `packages/views/runtimes/components/runtime-machines.ts:273`。

应用到我们：展示观测时间与未知状态，不把“暂时无消息”推成进程死亡。Lease liveness 与 runtime observation 各保留自己的来源。Multica 的无 daemon ID 时按 device name 分组只适合展示，不能移植成我们的执行身份匹配规则。

### 3. 可借鉴：共享活动快照，事件触发重读

Multica 每个 workspace 共用 agent-task snapshot，行组件只选择自己的任务；WS lifecycle 事件使缓存失效，重连后重新读取 server state。无需每张卡单独请求 runtime，也不要求浏览器从事件猜出完整业务状态。

证据：`packages/core/agents/queries.ts:47`、`:62`；`packages/views/issues/surface/activity.ts:34`；`packages/core/realtime/use-realtime-sync.ts:1749`；`packages/core/issues/ws-updaters.ts:54` 的 revision 跟踪。

我们已经有 Fleet snapshot authority，不需要把 React Query 或 Zustand 当新架构目标。若以后需要自动刷新，可以借鉴事件仅作为失效提示、断线后重读 canonical snapshot 的机制，继续显示 stale / changed_during_read。

10 倍规模首先需要约束 snapshot 采集成本、活动任务数量和历史窗口；共享一个请求避免网络 N+1，并不自动消除每行遍历所有活动任务的计算成本。

### 4. 可借鉴：adapter 能力和 session continuity 有明确证据

Multica 用单一 runtime descriptor 区分 provider 身份与协议族，统一 `Backend/Session` stream。WS RPC 与 HTTP 共用 handler；claim 结果不确定时不立刻走另一通道重复 claim。历史 session 只从同 agent/issue/runtime 的 run 中选取，复用前验证本地 session 证据。

证据：`server/pkg/agent/builtin_runtimes.go:8`；`server/internal/handler/daemon_rpc.go:38`；`server/internal/daemon/wsrpc.go:307`；`server/internal/handler/daemon.go:2651`；`server/internal/daemon/daemon.go:6170`、`:8859`。

我们应吸收显式能力、同一授权下的传输恢复和精确身份绑定。不要复制庞大的 optional `ExecOptions`：`server/pkg/agent/agent.go:88` 已承认部分 provider 忽略选项。是否支持 resume、notify、cancel 应由可验证能力决定，不能只因 UI 有按钮便假定所有 harness 支持。

### 5. 可借鉴：注意力收件箱与执行日志分开

Multica Inbox 将同一 Issue 的通知合并，服务人的跟进；Agent 的 assignment / mention 则直接创建 run，不通过人的 Inbox 消费。完整活动仍留在 Issue 上。

证据：`apps/docs/content/docs/inbox.mdx`；`server/cmd/server/notification_listeners.go:80`、`:199`；`server/pkg/db/queries/inbox.sql:28`。

我们的 attention-first 方向已经成立，应保留；可以借鉴降噪和可追溯入口。但 Multica 的“mention 直接派发”不能等同我们的 Task Message：发送、投递、ACK、执行是不同事实。尤其不要让新消息绕过 Claim 和预算 admission。

### 6. 可借鉴：用量与授权额度在展示上说清楚

Multica 按 run 和 provider/model 展示 token/cost，单个 run 无 usage 时返回 null，而非声称免费。证据：`packages/views/runtimes/utils.ts:756`。

我们的 BRC 面应明确区分已消耗、预留、上限、拒绝原因，避免用户把 acquisition / repair 计数理解为美元账单。这只是展示建议，不能用估算美元重建 budget authority。Multica 的跨 run 合计会忽略未上报 run（同文件 `:800`），若借鉴总量 UI，需要同时呈现覆盖范围，不能把部分报告写成完整成本。

## 不照搬的边界

1. **不改成可拖拽的状态看板。** 我们列/分组来自权威推导，拖动没有合法写入语义；已有决定见 `docs/researches/20260829-operator-board-attention-first-redesign.md`。
2. **不把日志流当验收 receipt。** Multica 上报消息前清空内存 batch，失败只记 debug：`server/internal/daemon/daemon.go:8813`。终态回传重试耗尽后可能保持 running，源码明确留待后续 persistent queue / reaper：同文件 `:5911`。统一显示值得借鉴，可靠交付不能直接假定。
3. **不将重新分配等同中止旧 owner。** Multica 文档明确 assignee/status 修改不停止已开始 run：`apps/docs/content/docs/tasks.mdx`。我们的执行权必须留在 Claim/Lease/receipt 链。
4. **不为看板复制整个平台。** 不新增独立任务数据库、调度器、26-provider 矩阵或通用多端 monorepo；先覆盖真实使用的 Claude/Codex 与现有权威。
5. **不把任意 MCP process session 接成 Fleet authority。** `src/cli/mcp/process-sessions.ts:92` 是独立内存管理器，尚未证明与当前 Task/Claim 的 durable binding；不能按相似名称 join。

## 下一刀：当前 Task 的消息投递证据

与 BRC-claude 两轮讨论后的更新方案已捕获为 [Operator Task Message delivery evidence](../../plans/archive/plan-20260907-1207-operator-delivery-evidence.md)，状态 Draft，未进入实施。首包从同一个已校验 notify status 投影 adapter、effect 阶段、通知观察时间、receipt 类型、sequence 和 observation digest，并给出当前 claim 关联的 notify effect 数量。无历史分页、无新 endpoint 指纹、无原始 host/session 信息出境。

入口：`src/effects/engineers/agent-runtime-effect-store.ts:401` → 既有 Fleet projection → `src/core/operator/` 的安全投影 → `src/operator-web/App.tsx:850`。多个 notify effect 仍投影 reconciliation，不挑最新一条。数量也可能来自同 claim 的两条不同消息，文案不能把它断言成重复执行。stopped/superseded 通知不呈现为仍在飞。

这个切片验证“用户能否在一处看清当前任务的通知投递事实”，不承诺 worker 进度或 BRC9 pane 定位。验收覆盖：同 claim 正常观察、旧 generation 排除、无记录与读取失败区分、多 effect reconciliation 保留、current/observation digest 精确一致、浏览器不泄露本地路径或凭据，以及唯一 Task Message 写入口不变。通知 observed_at 不等于 ACK 时间或 worker 心跳。

没有证据的 session 名称/ID 不显示为已绑定。现有 BRC9 等任意终端的 discovery/attach，以及 Stop/Retry 控制，留待独立契约；本研究没有批准它们。

## 本次文档验证

- 42 个源码路径引用存在；Multica checkout 无改动；新增研究文档无空白格式问题。
- deploy SQL、task sync、strict task workflow、project-state inspection、init dry-run 均通过。task sync 判定没有 substantive repo changes，不新增任务执行脚手架。
- 初次研究检查的 architecture sync 被 `pending=1`、`blocking=1` 阻挡。后续 Claude 讨论会话处理了 projection 队列；方案收口时重新运行的六项完整性检查均退出 0。共享 manifest 仍有未提交变化，不归研究/计划包，也未纳入本包。
- 没有运行产品测试、全量测试或真实多 harness 集成；研究结论是源码和随仓库文档的审阅结果。


## Approved implementation (2026-09-07)

用户已授权实施 Operator Task Message delivery evidence。实现基线为
`repo-harness@7430fb93`，使用独立 `codex/operator-delivery-evidence` worktree。
Fleet protocol 4 的 required evidence 保留当前 Claim notify 候选数量，只有唯一
候选才投影 observation；与原 delivery receipt 状态同源选择，严格验证 current
绑定。UI 明确区分通知观察、worker 活动、无记录、多记录、读取失败和终态。
本包没有添加 session 发现、历史列表、写入口、存储或依赖。
