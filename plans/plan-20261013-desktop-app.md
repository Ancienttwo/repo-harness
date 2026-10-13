# Plan: repo-harness 桌面版（Operator 控制台的桌面壳）

> **Status**: Draft，第三轮。只是设计，不是实施 GO。Aimpact 2026-10-13 确认本 work-package 只做到 DP0：DP0 完成后停止，DP1 及以后要另给 GO（§11 第 2 项）。§11 第 11 项的 Bundle ID 仍是 PENDING CONFIRM。
> **Created**: 20261013
> **Revised**: 20261013（第二轮：按 Dot 在 Slack #bot-worker 的评审锁定 §11 默认值，补上必改项 A–E；第三轮：按 Aimpact 2026-10-13 的确认锁定 §11 第 2、13 项。见 §12）
> **Slug**: desktop-app
> **Artifact Level**: work-package
> **Baseline**: `main@0ef9ed11`（0.22.1 已发布）
> **Relates to**: `plans/plan-20261010-0320-operator-console-kumo.md`（下称 Kumo plan）、`plans/plan-20261005-0405-operator-ui-revamp.md`（下称 revamp plan）
> **Lifts**: Kumo plan §1 的非目标「不做 Tauri/桌面打包」，revamp plan §1 的非目标「不做桌面壳或菜单栏应用」。只对本 work-package 解除，要 Aimpact 批准。两份 plan 的其他非目标和不变量 I1–I9、N1–N5 继续有效。
> **Verification Boundary**: 每个阶段一个 PR。CLI 改动跑 `bun run check:type`、受影响测试、`bun run smoke:tarball-install`。桌面壳跑 `cargo test`，并在 macOS Apple Silicon 上从 Finder 启动做真实验收（§10）。
> **Rollback Surface**: 每个阶段单独 `git revert <squash-commit>`。桌面壳在独立目录 `desktop/`，不进 npm 包。删除 app 不影响 CLI 和数据。

**名称约定**
- 桌面版的阶段叫 **DP0–DP4**（Desktop Phase）。不用 D0–D3，因为 revamp plan 的数据线已经用了 Phase D0、D1。
- Kumo plan §7 的「第三期：写入」在本 plan 里叫 **Operator 写入期**。桌面版没有自己的写入阶段。
- 桌面壳的不变量叫 **S1–S8**（§5）。测试编号见 §10。

**事实标记**：带 `file:line` 的内容已在 `0ef9ed11` 上核对。**inferred** 表示从代码或文档推断，没有运行。**unverified** 表示要在 DP0 实测。

---

## 0. P1 / P2 / P3

**P1 地图（真实边界）**
- 启动入口：`repo-harness operator serve`（`src/cli/commands/operator.ts:96-120`、:123-140）。只接受 `127.0.0.1` 或 `::1`（:64）。`--port 0` 让系统选端口。`startOperatorServer` 在 listen 成功之后才返回，然后第一行 stdout 打印 URL（:97-98，`server.ts:1720-1722`）。收到 SIGINT/SIGTERM 时关闭，关闭只执行一次（`operator.ts:100-110`）。参数错误退出码 2，其他错误退出码 1，stderr 是一行 JSON（:84-90）。
- 服务端：`src/effects/operator/server.ts`。默认端口 4318（:49）。协议号 1，服务名 `repo-harness-operator`（:46-47）。`/healthz` 返回 `{ok, service, protocol}`（:1502-1510），没有实例身份。路由表 `OPERATOR_ROUTES` 全部是 GET 且 `write:false`（:102-119）。服务端没有任何重定向响应（grep `30[1278]` 为 0）。
- 安全头：每个响应带 `X-Frame-Options: DENY`（:232、:255）。静态文档的 CSP 含 `default-src 'self'; connect-src 'self'; frame-ancestors 'none'`（:244）。Host 不对返回 421（:1453）。Origin 存在且不是 `http://127.0.0.1:<port>` 时返回 403（:1456-1459）。`/api/*` 带 `Sec-Fetch-Site` 且不是 `same-origin`/`none` 时返回 403（:1481-1483）。
- 前端：`src/operator-web/`，构建到 `dist/operator-ui`（`vite.operator.config.ts`）。服务端从包内 `dist/operator-ui` 提供静态文件（`server.ts:85-88`）。所有 API 请求都是相对路径（例如 `dev-activity.ts:21`、`setup.ts:24`、`fleet-api.ts:76`）。外链只有 PR 链接（`Board.tsx:72`、:172，`ItemDrawer.tsx:99`、:169，`ui.tsx:78-80`），解码器只接受 `https://github.com/<owner>/<repo>/…`（`src/core/dev-activity/decode.ts:75`）。
- 标题计数：`document.title` 在「需要你」数量大于 0 时是 `(N) repo-harness`，数量为 0 或未知时是 `repo-harness`（`App.tsx:112-114`、:398-402）。
- 运行时：`bin.repo-harness` 是 `src/cli/index.ts`，shebang 是 `#!/usr/bin/env bun`。`engines` 要求 Bun ≥1.4.0。服务端直接用 Bun API：`Bun.sleep`（`server.ts:672`）、`Bun.YAML`（`docs-graph.ts:120`）、`Bun.which`（`runtime-capture-pty.ts:21`）。
- 子进程：Fleet collector 用 `spawn(process.execPath, [<ts 文件>])`，独立进程组（`server.ts:686-688`、:744-752）。setup collector 同样用 `process.execPath`，stdin 为 `ignore`，独立进程组（`src/effects/setup/collector.ts:22`、:41）。任务读取起 `Worker`（`task-read-process.ts:42`）。Dev Activity collector 从 PATH 调用 `git`、`gh`（`src/effects/dev-activity/collector.ts:311`、:335）。runtime capture 从 PATH 找 `python3`（`runtime-capture-pty.ts:21`）。
- 环境：registry 根目录是 `REPO_HARNESS_HOME`，没有时是 `~/.repo-harness`（`src/effects/repo-registry.ts:98`）。漏传这个变量会让服务读另一个 registry。
- cwd：setup collector 用 `process.cwd()`（`setup/collector.ts:103`）。setup check 用 cwd 跑 `runStatus` 和 `runDoctor`（`src/cli/commands/init-hook.ts:748-756`）。其他读取器按 Fleet registry id 找仓库（例如 `architecture.ts:23-26`）。
- 发布：npm 包的 `files` 含 `dist/operator-ui/`，`prepack` 会构建它（`package.json`）。`scripts/check-tarball-install-smoke.sh:153-198` 已经用 `operator serve --host 127.0.0.1 --port 0` 启动打包后的服务，读 URL，再查 `/healthz`。发布在本机手动完成，有发布记录（`deploy/release-checklists/261013-repo-harness-0.22.1.md`）。仓库里没有 codesign、notarization 或 Apple 证书相关的内容（grep 为 0）。
- 范围外：Operator 写入期、Bot → CLI → herdr 指令通道、ledger、collector 逻辑。本 plan 不改这些。

**P2 一条真实路径（今天在终端里打开控制台）**
用户在终端运行 `repo-harness operator serve` → Bun 启动 CLI → `startOperatorServer` 在 `127.0.0.1:4318` 监听，并启动 Dev Activity 和 setup collector（`operator.ts:97`）→ stdout 打印 `http://127.0.0.1:4318` → 用户在浏览器打开 → 浏览器以该 origin 加载 `dist/operator-ui/index.html` → 页面用相对路径 `fetch('/api/v1/…')`，Origin 等于服务端期望值，通过检查 → 页面每 30 秒刷新 → 用户按 Ctrl-C → SIGINT 处理函数关闭 collector 和服务（`server.ts:1732-1758`）。

