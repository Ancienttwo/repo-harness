# Fleet 职责盘点：宿主调度与 repo-harness 不变量

评估日期：2026-09-30。范围是 `src/{core,effects}/{fleet,engineers,collaboration,automation,operator}/**/*.ts` 的当前工作树源码；本次只有文档修改，没有启动任何 agent runtime 或验证生产安装。

## 结论

按实际入口与实现分组，147 个 TypeScript 文件合计 **46,008 physical LOC**：**S 调度/dispatch 2,623 行（8 文件），A admission 16,429 行（46 文件），C closeout/recovery/evidence 16,960 行（52 文件），O read model/其他 9,996 行（41 文件）**。四类相加为 46,008；每个文件只计一次。先前约 60k 的说法不能作为本范围的测量值；本次不推断其历史计数口径。

统计解释：**S-primary 2,623 LOC 只是文件主责分类桶的大小，不是调度逻辑的上限。** A-primary 的 `src/core/fleet/task-offer.ts:122` 和 `src/effects/fleet/acquire.ts:562` 仍有 S-secondary；S-primary 文件又混有 A/C。因此不能将它解读为“其余约 94% 全部可以保留”。任何保留或移除结论，都必须有函数级职责与消费者边界的证明。

**将调度交给宿主，不等于移除 fleet/engineers/collaboration 整个目录。** 实际的 S 集中在任务选择、显式 delegated-run、bounded automation controller，以及 campaign worker/runtime/container。它们混合了 A/C；S 的 2,623 行是文件级主责计数，不是已经证明可删除的行数。Operator 启动采集进程/worker thread，Collaboration 计算 reader seats/热点，都不等于派发 LLM agent。

用户已裁定：调度归宿主；repo-harness 保留 workflow authority、admission/closeout、evidence 与 subject-bound acceptance。本报告据此提供移交**候选**及风险顺序，没有作出删除决定。

## P1：系统边界和计数

- [Host Invariants](../reference-configs/host-invariants.md) 是当前上游约束：不新增 scheduler、FleetRuntimeAdapter 或 Pi runtime；不能把 policy/指引升级为机械强制。
- `20260808-repo-harness-in-opencode.md` **第七节**曾建议确定性 scheduler、run state machine/DAG、lease 与统一事件。该 scheduler 建议与用户新裁定不一致；这里仅将其作为历史设计意图，用于区分“选择/启动”与“授权/证据”，不将其重新作为实施权限，也不修改旧报告。
- **S**：代码自身选择要执行的 agent 工作、驱动 dispatch，或实际启动 agent workload。**A**：授权、scope、budget、capacity、claim/lease/currentness。**C**：journal、receipt、终态/恢复/acceptance evidence、投递持久化。**O**：UI/read model、transport DTO、显式 browser authoring 接口、工具辅助/test seam。
- 逐文件按主责归一类；次责写在表中。不做函数级 LOC 拆账，不将 mixed file 的全部代码当作 scheduler。证据是已打开的入口/export 与其关键实现，不是由目录/文件名猜测。
- 包含递归 adapters；排除本范围内的 `AGENTS.md`/`CLAUDE.md`，以及 `src/cli`、`src/operator-web`、`src/effects/state`、`scripts`、tests/assets。边界外文件只用于 caller/path 取证，不进入 LOC。
- LOC 使用 `wc -l`（包括空行与注释）；互斥成员集合与 `rglob('*.ts')` 做了集合相等检查，并重新求和。以下表里的 brace 表示成员展开，每个名字的扩展名都是 `.ts`。

| 范围 | 文件数 | LOC |
|---|---:|---:|
| core/fleet | 5 | 1,355 |
| effects/fleet | 6 | 3,746 |
| core/engineers | 12 | 6,105 |
| effects/engineers（含 adapters） | 25 | 7,782 |
| core/collaboration | 11 | 3,720 |
| effects/collaboration | 14 | 4,557 |
| core/automation | 17 | 4,555 |
| effects/automation | 34 | 9,587 |
| core/operator | 12 | 1,337 |
| effects/operator | 11 | 3,264 |
| 合计 | **147** | **46,008** |

## 分组职责与完整成员

下列每一行都提供职责主类、`wc -l` 合计和源码入口。共享模型、纯 decoder 和通用 stores 的“主责”不意味着所有消费者只使用这一类能力。

