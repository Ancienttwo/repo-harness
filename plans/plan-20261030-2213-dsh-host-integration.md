# DeepSeek Harness 宿主接入方案

状态：用户已批准 S1 + S2。S1、S2 已实现并验证；未合并。
日期：2026-10-30，Asia/Taipei。
源码基线：`1d5c06156`。
目标宿主：DSH `0.2.1-rc.5`，Cordis `~4.0.5`。

## 目标与验收

让 DSH 会话获得 repo-harness 的仓库规则、受保护路径检查和会话恢复记录。DSH 负责模型、工具和会话。repo-harness 负责 opt-in 判定、写入检查、上下文预算和恢复记录。

交付一个 DSH Cordis 插件入口，随现有 npm 包发布。用户用 DSH 原生命令加载：

```text
dsh plugin add link:<repo-harness 包目录>     # 已安装的包
dsh plugin add repo-harness@<version>        # 发布后
```

验收必须同时证明：opt-in 仓库内受保护路径的 `edit`/`write` 被拒绝且文件字节不变；非 opt-in 仓库不启用；hook 子进程崩溃、超时或输出无效时拒绝写入；取消、并发和会话恢复不串用身份。只跑 fixture 不能证明真实模型链路已通过。

本机 DSH 已自动加载 `AGENTS.md` 与 `~/.agents/skills` 技能（本会话已观测）。这两项是零配置既有能力，不算本方案的交付证明，也不改变本次写入检查的边界。

## P1：边界盘点

| 边界 | 实施前事实 | 依据 |
|---|---|---|
| DSH 运行形态 | 应用内置 `@deepseek-ai/*` `0.2.1-rc.5`。npm `latest` 同为 `0.2.1-rc.5`。插件框架是 Cordis。 | `app.asar` 内 `dsh/node_modules/@deepseek-ai`；`npm view @deepseek-ai/dsh dist-tags` |
| 插件契约 | 插件导出 `name`、`inject`、`apply(ctx, config)`。bundle 用 `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`。profile 通过 `cordis.patch.yml` 按 row id 覆盖或插入。 | `dsh-fs-observation-policy/lib/index.js`；`dsh-base/package.json`；`dsh-experimental-badge-skill-bundle/cordis.patch.yml` |
| 工具拦截 | `tools/pre-execute` 是 dispatch 前的 waterfall，返回 `{kind:'allow'|'deny'|'ask'}`；deny 不执行工具，并把原因作为工具错误返回模型。`ctx.tools.guard()` 是之后的单调守卫。 | `dsh-tools/README.md`；`dsh-tools/lib/index.js` 的 `prepareExecution` |
| 工具字段 | `write` 参数是 `file_path`、`content`。`edit` 参数是 `file_path`、`old_string`、`new_string`。执行对象字段是 `exec.name`、`exec.arguments`、`exec.agent`。字段与现有 handler 的 `tool_input` 完全一致，不需要转换。 | `dsh-tool-fs/lib/index.js` 的 `applyWriteTool`、`applyEditTool`；`dsh-agent-instructions/lib/index.js` 的 `filePathFromExecution` |
| 生命周期 | `agent/pre-step` 可替换进入消息批次；`agent/turn-stopping` 在回合关闭前运行；会话身份是 `agent.session.id`，工作目录在会话 header。 | `dsh-agent/README.md` 的事件段；`dsh-agent-instructions/lib/index.js` 的 `agent/pre-step` 监听 |
| 技能与指令 | 指令加载 `$DSH_HOME/AGENTS.md`、`~/.agents/AGENTS.md` 与项目 `AGENTS.md`/`CLAUDE.md`。技能根包含项目 `.agents/skills` 与用户 `~/.agents/skills`。 | `dsh-agent-instructions/README.md`；`dsh-skill-filesystem/README.md` 的根表 |
| 现有 host 模型 | `RouteHost` 只有 `claude`、`codex`、`pi`。`AdapterHost` 用 `Exclude<RouteHost,'pi'>` 区分 adapter 宿主。`SETUP_HOSTS` 与 `SKILL_SURFACE_HOSTS` 各自硬编码三个宿主。 | `src/cli/hook/route-registry.ts`；`src/core/setup/types.ts`；`src/core/skill-surface/catalog.ts` |
| hook 输出 | `HOST_RENDERERS` 按 `HOOK_HOST` 选择输出。Pi 已有单对象 JSON 协议 `PI_HOOK_PROTOCOL = 1`，字段含 `decision`、`additional_context`、`diagnostics`。 | `src/cli/hook/hook-protocol.ts`；`src/pi/hook-bridge.ts` |
| 安装边界 | installer targets 只有 `codex`、`claude`。DSH 自己管理插件的安装、启用和 profile 写入。 | `src/cli/installer/targets/registry.ts`；`dsh-plugin-manager/README.md` |