桌面版只替代这条路径的两端：「在终端里启动和停止进程」与「在浏览器里打开 URL」。中间的服务、数据和 UI 不变。

压力点：
1. 从 Finder 启动的 app 没有用户的登录 shell 环境。PATH 通常只有系统目录（**inferred**），找不到 `bun`、`repo-harness`、`gh`、`herdr`。cwd 是 `/`。
2. 服务端的 Origin 检查和 `frame-ancestors 'none'` 决定了桌面壳只能让 WebView 在顶层直接打开 `http://127.0.0.1:<port>/`。不能用 iframe，也不能从 app 自己的 origin 调 API。
3. 服务端必须在 Bun 上运行，并且需要磁盘上的 TS 源文件（子进程和 Worker 按文件路径启动）。
4. `/healthz` 只说明端口上是这个协议的服务，不说明它是谁启动的。归属只能来自外壳自己持有的子进程。

**P3 决定**
- 桌面版是一个**纯外壳**：它启动用户已安装的 `repo-harness operator serve`，打开一个 WebView 窗口指向该子进程报告的 URL，退出时只停止自己启动的服务。app 里不带 repo-harness 代码、不带 Bun、不带 UI 副本。
- 理由：
  - 单一来源：UI 和服务始终来自同一个已安装的 CLI 版本，CLI 和 UI 一致（I7）自动成立。app 不会和写入 hook、ledger、registry 的 CLI 产生版本差。
  - 安全边界不变：服务端的 Host、Origin、CSP、只读路由全部保持原样。桌面壳不放宽任何检查。
  - 体积小：app 里只有外壳本身。
- 外壳技术用 **Tauri v2**（§2，§11 第 1 项 LOCKED）。DP0 先证明权限边界和进程生命周期，再写外壳。
- 10x 时先坏的地方：服务端已有的 collector 负载（仓库数 × PR 数，Kumo plan §0）。外壳只多一个常驻进程。一个服务进程覆盖所有仓库，不按仓库开进程。

---

## 1. 目标与非目标

**目标**
1. 在 macOS Apple Silicon 上，从 Dock、Launchpad 或 Spotlight 打开 repo-harness 控制台，不需要开终端。
2. 打开 app 时自动启动自己的服务，关闭最后一个窗口时退出 app 并停止这个服务。app 崩溃或被强制退出时，这个服务也要退出，不留孤儿进程。
3. 页面内容和浏览器里完全一样（同一个 `dist/operator-ui`，同一组 GET API）。
4. 失败时显示外壳自己的失败页：没装 CLI、CLI 版本太旧、没选主仓库、端口被占用、服务启动失败。不出现白屏。
5. DP2b 加 Dock 角标「需要你 N」，计数严格沿用 Kumo plan §3.4。

**非目标**
- 不做写入。Operator 写入期之前，桌面版和浏览器版一样只读。
- 不在 app 里打包 Bun、repo-harness 或 UI 副本（§0 P3、§2.4）。
- 不放宽服务端的 Host、Origin、`Sec-Fetch-Site`、CSP、`X-Frame-Options` 检查。
- 控制台页面没有任何 IPC。不加 Tauri shell、fs、http、opener、dialog、clipboard、notification 的 JS 权限。
- 不新增 HTTP 路由，不做代理，不做自定义协议。
- 不改 `package.json`、`bun.lock` 的依赖。桌面壳的依赖只在 `desktop/` 里。
- MVP 不做菜单栏图标、系统通知、开机自动启动、自动更新、Homebrew cask（§11）。
- 只做 arm64 macOS。不给 Intel、Windows、Linux 排时间表。
- 不连接、接管或停止任何不是本 app 启动的 `operator serve`。

---

## 2. 外壳选型

### 2.1 约束（来自 §0，已核对）
- 服务端必须在 Bun 上运行（Bun API 与 `process.execPath` 子进程）。任何外壳都需要一个 Bun 进程，Node 运行时替代不了它。
- WebView 必须在顶层打开 `http://127.0.0.1:<port>/`，否则 Origin 检查返回 403，iframe 被 `frame-ancestors 'none'` 拒绝。
- 页面外链用 `target="_blank"`，外壳要拦截新窗口并把合规的链接交给系统浏览器（§4.7）。
- 「复制命令」是页面唯一的输出通道，只用 `navigator.clipboard.writeText`，失败时报错，没有备用方法（`clipboard.ts:1-13`）。WebView 必须允许这个 API。
- 主题、语言、看板仓库筛选存在 `localStorage`（`theme.ts:16-26`、`i18n.ts:2185-2215`、`App.tsx:124-131`）。`localStorage` 按 origin 区分，所以端口必须固定。

### 2.2 对比

| 项 | Tauri v2 | Electron | 原生 Swift + WKWebView | PWA / Safari「添加到程序坞」 |
|---|---|---|---|---|
| 渲染引擎 | 系统 WKWebView | 自带 Chromium | 系统 WKWebView | Safari（WebKit）或 Chrome |
| app 体积（arm64） | 约 3–10 MB（**inferred**，DP0 实测） | 约 90–120 MB（**inferred**），还要再起 Bun | 约 1–3 MB（**inferred**） | 0 |
| 服务进程 | Rust 侧 `std::process::Command` 起已安装 CLI | 主进程 Node 起 Bun；Node 本身跑不了服务 | `Process` 起已安装 CLI | 外壳不管；要用户自己启动 |
| 签名与公证 | `tauri build` 支持 Developer ID 签名和 notarytool 公证（**inferred**，按官方文档） | electron-builder 支持 | 手写 `codesign` + `notarytool` 脚本 | 不需要 |
| 自动更新 | 官方 updater 插件，更新包要签名 | electron-updater | 要引入 Sparkle 或自己写 | 跟随服务端，无需更新 |
| 跨平台 | macOS / Windows（WebView2）/ Linux（WebKitGTK） | 三个平台 | 只有 macOS | 看浏览器 |
| 给页面的能力 | 按 capability 授权；应用命令要在 `build.rs` 的 app manifest 里声明后才受 capability 控制（**inferred**，按 https://v2.tauri.app/security/capabilities/ ）；必须审计并实测（§5、T-BRG） | 要关 `nodeIntegration`、开 `contextIsolation` 和 sandbox | 只在 Swift 侧加什么才有什么 | 浏览器沙箱 |
| 新工具链 | Rust + Cargo（只在 `desktop/`） | 无（Node），但依赖闭包大 | Xcode / Swift（本机已有） | 无 |
| 渲染差异 | 和 Safari 同一引擎，UI 要在 WebKit 上验收 | 和 Chrome 一样 | 同 Tauri | 同所用浏览器 |
| 生命周期（启动/停止/孤儿） | 外壳负责 | 外壳负责 | 外壳负责 | 做不到 |

### 2.3 决定：Tauri v2 纯外壳（LOCKED）
- 排除 Electron：它带一整套 Chromium 和 Node，但服务端仍要 Bun。体积是 Tauri 的十倍以上，换来的只有和 Chrome 一致的渲染。这个好处由 DP0 的 WebKit 验收替代。
- 排除把 PWA 作为最终形态：它不能启动和停止服务，做不到「不用终端」这个目标。
- Aimpact 2026-10-13 确认手动启动服务目前已经够用（§11 第 2 项 LOCKED）。所以本 work-package 做到 DP0 就停。DP0 期间的日常用法：手动运行 `repo-harness operator serve`，再用 Safari「添加到程序坞」打开 `http://127.0.0.1:4318`。如果 DP0 实测 Safari 不支持对 loopback http 地址添加到程序坞，就继续用普通浏览器标签页（现状）。Tauri 外壳的设计保留在本 plan 里，等以后另给 GO。
- Tauri v2 和 Swift 外壳在 macOS 上用同一个 WebView，外壳代码量相近（**inferred**）。选 Tauri 的理由：
  1. 仓库的 CLI 已支持 Windows（`install.ps1`、`server.ts:690`），以后如果要做 Windows，外壳代码可以复用。本 plan 不为此排时间。
  2. 打包 `.app`/`.dmg`、签名、公证是现成流程，不用自己写脚本。