| 组 | 完整文件组 | LOC | 类 | 一句话职责及次责 | 源码证据 |
|---|---|---:|---|---|---|
| E1 | `src/effects/engineers/scheduling-acquire-next.ts` | 189 | **S** | 选择当前可接任务，再调用既有 acquisition；次责 A/C | `src/effects/engineers/scheduling-acquire-next.ts:137` |
| E2 | `src/effects/engineers/agent-runtime-adapters/{codex-app-thread,herdr-cli-agent}.ts` | 62 | **S** | 执行宿主 action / Herdr agent prompt；不等于已在生产接通 | `src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts:11`; `src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts:25` |
| E3 | `src/effects/engineers/delegated-run-store.ts` | 1,019 | **S** | dispatch 启动 Codex 子进程；混合 admission、launch claim、receipt/reconcile | `src/effects/engineers/delegated-run-store.ts:889`; `src/effects/engineers/delegated-run-store.ts:927` |
| E4 | `src/core/engineers/{delegation,principal-claim,profile-binding,scheduling,work-demand}.ts` | 2,900 | **A** | 身份/角色与 scope、预算、工作约束及候选 eligibility 的纯契约 | `src/core/engineers/delegation.ts:466`; `src/core/engineers/profile-binding.ts:263` |
| E5 | `src/core/fleet/task-offer.ts` | 251 | **A** | 任务 offer 与 readiness/authority 约束；pure selection 为 S 次责 | `src/core/fleet/task-offer.ts:188`; `src/core/fleet/task-offer.ts:122` |
| E6 | `src/effects/engineers/{acquire,binding-store,bound-task-rotation,claim-actor-store,dependency-authority,principal-store,principal,profile-store,scheduling,scheduling-acquire,task-inbox,work-demand-store,agent-runtime-feature}.ts` | 2,946 | **A** | 绑定/授权/依赖/claim 与 inbox admission；feature flag 实际拒绝非 active action | `src/effects/engineers/acquire.ts:158`; `src/effects/engineers/scheduling-acquire.ts:136`; `src/effects/engineers/task-inbox.ts:23`; `src/effects/engineers/agent-runtime-feature.ts:63` |
| E7 | `src/effects/fleet/acquire.ts` | 1,007 | **A** | offer revalidation→claim→worktree→bound lease→token；内含选择 S 次责，不启动 agent | `src/effects/fleet/acquire.ts:800`; `src/effects/fleet/acquire.ts:876`; `src/effects/fleet/acquire.ts:921` |
| E8 | `src/core/engineers/{agent-runtime-effect,automation-attempt,interface-change,task-freeze,verified-context}.ts` | 2,242 | **C** | effect/attempt/freeze/接口变化与上下文证据的 typed 协议；次责 A | `src/core/engineers/automation-attempt.ts:82`; `src/core/engineers/task-freeze.ts:214` |
| E9 | `src/core/fleet/{task-reply,task-message}.ts` | 697 | **C** | task message/reply 与 delivery/consumption receipts 状态协议 | `src/core/fleet/task-reply.ts:255`; `src/core/fleet/task-message.ts:387` |
| E10 | `src/effects/engineers/{agent-runtime-effect-store,automation-attempt-store,interface-change-store,module-inbox,task-freeze-store,verified-context-store,work-demand-materialization}.ts` | 3,280 | **C** | 不可变 effect/attempt/上下文记录、消息投递、freeze 和 materialization 回执；混合 A | `src/effects/engineers/agent-runtime-effect-store.ts:885`; `src/effects/engineers/module-inbox.ts:746` |
| E11 | `src/effects/fleet/{task-inbox-layout-migration,task-inbox}.ts` | 1,800 | **C** | task message delivery/ACK/reply 持久化及显式布局迁移 | `src/effects/fleet/task-inbox.ts:1290`; `src/effects/fleet/task-inbox-layout-migration.ts:359` |
| E12 | `src/core/engineers/{engineering-overlay,module-message}.ts` | 963 | **O** | 工程师 read model 与模块消息 transport/schema；消息证据为次责 | `src/core/engineers/engineering-overlay.ts:439`; `src/core/engineers/module-message.ts:503` |
| E13 | `src/core/fleet/{board,task-inbox-layout}.ts` | 407 | **O** | board 投影与 inbox 布局常量 | `src/core/fleet/board.ts:355`; `src/core/fleet/task-inbox-layout.ts:9` |
| E14 | `src/effects/engineers/engineering-overlay.ts` | 286 | **O** | 聚合工程师/绑定/证据的 read model | `src/effects/engineers/engineering-overlay.ts:245` |
| E15 | `src/effects/fleet/{board,task-inbox-layout,task-message-request}.ts` | 939 | **O** | 看板采集与 operator 消息入口；不派发 agent | `src/effects/fleet/task-message-request.ts:165`; `src/effects/fleet/board.ts:623` |
| T1 | `src/effects/automation/controller-run.ts` | 261 | **S** | 有界 step loop，调用 acquireNext/dispatch；混合预算和 receipts | `src/effects/automation/controller-run.ts:181`; `src/effects/automation/controller-run.ts:245` |
| T2 | `src/effects/automation/{campaign-worker,campaign-runtime,campaign-container}.ts` | 1,092 | **S** | worker/verifier invocation 与 Docker namespace 启动；混合 A/C 安全与终态记录 | `src/effects/automation/campaign-worker.ts:108`; `src/effects/automation/campaign-runtime.ts:89`; `src/effects/automation/campaign-container.ts:162` |
| T3 | `src/core/automation/{budget,campaign-authoring-budget,campaign-containment,campaign-planning,connector-challenge,development-campaign,issue-batch-adoption,issue-batch}.ts` | 3,048 | **A** | 预算/授权/containment/parent 与已验证输入契约；混合 C | `src/core/automation/budget.ts:2003`; `src/core/automation/campaign-containment.ts:147`; `src/core/automation/issue-batch-adoption.ts:56` |
| T4 | `src/effects/automation/{budget-store,campaign-acquisition,campaign-authoring-resume,campaign-capacity,campaign-planning-proof,campaign-planning,campaign-protection,campaign-revision-admission,development-campaign-policy,grant-store,campaign-provider-execution}.ts` | 4,277 | **A** | 存储 grant/budget、scope/capacity/currentness，预留 provider 预算；次责 C | `src/effects/automation/campaign-provider-execution.ts:14`; `src/effects/automation/campaign-revision-admission.ts:14`; `src/effects/automation/grant-store.ts:206` |
| T5 | `src/core/automation/{campaign-closeout,campaign-fresh-audit,campaign-revision-evidence,controller,issue-batch-reconcile,campaign-browser-session,campaign-runtime,campaign-revision-observation}.ts` | 1,292 | **C** | closeout/observation/controller event/terminal receipt 验证与归并；不是执行器 | `src/core/automation/campaign-closeout.ts:130`; `src/core/automation/campaign-browser-session.ts:104`; `src/core/automation/campaign-runtime.ts:89` |
| T6 | `src/effects/automation/{campaign-closeout-provider,campaign-closeout,campaign-fresh-audit,campaign-not-planned,campaign-planning-store,campaign-recovery,campaign-revision-observation,campaign-step,controller-store,development-campaign-store,issue-batch-observer,issue-batch-publication,issue-batch-shadow-adoption,issue-batch-store,issue-batch-adoption}.ts` | 3,450 | **C** | closeout/recovery、provider observation与 issue mutation journal/publication；混合 A，browser/API 调用不是 worker scheduler | `src/effects/automation/campaign-step.ts:398`; `src/effects/automation/campaign-recovery.ts:24`; `src/effects/automation/issue-batch-store.ts:235` |
| T7 | `src/core/automation/projection.ts` | 215 | **O** | budget/controller board projection | `src/core/automation/projection.ts:155` |
| T8 | `src/effects/automation/{campaign-capability-registry,clock,gpt-pro-issue-authoring,budget-store.internal}.ts` | 507 | **O** | 能力目录/时钟/test seam 与显式 browser authoring transport；authoring 次责 A/C | `src/effects/automation/gpt-pro-issue-authoring.ts:306`; `src/effects/automation/budget-store.internal.ts:1`; `src/effects/automation/clock.ts:86` |
| L1 | `src/core/collaboration/{admission,run-binding}.ts` | 508 | **A** | reader seat 和 dispatch binding 校验；并不派发 agent | `src/core/collaboration/admission.ts:241`; `src/core/collaboration/run-binding.ts:233` |
| L2 | `src/effects/collaboration/{actor,admission-bridge,feature-flag,succession,context-delivery}.ts` | 1,492 | **A** | 主体/reader capacity/feature/successor claim/context fence；混合 C | `src/effects/collaboration/actor.ts:155`; `src/effects/collaboration/admission-bridge.ts:347`; `src/effects/collaboration/context-delivery.ts:436` |
| L3 | `src/core/collaboration/{adoption,common,contribution,handoff,signal}.ts` | 1,544 | **C** | 信号/交接/采纳/贡献的 canonical record 和 digest 协议；混合 A 校验 | `src/core/collaboration/contribution.ts:436`; `src/core/collaboration/handoff.ts:372` |
| L4 | `src/effects/collaboration/{adoption-store,agent-surface,contribution-collector,contribution-store,handoff-store,provider-output-adapter,record-store,signal-store}.ts` | 2,655 | **C** | 记录存储、贡献收集、persisted provider output 解析；agent surface 次责 O/A | `src/effects/collaboration/contribution-collector.ts:159`; `src/effects/collaboration/provider-output-adapter.ts:265`; `src/effects/collaboration/record-store.ts:462` |
| L5 | `src/core/collaboration/{context-packet,hotspot,thread-projection,work-exchange}.ts` | 1,668 | **O** | 上下文选择/热点/线程与工作交换投影；context budget 为次责 A | `src/core/collaboration/thread-projection.ts:232`; `src/core/collaboration/context-packet.ts:400` |
| L6 | `src/effects/collaboration/work-exchange.ts` | 410 | **O** | 双读采集协作 snapshot，不拥有执行权 | `src/effects/collaboration/work-exchange.ts:300` |
| P1 | `src/core/operator/{automation-summary,collaboration-snapshot,decision-inventory,fleet-snapshot,observation-identity,organization-snapshot,planning-snapshot,repository-snapshot,task-activity,task-context,task-diff,task-history}.ts` | 1,337 | **O** | operator 投影/解码/身份与分页 DTO | `src/core/operator/task-context.ts:95`; `src/core/operator/repository-snapshot.ts:30` |
| P2 | `src/effects/operator/{automation-summary,collaboration,task-activity,task-context,task-diff,task-history}.ts` | 703 | **O** | 读取 domain stores/Git，为 UI 返回 scoped observation | `src/effects/operator/task-context.ts:13`; `src/effects/operator/task-history.ts:20` |
| P3 | `src/effects/operator/{fleet-collector-process,collaboration-worker,task-message-process,task-read-process}.ts` | 303 | **O** | 采集/消息 helper process 与 worker thread，不是 LLM agent；消息次责 C/A | `src/effects/operator/fleet-collector-process.ts:113`; `src/effects/operator/task-message-process.ts:49`; `src/effects/operator/collaboration-worker.ts:44` |
| P4 | `src/effects/operator/server.ts` | 2,258 | **O** | loopback HTTP/read observation supervision/static assets；唯一 POST task message 次责 A/C | `src/effects/operator/server.ts:125`; `src/effects/operator/server.ts:1445` |

### 边界判断

- A 主责的 `core/fleet/task-offer` 也有纯选择 helper，`effects/fleet/acquire` 的未指定任务入口也会选 offer（`src/core/fleet/task-offer.ts:122`、`src/effects/fleet/acquire.ts:562`）。这些是 **S 次责**，已标在表中；因此 S 主责 LOC 既不是全部选择逻辑的函数级总量，也不是独立可移除量。候选 3 必须同时追踪这一 seam。

- `scheduling-acquire-next` 的 `offers.find` 决定下一任务，是 **S**；`scheduling-acquire` 对调用者已选 offer 加锁、复核并 acquire，是 **A**。不能因为二者都叫 scheduling 就一并删除。
- `delegated-run-store` 是 **S** 主责，因为 dispatch 实际 `runProcess`；但同文件先持久化 launch claim，后落盘 process receipt、WorkerRunRef/result，并把未知结果转成 reconciliation。移交只能针对启动责任，不能一并拿走 A/C。
- `campaign-container` 同样包含 **S**：`runCampaignContainer` 的 `docker start --attach` 启动 workload（`src/effects/automation/campaign-container.ts:162`、`src/effects/automation/campaign-container.ts:183`）。它也验证 containment、deadline、不可重启 marker、namespace inactivity 和 terminal receipt；容器/收据不是可随调度删除的装饰。
- `campaign-provider-execution` 包装 GitHub leaf operation 的 budget reservation/settlement，因此归 **A**，不是 agent dispatcher（`src/effects/automation/campaign-provider-execution.ts:14`）。`campaign-step` 选择 issue authoring/API mutation 并记录结果；归 **C**，不是 worker scheduler。
- `gpt-pro-issue-authoring` 与 audit/revision observation 的 browser callback 是显式 provider authoring/取证工作流，归 O 或 C；不是 worker fan-out。它仍会进行 LLM/browser 调用，不能把 O 解读为“无副作用”（`src/effects/automation/gpt-pro-issue-authoring.ts:306`、`src/effects/automation/gpt-pro-issue-authoring.ts:360`）。
- `agent-runtime-feature` 的 `assertAgentRuntimeActionEnabled` 真正拒绝非 active/未启用 adapter，是 **A**（`src/effects/engineers/agent-runtime-feature.ts:63`）。test-only clock seam 则归 O。
- Collaboration 的 `admitInsideWindow` 在 reader window lock 内调用 admission 与 `prepareDelegatedRun` 创建 seat；它未启动进程（`src/effects/collaboration/admission-bridge.ts:347`、`src/effects/collaboration/admission-bridge.ts:385`）。`fenceCollaborationDispatch` 是 A，contribution collection 是 C。
- Operator server 的完整 route inventory 只有 task-message POST 可写；它调度的是数据采集 helper，不是 agent 工作。故归 O，消息入口保留 A/C 次责（`src/effects/operator/server.ts:125`）。

