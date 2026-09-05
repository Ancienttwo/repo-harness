> **Archived**: 2026-09-06 01:16
> **Related Plan**: plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260906-0116
> **Archive Projection V1**: `plans/plan-20260905-1835-brc6-adoption-atomic-materialization.md` => `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/notes/20260905-1835-brc6-adoption-atomic-materialization.notes.md` => `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1835-brc6-adoption-atomic-materialization.contract.md` => `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1835-brc6-adoption-atomic-materialization.review.md` => `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`

# Plan: BRC6 Adoption 与三文件原子 materialization

> **Status**: Archived
> **Created**: 20260905-1835
> **Slug**: brc6-adoption-atomic-materialization
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC6 — Adoption 与原子 Sprint/WorkGraph materialization
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Adoption proof, three-file atomic publication, replay and canonical visibility fixtures
> **Rollback Surface**: Withdraw unpublished candidate; human revert of the single materialization commit after integration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Task Review**: `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Implementation Notes**: `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC6 — Adoption 与原子 Sprint/WorkGraph materialization
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md`
- Sprint contract: `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`
- Sprint review: `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`
- Implementation notes: `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md`.

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
- Contract file: `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`
- Review file: `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`
- Implementation notes file: `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Withdraw unpublished candidate; human revert of the single materialization commit after integration
- **Verification boundary**: Adoption proof, three-file atomic publication, replay and canonical visibility fixtures
- **Review/acceptance boundary**: `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`, `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`, and `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Withdraw unpublished candidate; human revert of the single materialization commit after integration

## Captured Planning Output

### 目标与授权范围

用户已批准执行 BRC6；预算前置已通过 canonical finish 合入本地 main 2be1268bad1339fb00ed34bb90d1b8523dd43f95。依赖准入解除，按本计划创建 contract 与独立 worktree 完成实现验收。

BRC6 是一个独立 work-package：同一次 adoption 将有效 Issue slots 投影为 Sprint rows、Work Graph 和 issue manifest，以一个提交发布。成功条件包含 partial batch、Connector challenge、身份/依赖校验、崩溃恢复和重复调用；不包含 BRC7 planning、BRC8 dispatch、BRC9 全量预算控制或 BRC10+ closure/audit。

### P1 — 模块与权威

- `src/core/automation/issue-batch.ts` 的 IssueBatchIntentV1 冻结 campaign/group/base SHA/slots；session.verification 仅证明模型验证，不能充当 Connector readback。
- `src/core/automation/issue-batch-reconcile.ts` 的 reconcileIssueBatchSlots 与 `src/effects/automation/issue-batch-observer.ts` 提供完整 provider snapshot、marker slot 身份及 source drift 校验。消费既有 parser，不从标题、路径或自然语言猜 metadata。
- `src/effects/automation/issue-batch-store.ts` 保存 intent/session 与 BRC5 journal。journal 是外部操作恢复材料，不是 authoring budget 计数器。
- `src/core/automation/budget.ts`、`src/effects/automation/budget-store.ts` 负责授权及唯一预算权威；`src/core/engineers/automation-attempt.ts`/`src/effects/engineers/automation-attempt-store.ts` 当前属于真实 Task attempt，不能给 pre-Task authoring 伪造 Claim/Lease。
- `src/effects/engineers/work-demand-materialization.ts` 是单 WorkDemand 的 Sprint/WorkGraph 两文件提交。复用其 Git temporary-index / commit-tree / publication intent / CAS 原理；不循环调用单条 materializeWorkDemand，也不扩展通用 WorkDemand 语义。
- `src/core/state/coordination-identity.ts` 拥有 task_id；`src/core/engineers/scheduling.ts` 与 dependency-authority 拥有 Work Graph 及边语义；`src/effects/fleet/acquire.ts` 从 canonical board/plan proof 生成 TaskOffer。BRC6 不直接生成 Offer。

### P2 — 输入到输出

```text
stored authorization + intent + authoring session
              |                   |
     upstream budget decision     exact-SHA challenge receipt
              |                   |
