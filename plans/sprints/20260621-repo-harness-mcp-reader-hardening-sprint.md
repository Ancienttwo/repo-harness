# Sprint Program: repo-harness MCP Reader 与传输层加固

## 0. Metadata

    id: sprint-repo-harness-mcp-reader-hardening
    status: draft
    baseline_release: 0.7.4
    hotfix_target: 0.7.5
    feature_rc_target: 0.8.0-rc.1
    feature_release_target: 0.8.0
    prd: plans/prds/20260621-repo-harness-mcp-reader-hardening-prd.md
    predecessor_sprint: plans/sprints/20260617-repo-harness-mcp-sprint.md
    target_branch: codex/mcp-reader-hardening
    primary_agent: codex
    secondary_agent: chatgpt-planner
    reviewer: unassigned
    risk_level: high
    planned_capacity: 17.5 engineering days
    delivery_model: 1 primary developer + 1 part-time reviewer
    last_updated: 2026-06-21

> 本文件按 repo-harness 当前 Sprint 结构编写，可直接保存为：
>
> `plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md`
>
> 它是现有 ChatGPT MCP Connector MVP Sprint 的后继 Sprint。不要修改旧 Sprint 的 non-goal 或把旧任务重新标记为未完成。

---

## 1. Sprint Goal

在不破坏现有 planner / executor / orchestrator 工作流的前提下，把 `repo-harness mcp` 固定为单一 ChatGPT Connector：默认 planner profile 通过 `workspaceReader` capability 读取全局 registry 中已 adopt/init 的 repo，并允许通过 `repo_path` 把 PRD/Sprint/Goal 写回目标 repo；额外 non-repo 本机目录仍必须显式 `--allow-root` 授权。同时修复当前 broad/full-disk 读取策略、OAuth refresh、HTTP MCP Session 生命周期和工具版本发现问题。

交付结果：

- `workspaceReader` capability，而不是单独 reader Connector/profile；
- `~/.repo-harness/registered-repos.json` 全局 repo registry；
- `allowedRoots` 仅作为额外 non-repo roots 配置；
- 会话级 workspace；
- `list_allowed_roots`；
- `open_workspace`；
- `tree`；
- `read_text`；
- `search_text`；
- 永久生效的 secrets deny globs；
- Config v2 与旧配置迁移；
- MCP Session TTL、上限和 DELETE；
- OAuth `offline_access` 与 token rotation；
- 真实 package version、扩展健康检查和诊断；
- ChatGPT Connector 重新扫描与 E2E 指南；
- 不改变现有 planner 工作流工具的语义。
- `write_prd`、`write_sprint`、`write_checklist_sprint`、`prepare_codex_goal_from_sprint`、`append_handoff_note`、`run_workflow_check` 支持 `repo_path`。

---

## 2. Why This Is a Successor Sprint

现有 Sprint 的目标是 workflow sidecar，并明确把通用本机文件读取列为 non-goal。当前改造扩大了产品边界，必须具备独立的：

- PRD；
- threat model；
- policy contract；
- migration contract；
- release notes；
- rollback plan。

旧 Sprint 只作为架构与兼容性基线，不作为本功能的范围授权。

---

## 3. Current Codebase Baseline

### 3.1 Existing MCP files

当前实现位于：

```text
src/cli/commands/mcp.ts
src/cli/mcp/audit.ts
src/cli/mcp/auth.ts
src/cli/mcp/instructions.ts
src/cli/mcp/oauth.ts
src/cli/mcp/paths.ts
src/cli/mcp/policy.ts
src/cli/mcp/redaction.ts
src/cli/mcp/repo.ts
src/cli/mcp/server.ts
src/cli/mcp/setup.ts
src/cli/mcp/tools.ts
src/cli/mcp/types.ts
src/cli/mcp/transports/http.ts
src/cli/mcp/transports/stdio.ts
```

当前主要测试：

```text
tests/cli/mcp-http.test.ts
tests/cli/mcp-policy.test.ts
tests/cli/mcp-setup.test.ts
tests/cli/mcp-tools.test.ts
tests/cli/mcp.test.ts
```

本 Sprint 新增：

```text
src/cli/mcp/workspaces.ts
src/cli/mcp/reader-tools.ts
src/cli/mcp/session-store.ts

tests/cli/mcp-workspaces.test.ts
tests/cli/mcp-reader-tools.test.ts
tests/cli/mcp-oauth.test.ts
```

### 3.2 Known baseline behavior

- `McpProfileName` 当前只有 `planner | executor | orchestrator`。
- `createMcpToolContext()` 当前围绕单一 `repoRoot` 创建上下文。
- `McpLocalConfig` 当前使用 `version: 1` 和 `permissions.fullDiskRead`。
- `fullDiskRead` 当前会把 `readGlobs` 扩大为 `["**"]`、允许绝对路径，并清空 `denyGlobs`。
- `tests/cli/mcp-policy.test.ts` 当前把 full-disk 模式读取 `.env` 视为成功；该测试必须先改为失败断言。
- `read_workflow_file` 当前整文件读取，超过 `maxFileBytes` 直接失败。
- MCP server metadata 当前硬编码为 `version: "0.1.0"`。
- HTTP transport 已有 `transport.onclose` 清理；本 Sprint 应保留它，并补 TTL、连接上限和 DELETE。
- HTTP transport 当前只有 GET/POST `/mcp`，没有 DELETE。
- OAuth discovery 当前只公布 `repo-harness` scope。
- refresh token 流程当前轮换 refresh token，但复用 access token。
- `src/cli/mcp/tools.ts` 当前是单一大型文件；本 Sprint 只抽取新的 reader 工具，不顺带重写所有既有工具。

---

## 4. Scope

### 4.1 In scope

- 安全 hotfix：任何 profile 下 secrets deny rules 永不被 broad read 清空。
- 将 reader 能力并入 planner `workspaceReader` capability，不新增 `reader` profile 或第二个 Connector。
- 用户明确配置的额外 non-repo allowed roots。
- 会话级 workspace ID，后续工具仅接受 workspace-relative path。
- 目录树、文本搜索、分段读取。
- planner/executor/orchestrator 向后兼容。
- HTTP MCP Session 生命周期加固。
- OAuth refresh 兼容。
- setup、doctor、文档和 E2E。
- macOS、Linux、Windows 路径安全测试。

### 4.2 Out of scope

- 不增加通用写文件工具。
- 不允许 workspace reader tools 调用 shell、Git mutation、Codex runner 或浏览器自动化。
- 不默认授权 `/`、用户 home 或整个磁盘。
- 不跟随目录遍历中的 symlink。
- 不在首版提供 regex 搜索，避免 ReDoS 和额外复杂度。
- 不解析 PDF、Office、图片或二进制格式；首版只提供 UTF-8/可判定文本。
- 不重构所有 `tools.ts` 既有 workflow tool。
- 不引入外部 `ripgrep` 运行时依赖。
- 不把 query-string token 作为默认生产鉴权。
- 不修改旧 MCP Sprint 的历史状态。

---

## 5. Architecture Decisions

### AD-01: Reader is a planner capability, not a separate Connector/profile

```ts
export type McpProfileName =
  | 'planner'
  | 'executor'
  | 'orchestrator';
```

标准用户只配置一个 `https://.../mcp` Connector。`planner` 通过 `McpPolicy.capabilities.workspaceReader` 注册 `reader_status`、`list_allowed_roots`、`open_workspace`、`tree`、`read_text`、`search_text`；`executor` 和 `orchestrator` 仍按显式 profile 控制高风险能力。旧命令未指定 profile 时仍默认 `planner`，`reader` 字符串只作为旧本地配置兼容输入映射到 `planner`。

### AD-02: Registered repos first; allowed roots are only extra non-repo roots

Config v2 建议形状：

```ts
interface McpLocalConfigV2 {
  version: 2;
  scope: 'repo' | 'user';
  repo?: string;
  server: {
    host: string;
    port: number;
    endpoint?: string;
    name?: string;
  };
  auth?: {
    mode?: 'oauth' | 'bearer';
  };
  chatgpt?: Record<string, unknown>;
  capabilities?: {
    workspaceReader?: boolean;
    workflowPlanner?: boolean;
    workflowExecutor?: boolean;
    agentRunner?: boolean;
  };
  permissions: {
    allowedRoots: string[];
    discoveryRoots?: string[];
    legacyFullDiskReadDetected?: boolean;
  };
  profile: McpProfileName;
  devMode?: {
    agentRunner?: boolean;
    allowedAgents?: McpAgentRunnerName[];
    timeoutMs?: number;
  };
}
```

全局 repo registry 形状：

```json
{
  "version": 1,
  "repos": [
    {
      "id": "repo_<stable-hash>",
      "path": "/Users/me/Projects/app",
      "source": "adopt",
      "registeredAt": "2026-06-21T00:00:00.000Z",
      "lastSeenAt": "2026-06-21T00:00:00.000Z"
    }
  ]
}
```

迁移规则：