## P2：实际路径

这是一条源码支持的任务执行协议路径；其中 acquire 与 inbox 之间、inbox 与 closeout 之间是**宿主显式动作**，不是一个函数自动串接的调用链。本次没有运行这条路径。

| 步骤 | 输入/转换与实际边界 | 类 | 证据 |
|---|---|---|---|
| 1. host 调用 engineer acquire-next | CLI 解析 authorization 与 filters，解析 principal，将参数交给 selector。它不是 host wake timer。 | O → S | `src/cli/commands/engineer.ts:345`; `src/effects/engineers/scheduling-acquire-next.ts:137` |
| 2. 选择一个 eligible offer | selector 读取 current offers、按 filters 选择；在有界 retry 内调用既有 acquisition，落幂等结果。 | **S**（次责 A/C） | `src/effects/engineers/scheduling-acquire-next.ts:166`; `src/effects/engineers/scheduling-acquire-next.ts:171` |
| 3. 工程师 admission | scheduled-acquire 复核 caller assertion/concurrency；engineer acquire 复核 Binding/repo read-write，然后调用 Fleet。 | A | `src/effects/engineers/scheduling-acquire.ts:136`; `src/effects/engineers/acquire.ts:158` |
| 4. claim 与 lease | Fleet 复核 offer/authority 后调用 `claimSprintCommand`；共享 per-task lock 选出 owner，写 lease。竞态失败按预算重读，不释放他人 claim。 | A | `src/effects/fleet/acquire.ts:800`; `src/effects/state/coordination-sprint.ts:276`; `src/effects/state/coordination-sprint.ts:310` |
| 5. worktree 与 bound envelope | 创建/验证 worktree topology，bind lease，写 claim token；再次检查 registry revision 与 bound lease 后才返回 WorkEnvelope。失败只补偿本次 claim，rollback failure 显式返回。 | A（token 为 C 次责） | `src/effects/fleet/acquire.ts:846`; `src/effects/fleet/acquire.ts:876`; `src/effects/fleet/acquire.ts:888`; `src/effects/fleet/acquire.ts:921` |
| 6. ClaimActor 证据 | Engineer 将当前身份/Binding 绑定到 claim 并 live-validate，失败尝试释放自己的 claim并报告残余 worktree。 | A/C | `src/effects/engineers/acquire.ts:123` |
| 7. host 执行任务并访问 inbox | acquire 没有调用 inbox。后续 MCP 请求必须携带原 WorkEnvelope；OAuth、Binding、registry revision、claim actor 与 live envelope 在锁内重复验证，之后才读/ACK/consume/reply。 | A → C | `src/cli/mcp/engineer-tools.ts:674`; `src/effects/engineers/task-inbox.ts:24` |
| 8. host 选择 native child 或显式 managed dispatch | native child 的调度归宿主。本仓库仍有 controller/delegation 的显式执行路径：controller 调 `dispatchDelegatedRun`，后者验证 capability/role/protected snapshot，写 launch claim，再阻塞等待子进程。 | **S** + A/C | `src/effects/automation/controller-run.ts:245`; `src/effects/engineers/delegated-run-store.ts:908`; `src/effects/engineers/delegated-run-store.ts:927` |
| 9. 结果取证与 acceptance | managed dispatch 把 stdout/stderr、process receipt 与 terminal observations 落盘；任务完成由 host 调 gate，验证 subject/contract/evidence，不能只看进程 exit。 | C | `src/effects/engineers/delegated-run-store.ts:940`; `scripts/acceptance-receipt.ts:415`; `scripts/verify-sprint.sh:1211` |
| 10. 显式 closeout/recovery | host 在 linked worktree 调 finish/ship。closeout claim/journal 阻止并行/中断重入；external effect 已落地时显式 reconcile。此跳不由 inbox 或 acquire 自动调用。 | C（ownership 为 A 次责） | `scripts/contract-worktree.sh:1867`; `scripts/ship-worktrees.sh:1539` |

强依赖是 Task/Lease/Binding/registry authority、subject/evidence 与 closeout journal。UI snapshot、session/process 观察、browser output 是投影或证据，不能升为 Task 权威。多数 acquisition 是同步调用与锁边界；delegated `runProcess` 等待进程结果，campaign runtime/container 是 async 外部 effect；host 下一次 inbox/finish 调用另开边界。

## 每个 S 组的消费者与移除后果

生产 caller 搜索覆盖 `src`、`scripts` 和 `assets` 的 TypeScript，并结合 CodeGraph；测试 caller 单列。动态模块路径与仓库外消费者不由这个结果穷尽，标为 **[unverified]**。以下均是取证范围内的结果，不是删除许可。

| S 组 | 已找到的消费者 | 移除将破坏什么 / 未知点 |
|---|---|---|
| E1 selector（189 LOC） | engineer CLI `src/cli/commands/engineer.ts:348`；MCP `src/cli/mcp/engineer-tools.ts:568`；controller wrapper `src/effects/automation/controller-run.ts:88`；campaign acquisition `src/effects/automation/campaign-acquisition.ts:74`。 | acquire-next/API 与 controller/campaign 选择入口失效。host 可接选择责任，但需要继续提交当前 offer assertions并保留 admission/幂等保护；等价 host 接口 **[unverified]**。 |
| E2 adapters（62 LOC） | 搜索没有找到 `src/scripts/assets` 的生产执行函数 caller；测试 `tests/unit/r1-agent-runtime-adapters.test.ts:24`、`tests/herdr-transport.test.ts:43`、`tests/unit/issue-281-task-offer-wake.test.ts:679`。 | 删除会破坏这些测试和 adapter implementation。仓库外/动态 caller是否存在 **[unverified]**；“没有静态 caller”不等于已经可删。effect intent/receipt CLI 存在，不能连带移除。 |
| E3 delegated-run（1,019 LOC） | delegation CLI `src/cli/commands/delegation.ts:158`；controller `src/effects/automation/controller-run.ts:93`；canary runner `scripts/c9-collaboration-dispatch-runner.ts:16`。同模块 `prepare/read/collect` 又被 Collaboration admission/context/output/collector 使用。 | dispatch、controller 和真实 canary 会断；整文件移除还会破坏 Collaboration seat、context binding、process receipt 和 result collection。只移交启动动作时的 receipt/unknown-result等价语义 **[unverified]**。 |
| T1 controller-run（261 LOC） | automation CLI `src/cli/commands/automation.ts:237`。它自身调用 E1/E3，写 controller/budget/attempt evidence。 | `automation controller step` 的有界 acquire/dispatch失效；host loop 需要保持单 unit、budget reserve、attempt 和 reconciliation。宿主等价执行契约 **[unverified]**。 |
| T2 campaign worker/runtime/container（1,092 LOC） | `scripts/contract-run.ts:710`、`scripts/contract-run.ts:897`；对应生成 helper `assets/templates/helpers/contract-run.ts:710`、`assets/templates/helpers/contract-run.ts:897`；内部 runtime 调 container `src/effects/automation/campaign-runtime.ts:91`；preflight helper `scripts/run-campaign-preflight.ts:29`、`scripts/run-campaign-preflight.ts:32`。worker also imports runtime recovery/observation。 | campaign worker/verifier 的准备、contained launch、preflight、取消/超时/终态 proof 都会断。container 不是普通 transport 替换；目标 host 能否提供 namespace inactivity、不可重放和可信 terminal receipt **[unverified]**。 |

## P3：候选与建议顺序

这些是**候选**，按“先证明最小边界，再碰混合高风险路径”排序。

