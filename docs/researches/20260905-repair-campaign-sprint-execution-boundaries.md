# Repair campaign 剩余 Sprint 的执行边界

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Sprint 权威为 `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`；产品边界为对应 PRD。本文解释实现切片之间的约束，运行状态以 Sprint 和各 plan 为准。

## 2026-09-07 execution amendment

本次只修正文档和执行顺序，不声称 runtime 缺口已修复。Sprint 保留既有 persisted task IDs
及历史完成记录，新增 BRC15a（shadow 观测）与 BRC6a（readback correction），完整 active
要求继续 pending。没有将失败或 `human_attention` 改记为完成。

### Shadow 与 active 的不同前置

| 路径 | 启动前必须证明 | 不能据此声称 |
|---|---|---|
| BRC15a real GPT shadow | BRC3/BRC4/BRC5/BRC6 已落地入口可用；authoring、fill/edit、challenge、GitHub identity/list/page 全部调用消费既有预算，已知结果结算、未知结果保留 reservation 并可对账；具体目标与 profile 有授权 | acquisition/worker/cleanup/fresh audit 已验收，或样本匹配证明了 exact SHA |
| active execution | acquire 前 budget admission；完整 BRC9 的 repair/retry/terminal 消费；BRC6a 的读回证明；再依次消费 BRC10/BRC13/BRC14 | 仅因 worker bridge 已落地或并行上限为 2 就认为整组闭环 |

`adopt --dry-run` 仍可能发起 challenge、provider observation 并写 journal。不能把零 Task/code/PR
mutation 写成零 effect。当前 `issue-batch-adoption.ts` 在 authoring seal 后仍做 final provider
refresh；完整计费会影响 exact terminal freshness。这一接线/封口边界仍待验收，不因 Canary 2
前移而跳过。BRC15a 的预算前置缺失时先做独立的 BRC9 有界 package，inline canary 本身不改代码。

Active 路径的 acquisition charging 与 shadow 无关，不能再次成为 shadow 观测的串行前置。
`campaign-acquisition.ts` 的领取调用尚未消费 acquisition reservation；已落地 worker bridge
消费的是 dispatch invocation，两者不相互替代。完整 BRC9 仍是 BRC10 的前置。

### Readback 证明与验收

`challengeAt` 固定选排序后的首个 eligible 文件，以其目录、首行和文件 hash 生成三个答案。
本地复现显示 `80d76592` 与 `0155acb0` 的目标和三个答案相同；用旧版本答案配 prompt 提供的新
SHA，`verifyConnectorChallenge` 返回 `challenge_verified`。详细反例见
`docs/researches/20260902-gpt-pro-connector-readback-probe.md`。

威胁不要求恶意模型持有旧答案：stale Connector/index 可返回旧 revision，adoption challenge
还复用 authoring session。Fresh session 不能排除 stale index；选择 diff 文件只能提高检测率，
不能解决相同内容跨 revision、metadata-only commit 或 revert 的版本区分。

因此现有协议词汇只表示目标内容抽样一致；本次不改名、不引入第二套 runtime receipt，也不
降低原 exact-SHA 验收。BRC6a 必须冻结可验证的证据来源和消费边界；无法取得证据时 active
adoption/fresh audit 保持 fail-closed 的未满足要求。当前代码未因文档更新获得该保护。Shadow
可记录明确未验证的样本观察，但该记录不能成为 active admission、`accepted` 或下一组授权。

### 价值、并行与范围

Canary 2 的有效/重复 Issue 数、未判定项、补缺服从情况、provider 调用和人工时间，按 PRD
的观测口径记录。Slot 合法不等于 Issue 有效；无法只读判定的保留未判定，不为度量越过 shadow
去建 Task 或改代码。质量数据供 Owner 决定后续投入，不设不可控的模型质量 CI 阈值。

现有预算只允许一个 unresolved reservation，可能使两个已领取 worker 的 child invocation
串行。`max_parallel_tasks=2` 是容量上限；保留 Canary 3 原值并记录实际并行情况，不新增重叠
吞吐 gate。已有投入不是继续扩建的依据；自动 cleanup、retry、reclaim 或 group 2/3 的后置
仍需要明确 scope amendment，当前要求没有被本次文档修正删除。

## 依赖与可并行范围

