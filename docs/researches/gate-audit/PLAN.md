# 一个 PR 拆完 + 兜底机制

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

> 状态：#483 源码实施完成，等待用户审阅Draft。当前请求已批准代码与SOP精简，global prompts最后备份再改；PR保持Draft，不合并、不发布、不执行生产操作或清理其他worktree。分类依据是Aimpact 05:14批准的四道硬门禁标准，代码基线 `cc1fc8ee`。本文件不伪装为已执行的contract或AcceptanceReceipt。

## 目标与完成条件

在一个可整体回滚的后续implementation PR中移除当前按编辑、规划、审阅、结束、归档等步骤设置的常驻许可，替换为四个真实副作用边界。只用现有CLI/Core/Effects分层、check执行器、GitHub CI、shared lock/Lease与publication feedback实现，不新增通用workflow引擎、第二套check ledger、权限fallback或常驻服务。

“一个 PR”指下面主线cutover的代码、投影、迁移、验收与兜底一并落地，不是逐个guard拆成许多审批PR；旧cross-review/旧evals-checks p4有另一owner与PR，标为**拆除中**，这里只迁移它落地后剩余的真实消费者。两PR不得重复删除同一文件，也不能留下两个权威。

完成必须同时满足：

1. 普通可回滚编辑、commit/push、结束回合、归档不因plan/review/receipt/工件齐套而等待用户或模型gatekeeper；诚实报告缺失验证。
2. main merge仅消费一次当前candidate的typecheck和受影响测试；失败、未知check结果、错误HEAD/base、冲突拒绝合并。模型可以自动合并；每天报告已合并PR、merge/parent SHA、回滚命令及未解决失败。
3. 删除只自动作用于已合并、干净、无活跃runtime/owner且identity未变的worktree/branch；其他删除仍用户决定。
4. 凭据、权限、sandbox、hook trust、MCP write grant、skip-permission/confirmation设置改变需用户批准精确diff；发布、生产操作需用户批准精确artifact/操作。不得拿自动绿色检查或rollback 记录代替这些批准。
5. 每日全量、自动修复任务与真实孤儿回收已可执行并有失败路径；重试幂等，活锁/未知状态不被误删。
6. source、模板、installed helper接口、指南、CI与architecture/task投影一起切换；无旧enforce路径、旧alias、双写/双读、伪造成功或隐藏失败。

## P1：实施范围与归属

| 面 | 入口 | 一个PR中的改动 | 保留的真正不变量 |
|---|---|---|---|
| risk / readiness authority | `src/core/workflow/{profile,artifact-requirement-policy,operation-readiness}.ts`；`src/core/state/` | 按实际风险选择coverage/按需review；删除edit/stop/ship阶段的工件齐套许可 | 一个risk authority，未知事实显式报错，不重新猜authoritative值 |
| hooks | `src/cli/hook/{mutation-guard,prompt-handler,subagent-handler,stop-handler,circuit-breaker}.ts` | inventory G01–G24逐项拆enforce；保留context/observation/bounded recovery/任务scope文本 | H03私密/权限边界、真实共享写入fencing、缺失/过期证据不能声称通过 |
| checks / evidence | `scripts/check-ci.sh`、`scripts/verify-{contract,sprint}.sh`；`src/effects/evidence/`；`.github/workflows/ci.yml` | C01–C33的执行统一到一次typecheck+受影响测试；聚合与收口只消费；全量移到每日 | exact subject、check inputs、toolchain、exit、duration、log来源，failed不能被旧pass遮盖 |
| review / acceptance | `agents/fleet/gatekeeper.md`、`src/effects/review/generic-review.ts`、`scripts/acceptance-receipt.ts` | R01–R06强制review/waiver/receipt链取消；R11/R12保留真实产品/architecture事实，取消独立步骤审批；只为被风险选中的review保留typed事实 | reviewer不自行重跑，不能伪造模型身份/receipt；sandbox按H03 |
| publication / closeout | `scripts/merge-gate.ts`、`scripts/{contract-worktree,ship-worktrees,archive-workflow}.sh`；`src/core/publication/merge-readiness.ts` | R07–R10简化main自动检查消费、commit 边界与日报；archive/drift自动恢复不前置审批 | immutable PR/head/base、target clean、CAS、泄漏检测、已发生effect不重复执行 |
| locks / Lease | `src/effects/locking/exclusive-directory-lock.ts`、`src/effects/expensive-run-lock.ts`、`src/effects/state/coordination-lease-{store,reclaim}.ts`；closeout journal | L01–L10自动reclaim/reconcile与有界资源调度；删除手工解锁仪式 | atomic writer、token/generation/inode fences、live owner保护、exact effect阶段 |
| install / MCP / browser / security | `src/effects/fs-transaction.ts`、`src/cli/mcp/`、`src/cli/chatgpt-browser/`、`src/effects/review/review-isolation.ts` | 权限/secret scan归H03；安装原子事务保持；能力不可用只报告该能力 | path confinement、认证授权、prompt egress秘密保护、rollback digest，禁止为提速fail-open |
| projections / instructions | `scripts/`作为packaged helper唯一执行authority（下游`assets/templates`冻结）；`assets/hooks/`；`assets/reference-configs/`→`docs/reference-configs/`；root agent docs/policy | 一次更新并跑projection drift；tasks投影/architecture语义反映最终行为 | authoring来源单一；不得手改生成文档绕过model/provider |

