# Sprint: GPT Pro-Seeded Bounded Repair Campaign (Phase A)

> **Status**: Approved
> **Slug**: `gpt-pro-seeded-repair-campaign`
> **Created**: 2026-09-02 22:38
> **Updated**: 2026-09-05 03:47
> **Substantive Change SHA256**: `sha256:b481275238a4cc6f155044b23db61be43e48a681dcf0a0ebdbc4c4624e52956e`
> **Source PRD**: `plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md`
> **Parent Design**: `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`
> **Source Spec**: `docs/spec.md`
> **Baseline**: `main@a2830db43f7fffbe0535f5b98674f6c4e5aa4f84`
> **Goal Mode**: incremental
> **Phase**: A — manual merge，只收 `bugfix` 与 `test_gap`
> **Default Feature State**: `development_campaign.mode = "off"`
> **Substantive Change SHA256**: `sha256:ac2c5d592bd11a37f714a6cf0b96a824cfadf0310af9b493236a83766ca16a05`
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

见 Source PRD scenarios 1–5。每一行必须写明它关闭哪些 scenario。

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
- **connector_evidence**：`verified`（UI 观察）在 oracle_browser 下不可达（见 `docs/researches/20260902-gpt-pro-connector-readback-probe.md`）。adoption 与 fresh main audit 都改用 `challenge_verified`：本地在 exact SHA 上生成确定性挑战，模型逐字命中才算读到该 commit；模型自述不构成证据。
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
行1 authority freeze
├─→ 行2 dispatch fence（#278）
└─→ 行3 campaign core（protocol/policy/authorization/journal/lock）

