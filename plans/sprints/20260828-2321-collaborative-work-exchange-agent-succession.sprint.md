# Sprint: Collaborative Work Exchange and Agent Succession

> **Status**: Done
> **Slug**: `collaborative-work-exchange-agent-succession`
> **Created**: 2026-08-28T23:21:55-07:00
> **Updated**: 2026-09-04 18:52
> **Source PRD**: `plans/prds/20260828-2321-collaborative-work-exchange-agent-succession.prd.md`
> **Child PRD A (Active)**: `plans/prds/20260828-2321-collaboration-substrate.prd.md`
> **Child PRD B (Deferred — Phase 2)**: `plans/prds/20260828-2321-work-exchange-independent-review.prd.md`
> **Child PRD C (Deferred — Phase 3)**: `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`
> **Child PRD D (Approved — Phase 1 Runtime Transport)**: `plans/prds/20260830-1827-provider-neutral-agent-runtime-adapter.prd.md`
> **Source Spec**: `docs/spec.md`
> **Baseline**: `main@456731f308b7ad54585ac50acbc510350a4c563c`
> **Goal Mode**: incremental
> **Program Strategy**: authority freeze → signals/handoffs → discovery → real canary → multi-seat decision；R1 runtime transport 由 Child PRD D 独立加入
> **Default Feature State**: all new mutation disabled
> **Backlog Schema**: 2

Program-level sprint container. Collaboration backlog C0–C9 belongs to Child
PRD A; R1 belongs to Child PRD D and joins the program before C8/C9. Each
contract row is an independent merge and rollback boundary.
Do not combine the signal store, the succession path and the Operator view into
one branch.

> **Delivery closure**: Canonical backlog rows C0-C9 and R1 are 11/11 done;
> the Execution Log is the delivery record. Unchecked lists inside the detailed
> work-package descriptions below are the original acceptance decomposition,
> not a second task-status authority. Phase 2 and Phase 3 live in their deferred
> child PRDs and are not part of this completed sprint.

## PRD

### Problem

repo-harness 已经拥有确定性的 execution offers、Lease、WorkEnvelope、
Publication、Acceptance、read-only delegation 与 `TaskFreezeReceiptV1`。缺的是：

- 一个可发布、可发现的部分知识载体；
- attempted paths 与 dead ends 的结构化记录；
- 同 capability 多个只读参与者之间的共享看板；
- budget/context 压力下可寻址的知识交接；
- 一个把协作发现与交付权威严格隔离的边界。

### Users

- Module Engineer / 当前 writer
- Collaboration Participant（delegated read-only Worker / native subagent / Human）
- Successor Engineer
- Maintainer / Human Operator
- Program Orchestrator

### Success Criteria

- 协作写入对 Task/Lease/Publication/Acceptance 的字节影响为 0；
- 同 capability 至少 3 个并行只读参与者，且第 4 个并发请求在 `max_parallel_readers` 被拒；
- 至少一次真实 handoff 被后继者采用，且多采用者并存不冲突；
- 后继者重复已记录 dead end 的次数为 0；
- context packet ≤1,500 estimated tokens；
- Work Exchange 相同输入 byte-identical；
- 任意时刻单任务 writer 数 ≤1；
- Board 仍只有既有 task-message 一条写入路由。

### Acceptance Scenarios

见 umbrella PRD scenarios 1–10、Child PRD A scenarios 1–12 与 Child PRD D
scenarios 1–7。每一行必须写明
它关闭哪些 scenario。

### Non-goals

- 无同步聊天室，无 transcript 复制；
- 无 closed 协作语义词表，无 lane 枚举；
- 无多 writer，无隐式 task 转移；
- 无 Review / Verification gate（Phase 2）；
- 无 merge 与 provider mutation（Phase 3）；
- 无浏览器写入；
- 不重写 WorkGraph、Lease、PublicationReceipt、AcceptanceReceipt 或 DelegationEnvelope。

## Architecture Notes

### Capabilities Touched

Existing:

- `capability.runtime-harness.engineer-scheduling`
- `capability.runtime-harness.engineer-bindings`
- `capability.runtime-harness.engineer-messages`
- `capability.runtime-harness.engineering-overlay`
- delegation / publication / operator-web capabilities
- `capability.runtime-harness.agent-runtime-effects`（已接受替换原 `provider-thread-effects` identity；当前 node 暂以 V1 source selectors 提供实施前证据，R1 必须一次性完成 product/protocol rename）

New:

- `capability.runtime-harness.collaboration`

Phase 2 / Phase 3 的 `independent-review`、`guarded-merge`、`program-automation`
capability 不在本 Sprint 创建。

### Dependency Order

```text
C0 → C1
C1 → C2, C1 → C3
C1 + C3 → C4
C3 + C4 → C5
C1 + C2 + C3 + C4 + C5 → C6 → C7 + C8 → C9-A → C9-B / Decision
ME-1C + ME-3A + C6 → R1
```

C1 独占共享 schema 机制：`src/core/collaboration/common.ts` 里的 actor union、scope refs、
evidence refs、ID、时间戳与 digest helper 全部由 C1 落地并冻结。C3 与其他行只消费，
不与 C1 并行改这些结构。

### Parallelism

Allowed:

- C2 与 C3 在 C1 冻结 `common.ts` 之后可并行，文件不相交；
- C7 与 C8 在 C6 冻结 snapshot 契约后可并行（已按此收口）；
- R1 与已完成的 C7/C8/C9 无执行顺序依赖，作为 Child PRD D 的独立合同行推进。

