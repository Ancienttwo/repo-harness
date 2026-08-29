# PRD: Collaborative Work Exchange and Agent Succession

> **Status**: Approved
> **Slug**: `collaborative-work-exchange-agent-succession`
> **Created**: 2026-08-28T23:21:55-07:00
> **Updated**: 2026-08-29T00:41:20-07:00
> **Source Spec**: `docs/spec.md`
> **Baseline**: `Ancienttwo/repo-harness@456731f308b7ad54585ac50acbc510350a4c563c`
> **Tier**: standard
> **Architecture Risk**: high
> **Future repo path**: `plans/prds/20260828-2321-collaborative-work-exchange-agent-succession.prd.md`
> **Child PRD A (Active)**: `plans/prds/20260828-2321-collaboration-substrate.prd.md`
> **Child PRD B (Deferred — Phase 2)**: `plans/prds/20260828-2321-work-exchange-independent-review.prd.md`
> **Child PRD C (Deferred — Phase 3)**: `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`
> **Program Sprint**: `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`

## Delivery Target

> 一个 Agent 的发现不会随 context 和 budget 一起死亡；多个 Agent 能看到彼此的部分成果，自发分道探索，并由后继者接着完成。

## AI Quick-Read Card

- **Problem**: repo-harness 已有 Task、Lease、WorkEnvelope、PublicationReceipt、AcceptanceReceipt、MergeReadiness、Module Engineer Binding、read-only delegation 和 attention-first Operator Board，但一次 Agent 运行产生的假设、死路和部分证据没有可发布、可发现、可继承的载体。budget 或 context 耗尽时这些知识直接消失。
- **Users**: Maintainer、Module Engineer、Collaboration Participant（read-only delegated Worker / native subagent / Human）、Successor Engineer、Program Orchestrator。
- **Platform**: repo-backed control plane、git-common-dir collaboration store、CLI/MCP first、localhost Operator Board 只读投影；Provider runtime 继续拥有 Agent turn 与线程生命周期。
- **P0 surface**: `CoordinationSignalV1`、`WorkStateHandoffV1`、`HandoffAdoptionReceiptV1`、`CollaborationContextPacketV1`、same-capability multi-participant（复用现有 read-only delegation）、collaboration-centric `WorkExchangeSnapshotV1`、read-only Operator collaboration view、real multi-agent canary。
- **Phase 2 surface**: GatePolicy、ReviewOffer、GateReservation、ReviewReceipt、VerificationOffer/Receipt、Gate convergence。
- **Phase 3 surface**: MergeEligibility、Provider merge capability、Merge Controller、ProgramAuthorization、Budget、Auto Merge。
- **Core metric**: 协作层写入对 Task/Lease/Publication/Acceptance 的字节影响为 0，同时后继者不重复已记录的 dead end。
- **Hard constraint**: 协作平面不持有任何交付权威；进入权威流程必须经显式 promotion。
- **Key risk**: 把协作信号误实现成第二调度器或第二权威，或让 thread 热度变成 Work Graph 优先级。
- **Unknowns**: 真实多 Agent 协作的信噪比、同 capability 持久多席位是否必要、context packet 在真实任务上的有效体积。
- **Acceptance scenarios**: 三个只读参与者并发发布 signal 且 writer 仍为 1；handoff 被后继者采用但不产生 Claim；hotspot 只改变发现排序；snapshot 对相同输入 byte-identical。
- **Suggested next step**: 先冻结两平面权威边界（C0），再实现 signal store 与 handoff（C1/C3），最后用一个真实任务跑 canary（C9）。

## Problem

### Current Foundation

当前基线已经具备：