- 只有在决定桌面版长期只做 macOS 时，才改选 Swift。两者只选一个。
- DP0 必须先证明两件事，DP2 才开始：控制台页面调不到任何本机命令（T-BRG），外壳能可靠停止且只停止自己的服务（T-LIFE）。任一项不能证明，回到本节重新决定。

### 2.4 服务进程：用已安装 CLI，不打包 sidecar

| 方案 | 结论 |
|---|---|
| A. 启动用户已安装的 `repo-harness`（采用） | 用户本来就要装 CLI 才能接入仓库、装 hook。UI 和服务同版本。app 小 |
| B. 在 app 里带 Bun 二进制和 npm 包 | 拒绝。会在同一台机器上出现第二份 repo-harness，和写 hook、ledger、registry 的已安装 CLI 版本不同，读取器可能解不开对方写的数据。app 增加约 60 MB Bun（**inferred**）加依赖 |
| C. `bun build --compile` 成单文件，作为 Tauri `externalBin` | 拒绝。服务端用 `process.execPath` 加 TS 文件路径起子进程，用文件 URL 起 Worker（§0 P1）。单文件可执行里 `process.execPath` 是它自己，Bun 文档的 `BUN_BE_BUN` 只能让它表现为 bun CLI，嵌入的 TS 文件仍要能按路径找到（**unverified**）。另有 B 的版本问题 |

CLI 的查找、环境和配置统一在 §4.5 定义。版本检查：每次启动前运行 `<cli_path> --version`，低于外壳常量 `MIN_CLI_VERSION` 时停止，失败页给出升级命令。不靠 serve 的报错去猜版本。

---

## 3. 复用 `dist/operator-ui` 和 GET API

- app 不带 UI。控制台窗口直接加载自己子进程报告的 `http://127.0.0.1:<port>/`，内容就是该 CLI 版本 `dist/operator-ui` 里的文件（`server.ts:85-88`、:1659-1660）。
- 页面是同源页面：Origin、`Sec-Fetch-Site`、CSP 的 `connect-src 'self'` 都和在浏览器里一样通过。服务端代码不用改。
- 外壳不发 HTTP 请求，不读 API，不解码任何响应，不缓存数据。外壳和服务之间只有三样东西：子进程句柄、stdin 管道、stdout 第一行 URL（§4.1）。
- 拒绝的做法：把 `dist/operator-ui` 复制进 app，并从 app 自己的 origin 调 API。这样 Origin 是 `tauri://localhost`，会被 403 拒绝。要通过就得放宽服务端检查，或者加代理。两者都削弱安全边界，并让 UI 版本和服务版本分开。
- Dock 角标读窗口标题里的计数（§4.8）。不需要新的数据通道。

---

## 4. 进程生命周期

### 4.1 启动与归属（必改项 A）
归属规则：**外壳只信任自己持有的 `Child` 句柄、这个子进程 stdout 第一行报告的 URL，以及这个子进程仍然存活。** `/healthz` 只能说明协议，不能说明归属，外壳不用它判断归属。

启动顺序：
1. 单实例：第二次打开 app 只激活已有窗口，不起第二个服务（Tauri single-instance 插件，只用 Rust 回调，**inferred**）。
2. 显示状态窗口的启动画面（§4.6）。
3. 读配置（§4.5）。缺少主仓库或 CLI 路径时停在失败页。
4. 运行 `<cli_path> --version`，检查 `MIN_CLI_VERSION`。
5. 启动子进程：`<cli_path> operator serve --host 127.0.0.1 --port <port> --exit-on-stdin-eof`。不经过 shell。argv 只来自配置和常量。cwd 是主仓库。环境按 §4.5 的白名单。子进程是新进程组的组长。stdin 是外壳持有的管道。stdout 和 stderr 由外壳持续读取（§4.3）。
6. 等 stdout 第一行。它必须在启动总期限（30 秒）内到达，长度不超过 256 字节，并严格等于 `http://127.0.0.1:<port>`。CLI 在 listen 成功之后才打印这一行（`operator.ts:97-98`），所以这一行加上子进程存活，证明这个端口由自己的子进程持有。
7. 打开控制台窗口，导航到该 URL，关闭启动画面。setup 首次采集约 20 秒（Kumo plan §8.1），页面已有「正在读取配置」的状态，外壳不用等它。

失败规则：
- 端口绑定失败（子进程以退出码 1 结束，没有 URL 行）：显示「端口 4319 已被占用」。外壳**不**探测这个端口，**不**连接端口上已有的服务，即使它的 `/healthz` 正常；**不**停止占用者；**不**换端口。
- 任何一步失败：先停止并回收子进程（§4.2），再显示失败页。
- 子进程在运行中退出：立即把控制台窗口切到失败页，清除 Dock 角标。这样页面的下一次 30 秒刷新不会打到之后占用这个端口的其他进程。
- 以后如果要给外壳加任何对服务的 HTTP 请求，规则是：不跟随重定向，响应上限 64 KiB，超时 2 秒，严格解码。这条规则写进 S2，DP2 本身不加这类请求。

威胁模型边界：同一用户下的恶意本机进程抢先占用端口或在子进程退出后抢占端口，不在本 plan 范围内。同一用户的进程本来就能读取用户文件。要防它，需要单独设计服务端认证（例如每次启动生成的密钥），这和 Operator 写入期的认证设计放在一起做，作为后续项记录。

### 4.2 停止（必改项 C）
- 关闭最后一个窗口：退出 app（§11 第 3 项 LOCKED）。
- 外壳只停止自己的子进程：先向子进程 PID 发 SIGTERM，服务端的关闭流程停止 collector 并回收它们的进程组（`operator.ts:100-110`、`server.ts:1732-1758`）。等最多 10 秒。仍未退出时，向子进程的进程组发 SIGKILL，再 `wait()` 回收。外壳从不按名字查找或停止进程（不用 `pkill`、`killall`）。
- 重试前：先按上面的步骤停止并 `wait()` 旧子进程，确认它已回收，再启动新子进程。任何时刻最多一个自己的子进程。
- 外壳崩溃或被 `kill -9`：外壳的清理代码不会运行，靠 §4.4 的 lifeline。

### 4.3 输出读取
- stdout：读出第一行后继续读，丢弃后续内容，不让管道写满。
- stderr：持续读出，写入 `~/Library/Logs/io.github.ancienttwo.repo-harness/serve.log`（权限 0600，单文件 1 MiB，保留 2 份）。失败页只显示 stderr JSON 里的 `error` 字段。
- 读取在独立线程或异步任务里，不阻塞窗口事件循环。

