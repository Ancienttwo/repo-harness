# Agent-first Kanban 实施路线：有界自动推进、Steer 与人类监察

> **Status**: Draft
> **Created**: 20260921-1755
> **Updated**: 2026-09-24
> **Revision**: 3 — Campaign入口、turn边界、Steer恢复与执行切片分离
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260824-persistent-module-engineer-organization.md`
> **用途**: 产品实施路线引用文档；不属于plan→contract投影输入
> **Source Ref**: 用户2026-09-21方向修订与后续接缝评审；输入指纹见下文
> **Execution Admission**: 未成立；本仓库 Campaign mode=off，现行 Campaign runtime 硬绑容器，纯宿主机证据契约未交付

## 0. 本次裁决与计划状态

**Kanban 是 Agent Engineering Control Plane 的人类观察与干预界面。获批范围内的正常步骤由 Agent 推进；人类观察、steer，并处理真正的决定、授权和停止边界。**

V1 研究稿的源码诊断继续有效；其产品定位、以人类逐项推进为主的旅程、先UI后自动化的顺序及以页面操作完整性为中心的验收，全部退出实施基线。本文件替换上一版 Draft 正文，不以附加几个“自动化”段落保留原有主线。

本次交付仍是方案修订。没有修改 policy、mint grant、恢复旧 campaign、启动 worker、调用模型或声明真实自动化已通过。旧 KBN-00–07 编号停用，新的 AKN 编号与旧修复项映射见后文。Revision 3保留Revision 2的产品方向，仅收紧衔接契约。原研究稿保留原文，不作为产品目标权威。

当前证据足以冻结产品方向、领域复用路径和验收边界；不等于所选非容器路径已准入。本文从原`plans/plan-20260921-1755-kanban-vnext-implementation.md`移到`docs/researches/`，移除work-package头、投影用Evidence/Promotion Gate、执行Task Breakdown和contract占位。它不是新workflow artifact类型；只是既有research目录中的路线引用。机器保护复用`plan-to-todo.sh`现有work-package门槛，不新增编排框架。即使产品方向获接受或文档状态改为Approved，也缺少执行工件资格，不能整体投影成宽权限合同。

本轮只展开AKN-00独立Draft（链接在§9）；AKN-01—07仅保留路线行。未来每个实际执行边界分别捕获plan/contract，执行清单迁入对应包，本文仅维护引用与验收依赖。**H0是native writable副作用及相应真实验收的前置，不是只读修复、协议负例、消息恢复测试和blocked投影的全局禁令。**这些可独立批准/验证，不能据其完成宣称自动化闭环。

规划依据为当前 repo 文档、源码与用户修订；`auto-campaign` 仅作为既有执行契约的引用，不表示调用或授权一次 campaign turn。

## 1. 输入权威与当前事实（P1）

代码基线：`0d4371c3f95e63851f4e083718f3337bf9646345`，package 0.19.2。开始本轮时仅原研究稿和本 Draft 未跟踪，没有受跟踪产品改动。本节是 2026-09-21 的仓库读回，不能外推为所有登记仓库或本机所有 Host 的运行状态。

| 优先级/来源 | 当前核对结果 | 实施含义 |
|---|---|---|
| 用户 2026-09-21 Agent-first 修订 | 人类授权后可离开；自动推进、反馈修复与 steer 是首批证明对象；不恢复容器路线 | 取代 V1 产品目标和优先级 |
| `plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md` | Approved；主要用户含自主拉取任务的 Agent；Fleet acquire→WorkEnvelope→Publication→feedback | 显式领域命令可以由受权 Agent 调用，不要求每步人类点击 |
| `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md:17`、`:35` | Agent Engineering Control Plane；Provider runtime/control/projection 分工；三类观察视图 | 不重建 query loop、model gateway、daemon 或 Local Worker Host |
| `docs/researches/20260824-persistent-module-engineer-organization.md:12`、`:720` | 8月25日架构修订替代 combined Worker Host；持久Engineer不等于永久Session | 不能引用被替代草案重新引入 runtime 平台 |
| `.ai/harness/policy.json:70` | `development_campaign.version=1, mode=off` | 方案和安装都不自动启用 active/manual |
| `tasks/todos.md:20`、`:21` | BRC14/BRC15 的 fresh audit、canary与纯宿主机证据缺口仍记录为deferred；scope amendment关闭不等于验收 | 必须分别补证，不复用旧容器观测证明新基底 |
| `src/core/automation/campaign-runtime.ts:16`、`src/effects/automation/campaign-runtime.ts:29` | invocation protocol2要求container、image、container receipt；准备阶段要求BRC_CAMPAIGN_IMAGE | 当前缺口是执行证据契约，不能通过换成宿主shell或改配置跳过 |
| `tasks/todos.md:36` 与Engineer PRD末尾canary裁决 | writable delegation为runtime-not-admitted；需Host动态Parent限制和effect-time principal/epoch证据 | 不将已有read-only delegated run解释为可写自动化 |
| `docs/researches/20260911-auto-campaign-turn.md`、`assets/skills/auto-campaign/references/execution.md` | 一次显式有界turn，停于验证结果、人工merge、预算/deadline或blocker | 关闭Operator浏览器不停止已授权turn；不承诺关闭宿主Agent后无限运行、自动下一组或自动merge |
| `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md:4` | Approved design，Activation Deferred | 自动化正常推进不等于启用guarded merge |
| `docs/researches/repo-harness-kanban-optimization-v1.md` | placement误分类、丢准备blocker、available分入agent_working、全局UI写闸等代码诊断有效 | 作为后续事实投影修复清单，不再作为主旅程 |

用户修订来源为附件 `Pasted text.txt`；其语义已完整落实到本文件，未来执行不依赖附件目录仍可访问。原研究稿SHA256为 `7d299620e66d5ef1364b3512f163b51a2e40999f9010621f2d506b6417224ea6`。修订附件SHA256为 `622886ec2aa1ae7bb051de6d316211cc74c1f03e0aa8e46abbfec7dac959ba22`。

后续接缝评审附件SHA256为 `652c0527729ef2ca719260c57304f61fdcbcb2d6b805766ee0baf46d39f404f9`；评审中未实测的断点在本轮重新核对源码。

## 2. 产品完成标准与权限边界

首个目标场景从**已批准的canonical任务、明确Program/Engineer授权和已准入执行环境**开始。一次有界turn内完成 observe→eligible→acquire/bind→execute→首次独立验证→首次Publication→该Publication的合法same-owner反馈修复→新候选独立验证→再次发布事实→既定交付或停止边界。人类不逐任务运行acquire、continue、repair。另有一条中途steer进入同一场景，并能追溯接收者、回应和后续证据。

“正常自动推进”不包括自动批准自己提出的计划、扩大allowed_paths、提升预算、更新grant、强行takeover、重启unknown effect或合并PR。机械步骤无需加一次人类点击；需要业务/权限决定时沿既有具名领域动作停下。Agent-first不是降低门槛。

明确区分三个平面：

```text
人类目标/批准/边界 ──> 既有Program grant + canonical WorkPackage/Contract
                                |
                        已授权Host中的Agent turn
                                |
          observe/offer -> acquire/bind -> execute -> verify/publication
                 ^                          |                  |
                 |                 durable steer/reply         |
                 +-------- 合法反馈修复 / 明确停止边界 <-----------+
                                |
                   既有events / receipts / evidence
                                |
             Operator监察 / Planning / Delivery / Organization

