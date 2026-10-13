# Plan: repo-harness 桌面版（Operator 控制台的桌面壳）

> **Status**: Draft。等 Aimpact 批准，设计细节之后和 Dot 一起定（见 §11）。批准前不写产品代码。
> **Created**: 20261013
> **Slug**: desktop-app
> **Artifact Level**: work-package
> **Baseline**: `main@0ef9ed11`（0.22.1 已发布）
> **Relates to**: `plans/plan-20261010-0320-operator-console-kumo.md`（下称 Kumo plan）、`plans/plan-20261005-0405-operator-ui-revamp.md`（下称 revamp plan）
> **Lifts**: Kumo plan §1 的非目标「不做 Tauri/桌面打包」，revamp plan §1 的非目标「不做桌面壳或菜单栏应用」。只对本 work-package 解除，要 Aimpact 批准。两份 plan 的其他非目标和不变量 I1–I9、N1–N5 继续有效。
> **Verification Boundary**: 每个 phase 一个 PR。CLI 改动跑 `bun run check:type`、受影响测试、`bun run smoke:tarball-install`。桌面壳跑 `cargo test`，并在 macOS Apple Silicon 上从 Finder 启动做真实验收（§10）。
> **Rollback Surface**: 每个 phase 单独 `git revert <squash-commit>`。桌面壳在独立目录 `desktop/`，不进 npm 包。删除 app 不影响 CLI 和数据。

事实标记：带 `file:line` 的内容已在 `0ef9ed11` 上核对。**inferred** 表示从代码或文档推断，没有运行。**unverified** 表示要在 Phase 0 实测。

---

## 0. P1 / P2 / P3

**P1 地图（真实边界）**
- 启动入口：`repo-harness operator serve`（`src/cli/commands/operator.ts:96-120`、:123-140）。只接受 `127.0.0.1` 或 `::1`（:64）。`--port 0` 让系统选端口。启动后第一行 stdout 是 URL（:98）。收到 SIGINT/SIGTERM 时关闭（:108-109）。参数错误退出码 2，其他错误退出码 1，stderr 是一行 JSON（:84-90）。
- 服务端：`src/effects/operator/server.ts`。默认端口 4318（:49）。协议号 1，服务名 `repo-harness-operator`（:46-47）。`/healthz` 返回 `{ok, service, protocol}`（:1502-1510）。路由表 `OPERATOR_ROUTES` 全部是 GET 且 `write:false`（:102-119）。
- 安全头：每个响应带 `X-Frame-Options: DENY`（:232、:255）。静态文档的 CSP 是 `default-src 'self'; connect-src 'self'; frame-ancestors 'none'` 等（:244）。Host 不对返回 421（:1453）。Origin 存在且不是 `http://127.0.0.1:<port>` 时返回 403（:1456-1459）。`/api/*` 带 `Sec-Fetch-Site` 且不是 `same-origin`/`none` 时返回 403（:1481-1483）。
- 前端：`src/operator-web/`，构建到 `dist/operator-ui`（`vite.operator.config.ts`）。服务端从包内 `dist/operator-ui` 提供静态文件（`server.ts:85-88`）。所有 API 请求都是相对路径（例如 `dev-activity.ts:21`、`setup.ts:24`、`fleet-api.ts:76`）。
- 运行时：`bin.repo-harness` 是 `src/cli/index.ts`，shebang 是 `#!/usr/bin/env bun`（`package.json` `bin`、`src/cli/index.ts:1`）。`engines` 要求 Bun ≥1.4.0。服务端直接用 Bun API：`Bun.sleep`（`server.ts:672`）、`Bun.YAML`（`docs-graph.ts:120`）、`Bun.which`（`runtime-capture-pty.ts:21`）。
- 子进程：Fleet collector 用 `spawn(process.execPath, [<ts 文件>])`（`server.ts:686-688`、:748）。setup collector 同样用 `process.execPath` 加 `setup-check-child.ts`（`src/effects/setup/collector.ts:22`、:41）。任务读取起 `Worker`（`task-read-process.ts:42`）。Dev Activity collector 从 PATH 调用 `git`、`gh`（`src/effects/dev-activity/collector.ts:311`、:335）。runtime capture 从 PATH 找 `python3`（`runtime-capture-pty.ts:21`）。
- cwd：setup collector 用 `process.cwd()`（`setup/collector.ts:103`）。setup check 用 cwd 跑 `runStatus` 和 `runDoctor`（`src/cli/commands/init-hook.ts:748-756`）。其他读取器按 Fleet registry id 找仓库（例如 `architecture.ts:23-26`）。
- 发布：npm 包的 `files` 含 `dist/operator-ui/`，`prepack` 会构建它（`package.json`）。`scripts/check-tarball-install-smoke.sh:153-198` 已经用 `operator serve --host 127.0.0.1 --port 0` 启动打包后的服务，读 URL，再查 `/healthz`。发布在本机手动完成，有发布记录（`deploy/release-checklists/261013-repo-harness-0.22.1.md`）。仓库里没有 codesign、notarization 或 Apple 证书相关的内容（grep 为 0）。
- 范围外：Phase 3 写入、Bot → CLI → herdr 指令通道、ledger、collector 逻辑。本 plan 不改这些。

