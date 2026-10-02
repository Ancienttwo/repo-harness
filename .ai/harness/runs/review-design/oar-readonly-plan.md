# E2 / B：OAR 外层只读隔离实施计划（待 p7 放行）

## 决策、授权与事实边界

Aimpact 17:35 已选择 **B：外层只读边界包住 OAR host 及其执行树；仅 result_ref 所属输出目录可写；Codex host 环境额外设置 OAR_CODEX_SANDBOX=read-only**。审阅继续在 Herdr 可见 pane 中，由 pane 内 OAR host 打印框架事件。A 只准备本地上游提案。

这覆盖上一版推荐先做 A 的顺序，E 计划中的 no OAR adapter 限制作废；不意味着允许新手写 vendor adapter、vendor argv builder、TUI/sentinel/native-log parser。今回仅改两份计划文档并本地 commit，**尚未实施**。不 push、不发任何 PR/issue、不 merge、不改 main 或 OAR repo、不启动模型/provider、不改全局配置/trust。

- 本 worktree：`/Users/chris/Projects/repo-harness-wt-herdr-generic-review-design`，分支 `codex/herdr-generic-review-design`。
- OAR 源码快照：`/Users/chris/Projects/oar`，`ef893acc0d341b4fa7a1ce41d2be7cafed3c63a2`，读取时 clean。下文 OAR 路径相对该根。
- `@botiverse/oar` 0.10.2、Node >=24；该包依赖 Pi ^0.99.1，未证明与 Pi 1.0 完全兼容（`packages/oar/package.json:1-4,44-59`）。本地 BYOK Pi 1.0 已有 tools/excludeTools/noTools 公开配置，不能把该能力冒充成 stock OAR Claude 的 tool allowlist。
- 源码事实是静态读到的；sandbox、原生版本、模型、host crash 与平台运行结果未做本步 live 验证，均按下文标记。
- Receipt 仍只验证 subject、request/context/result digest、领域 schema/verdict、actual harness/role/model。**无 pane、Herdr/OAR session、PID、launch mode、provider log path 必填字段**。

## P1 / P2 / P3 与执行形状

**P1**：OAR Runtime.session 拥有 vendor 启动（`packages/oar/src/contracts/runtime.ts:9-16`）；SessionOptions 公开 model/effort/env/prompt 数据（`contracts/session.ts:99-141`）。Herdr/Task-agent 继续拥有 workspace/pane/execution-owner identity；repo-harness 继续拥有 fleet/cross preference/三轮预算/context/Receipt。

**P2**：owner 准备并冻结领域 request/subject → 在 dedicated linked checkout 的可见 Herdr pane 启动**固定的 application OAR host** → 外层隔离先成立，host 环境 Codex knob 先固定 → OAR installation probe / runtime.session → promptAndWait → 框架结束的 root-turn text 原样写 result_ref → owner 既有文件协议与领域 schema 校验 / immutable collection → Receipt writer/verifier → close fence → OAR Session.dispose → 已证身份 host/pane cleanup。

**P3**：不再调用 Herdr agent start --kind claude/codex 来启动 native TUI；不再向 native TUI paste prompt 或解析屏幕。OAR host 是固定应用入口，vendor 参数只能由 OAR driver 产生。外层限制是 OS/FS 保护，不是另一套 harness adapter。三轮共享一个 OAR Session；未知投递不重放，换 backend 不洗预算。

### Result 发布：Codex read-only 与可写 result_ref 不冲突的唯一计划路线

Codex 的 native read-only sandbox 不能被假定允许 provider 写 outbox。本计划由 **OAR host 发布 Result，native reviewer 只输出领域 JSON**：

- 使用 OAR `promptAndWait` 返回的 `text`；其源头/拼接/回合归属由库负责（`packages/oar/src/observe/turns.ts:95-127`），应用不自己拼 text_delta、读 native frame、解 TUI 折行或提取 sentinel。
- 只在框架返回 `kind=ended` 且 runtime outcome 成功时，把整个 `text` 原样发布到当前精确 result_ref。模型指令要求该通信消息只包含既有 TaskResult JSON envelope；RECOMMENDATION 放在领域 summary 中，不在 JSON 外插前缀。
- 任何额外文字、代码围栏、缺字段、错 request/context、截断都由**既有领域/文件协议 validator**拒绝。禁止 strip-fence、正则找 JSON、修补响应或自动再问一次。此处不是新增 harness 输出 parser。
- Host 可写输出目录，owner 的 Receipt/ledger 在该目录之外。Host 发布的字节仍是 claim，不自行写 Receipt、不把 turn_end/idle 当 PASS。
- 采用既有 artifact 原子发布/immutable owner collection；Host 软件的临时发布不是模型自行获得 mv/Bash 权限。若“禁止任何 temp/rename”也要覆盖可信软件发布，请 p7 在放行时明确；不扩大 reviewer 的工具写权限。

## 1. 每个 runtime 实际获得什么