- `repo-harness adopt` / `repo-harness init` 成功后将目标 repo 记录到 `~/.repo-harness/registered-repos.json`。
- `repo-harness mcp setup chatgpt --scope user --repo <adopted-repo>` 会补登记当前 repo，便于老项目迁移。
- MCP 启动时读取 registry，并只暴露仍然具备 live adoption marker 的 repo；stale entries 被忽略。
- `permissions.allowedRoots` 不再承载标准 repo 列表，只表示用户额外授权的 non-repo 本机目录。
- 旧 `fullDiskRead: false`：迁移为 v2，不扩大权限。
- 旧 `fullDiskRead: true`：**不得自动迁移为 `/`**；启动和 doctor 返回可操作错误，要求重新执行 setup 并显式选择 roots。
- 写回配置时只写 v2。
- 读取 v1 时打印一次 deprecation warning。
- roots 在写入前做 absolute resolve、realpath、去重；不存在或不可读的 root 拒绝写入。

### AD-03: Workspace IDs are session-local capabilities

`open_workspace` 只能打开 configured allowed root 本身或其子目录。

后续工具只接受：

```json
{
  "workspace_id": "ws_xxx",
  "path": "docs/design.md"
}
```

不接受绝对路径。Workspace map 不跨 MCP Session 共享。

### AD-04: Deny rules always win

判定顺序：

```text
输入校验
→ workspace lookup
→ relative-path normalize
→ lexical containment
→ deny glob
→ lstat/realpath
→ physical containment
→ file-type/size limits
→ read
→ redaction
```

`COMMON_DENY_GLOBS` 在 reader、planner、executor、orchestrator 和任何兼容 broad-read 模式下始终生效。

### AD-05: Directory walkers do not follow symlinks

- `tree` 和 `search_text` 遇到 symlink：返回/记录为 symlink，但不递归。
- `read_text` 读取 symlink 文件时：只有 real target 仍位于 workspace root 且不命中 deny rule 才允许。
- Windows junction 按目录 symlink 等价处理。

### AD-06: Single Connector capability surface

默认 `planner` Connector 的 `tools/list` 同时包含 workflow planning/writer 工具和 workspace reader 工具。Connector 注册 endpoint，不注册单个 repo；MCP 从全局 registry 发现 adopted repos，ChatGPT 先调用 `discover_harness_repos`，再把目标 repo 通过 `repo_path` 传给 workflow read/write tools。

```text
discover_harness_repos
read_workflow_file
write_prd
write_checklist_sprint
prepare_codex_goal_from_sprint
append_handoff_note
run_workflow_check
reader_status
list_allowed_roots
open_workspace
tree
read_text
search_text
```

默认不得包含：

```text
run_agent_goal
run_chatgpt_browser_consult
open_chatgpt_browser_session
```

### AD-07: Flat new modules, no ambiguous tools directory

因为已有 `src/cli/mcp/tools.ts`，本 Sprint 使用：

```text
src/cli/mcp/reader-tools.ts
```

不要同时新建 `src/cli/mcp/tools/index.ts`，避免模块解析和大规模重构混在同一发布。

---

## 6. Proposed Tool Contracts

### 6.1 `reader_status`

输入：

```json
{}
```

输出至少包含：

```json
{
  "profile": "planner",
  "capability": "workspaceReader",
  "read_only": true,
  "configured_root_count": 2,
  "open_workspace_count": 1,
  "limits": {
    "max_workspaces": 16,
    "max_tree_depth": 6,
    "max_tree_entries": 1000,
    "max_search_files": 2000,
    "max_search_results": 100,
    "search_timeout_ms": 5000,
    "max_response_bytes": 262144
  }
}
```

不得返回 token、完整 OAuth 数据或未脱敏的 home path。

### 6.2 `list_allowed_roots`

输入：

```json
{}
```

输出：

```json
{
  "roots": [
    {
      "root_id": "root_...",
      "display_name": "Documents",
      "path": "/Users/example/Documents",
      "readable": true
    }
  ]
}
```

注意：是否向模型返回完整绝对路径应由配置控制。默认可返回 display name 和 root ID；调试模式才返回 path。

### 6.3 `open_workspace`

输入：

```json
{
  "root_id": "root_...",
  "path": "project-a"
}
```

输出：

```json
{
  "workspace_id": "ws_...",
  "display_name": "project-a",
  "capability": "read-only"
}
```

限制：

- `path` 默认为 `"."`。
- path 必须位于 root 内。
- 最多 16 个 workspace/session。
- 重复打开同一 canonical path 返回同一 workspace ID 或幂等结果。

### 6.4 `tree`

输入：

```json
{
  "workspace_id": "ws_...",
  "path": ".",
  "max_depth": 3,
  "max_entries": 300,
  "include_hidden": false
}
```

输出：

```json
{
  "entries": [
    {
      "path": "docs",
      "type": "directory"
    },
    {
      "path": "docs/design.md",
      "type": "file",
      "size": 8421
    }
  ],
  "truncated": false,
  "blocked_entries": 4,
  "symlink_entries": 1
}
```

### 6.5 `read_text`

输入：

```json
{
  "workspace_id": "ws_...",
  "path": "docs/design.md",
  "start_line": 1,
  "end_line": 200,
  "max_bytes": 65536
}
```

输出：

```json
{
  "path": "docs/design.md",
  "text": "1: ...\n2: ...",
  "start_line": 1,
  "end_line": 200,
  "bytes_returned": 14320,
  "has_more": true,
  "next_start_line": 201,
  "content_sha256": "...",
  "redactions": [],
  "truncated": false
}
```

实现约束：

- 使用流式逐行读取，不把整个大文件一次读入内存。
- `end_line - start_line` 和 `max_bytes` 均有硬上限。
- 对非 UTF-8/疑似二进制返回结构化错误。
- `content_sha256` 只针对返回片段，避免为小片段请求扫描完整超大文件。
- 当未扫描到 EOF 时，不承诺准确 `total_lines`。

### 6.6 `search_text`

输入：

```json
{
  "workspace_id": "ws_...",
  "query": "authentication",
  "path": ".",
  "glob": "**/*.md",
  "case_sensitive": false,
  "max_results": 50,
  "max_files": 1000,
  "timeout_ms": 5000
}
```

输出：

```json
{
  "matches": [
    {
      "path": "docs/design.md",
      "line": 41,
      "column": 8,
      "snippet": "..."
    }
  ],
  "files_scanned": 123,
  "files_skipped": 17,
  "blocked_files": 4,
  "truncated": false,
  "timed_out": false
}
```

实现约束：

- 首版 literal search；不提供任意 regex。
- 复用 existing glob helper。
- walker 不跟随 symlink。
- 每次循环检查 deadline。
- 每文件读取上限、总文件数、总结果数和总响应字节均有限制。
- snippet 继续走现有 redaction。

---

## 7. Release Train

| Iteration | Target | Scope | Exit gate |
|---|---|---|---|
| Sprint A | `0.7.5` | 安全 hotfix；full-disk 不再清空 deny rules | policy/tools/setup 测试通过，`.env` 在所有 profile 下拒绝 |
| Sprint B | `0.8.0-rc.1` | single Connector workspaceReader capability、Config v2、workspace、reader tools | STDIO/HTTP reader 基础 E2E 通过；planner workflow 回归通过 |
| Sprint C | `0.8.0` | Session、OAuth、setup/doctor/docs、ChatGPT E2E | refresh/reconnect、DELETE/TTL、工具重扫和完整 CI 通过 |

推荐日历：

| Engineering day | Focus |
|---|---|
| D1 | RH-MCP-001、RH-MCP-002 |
| D2 | RH-MCP-003、0.7.5 release checks |
| D3 | RH-MCP-101 |
| D4-D5 | RH-MCP-102 |
| D6-D7 | RH-MCP-103 |
| D8 | RH-MCP-104 |
| D9 | RH-MCP-105 |
| D10 | RH-MCP-106 |
| D11-D12 | RH-MCP-107 |
| D13 | RH-MCP-108、RC checks |
| D14-D15 | RH-MCP-201 |
| D16-D17 | RH-MCP-202 |
| D18 | RH-MCP-203、RH-MCP-204 |
| D19-D20 | RH-MCP-205、release checks |

该日历按串行主开发估算；两个开发者可将 reader tools 与 transport/OAuth 在 workspace contract 冻结后并行。

---

## 8. Dependency Graph

```text
RH-MCP-001
  └─ RH-MCP-002
       └─ RH-MCP-003
            ├─ RH-MCP-101
            │    └─ RH-MCP-102
            │         └─ RH-MCP-103
            │              ├─ RH-MCP-104
            │              │    ├─ RH-MCP-105
            │              │    ├─ RH-MCP-106
            │              │    └─ RH-MCP-107
            │              └─ RH-MCP-108
            └─ RH-MCP-201
                 ├─ RH-MCP-202
                 └─ RH-MCP-203
RH-MCP-105/106/107 + RH-MCP-201/202/203
  └─ RH-MCP-204
       └─ RH-MCP-205
```

Critical path：

```text
001 → 002 → 101 → 102 → 103 → 104 → 107 → 204 → 205
```

---

# 9. Tracker Dashboard