本inventory检查了9个eval fixture package根、capability list与semantic文档，当前umbrella不需要因package数量被拆成9个能力。旧cross-review semantic selector属于p4 owner的迁移面，本PR仅在真实责任改变时通过archctx ChangeSet/projection更新必要模型；不因盘点而增节点。

## P2：目标交付路径

用户目标 → agent实施可回滚改动 → 冻结最终candidate与coverage → 唯一执行者产生typecheck+受影响测试 →风险触发时读取同一证据做跨模型review →main合并检查消费当前candidate证据 →模型squash merge →记录 commit 边界与日报。恢复/归档/architecture drift跟随effect异步收敛；既有状态失效不能触发“请再批准一个步骤”。

删除走H02谓词；host权限/credential change走H03；外部发布与生产写走H04。这三条不能借“普通代码改动”分类自动放行。安全/权限改动还须相关边界测试和按需cross-model review，但review意见本身不能取代用户授权。

## P3：最小决策与取舍

将常驻审批集中到真实effect，保留现成原子性/安全校验。merge前不跑每改动全量，接受无关区域回归可能到每日才暴露，以每日红灯自动修复任务、code revert与失败可见性兜底。10倍负载首先影响daily全量调度和provider review队列，应用并发限流与有界重试，不新增审批层。失去锁fencing会先造成双owner/坏状态，所以不删互斥。

“只验证一次”针对冻结后的同一改动、同一输入与check集合；实现期debug不是重复验收。真实新增输入/failed修复可以产生新一次必要验证，但收口、review、finish、ship不能为了自己的名义复跑相同命令。每日全量是一次固定main快照的独立周期验证，不是每个PR补跑全量。

## 执行顺序：一个原子cutover