| runtime | OAR 已有事实 / 调用 | B 将给什么 | 不声称什么 / admission |
|---|---|---|---|
| Codex | `codexRuntime.session`；宿主 process.env.OAR_CODEX_SANDBOX 选 launch sandbox_mode，默认 danger-full-access，inherit 只是不覆盖（`runtimes/codex/session.ts:60-72`）。OAR 内部生成 -c（`codex/app-server-client.ts:58-72`）；thread new/resume approvalPolicy never（`codex/open.ts:34-64`）。 | **OAR host 自己的环境**固定 read-only（不是只填 SessionOptions.env），同时外层 OS/强制 RO mount 保护 subject、primary、owner、journal、Git common dir。Host 而非 Codex tool 写 result_ref。 | 设置值不是实测认证；apply_patch/exec/子进程的实际拒写、resume 不降级未验证。不得 inherit/danger fallback。隔离不成立则 unsupported，启动前拒绝。 |
| Claude | stock OAR 无条件 --dangerously-skip-permissions（`runtimes/claude/session.ts:83-100`），SessionOptions 无 tool/permission profile（`contracts/session.ts:99-131`）。 | 在 **经证据验证的外层 OS sandbox / 真正不可重挂的只读文件边界**下启动 OAR；native args 仍由库产生，应用不加 bypass。reviewer 无 subject/owner 写权限，host 可发布结果。 | OAR 自带 flag 的存在明确披露，不称为去掉了 bypass。若无 OS 边界，最多只能称“已有独立 allowlist + fingerprint 的观察保障”，不能称 OS read-only；stock OAR 目前并无该 allowlist API，所以本实施不自动退回这个弱模式，缺边界拒绝。是否允许 stock flag 在 B 强制边界下使用由本计划放行明确，不再在 app 拼 permissions flags。 |
| Grok | `grokRuntime.session` 走共享 ACP，默认 always-approve/yoloMode:true（`runtimes/grok/session.ts:129-151`）；client auto allow（`shared/acp/client-app.ts:38-44,81-87`），terminal 直接spawn（`shared/acp/terminal.ts:127-146`）。 | 外层限制 **OAR host + ACP terminal + Grok 子进程**全执行树；OAR负责协议与model事件；与其他runtime同一结果出版/领域验证规则。 | 并未获得原生 readonly mode，也未消除 auto-approve。模型/backend/tool权限未实测；不可只隔离Grok本体而放过host terminal。当前E2的business harness enum只有Claude/Codex；Grok只评估隔离与上游mapping，不在这次实现自动新增第三harness/role/model配置。 |

这里的“只读”是对被审阅数据/owner authority 的写禁止，输出目录例外是明确的通信边界；不是整个机器零写入或网络无副作用。

## 2. 外层边界、路径与证据

1. **基线选择 OS sandbox**；可替换为真实 kernel-enforced RO mount 的 reviewer snapshot。`chmod 0500`、普通 linked worktree、口头“只读”、前后指纹都不是防恶意写入边界。
2. deny：reviewer subject/worktree、owner checkout、primary `.ai/harness` authority、owner journal、Git common directory；路径先 realpath，父目录/符号链接不能扩大 allow。OS 规则覆盖 OAR host 和所有 runtime/ACP terminal descendants。
3. 唯一可写树为当前 task 的 result_ref 输出目录。必须把 private native HOME/cache/session/temp 放进这个树的 runtime-state 子目录；不能给 ~/.claude、~/.codex、owner repo 等额外写许可。认证只按既有授权来源/只读配置 provision，不能丢网关 env、不得写用户设置。实际CLI是否接受这种private state布局未证，先用零模型fixture验证；真实认证另需许可。
4. Immutable inputs/packet/control spec 不放在 reviewer 可写结果树；原 TaskOutbox 同目录有 context 文件时，由owner先冻结并明确deny其写，或把输入投影到readonly树。不得为了sandbox成立把owner journal挪到outbox。
5. **Model证据**：只用 OAR Session.model/标准事件，不读 native JSONL。当前Claude model event来自system/init，不投影assistant.message.model（`claude/projection.ts:203-205,235-237`），gateway alias→Sonnet 的实际模型仍 unverified。不得写 actual_model=Opus 来冒充证据；没有可证 actual model 则不发Receipt，保持未验证/拒绝。A提案记录该相邻gap，不在app补parser。
6. 旧RUN3 zeroSandbox只证custom-profile OS denial；不能复用成“此OAR production host已只读”。本计划的零模型拒写测试证明指定profile/路径/descendant行为，不证明模型理解、完整大包、real auth、生产全部版本或跨平台。
7. 不支持平台/边界/证据时明确unsupported；**无自动非隔离fallback**，无危险flags workaround。

## 3. OAR 设施复用表

