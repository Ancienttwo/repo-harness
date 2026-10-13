# Plan: Operator 控制台 Tools 页

> **Status**: LOCKED（owner 2026-10-13 锁定 Q1–Q6，全部按推荐，见 §8）。实施还要等 owner 单独 GO。GO 之前不写 UI 或代码。
> **Created**: 20261013-1706
> **Slug**: operator-tools-tab
> **Artifact Level**: work-package
> **Baseline**: `main@3defc604`
> **Branch**: `claude/operator-tools-tab-plan`
> **Depends on**: PR #713（`Recommended Frontend and Design Resources` 一节）。写这份计划时 #713 还是 OPEN，没有合入 main。P0 的资源条目以 #713 合入后的内容为准。
> **Related**: PR #704（桌面 app 包装现有 Operator web）。Tools 页进入 web 之后，桌面 app 自动得到它，#704 不用改。
> **Verification Boundary**（实施阶段）：`bun run check:type`；受影响测试；`bun run check:reference-configs`；`bun run build:operator-web`；真实浏览器截图（亮/暗，1440 与 390 宽，zh/en）。
> **Rollback Surface**: 每期一个 PR，`git revert <squash-commit>`。没有持久化状态，没有迁移。

## 0. P1 / P2 / P3

**P1 现状**
- 导航权威是 `src/operator-web/workspace-location.ts` 的 `WORKSPACES`：`board, repositories, agents, skills, hooks, architecture, system`。注释写明「每一项都有数据源，不放占位页」。手机宽度下 `skills, hooks, architecture` 收进 More 菜单（`App.tsx` 的 `PHONE_OVERFLOW`）。
- Agents / Skills / Hooks 三页读同一个 `GET /api/v1/setup`。服务端在后台跑 `repo-harness setup check`，缓存结果。浏览器只解码、排序，不跑命令（`src/operator-web/setup.ts`）。
- `setup check` 的构建器 `src/cli/commands/init-hook.ts` 已经调用 `scripts/check-agent-tooling.sh --json`。detector 报告 `tools.{waza, herdr_skill, codex_automation_profile, obsidian_runtime_skills, agent_fleet, codegraph, archctx}` 和 `runtime_capabilities.herdr`。每个 tool 带 `status`、`reason`，多数带 `install_command`。这些 install 命令依赖上下文：CodeGraph 看是否 vendored，Waza 看 host，fleet 看 target。
- setup 快照（`src/core/setup/types.ts`）只放 `warn / fail / needs_agent` 的 check。`ok` 和 `na` 只进 `summary` 计数。快照里没有「某个 tool 已安装」这个值。只有 `agent_fleet` 的 per-host 结果通过 `fleet[].hosts` 进入快照。
- 推荐资源的唯一文字来源是 `assets/reference-configs/external-tooling.md`。`bun run sync:reference-configs` 把它投影到 `docs/reference-configs/`。下游脚手架复制这份 markdown（`scripts/lib/project-init-lib.sh` 的 `PI_*_REFERENCE_CONFIGS`）。#713 在这里加了一张三列表：Repo、用途、License，并写明「repo-harness does not install, detect or update them」。
- 复制命令已有组件：`ui.tsx` 的 `CommandLine`（`$` + 命令 + 复制按钮），底层是 `clipboard.ts` 的 `navigator.clipboard.writeText`，失败时报告失败。
- i18n 是自带字典 `i18n.ts`。`zh` 按 `en` 的 key 集合做类型检查，少一个翻译就是 typecheck 失败。
- 机器可读 catalog 的先例：`assets/skill-commands/manifest.json` 是 skill 的权威，Skills 页的 summary 来自它。`assets/workflow-contract.v1.json` 是带版本号的 JSON 合同。

**P2 追踪**（一条真实路径）
- 用户想给项目加 `DESIGN.md`。今天他要打开 `external-tooling.md`，找到 #713 那张表，点 GitHub 链接。Operator 控制台里看不到这张表。
- 用户想知道 CodeGraph 装没装。今天 detector 已经知道答案。但 CodeGraph 状态为 `present` 时，setup check 记为 `ok`，快照里没有这条记录。控制台只在出问题时显示它。用户看不到「已安装」。
- 压力点有两个。第一，推荐清单没有机器可读的来源。第二，detector 的 per-tool 状态在投影到快照时被丢掉了。

