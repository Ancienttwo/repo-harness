# Sprint: GPT Pro-Seeded Bounded Repair Campaign (Phase A)

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

> **Status**: Done
> **Slug**: `gpt-pro-seeded-repair-campaign`
> **Created**: 2026-09-02 22:38
> **Updated**: 2026-09-10 23:31
> **Source PRD**: `plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md`
> **Parent Design**: `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`
> **Source Spec**: `docs/spec.md`
> **Baseline**: `main@a2830db43f7fffbe0535f5b98674f6c4e5aa4f84`
> **Goal Mode**: incremental
> **Phase**: A — manual merge，只收 `bugfix` 与 `test_gap`
> **Default Feature State**: `development_campaign.mode = "off"`
> **Backlog Schema**: 2

Program-level sprint container。每个 contract 行是独立的 merge 与 rollback 边界。
Phase A 不含 `refactor` kind、Cutover Closure Gate、merge controller 与 auto-merge；
这些能力在 Source PRD 的 Deferred / Phase B 表中，挂 Parent Design。

## PRD

### Problem

用户想把「找问题」外包给一个独立外部审计者（GPT Pro），但不能让它碰代码，也不能让
本地 Agent 把它的意见润色掉。仓库已有完整执行底座——canonical Sprint（Task 身份）、
Work Graph（调度）、`src/effects/fleet/acquire.ts` 的 acquire 链（领取权限）、
`AcceptanceReceipt`（验收）——缺的是一条把外部 demand 有界收敛进这套既有权威的窄化通道。

### Users

- Human Campaign Owner
- Local Campaign Controller（`local_parent_host` = claude 或 codex）
- GPT Pro Issue Author（只读代码，只能创建 Issue）
- Fresh GPT Pro Main Auditor（新会话，只读 exact final main）
- Worker（Claude/Codex，只消费真实 WorkEnvelope）

### Success Criteria

- 本地 issue-create 调用次数为 0；
- 7/10 中断后只补 3 项、不触碰已完成 slot；
- 重复 slot 100% fail closed，不自动关闭「较差那个」；
- 崩溃后重复外部 mutation 为 0；
- 第 1 行之后，既有 Task/Lease/Acceptance/Publication bytes 变化为 0；
- 一个 group 从授权到 `accepted`，人工介入点只有 merge。

### Acceptance Scenarios

见 Source PRD scenarios 1–5 与 Acceptance Scripts。Canary 2 的前移观测由 BRC15a 拥有，readback 证明缺口由 BRC6a 拥有；各执行行须绑定实际覆盖的场景。

### Non-goals

- 无 `refactor` kind，无 Cutover Closure Gate；
- 无 auto-merge、无 merge controller、无 provider merge effect；
- 不新建 `MergeEligibilityV1`（已有 `MergeReadinessV1` / `projectMergeReadiness`）；
- 不新建 `DevelopmentCampaignAuthorizationV1`（复用 `ProgramAuthorizationV1`）；
- 不引入 `repo-harness execute` 或任何新 root lifecycle 命令；
- 不复活 `repo-harness-autoplan`，不把 `heartbeat-triage` 改成执行器；
- 不建设通用 WorkDemand 平台（#285 方向）；
- 不做 event-driven wake（#281）。

## Architecture Notes

### Capabilities Touched

New:

- `capability.runtime-harness.development-campaign`（默认 off，且为 protected surface）

Existing（只消费，不改写权威）:

- `capability.runtime-harness.engineer-scheduling`（Work Graph、offers）
- `capability.runtime-harness.collaboration`（dispatch fence）
- `capability.runtime-harness.external-source-intake`（Issue observation intake）
- `capability.runtime-harness.integration-acceptance`（`MergeReadinessV1` projection sink）

### Key Design Constraints

- **执行链**：Offer → Claim → fresh worktree → Lease bind → ClaimToken → contract
  projection → WorkEnvelope（`src/effects/fleet/acquire.ts`），配合 `contract-worktree`
  与 `ship-worktrees` helper。没有 root `repo-harness execute` 这个路由。
- **Host 授权**：复用 `ProgramAuthorizationV1`，campaign 字段（`group_count` 1/2/3、
  `issues_per_group` 上限 10、`allowed_issue_kinds`、`max_parallel_tasks`、
  `issue_author=gpt_pro`、`local_parent_host`）作为其 campaign-scoped payload。
- **Runtime store**：`<git-common-dir>/repo-harness/development-campaigns/v1/`，
  沿 `src/effects/engineers/binding-store.ts` 的 `ENGINEER_STORE_RELATIVE_ROOT` 惯例。
- **Policy 前置**：`.ai/harness/policy.json` 的 `external_sources.mode` 当前为 `"off"`，
  campaign 启动前必须开启；新增 `development_campaign.mode` 默认 `"off"`，
  阶梯 `off → shadow → active/manual`（Phase A 不含 auto-low-risk）。