| 需要 | 现成OAR设施与源码 | 应用仅保留 |
|---|---|---|
| runtime选择/可执行文件前置检查 | public claudeRuntime/codexRuntime/grokRuntime（`src/index.ts:124-147`）；RuntimeRegistry.get/require（`registry.ts:17-26`）；installation not_found/unsupported（`contracts/installation.ts:22-33`） | fleet逻辑model/effort、cross preference、explicit override、仅not_found允许preflight fallback；不自行Bun.which native CLI |
| native启动和argv | Runtime.session/SessionOptions（`contracts/runtime.ts:9-16`；`contracts/session.ts:99-141`） | 固定application-host entrypoint与OS/Herdrbootstrap参数；绝无claude/codex/grok argv builder |
| prompt与稳定结束 | promptAndWait（`observe/turns.ts:95-127`）；awaitTurnEnd只计root seq/session（`16-66`） | max3领域预算与callback超时；不猜working/idle，不重放 |
| 消息/可见显示 | Session.events/model/status（`contracts/session.ts:225-247`）；observeSessionView（`observe/session-view.ts:232-245`） | 有界renderer/既有脱敏，打印typed facts；不读stderr/TUI/native格式来取结论 |
| 结果字节 | PromptRun.text 是库收集的root-turn text（`observe/turns.ts:95-127`） | 原样写当前result_ref；既有domain/file validators处理JSON envelope，而非vendor parser |
| cleanup | Session.dispose contract（`contracts/session.ts:205-215`）；native子进程own process group（`shared/executable/process.ts:33-44,101-110`） | Herdr created/attached与identity proof；先dispose再停host/pane |
| 日志 | OAR openVoyage/recordLine格式由库拥有（`voyage.ts:4-15,42-70`） | 只在允许输出树记录运行证据；不复制记录decoder |

promptAndWait在abort后继续等待runtime turn end，没有额外总上限（`observe/turns.ts:103-111`）。应用现有deadline/cleanup_pending仍须保留，不能把SDKpromise当总超时证明。

## 4. 精确实施文件清单（放行后才改）

不是18个文件的quota；没有新文件删除。既有DELETE6状态保持。

| path | action | 唯一目的 |
|---|---|---|
| `package.json` | edit | pin @botiverse/oar 已核对版本；声明OAR host build/package artifact；不改全局安装/用户配置。Node host采用>=24。 |
| `bun.lock` | edit | 仓库本地dependency锁定；不得升级其它包来顺手治理。 |
| `src/effects/review/generic-review.ts` | edit | 删除reviewArguments/observeModel/startupScreen手写职责；移除inferOwner CLI解析，owner由既有typed binding/已知runtime上下文传入，未知仍要求--harness；保留business预算/context/Receipt/finding/close。 |
| `src/effects/review/oar-review-host.ts` | create | 固定应用host：SDK Runtime.session、promptAndWait、events/view renderer、原样Result出版、dispose。无vendor flags、parser、native-log读取。 |
| `src/effects/review/review-isolation.ts` | create | 单一外层边界模块：path realpath/输出目录/只读资源、安全环境、OS profile或真实RO mount admission。不是CLI adapter；不提供任意caller命令/权限松绑。 |
| `src/effects/terminal/task-session.ts` | edit | 复用内部start seam与Herdr pane.run启动固定host，身份绑定execution-owner；request交给host文件协议，不向native TUI paste；close请求先SDKdispose/ack，现有ownership信号最后收尾。不得弱化已有binding.host保护或伪装native CLI。具体opaque execution-owner绑定见第6节前置确认。 |
| `src/cli/commands/review.ts` | edit | 业务CLI调用新路径；只接受现有contract/reviewer checkout/address/harness等业务输入，无model CLI args、无raw command入口。旧名仍upgrade-required。 |
| `src/cli/index.ts` | retain current E2 change | 已有review注册与旧名拒绝；不新增vendor命令。 |
| `src/core/review/generic-review.ts` | retain | 领域verdict/finding/三轮规则，不是harness解析器；若typed Result边界需接口调整，只改domain部分，先列精确delta。 |
| `scripts/acceptance-receipt.ts` | retain current E2 change | 正常domain writer/verifier，无launcher字段。 |
| `assets/templates/helpers/acceptance-receipt.ts` | retain mirror | 仅在canonical owner必要变动时同步，不新增OAR依赖到Receipt helper。 |
| `tests/generic-review.test.ts` | edit | 用OAR scriptedRuntime替换手造driver/output seam，保留domain/budget/old-name拒绝；加入第7节host/边界行为。 |
| `tests/acceptance-receipt.test.ts` | edit only fixture seam if required | 真实writer/verifier与tamper/headless等价性保留，Opinion明确fixture；不把旧RUN2 revise变PASS。 |
| `tests/herdr-task-lifecycle.test.ts` | edit | 同一个现有零模型Herdr fixture证明host start/report/dispose/cleanup；仅私有named session，默认session硬拒绝。 |
| `docs/spec.md` | edit | 改为SDK host + B保护与限制；明确可见pane不等于native TUI、不宣称OAR/production sandbox已证。 |
| `assets/skills/repo-harness-cross-review/references/generic-review.md` | edit | OAR路径操作与unsupported边界；不写vendor执行命令。 |
| `plans/plan-20260930-1827-herdr-generic-review-slice-e.md` | edit | 记录17:35 B决策、no OAR adapter旧限制作废、本计划验证边界；无新live canary。 |
| `tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md` | edit | 先收窄/拓宽精确allowed_paths并preflight，更新唯一可执行Verification Plan，标local-only授权。 |
| `tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md` | edit | 记录决策、证据、限制与未闭环，不作为native事实替代。 |
| `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md` | edit evidence only | 正确记录复审与验证，不自授PASS。 |
| `dist/oar-review-host.js` | generated package artifact | 由package build产出，不手改；是否repo track由已有dist策略决定，不force-add生成物。 |
| `.ai/harness/runs/review-design/oar-readonly-plan.md` | edit in this step | 本计划，明确例外：用户要求本地追踪commit。 |
| `.ai/harness/runs/review-design/oar-readonly-upstream-proposal.md` | create in this step | A提案，仅本地文档，绝不对外提交。 |

