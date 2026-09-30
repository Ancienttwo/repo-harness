# Plan: 多 harness Herdr 唯一运行时与任务级持久角色迁移

> **Status**: Executing
> **Created**: 20260930-0438
> **Slug**: herdr-task-agents-cutover
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Herdr task lifecycle composition, four-harness capability evidence, ownership-safe closeout and installed no-legacy readback
> **Rollback Surface**: Drain task participants, revert the atomic runtime/schema/managed-install cutover; no dual reader or fallback
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md`
> **Task Review**: `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md`
> **Implementation Notes**: `tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md`

## Agentic Routing
- Selected route: parent-agent:geju
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260930-0438-herdr-task-agents-cutover.md`
- Sprint contract: `tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md`
- Sprint review: `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md`
- Implementation notes: `tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260930-0438-herdr-task-agents-cutover.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260930-0438-herdr-task-agents-cutover.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md`
- Review file: `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md`
- Implementation notes file: `tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260930-0438-herdr-task-agents-cutover.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Drain task participants, revert the atomic runtime/schema/managed-install cutover; no dual reader or fallback
- **Verification boundary**: Herdr task lifecycle composition, four-harness capability evidence, ownership-safe closeout and installed no-legacy readback
- **Review/acceptance boundary**: `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260930-0438-herdr-task-agents-cutover.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md`, `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md`, and `tasks/notes/20260930-0438-herdr-task-agents-cutover.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260930-0438-herdr-task-agents-cutover.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Drain task participants, revert the atomic runtime/schema/managed-install cutover; no dual reader or fallback

## Captured Planning Output

## Goal and Authorization

以 Herdr 为 repo-harness 唯一的多 harness agent runtime，统一任务级角色、启动、通信、上下文、恢复、验收和清理。advisor / gatekeeper 属于任务，跨 owner 对话持续跟踪；任务交付后清理它拥有的活进程与 pane，保留可恢复的上下文和证据。

用户明确要求：全部统一到 Herdr；旧方式全面清退；不要兼容；worktree 在主仓库的 Herdr 分组下；写清同 workspace 多 pane 的协作规则。用户现已授权实现 → advisor-gatekeeper 验收 → Codex 开 PR。仅开 PR，不 merge、不发版、不推 main；不操作无关用户 pane 或进程。

## P1: Architecture Map and Observed State

核查基线：首次盘点为 `6af754ad`；实现已 fetch，隔离 worktree 从 `origin/main` 的 `43b7d72d`（PR #461）创建。存在两项与本任务无关的已有 dirty 文件：`docs/verification/axr5-archctx-clean-room-readback.json`、`tasks/archive/notes-20260820-1810-20260622-repo-harness-codegraph.md`。保留原样；实现时从 main 建隔离 contract worktree。