**P3 决定**
- 新加一个 Tools 页，放在 Hooks 后面。它和 Agents / Skills / Hooks 同属「本机环境」。
- 推荐清单的权威改成一个 JSON catalog。`external-tooling.md` 里的表格从 catalog 生成，并做 drift check。
- 本机工具的状态和安装命令继续由 detector 负责。catalog 只写 detector key，不复制命令，也不定义新的探测命令。
- 远程设计资源只显示链接和 license，状态是 N/A。repo-harness 不安装它们，也不探测它们。

## 1. 目标与非目标

**目标**
1. 在控制台里读到推荐工具清单：名称、类别、链接、license、用途。
2. 对已有 detector 的本机工具，显示真实安装状态。
3. 对需要安装的本机工具，给一条可复制的安装命令。

**非目标**
- UI 不安装、不更新、不卸载任何东西。所有动作只是复制命令或打开链接。
- 不为远程设计资源加探测。不 clone，不下载，不拉取 README。
- 不在 GET 请求路径上跑新的子进程。状态只来自 setup check 的缓存结果。
- 不改 detector 的探测逻辑。不加 `--check-updates` 的默认调用。
- 不改 #704 的桌面 app 计划。

## 2. 不变量

- **T1 单一权威**：推荐清单只有一个来源（catalog JSON）。markdown 表格是确定性投影，`check:reference-configs` 检查漂移。
- **T2 探测只来自 detector**：catalog 不含可执行的探测命令。服务端不根据 catalog 内容拼 argv。一个 tool 有状态，前提是 detector 报告了它。
- **T3 安装命令只有一个来源**：本机工具的安装命令来自 detector 的 `install_command`。catalog 不重复写。远程资源没有安装命令（§8 Q3 已锁定）。
- **T4 不推断**：setup 快照缺少某个 tool 时，状态是 `unknown`。不能把「没有 warn/fail check」当成「已安装」。
- **T5 只读**：控制台继续是 read-only。复制失败要显示出来，不静默。
- **T6 隐私**：detector 的 `reason` 和命令文本经过 `publicAgentConfigText` 脱敏，和现有 setup check 文本一致。不显示本机绝对路径。

## 3. 导航位置

- `WORKSPACES` 变成 `board, repositories, agents, skills, hooks, tools, architecture, system`。
- hash 路由：`#tools` 是列表，`#tools/<tool-id>` 打开详情。`<tool-id>` 用严格正则校验（例如 `^[a-z0-9][a-z0-9-]{0,63}$`），并且必须是 catalog 里的 id。不合法时回到 Board，和 `#architecture/<cap>` 的处理一致（`parseWorkspaceLocation`）。
- 手机宽度：`tools` 加入 `PHONE_OVERFLOW`，进 More 菜单。底栏不变宽。
- 图标：从现有 Phosphor 图标里选一个（例如 `WrenchIcon`），不加新依赖。
- P0 有 catalog 作为数据源，所以满足「不放占位页」的规则。

## 4. 数据源

### 4.1 选项

| 选项 | 做法 | 问题 |
| --- | --- | --- |
| A. markdown 作权威 | 服务端或构建时解析 `external-tooling.md` 的表格 | 这是 prose 的影子解析器。三列表放不下 kind、detector key、类别。改一个标点就可能静默丢条目 |
| B. JSON catalog 作权威（推荐） | 新文件 `assets/tool-catalog.v1.json`。markdown 表格由它生成 | 多一个文件和一个生成步骤 |
| C. 两份手写 | markdown 和 JSON 各写一份 | 两个权威，必然漂移。排除 |

### 4.2 推荐做法（B）

- 文件：`assets/tool-catalog.v1.json`。命名跟 `workflow-contract.v1.json` 一致。它在 `assets/` 下，随 npm 包发布。
- 不放进 `assets/reference-configs/`。那个目录的投影清单是「目录下所有 `.md`」，JSON 放进去会混淆这个规则。
- `external-tooling.md` 的推荐资源表格放在一对标记之间，例如 `<!-- tool-catalog:resources:begin -->` / `<!-- tool-catalog:resources:end -->`。标记外面的说明文字（「不安装、不探测」「用户选 DESIGN.md」）继续手写。
- 生成：扩展现有 `scripts/sync-reference-configs.ts`。`--write` 先渲染表格区，再投影到 `docs/`。`--check` 发现表格区和 catalog 不一致时失败。不新建第二个 sync 命令。
- 下游脚手架照旧复制 markdown，得到的是渲染好的表格。下游不需要 JSON。
- 浏览器拿 catalog 的方式：构建时由 `vite.operator.config.ts` 打包进前端（静态 import），用 `src/core/` 下一个严格解码器校验（同 `decodeSetupSnapshot` 的风格：精确 key，封闭枚举）。catalog 是随包版本固定的数据，`dist/operator-ui/` 和 catalog 来自同一个版本。P0 不需要新 API。

