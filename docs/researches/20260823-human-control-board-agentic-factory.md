# Human Control Board 与 Agentic Software Factory 分阶段架构

## 结论

repo-harness 下一阶段应拆成两个产品能力层，并把跨设备访问视为独立部署维度，而不是第三套任务系统：

1. **Human-operated Development Control Center**：先让人类在 thin Web UI 中提交需求、观察 Fleet、派工、处理 attention、检查证据与完成最终验收。
2. **Agentic Software Factory**：再引入正式的 Planning and Integration Protocol，让 Planner 产生候选开发文档，经人工或 policy gate 批准后，确定性投影成多个 Work Package，由本地 Worker Host 启动多个 coding agents，最后进入独立集成与产品验收。
3. **Cross-device access**：Cloudflare Tunnel/Access 只提供网络与身份入口；Web UI 服务人类，Remote MCP 服务 Agent，实际代码执行继续发生在 repo/worktree 所在主机。

这不是从零设计。当前 `main@02857bd6` 已经具备 Fleet read model、task acquisition、publication lifecycle/readiness/recovery、feedback redispatch、task inbox，以及 Streamable HTTP MCP/OAuth 基础。前端必须消费这些既有协议，不能保存第二套 task/column/owner authority。

本研究综合了 2026-08-23 内置 Browser 中 GPT Pro 的两轮架构讨论，并以当前 repo 源码、已批准 Fleet PRD 与既有 Tunnel/MCP research 复核。Browser 内容只作为 advisory input；以下 repo 文件与运行结果才是本仓库事实来源。

## P1：当前系统边界

### 已完成的确定性控制面

- `fleet board --json` 产出 `FleetBoardSnapshotV1`；`fleet watch --format jsonl` 立即输出首个 snapshot，之后以非重叠 observation rounds 持续输出（`src/cli/commands/fleet.ts:359-460`）。
- Board collector 从 registered repo registry 出发，逐 repo 读取 canonical sprint、Lease、execution readiness、publication readiness、feedback 与 task inbox；单个 repo 失败被投影成 repo-local error，不会伪造跨 repo 原子快照（`src/effects/fleet/board.ts:178-230,240-299,354-443`）。
- CLI 已提供 `fleet offers/acquire`、task message/inbox、provider feedback intake/repair，以及 publication readiness/reopen/takeover/recovery/reconcile。`fleet acquire` 只领取 `execution_ready` offer，并返回 `WorkEnvelopeV1`（`src/cli/commands/fleet.ts:462-865`）。
- MCP 已镜像 `fleet_offers`、`fleet_acquire`、`publication_readiness`、`publication_reopen`、`publication_takeover`；mutation 要求 coding profile、registered `read_write` repo 与精确 `authorization_revision`，再由领域 effect 重验 fencing（`src/cli/mcp/fleet-tools.ts:37-52,202-304,320-405,429-518`）。
- HTTP MCP 已使用 MCP SDK 的 `StreamableHTTPServerTransport`，并带 Bearer/OAuth、session store、profile 与 authorization runtime 边界；Remote MCP 不是 greenfield transport 工作（`src/cli/mcp/transports/http.ts:1-54,117-168`；另见 `docs/researches/20260711-devspace-chatgpt-local-control.md`）。

### 尚未实现的产品层

- 没有 Web/TUI。批准的 Fleet PRD 明确把 `fleet board --json` 与 `fleet watch --format jsonl` 定义为未来 UI 的稳定输入，并要求 UI 只是 dumb renderer（`plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md:158,539`）。
- 没有 `operator serve`、Human HTTP API、Demand/Planning workspace 或 UI action audit contract。
- 没有正式的 `RequirementBriefV1`、`DevelopmentManifestV1`、`WorkPackageGraphV1`、`IntegrationEnvelopeV1` 或 `AcceptanceMatrixV1`。
- Fleet v1 没有把 dependency、capability、priority、concurrency key 作为 canonical scheduling schema；不能让 LLM 从 task prose 临场猜这些字段。
- 没有 Local Worker Host 去循环 acquire、启动 Codex/Claude、注入 WorkEnvelope、观察进程退出与发布 module result。repo-harness 当前拥有执行权协议，不拥有 Agent runtime lifecycle。
- 没有把多个 module publications 组合成 integration candidate 的正式协议和独立 acceptance gate。

### 不变量与 ownership

```text
Repo artifacts       own task meaning, approved plans, contracts and evidence
Lease                 owns temporary execution rights
PublicationReceipt    binds task + claim + candidate + PR
Git provider          owns live PR / CI / review / merge facts
Human                 owns approval, waiver, takeover and final merge
UI / MCP / Agent      own no permanent workflow truth
```