| Boundary / authority | Current entrypoint | Observed behavior / gap |
|---|---|---|
| 主任务与 worktree | `scripts/contract-worktree.sh:580`；`.ai/harness/policy.json#worktree_strategy` | Git 创建、验证、publication、删除已有 authority；目录模板是 `../{{repo}}-wt-{{slug}}`，没有统一的 Herdr workspace 注册/注销 |
| Herdr transport | `src/effects/terminal/herdr.ts` | 显式 named session、隔离继承的 HERDR 环境、bounded CLI、JSON 结果验证；尚未覆盖 task-role 生命周期 |
| Claude acceptance | `src/effects/review/claude-review-session.ts:254`；`claude-review-host.ts` | 已有 Herdr、进程 identity、request/result、三轮同进程、status/close/cancel；schema 与 provider 固定 Claude，独立 task server 脱离主 workspace 分组 |
| Outside review | `src/cli/index.ts:846`；`src/effects/review/cross-review-runner.ts:234` | `codex` 独立 `runProcess`；`codex-plugin` plugin companion / app-server；未进入 Herdr task lifecycle |
| 外部规划 / PRD | `assets/skills/claude-plan/SKILL.md:220`；`assets/skills/repo-harness-product/references/prd.md:23` | Skill 直接运行 Claude CLI，含 provider retry / transcript 猜测恢复；任务角色不能持续复用 |
| Native delegation | `.ai/harness/policy.json:268`；`src/cli/hook/subagent-handler.ts` | Codex spawn_agent / Claude native subagent 是当前首选；角色/模型观测依赖 SubagentStart；latest state 不等于 task durable context |
| Durable delegated run | `src/effects/engineers/delegated-run-store.ts:889`；`src/core/engineers/delegation.ts:224` | intent/admission/receipt 可复用，执行仍 direct Codex，runtime_kind 固定 codex_exec |
| Contract / Campaign | `scripts/contract-run.ts:110,729`；`assets/templates/helpers/contract-run.ts` | raw worker-command / verifier-command 及 campaign codex-exec 绕过 Herdr；bounded verifier 的普通测试命令不属于 agent transport |
| MCP | `src/cli/mcp/tools.ts:501`；`process-sessions.ts`；`session-store.ts` | opt-in run_agent_goal 与 Codex goal 文档仍绑定直接 CLI；owner/workspace/persistence 边界须保持，不扩大远程执行授权 |
| Agent Runtime | `src/core/engineers/agent-runtime-effect.ts:29`；`agent-runtime-feature.ts:21` | 仍有 codex-app-thread 与 herdr-cli-agent 两个 backend；Herdr 当前仅 notify_inbox / wake_for_offer |
| 指引与安装 | `docs/reference-configs/global-working-rules.md:69`；`agentic-development-flow.md`；`external-tooling.md`；`scripts/install-agent-fleet.sh` | 已有显式 session、scrollback 三层、prompt timeout 禁重放；缺少 task 持久角色、root/worktree 分组与统一 cleanup。native profile、plugin inventory/readiness/install 仍投影旧路径 |

本地 CLI 报告 Herdr 0.9.1；codex / claude / opencode / pi 均有可解析 executable，尚未验证登录、模型、权限或真实 agent 会话。已核对 `herdr --skill` 和各 relevant `--help`。截图和一次 read-only workspace inventory 显示：hegui-agent 主 workspace 与 frontend-lag linked workspace 通过同一 repo_key/common-dir 分组，worktree 物理目录仍在主 repo 旁边。`pane current` 返回 pane_not_found，不能把本次工具进程当作已识别的当前 pane；本次不据此控制 focused session。

系统边界：repo-harness 管理/安装/生成的 agent 启动和协作路径，以及它拥有的 task runtime state。Herdr 自身负责机器/session/workspace/tab/pane/agent 的 live authority；Git 负责 checkout/branch/common-dir；plan/contract 负责 scope；现有 claim、消息、acceptance 和 publication artifacts 继续负责业务 authority。

强依赖：Herdr API/CLI、实际 harness executable 和它的权限/session 协议、Git、已配置角色/模型。弱依赖：用户 TUI 当前 focus、pane 可见文字、显示 badge；不能作为正确性条件。Out of scope：普通 Git/Bun/测试工具子进程、外部用户自管 agent/插件、Herdr UI 本身、无关 architecture dead-letter/模型分组问题、模型更换、费用或 review budget 放宽。

## P2: Concrete Trace and Pressure Points

1. 现行 cross-review：CLI provider enum → scope capture / admission → invokeProvider → direct Codex 或 plugin child → transcript classifier → advisory PASS/FAIL/SKIPPED。压力点是 provider invocation 绕过 task session，不可跨 owner 会话复用或统一清理。
2. 现行 acceptance：contract/evidence → runClaudeReviewRound → 创建 owned Herdr server/workspace → Bun host → Claude stream-json request/result → identity 验证 → AcceptanceReceipt → close。它证明持久 protocol 可行，但根 topology、task role store 和 schema 仍为 Claude 专用。
3. 目标真实路径：approved task / canonical repo root → contract-worktree start（Git authority）→ Herdr worktree open 关联已创建 checkout 与 root workspace → task-agent start advisor/worker/gatekeeper → 返回 opaque IDs 与 provider session binding → task-scoped send/request → ACK / result artifacts → owner 跨对话恢复，status/read 后继续同一角色 → subject-bound 验证与 acceptance → publication readback → owner 关闭 task-owned children/panes → worktree cleanup → 无 live task participants。任何一步 uncertain delivery / identity mismatch / stale subject 均不得合成成功或创建替代 session。
4. 截图中的多个前台 agent 位于同 workspace 的不同 pane。一个 pane 只容纳一个前台 agent；同 pane 内 shell/host/provider child 的协议归 host 所有，其他 agent 不能向其 stdin 任意贴文本。不同 pane 的逻辑通信是 agent prompt 和 task 文件；不假定共享模型 context window。