## P2：真实调用路径

当前路径：DSH 工具 dispatch → `tools/pre-execute` → 已注册 guard → `tools/execute`。插件只注册监听，不改工具定义。

```text
DSH 会话 / 原生工具
        |
        v
repo-harness DSH 插件（Cordis，dist/dsh-plugin.js）
  tools/pre-execute · agent/pre-step · agent/turn-stopping
        |
        v
bun dist/hook-entry.js   HOOK_HOST=dsh   单个 JSON 对象
        |
        v
现有 typed handler / 仓库 policy / Git / 恢复记录
```

插件注入 `ctx.tools`。服务缺失时插件不加载，也不宣称已保护。hook 子进程使用当前包的 `dist/hook-entry.js`，不从 `PATH` 搜索另一份。环境清除继承的 `HOOK_*` 后写入 `HOOK_HOST=dsh`、`HOOK_SESSION_ID`、`HOOK_RUN_ID` 和 cwd。

| DSH 边界 | repo-harness 行为 | 失败处理 |
|---|---|---|
| 首次 `agent/pre-step` | 执行 `SessionStart.default`。把已预算的上下文作为一条持久用户消息插入本步批次，参照 `dsh-agent-instructions` 的做法。 | 非 Git、非 opt-in 返回 inactive，不插入消息。opt-in 仓库探测失败记为 unknown，并拒绝后续写入。 |
| 每个回合首次 `agent/pre-step` | 执行 `UserPromptSubmit.inbox`，把 advisory 消息并入同一批次。 | 投递失败只提示，不阻断工具；写入检查独立运行。 |
| `tools/pre-execute` 的 `write` / `edit` | 映射到 `PreToolUse.edit`。`tool_name` 写 `Write` 或 `Edit`，`tool_input` 直接使用 `exec.arguments`。 | deny、超时、无效 JSON、bridge 崩溃都返回 `{kind:'deny'}`。不自动重试检查。 |
| `tools/pre-execute` 的 `bash` | 映射到 `PreToolUse.bash`，`tool_input.command` 使用 `exec.arguments.command`。 | 只做已有字面写入 tripwire；已知路径拒绝时 deny，无法解析时放行并留诊断。 |
| `tools/result` | 执行 `PostToolUse` 的既有观察路径，携带真实会话和运行 ID。 | 保留真实错误结果；观察失败不重放已发生的写入。 |
| `agent/turn-stopping` | 执行 `Stop.default`，携带真实会话 ID 和取消观察。 | 只记录；不 steer、不阻断、不自动完成任务或释放所有权。 |
| 会话处置 | 取消并回收插件自己启动的 hook 子进程。 | 幂等清理。迟到结果按会话 ID 丢弃。 |

工具调用是并行的。结果按 `tool_call_id` 绑定原始输入。插件不保存单一“最近编辑路径”。

首版覆盖原生 `edit`、`write`、`bash`，包括经 PTC `run_code` 发出的同一管线嵌套调用。不覆盖 MCP 写入、`pwsh`、其他扩展直接写文件、`!` 用户命令。这不是 OS sandbox。文档必须明说这些路径未覆盖。

## P3：决定

1. 插件随现有 repo-harness 包发布，构建到 `dist/dsh-plugin.js`，运行时零第三方依赖（只用注入的 `ctx` 服务）。bundle patch 指向子路径导出 `repo-harness/dsh`。
   - 拒绝独立 npm 包：CLI 与插件会版本偏移，且要维护第二套发布。
   - 拒绝 installer 写 profile patch：会与 DSH 自己的包管理器和 HMR 争用同一份配置。

2. 复用现有 bridge JSON 协议。把 `PI_HOOK_PROTOCOL`/`PiHookOutput` 重命名为 `BRIDGE_HOOK_PROTOCOL`/`BridgeHookOutput`，Pi 与 DSH 共用；`HOST_RENDERERS` 增加 `dsh`。
   - 拒绝第二套 JSON 形状：两份 wire format 会漂移。

3. `dsh` 与 `pi` 同类：没有 JSON adapter 文件，插件直接调 hook。`AdapterHost` 改为显式 `'claude' | 'codex'`，不再依赖 `Exclude`。

4. 会话上下文只走 `agent/pre-step` 插入消息这一条通道，沿用 handler 的预算。拒绝第二上下文通道。

5. 安装由 DSH 负责。repo-harness 的 installer 不增加 `--target dsh`。`doctor` 与 setup 只读识别，不写 profile。

## 切片

### S1：插件与写入检查（一个 PR）

可独立交付：加载插件后，opt-in 仓库的原生 `edit`/`write`/`bash` 走现有检查。