- canonical Sprint Task 与 task revision；
- Lease claim/generation 与 WorkEnvelope；
- `WorkGraphV1`、`EngineerOfferV1`、capability/dependency/concurrency filtering；
- `ModuleEngineerProfileV1`、`EngineerBindingV1`、Principal 与 ClaimActorReceipt；
- 单轮 read-only delegation：`DelegationEnvelopeV1`、`DelegationAdmissionReceiptV1`、`DelegatedRunIntentV1`、`WorkerRunRefV1`、`WorkerResultV1`；
- `TaskFreezeReceiptV1` 与 `engineer task-freeze` 的冻结/校验路径；
- PublicationReceipt、review subject fingerprint、verification evidence、merge seal；
- provider feedback、RepairOffer、reopen/takeover/no-progress；
- AcceptanceReceipt protocol 2；
- IntegrationContract、IntegrationEnvelope、AcceptanceMatrix、ProductAcceptanceProjection；
- MergeReadiness 的 live provider/local blocker projection；
- durable task/module messages 与它们的 untrusted 注入包裹。

缺口不在于再造一套 Agent 框架：

1. `WorkerResultV1` 的 `untrusted_claims` 与 `evidence_refs` 只回流给发起它的那个 Engineer，其他人无法发现；
2. 一次运行的 attempted path 与 dead end 没有结构化载体，后继者只能重新烧预算；
3. 同 capability 的多个只读参与者之间没有共享看板，无法自发分道；
4. budget/context 压力下的交接依赖聊天记录，而不是可寻址的 handoff；
5. Module Message 是点对点投递，不适合承载“任何人都可能感兴趣”的异步发现。

### Product Direction

系统分成两个平面：

```text
┌────────────────────────────────────────────┐
│ Collaboration Plane                        │
│ many readers / researchers / contributors  │
│ Coordination Signals                       │
│ Work-State Handoffs                        │
│ Threads / emergent lanes                   │
│ Hotspots / attention hints                 │
│ Shared context packets                     │
│ Advisory, untrusted, non-authoritative     │
└──────────────────────┬─────────────────────┘
                       │ explicit promotion
                       ▼
┌────────────────────────────────────────────┐
│ Delivery Plane                             │
│ Canonical Task / Work Graph                │
│ Lease / one writer                         │
│ WorkEnvelope / Publication                 │
│ Verification / Acceptance                  │
│ MergeReadiness                             │
│ Typed, fenced, authoritative               │
└────────────────────────────────────────────┘
```

核心规则：协作平面可以宽松、高频、自组织；交付平面继续严格、低频、确定性。

两条不可逾越的断言：

```text
Collaboration Plane owns no delivery authority.
Delivery Plane consumes no collaboration claim without explicit promotion.
```

signal、handoff、hotspot 与 Agent 讨论永远不能直接：修改 Work Graph；改变 Task state；转移 Lease；宣布 verification 通过；宣布 Acceptance；触发 merge。进入权威流程只有一条路——显式 promotion 到现有的 Task Message、Module Message、Interface Change Request、Plan/Contract revision、Verification evidence、Publication，或者 Human decision。

`plan` 仍不进入共享领取。PRD、Sprint、Plan、Contract 继续由 Human-approved planning path 管理。

### Hard Constraints

- Task、Lease、Publication、Acceptance 保持唯一权威；协作层不新增第二权威。
- 一个任务同一时刻只有一个 writer，即当前 Lease owner。
- signal 与 handoff 是 untrusted data，注入上下文时必须带不可信包裹。
- handoff adoption 不隐式转移 Task 或 Lease。
- 不把完整 Provider transcript 当作事实来源。
- Operator Board 不增加 mutation，现有 task message 写入仍是唯一 browser write。
- Agent 可自由创造 thread key 和 labels。
- P0 不定义 closed 协作语义。
- `HOLD` / `VETO` / `BREAKTHROUGH` 这类词可以自发使用，系统不赋予它们任何权威。
- attention hints 只改变发现排序，不改 canonical priority、dependency 或 Lease eligibility。
- partial result 即使任务失败也可以发布。
- successor adoption 不等于 task acquire。

### Recommended Defaults