输入 source of truth：task/contract identity 与当前 revision；role profile 与选择的 harness；Git common-dir 和 Herdr live IDs；request ID 与当前 subject/evidence。异步边界：pane/start/readiness、prompt submission、provider turn、result publication、shutdown。错误路径：blocked/unknown、timeout 已可能投递、owner 重启、PID 被复用、pane occupant 更换、remote 分区、publication 后 cleanup 拒绝。

## P3: Design Decision — One Herdr Runtime, No Compatibility

### Thesis / confidence / frame-opening move

采用 zero-legacy / end-state backcasting：任务拥有持久的角色集合；Herdr 是唯一 agent hosting 与寻址层，harness 是角色的 runtime 参数，不再是每套工作流的分支。对目标模型 confidence HIGH；对当前四个 harness 的 session resume / read-only capability confidence 尚未验证，必须在首个 proof point 观测，不能从 Herdr detection 或 executable 存在推断。

当前形状的真实约束是：read-only、exact subject/evidence、任务 admission、one-writer、provider identity、unknown delivery 不重放和 identity-safe cleanup。这些保留。native-child/plugin/Claude 专用宿主历史不是要保留的兼容 contract。统一意味着删去旧调用和 reader，而非在前面再包一层 Herdr 然后保留隐藏 direct backend。

| Option | Cost / outcome | Decision |
|---|---|---|
| Conservative path：旧 runner + Herdr 可选 | dual authority，恢复与清理仍分裂 | Reject |
| Clean target：唯一 task-agent / Herdr，原子 cutover | CLI/schema/install breaking change，需要明确 drain | Recommended |
| Staged clean path：实现任务顺序分步，单一候选 merge 一次切换 | 中间仅在隔离 branch 验证，发布后无双轨 | Execution order only |

10x 首先受影响的是 live provider/pane 数量、context export 成本和 owner 同时发起请求的竞争。保留现有 max_agents / depth / review budget，task-role 唯一键防重复启动，bounded read 和按 revision 增量 context；不引入 scheduler、队列集群或自动轮询全机器。

### Canonical task-agent boundary

扩展 `src/effects/terminal/herdr.ts` 为唯一 Herdr CLI 调用面；在现有 delegated-run / collaboration authority 上增加 task-role session binding，不另建第二套 task/claim/message authority。跨 review、consult、worker/MCP 的 persistence 属于真实共享 invariant，允许一个 task-session 模块和一个 typed task-agent CLI；实现应优先提取现有 Claude lifecycle 能力而不是复制。

唯一外部任务运行接口：`repo-harness task-agent start|send|read|status|close|cancel`。其中 start 必须绑定 task 与 role；send 必须绑定 request 与 purpose；read/status 是只读。cross-review 和 generic acceptance `review round|status|close|cancel` 为此接口的 domain consumer，不能再拥有各自 provider launcher。MCP 暴露同一 typed lifecycle，不接入任意 shell launcher。

配置/数据采用 `runtime=herdr` + Herdr `harness kind` + task role profile，删除 host=Claude/Codex 决定 runner 的分支。harness kind 取自选定 server 的官方 capability/CLI contract；不是 repo-harness 自己维护另一份全量枚举。权限、model、effort、resume/session ID、structured result 仍由各 harness 官方能力提供；无法证明时 fail closed，不能靠标题、regex 或本地默认合成。任务/角色数据 schema 不允许 Codex/Claude 专有字段成为顶层公共 authority。