**P2 一条真实路径（今天在终端里打开控制台）**
用户在终端运行 `repo-harness operator serve` → Bun 启动 CLI → `startOperatorServer` 在 `127.0.0.1:4318` 监听，并启动 Dev Activity 和 setup collector（`operator.ts:97`）→ stdout 打印 `http://127.0.0.1:4318` → 用户在浏览器打开 → 浏览器以该 origin 加载 `dist/operator-ui/index.html` → 页面用相对路径 `fetch('/api/v1/…')`，Origin 等于服务端期望值，通过检查 → 页面每 30 秒刷新 → 用户按 Ctrl-C → SIGINT 处理函数关闭 collector 和服务（`server.ts:1732-1758`）。

桌面版要替代的只是这条路径的两端：「在终端里启动和停止进程」与「在浏览器里打开 URL」。中间的服务、数据和 UI 不变。

压力点：
1. 从 Finder 启动的 app 没有用户的登录 shell 环境。PATH 通常只有系统目录（**inferred**），找不到 `bun`、`repo-harness`、`gh`、`herdr`。cwd 是 `/`。
2. 服务端的 Origin 检查和 `frame-ancestors 'none'` 决定了桌面壳只能让 WebView 在顶层直接打开 `http://127.0.0.1:<port>/`。不能用 iframe，也不能从 app 自己的 origin 调用 API。
3. 服务端必须在 Bun 上运行，并且需要磁盘上的 TS 源文件（子进程和 Worker 按文件路径启动）。

**P3 决定**
- 桌面版是一个**纯外壳**：它启动用户已安装的 `repo-harness operator serve`，打开一个 WebView 窗口指向服务 URL，退出时停止服务。app 里不带 repo-harness 代码、不带 Bun、不带 UI 副本。
- 理由：
  - 单一来源：UI 和服务始终来自同一个已安装的 CLI 版本，CLI 和 UI 一致（I7）自动成立。app 不会和写入 hook、ledger、registry 的 CLI 产生版本差。
  - 安全边界不变：服务端的 Host、Origin、CSP、只读路由全部保持原样。桌面壳不放宽任何检查。
  - 体积小：app 里只有外壳本身。
- 外壳技术推荐 **Tauri v2**（§2）。外壳不向页面暴露任何 IPC 命令。
- 10x 时先坏的地方：不是外壳，而是服务端已有的 collector 负载（仓库数 × PR 数，Kumo plan §0）。外壳只多一个常驻进程。多个窗口共用一个服务进程，不按仓库开进程。

---

## 1. 目标与非目标

**目标**
1. 在 macOS Apple Silicon 上，从 Dock、Launchpad 或 Spotlight 打开 repo-harness 控制台，不需要开终端。
2. 打开 app 时自动启动服务，退出 app 时服务也停止。app 崩溃或被强制退出时，服务也要退出，不留孤儿进程。
3. 页面内容和浏览器里完全一样（同一个 `dist/operator-ui`，同一组 GET API）。
4. 失败时给出明确的界面：没装 CLI、CLI 版本太旧、端口被占用、服务启动失败。不出现白屏。
5. 后续可以加 Dock 角标（「需要你 N」）和菜单栏项，计数来源仍是 Kumo plan §3.4 的唯一定义。

**非目标**
- 不做写入。Phase 3 写入上线之前，桌面版和浏览器版一样只读。
- 不在 app 里打包 Bun、repo-harness 或 UI 副本（理由见 §0 P3、§2.4）。
- 不放宽服务端的 Host、Origin、`Sec-Fetch-Site`、CSP、`X-Frame-Options` 检查。
- 不给页面开放 IPC，不加 Tauri shell 插件、fs 插件或任何能执行命令的插件。
- 不新增 HTTP 路由，不做代理，不做自定义协议。
- 不改 `package.json`、`bun.lock` 的依赖。桌面壳的依赖只在 `desktop/` 里。
- 第一版不做 Intel Mac、Windows、Linux。
- 不做 app 自己的设置页面、登录、遥测或崩溃上报。

