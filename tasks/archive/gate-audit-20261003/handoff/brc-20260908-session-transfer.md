# BRC session handoff — 2026-09-08

## 新 session 第一条指令

继续完成 repo-harness 剩余 BRC。先读本文件和当前 AGENTS.md，再核对各 worktree；不要从 main 的 stale current.md 推断没有工作。用户已多次批准实施和继续推进；本次只是主动换 session，不是撤销授权。保留所有 WIP，不自动新增 GPT 调用、预算或 release。下一步先修订当前 provider-evidence plan，使其遵循最新默认模型要求，再完成实现和相称验证。

## 最新用户要求（优先于旧方案）

- 用户配置一次模型，之后按默认运行；不允许 agent 自动选型，不再硬编码 GPT-5.5 Pro，也不要擅自改成某个 GPT6 ID。
- 现有 ChatGPT Profile13 的 active UI choice 是可复用默认；probe 实际 UI 为 6 Pro。Oracle requestedModel 仍可能显示自身默认 5.5，不能当成实际选型证据。
- `current` 未观测/未验证不可标成 verified。显示 label、配置请求、实际观测、Pro effort、exact backend model 与 Connector exact-SHA 是不同边界。
- BRC6a owner 已完成获批探针，不再自动重跑。不得以“缺 producer”草率把应由自己实现的接线永久推回用户；但不能伪造 receipt 或静默替换 Oracle 为 Responses API。

## 刚核对的仓库状态

main/origin/main = 33c5012e1185a695fdaf54a7bb84fc613cfb653b（本地 tracking ref；本轮未 fetch）。main 有独立 readiness WIP，禁止混入：
- src/core/state/project-effective-state.ts
- src/core/workflow/operation-readiness.ts
- tasks/lessons.md
- tests/state/project-effective-state.test.ts
- untracked docs/researches/2026-09-07-approved-plan-edit-readiness.md
- untracked plans/plan-20260907-approved-plan-edit-readiness.md

上述 plan 记载用户授权的 AiphaBee edit readiness 修复、59 focused tests、本地安装验证；仍未提交。不要回滚、隐藏或代为归档。canonical contract-worktree finish 拒绝 dirty target，故下述 alignment 包使用 --no-merge 完成。本轮没有 push、PR、release 或待跟进 CI。

## 已完成但未集成：authoring / snapshot alignment

Worktree: /Users/ancienttwo/Projects/repo-harness-wt-brc15a-adoption-alignment
Branch: codex/brc15a-adoption-alignment
HEAD: 1f9be5cb，clean。
提交链：fcb84a52 → bb5ada2f → 640773cc → 1f9be5cb。

实际 delta：
- issue-batch-reconcile.ts 提供现有 metadata 的 authoring schema：priority integer 0–100、closed fields、sorted/unique arrays、slot 和 exact capability vocabulary。
- 新 campaign-capability-registry.ts 为 authoring/adoption 共用冻结 revision 的 ArchContext registry 读取；dirty working bytes 不作 authority，缺/空 registry 在 intent/provider reservation 前拒绝。
- initial/fill/edit prompt 都携带上述消费契约；不宽松解析 P1 或 capability alias。
- campaign start 前拒绝 issue_numbers 不完整快照策略；既有 labels 路径完整分页，批次选择仍由 marker 掌权。原 canary target/grant 未改。
- 同步 effect/store/CLI fixtures，保留 completed answer + provider ID 仍不能证明模型的 negative browser assertion。
- 没有实现 model verification producer；按当时批准计划记录缺口，继续保持 false。

验证：首轮 prepare run-20260908T015705-80673 为22/22；补 CLI fixture 后 final prepare run-20260908T020027-17721 为23/23，复用两个 immutable test baselines，仅重跑 CLI delta、type和6 integrity。另 BRC0 unmapped protected inventory 1/1通过。
基线 executions: vx-cf050bbf5fdd49e4a781（authoring），vx-c81ba300efce4450a093（affected tests）。没有 full suite/GPT。
一次只读 Codex 边界验收完成；actor 参数首次不合法被拒，最终省略actor后正确记录 external_pass / Codex / codex-review。
Receipt subject: sha256:faa0db9ca02d868b9d40c55d805877f8f5aa43f4261cf6c676c395882c16a6b3，target33c5012e。
verify-sprint finalize未重跑测试；canonical finish --no-merge 已归档完成。不要重复 external review。