1. **候选 1：确认 E2 adapter 的真实消费与运行状态（62 LOC，低修改体量、中兼容风险）。** 静态调用者只有测试，先核实部署/外部调用及 active effect 用户，再由设计者决定保留、文档化或移交。先不改 A/C effect stores。该切片足以回答“是否有真实 consumer”，不是全域调度重构。
2. **候选 2：移交 T1 的有界 controller 驱动（261 LOC，高行为风险）。** 入口是 `stepAutomationController`，有一个明确 CLI consumer；先冻结 host tick输入/结果与 budget/attempt/reconcile 所需证据，再实现宿主对应驱动。禁止把 loop 和 controller-store 一并删掉。
3. **候选 3：E1 offer 选择责任（189 LOC，中高风险）。** 宿主选择候选，repo-harness验证当前 assertion并 acquire；须覆盖 stale offer、binding rotation、capacity 与 claim race。E1 被多个入口消费，所以排在单入口 T1 后；先证明原 A 接口完整保留。
4. **候选 4：E3 仅移交 launch 责任（整文件 1,019 LOC，高风险）。** 先列 intent→launch claim→process receipt→result 的外部 host conformance，特别是“effect 已发生但 receipt未写”的 unknown状态；A/C 仍归 repo-harness。不能拿整文件LOC当收益。
5. **候选 5：T2 contained worker/verifier dispatch（1,092 LOC，最高风险）。** 要求宿主提供等价 containment/independent deadline/namespace termination proof，再讨论实际替换。缺等价证据前保留现有安全与恢复边界。

10 倍规模下，首先需要证明的是 offer collection/selection、锁等待和 reader/capacity窗口的成本，以及多 runtime 未知终态的 reconciliation，不是文件行数。当前没有相应性能实测；以上顺序不能据此宣称性能收益。

## 不确定性与交付边界

- 未分类文件组：**0**；147 文件的主责集合已覆盖且互斥。分组判断是源码入口/export 层面的静态职责盘点，不是逐行移除证明。
- **[unverified]**：仓库外/动态 adapter callers、目标宿主对每个 S 候选的等价控制与证据、mixed file 内部能独立移交的函数/LOC、运行时/性能表现。不能将这些未知据为删除依据。
- 浏览器 authoring/O、operator message transport/O 有真实副作用，分类 O 不授予执行或放宽授权。
- 同名 core/effects `campaign-runtime` 不同责：core 只归并 outcome；effects 负责执行。保留一份权威并避免 shadow parser/compatibility alias，具体拆分由设计者决定。
- 本次新增这一个 research 文件用于持久保存计数/路径/候选；Part A 只修改 host-invariants 引用。无代码、依赖、抽象、plan/tasks/其他研究修改。已知 architecture dead-letter 不在范围内。


## 候选 1 核实结果

### 结论

**TEST_ONLY**。这是当前仓库执行入口与调用者范围内的结论：E2 两个实现合计 62 physical LOC，已找到的执行函数调用者都在三个测试文件；没有找到非测试 CLI/MCP、scripts 或 assets/templates 路径直接、动态或按 `adapter_kind` 分派调用它们。不能将该结论外推为“任何已安装宿主都没有外部消费者”，也不据此决定删除。

E2 目前实现的是 `notify_inbox` / `wake_for_offer` 定向控制动作，而不是完整的 agent scheduler：Codex adapter 调用调用者注入的 invoker（`src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts:5`、`src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts:16`）；Herdr adapter 发出 `herdr agent prompt`（`src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts:4`、`src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts:25`）。

### P1：查找范围与所有调用者

查找覆盖当前 `src`（含 CLI/MCP/operator）、`scripts`、`assets`（含 templates）和 tests，使用 `rg -a -uuu` 避免 ignore/二进制检测遗漏；另查 package entry、repo hook/config。CodeGraph 的两函数 caller 结果与 rg 一致：Herdr 为三个测试文件，Codex 为两个测试文件。

| 表面 | 核实结果 | 证据 |
|---|---|---|
| E2 自身 | 两个 export 的定义；没有读 repo policy 或注册生产 dispatcher。Codex 需要显式注入 invoker，Herdr 需要 endpoint resolver。 | `src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts:11`; `src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts:7` |
| 普通 import / alias / re-export | 在非测试代码中搜索文件目录、两执行函数名，只命中这两个定义。未发现引用这两个模块的 barrel/alias。 | 下方 rg 命令及其两条输出；CodeGraph 两函数 caller 结果 |
| 动态 import / require / 路径拼接 | 搜索 adapter 路径/函数名及 adapter 相关 import/require/resolve/join；没有找到 E2 动态 loader。scripts/templates 的动态 runtime imports 指向其他模块，不指向这两个实现。 | 下方查找命令；CLI start 最终只 emit action（`src/cli/commands/engineer.ts:544`、`src/cli/commands/engineer.ts:549`） |
| `adapter_kind` 字符串 | effect-store 中用于 provider/fence/observation/capability 选择与验证，不是 adapter 实现分派；`initialAdapter` 仅创建 unknown observation。 | `src/effects/engineers/agent-runtime-effect-store.ts:199`; `src/effects/engineers/agent-runtime-effect-store.ts:210` |
| CLI | capability、prepare/wake、start、observe/reconcile 管理记录和 action；start 调 store 后打印 HostAction，没有执行 adapter。 | `src/cli/commands/engineer.ts:538`; `src/cli/commands/engineer.ts:549`; `src/cli/commands/engineer.ts:567` |
| MCP | runtime 表面只有 capability/status 读取；没有 start/execute mutation，不能补上 adapter 调用缺口。 | `src/cli/mcp/engineer-tools.ts:321`; `src/cli/mcp/engineer-tools.ts:331`; `src/cli/mcp/engineer-tools.ts:726`; `src/cli/mcp/engineer-tools.ts:735` |
| Test caller 1 | R1 unit tests import 两个实现，注入 invoker/spawn 验证控制引用、安全 argv、结果分类。 | `tests/unit/r1-agent-runtime-adapters.test.ts:4`; `tests/unit/r1-agent-runtime-adapters.test.ts:24`; `tests/unit/r1-agent-runtime-adapters.test.ts:49` |
| Test caller 2 | task-offer wake tests import 两个实现；测试自己把 start 返回的 action 交给 Codex adapter，随后自己调用 ordinary acquisition。这条连接是测试搭的。 | `tests/unit/issue-281-task-offer-wake.test.ts:37`; `tests/unit/issue-281-task-offer-wake.test.ts:713`; `tests/unit/issue-281-task-offer-wake.test.ts:714` |
| Test caller 3 | Herdr transport test import Herdr adapter，在隔离 Herdr fixture 中实际发送控制引用并读回；真实进程测试仍是测试消费者。 | `tests/herdr-transport.test.ts:9`; `tests/herdr-transport.test.ts:43` |

核心 negative search（输出只有定义，不包括测试）：

```bash
rg -n -a -uuu 'agent-runtime-adapters|executeCodexAppThreadAction|executeHerdrCliAgentAction' src scripts assets --glob '!*.md'
```

```text
src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts:7:export function executeHerdrCliAgentAction(
src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts:11:export function executeCodexAppThreadAction(...)
```

补充搜索：同样的模式加 `tests` 查所有 import/call；对 `adapter_kind`、`adapters[`、adapter 相关动态 `import/require/resolve/join` 命中做源码核对。搜索阴性只约束该仓库，没有证明所有仓库外动态调用均不存在。

### P2：feature gate、adoption 与 enabled 路径

1. **缺失配置的默认值**：`readAgentRuntimePolicy` 在没有 policy 或没有 `agent_runtime` 时返回 mode off、两个 enabled false（`src/effects/engineers/agent-runtime-feature.ts:19`、`src/effects/engineers/agent-runtime-feature.ts:28`）。
2. **prepare 与 action 分级**：prepare 要求 mode 非 off；action 要求 mode active 且选定 adapter enabled true（`src/effects/engineers/agent-runtime-feature.ts:57`、`src/effects/engineers/agent-runtime-feature.ts:63`）。这门控的是 store 的 action admission，不是 E2 函数自身：两 adapter 没有 repoRoot/policy 参数，也没调用该 gate；直接调用 adapter 不会自动检查 policy。
3. **standard adoption**：`standard-plan.ts:358` 是 `defaultPolicy` 的 Codex adapter disabled 默认值，紧邻 mode off 与 Herdr disabled（`src/core/adoption/standard-plan.ts:355`）。它不是一个强制关闭所有已有配置的 migration：planner 读取已有 policy，并递归合并默认值，显式已有值覆盖默认（`src/core/adoption/standard-plan.ts:258`、`src/core/adoption/standard-plan.ts:792`）；standard 分支生成 policy write operation（`src/core/adoption/standard-plan.ts:855`、`src/core/adoption/standard-plan.ts:859`）。这里没有 adapter installation/dispatch 接线。当前仓库 policy 本身仍 off/false（`.ai/harness/policy.json:257`）。
4. **将配置设为 enabled 后的最远路径**（静态 trace，没有改配置或执行）：
   - CLI `engineer runtime-effect start` → `startAgentRuntimeEffect`（`src/cli/commands/engineer.ts:544`）。
   - store 检查 intent/current、active/enabled、capability、Binding/authorization 与 wake 当前性；持久化 `effect_started`，重复验证 fences（`src/effects/engineers/agent-runtime-effect-store.ts:327`、`src/effects/engineers/agent-runtime-effect-store.ts:335`）。
   - store 返回 `buildAgentRuntimeHostAction(intent)`；core builder 只构造 action/control digest，没有执行（`src/effects/engineers/agent-runtime-effect-store.ts:345`、`src/core/engineers/agent-runtime-effect.ts:369`）。
   - CLI `emit` action 到输出，函数结束（`src/cli/commands/engineer.ts:549`）。**此处没有到 E2 adapter 的生产调用边。** 后续 observe 从操作者传入的 adapter observation 记录结果（`src/cli/commands/engineer.ts:556`、`src/cli/commands/engineer.ts:567`）；记录接口不是执行器。
   - MCP capability/status 分支直接读 store，路径更早结束（`src/cli/mcp/engineer-tools.ts:731`、`src/cli/mcp/engineer-tools.ts:742`）。

