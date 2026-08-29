# Sprint: Collaborative Work Exchange and Agent Succession

> **Status**: Approved
> **Slug**: `collaborative-work-exchange-agent-succession`
> **Created**: 2026-08-28T23:21:55-07:00
> **Updated**: 2026-08-29T00:41:20-07:00
> **Source PRD**: `plans/prds/20260828-2321-collaborative-work-exchange-agent-succession.prd.md`
> **Child PRD A (Active)**: `plans/prds/20260828-2321-collaboration-substrate.prd.md`
> **Child PRD B (Deferred — Phase 2)**: `plans/prds/20260828-2321-work-exchange-independent-review.prd.md`
> **Child PRD C (Deferred — Phase 3)**: `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`
> **Source Spec**: `docs/spec.md`
> **Baseline**: `main@456731f308b7ad54585ac50acbc510350a4c563c`
> **Goal Mode**: incremental
> **Program Strategy**: authority freeze → signals/handoffs → discovery → real canary → multi-seat decision
> **Default Feature State**: all new mutation disabled

Program-level sprint container. Active backlog is C0–C9 and belongs entirely to
Child PRD A. Each contract row is an independent merge and rollback boundary.
Do not combine the signal store, the succession path and the Operator view into
one branch.

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
- 同 capability 至少 3 个并行只读参与者；
- 至少一次真实 handoff 被后继者采用；
- 后继者重复已记录 dead end 的次数为 0；
- context packet ≤1,500 estimated tokens；
- Work Exchange 相同输入 byte-identical；
- 任意时刻单任务 writer 数 ≤1；
- Board 仍只有既有 task-message 一条写入路由。

### Acceptance Scenarios

见 umbrella PRD scenarios 1–10 与 Child PRD A scenarios 1–12。每一行必须写明
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

New:

- `capability.runtime-harness.collaboration`

Phase 2 / Phase 3 的 `independent-review`、`guarded-merge`、`program-automation`
capability 不在本 Sprint 创建。

### Dependency Order

```text
C0
├─ C1 → C2
├─ C3 → C5
└─ C4
C1 + C2 + C3 + C4 + C5 → C6 → C7 + C8 → C9
```

### Parallelism

Allowed after C0:

- C1 与 C3 的 schema 层可并行，文件不相交；
- C4 的 delegation adapter 可与 C1/C3 并行，只要不改 `src/core/engineers/delegation.ts`；
- C7 与 C8 在 C6 冻结 snapshot 契约后可并行。

Forbidden:

- 两个 writer 同时改 `src/core/collaboration/*`；
- UI 与 server 协议分开落地；
- C5 与 C3 并行改同一个 handoff schema 文件；
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

| # | Status | Task | Mode | Acceptance | Plan |
|---:|:---:|---|---|---|---|
| 1 | [ ] | C0 — freeze collaboration/delivery two-plane authority | contract | Architecture request 明确 signals/handoffs/participants 无 Task、Lease、Publication、Acceptance authority；现有 authority bytes 不变 | (pending) |
| 2 | [ ] | C1 — `CoordinationSignalV1` schema and append-only store | contract | 三个 actor 可并发发布；同 id 同 payload 幂等；不同 payload 冲突；Task/Lease bytes 零变化 | (pending) |
| 3 | [ ] | C2 — signal threads, discovery and hotspot projection | contract | 同输入 byte-identical；thread 由 opaque key 聚合；top-K context ≤1,500 tokens；无 LLM 状态推断 | (pending) |
| 4 | [ ] | C3 — `WorkStateHandoffV1` and adoption receipts | contract | handoff 包含 attempted paths、dead ends、findings、next actions；adoption 不创建 Claim | (pending) |
| 5 | [ ] | C4 — delegated Worker contribution adapter | contract | 至少 3 个同 capability read-only Worker 并行；WorkerResult 可生成 signals/handoff；writer 数仍为 1 | (pending) |
| 6 | [ ] | C5 — TaskFreeze / explicit takeover succession integration | contract | dirty executor 先 freeze；handoff 不转移 Lease；successor 只有经现有 release/takeover/acquire 才可写 | (pending) |
| 7 | [ ] | C6 — collaboration-centric Work Exchange and ContextPacket | contract | 显示 existing execution offers、participants、threads、signals、handoffs、opportunities；snapshot fail-loud | (pending) |
| 8 | [ ] | C7 — CLI/MCP and bounded context injection | contract | authenticated actor 由服务端推导；Engineer 可 post；Worker 由 Host collector post；全部 context 标记 untrusted | (pending) |
| 9 | [ ] | C8 — read-only Operator collaboration surface | contract | 展示 lanes、discoveries、handoffs、hotspots、contributors；task message 仍是唯一 browser write | (pending) |
| 10 | [ ] | C9 — real multi-agent canary and multi-seat decision | contract | 与 single-agent baseline 比较；至少一次 handoff adoption、一次 signal reuse；零 authority drift；输出 persistent multi-seat go/no-go | (pending) |

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

架构请求被接受；无运行时源文件变更；契约测试枚举现有权威协议版本。

**Rollback**

批准前删除计划产物；批准后以 supersede 取代静默编辑。

---

### C1 — Coordination Signal Store

**Purpose**

给协作观察一个 append-only、可寻址的载体。

**Tasks**

- [ ] 新增 `src/core/collaboration/signal.ts`，实现 exact-key 校验与 canonical digest。
- [ ] 实现 `CollaborationActorRefV1` 与 `CollaborationScopeRefV1`。
- [ ] 实现传输上限：title ≤256 bytes、body ≤8 KiB、labels ≤12、scope refs ≤8、artifact refs ≤8、source signals ≤16。
- [ ] 实现 append-only store 与 per-thread lock。
- [ ] 实现 supersede 语义与目标存在性校验。
- [ ] actor 一律服务端从 principal 推导，忽略调用方自述。
- [ ] 加入零 Task/Lease 写入证明。