冻结/不改：三个cross-review CLI/core/runner、27 retained文件的独立职责、campaign/容器/lease实现、OAR repo、全局host配置、真实/mini/default pane和进程。文档/消费者原E2改动照范围保留，不借本计划扩其它harness。

Node host不得从architecture模块引入不相关应用逻辑：共享trustedNodeCandidates可复用（`src/effects/runtime/node-candidates.ts`），host按OAR engine范围确认现有Node；Bun运行OAR尚未验证，不直接假定兼容。不新增第三方sandbox库或另一个dependency-authority resolver。

## 5. 实施顺序与首个证明点

1. p7核对本计划OAR行号、B许可边界与第6节事项，再放行；当前不改源码。
2. 在当前E分支按normal plan/contract gates更新精确路径与Verification Plan，preflight；保存当前source/tree与本地测试baseline。无push/PR。
3. pin OAR依赖与host打包路径。先用 **OAR scriptedRuntime** 走promptAndWait/event/dispose的零模型contract，不接真实native runtime。`scriptedRuntime`被库定义为无binary/login/provider（`testing/scripted-runtime.ts:59-70`）。
4. 实现可见host与Herdr execution-owner证明，用现成pane.run primitive启动固定application entry（本机 `herdr pane run --help` 已读：pane id + command数组）。仅私有named fixtures；不启动真实Codex/Claude/Grok。
5. 加外层B admission：先证明保护路径和输出树限制，再允许host进入SDK Session；Codex host env在Session creation前固定read-only，不通过SessionOptions.env假设生效。每轮重复native Session是禁止的，三轮共享同对象。
6. 接owner领域链：冻结request→SDK结果字节→既有immutable claim/domain验证→Receipt→close fence。删除原四个手写函数职责，禁止从框架拿native frame再自行解析。
7. 更新docs/consumer与原E2相应测试；没有新文件删除。Required Checks/type/已批准full-suite策略按contract执行，不运行模型、真实auth或上游probe。
8. p7复审后仅本地commit；任何远程操作/合并仍需新的Aimpact授权。

## 6. 放行时必须确认的实际边界

- **Binding与cleanup**：OAR native child独立process group，host被SIGKILL不能保证child自动退出（`shared/executable/process.ts:33-44`）。必须先由host调用SDKdispose并证ack，再清理Herdr execution-owner。当前TaskBinding.host分支会拒绝普通outbox collection（`src/effects/terminal/task-session.ts:515-521`）；不能设错字段绕过fence或把Nodehost冒充native binary。先证明“SDK host execution-owner + native children由SDK负责”的受控内部启动语义；若现有binding无法表达，提出最小runtime ledger变更给p7，而非自行设计adapter registry。launcher metadata仍绝不进入Receipt。
- **非OS Claude模式**：没有强制OS/RO-mount边界时不能叫OS只读；已有allowlist+fingerprint只能按该名字记录。stock OAR没公开Claude allowlist，故不自动用手写flags恢复旧模式。B放行同时须明确OAR stock flags在强制边界下的许可；否则Claude保持unsupported。
- **实际model**：OAR Claude model投影gap不是本计划允许application修补的理由。可证actual_model之前不签Receipt，不把Opus alias当已证实际后端。
- **结果例外**：provider不直接写文件；可信SDK host原样出版，不抽取sentinel、不修JSON。OAR promptAndWait text可包含全部root-turn文字，不保证模型一定输出合法JSON；非单一合法envelope就领域拒绝，无重试。
- **认证/cache布局**：须留在输出目录private state中或明确只读读取；不新增用户HOME可写授权，不复制网关secret到tracked文件，不使用空setting-sources导致鉴权丢失。真实运行未授权。
- **能力范围**：无可靠边界的平台/runtime为unsupported；Grok纳入E2业务harness还是只保持研究面需单独决定，不能靠这张表扩角色/model映射。

## 7. 零模型验证（加到已有边界，不增加真实canary）

| 现有测试入口 | 要证明的行为 | 不证明什么 |
|---|---|---|
| `tests/generic-review.test.ts` + OAR testing scriptedRuntime | SDK prompt只提交一次；root-turn结束与拼接用库；多段text与child text不自己拼；Raw结果字节原样；失败/interrupted不出版；stderr/TUI/sentinel不能mint结果；3轮同Session、第4轮拒绝 | 不证明native CLI/model/权限/真实包大数据 |
| 同文件的OS fixture | dummy host及其descendant尝试写subject/primary/owner/journal/Git common dir，均有配对拒绝且内容未改；输出目录允许写；symlink/path traversal不扩大许可 | 只证指定OS profile/fixture，不等于所有生产版本、Codex内部exec/apply_patch、网络/MCP隔离 |
| `tests/herdr-task-lifecycle.test.ts` | 私有named session内host可见、标准事件显示、身份created/attached、dispose先于pane close；host忽略/异常退出如实cleanup_pending，不信号未知PID；不允许default server stop | 不证明真实provider/TUI或强杀host后的所有native孤儿自动回收 |
| `tests/acceptance-receipt.test.ts` | 同一正常writer/verifier、六字段tamper、headless与Herdr调用的domain bytes一致、close再验最终Receipt | fixture opinion不是模型PASS；不签旧RUN2 findings |
| 既有doc/catalog/retirement tests | 旧名明确拒绝，无alias；源码不含vendor argv/native-log/TUI/sentinel parser；三个冻结文件未改 | 静态负例不替代运行隔离证明 |

