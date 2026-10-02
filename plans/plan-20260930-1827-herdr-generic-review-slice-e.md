# Plan: Herdr generic review slice E design and bounded canary

> **Status**: Executing
> **Created**: 20260930-1827
> **Slug**: herdr-generic-review-slice-e
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Completed bounded RUN2/RUN3 proof (cap17 exhausted); E2 uses zero-model domain tests, local full suite, type and Required Checks; no new canary.
> **Rollback Surface**: Design-only artifacts now; eventual atomic writer/verifier/source/policy/projection LIFO after draining review tasks
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md`
> **Task Review**: `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md`
> **Implementation Notes**: `tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260930-1827-herdr-generic-review-slice-e.md`
- Sprint contract: `tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md`
- Sprint review: `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md`
- Implementation notes: `tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260930-1827-herdr-generic-review-slice-e.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260930-1827-herdr-generic-review-slice-e.md`.

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
- Contract file: `tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md`
- Review file: `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md`
- Implementation notes file: `tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260930-1827-herdr-generic-review-slice-e.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Design-only artifacts now; eventual atomic writer/verifier/source/policy/projection LIFO after draining review tasks
- **Verification boundary**: Design-only deterministic probe and contract checks; live 8 hard10 rounds require separately reviewed GO
- **Review/acceptance boundary**: `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260930-1827-herdr-generic-review-slice-e.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md`, `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md`, and `tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Design-only artifacts now; eventual atomic writer/verifier/source/policy/projection LIFO after draining review tasks

## Captured Planning Output

## Why / 已批准方向

PR464 只交付既有 H0–H3/A–D 阶段；本 work-package 从该 PR 分支派生，按 umbrella plan:200/202/211 退役 Claude 专用 review CLI/schema/host，改为 generic review。这里先完成设计和无模型探针准备，不能把 quota 已批当成 GO，也不能删除旧路径。用户要的是现有 Herdr task-agent 通信协议，避免再造 host/adapter/registry。

reviewer 固定使用现有 fleet `deep-reasoner`。persona/Claude model/effort 来自 agents/fleet/deep-reasoner.md；Codex model/effort 来自 task-role-profiles.ts 的既有 target overrides。生产值保持：Codex gpt-6-astra/high，Claude opus/xhigh。canary 的 medium 是明确 `canary_override`，不改 fleet；用 medium 的探测不能声称 high/xhigh 生产向量已证。

## Scope

- 当前：P1/P2/P3、atomic cutover plan/contract、ignored probe script、每轮预期/预算、无模型解析/预算/argv/路由检查；所有能力先标 unverified。
- GO 后：只运行被用户核对过的探针，目标8/hard10；第一个非预期失败即停，精确清理并报 CHECKPOINT-6。不得自动重试/换 harness 重发。
- R6 证明与实施验收放行后：在同一个切片原子变更 review entry/lifecycle、受保护 domain Result、receipt writer/verifier、source enum、policy、projection、close consumer和安装文档；不留 alias/双格式 runtime reader。
- 排除：本 PR 更新或 merge、其他 paused native/delegation/contract-run/v1 reader、H5 全面旧值清退、mini/global install/用户default pane/main dirty files。campaign 此处仅记录决定及并入探测，不改代码。

## P1 — 现有边界与 authority

| Surface | 已观察的 owner / pressure point |
|---|---|
| CLI | src/cli/index.ts imports buildClaudeReviewCommand；commands/claude-review.ts exposes round/status/close/cancel。入口最终改为 review --harness，旧名字明确升级拒绝，不 alias。 |
| task lifecycle | effects/terminal/task-session.ts: validateSpec只要求args为string[]；start在intent后异常变成ambiguous_launch，never replay；host与provider有created/attached/identity proof；core round/budget原语已共享。CLI task-agent拒绝非空args，MCP也固定args:[]，本次不改。 |
| legacy session | effects/review/claude-review-session.ts freezes contract/goal/subject, nextSessionRound(max3)，保存 request/result/accepted；close验证真正Receipt。不是另造第二账本的理由。 |
| legacy host | claude-review-host.ts 现有受保护domain producer。写死fable、-p stream、disableAllHooks，不能用它证明新的deep-reasoner native替代路径。E不增加第二host模块/adapter注册表；最终保留保护职责，旧特定实现要原子退役。 |
| model/role | task-role-profiles.ts现有installer parser/target/writability是唯一fleet authority；无生产role→argv resolver。review是第一个实际消费者，直接在这一条路径消费，不恢复无消费者TaskRoleProfile registry。Claude fleet文件没有tools限制，read-only不能靠persona自述。最新用户pin：Read/Grep/Glob/Bash，仅allowedTools的git只读与task-agent result，dontAsk；用前后status/diff指纹+故意写探测，不声称原生sandbox。 |
| Result | generic TaskResult是claim；request identity/context hash不是提交者认证。read-only reviewer写execution checkout可能被拒。sentinel从history抽取只能证明观察保真，不能作为protected domain Receipt来源。交付路线须由canary证据决定；未证就unsupported，不用补偿result绕close fence。 |
| Receipt | scripts/acceptance-receipt.ts与helper投影 owns source enum/policy/record/verify/Markdown projection；refactor/candidate-verification、campaign helper和close consumer都读它。旧protocol1/2里的Claude/Codex专名要在原子schema切换中处理，历史只能只读归档。 |
| owner inference | 只读已证明的binding.harness_kind/parent_pane与Herdr精确pane identity；不读CODEX_SESSION_ID/CLAUDE_SESSION_ID，不猜cwd/UI焦点/model label。 |

## P2 — concrete round trace

调用者给 reviewed contract、explicit endpoint/parent；推导或覆盖 reviewer harness → 读取唯一deep-reasoner配置 → task-agent start → 校验identity/pins/read-only evidence → prepared packet的contract/goal/subject/target/evidence绑定 → 原有round计数(最多3) → 有序request/ACK/Result → domain writer recordAcceptance(expectedContext) → verifier所有join → Markdown projection → close重新verifyReceipt并比accepted round一致 → 仅created精确清理。

start前不能确定owner而无--harness：fail closed要求显式选择。capability未证：unverified/unsupported，不把history或模型自称当proof。request已发出/投递未知后：回读同一request，不重发、不换harness，不开启新session重置三轮计数。provider退出/timeout/approval：保留证据，explicit cancel，cleanup_pending如实报。

## Harness selection / 唯一用户授权 fallback

1. reviewer role始终deep-reasoner，不复用owner pane。owner=Claude默认Codex，owner=Codex默认Claude；其他/不可证明owner要求--harness。explicit--harness覆盖默认，不因same-harness报错，不走fallback。
2. cross不是验收硬门槛。Receipt记录实际role、requested/actual harness、fallback reason和已有binding/session证据ref；cross由这些实证关系计算，不额外存一位cross布尔或新policy机制。
3. 用户允许start不可用时fallback，但现有library的post-intent错误统一ambiguous_launch，无法证明没有活进程。安全可执行的子集是startTaskAgent前在endpoint环境里确认对侧可执行文件缺失；此时无intent/pane/provider，清晰提示原因及actual=owner，启动独立deep-reasoner。
4. Herdr失败/readiness未达/ambiguous launch不能自动fallback，先按现有identity close/cancel对账；没有无启动/无投递证明则停。这个限制是现有能力未证，不偷偷换runner。目标支持范围随证据放行，不添加新失败推断parser。
5. 提交后不切换；explicit覆盖失败直接报错。若未来显式更换reviewer，需要保持同一原有domain预算/序号和已冻结scope，不能用新task key洗掉3轮账本。本次设计不新增supersede机制。

## P3 — atomic cutover matrix

| 项 | 同一commit内的 writer/verifier/caller/projection 动作 | 保留的 invariant |
|---|---|---|
| entry/lifecycle | rename/reuse现有review入口及session职责为generic review；start通过task-agent，role固定deep-reasoner；撤掉旧CLI并明示拒绝；安装/skill文案一起切。 | explicit addressing、same-task persistence、created/attached、request unknown不重放、三轮预算不重置。 |
| protected Result producer | 先证明真实native provider可见request/可交结果、有效readonly；据A直接submit与B观察测试选择最小domain delivery，复用现有protected producer职责；删除旧固定Claude host。 | 大包完整投递、Result确实来自该provider channel；writable checkout claim/terminal观察不能mint Receipt。若没有可证明路线，不删旧实现。 |
| Receipt writer/schema | 在acceptance-receipt现有owner内一次升级protocol，旧host-specific reviewer/source改为role+harness实际证据与统一task-review source；recordAcceptance使用同prepared expectedContext。 | contract/goal/subject/target/evidence、findings、外部PASS/UserWaiver分离，owner grant仍严格绑定；requested/actual/reason只存一份。 |
| verifier/policy | parseAcceptancePolicy、validateDisposition、read/verifyAcceptance及JQ/operator库/trace 同切新source/rolejoin；explicit harness不被cross偏好规则否决。 | role必须deep-reasoner、实际harness/identity/pin可证明；缺证拒绝，不接旧format作current authority。 |
| projections/consumers | projectAcceptance/review headers、session accepted-N、close verify/compare、verify-sprint、refactor/candidate及其他现有Receipt消费者一起升级。 | projection不是authority；close不能从终端PASS或claim重建Receipt。 |
| historical/install | drain旧review活动，用旧版本关闭其owned资源；历史Receipt/旧contract只读归档，管理owned未修改文件一次迁出；旧CLI/source不alias，不翻译PID/opaque endpoints。 | 用户自管config/panes不碰；rollback先drain，再整栈LIFO版本/config回退。 |

协议字段设计在实施前由canary证据冻结：role/harness/requested/actual/reason/binding ref是用户明示及认证join需要，不建provider registry；缺少新domain Result的来源证明时保持Draft。精确版本/pin证据读取provider自己的会话日志，不问模型自述，不以argv单独标verified。

## Canary / 预算和 first falsifier

探针使用production library start/send/result/history/close/cancel，不用effects.start fake、不复用旧fable host、不写src/tests。固定fleet model与medium override、private named sessions、清除HERDR_*；endpoint仅session/configPath，不传home，provider只读真实认证并正常写会话日志，不改用户配置/全局安装；只允许request目录的--add-dir，禁止bypass/danger。

- C1 / L1（各1）：ACK+execution提交探测；同轮试primary/external owner journal写。Codex看真实sandbox拒绝；Claude看限定命令拒绝+工作树前后指纹，不能合并为sandbox证明。独立case-key不观察生产MCP提前cleanup，仍unverified。首次非预期写入即停，campaign对应未证能力unsupported。
- C2 / L2（各1）：readonly reviewer尝试(A)直接提交结果与(B)final sentinel JSON(request_id/context_sha256)；记录A拒/允范围和B折行/截断。B仅观察，不能铸Receipt。
- C3 / L3（各1）：>1MiB packet完整投递/linked visibility/精确head-mid-tail与provider原生日志证据；只有hash或3markers不自动等于完整模型输入，最后两轮运行；full/truncated均预期，只记录，缺全量证据仍unverified，不因此停止其他探测。
- R7 / R8（各1）：两种owner方向默认cross选择+independent deep-reasoner；实际pins与requested/actual/reason记录，cross不是硬gate。fallback本轮只验证preflight可判定的子集，domain Receipt仍unverified直到正式writer/verifier落地。
- N8（0模型）：预先声明的missing executable与production ambiguous start表现/精确cancel。它是预期负向探测，不占8轮；偏离签名才失败。post-intent不fallback。

目标8，hard10；余2不是自动重试许可，不动mini/default/root dirty/global install。count before send，首个非预期失败停，owner收尾created资源；服务stop仅私有session。现阶段脚本/预期表/预算给用户审，只有明确GO才能真实调用。

[UNKNOWN] 私有认证/actual pin日志格式、readonly Result route、完整大包、native idle重复事件、生产role resolver与domain Receipt。能读session日志才能给pin实证，缺/歧义只标partial，不假称支持。

## Campaign 决定（代码仍暂停）

用户已选A：删除容器，campaign worker普通task-agent+专用linked checkout；journal owner写在worktree之外，保留budget/lease/claim。旧umbrella容器保留提案由此决定覆盖。canary必须证明primary和external owner record写入被sandbox拒绝；没有证据或反例就unsupported/fail closed，不保留容器，不用可写checkout的claim替代journal。此处只在C1/L1增加探测，不做campaign代码或新增contained/OCI字段。

## Task Breakdown

- [x] E0/E1: approved design, bounded canary preparation and RUN2 real Result/three-round evidence.
- [x] E1-large: approved RUN3 two rounds, valid collected Result is pass; complete ingestion remains follow-up.
- [x] E1-receipt: implement launcher-independent generic-review Receipt binding in existing writer/verifier; zero-model fixture evidence and field tamper guards.
- [x] E1-denial: existing RUN3 zeroSandbox assertion only; custom-profile OS denial, no new repo test.
- [x] E2-inventory: traced DELETE6 / EDIT36 / RETAIN27 inventory reviewed; user approved exact six deletions.
- [ ] E2-cutover: same PR after these three conditions and deletion-list review; no aliases.

## Workflow Inventory / 验证与 rollback

本worktree从PR464 head派生，不改当前PR代码/正文scope；新增本work-package plan、对应design contract/notes，review保留pending，tasks/todos只作长期ledger不扩。本机runs/review-design存ignored脚本/日志/manifest，结论与脚本SHA进入notes或research；活跃plan切换仅本worktree。

E0验证仅无模型：probe --plan/--verify、合同形状/preflight、budget/argv/route不变式、Required Checks。live validation必须在独立命名目录明确GO后执行，当前contract的JSON Verification Plan不得含live模型命令。

E0 rollback只删除/回滚设计文件，无provider进程。E2 rollback必须先drain新review task并保留证据，再LIFO回退完整schema/writer/verifier/caller/projection，不能只改source enum或将历史Receipt重签为新格式。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

### 最新校准 / proof边界

独立case-key只证单轮real provider/lifecycle/argv有效pin与A/B观察，不证同provider多轮、生产domain三轮预算/Receipt/role resolver或idle提前回收。canary默认8，候选可选C1b同Codex binding第二轮另需GO一并批准（9/hard10）；未做/未观察的能力仍unverified。postintent失败只cancel，fallback只preflightmissing；N8预期0模型不算失败重试。

Claude依最新用户pin加Bash但不加Write/Edit，不通过sandbox强制read-only。每轮before/after工作树指纹与一个故意写探测、tool allowlist证据单列；Result通过owner预置的canary-input测试submit工具（只证transport，非真实review内容）。actual输入竞态/工具不可用就停报，不补发。Claude原生sandbox与campaign强worker-write隔离仍unverified，不以allowlist/只读提示冒充。

参考检查：官方Claude文档确认`--settings`可仅作用于session、sandbox缺依赖可设failIfUnavailable，但最新用户选择本轮不用sandbox证明readonly，所以该配置未应用。来源 https://code.claude.com/docs/en/sandboxing （文档不是实测证明）。

## CHECKPOINT-6 corrections（待增量评审，未GO）

S0（0模型）先经同一生产start路径用fake TTY逐字节核对fleet args，再分别真实harness start/ready/cancel，不发送prompt；全部正常start timeout45000ms。S0与模型轮共用明确GO围栏，失败停在0轮。N8预声明缺执行文件负向仍4000ms。真实轮顺序C1/C2/L1/L2/R7/R8/C3/L3，候选C1b在C1后仅获额外GO才运行；默认8、可选9、硬10不变。拒写证明按写命令call id/output配对，排除原指令文本。Claude日志以mtime+record cwd/time归属；Codex按本地日期。大包full/truncated均预期，截断或无全量证据不升级支持。

## Approved implementation scope, 20261002 (supersedes old design-only/quota prerequisites)

User approved implementation of the Receipt slice and normal repo gates. Exit conditions are exactly two large cases, normal production Receipt write/verify, and the existing custom-profile denial assertion. Other UNVERIFIED items are nonblocking notes follow-ups. No new canary, no deletion in this slice, no OAR adapter. Receipt validity binds only domain subject/request/result/schema/verdict and actual harness/role/model; no launch-specific validity field. This plan stays in the existing E branch/PR boundary.

P1: scripts/acceptance-receipt.ts owns schema/policy/writer/verifier; its helper template is a byte projection; callers/tests use the production functions. P2: acceptanceContext -> domain Result binding -> recordAcceptance -> protected owner Receipt/result authority -> verifyAcceptance -> subject/evidence/policy and domain binding. P3: extend existing functions, not a new host/registry; reject retired source labels, keep transport ownership outside Receipt validity; identical fixed-time domain inputs must generate identical Receipt bytes from Herdr/headless fixture callers.

## Gatekeeper critical ship boundary

The obsolete src/effects/review/claude-review-session.ts:289-292 calls recordAcceptance with the retired source and no reviewResult. Do not patch it or add an alias. Delete it in the SAME PR as generic-review wiring, after the user has seen the traced inventory; the PR CANNOT ship before this replacement/removal. tests/claude-review.test.ts is exclusively being deleted/replaced, so do not enable REPO_HARNESS_TEST_EXPENSIVE for that suite in this Receipt correction phase.

## E2 execution approved after Receipt gate round 2 PASS

Implement generic review CLI/orchestration on existing task-agent plus fleet deep-reasoner, then remove exactly DELETE6; apply EDIT36, retain RETAIN27. The former critical session caller is removed in this atomic PR; no alias/compat reader. Preserve prepared domain binding, stable finding IDs/status, three-round accounting and verified close. No new live/model tests. The three src/{cli/commands,core/review,effects/review}/cross-review*.ts paths remain untouched: their retirement is a separate follow-up only after E2 merges. Commit/push/PR authorized; merge requires Aimpact. Re-freeze the two named active contracts without translating historical receipts.

## B release / historical 18:41 decision (20:30 supersedes runtime mode, startup and type gate)

Implementation order is contract/preflight → pinned OAR + Node24 host build → macOS Seatbelt isolation FIRST → scriptedRuntime host → fixed Herdr pane.run execution-owner → removal of hand integration. Zero-model denial failure stops. The 18:41 decision releases reviewer-written result_ref only, with appendSystemPrompt communication authorization and unchanged RECOMMENDATION-first fleet text. Codex Session cwd=output and host env workspace-write are configuration; Seatbelt alone enforces writes. Stock OAR Claude bypass is permitted only under proved inherited OS isolation, but init-only actual_model cannot mint a Receipt. Grok remains unsupported, and no real model/native provider is run. Local commits only; no push/PR/merge/main.


## Aimpact 20:30 runtime decisions

After corrections (a)(b)(c), D2 uses stock OAR Codex danger-full-access, deleting inherited OAR_CODEX_SANDBOX; only admitted Seatbelt protects writes. D3 zero-prompt native startup records actual OS denial paths and permits only proved narrow pure state directories, never trust/settings/hooks/definitions/instructions/credentials. No HOME redirect or credential copying. D4 skipLibCheck is explicitly approved, with unchecked declaration surfaces disclosed. Run local full suite (120s per case) and classify each failure via merge-base rerun, fixing introduced failures only. Claude's init-only model remains insufficient for Receipt. No remote operations.


D3 observed checkpoint: native-state allowlist is empty. Claude 2.1.284 SDK
Session constructor and dispose passed without state grants (actual backend
model remains unproved). Codex 0.160.0 app-server exited with root SQLite/WAL/SHM
denials in the OS probe window; no mixed ~/.codex root grant or HOME redirect is
allowed, so Codex remains unsupported under current admission. OS deny logging
is diagnostic only. Finish full-suite/base classification and integrity gates;
these startup results are not real review acceptance.