| ID | Task | Priority | Estimate | Depends on | Status | Owner | PR |
|---|---|---:|---:|---|---|---|---|
| RH-MCP-001 | Freeze security contract and failing tests | P0 | 0.5d | — | done | codex | — |
| RH-MCP-002 | Fix broad/full-disk deny behavior | P0 | 1.0d | 001 | done | codex | — |
| RH-MCP-003 | Hotfix verification and 0.7.5 release | P0 | 0.5d | 002 | todo | unassigned | — |
| RH-MCP-101 | Add workspaceReader capability and instructions | P0 | 0.5d | 003 | done | codex | — |
| RH-MCP-102 | Config v2, migration, CLI allowed roots | P0 | 1.5d | 101 | done | codex | — |
| RH-MCP-103 | WorkspaceManager and path containment | P0 | 2.0d | 102 | done | codex | — |
| RH-MCP-104 | Reader registry and root/workspace tools | P0 | 1.0d | 103 | done | codex | — |
| RH-MCP-105 | Implement bounded tree | P0 | 1.0d | 104 | done | codex | — |
| RH-MCP-106 | Implement chunked read_text | P0 | 1.0d | 104 | done | codex | — |
| RH-MCP-107 | Implement bounded search_text | P0 | 1.5d | 104 | done | codex | — |
| RH-MCP-108 | Preserve workflow tool compatibility | P1 | 0.5d | 103 | done | codex | — |
| RH-MCP-201 | SessionStore and HTTP lifecycle | P0 | 1.5d | 003 | done | codex | — |
| RH-MCP-202 | OAuth offline access and rotation | P0 | 2.0d | 201 | done | codex | — |
| RH-MCP-203 | Bearer, version, health hardening | P1 | 0.5d | 201 | done | codex | — |
| RH-MCP-204 | Setup, doctor and docs | P0 | 1.0d | 105-107, 202-203 | done | codex | — |
| RH-MCP-205 | Cross-platform E2E and 0.8.0 release | P0 | 1.5d | 204 | todo | unassigned | — |

Status vocabulary：

```text
todo
in_progress
blocked
in_review
done
deferred
```

---

# 10. Agent Task Cards

## Task Card RH-MCP-001: Freeze Security Contract and Add Failing Tests

    id: RH-MCP-001
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 0.5d
    release: 0.7.5
    branch: fix/mcp-full-disk-security-contract

### Files

Modify:

```text
tests/cli/mcp-policy.test.ts
tests/cli/mcp-tools.test.ts
tests/cli/mcp-setup.test.ts
plans/prds/20260621-repo-harness-mcp-reader-hardening-prd.md
plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md
```

### Checklist

- [ ] 在 PRD 中声明 deny rules 在所有 profile 和 broad-read 模式下不可关闭。
- [ ] 将 `mcp-policy.test.ts` 中 full-disk 可读取 `.env` 的断言改为拒绝。
- [ ] 增加 `.env.local` 拒绝测试。
- [ ] 增加 `private.pem` 拒绝测试。
- [ ] 增加 `id_rsa`/`.ssh/**` 拒绝测试。
- [ ] 增加 `credentials/**`、`secrets/**` 拒绝测试。
- [ ] 保留一个 ordinary source file 在 broad-read 下可读的正向测试。
- [ ] 在 `mcp-tools.test.ts` 增加工具层 `.env` 被阻止的失败测试。
- [ ] 在 `mcp-setup.test.ts` 标记 `--allow-full-disk-read` 为 legacy/deprecated 行为。
- [ ] 先提交 failing tests，确认失败原因正是当前 `denyGlobs: []`。
- [ ] 记录失败测试输出到 review evidence。

### Done when

- [ ] 旧实现下新增安全测试稳定失败。
- [ ] 测试没有依赖真实 home、真实 secret 或平台私有路径。
- [ ] 正向 source read case 仍可区分“安全 deny”与“完全禁用 broad read”。

### Verification

```bash
bun test tests/cli/mcp-policy.test.ts
bun test tests/cli/mcp-tools.test.ts
bun test tests/cli/mcp-setup.test.ts
```

### Rollback

测试变更不单独回滚；若产品决定彻底删除 legacy broad read，则保留拒绝测试并调整正向测试到 planner workspaceReader capability。

---

## Task Card RH-MCP-002: Fix Broad/Full-Disk Deny Behavior

    id: RH-MCP-002
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.0d
    depends_on: RH-MCP-001
    release: 0.7.5
    branch: fix/mcp-full-disk-security-contract

### Files

Modify:

```text
src/cli/mcp/policy.ts
src/cli/mcp/paths.ts
tests/cli/mcp-policy.test.ts
tests/cli/mcp-tools.test.ts
```

### Checklist

- [ ] 保留 `COMMON_DENY_GLOBS` 为单一常量来源。
- [ ] 删除所有 `fullDiskRead ? [] : COMMON_DENY_GLOBS` 类逻辑。
- [ ] broad/full-disk 只影响 `readGlobs` 和 legacy absolute-read compatibility。
- [ ] deny matcher 的优先级高于 read allow matcher。
- [ ] lexical relative path 和 canonical real path 均执行 deny 检查。
- [ ] symlink 指向 `.ssh`、`.env` 或 root 外时拒绝。
- [ ] planner write globs 不因 broad read 扩大。
- [ ] executor/orchestrator 不因 broad read 获得额外 write 权限。
- [ ] error code 使用稳定的结构化值，例如 `PATH_DENIED`。
- [ ] audit log 记录 blocked，不记录 secret 内容。
- [ ] 更新注释，明确 full disk 不是 deny bypass。

### Done when

- [ ] `.env`、key、credentials、secrets 在所有 profile 下拒绝。
- [ ] ordinary source/document file 在 legacy broad read 下仍可读。
- [ ] traversal 和 symlink 既有测试继续通过。
- [ ] 无配置迁移或工具 schema 变化，适合 patch release。

### Verification

```bash
bun test tests/cli/mcp-policy.test.ts
bun test tests/cli/mcp-tools.test.ts
bun run check:type
bun run check:ci
```

### Rollback

如 patch 出现兼容问题，只允许回滚 ordinary-file broad read；不得回滚 secrets deny invariant。

---

## Task Card RH-MCP-003: Hotfix Verification and 0.7.5 Release

    id: RH-MCP-003
    priority: P0
    status: todo
    owner: unassigned
    reviewer: unassigned
    estimate: 0.5d
    depends_on: RH-MCP-002
    release: 0.7.5
    branch: release/0.7.5-mcp-policy-hotfix

### Files

Modify as needed:

```text
README.md
CHANGELOG.md or existing release-note surface
package.json
plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md
.ai/harness/handoff/
```

### Checklist

- [ ] 确认仓库实际使用的 changelog/release-note surface。
- [ ] 记录安全行为变化，但不公开可利用 secret 路径细节。
- [ ] 更新 package version 到 `0.7.5`。
- [ ] 运行完整 CI。
- [ ] 运行 npm package/release checks。
- [ ] 检查 tarball 中不包含本机 config/token/audit log。
- [ ] 更新 Sprint dashboard。
- [ ] 写 handoff，附命令和结果。
- [ ] tag/release 前由 reviewer 审核 policy diff。

### Done when

- [ ] `0.7.5` 只包含安全修复和必要测试/文档。
- [ ] 未混入 workspaceReader capability 或 OAuth 大改。
- [ ] release artifact 通过 package smoke test。

### Verification

```bash
bun run check:ci
bun run check:release
bun run smoke:tarball-install
```

---

## Task Card RH-MCP-101: Add WorkspaceReader Capability and Single-Connector Instructions

    id: RH-MCP-101
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 0.5d
    depends_on: RH-MCP-003
    release: 0.8.0-rc.1
    branch: codex/mcp-reader-hardening

### Files

Modify:

```text
src/cli/mcp/types.ts
src/cli/mcp/policy.ts
src/cli/mcp/instructions.ts
src/cli/mcp/server.ts
src/cli/commands/mcp.ts
tests/cli/mcp.test.ts
tests/cli/mcp-policy.test.ts
```

### Checklist

- [x] `McpProfileName` 保持 `planner|executor|orchestrator`，不新增单独 `reader` profile。
- [x] 旧配置中的 `reader` 字符串兼容映射到 `planner`。
- [x] `mcp serve --profile` help 更新为 `planner|executor|orchestrator`。
- [x] 新增 `McpPolicy.capabilities.workspaceReader`。
- [x] planner policy 可同时注册 workflow tools 和 workspace reader tools。
- [x] workspace reader 永久保留 `COMMON_DENY_GLOBS`。
- [x] workspace reader 不允许绝对 child path。
- [x] runner/browser tools 仍需显式高风险开关。
- [x] 将常量 instructions 改为 `buildMcpServerInstructions({ readerEnabled })`。
- [x] workspace reader instructions 明确“只读、先 open workspace、不得请求 secrets”。
- [x] planner 默认 profile 保持不变，并通过 registry/current adopted repo 暴露 reader roots。
- [x] 为 profile parser、policy、CLI help 加测试。

### Done when

- [x] `repo-harness mcp serve --profile planner` 能创建带 workspaceReader 的 context。
- [x] workspace reader 未启用时 reader tools 不注册；启用后不泄漏 run/browser tools。
- [x] 未指定 profile 的现有命令仍为 planner。

