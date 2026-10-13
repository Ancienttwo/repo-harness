# DP0 结果

> 对应 `plans/plan-20261013-desktop-app.md`（PR #704，以 `05c708f6` 为准）的 §8 DP0 第 1–3 项：权限边界、生命周期、导航中未核实的项。只做了本次批准范围内的桥接与生命周期证明。
> 环境：macOS 26.5（arm64），rustc 1.99.0，Tauri 2.12.3，wry 0.57.0，tauri-build 2.7.2。基线 `origin/main@4a09c762`。
> 运行时间：2026-10-13 17:34（CST）；验收修正后非 GUI 测试复跑一次。完整日志不入库，结论和关键证据摘在下表。

## 结论

- **桥接（T-BRG）：通过。** 控制台页面里确实注入了 `__TAURI_INTERNALS__`，但所有调用都被 ACL 拒绝，没有留下副作用。状态页能调用五个应用命令，作为正向对照。
- **生命周期（T-LIFE、T-OWN）：外壳侧全部通过。** 用假 CLI 证明了 stdin 管道 EOF、写端不被继承、外层期限和进程组回收这几条机制。真实 CLI 一侧的改动属于 DP1，没有验证。
- **导航（T-NAV）：T-NAV-5 失败。** 这是一个需要决定的设计问题，见下面的 F1、F2。

## 逐项结果