---

## 2. 外壳选型

### 2.1 约束（来自 §0，已核对）
- 服务端必须在 Bun 上运行（Bun API 与 `process.execPath` 子进程）。任何外壳都需要一个 Bun 进程，Node 运行时替代不了它。
- WebView 必须在顶层打开 `http://127.0.0.1:<port>/`，否则 Origin 检查返回 403，iframe 被 `frame-ancestors 'none'` 拒绝。
- 页面里的外链用 `target="_blank"`（`Board.tsx:172`、`ui.tsx:80`），外壳要把它们交给系统浏览器。
- 「复制命令」是页面唯一的输出通道，只用 `navigator.clipboard.writeText`，失败时报错，没有备用方法（`clipboard.ts:1-13`）。WebView 必须允许这个 API。
- 主题、语言、仓库选择存在 `localStorage`（`theme.ts:16-26`、`i18n.ts:2185-2215`、`App.tsx:125-131`）。`localStorage` 按 origin 区分，所以端口必须稳定，否则每次启动都丢设置。

### 2.2 对比

| 项 | Tauri v2 | Electron | 原生 Swift + WKWebView | PWA / Safari「添加到程序坞」 |
|---|---|---|---|---|
| 渲染引擎 | 系统 WKWebView | 自带 Chromium | 系统 WKWebView | Safari（WebKit）或 Chrome |
| app 体积（arm64） | 约 3–10 MB（**inferred**，Phase 0 实测） | 约 90–120 MB（**inferred**），还要再起 Bun | 约 1–3 MB（**inferred**） | 0 |
| 服务进程 | Rust 侧 `std::process::Command` 起已安装 CLI | 主进程 Node 起 Bun；Node 本身跑不了服务 | `Process` 起已安装 CLI | 外壳不管；要用户自己启动或配 launchd |
| 签名与公证 | `tauri build` 支持 Developer ID 签名和 notarytool 公证（**inferred**，按官方文档） | electron-builder 支持 | 手写 `codesign` + `notarytool` 脚本 | 不需要 |
| 自动更新 | 官方 updater 插件，更新包要签名 | electron-updater | 要引入 Sparkle 或自己写 | 跟随服务端，无需更新 |
| 跨平台 | macOS / Windows（WebView2）/ Linux（WebKitGTK） | 三个平台 | 只有 macOS | 看浏览器 |
| 给页面的能力 | 远程 origin 默认没有 IPC（**inferred**，Phase 0 核对）；外链、新窗口要在 Rust 侧处理 | 要关 `nodeIntegration`、开 `contextIsolation` 和 sandbox | 只在 Swift 侧加什么才有什么 | 浏览器沙箱 |
| 新工具链 | Rust + Cargo（只在 `desktop/`） | 无（Node），但依赖闭包大 | Xcode / Swift（本机已有） | 无 |
| 渲染差异 | 和 Safari 同一引擎，UI 要在 WebKit 上验收 | 和 Chrome 一样 | 同 Tauri | 同所用浏览器 |
| 生命周期（启动/停止/孤儿） | 外壳负责 | 外壳负责 | 外壳负责 | 做不到 |

### 2.3 推荐：Tauri v2 纯外壳
- 排除 Electron：它带一整套 Chromium 和 Node，但服务端仍要 Bun。体积是 Tauri 的十倍以上，换来的只有和 Chrome 一致的渲染。这个好处可以用 Phase 0 的 WebKit 验收替代。
- 排除只做 PWA：它不能启动和停止服务，解决不了目标 2。它仍是 Phase 0 的零成本基线：如果 Safari「添加到程序坞」加上用户自己启动服务就够用，这个 work-package 可以在 Phase 0 结束。
- Tauri v2 和 Swift 外壳在 macOS 上用同一个 WebView，外壳代码量相近（约 200–400 行，**inferred**）。选 Tauri 的理由：
  1. 仓库的 CLI 已支持 Windows（`install.ps1`、`server.ts:690` 的 Windows 路径），以后做 Windows 时外壳代码可以复用。
  2. 打包 `.app`/`.dmg`、签名、公证、更新签名都是现成流程，不用自己写脚本。
- Swift 外壳是备选决定（不是兼容路径）：如果 Aimpact 和 Dot 确定桌面版永远只做 macOS，并且不想在仓库里引入 Rust 工具链，就改选 Swift。两者只选一个。见 §11 第 1 问。

### 2.4 服务进程：用已安装 CLI，不打包 sidecar