### Verification

```bash
bun test tests/cli/mcp.test.ts
bun test tests/cli/mcp-policy.test.ts
bun run check:type
```

---

## Task Card RH-MCP-102: Config v2, Global Repo Registry and Allowed-Root CLI

    id: RH-MCP-102
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.5d
    depends_on: RH-MCP-101
    release: 0.8.0-rc.1
    branch: codex/mcp-reader-hardening

### Files

Modify:

```text
src/cli/mcp/auth.ts
src/cli/mcp/setup.ts
src/cli/mcp/server.ts
src/cli/commands/mcp.ts
src/effects/repo-registry.ts
tests/cli/mcp-setup.test.ts
tests/cli/mcp.test.ts
tests/cli/mcp-tools.test.ts
tests/cli/init.test.ts
tests/cli/adoption-plan.test.ts
```

### Checklist

- [x] 为 config v1/v2 建立显式 TypeScript 类型。
- [x] 实现 `parseMcpLocalConfig()` 类型守卫。
- [x] 未知 config version 返回结构化错误。
- [x] v2 增加 `capabilities.workspaceReader`。
- [x] v2 增加 `permissions.allowedRoots` 和 `permissions.discoveryRoots`。
- [x] `--allow-root <path>` 支持重复传入。
- [x] Commander collector 保留传入顺序；server/setup canonicalize 后去重。
- [x] setup 默认 profile 仍为 planner。
- [x] `repo-harness adopt` / `repo-harness init` 成功后登记 repo。
- [x] user-scope MCP setup 对 adopted repo 补登记 registry。
- [x] reader + user scope 未指定 root 时仍可通过 registered adopted repos 工作。
- [x] random external root 必须显式 `--allow-root`。
- [x] root 必须存在、可读且为目录。
- [x] root 保存前 canonicalize/realpath。
- [x] overlap roots 去重；保留显式授权根，不自动扩到父目录。
- [x] v1 `fullDiskRead:false` 可自动迁移。
- [x] v1 `fullDiskRead:true` fail closed，并提示重新选择 roots。
- [x] `--allow-full-disk-read` 标记 deprecated。
- [x] deprecated flag 不再清空 deny，不再隐式选择 `/`。
- [x] 本地 config 继续进入 gitignore。
- [x] tests 覆盖 repo/user scope、registered repo discovery、`repo_path` writer、legacy migration。

### Done when

- [x] 新 setup 生成 `version: 2`。
- [x] 旧安全配置仍能启动。
- [x] 旧危险配置不会在无交互情况下扩大授权。
- [x] CLI 输出不泄漏 token。
- [x] planner setup 现有 snapshot/行为仅有预期差异。

### Verification

```bash
bun test tests/cli/mcp-setup.test.ts
bun test tests/cli/mcp.test.ts
bun run check:type
```

### Rollback

保留 v1 reader；若 v2 写入出现兼容问题，可临时只读 v2、继续写 v1，但不得恢复 full-disk 自动授权。

---

## Task Card RH-MCP-103: WorkspaceManager and Path Containment

    id: RH-MCP-103
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 2.0d
    depends_on: RH-MCP-102
    release: 0.8.0-rc.1
    branch: feat/mcp-workspaces

### Files

Create:

```text
src/cli/mcp/workspaces.ts
tests/cli/mcp-workspaces.test.ts
```

Modify:

```text
src/cli/mcp/paths.ts
src/cli/mcp/server.ts
src/cli/mcp/tools.ts
src/cli/mcp/types.ts
```

### Proposed types

```ts
interface McpAllowedRoot {
  id: string;
  canonicalPath: string;
  displayName: string;
}

interface McpWorkspace {
  id: string;
  rootId: string;
  canonicalPath: string;
  displayName: string;
  openedAt: number;
  lastUsedAt: number;
}

interface WorkspaceManagerOptions {
  allowedRoots: string[];
  maxWorkspaces: number;
}
```

### Checklist

- [x] 新增 `WorkspaceManager`。
- [x] manager 由 `createMcpToolContext()` 创建。
- [x] HTTP 每个 MCP server/session 拥有独立 manager。
- [x] STDIO server 拥有单一 manager。
- [x] allowed roots 在 manager 初始化时 realpath。
- [x] root ID 使用不可逆 hash/随机稳定 ID，不直接使用绝对路径。
- [x] workspace ID 使用 `randomUUID()` 或等价随机 ID。
- [x] `openWorkspace(rootId, relativeSubpath)` 实现幂等。
- [x] 最多 16 个 workspace/session。
- [x] workspace 不允许跨 configured root。
- [x] relative path 用 `path.relative()` 判定 containment。
- [x] 同时拒绝 POSIX 和 Windows traversal。
- [x] drive-letter/UNC 不同根拒绝。
- [x] workspace root 自身变为 symlink/消失时失效。
- [x] 读取前重新验证 workspace canonical root。
- [x] 目录 walker 默认不跟随 symlink/junction。
- [x] file symlink 仅在 real target 仍在 root 内时可读。
- [x] deny 检查同时作用于 logical relative path 和 canonical target relative path。
- [x] 加入 workspace-not-found、root-not-found、outside-root、path-denied 错误码。
- [x] error payload 不暴露不必要的外部绝对路径。
- [x] unit tests 使用临时目录和真实 symlink；Windows 无权限时明确 skip。
- [x] 保留既有 `resolveMcpPath()` 给 workflow profiles 使用，避免一次性重写。
- [x] 为 reader 新增 workspace-aware resolver，而非强迫旧工具迁移。

### Required test matrix

- [x] root itself opens。
- [x] root child directory opens。
- [x] sibling directory denied。
- [x] `../` denied。
- [x] backslash traversal denied。
- [x] absolute child path denied by reader tool contract。
- [x] symlink file inside → outside denied。
- [x] symlink file inside → inside allowed。
- [x] symlink directory not traversed。
- [x] denied filename through symlink denied。
- [x] overlapping roots behave deterministically。
- [x] removed root invalidates workspace。
- [x] workspace limit enforced。
- [x] workspace IDs are session-local。

### Done when

- [x] 所有 reader 工具只能通过 workspace manager 解析路径。
- [x] 没有 reader tool 直接拼接用户 path 与 filesystem path。
- [x] 旧 workflow resolver 测试不回归。

### Verification

```bash
bun test tests/cli/mcp-workspaces.test.ts
bun test tests/cli/mcp-policy.test.ts
bun run check:type
```

---

## Task Card RH-MCP-104: Reader Registry and Root/Workspace Tools

    id: RH-MCP-104
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.0d
    depends_on: RH-MCP-103
    release: 0.8.0-rc.1
    branch: feat/mcp-reader-tools

### Files

Create:

```text
src/cli/mcp/reader-tools.ts
tests/cli/mcp-reader-tools.test.ts
```

Modify:

```text
src/cli/mcp/tools.ts
src/cli/mcp/server.ts
```

### Checklist

- [x] `reader-tools.ts` 暴露 definition builder 和 dispatcher。
- [x] `buildMcpToolDefinitions()` 按 profile 选择工具表面。
- [x] `callMcpTool()` 按 profile 拒绝未注册工具。
- [x] 实现 `reader_status`。
- [x] 实现 `list_allowed_roots`。
- [x] 实现 `open_workspace`。
- [x] reader tool definitions 加 annotations：
  - [x] `readOnlyHint: true`
  - [x] `destructiveHint: false`
  - [x] `idempotentHint: true`
  - [x] `openWorldHint: false`
- [x] schemas 使用 explicit required fields 和 bounded numbers。
- [x] 拒绝未知字段或至少不让未知字段改变权限。
- [x] planner 的 tools/list 同时包含 workflow writers 和 reader tools，但不含 run/browser tools。
- [x] executor/orchestrator 工具列表保持原顺序和名称。
- [x] structured error 继续通过 MCP content 返回，并统一 `isError` 行为。
- [x] tool calls 继续写 audit，但 root/path 做脱敏。

### Done when

- [x] reader tool subset 只有六个预期只读工具；planner tools/list 仍包含 workflow planning/writer tools。
- [x] `open_workspace` 后可返回有效 workspace ID。
- [x] 使用其他 Session 的 workspace ID 失败。
- [x] 调用 writer tool 返回 `TOOL_NOT_AVAILABLE_FOR_PROFILE`。

### Verification

```bash
bun test tests/cli/mcp-reader-tools.test.ts
bun test tests/cli/mcp-tools.test.ts
bun run check:type
```

---

## Task Card RH-MCP-105: Implement Bounded `tree`

    id: RH-MCP-105
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.0d
    depends_on: RH-MCP-104
    release: 0.8.0-rc.1
    branch: feat/mcp-reader-tools

### Files

Modify:

```text
src/cli/mcp/reader-tools.ts
tests/cli/mcp-reader-tools.test.ts
```

### Checklist