Forbidden:

- 两个 writer 同时改 `src/core/collaboration/*`；
- C3 与 C1 并行改共享 schema；
- C4 在 C1 与 C3 冻结之前落地 collector 事务；
- UI 与 server 协议分开落地；
- 协议文件仍在移动时做 architecture restamp。

### Global Invariants

- adapters first；不提前搬移既有文件；
- 新协议 exact-key、content-addressed；
- 相同字节产生相同 digest；
- 所有 changed-during-read 状态 fail closed；
- actor 一律服务端从 principal 推导；
- 所有注入内容带不可信包裹；
- 协作层零 Task/Lease/Publication/Acceptance 写入；
- 本 Sprint 不新增任何 Operator Board 写入路由；
- 本 Sprint 自身的改动不进入任何自动合并路径。

### Program Feature Flags

```jsonc
{
  "collaboration": { "mode": "off" },
  "agent_runtime": { "mode": "off", "tmux-cli-agent": "disabled" },
  "independent_review": { "mode": "off" },
  "guarded_merge": { "mode": "disabled" },
  "program_automation": { "mode": "disabled" }
}
```

Promotion order:

```text
off → shadow
shadow → active
```

No step skips a state。`independent_review` 与 `guarded_merge` 在本 Sprint 内保持
默认关闭且不接线。

## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | 309d876dd19f864bd3c0a38d2061f553879155b7f8dc47a5cf42521bb84b4312 | [x] | C0 — freeze collaboration/delivery two-plane authority | contract | Architecture request 明确 signals/handoffs/participants 无 Task、Lease、Publication、Acceptance authority；现有 `DelegatedRunIntent.context_packet_sha256` 真实语义冻结；`CollaborationRunContextBindingV1` 决策完成；P0 actor 支持矩阵完成；delegation policy bridge 设计完成；admission 决策表与测试向量冻结（`max_parallel_readers=3`；active readers 0/1/2 放行、3 拒绝；reader 状态陈旧或未知 fail closed）；baseline 负面证明记录在案（当前 `admitReadOnlyDelegation()` 不消费 `delegation_policy`）；ArtifactRef 复用决策完成；现有 authority bytes 不变 | `plans/archive/plan-20260829-1853-c0-two-plane-authority-freeze.md` |
| 2 | de6acec87732c3098082a6fa4d13e79d5503d449cf50211d243b55e46a79161e | [x] | C1 — `CoordinationSignalV1` schema, `common.ts` and append-only store | contract | signal ID 与记录时间由 Host/Server 派生；记录时间对重试稳定：delegated 贡献取该次运行精确的 process receipt / 持久化观测时间，直接发布在第一次 idempotency 事件里冻结时间，重试复用已记录值、绝不重采墙钟；每条 signal 身份级原子写；supersede 仅限同 actor lineage；source refs 必须已存在且同仓库；scope refs 携带 revision；`common.ts` 归 C1 独占；三个 actor 可并发发布；同 id 同 payload 幂等；不同 payload 冲突；Task/Lease bytes 零变化 | `plans/archive/plan-20260829-2137-c1-coordination-signal-store.md` |
| 3 | 82103e3da659fb101defa8ce5c836fc4bdd554b67d7e00d3f7ec07d22a4ce716 | [x] | C2 — signal threads, discovery and hotspot projection | contract | opportunity 只用结构化闭集理由（`open_request` / `unverified_hypothesis` / `stalled_thread` 已移除）；检索理由为闭集代码；利用/探索配额生效；digest 不含墙钟；`recent_activity` 与 hotspot 的新近度相对 source snapshot 里的最新事件计算（确定性 epoch），不读运行时墙钟；同输入 byte-identical；thread 由 opaque key 聚合；top-K context ≤1,500 tokens；无 LLM 状态推断 | `plans/archive/plan-20260830-0121-c2-thread-hotspot-projection.md` |
| 4 | e27fd4548c0391e4ac921e726938a5338a6c0c6eabec992b79696c405bce2c9b | [x] | C3 — `WorkStateHandoffV1` and adoption receipts | contract | handoff 包含 attempted paths、dead ends、findings、next actions；`execution_context` 判别联合；receipt 带 `handoff_sha256`；多对多采用成立且同采用者幂等；协议与文案不使用 claim 词汇；adoption 不创建 Claim | `plans/archive/plan-20260830-0120-c3-work-state-handoff-adoption.md` |
| 5 | 1f44ba45de1df0adf4cccd20e65d64cf971b005f1ab3cf0363a3173a326bff3a | [x] | C4 — delegated Worker contribution adapter | contract | draft 只来自持久化 stdout 的 versioned adapter；`CollaborationContributionCommitV1` 为可见性边界；每个持久化边界的故障注入都收敛；WorkerResult exactly-once；`max_parallel_readers` 在准入期真正生效；每个角色都要 tracked LogicalRoleProfile；本行独占真实运行时 canary：3 个真实并行 reader 放行、第 4 个真实请求在 `max_parallel_readers=3` 被桥拒绝、完成或失败的 reader 正确释放名额、reconciliation_required 与状态不确定的 reader 按 C0 冻结规则处理；writer 数仍为 1 | `plans/archive/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md` |
| 6 | 76ba87d2a64a18f17e4917d870ac335e4138a3587dd770a949769af3624edeed | [x] | C5 — TaskFreeze / explicit takeover succession integration | contract | dirty executor 先 freeze；handoff 不转移 Lease；successor 只有经现有 release/takeover/acquire 才可写 | `plans/archive/plan-20260830-0858-c5-taskfreeze-succession-integration.md` |
| 7 | 8879e88ac06237eaf71d9fe13e5dcb070dceac9bf1713a58ebf7c05f3e165ba1 | [x] | C6 — collaboration-centric Work Exchange and ContextPacket | contract | packet 带 `source_snapshot_sha256`、截断证据、`estimator_version` 与 canonical render SHA；`CollaborationRunContextBindingV1` 落地，且它是 collaboration-mode delegated run 的必需派发闸门：派发前校验 binding 存在、与当前 intent 和 execution packet 匹配、引用协作 packet、render digest 与组合后的 goal 一致，缺失或陈旧一律 fail closed，不是可选审计元数据；显示 existing execution offers、participants、threads、signals、handoffs、opportunities；snapshot fail-loud | `plans/archive/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md` |
| 8 | 935f48c4523b248073e20e315883a75216cd2d857a1214e9ec2ba74b5c5066ff | [x] | C7 — CLI/MCP and bounded context injection | contract | authenticated actor 由服务端推导；Engineer 可 post；Worker 由 Host collector post；全部 context 标记 untrusted | `plans/archive/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md` |
| 9 | 64d764b6f0ff0d9450efa5a46328554e799b19d67e9853d4cbffb90132b0e5d2 | [x] | C8 — read-only Operator collaboration surface | contract | 展示 lanes、discoveries、handoffs、hotspots、contributors；task message 仍是唯一 browser write | `plans/archive/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md` |
| 10 | 713faba2363d48603cfbb0b81eca578c239e18fd1474dcf22a8c175fa0232349 | [x] | C9 — real multi-agent canary and multi-seat decision | contract | C9-A 可行性通过；C9-B 重复证据成立；aggregate compute/cost 记录完整；usefulness rubric 开跑前冻结；跨臂污染防护到位；零 authority drift；输出 persistent multi-seat go/no-go | `plans/archive/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md` |
| 11 | 938bc73de481a09e96d1d5e2346423d79de16f5b66e20259badb8b1767399e90 | [x] | R1 — provider-neutral runtime effect and optional tmux endpoint adapter | contract | exact Task/Module message refs；existing Binding/Claim fence；tmux only carries bounded control ref；structured ACK；lost-ACK reconciliation；zero fallback；zero authority drift | `plans/archive/plan-20260830-1903-r1-provider-neutral-agent-runtime.md` |