- **Slot 权威**：body marker 的三个字段（`campaign_id` / `group` / `slot`），无任何哈希。
  标题前缀只是显示约定，对账不读标题。
- **Adoption 规则**：`issues_per_group` 是上限不是目标。authoring rounds 预算耗尽后以现有
  有效 slot adopt（N ≤ 10），缺的记 `unfilled`；`slot_invalid` 允许一次指定 Issue 的 edit
  repair，失败降为 `unfilled`；`issue_slot_unexpected` 的孤儿 Issue 由本地以 `not_planned`
  关闭并留原因评论。
- **connector_evidence**：`verified`（UI 观察）在 oracle_browser 下不可达（见 `docs/researches/20260902-gpt-pro-connector-readback-probe.md`）。现有 `challenge_verified` 只证明目标内容抽样一致，不证明读取了指定 revision；exact-SHA 要求仍未满足，由 BRC6a 修正并由 BRC14 消费。模型自述或回显 prompt 中的 SHA 均不构成版本读取证据。
- **oracle 传输**：有 profile 绑定时固定 `--copy-profile` 加 `--browser-chrome-profile`；`--browser-cookie-path` 三跑一中，不再使用。campaign 授权记录 `chrome_profile_directory`（本机 Connector 授权帐号在 `Profile 13`），doctor ready 判定含该 profile 的 chatgpt.com session cookie 未过期。
- **规划交接**：controller `step` 只发 planning job；由 `local_parent_host` 那个 host agent
  在自己 session 内跑 `/hunt`（bugfix）或 characterize（test_gap），用
  `repo-harness run capture-plan` 落 plan；下一个 step 靠 TaskOffer 从 `planning_required`
  变 `execution_ready` 观察完成（`src/core/fleet/task-offer.ts`）。派工同理：step 产
  dispatch prompt，host agent 负责 spawn。
- **Heartbeat**：host 只在有 GPT Pro 派单（authoring 或 audit）在飞时排程 `campaign step`；
  step 无在飞派单时立即回 `idle` 并回传 `next_check_at`；deadline 由 durable intent 的
  `created_at` / `expires_at` 推出，超时进 `campaign_no_progress`。
- **Group 状态机（粗粒度）**：`awaiting_batch → adopted → in_progress → closeout →
  auditing → accepted`，内部进度用计数聚合。Work item 状态沿 Source PRD 的完整序列。

### Dependency Order

```text
BRC0 → BRC1 dispatch fence
BRC0 → BRC3 campaign core → Connector spike → BRC4a transport → BRC4 authoring
BRC4 → BRC5 observation → BRC6 adoption implementation → BRC7 planning
BRC1 dispatch fence + BRC7 → BRC8 acquisition

BRC3/BRC4/BRC5/BRC6 已落地路径 + shadow provider-budget 接线证据 → BRC15a Canary 2
BRC15a 观测结果 → Campaign Owner 决定后续投入；结果好坏不是 CI 阈值

BRC6a readback correction → active adoption 与 BRC14 的 exact-SHA 验收
BRC8 + 完整 BRC9 → BRC10 → BRC13 → BRC14
完整 BRC9/BRC10/BRC13/BRC14 + BRC15a 观测记录 → BRC15 Canary 1/3 + activation
```

依赖使用 BRC task 名称而非可变行号。BRC15a 只前移真实 shadow 观测；Canary 1 的
controller/cleanup crash 与 audit wrong-SHA 全矩阵仍依赖后续实现。Shadow 不 claim，
acquisition charging 不是其前置；真实执行的 authoring、fill/edit、challenge 和每次 GitHub
identity/list/page 调用必须先有既有预算的 admission 与可对账结果。`adopt --dry-run` 仍有
browser/provider/journal effect，不是零 effect。该接线尚未完成时 BRC15a blocked；所需代码
修复另走 BRC9 的有界 work-package，不在 inline canary 中临时绕过预算或修改 runtime。

BRC6a 不阻止明确标记 exact-SHA 未验证的 shadow 观测；它阻止把该观测当作 active adoption
或 fresh audit 的验收证明。BRC9 内 active 路径首个安全缺口是 acquire 前 budget admission，
不是重写 #282/#287。完整 BRC9 仍是 BRC10 前置。

BRC1 与 BRC3 可在 BRC0 后分别核对。不得让两个 worker 同时改 campaign core protocol；
batch parser 未冻结时不得实现 materializer。前置分别列出不等于授权并行修改共享文件。

### Shared Prerequisites and Risks

- #278/#280/#282/#283/#284/#285/#286/#287 已有本地实现；消费者验收仍须核对各自要求，
  不在本 Sprint 重写上游权威。已落地 package 与剩余接线见 execution-boundaries research。