- [x] 使用 `fs.opendir()` 或等价异步 iterator。
- [x] 默认 `max_depth=3`。
- [x] hard max depth = 6。
- [x] 默认 `max_entries=300`。
- [x] hard max entries = 1000。
- [x] 默认 `include_hidden=false`。
- [x] hidden flag 不覆盖 deny rules。
- [x] 每个 entry 使用 workspace-relative normalized path。
- [x] 返回 file/directory/symlink/other。
- [x] 不递归 symlink/junction。
- [x] denied entries 不返回名称；只增加 blocked count。
- [x] 排序确定性：按 normalized path locale-independent 排序。
- [x] 达到 limit 设置 `truncated=true`。
- [x] 单 entry stat 失败时跳过并统计，不让整个 tree 崩溃。
- [x] root 不存在或失效时返回 workspace error。
- [x] 响应总字节数有硬上限。

### Done when

- [x] 大目录不会产生无界响应。
- [x] secrets path 不出现在 entries。
- [x] tree 结果跨重复调用稳定。
- [x] symlink loop 不会挂死。

### Verification

```bash
bun test tests/cli/mcp-reader-tools.test.ts --test-name-pattern tree
```

---

## Task Card RH-MCP-106: Implement Chunked `read_text`

    id: RH-MCP-106
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.0d
    depends_on: RH-MCP-104
    release: 0.8.0-rc.1
    branch: feat/mcp-reader-tools

### Files

Modify:

```text
src/cli/mcp/reader-tools.ts
src/cli/mcp/redaction.ts
tests/cli/mcp-reader-tools.test.ts
```

### Checklist

- [x] 输入 path 必须是 workspace-relative。
- [x] `start_line` 默认 1，最小 1。
- [x] `end_line` 可选，必须 >= start。
- [x] 每次最多返回 2000 行。
- [x] 默认 `max_bytes=65536`。
- [x] hard max `max_bytes=262144`。
- [x] 使用 stream/readline，不整文件 `readFile()`。
- [x] 读取达到 end line 后停止。
- [x] 读取达到 byte cap 后停止并返回 `truncated`。
- [x] 返回 `has_more` 和 `next_start_line`。
- [x] 行号在 text 中可选择性前缀；schema 中记录是否加行号。
- [x] 返回片段 SHA-256。
- [x] 二进制检测使用固定前导窗口。
- [x] NUL byte/无效文本比例超过阈值时拒绝。
- [x] directory、socket、device 等非 regular file 拒绝。
- [x] 文件在 stat 与 open 之间变化时返回安全错误或明确 metadata。
- [x] redaction 作用于返回片段。
- [x] secret path 在打开前拒绝，不能依赖 redaction 兜底。
- [x] legacy `read_workflow_file` 继续保留原 schema。

### Done when

- [x] 1 MB 以上文本可通过多次调用分段读取。
- [x] 单次响应不超过 hard cap。
- [x] 二进制文件不返回乱码。
- [x] denied 文件在任何 line range 下都拒绝。
- [x] 文件尾部返回 `has_more=false`。

### Verification

```bash
bun test tests/cli/mcp-reader-tools.test.ts --test-name-pattern read_text
```

---

## Task Card RH-MCP-107: Implement Bounded `search_text`

    id: RH-MCP-107
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.5d
    depends_on: RH-MCP-104
    release: 0.8.0-rc.1
    branch: feat/mcp-reader-tools

### Files

Modify:

```text
src/cli/mcp/reader-tools.ts
src/cli/mcp/paths.ts
tests/cli/mcp-reader-tools.test.ts
```

### Checklist

- [x] 首版只支持 literal query。
- [x] query 空字符串拒绝。
- [x] query 长度设置 hard cap，例如 512 chars。
- [x] `case_sensitive` 默认 false。
- [x] 可选 glob 复用现有 glob matcher。
- [x] 默认从 workspace `"."` 搜索。
- [x] 默认 max results = 50，hard max = 100。
- [x] 默认 max files = 1000，hard max = 2000。
- [x] 默认 timeout = 3000ms，hard max = 5000ms。
- [x] 每个 walker/line loop 检查 deadline。
- [x] 不跟随 symlink/junction。
- [x] deny path 在 stat/open 前过滤。
- [x] 超过 per-file scan cap 跳过并统计。
- [x] binary file 跳过并统计。
- [x] 每个结果返回 relative path、line、column、短 snippet。
- [x] snippet 走 redaction。
- [x] 总 response byte cap。
- [x] timeout 返回部分结果并设置 `timed_out=true`，不是 transport 500。
- [x] max results 返回部分结果并设置 `truncated=true`。
- [x] deterministic ordering：path、line、column。
- [x] 测试 no-match、case sensitivity、glob、timeout、limits、denied path。
- [x] 测试 symlink loop 不挂死。
- [x] 不新增 `rg`/系统 binary dependency。

### Done when

- [x] secrets 目录不会出现在 match 或 snippet。
- [x] 大目录搜索在 deadline 内结束。
- [x] 部分结果语义稳定、机器可读。
- [x] 搜索不阻塞 MCP server 无上限时长。

### Verification

```bash
bun test tests/cli/mcp-reader-tools.test.ts --test-name-pattern search_text
```

---

## Task Card RH-MCP-108: Preserve Workflow Tool Compatibility

    id: RH-MCP-108
    priority: P1
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 0.5d
    depends_on: RH-MCP-103
    release: 0.8.0-rc.1
    branch: feat/mcp-reader-compat

### Files

Modify only as required:

```text
src/cli/mcp/tools.ts
src/cli/mcp/server.ts
tests/cli/mcp-tools.test.ts
tests/cli/mcp.test.ts
```

### Checklist

- [x] `read_workflow_file` 名称、input schema、output shape 保持兼容。
- [x] planner 默认 profile 不变，tools/list 增加 reader tools。
- [x] existing writer tools 仍受旧 write globs 约束。
- [x] workspace reader 不绕过 workflow writer 的 write globs。
- [x] `discover_harness_repos` legacy 行为不被 workspace manager 意外改变。
- [x] 不在该 PR 拆分全部 4000+ 行 `tools.ts`。
- [x] 如复用 read primitive，先写 compatibility test 再替换实现。
- [x] snapshot/ordered tool tests 明确预期变更。
- [x] STDIO planner smoke test 通过。
- [x] HTTP planner OAuth initialize smoke test 通过。

### Done when

- [x] 现有 MCP Connector planner 流程仍可完成 idea → PRD → Sprint → Goal。
- [x] reader 改造没有把旧 profile 切换到 workspace-only 参数。

### Verification

```bash
bun test tests/cli/mcp-tools.test.ts
bun test tests/cli/mcp.test.ts
```

---

## Task Card RH-MCP-201: SessionStore and HTTP Lifecycle

    id: RH-MCP-201
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.5d
    depends_on: RH-MCP-003
    release: 0.8.0
    branch: fix/mcp-http-session-lifecycle

### Files

Create:

```text
src/cli/mcp/session-store.ts
```

Modify:

```text
src/cli/mcp/transports/http.ts
tests/cli/mcp-http.test.ts
```

### Proposed types

```ts
interface McpSessionRecord {
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastSeenAt: number;
}

interface McpSessionStoreOptions {
  ttlMs: number;
  maxSessions: number;
  now?: () => number;
}
```

### Checklist

- [x] 从 `http.ts` 抽出 session bookkeeping。
- [x] 保留现有 `transport.onclose` 删除逻辑。
- [x] 默认 TTL = 30 minutes，可由受限 env/config 覆盖。
- [x] 默认 max sessions = 64。
- [x] initialize 前先清理过期 Session。
- [x] 达到上限时拒绝新 Session，并返回结构化 `SESSION_LIMIT_REACHED`。
- [x] 每个合法请求更新 `lastSeenAt`。
- [x] unknown/stale ID 返回 `SESSION_NOT_FOUND`。
- [x] 只在无 Session ID 且请求是 initialize 时创建 Session。
- [x] 带未知 Session ID 的普通请求不得偷偷创建新 Session。
- [x] 增加 DELETE `/mcp`。
- [x] DELETE 调用 transport close 并删除 map。
- [x] GET/POST/DELETE 使用同一 auth middleware。
- [x] Session ID 长度/格式设置上限，避免恶意超长 header。
- [x] server shutdown 时关闭所有 transports。
- [x] cleanup timer 使用 `unref()`，不阻止进程退出。
- [x] tests 使用 injectable clock，避免 sleep。
- [x] 增加 initialize/reuse/delete/expire/limit/restart 测试。
- [x] 验证 workspace manager 随 Session 销毁。

### Done when

- [x] stale Session 不会永久占用内存。
- [x] ChatGPT 断开后 DELETE 能释放 transport。
- [x] 服务重启后的旧 Session 获得可恢复错误。
- [x] 现有 onclose 行为无回归。

### Verification

```bash
bun test tests/cli/mcp-http.test.ts
bun run check:type
```

---

## Task Card RH-MCP-202: OAuth Offline Access and Token Rotation

    id: RH-MCP-202
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 2.0d
    depends_on: RH-MCP-201
    release: 0.8.0
    branch: fix/mcp-oauth-refresh

### Files

Modify:

```text
src/cli/mcp/oauth.ts
src/cli/mcp/transports/http.ts
src/cli/mcp/auth.ts
tests/cli/mcp-http.test.ts
```

Create:

```text
tests/cli/mcp-oauth.test.ts
```

