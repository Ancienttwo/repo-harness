# Plan: Herdr 会话绑定与 Kanban 交流

> **Status**: Approved
> **Created**: 20260914-1040
> **Approved**: 2026-09-16，用户在本会话回复“批准”
> **Execution Readiness**: Blocked at B1 — Herdr atomic occupant fencing unavailable in the verified 0.9.0 contract
> **Slug**: herdr-kanban-session-messaging
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: https://herdr.dev/docs/socket-api/
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Herdr exact occupant capability gate, inbox/effect/reply correlation, dedicated Codex/Pi canary
> **Rollback Surface**: Disable new Host actions; preserve inbox and effect journals; never replay unknown input or stop user panes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260914-1040-herdr-kanban-session-messaging.contract.md`
> **Task Review**: `tasks/reviews/20260914-1040-herdr-kanban-session-messaging.review.md`
> **Implementation Notes**: `tasks/notes/20260914-1040-herdr-kanban-session-messaging.notes.md`

## Agentic Routing
- Selected route: parent-agent
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: https://herdr.dev/docs/socket-api/
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260914-1040-herdr-kanban-session-messaging.md`
- Sprint contract: `tasks/contracts/20260914-1040-herdr-kanban-session-messaging.contract.md`
- Sprint review: `tasks/reviews/20260914-1040-herdr-kanban-session-messaging.review.md`
- Implementation notes: `tasks/notes/20260914-1040-herdr-kanban-session-messaging.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260914-1040-herdr-kanban-session-messaging.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260914-1040-herdr-kanban-session-messaging.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260914-1040-herdr-kanban-session-messaging.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260914-1040-herdr-kanban-session-messaging.contract.md`
- Review file: `tasks/reviews/20260914-1040-herdr-kanban-session-messaging.review.md`
- Implementation notes file: `tasks/notes/20260914-1040-herdr-kanban-session-messaging.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260914-1040-herdr-kanban-session-messaging.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260914-1040-herdr-kanban-session-messaging.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Disable new Host actions; preserve inbox and effect journals; never replay unknown input or stop user panes
- **Verification boundary**: Herdr exact occupant capability gate, inbox/effect/reply correlation, dedicated Codex/Pi canary
- **Review/acceptance boundary**: `tasks/reviews/20260914-1040-herdr-kanban-session-messaging.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260914-1040-herdr-kanban-session-messaging.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260914-1040-herdr-kanban-session-messaging.contract.md`, `tasks/reviews/20260914-1040-herdr-kanban-session-messaging.review.md`, and `tasks/notes/20260914-1040-herdr-kanban-session-messaging.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260914-1040-herdr-kanban-session-messaging.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Disable new Host actions; preserve inbox and effect journals; never replay unknown input or stop user panes

## Captured Planning Output

# Herdr 会话绑定与 Kanban 交流方案

## 结论与授权范围

采用 Herdr 作为 Kanban 在线会话交流的硬依赖。Herdr 拥有终端拓扑、在线 Agent 识别和输入投递；repo-harness 拥有任务、接收者授权、消息、effect 日志与验收。用户已于 2026-09-16 批准本方案。执行须遵守 B1 外部能力 gate；本轮完成可交付的 Herdr 上游接口需求，不启用 runtime、不向现有 Agent 投递消息，不提交或发布。

“Kanban”沿用用户称呼，具体产品入口是当前 Operator board 的 worklist/detail pane，不恢复旧五列 UI，不增加第二个聊天应用。

## 设计依据与证据等级

核对日期：2026-09-14。repo 源码基线：`d5b4f22b`，开始时 tracked worktree clean。当前安装的 Herdr client/server 均为 0.9.0，private protocol 22、endpoint protocol generation 1，server running 且 compatible。版本字符串不替代具体能力证明。

官方入口：