浏览器关闭：只取消观察GET，不撤销grant、不终止该有界Agent turn。
Host退出/授权撤回：按既有停止与reconciliation契约处理，不等同浏览器关闭。
```

Browser首批仍只有 task message 写路由；这是UI权限范围，不是执行侧能力上限。正式Decision、Contract amendment、grant撤销和执行stop由原有具名动作承担；本轮不将它们伪装为普通留言。人类在这些真正边界使用既有领域入口是合理例外，不应成为正常工作每一跳的操作方式。

## 3. 自动推进链：责任、触发和证据（P2）

| 链路 | Owner / 触发 | 权威输入与输出 | 缺口/失败归属 |
|---|---|---|---|
| 目标与授权 | 人类或现有policy gate，一次批准 | graph/task IDs、target SHA、grant、expiry、预算、Host/session | 缺授权停在人类；不以消息“同意”补grant |
| 工作存在/eligible | canonical reader + TaskOffer/EngineerOffer；Agent在turn内观察 | task revision、plan/contract proof、graph/binding/offer revision、blocker owner | plan_missing可归Agent，plan_not_approved归人；不能全部叫“需要你” |
| 执行侧已观察 | 原有controller/campaign step | 既有step receipt、observed revision、下一步决定或idle原因 | Available并不证明存在消费者；缺step记录显示未观察/未知 |
| 通知/唤醒 | 已准入Agent Runtime adapter，必要时notify_inbox或wake_for_offer | immutable effect、endpoint fence、exact control_ref与receipt | wake只提示有工作；不携带Claim/Lease授权；无需求不必人为多走一次wake |
| offer重读/acquire | 当前合法Engineer/parent，收到wake或turn中的下一步 | exact principal、graph/offer/binding fence；ClaimActorReceipt+Lease+WorkEnvelope | stale拒绝；no eligible按原结果idle；旧观察不授予权利 |
| 进入execute | 既有campaign worker handoff/contract-run、已准入Host effect | dispatch/claim/generation/contract/profile/environment digest与启动证据 | 当前Campaign依赖container，是第一执行阻塞；不以CLI字符串拼接绕过 |
| 运行/验证 | Provider runtime运行Agent；独立verifier消费candidate | exact execution identity、终止/输出证据、候选SHA、Verification Plan/AcceptanceReceipt | 缺终止事实保持unknown；worker自报DONE不算Acceptance |
| Publication | 现有publication/ship领域效果，在grant允许范围 | publication_id、head/base、PR/provider事实、Lease reviewing | 不从exit0推导已发布；需人merge时整理证据并返回 |
| 反馈消费/修复 | 有权限Agent在原turn内的合法恢复路径 | 当前publication和reaction token、reopen/takeover fence、attempt/budget | 可修复归Agent，CI在跑归external；no_progress/越权/预算才升级 |
| turn结束 | 原controller/campaign owner | verified outcome / awaiting merge / budget exhausted / blocked + 原journal | 不开启下一turn、不自动换grant；不清理尚未证明inactive的执行 |

具体入口：`campaign-acquisition.ts#runCampaignAcquisition` 调用 `acquireNextScheduledEngineerTask`，验证当前principal/ClaimActorReceipt/WorkEnvelope后产生worker handoff；`campaign-worker.ts` 和 `campaign-runtime.ts` 拥有执行/终止/settlement；`campaign-closeout.ts` 与 `campaign-fresh-audit.ts` 属于后续收口。`controller-run.ts#stepAutomationController` 是另一个已有有界controller，当前调用delegated-run；**不得把两者叠成两个scheduler，或将read-only路径解释为writable准入**。

本期选择原有campaign parent turn作为修复任务的编排载体，复用其已有Journal、预算与acquire/worker/closeout效果；正常已批准任务范围仍由canonical WorkPackage定义。新功能继续走PRD→Sprint→Plan，不能被Repair Campaign自动采纳。首条贯通从真实Campaign已完成前置链的获批任务恢复，具体资格见§3.1；只有这些事实确已存在时，本轮才不重跑authoring。canonical task本身不构成入口，缺事实即阻塞；不恢复之前已停止的Campaign、不伪造journal，也不默认追加远程审计/Issue authoring消耗。

### 3.1 首条贯通场景的合法入口

**选择现有恢复路径，不新增任意canonical task导入入口。** 当前没有将一个孤立获批task直接交给Campaign acquisition的合法捷径。AKN-01展开前须选择一个仍有效、已真实完成下列前置链的Campaign subject；若不存在，明确报`entry_prerequisite_missing`（拟议的canary诊断码），不能通过fixture填齐，也不能悄悄启动本轮未覆盖的authoring。

| 必需事实 | 现有owner及核验 |
|---|---|
| Campaign阶段与授权 | `campaign-revision-admission.ts:13–48`接受`group_preparing`或`group_running`；active policy、revision observation、target/grant、预算与当前group一致。历史stopped/expired状态不可复用 |
| Group intent | `issue-batch.ts`与`issue-batch-store.ts`的真实immutable intent：campaign/group/base SHA、slots和digest。现行batch有10个连续slot；单任务canary不能伪造一slot批次 |
| Authoring/adoption | `issue-batch-adoption.ts:217–259`要求initial authoring已完成且verified、challenge/response和source binding成立；adoption terminal匹配intent |
| Materialization/publication | `publishIssueBatch`生成manifest、canonical Sprint/Work Graph及task/work-package IDs（`issue-batch-publication.ts:60–128`）；manifest/adoption/publication SHA一致，不能把预先存在的task ID塞入记录 |
| Planning | `requireCampaignPlanningAuthority`接受publication与manifest；选定task对应job/result、真实plan proof与contract preflight通过；`planning/parent.json`的host/session与恢复主体一致 |
| Acquisition授权 | `runCampaignAcquisition`重读上述authority，仅从manifest任务集选择，核对principal、Binding、ClaimActorReceipt、Lease和WorkEnvelope；task仍eligible |

固定本次选定的campaign ID/group/slot、task ID/revision、publication SHA及parent身份后才开始AF-01；不强制把真实记录改成group-1/slot-01。原grant允许的任务集必须限制本次工作，不修改其他slot状态来制造单任务成功。恢复只通过原planning/admission/acquisition入口，若parent已轮换且原入口拒绝，先停下，不能编辑`parent.json`。

本子路径不调用initial authoring、fresh audit、下一组生成；成功只证明选定task及其反馈循环。其余slot、group、BRC状态不因小canary完成而被标Done。若产品要求“任何既有获批task可直接进入”，那是单独受限入口设计；不在本路线中暗加导入命令。`tests/helpers/historical-campaign-lifecycle.ts`手工历史装配只能用于故障单测，不能提供生产入口权威。

### 3.2 发布后反馈与同一turn的行为

AF-01/AF-06选择**发布后same-owner repair**；本地测试失败后的修改属于内层循环，不能抵扣此验收。精确顺序为：候选C1/独立验证V1 → Publication P1/Lease reviewing → 绑定P1的FeedbackOffer与reaction token → 原`fleet feedback repair reopen` → same Claim/generation回到bound → C2/独立V2 → 依原publication规则形成P2或更新发布事实 → 原`feedback repair complete`绑定源反馈与新事实。task revision、Claim/generation与publication链必须始终可核验。Takeover不进入正向canary，只保留拒绝负例及以后独立验收。

当前`reopenFeedbackRepair`已有same-owner证明路径（`src/effects/publication/feedback.ts:1422–1529`）；当前`heartbeat-step`只是一次调用，`runCampaignStep`可返回idle/next_check_at，并未实现同调用持续等CI再修复。AKN-02要补的是**现有Host正在执行的这一个turn内**消费typed结果、等待、重新观察并选择repair的接线，不能把它描述为已经存在。

| 当前真实观察 | 当前turn行为 |
|---|---|
| 当前有获准且可执行的step | 重验grant/ownership/budget后继续该step |
| CI或外部review尚未结束、授权与预算有效 | 当前Host turn有界等待后重读；不要求人工continue，不调用closeout假结束 |
| 存在当前P1可处理FeedbackOffer | 验token/revision和repair预算，通过same-owner reopen恢复；P1旧反馈不能作用于P2 |
| 发布后达到原merge-readiness人工边界 | 整理exact证据返回人类；不是仅创建PR便无条件停在merge |
| 业务决定、权限不足或ownership丢失 | 停相关工作，进入既有Decision/授权边界；不自动增加范围 |
| grant/campaign/turn的deadline或预算到界 | 结束本轮；不续期、不自动下一turn，保留原idle/停止证据 |
| provider效果结果未知 | 停写与重试，按原IDreconcile；未解决不允许普通等待分支绕过 |