保留现有 role/model 配置选择，不改变模型。advisor 是任务实例名，其 persona 可选择现有 deep-reasoner；gatekeeper 复用已有 gatekeeper persona。role 内容只有一个 authoring authority，harness 配置为确定性投影。四种本地已安装 harness（Codex / Claude / OpenCode / Pi）都必须验证通用 start/send/read/status/close；需要 read-only/acceptance 的角色只允许经该 harness 权限探针证明的能力，缺失能力返回 unsupported，禁止切换另一 harness 顶上。框架接纳 Herdr 支持的其他 kind 时不改公共 task schema。

### Topology and ownership

- mainpath 指 canonical Git primary checkout，不要求 root workspace 当前 branch 一定是 main，也不自动 checkout 用户正在使用的 branch。
- linked task checkout 在主 repo 的 Herdr group 下展示。用 Git common-dir / Herdr repo_key 验证归属，不按 label/sidebar 序号猜测。物理 path 继续采用现有 sibling 模板；Git branch 名保持 contract policy 的前缀，不能把“分支属于 root”误写成 Git branch 的父子结构。
- `contract-worktree start` 仍是唯一 checkout 创建 authority；用 `herdr worktree open --workspace <verified-root> --path <checkout> --no-focus` 注册已经创建的 checkout，不用 worktree create 再创建一次。回读关联、cwd、common-dir 和 opaque IDs，失败记录 partial intent 并可 reconciliation。
- 用户现有 root workspace 只关联，不 claim ownership。任务用 linked task workspace；只读 advisor / gatekeeper 是该 workspace 的 sibling panes。需要写不同 worktree 的 worker 在对应 linked workspace；文件 ownership 仍以 contract/claim 为准。
- 任务键至少绑定 repo identity、task/contract identity；role instance 再绑定 role/profile revision。一个 task-role 一个 live binding。登记 machine/session、workspace/tab/pane、agent name、provider session ID、owner scope、创建/关联 disposition、request/last-result revision 与必要 process identity。这些是对 Herdr/provider live authority 的绑定证据，不是第二份 live status。
- 保留已创建 task workspace 直到 publication/cleanup 条件满足；外部 session 必须显式选择，禁止 focused-default。Local 和 mini 的 IDs 不互通，每次读取/发消息沿同一 machine selector。

### Persistence and context protocol

- advisor、gatekeeper 可持续整个 task，不在单次请求或 owner 的 Stop 时销毁。start 幂等，owner 新对话只 attach/status/read；角色复用 provider session，不丢弃跟踪事项。角色修改 profile/model 或 task identity 变化需显式 supersede，不能悄悄替换。
- context packet：Goal / Why、scope 与 forbidden areas、task/contract/plan 路径和 revisions、允许工具和权限、已有 decision/findings 的 open/resolved disposition、当前 subject/evidence SHA、当前 request ID、返回 contract。只发增量与 artifact refs，不复制整仓/无限 transcript。EXECUTION_BOUNDARY 只由最终 task packet renderer 注入一次；native SubagentStart、skill prose 和 MCP goal 不再重复注入。
- 持久 artifacts 放在 `.ai/harness/runs/` 的 task-owned 目录，角色 binding / ordered requests/results / context checkpoint 必须 crash-safe；不得只存在 JS Map、latest.json、单次 tool reply。durable 可复用结论在关单时提升到 repo 指定的人读文档。
- 三层读取：Herdr recent-unwrapped 输出 → 精确绑定的 provider transcript/export → model live context 不可读取。终端只是观察证据；截断或缺失须标明。需要完整结果时由同一 role 输出指定 artifact，并绑定 request、task、subject；禁止按“最近修改的任意 transcript”恢复结果。
- 通信先 status/get/read 确认 target identity。`agent prompt <explicit-target>` 只投递 task request/ref；agent 回复携带 request ACK、result ref 和 revision。Herdr idle/done / --wait 不是 request ACK、更不是验收；working 时不把当前轮结束误认新请求完成。
- 同 role 请求串行，busy/blocked/unknown 留待 owner 处理。timeout 先回读相同 request 状态；投递未知不得自动重发或开启新 pane。既有 collaboration message store 可用时复用其序号/去重，不另造消息总线。
- owner 重启、provider 死亡、server 重启分别处理。provider 已死可显式从验证过的 session ID resume 并记录新 incarnation；不保证仍是旧 PID，不静默新建空 session。resume 能力缺失则报告 cannot_resume，保留 checkpoint，等待显式 recovery。持久上下文不等于进程永不退出。