| 方案 | 结论 |
|---|---|
| A. 启动用户已安装的 `repo-harness`（推荐） | 用户本来就要装 CLI 才能接入仓库、装 hook。UI 和服务同版本。app 小 |
| B. 在 app 里带 Bun 二进制和 npm 包 | 拒绝。会在同一台机器上出现第二份 repo-harness，和写 hook、ledger、registry 的已安装 CLI 版本不同，读取器可能解不开对方写的数据。app 增加约 60 MB Bun（**inferred**）加依赖 |
| C. `bun build --compile` 成单文件，作为 Tauri `externalBin` | 拒绝（第一版）。服务端用 `process.execPath` 加 TS 文件路径起子进程，用文件 URL 起 Worker（§0 P1）。单文件可执行里 `process.execPath` 是它自己，Bun 文档的 `BUN_BE_BUN` 只能让它表现为 bun CLI，嵌入的 TS 文件仍要能按路径找到（**unverified**）。不是直接可用的方案，还有 B 的版本问题 |

CLI 的查找和版本：
- 首次启动时，外壳运行一次用户的登录 shell（`$SHELL -l -i -c '<打印 PATH 和 command -v repo-harness>'`，stdin 为 `/dev/null`，10 秒超时），记录 `repo-harness` 的绝对路径和 PATH。结果写进 app 配置文件，用户可以手动改。
- 每次启动前运行 `<repo-harness> --version`，低于外壳要求的最低版本（`MIN_CLI_VERSION` 常量）时停止，显示升级命令。不靠 serve 的报错去猜版本。
- 找不到 CLI 时停止，显示安装命令。外壳不自动安装任何东西。

---

## 3. 复用 `dist/operator-ui` 和 GET API

- app 不带 UI。WebView 直接加载服务端提供的 `http://127.0.0.1:<port>/`，内容就是该 CLI 版本 `dist/operator-ui` 里的文件（`server.ts:85-88`、:1659-1660）。
- 页面是同源页面：Origin、`Sec-Fetch-Site`、CSP 的 `connect-src 'self'` 都和在浏览器里一样通过。服务端代码不用改。
- 外壳不读 API，不解码任何响应，也不缓存数据。外壳只调用 `GET /healthz`，用来确认端口上是这次启动的服务，并检查 `service == "repo-harness-operator"`、`protocol == 1`。
- 拒绝的做法：把 `dist/operator-ui` 复制进 app 并从 app 自己的 origin 调 API。这样 Origin 是 `tauri://localhost`，会被 403 拒绝。要通过就得放宽服务端检查，或者加一个代理。两者都削弱安全边界，并让 UI 版本和服务版本分开。
- 前端唯一可能要动的地方（Phase 2，可选）：一个外壳可读的「需要你」计数。现在 `document.title` 已经是 `(N) repo-harness`（`App.tsx:401`，Kumo plan §4.2）。外壳读窗口标题即可，不需要新的数据通道。

---

## 4. 进程生命周期

### 4.1 启动
1. 单实例：第二次打开 app 只激活已有窗口，不起第二个服务（Tauri single-instance 插件，**inferred**）。
2. 读配置：CLI 路径、PATH、端口、服务 cwd。
3. 运行 `repo-harness --version`，检查最低版本。
4. 启动子进程：`<cli> operator serve --host 127.0.0.1 --port <port>`，加 §4.4 的 lifeline 参数。不经过 shell。argv 只来自配置和常量。stdin 是外壳持有的管道，stdout 和 stderr 由外壳读取。
5. 读 stdout 第一行，必须严格等于 `http://127.0.0.1:<port>`。
6. 调 `GET /healthz`，带超时（例如 10 秒）。
7. 窗口导航到该 URL。setup 首次采集约 20 秒（Kumo plan §8.1），页面已有「正在读取配置」的状态，外壳不用等它。

任何一步失败：停止子进程，用原生对话框显示失败码和一条可复制的命令（例如 `repo-harness operator serve --port <port>` 用于在终端复现），按钮只有「重试」「打开配置文件」「退出」。stderr 只取 JSON 里的 `error` 字段显示，原文写入本地日志（§5）。

### 4.2 停止
- 用户退出 app：向子进程发 SIGTERM。服务端的关闭流程会停止 collector 并回收它们的进程组（`operator.ts:100-110`、`server.ts:1732-1758`）。等最多 10 秒，仍未退出才发 SIGKILL。
- 关闭最后一个窗口：macOS 习惯是 app 继续运行。第一版关闭窗口即退出 app 并停止服务，避免看不见的常驻进程。菜单栏常驻是 §11 的问题。
- app 崩溃或被 `kill -9`：外壳的清理代码不会运行。这时靠 §4.4 的 lifeline。

