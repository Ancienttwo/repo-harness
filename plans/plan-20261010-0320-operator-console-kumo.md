# Plan: Operator 控制台重建（Kumo + 真实开发进度看板）

> **Status**: Approved（Aimpact 2026-10-10 确认：本地 Web 先行；第一、二期只读；数据以 Git + GitHub 为主、ledger 补充；失效 registry 折叠并给清理命令；引入 `@cloudflare/kumo` 整体重构）
> **Created**: 20261010-0320
> **Slug**: operator-console-kumo
> **Artifact Level**: work-package
> **Baseline**: `main@5f6065b4`
> **Branch**: `feat/kanban-human-redesign`，worktree `/tmp/repo-harness-wt-kanban-redesign`
> **Supersedes**: `plan-20261005-0405-operator-ui-revamp.md` 的 §4.1 导航和 §4.4 Pipeline 工作区的 UI 部分。该计划 §2 的不变量 I1–I9 继续有效。
> **Verification Boundary**: `bun run check:type`；受影响测试；`bun run build:operator-web`；`bun run smoke:tarball-install`；真实浏览器截图（亮/暗，1440 与 390 宽），真实数据与 fixture 各一组。
> **Rollback Surface**: 一个 PR，`git revert <squash-commit>`。新快照文件只在 ignored 目录，删除即可。

## 0. P1 / P2 / P3

**P1 现状**
- 前端 `src/operator-web/`：手写 `styles.css` 523 行，`App.tsx` 1876 行。顶层五个标签，其中 Docs、Pipeline、Agent config 是空占位。真正的 Pipeline Board 在 Overview › Organization/Attention 里，排第 5 个面板。卡片是平铺列表，不分列，不可点击。
- 后端 `src/effects/operator/server.ts`：只有 GET/HEAD。数据来自 Fleet 快照、collaboration 快照、pipeline ledger 快照、runtime overlay 缓存、notify 状态、架构模型。
- 这台机器上的真实数据（2026-10-10 用 0.21.1 的 `operator serve` 实测）：
  - `/api/v1/pipelines`：`unavailable`，0 张卡。
  - Fleet：2499 个登记仓库，2489 个已失效，10 个可读，`known_tasks: 0`。
  - runtime overlay：未配置。
- Agent 真实的开发活动在 git worktree、分支和 GitHub PR/CI 里。当前没有任何读取器采集这些事实。

**P2 追踪**（一条真实路径）
- Codex 在 `/tmp/repo-harness-0212-integration-48d39b05` 的 `codex/release-0.21.2-integration` 分支上工作 → 推送 → PR #604（Draft）→ CI 运行 → 冲突（main 前进）→ 修复后 fast-forward 推送 → `MERGEABLE`。
- 这条路径上，ledger 没有记录，Fleet 没有任务卡，runtime 没有观察。现有看板对它完全不可见。
- 压力点：数据源，不是样式。

**P3 决定**
- 看板以 Git + GitHub 的权威事实为主。由 serve 进程里的后台 collector 定时采集，写成快照。GET 只读快照，符合 I4。
- ledger 有记录时，叠加更细的阶段。两个值并排显示，不合成一个值。
- UI 整体换成 Kumo + Tailwind v4。现有数据读取、解码和刷新逻辑保留，只重写展示层。
- 10x 时先坏的地方：仓库数 × PR 数让 `gh` 调用变慢。对策是按仓库限并发、有超时、按仓库缓存，单个仓库失败只标记该仓库。

## 1. 目标与非目标

**目标**
1. 一个人一眼看清：哪些工作在等他拍板，每个工作在哪个阶段，哪个 agent 在做、现在什么状态，哪里卡住了。
2. 打开就有真实数据。
3. 新外框可以继续承载第二期的配置页（Agents / Skills / Hooks）。

