# PRD: GPT Pro-Seeded Bounded Repair Campaign

> **Status**: Approved
> **Slug**: `gpt-pro-seeded-repair-campaign`
> **Created**: 2026-09-02 22:38
> **Updated**: 2026-09-02 22:49
> **Source Spec**: `docs/spec.md`
> **Tier**: standard
> **Baseline**: `main@a2830db43f7fffbe0535f5b98674f6c4e5aa4f84`
> **Parent Design**: `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`
> **Sprint**: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
> **Source Design Note**: `plans/sprints/20260902-GPT-issues-loop.md`（用户自有输入，只读）
> **Phase**: A（manual merge，只收 `bugfix` 与 `test_gap`）

## AI Quick-Read Card

- Problem: 用户想把「找问题」外包给一个独立的外部审计者，但既不能让它碰代码，也不能让本地 Agent 把它的意见润色掉；当前仓库没有任何把外部 Issue 收敛成有界、可恢复、可审计的本地修复波次的路径。
- Users: Human Campaign Owner、Local Campaign Controller（Claude/Codex parent host）、GPT Pro Issue Author、Fresh GPT Pro Main Auditor、Worker、Maintainer。
- Platform: repo-harness CLI + 既有 fleet acquire 执行链 + GitHub Issues（外部只读 demand 证据）。
- P0 surface: campaign 授权与 policy、issue batch authoring lane、slot 对账、adoption 与原子 materialization、local auto-plan 交接、有界并行执行、Issue closure 与 cleanup、fresh main audit。
- Core metric: 一个 group 从授权到 `accepted`，全程零人工 Issue 撰写、零 authority drift、且每个 slot 的处置都有可重建 receipt。
- Hard constraint: GPT Pro 对代码只读、只能创建 Issue；本地不改写 Issue 正文、不提供 local issue-create fallback；Phase A merge 全部人工；campaign 自身、acceptance、merge、lease authority 永远 protected。
- Key risk: 外部 provider（浏览器/Connector）产出的是部分成功与不确定结果，任何把「模型自报完成」当权威的地方都会静默造出假 Task。
- Unknowns: GPT Pro 单会话补写缺口 slot 的可靠度。（`connector_evidence: 'verified'` 已由探针证明在 oracle_browser 下不可达，改用 `challenge_verified`，见 `docs/researches/20260902-gpt-pro-connector-readback-probe.md`。）
- Acceptance scenarios: 7/10 中断后只补 3 项；重复 slot 稳定 fail closed；feature kind 无法进入 campaign。
- Suggested next step: 执行 sprint 第 1 行（authority freeze 与 baseline characterization），并在第 5 行之前跑完第 4 行的 Connector 读回能力探针。

## Problem

用户当前的产品方向由自己掌握，但仓库级的 bug、测试缺口这类「找得到但没人找」的工作没有稳定来源。人工写 Issue 是这条链上最贵的一步，而让本地 Agent 自己列问题清单会退化成自审自演：提出问题的、实现的、验收的是同一个上下文。

同时，仓库已经具备完整的执行底座——canonical Sprint 作为 Task 身份权威、Work Graph 作为调度权威、`src/effects/fleet/acquire.ts` 的 Offer → Claim → fresh worktree → Lease bind → ClaimToken → contract projection → WorkEnvelope 链作为唯一领取权限、`AcceptanceReceipt` 作为验收权威。缺的不是执行器，是一条把**外部 demand 有界收敛进这套既有权威**的窄化通道。

本 PRD 定义 Phase A：一条只收 `bugfix` 和 `test_gap` 的 Repair lane，merge 全程人工。

### Product Direction

- Hard Constraints:
  - GPT Pro 权限精确为「读 exact pinned main + 创建/编辑自己的 Issue」；禁止改代码、建分支、开 PR、merge、close Issue、改 label/milestone/assignee。
  - 本地永远不重写 GPT Pro 的 Issue 正文；Issue body 是 untrusted external content。
  - 本地不提供 issue-create fallback。GPT Pro 没写出来的 slot 就是缺的，缺就记 `unfilled`，不由本地补写。
  - Phase A 不引入任何 merge controller 代码路径；merge 由人工执行。
  - Campaign 不重新实现 plan、contract、worktree、verify 或 ship，只路由既有链路。
  - Campaign 自身、acceptance authority、merge authority、lease/claim authority、security/credential surface 是 protected，campaign 找到它们的 bug 可以开 Issue 和做 Plan，但不进入任何自动化处置。
- Recommended Defaults:
  - `group_count = 1`、`issues_per_group ≤ 10`（上限，不是目标）、`max_parallel_tasks = 2`。
  - `development_campaign.mode` 默认 `off`。
  - adoption 与 fresh main audit 的读回证据统一为 `challenge_verified`：本地在 exact SHA 上生成确定性挑战，模型逐字命中才算读到该 commit；模型自述不构成证据。
  - oracle_browser 传输固定为 `--copy-profile` 加 `--browser-chrome-profile`；campaign 授权记录 `chrome_profile_directory`，doctor ready 判定含该 profile 的 chatgpt.com session cookie 未过期。