### 4.4 需要的 CLI 改动：stdin lifeline（DP1）
新参数 `operator serve --exit-on-stdin-eof`。不传时行为不变。传入时：
- 服务端从启动开始就读 stdin，读到 EOF 时走和 SIGTERM 相同的关闭流程。外壳进程死亡时，内核关闭管道写端，服务端收到 EOF。
- 启动期间收到 EOF：放弃启动，关闭已启动的 collector，不打印 URL，退出。
- EOF 和 SIGTERM/SIGINT 同时到达：只关闭一次（沿用 `operator.ts` 现有的 `shuttingDown` 标记）。
- 关闭有总期限（10 秒）。超时时向所有自己启动的子进程组发 SIGKILL，然后以非 0 退出。退出后，服务启动的进程组里不能留下进程。
- 管道写端只能由外壳持有：外壳创建的管道必须带 close-on-exec，外壳之后启动的其他进程（登录 shell 探测、`--version`、打开配置文件、打开外链）不能继承它。Rust 标准库默认这样做（**inferred**，T-LIFE-4 验证）。服务端的子进程用自己的 stdin（`ignore` 或新管道，§0 P1），不影响 EOF。
- 不用「外壳定时 ping」或「服务端检查父 PID」：前者需要新路由，后者在 macOS 上要轮询，都比管道 EOF 复杂。

### 4.5 环境、CLI 查找和配置（必改项 E）
**探测（只在首次启动，或用户在失败页选择重试探测时运行）**
- 运行用户数据库里登记的登录 shell（不用 app 进程的 `$SHELL`）：`<shell> -l -i -c '<只打印三个值>'`。三个值是 `$PATH`、`command -v repo-harness`、`${REPO_HARNESS_HOME-}`，放在固定标记之间。
- stdin 为 `/dev/null`，超时 10 秒，输出上限 64 KiB，只解析标记之间的内容。探测会执行用户的 rc 文件，所以超时、杂讯和失败都按失败处理。
- 探测从不读取或保存完整环境。token 类变量不会进入外壳内存以外的任何地方，也不会写盘。
- 探测失败：失败页说明原因，并提供「打开配置文件」。用户手动填写 `cli_path`（绝对路径）和 `path`。这是用户提供的值，外壳只校验，不猜。

**配置文件（唯一的持久化位置）**
- 位置：`~/Library/Application Support/io.github.ancienttwo.repo-harness/config.json`，权限 0600。
- 只有五个字段：`cli_path`（绝对路径）、`path`（PATH 字符串）、`repo_harness_home`（绝对路径或 null）、`main_repo`（绝对路径）、`port`（默认 4319）。解码器拒绝未知字段和非法值。
- `cli_path` 必须是存在的可执行文件。`main_repo` 必须是真实目录，不是符号链接。

**子进程环境（精确白名单）**
- `PATH`、`REPO_HARNESS_HOME`（有值时）取自配置。
- `HOME`、`USER`、`LOGNAME`、`SHELL`、`TMPDIR`、`LANG` 取自 app 自己的进程环境（launchd 提供）或用户数据库。
- 其他变量一律不传，包括 `GH_TOKEN`、`GITHUB_TOKEN` 等。只在 rc 文件里设置 `GH_TOKEN` 的用户，Dev Activity 的 GitHub 源会显示 `unavailable` 和原因码。修复方法是 `gh auth login`（凭据存在钥匙串）。这是已知限制（§9）。

**cwd：主仓库（§11 第 6 项 LOCKED）**
- Setup 页面用用户明确选择的主仓库，不用 `$HOME`。没有主仓库时不启动服务，失败页提供「选择主仓库」。
- 主仓库和看板的仓库筛选是两件事。主仓库存在外壳配置里，只决定服务的 cwd。看板筛选仍在页面的 `localStorage` 里，不受主仓库影响。

### 4.6 启动画面与失败页（§11 第 12 项 LOCKED）
- 状态窗口加载 app 自带的本地页面，显示轻量启动画面。失败时同一个窗口显示失败页。控制台窗口只加载服务 URL，两类内容不混在一个窗口里。
- 失败页内容：失败码、一句说明、诊断命令、四个按钮：「复制诊断命令」「重试」「打开配置文件」「退出」。没有主仓库时加「选择主仓库」。
- 诊断命令由外壳生成，反映真实的 `cli_path`、`main_repo` 和 `port`：
  `cd -- '<main_repo>' && '<cli_path>' operator serve --host 127.0.0.1 --port <port>`
  每个值按 POSIX 单引号规则转义（`'` 写成 `'\''`）。命令不含环境变量赋值，不含 PATH，不含任何凭据。值里有非 UTF-8 字节时不生成命令，只显示失败码。
- 状态窗口的命令只有五个（§5 S3），只在状态窗口、只对本地 origin 授权。

### 4.7 导航与新窗口（必改项 D）
外壳用一个纯函数判断每个 URL，结果只有三种：留在窗口内、交给系统浏览器、拒绝。

| 窗口 | 留在窗口内 | 交给系统浏览器 | 其他 |
|---|---|---|---|
| 控制台窗口 | scheme 是 `http`，host 解析后是 IPv4 `127.0.0.1`，端口等于自己子进程的端口，没有 userinfo | scheme 是 `https`，host 精确等于 `github.com`，端口为空或 443，没有 userinfo，并且来自用户手势 | 拒绝 |
| 状态窗口 | 只有 app 自带的本地页面 | 无 | 拒绝 |

- 解析用标准 URL 解析器，按解析后的 scheme、host、port 比较，不做字符串前缀匹配。`localhost`、`[::1]`、其他端口、`file:`、`data:`、`blob:`、`javascript:`、`about:`、自定义 scheme 都拒绝。
- 覆盖的入口：顶层导航（含重定向）、`window.open`、`target="_blank"`、下载、权限请求。
  - 重定向：每一跳都过同一个判断函数。服务端今天没有重定向（§0 P1），T-NAV-3 用一个测试服务验证外壳确实拦截了重定向（**unverified**：Tauri 的导航回调是否覆盖服务端重定向）。
  - 新窗口：外壳从不创建新的 WebView 窗口。合规的 GitHub 链接交给系统浏览器，其他一律丢弃。
  - 用户手势：如果 DP0 证明新窗口回调能拿到用户手势信息，就要求手势。拿不到时，依赖 WKWebView 默认禁止脚本自动打开窗口，并用 T-NAV-5 证明没有手势的 `window.open` 什么也打不开（**unverified**）。
  - 下载：全部拒绝，不写文件。
  - 权限请求（摄像头、麦克风、定位、通知、剪贴板读取）：全部拒绝，不弹系统对话框。剪贴板写入是页面「复制命令」需要的，DP0 验证它在拒绝其他权限后仍然可用。
- 交给系统浏览器：Rust 侧调用系统打开方法，只传通过判断的 URL。这个能力不暴露给任何页面。

### 4.8 Dock 角标（DP2b，§11 第 5 项 LOCKED）
- 来源：控制台窗口的标题。严格匹配 `^\((\d+)\) repo-harness$` 时，角标显示 N。标题是 `repo-harness` 时不显示角标。其他标题不显示角标。
- 定义严格沿用 Kumo plan §3.4 的「需要你」队列，不加新的排除规则。CI 失败、changes requested、dirty worktree 等不是「需要你」，不进角标。
- 断开时清除：子进程退出、控制台窗口切到失败页、标题不匹配时，立即清除角标。不显示假的 0。
- 页面数据过期时也要清除：现在 Dev Activity 读取失败时，页面保留上次快照并标 `refreshFailed: true`（`dev-activity.ts:26-30`、:40-42），`snapshotOf` 仍返回这份快照（:50-51），所以 `document.title` 保留上次的计数（`App.tsx:398-402`）。DP2b 包含一个前端小改动：`refreshFailed` 为 true 时，标题不带数字。浏览器标签页也随之不再显示过期计数。计数的定义不变。