**非目标**
- 不做写入。不做拖拽。不做审批按钮。所有「动作」只给链接（如 GitHub PR）或一条可复制的命令。
- 不做 Tauri/桌面打包。
- 不改 ledger 的写入路径，不改 `pipeline` CLI 语义。
- 不在 GET 里调用 `gh`、`git` 或任何外部进程。
- 本期不做 Agents / Skills / Hooks 页面。导航里不放没有数据的占位项。

## 2. 不变量

继续有效：旧计划的 I1–I9（只读、单一指令通道、GET 白名单、GET 不探测、不泄露 secret/私有路径、单一权威、CLI/UI 一致、写入失败可见、UI 不触发动作）。

新增：
- **N1 collector 边界**：collector 只在 `operator serve` 进程内的后台定时器里运行，不在请求路径上。argv 是代码里的常量加经过校验的仓库路径，请求里的值不进入 argv。每个子进程有超时。并发有上限。
- **N2 权威表**：每个显示值只有一个来源（见 §3.3）。来源缺失时显示「未知」，不推断。
- **N3 不推断 agent 身份**：agent 只来自 ledger 的 `owner_bot` 或已验证的 runtime 绑定。不从分支前缀、PR 作者、提交信息推断。
- **N4 隐私**：worktree 只显示目录名，不显示绝对路径。不显示终端文本、prompt、工具参数。PR 标题和分支名照 GitHub 原样显示（它们本身是公开协作数据）。
- **N5 fixture 只在开发构建**：fixture 数据只能在 `import.meta.env.DEV` 下加载，不进入生产包。

## 3. 数据：Dev Activity 快照

### 3.1 采集（`src/effects/dev-activity/`）
对每个**可读**的登记仓库（Fleet registry 里 status 为 ok 的条目）：
- `git --no-optional-locks worktree list --porcelain`：worktree 目录名、分支、HEAD。
- 每个 worktree：`git --no-optional-locks status --porcelain=v2 --branch`，得到 dirty 与 ahead/behind（相对上游）。
- 只采集当前 `gh` 登录用户作者的 PR（`--author @me`），只取要显示的范围，分三次查询：open 的 PR（带 `statusCheckRollup`）；7 天内 merged 的 PR；7 天内 closed 且未合并的 PR。日期由 collector 时钟算出，不来自请求。merged/closed 不查 CI，`ci` 为 null。本地 worktree 的分支总是工作项。任一次查询失败，该仓库的 GitHub 源标记为 `unavailable` 并带原因码，不重试、不降级。仓库没有 GitHub remote 或 `gh` 未登录时同样标记。
- 周期：启动时一次，之后每 60 秒。单次子进程超时 15 秒。仓库并发上限 4。
- 结果写入内存缓存。GET 只读缓存。缓存带 `collected_at`、每个仓库每个源的 `status` 与 `observed_at`。

### 3.2 工作项身份
- 工作项 = (仓库, 分支)。分支来自 worktree，或来自 PR 的 `headRefName`。
- worktree 与 PR 按「同仓库且分支名完全相等」关联。这是 GitHub 自己用的键，不是启发式。
- ledger 记录按 `resources.branch` 完全相等关联到工作项。没有分支的 ledger 记录单独成卡。
- 默认分支（main/master 等，取自 `gh` 或 `git symbolic-ref`）不是工作项。

### 3.3 列与权威表

| 列 | 进入条件（GitHub/git 事实） |
|---|---|
| 计划中 | 只有 ledger 记录，阶段为 `plan` / `plan-review`，且没有分支 |
| 开发中 | 有分支或 worktree 但没有 PR；或 PR 是 Draft |
| 验证中 | PR 非 Draft、OPEN，且 `mergeStateStatus` 不是 `CLEAN` |
| 待合并 | PR 非 Draft、OPEN，且 `mergeStateStatus == CLEAN` |
| 已发布 | PR `MERGED`，且 `mergedAt` 在 7 天内 |

开着的 PR 的 `column_since` 取 PR 创建时间。GitHub 不提供「何时变成可合并」的时间，界面写「PR 创建于」。

