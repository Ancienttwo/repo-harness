# Repair campaign 剩余 Sprint 的执行边界

Sprint 权威为 `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`；产品边界为对应 PRD。本文解释实现切片之间的约束，运行状态以 Sprint 和各 plan 为准。

## 依赖与可并行范围

BRC5 的 metadata/parser 与 provider observation 冻结后，BRC6 才能消费它生成 adoption。BRC6 → BRC7 → BRC8 → BRC10 → BRC13 → BRC14 → BRC15 仍是依赖链。BRC9 的预算底座可独立核对，但它与 BRC5 的 campaign store、authoring 和 controller step 交叉，不能让两名 worker 同时修改同一个 core protocol。BRC5 内部可按纯对账核心、provider/step effect、CLI/契约三个文件所有权并行。

已落地的上游能力要复用，不在 campaign 中重写：`scheduling-acquire-next.ts`（#280）、`budget.ts`/`budget-store.ts`（#282）、`coordination-identity.ts`/`sprint-schema-migration.ts`（#283）、`scheduling.ts`/`dependency-authority.ts`（#284）、`work-demand-materialization.ts`（#285）、`coordination-lease-liveness-store.ts`/`coordination-lease-reclaim.ts`（#286）、`automation-attempt.ts`/`automation-attempt-store.ts`（#287）。具体路径分别在 `src/core/` 与 `src/effects/` 的所属模块。

## Slot 与 provider authority

`src/core/automation/issue-batch.ts` 已提供 exact 三字段 marker parser。Malformed marker 不能从标题或附近文本推导 slot。Strict metadata 是另一份显式 provider body 数据；只有有效 marker 指向声明 slot 时，metadata 错误才可标为 `slot_invalid`。

`tests/fixtures/repair-campaign/` 的早期 authority-freeze fixture 不含 strict JSON metadata，且 invalid metadata 示例实际上破坏了 marker。它们只证明当时的基线边界，不能代替 PRD 的运行时 metadata 契约。新运行时测试应建立完整的 provider 输入，不改写历史证据来假装实现已存在。

完整分页与 provider 不可用的权威在 `src/effects/external-sources/github.ts`。只读一组选定 issue_numbers 无法证明没有第 11 项或重复 slot。对账必须确认全批观察范围，不能用搜索命中数或旧 observation cache 宣称 complete。

孤儿 Issue 的评论与关闭是两次 provider mutation，应由两个 persist-first step 执行。进程崩溃后的未知 mutation 结果必须先 reconciliation，不能从缺少 success receipt 推断操作未发生。

## 后续 adoption 与预算接线

PRD Module 5 与已解决的 Connector probe 均要求 `challenge_verified`；BRC6 行的 `bundle_only` 为旧文本残留。BRC4 的 `session.verification` 当前来自模型验证，并不是 exact SHA Connector challenge。因此 BRC6 必须在消费处建立 challenge authority，不能把模型验证升级为读回证明。

#287 的 task attempt identity 包含 Task、Claim、Lease、Work Package 和 dispatch；GPT authoring round 尚无这些对象。BRC9 不得为复用 TaskAutomationAttemptV1 而伪造 Task/Lease，也不得建立另一套与现有预算竞争的计数权威。预算绑定和 authoring receipt 的职责必须在该行的执行 plan 中冻结。

### BRC9 prerequisite gap

Current `ProgramBudgetLimitV1` has mixed `max_agent_turns` and `max_runner_invocations`, global repair cycles and provider failures. It has no separate campaign-step/authoring-round/provider-call limits or campaign transient-failure streak. `TaskAutomationAttemptOutcome` lacks `not_reproducible`, and its identity requires real Task execution. Existing upstream tests prove their own contracts, not this Sprint's campaign-specific acceptance. Under the Sprint's consume-only boundary, BRC9 remains blocked on that upstream subset. BRC5 may enforce its explicit one-shot metadata repair and persist-first step invariant, but must not invent an authoring-round budget or claim full campaign budget enforcement.