| 编号 | 结果 | 证据 |
|---|---|---|
| T-BRG-1 | PASS | 编译后的 `gen/schemas/capabilities.json` 只有 `status-window`，`windows:["status"]`，`local:true`，没有 `remote`，权限正好是五个 `allow-*` |
| T-BRG-2 | PASS | 依赖里没有任何 `tauri-plugin-*`。`withGlobalTauri:false`。identifier 是 `com.repoharness.app` |
| T-BRG-3 | PASS | `generate_handler!` 的集合 = `build.rs` app manifest 的集合（同一个 `src/commands.rs`）= capability 授权的集合 |
| T-BRG-4 | PASS | 控制台页调用五个应用命令，全部被拒：`status_report not allowed on window "console" … allowed on: [windows: "status", URL: local]`。audit 里没有任何 `window=console` 的命令记录（这是证据；`quit_app` 只写 audit，不能用「app 仍在运行」证明它被拒） |
| T-BRG-5 | PASS | `plugin:app\|version`、`window\|title`、`window\|close`、`webview\|create_webview_window`、`event\|emit` 被拒（`… not allowed. Permissions associated …`）。`shell\|execute`、`fs\|write_text_file` 被拒（`Plugin not found`）。`/tmp/dp0-shell-pwned`、`/tmp/dp0-fs-pwned` 不存在。控制台窗口在 `window\|close` 之后仍然存在。不经辅助函数直接 `fetch('ipc://localhost/…')` 返回 500 `missing Tauri-Invoke-Key header`；直接 `postMessage` 没有执行任何命令 |
| T-BRG-6 | PASS | 状态页：五个命令 `resolved`，audit 有对应的 `window=status` 记录；`plugin:app\|version`、`window\|title`、`webview\|create_webview_window` 被拒 |
| T-BRG-7 | PASS | 打开 DevTools（audit 有 `devtools-opened`）后重跑同一组调用，结果和 T-BRG-4、T-BRG-5 相同 |
| T-OWN-1 | PASS（外壳层；失败页属于 DP2） | 4319 被另一个监听占用。子进程输出结构化的 `port_in_use`，外壳报 `PortInUse`。占用者收到的连接数是 0 |
| T-OWN-2 | PASS（外壳层；切换失败页见 T-OWN-4 GUI） | 子进程打印 URL 行后立即退出。外壳的 `Child` 看到退出；2 秒内没有再启动子进程（`spawned=1`） |
| T-OWN-3 | PASS | URL 行带多余字符、端口不对、`localhost`、超过 256 字节，四种都报 `BadUrlLine`，子进程已停止并回收 |
| T-OWN-4 | PASS | 外壳层面：`kill -9` 子进程后，`Child` 报告 SIGKILL，collector 组 5 秒内为空，没有重启。GUI 层面：audit 记录 `child-exited … unix_wait_status(9)`、`console-closed`、`spawned-total=1`；随后在 4319 新起一个监听，60 秒内收到 0 个请求 |
| T-OWN-5 | PASS | macOS arm64 实际解析的依赖图（`cargo metadata --filter-platform aarch64-apple-darwin`）里没有 HTTP 客户端。`reqwest`、`hyper`、`hyper-util` 只在 `Cargo.lock` 里，是 tauri 给 Android 和 iOS 用的依赖（tauri `Cargo.toml` 的 `cfg(any(target_os = "android", …ios…))`）。说明：这个测试的第一版检查的是全平台的 `Cargo.lock`，因此误报。在出结果之前已改为检查实际解析的依赖图 |
| T-OWN-6 | PASS（外壳层；失败页属于 DP2） | 四种非端口失败都报普通启动失败：`error` 是 `operator_server_unavailable` 但 message 里有 `EADDRINUSE`；退出 1 且没有 stderr；stderr 不是 JSON；第一行超过 4 KiB（末尾是 `port_in_use`）。另用已安装的 CLI 对照（`repo-harness --version` 为 0.22.1，记录在复跑日志开头）：它不认识 `--exit-on-stdin-eof`（`error: unknown option`），外壳报 `StartFailed { code: None }` |
| T-LIFE-3 | PASS | 外壳替身被 `kill -9` 后，子进程读到 stdin EOF 并退出（events 有 `stdin-eof`），collector 组 5 秒内为空 |
| T-LIFE-4 | PASS | 外壳替身先启动子进程，再启动一个 `sleep 300` 和一个 `sh -c true`，然后被 `kill -9`。`sleep` 仍在运行，子进程依然收到 EOF 并退出。说明写端没有被继承 |
| T-LIFE-7 | PASS | 子进程向 stdout、stderr 各写 10 MiB 并写完。日志只有 `serve.log`、`serve.log.1`，每个不超过 1 MiB，权限 0600。停止时没有用到 SIGKILL |
| T-LIFE-8 | PASS | 启动期限缩短为 2 秒做测试：报 `Timeout`，子进程已回收。生产值 30 秒由单元测试固定 |
| T-LIFE-9 | PASS | 两个线程各重试两次。共启动 4 个子进程，每个子进程启动时都没有发现还活着的前一个（没有 `overlap`），最后只剩 1 个存活 |
| T-LIFE-14 | PASS | 对子进程发 SIGSTOP 后停止。外壳等待 ≥ 15 秒（`T_SHELL`）才向子进程组发 SIGKILL，子进程因 SIGKILL 退出，collector 组 5 秒内为空 |
| T-LIFE-15 | PASS | 单元测试：`T_SERVE = 10 s`，`T_SHELL ≥ T_SERVE + 5 s`，启动期限 30 秒。正常关闭（子进程清理 1 秒）时：等待时间在 1–10 秒之间，没有 SIGKILL，子进程记录 `sigterm_seen=false` |
| T-NAV-1 | PASS | 判断函数的表格测试：允许的 origin；拒绝 `localhost`、`[::1]`、其他端口、userinfo、`file:`、`data:`、`blob:`、`javascript:`、`about:`、自定义 scheme；GitHub 的各种仿冒写法 |
| T-NAV-2 | PASS | `location.href='https://example.com/…'` 被拒，页面没有离开 |
| T-NAV-3 | PASS | 同源 `/redirect` 返回 302 到 example.com。重定向这一跳进入了导航回调并被拒（`navigation … url=https://example.com/dp0-redirect-target decision=Deny`），没有加载外部页面。计划里的 **unverified** 改为已核对 |
| T-NAV-5 | **FAIL** | 定时器里、没有用户手势的 `window.open('https://github.com/o/r/pull/5')` 到达了新窗口回调，并被判为交给系统浏览器（`would-open-external`）。DP0 只记录，不打开浏览器。见 F1 |
| T-NAV-6 | PASS | `/download` 被下载回调拒绝（`download-denied`），页面没有离开。测试只检查了 audit 和页面位置，没有检查文件系统和对话框 |
| T-NAV-7 | 部分 | 没有出现授权。但摄像头请求失败的原因是这个 WKWebView 里没有 `navigator.mediaDevices`，外壳的拒绝回调没有被触发过。定位请求 4 秒超时，无法排除屏幕上出现了系统提示。`Notification.permission` 是 `default`。见 F5 |
| T-NAV-8 | PASS | 状态窗口导航到 `http://127.0.0.1:4319/` 被拒，页面仍是 `tauri://localhost/status.html` |
| T-ENV-1 | PASS | 假登录 shell：rc 输出杂讯并读 stdin，解析正确，结果里没有 rc 设置的 `GH_TOKEN`；挂住时 2 秒超时，整个进程组被停止；输出超过 64 KiB 报 `OutputTooLarge`；找不到 CLI 报 `CliNotFound`。真实 `/bin/zsh`（从终端环境启动）：最终复跑 84 ms（此前两次为 132 ms 和 515 ms），找到 CLI 的绝对路径，`REPO_HARNESS_HOME` 没有设置 |
| T-ENV-2 | 部分 | 只验证了子进程和证据文件这一半：父进程里的 `GH_TOKEN` 没有进入子进程环境，也没有出现在任何证据文件或日志里。配置文件属于 DP2，DP0 没有 |
| T-ENV-3 | PASS | 子进程环境的键集合正好是 `PATH`、`REPO_HARNESS_HOME`，加上父进程里存在的 `HOME`、`USER`、`LOGNAME`、`SHELL`、`TMPDIR`、`LANG` |