1. **冻结消费者与事实。** 在最新origin/main新implementation worktree，记录base、p4已落地状态、active owners/Lease、transaction phase与当前branch protection。逐行inventory追live consumer（CLI/Hook/MCP/Skill/source/helper/docs/CI）；历史文件只标旧行为。禁止去另一PR的worktree“补删”。当前仓库的workflow可有适用scope约束，implementation author先冻结精确Allowed Paths和一次Verification Plan，随后不靠不断扩大scope推进。
2. **先实现兜底再移除阻断。** 用现成check executor/records让merge消费者只读；CI加每日全量与失败dispatch；锁内exact reclaim；合并后 commit 日报与回滚 fixture。不是发布几个半拆版本：这些与删除都留在同一PR，最终一起验证。
3. **同PR移除流程闸。** 删除inventory标“删除”的enforce owner及对应必填工件/alias；“降级”项返回typed observation，不能保留隐藏的nonzero/`decision:block`或required-review approval。scope、type/test、secret、path、写入权限/互斥保留为四个边界组成或runtime不变量。更新protected helper与readiness，不用`--skip-*`绕旧gate作为永久实现。
4. **迁移现有活状态。** 删除的是实现/阻断规则，不是证据、dirty worktree或未合并branch。已存在grant/receipt/log作为历史事实保留；active review/closeout按真实phase完成或停下该effect，不重发外部merge/push。仅显式one-shot迁移，失败不合成missing authority，不留steady-state兼容parser。campaign drain与旧eval删除不扩大到本PR。
5. **投影与说明一次完成。** 保留冻结的下游templates，packaged helper直接执行scripts；同步reference投影；model责任改变才通过archctx plan/apply和projection同步；更新root agent instructions、policy以及tasks状态，归档fulfilled artifacts。不能只把policy设off而让installed runtime或另一个host继续enforce。
6. **冻结最终候选并验证一次。** 唯一执行owner跑typecheck+影响面测试，输出canonical证据；merge/review/finish只验身份与结果。下面acceptance scenarios覆盖跨模块联动；当前旧required checks仍以适用政策执行一次，PR同时更新其未来执行职责。没有全量double-run，日测workflow以短真实fixture证明调度/聚合，不拿dry-run冒充真实全量效果。
7. **模型合main，保留可回滚切面。** exact checks绿且无冲突由模型squash merge；PR 包含 merge/parent SHA 和日报路径。涉及H03设置的精确更改及H04生产执行分别遵守用户批。此次docs Draft不在此步自行Ready/merge/发布。

## main检查与证据复用

当前远端main protection只要求`Required / CI`（读取API时`strict=false`、未见required review count）；因此repo里的复杂审阅/receipt步骤与remote保护不是同一权威。未来切换保留同一required context，context只由可信CI对当前candidate声明成功。禁止因为本地log或caller可写JSON就向GitHub报告PASS。

优先让现成hosted CI成为最终一次执行owner，local实施期跑必要debug；最终冻结后不再local全套+hosted全套各跑一次。CI选择typecheck+受影响测试，其他consumer只验run/check身份与freshness。影响面来自完整changed paths与真实消费者，未知影响面自动扩大相关测试；不自动恢复“所有PR都全量”。大改动/权限/安全/模型不确定触发审阅，仍消费同一证据。

main/head移动后，重算候选subject；对确实新增/改变的check输入验证delta，未变输入的可复用证据按已有evidence机制校验。不能声称旧branch通过等于新merge subject通过。候选存在冲突先修复，不能绕branch protection；未知测试结果不能当skip-pass。

## 合并 commit 边界与一条回滚命令

2026-10-05 起，回滚使用 GitHub 提供的 merge SHA 和 parent SHA。日报记录 PR number、合并前 SHA、合并后 SHA 和回滚命令。不再创建或检查回滚 tags。

readiness 保留固定 base 上的 reporter 适用范围。文件明确不存在时，该范围不启用。reporter 已存在时，GitHub 必须返回一个精确匹配当前 main base 的已合并 PR。对应 commit 必须只有一个 parent。PR detail 必须匹配 PR number、merged state、main base 和 merge SHA。GitHub 返回的 PR `commits` 必须等于 1。两个 SHA 必须完整、非零且不同。缺失、错误、分页不完整或 API 不可用时，继续拒绝合并。

merge SHA 和 parent SHA 来自 provider readback。不得从时间、branch 名、tag 或本地规则补值。CI/head/base、review、thread、身份重读和原有授权检查保持有效。

模型自动发布仍使用 squash merge。一条 commit 的 parent 关系只证明 commit 边界。reporter 和 readiness 只接受只有一个 commit 的 PR。多 commit rebase PR、缺失或错误的 commit count 都会明确报错。该限制也适用于多 commit squash PR。provider 未提供 merge method 证明时，不推断完整 PR 的回滚范围。

在从最新 main 创建的干净 rollback branch 上，执行：

```bash
git revert --no-edit <MERGE_SHA>
```

随后 push rollback branch，开回滚 PR，并验证受影响行为。不得 reset 或 force-push main。该命令只逆向 code commit。生产数据库、registry 版本和 host 授权仍由各自 owner 恢复，并保留 H03/H04 批准边界。