入口：docs/researches/20260908-brc15a-adoption-alignment.md
归档：tasks/archive/{contract,review,notes}-20260908-0205-brc15a-adoption-alignment.md
计划：plans/archive/plan-20260908-0143-brc15a-adoption-alignment.md
红测：tasks/reviews/20260908-0143-brc15a-adoption-alignment.pre-fix.log
日志：/tmp/brc15a-alignment-{prepare,prepare-final,verify-final,finish}.log，/tmp/brc15a-alignment-acceptance.json。

## 当前执行包：provider verification evidence（尚未实现）

Worktree: /Users/ancienttwo/Projects/repo-harness-wt-brc15a-provider-verification-evidence
Branch: codex/brc15a-provider-verification-evidence
Base:33c5012e（未含 alignment 包）。
Plan: plans/plan-20260908-0205-brc15a-provider-verification-evidence.md
Canonical capture Approved --execute/start 已成功。仅有新 plan/contract/review/notes scaffolds 和工具改的 tasks/todos.md，均未提交；没有产品代码改动、红测或新验证。
Contract/notes/review仍模板，编辑产品代码前必须补齐。旧 plan 先于用户默认模型纠正，必须更新，尤其“exact requested model + required effort”与current真实可观测证据的关系；不要机械按旧草案实施。
原草案：Oracle --write-session 单次结构化final session handle；ThinkingTimeOutcome经过BrowserRunResult→BrowserExecutionResult→BrowserMetadata持久化；repo-harness消费exact handle+metadata，再写session projection。这个方向尚未编码，不是已有feature。

下一步具体读码入口：
- repo-harness src/effects/automation/gpt-pro-issue-authoring.ts:21 的 GPT_PRO_MODEL='gpt-5.5-pro'，browserInput:139附近强注入；IssueAuthoringBrowserInput.model目前必填，对应测试锁定5.5。
- src/cli/chatgpt-browser/oracle-provider.ts#buildOracleCommand 已支持无model→strategy=current，仅显式thinking才传参数。CLI/MCP model/thinking均optional。
- binding.ts 的 profile配置没有model字段；受控 ORACLE_HOME_DIR隔离且清理继承ORACLE_*，不会继承~/.oracle/config.json。不要凭空新增平行配置；先复用用户配置的profile UI choice。
- engine.ts#runBrowserConsult 与 session-store.ts#writeBrowserSession。目前固定model.verified=false；adoption的session verification gate严格消费此值，不能单纯改true。
- Oracle src/browser/actions/modelSelection.ts:605 current仅返回label；66–84明确current verified=false。tests/browser/modelSelection.test.ts:1678已有negative测试。
- Oracle src/browser/actions/thinkingTime.ts#ensureThinkingTime 内部有ThinkingTimeOutcome，但成功分支返回void；index.ts:1505和3110的调用不持久化结果。未传thinking时也不检查effort。
- Oracle liveTabs.ts:205的按钮/Pro pill和harvest.currentModelLabel仅显示观察，不是exact model/独立effort authority。
- Oracle CLI bin/oracle-cli.ts:2352 createSession分配final ID；--slug可能碰撞加后缀。--write-output仅答案；没有单次结构化handle导出。repo-harness目前用console Session ID regex，真实run未包含该行。

必须协调：停止默认强制选型与可信验证是两个变化。去掉硬编码忠实current后，现有authority不足时仍unverified；不得把UI label正则猜成backend model。可以记录实际观测及其证据种类；若要改变BRC Pro验收语义须明确体现在方案和合同，不能静默放松gate。

## 独立 Oracle 候选（先保护原版本）

/Users/ancienttwo/Projects/oracle-wt-brc15a-pro-slider
branch codex/brc15a-pro-slider，HEAD26e12021f9593d7ac4ede7b252099653f1b4aca8，刚核对clean。
749cab6a/26e12021修复Pro power slider和disabled ancestor；此前150 focused tests、type/build/lint/format通过，两个pre-submit探针通过（最后disabled delta仅本地测试）。全局Oracle未换成此候选；main readiness owner另装过repo-harness，不要混淆。
候选二进制 dist/bin/oracle-cli.js，仅显式 REPO_HARNESS_ORACLE_BIN 时使用。
本轮没有改Oracle文件。若要修改先确认没有owner仍在用候选跑浏览器；最新消息BRC6a探针已结束。不要操作任何不明Chrome/tab/process。