```jsonc
{
  "collaboration": { "mode": "off" },
  "independent_review": { "mode": "off" },
  "guarded_merge": { "mode": "disabled" },
  "program_automation": { "mode": "disabled" }
}
```

Promotion:

```text
off → shadow → active
```

- P0 每个 capability 只有一个持久 Module Engineer 与一个 writer。
- P0 只读参与者通过现有 delegation 产生，数量上限来自 `ModuleEngineerProfileV1.delegation_policy.max_parallel_readers`。
- P0 context packet 注入预算沿用仓库现有 session context 门槛 1,500 estimated tokens。

### Freedoms

- thread 命名、label 词表、探索策略完全由 Agent 决定。
- 协作 UI 可以是单页或 secondary route，只要保持 attention-first 语义。
- context packet 的选择算法可以迭代，只要保持确定性与可追溯。
- 参与者可以是当前 Engineer Session、delegated read-only WorkerRun、native read-only subagent 或 Human operator。

### Feasibility Boundary

**Confirmed**

- `DelegatedRunIntentV1.context_packet_sha256` 已存在，可直接记录某次 delegated run 实际收到的协作上下文摘要。
- `WorkerResultV1` 已把 worker prose 归入 `untrusted_claims`，并单列 `evidence_refs`。
- `DelegationEnvelopeV1.mode` 只允许 `read_only`，`max_depth` 固定为 0，只读参与者无法自己再派生。
- `TaskFreezeReceiptV1` 已冻结 claim、binding、WorkEnvelope、worktree topology、head/tree/diff、untracked inventory、checks state、unverified hypotheses 与 writer grant。
- `assertNoLiveClaimForBindingRotation` 已在存在 live claim 时以 `bound_task_active` 拒绝 binding rotation。
- Task/Module Message 已有 `[TaskInboxUntrustedPeerMessages]` 与 `[ModuleInboxUntrustedPeerMessage]` 包裹与固定 warning 文案。
- git-common-dir store、per-subject lock、content-addressed immutable file、idempotency 已有先例。
- Operator server 只有一条 POST 路由，即 task message。

**[UNVERIFIED]**

- 真实任务上 signal 的信噪比与 never-read 比例。
- 同 capability 持久多席位是否会成为瓶颈。
- native read-only subagent 是否能稳定产出结构化 contribution draft。
- 一个 Engineer Binding 承担多个并行工作包时的实际延迟。

## Users

### Primary Users

#### Module Engineer / Current Writer

- **Need**: 在自己的 capability 内并行调动多个只读参与者，读到它们的部分结论，而不必自己重跑每条假设。
- **Success signal**: 一轮协作后能直接引用 `source_signal_ids` 决定下一步，写入面仍然只有自己。

#### Collaboration Participant

- **Need**: 读到别人已经试过什么、哪条路是死路、哪个假设还没人验证。
- **Success signal**: 选中一个未被认领的 thread 或 open request，产出别人可引用的 signal。

#### Successor Engineer

- **Need**: 前一个执行者预算耗尽时，拿到精确的 completed / attempted / dead end / next actions，而不是一段聊天摘要。
- **Success signal**: 采用 handoff 后不重复已记录的 dead end；需要写入时经现有 release/takeover/acquire 拿到权威。

### Secondary Users

#### Maintainer / Human Operator

- **Need**: 在 Board 上看懂当前有哪些 lane、谁在贡献、哪条 handoff 还没人接。
- **Success signal**: 不需要读 transcript 就能判断协作是否在收敛。

#### Program Orchestrator

- **Need**: 从 approved Work Graph 推进阶段，协作层只提供发现顺序，不提供调度权。
- **Success signal**: 每次推进仍然来自 canonical offer 或 Human decision。

## Product Model

### Publish

任何参与者都可以把部分结论写成 `CoordinationSignalV1`：自由文本、opaque thread key、开放 labels、可选 typed scope/artifact refs。append-only，修订只通过 `supersedes_signal_id`。任务失败也可以发布 partial result。

### Discover