只生成已确认 commit 边界的报告。报告失败可以重试读取和 repair issue 投递，但不能重放已发生的 merge。部署新 reader/writer 并确认旧 reporter jobs 已结束后，可以准备历史回滚 tags 的清理方案。删除历史 `gate-cutover-pr-*` tags 必须取得 Aimpact 的明确批准。该删除不是自动操作。删除前，必须把旧日报和 repair issues 中的 tag 回滚命令转为精确 SHA。

## 每日全量与自动修复任务

- 用现有`.github/workflows/ci.yml`增加固定UTC `schedule`（例如每日19:00 UTC，即次日03:00 SGT），pin该次main SHA；每日lane独立运行完整tests、governance、MCP平台matrix和package/install smoke。expensive真实provider评测不因移到daily而成为每日默认，p4已拆除的旧评测不复活。
- 固定main快照和toolchain/依赖安装，reuse同一tarball给该run的install consumers。每日运行不是同一个PR再验一遍；PR workflow不会包含full-suite必跑条件。manual dispatch仍可显式跑全量，日志清楚标失败/超时/partial，不省略skip。
- 利用已有`src/effects/publication/{feedback,feedback-store}.ts`的结构化失败/repair proof思想与GitHub workflow，给每日run/check失败建立一个普通repair Task/issue，绑定SHA、run URL、failing check ID、去敏日志与owner。以run/check identity去重，重投不会双派；权限不够创建issue则报告typed failure并保留待投递记录，不宣称开任务成功。
- 修复runner可定位原因、开分支/PR并跑受影响测试；遇credential/permission setting change返回H03，发布生产返回H04。失败属于环境/flake仍开可定位任务，不能改测试判据制造绿色。修复后不自动触发另一轮全量作PR前置，次日日测验证全局；确有不同输入的必要专项run另记录原因。
- 日报自动生成可查看artifact/既有report surface，列合并、before/after SHA 与 revert 命令、当日日测subject/result、自动repair任务、待批准的H02/H03/H04动作；不增Slack/email等外部发送渠道。若既有通知渠道已被user授权，可用该渠道，否则只生成报告。
- 每日未启动/取消/超出既有deadline也计未完成并派运营修复；连续失败不静默。相关失败影响当前候选就进入H01；无关历史失败保留日报与修复任务，不把整个开发重新冻结成全量门禁。

## 孤儿锁与租约自动回收

现有generic directory lock默认wait5s、stale空目录30s；Task Lease已有`automaticReclaimLease`。昂贵lane明确`reclaimStaleOwner:false`：owner PID死不证明detached子进程全死。closeout journal与Lease也不能按mtime统一删除。

| 对象 | 自动回收充分条件 | 未充分时 | 复用入口 |
|---|---|---|---|
| 普通directory/task/backlog锁 | 同host owner确死，token/inode与目录identity在锁内二次观察未变；stale empty shape符合既有policy | live/unknown不回收，有限退避并记录；不让人手动删目录当日常流程 | `exclusive-directory-lock.ts`、`coordination-lease-store.ts` |
| expensive-run锁 | 上述条件 + durable supervisor/PGID明确整个owned process group drained，原writer不能再写 | 只暂停这个昂贵lane，自动探测/清理owned group，未知不放开 | `expensive-run-lock.ts`、existing process supervisor |
| Task Lease | exact task revision/claim/generation/renewal/evidence绑定，liveness条件满足，publication不处于completing/reviewing，锁内重查仍reclaimable | unknown schema/source保留并报修；不以heartbeat超时或PID单项作结论 | `coordination-lease-reclaim.ts` |
| closeout claim / journal | owner退出、key/target/effect阶段可证；publication之前abort，已publication之后reconcile；CAS仍匹配 | provider不可读/phase未知只保留journal与报警，不重放merge/push | `contract-worktree.sh recover`既有phase机制 |
| publication/report/notification recovery | 读回外部effect和幂等key，再补缺失的local state/report | 外部状态不明保持pending，自动重试有界 | existing publication store与feedback |

回收的是expired ownership/lock，并非未经批准删除工作成果；worktree/branch内容删除仍走H02。锁内token/generation提升保证被回收owner复活也不能写旧generation。零等待证明失败、symlink、PID复用/remote host未知不会被当孤儿。

