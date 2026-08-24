# Persistent Module Engineer：以 Repo 为记忆、以 Session 为运行绑定的工程组织

> **Status**: Architecture Accepted with Required Revisions
> **Document Type**: Umbrella Research / Architecture Brief
> **Implementation Authority**: None
> **Amendment (2026-08-24)**: Engineer Binding 的 current authority 是 ME-0A 定义的共享 `<git-common-dir>/repo-harness/engineers/v1/` store。任何下文中的 worktree-local binding path 都已被取代；实施必须以对应 child PRD 的 closed schema、依赖和 approval state 为准。
> **External Review (2026-08-24)**: GPT Git Connector 对 `d29ecce2` 的裁决为 `Request Changes`：umbrella 继续 Approved，12 个 child 全部保持 Draft。完整裁决归档于 `tasks/reviews/20260824-1949-persistent-module-engineer-gpt-review.review.md`；ME-0A 只有在 closed event/current publication protocol 再获外部批准后才成为首个实施切片。
> **Focused Re-review (2026-08-24)**: GPT GitHub Connector 对 `b54a43d8` 的裁决为 `Approve`：umbrella 保持 Approved，ME-0A 的 closed、幂等、crash-consistent event/current publication protocol 通过外部 gate，ME-0A 成为当前唯一 implementation-ready child；其余 child 继续保持 Draft。完整裁决归档于 `tasks/reviews/20260824-2050-persistent-module-engineer-me0a-approval.review.md`。

## 结论

GPT 建议的主方向成立，而且比“一个总控 Agent 不断生成临时 Worker”更接近可持续的软件工程组织：

> 持久化模块工程师这个逻辑岗位；Session 只是岗位当前的一次运行绑定；Subagent 是父任务内部的一次性 Worker。

但不能原样落地。建议中有五处必须按 repo-harness 现有 authority model 修正：

1. 不新增 `ModuleGraphV1` 或 `engineering/modules/` 作为第二套模块真相；`.archcontext/model/nodes/*.yaml` 已经是 capability/module boundary 的 source of truth。
2. Module Profile 的 `owned_paths` 只能用于 routing，不能授予写权限；每次写权限仍由 canonical Contract、Lease、WorkEnvelope 与 Delegation grant 的交集决定。
3. 不创建 Task、Module、Interface、Human 四套各自演化的 inbox；应先抽象一个 typed subject/audience coordination-message core，再投影不同收件箱视图。
4. Provider-native messaging 不是 durable inbox 的 fallback authority。Durable event 必须先写；native message 只是可选 delivery accelerator。Provider 不可用时保持 `pending` 并显式暴露 attention，不能静默切换语义。
5. `SessionTransport` 与 Worker/Subagent runtime 必须分开。Thread create/read/send/observe 是持久岗位的 transport；native `spawn_agent` / Claude subagent 是临时执行器，正式 Gatekeeper 则属于独立 Acceptance Plane。

二次架构评审又补出了五个必须冻结的 enforcement 边界：

6. `EngineerBindingV1` 一旦决定谁能执行 engineer-scoped mutation，就不是普通 cache；它必须位于 git-common-dir coordination plane，以 per-engineer lock、binding ID、generation 和 profile revision 做 CAS。
7. Session 不能自报 `engineer_id` 取得权限；`EngineerPrincipalV1` 必须由 authenticated MCP connection、Worker Host connection 或 Provider adapter 在 server side 派生。
8. Engineer 与现有 Claim 的关系通过不可变 `ClaimActorReceiptV1` 记录，避免再次扩展 Lease schema；它不进入 task identity，也不替代 Lease。
9. 第一版不承诺 active bound dirty task 的透明 Session 迁移。没有 frozen handoff receipt 时，rotation 只能被建议，mutation handoff 必须阻塞。
10. one-writer 约束必须覆盖 Parent Engineer 与所有 Worker；writer slot 是 worktree actor lock，不是“最多一个 writable Subagent”的提示词规则。

因此推荐的稳定关系是：

```text
ArchContext Capability (module authority)
  -> ModuleEngineerProfile (stable role contract)
  -> EngineerBinding generation (replaceable Codex/Claude session)
  -> canonical Task Claim (Lease authority)
  -> DelegationEnvelope (bounded child execution under the parent claim)
  -> WorkerResult (evidence, never acceptance)
  -> independent AcceptanceReceipt
```