complete provider snapshot -> BRC5 reconciliation
              |
       validate adoption (pure)
              |
  receipt + persistent task IDs + validated same-group DAG
              |
  temporary Git index: Sprint + WorkGraph + issue manifest
              |
  fsynced publication intent -> one commit -> candidate ref CAS
              |
  human canonical integration -> existing board/TaskOffer projection
```

以 10 个声明 slots、7 个有效 Issue 为例：只有上游证明 authoring 已终止且 rounds 耗尽、没有在途调用，才把 3 个空缺写入 unfilled_slots。完整 batch 可正常 adopt；任何 batch 都必须通过模型验证、challenge、授权/期限和 source freshness。缺少上游证明时 partial batch 保持 blocked，不能以 journal 数量、超时、布尔参数或已花 provider calls 替代。0 个有效 slot 允许生成说明全部 unfilled 的 adoption receipt，但不生成 Task/WorkPackage；不得虚构占位任务。

### P3 — 决策与约束

采用 campaign 专用的纯 adoption builder 和三文件 publication effect。前者只接受已验证的上游事实，后者只管理精确投影的提交/恢复。独立 budget ledger、循环单条 materializer 和 bundle_only 都不能保持本任务的不变量，予以排除。最多 10 slots，DAG 校验使用线性遍历；10 倍输入首先在授权上限校验处拒绝，不扩大扫描/调用预算。

发布写 candidate ref，显式人工整合到 canonical main 后才可被现有 Offer 投影消费；不沿用单 WorkDemand effect 自动更新 main 的终端动作。候选提交父节点必须是验收的 exact canonical SHA，三文件之外的 tree entries 保持父提交内容。main 漂移时 fail closed，重新观察和产生新候选；旧证据不重标到新 SHA。

### 上游交付与执行准入

预算 owner 是 `.archcontext/model/nodes/capability.runtime-harness.automation-budget.yaml` 所定义的 automation-budget capability；pre-Task attempt 消费接缝由现有 engineer automation-attempt owner 与 campaign/issue-batch owner 对齐。BRC6 materializer 不拥有这两个上游契约。上游应在现有预算权威内提供可读取、可验证的 authoring admission/terminal decision；BRC6 只消费其结果和内容摘要，不增加权威文件或自行维护轮数。

最小语义要求：绑定 repository、campaign、group、intent、authorization digest、budget revision；明确 authoring-round 上限及计费单位；pre-Task attempt 身份不要求 Task/Claim/Lease；原子 reserve/settle 和幂等 replay；可证明 rounds exhausted，并证明没有 pending/in-flight authoring，封闭此 group/intent 的进一步 authoring admission。已冻结计费为 initial/fill_missing/edit_issue 各一轮，授权必填 max_authoring_rounds_per_group；challenge 不计轮但走同一 run 的 provider_invocation 预算。group/intent 封口只禁止 authoring，round 耗尽不升级成 global stop。provider-call 与 round 不等价。

上游验收必须覆盖：并发争用最后一个 round 只能成功一次；重复 reservation/settlement 不重复扣费；reserve 后崩溃不会误报 quiescent/exhausted；在途响应未终结不许 partial adoption；budget revision/authorization/intent 不匹配拒绝；耗尽决定后不能重新打开同 intent authoring；已完成满 batch 不需要伪造 exhausted。候选提交 783e3364 已提供下面的消费接口；其 Owner Acceptance 与 canonical finish 已完成，预算前置在 main 2be1268b 可用。BRC9 的 campaign-step/provider-call 全部预算、任务 repair 次数与 transient streak 不塞进 BRC6。

### 上游交接：main 2be1268b（Owner Acceptance 与 canonical finish 完成）

已读取预算 worktree 的候选提交 `783e3364` 中 `docs/researches/20260905-repair-campaign-sprint-execution-boundaries.md`，按最终 kind/retry 语义更新本计划。上游交接报告 full suite PASS、final verify-sprint prepare PASS（`run-20260905T212755-54698`），review 的 P1/P2 findings 已修复；后续已完成 Owner Acceptance 并合入 main 2be1268b。本任务未重跑这些检查，也不将 prepare PASS 等同 owner acceptance 或 merged。

此前架构 reconciliation 阻塞及候选 015bf1af 的失败验收已由上游后续工作替代，历史证据保留在预算 worktree 的 notes/run 中，不再列作当前阻塞。BRC6 依赖已解除，按用户本轮执行授权冻结 execution contract；不修改预算 owner 的代码、验收与研究文档。

| 实际 API | BRC6 消费方式 |
|---|---|
| `ensureCampaignAuthoringBudget({repo_root, authorization, env?}) → AutomationBudgetStatusV1` | 取得既有唯一 run 与 budget revision，使用完整 campaign grant，不伪造 Task 身份 |
| `reserveCampaignAuthoringBudget({repo_root, automation_run_id, expected_budget_sha256, campaign_id, group_number, intent_sha256, operation, idempotency_key, env?})` | challenge 使用 `operation: 'challenge'`；返回 `{reservation, disposition: 'reserved' 或 'replayed'}`。replayed 仅恢复既有结果，不重新发外部调用；精确 reconciled_not_started 后的新 admission 由 store 原子派生 |
| `appendAutomationUsage` | 消费既有 reservation 结算调用；未知结果保留 open，不能推断未执行 |
| `sealCampaignAuthoringBudget(binding + {reason}) → CampaignAuthoringBudgetTerminalV1` | partial 使用 authoring_exhausted；full 使用 authoring_completed。先验证 batch 是否完整再选择 reason，不能用 completed 绕过 partial 耗尽条件 |
| `readCampaignAuthoringBudgetTerminal(binding) → terminal 或 null` | null 表示缺少权威，不是完成 |
| `verifyCampaignAuthoringBudgetTerminal(binding + {terminal}) → terminal` | 重读 ledger 验证；不得以本地 digest 校验替代 |

campaign reservation 的 kind 固定为 `repo-harness-campaign-automation-reservation`，强制包含 campaign context。通用 `repo-harness-automation-reservation` 的字段与 digest 保持原状；缺失上下文不能降级成通用调用。challenge 消费端接受 campaign reservation，不翻译 kind 或重写 ledger。

重试沿用同一请求 idempotency key。只有旧尝试具有精确 `reconciled_not_started` event 时，store 才在锁内根据请求键、旧 reservation 与 event digest 派生下一尝试，并返回一次新 reserved admission；BRC6 不自行换 key、增加 attempt 或释放 reservation。unknown/replayed 不能触发新的 browser 调用。行为测试应覆盖并发 not-started 重试仅一个 reserved、其余 replayed，以及缺上下文拒绝。

其中 terminal binding 为 `repo_root`、`automation_run_id`、`expected_budget_sha256`、`campaign_id`、`group_number: 1 或 2 或 3`、`intent_sha256` 和可选 `env`。repository/grant 绑定由 run 中的预算授权验证，BRC6 仍核对其与 intent/当前授权一致。过期 revision、身份不符、terminal 缺失或内容不一致必须拒绝。

本轮实现 adoption 输入/拒绝矩阵、challenge 与三文件事务，消费已合入接口。不会修改上游 budget core/store 或 campaign authoring/step。完整 BRC9 的其余预算维度不在本计划范围。

### BRC6 具体接口与文件面

预计涉及超过 8 个文件（实现、测试、文档），但仅三个运行职责：adoption/challenge core、publication effect、CLI。以下文件承载实现职责。

| 文件 | 责任 |
|---|---|
| `src/core/automation/issue-batch-adoption.ts` | PRD CampaignIssueBatchAdoptionReceiptV1 与 issue 条目严格校验、digest、slot/依赖/manifest 纯投影 |
| `src/core/automation/connector-challenge.ts` | exact-SHA challenge request/response 校验与 receipt；无文件/网络 IO |
| `src/effects/automation/issue-batch-adoption.ts` | 读取授权、预算决定、session、snapshot，调用现有 reconciliation；组织 challenge 与发布 |
| `src/effects/automation/issue-batch-publication.ts` | 三文件 temporary-index commit、durable intent、candidate ref CAS、崩溃恢复 |
| `src/effects/automation/issue-batch-store.ts` | 复用 group store 路径和锁，保存 challenge/publication 恢复材料 |
| `src/cli/commands/campaign.ts` | `campaign adopt --repo --campaign-id --group-number --intent-sha256 --sprint-path --publication-policy --dry-run`；CLI 注入 browser binding/followup，effect 不反向依赖 CLI |
| `tests/unit/issue-batch-adoption.test.ts`、`tests/unit/connector-challenge.test.ts` | 纯协议与拒绝路径 |
| `tests/effects/issue-batch-adoption.test.ts`、`tests/effects/issue-batch-publication.test.ts` | 上游依赖 fixture、权限、三文件原子性与恢复 |
| `tests/cli/development-campaign.test.ts` | 参数、结构化错误和注入接线 |
| `docs/researches/20260905-repair-campaign-sprint-execution-boundaries.md`、对应 architecture module、Sprint/contract/review | 固化最终边界与验收，按 canonical workflow 同步/归档 |

adopt 的外部输入只引用本地已存权威，不接受客户端声明 connector_evidence 或 exhausted。target Sprint 必须属于授权的 repository/scope、已使用持久 task_id 且存在有效 Work Graph。manifest 固定在 `tasks/campaigns/<campaign_id>/group-<group_number>.issues.json`，包含 PRD adoption receipt 及 slot→task_id/work_package_id 映射；路径由通过协议校验的身份派生。task_id 首次发布使用随机 256-bit ID，持久化于 publication intent 后不再分配；现有 canonical identity validator 负责 join 校验。

WorkGraph 必填策略由 `--publication-policy` 显式引用 exact main 的 JSON 文件提供，严格包含 required_acceptance、rollback_boundary、retry_policy。acceptance/rollback 引用也须是 exact main 的 regular file 且内容 hash 匹配，缺失拒绝；不从 Issue metadata、其他任务或本地默认值推导执行策略。

### Connector challenge

消费 source authoring session，通过同一绑定的 browser followup 获取结构化回答。先在 intent.base_main_sha 上生成并持久化 challenge；答案留本地，不进入 prompt/bundle。选择三个可独立比对的目标（目录 entries、指定文本行、指定文件内容 digest），选择结果与 exact SHA、intent、session、request digest 绑定，重试复用同一 request；目标不足或不可读即拒绝。全部答案逐字命中才生成 challenge_verified。模型自述 Connector 调用、session.verification 和 bundle 内容命中不能替代该证据；测试包含错误 SHA、少一个答案、错一个字符、换 session 与重放不同 intent。该协议只证明 exact-content readback，不声称观察到了 Connector 工具调用。

challenge 属于 provider 调用，必须经上游现有调用 admission 路径预留，不能由 adopt 绕开预算或直接运行 browser。响应恢复复用 durable reservation/session，不能遇到超时就重新派单。需要新 challenge 往返时，先完成合法预留的 challenge，再读取最终 authoring exhaustion/无在途证明；耗尽不能成为继续调用 provider 的豁免。缺少调用额度或回答时保持 blocked。真实 Connector 已有 probe；本工作包测试用注入 fixture，不自动新增真实付费 canary。

### Adoption 与发布不变量

- Receipt 字段以 PRD Module 5 schema 为准；manifest 引用 challenge/budget 的内容摘要与既有持久记录，使验收能重读证据，而不是把引用当有效性证明。
- snapshot 必须完整；来源变动、重复 slot、跨 intent/session 或 main 已移动均拒绝。只处理合法 bugfix/test_gap，unsupported kind 输出 issue_kind_unsupported 且不物化该 slot；不在本包关闭 Issue。
- primary_capability 必须存在于当前架构能力权威；不从 suspected_paths 猜 capability。依赖只可指向本次有效 slot，缺失依赖拒绝整批，不能静默删边；DAG 无环；每条边显式 canonical_done/null。
- 同一 intent 只允许一个 adoption 结果。完全相同重试返回同 receipt/commit；同 intent 不同 snapshot/projection 拒绝。已发布 commit 后 main 前进，验证既有提交和 manifest 身份后返回既有结果，不追加 rows。
- 每个 blob、publication intent fsync、ref CAS 前后设置 fault injection；提交前失败不改变任何可见 ref，提交后崩溃可由 durable intent 恢复。保持工作目录和用户 index 原样；不吸收 unrelated dirty files。
- off 零 mutation；shadow 只允许 adoption dry-run，零 task/graph/manifest/ref mutation；active/manual 才可发布候选。输出 commit、receipt、unfilled 与可操作错误；不创建 Claim、Lease、WorkEnvelope、planning job 或 PR。

### 验证与回滚

执行 contract 应包含新 core/effect tests、现有 issue-batch/reconcile/observer/campaign-step/CLI、issue-285-work-demand-materialization 与 scheduling schema 回归，`bun run check:type`、`bun run check:state-boundaries`，及根 AGENTS 的六项 integrity checks。Offer fixture 证明候选 ref 上零新增 Offer、人工合入后才按持久 task_id 投影且仍需 planning；fixture apply 与 `init --dry-run` 保持同一 TS operation model。最终验收冻结 candidate 与 target 后一次执行；full-suite 是否需要由当时有效 contract 和已确认的未覆盖风险决定，不复制历史全量要求。

本轮实施 runtime 与 tests，按执行 contract 验证，不自动进行真实 GPT 调用。BRC6 runtime 完成后回滚是撤回未合入候选；若已经人工合入，人工 revert 那个三文件提交并按既有 canonical workflow 处理已出现任务，不能自动删除已经 Claim 的任务或关闭 provider Issue。协议实现代码按同一 work-package revert，不提供长期双读迁移。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] 消费已合入的上游 authoring exhaustion/admission 契约，确认上述准入验收，冻结 BRC6 execution contract。
- [x] 实现 challenge 与 adoption 纯协议及拒绝路径，保持现有 metadata 与 budget 权威。
- [x] 实现三文件原子 candidate publication、稳定身份和 crash/replay 恢复。
- [ ] 接线 campaign adopt、权限阶梯与现有 canonical Offer 投影，完成聚焦验证与 canonical 验收。

## Planning Verification Results

本次仅新增本计划并修改对应 Sprint 的 BRC6 行（challenge authority、上游依赖和计划指针）；未创建执行 contract，active-plan 保持 verification-scope-profile-consistency。未修改 runtime，未运行 full suite 或真实 GPT。

- PASS: `bash scripts/check-deploy-sql-order.sh`。
- PASS: `bash scripts/check-architecture-sync.sh`（blocking=0）。
- PASS: `bash scripts/check-task-sync.sh`（仅 planning artifacts，无 substantive repo changes）。
- BLOCKED: `bash scripts/check-task-workflow.sh --strict`，既有 active Approved plan `plans/plan-20260905-1446-verification-scope-profile-consistency.md` 缺 `tasks/contracts/20260905-1446-verification-scope-profile-consistency.contract.md`；不属于本任务，未修改或绕过。
- PASS: `bun scripts/inspect-project-state.ts --repo . --format text`（drift_signals none）。
- PASS: `bun src/cli/index.ts init --repo . --dry-run`（0 operations，source checkout 提示符合预期）。
- PASS: `git diff --check`。

以上为规划检查，不是 BRC6 runtime 验收，不复用 BRC5 pass 数或旧 `.latest` 作为本计划证据。