- Freedoms:
  - slot 数量可以少于上限；一个 group 收 6 个有效 slot 是合法结果。
  - 本地 planning 用 `/hunt`（bugfix）还是 characterize（test_gap）由 kind 决定，具体调查手法自由。
  - Issue 标题格式是显示约定，不是权威。

### Feasibility Boundary

- Confirmed:
  - 执行链已存在：`src/effects/fleet/acquire.ts` 的 `collectFleetOffers` / acquire 路径，配合 `contract-worktree` 与 `ship-worktrees` helper。
  - `src/core/fleet/task-offer.ts` 已经区分 `planning_required` 与 `execution_ready`，这就是 campaign 观察规划完成的现成信号。
  - `MergeReadinessV1` / `projectMergeReadiness` 已存在于 `src/core/publication/merge-readiness.ts`。
  - `ProgramAuthorizationV1` 与 `ProgramBudgetLimitV1` 已在 `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md` 定义，存放于 `REPO_HARNESS_HOME`、不在 candidate branch。
  - runtime store 的 git-common-dir 惯例已存在：`src/effects/engineers/binding-store.ts` 的 `ENGINEER_STORE_RELATIVE_ROOT = 'repo-harness/engineers/v1'`。
  - `.ai/harness/policy.json` 的 `external_sources.mode` 当前为 `"off"`。
- [UNVERIFIED]:
  - 已解决：sprint 第 4 行探针证明 `verified` 不可达，`challenge_verified` 可达且逐字命中；传输改 `--copy-profile`。见 `docs/researches/20260902-gpt-pro-connector-readback-probe.md`。
  - GPT Pro 在同一 authoring session 内「只补缺失 slot、不动已写的」的服从率。
- 不成立的前提（源设计文档中的三处，本 PRD 已改写）:
  - 源 §5.4 称 root `repo-harness execute` 是当前唯一 lifecycle route。`src/cli/index.ts` 与 `src/cli/commands/` 中不存在该命令。执行改走既有 fleet acquire 链。
  - 源 BRC2 假设仓库已有 Cutover Closure Gate。`scripts/cutover-closure.ts` 不存在，`assets/workflow-contract.v1.json` 中无 `cutoverClosure` 键。因此 `refactor` kind、cutover gate 与 auto-merge 全部移出 Phase A。
  - 源 BRC11 要求新建 `MergeEligibilityV1`。仓库已有 `MergeReadinessV1`；未来需要时应扩展它，不新建第二个 merge 判定权威。Phase A 不含任何 merge controller 工作。

## Users

### Primary Users

- User: Human Campaign Owner
  - Need: 用一句授权换来一波已验证、已合入、已关闭的修复，不需要自己写需求。
  - Success signal: 一个 group 走完后，除了人工执行 merge 之外没有其他人工介入点。
- User: Local Campaign Controller（`local_parent_host` = claude | codex）
  - Need: 每次被唤醒时能确定性地算出「现在该做的唯一一件外部动作」，并在崩溃后重建状态。
  - Success signal: 任意 step 崩溃重放后不产生重复外部 mutation。
- User: GPT Pro Issue Author
  - Need: 一个明确的 slot 契约和一次只读 pinned main 的机会。
  - Success signal: 创建的 Issue 全部被本地观察到并正确归位到 slot。

### Secondary Users

- User: Fresh GPT Pro Main Auditor
  - Need: 只拿到 exact final main SHA、本组 Issue/PR 清单和验收 rubric，不继承出题会话的上下文。
  - Success signal: 出具的 disposition 能被本地用 `observed_main_sha == expected_main_sha` 独立校验。
- User: Worker（Claude/Codex）
  - Need: 只消费真实 WorkEnvelope，不从 prompt 里推断任务归属。
  - Success signal: 两个并行 Worker 不会拿到同一个 Task。
- User: Maintainer
  - Need: 每个 slot 的处置（修好 / 证伪 / 未填充 / 升级到人工）都留下可审计证据。
  - Success signal: 关闭的 Issue 都能反查到 merge SHA 或 falsifier 证据。

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Group 闭合率（授权 → `accepted`） | 100% | campaign journal 终态统计 | 单组内 ≥1 个 slot 停在 `human_attention_required` |
| 本地 issue-create 调用次数 | 0 | 负向测试：fake provider 断言无 issue create 调用 | >0 |
| 7/10 中断后的补写精度 | 只补 3 项、无重复 | canary 1 的断线 fixture | 补写触碰已完成 slot |
| 重复 slot 的处置 | 100% fail closed | 观察器返回 `issue_batch_ambiguous` | 任何自动关闭「较差那个」 |
| 崩溃后重复外部 mutation | 0 | 在每个 persist 边界注入崩溃后重放 | ≥1 |
| Task 身份漂移 | 0 | canonical Sprint 与 Work Graph join 校验 | Issue number 成为 Task 身份 |
| 现有 authority bytes 变化（第 1 行之后） | 0 | characterization 测试对比 | 任何 Task/Lease/Acceptance/Publication 字节变化 |

## Acceptance Scenarios

### Scenario 1