等待由原Host turn承担，无daemon、scheduler或新增后台任务。每次只等待到既有`next_check_at`、30秒观察上限及最早deadline中的最近者，随后重新读取；已到期立即停止。每次新的provider观察必须经原预算准入/settlement，等待时间计入原wall-clock边界；不能重复调用有副作用step充当poll。若现有reader没有相应预算效果入口，AKN-02须补在原owner，不能无计量轮询。等待期间持续检查撤权/ownership；Host退出则turn停止，不承诺自行恢复。无法在原预算内等到反馈的canary记为未覆盖AF-06，不能注入本地失败冒充。

### 当前源码确认的两个因果断点

- **执行基底**：`prepareCampaignCodexInvocation`要求image→创建container probe→container invocation→`observeCampaignCodexTerminal`验container receipt。用户不允许容器，因此纯宿主机没有对应被接受的证据；不能仅删参数使流程继续。
- **Steer回应身份**：现有`fleet message send`的`messageInput`把sender固定为user/local_operator；它不是“当前Agent已认证回应”的通路。现有in_reply_to仅校验UUID，并未校验父消息或recipient；发送主体和父消息关联都要经新的受限边界证明。另一个缺口是现有hook只写hook_session delivered，不ACK，也不携带runtime effect的control_ref，不能证明该notify被消费。

## 4. 推荐实现路线与准入裁决（P3）

最小路线是**一个获批任务、一个已授权有界parent turn、一个合法执行者、一轮反馈修复、一次中途steer、一个现有交付边界**。先证明这条纵向路径，再扩展监察和多任务展示。不先做完整五列重画，也不建新的Runtime、调度数据库或万能command engine。

### 4.1 纯宿主机执行是独立前置边界

AKN-00固定准入对象为Darwin arm64 / Codex CLI 0.154.0候选路径，拓扑是parent + 单delegated writer + 独立只读verifier，实际未来入口为Campaign handoff → contract-run → worker/runtime。该拓扑明确适用原ME-2B约束；不把这些Parent/Child条件推广到未选择的其他形态。准入对象表、权限、外部效果、版本/profile摘要及不支持项由独立AKN-00计划冻结。当前CLI版本仅做只读探测；现有ME-2B probe仍只支持0.149.0，因此没有本轮正向准入证据。以下是这条路径必须满足的能力合同：

| 必须证明 | 具体oracle | 不合格替代品 |
|---|---|---|
| 调用身份与准入版本 | exact harness/package、provider executable/profile、task/Claim/generation、binding、grant epoch、worktree identity绑定 | 只有`--version`、prompt哈希或可写JSON |
| 写入隔离 | 当前actor仅能修改获批worktree/paths，不能伪造grant/receipt；只读verifier不能写candidate | chmod、同UID文件签名、自报allowed_paths、普通shell继承全权限 |
| 单writer与撤销 | 若采用Parent+delegated writer，Host须证明Parent限制及每次effect的principal/epoch；旧actor失效后不能继续写 | 提示词承诺、只限制subagent数量、启动时一次检查 |
| 执行与停止证据 | launch/run身份、输出完整性、deadline/cancel结果、所有相关执行效果inactive或明确unknown | 只等父PID退出、killpg成功、按时间猜没有子进程 |
| 崩溃恢复 | durable intent在effect前；未知launch/result原ID查询，不能自动重复spawn | 换id重跑、删journal、把missing结果当failed |
| 独立验收 | verifier结果绑定exact candidate/contract/环境；worker结果不是acceptance authority | 通知成功、exit0、Agent自述 |

证据由现有Provider/Host边界出具，repo-harness只做薄适配、验证和引用。没有真实API/能力支撑的字段不得在adapter里自己填写。单writer要求具体匹配选定运行形态；不能换名“直接parent执行”来逃避原Campaign要求的独立验证、效果身份和停止证据。

**H0结果只有admitted或runtime_not_admitted**。后者是可交付的准确诊断，但不是本产品自动化目标完成。当前仓库证据只支持“尚未准入”，总工期不能沿用上一版18–27日估算。H0未通过时可以交付真实blocked观察与model-free契约；不得发布“Agent可自动推进”或悄悄转回人工逐任务操作。

**Host能力准入（AKN-00）与Campaign native接线验收（AKN-01）是两项独立结果**；前者admitted不能替代后者。H0通过且native执行证据合同被明确批准后，才在AKN-01将Campaign active执行路径切到该固定Host版本/平台的native adapter，更新invocation/terminal schema和所有消费者。单次cutover移除旧container active authoring分支；旧记录保留供只读审计，遇旧执行环境恢复请求给具名unsupported/refusal，不生成native等价receipt，不设置长期双执行fallback。若仍有未结旧effect，先按其既有规则处理或保持隔离blocked，不能把它迁成新effect。

### 4.2 控制器与浏览器分离

复用当前`auto-campaign`的一次有界会话turn组织法，由正在运行的已授权Host Agent消费原有CLI/MCP的实际typed结果；这不是在repo-harness里加模型query loop。身份、预算、retries、reconciliation全部由现有状态机负责，SOP只规定读取/调用顺序。它不能因`operator serve`页面打开才开始，也不能因页面关闭停止。

每次effect前验证原grant、policy、当前ownership与预算；费用额度未知时不谎称硬金额/token cap。遇manual merge、业务决定、授权不足、budget/deadline、unknown outcome或loss of ownership即停在原契约边界。不是任何CI失败都升级给人，也不是任何失败都可以自动重试。自动takeover只在原grant和领域动作明确允许时发生。

### 4.3 取舍与10倍规模

这条路线先限制为一个已授权turn和固定Host能力，代价是不能承诺多Host通用写执行或无限无人值守。任务/仓库扩大10倍时，最先受压的是既有Offer扫描、逐任务证据读取和外部provider采集；执行并发仍受原budget/Host admission限制。先测每轮扫描数、调用数、排队时间和partial coverage，保持bounded batch、single-flight与可解释等待；不为吞吐量放宽Claim fence或新增第二scheduler。

### 4.4 不默认引入的东西

新Agent Runtime、Local Worker Host、模型网关、daemon、cron、无限controller loop、容器恢复、自动下一组、auto-merge、浏览器任意命令、第二任务数据库均不进入范围。现存Host副作用记录和一次有界process supervision可以复用；它们不构成授权新Runtime平台。新增依赖默认0；只有H0证明现有能力无法复用且有明确批准，才变更依赖/Host安装边界。

## 5. Steer 是首批闭环能力

### 5.1 三类交互不可混合

| 类型 | 合法路径 | 可显示的结果 |
|---|---|---|
| 工作指导 | 现有durable Task/Claim message→当前合法接收者→安全turn boundary读取→受限reply | 已保存、实际接收、执行者如何处理、关联证据 |
| 正式决定 | 现有Decision Request answer、Contract amendment、waiver等具名动作，绑定当前版本和actor | 领域动作成立的receipt；普通“同意”无此权限 |
| 执行控制 | 原controller/campaign stop或grant撤销，按其真实对象和生效规则 | 停止领取、停止请求、已inactive分别报告；聊天“停一下”不伪装完成 |

首批browser只暴露第一项写入；后两项显示已有领域资源和准确处理入口。浏览器增加正式控制需另一个UI写权限合同，不是本方案自动顺带启用。但相关需求/停止原因必须出现在首屏，不能藏到未来UI阶段。

### 5.2 端到端消费