- 本 Sprint 已为 Backlog Schema 2，保留全部既有 persisted task ID；相邻 schema-migration
  receipt 是历史迁移证据，不因本次增行而改写。#284 的 `acceptance_authority` 继续必填。
- BRC6a 已由 Owner 于 2026-09-08 确认 Connector 可用并关闭；实际读取证据与运行时版本准入的区别见下方 Owner closeout。
- GPT Pro 有效 Issue 产出、重复率与只补缺失 slot 的服从率尚待 BRC15a 观测。
- GitHub 分页不完整不能当 complete；必须用 provider list/read 与本地 observation store。
- `max_parallel_tasks=2` 是容量上限。现有 single-unresolved-reservation 预算可能使 worker
  串行；canary 记录实际重叠情况，不新增并行吞吐验收，也不降低容量和 ownership 检查。

## Backlog

Ordered execution queue；保持依赖顺序。Mode `contract` 走完整 plan -> contract -> worktree
流程。每行的 Acceptance 必须具体可验。

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | 23d385b0f0410137fe33517b757689d02fb1741cb495e9a7b6c4262930a81907 | [x] | BRC0 — Authority freeze 与 baseline characterization | contract | 源码行为零变化，Task/Lease/Acceptance/Publication bytes 逐字节不变；绘出 Issue→Task→Plan→Lease→PR→Merge 数据流并冻结 GPT Pro 与本地 Agent 权限表；负向 fixture 证明 Issue 不是 Task、prompt 不是 Claim；证明 heartbeat-triage 仍只读、旧 autoplan 已退役、External Source binding 不创建 Task、campaign capability 默认不存在；冻结 protected capabilities 清单与 provider partial-success fixtures；architecture request 完整 |  |
| 2 | bdb16bde88d7b8d131a6304f119d6c863d413eaac5e653b9428e497b85505ab7 | [x] | BRC1 — Dispatch fence 进 effect boundary（消费 #278） | contract | 消费已落地的 #278；未落地则该行 blocked，不在本 sprint 重新实作。落地后断言：直接 effect call 缺 binding 时在 host action 之前失败；`delegation_only` 行为不变；stale binding 拒绝；CLI 路径与 campaign controller 路径各只执行一次 fence（不重复不遗漏）；raw unfenced entrypoint 不再被外部模块调用；ArchContext 同步 | `plans/archive/plan-20260902-2101-issue-278-dispatch-effect-fence.md` |
| 3 | ebc379bc400fac66ae579d6d7c7670936dfec322c290a5fab77f8c706c0f42af | [x] | BRC3 — Campaign protocol、policy key、ProgramAuthorization 复用、append-only journal、cross-process lock | contract | 复用 `ProgramAuthorizationV1` 并以 campaign 字段作为其 payload，不新建 `DevelopmentCampaignAuthorizationV1`；`.ai/harness/policy.json` 新增 `development_campaign.mode` 默认 `off`，阶梯 `off → shadow → active/manual`，且 campaign 启动前校验 `external_sources.mode` 非 `off` 否则 fail closed；store 落 `<git-common-dir>/repo-harness/development-campaigns/v1/`；exact-key canonical protocol；append-only event chain 且 current projection 可从 events 完全重建；cross-process lock 生效；same-key replay 幂等、conflicting replay 拒绝；candidate branch 不能放宽 policy；`mode=off` 时所有 mutation 命令失败退出而非静默 no-op | `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md` |
| 4 | a8f00b0c394642116eb229d5ee4be562286a547de61b7c231b1505c8eab97278 | [x] | Inline spike — oracle_browser Connector 读回能力探针 | inline | 在 BRC4 之前完成。用一次真实 `oracle_browser` 往返验证能否产出可验证的 Connector 读回证据，判定 `connector_evidence` 可达到 `verified` 还是仅 `bundle_only`；结论写进 `docs/researches/20260902-gpt-pro-connector-readback-probe.md` 并回填 BRC14 的 audit 验收路径；原探针的样本匹配结论与 exact-SHA 缺口按 BRC6a 及 probe 修正处理，不将人工回显 SHA 当版本证明 | `docs/researches/20260902-gpt-pro-connector-readback-probe.md` |
| 5 | 9e7090269d9d457155983885ef1cfea64fc606bfcbfd01d81d3d6a971e18aa29 | [x] | BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport | contract | 有 profile 绑定时 `browser-consult` 的唯一 oracle 传输为 `--copy-profile <user-data-dir> --browser-chrome-profile <profile-directory>`，不再传 `--browser-cookie-path`，两者不共存、无静默回退；oracle 缺 `--copy-profile` 或 `--browser-chrome-profile` 时 fail closed（`ORACLE_COPY_PROFILE_UNSUPPORTED`）；`browser-doctor` capabilities 新增 `copyProfile` 与 `browserChromeProfile`，`status: ready` 要求二者为 true；`BrowserSessionMeta.browser` 新增 `transport: 'copy_profile'` 并落盘；dry-run 命令行断言含 `--copy-profile` 与 `--browser-chrome-profile` 且不含 `--browser-cookie-path`；oracle 输出 `A session with the same prompt is already running` 映射为 `ORACLE_SESSION_ALREADY_RUNNING` 并附 recovery，不自动加 `--force`；`docs/repo-harness-chatgpt-browser-engine.md` 同步，先 grep `tests/` 的字面串断言再改文档；依据：`docs/researches/20260902-gpt-pro-connector-readback-probe.md` | `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` |
| 6 | bb7d61be6326a0b5bb524fe43b812e639c8ac308adcdf4aae11e9f36cba06a50 | [x] | BRC4 — GPT Pro Issue batch authoring lane | contract | persist `IssueBatchIntentV1` 先于打开浏览器，无例外；intent 绑定 exact repo/ref/`base_main_sha`；prompt 出境前跑 secret scan；slot 权威在 body marker 三字段（`campaign_id`/`group`/`slot`）且 marker 不含任何哈希，标题前缀只作显示、对账不读标题；本地无 issue-create fallback（fake provider 断言本地 create 调用数为 0）；authoring session 可用于补缺与指定 edit；浏览器超时后不推断成功，状态只由本地观察改变；GPT Pro 创建第 11 项时该项不被采纳；wrong campaign/group 的 Issue 被忽略；session unverified 不能 adopt |  |
| 7 | ec198badc2dff156f1b523631a82658b961121bc1c304deef1ad1acaf978d08a | [x] | BRC5 — Heartbeat observation 与 slot reconciliation | contract | 对账矩阵全覆盖：10 unique valid → `complete`；7 valid 3 missing → `incomplete` 并只列缺失 slot；同 slot ×2 → `issue_batch_ambiguous` fail closed 且绝不自动关闭其一；invalid metadata → `slot_invalid` 允许一次指定 edit repair、失败降为 `unfilled`；malformed marker 不采纳；观察后 body 被编辑 → `issue_source_drift`；provider 不可用 → `issue_provider_unavailable` 不当 empty；分页不完整 → `issue_provider_snapshot_incomplete` 不当 complete；adoption 前 main 移动 → `source_main_stale`；`issue_slot_unexpected` 的孤儿 Issue 由本地以 `not_planned` 关闭并留原因评论。Heartbeat 侧：只在有 GPT Pro 派单在飞时排程 step，无在飞派单立即回 `idle` 并回传 `next_check_at`，deadline 由 intent 的 `created_at`/`expires_at` 推出、超时进 `campaign_no_progress`；一个 step 最多一个外部 mutation | `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` |
| 8 | 71b4f6f92ed60f8f281ec4f3235b305490b05a67f6a1bb7f6e204c857214d27f | [x] | BRC6 — Adoption 与原子 Sprint/WorkGraph materialization | contract | `issues_per_group` 按上限而非目标判定：authoring rounds 预算耗尽后以现有有效 slot adopt（N ≤ 10），未填充 slot 记入 receipt 的 `unfilled_slots`；历史实现的 adoption 消费 `connector_evidence: challenge_verified`；该值只证明抽样内容匹配，BRC6a 已由 Owner 基于实际 Connector 读取验收关闭；运行时 exact-SHA 要求由 BRC14 消费现有准入边界，历史完成记录不构成 active activation 证明；partial adoption 另依赖上游 authoring-round exhaustion 与无在途调用的权威证明，缺失时 blocked；Sprint、Work Graph 与 issue manifest 在同一个 Git transaction 内落地，崩溃不留半更新，replay 不重复新增 rows；materialization 本身不 Claim 不建 WorkEnvelope，Offers 只在 materialization commit 进入 canonical main 之后出现；Work Graph 以持久化 `task_id` 为 join key（依赖 #283 落地并跑一次 migration）；`depends_on` 边必填 `acceptance_authority` 键（#284），campaign v1 只生成 `required_state: canonical_done` 且 `acceptance_authority: null`，缺键 fail closed；unsupported kind 拒绝；dependency DAG 无环且只引用本组；capability concurrency key 准确；若 #285 的 batch primitive 已落地则消费它，未落地则本行只用窄化 Repair adoption、不建通用 WorkDemand 平台 | `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md` |
| 9 | 9a548acaccc8b388b6166e69e9e2aef6656669613e54a7d0d1615207e9b10cdc | [x] | BRC7 — Local auto-plan 交接与 feature-promotion guard | contract | controller `step` 只发 planning job、自身不做规划；`local_parent_host` 那个 host agent 在自己 session 内对 bugfix 跑 `/hunt`、对 test_gap 跑 characterize，用 `repo-harness run capture-plan` 落 plan；下一个 step 靠 TaskOffer 从 `planning_required` 变 `execution_ready` 观察完成（`src/core/fleet/task-offer.ts`），controller 不询问 host agent 完成状态；闭集 planning outcome 为 `plan_ready`/`not_reproducible`/`feature_route_required`/`human_attention_required`/`source_stale`/`planning_failed`；bugfix 无 Root Cause Evidence 不能 `plan_ready`，test_gap 无法证明旧测试缺口不能 `plan_ready`；新增 CLI/MCP tool/public export/protocol kind/capability node 被 feature guard 拦为 `feature_surface_detected`，protected path 拦为 `protected_surface_detected`，两者均不得降级为 warning；plan 绑定 exact Issue observation 与 Task revision，Issue 被编辑后旧 plan 判 stale；local parent 唯一；GPT Pro 不参与 per-Issue plan authority | `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md` |
| 10 | 3722412b92ea2240c60bbca9f09ae2e04e2a30974d2978bc63778f00cfc9ac46 | [x] | BRC8 — Acquire-next 与有界并行 worker 控制（消费 #280） | contract | 消费已落地的 #280；未落地则该行 blocked。落地后断言：只使用 canonical EngineerOffers 排序，无第二套 scoring；执行走既有 acquire 链 Offer → Claim → fresh worktree → Lease bind → ClaimToken → contract projection → WorkEnvelope（`src/effects/fleet/acquire.ts`），配合 `contract-worktree` 与 `ship-worktrees`，不引入任何新 root lifecycle 命令；same idempotency key 返回同一 acquisition；两进程竞争不重复 claim；相同 capability concurrency key 不并行；`max_parallel_tasks` 严格执行；dispatch prompt 不构成任务归属，Worker 只消费真实 WorkEnvelope；无 eligible offer 时正常退出 | `plans/archive/plan-20260906-0401-brc8-bounded-worker-acquisition.md` |
| 11 | 62056b5804b3264c436d1cc0eb8f1bce2e8576d06d91f61002012f96581f2dfc | [x] | BRC15a — Real GPT shadow canary 与价值观测 | inline | 依赖 BRC3/BRC4/BRC5/BRC6 已落地路径及 shadow 全部 provider calls 的统一预算 admission/结算/未知结果对账证据；缺一则 blocked，不要求 acquisition charging。使用有具体授权的 disposable repository 和 Connector profile，external_sources 开启、mode=shadow；真实 authoring/补缺/观察/adoption dry-run，无 Task materialization、Claim、代码、PR 或 Issue close。记录调用/轮数/时间、有效与重复 Issue 的数量及分母、未判定项、补写是否触碰已完成 slot、人工介入；不人为凑满 slot，不设模型质量 CI 阈值。exact-SHA 未验证必须显式记录，不能据此 active 或 accepted；记录 Owner 对后续投入的决定，未决定则后续执行 pending。 | `docs/researches/20260907-brc15a-real-shadow-canary.md` |
| 12 | 521351de31a4ae5e70c74bcccd08a30df786f3e82f4d182a4189e287857b35ac | [x] | BRC6a — Readback evidence boundary correction（覆盖 BRC6/BRC14） | contract | Owner 于 2026-09-08 明确批准“BRC6a可以关了，已证实可用”。验收采用显式 GitHub app 激活后的实际读取与本地首尾内容/blob 校验；停止追加 BRC6a 探针。历史 exact-revision 要求及未取得的 provider-origin 证据如实保留，运行时准入与 fresh audit 接线由 BRC14 负责；本次不伪造 receipt、不改变生产 gate。 |  |
| 13 | 691bf0c1961cd506c2a3f63b031581d21445eb4f2f243356ade6cdb04e1aa812 | [x] | BRC9 — Campaign budget 与 attempt receipts（消费 #282/#287 子集） | contract | 消费已落地的 #282 与 #287 的 campaign 必要子集；未落地则该行 blocked。落地后断言：限额覆盖 campaign wall-clock deadline、controller step 数、GPT authoring rounds、成功 acquisition 数、provider 调用数、per-task repair cycles、连续 no-progress steps、连续 transient failures；每个 side effect 前先 reserve，reservation 后崩溃阻止二次消费，same-key 不 double charge；attempt 结果为闭集（completed / not_reproducible / user_blocked / external_blocked / transient_failure / permanent_failure / lease_lost / cancelled / reconciliation_required）；max retry 后 `campaign_retry_exhausted`；user 与 permanent blocker 不自动 retry；deterministic backoff；budget 耗尽在下一次 claim 或 dispatch 之前停止；无可验证 token usage 时不得声称执行 token hard limit | `plans/archive/plan-20260907-0348-brc9-transient-retry-consumption.md` |
| 14 | fb27ce861a78e077dc9b72f64a607e51e8baaefbbec28bd99af92362b5d997c4 | [x] | BRC10 — Lease liveness 与 controller recovery（消费 #286） | contract | 消费已落地的 #286；未落地则该行 blocked。落地后断言：current owner 可 generation-fenced renew，旧 generation 不能续期；expiry 本身不等于 dead，不得仅凭超时或 PID 抢 Lease；active provider effect 与 completing/reviewing 状态保护 Lease；liveness unknown 只产生 attention 不产生 takeover；evidence-gated reclaim 走既有 steal 路径；两个 reclaimer 只有一个成功；controller crash 后可从 append-only journal 恢复且不制造双 owner | `plans/archive/plan-20260907-0554-brc10-lifecycle.md` |
| 15 | e71d90886c21eff5e34cd9e8046c270c9f1972669faeb31b0db49d7cc344e806 | [x] | BRC13 — Issue closure 与 exact branch/worktree cleanup（人工 merge 之后） | contract | 顺序固定且不可调换：人工 merge → 验证 merge commit 可从 current main 到达 → 关闭 Issue → 删远程分支 → 移除本地 worktree → 删本地分支 → 持久化 `CampaignCleanupReceiptV1`；未 merge 不能以 `completed` 关闭；source Issue drift 阻止自动 close；一个 Issue 对应多个 Task 时全部完成才 close；本地证伪用 `not_planned` 并保留 falsifier 证据；closure comment 记录 campaign/group/slot、base main、exact Issue observation、disposition、merge SHA 或证据、本地验收结果；close 请求 persist-first，结果未知先 reconcile 不直接重试；远程分支只按 exact ref 删除，已不存在为幂等成功；dirty worktree 拒绝清理并返回 `cleanup_blocked_dirty_worktree`，foreign Lease 引用的 worktree 拒绝；merge 成功但 cleanup 失败时 group 进入 `cleanup_pending` 且不进入下一组 | `plans/archive/plan-20260907-1224-brc13-closeout.md` |
| 16 | 4c28bc09a21de8d6047778b797cca0e07f4fb92604ae8f1bf09f15bb0afcf3a4 | [x] | BRC14 — Fresh GPT Pro main audit 与 1/2/3 group sequencing | contract | audit 必须是新会话且不能是 authoring session；读 exact `final_main_sha` 并由本地校验 `observed_main_sha == expected_main_sha`；audit 必须消费 BRC6a 的版本读取证据；现有 `challenge_verified` 只证明抽样内容一致，即使全部命中也不能单独证明 exact main；缺少可验证 revision 证据时按 `unverified` 停止，不进入下一组；模型自述的 Connector 调用不构成证据（Connector 探针已证明 `verified` 这个 UI 观察等级在 oracle_browser 下不可达）；所有 slot（含 `unfilled`）在 audit 输入中被完整交代；audit 不得创建或修改 Issue、不得 reopen、不得把 follow-up 自动扩成 Group 4；`accepted` 才启动下一组，`accepted_with_followups` 不突破 `group_count`，`rejected` 停止且不自动 rollback main，`unverified` 不进入下一组但可在预算内有界重试；Group 2 基于 Group 1 final main、Group 3 基于 Group 2 final main；达到授权 group count 后 controller 进入 terminal | `docs/researches/20260910-brc1415-canary3-closeout.md` |
| 17 | b45c1b05078577dad30e0c57d8b48f075e969f9cfb9c44368b67c4c112fcec92 | [x] | BRC15 — Canary 1/3 与 activation ladder（消费 Canary 2） | contract | Canary 1（model-free）：fake GitHub 与 fake GPT 覆盖 10 slot、第 7 项断线、duplicate slot、malformed metadata、issue edit drift、controller crash、cleanup crash、audit wrong SHA，全部收敛到闭集错误词汇且无一降级为 warning。Canary 2 由 BRC15a 单独执行并消费其完整观测记录；不得把抽样读回升级成 exact-SHA acceptance。Canary 3（active/manual merge）：一个 group、`max_parallel_tasks=2`（上限；记录实际串行/重叠，不要求重叠吞吐），PR 自动生成、merge 人工执行、Issue closure 与 cleanup 自动、fresh GPT audit 收口。Activation ladder 逐级不可跳级：`off → shadow → active/manual`，Phase A 到此为止，`auto-low-risk` 与 canary 4/5 属 Phase B | `docs/researches/20260910-brc1415-canary3-closeout.md` |