## Detailed Work Packages

### C0 — Two-Plane Authority Freeze

**Purpose**

在写任何 store 之前固定协作平面与交付平面的边界。

**Tasks**

- [ ] 记录 baseline commit 与协议清单。
- [ ] 为 `capability.runtime-harness.collaboration` 创建 architecture request。
- [ ] 完成 P1 全局架构与 P2 数据流追踪：
  - Work Graph → `EngineerOfferV1`；
  - `DelegationEnvelopeV1` → `WorkerRunRefV1` → `WorkerResultV1`；
  - `TaskFreezeReceiptV1` → `sprint release` / `fleet takeover` / `fleet acquire`；
  - Task/Module Message → untrusted 注入渲染。
- [ ] 冻结非 mutation 断言：Task、Lease、Publication、Acceptance、Operator 路由清单。
- [ ] 冻结现有 `DelegatedRunIntent.context_packet_sha256` 语义：它承载 ExecutionPacket 摘要，`prepareDelegatedRun()` 与 `intentForDispatch()` 两处断言不变。
- [ ] 完成 `CollaborationRunContextBindingV1` 决策：协作 provenance 走加法绑定，不 bump Delegation 协议。
- [ ] 完成 P0 actor 支持矩阵：`module_engineer` / `delegated_worker` Supported，`human_operator` Deferred，`native_subagent` Unsupported。
- [ ] 完成 delegation policy bridge 设计：`allowed_roles` 与 `max_parallel_readers` 如何在准入期生效。
- [ ] 冻结 admission 决策表与测试向量：`max_parallel_readers=3`；active readers 0 / 1 / 2 放行；active readers 3 拒绝；reader 状态陈旧或未知一律 fail closed。
- [ ] 记录 baseline 负面证明：当前 `admitReadOnlyDelegation()` 不消费 `delegation_policy`，`max_parallel_readers` 今天只是 profile 里的声明值。真实运行时拒绝由 C4 的桥产生，本行不主张。
- [ ] 完成 ArtifactRef 决策：复用现有 `WorkerResult` `{ ref, sha256 }` 校验器，不引入重复引用类型。
- [ ] 冻结 store roots、lock 策略与 canonical JSON 机制。
- [ ] 冻结 feature flag 与降级模式。
- [ ] 明确拒绝 P0 内的同 capability 持久多席位。
- [ ] 明确 Review 与 Merge 在本 Sprint 内零改动。

**Expected files**

```text
plans/prds/*
plans/sprints/*
docs/architecture/requests/*
docs/researches/*
tasks/workstreams/runtime-harness/*
```

**Acceptance**

架构请求被接受；无运行时源文件变更；契约测试枚举现有权威协议版本；上述各项决策全部有明确结论，C1 之后不留待定项。admission 侧只做模型层验收：决策表与测试向量冻结、baseline 负面证明在案；本行不主张任何真实运行时拒绝，真实并发 canary 归 C4。