## 5. 每个条目的字段

```text
id            稳定 id，小写短横线，用于 #tools/<id>
name          显示名，例如 "shader-effects-inc/shaders"
kind          "resource" | "local_tool"
category      封闭枚举：frontend | design | agent_skills | code_navigation | orchestration
url           上游主页，必须是 https
license       SPDX id，例如 "MIT"；不知道时为 null，UI 显示「未知」
summary       en / zh 两种文字，一两句用途
detector      仅 local_tool：check-agent-tooling 的 tools.<key>，例如 "codegraph"；没有 detector 时为 null
docs_anchor   external-tooling.md 里对应小节的锚点，例如 "#codegraph"；可为 null
```

状态（运行时，不写进 catalog）：

| 状态 | 条件 |
| --- | --- |
| `installed` | detector status 为 `present` |
| `partial` | detector status 为 `partial` |
| `missing` | detector status 为 `missing` |
| `unknown` | setup 快照不可用；或 detector 没报告这个 key；或 detector 给了其他值（如 `invalid`、`unverified`） |
| `n/a` | `kind = resource`；或 `local_tool` 但 `detector = null` |

- 映射表只写在一个地方（`src/core/` 的投影函数）。详情页同时显示 detector 原始 status 和 reason，用户能看到映射前的值。
- `summary` 的中英文放在 catalog 里，不放进 `i18n.ts`。`i18n.ts` 只放页面 chrome（标题、列名、状态词、空状态）。这样加一个工具只改 catalog，不改前端字典。

## 6. UX

**列表**（`#tools`）
- 两个分组：「本机工具」(`local_tool`) 和「推荐资源」(`resource`)。分组标题旁边显示计数，复用 `SectionTitle`。
- 每行：名称、类别标签、状态点（复用 `StatusDot`）、license。
- 本机工具组：`missing` 和 `partial` 排在前面，组内保持 catalog 顺序。这和 Skills 页「异常在前」的规则一致。
- 页面顶部一行说明边界：资源由用户自己选择和添加，repo-harness 不安装它们。
- 新鲜度行复用 setup 页面现有的那一行（`setup check` 的采集时间和刷新失败提示），因为状态来自同一个快照。

**详情**（`#tools/<id>`）
- 名称、类别、license、上游链接（复用 `ExternalLink`，`noopener`）、用途说明。
- 本机工具：状态、detector 原始 status、reason；有 `install_command` 且状态不是 `installed` 时，用 `CommandLine` 显示并可复制。
- 资源：不显示安装命令。显示「打开上游 README」链接；有 `docs_anchor` 时显示「repo-harness 文档」链接。
- 宽屏用右侧抽屉（复用 `Drawer.tsx` 的 `DrawerFrame` 和 `useModalFocus`），手机全屏。Esc 关闭并把焦点还给列表行。

**复制**
- 只用现有 `CommandLine` / `CopyButton`。复制失败时显示现有的失败提示。

**i18n**
- 新 key 加在 `en` 和 `zh` 两边：`nav.tools`、页面标题、分组名、列名、五个状态词、空状态、边界说明。`zh` 少 key 会让 typecheck 失败，这是现有保护。

**空状态和失败**
- catalog 解码失败：这是构建错误，测试会拦住，不进入运行时。
- setup 快照 loading / unavailable：资源组照常显示；本机工具组的状态全部显示 `unknown`，并显示 setup 页面现有的失败说明和 `repo-harness setup check` 命令。

## 7. 分期

**P0：catalog 和只读列表**（依赖 #713 合入）
- 新建 `assets/tool-catalog.v1.json`，条目包括 #713 的两个资源，和四个本机工具：Waza、CodeGraph、herdr skill 有 detector key；hai-stack 的 `detector` 为 null，`docs_anchor` 为 `#hai-stack`（Q2 已锁定）。agent fleet 不进 catalog。
- `sync-reference-configs.ts` 渲染 markdown 表格区，`--check` 检查漂移。
- Tools 页、导航、hash 路由、详情、i18n。
- 本机工具在 P0 全部显示 `unknown`，详情只给 `docs_anchor` 链接，不给命令。P0 不改服务端。

