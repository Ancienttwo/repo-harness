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

BRC6 的 partial-batch adoption 也直接依赖上述 authoring-round exhaustion 证据；在上游补齐之前，不能仅凭 BRC5 journal 的记录数宣称预算耗尽。现有 `materializeWorkDemand` 是单 Task、Sprint 与 WorkGraph 两文件事务；BRC6 需要一次多 slot、Sprint/WorkGraph/manifest 三文件事务，不能循环调用该单条入口。

## Provider endpoint reference

GitHub's [Update an issue](https://docs.github.com/en/rest/issues/issues#update-an-issue) endpoint accepts `state=closed` with `state_reason=not_planned`; [Create an issue comment](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment) is a separate POST. The BRC5 step boundary treats them as separate mutations and validates each response against the exact target.