BRC5 的 metadata/parser 与 provider observation 冻结后，BRC6 才能消费它生成 adoption。BRC6 → BRC7 → BRC8，随后完整 BRC9 → BRC10 → BRC13 → BRC14 → BRC15 是 active 验收链。BRC15a 独立前移，仅依赖已落地的 authoring/observation/adoption 路径及 shadow provider-budget 接线；BRC6a 修正 BRC6/BRC14 共用的版本读回证明缺口。BRC9 的预算底座可独立核对，但它与 BRC5 的 campaign store、authoring 和 controller step 交叉，不能让两名 worker 同时修改同一个 core protocol。BRC5 内部可按纯对账核心、provider/step effect、CLI/契约三个文件所有权并行。

已落地的上游能力要复用，不在 campaign 中重写：`scheduling-acquire-next.ts`（#280）、`budget.ts`/`budget-store.ts`（#282）、`coordination-identity.ts`/`sprint-schema-migration.ts`（#283）、`scheduling.ts`/`dependency-authority.ts`（#284）、`work-demand-materialization.ts`（#285）、`coordination-lease-liveness-store.ts`/`coordination-lease-reclaim.ts`（#286）、`automation-attempt.ts`/`automation-attempt-store.ts`（#287）。具体路径分别在 `src/core/` 与 `src/effects/` 的所属模块。

## Slot 与 provider authority

`src/core/automation/issue-batch.ts` 已提供 exact 三字段 marker parser。Malformed marker 不能从标题或附近文本推导 slot。Strict metadata 是另一份显式 provider body 数据；只有有效 marker 指向声明 slot 时，metadata 错误才可标为 `slot_invalid`。

`tests/fixtures/repair-campaign/` 的早期 authority-freeze fixture 不含 strict JSON metadata，且 invalid metadata 示例实际上破坏了 marker。它们只证明当时的基线边界，不能代替 PRD 的运行时 metadata 契约。新运行时测试应建立完整的 provider 输入，不改写历史证据来假装实现已存在。

完整分页与 provider 不可用的权威在 `src/effects/external-sources/github.ts`。只读一组选定 issue_numbers 无法证明没有第 11 项或重复 slot。对账必须确认全批观察范围，不能用搜索命中数或旧 observation cache 宣称 complete。

孤儿 Issue 的评论与关闭是两次 provider mutation，应由两个 persist-first step 执行。进程崩溃后的未知 mutation 结果必须先 reconciliation，不能从缺少 success receipt 推断操作未发生。

## 后续 adoption 与预算接线

PRD Module 5 保留 exact-SHA 读取要求。BRC4 的 `session.verification` 来自模型验证；BRC6 的 `challenge_verified` 来自内容样本匹配。两者都不能单独证明读取了 exact revision。原 Connector probe 的更强结论已修正，BRC6a 是明确未完成的纠正项；历史 BRC6 implementation acceptance 不等于当前 active activation 已通过。

#287 的 task attempt identity 包含 Task、Claim、Lease、Work Package 和 dispatch；GPT authoring round 尚无这些对象。BRC9 不得为复用 TaskAutomationAttemptV1 而伪造 Task/Lease，也不得建立另一套与现有预算竞争的计数权威。预算绑定和 authoring receipt 的职责必须在该行的执行 plan 中冻结。

### BRC9 prerequisite gap（历史与当前消费边界）

早期 #282 底座只有混合 agent-turn/runner-invocation、global repair/provider-failure 限额；
后续 authoring-budget 与 campaign-step/provider prerequisites 已补入独立限额。#287 也已
加入 `not_reproducible` 与 mutation-side retry admission。下述 package 段保留各自交付边界，
不能把某一阶段的剩余项当作上游仍不存在。acquisition、完整 repair attempt 与 active terminal
续验已分别发布；transient retry 包承担最终消费整合与 BRC9 全行验收，需求映射及验收边界见
`docs/researches/20260907-brc9-transient-retry-consumption.md`。Sprint 状态和对应 AcceptanceReceipt
决定是否完成；不得为补缺伪造 Task/Lease 或另建计数权威。acquisition 达限封存全局 run 的
产品契约仍须单独明确，repair fixture 增额不是该问题已解决的证据。

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

## BRC6 intake 与 publication 边界

`campaign adopt` 消费同一个预算 run：challenge 先完成并保存不可变结果，随后结算、final seal 和 terminal ledger verification。封口后重新观察 provider，拒绝相对封口前快照的 source drift。BRC5 的 unfilled/source projections 可以作为对账输入，journal 数量不能成为预算权威。

WorkGraph 必填 acceptance、rollback 和 retry 策略由 `--publication-policy` 指向 exact main 的 JSON 文件提供；引用文档也须内容 digest 匹配。它与 provider Issue metadata 是不同的明确输入，不相互猜测。