## Execution Dependencies Requiring Resolution

- BRC15a is the next observation slice, not permission to start an unbudgeted provider run. Its shadow
  provider-budget prerequisite was accepted and published in ce5e42d3; see
  `docs/researches/20260907-brc15a-shadow-provider-budget.md`. The real canary still requires its specific
  target/profile authorization and observations. Active acquisition charging is a separate prerequisite.
- BRC6a is owner-closed on 2026-09-08 after verified GitHub activation and content readback.
  Existing evidence retains its observed scope; BRC14 owns consumption of the existing exact-SHA
  runtime boundary. This closeout does not create a provider receipt or change runtime admission.
- BRC9: #287 retry-admission, #282 campaign-step/provider-budget, heartbeat consumption and the writable
  worker/attempt bridge, acquisition accounting, complete repair attempts and active adoption continuation
  are published as separate packages. The transient retry package owns final integration and whole-BRC9
  acceptance; its requirement mapping is in `docs/researches/20260907-brc9-transient-retry-consumption.md`.
  The row and exact AcceptanceReceipt govern completion. Downstream active acceptance still requires
  all its prerequisites, including the independent BRC6a readback boundary. Acquisition-cap global stop
  remains a separately identified product-contract decision, not a fix established by repair fixtures.
  TaskAutomationAttemptV1 consumes real WorkPackage/Claim/Lease/dispatch identity; campaign uses the
  standalone contract worker, not the read-only delegated-run host. See
  `docs/researches/20260907-brc9-writable-dispatch-attempt.md` and
  `docs/researches/20260905-repair-campaign-sprint-execution-boundaries.md`.