1. Operator用稳定message ID和冻结task revision/Claim/generation写入现有Task Inbox。先durable，再可选notify；POST成功不等于notify成功。
2. 有效Runtime capability存在时复用`notify_inbox` effect、endpoint/Binding fence和exact control_ref；无能力时保留消息，并显示等待下一合法读取。不能为了“实时”注入终端或伪装UserPromptSubmit。
3. Agent在真实turn/tool-safe boundary通过既有hook/CLI/MCP reader读取。`task-inbox-handler.ts`只作传输；保留`TaskInboxUntrustedPeerMessages`和原有不可信正文警告。收到来自人类的文本也不增加WorkEnvelope/allowed_paths。
4. Agent重新检查当前Contract与指导的关系；在权限范围内调整工作，或记录需要amendment/无法采纳/已经跨过适用步骤。语义判断由Agent做，确定性权限/版本检查由领域代码做，不用regex解析正文“同意/停止/已采纳”。
5. 由当前合法recipient确认读取后调用受限ACK；ACK只证明该确认。Agent另外写一条绑定原message ID的回应，说明如何处理；新回应与后续candidate/decision/evidence refs在原始记录中可追溯。UI把自述回应和经独立验证的结果分开。

真实transport接线还须补齐：目前UserPromptSubmit hook只写`hook_session`的delivered，不ACK；`notify_inbox`仅接受`agent_runtime_effect` channel且`delivery_ref=control_ref`的exact receipt。受支持Host的真实turn/wrapper须先验证control_ref的message、Claim与Binding，再调用原delivery/ACK边界；没有control_ref的普通hook保持hook_session，不能升格为通知成功。接收与ACK均重验当前recipient，UI GET不能代为调用。若普通hook先取得消息，保留其真实channel；后到notify不能改写receipt来制造关联；有界处置见§5.8，不能用一句“reconcile”掩盖未决effect。

### 5.3 当前缺口与最小新增契约

现有`TaskMessageEventV1.in_reply_to`、`sender_kind`、`sender_trust`可复用；`readTaskMessageDelivery()`可读exact receipt。现有普通CLI send不能证明Agent sender，因此增加**受限的owner消费/ACK/reply通路及对应Engineer MCP能力**，而不是给Engineer开放通用Fleet mutation或在browser增加第二写口。

受限reply必须：

- principal从现有authenticated MCP connection/Host授权边界解析；caller传来的engineer/session/sender_trust不被信任。
- 读并验证当前Binding、ClaimActorReceipt、task revision、Lease Claim/generation与WorkEnvelope；在写入前重验。旧Binding即使持有消息文本也不能回复成当前执行者。
- 原message存在、digest匹配、与该task及合法recipient receipt对应；要求真实已读/ACK事实，不从时间推断。跨task的in_reply_to拒绝。ACK后恢复、回应方向和提交证明遵守§5.5—5.8。
- 复用原immutable消息存储和去重，`sender_kind=agent`、`sender_trust=lease_owner`由effect填写；`sender_id`引用已验证ClaimActorReceipt的稳定digest，而非显示名；经§5.6的受保护提交协议通过effect审计记录绑定authorization、原消息、recipient、回应event digest与发送时Binding。digest只作关联键，不作认证。读取端必须验证受限发送的审计出处，不能看到agent/lease_owner或可复制的digest就显示认证徽记。
- 先采用exact回应正文+in_reply_to显示“执行者回应”，不额外发明一个可覆盖执行状态的`steer_status`。采纳/拒绝含义由原回应表达；若Agent产出typed Decision/verified evidence，单独验证并展示，不从prose生成领域事实。
- 原始正文协议保持v1可表达的形状；任何新增receipt字段需要独立版本和消费者同步，不能把缺provenance的旧消息提升为已认证。

回应effect属于通信事实，不授予执行权、不更新Task/Lease/Acceptance。同UID worker不能直接改权威store以假冒回应的保护由H0与原写边界承担；前端校验或digest不能代替该保护。

### 5.4 必测故障与迟到边界

claim-scope旧消息不跨generation；task-scope沿现有合法recipient规则交付，不偷偷变成claim指令。Binding变化重新验证endpoint/actor。重复notify/reply原ID返回原事实。HTTP响应丢失先查原ID再决定是否原envelope重试。晚到指导作用于下一个仍合法的执行边界，已经结束则明确说明；不能伪称它改变了已提交candidate。

运行端离线显示已保存/未接收；未知外部结果只reconcile，不换ID重发。超出Contract的指导生成真实决定需求并停相关变更，不把普通消息直接当amendment。草稿、跨标签ACK、storage禁用和重新绑定保护沿用前版技术修复。

### 5.5 ACK之后崩溃：恢复读面与副作用分离

当前`isGloballySatisfied`将task-scope任一ACK视为满足，delivery/summary据此跳过；ACK本身不关联reply（`task-inbox.ts:657–660,699–713,928–953`）。因此现有delivery不能作为未完成处置的恢复队列。这是本轮源码核对结果；下述是AKN-03新增契约。

在原Task Inbox owner内增加**只读“待补处置说明”投影**：原始steer + 当前合法recipient的delivered/ACK事实 + §5.6认证回应提交链。当前适用且已经交付、却没有完整认证处置回应的消息必须返回，不能受`globally_satisfied`过滤。该列表是可重建投影，不另存steer状态、消费游标或第二任务队列；返回父message ID/digest、实际receipt、原recipient、缺失阶段和当前fence。

在真实恢复turn开始、处理下一项可能受该指导影响的步骤之前读取这个投影；继续使用原不可信正文包装。分页有界，未读完的coverage必须可见，不能把未扫描完当作没有指导。恢复者先对照已有candidate、effects与Contract，再决定补充说明或继续合法工作。**重新呈现不重写ACK、不重新notify、不重新执行正文涉及的副作用。**恢复reader为GET语义，没有provider调用。

授权过期、Claim/generation/task revision或Binding变化时，不以旧ACK授权新主体补答。旧claim-scope留在历史并标明不再适用；本首版对“旧recipient已ACK、未回应”的task-scope也保留未闭环事实，未经既有正式handoff不自动转交给新Claim。新的合法接收者若通过原规则另获当前任务消息，仍按其独立receipt判断；不能把旧人的确认当成新人的确认。

### 5.6 认证reply持久化：新增局部提交协议

现有Task event和receipt各自支持task lock、immutable/atomic write与fsync，但没有跨reply+认证审计的事务。`src/cli/mcp/audit.ts:11–31`是普通append且允许失败，**不得把该日志当作认证提交凭据**。借用现有Task Inbox文件写入和锁机制，在同一受保护Task存储内增加局部reply effect记录；不借用Campaign journal冒充现成Task事务，也不建通用event store。

协议分三步，effect ID固定为首次生成的reply message ID，正文/envelope重试不变：

1. **Prepare**：认证MCP主体，锁内复核parent/recipient/Lease/Binding/WorkEnvelope；持久化不可变intent，冻结完整canonical reply请求、parent event digest、原recipient与ACK digest、authorization/ClaimActorReceipt/Binding generation和idempotency key。先fsync文件/目录再进入下一步。intent是本次写效果的恢复输入，不表示回应成立。
2. **Event**：按原immutable event写入流程发布同一reply ID的TaskMessageEvent；冲突字节拒绝。中途正文可被观察，但没有commit时只能显示“回应记录未完成认证”。
3. **Commit**：再次验证当前授权与完全相同的fence，确认intent/event/digest/原ACK一致，在相同锁序下写不可变认证commit并fsync。commit只拥有“此事件由哪个被验证主体提交”的认证事实；消息正文仍由Task event拥有。最终readback两者后才返回认证成功。原MCP普通audit仍可记录，但不参与成功判定。

新增record为具名`TaskReplyIntentV1`/`TaskReplyCommitV1`，存于Task Inbox该task下的reply-effects空间，由受限effect独占写入；字段/路径在AKN-03合同冻结。它们不是新的消息状态authority；恢复资格始终由原event、receipt及完整commit链派生。H0/已有受保护写边界负责防止worker自行改认证记录；digest只作内容绑定。