### Review and acceptance invariants

advisor 无权验收/提交；gatekeeper 只读并持续跟踪 findings；owner 执行修复和 terminal actions。advisory outside review 与 acceptance receipt 保持语义分离，但共享 hosting/session/context。acceptance 的 task/goal/subject/target/evidence binding、read-only proof、review budget 与 merge-gate 无回退。

gatekeeper 活着不等于每次变化都运行新 semantic review；沿既有 authorized acceptance-round budget 连续跟踪。持久角色或重新 attach 不能重置 work-package admission / 三轮上限 / review budget。host-specific reviewer/source enum 替换为 generic harness/role/provider-session provenance；旧格式只经一次明确的 artifact/schema migration，生产 reader 不接受双格式。不得把 pane 字样、运行模型 label 或 transcript PASS 变成有效 Receipt。

### Completion and cleanup

分清三个时点：role turn 完成保留 session；任务 checkpoint/commit 不销毁持续角色；用户要求的最终交付完成且验收/publication readback 完成才 task cleanup。Draft PR 已提交但未合并：停止不再需要的 task-owned provider/panes，保留 evidence/checkout/branch 供 PR 修复显式 resume；已有 `finish --no-merge` 的 worktree 保留语义不变。local merge / merged PR 的 checkout/branch cleanup 按现有 Git 证明执行。

顺序：冻结 result/context checkpoint → 确认可关闭的 task-owned roles → graceful shutdown / 有界等待 → 精确 identity 的 escalation → 验证 provider/host exit → 关闭仅本 task 创建的 pane → 确认 workspace 无用户/其他 task occupant → 注销/关闭本 task workspace → 原有 contract-worktree cleanup → final receipt。任何步骤未知返回 cleanup_pending 和精确重试命令，不报全部完成。

cleanup 由 owner/parent 执行；不能先关闭正在报告的当前 pane 再期待它继续执行。共用用户 root/session/server 永不停止，禁止 group close/全局 kill/killall/force worktree remove。cancel 是停止与保留证据，不能生成 acceptance。跨 owner recovery 只清理有绑定与 identity proof 的对象；PID/agent name/label 被复用即拒绝。用户 pane、额外工作区、mini 其他任务必须在 sentinel canary 中保持存活。task 工作已结束时活进程计数为零、task-owned panes 不残留；保留的文件/branch 不算活进程。

### Retirement / one-shot cutover

删除并迁移所有 repo-harness managed 调用方：native subagent/spawn_agent routing/advisor 及 SubagentStart 专用身份 authority；独立 codex-exec / claude -p runner；codex-app-thread runtime backend；codex-plugin provider、companion 发现/install/readiness；claude-plan 专用执行 skill；claude-review 专用 CLI/schema/host；caller-supplied agent worker-command/verifier-command；MCP Codex 专用 goal/runner；旧 fallback / aliases / shadow parsers。

新调用语义：`cross-review --harness <kind>`、generic `review`、task-agent 计划咨询（purpose=plan）、generic task-goal MCP 文档。旧 `--provider`、`codex-plugin`、`claude-review` 和已移除工具名不做 alias；输出明确升级说明。normal verifier command / Git / test subprocess 仍是普通工具，不被误当另一 agent runtime。provider 在 Herdr pane 内由受管 host 启动其官方协议是允许的；在 Herdr 外启动受管 agent 是禁止的。

一次性升级：先列出/排空旧 active sessions，保留前一版本用于关闭旧进程；新 cutover 拒绝有未排空 ownership 记录。历史 receipts/transcripts 归档只读；不翻译 opaque endpoints、PID/session identity 或伪造 acceptance。policy/schema 和所有 installer/template source 同步切换，新版本只读新格式。安装器仅删除有 manifest ownership proof 且未被用户修改的旧 managed files；自管 plugin 和用户配置不得以“清退”为由全局卸载。无 runtime fallback。rollback 是排空新任务后回滚完整版本/config，不是重新启用两套 runtime。