- Automatic cleanup, bounded retry, liveness recovery and authorized group 2/3 sequencing remain Phase A
  requirements. A proposal to defer them requires an explicit scope amendment and unmet-item record;
  `human_attention` is a safe stop, not fulfillment. Canary observations inform that decision, not CI.

## BRC6a Owner closeout — 2026-09-08

Owner 明确指示：“BRC6a可以关了，已证实可用”。据此以实际 Connector 可用性为本行关闭依据，替代原本要求继续产出独立 exact-revision producer 的行级完成条件；不再把该研究缺口保留为 BRC6a 未完成任务。

已观察到的证据：Profile 13 新会话经「+」显式选择 GitHub，composer 有真实 app selection pill，默认模型显示 6 Pro。conversation `6a9f0045-c728-83ea-a489-27796265282a` 返回 README 首 8 行、末 4 行，与 canary commit `33d692aaa0ab593df0c160082b18fdac02c82e9c` 本地逐行比对一致；回答中 blob `4779ce156e273311fa013c0bd7f71b9c9048129d` 与 Git 一致。原始研究记录见 `codex/brc6a-readback-research` 的 `6cfac409`，路径 `docs/researches/20260908-brc6a-trusted-revision-readback-options.md`；旧未激活探针不作为不可用证据。

这是 Owner 对任务完成边界的明确决定，不把模型文字变成 provider-origin resolved-commit receipt。BRC14 继续负责 fresh audit、版本准入消费及组间推进；本次关闭不表示真实 active/manual canary 已通过，也不修改运行时检查。