测试禁止加载真实claude/codex/grokRuntime去做一次startup“校准”；只用SDKscriptedRuntime或dummy process。缺native的测试标skip/unverified，不用别的harness补跑。任何真实模型、权限probe或认证试验必须另行授权；旧17/17额度不重置。

## 8. Rollback / 授权

- 当前阶段仅两份文档commit：回滚该文档commit即可；不影响73个现有源码WIP。
- 后续B实现rollback必须先停止新admission、请求SDKdispose、证明自己创建的host/native执行树关闭并归档运行证据；cleanup_pending不靠pkill解决。
- LIFO回滚依赖/build/host/isolation/orchestrator/consumer的同一切片；Receipt/source迁移保持原子边界，不单改source enum、不把历史receipt翻译成新格式。
- 隔离失败时回到**unsupported**，不能rollback为无隔离stock OAR或旧手写adapter/parser。
- 不自动恢复已删除旧六文件；是否恢复整个旧review栈是另一个回滚决策，不在本计划授权。
- 不改main、不force-push、不push、不建任何PR/issue、不merge；等p7/Aimpact确认。


## 附录 A — 16:33 手写接入清单

每行一个 `path:function`。`pre-existing` 表示已合并/原本存在，不代表都是本次新写；曾在 Herdr migration 中新增/移动/修改的 runtime/MCP helpers 已包含。Herdr transport/OS identity 与领域 JSON 校验分开标注，避免把所有 JSON.parse 都误说成 vendor output parser。原始 creator 未逐 commit 归责的旧 cross-review 面不宣称是 E2 创作。

### A1. 当前 E2 新增/改动的接入

| 状态 | path:function | 手写职责 | 现成替代 / unknown |
|---|---|---|---|
| new-in-E2 | `src/cli/commands/review.ts:buildReviewCommand` | CLI harness 选择、address 文件、session dispatch | OAR RuntimeRegistry/Runtime.session；业务 CLI facade 保留 |
| pre-existing function, E2 wiring changed | `src/cli/index.ts:buildProgram` | 注册新 review / 拒绝旧名 | 应用路由保留；不是 vendor adapter |
| new-in-E2 | `src/effects/review/generic-review.ts:inferOwner` | Herdr JSON 元数据推 owner harness | OAR 无 Herdr owner facility；unknown，业务 policy/binding 保留 |
| new-in-E2 | `src/effects/review/generic-review.ts:observeModel` | Claude/Codex 原生日志扫描、JSONL/model 提取 | OAR Session.model/modelOf；Claude actual-model 缺口见正文 |
| new-in-E2 | `src/effects/review/generic-review.ts:observeModel.walk` | 扫描 native log 文件树 | 随 observeModel 替换，不留应用扫描器 |
| new-in-E2 | `src/effects/review/generic-review.ts:startupScreen` | Herdr stdout + trust/update/login 正则 | OAR startup/records/exit/readback；TUI equivalent unknown |
| new-in-E2 | `src/effects/review/generic-review.ts:reviewArguments` | 手拼 Claude/Codex flags、pins、工具/写文件规则 | OAR SessionOptions + 上游 permission profile |
| new-in-E2 | `src/effects/review/generic-review.ts:runtime.which` | Bun.which preflight 选择/fallback | runtime.installation 返回 not_found/unsupported；语义在 OAR contracts/installation.ts:22-33 |
| new-in-E2 | `src/effects/review/generic-review.ts:runReviewRound` | 默认 cross/fallback、start/send/collect/model observer 混合业务规则 | OAR runtime/session、prompt、awaitTurnEnd；预算/领域/Receipt 保留 |
| new-in-E2 | `src/effects/review/generic-review.ts:reviewStatus` | 读取 task-agent lifecycle/status | OAR Session.status/records；应用轮次 ledger 保留 |
| new-in-E2 | `src/effects/review/generic-review.ts:closeReview` | Receipt fence 后调 native lifecycle cleanup | OAR Session.dispose + Herdr ownership；Receipt fence 保留，host crash proof unknown |

### A2. 已合并的 Herdr/task-agent/MCP 接入与支持层

