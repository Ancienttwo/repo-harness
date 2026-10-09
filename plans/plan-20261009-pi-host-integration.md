# Pi 1.1 宿主接入实现方案

状态：用户已批准。H1 已实现。验证与审查结果见下文。
日期：2026-10-09，Asia/Singapore。
源码基线：`98c30ab6228b94f5e46c8cc3290de281eb0e4a99`。
依赖提交：`981a50b871f9b5238a7bca72d031e0927d397769`。
分支：`codex/pi-host-plan-oar-0451`。

## 目标与验收范围

让用户在 Pi 中获得 repo-harness 的最小宿主能力。Pi 负责模型、工具和会话。repo-harness 负责现有仓库规则、写入检查和恢复记录。

首版支持 Pi `1.1.0`。交付方式是现有 npm 包中的 Pi extension。用户用 Pi 官方 package 命令加载它。首版提供 root router 和 `repo-harness-check` 两个技能。它们对应最小技能集合。其余规则按已有引用读取。

验收必须同时证明：正常编辑成功；受保护路径编辑被拒绝；codemode 内的嵌套编辑走相同检查；会话恢复与取消不串用身份；失败后不会自动重放外部操作。只运行 fixture 不能证明真实模型链路已通过。

用户已授权宿主实现、本地提交、push 和 PR。用户配置修改、main 合并和发布仍需单独授权。

## P1：边界盘点

| 边界 | 实施前事实 | 实现入口 |
|---|---|---|
| 依赖 | 根清单直接依赖 OAR。Pi 是传递依赖。OAR `0.45.1` 要求 Pi AI 与 coding-agent `^1.1.0`。 | `package.json`、`bun.lock` |
| Pi 宿主 | 本机官方 Pi 文档与包为 `1.1.0`。extension 可接收生命周期、工具调用与结果事件。 | 官方 `ExtensionAPI` |
| 工具检查 | `runHook()` 检查 Git 根目录和 opt-in marker，再执行 typed handler。mutation guard 用非零退出码拒绝编辑。 | `src/cli/hook/runtime.ts`、`mutation-guard.ts` |
| 宿主输出 | 当前 runtime 输出 Claude/Codex 形状。返回值没有上下文或诊断文本。 | `runtime.ts`、`src/cli/hook-entry.ts` |
| 路由 | `RouteHost` 只有 Claude、Codex。部分路由绑定 Codex 专有语义。 | `route-registry.ts` |
| 技能 | catalog 与 manifest 是技能选择的事实源。当前宿主枚举只有 Claude、Codex。 | `src/core/skill-surface/catalog.ts`、`assets/skill-commands/manifest.json` |
| 安装 | 现有 installer 管理 Claude/Codex 配置及所有权。Pi 原生支持本地或 npm package。 | Pi `install`、`remove`、`packages` 配置 |
| 审查运行时 | repo-harness 已调用 OAR。当前 review registry 只注册 Claude、Codex。OAR `0.45.1` 公开导出 `piRuntime`，但本项目没有启用它。 | `src/effects/review/oar-review-host.ts` |
| 状态展示 | 已有独立方案。接收器与 Kanban 链路仍需真实证据。 | [已有状态方案](plan-20261009-feynman-report-pi-status.md) |

此前 [宿主约束](../docs/reference-configs/host-invariants.md) 明确排除 Pi runtime 和 typed-hook 接入。本方案提议改变这个产品范围。宿主实现获准后，必须同步更新该文档及其 assets 源文件。不得把本方案当成已经支持 Pi 的证明。

## P2：真实调用路径

当前编辑路径是：宿主 adapter → `repo-harness-hook` → Git/opt-in 检查 → typed collector → mutation guard → 宿主退出码。检查规则已经集中在 handler 中。

Pi `1.1.0` 的 `AgentSession._beforeToolCall()` 调用 extension runner 的 `emitToolCall()`。返回 `block: true` 会停止该调用。handler 抛错也会拒绝该工具调用。`_executeNestedToolCall()` 将嵌套调用送入相同边界，并附带 `parentToolCallId`。MCP 与 codemode 文档确认这条路径适用于嵌套工具。

Pi 的输入字段与现有 handler 不同。`edit`、`write` 使用 `path`。现有 handler 读取 `tool_input.file_path`。Pi edit 使用 `edits[]`。现有 plan 内容检查读取 `new_string` 等字段。适配器必须转换这些字段。只转换工具名称会漏过检查。

