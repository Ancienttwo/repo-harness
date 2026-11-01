# operator 桌面壳 spike：GUI 启动的 PATH 与写入 token cookie

日期：2026-11-01。基线：main `6f4d5092`。来源：#1298 的 spike 范围变更。
主机：macOS 26.5（25F71），arm64，`/bin/zsh`。Electron 41.3.0。已装 CLI：repo-harness 0.25.0，bun 1.4.3。

## 结论

| 前提 | 结论 | 关键证据 |
|---|---|---|
| GUI 启动的子进程能找到 git、gh、archctx、herdr、bun | 成立，条件是壳先用 `zsh -ilc` 读环境 | Finder 启动时 PATH 只有 `/usr/bin:/bin:/usr/sbin:/sbin`，只找到 git。`-ilc` 环境找到全部 6 个工具，`--version` 都返回 0 |
| 写入 token 的 cookie 在 Electron session 里能下发，POST 不被拒绝 | 成立 | 页面响应带 `Set-Cookie`。页面内 POST 得到 400 `invalid_json`。不带 cookie 的对照 POST 得到 403 `write_token_invalid` |
| 现有 API 有可用的版本字段 | 有字段，但不能当兼容信号 | `/healthz` 返回 `protocol: 1`。这个值从 operator 首次提交起没有变过 |

壳不能依赖 Electron 退出来停止 server。app 退出而没有发 SIGTERM 时，server 继续运行，父进程变成 launchd。

## Spike 做法

spike 代码在 `/tmp/repo-harness-desktop-spike`，不提交。它是一个 Electron main 进程脚本，按顺序做这些事：

1. 记录 app 自己的 PATH、父进程和环境变量名。
2. 用 `os.userInfo().shell` 运行两次登录 shell：`-lc` 和 `-ilc`。命令是 `printf '%s' <marker>; /usr/bin/env -0`。marker 之前的输出全部丢弃，这样 `.zshrc` 打印的内容不会混进环境。
3. 用 `-ilc` 的环境加 `HOME=<mktemp 目录>` 作为子进程环境。用这个环境对 6 个工具各运行一次 `--version`。
4. 用这个环境运行 `repo-harness operator serve --port 0`，读 stdout 第一行得到 URL。
5. 打开 `BrowserWindow`（`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、内存分区 `partition: 'spike'`），加载这个 URL。
6. 读 cookie，在页面里发请求，再从 main 进程发一个不带 cookie 的对照 POST。
7. 截图，关闭窗口，向 server 发 SIGTERM，检查残留进程。

`userData`、`sessionData`、`crashDumps` 和 `logs` 都指向 `/tmp/repo-harness-desktop-spike/out`。真实 HOME 下没有新文件：`~/Library/Preferences/com.github.Electron.plist` 的修改时间是 2026-06-29，早于本次 spike。

### 为什么用 Finder 启动，不用 `open`

第一次运行用了 `open -W -n RepoHarnessSpike.app`。app 看到 89 个环境变量和完整的 shell PATH。`man open` 写明 "Opened applications inherit environment variables"，所以 `open` 不能模拟 Finder 或 Dock。后面的运行都通过 Finder 启动：

```bash
RH_SPIKE_CALLER_MARKER=finder-run osascript -e 'tell application "Finder" to open (POSIX file "/tmp/repo-harness-desktop-spike/RepoHarnessSpike.app" as alias)'
```

app 里 `RH_SPIKE_CALLER_MARKER` 为空，父进程是 `/sbin/launchd`（ppid 1），只有 14 个环境变量。这证明 app 没有继承调用者的环境。

## 前提 1：GUI 启动时能找到工具

Finder 启动时 app 的环境：

```text
PATH=/usr/bin:/bin:/usr/sbin:/sbin
env keys: COMMAND_MODE HOME LOGNAME MallocNanoZone OSLogRateLimit PATH SHELL SSH_AUTH_SOCK
          TMPDIR USER XPC_FLAGS XPC_SERVICE_NAME __CFBundleIdentifier __CF_USER_TEXT_ENCODING