## 发现

- **F1（需要决定）：无手势的 `window.open` 不会被拦下。** macOS 上 WKWebView 的 `javaScriptCanOpenWindowsAutomatically` 默认是开的。wry 交给 Tauri 的新窗口回调里只有 URL 和窗口尺寸，没有手势信息（wry 0.57 `wry_web_view_ui_delegate.rs`）。计划 §4.7 里「拿不到手势时依赖 WKWebView 拦截」这一条不成立。
- **F2（需要决定）：`target="_blank"` 链接先进入导航回调。** 脚本触发的点击没有触发新窗口回调，而是以顶层导航到达，并被拒绝。WebKit 先对这类链接做导航决策，只有允许之后才会请求新窗口，而 wry 的导航回调同样只有 URL（`navigation.rs`）。按计划现在的规则，桌面版里的 PR 链接点了不会有反应。真实鼠标点击没有测（需要系统级点击），这一条是 **inferred**。
  - F1 和 F2 合起来：用 Tauri 2.12 的公开回调，做不到「只在用户手势后才把 GitHub 链接交给系统浏览器」。可选方向：
    - (a) 桌面版不交出任何外链，PR 链接改成可复制（要改前端）。
    - (b) 只交出与解码器规则完全一致的 PR URL（`https://github.com/<owner>/<repo>/…`），加频率限制，接受脚本也能触发这一类打开。
    - (c) 通过平台 API 关掉 `javaScriptCanOpenWindowsAutomatically`，并在导航回调里放行 GitHub 新窗口。这需要能区分新窗口和顶层导航的信息，而公开回调里没有，要额外实测。
  - 建议先选 (a) 或 (b)，由 Dot 决定。
  - **决定（2026-10-13，Dot 和 Aimpact）：DP2 用 (b)。** 只把严格匹配的 GitHub PR URL 交给系统浏览器：只用 `https`，host 精确等于 `github.com`，path 只能是 `/<owner>/<repo>/pull/<digits>`，没有 userinfo、query 和 fragment。保留频率限制。没有手势的脚本仍可打开匹配的 PR URL，这个剩余风险已接受。不匹配的外链不打开，页面只提供复制，复制失败时明确提示，不加原生桥。完整规则见计划 §4.7、§11 第 17 项（PR #704）。本原型的 `nav.rs` 没有按 (b) 修改。
