# OAR session resume / attach 接手实测

结论先行：**当前 main 的 OAR0.10.2 + Codex0.160.0 路径不能用 resume直接接手仍被另一OARowner持有的worker；先由原owner正常dispose、保留同一native状态，再resume构造新Session可以成功。SessionID本身不足以跨机器恢复。**

这不是跨设备或新Herdr pane的完整通过报告：本轮完成本机两个独立OARhost的真实native实验；跨设备未获具体实验endpoint，新pane因继承pane失效未操作。首个只读模型turn也未成功，不能宣称busyturn/context/output无缝迁移。下面分别标明已测、API事实与未验证。

## 绑定和只读边界

- Repo基线/main：`cdeca8c39f5c94166982522d9188c99c9bc4d89e`（#484squashmerge）；干净新worktree `/Users/chris/Projects/repo-harness-oar-session-handoff`，分支 `codex/oar-session-handoff`。
- Actuallocked/installed OAR：`@botiverse/oar@0.10.2`；其Pi coding-agent为`0.99.2`。Node`24.21.0`，CodexCLI`0.160.0`，macOS。**没有借用hold中的#481来升级0.13.3/Pi1.0**，结论不外推这些版本或Grok/Claude/Pi runtime。
- 首个nativeowner构造开始于2026-10-03 06:26:51.824 +08:00。OAR探测installed executable、创建和disposeworker。Herdr没有agent start/prompt/kill，也没有成为worker生命周期owner。
- readonly指不写业务仓库、已有会话/配置或依赖。实验必须产生自己的临时native状态和证据；全部在独占临时目录。复用main既有reviewIsolationPolicy/prepareReviewLauncher/prepareCodexHome，保护primary/subject/Git common-dir/ownerjournal，vendor及后代仅能写临时output；auth/config/hooks/agents/skills等受保护，未放宽profile。事实入口：`src/effects/review/review-isolation.ts:46,96,158`。
- 只复制短runwindow可用的既有auth到0700/0600临时home，不复制config/trust/instructions；两份auth副本在实验后由现有removeCopiedAuth移除（结果均removed）。不提交凭据、prompt/nativehistory、scratchcode或原始privatepaths。SDK管理本实验的关闭，不触碰其他worker/session/pane。
- 只提交本文；package.json/bun.lock/tsconfig、生产代码、hold中的#473/#474/#477/#480/#481/#482均未改。`bun install --frozen-lockfile`只物化已有lock的ignored node_modules。

## P1：API及ownership边界