### 4.9 多仓库与同时运行的终端服务（§11 第 7 项 LOCKED）
- 一个服务进程覆盖 Fleet registry 里的所有可读仓库。页面已有仓库筛选（`plans/archive/plan-20260911-operator-repo-selector.md`，Kumo plan §4.2）。外壳不按仓库起进程。MVP 一个控制台窗口。
- 桌面版永远启动自己的服务，默认端口 4319。终端里在 4318 运行的服务不受影响。
- DP0 要核对两个服务同时运行时的冲突：
  - 共享状态：在 `src/effects/operator`、`src/effects/dev-activity`、`src/effects/setup` 里，只有 `runtime-capture-writer.ts` 写文件，它属于 `operator capture` 命令（**inferred**：serve 不写共享文件）。DP0 在两个服务同时运行时比较文件系统写入，确认这一点。
  - collector 负载：两个服务各自运行 Dev Activity（60 秒一次）和 setup collector（10 分钟一次），`gh` 和 `git` 调用会加倍。DP0 记录实测调用次数。如果 GitHub 限流或负载不可接受，回到本节重新决定，不自动关闭任何一方的 collector。

---

## 5. 安全边界

只读状态一直保持到 Operator 写入期。桌面壳的义务按 I1–I9 列出：

| # | 不变量 | 桌面壳的义务 |
|---|---|---|
| I1 | Operator 只读 | 外壳不加路由、不代理、不改服务端。`tests/effects/operator-write-boundary.test.ts` 不改 |
| I2 | 唯一指令通道：Bot → CLI → herdr | 外壳只运行固定命令：登录 shell 探测、`repo-harness --version`、`repo-harness operator serve …`、系统打开方法（配置文件、GitHub 链接）。不调用其他子命令，不调用 herdr |
| I3 | GET 白名单 | 不变。外壳不注册自定义协议，不开本地 HTTP 端口 |
| I4 | GET 不建库、不探测、不派发 | 不变。外壳的探测只在启动时运行，不在任何 HTTP 请求路径上 |
| I5 | 不泄露 secret 和私有路径 | 外壳不读页面数据。服务端 stderr 原文只写入本地日志（§4.3），界面只显示错误码。配置只存五个字段，不存 token（§4.5）。外壳本身不发网络请求，没有遥测。这条只约束外壳：服务端的 collector 按 Kumo plan 访问 GitHub，是已有行为 |
| I6 | 每个数据只有一个权威来源 | UI 来自 CLI。Dock 角标只读标题里的计数，不重新计算（§4.8） |
| I7 | CLI 和 UI 输出一致 | 同一个服务进程，自动成立 |
| I8 | 写入失败必须可见 | 外壳的失败都显示失败页，不显示白屏或旧页面 |
| I9 | UI 不触发动作 | 控制台页面没有任何可调用的命令。「复制命令」仍只写剪贴板 |

桌面壳不变量：
- **S1 纯外壳**：app 包里没有 repo-harness 代码、Bun 或 UI 文件。
- **S2 归属**：外壳只管理自己的 `Child`。归属来自子进程句柄、它的 stdout URL 行和它的存活状态，从不来自端口探测或 `/healthz`。外壳当前不发 HTTP 请求；以后如果加，必须不跟随重定向、响应上限 64 KiB、超时 2 秒。
- **S3 原生桥（必改项 B）**：
  - 控制台窗口没有任何 capability。
  - 状态窗口只有一个 capability，只对 app 自带的本地 origin 生效（不设 `remote`），只允许五个应用命令：`status_report`（只读）、`retry_start`、`choose_main_repo`、`open_config`、`quit_app`。没有任何插件的 JS 权限，也没有 `core:*` 权限。
  - 五个应用命令在 `build.rs` 的 app manifest 里声明，让它们受 capability 控制。`invoke_handler` 注册的命令集合必须和 app manifest 完全相同（T-BRG-3 做漂移检查）。
  - 插件只用 single-instance，并且只用它的 Rust 回调。
  - `withGlobalTauri` 关闭，但这只是减少暴露面，不是权限边界。权限边界由编译后的 capability 和运行时拒绝测试证明（T-BRG），不由「页面里没有某个全局对象」证明。参考 https://v2.tauri.app/security/capabilities/ 。
- **S4 导航白名单**：§4.7 的判断函数覆盖导航、重定向、新窗口、下载和权限请求。
- **S5 唯一生命周期所有者**：外壳只停止自己的子进程，从不按名字停止进程。lifeline 保证外壳死亡时服务退出。
- **S6 不放宽服务端**：任何阶段都不为桌面版修改 Host、Origin、`Sec-Fetch-Site`、CSP、`X-Frame-Options`。
- **S7 最小环境**：子进程环境和配置文件按 §4.5 的白名单，token 不写盘。
- **S8 诊断命令**：只含 `cli_path`、`main_repo`、`port` 和常量，正确转义，不含凭据（§4.6）。

Operator 写入期的约束（§11 第 16 项 LOCKED，本 plan 只记录）：
- 桌面版和浏览器共用同一条写入通道、同一套确认语义和同一份审计记录。外观可以不同。
- 桌面版不做私有的 IPC 写入捷径。
- revamp plan §0 P3 记录服务端没有 token 和 CSRF 防护。写入设计如果采用每次启动生成的密钥，外壳可以通过 stdin 或环境变量把它交给子进程，具体做法由写入 plan 决定。§4.1 的端口抢占问题一起在那里解决。

---

## 6. macOS Apple Silicon 优先
- 只构建 `aarch64-apple-darwin`（§11 第 15 项 LOCKED）。最低系统版本按 DP0 结果定。Tailwind v4 要求 Safari 16.4 以上（**inferred**），实际按 WKWebView 实测决定。
- DP2 的本机构建只做 ad-hoc 签名。arm64 可执行文件必须有签名才能运行（**inferred**）。本机构建的 app 没有 quarantine 属性，不需要公证就能打开（**inferred**）。
- 发版走 Developer ID Application 签名，开 Hardened Runtime，用 `notarytool` 公证，用 `stapler` 装订（§11 第 13 项 LOCKED：Aimpact 2026-10-13 确认有 Apple Developer 账号）。
- 发版前核实三件事：用哪个 Apple Developer 账号、Team ID、Developer ID 证书。账号标识、Team ID、证书和公证凭据都不写进仓库，也不提交到任何文件。它们只放在发布主机（Mac mini）的钥匙串里。每次使用都是凭据边界，需要 Aimpact 批准。
- 标题栏用 macOS 原生标题栏（§11 第 10 项 LOCKED）。
- 名称是 `repo-harness`。图标从现有 `src/operator-web/favicon.svg` 制作成正规的 macOS 图标（1024 px 母版，按 macOS 图标网格）。Bundle ID `io.github.ancienttwo.repo-harness` 在任何发布前要确认（§11 第 11 项 PENDING CONFIRM）。本 plan 里的日志和配置路径先用这个 ID。

---

## 7. 打包与发布