### 4.3 端口
- 用固定端口，保证 origin 稳定，`localStorage` 里的主题、语言和仓库选择在重启后保留。
- 默认 **4319**，可以在配置文件里改。不用 4318，因为用户可能同时在终端运行默认端口的 `operator serve`。
- 端口被占用时（服务端 listen 失败，退出码 1）：显示「端口 4319 已被占用」和改端口的方法。不自动换端口，因为换端口会静默丢掉本地设置。
- 不连接已在运行的服务。外壳只管理自己启动的子进程。连接外部服务意味着第二种模式，并且外壳无法确认它的版本和生命周期。见 §11。

### 4.4 需要的 CLI 改动：stdin lifeline
- 新参数 `operator serve --exit-on-stdin-eof`：服务端读 stdin，读到 EOF 时走和 SIGTERM 相同的关闭流程。外壳进程死亡时，内核关闭管道，服务端随之退出。
- 这是 Phase 1 唯一的产品代码改动。它很小，可单测，对终端用户没有影响（不传参数时行为不变）。
- 不用「外壳定时 ping」或「服务端检查父 PID」：前者需要新路由，后者在 macOS 上要轮询，都比管道 EOF 复杂。

### 4.5 环境和 cwd
- 子进程的环境是 §2.4 记录的登录 shell 环境（PATH、HOME 等），外壳不加入任何 token。`gh` 登录状态在用户 HOME 下，不受影响（**inferred**）。
- cwd 影响 Setup 页面：setup check 对 cwd 跑仓库级检查（§0 P1）。从 Finder 启动时 cwd 是 `/`，不能直接用。第一版的默认值在 Phase 0 实测后决定：`$HOME`，或用户在配置里选一个「主仓库」。见 §11 第 6 问。

### 4.6 多仓库
- 一个服务进程覆盖 Fleet registry 里的所有可读仓库。页面已有仓库筛选（`plans/archive/plan-20260911-operator-repo-selector.md`，Kumo plan §4.2）。外壳不按仓库起进程。
- 第一版一个窗口。以后的多窗口（例如每个仓库一个窗口）共用同一个服务和同一个 origin，用现有 hash 路由定位，不需要新进程。

---

## 5. 安全边界

只读状态一直保持到 Phase 3 写入上线。桌面壳的义务按 I1–I9 列出：

| # | 不变量 | 桌面壳的义务 |
|---|---|---|
| I1 | Operator 只读 | 外壳不加路由、不代理、不改服务端。`tests/effects/operator-write-boundary.test.ts` 不改 |
| I2 | 唯一指令通道：Bot → CLI → herdr | 外壳只运行三类固定命令：登录 shell 探测、`repo-harness --version`、`repo-harness operator serve …`。不调用其他子命令，不调用 herdr |
| I3 | GET 白名单 | 不变。外壳不注册自定义协议，不开本地 HTTP 端口 |
| I4 | GET 不建库、不探测、不派发 | 不变。外壳的探测只在启动时运行，不在任何 HTTP 请求路径上 |
| I5 | 不泄露 secret 和私有路径 | 外壳不读页面数据。服务端 stderr 原文只写入 `~/Library/Logs/<app-id>/serve.log`（权限 0600，按大小轮转），界面只显示错误码。没有遥测，没有网络请求，只有 updater（Phase 3，可选）访问 GitHub Release |
| I6 | 每个数据只有一个权威来源 | UI 来自 CLI。Dock 角标只读 `document.title` 里的计数，不重新计算 |
| I7 | CLI 和 UI 输出一致 | 同一个服务进程，自动成立 |
| I8 | 写入失败必须可见 | 外壳的失败（找不到 CLI、版本旧、端口占用、健康检查超时、子进程意外退出）都显示对话框，不显示白屏或旧页面 |
| I9 | UI 不触发动作 | 页面没有任何 IPC。外壳不把页面消息转成命令。「复制命令」仍只写剪贴板 |

新增的外壳不变量：
- **D1 纯外壳**：app 包里没有 repo-harness 代码、Bun 或 UI 文件。
- **D2 零 IPC**：远程 origin 没有任何 Tauri capability。不启用 shell、fs、http、opener 的 JS 绑定。只有 Rust 侧代码调用系统能力。验收时检查页面里没有 `__TAURI__`、`__TAURI_INTERNALS__` 全局对象。
- **D3 导航白名单**：主窗口只能停在 `http://127.0.0.1:<port>/` 下。`https:` 链接（例如 GitHub PR）交给系统浏览器打开。其他 scheme（`file:`、`javascript:`、`data:`、自定义 scheme）和其他 origin 一律拒绝。这是一个纯函数，可单测。
- **D4 唯一生命周期所有者**：服务进程只由外壳启动和停止，lifeline 保证外壳死亡时服务退出。
- **D5 不放宽服务端**：任何 phase 都不为桌面版修改 Host、Origin、`Sec-Fetch-Site`、CSP、`X-Frame-Options`。