**Rollback**

批准前删除计划产物；批准后以 supersede 取代静默编辑。

---

### C1 — Coordination Signal Store

**Purpose**

给协作观察一个 append-only、可寻址的载体。

**Tasks**

- [ ] 新增 `src/core/collaboration/common.ts`，独占共享 schema 机制：actor union、scope refs、evidence refs、ID、时间戳、digest helper。
- [ ] 新增 `src/core/collaboration/signal.ts`，实现 exact-key 校验与 canonical digest。
- [ ] 实现 `CollaborationActorRefV1` 判别联合（P0 只有 `module_engineer` 与 `delegated_worker`）与带 revision 的 `CollaborationScopeRefV1`。
- [ ] `ArtifactRefV1` 直接复用现有 `WorkerResult` `{ ref, sha256 }` 校验器。
- [ ] signal ID 与记录时间由 Host/Server 派生，不接受调用方提供。
- [ ] 记录时间对重试稳定：delegated 贡献取该次运行精确的 process receipt / 持久化观测时间；直接发布在第一次 idempotency 事件里冻结时间；重试复用已记录的时间，绝不重采墙钟。
- [ ] 每条 signal 以身份级原子写落盘，不做批量部分可见。
- [ ] supersede 只允许同 actor lineage 内进行，且目标必须存在。
- [ ] `source_signal_ids` 引用的 signal 必须已存在且同仓库。
- [ ] 实现传输上限：title ≤256 bytes、body ≤8 KiB、labels ≤12、scope refs ≤8、artifact refs ≤8、source signals ≤16。
- [ ] 实现 append-only store 与 per-thread lock。
- [ ] actor 一律服务端从 principal 推导，忽略调用方自述。
- [ ] 加入零 Task/Lease 写入证明。

**Tests**

- [ ] canonical ordering；
- [ ] unknown field 拒绝；
- [ ] digest 不一致；
- [ ] 各项上限边界；
- [ ] 同 id 同 payload 幂等 / 不同 payload 冲突；
- [ ] N-way 独立进程并发 append；
- [ ] supersede 目标缺失或跨 actor lineage；
- [ ] source ref 不存在或跨仓库。

**Acceptance**

三个 actor 并发发布全部成功；权威 store 字节零变化；`common.ts` 冻结后其他行只消费不修改。

**Rollback**

`collaboration.mode=off`；已写 signal 成为惰性审计记录。

---

### C2 — Threads, Discovery and Hotspots

**Purpose**

从 opaque thread key 派生 lane 与注意力排序。

**Tasks**

- [ ] 实现按 `thread_key` 完全相等的聚合，不做近似合并。
- [ ] 实现 `CollaborationThreadSnapshotV1`。
- [ ] 实现确定性 hotspot 函数（独立贡献者数、近期活动、artifact refs、低 contributor 覆盖度、unadopted handoff、跨 thread 引用）。
- [ ] 实现 `ContributionOpportunityReason` 结构化闭集：`unadopted_handoff` / `low_contributor_coverage` / `cross_thread_reference` / `recent_activity` / `artifact_rich_thread` / `exploration_slot`。
- [ ] 不实现 `open_request`、`unverified_hypothesis`、`stalled_thread`：薄 signal 协议支撑不了这些语义推断，它们只能作为无系统语义的开放 label 存在。
- [ ] 实现 `RelevantSignalV1` 的闭集检索理由与 `matched_refs`。
- [ ] 实现确定性利用/探索配额（默认 60/40，低覆盖 thread 与 unadopted handoff 有固定名额）。
- [ ] 投影里的任何 digest 都不含墙钟输入。
- [ ] `recent_activity` 与 hotspot 的新近度相对 source snapshot 里的最新事件计算，以它为确定性 epoch，不读运行时墙钟。
- [ ] 实现 top-K 选择与 1,500 estimated tokens 预算截断。
- [ ] 断言 hotspot 不进入 Work Graph priority、dependency、Task state、Lease eligibility。
- [ ] 采集期变化标记 `changed_during_read`，分片不可读标记 `degraded`。

**Acceptance**

相同输入 byte-identical；hotspot 变化不改变任何 canonical 权威 digest；最热 thread 吃不掉全部上下文名额。

**Rollback**

移除投影消费者；signal store 保持独立可读。

---

### C3 — Work-State Handoff and Adoption

**Purpose**

让一次运行的知识在 budget 耗尽后仍然可用。

**Tasks**

- [ ] 实现 `WorkStateHandoffV1` schema，强制 `attempted_paths`、`dead_ends`、`key_findings`、`next_actions` 字段存在。
- [ ] 实现 `HandoffExecutionContextV1` 判别联合（`delegated_worker` / `bound_task` / `publication` / `none`）与各分支引用的绑定校验。
- [ ] 实现 `HandoffAdoptionReceiptV1`，字段含 `handoff_sha256`；receipt 身份 = handoff SHA + adopter actor SHA + context packet SHA。
- [ ] 实现多对多采用：不同采用者各自成功，同采用者相同三元组幂等。
- [ ] 消费 C1 冻结的 `common.ts`，不在本行修改共享 schema。
- [ ] 协议、CLI、投影与文案里不使用 claim 词汇描述知识采用。
- [ ] 实现 supersede 语义。
- [ ] 断言 adoption 零 Claim 写入、零 Lease generation 变化。
- [ ] 加入 trigger 闭集：`budget_low` / `context_pressure` / `phase_complete` / `stalled` / `manual`。