因此，不能解释成“只是默认 disabled，enable 后现有生产路径就会自动调用 E2”。确实有 gated HostAction 记录路径，但它不调用这两个实现。测试的显式 action→adapter 连接不能冒充生产接线。

### P3：历史意图与移除风险

本地 `git log --follow` 与 `git show` 核实的历史：

| 日期（+08:00） | Commit / 本地 PR 标题 | 可确认的意图 |
|---|---|---|
| 2026-08-31 | `4f7cb37e` — `feat(runtime): R1 provider-neutral agent runtime effect (#230)` | 引入 Codex App Thread adapter 和当时的 tmux adapter，替换旧 provider-thread effect，为 Host action 建立 provider-neutral admission/evidence 边界；提交中的 Codex 实现也依赖 injected invoker。 |
| 2026-09-04 | `ab6cc8a0` — `feat(runtime): add durable task-offer wake effects (#297)` | 两 adapter 扩展 `notify_inbox` / `wake_for_offer` 的闭合 operations；新增 wake/offer/receipt 与测试。不是把测试调用接到生产 dispatcher 的证据。 |
| 2026-09-09 | `d8c082b1` — `feat: replace tmux runtime dependency with herdr` | 添加当前 41 行 Herdr 实现、移除 tmux 实现，更新 policy/adoption、transport 与测试。它支持定向 Herdr prompt，没有新增当前搜索可见的 E2 生产 caller。 |

命令分别为 `git log --follow --format='%h %ad %s' --date=short -- <adapter-path>`；Codex 路径给出 #230/#297，Herdr 路径给出 cutover commit，另对已删除的 tmux 路径执行 follow 后得到其 #230/#297 前史。标题来自本地 Git，不声称当前远端 PR/部署状态。

如果直接移除 E2，三个测试文件的静态 import 会失效；Codex/Herdr 控制引用、未知结果分类与真实 Herdr fixture 接受验证也会失去覆盖。这里只作源码判断，未运行测试，没有把“可以删”作为决定。

剩余 **[unverified]**：已安装包被仓库外代码直接 import、宿主自行消费 HostAction 后调用 E2 的接线，以及真实部署中这些外部调用是否存在。本次未扫描用户全局安装/HOME 或远端机器，也未启用 policy/发送 E2 action。保留/移交/移除由设计者基于该边界继续裁定；不连带移除 agent-runtime-effect-store、CLI action 契约、capability 或 receipt authority。

## E1 函数级边界证明

### 结论

**PARTIALLY_SEPARABLE**。host 可以从 repo-harness 的当前 Engineer offers 中挑一个，再通过现有 `engineer_acquire` MCP 提交完整 assertion；`acquireScheduledEngineerTask` 和更下层的 Binding、capacity、claim/lease admission 都会重新验证所选对象，未要求先运行 E1 才能授予 claim（`src/cli/mcp/engineer-tools.ts:539`、`src/effects/engineers/scheduling-acquire.ts:124`）。

但“四个 acquire-next 入口全部移出选择、行为不变”尚不成立：CLI/controller/campaign 输入没有完整 caller-choice 通道；E1 同时拥有幂等 pending/completed receipt、观察时间、capacity scan/retry，campaign manifest 限定与 success 前 callback 又依赖这条 wrapper。以下 GAP 是接口/协议责任缺口，不表示当前 assertion admission 缺少 stale offer、Binding、capacity 或 claim race 的检查；不据此决定删除。

### 全部函数与消费者

使用已有 TypeScript 6 compiler API 的 AST（邻接 arch-context 安装内现成 compiler，未安装依赖、未写脚本）检查三个文件：N 16、F 9、E 47，合计 **72 个带 body 的 function-like 节点**，包括 constructor、具名 closure、dependency arrow 和匿名 callback。只有函数签名的 type/interface 不计；`resolveFleetOffers = collectFleetOffers` 是 alias，不是另一函数。

- **N** = `src/effects/engineers/scheduling-acquire-next.ts`（189 physical LOC）。
- **F** = `src/core/fleet/task-offer.ts`（251 physical LOC）。
- **E** = `src/effects/fleet/acquire.ts`（1,007 physical LOC）。
- 位置 `N:56-58` 等按上述完整路径解析；函数 LOC 为从声明/arrow开始至末尾的物理行数，含签名和 body。嵌套函数与父函数 span 重叠，**不得相加当独立可删除 LOC**。
- 本节遵照 packet 只用 S/A/C：纯 digest、不可变/read-model 数据封装、错误输出归 C 的证据/投影支撑；readiness/proof/currentness 的只读校验归 A；这些辅助函数不因此变成 scheduler。
- caller 来自 CodeGraph + rg，并以 AST 的直接调用/具名 import 别名核对。下面“值引用/port”与真实调用分开标注；private helper 的测试列写“无直接”，不等于其公共路径没有测试。

