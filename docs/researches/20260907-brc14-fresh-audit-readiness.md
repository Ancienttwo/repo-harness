> Historical snapshot preserved on 2026-09-10 from `18ce5054657f2c0e7f3091b23260a7bdc729335f`. Status and observations below describe that original investigation; they grant no current execution authority. Consult [20260908-brc14-fresh-audit-runtime.md](20260908-brc14-fresh-audit-runtime.md) for the later implementation boundary and [consolidation provenance](20260910-inactive-branch-consolidation.md) for disposition.

# BRC14 fresh main audit readiness

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

只读研究，基于 BRC13 候选 `b9684c3c72a260a8d04a48f2e662e60a78e672bb`。BRC14 仍 pending；本文不构成实现、验收或 campaign activation 证明。

## 已有权威与实际链条

`ProgramAuthorizationV1.campaign` 在 `src/core/automation/budget.ts` 提供 campaign identity、group_count、require_fresh_main_audit、profile 与预算。`src/core/automation/development-campaign.ts` 和对应 store 已有 append-only CAS event chain：group_running → group_auditing → group_accepted → group_preparing，expected_current_sha256 负责并发保护。

`IssueBatchIntentV1` 在 `src/core/automation/issue-batch.ts` 绑定 campaign_id、group_number、base_main_sha 和 intent_sha256。Adoption receipt 在 `src/core/automation/issue-batch-adoption.ts` 绑定同组 Issue、Task/slot、authoring session 和 unfilled_slots。BRC13 的 cleanup receipt 是 audit admission 的前置事实，不能代替 audit 结论。

浏览器新会话入口是 `src/cli/chatgpt-browser/engine.ts` 的 runBrowserConsult；runBrowserFollowup 通过 sourceSessionId 明确复用旧会话。Fresh audit 必须从新会话入口产生，不能把 authoring follow-up 改名后当新审计。

## 两个阻断点

1. `src/core/automation/connector-challenge.ts` 的 ConnectorChallengeReceiptV1 只有 challenge_verified：三项内容答案匹配。它没有可信 Connector revision readback producer，不能证明模型读取 exact final_main_sha。Sprint BRC6a/BRC14 明确要求缺证据时 unverified，不进入下一组。模型回显 SHA、通知 receipt 和本地 Git fetch 都不补足这个证明。
2. `src/effects/automation/gpt-pro-issue-authoring.ts` 的 startIssueBatchAuthoring 从 immutable campaign definition 取初始 target_revision 作为 base_main_sha；continuation 也要求同一初始 revision。它不能满足 Group 2 基于 Group 1 final main、Group 3 基于 Group 2 final main。原始授权不能被重写来模拟滚动 baseline。

另有状态推进入口需要同包收口：`src/cli/commands/campaign.ts` 暴露通用 transition，event evidence_refs 只是 opaque string array。单纯新增 audit receipt，而继续允许绕过它执行 accept_group/prepare_group，不能建立可信顺序。

## 最小完整接线提案

先形成 BRC6a 的真实 trusted revision producer 与验证契约。BRC14 再在同一包接通 audit receipt、group baseline resolver 和受控 transition：G1 取授权初始 target；G2/G3 只取上一组 accepted audit 的 final_main_sha。没有可验证 producer 时可以记录 unverified；不能实现一个靠调用者标签或模型文本升级的 accepted 分支。

拟议 audit receipt 至少连接 campaign_id + group_number + intent_sha256、expected_main_sha、observed_main_sha、adoption digest、完整 slots/unfilled accounting、Issue/PR identities、新 audit_session_ref、trusted revision evidence digest、raw answer digest 和闭集 disposition。该 receipt 尚未实现，不能被当作现存 authority。

新 GPT audit 调用需要预算 vocabulary 中的真实 operation。现有 initial/fill_missing/edit_issue/challenge 不能承载改名的 audit。所有新会话、重试、未知结果都仍须经过唯一 budget store。

## 验证面与停止边界