- **F3：远程页面里确实有 `__TAURI_INTERNALS__`。** 拦住调用的是 ACL，不是没有注入。这印证了 Dot 第二轮评审的 B 点。Tauri 2.12 对远程 origin 的应用命令默认就会拒绝（`tauri/src/webview/mod.rs` 中 `!is_local` 的判断）。调试构建的拒绝信息会说出窗口名和权限名；按源码，发布构建只返回 `Command … not allowed by ACL`。
- **F4：** `plugin:__TAURI_CHANNEL__|fetch` 是 Tauri 源码里唯一不经 ACL 的命令。从控制台调用时返回 `missing channel id header`，没有副作用。
- **F5：wry 默认会授予媒体权限。** 没有设置权限回调时，wry 对摄像头和麦克风返回 `Grant`（`wry_web_view_ui_delegate.rs` 的 `requestMediaCapturePermission`）。原型在 app 和控制台窗口两级都设置了 `on_permission_request → Deny`。DP2 必须保留这一点，并在打包后的 app 里补测拒绝路径。
- **F6：** 没打包的二进制，WebKit 按可执行文件名建数据目录（`~/Library/WebKit/dp0-shell`、`~/Library/Caches/dp0-shell`、`$TMPDIR/dp0-shell`）。打包后才会按 Bundle ID 建。DP0 运行结束后已删除这三个目录。
- **F7：** 已安装的 CLI 0.22.1 不认识 `--exit-on-stdin-eof`。DP2 之前必须先完成 DP1，并设置 `MIN_CLI_VERSION`。
- **F8：** 编译产物放在外接 USB 机械盘上时，首次编译要 25 分钟，几乎都在等磁盘 I/O。放在内置盘上是 1 分 16 秒。

## 验收审查与 DP2 输入

只读验收审查的结论是 FAIL。证据和测试本身没有问题，问题在下面两点。另有几条需要带进 DP2：

- **CI**：`scripts/select-ci-coverage.ts` 要求每个代码路径都有真实的测试消费者。`desktop/dp0/` 没有 bun 测试消费者，所以 PR 的 CI 会失败。这个分支是参考原型，不应合并到 main。给 Rust 加 CI job 超出 DP0 范围。
- **结果位置**：计划 §8 规定 DP0 的结果写进计划文件的「DP0 结果」一节，并改掉 §4.4、§4.7 的 inferred/unverified 标记。本分支不改计划文件（计划在 PR #704 上）。合并结果需要另外授权。
- **探测的 UTF-8**：已改为严格解码。非 UTF-8 输出报 `NotUtf8`，不再静默替换。
- **CLOEXEC 竞态（inferred）**：macOS 上 std 先 `pipe()` 再设 `FD_CLOEXEC`。如果另一个线程恰好在两者之间启动进程，它可能继承写端。T-LIFE-4 只覆盖顺序启动。DP2 要么让所有子进程启动串行，要么补一个并发用例。
- **测试清理**：只在 pid 仍运行预期的程序（`fake-serve`、`sleep`）时才发信号，避免误伤被复用的 pid。
- **测试专用代码**：状态页为了上报结果会向服务发 HTTP 请求，CSP 也因此放行了 `http://127.0.0.1:4319`。`fake-serve` 和 `supervise-once` 是同一个包的 `[[bin]]`。DP2 必须删掉前两者，并把测试替身移出外壳的包。

## 没有验证的项

- **属于 DP1（CLI 改动）**：CLI 侧的 T-LIFE-1、2、5、6、11、12、13。真实的 `port_in_use` 错误码、serve 的 lifeline、collector 组长的 lifeline 和 setup builder 移进 Worker 都还没做。DP0 用假 CLI 模拟了这些行为，只证明外壳侧的处理和操作系统机制。
- **属于 DP2 及以后**：T-ENV-2 的配置文件部分，T-ENV-4、5、6，T-DIAG，T-BADGE，T-E2E，T-REL。
- **T-NAV-4**：真实手势点击和真正打开系统浏览器都没有测。DP0 从不打开浏览器。
- **T-NAV-7**：拒绝回调没有被触发过；定位请求超时的原因不明。
- **T-LIFE-10**：需要在 4318 上有一个终端服务。本次规定不碰 4318，所以没做。
- **§8 DP0 第 4–9 项**：真实控制台在 WebKit 里的渲染、剪贴板、`localStorage` 持久化、两个服务同时运行、setup 的 cwd、从 Finder 启动时的 PATH、Safari「添加到程序坞」、发布版 app 的体积。这些不在本次批准的范围内（只做桥接与生命周期）。之后的决定：只补做第 8 项，其他项留到以后的 GO（计划 §11 第 18 项）。

## 复现

见 `README.md`。所有测试只用 4319 端口，不读也不连 4318，只停止自己启动的进程。