```

三种环境下的工具解析结果：

| 工具 | GUI PATH | `zsh -lc` | `zsh -ilc` | `-ilc` 环境下 `--version` |
|---|---|---|---|---|
| git | `/usr/bin/git` | `/usr/bin/git` | `/usr/bin/git` | 0，`git version 2.50.1 (Apple Git-155)` |
| gh | 无 | `/opt/homebrew/bin/gh` | `/opt/homebrew/bin/gh` | 0，`gh version 2.102.0` |
| archctx | 无 | `/opt/homebrew/bin/archctx` | `~/.bun/bin/archctx` | 0，输出 JSON |
| herdr | 无 | `/opt/homebrew/bin/herdr` | `/opt/homebrew/bin/herdr` | 0，`herdr 0.9.5` |
| bun | 无 | 无 | `~/.bun/bin/bun` | 0，`1.4.3` |
| repo-harness | 无 | 无 | `~/.bun/bin/repo-harness` | 0，`0.25.0` |

耗时（3 次 Finder 启动）：`-lc` 30-36 ms，`-ilc` 116-134 ms。`serve` 从启动到写出 URL 用 191-212 ms。

用 GUI 环境直接运行 CLI 会失败：

```text
$ ~/.bun/bin/repo-harness --version   # GUI env
env: bun: No such file or directory   # exit 127
```

原因是 `~/.bun/bin/repo-harness` 是指向 `src/cli/index.ts` 的符号链接，第一行是 `#!/usr/bin/env bun`。

结论：前提成立。对壳的设计有三个约束：

- 必须用 `-ilc`。本机的 bun 和 repo-harness 路径只写在 `~/.zshrc`，`-lc` 找不到它们。
- `-lc` 和 `-ilc` 解析出的 archctx 是两个不同的文件。壳和终端用户必须用同一个环境，否则 CLI 行为不同。
- 每次启动 app 都会执行一次用户的 `.zshrc`。读取失败、超时或 marker 缺失时，壳显示错误码，不猜 PATH（#1298 风险一节）。

## 前提 2：写入 token cookie 在 Electron 里能用

server 启动：

```text
serve: http://127.0.0.1:64694   (stdout 第一行，194 ms)
page load: GET / -> 200, Set-Cookie present
```

Electron session 里的 cookie（不记录值）：

```json
{"name":"repo_harness_operator_write_64694","httpOnly":true,"sameSite":"strict","path":"/","session":true,"value_length":43}
```

页面内探针（`webContents.executeJavaScript`，同源 `fetch`）：

```js
await fetch('/healthz')                      // 200 {"ok":true,"service":"repo-harness-operator","protocol":1}
await fetch('/api/v1/fleet/snapshot')        // 200
await fetch('/api/v1/settings/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
// 400 {"error":{"code":"invalid_json","message":"The request body is not valid JSON.","next_action":"Send a JSON object."}}
document.cookie.includes('repo_harness_operator_write_')   // false (HttpOnly)
```

对照：main 进程用 `node:http` 发同样的 POST，带 `Origin` 和 `Sec-Fetch-Site: same-origin`，不带 cookie：

```text
403 {"error":{"code":"write_token_invalid","message":"The write token is missing or not valid.","next_action":"Reload the operator page, then retry."}}
```

判定依据是写入通道的检查顺序（`src/effects/operator/write-channel.ts:139-152`）：先查 Content-Type，再读 body，再比对 token，最后解析 JSON。所以 400 `invalid_json` 只会在 token 通过之后出现。Host 和 Origin 检查在这之前（`src/effects/operator/server.ts:1700-1722`），同源 `fetch` 也都通过了。

结论：前提成立。sandbox 渲染进程和内存分区都不影响 cookie 下发和回传。页面截图显示控制台正常加载，状态栏为 `Operator running 127.0.0.1:<port>`。HOME 是空目录，所以页面显示 "No repositories registered"。

## 子进程生命周期