本研究基于 `main@75f50b909d50`，输入是 2026-08-24 用户提供的 GPT 架构建议。外部材料只用于确认 Provider 能力；repo 文件、Lease、Contract、Git 与 typed evidence 才是本项目事实来源。

## 外部能力复核

### Claude Agent Teams

Anthropic 官方文档确认：Agent Teams 由一个 lead session 和多个独立 context window 的 teammate 构成；支持 shared task list 和 agent-to-agent messaging，与“Subagent 在单一 Session 内执行并回传结果”是两种不同的组织模型。

但它不能直接作为 repo-harness 的持久工程组织 authority：

- Agent Teams 仍是 experimental，默认关闭；
- 官方列出 session resumption、task coordination 和 shutdown 限制；
- in-process teammates 不会随 `/resume` 恢复；
- 两个 teammate 修改同一文件会发生覆盖；
- teammate 初始继承 lead permission mode，不能在 spawn 时为每个 teammate 独立设置 permission mode；
- shared task list 是 Provider 本地协调设施，不是 repo-harness canonical task。

这些事实支持“持久逻辑岗位 + 可替换 Session”的设计，而不是“永不结束的 Agent Team”。

来源：[Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams)。页面在本次复核中标示最后更新于 2026-08-21。

### Codex App Server / Desktop Thread

OpenAI 官方 App Server 文档确认：

- 使用双向 JSON-RPC；
- 支持 `thread/start`、`thread/resume`、`thread/fork`；
- 支持 `thread/read`、`thread/list`、`thread/archive`；
- thread history 可从持久日志读取，archive 会移动 persisted thread log；
- turn/item/thread 状态通过事件流报告；
- context compaction 是可观察事件。

当前 Codex Desktop 运行时还向 Agent 暴露了 thread create/list/read/wait/send/pin/archive 等工具。这足以做人工或 controller-session canary，但不等于 repo-harness CLI 进程天然拥有这些工具；完整自动化仍需要明确的 Codex App Server adapter 或本地 Worker Host。