- Given: `development_campaign.mode = "shadow"`，`external_sources.mode` 已开启，已冻结的 `IssueBatchIntentV1` 声明 10 个 slot、`base_main_sha` 为 exact main。
- When: fake GPT Pro provider 在写完第 7 个 Issue 后断线，controller 下一次 `campaign step` 被 heartbeat 唤醒。
- Then: 本地独立观察到 7 个 complete、3 个 missing；follow-up 只请求补 slot 08/09/10；最终 10 个 slot 各恰好一个 Issue，本地全程未调用 issue create。
- Machine-checkable evidence: `CampaignIssueBatchAdoptionReceiptV1` 含 10 项，fake provider 的 create 调用日志中 caller 全为 GPT Pro lane。

### Scenario 2

- Given: 一个已 adopt 的 group，其中 slot 03 是 `bugfix`，slot 07 是 `test_gap`。
- When: controller step 发出 planning job，`local_parent_host` 在自己的 session 内对 slot 03 跑 `/hunt`、对 slot 07 跑 characterize，各自用 `repo-harness run capture-plan` 落 plan。
- Then: 下一次 step 通过 TaskOffer 观察到这两个 Task 从 `planning_required` 变为 `execution_ready`；bugfix 无 Root Cause Evidence 时不会变为 `execution_ready`。
- Machine-checkable evidence: `src/core/fleet/task-offer.ts` 的 `execution_readiness` 字段；plan artifact 存在且绑定 exact Issue observation digest。

### Scenario 3（negative）

- Given: GPT Pro 在同一个 group 里创建了第 11 个 Issue，marker 声明 `slot=11`；另有一个 Issue 的 marker 指向另一个 campaign_id。
- When: slot 对账运行。
- Then（must NOT）: 第 11 项与跨 campaign 的那项都不得被采纳、不得进入 Sprint、不得生成任何 Task 或 Work Package；也不得被静默忽略——第 11 项按 `issue_slot_unexpected` 由本地以 `not_planned` 关闭并留原因评论。
- Machine-checkable evidence: adoption receipt 的 issues 数组不含这两项；对应 Issue 的 `state_reason == "not_planned"` 且 closure comment 记录 campaign/group/slot 与原因。

### Scenario 4（negative）

- Given: 一个 adopted Issue 的 body 在 adoption 之后被编辑。
- When: 本地准备为它的 Task 落 plan 或派工。
- Then（must NOT）: 不得沿用旧 plan，不得把新 body 当作同一需求继续执行。
- Machine-checkable evidence: `body_sha256` 与当前观察不一致 → `issue_source_drift`，Task 进入 `human_attention_required`。

### Scenario 5（negative）

- Given: 一个 Issue 的 metadata 声明 `issue_kind: "feature"`，或其 `suspected_paths` 指向 campaign 自身 / acceptance / merge / lease authority。
- When: adoption 或 planning 运行。
- Then（must NOT）: 不得被采纳进 campaign；不得因为「本地看着像个小改动」而降级放行。
- Machine-checkable evidence: `issue_kind_unsupported` / `protected_surface_detected` / `feature_surface_detected` 错误码，且这三个词汇不得降级为 warning。

## Non-goals

- 不做 `refactor` kind。它依赖 Cutover Closure Gate，而该 gate 在仓库中不存在（`scripts/cutover-closure.ts` 与 `assets/workflow-contract.v1.json#cutoverClosure` 均无）。
- 不做 Cutover Closure Gate 本身。
- 不做 auto-merge、merge intent/receipt journal、provider merge effect、uncertain-outcome reconciliation。Phase A merge 全部人工。
- 不新建 `MergeEligibilityV1`。已有 `MergeReadinessV1` / `projectMergeReadiness`；未来的 merge 判定应扩展它。
- 不定义 `DevelopmentCampaignAuthorizationV1` 这一新的 Host 授权协议；复用 `ProgramAuthorizationV1`。
- 不复活 `repo-harness-autoplan`，也不新增 root lifecycle 执行命令。
- 不建设通用 WorkDemand 平台（对应 #285 的通用方向）。campaign 用的是窄化 Repair adoption。
- 不做 event-driven wake（#281）。Phase A 明确用 host heartbeat 轮询。
- 不把 `heartbeat-triage` 改成执行器。它保持只读 discovery 契约不变。
- GPT Pro 不参与 per-Issue 的 Plan 撰写。

## Module Behaviors (P0)

### Module 1 — Campaign 授权与 policy

- Purpose: 把用户的一句授权冻结成 Host-owned、candidate branch 不可放宽的授权事实。
- Hard Constraints:
  - 复用 `ProgramAuthorizationV1`（定义见 guarded-merge PRD）。campaign 特有字段作为它的 **campaign-scoped payload**，不新建顶层协议：`group_count: 1 | 2 | 3`、`issues_per_group`（上限，≤ 10）、`allowed_issue_kinds: ['bugfix', 'test_gap']`、`max_parallel_tasks: 1 | 2 | 3`、`issue_author: 'gpt_pro'`、`local_parent_host: 'claude' | 'codex'`、`require_fresh_main_audit: true`。
  - `merge_mode` 在 Phase A 恒为 `"manual"`。
  - 授权存于 `REPO_HARNESS_HOME`，不在 candidate branch；prompt 不能派生授权。
