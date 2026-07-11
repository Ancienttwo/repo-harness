# DevSpace 如何让 ChatGPT 云端控制本地工作

## 结论

DevSpace 的关键并不是在本机再启动一个 Codex，而是把本机 coding primitives 直接注册成一个受 OAuth 保护的 Streamable HTTP MCP server：云端 ChatGPT 通过公开 HTTPS Tunnel 调用 `/mcp`，本机进程再以当前用户权限访问 workspace、修改文件和启动 shell。由此，本地 Codex quota 不参与这条链路。

这个架构可以证明「ChatGPT 云端直控本地 coding loop」可行，但它的 trust model 比 repo-harness 本次目标更宽：DevSpace 以 allowed roots + Owner password 为主要边界，shell 继承本机环境并拥有当前用户权限；其默认 workspace 是 checkout，模型响应包含本机绝对路径，OAuth token 没有 profile/grant revision 绑定，patch 也没有 repo revision guard。repo-harness 应复用机制，不复用这些边界。

本研究基于 `Waishnav/devspace` 固定提交 [`6ccefbf6213c56056a98ff52d7bdb27c081d13b9`](https://github.com/Waishnav/devspace/tree/6ccefbf6213c56056a98ff52d7bdb27c081d13b9)，本地只读参考位于 ignored `_ref/devspace/`。它不是 vendored source、package dependency 或运行时依赖；实现不得 import、复制或调用 `_ref/devspace`。

## P1：架构图

```text
ChatGPT cloud
  -> public HTTPS origin
  -> user-managed Tunnel / reverse proxy
  -> loopback MCP server (127.0.0.1:7676)
  -> OAuth discovery + DCR + authorization-code/PKCE
  -> Bearer-authenticated Streamable HTTP /mcp session
  -> open_workspace
  -> read / apply_patch / exec_command / write_stdin
  -> local filesystem, Git worktree, shell/PTY
```

关键 ownership 分层：

- Tunnel 只负责把公开 HTTPS origin 转发到 loopback upstream；DevSpace 不创建、托管或轮换 Tunnel。setup 文档明确区分 local MCP URL、Tunnel upstream、public origin 与 client `/mcp` endpoint（`_ref/devspace/docs/setup.md:46-75`）。
- `src/server.ts` 通过 MCP SDK 建立 OAuth router、Bearer middleware 和 Streamable HTTP transport，并为每个 MCP initialize 创建 transport session（`_ref/devspace/src/server.ts:1589-1609,1641-1650,1671-1749`）。
- `src/workspaces.ts` 和 `src/git-worktrees.ts` 管 workspace allowlist、checkout/worktree、instruction discovery 与持久 session metadata（`_ref/devspace/src/workspaces.ts:76-231`; `_ref/devspace/src/git-worktrees.ts:36-90`）。
- `src/apply-patch.ts` 负责 Codex-style patch parsing、path confinement、内存 staging 和逐文件 replacement（`_ref/devspace/src/apply-patch.ts:52-161,193-221,343-440`）。
- `src/process-sessions.ts` 负责 pipe/PTY、poll/input/resize/Ctrl-C、output ring 和 process-tree cleanup（`_ref/devspace/src/process-sessions.ts:214-433`; `_ref/devspace/src/process-platform.ts:59-77`）。

## P2：一条真实调用路径

1. 用户让 Tunnel 把 public origin 转发到 `http://127.0.0.1:7676`，ChatGPT Connector 保存 public `/mcp` URL。DevSpace 默认只监听 `127.0.0.1`，并从 public origin 派生 Host allowlist（`_ref/devspace/src/config.ts:202-239`; `_ref/devspace/docs/security.md:52-78`）。
2. ChatGPT 读取 OAuth discovery metadata、动态注册 redirect URI，并发起 authorization-code/PKCE。DevSpace 的 approval page要求 Owner password；redirect host 必须是注册时允许的 host（`_ref/devspace/src/oauth-provider.ts:51-108,130-180`; `_ref/devspace/src/oauth-store.ts:28-78`）。
3. OAuth provider 签发随机 access/refresh token。默认 access TTL 是 1 小时，refresh TTL 是 30 天；refresh exchange 原子消费旧 refresh token并返回新 token pair（`_ref/devspace/src/config.ts:10-11,168-187`; `_ref/devspace/src/oauth-provider.ts:210-235,274-315`; `_ref/devspace/src/oauth-store.ts:142-157`）。
4. `/mcp` 要求 Bearer token、目标 resource 与配置一致，并在 initialize 时创建 Streamable HTTP session（`_ref/devspace/src/server.ts:1598-1605,1671-1749`）。
5. ChatGPT 调用 `open_workspace`。DevSpace 验证 path 位于 allowed roots；checkout 直接打开源目录，worktree 则解析 Git root/base commit、记录 dirty source，并执行 detached `git worktree add`（`_ref/devspace/src/workspaces.ts:84-93,176-231`; `_ref/devspace/src/git-worktrees.ts:59-90,131-152`）。
6. `open_workspace` 返回 `workspaceId`、root instructions、nested instructions、skills，以及 workspace/worktree metadata。后续 file/process tool 都携带同一个 `workspaceId`（`_ref/devspace/src/server.ts:727-883`）。
7. `read` 调用 Pi coding primitive；`apply_patch` 调用本地 patch engine；`exec_command` 启动 shell/PTY，未在 yield window 内结束则返回 numeric session ID，后续由 `write_stdin` poll 或交互（`_ref/devspace/src/server.ts:532-673,886-980,1149-1221`）。

这条路径直接在 MCP server 进程内完成，不调用 `@openai/codex-sdk` 的 agent runtime。DevSpace 虽然另有 experimental subagent 功能和多种 agent SDK dependency，但 coding tool path 本身不经过 local agent adapter；repo-harness 的 `coding` profile也应保持这条直接路径。

## Tunnel 与 ChatGPT 配置启示

DevSpace 文档中的四个值容易混淆，但语义清楚：

| 值 | DevSpace 示例 | repo-harness 目标 |
| --- | --- | --- |
| Local origin | `http://127.0.0.1:7676` | `http://127.0.0.1:8765` |
| Tunnel upstream | local origin | local origin |
| Public origin | `https://host.example.com`，不带 `/mcp` | 从 setup 保存的 endpoint 派生 |
| Connector endpoint | `https://host.example.com/mcp` | 传给 ChatGPT App/Connector |

DevSpace 只要求「任意公开 HTTPS reverse proxy」，文档列出 Cloudflare Tunnel、ngrok、Pinggy 和 Tailscale Funnel，并明确不管理 provider（`_ref/devspace/docs/setup.md:6-15`）。repo-harness 应把 Cloudflare **named tunnel** 作为稳定主路径、quick tunnel 只作为 smoke，并保持「只生成 guide/doctor，不自动修改 Tunnel、DNS 或 ChatGPT App」的边界。

DevSpace 的 `doctor` 只检查本地 resolved config、runtime、Git/Bash、public URL、allowed hosts 与 SQLite native dependency（`_ref/devspace/docs/setup.md:112-121`）。repo-harness 的 `doctor --live` 需要更进一步，把 `config_ready -> local_ready -> tunnel_ready -> oauth_ready -> mcp_ready` 分层，并真实验证 public TLS/Host、OAuth discovery/DCR/PKCE/token、initialize 和精确 `tools/list` schema。

## OAuth 与公网边界差异

| 维度 | DevSpace pinned source | repo-harness coding 决策 |
| --- | --- | --- |
| Scope | 单一 supported scopes 列表，默认 `devspace`；HTTP middleware只要求第一项（`src/config.ts:168-187`; `src/server.ts:1600-1605`） | 独立 `repo-harness.coding` scope；planner token 不能调用 coding tools |
| Grant | allowed roots 是 server-wide config，无 repo-specific `read_only/read_write` authorization revision | 每个 repo 必须显式 `read_write` grant；降权或关闭 coding 递增 revision 并使旧 token失效 |
| TTL/rotation | 1h/30d，refresh rotation 已实现 | 保留 1h/30d 与 rotation，并额外绑定 current authorization revision |
| Redirect | DCR 时检查 configured redirect hosts；loopback 总是允许（`src/oauth-store.ts:28-78`） | 同时满足 registered URI 与 coding allowlist，默认只允许 `chatgpt.com` 和 loopback |
| Host | 从 local host + public origin 派生；可显式 `*`（`src/config.ts:60-78,202-224`） | coding 不允许 wildcard Host/CORS；server 仅 bind loopback |
| Approval | 显示 client/scope/resource 与 generic local-machine warning（`src/oauth-provider.ts:51-108`） | 明示「本机用户权限 shell」、授权 repo 与到期时间 |
| Tool hints | edit/patch 标 `destructiveHint`; shell 标 `destructiveHint + openWorldHint`（`src/server.ts:54-71`） | 保留这些 hints，旧 profiles schema 不变 |

DevSpace 只有 MCP App static assets 设置 wildcard CORS；`/mcp` 本身没有该 wildcard header（`_ref/devspace/src/server.ts:463-468,1652-1665`）。repo-harness coding 应明确禁止在 public MCP/OAuth surface 配置 wildcard，而不是把 asset CORS 与 API CORS 混为一谈。

## Workspace 与文件差异

1. **定位方式**：DevSpace 的 `open_workspace` 接受本机 absolute/tilde path，并在 response 的 `root`、`sourceRoot`、worktree path 中返回绝对路径（`_ref/devspace/src/server.ts:735-765,813-880`）。repo-harness 应只接受稳定 `repo_id`，对模型只返回 repo-relative/opaque metadata，绝不暴露本机 root。
2. **默认模式**：DevSpace 默认 `checkout`（`_ref/devspace/src/workspaces.ts:84-93`）；repo-harness coding 默认 `worktree`，checkout 必须显式选择。
3. **worktree 行为**：DevSpace 创建 detached、随机目录名 worktree，base 默认 `HEAD`，并报告 source checkout 是否 dirty；source 未提交变更不会被复制（`_ref/devspace/src/git-worktrees.ts:59-90,149-159`; `_ref/devspace/docs/chatgpt-coding-workflow.md:25-55`）。这些行为可复用，但 repo-harness 需要稳定 metadata、list/cleanup，并拒绝清理 dirty 或未合并 worktree。
4. **instructions**：DevSpace 自动加载 root `AGENTS.md`/`CLAUDE.md`，递归列出 nested files并跳过常见 build/cache dirs（`_ref/devspace/src/workspaces.ts:254-302,322-400`）。repo-harness 应保留这个可检查的 instruction flow。
5. **canonical containment**：DevSpace 通用 path guard使用 `path.resolve/relative`，没有统一 `realpath` canonicalization（`_ref/devspace/src/roots.ts:20-45`）；patch engine另外检查现有 target/nearest ancestor 的 realpath，能够阻止 patch symlink escape（`_ref/devspace/src/apply-patch.ts:188-221`）。repo-harness 需要把 canonical/symlink guard统一用于 read、patch 和 cwd。
6. **ignore/secret**：DevSpace 文档只承诺 grep/find遵守 ignore rules；direct read/patch没有 `.ignore` 或 secret deny policy，`pi-tools.ts` 只做 root containment（`_ref/devspace/src/pi-tools.ts:69-97`）。repo-harness read 应遵守 `.ignore` 与 secret deny，write 还要硬拒绝 `.git/**`、`.env*`、keys、`_ops/**`、`_ref/**`。
7. **patch consistency**：DevSpace 先 parse 并把所有 action staging 到内存，能在任何 hunk/路径预检失败时避免写入；每个文件通过 temporary + rename替换（`_ref/devspace/src/apply-patch.ts:343-405,431-440`）。但实际 commit 是逐文件 write 后逐文件 delete，第二个文件 I/O 失败时可能已经修改第一个文件，因此不是 whole-patch transaction；也没有 expected revision。repo-harness 需要 revision guard 和 all-actions atomicity，不能把 DevSpace 当前行为误称为跨文件原子提交。

## Process session 与 shell 差异

DevSpace 已验证的能力包括 pipe/PTY、最多 30 秒初始 yield、后台 session、poll、stdin、PTY resize、Ctrl-C、head/tail truncation 与 process-tree kill。PTY 使用 optional `node-pty`（`_ref/devspace/src/process-sessions.ts:4-13,225-290,325-385`; `_ref/devspace/package.json:74-76`）。

repo-harness 不应照搬以下边界：

- DevSpace 默认把整个 `process.env` 传入 child，并额外注入 workspace ID/root（`_ref/devspace/src/process-sessions.ts:90-109`）。repo-harness 只继承基础 OS keys，额外 env 需 ignored config allowlist，且永不传 MCP/Tunnel/OAuth/Codex/Claude secrets或本机绝对 root。
- DevSpace manager 没有每 workspace/authorization 并发上限，也没有 process 最大运行时长；默认 output buffer 是 1,000,000 characters，completed retention 是 5 分钟（`_ref/devspace/src/process-sessions.ts:4-13,214-223`）。repo-harness 固定每个 coding OAuth authorization 最多 4 个、最长 30 分钟、4 MiB ring、完成后保留 15 分钟。
- DevSpace process ownership 只检查 `workspaceId + numeric sessionId`，manager 又由全部 MCP transports共享；MCP session close 只移除 transport，只有整个 server close 才 shutdown processes（`_ref/devspace/src/process-sessions.ts:420-433`; `_ref/devspace/src/server.ts:1597-1609,1726-1734,1761-1772`）。repo-harness 的 live ChatGPT canary 证明 sequential tools 会使用不同 MCP transports，因此最终边界必须是独立 OAuth authorization grant：同一 grant 可跨 transport 继续 workspace/process，另一 grant 即使知道 id 也不能访问；DELETE/transport 过期只关闭 transport，revoke、authorization revision/grant 变化、coding disable、30 分钟 idle、process timeout或 server shutdown 才终止该 authorization 的 process trees。
- DevSpace 在非 Windows请求 PTY而 `node-pty` 缺失时明确抛错，但 Windows `tty=true` 会进入 pipe path（`_ref/devspace/src/process-sessions.ts:225-235,351-357`）。repo-harness 一律返回稳定 `PTY_UNAVAILABLE`，不得静默退化。
- DevSpace 默认 tool log 不记录 command，显式开启后会记录最多 120 字符的 raw command preview（`_ref/devspace/src/server.ts:284-303`; `_ref/devspace/src/logger.ts:75-78`）。repo-harness audit 只记录 command hash、relative cwd、actor/session、duration、exit/signal 和 byte counts，不记录 raw command/stdout/stderr。

需要明确继承 DevSpace 的核心 trust statement：file tools 的 root containment **不是 shell sandbox**；shell 是本机用户权限，命令可访问该用户能访问的主机资源（`_ref/devspace/docs/security.md:80-93`）。coding approval 与 setup docs 必须把这一点放在用户真正授权之前。

## P3：repo-harness 实现决策

最小可行改造是复用 repo-harness 已有 OAuth + Streamable HTTP sidecar、registered repo registry、general-repo path/ignore、revision/audit、CodeGraph refresh 和 worktree contract，新增独立且 default-off 的 `coding` profile及五个短名 tools。不要引入 DevSpace runtime、Pi coding agent、SQLite/Drizzle、React widgets或其 subagent体系。

具体 invariant：

- `planner`、`executor`、`orchestrator` 的 tool names/schema/permissions保持 byte-for-byte行为兼容；coding OAuth 和 grant 单独 fail closed。
- ChatGPT 输入使用 `repo_id + repo-relative path`，避免 DevSpace 的 absolute-path API 与泄漏面。
- workspace-first 但默认 managed worktree；checkout 只在显式请求时打开。
- 所有 mutation 在任何 side effect 前完成授权 revision、canonical path、deny rules、file revision 与全 patch预检；成功后进入现有 mutation/audit/CodeGraph event chain。
- arbitrary shell是明确授权的 local-user execution，不伪装成 filesystem sandbox；通过 env scrub、session ownership、limits、cleanup与 non-raw audit缩小 blast radius。
- named Cloudflare Tunnel是操作主路径，但产品代码不内建 provider automation；live canary在另获授权前必须保持 `live_canary_pending_authorization`。

## Source inventory

以下是本研究实际检查的 pinned source；GitHub 链接均固定到同一 commit：

- [README.md](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/README.md)
- [docs/setup.md](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/docs/setup.md)
- [docs/security.md](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/docs/security.md)
- [docs/configuration.md](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/docs/configuration.md)
- [docs/chatgpt-coding-workflow.md](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/docs/chatgpt-coding-workflow.md)
- [src/server.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/server.ts)
- [src/config.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/config.ts)
- [src/oauth-provider.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/oauth-provider.ts) 与 [src/oauth-store.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/oauth-store.ts)
- [src/workspaces.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/workspaces.ts)、[src/git-worktrees.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/git-worktrees.ts) 与 [src/workspace-store.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/workspace-store.ts)
- [src/apply-patch.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/apply-patch.ts)
- [src/process-sessions.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/process-sessions.ts) 与 [src/process-platform.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/process-platform.ts)
- [src/pi-tools.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/pi-tools.ts)、[src/logger.ts](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/src/logger.ts) 与 [package.json](https://github.com/Waishnav/devspace/blob/6ccefbf6213c56056a98ff52d7bdb27c081d13b9/package.json)