| 状态 | path:function | 职责 | 替代 / 边界 |
|---|---|---|---|
| pre-existing | `src/effects/terminal/herdr.ts:herdrEnvironment` | CLI endpoint env 隔离 | Herdr transport 保留；OAR SessionOptions.env 不替代 Herdr address |
| pre-existing | `src/effects/terminal/herdr.ts:spawnHerdr` | spawn Herdr CLI | OAR 不管理 Herdr；unknown |
| pre-existing | `src/effects/terminal/herdr.ts:herdrCommand` | 拼 Herdr 命令参数 | Herdr transport；unknown |
| pre-existing | `src/effects/terminal/herdr.ts:herdrResult` | 解 Herdr RPC JSON，不是模型输出 | Herdr transport；OAR 无对应 parser |
| pre-existing | `src/effects/terminal/herdr.ts:herdrMutation` | 解 Herdr mutation result/空输出 | 同上 |
| pre-existing | `src/effects/terminal/herdr.ts:validateHerdrEndpoint` | socket 地址/长度校验 | Herdr 保护保留 |
| pre-existing | `src/effects/terminal/task-session.ts:info` | Herdr getter 解码 wrapper | Herdr transport；unknown |
| pre-existing | `src/effects/terminal/task-session.ts:mutate` | Herdr mutation wrapper | 同上 |
| pre-existing | `src/effects/terminal/task-session.ts:validateSpec` | kind/argv/session spec 校验 | OAR Runtime/SessionOptions 可接 native 部分；应用 spec 保留 |
| pre-existing | `src/effects/terminal/task-session.ts:startTaskAgent` | 手拼 agent start --kind/--arg 启动 | OAR runtime.session 拥有 native launch；Herdr host/pane 层待核对 |
| pre-existing | `src/effects/terminal/task-session.ts:bindStartedAgent` | agent/process-info 解析、单 foreground provider 假设 | OAR 管 native lifecycle；Herdr host binding 的具体替代 unknown |
| pre-existing | `src/effects/terminal/task-session.ts:reconcile` | 回读启动/Herdr实况、拒绝不明重放 | 应用 write-ahead/reconcile 保留，OAR无跨controller自动替代 |
| pre-existing | `src/effects/terminal/task-session.ts:captureTaskPane` | pane/agent/process-info 身份绑定 | Herdr 所有权保留；OAR不会证明pane身份 |
| pre-existing | `src/effects/terminal/task-session.ts:assertTaskBinding` | agent kind/terminal/PID proof 回读 | 同上，不能用 Session.id 代替 |
| pre-existing | `src/effects/terminal/task-session.ts:readTaskAgent` | binding/spec/provider artifact 回读 | 应用 ledger 保留；native session部分可用OAR对象，恢复替代unknown |
| pre-existing | `src/effects/terminal/task-session.ts:sendTaskRequest` | hand-built agent prompt / 文件协议 | OAR Session.prompt(inputId)；领域request binding保留 |
| pre-existing | `src/effects/terminal/task-session.ts:validateTaskResult` | 文件 Result envelope JSON校验，不是vendor帧 | 应用通信契约保留；是否改 delivery 待决定 |
| pre-existing | `src/effects/terminal/task-session.ts:readTaskRequestResult` | outbox Result JSON读取 | 同上；不能以OAR idle替代 Result |
| pre-existing | `src/effects/terminal/task-session.ts:collectTaskResult` | immutable owner collection | 应用 authority 保留；OAR records 不是 Receipt |
| pre-existing | `src/effects/terminal/task-session.ts:submitTaskResult` | provider文件提交路径 | delivery待决定；OAR无已读的同名精确文件发布API |
| pre-existing | `src/effects/terminal/task-session.ts:readTaskAgentHistory` | 读 agent read recent-unwrapped 原始文字 | OAR events/observeSessionView/records；不保留TUI提取 |
| pre-existing | `src/effects/terminal/task-session.ts:taskAgentStatus` | Herdr状态+artifact派生 | native状态用OAR Session.status，任务ledger保留 |
| pre-existing | `src/effects/terminal/task-session.ts:processIdentity` | 手读ps身份，不是模型输出 | OAR native lifecycle，Herdr外层proof仍需现有保护 |
| pre-existing | `src/effects/terminal/task-session.ts:assertProcessProof` | 严格进程身份比较 | 同上；等价公开OAR proof facility unknown |
| pre-existing | `src/effects/terminal/task-session.ts:processProofAlive` | ps退出态/zombie/PID复用判别 | 同上，不在此步回退已合并修复 |
| pre-existing | `src/effects/terminal/task-session.ts:signalCreatedProcess` | identity-proven signal | OAR Session.dispose管native组；Herdrhost不由它证明 |
| pre-existing | `src/effects/terminal/task-session.ts:stopCreatedProcess` | TERM/KILL有界cleanup | 同上 |
| pre-existing | `src/effects/terminal/task-session.ts:startPanePresent` | pane身份回读 | Herdr层保留；unknown |
| pre-existing | `src/effects/terminal/task-session.ts:closeUnboundTaskStart` | intent-only启动cleanup | Herdr/应用reconcile保留；OAR无自动跨进程对应 |
| pre-existing | `src/effects/terminal/task-session.ts:cleanupTaskAgent` | provider/pane cleanup编排 | Session.dispose + 应用Herdrproof，整合未证 |
| pre-existing | `src/effects/terminal/task-session.ts:closeTaskAgent` | native cleanup入口 | 同上 |
| pre-existing | `src/effects/terminal/task-session.ts:cancelTaskAgent` | 无验收cleanup入口 | 同上 |
| pre-existing | `src/cli/commands/task-agent.ts:buildTaskAgentCommand` | kind/spec/start/read/status CLI facade | facade保留；native控制面委托OAR，不另写driver |
| pre-existing | `src/cli/mcp/tools.ts:parseRunnerAgent` | codex/claude选择 | RuntimeRegistry选择已知runtime；应用allowedAgents保留 |
| pre-existing | `src/cli/mcp/tools.ts:runAgentGoal` | start/send、status/seq轮询、history读取、close/cancel | OAR Session.prompt/status/awaitTurnEnd/events/dispose；MCP授权/脱敏保留 |
| pre-existing nested | `src/cli/mcp/tools.ts:runAgentGoal.get` | agent get JSON读取 | OAR Session.status；Herdraddress层另保留 |
| pre-existing | `src/effects/terminal/task-role-profiles.ts:parseFrontmatter` | fleet配置读取，服务pins | 业务配置保留，输出填SessionOptions，不生成argv |
| pre-existing | `src/effects/terminal/task-role-profiles.ts:parseRoleNameScalar` | 角色identity配置解析 | 同上；不是vendor output parser |
| pre-existing | `src/effects/terminal/task-role-profiles.ts:validateFrontmatter` | model/effort配置校验 | 同上，可对照OAR listModels；不保证effective model |
| pre-existing | `src/effects/terminal/task-role-profiles.ts:buildFamilyEffortMap` | 模型/effort业务映射 | 保留单一配置owner，OAR负责native映射 |
| pre-existing constants | `src/effects/terminal/task-role-profiles.ts:MODEL_EFFORT_MAP / AGENT_TARGET_OVERRIDES` | 手定义fleet目标模型/pins | 不是adapter；逻辑Role配置保留 |