Pi 官方示例 `protected-paths.ts` 使用 `tool_call` 返回阻止结果。`permission-gate.ts` 展示无 UI 时拒绝操作。采用它们的事件返回机制。路径规则继续使用本项目 handler，不复制示例中的字符串匹配规则。

Pi 普通模型循环结束的 `agent_end` 不是最终结束。重试、压缩或排队输入仍可能继续。恢复记录使用 `agent_settled`。取消值来自该事件的 `aborted`。不能由终端 idle 推断取消。

## P3：推荐决定

最小选项是继续读取 AGENTS.md 并调用 CLI。它不增加安装成本，但无法拦截 Pi 原生 edit/write。因此推荐增加一个 Pi extension，并复用现有 hook runtime。

选择 Pi 官方 package 安装。首版不扩展 `repo-harness install --target`。这可避免再造 package 安装器，以及让两套安装事务争用 `.pi/settings.json`。Pi 管理 package 声明。repo-harness 管理仓库 opt-in 和已有 workflow 数据。

调用 hook 使用独立 Bun 子进程。Pi extension 使用 Node 标准库 `spawn`，通过 stdin 传 JSON。执行路径固定为当前 package 的 `dist/hook-entry.js`。不得从 PATH 搜索另一份 `repo-harness-hook`。Pi 的 `pi.exec()` 没有所需的 stdin 输入接口，不能拿 shell 拼接代替。

不直接在 Pi 进程导入整套 hook runtime。现有 runtime 使用 Bun、进程环境和 fd 输出。子进程边界可隔离这些行为。首版每个已映射事件启动一个短命进程。没有常驻服务。

```text
Pi 官方 package / 会话 / 工具
              |
              v
repo-harness Pi extension
  事件与字段转换；stdin/stdout JSON
              |
              v
当前 package 的 Bun hook bundle
  opt-in；typed handlers；已有 context budget
              |
              v
仓库 policy / Git / workflow 与恢复记录
```

这条路径不建立新的任务库或调度器。OAR 不参与原生 Pi 的每次工具检查。后续受管理 Pi worker 必须使用 OAR 已有 `piRuntime`，不能手写 provider adapter。本首版不启用 Pi review worker。

## 事件映射与失败处理

| Pi 边界 | repo-harness 行为 | 失败处理 |
|---|---|---|
| `session_start` | 读取 session ID、cwd。执行 `SessionStart.default`。保存预算后的上下文。 | 非 Git 或非 opt-in 返回 inactive。opt-in 仓库中 bridge 失败标为 unavailable，并拒绝后续 edit/write，直到成功刷新。 |
| `before_agent_start` | 执行 `UserPromptSubmit.default`。返回一条隐藏的 custom message，附带当前上下文及 advisory。 | 不能靠抛错阻止模型循环。失败显示有界诊断；已有 mutation guard 仍负责编辑检查。 |
| `tool_call` 的 `edit` / `write` | 分别映射到 `Edit` / `Write`。执行 `PreToolUse.edit`。 | guard 拒绝、超时、无效 JSON 或 bridge 崩溃都返回 `block: true`。不自动重试检查进程。 |
| edit/write `tool_result` | 执行 `PostToolUse.edit`，使用原调用绑定与现有 post-edit journal。工具失败或取消后仍可能已写入；观察不使用已取消的执行 signal。 | 保留真实错误结果，不重做编辑。观察失败后拒绝下一次编辑，直到 `/reload` 成功。 |
| bash `tool_result` | 执行 `PostToolUse.bash`。将真实文本与 `isError` 放入 tool response。 | 只记录观察。没有退出码时不伪造零。不能凭日志确认验收。 |
| `agent_settled` | 执行 `Stop.default`。携带真实 session/run ID 和取消观察。 | 保留错误。不能自动标任务完成、释放 lease、push 或 merge。 |
| `session_shutdown` | 取消并回收 extension 自己启动的检查进程。清除会话内缓存。 | 幂等清理。若未处理的本轮需要 Stop，执行一次；已经 settled 的本轮不再写重复记录。 |

输入转换规则：`path` 先按会话 cwd 解析为 Pi 实际执行的目标，再放入 `file_path`；write `content` 原样传入；edit 的每个 `edits[].newText` 按原始顺序放入同一内容检查输入；保留真实 tool call ID 与 parent ID。不得通过 JSON 文本搜索或终端文本解析恢复字段。