行3 → 行4 connector 探针 → 行5 transport → 行6 issue authoring
行6 → 行7 slot observation → 行8 adoption + materialization
行8 → 行9 local auto-plan 交接
行2 + 行9 → 行10 acquire-next 并行控制（#280）
行3 → 行11 budget/attempts（#282/#287）
行10 + 行11 → 行12 lease liveness（#286）
行12 → 行13 closure + cleanup（人工 merge 之后）
行7 + 行13 → 行14 fresh main audit + group sequencing
全部 → 行15 canary 与 activation ladder
```

允许并行：行 2 与行 3 在行 1 之后；行 5 与行 10 在行 3 之后。
禁止并行：两行同时改 campaign core protocol；batch parser 未冻结时写 materializer。

### Parallel Session Coordination

#278、#280、#282、#286、#287 正由另一个 session 实作中。对应的 backlog 行（2、9、10、11）
写成「消费已落地的 #NNN」；若该 Issue 未落地，该行 blocked，不在本 sprint 重新实作。

### Risks

- **#283（持久化 task_id）**：合入 main 后，Sprint 行格式会变成
  `| ID | Task | Mode | Acceptance | Status |`，Work Graph join key 从 `task_ref` 改为持久化
  `task_id`，本 sprint 需要跑一次 migration 命令才能被 live code path 消费。本文件当前
  仍用当前 runner 能读的格式，不预先切换。
- **#284（dependency acceptance_authority）**：`depends_on` 边新增必填
  `acceptance_authority` 键，四种 `required_state` 全部接上。campaign v1 只用
  `canonical_done` 且 `acceptance_authority: null`，缺键 fail closed。本地 main
  `a2830db4` 尚未可见该形状，实现行 7 之前需确认 #284 已合入。
- **oracle_browser 读回能力未验证**：若探针（行 4）证明无法产出 `verified`，
  fresh main audit 的自动化路径需要改为人工确认 SHA 读回，行 13 的验收随之调整。
- **GPT Pro 补写服从率未知**：影响 authoring rounds 预算大小，由行 14 的 canary 2 实测。
- **GitHub Issue 分页与索引延迟**：分页不完整被当作 complete 会静默丢 slot；
  行 6 必须用 provider list/read + 本地 observation store，不用全文搜索当 complete 权威。

## Backlog

Ordered execution queue；保持依赖顺序。Mode `contract` 走完整 plan -> contract -> worktree
流程。每行的 Acceptance 必须具体可验。

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | 23d385b0f0410137fe33517b757689d02fb1741cb495e9a7b6c4262930a81907 | [x] | BRC0 — Authority freeze 与 baseline characterization | contract | 源码行为零变化，Task/Lease/Acceptance/Publication bytes 逐字节不变；绘出 Issue→Task→Plan→Lease→PR→Merge 数据流并冻结 GPT Pro 与本地 Agent 权限表；负向 fixture 证明 Issue 不是 Task、prompt 不是 Claim；证明 heartbeat-triage 仍只读、旧 autoplan 已退役、External Source binding 不创建 Task、campaign capability 默认不存在；冻结 protected capabilities 清单与 provider partial-success fixtures；architecture request 完整 |  |
| 2 | bdb16bde88d7b8d131a6304f119d6c863d413eaac5e653b9428e497b85505ab7 | [x] | BRC1 — Dispatch fence 进 effect boundary（消费 #278） | contract | 消费已落地的 #278；未落地则该行 blocked，不在本 sprint 重新实作。落地后断言：直接 effect call 缺 binding 时在 host action 之前失败；`delegation_only` 行为不变；stale binding 拒绝；CLI 路径与 campaign controller 路径各只执行一次 fence（不重复不遗漏）；raw unfenced entrypoint 不再被外部模块调用；ArchContext 同步 | `plans/archive/plan-20260902-2101-issue-278-dispatch-effect-fence.md` |
| 3 | ebc379bc400fac66ae579d6d7c7670936dfec322c290a5fab77f8c706c0f42af | [x] | BRC3 — Campaign protocol、policy key、ProgramAuthorization 复用、append-only journal、cross-process lock | contract | 复用 `ProgramAuthorizationV1` 并以 campaign 字段作为其 payload，不新建 `DevelopmentCampaignAuthorizationV1`；`.ai/harness/policy.json` 新增 `development_campaign.mode` 默认 `off`，阶梯 `off → shadow → active/manual`，且 campaign 启动前校验 `external_sources.mode` 非 `off` 否则 fail closed；store 落 `<git-common-dir>/repo-harness/development-campaigns/v1/`；exact-key canonical protocol；append-only event chain 且 current projection 可从 events 完全重建；cross-process lock 生效；same-key replay 幂等、conflicting replay 拒绝；candidate branch 不能放宽 policy；`mode=off` 时所有 mutation 命令失败退出而非静默 no-op | `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md` |
| 4 | a8f00b0c394642116eb229d5ee4be562286a547de61b7c231b1505c8eab97278 | [x] | Inline spike — oracle_browser Connector 读回能力探针 | inline | 在行 6 之前完成。用一次真实 `oracle_browser` 往返验证能否产出可验证的 Connector 读回证据，判定 `connector_evidence` 可达到 `verified` 还是仅 `bundle_only`；结论写进 `docs/researches/20260902-gpt-pro-connector-readback-probe.md` 并回填行 14 的 audit 验收路径；若不可达 `verified`，明确 fresh main audit 的人工 SHA 确认降级方案 | `docs/researches/20260902-gpt-pro-connector-readback-probe.md` |
| 5 | 9e7090269d9d457155983885ef1cfea64fc606bfcbfd01d81d3d6a971e18aa29 | [x] | BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport | contract | 有 profile 绑定时 `browser-consult` 的唯一 oracle 传输为 `--copy-profile <user-data-dir> --browser-chrome-profile <profile-directory>`，不再传 `--browser-cookie-path`，两者不共存、无静默回退；oracle 缺 `--copy-profile` 或 `--browser-chrome-profile` 时 fail closed（`ORACLE_COPY_PROFILE_UNSUPPORTED`）；`browser-doctor` capabilities 新增 `copyProfile` 与 `browserChromeProfile`，`status: ready` 要求二者为 true；`BrowserSessionMeta.browser` 新增 `transport: 'copy_profile'` 并落盘；dry-run 命令行断言含 `--copy-profile` 与 `--browser-chrome-profile` 且不含 `--browser-cookie-path`；oracle 输出 `A session with the same prompt is already running` 映射为 `ORACLE_SESSION_ALREADY_RUNNING` 并附 recovery，不自动加 `--force`；`docs/repo-harness-chatgpt-browser-engine.md` 同步，先 grep `tests/` 的字面串断言再改文档；依据：`docs/researches/20260902-gpt-pro-connector-readback-probe.md` | `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` |
| 6 | bb7d61be6326a0b5bb524fe43b812e639c8ac308adcdf4aae11e9f36cba06a50 | [x] | BRC4 — GPT Pro Issue batch authoring lane | contract | persist `IssueBatchIntentV1` 先于打开浏览器，无例外；intent 绑定 exact repo/ref/`base_main_sha`；prompt 出境前跑 secret scan；slot 权威在 body marker 三字段（`campaign_id`/`group`/`slot`）且 marker 不含任何哈希，标题前缀只作显示、对账不读标题；本地无 issue-create fallback（fake provider 断言本地 create 调用数为 0）；authoring session 可用于补缺与指定 edit；浏览器超时后不推断成功，状态只由本地观察改变；GPT Pro 创建第 11 项时该项不被采纳；wrong campaign/group 的 Issue 被忽略；session unverified 不能 adopt |  |
| 7 | ec198badc2dff156f1b523631a82658b961121bc1c304deef1ad1acaf978d08a | [ ] | BRC5 — Heartbeat observation 与 slot reconciliation | contract | 对账矩阵全覆盖：10 unique valid → `complete`；7 valid 3 missing → `incomplete` 并只列缺失 slot；同 slot ×2 → `issue_batch_ambiguous` fail closed 且绝不自动关闭其一；invalid metadata → `slot_invalid` 允许一次指定 edit repair、失败降为 `unfilled`；malformed marker 不采纳；观察后 body 被编辑 → `issue_source_drift`；provider 不可用 → `issue_provider_unavailable` 不当 empty；分页不完整 → `issue_provider_snapshot_incomplete` 不当 complete；adoption 前 main 移动 → `source_main_stale`；`issue_slot_unexpected` 的孤儿 Issue 由本地以 `not_planned` 关闭并留原因评论。Heartbeat 侧：只在有 GPT Pro 派单在飞时排程 step，无在飞派单立即回 `idle` 并回传 `next_check_at`，deadline 由 intent 的 `created_at`/`expires_at` 推出、超时进 `campaign_no_progress`；一个 step 最多一个外部 mutation |  |
| 8 | 71b4f6f92ed60f8f281ec4f3235b305490b05a67f6a1bb7f6e204c857214d27f | [ ] | BRC6 — Adoption 与原子 Sprint/WorkGraph materialization | contract | `issues_per_group` 按上限而非目标判定：authoring rounds 预算耗尽后以现有有效 slot adopt（N ≤ 10），未填充 slot 记入 receipt 的 `unfilled_slots`；adoption 阶段接受 `connector_evidence: bundle_only`；Sprint、Work Graph 与 issue manifest 在同一个 Git transaction 内落地，崩溃不留半更新，replay 不重复新增 rows；materialization 本身不 Claim 不建 WorkEnvelope，Offers 只在 materialization commit 进入 canonical main 之后出现；Work Graph 以持久化 `task_id` 为 join key（依赖 #283 落地并跑一次 migration）；`depends_on` 边必填 `acceptance_authority` 键（#284），campaign v1 只生成 `required_state: canonical_done` 且 `acceptance_authority: null`，缺键 fail closed；unsupported kind 拒绝；dependency DAG 无环且只引用本组；capability concurrency key 准确；若 #285 的 batch primitive 已落地则消费它，未落地则本行只用窄化 Repair adoption、不建通用 WorkDemand 平台 |  |
| 9 | 9a548acaccc8b388b6166e69e9e2aef6656669613e54a7d0d1615207e9b10cdc | [ ] | BRC7 — Local auto-plan 交接与 feature-promotion guard | contract | controller `step` 只发 planning job、自身不做规划；`local_parent_host` 那个 host agent 在自己 session 内对 bugfix 跑 `/hunt`、对 test_gap 跑 characterize，用 `repo-harness run capture-plan` 落 plan；下一个 step 靠 TaskOffer 从 `planning_required` 变 `execution_ready` 观察完成（`src/core/fleet/task-offer.ts`），controller 不询问 host agent 完成状态；闭集 planning outcome 为 `plan_ready`/`not_reproducible`/`feature_route_required`/`human_attention_required`/`source_stale`/`planning_failed`；bugfix 无 Root Cause Evidence 不能 `plan_ready`，test_gap 无法证明旧测试缺口不能 `plan_ready`；新增 CLI/MCP tool/public export/protocol kind/capability node 被 feature guard 拦为 `feature_surface_detected`，protected path 拦为 `protected_surface_detected`，两者均不得降级为 warning；plan 绑定 exact Issue observation 与 Task revision，Issue 被编辑后旧 plan 判 stale；local parent 唯一；GPT Pro 不参与 per-Issue plan authority |  |
| 10 | 3722412b92ea2240c60bbca9f09ae2e04e2a30974d2978bc63778f00cfc9ac46 | [ ] | BRC8 — Acquire-next 与有界并行 worker 控制（消费 #280） | contract | 消费已落地的 #280；未落地则该行 blocked。落地后断言：只使用 canonical EngineerOffers 排序，无第二套 scoring；执行走既有 acquire 链 Offer → Claim → fresh worktree → Lease bind → ClaimToken → contract projection → WorkEnvelope（`src/effects/fleet/acquire.ts`），配合 `contract-worktree` 与 `ship-worktrees`，不引入任何新 root lifecycle 命令；same idempotency key 返回同一 acquisition；两进程竞争不重复 claim；相同 capability concurrency key 不并行；`max_parallel_tasks` 严格执行；dispatch prompt 不构成任务归属，Worker 只消费真实 WorkEnvelope；无 eligible offer 时正常退出 |  |
| 11 | 691bf0c1961cd506c2a3f63b031581d21445eb4f2f243356ade6cdb04e1aa812 | [ ] | BRC9 — Campaign budget 与 attempt receipts（消费 #282/#287 子集） | contract | 消费已落地的 #282 与 #287 的 campaign 必要子集；未落地则该行 blocked。落地后断言：限额覆盖 campaign wall-clock deadline、controller step 数、GPT authoring rounds、成功 acquisition 数、provider 调用数、per-task repair cycles、连续 no-progress steps、连续 transient failures；每个 side effect 前先 reserve，reservation 后崩溃阻止二次消费，same-key 不 double charge；attempt 结果为闭集（completed / not_reproducible / user_blocked / external_blocked / transient_failure / permanent_failure / lease_lost / cancelled / reconciliation_required）；max retry 后 `campaign_retry_exhausted`；user 与 permanent blocker 不自动 retry；deterministic backoff；budget 耗尽在下一次 claim 或 dispatch 之前停止；无可验证 token usage 时不得声称执行 token hard limit |  |
| 12 | fb27ce861a78e077dc9b72f64a607e51e8baaefbbec28bd99af92362b5d997c4 | [ ] | BRC10 — Lease liveness 与 controller recovery（消费 #286） | contract | 消费已落地的 #286；未落地则该行 blocked。落地后断言：current owner 可 generation-fenced renew，旧 generation 不能续期；expiry 本身不等于 dead，不得仅凭超时或 PID 抢 Lease；active provider effect 与 completing/reviewing 状态保护 Lease；liveness unknown 只产生 attention 不产生 takeover；evidence-gated reclaim 走既有 steal 路径；两个 reclaimer 只有一个成功；controller crash 后可从 append-only journal 恢复且不制造双 owner |  |
| 13 | e71d90886c21eff5e34cd9e8046c270c9f1972669faeb31b0db49d7cc344e806 | [ ] | BRC13 — Issue closure 与 exact branch/worktree cleanup（人工 merge 之后） | contract | 顺序固定且不可调换：人工 merge → 验证 merge commit 可从 current main 到达 → 关闭 Issue → 删远程分支 → 移除本地 worktree → 删本地分支 → 持久化 `CampaignCleanupReceiptV1`；未 merge 不能以 `completed` 关闭；source Issue drift 阻止自动 close；一个 Issue 对应多个 Task 时全部完成才 close；本地证伪用 `not_planned` 并保留 falsifier 证据；closure comment 记录 campaign/group/slot、base main、exact Issue observation、disposition、merge SHA 或证据、本地验收结果；close 请求 persist-first，结果未知先 reconcile 不直接重试；远程分支只按 exact ref 删除，已不存在为幂等成功；dirty worktree 拒绝清理并返回 `cleanup_blocked_dirty_worktree`，foreign Lease 引用的 worktree 拒绝；merge 成功但 cleanup 失败时 group 进入 `cleanup_pending` 且不进入下一组 |  |
| 14 | 4c28bc09a21de8d6047778b797cca0e07f4fb92604ae8f1bf09f15bb0afcf3a4 | [ ] | BRC14 — Fresh GPT Pro main audit 与 1/2/3 group sequencing | contract | audit 必须是新会话且不能是 authoring session；读 exact `final_main_sha` 并由本地校验 `observed_main_sha == expected_main_sha`；audit 读回以 `challenge_verified` 为准：本地在 `final_main_sha` 上生成 ≥3 个确定性挑战（指定目录清单、指定文件指定行原文、指定文件 sha256 前缀），模型全部逐字命中才算读到 exact main，任一失败即 `unverified`；模型自述的 Connector 调用不构成证据（行 4 探针已证明 `verified` 这个 UI 观察等级在 oracle_browser 下不可达）；所有 slot（含 `unfilled`）在 audit 输入中被完整交代；audit 不得创建或修改 Issue、不得 reopen、不得把 follow-up 自动扩成 Group 4；`accepted` 才启动下一组，`accepted_with_followups` 不突破 `group_count`，`rejected` 停止且不自动 rollback main，`unverified` 不进入下一组但可在预算内有界重试；Group 2 基于 Group 1 final main、Group 3 基于 Group 2 final main；达到授权 group count 后 controller 进入 terminal |  |
| 15 | b45c1b05078577dad30e0c57d8b48f075e969f9cfb9c44368b67c4c112fcec92 | [ ] | BRC15 — Canary 1–3 与 activation ladder | contract | Canary 1（model-free）：fake GitHub 与 fake GPT 覆盖 10 slot、第 7 项断线、duplicate slot、malformed metadata、issue edit drift、controller crash、cleanup crash、audit wrong SHA，全部收敛到闭集错误词汇且无一降级为 warning。Canary 2（real GPT shadow）：disposable repository、`mode=shadow`，GPT Pro 真实创建 Issue，本地观察加对账加 adoption dry-run，断言零 task/code/PR mutation。Canary 3（active/manual merge）：一个 group、`max_parallel_tasks=2`，PR 自动生成、merge 人工执行、Issue closure 与 cleanup 自动、fresh GPT audit 收口。Activation ladder 逐级不可跳级：`off → shadow → active/manual`，Phase A 到此为止，`auto-low-risk` 与 canary 4/5 属 Phase B |  |

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