Sprint rows、WorkGraph 与 `tasks/campaigns/<campaign_id>/group-<number>.issues.json` 在同一 temporary Git index 中构成一个 commit。ref transaction 同时 verify exact canonical target 并 create candidate ref；不修改用户 index/worktree，不更新 main。TaskOffer 仅通过既有 canonical board 投影在人工整合后出现，仍需 BRC7 的本地 planning proof 才能 execution-ready。

## BRC7 local planning admission

After the BRC6 candidate becomes a canonical ancestor, `campaign step` switches to a local planning handoff. The caller supplies `--host codex|claude` and `--session-id`; the grant selects the host and an immutable group record selects one session. The controller emits one job, including exact Task revision, immutable Issue observation, source revision and capture-plan Source Ref. It never invokes hunt, a per-Issue LLM, acquire or a worker. The local host runs hunt for bugfix or characterization for test_gap, captures a projectable plan/contract, and submits `--planning-result <json>` on the existing step command.

The result fields are `job_sha256`, `outcome`, `explanation`, `surfaces` and `characterization`. Outcomes are exactly `plan_ready`, `not_reproducible`, `feature_route_required`, `human_attention_required`, `source_stale`, `planning_failed`. A `plan_ready` declaration cannot establish readiness: the next read consumes the existing TaskOffer. Its campaign admission gate requires the existing ExternalSourceBinding receipt plus exact plan/contract, protection inventory/registry and evidence digests, on the configured canonical offer target. Source, Task revision, contract or evidence drift removes readiness. Read-side admission performs no network or writes; active job handoff and plan-ready submission refresh the provider before reading offers. A matching issued job can record a non-executable terminal outcome without provider access, including after source drift. An unavailable or incomplete latest provider attempt cannot support admission.

`surfaces` requires concrete `paths` and explicit `cli_commands`, `mcp_tools`, `public_exports`, `protocol_kinds`, `capability_nodes` arrays. Any declared addition produces hard `feature_surface_detected`; absent declarations are invalid. Planned paths must exactly equal contract Allowed Paths. This is the trusted local planner's declared intent, not inferred prose or an assertion about future worker code. BRC8 must preserve the admitted scope at execution. The single frozen `tests/fixtures/repair-campaign/protected-capabilities.json` and canonical capability registry reject protected primary capabilities, suspected paths and planned paths with `protected_surface_detected`.

Bugfix admission invokes existing `contract-run preflight` through the CLI helper runner in trusted-package mode and requires its Root Cause Evidence from two distinct files. The mode uses the existing protected runtime/environment boundary, disables source overrides before helper resolution, and does not merge ambient environment back into a supplied trusted context. The helper now returns validated evidence hashes alongside its existing verdict; the campaign does not parse Root Cause Evidence again. Test-gap evidence explicitly names current behavior, regression guard, old-test command and falsifier command, with a hashed artifact showing `OLD_TESTS_EXIT=0` and a nonzero `FALSIFIER_EXIT`. These artifacts are host evidence, not controller-generated diagnosis.

Planning records live beside the existing intent in the Git-common campaign store and use immutable publication plus the existing exclusive lock. Repeated identical job/result submissions replay; conflicting ownership or result bytes fail closed. Canonical manifest deletion does not remove admission because local immutable publication membership is still checked. A clone with a canonical manifest but no local campaign intent authority also fails closed.

The original authoring observer retains its initial-SHA fence. Post-adoption planning separately checks original publication ancestry, unchanged canonical manifest, host grant, expiry and current activation policy. `refreshExternalSource` now requires caller-owned policy: ordinary manual intake resolves local policy in its CLI, whereas campaign injects the authorized canonical revision. The current intake policy must still match the authorization. Off disables planning mutations; shadow only renders the frozen adoption handoff, with no provider refresh, job/result/binding write or execution readiness. No Task, Lease, Acceptance, Publication, budget or source-binding receipt schema changed.

Step keys bind immutable requests and completed responses. An identical key replays the historical response without refreshing the provider; use a new key for a fresh observation. A reserved step without a completed response requires human inspection before a new key. Closed negative outcomes keep the Task unready and allow the next step to select the next adopted slot. The protection reader also rejects a removed primary capability, Git control paths, and edits to its exact canonical inventory/node inputs. Fleet acquisition repeats this same campaign admission after claim and after token publication; drift releases the claim before projection.

Existing terminal/intervention campaign states revoke both planning and acquisition admission. Closed negative slots are skipped before source checks when processing later tasks, so an edited or closed refuted Issue cannot block another slot. Canonical directory scopes are invalid: only concrete file declarations may reach the existing prefix-based Allowed Paths gate.