- Recommended Defaults: `group_count = 1`、`max_parallel_tasks = 2`。
- Normal path: 用户授权 → 校验不超过 `.ai/harness/policy.json` 定义的 maximum → 冻结 `authorization_sha256` → campaign `authorized`。
- Failure path 1: 请求超过 target-base policy maximum → `campaign_group_limit_exceeded`，fail closed。
- Failure path 2: `expires_at` 已过 → `campaign_authorization_stale`，任何 step 拒绝执行外部 mutation。
- Dependencies: `.ai/harness/policy.json` 新增 `development_campaign` 键。
- Open decisions: None

### Module 2 — 前置 policy 阶梯

- Purpose: 保证 campaign 默认不存在，且升级路径不可跳级。
- Hard Constraints:
  - 新增 `development_campaign.mode`，默认 `"off"`，阶梯为 `off → shadow → active/manual`。Phase A 不含 `auto-low-risk`。
  - `external_sources.mode` 当前为 `"off"`；campaign 启动前必须先开启，否则 Issue 观察无合法 intake 路径。这是硬前置，不是软警告。
  - candidate branch 的 policy 修改不能应用于自身。
- Normal path: `off` 禁止一切 campaign mutation；`shadow` 允许 authoring、观察、对账、adoption dry-run 与 planning dry-run，禁止 materialization / Claim / 代码执行 / PR / close Issue；`active/manual` 允许 materialization、planning、Worker 执行与 PR，merge 仍为人工。
- Failure path 1: `mode = off` 时任何 mutation 命令 → 失败退出，不静默 no-op。
- Failure path 2: `external_sources.mode = off` 时启动 campaign → fail closed 并指明需要开启的 policy 键。
- Dependencies: Module 1。
- Open decisions: None

### Module 3 — Issue batch authoring lane

- Purpose: 在冻结的 base main 上，让 GPT Pro 直接创建本组 Issue。
- Hard Constraints:
  - 必须先持久化 `IssueBatchIntentV1` 再打开 GPT Pro。persist intent first 无例外。
  - 本地无 issue-create fallback。
  - **slot 权威在 body marker**，marker 只含三个字段、不含任何 hash 或 digest：
    ```html
    <!-- repo-harness-campaign:v1
    campaign_id=<campaign-id>
    group=1
    slot=01
    -->
    ```
    精确值（intent digest、prompt hash、base SHA）全部留在本地 intent 与 adoption receipt，避免模型抄错 40/64 位 hash。
  - 标题前缀 `[rh-campaign:<id>:g01:s01][bugfix] <title>` 只是显示约定，**不是权威**；对账不读标题。
  - 浏览器超时后不得推断成功；状态只能由本地观察改变。
- Normal path: 冻结 intent → 打开 authoring session → GPT Pro 调用 GitHub Issue create → 本地观察。
- Failure path 1: authoring rounds 预算耗尽 → 停止追加请求，进入 adoption 阶段以现有有效 slot 收口。
- Failure path 2: session 未验证（`issue_authoring_session_unverified`）→ 不得 adopt。
- Dependencies: Module 1、Module 2、Module 4 的探针结论。
- Open decisions: None

### Module 4 — Slot 观察与对账

- Purpose: 本地独立读取 GitHub，不相信 GPT Pro 自报「已创建 10 个」。
- Hard Constraints（按 `(campaign_id, group, slot)` 判定）:
  - 恰好一个合法 Issue → `complete`。
  - 没有 Issue → `missing`；在 authoring rounds 预算内可在同一 session 内请求补缺，只列缺失的 slot。
  - 同一 slot ≥2 个 Issue → `issue_batch_ambiguous`，fail closed 进 human attention。**不得自动关闭「看起来较差」的那个。**
  - metadata 非法 → `slot_invalid`，**允许一次指定 Issue 的 edit repair**；修复失败则该 slot 降为 `unfilled`。若 GPT Pro 在 repair 时错误新建了同 slot Issue，则升级为 ambiguous。
  - marker 指向本 campaign 未声明的 slot（如第 11 项）→ `issue_slot_unexpected`：本地以 `not_planned` 关闭该孤儿 Issue 并留原因评论，不采纳。
  - provider 不可用 → `issue_provider_unavailable`，不得当作 empty。
  - 分页不完整 → `issue_provider_snapshot_incomplete`，不得当作 complete。
  - adoption 前 main 已移动 → `campaign_base_main_moved` / `source_main_stale`。
- Normal path: 每次 step 读一次 provider 快照 → 计算 slot 表 → 持久化 observation。
- Failure path 1: 部分 authoring（7 complete / 3 missing）→ 持久化观察 + 有界 follow-up，绝不重新要求「再创建 10 个」。
- Failure path 2: Issue body 在观察后被编辑 → `issue_source_drift`。
- Dependencies: `external_sources` intake。
- Open decisions: None

### Module 5 — Adoption 与原子 materialization