协作 store 派生 thread 聚合、hotspot 排序与 contribution opportunities，投影进 Work Exchange 与 `CollaborationContextPacketV1`。发现是确定性投影，没有 LLM 状态推断。

### Succession

`WorkStateHandoffV1` 承载 completed、key findings、attempted paths（含 outcome 与 evidence refs）、dead ends、open hypotheses、next actions 与执行状态引用。`HandoffAdoptionReceiptV1` 只证明“这份上下文交给了谁”。

冻结的一句话：

> WorkStateHandoff 传递知识；TaskFreeze 传递精确状态；现有 Lease lifecycle 传递执行权。

### Emergent Lanes

没有中央 lane 枚举。Agent 自己创造 `thread_key`、labels、`reply_to_signal_id`、`source_signal_ids`；系统只把相同 thread_key 聚成一条 lane。

### Explicit Promotion

协作结论要影响交付，必须落到既有载体之一：

| 目标 | 载体 |
|---|---|
| 通知某个 Engineer | Module Message（可用 `subject_notification`） |
| 通知当前 claim | Task Message |
| 跨 capability 接口变更 | Interface Change Request |
| 改变范围或验收 | Plan / Contract revision |
| 声称验证结果 | 现有 Verification evidence |
| 提交候选 | PublicationReceipt |
| 其他 | Human decision |

Shared Acceptance 移至 Deferred Phase 2。

## Coordination Signal vs Module Message

| 能力 | Module Message | Coordination Signal |
|---|---:|---:|
| 明确目标接收者 | 是 | 否 |
| 广播发现 | 否 | 是 |
| Delivery receipt | 是 | 不必 |
| 可搜索 | 有限 | 是 |
| 可形成 thread | 否 | 是 |
| 进入 top-K context | 仅当前 inbox | 是 |
| Workflow authority | 否 | 否 |

Module Message 保持点对点定向通信语义，不改造成全局广播协议。一条 Module Message 可以用 `subject_notification: new signal <id>` 提示某个 Engineer，signal 正文仍留在协作 store。

## Authority Map

| Datum | Authority |
|---|---|
| Product intent | `docs/spec.md` + approved PRD |
| Work decomposition | approved Sprint / Work Graph |
| Capability | ArchContext node |
| Execution offer | existing `EngineerOfferV1` |
| Execution right | Lease claim/generation |
| Executor provenance | ClaimActorReceipt |
| Delegated run provenance | `DelegationAdmissionReceiptV1` + `DelegatedRunIntentV1` |
| Read-only worker output | `WorkerResultV1`（prose 归 `untrusted_claims`） |
| Exact frozen execution state | `TaskFreezeReceiptV1` |
| Collaboration observation | `CoordinationSignalV1`（advisory only） |
| Knowledge succession | `WorkStateHandoffV1`（advisory only） |
| Context delivery proof | `HandoffAdoptionReceiptV1`（advisory only） |
| Module candidate | PublicationReceipt |
| Semantic acceptance | existing AcceptanceReceipt |
| Live provider readiness | existing MergeReadiness |
| Browser | redacted read projection |

## PRD Decomposition

### Child PRD A — Collaboration Substrate (Active planning target)

`plans/prds/20260828-2321-collaboration-substrate.prd.md`

Owns: Coordination Signal;
Work-State Handoff 与 adoption receipt;
collaboration actor / participant projection;
thread 与 lane discovery;
hotspot projection;
`CollaborationContextPacketV1`;
Work Exchange collaboration projection;
CLI/MCP collaboration surfaces;
Operator read model;
real multi-agent canary。

Does not own Review authority, Merge authority, or any Lease transition.

### Child PRD B — Independent Review and Verification Gates (Deferred — Phase 2)

`plans/prds/20260828-2321-work-exchange-independent-review.prd.md`

设计资产完整保留，激活受 Reviewer Supply Admission Gate 与 Revisit Trigger 约束。

### Child PRD C — Guarded Merge and Unattended Automation (Deferred — Phase 3)

`plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`

`MergeEligibilityV1` 设计保留但不实现，依赖 Phase 2 的独立 Review/Verification 与 provider merge capability canary。

## End-to-End Lifecycle

```text
Approved Work Graph → one execution owner
→ spawn/read parallel collaboration participants
→ participants publish signals and partial results
→ threads / hotspots / open requests emerge
→ next participants discover and build on prior signals
→ budget/context pressure creates WorkStateHandoff
→ successor adopts exact context
→ existing explicit Lease/takeover lifecycle
→ Publication
```

Review 与 Merge 在本版本中只作为未来扩展点出现在 Phase 5 / Phase 6，不参与 P0 生命周期。

## Granularity

### Work Package

一个 Work Package 应具备：one primary capability；one execution owner；one mutation surface；one publishable candidate；one rollback boundary；one acceptance policy set。

必须拆分：跨多个 primary capability；存在独立 rollback boundary；可并行且 path ownership 不重叠；有独立 interface/schema migration；verification 显著不同；一部分失败不应阻塞另一部分。

不应拆分：小函数或 checklist step；拆开后没有独立可验证结果；中间状态不可运行；coordination cost 高于工作本身。

### Collaboration Round

一轮协作由当前 writer 发起，包含一次 context packet 构建、一批 bounded read-only 参与者、一次 signal/handoff 收集与一次 thread/hotspot 重算。轮次是 `DelegatedRunIntentV1.round_index` 的自然扩展，不是同步聊天室。

### Handoff

handoff 由 budget、context、phase 完成、停滞或人工触发产生，不自动创建 Task，也不改变任何 Claim。

## Platform Surfaces

### CLI/MCP

- execution 继续使用现有 Engineer offers/acquire 与 `sprint release` / `fleet takeover`；
- 新增 collaboration read（exchange、threads、signals、handoffs、packet）；
- 新增 bounded collaboration write（post signal、publish handoff、record adoption）；
- authenticated actor 由服务端从 principal 推导，不接受调用方自述身份；
- 无 generic shell、无任意文件写、无 merge 命令。

### Operator Board

P0 只读显示：active lanes；recent discoveries；open handoffs；hotspots；contributors 与其参与形式；当前 writer。

不新增 signal、handoff、acquire、review、grant 或 merge 的浏览器写入。现有 task message composer 仍是唯一 browser write。

### Persistence

- signals、threads 投影、handoffs、adoption receipts、context packets 放在 git-common-dir 下独立 versioned root；
- 所有 store exact-schema、canonical JSON、immutable create、per-subject lock、idempotency、symlink-safe、fail closed；
- 不做 healthy-empty 回退。

## Success Criteria

| 指标 | 目标 |
|---|---:|
| Signal 写入改变 Task/Lease bytes | 0 |
| 同 capability 并行只读参与者 | 至少 3 |
| Handoff 被后继者采用 | 至少 1 个真实案例 |
| 后继者重复已记录 dead end | 0 次 |
| Context packet | ≤1,500 estimated tokens |
| Signal 来源可追溯 | 100% |
| Signal 进入权威流程但无显式 promotion | 0 |
| Work Exchange 相同输入输出 | byte-identical |
| 一个任务同时 writer 数 | ≤1 |

## Acceptance Scenarios

### Scenario 1 — Authority isolation

- **Given** 协作 store 已启用并写入 signal 与 handoff。
- **When** 对 Task、Lease、Publication、Acceptance 做 byte 对比。
- **Then** 四者字节完全不变。
- **Evidence** before/after digest 对照 fixture。

### Scenario 2 — Concurrent publication

- **Given** 三个不同 actor 同时发布 signal。
- **When** 写入完成。
- **Then** 三条 signal 全部持久化，同 id 同 payload 幂等，同 id 不同 payload 冲突。
- **Evidence** N-way 独立进程竞争。

### Scenario 3 — Emergent lane