GPT 输入引用的 OpenAI 博客页面在本环境直接读取时返回 403，因此本研究不依赖该博客措辞，改用官方 [Codex App Server 文档](https://developers.openai.com/codex/app-server/) 验证对应能力。

### SOP 与 Provider Memory

Anthropic 官方文档确认：`CLAUDE.md` 是每次 Session 注入的持久指导，auto memory 是 Claude 自己维护的 notes；二者都占用 context。官方同时明确区分：settings/permissions/sandbox 是客户端执行的 hard enforcement，而 `CLAUDE.md` 只影响模型行为，不是强制边界。

这直接支持以下规则：

> SOP 可以塑造工程师行为；Memory 可以帮助检索；两者都不能授权写路径、Lease、takeover、waiver、acceptance 或 merge。

来源：[Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory)。

## P1：当前 repo-harness 架构边界

### 已有确定性控制面

Fleet 的 core/effects/CLI/MCP 主体目前约 4,563 行，已经提供：

- `FleetBoardSnapshotV1` 与 task offer projection；
- 只对 `execution_ready` offer 执行的 `fleet acquire`；
- task revision、authorization revision、plan/contract proof 重验；
- per-task Lease election 与 generation fencing；
- contract worktree provisioning、bind 与 claim token；
- `WorkEnvelopeV1`；
- Task Inbox 的 immutable event、delivery receipt、ack、supersede；
- publication identity、readiness、feedback、takeover、recovery；
- repo-owned explorer、reasoner、root-cause-prover、worker、gatekeeper、harness-evaluator personas。

`WorkEnvelopeV1` 明确只是 capability snapshot，不是第二个 Lease authority；它包含 task/claim/generation/worktree/plan proof/authorization 等字段（`src/effects/fleet/acquire.ts:297-322`）。Acquire 在返回前会重新检查 registry、canonical task、plan proof、Git topology 和 bound Lease（`src/effects/fleet/acquire.ts:741-870`）。

Task Inbox 当前严格绑定 `task_id` 和 `task_revision`，recipient 只支持 claim、orchestrator、user；claim recipient 以 `claim_id + generation` fencing（`src/core/fleet/task-message.ts:21-66`）。消息被标记为 untrusted peer data，不得成为 workflow authority（`src/core/fleet/task-message.ts:13-15`）。

Capability authority 已由 `.archcontext/model/nodes/*.yaml` 提供。节点包含 responsibility、source include、entrypoint、contract files、LSP profile 与 verification hints；最长前缀 resolver 决定 capability 边界。这里已经是 module graph，不能再维护一份手写目录树。

### 目前真正缺失的层

已批准 Fleet PRD 明确把以下内容列为 non-goal：

- Agent runtime adapter；
- PTY ownership；
- Session wake；
- raw transcript/session injection；
- resident operator daemon；
- Sprint schema 的 `Depends On`、`Capability`、`Priority`、`Concurrency Key`。

见 `plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md:151-162`。

现有研究也确认：repo-harness 拥有执行权协议，但还没有 Local Worker Host 去循环 acquire、启动 Codex/Claude、注入 WorkEnvelope、观察进程退出和发布 module result（`docs/researches/20260823-human-control-board-agentic-factory.md:25-32`）。

因此“Persistent Module Engineer”不是给已有 Fleet 加一个 prompt 文件，而是一个新的、显式的 runtime/organization work-package。

### 当前身份压力点

Fresh claim 的 Lease record 当前记录：

```ts
claimed_by: {
  session_id: input.sessionId,
  source_worktree: input.sourceWorktree,
}
```

见 `src/core/state/coordination-identity.ts:310-340`。

这在单次 session claim 中足够，但不能表达：

- 稳定工程师身份；
- 当前 Provider binding generation；
- Session 轮换后的旧 binding fencing；
- 父工程师与临时 Worker run 的 actor 关系。

同时必须保留一个不变量：task identity 不因换 Session、Provider 或工程师而变化。Engineer identity 属于 actor/audit/routing domain，不进入 `task_id` 或 `task_revision` digest preimage。

## GPT 建议逐项裁决

| 建议 | 裁决 | repo-harness 调整 |
|---|---|---|
| Persist the engineer, rotate the session | 接受 | 稳定 `engineer_id`，Session 只作 binding |
| Program Orchestrator / Module Engineer / Worker / Acceptance 四层 | 接受 | Acceptance 必须独立于 Module Engineer 汇报线 |
| Module、Engineer、Session、Claim 四种 ID 分离 | 接受 | Session generation 改名 `binding_generation`，避免与 Lease generation 混淆 |
| 通用 Engineer persona + 模块 Profile/SOP | 接受 | Profile 引用 ArchContext capability，不复制 paths/interfaces/checks authority |
| 新增 `engineering/modules/` 与 `ModuleGraphV1` | 拒绝 | 复用 `.archcontext/model/nodes/*.yaml` 和现有 architecture module docs |
| Normative SOP / verified / episodic / provider memory 分层 | 接受并收窄 | verified truth 写回现有 architecture/research/lessons；episodic 绑定 task/claim；provider memory 仅缓存 |
| 自动 Memory Promotion | 接受 | proposal 必须带 source refs、subject revision、适用 capability；批准后写入既有权威文档，不自动生成平行事实库 |
| Provider 原生消息 + durable inbox 双通道 | 接受 | 必须 persist-first；native send 是 accelerator，不是 authority/fallback |
| Task/Module/Interface/Human 四套 Inbox | 修改 | 一个 typed coordination-message core + 不同 subject/audience projection；Task Inbox v1 保持现状直到新协议有独立 work-package |
| Provider Session ID 不作收件人 | 接受 | 收件人是 stable engineer/capability/claim；binding adapter 再解析为 Provider thread |
| Session liveness 不得触发 Lease steal | 接受 | idle/PID/thread status 只作 observation；takeover/release 仍走显式领域动作 |
| Subagent 不取得第二个 canonical Lease | 接受 | Worker 使用 parent-claim-scoped Delegation grant |
| `DelegationEnvelopeV1` / `WorkerResultV1` | 接受并加强 | 写入型 Worker 需要 bounded actor grant；不能把 parent claim token 当通用 bearer token 暴露给 child |
| Gatekeeper 不作普通下属 | 接受 | Module Engineer 可调用 advisory reviewer；正式 gatekeeper/harness evaluator 由 Acceptance Plane 调度 |
| Work Package Graph 加 dependency/capability/priority/concurrency | 接受 | 这是 Sprint/Work Package schema work-package，不从 prose 推断 |
| Interface Change Request | 接受 | 跨 capability 修改先形成 typed request/dependent Work Package，不以“模块 owner”扩写路径 |
| 一个 provider-neutral `SessionTransport` 同时 spawn Subagent | 修改 | 拆成 PersistentThreadTransport 与 WorkerRuntimeAdapter |
| `InboxOnlyTransport` 作为 fallback | 拒绝 fallback 语义 | durable inbox 是 primary queue；无 native transport 时停在 pending/manual delivery，不静默改 runner |
| 第一版 3–5 Engineer、每人 1 claim、1 writer | 接受 | 作为 canary hard limit，不只是提示词 |

## P2：端到端数据流

### 路径 A：岗位 Bootstrap 与 Session Binding

1. Human/Program Orchestrator 选择一个现有 ArchContext capability，例如 `verification-evals-checks`。
2. 系统读取通用 Module Engineer persona、该 engineer profile、SOP revision，以及 capability 的 architecture/contract pointers。
3. Human 显式创建或选择一个 Codex/Claude Session。
4. `EngineerBindingV1` 将 stable `engineer_id` 映射到 provider/session ID，并递增 `binding_generation`。
5. Runtime 生成 compact context capsule；不复制完整 chat history，也不把全部 memory 注入 SessionStart。
6. 旧 binding 被标记 retired；其 provider thread 即使恢复，也无法进行 engineer-scoped mutation。

最终 side effect 是本机 runtime binding，不是 task owner 变化。

### 路径 B：领取 Task 并派 Worker

1. Canonical Sprint/Work Package 提供 task、revision、capability、dependency 和 approved plan/contract proof。
2. Deterministic matcher 只把 capability-compatible、dependency-ready、authorization-valid 的 offer 投影给 engineer。
3. Module Engineer 调用现有 `fleet acquire`；per-task lock 选出唯一 claim，创建并绑定 contract worktree。
4. 返回的 WorkEnvelope 仍是父工程师执行上下文的快照；Lease 是唯一 task execution authority。
5. Engineer 构造 `DelegationEnvelopeV1`：固定 parent task/claim/generation、role、mode、allowed-path subset、goal、acceptance、budget、return contract。
6. Worker Runtime 依据 exact installed fleet role 启动 native Subagent。Codex 路径继续由 `SubagentStart` 注入唯一 EXECUTION_BOUNDARY，并验证真实 `agent_type/model`；不得把 App Thread 冒充 native fleet role（`src/cli/hook/subagent-handler.ts:450-475`）。
7. Worker 返回 `WorkerResultV1`，包含 changed paths、commands、evidence 和 residual uncertainty。
8. Parent Engineer 检查结果并整合。WorkerResult 不能完成 Task、发布 Acceptance 或改变 Lease。
9. Independent Acceptance Plane 读取 frozen subject 和真实 diff，产生 Gatekeeper verdict / AcceptanceReceipt。

### 路径 C：Session 轮换

1. Runtime 观察到 context compaction、Session 不可访问、Provider 切换或 profile revision 变化。
2. 这些信号只能触发 `rotation_recommended`，不能 release/steal Lease。
3. 无 active claim 时可建立新 binding generation。
4. 有 active claim 时必须选择显式领域路径：
   - 尚未 bind：release 后由新 Session acquire；
   - bound：执行明确 handoff/release + reacquire，第一版不做透明转移；
   - reviewing：使用 publication takeover；
   - completed：不转移。
5. 新 Session 从 repo authority、inbox 和 projected context packet 恢复；旧 Session history 仅作 debugging observation。

### 路径 D：跨模块接口变化

1. Engineer A 发现必须修改 Capability B 的 interface/owned source。
2. A 不能依赖自己的 profile 扩大 `allowed_paths`。
3. A 发出 typed `InterfaceChangeRequestV1`，绑定 originating task/revision、consumer impact、blocking flag 与证据。
4. B 的 engineer 接受、拒绝或要求修订；接受时由 Program Orchestrator/Planning gate 生成 dependent canonical Work Package。
5. B 在独立 Lease/worktree 中修改；A 的 dependency 在 publication/acceptance evidence 完成后解除。

## P3：推荐架构

### 1. 复用现有 Module Authority

不要新增：

```text
engineering/modules/<module>/profile.yaml
engineering/modules/<module>/interfaces.md
ModuleGraphV1
```

推荐：

```text
.archcontext/model/nodes/capability.<domain>.<capability>.yaml  # module boundary authority
docs/architecture/modules/<domain>/<capability>.md             # stable design truth
tasks/workstreams/<domain>/<capability>/                       # durable progress
agents/engineers/module-engineer.md                             # generic persona
agents/engineers/profiles/<engineer-id>.yaml                    # behavior/routing contract
agents/engineers/sops/<engineer-id>.md                          # reviewed SOP
<git-common-dir>/repo-harness/engineers/v1/                    # shared binding authority/events/locks
.ai/harness/state/engineer-memory/<engineer-id>.json            # generated retrieval index
```

Profile 只记录 capability reference、delegation policy、max active claims、escalation policy、SOP ref 和 provider preferences。Paths、interfaces、entrypoints、verification 继续从 capability/architecture/contract authority 解析。

### 2. 建议的核心 Contracts

#### ModuleEngineerProfileV1

```yaml
protocol: 1
kind: repo-harness-module-engineer-profile
engineer_id: engineer:verification-evals-checks
capability_id: verification-evals-checks
sop_ref: agents/engineers/sops/verification-evals-checks.md
delegation_policy:
  allowed_roles: [explorer, root-cause-prover, fast-worker, deep-worker]
  max_depth: 1
  max_parallel_readers: 3
  max_parallel_writers: 1
max_active_claims: 1
escalation_policy:
  cross_capability_change: interface_request
  architectural_decision: program_orchestrator
  waiver: human
  acceptance: independent_plane
```

Profile 不出现 `owned_paths`、`required_checks` 的复制值；这些值由 referenced capability 和 active Contract 解析。

#### EngineerBindingV1

```yaml
protocol: 1
kind: repo-harness-engineer-binding
engineer_id: engineer:verification-evals-checks
binding_generation: 7
provider: codex
provider_thread_id: thread_abc123
host_id: local
engineer_contract_revision: sha256:...
state: active
bound_at: 2026-08-24T00:00:00Z
retired_at: null
```

`engineer_contract_revision` 是 Profile canonical bytes、SOP bytes 与 capability revision 的传递闭包 digest。`binding_generation` 与 Lease `generation` 是不同 fencing domain。任何 engineer-scoped native delivery 都必须同时匹配 engineer ID、binding generation 和 engineer contract revision。

#### DelegationEnvelopeV1

```yaml
protocol: 1
kind: repo-harness-delegation-envelope
delegation_id: uuid
parent:
  task_id: <digest>
  task_revision: <digest>
  claim_id: <uuid>
  lease_generation: 4
  work_envelope_sha256: sha256:...
engineer_id: engineer:verification-evals-checks
binding_generation: 7
role: root-cause-prover
mode: read_only
goal: Prove the exact authority mismatch.
allowed_paths:
  - src/effects/fleet/**
acceptance:
  - reproduce one failing condition
  - identify the owning contract
budget:
  max_turns: 12
  max_depth: 0
return_contract: WorkerResultV1
```

写入 mode 还需要一个不可转授的 `DelegatedMutationGrantV1`：绑定 parent claim、delegation ID、worker run ID、worktree、allowed-path digest 和 expiry/settled state。它是父 Lease 下的 actor grant，不是第二个 task Lease，也不能用于 publication/takeover/acceptance。

#### EngineerContextPacketV1

不建议第一版创建新的 durable `ModuleHandoff` authority。Session 轮换包应是从下列事实生成的 projection：

- profile/SOP revision；
- capability architecture pointers；
- active offers/claim/publication；
- unread coordination messages；
- verified memory refs；
- unresolved hypotheses，明确标记 unverified。

现有 SessionStart 总预算为 1,500 estimated tokens（`src/cli/hook/session-context-budget.ts:5`）。因此 SessionStart 只注入 compact capsule 和 required reads；完整 context packet 在接单/轮换时按需读取。

### 3. Memory 模型

#### Normative SOP

Repo-tracked、reviewed，描述：接单、拆分、派 Worker、跨模块升级、验证、handoff 和禁止行为。它是行为指导，不是 permission grant。

#### Verified Module Knowledge

不建独立事实目录。根据知识类型写入现有 authority：

- 架构不变量和 interface：`docs/architecture/modules/`；
- 深层机制、对比和事故分析：`docs/researches/`；
- correction-derived rules：`tasks/lessons.md`；
- 进行中的 durable progress：`tasks/workstreams/`；
- task-local tradeoff/hypothesis：`tasks/notes/`。

Engineer-specific memory 是这些事实的检索索引，包含 source ref、source revision、scope、verified/superseded 状态。删除索引应可重建，不能改变 workflow meaning。

#### Episodic Task Memory

必须绑定 `task_id + task_revision + claim_id + lease_generation`。Takeover 后默认 untrusted；新 owner 只能在重新验证 source/diff/command 后提升其中结论。

#### Provider Memory

Codex Thread history、Claude auto memory、compaction summary 都只是缓存/观察。它们不能授权、不能覆盖较新的 Contract，也不进入 acceptance evidence。

#### Memory Promotion

Worker 或 Engineer 只能生成 `MemoryProposalV1`：

```yaml
statement: <candidate conclusion>
kind: invariant | pitfall | procedure | incident
capability_id: <id>
source_refs: [<repo path or evidence id>]
subject_revision: <sha/digest>
proposed_by_run_id: <run id>
target_authority: architecture | research | lessons | workstream
```

Promotion gate 必须验证 source 可读、subject 未过期、scope 匹配、没有与较新 authority 冲突，再由 owner/human review 写入目标文档。不要自动把聊天总结落成长期规则。

### 4. Messaging 模型

第一原则：

```text
persist event -> resolve stable recipient -> attempt native delivery -> receipt -> ack
```

不要使用：

```text
native send -> 如果失败再猜测是否写 inbox
```

Task Inbox v1 应保持 task/claim 语义，避免在同一 protocol 中直接塞 capability message。后续独立 work-package 可以提炼共享 primitives：immutable event digest、recipient fencing、delivery state machine、bounded untrusted rendering、per-subject lock。其上再定义：

- task/claim subject；
- capability engineer subject；
- interface request subject；
- human decision subject。

这是一套 message core 的四种 typed subject，不是四个互不相干的事实库。

Native transport 失败时：event 保持 pending，Board 显示 `attention_owner` 与 delivery error；不得把未送达当成 Session 死亡，更不得据此 steal Lease。

### 5. Runtime Adapter 边界

推荐拆分：

```ts
interface PersistentThreadTransport {
  createBinding(input: SessionBootstrap): Promise<ThreadRef>;
  send(input: BoundEngineerMessage): Promise<DeliveryObservation>;
  read(input: ThreadRef): Promise<ThreadObservation>;
  requestStop(input: ThreadRef): Promise<StopObservation>;
}

interface WorkerRuntimeAdapter {
  start(input: DelegationEnvelopeV1): Promise<WorkerRunRef>;
  observe(input: WorkerRunRef): Promise<WorkerRunObservation>;
  cancel(input: WorkerRunRef): Promise<CancelObservation>;
  collect(input: WorkerRunRef): Promise<WorkerResultV1>;
}
```

Provider adapter 只翻译 lifecycle 和 transport，不选择 role、scope、runner、Lease 或 retry。Deterministic scheduler 先验证 policy，再选择 adapter。

对于 Codex native child，现有 contract 明确要求 exact installed `agent_type`、`fork_turns=none` 和 `SubagentStart` observation；缺失或 mismatch 必须 fail closed，不得退回 App Thread、main thread 或其他 runner。Persistent Module Engineer Thread 因此不能被宣称为 `fast-worker`、`gatekeeper` 等 fleet role。

### 6. Acceptance 独立性

Module Engineer 可以派 advisory reviewer，但正式验收路径必须是：

```text
Module Engineer marks candidate ready
  -> Acceptance Plane freezes subject
  -> independent gatekeeper / harness evaluator
  -> typed AcceptanceReceipt
  -> publication readiness
  -> Human merge/waiver decision
```

Gatekeeper 不读取 Engineer 的自我结论作为事实，不继承完整 parent conversation，不编辑 candidate。Module Engineer 也不能因为“记得这个模块一直这样做”而覆盖 fresh verification。

## Canary 设计

第一版应控制在：

- 1 个 Program Orchestrator；
- 2 个 Module Engineer，而不是立即扩到 5 个；
- 每个 Engineer 最多 1 个 active claim；
- 最多 3 个并行 read-only Worker；
- 最多 1 个 writable Worker；
- delegation depth = 1；
- formal Gatekeeper 由独立 Acceptance Plane 启动；
- 不自动 create/rotate Session；由 Human 显式 bootstrap/bind。

建议选现有边界清楚的两个 capability：

1. `verification-evals-checks`；
2. `runtime-harness-hook-adapters` 或 `workflow-engine-contract-assets`。

### 必须通过的场景

1. **Binding replacement**：旧 Codex Thread retire，新 Thread binding generation +1；旧 Thread 的 engineer-scoped mutation 被拒绝。
2. **Task authority unchanged**：更换 Engineer Session 不改变 task ID/revision；active claim 不自动转移。
3. **Persist-first delivery**：native send 失败后 event 仍 pending；恢复/重绑后可 delivery + ack。
4. **No second Lease**：三个 Worker 并行时只有 parent claim 出现在 Lease store。
5. **Single writer**：第二个 writable delegation fail closed；read-only workers 仍可并行。
6. **Path subset**：Delegation allowed paths 必须是 active Contract allowed paths 的真子集或相等；Profile 不能扩大它。
7. **Independent acceptance**：Engineer 的 advisory PASS 不能产生 AcceptanceReceipt；正式 Gatekeeper 必须重新读取 frozen subject。
8. **Stale memory**：memory source revision 旧于 active Contract/subject 时标记 stale，不注入为 normative instruction。
9. **Cross-capability request**：Engineer A 不能直接编辑 B path；必须创建 interface request/dependent Work Package。
10. **Context budget**：Engineer SessionStart capsule 与现有 mandatory sections 合计不超过 1,500 estimated tokens，overflow fail closed 并给出 required action。

### Falsifiers

出现任意一项即说明该架构实现错误：

- 关闭一个 Provider Session 会丢失工程师岗位或 verified knowledge；
- Session idle/PID 消失会自动 release 或 steal Lease；
- profile 中的 `owned_paths` 可以绕过 Contract；
- WorkerResult 能直接标记 task completed；
- Module Engineer 可以签发自己的正式 Acceptance；
- native message 成功但 durable event 不存在；
- Session binding 与 Lease generation 共用同一个 generation 字段；
- 自动 fallback 到不同 runner/role 而没有新的 admission decision；
- 新 `ModuleGraph` 与 ArchContext capability node 对同一模块给出不同边界。

## 实施顺序

### ME-0A：Profile + Shared Binding Read Model

实现最小 contracts 和 operator surface：

- generic Module Engineer persona；
- `ModuleEngineerProfileV1`；
- git-common-dir `EngineerBindingV1` store、event 与 per-engineer lock；
- closed `EngineerBindingEventV1 → EngineerBindingCurrentV1` idempotent publication protocol；
- operator-only `engineer bind/status/retire/bootstrap-prompt`；
- 两个 profile/SOP；
- compact SessionStart engineer capsule；
- generation/profile-revision CAS。

这一阶段不允许 Session 发起 engineer-scoped mutation，因此只验证岗位、共享 binding 投影和 bootstrap；不得声称旧 Thread 已被技术性 fencing。

### ME-0B：Binding Principal + Claim Actor

- authenticated `EngineerPrincipalV1`；
- binding credential/connection 到 server-side principal 的映射；
- retired binding mutation rejection；
- immutable `ClaimActorReceiptV1`；
- binding 与 Lease generation 的独立 fencing。

当前 MCP OAuth `authorizationId` 证明 client authorization，不天然证明 Provider Thread identity。具体 principal carrier 必须在该 work-package 内通过 canary 冻结，不能由命令参数替代。

### ME-1A：Scheduling Schema

- Work Package/Sprint 加入 repository-qualified Work Package identity、independent scheduling/graph revisions、capability、dependency、priority、repo-scoped concurrency key；
- deterministic engineer offer matching；

增加稳定 `repository_id + work_package_id`，dependency 指向逻辑 Work Package；task revision 继续表达当前内容版本，`work_package_revision/work_graph_revision` 单独 fence scheduling metadata。P0 只有一个 `primary_capability`，跨 capability 前置关系使用 repository-qualified Work Package dependency；`required_capabilities`、capability/fleet-wide concurrency authority 延后，legacy task 不从 prose 推断字段。

### ME-1B：Engineering Overlay

- `EngineeringOverlaySnapshotV1`；
- `OrganizationAttentionSnapshotV1`；
- Fleet column 与 engineer runtime 状态保持正交；
- 先 CLI/JSON read model，再接 Human Board。

### ME-1C：Durable Engineer Inbox

- 提炼 immutable event、receipt、transition、bounded untrusted rendering 等共享 mechanics；
- 保持 `TaskMessageEventV1` wire format 不变；
- 新增 closed `ModuleMessageEventV1` 与 engineer recipient；
- Decision/Interface records 仍是独立 authority，message 只通知。

### ME-2A：Read-only Delegation

- `DelegationEnvelopeV1`；
- `DelegationAdmissionReceiptV1`；
- `WorkerRunRefV1`；
- `WorkerResultV1`；
- native role observation 与 result collection。

独立 PRD：`plans/prds/20260824-1653-read-only-delegation-admission.prd.md`。

### ME-2B：Single-writer Grant

- `DelegatedMutationGrantV1`；
- `WriterActorCurrentV1` 与 Parent-freeze/Worker-active/settlement 中间状态；
- exclusive `writer_actor = engineer:<binding-id> | worker:<run-id>`；
- parent write freeze；
- host-observed before/after Git state；
- sandbox/network/command/git policy；
- settlement 与 crash recovery。

独立 PRD：`plans/prds/20260824-1653-writable-worker-grant.prd.md`；依赖 ME-3 Worker Host，不能依赖手工 Provider Session 的提示词自律来冻结 Parent writer。

### ME-2C：Verified Context Inner Loop

- canonical Contract semantic fields 或 exact-source projection；
- `EngineerStepProposalV1`；
- `WorkerRoundReceiptV1`；
- evidence-chain-bound `SemanticVerificationAssertionV1`；
- `DecisionRequestV1`、`RuntimeFailureV1` 与 `ExecutionBudgetV1`；
- `DecisionRequestEventV1/CurrentV1` 的 actor-fenced crash publication。

独立 PRD：`plans/prds/20260824-1653-verified-context-contracts.prd.md`。

### ME-3：Worker Host

- PersistentThreadTransport adapters；
- WorkerRuntimeAdapter adapters；
- acquire/dispatch/observe/collect loop；
- immutable `WorkerDispatchIntentV1`、runtime receipt chain 与 current pointer；
- explicit retry policy，区分 infrastructure failure 与 semantic failure；
- Session rotation recommendation 与 Human-controlled rebinding。

独立 PRD：`plans/prds/20260824-1653-worker-host.prd.md`。

### ME-4A：Bound-task Freeze and Handoff

- `TaskFreezeReceiptV1` 与 explicit dirty-bound refusal；
- 未跟踪内容没有 carrier 时不宣称无损 takeover；
- execution takeover 继续 disabled，直到 exact carrier/election protocol 单独 Approved。

### ME-4B：Interface Change Request

- closed `InterfaceChangeRequestV1` schema/store/revision；
- actor authority 与 transition lock；
- accepted request 到 canonical Work Package 的显式投影。

### ME-4C：Integration and Product Acceptance

- dependency-ready module publications；
- Integration Contract/Envelope；
- selected publication 绑定 immutable receipt、current-publication pointer、status observation 与 exact head/tree，不创建 `publication_revision`；
- cross-module Acceptance Matrix；
- original approved requirement authority 与 exact combined candidate；
- independent system-level verification。

Human Board 的 Organization View 应最后消费这些稳定 contracts，而不是先发明 `engineer.status = busy` 一类第二权威。

## 10x 规模判断

在 2 个 Engineer 时，人工 controller session 可以工作；到 20–50 个 Engineer，最先失败的不是模型编码，而是：

1. 中央 Orchestrator 的派工与消息带宽；
2. Provider Thread liveness/polling；
3. 跨 capability interface request 堆积；
4. 多 module publication 的 integration queue；
5. memory/context 注入冲突。

应对方式不是再增加一个更大的总控 prompt，而是：

- deterministic capability/dependency routing；
- event-driven durable inbox；
- Engineer binding generation；
- 每 capability 有界并发；
- 独立 Integration/Acceptance plane；
- memory 只注入相关索引和 fresh source refs。

这套结构能横向增加 Module Engineer，而不会让 Session、Task、Lease 和 Memory 合并成一个不可恢复的 actor blob。

## 最终裁决

GPT 建议的五个核心判断应保留：

1. 模块工程师是逻辑岗位，不是永久 Session；
2. repo-owned memory 才能跨 Session/Provider 延续；
3. native messaging 只做 fast path；
4. Subagent 是父 Claim 内的临时 Worker；
5. Gatekeeper 必须独立。

repo-harness 的最终形态不应是“多个聪明聊天窗口互相相信”，而应是：

> 多个有固定 SOP、可替换 Session、repo-grounded memory 的逻辑工程师，在确定性 capability、Lease、worktree、delegation 和 acceptance contracts 下协作。

## Sources

### Repo authority

- `.archcontext/model/nodes/*.yaml`
- `src/core/capabilities/registry.ts`
- `src/core/state/coordination-identity.ts`
- `src/effects/state/coordination-claim-token.ts`
- `src/core/fleet/task-message.ts`
- `src/effects/fleet/acquire.ts`
- `src/effects/fleet/task-inbox.ts`
- `src/cli/hook/subagent-handler.ts`
- `src/cli/hook/session-context-budget.ts`
- `plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md`
- `docs/researches/20260808-repo-harness-in-opencode.md`
- `docs/researches/20260823-human-control-board-agentic-factory.md`

### Provider-primary documentation

- [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)