## 一次最终验收的场景

扩展现有focused测试与真实短进程fixtures，不创每个gate一份test/report文档。覆盖：

- 普通edit、Done/Stop、缺plan/review/receipt/architecture provider不可用可记录并继续；四个boundary与安全runtime refusals的组合仍拒绝违规effect。
- exact-head绿检查自动允许merge；failed/pending/forged/wrong subject禁止；head/base移动与真实delta重验证；draft→可合并必须已执行检查。消费者没有第二次spawn相同check的可观察证据。
- 已合并干净树可自动cleanup；dirty/untracked/unmerged/live owner/identity changed保持内容并转用户决策；squash-absorbed判定走现成单一predicate。
- 凭据/权限/skip-confirm设置未经授权不执行；秘密不进入commit/外部prompt，sandbox/MCP未知授权fail closed；发布准备与实际生产effect分开授权。
- daily failure真实生成可读取的单一repair任务；dispatch失败、cancel、timeout不伪称成功；日报可读并含 SHA/revert；重试不双派。
- 两个OS caller竞争锁、owner crash与TERM-resistant descendant、fresh/live/unknown lease、reclaim期间generation改变、publication前后crash恢复；只回收真孤儿，不重复外部effect。
- 真实 SHA revert 在临时 repo 中恢复之前的 tree。main 不改写历史。报告中断后重新读取 provider，不重复 merge。

## 风险、回滚与不扩项

| 已知风险 | 兜底 / 回滚 |
|---|---|
| 移除全量PR gate后未受影响测试漏回归 | 每日pin-main全量 + 单一repair任务；相关失败自动code revert，不靠人工放行复跑全量 |
| 影响面选择不完整 | complete diff/真实消费者选择，unknown扩大相关风险测试；不以文件后缀代替行为归属 |
| local evidence冒充可信CI / stale base | 可信executor、exact subject/readback/CAS；无证据拒绝main effect，普通编辑可继续 |
| 只有policy关掉，helper/host/投影仍旧gate | 同PR迁移真实消费者、projection检查与组合fixture；失败按 after SHA 逆向该 cutover |
| orphan误删、旧owner复活 | lock内二次观察、PGID drain、nonce/generation fencing；unknown只记录，不宽松TTL |
| 强制review取消后漏语义缺陷 | 大改动、安全权限、模型不确定按需跨模型审阅；已有3个gatekeeper修正样本说明能力仍值得使用 |
| 删除未合并成果或生产不可逆操作 | H02/H03/H04独立批准；不拿回滚记录替代审批，不自动撤销credential/数据库写 |
| p4并行删除产生消费者冲突 | rebase最新main、按实际剩余源码迁移；不触碰其独立删除面，不加兼容alias |

不做新agent平台、generalized policy DSL、跨项目服务、通用日志系统、自动生产发布、清空historical evidence或清理其他人的worktree。新实现文件只在现有owner不能承载实际effect时加入，并说明至少一个真实消费者与不可替代责任；依赖优先Bun/Node标准库和已有包，不引入新依赖来包装Git/CI/锁。

## 当前实施边界

按补充保留archctx文档/model，skill文件只出表不修改；p4已先merge origin/main。当前验证采用所选typecheck与受影响tests，无Gatekeeper/13项或全量。锁回收仅限取得充分proof的POSIX注册组和有完整runtime/parent证据的Lease；unknown/Windows缺proof不强解锁。实现没有新依赖；新增CI reporter workflow/script与其真实Git/issue失败fixture各有明确consumer，未建立第二验证引擎或调度服务。Global prompt备份、diff和最终head/测试结果在交付时记录。

## 当前验证记录

本地最终 typecheck 已通过；主线程所选16个行为/安全文件为122pass/0fail。影响面补查发现的旧archive/lifecycle断言已迁移；保留真实crash/CAS/无重复外部effect断言的完整closeout-journal文件为24pass/0fail。旧失败日志保留为调查过程，不算当前通过。锁、Lease、CI报告、可信provider与tag读回使用真实进程/Git和隔离API fixtures验证，未执行远端daily、生产或原生Windows。