**Acceptance**

handoff 内容完整可校验；同一份 handoff 被多个采用者采用全部成立；adoption 不创建 Claim。

**Rollback**

关闭 handoff 写入；已写 handoff 成为惰性记录。

---

### C4 — Delegated Worker Contribution Adapter

**Purpose**

用现有 read-only delegation 承载同 capability 多参与者，不新增 Engineer identity。

**Tasks**

- [x] 定义 `CollaborationContributionDraftV1`、`CollaborationContributionCommitV1` 与 Host collector 事务。
- [x] draft 只能来自该次运行精确持久化的 stdout / process receipt，经带版本的 provider-output adapter 解析；拒绝调用方递交的自称 Worker 输出。
- [x] 整份 draft 全量校验通过之后才允许任何可见写入。
- [x] signal / handoff ID 由 `WorkerRunRef` + 条目下标确定性派生。
- [x] 候选条目先落不可变盘，再以 contribution commit 作为唯一可见性边界；投影只读已提交贡献。
- [x] `WorkerResultV1` 恰好构造一次并引用该 commit。
- [x] 解析失败为显式 typed rejection：正常 WorkerResult 仍持久化，零部分可见 signal，绝不合成空贡献或成功假象。
- [x] 实现 `CollaborationDelegationAdmissionV1` 桥：解析 profile/binding/principal、载入 tracked LogicalRoleProfile、在锁内按 parent claim + round_index 统计 active readers、强制 `active_readers < max_parallel_readers`，再进 `admitReadOnlyDelegation()`。
- [x] 从 `WorkerRunRefV1` 与 admission receipt 推导 actor，忽略 draft 内的身份声明。
- [x] 不 bump `DelegationEnvelopeV1`，不放宽 `max_turns`；要验证的是单轮贡献是否有用、多轮累积能否补上深度、每轮 packet 是否保持小而聚焦、多轮启动成本是否吃掉收益。
- [x] 使用既有 `ENGINEER_DELEGATION_ROLES` 闭集；除非本行的真实 canary 证明需要独立 role instructions，否则不扩枚举。

**Tests**

- [x] 在每个持久化边界注入故障（signal 1 之后、signal N 之后、handoff 之后、commit 之前、commit 之后、WorkerResult 之前、WorkerResult 之后），重试后收敛到一条可见 commit、一个 WorkerResult、零重复 signal；
- [x] 不可解析 draft 的 typed rejection 负例；
- [x] 真实运行时 canary：同一 parent claim 下 3 个真实并行 reader 全部被桥放行，第 4 个真实请求在 `max_parallel_readers=3` 被拒；
- [x] 完成与失败的 reader 都正确释放名额，释放后新请求可再次放行；
- [x] `reconciliation_required` 与状态不确定的 reader 名额按 C0 冻结的决策表处理（陈旧或未知一律 fail closed）。

**Acceptance**

本行独占真实运行时 admission canary：3 个同 capability read-only Worker 真实并行放行、第 4 个真实请求被桥拒绝、完成或失败的 reader 释放名额、不确定 reader 按 C0 冻结规则 fail closed；参与者 protected snapshot 前后相等；writer 数仍为 1。

**Rollback**

关闭 collector；delegation 路径回到现状。

---

### C5 — Succession Integration

**Purpose**

把知识交接与执行权交接分开，且都走既有权威路径。

**Tasks**

- [ ] 实现只读交接路径：`WorkerResult` + handoff → store → 后继 ContextPacket → adoption receipt。
- [ ] 实现绑定执行者交接路径：脏或未验证时先 `TaskFreezeReceiptV1`，再走 `sprint release` / `fleet takeover` / `fleet acquire`。
- [ ] 脏 worktree 未冻结即请求交接时拒绝。
- [ ] 断言协作层不做后继者选举，`TaskFreezeReceiptV1` 不含后继者字段。
- [ ] 断言 handoff 不改 Lease generation。
- [ ] 覆盖 `assertNoLiveClaimForBindingRotation` 的 `bound_task_active` 交互。

**Acceptance**

后继者只有经现有 release/takeover/acquire 才可写入。

**Rollback**

关闭交接接线；TaskFreeze 与 Lease 生命周期保持现状。

---

### C6 — Collaborative Work Exchange and Context Packet

**Purpose**

一个纯读模型，把执行 offer 与协作状态放在同一张快照里。

**Tasks**

- [ ] 实现 `CollaborativeWorkExchangeSnapshotV1`。
- [ ] `ExistingEngineerOfferProjection` 原样携带 `EngineerOfferV1` 与 `offer_revision`。
- [ ] 实现 `active_participants` 投影。
- [ ] 实现 `CollaborationContextPacketV1` builder：绑定 `source_snapshot_sha256`、记录 `estimator_version` 与 `budget_estimated_tokens`、确定性截断并写 `truncated` 与 `omitted_signal_count`、输出 canonical `rendered_context_sha256`。
- [ ] `built_at` 不进内容摘要，投递时间落在 run-context binding 与 adoption receipt 上。
- [ ] 实现 `CollaborationRunContextBindingV1`：记录 dispatch、intent、execution packet、协作 packet、render、base/composed goal 的摘要。
- [ ] 把 binding 作为 collaboration-mode delegated run 的必需派发闸门：派发前校验 binding 存在、与当前 intent 和 execution packet 匹配、引用协作 packet、`rendered_context_sha256` 与组合后的 goal 一致；缺失或陈旧一律 fail closed。它不是可选审计元数据。
- [ ] 对每个可变来源做 double-read。
- [ ] `snapshot_consistency` 非 `stable` 时 fail loud。
- [ ] 基准测试 100 Work Packages / 10 Engineers。
- [ ] 证明零文件系统写入。