| 崩溃/读回事实 | 恢复规则与显示 |
|---|---|
| ACK有、reply没有 | §5.5重现指导；先查已有工作，再补答，不重放工作副作用 |
| intent有、event没有 | 原ID读取；只有同一仍有效主体/fence才能从冻结请求补写event再commit |
| event有、commit没有 | 正文可保留但无认证；原ID复核并补commit，禁止换ID造第二回复；无intent则视为孤立未认证事件 |
| commit有、event没有或摘要不符 | 不是合法成功；报告存储不一致/需reconciliation。不得仅凭commit显示正文或补造认证；只允许经完整intent与当前权限核验的原ID恢复 |
| event+commit完整，响应丢失 | 原ID查回原成功事实，禁止重复reply；重试内容变化报冲突 |
| 恢复时授权/Claim/Binding已变 | 不提交旧intent、不将旧event认证成新主体；保留未完成事实并具名拒绝 |
| 完整提交后发生轮换 | 按冻结的当时authorization/Binding generation和commit provenance展示历史合法回应；另列当前owner，不要求历史主体现在仍active |

该协议不能许诺跨文件物理原子性；它保证**半写不被认作成功且可按原ID恢复**。只读恢复投影不偷偷完成commit。若受保护存储无法支持上述锁序和持久化证明，AKN-03不得签收认证reply，不能退回best-effort MCP audit。

### 5.7 回应方向与封闭父消息集合

首版认证reply只允许回应：同task/revision、`audience=owner`、`sender_kind=user|operator`且来自原受信任人类写入口、`in_reply_to=null`的原始steer；scope可为task或仍匹配当前Claim的claim。必须存在对应实际delivery/ACK。Agent自发消息、Agent回应、orchestrator消息、跨任务/旧revision消息或任意未知父ID都不能充当该入口的父消息。

Host派生reply为`scope=task, audience=user, target_claim_id=null, target_generation=null, in_reply_to=原message ID`；发送时原Claim/Binding provenance保存在认证commit。现有V1允许这组字段，`audienceMatches`使Owner/Claim reader不命中user audience（`task-inbox.ts:472–494`）。因此本方案保持V1事件形状；若实现发现某consumer无法维持此方向，就在AKN-03显式升级协议并同步消费者，禁止私下忽略字段。

Operator只读activity查询user audience回应及认证链，不调用delivery/ACK伪造“人类已读”。Agent恢复reader只选原始steer，排除`sender_kind=agent`和`in_reply_to!=null`；不消费自己的回应。人类是否查看回应不构成Agent继续工作的条件。重试使用原reply ID；竞争回应在task锁中按已提交父消息/recipient记录拒绝重复处置，不自动再发notify给Owner。

### 5.8 hook先到、notify后到：有限处置算法

当前receipt的`delivered`不会被后到delivery覆盖，也不能切channel。当前runtime effect schema允许reconciliation状态，但`observeAgentRuntimeEffect`的实际owner只会根据exact receipt或adapter明确结果写success/failure，否则保留`reconciliation_required`。**仅有state枚举`stopped`不表示已有可调用且证据充分的stop路径**。首版不新增通知receipt attempt协议来把这一竞态凑成成功。

| 观察组合 | 本次有界处理 |
|---|---|
| hook delivered，无ACK/reply | 保留hook_session，指导显示已交付未有处置；恢复走§5.5，不重新投递以改变channel |
| hook delivered + 当前合法ACK/完整reply commit | Steer显示已有认证回应；notify仍独立，不能据此填exact receipt |
| notify拥有匹配自身control_ref的effect-channel receipt | 按原owner写`observed_success`；不依赖有没有reply来定义通知成功 |
| adapter明确unavailable/unsupported/failed | 原owner按实际结果写`observed_failure`；指导仍可通过已有hook被处理 |
| adapter accepted/unknown，但exact receipt缺失 | 原effect身份重新读一次已记录的adapter/receipt状态；只有已存在合法查询API时才追加原ID查询，没有查询API就记录未知；没有新的真实证据就以`receipt_wait_exhausted=true`交给原observe owner，保留`reconciliation_required/receipt_missing`并结束此次通知处理 |
| 有独立且可验证的Host停止事实 | 只有原owner明确支持、验证该证据的路径才可写stopped；本首版没有该通路时不承诺终态转换 |

“结束此次处理”是有界退出，不是把外部effect标成成功或已停止。未决记录保留原effect ID/control_ref/Binding及最后证据，attention标明原runtime effect owner负责，禁止同message自动重发或换ID再次唤醒。只允许后续原ID查询；仍无新证据就保持原状态，不无限轮询。

未决notify不反写Task/Lease，也不凭空声称已经停止原有worker。若当前parent turn必须等待该效果才能继续，返回reconciliation边界；已经持有效grant运行的工作仍按其原执行/停止合同报告。首条正向Steer canary须证明真实effect-channel接收链；hook-first属于预期可解释未决的负例，不能拿其ACK/reply掩盖未完成通知。此处理不要求新的runtime状态机；若未来要使重复通知自然终态收口，需独立Task delivery-attempt协议，不能藏入“复用原契约”。

## 6. 最小贯通验收——先于完整UI

### 正向场景 AF-01

固定一项已批准schema2任务、合法graph/grant、一个获准native运行端和一次有界turn。Agent自主取得offer、acquire/bind并执行；关掉Operator浏览器。给当前任务注入一次持久化steer，运行端在下一安全边界消费并回应；先形成P1，再经历一次绑定P1的可恢复反馈；Agent按same-owner reopen自主修复、独立验证并形成P2/更新发布事实及验收证据；在人工merge或原turn终态停下。重新打开页面恢复相同task/Claim/attempt/message上下文。

验收中人类只做初始授权、插入steer和原有正式边界决定。**逐张卡片start、逐轮continue、人工复制acquire/repair命令的次数必须为0。** canary driver若代替人类以测试脚本逐项编排所有动作，只能证明composition，不能宣称Host Agent自主推进；真实场景必须记录实际host调用与原始receipts。

### 三层证据不得混称

| 层 | 证明内容 | 不能宣称 |
|---|---|---|
| model-free契约与故障注入 | typed输入、fence、预算、幂等、拒绝、adapter schema/cleanup oracle | 真实Provider可用、Agent理解steer |
| 有界真实Host纵向canary | 无逐任务人工动作、关闭浏览器继续、真实steer消费/回应、可恢复反馈、准确停止 | 全部Campaign/全部Host/全部任务均完成 |
| BRC14/BRC15独立阶段证据 | exact-SHA admission、fresh audit、model-free故障集、activation ladder等各自实际覆盖 | 以本次小canary自动关闭旧deferred项 |

### 主要新验收清单