## Implementation Ownership and File Changes

| Surface | Work / owner boundary |
|---|---|
| `src/effects/terminal/` + existing session/delegation core/effects | 共享 typed Herdr lifecycle 与 task-role binding；允许最小新增 task-session module / CLI，替代旧 exclusive 实现 |
| `src/cli/commands/` + `src/cli/index.ts` | task-agent、generic review、cross-review harness CLI；原子移除旧 provider/options/commands |
| `src/effects/review/` + `src/core/review/` + acceptance writer/verifier consumers | 复用并泛化 lifecycle/Receipt provenance；删除 Claude/plugin 专用 authority |
| `src/core/engineers/` + `src/effects/engineers/` + `src/effects/automation/` | task participant/role 配置、delegated run/campaign 唯一 Herdr；删除 codex-app-thread 和 codex_exec runtime discriminator |
| `src/cli/hook/` / `assets/hooks/` | SessionStart task participant 恢复指引；去掉 native-child launcher/model authority；无 provider/模型证明时保持 unverified |
| `scripts/contract-worktree.sh` / `scripts/contract-run.ts` / `assets/templates/helpers/` | root-linked workspace 注册/closeout；受管 agent 启动与普通 verification 区分；source/projection 同步 |
| `src/cli/mcp/` | task-goal 和 Herdr lifecycle；保持 enabled/owner/workspace/auth 边界，退役直接 dev-runner |
| `agents/fleet/` / `.codex/agents/` / `.agents/fleet/` / installer source | 单一 logical role authority 和多 harness 投影；退役 managed native dispatch 配置，保留用户 owned 内容 |
| `.ai/harness/policy.json` / policy seeds 与 adoption defaults / `assets/workflow-contract.v1.json` / `.ai/harness/workflow-contract.json` | 只保留 Herdr 运行策略、新 schema 与 explicitkind/capabilities；无旧 enum/默认 runner/fallback |
| `assets/skills/` / `assets/skill-commands/` / `docs/reference-configs/` / READMEs | 更新全部受管 launch 路径、pane guideline、context/ACK、persistent roles、cleanup 与升级命令；投影 installed Codex/Claude guidance |
| `.archcontext/model/` / `docs/architecture/` | 经 archctx plan/apply 更新真正受影响职责/flows，再 projection；不因 package 目录新增无关 capability |
| `tests/` / `docs/researches/` / `tasks/` | 聚焦行为证据、cutover inventory、可复用结论与任务收尾 |

每个实现 runner 只拥有其 contract 显式 allowed_paths，一文件一 writer；其他 agent 不可 revert 他人修改。新 dependency：无。新文件准入：task-role persistence 是 review/consult/delegation 共享 invariant，generic CLI 是用户操作边界；最多一个独立 composition test 用于跨 owner 持久恢复与 cleanup，其余扩展已有测试。不得新建万能 manager、第二套消息 store、mock Herdr 协议或 benchmark authority。

## Verification and Acceptance

先做真实 Herdr + deterministic provider 验证，不用模型 judgment 证明生命周期。C0 至少确认：root 关联 linked task；advisor 和 gatekeeper 不同 harness；owner 进程结束后角色仍在；新 owner 从 artifacts 找回同 task/session 并增量跟踪；结束后仅 task-owned 进程/pane 归零，sentinel 不变。不借用/关闭用户活跃 pane 做测试；用明确 owned 的 disposable session 与 fixture repo。

重点 case：重复 start/并发 send、request ACK 与 busy 原 turn 误匹配、截断 read、stale subject、owner crash 各 intent 窗口、provider 死/resume、PID 重用、pane occupant 变化、publication 成功 cleanup 失败、remote timeout 未知投递、未授权 workspace/跨 repo、只读角色写入拒绝、budget 不被 attach 重置、migration 拒绝旧 state、缺失 Herdr 不启动任何替代 runner。