**Acceptance**

现有 execution offer payload 与 revision 不变；快照确定性通过；同一 store 重建的 packet 字节同一。

**Rollback**

`collaboration.mode=off`；无持久状态需要迁移。

---

### C7 — CLI/MCP and Bounded Context Injection

**Purpose**

给 Agent 一个受限的读写面，并把注入信任边界钉死。

**Tasks**

- [ ] 新增 `repo-harness collaboration` 子命令族（exchange / threads / signals / post / handoff publish|list|adopt / packet build）。
- [ ] CLI 不接受自述身份参数，actor 由 `--authorization-id` 解析出的 principal 决定。
- [ ] 新增 Engineer MCP collaboration 工具集。
- [ ] Worker 侧不暴露写工具，只输出 draft。
- [ ] 实现 `[CoordinationContextUntrusted]` 包裹与固定 warning 文案。
- [ ] 断言工具集不含任意文件写、generic shell、task acquire/release、publication、acceptance、merge。
- [ ] 注入体积 ≤1,500 estimated tokens。

**Acceptance**

全部注入内容带不可信标记；Worker 无法自述身份。

**Rollback**

移除命令与工具注册；store 保持可读。

---

### R1 — Provider-Neutral Runtime Effect and Optional tmux Endpoint Adapter

**Purpose**

让一个已经持久化的 Task/Module message 可以安全地通知不同本地 harness
Agent，同时保持消息、身份、Task 与 Board 权威不变。

**Tasks**

- [ ] 冻结 provider-neutral runtime-effect protocol 与显式一次性迁移；closed adapter union 只含 `codex-app-thread | tmux-cli-agent`。
- [ ] 复用 existing `EngineerBindingV1` endpoint tuple，不新增第二 Binding store 或 `tmux_agent` actor。
- [ ] 引入 exact Task/Module message reference；Task 分支绑定 task revision + Claim generation，Module 分支绑定 Engineer Binding generation。
- [ ] tmux Host action 只携带 bounded inbox control reference，不携带 message body，不开放 generic shell。
- [ ] tmux command success 只到 `effect_started`；positive success 必须关联 exact inbox/wrapper receipt。
- [ ] 保留 ME-3A persist-first、one-action、Binding fence 与 lost-ACK `reconciliation_required`。
- [ ] capability unavailable/unsupported 时 fail closed；禁止跨 adapter fallback。
- [ ] adversarial pane output 不产生 acknowledgement、Task state、signal、handoff、Acceptance 或 completion evidence。
- [ ] 投影 server-owned delivery/runtime state，供 C8 只读消费并脱敏 endpoint 诊断。
- [ ] 运行一个 already-bound tmux endpoint canary 与一个 Codex App Thread control。

**Acceptance**

duplicate Agent-visible delivery 0；direct tmux message-body delivery 0；unknown
effect retry 0；stale Claim/Binding Host action 0；runtime-only authority bytes
零变化；tmux 缺失是 typed unavailable 而不是降级到另一 adapter。

**Rollback**

`agent_runtime.mode=off` 并禁用 `tmux-cli-agent`；existing Codex App Thread
adapter 与 message stores 保持可读。协议迁移不得依赖运行时 shape guessing。

---

### C8 — Read-Only Operator Collaboration Surface

**Purpose**

让协作对 Human 可读，且不引入任何写入。

**Tasks**

- [ ] 新增 browser-safe collaboration snapshot（GET only）。
- [ ] 脱敏本地路径与 provider 诊断。
- [ ] 展示 lanes、recent discoveries、open handoffs、hotspots、contributors、当前 writer。
- [ ] 展示 server-owned `pending | delivered | acknowledged | failed | reconciliation_required` 与 `reachable | unavailable | unknown`；runtime 状态只影响 attention/diagnostics，不改变 Task column。
- [ ] 展示 snapshot consistency 与降级原因。
- [ ] 保持 attention-first 布局与刷新后的选中态。
- [ ] 扩展 zh/en 词表。
- [ ] 断言路由清单仍只有既有 task-message 一条写入路由。

**Acceptance**

UI 呈现全部新状态且不在客户端推导语义、不新增 mutation。

**Rollback**

移除 GET 路由与面板；现有 Board 保持可用。

---

### C9 — Real Multi-Agent Canary and Multi-Seat Decision

**Purpose**

用一个真实任务证明协作是否真的省了预算，并回答是否需要持久多席位。

**Canary setup**

- [ ] 选一个真实但权威安全的任务（复杂 bug hunt、架构影响面调研、性能根因、跨文件协议追踪、大规模测试失败诊断）。
- [ ] Baseline arm：一个 Agent 独立完成。
- [ ] Treatment arm：一个 Module Engineer + 三个只读参与者（至少一个 already-bound `tmux-cli-agent` endpoint 与一个 Codex App Thread control）+ signal board + 一次后继者 handoff。
- [ ] 设置跨臂污染防护：baseline 的发现不得进入 treatment 的 store、context packet 或提示，反向亦然。
- [ ] 开跑之前冻结 usefulness rubric，跑完不改判定标准。