Phase 3 写入的影响（只记录，本 plan 不设计）：
- revamp plan §0 P3 记录服务端没有 token 和 CSRF 防护，本机任何进程都能调用它。写入设计必须同时覆盖浏览器和桌面，不能只在桌面里通过 IPC 做一条私有写入路径。否则会出现两个写入通道，违反 I2。
- 如果写入设计采用每次启动生成的 token，外壳可以通过 stdin 或环境变量把它交给子进程。具体做法由写入 plan 决定。

---

## 6. macOS Apple Silicon 优先
- 第一版只构建 `aarch64-apple-darwin`。最低系统版本按 Phase 0 结果定。Tailwind v4 要求 Safari 16.4 以上（**inferred**），实际按 WKWebView 实测决定。
- 本地自用构建（Phase 1–2）：只做 ad-hoc 签名，arm64 可执行文件必须有签名才能运行（**inferred**）。本机构建的 app 没有 quarantine 属性，不需要公证就能打开（**inferred**）。
- 对外分发（Phase 3）：Developer ID Application 签名，开 Hardened Runtime，用 `notarytool` 公证并 `stapler` 装订。证书和公证凭据放在发布主机（Mac mini）的钥匙串里。这是凭据边界，需要 Aimpact 批准。是否已有 Apple Developer 账号见 §11。
- Intel、Windows、Linux 在 Phase 4 之后再评估。Tauri 的外壳代码可以复用，Windows 要另外确认 WebView2 和服务端的 Windows 子进程路径。

---

## 7. 打包与发布

- **代码位置**：同一仓库的 `desktop/`（Tauri 项目和 `Cargo.lock`）。它不加入 npm `files`，也不是 Bun workspace，不改 `package.json` 和 `bun.lock`。理由：外壳依赖的启动合约（stdout 第一行 URL、`/healthz`、`--exit-on-stdin-eof`）在本仓库定义和测试，放在一起改动时可以一起验证。外壳不消费任何共享 TS 包，所以不需要 workspace。
- **版本**：外壳有自己的版本号，和 npm 包版本分开。Tag 用 `desktop-v<semver>`，不和 `v<npm 版本>` 混用。外壳只声明 `MIN_CLI_VERSION`。CLI 正常发版不需要重新构建 app。
- **npm**：npm 包不带 app 二进制，tarball 不变。CLI 只增加 `--exit-on-stdin-eof`，随正常版本发布。README 的 Local Human Control Board 一节加一句桌面版的下载位置（Phase 3）。
- **GitHub Release**：每个 `desktop-v*` 发布一个 Release，资产有：签名并公证的 `.dmg`、`SHA256SUMS`，启用更新时还有 Tauri updater 的 `latest.json` 和更新包签名。发布后把资产下载回来，比较 sha256，并在干净用户下安装验证（§10）。
- **发布记录**：沿用 `deploy/release-checklists/`，文件名用 `YYMMDD-repo-harness-desktop-<version>.md`。
- **自动更新**：第一版不做。外壳很少变，手动下载足够。以后启用 Tauri updater 时需要一把新的更新签名密钥，这是凭据边界，要单独批准。
- **不做**：`repo-harness desktop install` 这类由 CLI 下载并安装 app 的命令。它会在 CLI 里加入下载和运行二进制的路径，安全面大，第一版不需要。

---

## 8. 分期