### Checklist

- [x] discovery `scopes_supported` 增加 `offline_access`。
- [x] authorization request scope 经过 allowlist。
- [x] authorization code record 保存：
  - [x] client ID
  - [x] redirect URI
  - [x] code challenge
  - [x] scopes
  - [x] created/expiry time
- [x] token exchange 精确校验 redirect URI。
- [x] token response 返回实际 granted scope。
- [x] 请求 `offline_access` 时返回 refresh token。
- [x] 未请求时按兼容策略决定是否返回，并写测试。
- [x] refresh 时生成全新的 access token。
- [x] refresh 时轮换 refresh token。
- [x] 旧 access token 被吊销或不再续期。
- [x] 旧 refresh token 单次使用后失效。
- [x] token writes 保持原子性。
- [x] authorization code 单次使用。
- [x] authorization code、access token、refresh token 都有过期清理。
- [x] redirect URI 以 dynamic client registration 保存值为准。
- [x] 保留 HTTPS/localhost 安全约束，但不只依赖硬编码 ChatGPT path。
- [x] public deployment 必须显式设置 `REPO_HARNESS_MCP_PUBLIC_ORIGIN`。
- [x] public origin 不从不可信 forwarded headers 静默推导。
- [x] loopback dev mode 可继续自动推导。
- [x] issuer、authorization endpoint、token endpoint、resource metadata 使用同一 origin builder。
- [x] `/authorize`、`/register`、`/token`、`/revoke` 增加限流。
- [x] token/authorization error 符合 OAuth JSON error 形状。
- [x] 日志不包含 code、access token、refresh token。
- [x] tests 覆盖 PKCE success/failure。
- [x] tests 覆盖 offline_access discovery。
- [x] tests 覆盖 refresh rotation 和旧 token 失效。
- [x] tests 覆盖 public origin 缺失 fail-fast。
- [x] tests 覆盖 redirect URI mismatch。

### Done when

- [x] access token 到期后客户端可通过 refresh 恢复。
- [x] refresh 后 access token 值发生变化。
- [x] metadata 中 issuer/endpoints 与公开 MCP origin 一致。
- [x] OAuth endpoint 不再显式关闭所有 rate limits。

### Verification

```bash
bun test tests/cli/mcp-oauth.test.ts
bun test tests/cli/mcp-http.test.ts
bun run check:type
```

### Rollback

保留 bearer auth 作为本地诊断路径；OAuth 发生回归时不得恢复复用 access token 的 refresh 实现。

---

## Task Card RH-MCP-203: Bearer, Version and Health Hardening

    id: RH-MCP-203
    priority: P1
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 0.5d
    depends_on: RH-MCP-201
    release: 0.8.0
    branch: fix/mcp-http-metadata

### Files

Modify:

```text
src/cli/mcp/transports/http.ts
src/cli/mcp/server.ts
src/cli/mcp/setup.ts
tests/cli/mcp-http.test.ts
tests/cli/mcp.test.ts
```

Optional create only if no existing version helper exists:

```text
src/cli/version.ts
```

### Checklist

- [x] bearer comparison 改用 constant-time compare。
- [x] 处理不等长度而不抛异常。
- [x] server metadata version 从 package version 单一来源读取。
- [x] 删除硬编码 `0.1.0`。
- [x] `/health` 返回：
  - [x] status
  - [x] package version
  - [x] profile
  - [x] auth mode
  - [x] active session count
  - [x] max session count
  - [x] session TTL
  - [x] schema hash/version
- [x] `/health` 不返回 token、OAuth data 或完整 allowed roots。
- [x] schema hash 在 tools/list schema 变化时改变。
- [x] setup/doctor 输出 package/server version mismatch。
- [x] tests 验证 version 与 `package.json` 一致。
- [x] tests 验证 health 不含 secret strings。

### Done when

- [x] ChatGPT/support log 能识别运行的是哪个工具 schema。
- [x] bearer 比较不存在简单字符串比较。
- [x] health 可用于定位旧进程/旧 tunnel。

### Verification

```bash
bun test tests/cli/mcp-http.test.ts
bun test tests/cli/mcp.test.ts
```

---

## Task Card RH-MCP-204: Setup, Doctor and Documentation

    id: RH-MCP-204
    priority: P0
    status: done
    owner: codex
    reviewer: unassigned
    estimate: 1.0d
    depends_on: RH-MCP-105,RH-MCP-106,RH-MCP-107,RH-MCP-202,RH-MCP-203
    release: 0.8.0
    branch: docs/mcp-reader-setup

### Files

Modify:

```text
src/cli/commands/mcp.ts
src/cli/mcp/setup.ts
docs/repo-harness-chatgpt-mcp-setup.md
README.md
tests/cli/mcp-setup.test.ts
tests/cli/mcp.test.ts
```

### Checklist

- [x] 文档继续把 planner workflow writer 与 workspace reader capability 明确区分。
- [x] 添加 single Connector 外部 root setup 示例：

```bash
repo-harness mcp setup chatgpt \
  --scope user \
  --repo . \
  --enable-reader \
  --allow-root "$HOME/Documents" \
  --allow-root "$HOME/Projects"
```

- [x] 添加 planner serve 示例。
- [x] setup 输出明确列出授权 root 数量。
- [x] setup 不输出 bearer token 完整值到持久日志。
- [x] doctor 验证 config version。
- [x] doctor 验证 allowed roots 存在且可读。
- [x] doctor 验证 roots 没有退化成 `/` 或 home，除非用户显式确认策略允许。
- [x] doctor 检测 legacy `fullDiskRead:true` 并给修复命令。
- [x] doctor 检测 public origin 缺失/不一致。
- [x] doctor 检测 package version 与 server health version。
- [x] doctor 检测 offline_access discovery。
- [x] doctor 检测 MCP DELETE capability 可选 smoke test。
- [x] guide 说明修改工具 schema 后需要重新扫描 App。
- [x] guide 说明必要时删除并重建 App/Connector。
- [x] guide 给出首个 ChatGPT 测试 prompt：
  - [x] list roots
  - [x] open workspace
  - [x] tree
  - [x] read_text
  - [x] search_text
- [x] guide 列出明确的 blocked-file 测试。
- [x] README 保持 MCP sidecar 默认 planner，不暗示默认 full filesystem。
- [x] README 标记 reader 为 explicit opt-in。
- [x] generated guide 与 committed docs 内容同步。
- [x] setup snapshots 更新。

### Done when

- [x] 新用户不读源码也能完成 reader 配置。
- [x] 用户能清楚看出哪些目录被授权。
- [x] 旧 planner quickstart 仍然有效。
- [x] 文档没有提交真实本机路径、tunnel URL 或 token。

### Verification

```bash
bun test tests/cli/mcp-setup.test.ts
bun test tests/cli/mcp.test.ts
repo-harness mcp doctor --repo .
```

---

## Task Card RH-MCP-205: Cross-Platform E2E and 0.8.0 Release

    id: RH-MCP-205
    priority: P0
    status: todo
    owner: unassigned
    reviewer: unassigned
    estimate: 1.5d
    depends_on: RH-MCP-204
    release: 0.8.0
    branch: release/0.8.0-mcp-reader

### Files

Modify as required:

```text
package.json
README.md
docs/repo-harness-chatgpt-mcp-setup.md
plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md
.ai/harness/handoff/
existing release-note surface
```

### Automated checklist

- [ ] Linux CI path tests。
  - 2026-06-21: configured GitHub Actions `mcp-path-matrix` job for Ubuntu/macOS/Windows focused MCP path tests; hosted run evidence remains open.
  - 2026-06-21: `gh run list` shows latest `codex/release-0.7.5` CI success at SHA `75b7a5047ec92836f7417448989af4af6a617737`, but that hosted run predates the current uncommitted MCP reader diff and does not include the new `mcp-path-matrix` job.
  - 2026-06-21: external blocker/resume path recorded in `.ai/harness/handoff/mcp-reader-external-gates-blocker.md`; current-diff hosted matrix requires a stable pushed diff.
- [ ] macOS local/CI smoke。
  - 2026-06-21: macOS local focused MCP tests, full `bun test`, and `bun run check:ci` passed; hosted macOS run evidence remains open.
  - 2026-06-21: after the source/package reader policy fix, `BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci` passed with `905 pass`, `1 skip`, `0 fail`, `9055 expects`; workflow checks, repository inspection, package dry-run, and tarball install smoke passed.
  - 2026-06-21: after release-note/migration-note synchronization, `BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci` passed again with `905 pass`, `1 skip`, `0 fail`, `9055 expects`; workflow checks, repository inspection, package dry-run, and tarball install smoke passed.
- [x] Windows drive-letter path tests。
- [x] Windows backslash traversal tests。
- [ ] Windows junction test where environment permits。
  - 2026-06-21: added Windows-only junction escape regression in `tests/cli/mcp-workspaces.test.ts` and wired it into the GitHub Actions MCP path matrix; local macOS run reports explicit skip, so Windows runner evidence remains open.