- **代码位置**：同一仓库的 `desktop/`（Tauri 项目和 `Cargo.lock`）。它不加入 npm `files`，不是 Bun workspace，不改 `package.json` 和 `bun.lock`。外壳依赖的启动合约（stdout 第一行 URL、`--exit-on-stdin-eof`）在本仓库定义和测试，放在一起改动时可以一起验证。外壳不消费任何共享 TS 包，所以不需要 workspace。
- **版本**：外壳有自己的版本号，和 npm 包版本分开。外壳只声明 `MIN_CLI_VERSION`。CLI 正常发版不需要重新构建 app。
- **npm**：npm 包不带 app 二进制，tarball 不变。CLI 只增加 `--exit-on-stdin-eof`，随正常版本发布。
- **本机自用（DP2）**：在 Mac mini 上本地构建、ad-hoc 签名、自己安装。DP2 不发布 GitHub Release，因为没有 Developer ID 签名的 app 下载后会被 Gatekeeper 拦截。
- **GitHub Release（DP3。条件：DP1 及以后另给的 GO；§11 第 11 项的 Bundle ID 已确认；发版前已核实 Team ID 和证书）**：Tag 用 `desktop-v<semver>`，不和 `v<npm 版本>` 混用。资产是签名并公证的 `.dmg` 和 `SHA256SUMS`。用户手动下载。发布后把资产下载回来比较 sha256，并在新建用户下安装验证（T-REL）。README 的 Local Human Control Board 一节同时加一句下载位置。
- **发布记录**：沿用 `deploy/release-checklists/`，文件名用 `YYMMDD-repo-harness-desktop-<version>.md`。
- **以后再说**：Homebrew cask、自动更新（§11 第 14 项 LOCKED）。自动更新需要一把新的更新签名密钥，是凭据边界，要单独批准。
- **不做**：`repo-harness desktop install` 这类由 CLI 下载并安装 app 的命令。它会在 CLI 里加入下载和运行二进制的路径，安全面大。

---

## 8. 分期

| 阶段 | 内容 | 产出 | 退出条件 |
|---|---|---|---|
| DP0 实测（不改仓库代码） | 1. 权限边界：最小 Tauri app 按 S3 配置，跑 T-BRG。2. 生命周期：用假 CLI 跑外壳侧 T-LIFE。3. 导航：T-NAV 中标为 unverified 的项。4. WebKit：在 Safari 和最小 Tauri 窗口里打开当前服务，亮/暗、1440 与 390 宽；剪贴板复制；`localStorage` 重启后保留。5. 两个服务同时运行的冲突（§4.9）。6. setup check 在主仓库 cwd 下的输出。7. Finder 启动时的 PATH。8. Safari「添加到程序坞」能否用于 `http://127.0.0.1`。9. 最小 Tauri app 的体积 | 本 plan 增加「DP0 结果」一节，所有 **inferred/unverified** 改为已核对或推翻；第 8 项的结果写成日常用法说明 | 结果写进本 plan 后，本 work-package 停止（§11 第 2 项）。以后另给 GO 时，1、2 都必须已通过 |
| DP1 CLI 启动合约 | `operator serve --exit-on-stdin-eof`（§4.4）；固定「stdout 第一行严格是 URL」；tarball smoke 增加 lifeline 检查 | 一个小 PR，只改 CLI 和测试 | CLI 侧 T-LIFE 和 `smoke:tarball-install` 通过；发布一个包含它的 CLI 版本 |
| DP2 外壳 MVP（本机自用） | `desktop/` Tauri 项目：探测与配置、版本检查、子进程生命周期、固定端口、两个窗口、导航判断、启动画面与失败页、诊断命令、日志、单实例、原生标题栏、图标 | ad-hoc 签名的本地 `.app` | §10 的 T-OWN、T-BRG、T-LIFE、T-NAV、T-ENV、T-DIAG、T-E2E 在 Mac mini 上从 Finder 启动全部通过 |
| DP2b Dock 角标 | §4.8 的角标；前端标题在 Dev Activity 读取失败时不带数字 | 外壳增量 PR 和一个前端小 PR | T-BADGE 通过 |
| DP3 对外分发（条件：另给的 GO；§11 第 11 项确认；发版前核实 Team ID 和证书） | Developer ID 签名、公证、`desktop-v*` GitHub Release、发布记录 | 公证后的 `.dmg` | T-REL 通过 |
| DP4 以后 | 菜单栏图标、系统通知、自动更新、Homebrew cask、其他平台、与 Operator 写入期对齐 | 各自单独批准 | — |

每个阶段一个 PR，单独回滚。DP1 对终端用户也有用（脚本化启动时防止孤儿进程）。

当前授权只到 DP0（§11 第 2 项）。DP1–DP4 的内容是设计，没有 GO。

架构模型：DP2 在 `.archcontext/model` 里给桌面壳加一个节点，依赖 `component.operator.primary`，走正常的 architecture-projection 流程。

---

## 9. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| Finder 启动没有用户 PATH | 找不到 `bun`、`repo-harness`、`gh`、`herdr` | 首次启动用登录 shell 探测三个值并写入配置；用户可手改；失败页显示原因（§4.5） |
| 登录 shell 探测执行 rc 文件，可能卡住或输出杂讯 | 启动卡住或解析错误 | 10 秒超时，stdin 为 `/dev/null`，输出上限 64 KiB，只解析标记之间的内容；失败时手动填写配置 |
| 漏传 `REPO_HARNESS_HOME` | 服务读另一个 registry，显示错误的仓库 | 探测并持久化这个路径，放进环境白名单（T-ENV-3） |
| `GH_TOKEN` 只在 rc 文件里 | Dev Activity 的 GitHub 源 `unavailable` | 不传 token 是设计决定；页面显示原因码；用户改用 `gh auth login` |
| 控制台页面能调用本机命令 | 页面里的 XSS 可以执行本机操作 | S3；DP0 先跑 T-BRG，不通过就不进入 DP2 |
| `/healthz` 被当成归属证明 | 外壳显示别人的服务 | S2：只信任自己的子进程和它的 URL 行（T-OWN） |
| 子进程退出后端口被其他进程占用 | 页面下一次刷新读到其他进程的数据 | 子进程退出时立即切到失败页并清除角标；恶意本机进程不在威胁模型内，认证设计放到 Operator 写入期（§4.1） |
| 外壳崩溃留下孤儿服务 | 端口被占用，下次启动失败 | lifeline、写端 close-on-exec、关闭总期限、进程组回收（T-LIFE） |
| 外壳误停用户在终端运行的服务 | 用户的工作被打断 | S5：只按自己的 PID 和进程组停止，不用 `pkill`（T-LIFE-10） |
| 两个服务同时运行 | `gh`/`git` 调用加倍，可能限流 | DP0 实测（§4.9）；不自动关闭任何 collector |
| WebKit 和 Chrome 渲染不同 | Kumo 组件或 Tailwind v4 样式在 WKWebView 里错位 | DP0 用 Safari 验收；以后 UI PR 的截图同时覆盖 WebKit |
| WKWebView 拒绝 `navigator.clipboard` | 「复制命令」失效，页面唯一的输出通道断了 | DP0 实测；不通过时回到本 plan 重新决定，不在前端加备用复制方法 |
| `localStorage` 不持久 | 每次启动丢主题、语言、看板筛选 | 固定端口 4319；DP0 核对 WebView 数据目录持久 |
| 服务端重定向或新窗口绕过判断 | 控制台窗口加载外部页面 | S4；T-NAV-3、T-NAV-4 |
| 诊断命令转义错误 | 用户复制后执行了错误的命令 | POSIX 单引号转义；T-DIAG 覆盖空格、引号、`$`、反引号、换行 |
| 角标显示过期计数 | 用户看到不存在的待办 | §4.8：断开和读取失败时清除；T-BADGE |
| 外壳要求的最低 CLI 版本过高或过低 | 用户卡在升级页，或旧 CLI 缺少 lifeline | `MIN_CLI_VERSION` 只跟随启动合约变化，变化时写进发布记录 |
| 源码 checkout 里没有构建 `dist/operator-ui` | 控制台窗口显示 404 | 失败页文案提示 `bun run build:operator-web`；npm 安装由 tarball smoke 保证有 UI |
| 仓库引入 Rust 工具链 | CI 和维护成本增加 | 只在 `desktop/`；默认只在本机构建；是否加 macOS CI job 在 DP3 决定 |
| Apple 签名与公证凭据 | 凭据泄露或过期导致无法发布 | 账号标识、Team ID、证书和公证凭据不写进仓库；凭据只放发布主机钥匙串；发版前核实账号、Team ID 和证书；每次使用需要 Aimpact 批准 |