workspaceDirectory/registerTaskWorktree/cleanupTaskWorktree 等 workspace CRUD 未在本表扩成 vendor integration：它们属于 Herdr/Git topology 和外层所有权，不解析模型输出。仍须在将来接 host 时保留这些保护。

### A3. E2 已删除的旧接入（pre-existing；本步没有再删除或恢复）

| 状态 | path:function | 手写职责 | 现成替代 / unknown |
|---|---|---|---|
| pre-existing, deleted in E2 | `src/cli/commands/claude-review.ts:buildClaudeReviewCommand` | 旧CLI/native review编排 | 新业务facade+OAR session；旧名维持upgrade-required |
| pre-existing, deleted in E2 | `src/core/review/claude-review.ts:validateClaudeReviewResult` | 旧Claude success/structured_output帧解析+domain校验 | OAR projection负责vendor envelope；领域校验保留 |
| pre-existing, deleted in E2 | `src/core/review/claude-review.ts:object / keys` | 旧帧/输出对象辅助校验 | vendor部分由OAR拥有，领域schema另保留 |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-host.ts:runClaudeReviewHost` | spawn Claude flags、stdin/stdout stream-json、get结果/report state | OAR claudeRuntime.session、prompt、events、dispose |
| pre-existing nested, deleted in E2 | `src/effects/review/claude-review-host.ts:runClaudeReviewHost.report` | 将手读事件映射working/idle/blocked | OAR typed events/status，Herdr展示report留应用 |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:herdr` | Herdr getter wrapper | Herdr层保留；OAR无对应 |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:startReviewServer` | 生成host launcher/config、启动私有server | OAR不管Herdrserver；复用现有address/host机制，具体unknown |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:shellQuote` | launcher命令拼接 | 不再拼native harness命令；host transport对应unknown |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:reviewServerIdentity` | server进程identity读回 | 外层所有权；OAR无Herdr等价proof |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:reviewHostIdentity` | pane/process/ps identity读回 | 同上 |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:assertReviewProcesses` | host/provider身份验证 | OAR native生命周期+外层证明，不自动等价 |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:runClaudeReviewRound` | provider admission/request/result/native验证编排 | OAR Session+标准turn; domain预算/Receipt独立保留 |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:claudeReviewStatus` | lifecycle/status读取 | OAR Session.status + task ledger |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:closeClaudeReview` | receipt fence和provider cleanup | OAR dispose + domain fence/Herdrproof |
| pre-existing, deleted in E2 | `src/effects/review/claude-review-session.ts:stopReviewServer` | 旧server终止证明 | Herdr外层；unknown，不复制旧server owner |

上述删除文件按 `git show origin/main:<path>` 阅读，未恢复到working tree。旧 core 的 reviewContextDigest/sourcePacket 等纯领域/Git函数不属于 native output parser。

### A4. 三个冻结的旧 cross-review 面（pre-existing，E2未修改）