- [x] STDIO reader initialize/tools/list/call。
- [x] HTTP bearer reader initialize/tools/list/call。
  - 2026-06-21: local HTTP MCP transcript passed and is archived at `.ai/harness/handoff/mcp-reader-local-http-e2e.md`; it includes `tools/list`, roots, workspace open, Markdown/source/package/large-range `read_text`, `search_text`, deny checks, DELETE, and stale-session recovery.
- [x] HTTP OAuth reader initialize/tools/list/call。
- [x] Session DELETE。
- [x] Session expiry with fake clock。
- [x] max session rejection。
- [x] access token refresh。
- [x] old token rejection。
- [x] planner regression suite。
- [x] executor/orchestrator regression suite。
- [x] package tarball smoke。
  - 2026-06-21: local `npm pack --dry-run --json` confirms the package file list includes `src/effects/repo-registry.ts`, `src/cli/mcp/reader-tools.ts`, `src/cli/mcp/session-store.ts`, `src/cli/mcp/version.ts`, and `src/cli/mcp/workspaces.ts`; `bun run check:ci` tarball install smoke passed.
- [x] no tracked local config/token/audit files。

### Manual ChatGPT E2E checklist

- [ ] Start server with explicit public origin。
- [ ] Expose through stable HTTPS tunnel。
- [ ] Inspect OAuth metadata from public origin。
- [ ] Create/recreate ChatGPT App or Connector。
- [ ] Confirm planner tools/list contains workflow planning/writer tools plus reader tools, and excludes runner/browser/shell tools unless explicitly enabled。
- [ ] Ask ChatGPT to list allowed roots。
- [ ] Open an allowed workspace。
- [ ] Read a normal Markdown file。
- [ ] Read a source file。
- [ ] Read a large file in two line ranges。
- [ ] Search a phrase across Markdown files。
- [ ] Confirm `.env` is blocked。
- [ ] Confirm `.ssh` is blocked。
- [ ] Confirm symlink escape is blocked。
- [ ] Confirm outside-root path cannot be opened。
- [ ] Delete Session and reconnect。
- [ ] Let/force access token expire and confirm refresh。
- [ ] Restart local server and confirm stale Session recovery。
- [ ] Change schema hash in a test build and confirm App rescan procedure。
- [ ] Capture sanitized E2E evidence in handoff。
  - 2026-06-21: created `.ai/harness/handoff/mcp-reader-sprint-closeout.md` with automated evidence and explicit live ChatGPT pending state.
  - 2026-06-21: archived local HTTP MCP transcript in `.ai/harness/handoff/mcp-reader-local-http-e2e.md`; live ChatGPT Connector/App tool-call transcript is still required.
- [ ] Remove test tunnel/config secrets after test。

### Release checklist

- [ ] Update version to `0.8.0`。
- [x] Release notes highlight single Connector workspaceReader behavior。
  - Evidence: `docs/CHANGELOG.md` Unreleased section documents planner `workspaceReader`, registered-repo workspaces, and global registry discovery.
- [x] Release notes document v1 fullDiskRead migration。
  - Evidence: `docs/CHANGELOG.md` Unreleased section documents legacy `fullDiskRead:true` fail-closed behavior and explicit `--allow-root` migration.
- [x] Release notes document security behavior change from 0.7.4。
  - Evidence: `docs/CHANGELOG.md` Unreleased section documents broad-read/user-scope deny globs remaining active for env files, private keys, SSH keys, credentials, secrets, `.git`, and dependency/build output.
- [x] Verify `files` package manifest includes new source files。
  - Evidence: `npm pack --dry-run --json` recorded in `.ai/harness/handoff/mcp-reader-sprint-closeout.md` includes `src/effects/repo-registry.ts`, `src/cli/mcp/reader-tools.ts`, `src/cli/mcp/session-store.ts`, `src/cli/mcp/version.ts`, and `src/cli/mcp/workspaces.ts`.
- [x] Verify generated docs/skill copies if applicable。
  - Evidence: `tests/cli/mcp-setup.test.ts` covers generated ChatGPT setup guide and `repo-harness-chatgpt-bridge` skill installation; generated guide content is synchronized in `docs/repo-harness-chatgpt-mcp-setup.md`.
- [ ] Run all required checks。
  - 2026-06-21: full local non-release CI passed with `BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci`; release checks remain paused by user instruction and are not claimed here.
- [ ] Reviewer signs off threat model and migration behavior。
  - 2026-06-21: review intake is prepared in `.ai/harness/handoff/mcp-reader-review-request.md`; local self-review is complete, but assigned reviewer sign-off remains external.
- [ ] Tag and publish。
- [ ] Verify published package version。
- [ ] Install published tarball/package in clean temp directory。
- [ ] Run `mcp --help` and reader setup smoke from published artifact。
- [ ] Mark Sprint done only after published smoke passes。

### Verification

```bash
bun test
bun run check:type
bun run check:ci
bun run check:release
bun run smoke:tarball-install
bun run check:release-published
```

---

# 11. Security Acceptance Matrix