- Purpose: 把已验证的 slot 一次性物化成 canonical Sprint 与 Work Graph。
- Hard Constraints:
  - `issues_per_group` 是**上限不是目标**。authoring rounds 预算耗尽后，以现有有效 slot adopt（N ≤ 10），缺的 slot 记为 `unfilled` 并写进 receipt。不为了凑数放宽校验。
  - adoption 的读回证据为 `challenge_verified`（本地确定性挑战全部命中），不接受模型自述。
  - Sprint、Work Graph、issue manifest 必须在**同一个 Git transaction** 内落地；崩溃不得留下半更新。
  - materialization 本身不 Claim、不建 WorkEnvelope。Offers 只在 materialization commit 进入 canonical main 之后出现。
  - Work Graph join key 使用持久化 `task_id`（依赖 #283 落地并跑一次 migration；见 Known Unknowns）。
  - `depends_on` 边必填 `acceptance_authority` 键（#284）。campaign v1 只生成 `required_state: "canonical_done"` 且 `acceptance_authority: null`；缺键 fail closed。
  - dependency slots 只能引用本组；DAG 无环。
- Normal path: 全部校验通过 → 生成 `CampaignIssueBatchAdoptionReceiptV1` → 原子物化。
- Failure path 1: 不支持的 kind → `issue_kind_unsupported`，该 slot 不物化。
- Failure path 2: replay → 幂等，不重复新增 rows。
- Dependencies: Module 4；#283、#284。
- Open decisions: None

### Module 6 — Local auto-plan 交接

- Purpose: 让规划留在本地，且交接机制是显式的而不是隐含的。
- Hard Constraints（**这是本 PRD 最容易被误读的一段，机制必须照此实现**）:
  - controller 的 `campaign step` **只发 planning job**，它自己不做规划。
  - 实际规划由 `local_parent_host` 指定的那个 host agent 在**自己的 session 内**执行：`bugfix` 走 `/hunt`（复现或证伪 → root cause 句 → Root Cause Evidence → regression guard），`test_gap` 走 characterize（刻画现有行为 → 证明测试缺失 → mutation/旧实现 falsifier）。
  - host agent 用 `repo-harness run capture-plan` 把结果落成 plan artifact。
  - **下一个 step 靠 TaskOffer 观察完成**：Task 的 `execution_readiness` 从 `planning_required` 变为 `execution_ready`（`src/core/fleet/task-offer.ts`）。controller 不询问 host agent「你做完了吗」。
  - 派工同理：step 产出 dispatch prompt，由 host agent 负责 spawn Worker。prompt 不构成任务归属。
  - GPT Pro 不参与 per-Issue Plan：它已是 Issue proposer 与 final auditor，再加规划就成了自问自答自验。
- Normal path: `planning_required` → planning job → host agent 规划 → capture-plan → `execution_ready`。
- Failure path 1: bugfix 无 Root Cause Evidence → 不得 `plan_ready`；证伪成立则走 `not_reproducible` 终点。
- Failure path 2: 探测到 feature surface（新 CLI/MCP tool/public export/protocol kind/capability node）或 protected path → `feature_route_required` / `protected_surface_detected`，转标准 PRD → Sprint → Plan 流程。
- Dependencies: Module 5。
- Open decisions: None

### Module 7 — 有界并行执行

- Purpose: 用既有链路执行，不新建执行引擎。
- Hard Constraints:
  - 执行路径是既有 fleet acquire 链：`src/effects/fleet/acquire.ts` 的 Offer → Claim → fresh worktree → Lease bind → ClaimToken → contract projection → WorkEnvelope，配合 `contract-worktree` 与 `ship-worktrees` helper。**没有 `repo-harness execute` 这个 root lifecycle route。**
  - 任务归属只来自 Lease + ClaimActorReceipt + WorkEnvelope。
  - 不同 concurrency key 可并行；相同 capability concurrency key 串行；有 `depends_on` 的等依赖 `canonical_done`；同一 Task 任意时刻只有一个 current Lease owner。
  - `max_parallel_tasks` 严格执行。
- Normal path: Worker 读 offers → acquire-next → 只接受返回的 WorkEnvelope → 在自己 worktree 与 contract `allowed_paths` 内实现 → verify → review → AcceptanceReceipt → PR。
- Failure path 1: 无 eligible offer → 正常退出，不空转。
- Failure path 2: 两进程竞争同一 offer → 只有一个 claim 成功。
- Dependencies: #278（dispatch fence）、#280（acquire-next）、#282/#287（budget/attempts）、#286（lease liveness）。
- Open decisions: None

### Module 8 — Heartbeat 与 step 边界

- Purpose: 让唤醒成本与实际在飞的外部工作成正比。
- Hard Constraints:
  - host **只在有 GPT Pro 派单在飞时**（issue authoring 或 main audit）才排程 `campaign step`。
  - step 发现无在飞派单时**立即返回 `idle` 并回传 `next_check_at`**，不做任何 mutation。
  - deadline 由 durable intent 的 `created_at` / `expires_at` 推出，不由墙钟猜测；超时进入 `campaign_no_progress`。
  - 一个 step 最多做一个外部 mutation。
  - heartbeat 不是权限来源；`heartbeat-triage` 保持只读，不改造成控制器。
- Normal path: acquire campaign lock → 读 current → 复验授权 → 至多一个外部 mutation → append step receipt → 发布 current projection → 释放 lock。
- Failure path 1: 拿不到 cross-process lock → 退出，不并发推进。
- Failure path 2: step 中途崩溃 → 下次 step 从 append-only journal 重建 current，重放幂等。
- Dependencies: Module 1。
- Open decisions: None