- [Agent automation](https://herdr.dev/docs/agent-automation/)：layout / pane / agent 分工、手动启动 Agent 的识别、prompt 与 wait 语义。
- [Socket API](https://herdr.dev/docs/socket-api/)：public API 方法、schema 与事件订阅；最终以安装版本的 `herdr api` metadata 为准。
- [CLI reference](https://herdr.dev/docs/cli-reference/)：命令与显式目标参数；命令拼写同样以安装 CLI help 为准。
- 本机 `herdr --skill`、`herdr agent`、`herdr pane current --current`、`herdr status` 是本次读取的运行接口证据。pane current 实际包含 `pane_id`、`terminal_id`、`agent_session {agent,kind,source,value}` 与状态；不把示例 ID 写死进实现。

仓库既有依据：

- `docs/researches/20260909-herdr-runtime-cutover.md`：Herdr 已是 runtime prerequisite；已有 adapter 只投递 control reference；名字不得跨 Binding 复用；已有真实 Herdr/确定性进程验证，不能冒充真实模型往返。
- `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`：V2 intent / observation / receipt 是现有执行边界。
- `docs/researches/20260829-operator-board-attention-first-redesign.md`：现有 UI 是 attention-first worklist，唯一业务写入口是消息 composer。
- `.ai/harness/policy.json`：`external_tooling.herdr.min_version=0.9.0`；`agent_runtime.mode=off`，两种 adapter 都 disabled。本方案不改这些值。

### 已核实的 Herdr capability 缺口

本机 `herdr api schema --json`、`herdr api snapshot` 和官方 schema 均已只读核对：

- `AgentPromptParams` 仅包含 target/text/可选 wait，没有 expected agent_session、revision 或等价的 prompt-if-match。`agent.wait` 对已解析 occupant 的约束不等于调用者可提交的 prompt 身份条件。
- `EventsSubscribeParams` 只有 subscriptions，订阅确认是 subscription_started；事件 envelope 为 event/data。官方不重放订阅建立之前的事件，没有 documented durable cursor/ACK 协议。
- `pong`/snapshot 提供版本、协议与 capability，但没有 documented server_id。pane revision、state_change_seq 不能充当输入 CAS 或全局服务器 incarnation。

**当前结论：Herdr 0.9.0 的 documented API 不满足严格零误投的自动投递 gate。** 方案仍可完成，但 B1 的当前状态是外部能力缺口，不应在实施时反复重跑同一 metadata 来寻找不存在的选项。

有界上游需求：Herdr 在公开 Agent 输入操作增加一个由官方发现接口返回、由服务端解释的 opaque occupant/binding token；token 覆盖 server incarnation、terminal occupant 与 native session 切换。服务端在写入任何输入前原子核验，并在分段 paste/Enter 期间防止目标漂移；mismatch 返回明确的零输入错误，response 回显已匹配的 token。字段名与实现属于 Herdr，本方案不虚构可调用命令、不假定此 API 已存在、不要求本地重造进程识别。新 capability 获支持后，以原有 binding 序列接入，不需要换消息协议。

发布验收要求的是“过期会话不能收到输入”。只发送 opaque reference 降低暴露面，但不等于证明零误投；不能用“错误会话读不到正文”替代这项指标。发布前如果要主动放宽这一要求，必须单独修改方案的验收边界。

订阅实现使用 `events.subscribe` + snapshot reconciliation；无 durable cursor 是已知设计约束，不作为上游必须新增的功能。server incarnation token 则由上述原子投递能力统一解决。

## Geju：目标、约束与最小证伪

**Thesis**：每张正在执行的卡片都能指向一个明确的 Herdr 会话，用户发出的消息和 Agent 回复留在任务记录里。终端是可替换的运行载体，卡片对话不能随终端退出而消失。

**Confidence**：方向 high；严格的进程替换竞态隔离仍需 capability gate。单次 `get` 的成功不能证明稍后的输入仍交给同一会话。

**不再建设的概念**：独立 session-discovery daemon、SDK 与 Fleet 两份消息权威、逐 harness 的终端输出 parser、由 done badge 驱动的任务完成状态。BYOK SDK / Pi control socket 不进入本 work-package 的依赖图。

**10x 压力点**：逐消息唤醒和逐卡片扫描所有 pane。绑定时发现、投递时按精确目标读取；同一 Binding 串行处理通知，已有未决 effect 时不启动另一条通知。消息留在现有 inbox，不另建 scheduler 或 retry queue。

**Falsifier**：若 Herdr 的原生接口不能拒绝预期会话已经替换的输入请求，则不能发布“零误投到替换会话”的自动投递承诺。先完成有界能力验证并留下需求，不用本地双读、终端 regex 或人工点击确认冒充原子保证。

## P1：边界与现有实现

| 边界 | 当前权威/入口 | 本方案职责 |
|---|---|---|
| 卡片消息入口 | `src/operator-web/App.tsx#postTaskMessage`，现有 `/api/v1/fleet/tasks/:repository/:task/messages` | 扩展当前详情中的会话观察与关联回复，不允许浏览器指定任意 socket、命令或接收进程 |
| Operator 授权 | `src/effects/operator/server.ts`、`src/effects/fleet/task-message-request.ts#sendOperatorTaskMessage` | 保持 registry access、canonical task、task revision、claim/generation 校验 |
| Durable messages | `src/core/fleet/task-message.ts`、`src/effects/fleet/task-inbox.ts` | 唯一消息正文及 delivery/ack 权威；已有 message_id 与 in_reply_to |
| 路由 | ClaimActorReceipt → `src/effects/engineers/binding-store.ts` | 从当前 Claim 推导 Engineer Binding，不能从 pane 名称猜 task owner |
| Effect | `src/core/engineers/agent-runtime-effect.ts`、`src/effects/engineers/agent-runtime-effect-store.ts` | 复用 prepare/start/observe 及恢复语义，不建新消息状态机 |
| Herdr 执行 | `src/effects/terminal/herdr.ts`、`src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts` | 在现有显式 session + live name 路由上补充确切身份约束与 pane 展示 |
| CLI/MCP 接收 | `src/cli/commands/fleet.ts`、现有 Engineer runtime 接口 | 读取权威消息、写 exact effect receipt、关联回复；Herdr 只传有界 control_ref |
| 展示 | `src/core/fleet/board.ts`、`src/effects/fleet/board.ts`、`src/operator-web/` | 生命周期、传输观察、消息回复分开投影；不改任务状态 |

### 关键现状

1. `executeHerdrCliAgentAction` 已存在；当前 resolver 返回 `{session, configPath?, agentName}`，用 argv 调用 `agent prompt <name> <control_ref>`，10 秒上限。当前仅按返回的 name 验证 acceptance，不能据此宣称 session fencing 已完成。
2. `RuntimeEndpointFenceV2` 已携带 Engineer/Binding generation、host_id、endpoint_id。Binding 的历史字段 `provider_thread_id` 已定义为 opaque endpoint ID，本方案不为改名迁移整个 Binding 协议。
3. `sendOperatorTaskMessage` 目前提交新消息，固定 `in_reply_to:null`；底层消息模型和 `fleet message send --in-reply-to` 已支持关联。UI 双向 thread 仍需明确接入。
4. `fleet inbox list` CLI 会先执行 delivery；它不是纯只读查询。卡片 GET 必须直接消费 effect 层只读 projector，不能 shell out 到这个 CLI 来展示会话。
5. 普通 manual/hook receipt 不足以证明某次 runtime effect：`receiptEvidence` 要求 exact `agent_runtime_effect` channel 和匹配 control_ref。

## P2：一条真实路径与目标连接点

当前已核对路径：

`postTaskMessage` → HTTP POST → Operator message worker → `sendOperatorTaskMessage` → registry 可写校验 → canonical task/claim 校验 → `sendTaskBoardMessage` → task lock 内复核并写 immutable event。

现有 runtime 的另一段：

`prepareAgentRuntimeEffect` → exact Lease → ClaimActorReceipt → current Binding → pending inbox event → durable intent → `startAgentRuntimeEffect` 写 effect_started → Host action → Herdr adapter → `observeAgentRuntimeEffect` 读取 exact inbox receipt。

需要连接并验收的完整交流路径：

1. 用户在卡片详情写消息。沿用稳定 message_id；HTTP 超时只查询/重提相同持久消息身份，不直接重发 Herdr prompt。
2. 消息写入成功后，Host 在现有 runtime policy 允许且 claim/binding/capability 均有效时 prepare/start 一次 notify_inbox。跨进程边界发生在既有 Operator worker 与 Herdr CLI；effect_started 必须早于输入副作用。
3. Herdr 输入仅包含现有 control_ref。Agent 通过已授权的 repo-harness 入口解析引用、读取消息；引用本身不是 bearer credential，不授予接收者权限。
4. 读取入口核对当前接收者、message digest、claim、Binding generation、effect/control_ref，再持久化对应 delivery receipt。不能把 model 自述或 Herdr prompt response 转成 receipt。
5. Agent 使用现有消息路径向 user 或已授权 peer 回复，`in_reply_to` 指向确切请求。新增边界校验要求父消息存在、属于同 repo/task/revision，回信 principal 符合原请求的接收者约束；失败直接拒绝，不能猜测“最近一条消息”。
6. 卡片只读读取消息与回复，按持久事件排序展示。ACK 只表示收件处理约定；reply 是另一条 message；任务验收仍独立。
7. 重启仅恢复 durable intent/receipt 并读取 Herdr 当前观察；effect_started 且无正面回执进入 reconciliation_required，不重新投递。

## P3：推荐设计

### A. Herdr 硬依赖的精确含义

该在线交流功能只能选择 `herdr-cli-agent`；不可自动改用 Codex App Server、Pi socket、tmux 或 shell input。保留仓库其他功能已经拥有的 adapter 不等于本功能的备用路径。

依赖版本沿用 `.ai/harness/policy.json#external_tooling.herdr`，不加第二个 min-version 配置。安装/更新仍走现有 operator 流程，功能启动不得修改用户 Herdr config、重启 server 或恢复 Agent。具体安全能力不满足时标为 unsupported/unverifiable 并禁止 Host action，即使版本号满足也一样。

[ASSUMED] P0 限同机、显式 Herdr session、已打开的 Codex/Pi 会话；不做远程 SSH 配置、pane 创建、进程启动/终止或完整审批 UI。理由：先验证用户要求的现有会话交流，避免把部署和进程托管混入消息链路。

### B. 绑定模型

- Task → ClaimActorReceipt → Engineer Binding 是唯一所有权链。UI 中选 pane 不产生 task assignment，也不覆盖 Lease。
- 在现有 endpoint resolver 边界引入一个不可变、严格验证的 Herdr endpoint descriptor，由现有 Binding 的 endpoint ID 精确引用。它只描述位置，不持有 task owner/current 状态；Binding 是唯一 current selector。
- descriptor 记录显式 Host/session/config locator、Herdr 返回的 pane_id、terminal_id、完整 native agent_session、被绑定的唯一 Agent name。workspace/tab 只用于展示，可从最新 Herdr observation 投影；PID 与 pane revision 都不能擅自当作稳定进程世代。
- 每次绑定只接受 Herdr 官方字段和 live readback。native session 不可验证时，P0 禁止激活该 binding。人工启动且尚无 name 的 Agent 可以在明确绑定操作中通过 Herdr 命名；name 不允许跨 Binding 复用，名称只作为路由索引。
- descriptor 保存到现有 repo git-common-dir 下的 Binding 所属存储边界，按 canonical bytes digest 标识，write-once；不设第二个 mutable endpoint registry，不把机器 endpoint 提交到 Git。
- 绑定初始化通过现有 `engineer binding` 命令组增加具名 Herdr bind 操作。该操作先准备 descriptor，再调用现有 bind/replace CAS；失败时未引用 descriptor 无权投递。卡片 UI P0 只展示绑定及明确的失效原因，不增加任意进程选择/控制写入口。
- pane 跨 workspace 移动、Agent 退出/替换、native session 切换均使旧绑定不可投递。P0 要求明确 rebind；不使用旧 pane ID alias、同名搜索或 cwd 相似度自动接管。Herdr server restart 后也必须重新验证；无法证明当前 incarnation 连续性则要求 rebind。

### C. 投递安全与可靠性

采用官方 Agent API，禁止 raw pane input。最小支持动作是“提醒当前会话读取 inbox”，不将 terminal prompt 宣称为 Pi 的 native steer/follow_up。P0 遇到 working/blocked/unknown 时保留待通知状态；只在可确认 ready 的目标上开始投递，不自动回答 approval/question。

接入流程可以用 get 做 readiness/preflight，但严格的“不会投给替换会话”需要 Herdr 在同一次输入操作中核对预期 occupant/session，并覆盖延迟 Enter 写入阶段。get→prompt→get 只能观察竞态，不能撤销误投。**这项能力为发布 gate；未证明前不启用自动投递。** 若官方版本不提供该能力，产出有界 upstream requirement 和不可用原因，停止该实施块，不在 repo-harness 里模拟此原子性。

复用现有 effect 幂等与回执机制：一个 started intent 最多执行一次 Host action；没有 receipt 时不能宣称 message delivered。连接失败要区分“确定未发送”与“可能已发送”；后者保留 unknown。确定未开始的 pending intent 可待目标恢复；已经 started 的 intent 不因刷新、重新打开卡片或 server restart 被重复执行。

[ASSUMED] 每个 Binding 最多一个未决 notify effect，其他新消息继续保存在 inbox，当前 effect 正面闭环后才处理下一条。理由：先保证串行因果关系和有界唤醒，不引入批量 ACK、广播或新调度器。没有任意自动重试；未决歧义阻止后续自动唤醒并展示 attention。

### D. 事件与恢复

Herdr 事件仅用于使运行观察失效并触发精确 readback。它们不成为 durable inbox，不驱动消息 ACK 或任务完成。只订阅当前绑定集合需要的状态/拓扑事件，不订阅 transcript/body 来生成回复。

P0 以官方已验证的事件能力为准。若订阅没有 durable cursor，断连重连执行完整的当前绑定 readback，再读取 repo-harness durable messages/effects；不宣称事件无损重放。读事件有缺口时标记 observation stale/unknown，禁止依据旧 ready 状态发送。浏览器关闭不会删除任何持久消息；Host 未运行时不承诺持续唤醒。

控制循环属于现有 Operator Host 生命周期，停止 Host 时关闭订阅与有界等待，不新建常驻 daemon。浏览器仅调用既有受保护的本地 Operator API，不能访问 Herdr socket、传任意 CLI argv 或借 socket 得到全局终端权限。

### E. 卡片中的交流界面

现有 detail pane 增加：当前会话位置/类型、native session 可核对信息、Herdr 运行观察、持久请求与关联回复。会话 ID 不承担消息 ID 功能。

| 展示事实 | 依据 | 不允许推断 |
|---|---|---|
| 已保存/待通知 | inbox event 与 effect 当前状态 | Agent 已读取 |
| 已提交输入 | exact Herdr transport observation | 对应请求已处理 |
| 已投递/已确认 | exact inbox delivery/ACK receipt | 任务完成 |
| 已回复 | 验证通过的 in_reply_to message | 验收通过 |
| working/blocked/idle/done/unknown | Herdr 当前观察 | 卡片状态迁移 |
| 需要核对投递结果 | reconciliation_required | 超时即发送失败 |

保留现有 composer 的唯一业务写入口；发送后清楚区分“消息已保存”与“在线通知不可用”。不为失败换新 message_id 自动补发，不把 UI 本地缓存变成消息历史权威。键盘可访问、焦点不被后台刷新抢走，保留现有 i18n 与错误恢复方式。

## 实施范围与文件理由

一个 work-package 覆盖 Herdr-bound Task 卡片消息往返；分块顺序执行，第一块 capability gate 当前已有不满足证据；待 Herdr 对应能力变化后再验证，未通过前停止其后输入副作用实现。

| 文件范围 | 计划变更/理由 |
|---|---|
| `src/effects/terminal/herdr.ts` 与现有 Herdr adapter | 补官方 identity readback / gated submission，沿用 argv-safe 调用 |
| 新 `src/effects/terminal/herdr-endpoint.ts` | 唯一 descriptor 验证与不可变落盘；binding 注册与投递 resolver 两个真实消费者共用，避免复制身份解释 |
| `src/cli/commands/engineer.ts`、`src/effects/engineers/binding-store.ts` | Herdr bind 入口、descriptor 引用与现有 CAS；不改 Task assignment |
| 现有 runtime-effect core/store/feature | 接线并复用 capability admission、existing journal、receipt；不新增第二种完成语义 |
| `src/effects/fleet/task-message-request.ts`、`task-inbox.ts`、`src/core/fleet/task-message.ts` | 严格关联回复校验；继续保留单一消息 authority |
| `src/effects/operator/server.ts` 与 `task-message-process.ts` | 消息提交之后触发有界 runtime action；只读 conversation projection 使用同一 registry/task 授权 |
| `src/operator-web/App.tsx`、`types.ts` 与现有 locale/style 文件 | 扩展 detail pane 与同一 composer 的 reply 引用；不重建 board |
| 现有 tests 与 architecture 文档/模型、相关 reference-config authoring source | 增量故障覆盖和职责/协议同步；投影文件由工具生成 |

本轮只更新这份 plan artifact，记录批准与 B1 接口需求。实施不增加 npm dependency；Herdr 使用已有外部依赖 pin。descriptor 是新增数据而非新任务 authority，确有注册和投递两个消费者；其他代码先扩展现有文件，不为“未来多 Provider”增加插件框架。若 public schema 必须改变，所有消费者同一工作包更新；旧 active binding 通过显式 retire/rebind 退出，不允许 dual reader 或自动翻译 endpoint。

## 验收与最坏情况

| 场景 | 必须成立 |
|---|---|
| 正常人→Codex/Pi→卡片 | 一个持久请求、匹配的 delivery receipt、关联回复；证明来自真实 harness，fixture 与真实运行分开报告 |
| 同 pane 替换进程/更换 native session | 原子身份 gate 拒绝旧 binding 投递；失败发生在输入副作用之前 |
| 名称复用、pane move、另一 server 有相同 w:p | 不能接管旧 binding，明确 rebind |
| inbox 写入失败 | Herdr 输入调用次数为零 |
| 两个 Host 并发处理同一消息 | durable start admission 只交出一次 action |
| effect_started 后、prompt 前 Host 崩溃 | 允许进入 unknown 并需核对，不为了活性重发 |
| prompt 已写入但 ACK 丢失/CLI 超时 | 不再次 prompt；exact receipt 可闭环，否则 reconciliation_required |
| busy / approval / lifecycle unknown | 不发送输入、不自动回答，消息保持持久 |
| Herdr 订阅断开/Host 重启 | 当前状态重新读取；不拿旧 ready 或漏掉的事件作成功证据 |
| 回复指向不存在/其他 task/旧 revision 请求 | 拒绝；不能挪到最近会话 |
| manual receipt 或其他 effect 回执 | 不满足本 effect success |
| 未启用 runtime / Herdr 不满足能力 | 无 Host action，卡片显示具体限制；不选择其他 transport |
| 所有通信操作 | Task/Lease/Publication/Acceptance 权威无非授权写入 |

最坏情况论证：durable started 先于外部写入，崩溃后禁止重复 action，故避免以 ACK 丢失触发第二次投递；代价是可能出现实际未发送但仍需核对的消息。exact receipt 和 reply linkage 防止把另一轮回复算作本请求结果。至于进程替换窗口，只有 Herdr 原子 fencing 能闭合；普通 readback 不够，因此 capability gate 不可降级。此设计不承诺 exactly-once 模型执行或无条件最终送达。

## Verification Plan（实施时转入 contract JSON）

先复用 `docs/researches/20260909-herdr-runtime-cutover.md` 对已有 fixture 的结论，检查 subject 与变更相关性后再运行新增覆盖；本次写方案不跑模型、不启动实验终端。

实施的 focused commands：

- `bun test tests/unit/r1-agent-runtime-adapters.test.ts tests/unit/r1-provider-neutral-agent-runtime.test.ts`
- `bun test tests/unit/engineer-binding-store.test.ts tests/unit/task-message-v1.test.ts tests/effects/task-inbox.test.ts tests/effects/operator-task-message.test.ts`
- `bun test tests/cli/operator-serve.test.ts tests/operator-web/operator-ui.test.tsx tests/operator-web/operator-interactions.test.tsx`
- `bun test tests/herdr-transport.test.ts`：只在修改相关 adapter / fencing 后运行，对确定性目标注入替换和断连故障。
- 真实 Codex/Pi 往返需要专用、明确授权的测试 pane 和有效 principal；不能向用户正在执行其他工作的 pane 发送测试输入。费用/运行时长先估算，冻结候选后每种 harness 做一次往返；失败最多三轮，遵守 repo 更严格 breaker。
- substantive implementation 依根 Required Checks 执行 hooks/helpers/reference projections、SQL order、architecture/task sync、strict workflow、inspector 与 init dry-run；不凭计划更改运行全量 benchmark。

本次文档交付校验：capture-plan 生成 Draft、检查文档完整性与本地引用、`git diff --check`、确认仅 plan 新增且 runtime policy 未变。没有运行证据就不把任何 acceptance checkbox 标为完成。

## Workflow inventory 与停止条件

规划时 `repo-harness state resolve --json` 为 idle，authoritative_plan/contract 均 null；旧 checks/handoff/resume 为 stale，不能用作本方案验收。方案最初以 Draft、`capture-plan --no-active` 保存；2026-09-16 已记录 Approved，但 B1 外部 gate 未解除，尚未激活实施 contract。

实施时使用生成的同 stem contract/review/notes（本次不创建）。`tasks/todos.md` 继续仅存 deferred goals，active execution checklist 仅在本方案 Task Breakdown。`.ai/harness/checks/latest.json` 与 `.ai/harness/runs/` 是运行证据缓存。未来 contract `allowed_paths` 按上述文件范围冻结；若主目录有并行 WIP，通过 approved plan 的 contract worktree 隔离，不吸收其他改动。

第一块输出的 capability evidence 若否定原子 fencing，则停止自动投递部分，保留正式方案和有界 Herdr 上游需求；不得增加 fallback 或私有协议调用。未发布/未启用不等于实施失败的修补授权。

Rollback：禁用本功能的新 Host action、停止其订阅，保留 messages/receipts/effects；不重放未决输入、不恢复旧 adapter、不停止用户 Herdr server 或 pane。数据结构改变的 rollback 必须先处理非终态记录，不通过旧版本读取新记录。

下一动作：在 Herdr 原子投递能力可用后建立该工作包 contract/worktree，验证 B1，再按以下 checklist 推进；完成后走 `repo-harness-check`。实施批准已记录，不因外部能力等待而重复请求同一批准。外部发布、升级或操作用户 pane 不从此次批准推导。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] B1a：交付具备请求/回执/失败语义及竞态验收表的 Herdr 原子投递接口需求（见下文）；只完成需求，不代表上游能力已交付。
- [ ] B1：解决已证实的 Herdr 0.9.0 原子 occupant/session fencing 缺口；仅在上游能力变更后验证发布 gate，通过前停止后续自动输入实现。
- [ ] B2：实现 Herdr endpoint descriptor、明确 bind/rebind 与现有 Binding CAS，覆盖 pane/session 替换和 server 范围冲突。
- [ ] B3：将现有 Task inbox → runtime intent/start → Herdr → exact receipt 接成单次投递链，覆盖 crash/lost-ACK 和并发 admission。
- [ ] B4：在当前 Operator detail pane/composer 展示会话观察和关联对话，验证 parent message 与 reply principal，保持任务状态权威。
- [ ] B5：冻结候选后完成 focused checks、专用 Codex/Pi canary 和必要 integrity gates，同步权威文档/架构投影，记录未启用/启用边界。


## B1 上游接口需求：Identity-fenced Agent input

### 状态与范围

需求已准备，可供 Herdr 维护者审阅；未发送 GitHub issue、未修改 Herdr、未宣称支持该接口。
2026-09-16 只复核 `herdr status`：client/server 仍为 0.9.0、protocol 22、endpoint generation 1、compatible，无 restart pending。复用 2026-09-14 的 schema 核对，不重跑同版本故障矩阵。

这是一项公开 Agent 输入接口能力：让调用者将“发现时的 Agent 身份”作为“发送时的前置条件”。消息存储、重试调度、语义 ACK、任务完成和 durable event replay 均不属于本上游需求。

### P1：参与者与权威

- Caller：repo-harness Host，持有已授权 Binding 与先前发现的 Herdr target observation。
- Herdr server：拥有目标解析、Agent occupant 识别及向 terminal 写输入的实际副作用。
- Agent：正在该 terminal 中工作的原生 harness；退出、替换、会话切换不得悄悄继承旧输入请求。
- `wN:pN`、live name 是 locator，不是进程实例身份证明。server 颁发的 token 绑定实际 occupant，token 不是授权凭证；现有 socket/session 访问权限仍须校验。

### P2：当前竞态与要求的线性化点

当前可能发生：读取 target A → A 退出或切换 session → 同一 locator 指向 B → `agent.prompt(target, text)` 向 B 写入。
即使随后 get 发现 B，也不能撤销输入。客户端锁、两次读取或不复用 Agent name 不能约束 Herdr 外部发生的所有替换。

要求调用者提交发现时得到的 token，Herdr 在实际开始输入的边界校验，并把这次输入绑定到已校验 occupant。预检查之后不能再次按 name/pane 解析目标。paste 与延迟 Enter 的所有片段都受同一绑定约束。

### P3：建议协议（提案，非现有 API）

由 Herdr 决定最终 method/field 名称。以下 JSON 只表示逻辑契约，不可作为现有 CLI/API 请求发送：

```json
{
  "target": "<Herdr-discovered target>",
  "expected_occupant_token": "<opaque token returned by Herdr discovery>",
  "request_id": "<caller correlation id>",
  "text": "<bounded existing control_ref>"
}
```

1. 发现面：Agent get/snapshot 返回可用于受保护输入的 opaque occupant token 和显式 capability。token 包含的逻辑身份须区分 server incarnation、terminal occupant 及已确认的 native session；实现可使用不可猜测 handle 或服务端映射，客户端不得解析/合成。
2. token 失效：server restart/restore、occupant exit/replacement、native session switch 或无法继续证明同一 occupant 时失效。退出后启动同种 Agent、恢复同一 native session ID、重用相同 name 都不能复活旧 token。
3. 输入面：expected token 为该受保护操作的必需字段；缺失、未知、不匹配、不支持时拒绝。不得静默改成普通 prompt。
4. 原子范围：在绑定仍有效时选择具体输入对象并开始写入；pending write/延迟 Enter 不得在对象替换后重新寻址到新 occupant。native session 的身份变化若只能延迟观察，Herdr 必须说明可证明的范围；不能将终端观测近似称为严格 session fencing。
5. correlation：request_id 仅关联传输回执，不承诺幂等执行，不授予重试权限。repo-harness 继续持有 durable effect intent，未知结果不重发。
6. 成功回执：回显 request_id、已匹配 token、目标 observation，明确含义仅为全部输入已提交到匹配对象；不代表 Agent 启动轮次、读取 inbox 或任务完成。
7. 不增加 durable queue、模型调用或后台任务，只在已有输入边界提供服务端身份约束。事件重放不属于此需求。

### 失败语义

| 发生阶段 | 必需结果 | Caller 行为 |
|---|---|---|
| schema/capability/target/expected-token 检查失败，未开始输入 | 明确 rejected-before-input，零输入副作用 | 保留消息，刷新绑定/能力；不转普通 prompt |
| 目标已 blocked，且未写入 | 明确 rejected-before-input | 展示需处理，不自动回答审批 |
| 已写入任何片段后发现退出/身份变化/写入中断 | partial-or-unknown，不能回报零输入 | 停止后续片段，保留 reconciliation_required |
| 全部片段写入匹配对象，但调用方未收到响应 | Caller 看到 timeout/断连，结果仍未知 | 查 exact inbox receipt，不重发 |
| 全部片段写入且响应返回 | submitted-to-matched-occupant | 等待 repo-harness receipt；不推断任务完成 |

特别区分：服务端可以保证“开始前身份不匹配时零输入”；不能把“开始后进程退出”伪装成零输入失败。后者还必须防止余下 Enter/文本落入替换进程。若当前 PTY 架构无法保证这一点，应如实标为能力未满足，而不是以 token 字段存在充当验收。

### 可复现的验收向量

测试使用 Herdr 所拥有的确定性、可控制前景进程，记录每个 occupant 实际收到的字节；无需模型费用。并发注入点必须由测试屏障控制，不能依赖 sleep 碰运气。

| ID | 时间线/故障注入 | 必须观察到 |
|---|---|---|
| F1 | 发现 A；无身份变化；发送 Unicode 多行文本 | 输入字节与已编码 Enter 只到 A；response token 匹配 |
| F2 | 发现 A；A 退出；同 pane 启动 B；用 A token 发送 | B 收到零字节；rejected-before-input |
| F3 | A/B 类型与 live name 相同，但 occupant 不同 | 仍拒绝旧 token；name 不决定身份 |
| F4 | native session S1 切为 S2，pane/process 外观不变 | 旧 token 无效；S2 不收到旧请求 |
| F5 | server 重启后恢复同 pane/native session ID | 旧 token 无效，不与另一 incarnation 混淆 |
| F6 | 两个 server 都有 w1:p1 或同名 Agent | server A token 不能匹配 server B |
| F7 | 校验后、首字节前替换 occupant | 要么操作在有效 occupant 上先线性化，要么零输入拒绝；不能写给 B |
| F8 | paste 后、延迟 Enter 前 A 退出并出现 B | 不向 B 写剩余字节/Enter；结果 partial-or-unknown |
| F9 | 已写入后丢弃响应 | 调用方结果未知，Herdr 不因此再执行；request_id 不隐含 retry |
| F10 | target move、rename、capability 不支持、缺失 token | 按官方 locator/token 生命周期返回明确结果；不自动普通 prompt |
| F11 | snapshot/get/read 及订阅重连 | 无输入副作用，不因观察触发发送 |

### repo-harness 接收此能力的 gate

上游交付需有：官方 method/schema + capability 声明、token 生命周期说明、F1–F11 的输入字节证据、明确的 pre-write/partial/unknown 分类。仅新增一个 expected 字段不够。

满足后，B1 固定 Herdr release 与 capability 证据；既有 adapter 将 endpoint descriptor 的 token 交给官方受保护接口，并核对返回身份。B2–B5 才继续，输入权威不迁移到 repo-harness。若上游采用等价的原子对象句柄而非上述字段名，可按等价契约验收，不建设双协议 fallback。

### 本轮完成与未完成

已完成：批准记录、B1 上游需求及验收向量、当前版本复核。未完成：Herdr 原子能力、B1 gate 通过、B2–B5 产品实现与真实 harness 验收。
未创建实施 contract/worktree：B1 在副作用实现开始前已被外部能力 gate 阻塞，当前只更新方案。此状态不需要重新批准同一方向；继续条件是 Herdr 公共能力出现可验收变化。
