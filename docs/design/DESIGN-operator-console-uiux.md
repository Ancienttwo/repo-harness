# Design Brief: operator 控制台 UI/UX 改版

> **Status**: Confirmed（2026-10-27）
> **Slug**: operator-console-uiux
> **Owner**: Ancienttwo
> **Date**: 2026-10-27
> **Issue**: [#1003](https://github.com/Ancienttwo/repo-harness/issues/1003)（第〇期 [#997](https://github.com/Ancienttwo/repo-harness/issues/997)，切片 0.1）
>
> 用户 2026-10-27 确认本稿。控制台的 UX 以本稿为准，取代 `DESIGN-local-human-control-board-v1.md`；旧稿的标注由切片 0.2（#1004）另开 PR。前端切片（1.1 起）引用本稿和下面的场景 id。

## 输入与权威

权威链按 `docs/reference-configs/ux-feature-guard.md`「Authority Chain」：用户决定和 PRD 在上，本稿只把它们写具体，不改写。本稿与 PRD、画布、代码不一致的地方，按代码事实和已批决定写，并列进「文档问题」。

| 输入 | 版本 | 用法 |
| --- | --- | --- |
| PRD | [`plans/prds/20261026-2310-operator-console-uiux.prd.md`](../../plans/prds/20261026-2310-operator-console-uiux.prd.md)，rev 213（#996） | 产品意图的唯一权威。#980 里的英文副本 `20261026-2100` 已删除 |
| 用户决定 | [#997 评论](https://github.com/Ancienttwo/repo-harness/issues/997#issuecomment-6420993596)，2026-10-27 | 10 项待决问题全部按建议批准，见「已批准的决定」 |
| 设计画布 | https://claude.ai/artifact/JVJiUztNTXwx1wvmFwdcyw ，读到的版本 `1793028533-d1e8`，21 张画板 | 页面布局、文案、示例数据。PRD 写的是 Version 38；画布接口只给版本 id，两者对不上号，以本稿记录的版本 id 为准 |
| Design system | https://claude.ai/artifact/JyoYEw29VBRwmBRnnKf3TT ，版本 `1793028749-cefd` | token、组件、像素角色。repo 副本在 [`operator-console/design-system/`](operator-console/design-system/README.md) |
| 代码基线 | `main@4700cbbe0`（v0.24.3 之后） | Authority & Reuse Map 的 file:line |

## Purpose & Audience

- Page/surface: `repo-harness operator serve` 的本机控制台（127.0.0.1:4318）。从只读看板扩成本地管理台：16 个页面加任务抽屉，分六期上线。
- Primary audience: 一个人或小团队。他在一台机器上管几个 adopted 仓库和几个 coding agent（Claude Code、Codex，其余经 OAR 接入）。
- Job to be done: 一个窗口答清三件事：什么在等我处理；开发环境哪里漂移；哪些 worktree 和 CLI 可以清。写文档交给 agent，改动以 Draft PR 交回。写代码仍在用户自己的 harness 里。

## 已批准的决定

D1–D10 是用户 2026-10-27 批准的 10 项（原文见 #997 评论）。DW 和 DT 是 PRD 里已经勾选的两项。下文用这些编号引用。

| # | 缺口 | 决定 | 影响的页面与场景 |
| --- | --- | --- | --- |
| D1 | G1 | 批准三种有界写入，撤销 #482 起的只读约束。默认仍只读，按本机配置（第三期）、文档会话（第四期）、worktree 清理（第五期）的顺序开放 | 设置、文档、文档会话、首页、Worktree；`UX-operator-console-uiux-P1` |
| D2 | G3 | 文档会话显示消息正文、工具类别、相对路径和执行状态。原始工具参数、完整命令、终端输出和环境变量不显示，用结构化操作摘要代替。落盘前脱敏 | 文档会话、清理会话；`4-DSES-N1`、`5-WTC-N1` |
| D3 | G5 | 文档会话接受 OAR 免确认启动，条件是 OS 边界同时收窄写入、敏感文件读取、环境变量、网络出口（含回环）和子进程。GitHub 凭据只在服务端。隔离没验证的 runtime 不启用。边界建不起来不退回无隔离运行 | 文档会话、设置；`4-DSES-F3`、`3-SET-N1` |
| D4 | G5 | 可写范围第一版只开 `docs/` 里人写的文档。`plans/` 和 `.archcontext/model/` 不开放 | 文档会话；`4-DSES-F1` |
| D5 | — | 文档会话的 Draft PR 由控制台在用户看过完整 diff 后直接开 | 文档会话；`4-DSES-P1` |
| D6 | G5 | 文档会话第一版只支持 macOS。只读控制台各平台都能用 | 首页、文档、文档会话；`4-HOME-F1` |
| D7 | G7、G11 | 批准新依赖 `@xyflow/react`、`@dagrejs/dagre`、`react-markdown`、`remark-gfm`、`mermaid`，只用在架构画布和文档阅读。实施时核实确切版本和许可证。继续 React + Kumo | 架构、文档 |
| D8 | G20、G21 | 测试只做清单、结果和命令 | 测试、任务抽屉；`1-TESTS-N1` |
| D9 | G30 | Bot 不回 MCP 派活，只走 CLI → herdr | Bots、任务抽屉；`1-BOTS-N1` |
| D10 | G31 | repo-harness 不读 Slack | Bots、系统；`3-BOTS-N1` |
| DW | G24、G25 | 绿色项一键清理；非绿色项由用户发起清理会话，agent 给删留建议和归档计划，用户逐项授权后先归档进 `docs/archive/` 再删 | Worktree、清理会话 |
| DT | G13 | Paper（亮）与 Ink（暗）两套主题并存，亮色 Paper 为默认 | 全部；默认值按 U1：跟随系统，系统是亮色时就是 Paper |

## 页面清单与上线期

侧栏按画布分三组：工作、接入、观测；设置在底部，首页在标识下方。任务抽屉从看板和首页打开，文档会话从「最近」和首页打开，二者不是侧栏条目。一个页面只在它上线的那一期出现在侧栏和路由里；不放占位页（PRD 切片 1.1）。

| 页面 | 画板 | 侧栏组 | 上线期（切片） | 写入 | 场景前缀 |
| --- | --- | --- | --- | --- | --- |
| 外框（侧栏、仓库切换、页头） | 所有画板 | — | 1（1.1） | 无 | `1-SHELL` |
| 首页 | `Home` | 顶部 | 1（1.1、1.2）；发起文档会话 4（4.2） | 第四期起：发起文档会话 | `1-HOME`、`4-HOME` |
| 看板 | `Main` | 工作 | 1（1.1、1.2） | 无 | `1-BOARD` |
| 任务抽屉 | `Task` | 从看板打开 | 1（1.3；测试列表 1.6） | 无 | `1-TASK` |
| 仓库 | `Repositories` | 工作 | 1（1.1） | 无 | `1-REPO` |
| Worktree | `Worktrees` | 工作 | 只读清单 1（1.7）；一键清理 5（5.1） | 第五期起：清理绿色项 | `1-WT`、`5-WT` |
| Worktree 清理会话 | `WorktreeCleanup` | 从 Worktree 打开 | 5（5.2） | 授权后归档并删除 | `5-WTC` |
| 文档 | `Docs` | 工作 | 阅读 1（1.5）；引用与发起 4（4.2） | 第四期起：发起文档会话 | `1-DOCS`、`4-DOCS` |
| 文档会话 | `DocsSession` | 「最近」 | 4（4.1–4.4） | 会话内写 `docs/`、提交、Draft PR、丢弃 | `4-DSES` |
| Agents | `Agents` | 接入 | 1（1.4） | 无，只给命令 | `1-AGENTS` |
| Skills | `Skills` | 接入 | 1（1.4） | 无 | `1-SKILLS` |
| Hooks | `Hooks` | 接入 | 1（1.4） | 无 | `1-HOOKS` |
| CLI | `CLI` | 接入 | 1（1.4） | 无，卸载只给命令 | `1-CLI` |
| Bots | `Bots` | 接入 | 1（1.8）；登记归属与 Slack 渠道 3（3.3、3.4） | 无，只给命令 | `1-BOTS`、`3-BOTS` |
| 架构 | `ArchModules`（`ArchLayers` 并入，见 C20）、`ArchSequence`、`ArchTopology` | 观测 | 现有模块页 1（1.1，U2）；模块（按层分带）、时序、拓扑三张底图与图层 2（2.1–2.4） | 无 | `1-ARCH`、`2-ARCH` |
| 测试 | `Tests` | 观测 | 1（1.6） | 无 | `1-TESTS` |
| 系统 | `System` | 观测 | 1（1.1；notify 会话修正 1.8） | 无 | `1-SYS` |
| 工具 | `Tools` | 观测 | 1（1.1；展示字段 1.4） | 无 | `1-TOOLS` |
| 设置 · Agent 接入 | `Settings` | 底部 | 3（3.2） | `~/.repo-harness/config.json` | `3-SET` |

16 个页面是：首页、看板、仓库、Worktree（含清理会话）、文档、文档会话、Agents、Skills、Hooks、CLI、Bots、架构、测试、系统、工具、设置。加上任务抽屉，与 PRD「页面需求」一致。

## UX Feature Guard

- Requested outcome: 控制台只做三件事：管理开发环境，管理开发与架构文档，跟踪进度（PRD「背景与目标」）。写入只有三种有界入口（D1），每次写入都有审计。
- Frozen behavior / rules that must not change:
  - column、attention、merge readiness、检查和评审只来自 Dev Activity 投影与 GitHub（`src/core/dev-activity/projection.ts:170-178`），UI 不重算。
  - Agent 身份只来自已验证的会话绑定（G2），不从分支名或 PR 作者推断（`operator.md` §3.1 第 8 条）。没有已验证绑定时写「agent 未知」。
  - 请求先查身份再进路由：Host 精确匹配回 421，Origin 不符回 403，`/api/` 的 `Sec-Fetch-Site` 只收 `same-origin` 和 `none`（`src/effects/operator/server.ts:1428-1461`）。
  - GET 不启动工作，只读后台 collector 的缓存（`operator.md` §3.1 第 3 条；`src/effects/dev-activity/collector.ts:384-387`）。
  - 浏览器拿不到 secret 和本机绝对路径（`operator.md` §3.1 第 7 条；`src/core/operator/agent-config.ts:36`、`src/core/dev-activity/decode.ts:34`、`src/core/security/secret-patterns.ts:17`）。
  - 派活只走 Bot → CLI → herdr（`operator.md` §3.1 第 6 条；D9）。控制台不向用户 harness 里的编码会话发消息、steer、停止或注入内容。
  - 删除、凭据与权限、main 发布、发布与生产仍是硬边界（`CLAUDE.md` Workflow）。
  - 现有主题切换和语言切换保留（`src/operator-web/App.tsx:334-339`、`src/operator-web/theme.ts:8-20`、`src/operator-web/i18n.ts:10-14`）。画布没有画这两个控件，这是画布遗漏，不是要删。
- Requested action: 按期开放三种写入（D1），其余都是只读视图、外链或可复制命令。
  1. 第三期：启用或关闭 agent，设用途和默认文档 agent，写 `~/.repo-harness/config.json`。
  2. 第四期：文档会话在新 linked worktree 里改 `docs/` 里人写的文档（D4），用户看过完整 diff 后由服务端提交、推送并开 Draft PR（D5），或丢弃。
  3. 第五期：一键清理绿色 worktree；非绿色项经清理会话逐项授权，先归档再删（DW）。
- Exact payload acted on: 请求体以 PRD「写入 API」为准，本稿不另列字段。指令和载荷分开：
  - 设置：载荷是 `changes[{runtime, enabled, uses}]` 和 `default_docs_runtime`，带 `expected_revision`。按钮文字不是载荷。
  - 文档会话：指令是用户输入的说明文字；载荷是 `citations[]`（`{path, start_line, end_line, range_sha256, file_sha256, commit}`）和 `repository_id`。说明文字原样交给 agent，服务端不改写。
  - 提交：载荷是 `expected_head`、`expected_diff_sha256` 和提交说明；用户看到的 diff 就是被提交的 diff。
  - 清理：载荷是服务端发的稳定 id 和 `expected_digest`；非绿色项另带 `approvals[{id, loss_sha256, plan_sha256}]`。浏览器从不传路径。
- Forbidden extras / non-goals:
  - 在控制台里写代码；向编码会话发消息、steer、停止或注入内容。
  - 从浏览器执行宿主投影（install、update、profile 切换）、registry 清理、卸载 CLI、改 MCP 接入、收回 OAuth 客户端。这些只给命令。
  - 手机版专门设计（窄屏按 U4：760px 以下侧栏变抽屉）；拖拽改列或派工；自动派工。
  - 保存或显示凭据；改宿主的 `~/.claude`、`~/.codex`。
  - 在 UI 里跑测试、设红灯门槛、开写测试的会话（D8）。
  - 经 MCP 派活（D9）；读 Slack（D10）。
  - 文档会话写 `plans/`、`.archcontext/model/`、生成目标、生成区、指令文件或源码（D4）。
  - 显示 OAR 以外的内部实现名；OAR 只出现在设置页。
  - 按 worktree 放了多久给删除建议。

### Role-aware User-visible Concept Boundary

- Audience / role for this surface: 本机的人类 operator。没有角色区分。
- Allowed visible concepts: 仓库 id 与健康度；任务标题、阶段、owner agent（已验证时）；PR 编号、检查、评审；分支名和短 SHA；worktree 目录名和稳定 id；hook 路由与 profile；skill 名；CLI 名、版本、来源、账号名；OAR runtime 名（只在设置页）；`docs/` 下的相对路径和行范围；文档会话的消息正文、工具类别、相对路径、执行状态和 diff；测试文件、通道、结果；架构节点与边；Bot 名、MCP profile、授权仓库、读写模式、token 剩余天数；herdr 期望版本与实际版本。
- Required outcome/recovery concepts that must stay visible: 哪个来源不可用、在哪个仓库、数据停在多久以前；漂移和对应的那一条修复命令；「需要登录」「未安装」和命令；Draft PR 链接，或停在哪一步与重试入口；task inbox 的投递回执；写入失败的错误码、原因和下一步（`next_action`）；「待核对」状态；清理时每一项的结果或跳过原因。
- Backstage-only concepts that must never appear as user-visible: 本机绝对路径（`~` 开头的模板路径和 `{common}`、系统临时目录这类模板路径除外，见 PRD「CLI 清单」隐私一条；仓库外的绝对路径换成 `[private path]`）；stderr 和子进程原始输出；环境变量的值（安装说明里可以写变量名）；token、passphrase、webhook URL、cookie 里的写 token；CLI 返回的邮箱；编码会话的终端文字、prompt 和工具参数；文档会话和清理会话的原始工具参数、完整命令、终端输出和推理过程（D2）；凭据类文件的内容；registry 内部结构。
- Role-gated exceptions, or `none`: none。
- Authority for each exception, or `N/A`: N/A。

`UX-operator-console-uiux-N1` 来自上面的非目标和后台概念：任何页面都没有向编码会话写入的控件，会话记录里也没有原始工具参数和完整命令。

### Authority & Reuse Map

| Responsibility / datum | Existing authority or reuse target | Decision | New-surface justification |
| --- | --- | --- | --- |
| 侧栏、路由、仓库切换 | `src/operator-web/App.tsx:176-236`（导航）、`src/operator-web/workspace-location.ts:7-60`（8 个 workspace 与 hash 路由）、`src/operator-web/RepositoryWorkspace.tsx:125`（`RepositorySwitch`） | extend | 新增页面的路由进同一张 `WORKSPACES` 表；不另立路由 |
| 主题与语言 | `src/operator-web/theme.ts:8-50`（`<html data-mode>`）、`src/operator-web/i18n.ts:10-14`、`:891-902`（zh 按 en 的键做类型检查） | reuse | — |
| 视觉 token | `operator-console/design-system/tokens.json`（design system 的逐字节副本） | new | 现有 `src/operator-web/app.css` 只有 Kumo 默认值；G13 已定两套主题 |
| 看板列、attention、阶段 | `src/core/dev-activity/projection.ts:129`、`:170-178`；`src/core/dev-activity/types.ts:8`、`:91`；`src/effects/dev-activity/collector.ts:35`（60 s 一轮） | extend | attention 只有 `ready_to_merge` 一种（`types.ts:91`），G19 要加三类 |
| 看板页 | `src/operator-web/Board.tsx:317`（`Board`），部分可用和不可用状态在 `:383-389` | extend | — |
| 任务抽屉 | `src/operator-web/ItemDrawer.tsx:120`、`src/operator-web/Drawer.tsx`、`TaskEvidence.tsx`、`TaskDiff.tsx` | extend | 加「跟进」命令块（G15）、执行状态（G2）和「这次改到的测试」（1.6） |
| 给 owner 发消息 | `repo-harness fleet message send`（`src/cli/commands/fleet.ts:412`） | reuse via Bot | 控制台只读显示 inbox 和回执（`RepositoryWorkspace.tsx:253-295`），不发 |
| 仓库页与失效登记 | `src/operator-web/RepositoriesPage.tsx:12`、`:61-71`（`fleet prune` 命令、unreachable 状态） | reuse | — |
| Agents、Skills、Hooks | `src/operator-web/SetupPages.tsx:298`、`:328`、`:416`；`src/core/setup/types.ts:138`（`SetupSnapshotV2`）；`src/cli/hook/route-registry.ts:69`（`ROUTES`） | extend | Hooks 的次数和拒绝要读 hook 事件（G16）；profile 路由数从 registry 读（G17） |
| 系统页 | `src/operator-web/SystemPage.tsx:67`；notify 状态 `src/effects/operator/notify-status.ts:126-131` | extend | 读插件状态时补 `--session`（PRD「Bot 接入管理」） |
| 工具页 | `src/operator-web/ToolsPage.tsx:118`；`assets/tool-catalog.v1.json`（7 项） | extend | catalog 加作者、标签、是否随 profile 安装（G14） |
| 架构模块页 | `src/operator-web/ArchitectureWorkspace.tsx:239`、`src/operator-web/ModuleGraph.tsx:73`；`.archcontext/model/` | extend | 模块（按层分带，即分层视图）、时序、拓扑三张底图和五个图层（G11、G22、G27、#1145），布局依赖见 D7 |
| HTTP 路由与写入门 | `src/effects/operator/server.ts:106-125`（17 条 GET 路由，全部 `write:false`）、`:1440-1444`（非 GET 回 405）、`:320-326`（`errorBody`） | extend | 第三期起按 PRD「写入 API」加 POST 白名单；第一期只加 GET |
| 错误体 | `server.ts:320-326` 已是 `{error:{code,message,next_action}}`；`server.ts:1460` 仍回裸 `{code}` | reuse | 新路由只用 `errorBody` |
| 锁与 worktree 删除 | `src/effects/locking/exclusive-directory-lock.ts`；`src/effects/state/coordination-worktree-topology.ts:234`（`cleanupExactWorktree`） | reuse / extend | 清理会话要一个带授权的删除模式（G25） |
| Worktree 绿色判定 | `contract-worktree sweep` 的谓词（`coordination-worktree-topology.ts`）；`scripts/worktree-merge-lib.sh` | reuse | 不另写判定；看板的 `cleanup_pending`（`projection.ts:162`）退役 |
| 文档阅读 | 无（#609 删文档页，#925 删 docs graph） | new | G7：realpath 后再判允许与拒绝列表；MCP 的 `paths.ts` 只查逻辑路径，不能直接复用 |
| 文档会话与清理会话 | 无（coding host 在 #932 删除） | new | G5：docs host 加 OS 边界；评审宿主的隔离只禁写 |
| CLI 清单 | 无 | new | G18：只读 collector |
| Bots | 无 | new view | G29–G32：只读 collector；改接入只给命令 |
| 测试页 | `scripts/select-ci-coverage.ts`、`scripts/test-file-durations.json`、`.ai/harness/runs/` | new view | D8：只读投影，带 drift 检查 |
| 设置 | `~/.repo-harness/config.json`（四个键） | new | G9：加 `agents` 段 |

### Observable & Copy Contract

- Happy/loading/empty states that can actually occur: 有分组的看板；某一列为空；没有等你处理的事；没有文档会话；全部测试通过；CLI 已登录；没有可回收的 worktree。首次加载显示 Kumo `Loader`（现有，`Board.tsx:2`）。空状态用一行字和至多一个像素角色。
- Invalid/unavailable state: 来源横幅写来源、仓库和数据时间，例如「GitHub 在 Ancienttwo/repo-harness-page 超时，这个仓库的 PR 状态停在 6 分钟前」，链接系统页。服务没起来时显示 unreachable 状态和 `repo-harness operator serve`（`RepositoriesPage.tsx:71`）。agent 状态没有已验证来源时显示空心点和「未知」。写入失败显示错误码对应的原因和 `next_action`。结果审计写失败时显示「待核对」，不报失败，也不自动重放。
- Machine-readable output contract: 新路由的错误一律 `{error:{code,message,next_action}}`（`server.ts:320-326`）。写入响应字段与错误码以 PRD「写入 API」为准。响应里不出现绝对路径、stderr、环境变量、token、webhook URL；测试同时断言必需字段存在和这些内容不存在。
- Canonical copy source / sync sites: 中文文案以本稿和画布为准，进 `src/operator-web/i18n.ts` 的 zh 词条；en 词条按同一组键补齐（`i18n.ts:891-902` 的类型检查）。写法规则见 design system README「Writing UI copy」。本稿「画布修正」一节覆盖画布上的错误文案。
- Fail-loud rule: 来源失败时标「过期」或「不可用」，写来源和时间，不换成空列表或 0。写入失败显示原因，不假装成功。权威值缺失时显示「未知」，不用本地规则补值。

### 画布修正

下列画布内容与代码事实或已批决定冲突。实现按本表，不按画布。

| # | 画板 | 画布内容 | 改为 | 依据 |
| --- | --- | --- | --- | --- |
| C1 | `Task` | 「阶段来源」有一行「ledger · rev 7 verifying」 | 只写「Git + GitHub」；仓库详情另有 Fleet 阶段 | ledger 在 #785 删除；`src/core/dev-activity/` 不读 ledger |
| C2 | `System` | 数据来源里有「Pipeline ledger · 3 张卡补充阶段」；边界说明写「Agent 身份只来自 ledger 或已验证的 runtime 绑定」 | 删掉 ledger 一行；身份一句写「只来自已验证的会话绑定」 | 同 C1；G2 |
| C3 | `System` | 边界说明写「写入只有有限几种：发给任务 owner 的消息、文档会话…、开 Draft PR」 | 只列当前一期已开放的写入（第一、二期写「这个控制台不写入」）；发消息写成「交给 Bot」 | D1；PRD「写入与权限边界」第一条 |
| C4 | `System` | 「采集间隔 30s」 | 分开写两个值：后台采集 60 s，浏览器刷新 30 s，都从运行时取 | `collector.ts:35`、`useObservationRefresh.ts:3` |
| C5 | `WorktreeCleanup` | 会话事件行显示完整命令，如 `git status --porcelain=v2 --branch` | 显示操作类别和摘要，如「读取 worktree 状态 · 11 项」 | D2（清理会话与文档会话共用事件与可见范围） |
| C6 | `Home`、`Agents`、`Hooks`、`Tests`、`Tools` | 一屏同时出现两个像素角色：首页 `buddy-happy` 与 `buddy-party`；Agents `donkey-bags` 与 `buddy-wrench`；Hooks `hook-cap` 与 `buddy-alert`；测试 `bug` 与 `buddy-sleep`；工具 `hook-carrot` 与 `donkey-bags` | 一屏至多一个。状态角色（alert、wrench、bug、cloud-off）优先于页头装饰。侧栏的像素胡萝卜是标识，不算角色 | design system README「Pixel characters」 |
| C7 | 所有画板 | 没有主题和语言切换 | 保留现有切换，放在侧栏底部 operator 状态旁 | `App.tsx:334-339` |
| C8 | `Worktrees` | 「复制命令」「查看命令」没有命令文字 | 绿色和黄色项都给 `repo-harness worktrees clean --ids <id> --expected-digest <digest>`；黄色项在终端会要求逐项确认（非交互环境拒绝）。红色项的「查看占用」只显示占用原因 | PRD「Worktree 管理」CLI 对等 |
| C9 | `Home` | 第一期就有发起文档会话的输入框 | 第一、二、三期不显示输入框和「新会话」；第四期起显示 | D1；PRD 切片 1.1「不放占位页」 |
| C10 | 侧栏 | 第一期就有「设置」和「最近」 | 设置随第三期出现；「最近」随第四期出现 | 同 C9 |
| C11 | `Hooks` | 「最近拒绝」显示仓库外的绝对路径 `/tmp/other-repo/README.md` | 仓库外的路径显示 `[private path]`；仓库内只显示相对路径 | `operator.md` §3.1 第 7 条；G16 |
| C12 | `Agents` | 修复命令是 `repo-harness install --profile full`，没有宿主 | 带上宿主：`repo-harness install --target claude\|codex\|both --profile minimal\|full`；投影一致时给 `repo-harness update` | `src/cli/commands/install.ts:3`；PRD「开发环境管理」修复命令 |
| C13 | `Bots` | 命令缺参数，如 `repo-harness mcp access set --repo --mode read_only` | 写出参数：`--repo <仓库> --mode read_only\|read_write`、`repo-harness mcp clients revoke <client-id>` | PRD「Bot 接入管理」 |
| C14 | `Bots` | 第一期就按已登记的 Bot 列表（「3 个已登记 · 1 个未登记」），并给 `repo-harness bots register`、`mcp clients revoke` 命令 | 第一期按三条路分节：MCP 客户端、通知渠道、herdr pane；Bot 列表、登记和 revoke 命令随第三期（3.3）出现，那时这些命令才存在 | G30 在第三期；PRD 切片 1.8、3.3 |
| C15 | `Settings` | Pi Durable 列在主列表，写「随 OAR 内置」 | Pi Durable 与 Cursor、Mister Morph 一起放在「需要额外安装」 | PRD「开发环境管理」runtime 清单：OAR 0.62.1 默认注册表只有 7 个 |
| C16 | `Settings` | 开关改了就生效，没有保存按钮；没有选默认文档 agent 的控件 | 一个「保存」按钮把本次全部改动作为一个 `changes[]` 提交，带 `expected_revision`；加默认文档 agent 的单选，只列已启用文档用途的 runtime | PRD「写入 API」`POST /api/v1/settings/agents` |
| C17 | `Settings` | 「通过 Console Runtime API 接入」；子导航有「通用、文档会话、外观与语言、关于」 | 不写 Console Runtime API；子导航只有「Agent 接入」，其余不做，不放占位 | PRD「背景与目标」非目标：不显示 OAR 以外的内部实现名；C9 |
| C18 | `Docs` | agent 选择列出未安装的 runtime（置灰） | 只列已启用文档用途的 runtime；其余去设置页启用（链接「管理 ›」） | PRD「写入 API」422 `runtime_not_enabled` |
| C19 | `DocsSession` | 会话状态写「等你回复」；没有提交说明；运行中没有「停止」 | 状态写「等你审阅」（与首页一致）；提交按钮上方加一行可改的提交说明，默认取会话标题；运行中在发送旁显示「停止」 | PRD「文档会话」状态图；`POST …/commit` 的 `message`；`POST …/stop` |
| C20 | `ArchLayers` | 单独一张分层底图 | 并入模块底图：模块底图已按模型的 `model.layers` 分带，违规图层画逆着层顺序的 import；视图切换为「模块 · 时序 · 拓扑 · 模块列表」 | #1145；`architecture-map-layout.ts` 的层带，`constraints check` 的层方向 |

### BDD Acceptance Scenarios

场景 id 的格式是 `UX-operator-console-uiux-<期>-<页面>-<类><序号>`。类：`P` 正向，`N` 非目标，`F` 权威失败。期是场景能被测试的那一期。三条不带期和页面的场景是跨页面的锚点，模板和确认清单引用它们。contract、测试名和评审证据原样引用这些 id。

#### 跨页面锚点

- `UX-operator-console-uiux-P1`：Given 第三期已上线且写入通道已开放，When 用户在设置页启用 Codex 的文档用途并保存，Then 服务端先写意图审计再改 `config.json`，返回新的 `config_revision`，页面显示已保存；其余页面仍没有写入控件。
- `UX-operator-console-uiux-N1`：Given 任意一期、任意页面，When 用户查看页面上的全部控件，Then 没有任何输入或按钮向用户 harness 里的编码会话发消息、steer、停止或注入内容；会话记录里没有原始工具参数和完整命令。
- `UX-operator-console-uiux-F1`：Given 任意一个来源不可用或过期，When 依赖它的页面加载，Then 页面写出哪个来源、哪个仓库、数据停在多久以前和下一步；不把它显示成空列表、0 或「成功」。

#### 外框

- `1-SHELL-P1`：Given 第一期上线，When 用户打开任意页面，Then 侧栏显示工作、接入、观测三组里本期已上线的条目；仓库切换在标识下方；跨仓库页（首页、看板、仓库、接入各页、系统、工具）显示「全部仓库」，单仓库页（任务抽屉、文档、架构、测试）显示当前仓库，格式是 `owner · 分支 · 短 SHA`。
- `1-SHELL-P2`：Given 用户打开架构页，When 页面加载，Then 侧栏收起成 64px 图标栏；其余页面默认展开；用户的收起选择只存在本浏览器。
- `1-SHELL-N1`：Given 第一期上线，When 用户查看侧栏和路由，Then 没有设置、文档会话和「最近」的条目，也没有它们的占位页；页头没有第二个仓库切换。
- `1-SHELL-F1`：Given `operator serve` 没在运行，When 页面刷新，Then 显示 unreachable 状态和可复制的 `repo-harness operator serve`，不显示空看板。

#### 首页

- `1-HOME-P1`：Given Dev Activity 有 3 项 attention，When 用户打开首页，Then 问候句写「有 3 件事等你处理」，「等你处理」按等待时长排序，每行有原因、仓库、PR 和 agent（未验证时写「agent 未知」）。
- `1-HOME-P2`：Given 今天有已合并的 PR、失败的检查和打开的 `[CI repair]` issue，When 用户打开首页，Then「今天」一节有五行：合并数、等得最久的 3 项、检查失败、CI 修复、可回收空间；每行链接到拥有这项数据的页面。
- `1-HOME-N1`：Given 第一期上线，When 用户打开首页，Then 没有发起文档会话的输入框、agent 选择和「开始会话」按钮；「继续」只列任务。
- `1-HOME-F1`：Given 已合并 PR 的查询超出上限（G28），When 首页加载，Then 只有「合并」一行标不可用并写原因，其余四行照常显示；不显示 0。
- `4-HOME-P1`：Given 第四期上线且至少一个 runtime 已启用文档用途，When 用户在首页输入说明、引用一段 `docs/` 并点「开始会话」，Then 服务端回 201 和 `session_id`，页面打开这个文档会话。
- `4-HOME-F1`：Given 控制台运行在 Linux 或 Windows，When 用户点「开始会话」，Then 页面显示 `platform_unsupported` 的原因和下一步，不建 worktree，不退回无隔离运行。

#### 看板

- `1-BOARD-P1`：Given 一组 PR 分别处于可合并、评审要求修改、与 main 冲突、检查失败，When 用户打开看板，Then「等你处理」列出四类原因，按等待时长排序（G19）；「进行中」默认显示 4 条，其余折叠成「显示其余 N 个」；「今天已发布」默认折叠。
- `1-BOARD-N1`：Given 看板已加载，When 用户查看卡片和行，Then 没有拖拽、改列或派工控件；阶段和原因只来自 Dev Activity 投影；全部检查通过但投影不是 `ready_to_merge` 的行不显示「可合并」。
- `1-BOARD-F1`：Given GitHub 在一个仓库超时，When 看板加载，Then 横幅写出这个仓库和 PR 状态的数据时间并链接系统页；这个仓库的行标过期；其他仓库照常显示。

#### 任务抽屉

- `1-TASK-P1`：Given 任务的会话绑定全部核对通过（binding 哈希、`native-session.json`、进程身份、没有 `closed.json`），When 用户打开任务抽屉，Then owner 一行显示 agent 和状态并标「只读观测」；「跟进」给三条可复制命令：Herdr pane 位置、`claude --resume <id>` 或 `codex resume <id>`、交给 Bot 的 `repo-harness fleet message send …`。
- `1-TASK-P2`：Given 任务的 diff 改到测试文件且 verification plan 有 base 失败、head 通过两条结果，When 用户查看「这次改到的测试」，Then 该检查标「红→绿」；只有一条结果的检查不标「红→绿」，没有结果的标「无结果」。
- `1-TASK-N1`：Given owner 是运行中的 Claude Code 会话，When 用户打开任务抽屉，Then 抽屉里没有向这个会话发消息、steer 或停止的输入和按钮；task inbox 只读，显示消息和投递回执。
- `1-TASK-F1`：Given binding 哈希不符、provider 进程已退出或存在 `closed.json`，When 用户打开任务抽屉，Then owner 一行写「没有已验证的会话」，不显示 agent 名，不从分支名或 PR 作者推断。

#### 仓库

- `1-REPO-P1`：Given registry 有 9 个仓库，When 用户打开仓库页，Then 默认显示 6 张卡，每张有健康度、读写模式、worktree 数和打开的 PR 数；点卡片进这个仓库的看板。
- `1-REPO-N1`：Given registry 有失效登记，When 用户展开失效登记，Then 只给 `repo-harness fleet prune` 和 `repo-harness fleet prune --apply --expected-revision <digest>` 两条命令；页面没有删除按钮。
- `1-REPO-F1`：Given GitHub 对一个仓库超时，When 仓库页加载，Then 这张卡写「GitHub 超时 · Git 可读」和数据时间，PR 数标过期，不显示 0。

#### Worktree

- `1-WT-P1`：Given 这台机器有绿、黄、红三类 worktree，When 用户打开 Worktree 页，Then 磁盘图按仓库分三色；每行写目录名、仓库、分支、来源、大小、原因和「会丢」；绿色判定与 `contract-worktree sweep` 的谓词一致。
- `1-WT-N1`：Given 第一期上线，When 用户查看 Worktree 页，Then 没有勾选框、「清理选中」按钮和「让 agent 清理」入口；浏览器响应里只有目录名和稳定 id，没有绝对路径；没有任何一行以放了多久作为删除理由。
- `1-WT-F1`：Given `du` 超时，When 页面加载，Then 大小列写「未知」和最近一次成功的时间；可回收空间不计未知项，不显示 0 B。
- `5-WT-P1`：Given 第五期上线且有 3 个绿色项，When 用户保持默认勾选并点「清理选中的 3 个」，Then 请求只带稳定 id 和 `expected_digest`；服务端在拓扑锁下逐项重核后删除，页面逐项显示已删或跳过的原因。
- `5-WT-N1`：Given 黄色和红色行，When 用户查看勾选框，Then 这些勾选框不可用；一键清理请求里出现非绿色 id 时服务端回 `not_approved` 或 `in_use`，不删任何项。
- `5-WT-F1`：Given 用户打开页面后 worktree 拓扑变了，When 用户点清理，Then 服务端回 409 `digest_changed`，页面要求刷新后重选，没有删除任何项。

#### Worktree 清理会话

- `5-WTC-P1`：Given 用户从 Worktree 页发起清理会话，When agent 交出计划，Then 绿色项默认勾选，黄色项默认不勾；每个黄色项有删留建议、理由、证据、会丢什么和归档位置；用户勾选后点「授权并执行」，服务端先把要归档的内容提交到 `docs/archive-<slug>` 分支并开 Draft PR，推送成功后才删。
- `5-WTC-N1`：Given 清理会话在运行，When 用户查看会话记录，Then 只看到操作类别和摘要（如「读取 worktree 状态 · 11 项」），没有完整命令和终端输出；红色项没有勾选框；agent 自己不归档、不删除。
- `5-WTC-F1`：Given 用户授权后某个黄色项的会丢内容摘要变了，When 服务端执行，Then 这一项跳过并标「要重新授权」，其余项照常执行。
- `5-WTC-F2`：Given 归档分支推送失败，When 服务端执行，Then 对应的 worktree 不删；页面显示停在哪一步和重试入口。

#### 文档

- `1-DOCS-P1`：Given 仓库的 `docs/` 有 markdown 文件，When 用户打开文档页并选一个文件，Then 左侧是目录树，中间是渲染后的正文，显示 HEAD commit；工作区有未提交改动的文件标「引用以提交为准」。
- `1-DOCS-N1`：Given 文档里有原始 HTML、`javascript:` 链接和 Mermaid 图，When 页面渲染，Then 原始 HTML 不渲染，链接只放行 http、https 和仓库内相对路径，Mermaid 以 strict 安全级别生成图片显示；第一期页面上没有引用和发起会话的控件。
- `1-DOCS-F1`：Given 请求的路径是 `.env`、`.git/` 下的文件或指向仓库外的软链，When 浏览器请求正文，Then 服务端拒绝并给出原因，页面显示原因，不显示内容。
- `4-DOCS-P1`：Given 第四期上线，When 用户选中一段正文并点引用，Then 引用以 `path:L起–L止` 的编号标签出现在输入区；agent 选择只列已启用文档用途的 runtime；点「开始会话」后进入文档会话页。
- `4-DOCS-F1`：Given 被引用的行在会话起点提交上内容变了，When 用户发起会话，Then 原文在文件别处唯一出现时改用新行号并在 UI 标出；否则回 409 `citation_stale`，页面要求重新引用。

#### 文档会话

- `4-DSES-P1`：Given 文档会话本轮结束、状态是「等你审阅」，When 用户在 diff 视图看完全部改动、确认提交说明并点「提交并开 Draft PR」，Then 服务端核对 `expected_diff_sha256`、提交、推送并开 Draft PR，页面显示 PR 链接；agent 没有推送权限。
- `4-DSES-P2`：Given 会话运行中，When 用户发一条后续说明并选「本轮结束后」或「插入本轮」，Then 回执显示 `prompted`、`queued` 或 `steered`；runtime 不支持插入本轮时该选项置灰并写原因（G6），不自动改成排队。
- `4-DSES-N1`：Given 会话运行中，When 用户查看会话记录，Then 只显示消息正文、工具类别、仓库内相对路径和执行状态；没有原始工具参数、完整命令、终端输出、环境变量、推理过程和绝对路径；密钥样例不出现在任何响应里。
- `4-DSES-F1`：Given 工作区里有 `docs/` 以外或生成区里的改动，When 用户点提交，Then 服务端回 422 `path_outside_scope` 或 `generated_region` 并列出文件，不提交。
- `4-DSES-F2`：Given 推送成功但开 PR 失败，When 用户看页面，Then 页面写出停在「开 Draft PR」这一步；点重试从这一步继续，不重复提交，不重复开 PR。
- `4-DSES-F3`：Given 所选 runtime 的 OS 边界没有通过零模型的拒写、拒读、拒连测试，When 用户发起会话，Then 会话不启动，页面写出原因，不退回无隔离运行。
- `4-DSES-F4`：Given 用户点「丢弃」后会丢的内容变了，When 用户确认，Then 服务端回 409 `loss_changed`，不删；已推送的分支只给命令。

#### Agents

- `1-AGENTS-P1`：Given Claude Code 的 hook 路由与期望不一致，When 用户打开 Agents 页，Then 这个宿主标漂移，列出缺失条目，并给出对应的一条修复命令（如 `repo-harness install --target claude --profile full`）。
- `1-AGENTS-N1`：Given 宿主有漂移，When 用户查看页面，Then 修复只以可复制命令出现，没有安装、更新或切换 profile 的按钮。
- `1-AGENTS-F1`：Given setup 快照的来源状态是失败或过期，When 页面加载，Then 写「过期」或「不可用」和最近成功时间，不显示「一致」。

#### Skills

- `1-SKILLS-P1`：Given setup 快照里有 23 个 skill 包，When 用户打开 Skills 页，Then 每个宿主一列，写已装、缺失或漂移，缺失的给安装命令。
- `1-SKILLS-N1`：Given catalog 没有「推荐」字段（G12 未补），When 页面渲染，Then 不显示「推荐」标签，也不按名字猜。
- `1-SKILLS-F1`：Given setup 快照不可用，When 页面加载，Then 来源横幅写原因和时间，不显示空列表。

#### Hooks

- `1-HOOKS-P1`：Given hook 事件日志可读，When 用户打开 Hooks 页，Then 每个宿主列出 5 个事件的路由、24 小时调用次数和最近拒绝；各 profile 的路由数从 `ROUTES` 读（G17）；拒绝记录里的路径已脱敏。
- `1-HOOKS-N1`：Given collector 还没有读到 hook 事件，When 页面渲染，Then 次数和拒绝不显示示例数字；拒绝记录里仓库外的路径显示 `[private path]`，不显示绝对路径；页面没有改路由或切 profile 的按钮。
- `1-HOOKS-F1`：Given hook 事件日志读不到，When 页面加载，Then 次数写「未知」并写原因，路由表照常显示。

#### CLI

- `1-CLI-P1`：Given 这台机器有 Homebrew、npm 和脚本装的 CLI，When 用户打开 CLI 页，Then 每个 CLI 显示来源、版本、占用、最近使用、GitHub 链接和星数；90 天没用过、也不是别的包依赖的标「没在用」，并给按来源生成的一条卸载命令。
- `1-CLI-N1`：Given 一个 CLI 已登录，When 页面显示登录状态，Then 只显示账号名，不显示邮箱和 token；页面没有卸载或登出按钮；本机路径只以 `~` 开头的模板形式出现。
- `1-CLI-F1`：Given 同名命令对应几个仓库且包名对不上，或 `gh` 查星数失败，When 页面渲染，Then 列出候选仓库或只给官网链接，不显示星数。

#### Bots

- `1-BOTS-P1`：Given 有两个 MCP OAuth 客户端和一个 notify 插件，When 用户打开 Bots 页，Then 三条路（MCP、Slack 等通知渠道、herdr）各一节；MCP 一节每个客户端写名字、profile、授权仓库、读写模式、token 剩余天数、最近一次调用；改接入只给现有命令（`repo-harness mcp access set --repo <仓库> --mode …`）；第一期没有按 Bot 的列表（C14）。
- `1-BOTS-N1`：Given Bots 页已加载，When 检查响应和页面，Then 没有 token、passphrase、webhook URL 和绝对路径；collector 不带 `--live`；页面没有派活或发消息的控件，也没有经 MCP 派活的入口。
- `1-BOTS-F1`：Given 本机 herdr 低于观测 pin 0.9.5，When 页面加载，Then herdr 一节写「期望 0.9.5（schema 2ecf19a9），实际 0.9.3」，执行状态标不可用，不写「没连上」。
- `3-BOTS-P1`：Given 第三期上线且 Bot 已用 `repo-harness bots register` 登记，When 用户查看 MCP 审计、任务消息和派活记录，Then 每条都对到 Bot 名；对不上的写「未登记」。
- `3-BOTS-N1`：Given Slack 渠道已配置，When 用户查看 Slack 一节，Then 只显示是否配置、每个渠道最近一次投递的时间和结果、频道名和跳转链接；没有 Bot 之间对话的内容。

#### 架构

- `1-ARCH-P1`（U2）：Given 第一期上线，When 用户打开架构页，Then 现有模块列表和一跳依赖图在新外框里照常工作，没有新图层。
- `2-ARCH-P1`：Given 第二期上线，When 用户打开架构页，Then 默认是模块底图并打开「今日变更」图层；节点和边来自 `archctx export native`，节点大小按行数，能力之间的边粗细按 import 次数；侧栏收起。
- `2-ARCH-P2`：Given 用户在模块底图（按模型的层顺序分带，即分层视图）、时序或拓扑底图上，When 选中一个元素，Then 右侧面板显示代码量、依赖边、相关 PR 或违规项和可复制的命令。命令是 collector 运行的那条 archctx 读取，archctx 的回答给出修复办法。时序底图一条 flow 一张图，每个 OS 进程一个框，按 `deployed-on` 关系找进程，找不到写「进程未知」和原因。
- `2-ARCH-N1`：Given archctx 还没有导出 ADR 的 `appliesTo`（arch-context#407），When 用户查看图层开关，Then「决策」图层不可用并写原因；页面上没有手写数字，也没有改模型的控件。
- `2-ARCH-F1`：Given CodeGraph 索引缺失或过期，When 违规图层加载，Then 依赖和 flow 证明写「未知」；collector 不建索引。

#### 测试

- `1-TESTS-P1`：Given `tests/` 有 302 个测试文件，When 用户打开测试页，Then 可以按目录或按架构能力分组，每组显示文件数、用例数、通道和记录耗时；页面显示最近一次日常全量、打开的 `[CI repair]` issue 和可复制的运行命令。
- `1-TESTS-N1`：Given 测试页已加载，When 用户查看控件，Then 没有运行测试的按钮，也没有红灯门槛；没有结果的检查不显示「通过」。
- `1-TESTS-F1`：Given CI 还没有逐用例的 JUnit 结果，When 页面加载，Then 用例级结果写「无结果」，文件级清单照常显示。

#### 系统

- `1-SYS-P1`：Given 各来源正常，When 用户打开系统页，Then 每个来源一行，写状态、耗时和数据时间；服务一节写地址、只接受回环地址、后台采集间隔和浏览器刷新间隔。
- `1-SYS-N1`：Given 系统页已加载，When 用户查看边界说明，Then 只列当前一期已开放的写入，不把「给 owner 发消息」列为控制台的写入；页面没有绝对路径和子进程原始输出。
- `1-SYS-F1`：Given GitHub 对一个仓库不可用、runtime 来源未开启，When 页面加载，Then 横幅写「部分可用」和各状态计数；不可用的来源写原因和数据时间，未开启的来源写「未开启」。

#### 工具

- `1-TOOLS-P1`：Given catalog 有 7 个条目，When 用户打开工具页，Then 每个条目是一张卡片，有作者、标签和外链；「本机报告」复制 `repo-harness run check-agent-tooling`（`ToolsPage.tsx:16`）。
- `1-TOOLS-N1`：Given 工具页已加载，When 用户查看卡片，Then 没有安装或启用按钮，只有链接和命令。
- `1-TOOLS-F1`：Given 条目的状态是 `unknown`，When 页面渲染，Then 写「未知」，不显示「已安装」。

#### 设置

- `3-SET-P1`：Given 第三期上线，When 用户启用 Codex、勾选文档用途、把它选为默认文档 agent 后点「保存」，Then 这三项改动在一个请求里提交，服务端返回新的 `config_revision` 和实际改动的键，页面显示已保存。
- `3-SET-N1`：Given 设置页已加载，When 用户查看表单，Then 没有凭据输入；评审用途只能选 claude 或 codex，选别的回 422 `use_not_supported`；隔离没验证的 runtime 的文档用途不可选并写原因；页面不改 `~/.claude` 和 `~/.codex`。
- `3-SET-F1`：Given 另一个窗口先保存过，When 用户用旧的修订号保存，Then 服务端回 409 `revision_conflict`，页面要求重新加载，没有写入。
- `3-SET-F2`：Given 意图审计写不进去，When 用户保存，Then 服务端不执行写入，页面显示原因。

## 已确认的待定项（U1–U5）

用户 2026-10-27 在编排会话里确认，每项都按建议定：「#980 的设计稿 U1–U5 已确认，开始派前端 0.2 和 route wiring。」0.2 和 1.1 按下表写。

| # | 问题 | 代码事实 | 决定（2026-10-27） |
| --- | --- | --- | --- |
| U1 | 默认主题：PRD 已定「亮色 Paper 为默认」，代码默认跟随系统 | `theme.ts:14-20`：没存选择时返回 `system` | 主题跟随系统；系统是亮色时就是 Paper。不改成固定亮色 |
| U2 | 第一期架构页：PRD 第一期清单没有架构，但「页面需求」说现有页面全部保留 | 现有模块页 `ArchitectureWorkspace.tsx:239`、`ModuleGraph.tsx:73` | 第一期把现有模块页原样搬进新外框；第二期换成底图和图层 |
| U3 | 任务抽屉的形态：画布画的是两栏详情页（左列任务列表），PRD 和代码都叫抽屉 | `ItemDrawer.tsx:120` 用 `DrawerFrame`（`Drawer.tsx`） | 任务视图保留抽屉，内容按画布的分节排；不新增详情页路由 |
| U4 | 窄屏：PRD 不做手机版，现有代码有窄屏底部导航，NavRail 规范写 760px 以下侧栏变抽屉 | `App.tsx:179` | 760px 以下侧栏变抽屉；不为手机单独设计页面 |
| U5 | 默认语言：画布和 design system 写简体中文，代码默认英文，按浏览器语言选择 | `i18n.ts:13`、`:1793` | 保持现有语言解析；中文用户自动看到中文 |

## 文档问题

PRD、画布和 design system 里与代码事实或彼此不一致的地方。本稿已按右列写；源文档的修改由编排会话记到 GitHub issue。画布本身的错文案见「画布修正」。

| # | 位置与原文 | 问题 | 证据 | 建议改法 |
| --- | --- | --- | --- | --- |
| I1 | PRD「背景与目标」：「设计稿在 设计画布 上」 | 链接是 `claude.ai/code/artifact/8d9f19a4…`，与页头的画布链接不同 | PRD 页头 Design 一行是 `JVJiUztNTXwx1wvmFwdcyw` | 两处都用页头的链接 |
| I2 | PRD「页面需求」架构一行：「ArchLayers、ArchSequence、ArchTopology」「三张底图新增」 | 漏了画布的默认画板 `ArchModules`；与「架构」一节「四张底图」不一致 | `project/canvas.json`：`ArchModules.dc.html` 标题「架构 · 模块（默认）」 | 设计稿列加 `ArchModules`；写成「模块底图改造，另三张新增」 |
| I3 | PRD「待决问题与里程碑」第一期：「先做首页待办、文档阅读」 | 第一期清单没有架构页；「页面需求」又说现有 8 页全部保留 | `workspace-location.ts:7` 有 `architecture` | 写明第一期把现有模块页搬进新外框（U2） |
| I4 | PRD「待决问题」：「你确认后再勾选」；Quick-Read：「10 项待用户确认」 | 10 项已在 2026-10-27 批准，勾选框和 Unknowns 都没更新 | #997 评论 6420993596 | 勾选并链接该评论；Unknowns 改为无（U1–U5 已在 2026-10-27 确认） |
| I5 | PRD「待决问题」：「亮色 Paper 为默认」 | 代码没存选择时跟随系统 | `theme.ts:14-20` | 按 U1 改成「跟随系统，系统是亮色时就是 Paper」 |
| I6 | PRD「信息架构」图：「侧栏分组 · 首页加 4 组」 | 图里任务抽屉和文档会话是侧栏条目；画布侧栏没有这两项（抽屉从看板打开，会话在「最近」） | 画布各画板的侧栏 | 重画图，去掉这两个条目 |
| I7 | PRD「开发环境管理」：「Pi Durable、Cursor、Mister Morph 不在默认表里」 | 画布设置页把 Pi Durable 列在主列表，写「随 OAR 内置」 | `Settings.dc.html` runtime 列表 | 改画布（C15） |
| I8 | PRD 页头：「Version 38」 | 画布接口只给版本 id，无法核对 Version 38 | 画布版本 `1793028533-d1e8` | 页头同时记版本 id |
| I9 | PRD「写入 API」：「`operator-write-boundary.test.ts`」「`operator-serve.test.ts`」 | 没写目录 | 实际是 `tests/effects/operator-write-boundary.test.ts`、`tests/cli/operator-serve.test.ts` | 写全路径 |
| I10 | 画布 `Task`、`System`：「ledger · rev 7」「Pipeline ledger」 | ledger 已在 #785 删除 | `src/core/dev-activity/` 不读 ledger | 改画布（C1、C2） |
| I11 | 画布 `System`：「写入只有有限几种：发给任务 owner 的消息」 | 控制台不发消息，交给 Bot | PRD「写入与权限边界」第一条；D1 | 改画布（C3） |
| I12 | design system README「像素角色」表 | Agents 写 `donkey`、设置写 `donkey-happy`，画布用的是 `donkey-bags`；画布有 5 页一屏两个角色，违反「一屏最多一个」 | 画布各画板引用的 `px/*.svg` | 角色表按画布改；画布按 C6 改 |
| I13 | 画布内嵌的 design system 副本 | 版本 `1793015921-3114`，比 design system 现版旧，缺 `rh-diagram-bg`、`rh-diagram-dot`、`rh-diagram-line` | 画布 `project/ds/rhconsole/tokens.json` 与 design system `project/tokens.json` 的差异 | 画布重新引入现版 design system |
| I14 | design system 组件说明 Conversation、DiagramCanvas | 前者写 G3「没定」，后者写用 ELK 布局；与 D2、D7 和 PRD「elkjs 排除」冲突 | #980 初版的英文副本 | repo 副本已改；design system 原件也要改 |
| I15 | PRD「架构」一节：「分层、时序、拓扑、模块四张底图够用」；PRD「页面需求」架构一行；design system DiagramCanvas：「Layered, sequence and topology diagrams share it」 | 分层底图已并入模块底图（C20），实际是模块、时序、拓扑三张底图 | #1145；模块底图的层带（#1121）和层方向违规（#1131） | 写成「模块（按层分带）、时序、拓扑三张底图」；画布 `ArchLayers` 标「并入模块底图」（#1148 跟踪） |

## Reference Sources

| Source | Learn | Avoid |
| --- | --- | --- |
| magpie 桌面应用外框（开源） | 按功能分组的侧栏；细线分隔的行列表配「显示其余 N 个」；marketplace 卡片网格 | 以对话为主的首页 |
| Claude 桌面应用 | 问候式首页；居中阅读列；贴底输入区 | 把对话记录当主界面 |
| `repo-harness-page@ffe3ff1`（repo-harness.com） | 纸、墨、胡萝卜三族颜色；三种字体；像素胡萝卜标识与角色 | 对比度不够的地方（design system README 已列出） |
| GitHub Actions 运行图 | 分组任务的文件夹卡片（测试页用） | — |
| Kumo 2.14.0（`@cloudflare/kumo`） | 组件层与语义 token 名 | `dark:` 前缀 |

主参考已定：magpie 的外框加本仓库 design system。

## Color

- Palette: Paper（亮）与 Ink（暗）两族中性色，胡萝卜橙是唯一品牌色。完整 token 在 [`tokens.json`](operator-console/design-system/tokens.json)，它是 design system 版本 `1793028749-cefd` 的逐字节副本。画布内嵌的 token 副本较旧（`1793015921-3114`），缺 `rh-diagram-bg`、`rh-diagram-dot`、`rh-diagram-line` 三个；实现以 repo 副本为准。
- Usage rules: 主按钮用 `color-kumo-brand`（carrot-700，白字 6.1:1）；`rh-accent` 只标「等你处理」；Codex 蓝和 Claude 赤陶只标身份，不表示状态；运行中用 `color-kumo-info`；漂移和要求修改用 `color-kumo-warning`；冲突和不可用用 `color-kumo-danger`；未知用空心点。架构画布在亮色主题下用纯白的 `rh-diagram-bg`。文字在两套主题下都不低于 4.5:1。状态在明度上也不同，不靠红绿区分。

## Typography

- Typeface(s): Space Grotesk（标题、按钮）、IBM Plex Sans（正文与界面）、JetBrains Mono（命令、路径、计数、英文小标题）。
- Scale / weights: display 28px/600，title 18px/600，heading 15px/600，阅读 16px/1.65，界面正文 14px，small 13px，caption 12px，code 12.5px。
- Language-specific notes: 中文回落苹方、冬青黑体、微软雅黑。大写等宽小标题只用于英文或协议词；中文分组名用 caption。

## Layout

- Grid / breakpoints: 侧栏 248–272px，可收起成 64px 图标栏；架构页默认收起，其余页默认展开。主区最宽 1152px；对话和文档正文的阅读列 672px；右侧面板 300–360px。只设计桌面宽度；760px 以下侧栏变抽屉（U4）。
- Spacing scale: 4、8、12、16、24、32、40、48px。
- Key components and hierarchy: NavRail（标识下方是醒目的仓库切换）、ListGroup、SegmentedTabs、StatusBadge、SourceBanner、CommandCopy、MarketCard、FolderCard、DiagramCanvas、Conversation、AgentRow、HookRouteTable。每个组件的说明在 [`design-system/components/`](operator-console/design-system/components/)。

## Motion

- Trigger -> effect pairs: 按下 → 下沉 1px；可点卡片悬停 → 上浮 2px；仓库切换打开 → 橙色边框加 3px 浅色光圈；侧栏收起 → 图标栏与全宽直接切换，没有动画；复制 → 原位显示「已复制」约 2 秒。
- Duration / easing: 120 / 180 / 280ms，`cubic-bezier(0.22, 0.61, 0.36, 1)`，不回弹。
- What must stay static: 状态点、计数和数据行（数字不做滚动动画）；`prefers-reduced-motion` 下接近零。

## Anti-patterns

- 一个按钮看起来能执行控制台执行不了的命令。改用 CommandCopy。
- 用灰色实心点表示未知状态。未知用空心点和「未知」。
- 来源失败时显示空列表或 0。
- 任何向编码会话写入的输入或按钮。
- 会话记录里出现完整命令、原始工具参数或终端输出。
- 工具和 CLI 用第三方品牌 logo。改用首字母方块。
- 一屏多于一个像素角色；角色承载文字里没有的信息。
- 页头出现第二个仓库切换。
- 还没上线的页面放占位页或灰掉的入口。
- 按 worktree 放了多久给删除建议。

## Confirmation Checklist

- [x] Value proposition is clear
- [x] Primary reference is decided
- [x] Color is accurate to the reference
- [x] Anti-pattern / don't list is explicit
- [x] Motion spec is explicit
- [x] Product rules/non-goals are frozen; instruction and payload are separate
- [x] Existing component/domain authorities have exact reuse paths; every new surface is justified
- [x] Positive, negative, and authority-failure Given/When/Then scenarios are explicit and fail loudly
- [x] Role-aware visible/backstage-only concept boundary is explicit; `UX-operator-console-uiux-N1` matches a backstage-only or non-goal concept

勾选记录的是用户在编排会话里的确认（2026-10-27）：「#980 的设计稿 U1–U5 已确认，开始派前端 0.2 和 route wiring。」

## Preview Attachment

- Preview path/link: 设计画布 https://claude.ai/artifact/JVJiUztNTXwx1wvmFwdcyw （21 张画板，亮暗两套主题，版本 `1793028533-d1e8`），画板清单见 [`operator-console/README.md`](operator-console/README.md)。链接是私有的，要 owner 分享后才能打开。