| ID | Given / When | Then / oracle |
|---|---|---|
| AF-01 | 获批任务+有效授权+admitted native Host，一次turn | 自动到既定交付/停止边界；逐任务人工机械操作=0 |
| AF-02 | AF-01中关闭Operator浏览器 | 已授权turn继续，task/claim不因观察连接消失而变化 |
| AF-03 | policy off、grant无效/过期或环境未准入 | 在外部provider effect前typed拒绝；不得花预算试跑 |
| AF-04 | eligible但缺控制器观察/消费者证据 | 精确解释缺哪一跳，不把Available说成运行中 |
| AF-05 | wake已发但没有acquire/run记录 | 分开wake receipt和执行权/运行，不造Claim |
| AF-06 | 当前publication收到允许范围的可恢复反馈 | Agent沿原reopen/repair路径及预算继续；无需用户逐次continue |
| AF-07 | no_progress/预算或deadline达到边界 | 停止并呈现原receipt；不补grant、不启下一组 |
| AF-08 | outcome未知或崩溃后重连 | 原身份reconcile，不重复spawn、不伪造terminal |
| AF-09 | 宿主身份/权限隔离/停止证明缺一项 | native adapter不准入；PID退出或可写文件不能替代 |
| AF-10 | 旧容器运行记录或read-only delegation | 不作为native writable证据，不通过改名迁移 |
| ST-01 | 人类中途补充Contract内指导 | durable→真实合法recipient读取/ACK→认证reply→关联后续证据 |
| ST-02 | 仅保存/notify/ACK，无reply | 分别呈现当前事实，不写“已采纳/已恢复开发” |
| ST-03 | Claim/generation更换 | 旧claim稿/回复拒绝；task scope遵原投递规则 |
| ST-04 | Binding/principal撤销或更换 | 旧endpoint/主体不能响应成新执行者；历史保留原归属 |
| ST-05 | 重复发送或响应丢失 | 一条逻辑消息；原ID查回；修改envelope不得复用ID |
| ST-06 | 指导晚到、runtime离线、storage不可用 | 保留真实未处理/不适用原因与稿件；不偷偷重发或唤醒 |
| ST-07 | “同意扩大路径”“停一下”等普通正文 | 不产生amendment/grant/stop authority；走真正领域边界 |
| ST-08 | Agent假冒sender或跨task in_reply_to | 受限reply边界拒绝；普通CLI消息不显示认证Agent回应 |
| ST-09 | Agent声称采纳，但候选违反公开接口约束 | 独立检查失败；reply/ACK不代替验收 |
| ST-10 | 两标签编辑、旧ACK后到 | 仅匹配ID/envelope的稿件可清理，不覆盖新稿 |
| OB-01 | 健康自动推进且无user-owned blocker | 首屏明确“当前没有需要你处理的事项”，仍显示进展/证据 |
| OB-02 | 同一任务存在Agent可修复项及external CI | 不全部放进“需我处理”；各owner和计数单位明确 |
| OB-03 | Planning/Delivery/Organization切换 | 同一组权威身份，三种投影，不新建状态来源 |
| OB-04 | A合法，B坏；registry可读 | A的目标steer合法；B异常可见；registry坏仍拒绝 |
| OB-05 | 刷新、切repo、重启epoch、隐藏/重开 | 无旧响应覆盖，无草稿fence重绑，无执行触发 |
| OB-06 | 旧head/base/contract证据或Agent run完成 | 旧绿灯失效；不能自动Done/ready/merge |
| OB-07 | 未授权Host/Origin/路径或协议错配 | 敏感reader/effect前拒绝；无绝对路径/密钥泄露 |
| OB-08 | 已安装tarball，真实浏览器与Host | UI引用同一真实纵向canary；开发fixture不冒充包验收 |

### 接缝验收补充（保留原AF/ST/OB编号）

| ID | 切片 | 必须证明 |
|---|---|---|
| X-01 合法入口恢复 | AKN-01 | §3.1真实前置链全部读回；缺一项拒绝，fixture不补权威；孤立canonical task不可进入 |
| X-02 发布后反馈 | AKN-02 | C1/V1/P1→绑定反馈→same-owner reopen→C2/V2/P2及complete关联；本地测试失败不抵扣 |
| X-03 外部等待 | AKN-02 | 同一Host turn有界等待不需人工continue；预算/权限/deadline确实停止；PR创建不直接等于merge边界 |
| X-04 ACK后崩溃 | AKN-03 | 已ACK但未认证回应的适用指导重新呈现；先查效果，不重放副作用 |
| X-05 回复半写 | AKN-03 | prepare/event/commit逐边界crash；半链不认证；原ID恢复；fence改变拒绝补提交 |
| X-06 回应不反灌 | AKN-03 | reply audience=user、父集合封闭；owner不收自己回复，用户未读不阻塞工作 |
| X-07 hook/notify竞态 | AKN-03 | 两种先后顺序、无ACK/已有reply、明确failure/unknown；exact receipt不伪造且有限退出 |
| X-08 历史身份 | AKN-03 | 提交时身份可核验；轮换后仍显示原generation，未提交者不得补成新身份 |
| X-09 路线不可执行 | 本轮文档/各包入口 | 本文即使状态Approved也无法整体投影；无合同、active marker或worktree副作用 |

AKN-01—03的真实证据沿同一个合法task、当前有界turn、同一条steer与P1反馈累积；更换subject或重新开turn要明确断开证据，不把多次独立fixture拼成一次真实贯通。

## 7. UI：默认监察，三类观察视图

首屏默认为Organization/Attention的**监察摘要**，包含：

1. **自动化运行摘要**：实际观察的scope、授权/准入情况、当前turn/controller、最近有效决定及证据时间、准确停止原因。
2. **需我处理**：user-owned正式决定、权限/预算边界、无法自动恢复的例外。只按真实事项计数；打开详情不等于解决。
3. **当前工作**：正在执行/审阅/修复/等依赖的task与exact Claim/attempt；没运行证据时说已领取/未知。
4. **Steer追踪**：我发了什么、哪个合法接收者收到、如何回应、相关结果证据；缺失阶段显式可见。

并列观察入口：Planning（要求、准备、依赖、批准边界）、Delivery（既有五列）、Organization/Attention（Engineer/Binding/能力/责任）。History为任务详情和来源浏览的次级入口，不抢占三视图结构。默认页不自动弹一排要求用户start/continue的按钮。

卡片的“下一步”只来自已存controller step、WorkEnvelope或正式work-package/decision记录；没有记录就显示未知。不能由前端/模型按阶段补写“接下来验证并发布”。`plan_missing/agent`与`plan_not_approved/user`分别显示。Agent可处理反馈、外部等待与人类决定不能混组。

详情共用task身份，串起目标→当前turn/Claim/Binding→steer与reply→feedback→diff/candidate→checks/acceptance/publication→历史。保留现有TaskDiff、草稿、焦点、IME、取消、storage与多标签保护。宽屏约720px覆盖式详情；窄窗全屏；正文14–16px、主要目标44px，沿用品牌tokens和reduced motion。新增复杂图布局不自动引入图库，Planning优先清晰列表/关系展开。

## 8. 数据与读取契约：解释自动化，不另建权威

### 8.1 新观察投影

由现有controller/campaign、grant/budget、runtime effect、Task/Lease、Engineer/Binding和消息reader产生以下read model。字段不是新状态机，无法读取则unknown/unavailable：

| 字段组 | 内容/来源 |
|---|---|
| `automation` | 实际mode、授权scope和expires、admission结果、controller/campaign/turn引用；预算来自原ledger |
| `last_decision` | 最近原生step receipt ID/digest、动作/typed原因、observed revision、observed_at；无记录为null |
| `progress_chain` | 上表各跳原生record refs、known/missing/unavailable与责任；不持久化第二progress状态 |
| `execution` | task/revision、Claim/generation、Binding、native run/attempt及已证实活动；通知时间另列 |
| `attention_entries` | 原生blocker/decision refs、user/agent/external owner、影响、允许的具名入口 |
| `steer_threads` | 原TaskMessageEvent+逐recipient receipt+认证reply+相关既有evidence refs；回执不能证明采纳正确 |
| `observation` | scope、source revisions、来源时间、read health、consistency、coverage、service epoch/sequence |

收窄全Fleet禁写仍采用目标context读回+原POST锁内授权，不删除现有registry/Claim fence。读取UI必须无领域副作用，不运行controller step或notification来“刷新”。

### 8.2 首批路由

保留已有snapshot/collaboration/diff/message；新增目标repository snapshot、task context、activity三个GET。**不单独增加“start automation”浏览器写路由。** repository scoped snapshot中增加automation摘要；collaboration复用组织/Planning读面；context/activity承接steer和证据，而不是每张卡片单独扇出请求。

activity精确message ID查询跨旧revision查存储事实；受限reply经authenticated Engineer MCP进入，非browser POST。所有新GET沿现有Host/Origin、registry/路径权限、deadline、取消、脱敏和typed errors。context source_ref只由服务器解析；不接受任意本机路径/Git ref。