## BRC6a 独立研究与最新探针

Worktree /Users/ancienttwo/Projects/repo-harness-wt-brc6a-readback-research
branch codex/brc6a-readback-research，HEAD602cb117，clean。
20f04f6c + 602cb117，仅一份 docs/researches/20260908-brc6a-trusted-revision-readback-options.md，可串行整合。

结论：challenge/echo+任意内容抽样都不能区分same-tree different-commit。Git raw commit按framing重算SHA，再沿tree/path/blob可证明内容绑定，但不能独立证明Connector调用来源/session/完整audit覆盖。不要先造无人生产的receipt/service。
Owner回传：一次旧5.5参数probe已stop、自有进程退出、不采用；替换按current默认无model/thinking，UI实际6 Pro。session chgpt_20260908_020457_brc6a-default-model-raw-object-probe完成，但JSON unavailable，raw commit/tree/blob null。模型称schema不支持，没有独立tool trace；唯一结论是本次没有可验证producer产物，不是永久不可用。BRC6a pending，不再自动重跑。原授权诊断限1调用/600秒，不是可复用campaign预算。
后续考虑可观察tool-response传输/明确合同读取方式；Responses API有官方工具记录但属新传输边界，不能静默代替Oracle。

## 真实 BRC15a canary（保留原负证据）

Worktree /Users/ancienttwo/Projects/repo-harness-wt-brc15a-real-shadow-canary，HEADf8a9dea9。
入口 docs/researches/20260907-brc15a-real-shadow-canary.md。
目标 private Ancienttwo/repo-harness-brc15a-canary-20260907，本地同名目录，fixedmain33d692aaa0ab593df0c160082b18fdac02c82e9c，Profile13复制件。
Run1旧Pro picker失败，已canonical reconcile并全额charge/stop。
Run2 c42ce4db0b79ab0d1f3dfddda0a4d920a91cce25a4d919271dd646df726c658f完成，session chgpt_20260908_013100_brc15a-20260907-pro-slider-group-1-issue-authori。
Github独立readback #1–10 slots齐，但metadata10/10拒绝（priority P1/P2/P3 + inventedcapIDs）；session model unverified；旧target issue_numbers policy不完整。未产生Task/Claim/repair/PR/merge。
Oracle曾被导航到另一conversation（writer未知），一次手工回到exactownedURL后正常提取；不能继续声称extractor坏。
Final run2 budget2providercalls（Oracle+GitHubread）/0failures/2steps/0openreservations，campaignstopped。旧grant过期且不可复用；内部GPTConnector调用数未被wrapper测量。没有业务acceptance，不改旧receipt。更详细grant/ledger/session证据在报告及/tmp/brc15a-pro-slider-*。

## 剩余 Sprint 与推进顺序

BRC6a、BRC14、BRC15a、BRC15未完成。Sprint仍是plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md。
1. 完成当前默认模型/结构化观测producer-consumer包，保持真实证据边界。先修订plan/contract，红测再实现。
2. 串行整合已完成alignment、BRC6a研究和canary报告；保护main readiness WIP，不能git add -A或绕过dirty-target guard。新包base不含alignment，合流时按具体delta处理。
3. BRC6a exact-revision producer/传输决策必须真实解决，不能空receipt或把localGit升级成Connector读回。
4. BRC14 fresh audit还没有receipt/consumer/group滚动baseline：generic accept_group当前不能作为真实audit完成。readiness worktree HEAD4889507e可参考，保持pending。
5. BRC15 Canary1 model-free matrix可独立做10slot/第7项断线/duplicate/malformed/drift/crash/wrongSHA；Canary3 active需前置证据，不能跳级。
6. 新真实BRC15a/GPT运行需要明确新预算授权；不可复用stopped grants。源码/单测绿不等于真实canary或全部BRC完成。

## 本次交接停止点

用户要求换session，故不再推进实现/浏览器/CI。没有本会话仍需等待的prepare/finish/GPT进程；研究子任务已回传。本文件为详细接续入口，不依赖自动current投影。不写vault/长期记忆。
