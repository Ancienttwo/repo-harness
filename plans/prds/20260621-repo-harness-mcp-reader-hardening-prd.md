# PRD: repo-harness MCP Reader and Transport Hardening

## 0. Metadata

    id: prd-repo-harness-mcp-reader-hardening
    status: draft
    owner: unassigned
    date: 2026-06-21
    baseline_release: 0.7.4
    target_release: 0.8.0
    sprint: plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md
    predecessor: plans/prds/20260617-repo-harness-mcp-prd.md
    risk_level: high

## 1. Problem

当前 `repo-harness mcp` 的产品目标是单一 ChatGPT Connector：planner 需要读取已 adopt/init 注册 repo 的非 ignored 文档和源码，才能写出真实 PRD/Sprint；同一 Connector 也要保留 workflow artifact 写入能力。旧的 per-repo 绑定会迫使每个项目配置一次 MCP，和标准用户只配置一个 `https://.../mcp` Connector 的目标冲突。现有 broad/full-disk compatibility mode 扩大 read globs 时也清空 deny globs，使秘密文件保护失效；现有工具缺少 registry-based repo 发现、目录树、搜索和分段读取能力。HTTP/OAuth 层还需要补充长期 Session 和 refresh compatibility。

## 2. Users

- 需要 ChatGPT 只读分析本机项目或文档的个人开发者。
- 需要保留 repo-harness planner → Codex executor 工作流的现有用户。
- 需要可审计、最小授权 MCP connector 的团队维护者。

## 3. Goals

- 标准用户只配置一个 MCP URL：`https://.../mcp`。
- Connector 注册 endpoint，不注册单个 repo；目标 repo 由 `~/.repo-harness/registered-repos.json` 中的 adopt/init registry 发现。
- global `repo-harness` CLI 是 runtime 和 registry owner；只自动暴露仍然通过 live adoption marker 校验的 registered adopted repos。
- planner 默认可读取 registered adopted repo root 下非 ignored、非 denied 的文本文件。
- 通过显式 allowed roots 安全读取 registered repos 之外的本机文本。
- 默认和现有 planner workflow 写入行为保持兼容。
- secrets deny 永远优先。
- 所有遍历、搜索和响应均有边界。
- OAuth access 过期后能安全刷新。
- Session 可回收、可关闭、可诊断。

## 4. Non-goals

- 写任意本机文件。
- shell/Git mutation。
- 默认 whole-disk access。
- PDF/Office/binary parsing。
- regex search。
- 把 ChatGPT 当作 Codex model。
- 重构所有旧 MCP workflow tools。

## 5. Security invariants

1. `COMMON_DENY_GLOBS` 不能由 profile 或 broad-read flag 清空。
2. planner workspaceReader 默认包含 registered adopted repos；外部 non-repo roots 必须显式授权。
3. 旧 fullDiskRead true 不自动迁移为 `/`。
4. workspace 后续路径必须是 workspace-relative。
5. workspace ID 只在当前 MCP Session 有效。
6. tree/search 不跟随 symlink/junction。
7. 所有工具限制时间、数量、字节或深度。
8. 默认 planner Connector 可同时注册 workflow writer 和 workspace reader 工具，writer 可通过 `repo_path` 落到目标 registered repo，但不注册 `run_agent_goal`、browser 执行或 shell。
9. OAuth refresh 轮换 access 和 refresh token。
10. logs、health、audit 不含 secret/token。

## 6. Success metrics

- 安全矩阵所有拒绝测试通过。
- 现有 planner MCP 回归测试通过。
- 1 MB+ 文本可分段读取。
- 2000 文件上限搜索在 5 秒 hard deadline 内退出。
- Session expiry/delete 不残留 workspace。
- OAuth refresh 后旧 token 无效。
- ChatGPT manual E2E 完成一次。
- `bun run check:ci` 和发布 smoke 通过。

## 7. Release strategy

- `0.7.5`：仅修复 deny bypass。
- `0.8.0-rc.1`：single Connector workspaceReader capability、config v2、workspace、reader tools。
- `0.8.0`：HTTP/OAuth、setup/doctor/docs、E2E。

## 8. Open decisions

- [x] registered repo roots 返回 root ID、display name、path 和 readable 状态；打开 workspace 必须使用 root ID。
- [x] config v1 fullDiskRead true 不自动迁移为 `/`；setup/doctor 标记 legacy 并要求显式 allowed roots。
- [x] `repo-harness adopt` / `repo-harness init` 成功后登记 repo path；MCP 从 global registry 发现 repo。
- [x] `write_prd` / `write_sprint` / `prepare_codex_goal_from_sprint` 等 workflow writer 支持 `repo_path`。
- [x] max source file size 的默认值：`read_text` 默认 65,536 bytes、hard cap 262,144 bytes；`search_text` 单文件扫描 cap 为 1 MiB。
- [x] health 公开 schema hash：`/health` 和 `reader_status` 暴露 schema hash/package version，但不暴露 token、OAuth data 或完整 allowed roots。
- [x] OAuth refresh token 只在请求 `offline_access` 时签发；未请求时不返回 refresh token。
- [ ] Windows symlink/junction CI 的可用 runner；当前已加入 Windows-only junction escape regression，macOS 本地运行明确 skip，真实 Windows runner evidence 留在 RH-MCP-205 release/E2E。

这些决策必须在对应 Task Card 进入 `in_progress` 前关闭。