- 7 天内关闭未合并的 PR 默认隐藏，用筛选打开。7 天前合并或关闭的 PR 不采集。
- ledger 阶段只作为卡片上的阶段徽标，不改变列。两者不一致时并排显示，不判定谁对。
- `blocked` 不是一列。卡片留在原列，加红色边和「卡住 · 原因 · 多久」。

| 显示值 | 唯一来源 |
|---|---|
| 列 | PR 状态 / worktree 存在性（上表） |
| 细阶段 | ledger `phase` |
| CI | `statusCheckRollup` 汇总：通过 / 失败 / 进行中 / 无 |
| Review | `reviewDecision` |
| agent | ledger `owner_bot` 或已验证 runtime 绑定；否则「未关联 agent」 |
| agent 实时状态 | runtime overlay v4 |
| 卡住原因 | ledger `blocked.reason`，或 runtime `blocked` |

### 3.4「需要你」队列（唯一定义，同时驱动页面计数和标签页标题）
按等待时长排序，旧的在前：
1. 待合并列的每张卡（合并需要人授权）。
2. ledger `merge-ask` 阶段或带 `waiting_owner` 标记的记录。
3. collaboration 快照里未关闭的正式 Human 请求（现有 Decision 数据）。
4. runtime 观察为 `blocked`（权限、提问、登录）且数据新鲜。

不进队列，只显示在卡片上：CI 失败、changes requested、worktree dirty、已合并但 worktree 还在（显示「可清理」提示和命令）。

### 3.5 GET 合约
- 新路由 `GET /api/v1/dev-activity`，`write:false`，登记在 `OPERATOR_ROUTES`。返回 `repo-harness.dev-activity.v1`。
- 类型放在 `src/core/dev-activity/types.ts`，投影（列、队列、权威表）放在 `src/core/dev-activity/projection.ts`，纯函数，可单测。
- 浏览器端严格解码，拒绝未知字段；拒绝绝对路径样文本，但 PR 来源的标题（`pull_request.title`、带 PR 的 item `title` 及其 attention `summary`）除外，N4 逐字显示。PR 标题是 GitHub 公开数据；本机文本（ledger 标题、blocked 原因、`display_name`、Decision 问题、runtime 原因）仍遮蔽。

## 4. 前端

### 4.1 技术栈
- devDependencies 新增 `@cloudflare/kumo@2.14.0`、`@phosphor-icons/react`、`tailwindcss@4`、`@tailwindcss/vite`。
- 删除 `styles.css` 和三个 `@fontsource` 包。用 Kumo 主题。
- 亮/暗：默认跟随系统，可手动切换，写在 `<html data-mode>`。
- 继续用 hash 路由，不加 router 依赖。

### 4.2 外框
- 左侧窄导航：**看板**（默认）/ **仓库** / **架构** / **系统状态**。
- 顶栏：仓库筛选；一行新鲜度（「14 秒前更新 · 3 个源正常 · 1 个过期」）；「需要你 N」徽标；刷新；语言；亮暗。
- 标签页标题：`(N) repo-harness`，N 为 §3.4 的计数。

### 4.3 看板
- 顶部「需要你」队列：最多 5 行，其余「+N」。每行：事项 · 仓库/分支 · 等了多久 · 一个链接或一条复制命令。
- Agent 状态条：每个 runtime 源一枚：provider 图标、标签、状态点、多久前变化、新鲜度。未绑定任务时写「未关联任务」。未配置 runtime 时只显示一行灰字和配置命令。
- 五列（§3.3），列头带数量。
- 卡片最多四行：
  1. 标题（PR 标题，或分支名），仓库短名灰字。
  2. 阶段徽标（ledger 细阶段，若有）+ 在本列多久。
  3. agent 行：角色、状态点、卡住原因（若有）。没有就「未关联 agent」灰字。
  4. 信号（有才显示）：PR 号（链接）、CI、Review、dirty、ahead/behind。