---

## 10. 测试计划

测试编号按必改项分组。T-OWN 对应 A，T-BRG 对应 B，T-LIFE 对应 C，T-NAV 对应 D，T-ENV 对应 E。

**T-OWN 归属（A）**
- T-OWN-1：端口 4319 已被一个返回正常 `/healthz` 的服务占用。外壳的子进程绑定失败后，外壳显示端口占用失败页。控制台窗口从未加载 4319。外壳没有向 4319 发任何请求。
- T-OWN-2：假 CLI 打印正确的 URL 行后立即退出。外壳不打开控制台窗口，或打开后立即切到失败页。
- T-OWN-3：stdout 第一行多一个字符、端口不同、host 是 `localhost`、超过 256 字节时，外壳拒绝并停止子进程。
- T-OWN-4：子进程运行中被外部 `kill -9`。控制台窗口立即切到失败页，角标清除。
- T-OWN-5（静态）：外壳代码里没有 HTTP 客户端依赖。如果以后加，测试改为检查不跟随重定向、64 KiB 上限、2 秒超时。

**T-BRG 原生桥（B）**
- T-BRG-1（静态）：编译后的 capability 只有一个，绑定状态窗口，不含 `remote`，权限正好是五个应用命令。
- T-BRG-2（静态）：`Cargo.toml` 的 Tauri 插件只有 single-instance。没有 shell、fs、http、opener、dialog、clipboard、notification、updater 插件。
- T-BRG-3（静态）：`invoke_handler` 注册的命令集合等于 `build.rs` app manifest 的命令集合，等于 capability 授权的集合。
- T-BRG-4（运行时）：在控制台页面里，分别用 `__TAURI_INTERNALS__.invoke`（如果存在）和底层消息通道调用五个应用命令。每个调用都被拒绝，并且没有副作用：app 仍在运行，子进程 PID 不变，配置文件 mtime 不变，没有打开新的进程或窗口。
- T-BRG-5（运行时）：在控制台页面里调用 `core` 和常见插件命令（例如关闭窗口、执行命令、写文件）。全部被拒绝，窗口仍在，没有新文件。
- T-BRG-6（运行时）：在状态页里调用五个以外的命令。被拒绝。
- T-BRG-7：开发构建打开 devtools 时，T-BRG-4、T-BRG-5 的结果相同。全局对象是否存在只作记录，不作为通过条件。

**T-LIFE 生命周期（C）**
CLI 侧（`tests/cli/operator-serve.test.ts`，DP1）：
- T-LIFE-1：带 `--exit-on-stdin-eof` 启动，在 URL 行出现之前关闭 stdin。服务不打印 URL，退出，collector 进程组为空。
- T-LIFE-2：同时发送 SIGTERM 和关闭 stdin。服务只关闭一次，退出码 0。
- T-LIFE-5：让一个 collector 子进程忽略 SIGTERM。关闭超过总期限后，服务向进程组发 SIGKILL，以非 0 退出，没有进程留下。
- T-LIFE-6：正常 EOF 关闭后，服务启动过的所有进程组里都没有进程。
- T-LIFE-11：不带参数时，关闭 stdin 不影响服务。stdout 第一行严格等于 `http://127.0.0.1:<实际端口>`。
外壳侧（`cargo test`，用假 CLI 脚本，DP0 原型、DP2 正式）：
- T-LIFE-3：`kill -9` 外壳。自己的服务在限定时间内退出。
- T-LIFE-4：外壳启动服务之后再启动探测、`--version` 和打开配置文件，然后 `kill -9` 外壳。服务仍然收到 EOF 并退出（写端没有被继承）。
- T-LIFE-7：假 CLI 持续向 stdout 和 stderr 各写 10 MiB。外壳不阻塞，日志不超过上限。
- T-LIFE-8：假 CLI 从不打印 URL 行。30 秒后外壳显示失败页，子进程已停止并回收。
- T-LIFE-9：在失败页连续快速点两次「重试」。任何时刻最多一个自己的子进程，旧子进程已被 `wait()` 回收。
E2E：
- T-LIFE-10：先在终端运行 `repo-harness operator serve`（4318）。打开并退出桌面版。只有桌面版自己的 PID 和进程组消失。4318 的 `/healthz` 在前后都返回 200。测试不使用 `pkill` 或 `killall`。

**T-NAV 导航（D）**
- T-NAV-1（单元）：判断函数的表格测试：允许的 origin；`localhost`、`[::1]`、其他端口、带 userinfo、`file:`、`data:`、`blob:`、`javascript:`、`about:blank`、自定义 scheme 都拒绝；`https://github.com/o/r/pull/1` 交给系统浏览器；`http://github.com`、`https://github.com.evil.example`、`https://user@github.com` 拒绝。
- T-NAV-2：控制台页面里 `location.href = 'https://example.com'`。窗口不离开服务 URL，系统浏览器不打开。
- T-NAV-3：用测试服务返回 302 到外部地址。外壳拦截，窗口不加载外部页面。
- T-NAV-4：点击 PR 链接（`target="_blank"`）。系统浏览器打开该 PR，没有新窗口，主窗口不动。
- T-NAV-5：在定时器里调用 `window.open('https://github.com/o/r/pull/1')`（没有用户手势）。没有窗口，系统浏览器不打开。
- T-NAV-6：触发一个下载链接。没有文件写入，没有对话框。
- T-NAV-7：调用 `getUserMedia`、`geolocation.getCurrentPosition`、`Notification.requestPermission`。全部被拒绝，没有系统权限对话框。
- T-NAV-8：状态窗口里导航到服务 URL 或任何外部地址。被拒绝。

**T-ENV 环境与配置（E）**
- T-ENV-1：探测 shell 的 rc 文件打印杂讯、读 stdin、睡 30 秒。外壳分别正确解析、不挂住、10 秒超时后显示失败页。
- T-ENV-2：探测 shell 设置了 `GH_TOKEN=fake-token-value`。配置文件、日志和子进程环境里都找不到这个值。
- T-ENV-3：假 CLI 把自己的环境写到测试文件。键集合正好等于 §4.5 的白名单；设置了 `REPO_HARNESS_HOME` 时它在其中。
- T-ENV-4：配置文件有未知字段、相对路径、`cli_path` 不可执行、`main_repo` 是符号链接时，解码失败并显示失败页。
- T-ENV-5：配置文件权限是 0600，只有五个字段。
- T-ENV-6：探测失败后，用户手动填写 `cli_path` 和 `path`，重试后服务正常启动。

**T-DIAG 诊断命令（§4.6）**
- T-DIAG-1：`main_repo` 和 `cli_path` 含空格、单引号、`$`、反引号、换行。生成的命令在 `sh` 里执行时，参数和原值逐字节相同（用一个打印 argv 的假 CLI 验证）。
- T-DIAG-2：命令里没有 `=` 形式的环境变量赋值，没有 PATH，没有 T-ENV-2 的假 token。
- T-DIAG-3：值含非 UTF-8 字节时，不生成命令，只显示失败码。