### Module 9 — Issue closure 与 cleanup

- Purpose: 让 Issue 关闭与分支清理绑定 exact 已合入的事实。
- Hard Constraints（顺序不可调换）: 人工 merge → 验证 merge commit 可从 current main 到达 → 关闭 Issue → 删远程分支 → 移除本地 worktree → 删本地分支 → 持久化 `CampaignCleanupReceiptV1`。
  - 成功修复用 state reason `completed`；本地证伪用 `not_planned`。
  - closure comment 必须记录 campaign/group/slot、base main、exact Issue observation、disposition、merge SHA 或 falsifier 证据、本地验收结果。
  - worktree 有未提交内容 → `cleanup_blocked_dirty_worktree`，不得强删。
  - 远程分支只按 exact ref 删除；已不存在视为幂等成功。
- Normal path: 如上。
- Failure path 1: merge 成功但 cleanup 失败 → group 进入 `cleanup_pending`；代码不回滚，但默认不进入下一组。
- Failure path 2: Issue 关闭结果未知 → 先 reconcile，不直接重试。
- Dependencies: Module 7；人工 merge 完成。
- Open decisions: None

### Module 10 — Fresh main audit 与 group sequencing

- Purpose: 用一个全新的 GPT Pro 会话独立验收，决定是否进入下一组。
- Hard Constraints:
  - audit session 必须是新会话，不能是 authoring session。
  - 必须读 exact `final_main_sha`；本地校验 `observed_main_sha == expected_main_sha`。
  - audit 阶段读回证据必须为 `challenge_verified`：本地在 `final_main_sha` 上生成 ≥3 个确定性挑战，全部逐字命中；任一失败即 `unverified`。
  - audit 不得创建或修改任何 Issue，不得 reopen，不得把 follow-up 自动扩成 Group 4。
  - Group 2 必须基于 Group 1 的 final main 出题；Group 3 基于 Group 2 的 final main。
  - 达到授权 group count 后 controller 进入 terminal。
- Normal path: 冻结 final main → 新会话 → 结构化 disposition。
- Failure path 1: `rejected` → campaign blocked，不自动 rollback main，保留 findings，交用户决定。
- Failure path 2: `unverified` → 不进入下一组，可在预算内有界重试 fresh audit。
- Dependencies: Module 9。
- Open decisions: None

## Data Model

```jsonc
{
  "version": "1",
  "entities": [
    {
      "id": "program_authorization_campaign_payload",
      "owner": "host", // ProgramAuthorizationV1 的 campaign-scoped payload，不是新协议
      "fields": {
        "campaign_id": "string",
        "group_count": "1 | 2 | 3",
        "issues_per_group": "number", // 上限，≤ 10
        "allowed_issue_kinds": "readonly ['bugfix', 'test_gap']", // Phase A 无 refactor
        "max_parallel_tasks": "1 | 2 | 3",
        "issue_author": "'gpt_pro'",
        "local_parent_host": "'claude' | 'codex'",
        "require_fresh_main_audit": "true",
        "merge_mode": "'manual'" // Phase A 恒为 manual
      }
    },
    {
      "id": "issue_batch_intent_v1",
      "owner": "local_controller", // 必须先持久化再打开 GPT Pro
      "fields": {
        "protocol": "1",
        "kind": "'repo-harness-issue-batch-intent'",
        "campaign_id": "string",
        "group_number": "number",
        "base_main_sha": "string", // 冻结的出题基线
        "slots": "readonly string[]", // '01'..'10'，上限
        "allowed_issue_kinds": "readonly RepairCampaignIssueKind[]",
        "prompt_sha256": "string",
        "authoring_parent": "'claude' | 'codex'",
        "gpt_pro_transport": "'codex_iab' | 'oracle_browser'",
        "browser_transport": "'copy_profile'", // oracle_browser 唯一传输
        "chrome_profile_directory": "string", // Connector 授权所在的 Chrome profile
        "created_at": "datetime", // deadline 由 created_at/expires_at 推出
        "expires_at": "datetime",
        "intent_sha256": "string"
      }
    },
    {
      "id": "campaign_issue_batch_adoption_receipt_v1",
      "owner": "local_controller",
      "fields": {
        "protocol": "1",
        "kind": "'repo-harness-campaign-issue-batch-adoption'",
        "campaign_id": "string",
        "group_number": "number",
        "base_main_sha": "string",
        "issue_batch_intent_sha256": "string",
        "authorization_sha256": "string",
        "authoring_session_ref": "string",
        "connector_evidence": "'challenge_verified' | 'unverified'", // 本地确定性挑战，不接受模型自述
        "issues": "readonly CampaignIssueAdoptionV1[]", // N ≤ issues_per_group
        "unfilled_slots": "readonly string[]", // 预算耗尽后未填充的 slot
        "dependency_graph_sha256": "string",
        "receipt_sha256": "string"
      }
    },
    {
      "id": "campaign_issue_adoption_v1",
      "owner": "local_controller",
      "fields": {
        "slot": "string", // 权威来自 body marker，不是标题
        "provider_issue_id": "string",
        "issue_number": "number",
        "source_observation_sha256": "string",
        "title_sha256": "string",
        "body_sha256": "string", // 编辑后触发 issue_source_drift
        "issue_kind": "'bugfix' | 'test_gap'",
        "primary_capability": "string",
        "priority": "number",
        "depends_on_slots": "readonly string[]",
        "suspected_paths": "readonly string[]"
      }
    },
    {
      "id": "campaign_work_package_dependency",
      "owner": "work_graph",
      "fields": {
        "repository_id": "string",
        "work_package_id": "string",
        "required_state": "'canonical_done'", // campaign v1 只用这一种
        "acceptance_authority": "null" // #284 起必填；缺键 fail closed
      }
    },
    {
      "id": "campaign_cleanup_receipt_v1",
      "owner": "local_controller",
      "fields": {
        "campaign_id": "string",
        "group_number": "number",
        "slot": "string",
        "task_id": "string",
        "claim_id": "string",
        "pr_number": "number",
        "pr_head_sha": "string",
        "merge_commit_sha": "string",
        "observed_main_sha": "string",
        "remote_branch_deleted": "boolean",
        "local_worktree_removed": "boolean",
        "local_branch_deleted": "boolean",
        "dirty_paths_before_cleanup": "readonly string[]",
        "receipt_sha256": "string"
      }
    }
  ],
  "relationships": [
    "ProgramAuthorization 1 -> N campaign group",
    "IssueBatchIntent 1 -> 1 adoption receipt",
    "adoption receipt 1 -> N canonical Sprint row (task_id join key)",
    "Sprint row 1 -> 1 Work Package -> N Lease/Claim over time",
    "merged PR 1 -> 1 issue closure -> 1 cleanup receipt"
  ]
}
```