| 函数（含 closure/callback） | 文件:行 | LOC | 类 | 理由 | 生产调用者 | 测试调用者 |
|---|---|---:|---|---|---|---|
| `digest` | `N:56-58` | 3 | C | 请求/回执 digest，未选任务 | buildReceipt@102，readReceipt@109，acquireNextScheduledEngineerTask@145 | 无直接；经所属公共路径间接 |
| `validateOptions` | `N:60-74` | 15 | A | 校验封闭 filters 与重试上限 | acquireNextScheduledEngineerTask@138 | 无直接；经所属公共路径间接 |
| `callback@67（validateOptions）` | `N:67-67` | 1 | A | 拒绝未知 filter 字段 | validateOptions 的 keys.some | 无直接；经所属公共路径间接 |
| `callback@68（validateOptions）` | `N:68-68` | 1 | A | 验证 task_ids 形状 | validateOptions 的 task_ids.some | 无直接；经所属公共路径间接 |
| `assertion` | `N:76-86` | 11 | A | 投影所选 offer 的完整 revision fence | callback@171 | 无直接；经所属公共路径间接 |
| `receiptPath` | `N:88-91` | 4 | C | 定位幂等回执 | callback@147 | 无直接；经所属公共路径间接 |
| `writeReceipt` | `N:93-98` | 6 | C | 原子写 pending/completed 回执 | callback@156，callback@186 | 无直接；经所属公共路径间接 |
| `buildReceipt` | `N:100-103` | 4 | C | 封装回执与摘要 | callback@156，callback@186 | 无直接；经所属公共路径间接 |
| `readReceipt` | `N:105-114` | 10 | C | 校验回执后重放 | callback@149 | 无直接；经所属公共路径间接 |
| `eligible` | `N:116-120` | 5 | S | 选择策略 predicate：capability/priority/task_ids | callback@166 | 无直接；经所属公共路径间接 |
| `selectionMayBeRetried` | `N:122-129` | 8 | S | 决定是否重做选择；不授予 claim | callback@183 | 无直接；经所属公共路径间接 |
| `campaignCapacityBlocked` | `N:131-135` | 5 | A | 识别 capacity admission 拒绝 | callback@172 | 无直接；经所属公共路径间接 |
| `acquireNextScheduledEngineerTask` | `N:137-189` | 53 | S/A/C | find 选择 + A 调用 + 幂等/补偿回执 | `src/cli/commands/engineer.ts:348`；`src/effects/automation/controller-run.ts:89`；`src/effects/automation/campaign-acquisition.ts:74`（值引用/port）；`src/cli/mcp/engineer-tools.ts:568` | `tests/effects/campaign-acquisition.test.ts`；`tests/unit/issue-280-acquire-next.test.ts` |
| `withLock` | `N:142-142` | 1 | C/A | 为同一 request key 串行回执事务 | acquireNextScheduledEngineerTask 的 deps.withLock@146 | 无直接；经所属公共路径间接 |
| `callback@146（acquireNextScheduledEngineerTask）` | `N:146-188` | 43 | S/A/C | 锁内 replay、选择、admit 与结果记录 | acquireNextScheduledEngineerTask 的 deps.withLock | 无直接；经所属公共路径间接 |
| `callback@166（callback@146）` | `N:166-166` | 1 | S | first eligible 且未被 capacity scan 排除 | 锁内 offers.find | 无直接；经所属公共路径间接 |
| `selectExecutionReadyOffer` | `F:122-131` | 10 | S | 无 caller task 时取首个 ready/stable offer | `src/effects/fleet/acquire.ts:562` | 无直接；经所属公共路径间接 |
| `callback@126（selectExecutionReadyOffer）` | `F:126-130` | 5 | S | 首个 ready/stable/repo 匹配 predicate | selectExecutionReadyOffer 的 offers.find | 无直接；经所属公共路径间接 |
| `blocker` | `F:152-154` | 3 | A | readiness 拒绝原因投影 | uniqueBlockers@162 | 无直接；经所属公共路径间接 |
| `uniqueBlockers` | `F:156-165` | 10 | A | 去重 readiness 拒绝原因 | classifyTaskOffer@213，classifyTaskOffer@220，classifyTaskOffer@227，classifyTaskOffer@233 | 无直接；经所属公共路径间接 |
| `planFailureBlocker` | `F:167-180` | 14 | A | 将 plan 错误映射成封闭 blockers | classifyTaskOffer@202 | 无直接；经所属公共路径间接 |
| `classifyTaskOffer` | `F:188-235` | 48 | A | 只判 readiness，不选某个任务 | `src/effects/fleet/acquire.ts:155` | `tests/characterization/repair-campaign-authority-freeze.test.ts`；`tests/unit/fleet-offer-acquire.test.ts` |
| `taskOfferRevision` | `F:238-241` | 4 | C | 生成可比对 offer revision | `src/effects/fleet/acquire.ts:169`；`src/effects/fleet/acquire.ts:286` | `tests/characterization/repair-campaign-authority-freeze.test.ts`；`tests/unit/fleet-offer-acquire.test.ts` |
| `freezeTaskOffer` | `F:244-251` | 8 | C | 冻结 evidence/projection 数据，不挑任务 | `src/effects/fleet/acquire.ts:184` | `tests/characterization/repair-campaign-authority-freeze.test.ts` |
| `callback@247（freezeTaskOffer）` | `F:247-247` | 1 | C | 冻结 blocker projection | freezeTaskOffer 的 blockers.map | 无直接；经所属公共路径间接 |
| `FleetOffersError.constructor` | `E:85-91` | 7 | C | 构造取证失败的 typed diagnostic | collectRepoTaskOffers new@223；collectFleetOffers new@279 | 无直接；经所属公共路径间接 |
| `planFailureCode` | `E:113-124` | 12 | A | 映射 plan proof 失败 | buildTaskOffer@165 | 无直接；经所属公共路径间接 |
| `planProof` | `E:126-135` | 10 | A | 保留 canonical plan/contract proof | buildTaskOffer@154 | 无直接；经所属公共路径间接 |
| `rowOrder` | `E:137-140` | 4 | C | 保留 canonical row ordering projection | buildTaskOffer@168 | 无直接；经所属公共路径间接 |
| `blockerRevision` | `E:142-144` | 3 | C | 将 blocker 事实纳入 revision | buildTaskOffer@177 | 无直接；经所属公共路径间接 |
| `callback@143（blockerRevision）` | `E:143-143` | 1 | C | blocker revision input | blockerRevision 的 map | 无直接；经所属公共路径间接 |
| `buildTaskOffer` | `E:146-200` | 55 | A/C | 由 canonical facts 判 readiness 并封存 offer | callback@246 | 无直接；经所属公共路径间接 |
| `collectRepoTaskOffers` | `E:207-254` | 48 | A/C | 读一个 repo 的 canonical/plan/campaign authority，返回全部或已指定 task | callback@275；`src/effects/operator/collaboration.ts:164`；`src/effects/operator/task-context.ts:22`；`src/effects/fleet/board.ts:403`；`src/effects/automation/campaign-planning.ts:104` | `tests/effects/issue-batch-publication.test.ts`；`tests/effects/campaign-planning.test.ts`；`tests/unit/fleet-acquire-effect.test.ts` |
| `callback@227（collectRepoTaskOffers）` | `E:227-247` | 21 | A/C | task_id 过滤仅收集指定 task；读取 proof，不替 caller 选 task | collectRepoTaskOffers 的 flatMap | 无直接；经所属公共路径间接 |
| `offerSort` | `E:256-262` | 7 | C | canonical projection 顺序；本函数不选择执行任务 | collectFleetOffers 的 sort comparator@282 | 无直接；经所属公共路径间接 |
| `collectFleetOffers` | `E:265-299` | 35 | A/C | 汇总 offer事实/稳定顺序；本函数不 acquire | acquisitionDependencies 的 collectOffers port@462 → acquireFleetTask@779 / revalidateOffer@615；`src/cli/commands/fleet.ts:734`；`src/cli/mcp/fleet-tools.ts:322`；`src/effects/engineers/scheduling.ts:114`（值引用/port）；`src/effects/engineers/scheduling.ts:349`（值引用/port） | `tests/unit/fleet-acquire-effect.test.ts` |
| `callback@271（collectFleetOffers）` | `E:271-271` | 1 | A | 限定 caller repo scope | collectFleetOffers 的 repos.filter | 无直接；经所属公共路径间接 |
| `callback@272（collectFleetOffers）` | `E:272-272` | 1 | C | 排序 repo projection | collectFleetOffers 的 repos.sort | 无直接；经所属公共路径间接 |
| `callback@273（collectFleetOffers）` | `E:273-281` | 9 | A/C | 逐 repo 读取 offers | collectFleetOffers 的 repos.flatMap | 无直接；经所属公共路径间接 |
| `callback@284（collectFleetOffers）` | `E:284-284` | 1 | A | 汇总 snapshot consistency | collectFleetOffers 的 offers.some | 无直接；经所属公共路径间接 |
| `callback@289（collectFleetOffers）` | `E:289-289` | 1 | C | offer revisions 输入 | collectFleetOffers 的 offers.flatMap | 无直接；经所属公共路径间接 |
| `failure` | `E:418-426` | 9 | C | 返回 typed failure | selectOffer@549，selectOffer@559，selectOffer@563，selectOffer@566，revalidateOffer@609，revalidateOffer@613，revalidateOffer@621，revalidateClaimAuthority@665，revalidateClaimAuthority@668，revalidateClaimAuthority@677，revalidateClaimAuthority@691，revalidateClaimAuthority@703，revalidateClaimAuthority@709，compensate@751，compensate@752，acquireFleetTask@785，acquireFleetTask@789，claimCurrentOffer@798，acquireFleetTask@815，acquireFleetTask@821，acquireFleetTask@823，acquireFleetTask@831，acquireFleetTask@838，acquireFleetTask@841，acquireFleetTask@937 | 无直接；经所属公共路径间接 |
| `defaultStart` | `E:428-440` | 13 | A | 调用 --fresh worktree provision，不选任务 | acquisitionDependencies 的 start port → acquireFleetTask deps.start@846 | 无直接；经所属公共路径间接 |
| `defaultPreflight` | `E:442-446` | 5 | A | 已选 contract preflight | acquisitionDependencies preflight port → claimCurrentOffer@796 / acquireFleetTask@871 | 无直接；经所属公共路径间接 |
| `defaultProject` | `E:448-458` | 11 | A | 激活已选 plan 到 execution worktree | acquisitionDependencies project port → acquireFleetTask@910 | 无直接；经所属公共路径间接 |
| `acquisitionDependencies` | `E:460-481` | 22 | A/C | 组装既有 owner ports，未挑任务 | acquireFleetTask@769，validateWorkEnvelopeAuthority@953，resumeReclaimedFleetWork@967 | 无直接；经所属公共路径间接 |
| `parseStartResult` | `E:483-511` | 29 | A | 拒绝非 fresh/错误 worktree receipt | defaultStart@439 | 无直接；经所属公共路径间接 |
| `commandMessage` | `E:513-515` | 3 | C | 格式化 owner helper diagnostics | compensate@752，acquireFleetTask@831，acquireFleetTask@883，resumeReclaimedFleetWork@996 | 无直接；经所属公共路径间接 |
| `readCommandRecord` | `E:517-530` | 14 | A | 校验 claim owner 输出身份形状 | acquireFleetTask@836 | 无直接；经所属公共路径间接 |
| `requestedRepoId` | `E:532-538` | 7 | A | 拒绝冲突 repo assertions | selectOffer@546，collectOptions@577 | 无直接；经所属公共路径间接 |
| `selectOffer` | `E:544-569` | 26 | S/A | 无 task assertion 才挑首项；有 assertion 只匹配并校验 | acquireFleetTask@781 | 无直接；经所属公共路径间接 |
| `callback@554（selectOffer）` | `E:554-557` | 4 | A | 只匹配 caller 已指定 task/repo | selectOffer 的 offers.find（指定 task） | 无直接；经所属公共路径间接 |
| `collectOptions` | `E:571-583` | 13 | A | 保持 repo/time与registry scope | revalidateOffer@615，acquireFleetTask@779 | 无直接；经所属公共路径间接 |
| `registeredWritableRepo` | `E:585-594` | 10 | A | 校验 registry/read_write/path | revalidateOffer@611，revalidateClaimAuthority@664，acquireFleetTask@787，acquireFleetTask@925，validateWorkEnvelopeAuthority@955，resumeReclaimedFleetWork@970 | 无直接；经所属公共路径间接 |
| `callback@590（registeredWritableRepo）` | `E:590-590` | 1 | A | 查 registered repo | registeredWritableRepo 的 repos.find | 无直接；经所属公共路径间接 |
| `revalidateOffer` | `E:601-624` | 24 | A | claim 前复核同一 offer | claimCurrentOffer@793 | 无直接；经所属公共路径间接 |
| `callback@616（revalidateOffer）` | `E:616-618` | 3 | A | 查同一 task/repo 最新 offer | revalidateOffer 的 fresh.offers.find | 无直接；经所属公共路径间接 |
| `topologyMatches` | `E:626-636` | 11 | A | 匹配 provisioned topology | acquireFleetTask@855，acquireFleetTask@923，resumeReclaimedFleetWork@978，resumeReclaimedFleetWork@1004 | 无直接；经所属公共路径间接 |
| `callback@630（topologyMatches）` | `E:630-635` | 6 | A | 匹配 execution topology | topologyMatches 的 worktrees.some | 无直接；经所属公共路径间接 |
| `samePlanProof` | `E:638-644` | 7 | A | 比对精确 plan/contract proof | revalidateClaimAuthority@700 | 无直接；经所属公共路径间接 |
| `revalidateClaimAuthority` | `E:655-711` | 57 | A | claim 后复核独立 authority，不重新挑任务 | acquireFleetTask@862，acquireFleetTask@903，validateWorkEnvelopeAuthority@957，resumeReclaimedFleetWork@975，resumeReclaimedFleetWork@1002 | 无直接；经所属公共路径间接 |
| `envelope` | `E:713-740` | 28 | C | 返回绑定的 WorkEnvelope | acquireFleetTask@934 | 无直接；经所属公共路径间接 |
| `compensate` | `E:743-753` | 11 | C/A | 仅释放本次 own claim，报告失败 | acquireFleetTask@851，acquireFleetTask@856，acquireFleetTask@859，acquireFleetTask@865，acquireFleetTask@873，acquireFleetTask@883，acquireFleetTask@897，acquireFleetTask@906，acquireFleetTask@912，acquireFleetTask@919，acquireFleetTask@932 | 无直接；经所属公共路径间接 |
| `validateAttempts` | `E:755-761` | 7 | A | 限制 claim race attempts | acquireFleetTask@770 | 无直接；经所属公共路径间接 |
| `acquireFleetTask` | `E:768-938` | 171 | S/A/C | fallback选择或 assertion匹配后 claim/provision/bind，含补偿 | `src/cli/commands/fleet.ts:780`；`src/cli/mcp/fleet-tools.ts:392`；`src/effects/engineers/acquire.ts:59`（值引用/port） | `tests/characterization/repair-campaign-authority-freeze.test.ts`；`tests/fleet-acquire-concurrency.test.ts` |
| `callback@781（acquireFleetTask）` | `E:781-781` | 1 | S | fallback scan 排除 capacity-full候选 | acquireFleetTask 的 offers.filter | 无直接；经所属公共路径间接 |
| `claimCurrentOffer` | `E:792-808` | 17 | A | capacity lock 内复核并 claim 已选 task | acquireFleetTask 的 capacity port@811（回调） | 无直接；经所属公共路径间接 |
| `validateFleetWorkEnvelope` | `E:941-943` | 3 | A | 验证原 acquisition authority | `src/effects/automation/campaign-worker.ts:126`；`src/effects/automation/campaign-worker.ts:337`；`src/effects/automation/campaign-acquisition.ts:92` | `tests/helpers/historical-campaign-lifecycle.ts`；`tests/effects/task-reply.test.ts`；`tests/effects/campaign-acquisition.test.ts` |
| `validateFleetCommunicationEnvelope` | `E:948-950` | 3 | A | 验证通信所需 authority | `src/effects/engineers/task-inbox.ts:54` | 无直接；经所属公共路径间接 |
| `validateWorkEnvelopeAuthority` | `E:952-959` | 8 | A | 重读 repo/Task/Plan authority | validateFleetWorkEnvelope@942，validateFleetCommunicationEnvelope@949 | 无直接；经所属公共路径间接 |
| `resumeReclaimedFleetWork` | `E:962-1007` | 46 | C/A | 恢复 caller 指定旧 envelope 的下一 lease generation | `src/effects/engineers/acquire.ts:183` | 无直接；经所属公共路径间接 |
| `checkOwner` | `E:979-989` | 11 | A | 恢复时验证精确 lease owner | resumeReclaimedFleetWork@990，resumeReclaimedFleetWork@1005 | 无直接；经所属公共路径间接 |