- **Given** 多个 Agent 自行选择相同 `thread_key`。
- **When** thread 投影重算。
- **Then** 它们聚成一条 lane，系统未引入任何 lane 枚举。
- **Evidence** opaque key 聚合 fixture。

### Scenario 4 — Hotspot is not priority

- **Given** 一条 thread 有最高 hotspot 分数。
- **When** Work Graph 与 Lease eligibility 被重算。
- **Then** canonical priority 与 dependency 完全不变，只有发现排序变化。
- **Evidence** 排序 diff + 权威 digest 相等。

### Scenario 5 — Handoff adoption without acquire

- **Given** 一份 open handoff。
- **When** 另一个参与者采用它。
- **Then** 生成 `HandoffAdoptionReceiptV1`，不产生 Claim、不改 Lease generation。
- **Evidence** claim store 零写入。

### Scenario 6 — Dirty executor succession

- **Given** 当前执行者 worktree 脏且 checks 未验证。
- **When** 它发布 handoff 并请求交接。
- **Then** 必须先产出 `TaskFreezeReceiptV1`，随后走现有 release/takeover/acquire，后继者才能写入。
- **Evidence** freeze receipt + lease generation 变化记录。

### Scenario 7 — Untrusted injection

- **Given** context packet 注入某个参与者。
- **When** 渲染注入文本。
- **Then** 全部协作内容处于不可信包裹内，并携带固定 warning 文案。
- **Evidence** 渲染快照测试。

### Scenario 8 — Snapshot determinism

- **Given** 相同仓库字节与相同协作 store。
- **When** 两次采集 Work Exchange snapshot。
- **Then** 输出 byte-identical，采集期变化标记为 `changed_during_read`。
- **Evidence** 重复采集 digest 比对。

### Scenario 9 — Writer singularity

- **Given** 一个 Engineer 与三个只读参与者同时活动。
- **When** 检查写入面。
- **Then** 只有 Lease owner 修改 worktree、提交或发布。
- **Evidence** 参与者 sandbox 前后 protected snapshot 相等。

### Scenario 10 — Browser boundary

- **Given** 协作投影全部启用。
- **When** 清点 Operator server 路由。
- **Then** 仍只有 task message 一条写入路由。
- **Evidence** 路由清单 + UI 测试。

## Non-goals

- 不建立同步聊天室或复制完整 Provider transcript；允许异步、append-only、可搜索的自由文本 Coordination Signals。
- signals 与 handoffs 不是权威。
- 不引入多 writer。
- 不做自动合并。
- 不赋予 Agent 自主规划权。
- 不在 P0 建立同 capability 持久多席位身份。
- 不做 hosted control plane 或数据库。
- 不做跨仓库协作。
- 不做共享长期记忆权威。
- 不新增浏览器 mutation。

## Rollout

```text
Phase 0 — Collaboration authority freeze
Phase 1 — Signals and handoffs
Phase 2 — Multi-participant discovery and context injection
Phase 3 — Real task canary
Phase 4 — Decide whether persistent multi-seat is needed
Phase 5 — Revisit independent gates
Phase 6 — Revisit guarded merge
```

Phase 4 的判定输入来自 C9 canary。Phase 5 的准入条件写在 Child PRD B 的 Reviewer Supply Admission Gate 与 Revisit Trigger。Phase 6 依赖 Phase 5 已激活。

## Multi-Seat Decision Gate

P0 冻结的参与者模型：

```text
一个 capability
  → 一个持久 Module Engineer
  → 一个当前 writer / Lease owner
  → N 个 read-only collaboration participants
      (explorer / root-cause-prover / deep-reasoner / critic / reproducer / summarizer)
```

参与者可以是当前 Engineer Session、delegated read-only WorkerRun、native read-only subagent 或 Human operator。只有当前 Lease owner 是 writer。

只有在真实 canary 之后出现下列任一条件，才启动 persistent multi-seat `EngineerSeatV2` PRD：