Fleet placement修复和新browser schema分别升级实际protocol，当前基线Fleet4、Operator5；冻结每个切片时按语义变化升号，core/effects/IPC/DTO/decoder/scripts/fixtures同包切换。不把V1曾建议的5/6预留为已发布号，不做旧字段双读。

### 8.3 保留的技术修复

- placement穷尽五列/preparation/alternate/unclassified；正常准备不degraded；执行中任务不会因为offer不再eligible退回准备区；unknown组合明确异常。
- TaskOffer blocker code和owner直传；canonical已知总数=五列+准备+其他+不可分类；不可读repo的数量未知，孤立执行记录另列。
- 自动刷新仅是观察刷新。浏览器完成后30s再读、hidden暂停观察、visible立即读、失败有界退避；服务器同scope single-flight、全局provider预算、进程退出后才释放槽位；不创建第二永久watcher。
- epoch+generation隔离晚回包；各来源新鲜度独立；UI旧缓存不授权；草稿expected fence不随刷新改写。
- activity默认50/max100，扫描/字节/deadline上限与partial coverage可见；只读现有event/receipt，不调用deliver/ACK模拟用户已读，不加event store。
- oldURL优先canonical schema2持久ID与正式归档/commit/source ref；缺证据显示history_unavailable，不按标题/文件名猜任务。

以上保留项目是自动化监察所需的观察可靠性，不得以全部完成它们为由把AKN-01/02/03的执行和steer贯通继续推迟。

## 9. 新工作包与旧项处置

这是路线引用表，不是可执行清单。每包按真实merge/rollback/verification边界独立展开；本轮仅捕获AKN-00计划，后续项未创建合同。原work-package文件已迁出plans，本文无Artifact Level或Task Breakdown，现有投影器拒绝其生成合同。

| 新包 | 交付/文件owner | 独立验收与停止点 |
|---|---|---|
| AKN-00 宿主机执行准入合同与故障canary | 固定拓扑准入报告，复用`scripts/me2b-runtime-admission-canary.ts`与独立组合报告/测试；不改生产Campaign runtime；对象表和typed缺失结果 | AF-03/08/09/10；model-free拒绝与真实Host证明分开。无真实能力即runtime_not_admitted，后续写执行不得进入；不运行旧容器canary |
| AKN-01 单任务有界执行接线 | H0通过且§3.1真实入口事实通过后，`campaign-runtime.ts`、`campaign-worker.ts`、`scripts/contract-run.ts`及对应投影；旧active执行路径一次cutover；复用parent turn | 一项获批task自主acquire/execute/verify/publication；关闭浏览器继续；原grant预算/expiry；无额外手动start；exact-native terminal/独立验收 |
| AKN-02 授权内反馈循环与停止 | `campaign-acquisition.ts`、`campaign-closeout.ts`、原publication feedback/attempt/budget owner；`auto-campaign` SOP明确消费typed结果 | AF-06/07/08；P1反馈→same-owner reopen→C2/V2/P2；按§3.2有界等待和准确停止；不自动下一组。不要将generic read-only controller改成第二writable scheduler |
| AKN-03 Steer消费、认证reply与同场景证据 | `task-inbox.ts`、`task-inbox-handler.ts`、runtime effects、Engineer principal/ClaimActorReceipt、受限consume/ACK/reply effect/MCP与exact control_ref接线；复用现有in_reply_to | ST-01–10与接缝X-04–X-08，加AF-01/02纵向真实Host场景。补通知exact receipt、hook_session不作effect证明；ACK不是采纳；越权/旧Binding/旧Claim拒绝 |
| AKN-04 监察读模型与投影修复 | Fleet/Operator core/effects、collaboration readers、scoped snapshot/context/activity；placement/reasons/attention/source coverage | OB-01–04；解释“为什么没动”的每一跳，unknown不猜；user/agent/external归属；原A01–A08补证 |
| AKN-05 监察首页与三观察视图 | `App.tsx`、`TaskDiff.tsx`、types/i18n/styles、按职责抽取summary/attention/steer/taskpane/query；首屏运行摘要而非五列 | 默认监察、Planning/Delivery/Organization同一事实；steer回执显著；键盘/IME/窄窗/草稿保护 |
| AKN-06 刷新、审阅与历史恢复 | 既有server collector IPC/single-flight、epoch、TaskDiff evidence、bounded history/source readers | OB-05–07；只刷新观察不驱动执行；旧head/base/contract失效；归档无关联不伪造 |
| AKN-07 同包真实旅程与发布证据 | `scripts/check-tarball-install-smoke.sh`、真实安装包浏览器+同一已准入Host canary、文档/验收record | OB-08及AF/ST全集追溯；声明准确支持模式；无真人逐任务机械操作；不自动关闭BRC14/15或启guarded merge |

AKN-00独立Draft：[AKN-00：固定原生执行路径准入与故障证据](../../plans/plan-20260921-1946-akn00-native-execution-admission.md)。

### 2026-09-24 实施状态读回

本表更新交付事实，不改变 Revision 3 的产品目标或权限边界。历史基线与原 canary 仅覆盖各自 subject。

| 包 | 当前交付与剩余边界 |
|---|---|
| AKN-00 | 已交付固定路径拒绝报告；[0.156.1 只读能力复核](20260921-akn00-native-execution-admission.md)发现静态 sandbox 接口，但缺所选拓扑的认证 principal/epoch、动态撤销、完整停止与原 effect 查询证据。H0 未成立，不新增假 probe；0.154.0 旧 subject 不适用 |
| AKN-01 / AKN-02 | 未开始；仍需 H0 与 §3.1 的真实 Campaign 前置链，policy off 不变 |
| AKN-03 | reply 协议与受保护持久化已合入；03c exact notify receipt / bounded reconciliation 正在独立收口。真实 Host consume/同 turn steer 尚未证明 |
| AKN-04 / AKN-05 / AKN-06 | 监察、三视图、刷新与历史层已合入（#439、#447）；不抵扣 AF/ST 真实执行验收 |
| AKN-07 | 未开始；需要已准入 Host、同场景真实执行与安装包证据 |

AF-01 的零人工机械操作和真实 steer 消费仍未证明。不得把监察层合入解释为“Agent 可自动推进”；本轮也未选择长期降级为仅监察或批准新准入拓扑。

AKN-00产物必须包括明确admission裁决，不因没有可用Host就转而把UI发布成已完成自动化。AKN-01–03是P0纵向证明，最小文本/CLI观察即可验收；AKN-04–07完善人类监察。发布依赖按H0→native真实执行→纵向闭环→产品声明；开发许可则允许独立批准的只读修复、协议/恢复负例和blocked观察在H0之前进行。执行与steer未知时不能冻结假的“运行中/已采纳”UI。

旧项迁移：KBN-00包诊断→AKN-07；KBN-01 placement→AKN-04；KBN-02 scope→AKN-04；KBN-03 refresh→AKN-06；KBN-04五列/Attention→AKN-05且默认首页改变；KBN-05消息回执→AKN-03的真实消费与AKN-04的只读投影；KBN-06历史/审阅→AKN-06；KBN-07发布→AKN-07。原研究稿§13的KBN-A01–A08/B01–B07/C01–C07/D01–D08共30项作为辅助回归引用，新增28项AF/ST/OB覆盖纠正后的核心目标。其中KBN-A04的“不被自动领取”仅限定页面GET不触发acquire，执行侧是否可领取仍由既有工作流决定；KBN-A05改为显示“eligible但未有运行证据及缺失环节”，不再默认给人类开始按钮。其余技术oracle保留，不能把30项辅助回归当作本产品完整验收。

## 10. 文件与抽象约束

跨超过8个文件，涉及执行安全、通信身份、观察三种不同风险边界，不能作为单一UI重构提交。复用owner如下：