| 场景 | 结果 |
|---|---|
| 关闭窗口后 main 进程向 server 发 SIGTERM | server 在 12 ms 内退出，exit code 0，无残留 |
| app 调用 `app.exit(0)`，不停止 server | server 继续运行：`ps` 显示 `7982 1 7868 bun …/repo-harness operator serve --port 0`，父进程是 launchd。spike 随后手动发 SIGTERM 停止了它 |

Electron 在最后一个窗口关闭时默认退出 app。壳要先停止 server 再退出，或者监听 `window-all-closed` 并等待 server 退出。app 崩溃时 server 会成为孤儿进程。server 没有监视父进程的代码。#1298 第 4 项的验收"关闭窗口后没有残留的 `operator serve` 进程"需要这一步来保证。

## 版本字段

| 位置 | 内容 |
|---|---|
| `src/effects/operator/server.ts:75` | `OPERATOR_SERVER_PROTOCOL = 1` |
| `src/effects/operator/server.ts:282-286` | `OperatorHealthResponseV1 { ok, service, protocol }` |
| `src/effects/operator/server.ts:1845-1851` | `GET /healthz` 返回上面的结构 |
| `src/core/operator/architecture.ts:56` | `package_version` 只出现在架构审查 prompt 的响应里，不是握手字段 |

`git log -S "OPERATOR_SERVER_PROTOCOL = "` 只有一个提交：`35ba75aa3 feat(operator): add local human control board`。之后加了写入路由（`server.ts:156`、`:173`、`:175`），`protocol` 仍然是 1。`/healthz` 没有包版本。CLI 的包版本只能从 `repo-harness --version`（输出 `0.25.0`）得到。

结论：`protocol` 字段存在，但没有升级规则，现在不能判断壳和 server 是否兼容。壳的握手需要 coordinator 选一个做法：给 `protocol` 定升级规则，或者在 `/healthz` 加包版本。本 spike 不改 server。

## 打包 .app 并从 Finder 启动

spike 没有用打包工具，直接复制 Electron 的预编译 app：

1. 在 spike 目录安装 Electron（命中本机 `~/Library/Caches/electron` 的缓存，不重新下载）：

   ```bash
   cd /tmp/repo-harness-desktop-spike
   npm_config_cache=/tmp/repo-harness-desktop-spike/.npm-cache npm install --no-audit --no-fund electron@41.3.0
   ```

2. 复制 app 包，把 `package.json`（`"main": "main.js"`）和 `main.js` 放进 `Contents/Resources/app`：

   ```bash
   ditto node_modules/electron/dist/Electron.app RepoHarnessSpike.app
   mkdir -p RepoHarnessSpike.app/Contents/Resources/app
   ditto package.json RepoHarnessSpike.app/Contents/Resources/app/package.json
   ditto main.js RepoHarnessSpike.app/Contents/Resources/app/main.js
   ```

3. 从 Finder 启动。在 Finder 里双击 `RepoHarnessSpike.app`，或者用 Apple Events 让 Finder 打开它：

   ```bash
   osascript -e 'tell application "Finder" to open (POSIX file "/tmp/repo-harness-desktop-spike/RepoHarnessSpike.app" as alias)'
   ```

4. 结果写在 `/tmp/repo-harness-desktop-spike/out/report.json`，截图在 `out/page.png`。

这个包的签名是 ad-hoc（`codesign -dv`：`Signature=adhoc`），只有 `com.apple.provenance` 属性，没有 quarantine 属性，所以 Gatekeeper 没有拦截。从网上下载的包会带 quarantine 属性，需要签名和公证（#1298 第 6 项）。Info.plist 里的名称和 bundle id 仍然是 Electron 默认值，正式壳要用打包工具改。

## 没有覆盖的部分

- 只测了这一台主机和 zsh。bash、fish、没有 `.zshrc` 的用户、Windows 都没有测。
- HOME 是空目录，registry 为空。Fleet 快照返回 200 但没有仓库。有真实仓库时的加载时间没有测。
- 按 spike 的边界，没有发任何合法的写入请求。#1298 验收里的"worktree 清理预览"留给壳的实现阶段。
- 没有测 Dock 启动和 `repo-harness://` deep link 启动。两者和 Finder 一样经过 LaunchServices，但没有实测。