Runtime store 根路径沿 `src/effects/engineers/binding-store.ts` 的 `ENGINEER_STORE_RELATIVE_ROOT` 惯例：

```text
<git-common-dir>/repo-harness/development-campaigns/v1/
  <campaign-id>/
    events/          # append-only
    current.json     # 可从 events 重建的投影
    groups/0001..0003/
    locks/           # cross-process
```

### 状态机

Campaign 状态沿源设计不变。**Group 状态改为粗粒度，用计数聚合而非逐阶段枚举**：

```text
awaiting_batch → adopted → in_progress → closeout → auditing → accepted
```

`in_progress` / `closeout` 的内部进度由「N 个 work item 处于状态 X」的计数投影表达，不为每个阶段单开一个 group 状态。异常侧仍保留 `issue_batch_ambiguous`、`source_main_stale`、`cleanup_pending`、`main_audit_rejected`、`main_audit_unverified`。

Work item 状态沿源设计 §7.3：

```text
observed → adopted → materialized → planning_required → plan_approved
→ offered → claimed → executing → verifying → accepted → published
→ merged → issue_closed → cleaned → complete
```

替代终点：`not_reproducible → reviewed → issue_closed_not_planned → complete`；`out_of_campaign_scope → human_attention_required`。

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| 无在飞派单时的 step 返回 | 立即返回 `idle` + `next_check_at` | step receipt 的 outcome 字段 | 出现任何外部调用 |
| 单个 group 的 GPT Pro provider round 数 | 2（一次 authoring + 一次 audit）+ 有界补写 | campaign journal 计数 | >5（说明规划被误交给 GPT Pro） |
| 一个 step 的外部 mutation 数 | ≤1 | step receipt | ≥2 |
| adoption 到 Offers 可见 | 1 个 materialization commit | git log 单 commit 校验 | 多 commit 或半更新 |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| [RESOLVED 2026-09-02] `oracle_browser` 不能产出 `connector_evidence: 'verified'`（受管读回无 Connector 痕迹），但 `challenge_verified` 可达 | audit 与 adoption 改为本地确定性挑战；transport 改 `--copy-profile` | 见 `docs/researches/20260902-gpt-pro-connector-readback-probe.md`；sprint 第 5 行落 transport | Campaign Controller owner |
| #283（持久化 task_id）合入 main 后需要跑一次 migration | 未跑 migration 时本 sprint 的 Work Graph join 无法被 live code path 消费；且 Sprint 行格式将变为 `\| ID \| Task \| Mode \| Acceptance \| Status \|` | 等 #283 合入 → 跑 migration 命令 → 回填本 sprint 的 backlog 行格式 | 并行 session |
| #284 的 `acceptance_authority` 必填键在本地 main（`a2830db4`）尚不可见 | 本 PRD 已按 #284 落地后的形状写；若合入前实现，`depends_on` 会缺键 | 确认 #284 合入 main 后再实现 Module 5 的物化逻辑 | 并行 session |
| GPT Pro「只补缺失 slot」的服从率 | 决定 authoring rounds 预算需要多大 | canary 2 的真实 shadow 运行统计 | Campaign Controller owner |
| GitHub Issue 分页与搜索索引延迟 | 分页不完整被当作 complete 会静默丢 slot | v1 用 provider issue list/read + 本地 observation store，不用全文搜索当 complete 权威 | Campaign Controller owner |