记录 Pi session ID 时使用 `ctx.sessionManager.getSessionId()`。每个 `before_agent_start` 建立独立随机 UUID run ID。每次请求将 run ID 与 session ID 一起绑定。工具调用不能共用可被其他会话改写的全局环境。每次 spawn 显式覆盖 `HOOK_HOST=pi`、`HOOK_SESSION_ID`、`HOOK_RUN_ID` 与 cwd，并去除 Claude/Codex 身份变量。上下文 unavailable 时使用 Pi 现有 `/reload` 刷新；刷新未成功前不恢复编辑。

并发结果以 tool call ID 绑定原始输入。不能保存单一“最近编辑路径”。迟到结果不能写入新会话。reload 与 session replacement 重建上下文，不沿用旧检查状态。

首版只宣称覆盖原生 edit/write，包括经官方工具管线发出的嵌套 edit/write。bash、powershell、`!`/`!!`、任意 extension 文件写入和第三方 MCP 写入不具有这项路径保护。保留现有 MCP 服务端检查。工具 annotation 与 exposure 不构成写入授权。后续 extension 也能修改参数或直接访问文件；本 extension 不构成 OS sandbox。

## 文件与接口变更

宿主实现预计超过 8 个文件。按下面责任划分改动，不改 downstream templates 或 fleet personas。

| 文件 | 变更 |
|---|---|
| `src/pi/extension.ts`（新增） | 官方 extension 入口。注册以上事件。只作适配与调用。 |
| `src/pi/hook-bridge.ts`（新增） | Bun 子进程、stdin、JSON 验证、超时和取消。完成后释放进程与监听器。 |
| `src/cli/hook/runtime.ts` | 将宿主输出投影与执行结果分开。JSON 模式与现有宿主模式使用同一 handler 结果和 context budget。 |
| `src/cli/hook-entry.ts` | 增加 `--format json`。默认保持当前宿主输出。 |
| `src/cli/hook/route-registry.ts` | 增加 `pi` 宿主。现有 subagent、Codex delegation/context/quality 路由保持原宿主限定。Pi 不假装支持这些事件。 |
| `src/core/skill-surface/catalog.ts` | 增加 Pi 技能宿主及 placement 投影。使用同一 catalog 校验。 |
| `assets/skill-commands/manifest.json` | 为 router、check 与其已支持 Pi 的技能依赖声明 Pi。Pi 首版资源只选 minimal 中本包所有的 router/check。外部技能不自动安装。 |
| `scripts/sync-pi-package.ts`（新增） | 从 catalog 生成并检查 `package.json` 的 `pi.skills`。不维护另一份技能清单。 |
| `package.json` | 声明 `pi.extensions`、生成的 `pi.skills` 和打包检查。Pi coding-agent 声明为可选 peer，范围 `*`，由宿主提供；运行验收基线为 `1.1.0`。SDK 的类型与版本信息由 Pi 宿主提供。extension 不打包 SDK。OAR 的既有传递依赖仍由 lock 管理。 |
| `assets/reference-configs/host-invariants.md` 及 docs 投影 | 按已验证的实际入口更新 Pi 的覆盖等级。保留未覆盖路径。 |
| `README.md`、`README.zh-CN.md` | 官方 package 加载方法、前置 Bun、opt-in 与覆盖范围。 |
| 现有 hook、catalog、package 测试 | 扩展相关行为测试。新建 `tests/pi-extension.test.ts`，测试新增 Pi 运行边界。 |

JSON 输出只允许一个 stdout 对象。版本号是 `protocol: 1`。字段为 `event`、`route_id`、`host`、`repo_root`、`exit_code`、`reason`、`decision`、`additional_context`、`diagnostics`。`decision` 为 `allow`、`block` 或 `none`。诊断限制为 8 KiB；完整失败输出存入测试日志。context 使用现有 budget，不再截断一次。

结果投影由 hook runtime 负责。对 guard，非零退出码投影为 block。对其他事件，沿用 runtime 已有的结构化输出识别。extension 不再解析旧 stdout 内容。日志只写 stderr。JSON 模式不得绕过已有 telemetry、预算和 `onDelivered` 处理。