| Phase | 内容 | 产出 | 退出条件 |
|---|---|---|---|
| 0 实测（不改仓库代码） | 在 Safari 和最小 Tauri 窗口里打开当前服务：亮/暗、1440 与 390 宽的渲染；剪贴板复制；`localStorage` 在重启后是否保留；`target=_blank` 的默认行为；远程 origin 是否有 IPC 全局对象；Safari「添加到程序坞」能否用于 `http://127.0.0.1`；setup check 在 cwd 为 `$HOME` 时的输出；最小 Tauri app 的体积；Finder 启动时的 PATH | 本 plan 的「Phase 0 结果」一节，所有 **inferred/unverified** 改为已核对或推翻 | Aimpact 决定：继续 Phase 1，或者 PWA 已够用、在此结束 |
| 1 CLI 启动合约 | `operator serve --exit-on-stdin-eof`；一条测试固定「stdout 第一行严格是 URL」；tarball smoke 增加 lifeline 检查 | 一个小 PR，只改 CLI 和测试 | 测试和 `smoke:tarball-install` 通过；发布一个包含它的 CLI 版本 |
| 2 外壳 MVP（本机自用） | `desktop/` Tauri 项目：CLI 查找、版本检查、子进程生命周期、固定端口、导航白名单、失败对话框、日志、单实例 | ad-hoc 签名的本地 `.app` | §10 的 E2E 清单在 Mac mini 上从 Finder 启动全部通过 |
| 2b 原生集成（按 Dot 的答复） | Dock 角标（读窗口标题的计数）；菜单项：重新加载、重启服务、在浏览器中打开、复制 URL；窗口位置记忆 | 同一目录内的增量 PR | 角标数字与页面「需要你 N」一致 |
| 3 对外分发 | Developer ID 签名、公证、`desktop-v*` GitHub Release、发布记录 | 公证后的 `.dmg` | 下载回读、`spctl` 检查、干净用户安装通过 |
| 4 以后 | Intel / Windows / Linux；自动更新；与 Phase 3 写入设计对齐 | 各自单独批准 | — |

每个 phase 一个 PR，单独回滚。Phase 1 可以在 Phase 0 之后立即开始，它对终端用户也有用（脚本化启动时防止孤儿进程）。

架构模型：Phase 2 在 `.archcontext/model` 里给桌面壳加一个节点，依赖 `component.operator.primary`，走正常的 architecture-projection 流程。

---

## 9. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| Finder 启动没有用户 PATH | 找不到 `bun`、`repo-harness`、`gh`、`herdr`；服务起不来，或 Dev Activity 显示 GitHub 不可用 | 首次启动用登录 shell 探测并写入配置；用户可手改；失败时显示缺少的工具名 |
| 登录 shell 探测卡住或输出杂讯（交互式 rc 文件） | 启动卡住或解析错误 | 10 秒超时，stdin 为 `/dev/null`，只解析标记之间的输出；失败时停在对话框，提示手动填写配置 |
| WebKit 和 Chrome 渲染不同 | Kumo 组件或 Tailwind v4 样式在 WKWebView 里错位 | Phase 0 用 Safari 验收；以后 UI PR 的截图同时覆盖 WebKit |
| WKWebView 拒绝 `navigator.clipboard` | 「复制命令」失效，页面唯一的输出通道断了 | Phase 0 实测；不通过时在外壳 Rust 侧找原生方案前先回到本 plan 重新决定，不在前端加备用复制方法 |
| `localStorage` 不持久或端口变化 | 每次启动丢主题、语言、仓库选择 | 固定端口 4319；Phase 0 核对 WebView 数据目录持久 |
| 外壳崩溃留下孤儿服务 | 端口被占用，下次启动失败 | `--exit-on-stdin-eof`；E2E 用 `kill -9` 验证 |
| 端口冲突 | 启动失败 | 明确报错和改端口方法，不自动换端口 |
| setup check 依赖 cwd | Setup 页面显示和终端里不同的结果 | Phase 0 实测；cwd 作为显式配置（§4.5、§11） |
| 外壳要求的最低 CLI 版本过高或过低 | 用户卡在升级对话框，或旧 CLI 缺少 lifeline | `MIN_CLI_VERSION` 只跟随启动合约变化；合约变化时同步更新并写进发布记录 |
| 远程页面意外获得 IPC | 页面里的 XSS 可以调用本机能力 | D2 零 capability；E2E 检查全局对象；不启用任何 JS 插件绑定 |
| 外链在 WebView 内打开 | 用户离开控制台，GitHub 页面运行在外壳里 | D3 导航白名单，`https:` 交给系统浏览器 |
| 仓库引入 Rust 工具链 | CI 和维护成本增加 | 只在 `desktop/`；第一版只在本机构建；是否加 macOS CI job 在 Phase 3 决定 |
| Apple 签名与公证凭据 | 凭据泄露或过期导致无法发布 | 凭据只放发布主机钥匙串；每次使用需要 Aimpact 批准；过期时停在 Phase 2 自用 |
| Phase 3 写入出现第二条写入通道 | 违反 I2 | §5 规定写入设计同时覆盖浏览器和桌面，桌面不做私有写入 IPC |
| 桌面版成为常驻进程后 collector 一直运行 | 持续 `gh` 和 `git` 调用 | 第一版关闭窗口即退出；常驻由 Dot 决定 |

---

## 10. 测试计划