`resolveFleetOffers` 在 `src/effects/fleet/acquire.ts:302` 只是已有函数 alias，搜索没有额外生产调用。以上 tests 列表示静态调用/函数值使用链，未运行这些测试，也未宣称行覆盖率；不存在直接 test caller 的 validators 可被其他 tested owner paths 间接触达。

#### 精确的 PICK 与 MATCH

- `N.eligible` 只判断 host/调用者给出的选择 filters。`N.acquireNextScheduledEngineerTask` 在 `src/effects/engineers/scheduling-acquire-next.ts:166` 才实际 PICK 第一个候选；它不再排序。上游 offer document 过滤 eligible 并按 priority/eligible_since/work_package 排序，是当前默认选择的输入（`src/core/engineers/scheduling.ts:803`）。
- `F.selectExecutionReadyOffer` 在 `src/core/fleet/task-offer.ts:126` PICK 第一个 ready/stable/repo匹配 offer。
- `E.selectOffer` 分支不同：`task_id` 存在时在 `src/effects/fleet/acquire.ts:553` MATCH 此 id 并验证 ready/stable/revision；缺失时在 `src/effects/fleet/acquire.ts:562` 才调用 PICK。同一个函数不可整体视为只做选择。
- `E.revalidateOffer` 的 find（`src/effects/fleet/acquire.ts:616`）和 `selectCurrentOffer` 的 find（`src/effects/engineers/scheduling-acquire.ts:131`）都是 MATCH 已声明的 task/work_package，不能改为另一个更“合适”的任务。
- N 的 capacity scan 会剔除 capacity-full 项并继续挑；E 的 scan 只在未声明 task_id 时这样做。明确 task_id 的 capacity 拒绝直接返回，不能偷偷换任务（`src/effects/fleet/acquire.ts:813`、`src/effects/fleet/acquire.ts:820`）。

### 四个入口的 host 输入与边界

**共同的 caller-choice 输入**不是一个裸 offer id。Engineer 层必须从可信的当前 offers 中保留以下 13 字段：

```text
offer_revision, work_package_id, work_package_revision, work_graph_revision,
task_id, task_revision, dependency_revision, concurrency_revision,
binding_id, binding_generation, engineer_contract_revision,
fleet_offer_revision, authorization_revision
```

这些字段在 `src/effects/engineers/scheduling-acquire.ts:28` 定义，在 `src/effects/engineers/scheduling-acquire-next.ts:76` 从 offer投影；`matchesAssertion` 全字段比对（`src/effects/engineers/scheduling-acquire.ts:108`）。host 不得合成 revision。root/principal 仍由认证/registered repo 派生，不能由所选 offer覆盖；选择 filters 属于 host 策略，但 campaign task_ids 还承担授权任务集合限定。