bridge 的普通检查超时为 10 秒。Stop 使用既有 `MANAGED_STOP_TIMEOUT_SECONDS`，当前为 150 秒。它给 140 秒工作预算保留收尾时间。stdin 上限为 16 MiB。超限 edit/write 必须拒绝，不得截断后放行。它不产生新 flag 或环境配置。超时仅终止自身 hook 子进程，不自动重试已发生的 effect。

Pi 官方安装命令为 `pi install <本地候选包目录>`。发布后采用官方 `npm:repo-harness@版本` 来源。首版默认个人 scope。project scope 仍受 Pi 原生 trust 约束。不得调用 `--approve`，不得写 trust.json、auth.json、默认 provider 或 sandbox 权限。

公开接口增量：一个 Pi package 入口；一个 hook `--format json` 选项；构建用 package drift 检查。新增服务、provider adapter、任务状态文件、安装目标和凭据均为零。

## 独立交付步骤

| 切片 | 状态 | 可独立交付的结果 | 预计工作量 |
|---|---|---|---|
| D1：依赖升级 | 已实现、已验证、本地已提交 | OAR `0.45.1` 和 Pi `1.1.0`。现有宿主继续可用。 | 本次已完成 |
| H1：最小原生宿主 | 已实现；独立审查未完成 | 上述 package、JSON bridge、上下文与 edit/write 检查。使用 Pi 官方安装即可工作，不依赖 OAR worker 或状态展示。 | 本轮实现完成 |

H1 作为一个完整 PR 交付。不能先宣传“Pi 已接入”，再等待下一阶段补写入检查。状态展示沿用已有方案。统一 installer 与 Pi review worker 不属于 H1，不是其验收前提。

## 验证与交接

实现负责人是 Codex 后端 worker。此切片没有前端工作。独立审查检查权限覆盖及“测试是否被改成迁就实现”。按仓库 Herdr Dispatch 指引选择审查路线。没有可用路线时报告审查缺口，不伪造结果。

在稳定候选上运行一次：

- `bun run check:type`
- `bun run test:files tests/hook-runtime.test.ts tests/hook-runtime-characterization.test.ts tests/mutation-guard.test.ts tests/skill-surface/catalog.test.ts tests/pi-extension.test.ts --timeout 60000 --max-concurrency 1`
- `bun scripts/sync-pi-package.ts --check`
- `bun run check:reference-configs`
- `bun run build:hook-bundle`
- `npm pack --ignore-scripts`，检查 tarball 中的 extension、manifest、skills 和 hook bundle。

有意义的测试路径：

- 非 Git、非 opt-in、正常文件、受保护路径、路径逃逸和 symlink。
- Pi edit 多条 edits；直接 write；codemode 嵌套 write；真实 tool ID 与 parent ID。
- handler 崩溃、无效 JSON、进程超时、取消、stdin 超限和诊断输出超限。
- post-edit journal 失败后已改文件保持可见；不得重放编辑。
- 同一轮并行调用；两个会话；resume、fork、reload；迟到结果；shutdown 重入。
- 缺少 Bun、bundle 不存在、Pi 版本或 capability 不支持。结果必须明示 unavailable。
- print、JSON、RPC 没有 UI 时仍能阻止受保护编辑，stdout 不混入 hook 日志。
- skill package 只暴露 router/check；显式调用可用；catalog 与 package 声明一致；重复安装不重复加载。
- 原有 Claude/Codex 输出、路由顺序和安装投影保持通过。

自动测试使用真实 Pi `1.1.0` SDK 与真实工具执行路径。可用官方测试 seam 控制模型输入，但必须标注为 fixture。真实验收使用一次用户已配置的 provider，并在隔离 HOME、仓库和进程中执行。它需要该 provider 的既有登录或 API key；不需要新账户或新 key。凭据不写入日志或方案。

人工验收依次观察：加载候选包；列出两个技能；正常 edit；受保护 edit 拒绝且文件字节未变；codemode 嵌套拒绝；取消与 resume；停用 package 后恢复原生 Pi 行为。真实 provider 或项目 trust 缺失时记录未完成项，不能拿 fixture 代替。

实施首条命令：`git -C /tmp/repo-harness-wt-pi-host-plan-oar-0451 status --short --branch`。核对依赖提交和本方案后，从 D1 提交建立独立 H1 分支。先实现一个完整 edit 拒绝路径，再扩展事件。不要启动 provider、改用户配置或公开提交，除非相应操作已获授权。

## 风险与回退