| 文件 | 变更 |
|---|---|
| `src/dsh/plugin.ts`（新增） | Cordis 插件入口。注册 `agent/pre-step`、`tools/pre-execute`、`tools/result`、`agent/turn-stopping`。只做适配和调用。 |
| `src/dsh/hook-bridge.ts`（新增） | Bun 子进程、stdin、JSON 校验、超时、取消和输出上限。 |
| `src/dsh/compat.ts`（新增） | 版本和能力探测；hook 入口或 Bun 不可用时给出固定错误码。 |
| `src/cli/hook/route-registry.ts` | 增加 `dsh` 宿主；`bash`、`inbox` 路由加入 `dsh`。`subagent`/`context` 保持 Codex 专有。 |
| `src/cli/hook/hook-protocol.ts` | 协议重命名为 bridge 协议；增加 `dsh` renderer。 |
| `src/cli/hook/runtime.ts` | `HOOK_HOSTS` 加入 `dsh`。 |
| `src/pi/hook-bridge.ts`、`src/pi/extension.ts` | 跟随协议重命名，行为不变。 |
| `package.json` | `exports` 增加 `./dsh`；`dsh.bundle.patch`；新构建脚本 `build:dsh-plugin`；peer 依赖 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`（可选）。 |
| `cordis.patch.yml`（新增） | 一条插件 row，默认启用。 |
| `tests/dsh-plugin.test.ts`（新增） | 用真实 `@deepseek-ai/cordis` 与 `dsh-tools` 挂载插件，跑真实工具管线。 |
| `tests/pi-extension.test.ts` | 跟随协议重命名；断言不变。 |
| `docs/reference-configs/host-invariants.md` 与 assets 投影 | 增加 DSH 行和覆盖边界。 |
| `README.md`、`README.zh-CN.md` | 安装命令、前置 Bun、opt-in、覆盖范围。 |

### S2：只读识别（第二个 PR）

`SETUP_HOSTS`、`SKILL_SURFACE_HOSTS`、setup/doctor 检查增加 `dsh`。新增 `dsh-plugin` doctor 检查，读取 `<DSH_HOME>/profiles/*` 的依赖、bundle 选择和 patch。技能状态从共享 `~/.agents/skills` 读取外部技能，不新建投影根。operator setup 多一列，i18n 增加 DSH 文案。技能目录版本升到 3，旧 manifest 明确拒收。不新增写路径。

### 不计划

installer target、独立插件包、DSH review worker、子代理路由。需要时单独立项。

## 验证

在稳定候选上运行一次：

- `bun run check:type`
- `bun run test:files tests/dsh-plugin.test.ts tests/pi-extension.test.ts tests/hook-runtime.test.ts tests/hook-runtime-characterization.test.ts tests/mutation-guard.test.ts tests/skill-surface/catalog.test.ts --timeout 60000 --max-concurrency 1`
- `bun run build:hook-bundle`
- `bun run build:dsh-plugin`
- `bash scripts/check-ci.sh core`

有意义的测试路径：

- 非 Git、非 opt-in、正常文件、受保护路径、路径逃逸和 symlink。
- `write` 新建与覆盖；`edit` 替换；PTC 嵌套调用。
- handler 崩溃、无效 JSON、子进程超时、取消、stdin 上限。
- 同一回合并行调用；两个会话；恢复；迟到结果；处置重入。
- 缺少 Bun、hook bundle 不存在、版本不符。结果必须明示 unavailable 并拒绝写入。
- 原有 Claude/Codex/Pi 输出、路由顺序和安装投影保持通过。

真实宿主验收需要用户参与：在本机 DSH profile 加载候选包，观察受保护写入被拒、非 opt-in 仓库不动作、禁用插件后恢复原生行为。本机 `dsh` CLI 不在 `PATH`，应用内 CLI 需用隔离 `DSH_HOME` 启动。验收结果记录为人工证据，不以 fixture 代替。

## 风险与回滚

最脆弱的假设：Cordis loader 能从 profile 解析 `repo-harness/dsh` 子路径导出。若不成立，回退到根导出之外的单文件 `exports` 条目；再不行，改为独立的 bundle 文件路径。实施 S1 时先用隔离 profile 验证这一点，再写其余代码。

用 `repo-harness@<version>` 安装会把整个包的依赖装进 profile。默认文档使用 `link:` 指向已安装目录，避免第二份副本。发布说明写清两种方式的代价。

回滚：`dsh plugin remove repo-harness` 停止检查；代码用 `git revert`。本方案不改数据、不改用户仓库、不迁移配置。

## 审批边界

- 本方案只授权本地分支与本地提交。push、PR、合并需单独授权。
- 不修改用户的 `~/.dsh` profile。实测使用隔离 `DSH_HOME`，或由用户明确指定。
- 不改 `~/.agents/skills` 与现有技能投影。