**T-BADGE 角标（DP2b）**
- T-BADGE-1：标题 `(3) repo-harness` 时角标是 3；标题 `repo-harness` 时没有角标。
- T-BADGE-2：子进程退出后角标立即清除。
- T-BADGE-3：Dev Activity 读取失败后，标题不带数字，角标清除，不显示 0。
- T-BADGE-4：只有 CI 失败的卡片时，角标不出现。

**T-E2E（DP2，macOS Apple Silicon，从 Finder 启动）**
1. 首次启动：探测成功，选择主仓库，控制台显示真实数据；记录启动到首屏的时间。
2. 关闭最后一个窗口：app 退出，自己的服务退出（按 PID 检查）。
3. 配置里的 CLI 不存在、版本过低、没有主仓库：分别显示对应失败页。
4. 复制命令：剪贴板内容正确。
5. 修改主题、语言和看板筛选后重启：设置保留，主仓库不受看板筛选影响。
6. 亮/暗截图，窗口宽 1440 与最小宽度各一张。
7. 第二次打开 app：只激活已有窗口，只有一个自己的服务。
8. `tests/effects/operator-write-boundary.test.ts` 不改，继续通过；`bun run check:type`、`bun run smoke:tarball-install` 通过（DP1）。

**T-REL（DP3，条件阶段）**
- `codesign --verify --deep --strict`、`spctl -a -vv`、`xcrun stapler validate`。
- 从 GitHub Release 下载资产，与 `SHA256SUMS` 比较。
- 在新建的 macOS 用户下安装，重复 T-E2E 1–2。

---

## 11. Open Questions for Dot

第二轮按 Dot 的评审（Slack #bot-worker，编排者已逐字核对）锁定。第三轮按 Aimpact 2026-10-13 的确认锁定第 2、13 项。**LOCKED** 已写进正文。**PENDING CONFIRM** 等 Aimpact 确认，确认前按默认值执行。

1. **外壳技术** — LOCKED：Tauri v2。DP0 先证明权限边界和生命周期（T-BRG、T-LIFE）。只有决定桌面版长期只做 macOS 时才改用 Swift。（§2.3）
2. **只用 Safari「添加到程序坞」就结束** — LOCKED（Aimpact 2026-10-13 确认）：手动启动服务够用。本 work-package 做到 DP0 就停。DP1 及以后要另给 GO。（§2.3、§8）
3. **关闭窗口** — LOCKED：关闭最后一个窗口时退出 app，只停止本 app 启动的服务。（§4.2）
4. **菜单栏图标** — LOCKED：MVP 不做。以后出现常驻需求时，再考虑服务状态、打开、退出三项。（§1、§8 DP4）
5. **Dock 角标** — LOCKED：DP2b 显示「需要你 N」，严格沿用 Kumo plan §3.4，不加新的排除规则。CI 失败等不是「需要你」。断开时清除过期数字，不显示假的 0。（§4.8）
6. **Setup 的目录** — LOCKED：用用户明确选择的主仓库，不用 `$HOME`。主仓库和看板筛选分开。（§4.5）
7. **终端里已有服务** — LOCKED：桌面版启动自己的服务，端口 4319。端口被占用时报错；不接管、不停止、不静默换端口。DP0 核对和终端服务（例如 4318）同时运行时的 collector 与共享状态冲突。（§4.1、§4.9）
8. **系统通知** — LOCKED：MVP 不做。以后只通知新出现的、确实需要人处理的正式请求，要去重、不通知首次快照里已有的项、限制频率。（§1、§8 DP4）
9. **开机自动启动** — LOCKED：不做。（§1）
10. **窗口外观** — LOCKED：原生标题栏。（§6）
11. **名称、Bundle ID、图标** — 名称 LOCKED：`repo-harness`。图标 LOCKED：从 favicon 制作正规的 macOS 图标。Bundle ID `io.github.ancienttwo.repo-harness` — PENDING CONFIRM，任何发布前确认。（§6）
12. **启动画面与失败页** — LOCKED：轻量启动画面，单独的失败页，有复制诊断命令、重试、打开配置文件、退出。命令反映真实的 CLI 路径、cwd 和端口，正确做 shell 转义，不含凭据。（§4.6）
13. **Apple Developer 账号** — LOCKED（Aimpact 2026-10-13 确认）：Aimpact 有 Apple Developer 账号。发版走 Developer ID 签名加公证。账号、Team ID 和证书在发版前核实，不写进仓库，也不提交任何凭据。（§6、§7）
14. **分发渠道** — LOCKED：首次对外发布用 GitHub Release 手动下载，Tag 用 `desktop-v*`。Homebrew cask 和自动更新以后再说。对外发布在 DP3，要另给 GO，并且在 Bundle ID 确认、Team ID 和证书核实之后。（§7）
15. **其他平台** — LOCKED：只做 arm64 macOS，不给其他平台编时间表。（§1、§6）
16. **Operator 写入期的体验** — LOCKED：桌面版和浏览器共用同一条写入通道、确认语义和审计。外观可以不同。没有私有的 IPC 写入捷径。（§5）

---

## 12. 修订记录

**第二轮（20261013，Dot 评审）**
- §11：16 项全部给出答复。13 项 LOCKED。3 项 PENDING CONFIRM：第 2 项、第 11 项的 Bundle ID（名称和图标已 LOCKED）、第 13 项。
- 必改项 A（归属）：§4.1、S2、T-OWN。归属只来自自己的子进程，`/healthz` 不作归属证明，端口占用时不连接已有服务，HTTP 请求规则，恶意本机进程记为范围外和后续项。
- 必改项 B（原生桥）：S3、T-BRG。两个窗口分开，控制台窗口零 capability，状态窗口五个命令，app manifest 与 `invoke_handler` 漂移检查，运行时拒绝测试。不再用「全局对象不存在」作为证明。
- 必改项 C（孤儿进程）：§4.2–§4.4、T-LIFE。启动期 EOF、重复退出、`kill -9`、写端继承、关闭期限、进程组回收、持续读取输出、启动总期限、重试前回收。E2E 只检查自己的服务，终端服务保持正常，不用 `pkill`。
- 必改项 D（导航）：§4.7、S4、T-NAV。精确解析 scheme/host/port，覆盖重定向、`window.open`、`target="_blank"`、下载、权限请求。外链只放行有用户手势的 `https://github.com`。
- 必改项 E（环境）：§4.5、S7、T-ENV。统一为最小白名单；配置只存五个字段；探测只打印三个值，不读完整环境；token 不写盘；探测失败时手动填写绝对路径。
- I5 只约束外壳本身；服务端 collector 访问 GitHub 是已有行为。
- 阶段改名为 DP0–DP4，写入阶段改称 Operator 写入期，外壳不变量改为 S1–S8，避免和 revamp plan 的 D0/D1 冲突。
- §6、§7：签名、公证和 GitHub Release 改为以第 13 项为条件，默认本机自用。

**第三轮（20261013，Aimpact 确认）**
- §11 第 2 项 LOCKED：手动启动服务够用。本 work-package 做到 DP0 就停，DP1 及以后要另给 GO。改动见页首 Status、§2.3、§8。
- §11 第 13 项 LOCKED：Aimpact 有 Apple Developer 账号。发版走 Developer ID 签名加公证。账号、Team ID 和证书在发版前核实，不写进仓库，不提交凭据。改动见 §6、§7、§9。
- §11 第 11 项的 Bundle ID 仍是 PENDING CONFIRM。
- §11 第 14 项：对外发布的条件改为另给的 GO、Bundle ID 确认、Team ID 和证书核实。