- 多个同 capability 的长期 Session 必须独立存活；
- bounded delegated rounds 的交接延迟成为实测瓶颈；
- 一个 Engineer Binding 无法承担多个并行工作包；
- 同 capability 需要多个独立 Task Claim owner；
- formal same-capability peer review 成为真实需求。

## Kill Gates

Stop promotion if:

- 任何第二个 Task/Lease/Publication/Acceptance 权威出现；
- signal 或 handoff 能在没有显式 promotion 的情况下改变权威状态；
- adoption 隐式产生 Claim 或转移 Lease；
- hotspot 影响 canonical priority、dependency 或 Lease eligibility；
- 同一任务出现第二个 writer；
- 协作 store 不可读时被当作健康空集；
- context packet 注入未标记 untrusted；
- Operator Board 新增任何写入路由；
- 协作层需要 LLM 推断状态才能工作；
- signal 噪声使 context packet 无法在预算内保持有用。

## Performance Targets

| Target | Number |
|---|---:|
| Collaboration Work Exchange snapshot | p95 ≤3 s local |
| Signal append uncontended | p95 ≤500 ms |
| Thread/hotspot 重算，1,000 signals | p95 ≤1 s |
| Context packet build | p95 ≤1 s |
| Context packet 注入体积 | ≤1,500 estimated tokens |
| Operator payload at 100 WPs | ≤2 MiB |

## Known Unknowns

| Item | Impact | Resolution |
|---|---|---|
| Signal 信噪比 | context packet 可能被噪声填满 | canary 记录 never-read/cited/adopted 比例 |
| 同 capability 持久席位 | 可能需要 EngineerSeatV2 | C9 决策门 |
| native subagent 结构化输出 | contribution draft 可能不稳定 | 先只支持 delegated Worker 与 Human |
| handoff 粒度 | 太粗无用、太细昂贵 | 真实任务上迭代 |
| 跨 capability 协作 | 超出 P0 边界 | Interface Change Request 仍是唯一通道 |
| Reviewer supply | Phase 2 前置条件 | Child PRD B admission gate |
| Provider merge capability | Phase 3 前置条件 | Child PRD C canary |

## Developer Handoff

- 先做 Child PRD A，从两平面权威冻结开始。
- 复用现有 delegation：`mode` 只有 `read_only`，`max_depth` 固定 0，单次 run 的 `max_turns` 在协议里被钉为 1，多轮通过 `round_index` 表达。
- 复用 `DelegatedRunIntentV1.context_packet_sha256` 记录某次 run 实际收到的协作上下文。
- 复用 Task/Module Message 的 untrusted 包裹模式，不要发明新的 prompt-trust 模型。
- 不移动现有 scheduling/publication/acceptance 代码，除非两个消费者证明了共享抽象。
- 每个新 mutation 都是独立 contract/PR 边界。
- Review 与 Merge 代码在本程序内保持零改动。
- 验证面：exact-schema 测试、多进程竞争、零写入 digest 证明、注入渲染快照、全量测试、typecheck、operator build、workflow checks 与 ArchContext acceptance。

## Source Basis

- `docs/spec.md`
- `.ai/harness/policy.json`
- `src/core/engineers/scheduling.ts`
- `src/core/engineers/profile-binding.ts`
- `src/core/engineers/delegation.ts`
- `src/core/engineers/task-freeze.ts`
- `src/core/engineers/module-message.ts`
- `src/core/engineers/principal-claim.ts`
- `src/core/fleet/task-message.ts`
- `src/effects/engineers/delegated-run-store.ts`
- `src/effects/engineers/bound-task-rotation.ts`
- `src/effects/engineers/task-freeze-store.ts`
- `src/effects/fleet/task-inbox.ts`
- `src/core/publication/publication-receipt.ts`
- `src/core/fleet/board.ts`
- `src/core/operator/fleet-snapshot.ts`
- `src/effects/operator/server.ts`
- `scripts/session-context-packet-panel.ts`