| Case | Expected | Automated test |
|---|---|---|
| Allowed root Markdown | allow | reader tools |
| Allowed root source file | allow | reader tools |
| Outside allowed root | deny | workspaces |
| Absolute path in reader read tool | deny | reader tools |
| `../` traversal | deny | workspaces |
| Windows `..\` traversal | deny | workspaces |
| Symlink file to outside root | deny | workspaces |
| Symlink directory traversal | skip/deny | tree/search |
| Junction to outside root | skip/deny | Windows tests |
| `.env` | deny | policy + tools |
| `.env.local` | deny | policy + tools |
| `*.pem`, `*.key` | deny | policy + tools |
| `.ssh/**` | deny | policy + tools |
| `credentials/**` | deny | policy + tools |
| `secrets/**` | deny | policy + tools |
| Denied path in tree | omitted, blocked count only | reader tools |
| Denied path in search | no filename/snippet leak | reader tools |
| Binary file | structured deny/unsupported | reader tools |
| Named pipe/device/socket | deny | reader tools |
| Large text | bounded chunk | reader tools |
| Search over huge tree | timeout/partial response | reader tools |
| Reader invokes writer | tool unavailable | reader tools |
| Reader invokes runner/browser | tool unavailable | reader tools |
| Workspace ID from another Session | deny | HTTP/workspaces |
| Expired Session | structured not-found | HTTP |
| Session limit | structured limit error | HTTP |
| Old refresh token reuse | deny | OAuth |
| Public server without public origin | fail fast | OAuth/HTTP |
| Health endpoint | no secrets | HTTP |

---

# 12. Compatibility Matrix

| Existing behavior | Required result |
|---|---|
| default `mcp serve` profile | remains planner |
| planner tools/list | unchanged except intentional metadata/schema hash |
| planner workflow reads | unchanged |
| planner PRD/Sprint/Goal writes | unchanged |
| executor profile | unchanged |
| orchestrator dev runner opt-in | unchanged |
| `read_workflow_file` schema | unchanged |
| config v1 safe setup | readable/migratable |
| config v1 fullDiskRead true | fail closed with remediation |
| STDIO transport | remains supported |
| HTTP bearer | remains supported |
| HTTP OAuth | improved, no breaking endpoint path |
| `/health` | additive fields only |
| `/mcp` GET/POST | unchanged |
| `/mcp` DELETE | additive |
| `--allow-full-disk-read` | deprecated, never bypasses deny |

---

# 13. PR Plan

## PR 1 — Security hotfix

```text
fix(mcp): preserve deny rules in broad read mode
```

Contains:

- RH-MCP-001
- RH-MCP-002

No workspaceReader capability, config v2 or OAuth changes.

## PR 2 — Reader profile and config

```text
feat(mcp): add workspace reader capability and allowed-root config
```

Contains:

- RH-MCP-101
- RH-MCP-102

## PR 3 — Workspace capability model

```text
feat(mcp): add session-local allowed-root workspaces
```

Contains:

- RH-MCP-103
- RH-MCP-104 root/workspace subset

## PR 4 — Reader tools

```text
feat(mcp): add bounded tree, read_text and search_text tools
```

Contains:

- RH-MCP-105
- RH-MCP-106
- RH-MCP-107
- RH-MCP-108

## PR 5 — HTTP and OAuth hardening

```text
fix(mcp): harden sessions, oauth refresh and server metadata
```

Contains:

- RH-MCP-201
- RH-MCP-202
- RH-MCP-203

## PR 6 — Setup, docs and release

```text
docs(mcp): document reader setup and complete release validation
```

Contains:

- RH-MCP-204
- RH-MCP-205

每个 PR：

- [ ] 一个明确 rollback boundary。
- [ ] 不混入无关格式化。
- [ ] 更新对应 Task Card status。
- [ ] 附 targeted test output。
- [ ] 附 `bun run check:type`。
- [ ] 合并前至少一名 reviewer。
- [ ] P0 security PR 不允许 self-approve。

---

# 14. Definition of Ready

任务进入 `in_progress` 前必须满足：

- [ ] 依赖任务已 done。
- [ ] 文件范围明确。
- [ ] input/output schema 已冻结或明确标注 draft。
- [ ] 安全 invariant 明确。
- [ ] acceptance tests 已列出。
- [ ] rollback boundary 已列出。
- [ ] 无未解决的“默认授权范围”问题。
- [ ] owner/reviewer 已填写。
- [ ] branch/PR 已填写。
- [ ] 涉及 schema 的任务已记录 App rescan 影响。

---

# 15. Definition of Done

每个 Task Card 完成必须满足：

- [ ] checklist 全部完成或明确 deferred。
- [ ] targeted tests 通过。
- [ ] `bun run check:type` 通过。
- [ ] 无新增未解释依赖。
- [ ] error shape 有测试。
- [ ] denied cases 有测试。
- [ ] audit/log 不包含 secrets。
- [ ] docs/help 随 CLI 或 schema 一起更新。
- [ ] Sprint dashboard 状态更新。
- [ ] PR 链接和 commit SHA 写入卡片。
- [ ] reviewer sign-off。
- [ ] handoff 记录实际命令与结果。
- [ ] 无真实本机绝对路径/token/tunnel URL 进入 git。

Release task 还必须满足：

- [ ] `bun run check:ci`。
- [ ] release/package checks。
- [ ] clean-install smoke。
- [ ] published artifact smoke。
- [ ] manual ChatGPT E2E evidence。

---

# 16. Review Checklist

## Security reviewer

- [ ] deny precedence 是否不可绕过。
- [ ] allowed root migration 是否 fail closed。
- [ ] workspace 是否 session-local。
- [ ] symlink/junction 是否安全。
- [ ] tree/search 是否泄漏 denied filename。
- [ ] response limits 是否覆盖 entries/results/bytes/time。
- [ ] OAuth refresh 是否真正轮换 access token。
- [ ] public origin 是否一致。
- [ ] logs/health 是否泄漏 secrets。
- [ ] legacy full-disk 是否仍有隐藏 bypass。

2026-06-21 reviewer-prep note: local evidence map captured in `.ai/harness/handoff/mcp-reader-review-prep.md`; local self-review is `.ai/harness/handoff/mcp-reader-self-review.md`; formal intake packet is `.ai/harness/handoff/mcp-reader-review-request.md`. This is not assigned reviewer sign-off.

## API/MCP reviewer

- [ ] tool names 与 schemas 是否稳定。
- [ ] planner tools/list 是否只增加 reader tool subset，且未引入 runner/browser/shell。
- [ ] MCP annotations 是否正确。
- [ ] structured errors 是否一致。
- [ ] GET/POST/DELETE Session 语义是否正确。
- [ ] server metadata version 是否真实。
- [ ] stale Session 是否可恢复。
- [ ] planner tools 是否无 breaking change。

2026-06-21 reviewer-prep note: API/MCP checklist evidence is mapped in `.ai/harness/handoff/mcp-reader-review-prep.md`; local self-review is `.ai/harness/handoff/mcp-reader-self-review.md`; formal intake packet is `.ai/harness/handoff/mcp-reader-review-request.md`. Current diff still needs formal review.

## Maintainer reviewer

- [ ] 遵循现有 CLI Commander 风格。
- [ ] 未无意重构大型 `tools.ts`。
- [ ] tests 放在现有 `tests/cli/` 结构。
- [ ] package files 能包含新增模块。
- [ ] README 默认定位仍是 workflow sidecar。
- [ ] Sprint/PRD/handoff 已同步。
- [ ] release notes 和 migration notes 完整。

2026-06-21 reviewer-prep note: maintainer checklist evidence is mapped in `.ai/harness/handoff/mcp-reader-review-prep.md`; local self-review is `.ai/harness/handoff/mcp-reader-self-review.md`; formal intake packet is `.ai/harness/handoff/mcp-reader-review-request.md`. Release checks remain paused by user instruction.

---

# 17. Daily Stand-up Template

```markdown
## YYYY-MM-DD

Completed:
- [task/checklist item]
- Evidence: [test command / PR / commit]

In progress:
- [task/checklist item]

Blocked:
- [blocker]
- Owner needed:
- Decision deadline:

Security observations:
- [new invariant, threat, or test]

Next:
- [next bounded action]
```

---

# 18. Blocker Template

将 blocker 写入 `.ai/harness/handoff/`：

```markdown
# MCP Reader Blocker

task_id:
date:
owner:
severity:
blocked_since:

## Symptom

## Reproduction

## Expected

## Actual

## Security impact

## Options considered

## Recommended decision

## Required owner

## Resume command/checklist
```

---

# 19. Closeout Handoff Template

建议文件：

```text
.ai/harness/handoff/mcp-reader-sprint-closeout.md
```

内容：

```markdown
# MCP Reader Sprint Closeout

release:
commit:
published_package:
date:

## Delivered

## Deferred

## Security invariants proven

## Config migration behavior

## Tool schemas

## Automated verification

- command:
  result:

## Manual ChatGPT E2E

- connector/app:
- public origin:
- schema hash:
- OAuth refresh:
- Session reconnect:
- denied path tests:
- large-file chunk test:
- search test:

## Known limitations

## Rollback

## Follow-up tasks
```

---

# 20. Final Sprint Exit Gate

Sprint 只能在下列所有项完成后标记 `done`：

- [ ] 0.7.5 security hotfix 已发布并验证。
- [x] planner workspaceReader 默认包含 registered adopted repos；外部 non-repo roots 为显式 opt-in。
  - Evidence: `tests/cli/mcp-tools.test.ts` covers registered repo discovery, `repo_path`, and allowed root listing; `tests/cli/mcp-setup.test.ts` covers user-scope setup with `allowedRoots: []` plus global registry registration.
- [x] user-scope reader 无显式 roots 时只能通过 registered adopted repos 工作；无 registered repos 时 fail closed/doctor remediation。
  - Evidence: `tests/cli/mcp-setup.test.ts` covers user-scope config with zero explicit roots, one registered repo, and non-repo root `ready_user` with `workspaceReader:false`.
- [x] legacy fullDiskRead true 不会自动映射整个磁盘。
  - Evidence: `tests/cli/mcp-policy.test.ts`, `tests/cli/mcp-tools.test.ts`, and `tests/cli/mcp-setup.test.ts` cover deny-preserving broad read and deprecated `--allow-full-disk-read`.
- [x] secrets deny rules 在所有 profile 下通过。
  - Evidence: `tests/cli/mcp-policy.test.ts`, `tests/cli/mcp-reader-tools.test.ts`, `tests/cli/mcp-tools.test.ts`, and `tests/cli/mcp-workspaces.test.ts`; closeout records `.env`, `.env.local`, private key, `.ssh/**`, `credentials/**`, and `secrets/**` denial coverage.
- [x] planner tools/list 包含 workflow planning/writer + reader tools，但不含 runner/browser/shell；reader tool handlers 本身只读。
  - Evidence: `tests/cli/mcp-policy.test.ts`, `tests/cli/mcp-tools.test.ts`, and local HTTP transcript `.ai/harness/handoff/mcp-reader-local-http-e2e.md`.
- [x] tree/read/search 均有 entries/bytes/results/time limits。
  - Evidence: `tests/cli/mcp-reader-tools.test.ts` covers bounded tree, chunked/byte-limited reads, bounded search, binary rejection, and redaction.
- [x] workspace 是 Session-local。
  - Evidence: `tests/cli/mcp-reader-tools.test.ts`, `tests/cli/mcp-workspaces.test.ts`, and `tests/cli/mcp-http.test.ts`.
- [x] Session TTL、limit、DELETE 均通过。
  - Evidence: `tests/cli/mcp-http.test.ts` and local HTTP transcript `.ai/harness/handoff/mcp-reader-local-http-e2e.md`.
- [x] OAuth metadata 公布 offline access。
  - Evidence: `tests/cli/mcp-http.test.ts` and `tests/cli/mcp-oauth.test.ts`.
- [x] refresh 产生新 access token 和新 refresh token。
  - Evidence: `tests/cli/mcp-http.test.ts` and `tests/cli/mcp-oauth.test.ts`.
- [x] server version 与 package version 一致。
  - Evidence: `tests/cli/mcp-setup.test.ts`, `tests/cli/mcp-tools.test.ts`, `tests/cli/mcp-stdio.test.ts`, and health/reader status checks.
- [x] planner/executor/orchestrator 回归通过。
- [ ] macOS/Linux/Windows 路径矩阵完成。
  - Pending: hosted `mcp-path-matrix` readback for the current diff; local macOS run skips the Windows junction case by design.
- [ ] ChatGPT Connector/App 已按新 schema 重扫。
- [ ] manual E2E 完成并脱敏归档。
  - Partial local evidence: `.ai/harness/handoff/mcp-reader-local-http-e2e.md`; live ChatGPT Connector/App tool-call transcript remains pending.
- [x] `bun run check:ci` 通过。
- [ ] clean-install/published-package smoke 通过。
  - Partial local evidence: `BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci` passed package dry-run and local tarball install smoke for `repo-harness-0.7.5.tgz`; published package smoke remains pending until release hold is lifted.
- [ ] 文档、PRD、Sprint、handoff 与 release notes 同步。
  - Partial local evidence: PRD, sprint, docs, CHANGELOG release notes, closeout, review prep, current status, and handoff are synchronized locally; release/published-package evidence remains pending.