- Wrong SHA、复用 authoring session、缺 slot/unfilled、无可信 revision receipt：均不得 accept_group。
- accepted 的 G2/G3 intent 必须分别采用前组 final main；不修改原 campaign authorization。
- accepted_with_followups 不突破 group_count；rejected 不自动 rollback main；unverified 不推进，重试仍受预算约束。
- 通过真实共享 store 的负例证明裸 transition 不能绕过 audit receipt；CAS race 只能推进一次。
- 复用 development-campaign、connector-challenge、issue-batch-adoption fixtures，增加实际 receipt → next-intent consumer 测试。

本次只读追踪没有找到可消费的 trusted exact-revision producer。BRC14 的可执行边界须在该事实改变后重新核对；BRC15a 明确标为 exact-SHA 未验证的 shadow observation 不因此自动获得 active 权限。

## BRC6a local counterexample and executable boundary

On the integrated Operator/BRC13 source (`10bce5e5`), a disposable local Git repository reproduced the same-content, different-revision counterexample. Commit `ab651256f48d6f52be8a26dfe78074abc1e5f6f9` and an empty successor `408298d77a3e2b0345a002ece63b8e58bade12f5` have the same tree. The three answers were read from the old commit; the response echoed the successor SHA. `verifyConnectorChallenge` returned `challenge_verified` (receipt `sha256:1b3fbaf3f12a378071c9fcb449dfb4b68cc21097834dad79b97dce009854072e`). No browser/provider call or real campaign mutation occurred.

Reproduction recipe: create a tracked directory containing one unchanged text file, commit it, make an empty successor commit, build the successor challenge for the directory entries / exact text line / file SHA-256, and pass the old commit answers with the successor SHA to `verifyConnectorChallenge`. The verifier compares the echoed SHA and three answer strings, but has no independently observed revision field. This is a verifier-level counterexample, not a new end-to-end active campaign run.

The active consumer is `src/effects/automation/issue-batch-adoption.ts#adoptIssueBatch`: after challenge verification it can build and publish the adoption. `src/core/automation/issue-batch-adoption.ts` fixes receipt evidence to `challenge_verified`, and `tests/effects/issue-batch-adoption.test.ts` currently expects successful active publication with that input. The bounded correction is to freeze this counterexample and reject active adoption before materialization when trusted revision evidence is unavailable. Preserve explicitly unverified shadow observation. Do not add an unproducible receipt schema or treat an always-rejecting gate as delivery of the missing producer. BRC6a's exact-revision criterion and BRC14 remain pending until a real transport authority supplies verifiable revision readback.

The effect admission guard belongs immediately after campaign mode resolution and before the existing-artifact branch, not only before new publication: stored adoption replay can rebuild and publish early. Historical canonical artifacts also flow through `campaign-planning-proof.ts#requireCampaignPlanningAuthority`, which currently rebuilds a `challenge_verified` adoption without a trusted revision gate. That consumer must be included in the same safety decision. Existing active setup in `campaign-adoption-repository.ts` and `campaign-acquisition-fixture.ts` feeds planning, acquisition, worker, closeout and BRC10 lifecycle tests; adding a guard without preserving honest lower-level coverage would merely break setup. Never add a product test-bypass or recast these synthetic artifacts as provider proof. Named checks must include new active refusal before any provider/budget effect, stored replay refusal, historical planning-artifact refusal, and unchanged shadow budget behavior.

The shared planning-proof consumer is also used by `runCampaignCloseout`, `runCampaignCloseoutProviderAttempt`, `retireCampaignDispatch`, `observeCampaignReclaimEligibility`, `recoverCampaignDispatch`, and `settleRecoveredCampaignWorkerFinal`, as well as new acquisition/planning/worker launch. A blanket rejection inside `requireCampaignPlanningAuthority` would block historical recovery and cleanup too. Before implementation, separate the authority to admit new work from the exact antecedent proof needed to reconcile or close already admitted work; neither path may invent revision evidence or weaken existing Lease/reservation/terminal checks. This consumer overlap makes a one-line global guard an insufficient design.