BRC6 的 partial-batch adoption 消费下述预算 store 的 authoring terminal；不能仅凭 BRC5 journal 的记录数宣称预算耗尽。现有 `materializeWorkDemand` 是单 Task、Sprint 与 WorkGraph 两文件事务；BRC6 需要一次多 slot、Sprint/WorkGraph/manifest 三文件事务，不能循环调用该单条入口。

## Provider endpoint reference

GitHub's [Update an issue](https://docs.github.com/en/rest/issues/issues#update-an-issue) endpoint accepts `state=closed` with `state_reason=not_planned`; [Create an issue comment](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment) is a separate POST. The BRC5 step boundary treats them as separate mutations and validates each response against the exact target.

## BRC6 authoring budget 消费接口

`ProgramAuthorizationV1.campaign.max_authoring_rounds_per_group` 是必填的正整数，明确限制每组已启动的 initial/fill_missing/edit_issue 轮次。非 campaign 授权不增加这项字段；旧 campaign grant 缺少它会拒绝，operator 必须显式签发完整授权并启动新的 campaign，不保留双读兼容路径。

通用 reservation 保持原 `repo-harness-automation-reservation` 的完整字段与 digest 形状；campaign provider invocation 使用独立的 `repo-harness-campaign-automation-reservation`，强制绑定 campaign context。两种类型按 kind 严格验证，缺失上下文不会降级为通用调用，也不改写历史 ledger。

预算与调用证据仍位于既有 automation budget store；`CampaignAuthoringBudgetTerminalV1` 是同一 ledger 的永久封口记录，不是第二个计数器。入口均在 `src/effects/automation/budget-store.ts`：

- `ensureCampaignAuthoringBudget` 复用已锚定的 contract_less grant，确定性绑定每个 repository/campaign 的唯一 run；不伪造 Task、Claim 或 Lease。
- `reserveCampaignAuthoringBudget` 接收 exact budget digest、campaign_id、group_number、intent_sha256、operation 和 idempotency_key。原子返回 `reserved` 或 `replayed`；重放 reservation 不授权再次执行未知的外部调用。若同一请求的旧尝试已有精确的 `reconciled_not_started` event，则在同一锁内从请求键、旧 reservation 和 event digest 派生下一尝试；并发者只能获得一次新 admission。
- `appendAutomationUsage` 结算实际完成的调用，幂等消费既有 reservation；显式 not-started reconciliation 才释放未启动的轮次。未知结果保留 open reservation。
- `sealCampaignAuthoringBudget` 在同一 run lock 内检查 group/intent 证据及无在途调用，持久化 `authoring_exhausted` 或 `authoring_completed`。前者必须证明准确达到轮数上限，后者允许完整 batch 提前结束，不伪造耗尽。
- `readCampaignAuthoringBudgetTerminal` / `verifyCampaignAuthoringBudgetTerminal` 重读身份、授权、预算 revision 和 ledger 证据，拒绝过期或不一致的凭据。消费端不能只检查 digest 格式或布尔标志。

`challenge` 走同一 run 的 provider_invocation admission，不增加 authoring rounds，但不能越过 global budget stop。BRC6 先完成 challenge，再封口并消费最终证据；full batch 也必须封闭 authoring，而非只看当前在途数量为零。这个 slice 没有声称独立的 BRC9 provider-call / controller-step 限额、per-task repair accounting 或 transient streak 已完成。

Authoring effect 先预留、后调用、先保存 session、再结算。只有浏览器 `completed` 自动结算；`failed` 可能是超时，其他非 completed 状态均保留 reservation，等待现有对账机制。Heartbeat 在预算 admission 之后才记录它自己的 provider mutation reservation，避免额度拒绝被误记为已经尝试 edit。若之后 journal CAS 失败，则无浏览器调用，预算 reservation 仍需通过显式 not-started reconciliation 收口。