Tenant、Cloudflare identity 或 session ID 都不能进入 task semantic identity。它们属于 authorization、audit 与 runtime ownership；同一 canonical task 不应因换设备、换 Agent 或换 session 而变成新任务。

## P2：两条端到端路径

### Phase 1：人类可视化控制与验收

```text
Browser
  -> localhost Web UI
  -> query API / explicit command router
  -> repo-harness core/effects
  -> repo artifacts + Lease + provider facts
  -> FleetBoardSnapshotV1 / evidence views
```

1. Demand/Planning workspace 接收自然语言需求、附件引用、目标 repo/ref 与风险等级，但只创建 candidate requirement/plan，不直接创建 Lease。
2. 人类批准 decision-complete plan 后，既有 workflow 将它提升为 canonical plan、Sprint row 与 Contract；只有可确定性 project 的任务进入 `execution_ready`。
3. Execution/Delivery workspace 消费 `fleet board --json` 或 `fleet watch --format jsonl`，显示 `Available / Working / In Review / Ready to Merge / Done`，并把 `attention_owner` 作为独立维度。
4. UI mutation 只调用显式领域动作，例如 acquire、message send/ack、publication reopen/takeover/abandon/reconcile。每次请求携带并由后端重验 `authorization_revision`、`task_revision`、`claim_id`、`generation`、`publication_id`、`expected_head_sha` 与 snapshot revision。
5. 后端拒绝 stale fence；UI 重新取 snapshot。UI 不做 optimistic authority overwrite，也不保存 `task.status`、Kanban column 或 current owner。
6. 人类查看 exact PR Head、CI/review blockers、verification、AcceptanceReceipt 与 merge seal，最终跳转到 provider 完成 merge；第一版不代理 final merge。

### Phase 2：Agent 拆解、并行执行与收归验收

```text
User requirement
  -> Planner Agent candidate documents
  -> deterministic schema / DAG / path validation
  -> human or policy approval promotion
  -> Work Package Graph
  -> local Worker Host(s)
  -> fleet acquire -> worktree-bound WorkEnvelope
  -> module implementation + module verification + publication
  -> Integration Agent builds one combined candidate
  -> cross-module acceptance
  -> human product acceptance and merge
```

Planner LLM 负责理解模糊需求、提出架构、模块与依赖候选；它不能直接 claim Lease、扩大 `allowed_paths`、签发 waiver 或宣布 merge-ready。确定性层至少验证：schema、唯一 module ID、acyclic dependency graph、allowed-path conflicts、dependency completion、worker capability match、publication/head/evidence freshness。

验收分三道门：

1. **Module gate**：Contract fulfilled、allowed paths clean、checks pass、review subject fresh、publication identity valid。
2. **Integration gate**：dependency/interface compatibility、combined candidate identity、cross-module/E2E/migration/security checks，以及原始需求没有遗漏或重复归属。
3. **Product gate**：人类查看 Requirement Brief、module evidence、integration evidence、残余风险与最终 Head，再决定 merge/waiver/rework。

## P3：推荐实施顺序

### Phase 1A — Local Human Control Board

先做 localhost-only、默认 read-only 的 thin Web UI：

- Fleet Overview：五列与 repo health summary；
- Attention Inbox：`user / agent / external / none`；
- Task Drawer：task/revision、plan/contract、Lease/claim/generation、worktree/branch、publication/head、feedback/inbox；
- Evidence Panel：verification、acceptance、CI、review subject、merge seal、snapshot consistency；
- guarded actions：message、acquire、reopen、takeover、abandon、reconcile；
- Demand/Planning shell：需求录入、候选计划审阅与批准入口，但不在 UI 内发明新的 workflow authority。

前端组件的稳定边界应围绕 `FleetBoardSnapshotV1`、publication/feedback/task-inbox JSON contract 建立。不要先按页面视觉反推新的后端 status schema。

### Phase 1B — Cross-device Human Access

待 localhost UI 与动作边界稳定后，再加入：

- loopback-only operator HTTP service；
- named Cloudflare Tunnel；
- Cloudflare Access identity/role mapping；
- Viewer / Dispatcher / Reviewer / Administrator / Agent Worker 权限；
- typed `OperatorActionReceiptV1` 审计，但 receipt 不是 Lease authority；
- responsive/mobile 与断线后强制 refresh，不做离线 mutation replay。

Tunnel 只负责安全传输，不替代 application authorization。既有 research 已确定 public ingress 应映射到 loopback upstream，并且 provider automation 不进入 repo-harness 产品代码（`docs/researches/20260711-devspace-chatgpt-local-control.md`）。

### Phase 2A — Planning Documents and Scheduling Schema

定义并验证：

- `RequirementBriefV1`
- `DevelopmentManifestV1`
- `WorkPackageGraphV1`
- dependency / capability / priority / concurrency key
- per-module Work Package Contract
- `IntegrationContractV1`
- `AcceptanceMatrixV1`