已有测试入口：`tests/herdr-transport.test.ts`、`tests/claude-review.test.ts`（迁移后改为 generic review 行为文件）、`tests/cli/cross-review.test.ts`、`tests/contract-run.test.ts`、`tests/contract-worktree.test.ts`、`tests/contract-worktree-closeout-journal.test.ts`、`tests/contract-worktree-squash-cleanup.test.ts`、`tests/cli/delegation.test.ts`、`tests/unit/me2a-me3b-read-only-delegation.test.ts`、`tests/cli/mcp-process-sessions.test.ts`、`tests/unit/herdr-peer-harness.test.ts`、`tests/global-working-rules-distribution.test.ts`、`tests/check-agent-tooling.test.ts`、`tests/skill-surface/cross-review-package.test.ts`、`tests/herdr-runtime-pin.test.ts`。扩展拥有边界的文件；移除只覆盖已删除 native/plugin 行为的测试而非保留空 compat 测试。

新增 composition file 仅当现有 Herdr/session 测试无法完整拥有 task+owner+worktree 组合时准入。触发/observable gap：旧 owner 退出不应清空 advisor/gatekeeper、旧 context 不能绑定新 task、cleanup 不能杀 sentinel；最低层是真实 Herdr 和文件/进程边界，unit mock 证明不了。预算先记录 setup / 运行耗时，再写 contract 唯一 JSON Verification Plan；不在 plan 臆造测试成本。

真实四 harness smoke：本地 available/authenticated 者分别 start/send/read/status/close；分别验证权限和 session 恢复，未验证字段不声称支持。mini 档案指向用户真实 default session，未获远程 canary 授权：本任务记为未闭环，不运行，不 add/enable/disable machine 档案，不回退 Local；需要远程 canary 时由 advisor-gatekeeper 转用户授权。实际模型轮次只用于协议/真实 adapter acceptance，不用重复询问多个模型模拟工程 gate。

迁移后源码 CLI、tarball clean install、user-level guidance 和 fixture adoption 均须验证唯一 Herdr 路由；`init --dry-run`和 fixtureapply 同 TS operation model。退役证明以当前 active 产品调用图、生成 artifacts 和 runtime 测试为准；归档历史文档/测试 fixture 里的旧 token 不算残余运行路径，静态字符串计数不能替代调用路径检查。

实现所需 repo integrity（保留原有 CI/releasegate，不增设无依据 full-suite）：