| 入口 | 当前输入 | 移交 PICK 后必须提供/保留 | 当前 API 与 GAP |
|---|---|---|---|
| Engineer CLI acquire-next | authorization_id、idempotency_key、capability/minimum_priority、max_selection_attempts。 | 认证后的 principal/root、上述完整 assertion；host负责 filters 与挑哪个当前 offer，并保留 request key/retry protocol。 | `src/cli/commands/engineer.ts:330` 只收 filters，不收 assertion。本文件没有 direct Engineer selected-acquire CLI route；**GAP-1**：当前该 CLI不能承载此移交，不能用 fleet CLI冒充完整 Engineer admission。 |
| Engineer MCP acquire_next | 认证 principal、key、capability/minimum_priority、selection attempts。 | 通过现有 `engineer_acquire` 提交完整 assertion；principal 来自 OAuth binding，host应用 filters。 | `src/cli/mcp/engineer-tools.ts:563` 是 selector入口；`src/cli/mcp/engineer-tools.ts:530` 的 direct acquire已收13字段。A 可原样复用；**GAP-2**：direct acquire没有 E1 request-key replay protocol，不能声称完整 acquire_next 重试行为不变。 |
| controller-run wrapper | root、observed principal、derived request key、attempt limit；controller在 acquire前 reserve budget。 | full assertion、host选择结果与持续稳定的请求身份；保留 controller reservation/event、lease/liveness、attempt与未知结果处理。 | `StepAutomationControllerInput` 没有 filters/assertion（`src/effects/automation/controller-run.ts:27`）；wrapper仍调用 E1（`src/effects/automation/controller-run.ts:88`），step在 :202 调用 acquireNext。**GAP-1/2**：替换只读选择算法不等于现有 controller已经有输入接线；A 不能被 controller自己重写。 |
| campaign-acquisition | campaign/group/intent、授权 parent/session、authorization_id、idempotency_key；manifest slots变成 task_ids；budgetedAcquisition包装effect。 | full assertion，并验证其 task_id属于**本次 intent manifest**；保留预算/key、success前 validateHandoff/own-claim补偿，再创建worker handoff。 | `src/effects/automation/campaign-acquisition.ts:100` 由 E1 eligible执行task_ids限制。**GAP-3/4**：若仅调用 direct scheduled acquire，caller的 campaign manifest集合与 accept_acquired protocol没有自动迁移；普通 task admission通过不等于该 campaign允许取得它。 |

### Admission 的现成复核与 GAP 审计

| 条件 | caller-chosen路径已有检查 | 是否依赖 E1 先运行 |
|---|---|---|
| Offer/Task/graph/依赖/concurrency stale | `selectCurrentOffer` 重采 offers、MATCH work_package并比对13字段；随后在 concurrency lock内再做一次（`src/effects/engineers/scheduling-acquire.ts:124`、`src/effects/engineers/scheduling-acquire.ts:142`）。Fleet对同一task/repo复核offer_revision/ready/stable（`src/effects/fleet/acquire.ts:601`）。 | **不依赖**。host选定的 assertion 足以触发既有复核；错误不会改选其他 task。 |
| Binding rotation / repo授权 | collectEngineerOffers复核principal profile/current Binding（`src/effects/engineers/scheduling.ts:341`）；engineer acquire持Binding锁再校验active/id/generation/contract/repo realpath/read_write（`src/effects/engineers/acquire.ts:75`、`src/effects/engineers/acquire.ts:158`）。 | **不依赖**。MCP principal仍由认证派生（`src/cli/mcp/engineer-tools.ts:510`）。 |
| Campaign capacity | Fleet在 per-campaign lock内调用 `withCampaignCapacity`：核验membership/current authority、计算现有 leases、unknown拒绝、满额不claim（`src/effects/fleet/acquire.ts:811`、`src/effects/automation/campaign-capacity.ts:24`）。 | **不依赖**。E1只决定收到满额拒绝后是否换候选；capacity门控不会因为移出选择消失。 |
| Claim race | claim带 expected task revision，Task lock/lease目录选owner；败选bounded retry，没有owned lease可释放（`src/effects/fleet/acquire.ts:800`、`src/effects/fleet/acquire.ts:827`；`src/effects/state/coordination-sprint.ts:310`）。 | **不依赖**。E1 的跨候选 stale/claim-result重选策略可归host，但不能删底层claim锁。 |
| Claim后 authority / handoff | claim后读取 registry/canonical Task/Plan/campaign proof，不因自己的lease改变重新挑offer（`src/effects/fleet/acquire.ts:655`）；worktree/bind/token后final lease fence（`src/effects/fleet/acquire.ts:921`），Engineer存 ClaimActor并livevalidate（`src/effects/engineers/acquire.ts:123`）。 | **不依赖**。结果只能是精确 envelope或显式失败/compensation。 |
| 请求幂等与未知 side effect | N先write pending；同key不同request拒绝，pending需要reconciliation；completed重放；无候选删除receipt而不缓存idle（`src/effects/engineers/scheduling-acquire-next.ts:145`、`src/effects/engineers/scheduling-acquire-next.ts:156`、`src/effects/engineers/scheduling-acquire-next.ts:167`、`src/effects/engineers/scheduling-acquire-next.ts:185`）。 | **GAP-2**：这是C，不是PICK。direct acquire不接此 key；全wrapper移除会丢失这些语义。相同Task的claim互斥不等于同request的result可重放。 |
| 调用者 filters / 本次 campaign manifest | 一般priority/capability/task_ids filter由N.eligible执行（`src/effects/engineers/scheduling-acquire-next.ts:116`）。Campaign task_ids来自当前manifest；其validateHandoff只检查principal/ClaimActor/envelope/campaign active，没有再次用本次manifest作显式 task_ids集合检查（`src/effects/automation/campaign-acquisition.ts:86`、`src/effects/automation/campaign-acquisition.ts:100`）。 | **GAP-3**：当前真实路径正确地依赖selector执行caller给出的集合；host移出选择时必须保留集合门控，不能认为普通task/capacity admission替代它。此项是迁移缺口，未报告当前实现漏洞。 |
| success前 campaign callback及budget | E1只对新鲜成功调用accept_acquired，然后才写completion；campaign验证handoff并在失败时释放自己精确claim，budgetedAcquisition先留admission后留结果（`src/effects/engineers/scheduling-acquire-next.ts:185`；`src/effects/automation/campaign-acquisition.ts:28`、`src/effects/automation/campaign-acquisition.ts:101`）。 | **GAP-4**：host post-hoc检查不能替代success记账前callback/compensation次序。保留原budget和receipt owner。 |
| 时间索引 / retry eligibility | E1固定observedAt，并传给selection与scheduled revalidation（`src/effects/engineers/scheduling-acquire-next.ts:157`、`src/effects/engineers/scheduling-acquire-next.ts:171`）。direct函数的offer_options可传now_ms，但13字段不含它；collector按它读取retry eligibility（`src/effects/engineers/scheduling-acquire.ts:76`、`src/effects/engineers/scheduling.ts:360`）。 | **GAP-5**：若要求同一selection/revalidation时点的原行为，调用协议尚未把该时间带到四入口。默认重新读当前时间仍fail closed，不等于安全门被绕过，但不能声称行为字节等价。 |

**GAP-1** 是三入口的 caller-choice 输入/接线；**GAP-2** 是 request receipt与未知结果；**GAP-3** 是选择filters中的campaign任务集合；**GAP-4** 是handoff callback/预算顺序；**GAP-5** 是原观察时点协议。没有从源码证明“stale/binding/capacity/claim race只由selector强制”的缺口。

### 未指定 Task 的 Fleet 路径仍是生产功能

`effects/fleet/acquire.ts:562` 可被 E1 以外入口到达：

- Fleet CLI的 `--task-id` 是 optional；传入assertion时没有它就省略task_id（`src/cli/commands/fleet.ts:780`、`src/cli/commands/fleet.ts:787`）。
- Fleet MCP的 `task_id` 同样optional，缺失时仍带authorization_revision而不带task_id（`src/cli/mcp/fleet-tools.ts:383`、`src/cli/mcp/fleet-tools.ts:397`）。
- 二者都能进 `selectOffer` fallback首项选择及capacity-full换候选。删除F selector而不处理这两个消费者，会直接改变已存在的Fleet API行为；不是E1私有实现细节。
- Engineer scheduled路径明确携task_id（`src/effects/engineers/scheduling-acquire.ts:148`），不会进此fallback。更下层export `acquireEngineerTask` 的 assertion类型仍optional（`src/effects/engineers/acquire.ts:46`），但本次找到的正常scheduled production调用会填满它；仓库外直接调用或自定义port属于 **[unverified]**。

### 证明限度与候选边界

可迁移的纯选择点是N的filters/find/reselection以及F的首eligible helper；MATCH与revision checks、shared collection authority、request receipts、capacity/claim/Binding锁、callback/预算次序必须仍归repo-harness或其明确的原owner。不能把完整N或E函数的LOC当移除收益。

现成MCP selected-acquire证明“host选、repo-harness admit”已有一条实现路径；其余入口要先闭合上述GAP再讨论移交。仅将host想选的Task放进内部 `filters.task_ids: [id]` 仍会让E1重新采集并生成当前assertion，也未保留host所选快照的13字段；这不等价于caller-fenced选择，且CLI/MCP acquire_next目前未暴露该filter。

**[unverified]**：外部host最终picker实现、四入口协议改造后的可用性/回归行为、动态/仓库外调用，以及并发/性能实测。本次只追加文档，没有执行acquire/claim、改API、写代码、删除函数或决定删除。