A lease-blocked TaskOffer may retain a valid admitted plan while its execution classification is unsupported. New planning handoffs may skip that task only when the existing offer still carries its validated plan and lease_unavailable is its sole blocker. Evidence/source drift still fails closed; a result submission never treats lease availability as successful readiness. CLI preflight resolves the repository once before passing the same absolute path to helper context and --repo.

When the Issue changes or closes before the first handoff, the controller persists the existing job shape using the immutable adoption observation and returns source_stale plus that job identity. It never substitutes the changed provider revision or records a terminal outcome itself. The authorized local parent explicitly submits source_stale via the existing planning-result contract; only that closure permits later-slot progression. Replay remains immutable, and plan_ready still requires the current exact source.


## BRC8 acquisition boundary

Campaign execution uses the existing `campaign step --authorization-id` route, mutually exclusive with a planning result. The local parent must match the persisted planning parent, and the issued Engineer authorization resolves through the existing principal/binding authority. Immutable adoption membership filters the canonical EngineerOffers sequence; it never supplies another priority score. A single acquire-next attempt freezes its observation time across selection and revalidation because first-attempt retry eligibility is time-indexed. All mutable authority is still re-read.

Fleet serializes campaign admission and the existing claim under one campaign lock. Current non-released Lease records across published groups are the sole capacity count; there is no parallel counter or new lease authority. Unknown leases and missing canonical group authority fail closed. Off/shadow cannot produce an executable handoff. Same capability concurrency remains owned by the existing Engineer scheduler.

The local host receives an actual WorkEnvelope and the stored, live ClaimActorReceipt. Fresh and replayed handoffs revalidate canonical Task/plan/source authority through Fleet's existing post-claim validator. Replaying after ownership loss fails; it does not acquire another task. Prompt text carries instructions and does not create ownership. Worker dispatch, budget/attempt accounting, liveness takeover and automatic publication remain under their existing or subsequent sprint boundaries.

Fresh handoff verification runs before acquire-next records success. A failed handoff releases only its exact current bound claim through the existing release command and records a typed refusal; an uncertain rollback remains explicit. A replay only revalidates and cannot release an already dispatched worker. The final policy read must require active, since planning authority itself permits shadow. Generic Fleet skips full campaign candidates without consuming claim-race retries; the initial offer count bounds the extra scan so unrelated ready work remains reachable.

Engineer acquire-next sends exact Task assertions to Fleet, so a full-campaign refusal carries the closed reason campaign_capacity_full under no_eligible_task. Acquire-next skips only this pre-claim refusal, preserves EngineerOffers order, and bounds capacity skips by the first offer count independently of race retries. An all-capacity-blocked scan has acquired nothing and does not persist a completed refusal; the same key may retry once capacity is available. Successful and side-effect-bearing outcomes retain their original durable replay behavior.


BRC8 characterization control: Fleet admission returns an injected claim failure as a typed result. The prompt-is-not-Claim control must assert that result and the exact claim-call trace; exception propagation itself is not ownership authority. Frozen Task/Lease/Acceptance bytes, prompt-negative selection and no-write assertions remain unchanged. BRC8 CI 34022628870 identified this single obsolete control expectation; the complete characterization file is the regression boundary.


### BRC9 #287 prerequisite: closed outcomes and mutation-side retry admission

The Task attempt writer must enforce the same retry eligibility that Engineer scheduling observes. Before this prerequisite, a new identity could be persisted after user/permanent blockers or before transient backoff elapsed because `recordTaskAutomationAttemptStart` checked only unfinished attempts and the maximum count. The pre-fix regression captured 11 failures before production edits (`/tmp/brc9-attempt-before.txt`).

The owning core module now supplies one closed outcome tuple to both attempt validation and Engineer offer validation, including non-retryable `not_reproducible`. Unknown outcomes and a `started` completion fail closed. The durable store preserves exact-identity replay, validates the existing WorkPackage retry policy before start/completion writes, and invokes `observeRetryEligibility` under its existing work-package lock before admitting a new identity. Refused writes preserve attempt, identity and current bytes. Existing valid records keep their format and digest calculation.

Development evidence: 16 attempt regressions and 21 controller/acquire-next tests pass; TypeScript passes. Canonical acceptance is recorded in the linked workflow artifacts, not inferred from these development runs. Plan: `plans/archive/plan-20260906-1743-brc9-attempt-prerequisite.md`.

This package closes only the #287 prerequisite. The subsequently published #282 interfaces are described below; their campaign consumers still require the acceptance recorded at the top of this document. A Task attempt continues to require real WorkPackage/Claim/Lease/dispatch identity. No campaign counter, authoring Task substitute, new store or lifecycle command was added.