```bash
bun run check:hooks
bun run check:helpers
bun run check:reference-configs
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

按切片运行 named focused test 后共享 canonical 证据，gatekeeper 读证据与 diff，不独立重复完整测试。必要 realHerdr expensive lane 是本任务 explicitruntime 验收，不以 changedfilecount 触发 fullsuite。所有未验证平台/adapter 明确记录，不能用 ready/readiness 替代 agent 行为。

完成判据：全部受管 agent 路径只能到 Herdr；公共 task/role/session schema 不含 host 专用 runtimeauthority；四 harness 通用协议与所声明 capabilities 有实际证据；advisor/gatekeeper 跨 owner 对话同任务持久跟踪；linked worktree 正确 root 分组；通信/context 指引已投影到 managed 安装；publication 后 cleanup 可证明且 sentinel 不变；新 reader 拒绝旧格式，安装器无兼容模式；requiredchecks 与 artifact / installed smoke 通过。

## First Proof Point / Falsifier / Risks

First proof point 是 C0 的两个不同 harness 持久角色+owner 恢复+root-linked worktree+cleanup 的完整 trace。它足以证明统一边界承担真实需求，而不是先迁一批 skill 文案再发现 runtime 不成立。

Falsifier：Herdr 公共 API 无法绑定/回读 root-linked topology 或 task-owned identity；至少一个目标 harness 无法提供本任务必须的 permission/session/result 能力。出现时停止相关支持声明，记录缺失官方能力和最小补足点，修正 plan；不恢复旧 runner，不使用 terminal text 伪造 receipt。

风险：多 harness session resume 与 read-only 证明差异、sharedserverownership、旧 schema 持久 record 排空、remote 分区、installerownership，以及 full cutover 影响 hooks/model 观测。用明确 typedcapability、startintent、请求串行、owneridentity、sentinel、drain 与 atomicrelease 处理。持久 taskrole 不承诺无限存活或读取其他模型隐含 context。

## Workflow and Next Action

H0-H6 是同一原子 cutover work-package 的有序 checklist，不为每个 red/green step 生成新 plan；若实现暴露独立 publication/rollbackboundary，先明确调整工作包，而非产生长期双轨。预期 contract/review/notes 路径由 capture-plan 头部给出；tasks/todos.md 仍仅 deferredledger，不重复本 checklist。

下一步：在实现获准后使用已保存 plan 投影 contract 与隔离 worktree；H0 在隔离 ownedHerdr 环境验证首个 proofpoint。完成候选后使用 repo-harness-check 按 contract 唯一 VerificationPlan 验证；按当前实现授权执行；H0、H1、H4、H5 完成后提交 SHA 和 canonical 验证证据给 advisor-gatekeeper，收到 PASS 后才继续。rollbacksurface 是完整 cutover 候选版本及 managedschema/安装投影；旧、新两侧均须先 drain 任务，保留历史证据，不在运行时引入兼容 reader。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] H0 — 封闭退役 inventory 与真实 proof point：四 harness 能力矩阵，root-linked worktree，两个持久角色，owner 退出/恢复和 identity-safe cleanup；锁定 Herdr 最小版本与官方 capabilities。
- [x] H1 — 提取唯一 Herdr task-agent 生命周期与持久 role binding；start/send/read/status/close/cancel、context checkpoint、ACK、唯一 packet 注入；保留 scope/permission/budgetauthority。
- [x] H2 — 将 contract-worktree start/finish/cleanup 接入 root-linked Herdr topology 与 task-owned 清理；publication 与 cleanup 分别证明，retry 只重试未完成阶段。
- [ ] H3 — 迁移 advisor/worker/gatekeeper、delegation、campaign 与 MCP 到同一多 harness 协议；移除 native-child、codex_exec、codex-app-thread、raw agent command 旁路；跨 owner 恢复测试。
- [ ] H4 — 迁移 outside review、acceptance、plan/PRDconsult 到 taskparticipants；泛化 reviewerprovenance，删除 plugin/Claude 专用 launchers 与旧 CLI/skill；验证相同 scope、reviewbudget、Receipt、merge-gate。
- [ ] H5 — 原子切换 policy/schema/installer/templates/hooks/roleprojections 与 managedguidance；写 pane/context/cleanup 指引；one-shot drain 与 archive，拒绝所有旧 active 格式，证明无兼容/别名/fallback。
- [ ] H6 — 真实四 harness 及 owned Local composition canary（mini 未授权，记录未闭环）、tarball/install/adoption smoke 和 required integrity；记录退役调用图，更新 architecture 与人读文档，按 publication/cleanup 封闭任务。

## Execution Agreement (REQ-1)

- advisor-gatekeeper 是 default session 的 `w8:p2`；仅通过 `herdr agent prompt advisor-gatekeeper "[REQ-n] ..."` 联系。`w8:p1` 属于无关 archctx 工作，不读取、不投递、不控制。大块材料写 task-owned 文件，只发送路径。
- H0–H6 按顺序各一个 commit；contract 的 allowed_paths 和 JSON Verification Plan 逐 H 更新，focused checks 通过再前进。H0、H1、H4、H5 等 advisor-gatekeeper PASS。
- 每个 H 结束在 notes 追加非显而易见的决策、偏差和未决项，不把 notes 变成命令流水日志。
- 真实 Herdr 测试仅用唯一 disposable named session，清除继承的 HERDR_*。fixture 控制/cleanup 对 default session 硬拒绝。安装/adoption smoke 使用 fixture HOME + repo，不更改真实 ~/.codex、~/.claude。
- mini canary 未授权，保留明确未闭环项；主 checkout 不 pull / checkout / stash；既有两项 dirty 文件保留。
- PR 必须列 rollback、验证证据、mini 和未认证 harness 能力；commit/PR 不加 AI 署名。