**Two levels**

- [ ] C9-A 可行性：一个真实任务、三个参与者、至少一次 signal 复用、至少一次 handoff adoption、writer 恒为 1、零 authority drift。
- [ ] C9-B 决策证据：至少三个匹配的真实任务，或三份冻结 fixture / 重复运行，或同一任务的多次隔离重放。

**Measures**

- [ ] aggregate input/output tokens 与 wall-clock；
- [ ] useful findings per 10k tokens；
- [ ] time to first useful finding 与 time to first adopted finding；
- [ ] duplicate dead-end rate；
- [ ] signal reuse（`source_signal_ids` 引用数）；
- [ ] handoff adoption 次数与 handoff restart cost；
- [ ] never-read signal rate；
- [ ] 每次注入的 context 体积；
- [ ] runtime delivery latency、acknowledgement latency 与 reconciliation outcome；
- [ ] Task/Lease/Publication 字节不变；
- [ ] 任意时刻 writer 数 ≤1。

**Tasks**

- [ ] 运行 baseline 与 treatment 两臂并记录全部指标。
- [ ] 运行 N-way signal 并发与 handoff 竞争。
- [ ] 运行全量 unit/effects/CLI/MCP/operator 套件。
- [ ] 运行 `bun test --timeout 60000`。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`。
- [ ] 运行 `bun run build:operator-web`。
- [ ] 运行 strict task workflow checks。
- [ ] 运行 ArchContext P1/P2 与投影验收。
- [ ] 扫描 `src/`、`tests/`、`scripts/`、模板与打包冒烟中的协议消费者。
- [ ] 更新 README、changelog、docs、examples 与发布清单。
- [ ] 输出 persistent multi-seat go/no-go 与 Phase 5/6 的启动建议。

**Acceptance**

C9-A 至少一次 handoff adoption 与一次 signal reuse、零 authority drift；持久 `EngineerSeatV2` 只在 C9-B 的重复案例证明 delegated round 的启动与交接本身是瓶颈时才给 go。

**Rollback**

回滚最终集成发布；每个先前协议均为可独立关闭的加法。

## Program Verification Matrix

| Concern | Required evidence |
|---|---|
| Authority preservation | before/after Task、Lease、Publication、Acceptance digests |
| Determinism | 重复采集的 canonical snapshot/receipt 字节 |
| Concurrency | N-way 独立进程 append 与 adoption 竞争 |
| Writer singularity | 参与者 protected before/after snapshot 相等 |
| Succession | freeze receipt + lease generation 变化记录 |
| Injection trust | 注入渲染快照含不可信包裹与 warning |
| Actor derivation | draft 自述身份被忽略的负例 |
| Contribution transaction | 每个持久化边界的故障注入重试收敛证据 |
| Reader admission | `max_parallel_readers` 超限被拒的负例 |
| Budget | context packet estimated tokens 采样 |
| Degradation | store 不可读、采集期变化的 fail-loud 断言 |
| UI | 路由清单、脱敏、stale/degraded fixtures |
| Runtime delivery | exact message/recipient/effect correlation、lost-ACK one-action proof、no-fallback assertion、adversarial transcript negative proof |
| Compatibility | feature flag 关闭时的既有仓库 |
| Packaging | 安装 tarball 冒烟与协议消费者扫描 |

## Promotion Gates

### Gate 1 — Off to Shadow

Requires:

- signal 与 handoff schema 冻结；
- append-only store 通过并发竞争；
- 零权威写入证明；
- store 不可读时 fail loud。

### Gate 2 — Shadow to Active

Requires:

- thread/hotspot 投影确定性；
- context packet 在预算内且可追溯；
- 交接路径经 TaskFreeze 与现有 release/takeover/acquire；
- 注入全部标记 untrusted；
- Operator 路由清单未变。

### Gate 3 — Active to Canary

Requires:

- 至少 3 个并行只读参与者稳定运行，第 4 个在 admission bridge 被拒；
- collector 拒绝自述身份，contribution commit 是唯一可见性边界；
- 一次完整的 handoff → adoption 链路；
- R1 的 tmux endpoint canary 与 Codex App Thread control 均有 exact receipt/effect evidence，lost ACK 不触发第二 action；
- usefulness rubric 已冻结、跨臂污染防护就位、baseline arm 可复现。

### Gate 4 — Canary to Decision

Requires:

- C9-A 与 C9-B 两级证据齐备；
- 两臂指标完整，含 aggregate compute/cost；
- 零 authority drift；
- 噪声比例可接受；
- multi-seat go/no-go 有明确依据。

## Stop Conditions

Stop execution and mark Sprint Blocked when:

- 某个工作包需要第二个 Task/Lease/Acceptance 权威；
- 协作层需要写权限才能证明价值；
- 同 capability 持久多席位成为 P0 的硬前提；
- hotspot 必须影响 canonical priority 才有用；
- adoption 必须隐式转移 Lease 才能跑通；
- 注入无法在 1,500 estimated tokens 内保持有用；
- 协作层需要 LLM 推断状态；
- Operator Board 需要新增 mutation 才能表达核心价值；
- PRD 中任一 kill gate 触发。

## Deferred Phase 2 — Independent Gates

Source: `plans/prds/20260828-2321-work-exchange-independent-review.prd.md`
（`Activation: Deferred — Phase 2`）。

激活前置：Reviewer Supply Admission Gate 与 Revisit Trigger 全部满足。这些行
不进入 active backlog，也不分配 Plan 指针。

| ID | Work Package | Deferred acceptance |
|---|---|---|
| P2-1 | `GatePolicyV1` 与 target-base resolver | Exact-key validator、canonical digest、target-base-only resolution、candidate 自授权负例 |
| P2-2 | `ReviewOfferV1` 与独立性排除 | 当前 publication 产生一个 job；executor、binding、child lineage 以闭集原因排除 |
| P2-3 | Gate Reservation CAS store | N-way 竞争恰好一个赢家；reservation 零 Task/Lease 字节写入 |
| P2-4 | 不可变 `ReviewReceiptV1` | pass/changes/blocked 不变式、exact subject replay、Head/policy 陈旧矩阵 |
| P2-5 | Review findings → 通用 Repair Trigger | 一次 changes-requested 产生一个幂等 trigger，复用既有 RepairOffer/reopen/takeover 生命周期 |
| P2-6 | Verification Offer/Reservation/Receipt | `evidence_replay` 与 rerun 明确区分；缺失/不可读/provider 失败不能通过 |
| P2-7 | 模块与集成 Gate Convergence | Review、Verification 与既有 Acceptance 为合取；一个通过不能覆盖另一个失败 |

Phase 2 的 Operator 展示面在激活时并入 C8 的只读投影，不新增写入路由。

## Deferred Phase 3 — Guarded Merge

Source: `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`
（`Activation: Deferred — Phase 3`）。

激活前置：真实协作证据、已激活的独立 Review/Verification gate、provider merge
capability canary。`MergeEligibilityV1` 设计保留但不实现。这些行不进入 active
backlog，也不分配 Plan 指针。

| ID | Work Package | Deferred acceptance |
|---|---|---|
| P3-1 | 纯 `MergeEligibilityV1` | 全部 local/provider/policy/risk/authorization blocker 稳定完整；投影零 provider mutation |
| P3-2 | Provider Merge Capability canary | direct merge/auto-merge/queue/update-branch/check/review 可见性以 available/unavailable/unknown 观测；unknown 永不启用 mutation |
| P3-3 | Host-owned Merge Intent/Observation/Receipt journal | persist-first、expected-head fencing、超时 reconciliation、crash-after-submit 零重复提交 |
| P3-4 | 低风险 guarded auto-merge canary | 仅在 target-base policy + 本地 grant 下合并；protected/waived/base-moved 变体零 provider 调用 |
| P3-5 | `ProgramAuthorizationV1` 与 grant 生命周期 | 到期、撤销、目标漂移均阻断；grant 对 Engineer profile 不可用 |
| P3-6 | Program Budget Ledger 与 checkpoints | turn/token/cost/repair/failure 上限产生 typed halt；硬上限后零单位准入 |
| P3-7 | `finish --no-merge` / reviewing-Lease reconcile | 见 Child PRD C 的 Known Lifecycle Interaction；MergeReceipt 不直接释放 Lease |

## Deferred Follow-ups

Record in `tasks/todos.md`, not this backlog:

- 同 capability 持久多席位 `EngineerSeatV2`；
- multi-review quorum；
- 跨仓库协作；
- planning marketplace；
- 浏览器 mutation 控件；
- merge queue 协议（需先有真实 merge-group canary）；
- clean-room verifier Worker Host；
- 协作 label 与 thread 的事后语义分析工具；
- 超出实测需要的 policy 驱动模型/provider 选择。

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|---|---|---|---|
| 2026-08-29 21:13 | C0 — freeze collaboration/delivery two-plane authority | `plans/archive/plan-20260829-1853-c0-two-plane-authority-freeze.md` | done |
| 2026-08-30 01:01 | C1 — `CoordinationSignalV1` schema, `common.ts` and append-only store | `plans/archive/plan-20260829-2137-c1-coordination-signal-store.md` | done |
| 2026-08-30 02:55 | C2 — signal threads, discovery and hotspot projection | `plans/archive/plan-20260830-0121-c2-thread-hotspot-projection.md` | done |
| 2026-08-30 04:50 | C3 — `WorkStateHandoffV1` and adoption receipts | `plans/archive/plan-20260830-0120-c3-work-state-handoff-adoption.md` | done |
| 2026-08-30 08:35 | C4 — delegated Worker contribution adapter | `plans/archive/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md` | done |
| 2026-08-30 10:13 | C5 — TaskFreeze / explicit takeover succession integration | `plans/archive/plan-20260830-0858-c5-taskfreeze-succession-integration.md` | done |
| 2026-08-30 13:19 | C6 — collaboration-centric Work Exchange and ContextPacket | `plans/archive/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md` | done |
| 2026-08-30 18:09 | C7 — CLI/MCP and bounded context injection | `plans/archive/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md` | done |
| 2026-08-30 18:34 | C8 — read-only Operator collaboration surface | `plans/archive/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md` | done |
| 2026-08-30 22:16 | C9 — real multi-agent canary and multi-seat decision | `plans/archive/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md` | done |
| 2026-08-31 08:57 | R1 — provider-neutral runtime effect and optional tmux endpoint adapter | `plans/archive/plan-20260830-1903-r1-provider-neutral-agent-runtime.md` | done |