**CLI（Phase 1，`bun run test:files … --timeout 60000 --max-concurrency 1`）**
- 扩展 `tests/cli/operator-serve.test.ts`：
  - 带 `--exit-on-stdin-eof` 启动，关闭 stdin，服务在限定时间内退出，collector 的进程组被回收（沿用该文件已有的进程回收断言方式）。
  - 不带参数时，关闭 stdin 不影响服务。
  - stdout 第一行严格等于 `http://127.0.0.1:<实际端口>`。
- `tests/effects/operator-write-boundary.test.ts` 不改，继续通过。
- `bun run check:type`，`bun run smoke:tarball-install`（增加 lifeline 检查）。

**外壳单元测试（Phase 2，`cargo test`，在 `desktop/`）**
- 导航白名单纯函数：允许的 origin、`https:` 外链、拒绝 `file:`、`data:`、`javascript:`、其他端口、`localhost` 与 `[::1]` 写法。
- 登录 shell 输出解析：正常、带杂讯、超时、缺少 `repo-harness`。
- stdout 第一行校验：严格匹配，拒绝多余字符。
- 版本比较与 `MIN_CLI_VERSION`。
- 配置文件解码：拒绝未知字段和非法端口。

**E2E 验收（Phase 2，macOS Apple Silicon，从 Finder 启动，不从终端启动）**
1. 冷启动：窗口显示控制台，看板有真实数据；记录启动到首屏的时间。
2. 退出 app：`pgrep -f 'operator serve'` 为空，collector 子进程也不在。
3. `kill -9` 外壳：服务在限定时间内退出。
4. 端口 4319 被占用：显示端口冲突对话框，没有白屏。
5. 配置里的 CLI 路径不存在：显示安装命令。CLI 版本低于最低版本：显示升级命令。
6. 点 PR 链接：在系统浏览器打开，主窗口不动。
7. 复制命令：剪贴板内容正确。
8. 修改主题和语言后重启：设置保留。
9. 亮/暗截图，窗口宽 1440 与最小宽度各一张。
10. 页面中 `typeof window.__TAURI__ === 'undefined'` 且 `typeof window.__TAURI_INTERNALS__ === 'undefined'`（开发构建的 devtools 中检查）。
11. 第二次打开 app：只激活已有窗口，进程表里只有一个服务。

**发布验收（Phase 3）**
- `codesign --verify --deep --strict`、`spctl -a -vv`、`xcrun stapler validate`。
- 从 GitHub Release 下载资产，与 `SHA256SUMS` 比较。
- 在新建的 macOS 用户下安装并重复 E2E 1–3。

---

## 11. Open Questions for Dot

1. 外壳技术：确认用 Tauri v2，还是桌面版只做 macOS 并改用 Swift + WKWebView？前者要在仓库里加 Rust 工具链，后者以后做 Windows 要重写外壳。
2. 如果 Phase 0 证明 Safari「添加到程序坞」加上手动启动服务已经够用，是否接受在 Phase 0 结束、不做原生 app？
3. 关闭窗口时的行为：退出 app 并停止服务（第一版默认），还是保留在菜单栏，服务继续运行？
4. 是否需要菜单栏图标？需要的话，菜单栏里显示什么（「需要你 N」计数、服务状态、最近的阻塞项）？
5. Dock 角标是否显示「需要你 N」？计数沿用 Kumo plan §3.4 的唯一定义，是否有项目应排除？
6. Setup 页面以哪个目录为准：`$HOME`，还是用户选择的一个「主仓库」？这会改变 Setup 页面显示的检查结果。
7. 当终端里已经有一个 `operator serve` 在运行时，桌面版是另起一个服务（第一版默认，端口 4319），还是连接已有的服务？
8. 是否需要系统通知（例如新增「需要你」项、CI 失败）？需要的话，哪些事件值得打扰用户？
9. 是否需要开机自动启动？
10. 窗口外观：使用原生标题栏，还是把控制台顶栏和标题栏合并（隐藏标题栏，保留红绿灯按钮）？
11. app 名称、Bundle ID 和图标：沿用「repo-harness」和现有 `favicon.svg`，还是另做设计？
12. 首屏与失败界面：服务启动时是否需要单独的加载画面？失败对话框的文案和「复制命令」放在哪里？
13. 是否已有 Apple Developer Program 账号和 Developer ID 证书？没有的话，是否接受桌面版只在 Phase 2 本机自用？
14. 分发渠道：只用 GitHub Release，还是还要 Homebrew cask？第一版是否需要自动更新？
15. Intel Mac、Windows、Linux 的时间表：是否有具体用户在等？
16. Phase 3 写入上线后，桌面版是否要有和浏览器不同的写入确认体验？（写入通道本身必须和浏览器相同，见 §5。）