### #282 campaign step/provider prerequisite

The campaign-scoped payload of the existing ProgramAuthorizationV1 owns required positive max_controller_steps and max_provider_calls alongside max_authoring_rounds_per_group. Non-campaign grant/reservation/current/usage bytes remain unchanged. An incomplete old campaign grant is refused; issuing a complete grant for a new campaign/run is an explicit operator action, never a default or historical rewrite.

beginCampaignBudgetStep writes a local admission event in the existing automation run ledger, charging one controller step exactly once. It does not hold an external-effect reservation. completeCampaignBudgetStep writes the actual trusted controller outcome and non-empty evidence references, closes that exact admission, and is permitted after provider exhaustion or deadline because it records an incurred outcome rather than another spend. A budget revision cannot replace the current digest while a step is unfinished; publication requires both no active step and no unresolved leaf under the same run lock. A different step cannot enter while one is unfinished; same-key replay never authorizes another provider invocation.

Provider calls still pass through the existing single unresolved reservation and reconciliation authority. reserveCampaignProviderBudget binds each GitHub read/comment/close adapter request to an exact active step and request digest. GPT authoring forwards an explicit nullable step binding; standalone authoring/challenge is allowed only when no step is active. Closed authoring operations alone consume authoring rounds. Every admitted provider operation holds one provider call; observed or conservatively reconciled completion consumes it, while explicit reconciled_not_started releases it. One GitHub snapshot may require identity plus several page calls, each separately reserved; one GPT browser adapter invocation is one call. Invisible provider HTTP retries are not an enforceable usage claim.

The same event stream, monotonic ledger index and chained digest cover step admissions/completions and usage. Campaign step counts, provider consumption and active-step identity are deterministic folds, not another mutable counter file. Only a completed controller step updates campaign no-progress streak; inner provider success cannot reset it. The final admitted step may spend remaining provider budget and complete even when the step-entry cap is reached. The next denied entry/call records the exact metric in the existing stop receipt and operator projection. Stored step events must bind the run authorization and published budget ancestry; an active step must name the current revision. Board metrics and current are bound by the same event chain and unresolved reservation set; concurrent mixed reads fail closed without writes. All event/current crash windows refold forward; missing events, missing reservation/admission authority, changed replay bytes, foreign context and invalid sequence fail closed.

BRC6 terminal freshness stays exact against the entire current ledger. Future BRC9 wiring must complete the step before final authoring seal/verification; subsequent budget activity leaves the terminal as historical evidence and cannot silently upgrade it to a current proof. The package provides upstream APIs and authoring forwarding only. Campaign CLI wiring, per-task repair accounting, transient streak and the pre-adoption attempt protocol remain BRC9 prerequisites; the sprint row is not complete.


### BRC9 heartbeat budget consumer boundary

The heartbeat consumer binds admitted work in `campaign-step.ts` to the existing step admission and completion events. No-work idle and expired-intent responses remain pre-admission, with no provider access. A durable heartbeat receipt precedes budget completion; replay can finish that exact admission without another observation. A receipt without prior admission cannot backfill execution authority.

`campaign-provider-execution.ts` wraps the GitHub runner used by the real observer and the one selected mutation. Repository identity and each page consume separate calls. Keys bind admission plus invocation ordinal; changed request bytes at an existing ordinal conflict rather than minting a new invocation. `budget-store.ts` persists a reservation-bound provider outcome before its usage event. These observations do not write into the heartbeat journal or own counters. Typed read failure closes the observed adapter call; unknown reads and mutation errors keep the external reservation unresolved. A failed observer snapshot completes the heartbeat as no-progress only after the existing budget authority proves there are no open external reservations. Its failure receipt is retained as evidence; same-key replay is zero-I/O and a later key can proceed within the original grant. Unknown outcomes cannot acquire a completion receipt through the observer error wrapper. GPT continuations forward the same step admission instead of opening an unrelated standalone call.

This is a published partial package: `plans/archive/plan-20260906-2257-brc9-heartbeat-budget-consumption.md`. Its Source Ref points to this research document, so canonical finish must not complete Sprint BRC9. Adoption remains separate: its post-seal observation rejects title/label drift and supports crash-after-seal recovery; adding budget events there cannot be solved by silently moving the observation or relaxing the exact terminal verifier. Writable Repair worker dispatch is now provided by the separate standalone contract-worker bridge documented in `docs/researches/20260907-brc9-writable-dispatch-attempt.md`. It is not the read-only delegated runner. Per-task attempts are produced by that bridge, not by heartbeat consumption; per-task repair accounting and transient retry policy remain unaccepted.