最脆弱的前提是 Pi 官方管线仍对直接与嵌套调用执行相同 `tool_call` 检查。若这个前提不成立，嵌套写会绕过本方案。H1 的真实工具测试必须对此作出判断。不支持时取消覆盖声明并拒绝该接入候选，不能增加文本解析补洞。

Bun 或 hook bundle 缺失时，opt-in 仓库的 edit/write 拒绝。非 opt-in 仓库保持 inactive。依赖安装失败不改变用户 Pi 设置。bridge 不重试外部 effect。10 倍工具调用量首先增加短命 hook 子进程开销；并发 write 仍使用 Pi 原生 mutation queue 和已有仓库锁。只有实测延迟需要时再决定性能切片。

H1 不迁移业务数据。回退 extension 用 Pi 原生资源过滤或 remove 命令，并保留 repo-harness 的既有记录。不得删除用户其他 extensions、settings 或 workflow 数据。实现获准不自动授权现场配置或删除操作。

D1 回退是 `git revert 981a50b871f9b5238a7bca72d031e0927d397769`，再按原锁文件安装。若后续发布为 squash commit，使用 GitHub 确认的 squash SHA，不沿用本地 SHA。发布需要单独授权。

## D1 依赖升级证据（实施前）

- npm registry 查询成功：OAR `0.45.1`，Pi AI 与 coding-agent `1.1.0`。
- `bun install --ignore-scripts` 成功。安装版本检查成功：OAR 为 `0.45.1`；chord 和七个 Pi 包均为 `1.1.0`。无额外 override 或直接 Pi runtime 依赖。
- `bun run check:type` 退出 0。该命令使用本机 PATH 上 Node `26.10.0`。
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH bun run build:oar-review-host` 退出 0。
- 在 Node `24.21.0` 与 Bun `1.4.2` 环境运行两份 affected tests：public types 3 项、generic review 19 项；共 22 pass、0 fail、0 skip。
- generic review 检查覆盖真实 OAR scripted Session、取消、disposal、文件交付和 macOS Seatbelt 隔离。未启动真实 provider。
- 完整测试输出位于本机 `/tmp/repo-harness-oar-0451-tests.log`。这不是仓库提交内容。
- 本次未运行全套测试、Pi 原生接入验收、真实模型或 Pi–Herdr 状态链路。它们不能由本次依赖测试推断。
- [进度图源文件](plan-20261009-pi-host-integration.puml) 与本方案使用同一证据快照。未渲染图像。

## H1 实施证据

- 实现使用本方案分支。它继承 D1 与方案提交。主工作区的用户文件未改动。
- `bun run check:type` 通过。环境为 Node `24.21.0`、Bun `1.4.2`。
- 八份稳定差量测试通过，共 149 pass、0 fail、0 skip。覆盖 hook runtime、旧宿主行为、mutation guard、command observer、catalog、Pi、bundle 和 doctor。
- 后续 Pi 差量测试通过，共 12 pass、0 fail、0 skip。它覆盖真实 SDK 工具管线、直接与嵌套拒绝、子目录、`@`/`~`/file URL、并行嵌套调用后的外层失败、取消、reload、resume、fork、宿主身份隔离和 bridge 故障。provider 响应由脚本控制。
- Pi 没有公开工具路径解析 API。adapter 使用当前宿主 SDK 安装中的 `resolveToCwd`，不复制路径语法。首版严格限定 Pi `1.1.0`。其他版本或缺少该内部文件的发行包标为 unavailable。
- command observer 的最后差量检查通过，共 16 pass、0 fail。Pi 没有整数退出码时保持 `unknown`。缺少值、null、字符串和小数均不能导入 passing verification evidence。
- 官方 `pi install` 在隔离 HOME 中加载了 tarball 安装的候选包。Node 宿主加载 extension 与两个技能。真实 edit 和 codemode 嵌套拒绝通过。
- 既有真实 provider 通过四项验收：直接 edit、直接私有 write 拒绝、嵌套 edit、嵌套私有 write 拒绝。验收读取既有模型配置和只读凭据。它没有修改用户配置或凭据。
- `bun run test:full` 完成 410 份测试文件。初次运行有三份失败：bundle 的旧 prepack 断言、未改动的 operator activity 与 doctor 测试。prepack 断言增加 Pi 投影检查后通过。另两份测试单独运行通过。完整套件在 `03fe5937` 上重跑了 410 份文件，退出 0。初次失败日志仍保留。后续收尾结果以 PR 说明为准。
- `bash scripts/check-ci.sh affected --base origin/main` 初次运行只在旧 prepack 断言处失败。对应差量测试已通过。
- `bun run check:pi-package`、`check:reference-configs`、`check:hooks` 与 `git diff --check` 通过。
- PR #607 的 Codex review 提出写入后取消仍会返回错误的问题。真实 SDK factory、真实文件写入与 `session.abort()` 已复现。原实现漏掉两份 journal 路径。修正后保留错误结果，记录原 session/run，且三次真实写入各执行一次。Pi 差量为 13 pass；mutation observer 与 command observer 共 41 pass。fixture 使用 scripted provider，不能替代真实 provider 验收。
- 最初两次独立只读审查没有结果。Claude 返回 `ENOTFOUND`。Codex 启动未完成。两份任务已取消并关闭。补修时再次执行 Claude 审查，仍因当前 Seatbelt 返回 `ENOTFOUND`。普通 Node 解析同一 hostname 成功。任务已取消并关闭，没有重放请求。
- 用户随后以 `go` 授权最小 DNS 权限修正。规则仅放行 macOS 的 `/private/var/run/mDNSResponder`。真实 sandbox 红绿测试检查 DNS，并确认普通 Unix socket 仍被拒绝。原有源码、配置、凭据、进程 signal 与子进程写入拒绝测试保持通过。generic review 为 20 pass、0 fail。最终独立审查结果以 PR 为准。
- 架构模型已声明 Pi adapter 的责任。初次投影缺少 CodeGraph 索引，无法确认 27 个模块的 flow。恢复索引后，仅 Pi hook adapter 的 ownership 与 responsibility 有真实变化。补修已接受该项已批准变化并同步八份生成文档。复查返回 `noop`，没有 refresh signals。DNS 修正仅更新投影输入 proof，没有其他责任变化。
- 两处 installed candidate fixture 原先复制整个 checkout，连同未发布的测试和私有运行状态。补修改为复制 package 的发布清单。边界回归测试在原复制行为上失败，在新行为上通过。版本安装的原断言与 30 秒 timeout 保留。`4dbb1c0f` 的默认八进程 full 完成 410 份文件，退出 0。原 installer timeout 的具体触发因素未复现，不能据此断言其根因。最终提交的检查结果以 PR 为准。
- 独立 Claude 只读审查已对 `8f76eba9` 返回 advisory `FAIL`，提出两个中等问题和两个低级问题。Bash 原先错误读取 `details.exitCode`；修正后使用 SDK 的 `structuredContent.exit_code`。Stop 原先受 10 秒限制；修正后复用 150 秒 managed timeout。短 unknown 输出不再按失败保存完整日志。SessionStart snapshot 交付一次，不再每轮重复。
- 真实 SDK/Bash/Bun 回归检查实际 pass/fail 退出码、check records 和 ledger。context 的精确次数检查保留一次 SessionStart snapshot；同一 session 的 unchanged reload 由共享 budget 去重。真实 11 秒 bridge 子进程在旧 Stop deadline 下失败，在新 deadline 下完成。普通 timeout 与取消检查保留。四项失败日志及后续差量结果均保留，最终复审以 PR 为准。
- 尚未验证 RPC 模式、长期并发压力、shutdown 重入及 Pi–Herdr 状态链路。它们不能由以上检查推断。
- 本地检查日志使用 `/tmp/repo-harness-pi-*.log`。这些日志不是提交内容。PR 说明记录命令、环境、结果和限制。

## 官方参照

本次读取的是本机安装包 `@earendil-works/pi-coding-agent@1.1.0` 的完整相关文档、公开类型与关键实现。下列上游链接固定到 `v1.1.0`。

- [Extensions](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/extensions.md)
- [Pi Packages](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/packages.md)
- [Skills](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/skills.md)
- [Configuration](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/configuration.md)
- [CLI](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/cli.md)
- [MCP](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/mcp.md)
- [Security](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/security.md)
- [Extension 类型](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/src/core/extensions/types.ts)
- [AgentSession](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/src/core/agent-session.ts)
- [protected-paths 示例](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/examples/extensions/protected-paths.ts)
- [permission-gate 示例](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/examples/extensions/permission-gate.ts)
- OAR `0.45.1` 的 npm 清单与公开 `piRuntime` 声明；本方案不把 API 存在当成该运行时已在本项目启用。