| 面 | 当前源码事实 | 含义 |
|---|---|---|
| SessionOptions.resume | installed `dist/contracts/session.d.ts:79-80`；public [v0.10.2 Session contract](https://github.com/botiverse/oar/blob/v0.10.2/packages/oar/src/contracts/session.ts) | 使用旧nativeSessionID重新打开conversation；不是已有进程handle |
| Session public controls | installed session.d.ts:160-207列prompt/steer/queue/abort/events/records/graph/dispose等；实测Session上attach不存在 | 已有Sessionobject可控制其owner的worker；没有publicattach/远端ownerendpoint参数。未测试任意privateAPI |
| Codexfactory | installed `dist/runtimes/codex/session.js:44-55` → app-server-client.js:3-8每次spawn新app-server；[public open implementation](https://github.com/botiverse/oar/blob/v0.10.2/packages/oar/src/runtimes/codex/open.ts) | resume也由新OARSession持有自己的app-server；不复用原owner进程/stdio |
| Nativeconversation与OARstream | open.js:40-55用thread/resume且excludeTurns=true；新kernel在session.js:86建立 | nativeID可相同，但OARrecords/cursor是新owner本次观察的stream，不能直接当旧ownerjournal连续性 |
| Dispose | installed session.js:250-265发送自身dispose、停止worker并等待client.exited | 原owner释放worker/state后，才尝试新constructor；本实验没有自行猜providerPID或另建CLIparser |
| Refusedopen cleanup | installed rpc-control.js:41-48在open失败时调用client.kill；shared/executable/process.js:24-29,63-71持有进程组且不unref | 失败是SDKconstructor拒绝，不是Herdr替它重派或强制接手；不提升为通用跨runtimehandoff保证 |
| Herdr | installedCLIhelp/skill支持namedpersistent session、remote/machine控制和pane显示 | 这是terminaltransport/可视化层，不是OARconversation或process ownership转移API。本轮没有实际控制pane |

## P2：真实native调用路径与结果

共同路径：OARpublic `codexRuntime.installation()` → `.session(installation,{cwd,env:{CODEX_HOME,TMPDIR},resume?})` → SDK自己的app-server/JSONRPC → thread/start或thread/resume → typedSession/status/model → SDKdispose。wrapper只复用main既有OSlauncher并原样转交OAR的argv；没有手写adapter、输出解析器或改上游声明。

本次独占nativeID：`01a0feba-3a83-7011-8e60-b3b4109239f1`。所有constructor均使用同一Codex版本和readonlyOSprofile；这些不是用户已有session。

| Case | 控制条件 | 观察 / exit | 可以证明什么 |
|---|---|---|---|
| A：新owner及只读canary | privatehome，freshOARSession；仅要求返回一个marker、不用tools/不编辑 | constructor6983ms成功，native模型报告gpt-6.1-sol；Session无attach。promptAndWait返回ended/failed，reason=`workspace routing discovery failed`。owner仍存活、status idle、30records（seq29） | nativeowner已建立；**未成功执行工作turn**，不证明模型/backend或活跃turnhandoff |
| B：原owner仍存活时resume | 独立Node/OARhost，同ID/同statehome/同auth；原ownerPID91763经ps读回仍在 | constructor3118ms拒绝：`codex thread/resume failed: thread <ID> already has an active writer`；probeexit1 | 此runtime拒绝第二writer；即使OARstatusidle，不能把aliveowner的ID当可接手worker。拒绝是预期负向结果，未重试/抢锁 |
| A释放 | 给本实验owner结束观察指令，由它调用Session.dispose() | awaitdispose后controller正常exit0，最后seq31；原controller不再存活 | 只释放本实验owner，未关Herdrserver或其他worker |
| C：释放后同statehome resume | 独立hostPID96235，同ID/同auth/同nativehome | constructor2984ms成功，nativeID完全相同；新stream5records/seq4、idle，随后disposeexit0 | **可以恢复nativeconversation的构造**；没有证明下一turn成功、旧OARstream复用或跨设备接手 |
| D：仅ID+同auth、无原nativehistory | 新空privatehome，复制同一sourceauth；同SDK/CLI、同ID、原owner已退出 | constructor65ms拒绝：`codex thread/resume failed: no rollout found for thread id <ID>`；probeexit1 | 对此Codex路径，仅ID和凭据不足；native持久状态是恢复前提。它是不同本地statehome的对照，**不是第二设备实测** |

首turn失败没有被修复或掩盖：未放宽sandbox、改model/router/config、升级包或补fakeoutput。它阻止了“busyturn正在运行时无缝接手”和“恢复后内容连续”的完整验证。B的writer拒绝发生在alive但idle的owner状态，不能冒称测了busyphase；这仍是反例：有nativeID并不意味着可以接管仍活着的owner。

## 跨设备 / 新pane的实际限制

- **跨设备未实测**：发现saved Herdr profile `mini`，但没有收到该研究具体的已授权实验endpoint/owner对象；没有SSH、转发、安装/启动remote server或运行remoteSession。不能把本机Dcase叫跨机器proof。
- **新pane未实测**：工具环境HERDR_ENV=1，但继承pane`w3:p7`的current/layout查询均返回pane_not_found；client0.9.3/server0.9.1虽显示protocol兼容，context仍不能证明可写parent。没有借用focusedpane、选择其他agent、升级server或开新server绕过。已请求明确session+parentpane，截止该快照未提供。
- 不声称Herdr远端view不可行。它提供的persistentPTY/remoteattach属于既有Hosttransport；即使另一设备看见同pane，也不证明它通过OARresume继承了进程、pendingrequest、预算或Result/Receipt。
- active-writerfence是实测Codex0.160.0结果，不是所有OARruntime的SDK统一singlewriter保证；其他runtime/cloud-backedhistory/共享filesystem/其他版本需各自证据。
- user配置、hooks/skills、nativeextension、actualbackendidentity、长会话队列/compaction、网络隔离及跨设备credentials/state复制安全未验收。

## P3：对既定方向的判断（不实施新设计）

继续“OAR托管worker，Herdr仅pane/可见性”。不能在新pane/另一设备简单再开Session(resume=id)并把它当运行中worker的ownertransfer；本机已被writerfence拒绝，新statehome又缺rollout。

**观察正在跑的worker**应保持同一OARowner活着，通过已授权Hosttransport观看其pane/ownerheldevidence。**迁移执行owner**需要原owner显式释放、native状态可用、业务授权/lease及pendingrequest/evidence的受控handoff；本实验只证明释放后同homeconstructor成功，没有定义或实现这些更宽协议。不得重置预算、二次dispatch、复制/伪造Receipt或把相同SessionID/Herdridle当handoff确认。

这条结论来自当前API和本次负向/正向constructor对照；没有新增RPC层、SSHadapter、readerfallback或scheduler。

## 可复核证据与交付

本地ignored证据：`.ai/harness/runs/oar-session-handoff/observations.json`（不含credential）；SHA256=`d73bd6307ab37322e6190b98fc8f4fe94bc26ebde5ed9e9b48fc82a291572522`。临时probe源码SHA256=`13ab0e643fd0598021a5f20ca5df5a0b39cbb93394aeee93647c9ac971355241`。scratch仅调OARpublicAPI并复用现有isolationhelper，不是产品文件或可交付adapter。

| 实际命令 | exit / 证据 |
|---|---|
| Node24 probe.mjs owner | 0（生命周期观察/自身dispose）；firstturn单独记录failed，不能用这个exit当工作成功；/tmp/oar-handoff-owner.log |
| Node24 probe.mjs resume-alive | 1，activewriter拒绝；/tmp/oar-handoff-resume-alive.log + observations.resume-alive-error |
| Node24 probe.mjs resume-after-dispose | 0，constructor成功并dispose；/tmp/oar-handoff-resume-after.log |
| Node24 probe.mjs resume-other-home | 1，norollout拒绝；/tmp/oar-handoff-other-home.log |
| cleanup（existing removeCopiedAuth） | 0；原/replica两份副本removed，sourceauth未改 |
| git diff --exit-code -- package.json bun.lock tsconfig.json | 0 |

实验前后主checkoutgitstatus均clean；researchworktree在写本文前clean。仅提交本findings文档，依赖/代码与所有holdPR无变化，不merge。文档所述实测覆盖是partial；没有生成AcceptanceReceipt或native跨设备handoff验收PASS。