**P1：接入已有 detector 的状态和命令**
- setup 快照加一个字段，例如 `tools: { key, status, reason, install_command }[]`，内容是 detector `tools.*` 的投影。全部 tool 都放进去，包括 `ok` 的，解决 §0 P2 里「已安装看不见」的问题。文本经过 `publicAgentConfigText`。
- 这是 `repo-harness.setup.v1` 的结构变化。解码器是精确 key，所以服务端和前端必须同一版本发布。版本号保持 v1（Q5 已锁定）。
- 浏览器把 catalog 的 `detector` key 和快照的 `tools[].key` 做 join。catalog 里写了 detector key、但 detector 不报告的条目，显示 `unknown`。
- 不加新的 API 路由，不加新的子进程。setup check 已经跑 detector。

**P2：可选，GO 之后再定**
- 搜索和按类别过滤（条目超过 20 个再考虑）。
- 显示 `--check-updates` 的结果。这需要网络，默认不开。
- 项目级「已采用」状态，例如仓库里有没有 `DESIGN.md`。这是仓库事实，不是本机安装事实，需要单独的数据源设计。

## 8. Owner 决定（2026-10-13 锁定，全部按推荐）

1. **Q1 数据源**：选 B。`assets/tool-catalog.v1.json` 是权威，`external-tooling.md` 的表格区由它生成，`check:reference-configs` 检查漂移。
2. **Q2 P0 的本机工具清单**：Waza、CodeGraph、herdr skill，它们都有 detector key。hai-stack 也进 catalog，在 Tools 页显示，`detector` 为 null，状态是 `n/a`。它的详情只给 `docs_anchor`（external-tooling.md 的 `#hai-stack`），不给安装命令。不给 detector 加探测。agent fleet 不在 Tools 页重复列出，它留在 Agents 页。（owner 2026-10-13 澄清：之前的「docs-only」说法以此为准。）
3. **Q3 资源的安装命令**：资源只给上游链接，不给安装命令。catalog 不写包名。
4. **Q4 类别枚举**：`frontend | design | agent_skills | code_navigation | orchestration` 够用。
5. **Q5 快照版本**：P1 保持 `repo-harness.setup.v1`。服务端和浏览器包同一个 npm 版本发布。
6. **Q6 页面名称**：英文 `Tools`，中文「工具」。

## 9. 测试要点（计划层，不写代码）

- **catalog 解码**：合法 catalog 通过；多余 key、未知 kind/category、非 https url、`resource` 带 `detector`、重复 id 都失败。
- **markdown 漂移**：改 catalog 不跑 `--write`，`check:reference-configs` 失败；改表格区手写内容，同样失败；标记缺失时失败，不静默跳过。
- **路由**：`#tools`、`#tools/<合法 id>` 进入 Tools；不合法 id、未知 id、多余路径段回到 Board。扩展现有 `parseWorkspaceLocation` 的测试。
- **状态投影**（P1）：五种状态各一个用例；detector 缺少 key 时为 `unknown`；setup 快照 unavailable 时本机工具全部 `unknown`，资源仍显示。
- **快照解码**（P1）：扩展现有 setup decode 测试，覆盖新字段的精确 key 和脱敏。用真实 detector JSON 做 fixture，不手写理想值。
- **i18n**：typecheck 覆盖 zh/en key 完整性，不加单独测试。
- **复制**：复用现有 `copyOperatorIdentifier` 测试；只加一个用例证明详情页的命令来自快照，不来自 catalog。
- **浏览器**：亮/暗、1440/390、zh/en 截图；手机宽度下 Tools 在 More 菜单里；详情抽屉的 Esc 和焦点返回。

## 10. 风险

- #713 没合入或被改：P0 的资源条目跟着改。计划本身不受影响。
- detector 新增或改名 tool key：catalog 的 `detector` 对不上，页面显示 `unknown`，不会显示错误的「已安装」。P1 可以加一个测试，检查 catalog 的 detector key 都在 detector 输出里。
- setup 快照变大：每个 tool 一行，七八个 tool，影响可以忽略。