LLM 输出始终是 candidate；只有 promotion gate 之后才成为 repo-local authority。

### Phase 2B — Local Worker Host

实现 acquire loop、worker capability advertisement、Codex/Claude runner、WorkEnvelope/Contract injection、process exit/result receipt 与 bounded retry。Worker Host 只拥有进程生命周期；Lease 和 task state 仍由 repo-harness authority 决定。

### Phase 2C — Integration and Acceptance

实现 dependency-ready module collection、integration candidate、cross-module checks、independent verifier、AcceptanceMatrix closure 与 human merge view。不能把“所有 module PR 都绿”当成系统级验收。

### Phase 2D — Scoped Remote MCP

当前 Streamable HTTP/OAuth transport 可复用；新增的是稳定领域工具与 scopes，不是 remote shell：

- Agent 可有 `fleet.read`、`offers.read`、`task.acquire`、`inbox.read/ack`、`checks.publish`；
- Human/Admin 才可有 plan approval、waiver、abandon 等高风险动作；
- Remote MCP 不提供 `shell_exec`、`write_any_file`、`git_push_any_ref`、`delete_worktree` 或 `merge_pr`；
- coding execution 留在 Local Worker Host，不把本机任意 shell 暴露成公网控制 API。

Web UI 与 Remote MCP 宜使用不同 hostname/policy，但共享同一个确定性 domain command layer。两者都不能根据刚显示的 Board snapshot 直接 mutation。

## 前端组件切片建议

第一刀不是完整 Kanban application，而是可独立验收的 read-only component shell：

1. `FleetSnapshotProvider`：消费一次 `fleet board --json` fixture，保留 protocol/revision/error，不重算领域状态。
2. `FleetSummary`：各 column 数量、repo degraded/unreadable 数量。
3. `FleetColumns` + `TaskCard`：只渲染 core 给出的 column、attention 与 blocker。
4. `TaskDrawer`：显示 task、Lease、publication、feedback/inbox、evidence linkage。
5. `AttentionInbox`：按 attention owner 与 severity 投影，不修改 canonical state。

这五个组件足以验证 JSON contract、信息架构、空/错误/stale 状态与移动端布局；mutation、Tunnel、Planner 和 Worker Host 都可在后续 bounded slice 加入，不必为了画出第一版 UI 同时建立 operator daemon。

## Release 影响

当前树**不应以 `0.16.3` 直接发布**：

- `package.json` 与 `assets/skill-version.json` 仍是 `0.16.2`；npm `latest` 与 GitHub Release 也是 `0.16.2`。
- `docs/CHANGELOG.md` 尚无本轮 release section，且没有 `0.16.3` release filing/candidate。
- `v0.16.2..main` 是 202 files、约 `+30,692/-1,164`，包含新的 public CLI verbs、JSON contracts、MCP tools、Lease protocol、publication/feedback/inbox/Fleet surfaces；这不是 patch-only 修复。
- 上一份 `0.16.2` filing 明确以“没有新的 consumer-visible CLI verbs”为 patch 版本理由；本轮事实正相反。

因此默认 semver 裁决应为 **`0.17.0`**。当前 Head CI 已绿，说明产品实现具备 release-candidate 基础；但发布前仍需完成版本锚点、Changelog、release filing、tarball/full release gate、npm unpublished proof，以及发布后的 registry/tag/runtime readback。前端组件应建立在该稳定发布的 Fleet contracts 上。

## 明确不做

- 不把 UI、Operator SQLite 或 Cloudflare KV/D1 变成 workflow authority。
- 不在 Phase 1 自动启动/唤醒 Agent。
- 不从 task prose 推断 dependency/capability/priority/concurrency。
- 不让远端 Agent直接访问另一个主机的本地 `worktree_path`。
- 不通过公网 MCP 暴露通用 shell 或任意文件写入。
- 不让 Planner、Worker 或 GPT Pro 的 prose 代替 AcceptanceReceipt、Lease fence、provider facts 或人类 merge 决策。

## Source inventory

- Browser advisory：2026-08-23 ChatGPT conversation “Kanban与CLI对比分析”，关于两阶段产品、Cloudflare/Tunnel、Remote MCP 与 Local Worker Host 的讨论。
- `plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md`
- `src/cli/commands/fleet.ts`
- `src/core/fleet/board.ts`
- `src/effects/fleet/board.ts`
- `src/cli/mcp/fleet-tools.ts`
- `src/cli/mcp/transports/http.ts`
- `docs/researches/20260711-devspace-chatgpt-local-control.md`
- `deploy/release-checklists/260821-repo-harness-0.16.2.md`
- `scripts/check-npm-release.sh`