## BRC15a negative observation closeout — 2026-09-08

逐项 Acceptance 映射与原始 prompt、十个 Issue body、parser blob、budget admission/settlement 见 `docs/researches/20260908-brc15a-offline-metadata-replay.md`。结果为 **10/10 marker 覆盖，0/10 metadata 合格，无合格可采纳批次，修复价值未评估**。canonical observer 是配置失败，adoption 是 session 上游拒绝；补缺与下游 active 链路未覆盖，不记为通过。Owner 后续投入已收窄到 metadata 定因及既有安全前置条件。任务收口不修改 stopped campaign、不授予 active、不复用旧预算；BRC6a 保持 Owner-closed。

## BRC14/BRC15 Owner scope amendment — 2026-09-10

Owner 于 2026-09-10 禁止容器执行基底。campaign 的执行证据契约整条绑死容器 receipt（`scripts/contract-run.ts:181-183,234-239`、`src/effects/automation/campaign-worker.ts:140`、`src/core/automation/campaign-runtime.ts:20-21,51-73`、`src/effects/automation/campaign-runtime.ts:28-91,110-131`，行号相对 `9cc12bac`），纯宿主机 BRC 路径未设计、未实作。BRC14 与 BRC15 的 acceptance 建立在这条链上，换基底后没有可运行的对应物。