**Tests**

- [ ] canonical ordering；
- [ ] unknown field 拒绝；
- [ ] digest 不一致；
- [ ] 各项上限边界；
- [ ] 同 id 同 payload 幂等 / 不同 payload 冲突；
- [ ] N-way 独立进程并发 append；
- [ ] supersede 目标缺失。

**Acceptance**

三个 actor 并发发布全部成功；权威 store 字节零变化。

**Rollback**

`collaboration.mode=off`；已写 signal 成为惰性审计记录。

---

### C2 — Threads, Discovery and Hotspots

**Purpose**

从 opaque thread key 派生 lane 与注意力排序。

**Tasks**

- [ ] 实现按 `thread_key` 完全相等的聚合，不做近似合并。
- [ ] 实现 `CollaborationThreadSnapshotV1`。
- [ ] 实现确定性 hotspot 函数（独立贡献者数、近期活动、artifact refs、open requests、未认领 handoff、跨 thread 引用）。
- [ ] 实现 contribution opportunities 的五个 reason 闭集。
- [ ] 实现 top-K 选择与 1,500 estimated tokens 预算截断。
- [ ] 断言 hotspot 不进入 Work Graph priority、dependency、Task state、Lease eligibility。
- [ ] 采集期变化标记 `changed_during_read`，分片不可读标记 `degraded`。

**Acceptance**

相同输入 byte-identical；hotspot 变化不改变任何 canonical 权威 digest。

**Rollback**

移除投影消费者；signal store 保持独立可读。

---

### C3 — Work-State Handoff and Adoption

**Purpose**

让一次运行的知识在 budget 耗尽后仍然可用。

**Tasks**

- [ ] 实现 `WorkStateHandoffV1` schema，强制 `attempted_paths`、`dead_ends`、`key_findings`、`next_actions` 字段存在。
- [ ] 实现 `execution_state_refs` 与现有 `WorkerResultV1` / `TaskFreezeReceiptV1` / WorkEnvelope / publication 的绑定校验。
- [ ] 实现 `HandoffAdoptionReceiptV1`。
- [ ] 实现 supersede 语义。
- [ ] 断言 adoption 零 Claim 写入、零 Lease generation 变化。
- [ ] 加入 trigger 闭集：`budget_low` / `context_pressure` / `phase_complete` / `stalled` / `manual`。

**Acceptance**

handoff 内容完整可校验；adoption 不创建 Claim。

**Rollback**

关闭 handoff 写入；已写 handoff 成为惰性记录。

---

### C4 — Delegated Worker Contribution Adapter

**Purpose**

用现有 read-only delegation 承载同 capability 多参与者，不新增 Engineer identity。

**Tasks**

- [ ] 定义 `CollaborationContributionDraftV1` 与 Host collector。
- [ ] 从 `WorkerRunRefV1` 与 admission receipt 推导 actor，忽略 draft 内的身份声明。
- [ ] 把最终 signal/handoff digest 写成 `WorkerResultV1.evidence_refs` 条目。
- [ ] 复用 `DelegatedRunIntentV1.context_packet_sha256` 记录该 run 实际收到的协作上下文。
- [ ] 不 bump `DelegationEnvelopeV1`。
- [ ] 并行度上限取 `ModuleEngineerProfileV1.delegation_policy.max_parallel_readers`。
- [ ] 决定是否需要扩展 `allowed_roles` 闭集；不扩展时以 logical role 表达参与角色。
- [ ] draft 部分条目非法时整批拒绝。

**Acceptance**

至少 3 个同 capability read-only Worker 并行；参与者 protected snapshot 前后相等；writer 数仍为 1。

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
- [ ] 实现 `CollaborationContextPacketV1` builder 与确定性截断。
- [ ] 对每个可变来源做 double-read。
- [ ] `snapshot_consistency` 非 `stable` 时 fail loud。
- [ ] 基准测试 100 Work Packages / 10 Engineers。
- [ ] 证明零文件系统写入。

**Acceptance**

现有 execution offer payload 与 revision 不变；快照确定性通过。

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

### C8 — Read-Only Operator Collaboration Surface

**Purpose**

让协作对 Human 可读，且不引入任何写入。

**Tasks**

- [ ] 新增 browser-safe collaboration snapshot（GET only）。
- [ ] 脱敏本地路径与 provider 诊断。
- [ ] 展示 lanes、recent discoveries、open handoffs、hotspots、contributors、当前 writer。
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
- [ ] Treatment arm：一个 Module Engineer + 三个只读参与者 + signal board + 一次后继者 handoff。

**Measures**

- [ ] time to first useful finding；
- [ ] unique useful findings 数量；
- [ ] 重复调查已记录 dead end 的次数；
- [ ] signal reuse（`source_signal_ids` 引用数）；
- [ ] handoff adoption 次数；
- [ ] 后继者到达有效进展的 turns/tokens；
- [ ] 每次注入的 context 体积；
- [ ] 从未被读取/引用/采用的 signal 占比；
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

至少一次 handoff adoption 与一次 signal reuse；零 authority drift；多席位决策有明确输出。

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
| Budget | context packet estimated tokens 采样 |
| Degradation | store 不可读、采集期变化的 fail-loud 断言 |
| UI | 路由清单、脱敏、stale/degraded fixtures |
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

- 至少 3 个并行只读参与者稳定运行；
- collector 拒绝自述身份；
- 一次完整的 handoff → adoption 链路；
- baseline arm 可复现。

### Gate 4 — Canary to Decision

Requires:

- 两臂指标完整；
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