- 点卡片打开右侧抽屉（Esc 关闭，j/k 切换，URL 可直达）。分区：现在（agent 状态）/ 交付（分支、worktree 目录名、base/head、PR、CI、Review）/ 证据与门禁（ledger 有才显示）/ 历史 / 技术细节（折叠：id、digest、state_version）。
- 键盘：`/` 搜索，`j`/`k`，`Esc`，`g n` 跳到队列。
- 筛选：仓库、只看需要我、显示已关闭。
- 空状态：一句人话 + 一条命令。读取失败：保留上次数据并标出年龄。

### 4.4 其他页面（从现有视图迁移，换成 Kumo 展示，数据与行为不变）
- **仓库**：可读仓库列表（名称、worktree 数、开着的 PR 数、源状态）。失效登记折叠成一行「N 个已失效登记」，附 `repo-harness fleet prune` 预览命令和 `--apply --expected-revision <digest>` 说明（该命令不备份，文案写明）。点仓库进入详情：Fleet 任务（Planning/Delivery 原数据）、automation supervision、Organization/Attention。
- **架构**：现有 Architecture 工作区，换展示层。
- **系统状态**：notify 插件、ledger 健康、runtime 源健康、collector 各源状态。治理说明集中放在这里，卡片上不再重复。
- 删除 Docs、Pipeline、Agent config 空占位。

### 4.5 开发预览
- 新增 `bun run dev:operator`：Vite dev server，代理 `/api` 到 `operator serve`。
- `?fixture=<name>` 只在 DEV 下生效，加载 `src/operator-web/fixtures/*`。至少提供：`busy`（每列有卡、队列 3 条、runtime 3 源）、`empty`、`degraded`（gh 不可用、ledger 不可用）。

## 5. 测试

- 保留并继续通过：写边界、服务端守卫、解码器、刷新生命周期（30s / 120s 上限 / 隐藏暂停 / 丢弃迟到响应）、仓库切换持久化、任务 URL。
- 新增：
  - `projection.ts`：每列进入条件、关联规则（完全相等）、默认分支排除、队列四个来源、7 天窗口、未知值不推断。
  - collector：超时、并发上限、gh 失败只影响单仓库、argv 不含请求值、不输出绝对路径。
  - 路由：`/api/v1/dev-activity` 是 GET-only，登记在白名单。
  - UI：队列计数与标签页标题一致；卡片不出现 `repo_` / `sha256:` 作为主标签；没有拖拽或写入控件；暗色模式渲染。
- 锁死旧 DOM 文本和 CSS 字面量的测试（`operator-interactions.test.tsx:1202-1216` 等）随展示层重写。每一处改动在 PR 里逐条说明理由。行为断言不删。

## 6. 分工（并行，文件不重叠）

| 执行者 | 拥有的文件 |
|---|---|
| W1 后端 | `src/core/dev-activity/**`、`src/effects/dev-activity/**`、`src/effects/operator/server.ts`、`src/cli/commands/operator.ts`、对应 `tests/core/dev-activity*`、`tests/effects/dev-activity*`、`tests/cli/operator-serve.test.ts` |
| W2 前端 | `src/operator-web/**`、`vite.operator.config.ts`、`package.json`、`bun.lock`、`tests/operator-web/**` |

- W1 先交 `src/core/dev-activity/types.ts`（§3 的合约）。W2 按该类型写 fixture 并行开发。
- 合约有变化时只由 W1 改，W2 跟进。
- 编排者负责提交、门禁和 PR。

## 7. 后续（不在本 PR）
- 第二期：Agents（宿主列表来自 `RouteHost`，在 #607 合入后）、Skills、Hooks 只读页，数据来自 `setup check` 与 skill projection 快照。
- 第三期：写入。界面先展示确切 diff，确认后调用现有 CLI。hook 和权限改动逐项确认。
- runtime 与工作项的正式绑定（让卡片上 agent 不再是「未关联」）。