据「Execution Dependencies Requiring Resolution」末条要求，本节即 explicit scope amendment 与 unmet-item record。完整观测、失败根因与不可变状态见 `docs/researches/20260910-brc1415-canary3-closeout.md`。

| 项目 | 原本 acceptance | 实际状态 | 去向 |
|------|-----------------|----------|------|
| BRC14 fresh GPT Pro main audit | 新会话 audit 读 exact `final_main_sha`，本地校验 `observed_main_sha == expected_main_sha` | 从未执行 | `tasks/todos.md` deferred goal |
| BRC14 exact-SHA 版本准入消费 | audit 消费 BRC6a 的版本读取证据，缺证据按 `unverified` 停止 | 未接线 | `tasks/todos.md` deferred goal |
| BRC14 group 1/2/3 sequencing | `accepted` 才启动下一组，Group 2 基于 Group 1 final main、Group 3 基于 Group 2 | 未验证，无 group 达到 `accepted` | `tasks/todos.md` deferred goal |
| BRC15 Canary 1（model-free） | fake GitHub 与 fake GPT 覆盖 10 slot、第 7 项断线、duplicate slot、malformed metadata、issue edit drift、controller crash、cleanup crash、audit wrong SHA，全部收敛到闭集错误词汇 | 未做 | `tasks/todos.md` deferred goal |
| BRC15 Canary 3（active/manual） | 一个 group、`max_parallel_tasks=2`，PR 自动生成、merge 人工执行、Issue closure 与 cleanup 自动、fresh GPT audit 收口 | 9 个 campaign 停在 worker preparation 之后；只做到 PR 自动生成 + 人工 merge；自动 closure/cleanup/fresh audit 未跑通 | 研究文档留档；重启需先定执行基底 |
| BRC15 activation ladder | `off → shadow → active/manual` 逐级不可跳级，Phase A 到 `active/manual` 为止 | 停在 `off`，`active/manual` 未被真实 canary 证明 | `tasks/todos.md` deferred goal |