| 状态 | path:function | 手写职责 | 替代 / unknown |
|---|---|---|---|
| pre-existing, frozen | `src/effects/review/cross-review-runner.ts:buildCodexPrompt` | Codex专用prompt/指令拼装 | OAR SessionOptions/prompt，审阅业务正文保留 |
| pre-existing, frozen | `src/effects/review/cross-review-runner.ts:invokeProvider` | codex exec -s read-only argv、收stdout | OAR codexRuntime.session，不复制app-server adapter |
| pre-existing, frozen | `src/effects/review/cross-review-runner.ts:runCrossReview` | 自建重试/调用/分类编排 | OAR controls/turn helpers；app业务budget另保留 |
| pre-existing, frozen | `src/core/review/cross-review.ts:parseFindings` | transcript severity/findings正则 | native文字不再由app抓；领域结构校验可保留，交付契约待决定 |
| pre-existing, frozen | `src/core/review/cross-review.ts:matchesAuthFailureSignal` | auth stdout/stderr文本识别 | OAR operational error/typed record；完整映射unknown |
| pre-existing, frozen | `src/core/review/cross-review.ts:classifyCrossReviewOutcome` | native退出/输出分类 | OAR typed turn outcome/exit |
| pre-existing, frozen | `src/cli/commands/cross-review.ts:runCrossReviewCommand` | 老provider mode选择/调用facade | OAR RuntimeRegistry/session，app facade保留；此轮不改 |

这三个文件仍是独立 follow-up，本文没有修改、删除或把它们绕接到新实现。

### A5. ignored canary/诊断补充（非E2产品diff、非已合并产品；保持冻结）

下列代码也是手写接入/输出读取，列出是为了透明，不表示复用为产品。

| 状态 | path:function | 手写职责 | 替代 / unknown |
|---|---|---|---|
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:choose` | cross/explicit/preflight选择 | RuntimeRegistry/installation；业务cross policy保留 |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:args` | vendor argv/pins | SessionOptions+upstream权限profile |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:prepareRolePrompt` | Claude prompt-file argv workaround | SessionOptions.appendSystemPrompt，native处理归OAR |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:blockedStartupScreen` | trust/update屏幕正则 | OAR operational failure；TUI等价unknown |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:sentinels` | TUI缩进/换行复原+JSON sentinel解析 | 不产品化；用框架标准事件，领域交付另定 |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:nativeEvidence` | Codex/Claude日志model/tool读回 | OAR records/model/effort，actual-model gap必须上游解决 |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:walk` | native日志目录扫描 | 随nativeEvidence退出产品路径 |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:ownsRecords` | 日志cwd/timestamp归属判断 | OAR session.id/stream的归属，不从文本猜 |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:pairedWrites` | native tool call/result配对及拒绝文本识别 | OAR tool events/raw record；OS拒绝证据独立，不猜 |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:live` | TTY start/send/history/结果poll | OAR session controls/awaitTurnEnd |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:zeroModelStartup` | fake argv+真实启动screen验证 | 保留旧证据；不跑新provider，替代unknown |
| probe-pre-existing | `.ai/harness/runs/review-design/canary.ts:zeroModelNegative` | 缺binary/启动negative路径 | OAR installation/typed拒绝；旧证据保持冻结 |
| probe-pre-existing | `.ai/harness/runs/review-design/run2-write-canary.ts:pins` | vendor argv/工具规则 | SessionOptions/upstream权限 |
| probe-pre-existing | `.ai/harness/runs/review-design/run2-write-canary.ts:nativeEvidence` | native日志解析 | OAR records/model，未直接等价 |
| probe-pre-existing | `.ai/harness/runs/review-design/run2-write-canary.ts:walk` | native日志扫描 | 同上 |
| probe-pre-existing | `.ai/harness/runs/review-design/run2-write-canary.ts:ownsRecords` | native日志归属 | OAR session stream归属 |
| probe-pre-existing | `.ai/harness/runs/review-design/run2-write-canary.ts:pairedWrites` | tool output配对/拒绝正则 | OAR typed tool/records，拒写证明仍独立 |
| probe-pre-existing | `.ai/harness/runs/review-design/run2-write-canary.ts:live` | start/send/Result/native证据 | OAR session API；旧probe不继续执行 |
| probe-pre-existing | `.ai/harness/runs/review-design/run3-write-canary.ts:pins` | vendor argv/工具规则 | SessionOptions/upstream权限 |
| probe-pre-existing | `.ai/harness/runs/review-design/run3-write-canary.ts:nativeEvidence` | native日志解析 | OAR records/model，未直接等价 |
| probe-pre-existing | `.ai/harness/runs/review-design/run3-write-canary.ts:walk` | native日志扫描 | 同上 |
| probe-pre-existing | `.ai/harness/runs/review-design/run3-write-canary.ts:ownsRecords` | native日志归属 | OAR session stream归属 |
| probe-pre-existing | `.ai/harness/runs/review-design/run3-write-canary.ts:pairedWrites` | tool output配对/拒绝正则 | OAR typed tool/records，拒写证明仍独立 |
| probe-pre-existing | `.ai/harness/runs/review-design/run3-write-canary.ts:live` | start/send/Result/native证据 | OAR session API；旧probe不继续执行 |

局部 effect/stop/privateSession/alive/zeroSandbox 是旧probe的OS/Herdr执行或保护辅助，不作为新vendor adapter复用。旧 run1/run2/run3 与独立诊断脚本未被修改/运行；其它历史诊断副本未逐份复核，标 unverified，不宣称已穷尽 ignored archive。