## Developer Handoff

You are implementing this PRD.

- Build first: sprint 第 1 行（authority freeze 与 baseline characterization）。在写任何状态机之前先冻结既有 authority 与负向 fixture，否则 campaign 会长成第二个 Task Board。
- Do not reinterpret:
  - 不要新建 `MergeEligibilityV1`；已有 `MergeReadinessV1` / `projectMergeReadiness`（`src/core/publication/merge-readiness.ts`）。
  - 不要新建 `DevelopmentCampaignAuthorizationV1`；复用 `ProgramAuthorizationV1` 并把 campaign 字段作为其 payload。
  - 不要引入 `repo-harness execute`；执行走 `src/effects/fleet/acquire.ts` 的既有 acquire 链。
  - 不要实现 `refactor` kind 或 Cutover Closure Gate。
  - 不要给本地加 issue-create fallback。
  - 不要把 slot 权威放在标题上；权威在 body marker 的三个字段。
  - 不要让 controller 自己做规划；它只发 planning job，靠 TaskOffer 观察完成。
- You may improve: step receipt 的 projection 细节、observation store 的索引结构、dispatch prompt 的措辞、canary fixture 的注入点。
- Verify with:
  ```bash
  bun test --timeout 60000
  bash scripts/check-task-sync.sh
  repo-harness run check-task-workflow --strict
  bun scripts/inspect-project-state.ts --repo . --format text
  bun src/cli/index.ts init --repo . --dry-run
  ```

### Acceptance Scripts

1. Canary 1（model-free）：fake GitHub + fake GPT，覆盖 10 slot、第 7 项断线、duplicate slot、malformed metadata、issue edit drift、controller crash、cleanup crash、audit wrong SHA。全部收敛到闭集错误词汇，无一降级为 warning。
2. Canary 2（real GPT shadow）：在 disposable repository，`mode = shadow`，GPT Pro 真实创建 Issue，本地观察 + slot 对账 + adoption dry-run；断言零 task/code/PR mutation。
3. Canary 3（active/manual merge）：一个 group，`max_parallel_tasks = 2`，PR 自动生成、merge 人工执行、Issue closure 与 cleanup 自动、fresh GPT audit 收口。

## Adjacent Patterns

- 「外部提议 + 本地独立验真」这一分工与仓库既有的 external-source binding 同构：外部观察是 untrusted evidence，本地 receipt 才是权威。campaign 复用这条心智模型，而不是新建一套信任模型。
- 「persist intent before effect」在仓库的 publication / merge-gate 路径上已经是既定形状；campaign 的 issue authoring 与 issue closure 沿用同一个顺序。
- [UNVERIFIED] 外部 AI 审计者只写 Issue、不写代码这一权限切分，与常见的「安全研究员报告 + 内部团队修复」流程同构；本 PRD 未引用具体外部产品作为依据。

## Backend Perspective

- 权威分层不变：canonical Sprint 拥有 Task 身份与状态；Work Graph 拥有 priority/dependency/concurrency；Lease + ClaimActorReceipt + WorkEnvelope 拥有任务归属；checks + AcceptanceReceipt 拥有验证结果。campaign store 只拥有 campaign 自身的进度，**不拥有以上任何一项**。
- 10x 时最先失败的三处：GitHub Issue 分页/索引延迟（用 list/read + 本地 observation store 而非全文搜索）；campaign event/observation 的线性扫描（需要 content-addressed 索引与 per-group projection，GC 只清 terminal runtime cache、绝不删权威 receipt）；merge 串行成为吞吐瓶颈（Phase A 人工 merge 已经天然串行，Phase B 的解法是 non-overlap reseal 与 integration queue 可见性，不是放宽并行 merge）。
- 同 capability 的 concurrency key 在 v1 是保守选择；只有实测出现明显瓶颈后，才允许基于 sealed allowed-path overlap 生成更细的 key。

## Deferred / Phase B

以下能力从源设计中移出，挂到 `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md` 下的 Phase B sprint：

| 能力 | 移出理由 | 归属 |
|---|---|---|
| `refactor` issue kind | 依赖 Cutover Closure Gate，该 gate 在仓库中不存在 | Phase B |
| Cutover Closure Gate（`scripts/cutover-closure.ts`、`assets/workflow-contract.v1.json#cutoverClosure`） | 需独立设计与冻结，不应塞进 campaign sprint | Phase B |
| MergeEligibility / merge controller | 已有 `MergeReadinessV1`；未来应扩展它而非新建。Phase A 无任何 merge controller 工作 | Phase B（扩展 `projectMergeReadiness`） |
| Provider merge effect、MergeIntent/Receipt journal、uncertain-outcome reconciliation | Phase A merge 人工，无 provider merge 调用面 | Phase B |
| `active/auto-low-risk` 模式与 canary 4/5 | 阶梯不可跳级，需先跑完 `active/manual` | Phase B |
| Event-driven wake（#281） | Phase A 明确选 host heartbeat 轮询 | v2 优化 |
| 通用 WorkDemand 平台（#285） | campaign 用窄化 Repair adoption；通用 agent feature-demand 独立设计 | 独立设计 |