campaign `byok-brc1415-20260910-host-verification` 已 `stop`（revision 4，event `sha256:4a402198a483fccd58f37c7a5f4d10b1489a53fee4e477ec04934398bfe78452`，observed_at `2026-09-10T15:26:03.277Z`），lease 已 released，grant 自然到期，immutable preparation 记录保留。产品侧 PR byok-sdk#182 由 Owner 人工 squash 合入，#177 人工关闭、#178 以 `not planned` 关闭 —— 这些是人工动作，不构成 campaign 验收。本次收口不授予 active、不修改运行时 gate、不复用旧预算。

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
| 2026-09-02 23:48 | Inline spike — oracle_browser Connector 读回能力探针 | `docs/researches/20260902-gpt-pro-connector-readback-probe.md` | done |
| 2026-09-04 04:15 | BRC0 — Authority freeze 与 baseline characterization | `plans/archive/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md` | done |
| 2026-09-04 19:02 | BRC1 — Dispatch fence 进 effect boundary（消费 #278） | `plans/archive/plan-20260902-2101-issue-278-dispatch-effect-fence.md` | done |
| 2026-09-05 02:27 | BRC3 — Campaign protocol、policy key、ProgramAuthorization 复用、append-only journal、cross-process lock | `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md` | done |
| 2026-09-05 02:30 | BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport | `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` | done |
| 2026-09-05 03:47 | BRC4 — GPT Pro Issue batch authoring lane | (none) | done |
| 2026-09-05 18:16 | BRC5 — Heartbeat observation 与 slot reconciliation | `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` | done |
| 2026-09-06 01:16 | BRC6 — Adoption 与原子 Sprint/WorkGraph materialization | `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md` | done |
| 2026-09-06 04:00 | BRC7 — Local auto-plan 交接与 feature-promotion guard | `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md` | done |
| 2026-09-06 16:25 | BRC8 — Acquire-next 与有界并行 worker 控制（消费 #280） | `plans/archive/plan-20260906-0401-brc8-bounded-worker-acquisition.md` | done |
| 2026-09-06 22:43 | BRC9 — Campaign budget 与 attempt receipts（消费 #282/#287 子集） | `plans/archive/plan-20260906-2017-brc9-campaign-budget-prerequisite.md` | done |
| 2026-09-06 23:15 | BRC9 — Campaign budget 与 attempt receipts（消费 #282/#287 子集） | #282 prerequisite acceptance retained; whole-row completion corrected because campaign consumers remain unaccepted | pending |
| 2026-09-07 04:59 | BRC9 — Campaign budget 与 attempt receipts（消费 #282/#287 子集） | `plans/archive/plan-20260907-0348-brc9-transient-retry-consumption.md` | done |
| 2026-09-07 12:14 | BRC10 — Lease liveness 与 controller recovery（消费 #286） | `plans/archive/plan-20260907-0554-brc10-lifecycle.md` | done |
| 2026-09-07 14:59 | BRC13 — Issue closure 与 exact branch/worktree cleanup（人工 merge 之后） | `plans/archive/plan-20260907-1224-brc13-closeout.md` | done |
| 2026-09-08 05:02 | BRC6a — Readback evidence boundary correction（覆盖 BRC6/BRC14） | (none) | done |
| 2026-09-08 05:50 | BRC15a — Real GPT shadow canary 与价值观测 | `docs/researches/20260907-brc15a-real-shadow-canary.md` | done |
| 2026-09-10 23:31 | BRC14 — Fresh GPT Pro main audit 与 1/2/3 group sequencing | `docs/researches/20260910-brc1415-canary3-closeout.md` | done |
| 2026-09-10 23:31 | BRC15 — Canary 1/3 与 activation ladder（消费 Canary 2） | `docs/researches/20260910-brc1415-canary3-closeout.md` | done |