| 责任 | 优先复用 |
|---|---|
| 固定路径Host admission | `scripts/me2b-runtime-admission-canary.ts`及AKN-00的只读组合报告；不改生产执行 |
| Native Campaign集成 | `src/core/automation/campaign-runtime.ts`、`src/effects/automation/campaign-runtime.ts`、`campaign-worker.ts`、`scripts/contract-run.ts`；属于AKN-01 |
| 有界turn与反馈/预算 | `assets/skills/auto-campaign/`、`src/effects/automation/campaign-acquisition.ts`、`campaign-closeout.ts`、既有budget/attempt/publication模块 |
| Durable steer与reply | `src/core/fleet/task-message.ts`、`src/effects/fleet/task-inbox.ts`、`src/cli/hook/task-inbox-handler.ts`、`src/cli/mcp/engineer-tools.ts`、ClaimActorReceipt/principal readers |
| 真实notify/wake | `src/core/engineers/agent-runtime-effect.ts`、`src/effects/engineers/agent-runtime-effect-store.ts`与现有adapters |
| 正式决定 | `src/core/engineers/verified-context.ts`及其现有decision effects；不新建聊天审批协议 |
| 监察投影与UI | 现有Fleet/Operator/collaboration/Engineering Overlay；App/types/TaskDiff/i18n/styles与现有tests |
| 文档 | `docs/spec.md`、现有Engineer控制面PRD、Operator设计/仓库scope说明、auto-campaign执行说明；不改历史批准记录伪装先前已有能力 |

新增文件仅为固定路径native admission报告/测试、受限reply effect/test及确有独立边界的context/activity reader或UI职责抽取；在各包contract列出具体路径和“现有owner不能承接”的理由。优先同文件增量，不因为计划列出组件名就一律新建。不得加入通用Provider路由框架、第二journal或持久化Kanban状态。必要schema cutover须移除旧authoring路径，archive只读不作fallback。

架构变更通过现有archctx ChangeSet和projection，按实际跨模块依赖解释；不凭目录数量新造capability。此轮只有计划文档，不改模型或源码。

## 11. 验证与证据预算

实际执行命令在各包contract的唯一JSON Verification Plan中登记。按冻结subject、cwd、toolchain、环境和descriptor复用证据；不运行一个大suite替代各边界oracle。容器runtime/live测试不属于native目标的验收命令，不因已有测试名而运行被禁止执行基底。

现存可复用聚焦owner（按实际改动选择，非要求一次全跑）：

```bash
bun test tests/unit/development-campaign-core.test.ts tests/unit/development-campaign-policy.test.ts --timeout 60000
bun test tests/effects/campaign-acquisition.test.ts tests/effects/campaign-worker.test.ts tests/effects/campaign-closeout.test.ts --timeout 60000
bun test tests/unit/issue-279-automation-controller-core.test.ts tests/unit/issue-279-automation-controller-run.test.ts --timeout 60000
bun test tests/unit/r1-provider-neutral-agent-runtime.test.ts tests/unit/r1-agent-runtime-adapters.test.ts --timeout 60000
bun test tests/effects/task-inbox.test.ts tests/task-inbox-hook.test.ts tests/unit/task-message-v1.test.ts tests/cli/fleet-task-inbox.test.ts --timeout 60000
bun test tests/unit/me1c-module-message.test.ts tests/unit/me1c-module-inbox.test.ts tests/unit/me4a-bound-task-freeze-handoff.test.ts tests/unit/me2c-verified-evidence-context.test.ts tests/cli/verified-context.test.ts --timeout 60000
bun test tests/unit/fleet-board.test.ts tests/effects/fleet-board.test.ts tests/unit/operator-fleet-snapshot.test.ts tests/unit/operator-web-types.test.ts --timeout 60000
bun test tests/effects/operator-task-message.test.ts tests/effects/operator-write-boundary.test.ts tests/effects/operator-task-diff.test.ts tests/cli/operator-serve.test.ts --timeout 60000
bun test tests/operator-web/operator-ui.test.tsx tests/operator-web/operator-interactions.test.tsx tests/operator-web/operator-collaboration.test.tsx tests/operator-web/operator-task-diff.test.tsx --timeout 60000
bun run check:type
bun run build:operator-web
```

新增test只补现有缺口：native admission的真实安全/终止边界、authenticated owner consume/ACK/reply、真实turn的exact effect关联、跨真实Host的自动推进+steer composition。现有`r1-provider-neutral-agent-runtime`中hook_session不能证明runtime effect的负例必须保持；新增冒充sender、父消息/recipient不符、旧Binding、重复reply和先hook后notify竞态。没有运行Host effect的测试不标成live canary。所有可变HOME/registry/repos/provider state隔离；同样保留根AGENTS的hooks/helpers/reference-configs、deploy SQL、architecture/task sync、strict workflow、project-state和init dry-run检查。外部CI/release gates保持原要求。

真实canary前固定repo/task/Host版本、允许的provider/模型、授权范围、expiry、预算与外部操作；该批准不能从“修改方案”推导。大于10分钟的单次验证先说明成本与必要性；一次issue最多三轮fix/reverify；不恢复之前停止的campaign或扩大旧grant。

证据至少含：初始批准/准入、target SHA、package/Host/profile digest、原grant及预算前后、task/Claim/Binding/dispatch、实际Host调用、steer event/receipt/reply、一次反馈与修复、candidate与独立验收、Publication/停止事实、浏览器关闭/重开时间线。真实provider与mock分开，源记录与UI截图分开，已安装tarball与源码模式分开。

产品指标：授权内正常机械步骤的人工次数=0；每条人类steer能查存储/接收/回应/证据或明确缺口；每次停止有具名原因与责任；没有假运行、假采纳、旧证据假通过；达到人类边界时证据完整。采集/渲染性能仍测20/200/1000任务，但这是观察层指标，不是自动化成功指标。

## 12. 发布、回滚与未闭环边界

- H0失败：保留policy off及准确blocked事实；不启native writable，不恢复容器，不以UI改进宣称整体交付。
- Native切换：只在exact Host admission与领域合同批准后；服务端验证、CLI/IPC/runtime receipt consumer同包切换，不长期双读/双写；旧effect不擅自重新执行。
- 消息：尽量保持现有event schema，新增受限reply通路回滚后原消息仍可读；任何新增协议须在该包说明旧版读取与rollback边界，不能删除通信记录。
- UI/读取：server、browser bundle和相应protocol一起回滚；GET不驱动执行，所以浏览器回滚不重启Agent、不修改Lease。
- 运行中回滚：先按领域停止/等待合法安全边界并证明inactive或保留reconciliation_required；不得用恢复旧包掩盖仍运行的新effect。
- 本期不启guarded merge、不自动下一组，不将单任务canary等同BRC14/BRC15 acceptance。后者按`tasks/todos.md`原条目逐项补实际证据，由原验收机制决定是否收口。

**下一刀为 AKN-03c 的 source-level 协议收口。** 入口为 `plans/plan-20260922-0301-akn03-notify-reconciliation.md` 对应工作分支的 source/projection/verification/acceptance；其 Host dispatch 仍不在此包内。H0 在 0.156.1 只读复核后继续阻塞真实自动推进；待 Host 提供缺失证据接口，或获批重新冻结准入拓扑后，再展开完整 probe。AKN-01 仍另需合法 Campaign 前置事实与 native consumer 集成验收。

## 13. 本轮文档验证记录

2026-09-21在临时目录、隔离HOME运行当前`scripts/plan-to-todo.sh`的两条负例：①本文副本仅改Status=Approved，因缺执行Evidence Contract被拒绝；②另复制AKN-00的完整Evidence/Promotion Gate以走到后续门槛，仍因缺`Artifact Level: work-package`被拒绝。两次均exit非零，没有生成tasks、active marker、worktree或修改fixture文件。第二条证明拒绝不只依赖Draft状态，也不只依赖前置章节缺失。

结构检查确认原28项AF/ST/OB保留并新增9项接缝oracle；仅AKN-00拥有work-package头和4项执行清单。task-sync判定本轮无substantive产品变更，strict workflow通过。本轮没有运行产品行为测试、Host admission canary或Campaign；这些计划内场景不标作已通过。
