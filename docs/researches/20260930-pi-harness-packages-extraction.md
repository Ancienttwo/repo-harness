# Pi 个人 Harness 十个 package 的萃取评估

评估日期：2026-09-30。来源文章：[@chasen_liao《当我从放弃 Claude Code 转向 Pi 并且搭建了自己的一套 Coding Harness 才知道什么叫做效率》](https://x.com/chasen_liao/status/2092963119337476137)（X Article，发布于 2026-08-27，正文经 `api.fxtwitter.com` 取得）。package 基线是 2026-09-30 当天 npm 最新版，用 `npm pack` 解包后阅读 README、docs 和关键源码。这次只做了源码与文档对比：没有安装或运行任何 Pi package，也没有做性能测量。

## 结论

计数更正：原先的 `60k` 是未经实测的估算，混入了范围外目录；本次限定 `src/{core,effects}/{fleet,engineers,collaboration,automation,operator}/**/*.ts`，实测 147 个 .ts 文件、46,008 physical LOC，详见 [职责盘点](20260930-fleet-responsibility-trace.md)。该文件主责计数不决定代码去留。

十个 package 里没有值得作为依赖引入的。可以萃取的是四个设计模式，按投入从小到大排列：

1. **交互澄清契约去重（小，可直接做）。** 仓库自己的两处规定互相矛盾：`docs/researches/20260811-minimum-effective-interview-routing.md` 规定每批最多 3 个问题，`assets/skills/repo-harness-plan/references/create.md:12` 规定只问 1 个信息增益最高的问题。pi-ask 的 `high_stakes / ambiguous / both / clear` 分类和“先取证 → 中立摘要 → 提问 → 复述决定”握手可以作为统一时的参照。宿主已有结构化提问工具（Claude `AskUserQuestion`），不需要再造工具。
2. **Skill 可见性投影到宿主原生开关（小，需先核实宿主能力）。** pi-skillful 用 480 行实现“从 `<available_skills>` 隐藏但仍可显式调用”。我们的 `assets/skill-commands/manifest.json` 已有封闭的 `discoverability` 枚举，但只影响装不装，没有“装了但不自动路由”这一档。如果 Claude/Codex 的 skill frontmatter 支持禁止隐式调用（Claude `disable-model-invocation`、Codex `agents/openai.yaml` 的 `allow_implicit_invocation`，均已核实，见第六节），就把 `explicit-setup` / `cli-reference` 这类值投影成对应 frontmatter，不另建隐藏机制。
3. **按授权延迟暴露工具 schema（中，归入已有 codemode 研究）。** pi-subagents 的新 session 默认只暴露一个很小的 `subagents_enable` loader，完整 `subagent` schema 到下一轮请求才出现；提示词写明“复杂度本身不构成授权”。这和 `docs/researches/20260930-pi-codemode-lazy-loading.md` 里 MCP exposure 的 P3 第 2 条是同一问题，放在那条边界里评估，不单独开工。
4. **重新审视 fleet 运行时调度器的必要性（大，高风险，需要先做方向判断）。** pi-subagents 把编排定位为“父 agent 的指导，不是运行时 workflow 模式”：父 agent 写一段 JS `workflowScript`，host 在沙箱里执行，并在 admission 边界强制单 writer、worktree 干净前提、预算、typed gate。repo-harness 的 fleet / engineers / collaboration / automation / operator 源码的实测范围为 147 个 .ts 文件、46,008 physical LOC（见 `20260930-fleet-responsibility-trace.md`），`20260808-repo-harness-in-opencode.md` §七还规划了确定性 fleet scheduler。宿主侧已经出现同形态的 workflow runtime（pi-subagents、Claude Code Workflow 工具）时，我们可能只需要守住 admission 不变量，把调度交给宿主。这条会改变系统边界。用户已裁定方向：调度交给宿主，repo-harness 作为上游给出指引（见第六节）；具体删哪些代码仍需先盘点。

其余六个（simplify、context-usage、mention-skill、tavily、btw、fff）属于宿主 UI 或宿主工具层，Claude Code / Codex 已有等价物，或者和 repo-harness 的职责无关，不萃取。

## 一、文章要点

作者把主力 coding agent 从 Claude Code 换到 Pi 三周多，核心观点是“核心做小，其余自己拼”，并把 harness 分成三层：

| 层 | 作用 | 作者的做法 |
|---|---|---|
| AGENTS.md | 纪律，常驻 | 全局一份、项目一份；只写不常变的规则：先看结构和调用链、最小改动、需求模糊先问、改完跑最相关测试、看 diff |
| Skills | 能力，按需加载 | 常驻只留 tdd、diagnosing-bugs、code-review、research、parallel-agent；其余用 pi-skillful 隐藏 |
| Packages | 控制面 | 全局装 10 个，见下表 |

默认工作流：有歧义先 `ask_user` → scout 只读侦察 → worker 修改 → 全新 reviewer 并行审 diff/测试/边界 → 父 agent 汇总再修一轮。唯一硬约束是“同一目录同一时间只有一个 writer”，需要并行实现就用 managed worktree，由父 agent 合并。

作者踩过的坑：

- 装过 pi-todo，后来删了。理由是 coding 任务要追踪的是子 agent 状态、产物和验证证据，checkbox 列表帮不上。
- Skill 和 package 堆到几十个时路由变差，管理成本也高；现在默认只开常用的，其余用 `$` 按需拉出。
- 第三方 package 能执行任意代码，安装前要看源码和权限；Pi 默认最高权限、没有沙箱。

文中“缓存命中常到 98% 以上”是作者截图里的个人观测，这次没有复现。

## 二、十个 package 逐个评估

| package | 版本 / 解包体积 | 实际机制（源码核实） | repo-harness 现状 | 处置 |
|---|---|---|---|---|
| `pi-subagents` | 0.73.1 / 11.2 MB，src 14.9k 行 JS，docs 3.8k 行 | 单个 `subagent` 工具 + `workflowScript` JS 沙箱（`runs.run` / `runs.all` / `runs.lanes` / `runs.steer`）；子 agent 默认 fresh context、不拿 `subagent` 工具，深度默认 2；`worktree: true` 要求源仓库干净，“isolation is never dropped automatically”；typed gate 把命令 JSON stdout 变成 `structuredOutput`；lane 失败只跳过本 lane 后续阶段；缺失元数据一律视为 unknown，不允许据此破坏性清理；`subagents_enable` 延迟暴露 schema | fleet persona 7 个（`agents/fleet/`，109 行）；fleet/engineers/collaboration/automation/operator 源码实测为 147 个 .ts 文件、46,008 physical LOC（见 `20260930-fleet-responsibility-trace.md`）；单 writer 为 `allow_parallel_writers: false`（`src/cli/hook/subagent-handler.ts:402`）；worktree 走 `scripts/contract-worktree.sh`（2485 行）；`FleetRuntimeAdapter` 只存在于研究文档 | 萃取模式 3、4；不引入 |
| `pi-skillful` | 0.4.0 / 480 行 TS | `before_agent_start` 里用正则替换 system prompt 的 `<available_skills>` 段（`src/skill-prompt.ts:3`）；`resources_discover` 向仓库根以上继续发现 `.agents/skills/`；行内 `/skill:name` 展开 | manifest v2 共 22 个 package，`discoverability` 枚举在 `src/core/skill-surface/catalog.ts:245-298` 校验；没有“装了但不自动路由”一档 | 萃取模式 2；替换 system prompt 的做法依赖 Pi 的扩展钩子，不照搬 |
| `@eko24ive/pi-ask` | 1.2.0 / 约 11.7k 行 | `ask_user` 工具：单选/多选/preview，`recommended` 只是标记不预选，`required` 只是元数据不阻塞提交，自动附带“Type your own”，有 elaborate 回合；附带 `ask-user` skill 定义触发分类和握手 | 仅有 prose 协议，`$interview` 为外部 skill；每批问题数两处规定矛盾（见结论 1） | 萃取模式 1 |
| `pi-simplify` | 0.2.3 / 246 行 | `git diff` 算出变更行区间，拼成“只允许改这些行”的 prompt | 无同类；cross-review 用 `src/effects/review/diff-fingerprint.ts` 锁定 base SHA，但它是只读审阅 | 不萃取；Claude Code 自带 `/simplify`。真要做，行区间应复用 `diff-fingerprint.ts` 的 base，不另算一套 |
| `@zigai/pi-mention-skill` | 0.10.4 / 约 21 KB | 编辑器 `$` 补全 + frecency 排序，把 `$name` 展开成 skill 内容 | `src/` 没有 `$name` 解析器，`$geju` / `$interview` 只出现在 skill 文档里 | 不萃取，属宿主输入 UI |
| `@tavily/pi-extension` | 0.1.2 / 约 34 KB | `web_search` / `web_fetch` 两个工具，调 Tavily API | 无内置；宿主有 WebSearch / WebFetch | 不萃取 |
| `@narumitw/pi-goal` | 0.54.8 / 6.1k 行 TS | 单 session 目标；在 `agent_settled` 后续跑一轮；`goal_complete` / `goal_blocked` / `goal_wait` 三个终态工具都要校验当前 `goal_id`（stale guard）并附证据；默认 25 次自动回合、3 次无进展即暂停；目标契约消息“取代之前所有契约”，靠 reconcile 保证只有最新一份生效 | `state next` + `AttemptReceiptV1`；`src/core/automation/budget.ts`（2021 行）已有 `max_consecutive_no_progress_steps` 等上限；automation attempt 有 `external_blocked` / `user_blocked` 等 10 种结果；auto-campaign 明确每次调用只跑一个有界回合 | 已覆盖。stale guard 对应我们的 `progress_token`；`goal_wait` 对应 `external_blocked`。不萃取 |
| `pi-context-usage` | 2.1.0 / 约 63 KB | `/context` 点阵图 + 按 system prompt 段、工具、对话轮次拆分 token | `session-context-budget.ts` 预算 1500 token，证据写入 `.ai/harness/state/session-context-budget.json`；`scripts/session-context-packet-panel.ts` 有 27 状态测量面板，但没有接进 `package.json` | 不萃取工具。会话级可见性交给宿主 `/context`；我们自己该管的是 SessionStart 注入，优先级已记录在 codemode 研究的 P3 第 1 条 |
| `@narumitw/pi-btw` | 0.61.1 / 约 746 KB | TUI 侧边线程，答案只有显式带回时才进入主对话 | 无 | 不萃取，属宿主 UI |
| `@ff-labs/pi-fff` | 0.11.0 / 约 88 KB + Rust native binding | 常驻索引、frecency、git 感知，替换 `find` / `grep` | CodeGraph 为主（`.codegraph/`），`.rgignore` 隐藏归档与运行时证据 | 不萃取，属宿主工具层 |

## 三、P1：边界

Pi 生态这十个 package 都在**单个 agent 进程内**工作：改 system prompt、注册工具、挂生命周期钩子、画 TUI。repo-harness 是 Git 交付治理层，权威在 repo artifacts（PRD → Sprint → Plan → Contract → Checks/Review）、contract worktree 和 subject-bound 验收。这个分层与 `20260811-pi-harness-v2-reference-assessment.md` 的结论一致：Pi 侧的 session、lane、goal 状态只能是执行记录，不能进入 workflow 权威面。

所以萃取标准只有一条：这个模式能不能**删掉或缩小** repo-harness 自己维护的东西。只能给宿主加功能的，一律不收。

## 四、P2：具体追踪

以作者的默认工作流对照 repo-harness 现有路径：

```text
Pi（作者）                               repo-harness
ask_user 澄清                            create.md:12 / prd.md prose 协议 + $interview（外部）
scout 只读侦察                           agents/fleet/explorer.md（read-only persona）
worker 修改（单 writer）                  allow_parallel_writers:false + subagent-handler sandbox
managed worktree 并行                    contract-worktree.sh start/finish
fresh reviewer 并行                      gatekeeper persona + cross-review（diff-fingerprint 锁 base）
父 agent 汇总、拍板                       orchestrator（主循环）
```

每一步我们都有对应物，差别在体量。作者用约 10 个 package 拼出这条链，其中真正承担编排的只有 pi-subagents；repo-harness 除了 persona 和 hook 之外，本次 fleet/engineers/collaboration/automation/operator 范围实测为 147 个 .ts 文件、46,008 physical LOC（见 `20260930-fleet-responsibility-trace.md`）。压力点在第 4 条结论：编排应该由宿主 workflow runtime 承担，还是由 repo-harness 自建调度器承担。

pi-subagents 本身并不“薄”（14.9k 行源码、3.8k 行文档），它把复杂度放在一个宿主扩展里，让用户侧配置保持简单。可借鉴的是它的**边界选择**，它的代码量说明不了什么。

## 五、P3：取舍

- **模式 1、2** 删的是重复规定和未来的隐藏机制，改动局限在 skill 文档和 manifest 投影，失败时回滚一个 commit 即可。
- **模式 3** 在工具数量增长 10 倍时最先失效的是“模型找不到被延迟的工具”，所以必须测发现准确率，不能只看静态字节减少；这点在 codemode 研究里已有要求。
- **模式 4** 的收益可能最大（涉及实测范围内 147 个 .ts 文件、46,008 physical LOC 的职责边界（见 `20260930-fleet-responsibility-trace.md`）），风险也最大：宿主 workflow runtime 目前没有 subject-bound 验收、claim/closeout journal 和外部 effect 的显式 `recover reconcile`，这些不能随调度一起外包。可能的形态是“调度交给宿主，admission 与 closeout 留在 repo-harness”。这只是假设，需要先回答两件事：engineers/collaboration 里有多少代码服务于调度本身，有多少服务于 admission/closeout 不变量；宿主 workflow 的 worktree、预算、gate 语义能否被 repo-harness 的 hook 机械校验。

作者的反面经验也可以对照：删掉 pi-todo 的理由（追踪证据，不追 checkbox）和我们 evidence-first 的设计一致；“skill 堆多了路由变差”值得拿来量一下，full profile 目前有 15 个 package 进入宿主，其中多少会被模型自动路由，尚无测量。

## 六、裁定与深入评估（2026-09-30，用户裁定后补充）

用户对四个模式的裁定：

1. **原则：各 harness 用宿主原生工具。** Claude / Codex 用各自原生的提问、skill、subagent 能力；Pi 接入时用 Pi 生态里对应的 package（如 pi-ask），repo-harness 不为任何宿主再造一套。是否支持 Pi 作为宿主，要按这条原则单独判断（见 6.4）。
2. **按同一原则**处理 skill 可见性：投影到宿主原生开关。
3. **需要深入评估**（见 6.3）。
4. **调度交给宿主，repo-harness 作为上游给出清晰指引**，不自建 fleet 运行时调度器。

### 6.1 模式 1：澄清工具

不做新工具。Claude 用 `AskUserQuestion`，Pi 用 pi-ask，Codex 按 `$interview` 或编号文本降级。repo-harness 只保留一份宿主无关的“何时必须问、每批问几个、默认值和 `[ASSUMED]` / `[UNKNOWN]` 怎么记”的契约。目前这份契约在 `20260811-minimum-effective-interview-routing.md`（≤3 个）和 `create.md:12`（恰好 1 个）两处互相矛盾，先选定一处为准。

### 6.2 模式 2：skill 可见性（宿主开关已核实）

- **Claude Code**：SKILL.md frontmatter `disable-model-invocation: true` 让 skill 只能由用户 `/name` 触发，描述不进上下文；副作用是也不能被预载进 subagent，也不能被定时任务当 prompt 触发。`user-invocable: false` 相反。另有设置项 `skillOverrides: "user-invocable-only"` 可以不改文件。来源：[Claude Code skills 文档](https://code.claude.com/docs/en/skills)。
- **Codex**：skill 目录下 `agents/openai.yaml` 里 `policy.allow_implicit_invocation: false`，默认 `true`；Codex 忽略 `disable-model-invocation`。社区反馈显式-only 的 skill 会从注入的 skill 目录里消失，只能靠输入 `$name` 调用（[openai/codex#19695](https://github.com/openai/codex/issues/19695)，这条我没有在 Codex 上复现）。来源：[Codex skills 文档](https://developers.openai.com/codex/skills)。
- **本仓库现状**：`rg` 全仓库没有任何 skill 设置这两个开关。13 个 SKILL.md 的 `description` 最长 904 字符（`obsidian-memory`），合计约 3.9k 字符，远低于 Claude 每个 skill 1,536 字符的列表上限，所以**省 token 不是这件事的理由**。
- **真正的理由是防误触发**：有副作用的 skill 目前只靠 description 里的文字兜底（例如 `auto-campaign` 写着“Questions about campaigns … do not authorize execution”）。候选：`auto-campaign`（会改仓库）、`repo-harness-ship`（会 push / PR）、`obsidian-memory`（会写外部 vault）。
- **风险**：加开关是用户可见的行为变化。Claude 侧这些 skill 将不能被模型自动选用、不能被预载进 subagent；Codex 侧可能从目录里消失。哪些 skill 该只允许显式调用需要你逐个确认，我没有改任何 skill。落地形态应是 manifest 的 `discoverability` 值一处声明，安装投影时同时生成 Claude frontmatter 和 Codex `openai.yaml`，不手写两份。

### 6.3 模式 3：工具 schema 按需暴露（深入评估）

**测量**（用 `buildMcpToolDefinitions` 直接生成各 profile 的定义，`JSON` 字节数 ÷ 4 估 token，不是真实 tokenizer；脚本在 `/tmp`，没有入库）：

| profile | 工具数 | 定义体积 | 估算 token |
|---|---|---|---|
| planner（不含 reader） / executor / orchestrator | 23–24 | 10.7–11.0 KB | 约 2.7k |
| planner + reader | 41 | 19.2 KB | 约 4.8k |
| coding | 29 | 14.2 KB | 约 3.6k |
| engineer（含 collaboration） | 23 | 21.2 KB | 约 5.3k |

对照：SessionStart 预算是 1,500 token（`session-context-budget.ts:5`）。也就是说，声明这套 MCP 工具的固定成本是 SessionStart 的 2–3.5 倍，但只有连接了这个 MCP 的宿主才付这笔钱。文档描述这套 MCP 主要面向 GPT（`docs/reference-configs/general-repo-mcp.md`、`chatgpt-coding-mcp.md`）；Claude / Codex 的默认配置是否注册它，这次没有核实。

**Pi 的行为**（[mcp.md](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/mcp.md#exposure)）：
- `exposure` 默认 `codemode`：工具不逐个声明给模型，只在 `codemode` 工具的描述里列出，受共享 token 预算限制，脚本用 `searchTools()` 找剩余的。
- `deferred`：用 `tool_search` 加载后才声明，加载结果在该分支上持续保留。
- `toolExposure` 可以按工具名或 `*` 通配符覆盖，精确名优先。
- server 在 session 启动时连接，不是首次调用才启动；文本结果超过 20KB 会截断中间，脚本拿到完整结果。

**结论：repo-harness 这一侧不需要改代码。** Pi 默认就是近似按需暴露，我们的 MCP 已经是固定 profile、固定 schema，没有可以再省的工程量。要做的是给 Pi 用户一份推荐配置，并保证下面三个前提成立：

1. **授权在服务端，不在可见性。** 工具能不能被调用由 `server.ts` 的 profile 门控和 `assertMutationAuthorization` 决定（已在 `20260930-pi-codemode-lazy-loading.md` 记录）；`hidden` / `deferred` 只是体验层。
2. **错误必须可被脚本识别。** Pi 脚本拿到完整 `CallToolResult`，`isError` 结果照样 resolve。核对了 `coding-tools.ts:89-96` 与 `general-repo-access.ts:212-217`，错误结果都带 `isError: true` 和 `structuredContent.error.code`，符合要求；其余工具文件（fleet / engineer / collaboration / reader）没有逐个核对。
3. **`exposure` 不是写入约束（2026-09-30 更正）。** 本节此前建议“写工具用 `deferred`，让每次修改成为显式单次调用”，该结论不成立。官方 mcp.md#exposure 写明：未声明的 `codemode` / `codemode-deferred` / `deferred` 工具都能从 codemode 脚本调用，`direct` 工具同样能在脚本里调用；`deferred` 只改变“是否声明给模型”，不禁止组合。唯一使工具不可调用的是 `hidden`。所以指引里不能宣称任何 exposure 值保证写入单次或不被脚本批量调用。
   
   写入安全只能来自三层，且都不依赖 exposure：
   - **使用约束**：指引明确要求宿主 / 用户不要在 codemode 脚本里批量调用写工具（这是约定，不是强制）。
   - **服务端权限与 admission**：profile 门控、`assertMutationAuthorization`、repo `read_write` grant、authorization revision（已存在，见上）。这是唯一真正的强制点。
   - **嵌套调用证据**：Pi 扩展工具的嵌套调用带 `parentToolCallId` 与有界 `nestedCalls`（见 codemode 研究），服务端审计写在 `.ai/harness/mcp/audit.log`。注意现状是 best-effort：`tools.ts:124-125` 的 `audit()` 调用 `tryWriteMcpAuditEntry`，写盘失败只返回 `false` 且不被检查（`audit.ts` 末尾），并不使写入失败。所以“每次写入都有证据”目前不是被强制的保证；这条待 worker 核实各写工具是否另有 fail-closed 路径，再决定指引里能写到什么强度。
   
   `hidden` 只适合彻底不让该宿主使用的工具（如 `delete_path`），并且要在宿主配置里显式设置。是否存在能在 Pi 侧独立强制“写工具不得在脚本中调用”的机制，这次没有找到；找到之前，本条只能作为使用约束。

**10 倍规模下先坏的**：工具数到 200+ 时，先坏的是 `codemode` 描述的 token 预算导致发现不到工具，而不是我们的定义体积。此时需要测的是发现准确率，不是字节数。现在不需要。

**repo-harness 自己真正能省上下文的地方在 SessionStart**（Claude / Codex 每个 session 必付）：`sessionStartMainContent` 把多个 provider 合成一个 priority-5 section，预算只能整段保留或丢弃。这项已在 `tasks/todos.md` 和 codemode 研究里登记，优先级高于任何 MCP 暴露调整。

### 6.4 模式 4 与 Pi 接入范围

按“调度交给宿主”裁定，repo-harness 不实现 `FleetRuntimeAdapter`，也不做确定性 fleet scheduler。我们作为上游要给出的是**宿主必须守住的不变量**和**每个宿主怎么落地**，两份东西：

- **不变量清单（宿主无关）**：同一目录同一时间只有一个 writer；并行写必须走干净仓库上的 worktree、不得静默降级；子 agent 默认 fresh context 且不再继续派生；验收基于绑定 subject 的证据而不是 exit code；外部副作用（push / PR / merge）只能走显式 `recover reconcile`，不自动重放；缺失的元数据按 unknown 处理，不据此做破坏性清理。这些大部分已在 `AGENTS.md`、`policy.json`、`long-run-continuation.md`、`20260811-pi-harness-v2-reference-assessment.md` 里，缺的是汇集成一处并标明“哪些由 hook 强制、哪些只是指引”。
- **宿主落地表**：Claude Code（Workflow / subagent + 用户级 typed hook）、Codex（native child + `SubagentStart.context`）、Pi（pi-subagents 的 `workflowScript`、`worktree: true`、`gate`）各列“用什么原生能力实现哪条不变量”。
- **Pi 接入的最小形态（建议，待你确认）**：guidance-only。Pi 自己读 AGENTS.md 和 `.agents/skills/`，repo-harness 的 CLI 是普通命令，可以直接用；但我们的 typed hook（`repo-harness-hook`）只接 Claude / Codex，Pi 上这些不变量没有机械强制，指引里必须明说。这与 `20260808-repo-harness-in-opencode.md` §六“首版走 RPC process”不冲突，只是更保守：先不写任何 Pi 运行时代码。是否升级到“机械强制”取决于是否真有 Pi 用户，目前没有证据。

## 七、建议的下一步

1. 选定 interview 每批问题数的唯一出处（小，直接做）。
2. 你逐个确认哪些 skill 应设为“仅显式调用”，再做 manifest → Claude frontmatter + Codex `openai.yaml` 的投影（中，有行为变化）。
3. 模式 3 不改代码；把 6.3 的 Pi 推荐配置写进宿主指引；SessionStart 粒度预算按已有 todo 推进。
4. 起一份“上游宿主指引”：不变量清单 + 宿主落地表（6.4），放 `docs/reference-configs/`，并标明强制程度。这份需要走 P1/P2/P3，因为它会成为后续删减 fleet 调度代码的依据。fleet/engineers/collaboration/automation/operator 实测范围的 147 个 .ts 文件、46,008 physical LOC 中（见 `20260930-fleet-responsibility-trace.md`），哪些服务于调度本身、哪些服务于 admission / closeout 不变量，仍需单独盘点后才能决定删什么。

## 来源

- 文章：<https://x.com/chasen_liao/status/2092963119337476137>（X Article id `2090655519673626624`）
- [pi-subagents](https://github.com/nicobailon/pi-subagents)：`README.md`、`docs/workflows.md`、`docs/tool-reference.md`（Acceptance gates / typed gates）、`docs/watchdog.md`、`src/extension/tool-activation.js`
- [pi-skillful](https://github.com/jvm/pi-mono/tree/main/packages/pi-skillful)：`src/skill-prompt.ts`、`src/extensions/skill-visibility.ts`
- [pi-ask](https://github.com/eko24ive/pi-ask)：`docs/contract.md`、`skills/ask-user/SKILL.md`
- [pi-simplify](https://github.com/MattDevy/pi-extensions)：`src/prompt-builder.ts`
- [pi-mention-skill](https://github.com/zigai/pi-tweaks)、[pi-goal / pi-btw](https://github.com/narumiruna/pi-extensions)（`pi-goal/src/goal-contract.ts`、`prompts.ts`、`tools.ts`）、[pi-context-usage](https://github.com/championswimmer/pi-context-usage)、[pi-fff](https://github.com/dmtrKovalenko/fff)、`@tavily/pi-extension`（npm）
- 本仓库：`docs/researches/20260811-pi-harness-v2-reference-assessment.md`、`20260808-repo-harness-in-opencode.md`、`20260811-minimum-effective-interview-routing.md`、`20260930-pi-codemode-lazy-loading.md`；行数与文件位置来自 2026-09-30 只读盘点（`wc -l`、`rg`）
