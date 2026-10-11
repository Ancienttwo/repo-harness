# runtime-harness/hook-adapters 架构文档
<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-hook-adapters" sourceDigest="sha256:ab5f9fbad571e4793a5e0baadca48c9bbaadc515326b40a1c7560e2808fd99b0" rendererVersion="archcontext.docs-renderer/v5" outputDigest="sha256:96227e1781f26d95d109010881055b70cbfedcdcc9e2404160ab3106a55bd418" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.hook-adapters`(kind `capability`)
> **Matched Prefixes**:`assets/hooks/**`、`.ai/hooks/**`、`src/cli/installer/**`、`src/cli/hook/**`、`src/cli/hook-entry.ts`、`src/pi/**`、`src/core/loop/**`、`src/effects/loop/**`、`src/core/hook-work-budget.ts`、`src/effects/hook-event-log.ts`、`src/effects/run-summary-retention.ts`、`src/cli/commands/install.ts`、`src/cli/commands/status.ts`、`src/cli/commands/security.ts`、`src/cli/commands/hook.ts`、`src/cli/commands/prompt-guard-decision.ts`、`scripts/sync-hook-sources.ts`
> **Local Contracts**:`assets/hooks/AGENTS.md`、`assets/hooks/CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Installs and runs typed Claude, Codex, and Pi host hook routes.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_hook_adapters_75a11743["Hook Adapters"]:::component
  p1_component_hook_adapters_edit_guards_019fd22c["Guard and Observer Handlers"]:::component
  p1_component_hook_adapters_host_installer_cd378e80["Host Adapter Installer"]:::component
  p1_component_hook_adapters_primary_1659ffb9["Hook Route Runtime"]:::component
  p1_component_hook_adapters_session_lifecycle_e389d412["Session Lifecycle Handlers"]:::component
  p1_component_hook_adapters_edit_guards_019fd22c -->|"Implement the typed handler contract and read hook input through the shared parsers"| p1_component_hook_adapters_primary_1659ffb9
  p1_component_hook_adapters_host_installer_cd378e80 -->|"Project the route registry into managed adapter entries and invoke the runtime for hook-lib and Pi events"| p1_component_hook_adapters_primary_1659ffb9
  p1_capability_runtime_harness_hook_adapters_75a11743 -->|"Dispatch a host hook route to its typed handler"| p1_component_hook_adapters_primary_1659ffb9
  p1_component_hook_adapters_primary_1659ffb9 -->|"Bind guard and observer routes to their typed handlers and run the guard CLIs from the hook entry"| p1_component_hook_adapters_edit_guards_019fd22c
  p1_component_hook_adapters_primary_1659ffb9 -->|"Bind SessionStart and Stop and subagent and inbox routes to their typed handlers"| p1_component_hook_adapters_session_lifecycle_e389d412
  p1_component_hook_adapters_session_lifecycle_e389d412 -->|"Drain the post-edit journal at Stop and render the minimal change context"| p1_component_hook_adapters_edit_guards_019fd22c
  p1_component_hook_adapters_session_lifecycle_e389d412 -->|"Implement the typed handler contract and read state through the event-scoped collector"| p1_component_hook_adapters_primary_1659ffb9
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:a2a008a7505889f1e9cc7e66b83f7e36c226e4d37940f7f0b088605ea09cb6a4`).
- Semantic nodes: `5`; declared relations: `7`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.hook-adapters.primary` | `src/cli/hook/runtime.ts#runHook` | `sink.hook-adapters.primary` → `src/cli/hook/handler-registry.ts#getHandlerForRoute` |

### 1.3 規模信號

- 規模量級:`50–100` 個文件 / `10k–20k` 行
- 匹配前綴:`assets/hooks/**`、`.ai/hooks/**`、`src/cli/installer/**`、`src/cli/hook/**`、`src/cli/hook-entry.ts`、`src/pi/**`、`src/core/loop/**`、`src/effects/loop/**`、`src/core/hook-work-budget.ts`、`src/effects/hook-event-log.ts`、`src/effects/run-summary-retention.ts`、`src/cli/commands/install.ts`、`src/cli/commands/status.ts`、`src/cli/commands/security.ts`、`src/cli/commands/hook.ts`、`src/cli/commands/prompt-guard-decision.ts`、`scripts/sync-hook-sources.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `component.hook-adapters.primary` — Dispatch a host hook route to its typed handler

入向關係:

- `calls` ← `capability.verification.acceptance-review` — Admit at most one persistent semantic review session per work package through the circuit breaker
- `calls` ← `component.contract-assets.template-projection` — Read the install profile and project skills during init
- `reads` ← `component.evals-checks.evals-and-benchmarks` — Read hook event telemetry records to measure hook cost in profile benchmarks
- `calls` ← `component.global-runtime-reconciliation.archctx-closure` — Write the private global configuration through the installer ownership writer
- `calls` ← `component.global-runtime-reconciliation.cli-root` — Register the install and status and security and hook commands and run host transactions with the install profile
- `calls` ← `component.global-runtime-reconciliation.primary` — Install host adapters and project skills through the install profile under the host lock
- `calls` ← `component.mcp-sidecar.host-setup` — Reuse installer configuration ownership receipts and the runtime host lock
- `reads` ← `component.operator.activity-feeds` — Read the hook route registry and install profile components for the Hooks and Agents pages

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:a2a008a7505889f1e9cc7e66b83f7e36c226e4d37940f7f0b088605ea09cb6a4`); selectors `5/5`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_host_installer_e130a8f7 as Host Adapter Installer
  participant p2_route_runtime_281dbb1e as Hook Route Runtime
  p2_host_installer_e130a8f7->>p2_route_runtime_281dbb1e: Read the ordered routes for one host
  alt One managed adapter entry exists per selected route in registry order
  p2_host_installer_e130a8f7->>p2_route_runtime_281dbb1e: Build one adapter entry per route that the install profile selects
    Note over p2_host_installer_e130a8f7: Write the user-level host configuration
  else An installed projection differs from the registry
  p2_host_installer_e130a8f7->>p2_route_runtime_281dbb1e: Rebuild the expected entries for the comparison
    Note over p2_host_installer_e130a8f7: Report the drift in status without a rewrite
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_capability_4262990f as Hook Adapters
  participant p2_route_runtime_281dbb1e as Hook Route Runtime
  participant p2_edit_guards_5119ddfa as Guard and Observer Handlers
  p2_capability_4262990f->>p2_route_runtime_281dbb1e: Resolve the typed handler for the route
  alt The typed handler returns a structured result
  p2_route_runtime_281dbb1e->>p2_edit_guards_5119ddfa: Run the bound handler such as the PreToolUse.edit mutation guard
    Note over p2_route_runtime_281dbb1e: Shape the host output and append one telemetry record
  else An unknown route or unbound handler fails closed
  p2_capability_4262990f->>p2_route_runtime_281dbb1e: Return the route failure
    Note over p2_capability_4262990f: Return typed failure
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_route_runtime_281dbb1e as Hook Route Runtime
  participant p2_session_lifecycle_f33a8ef2 as Session Lifecycle Handlers
  participant p2_edit_guards_5119ddfa as Guard and Observer Handlers
  p2_route_runtime_281dbb1e->>p2_session_lifecycle_f33a8ef2: Run the stop handler under its declared effect contract
  alt Pending post-edit events are consumed inside the Stop work budget
  p2_session_lifecycle_f33a8ef2->>p2_edit_guards_5119ddfa: Consume the pending post-edit journal events before the deadline
    Note over p2_session_lifecycle_f33a8ef2: Refresh handoff and resume projections and exit 0
  else A journal failure becomes a diagnostic and Stop continues
  p2_session_lifecycle_f33a8ef2->>p2_edit_guards_5119ddfa: Catch the journal error and keep the unconsumed events for the next Stop
    Note over p2_session_lifecycle_f33a8ef2: Write a PostEditJournal line to stderr and exit 0
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-hook-adapters" -->
## 3. P3：设计决策与不变量

### 3.1 必须保持的不变量

1. **一条公开 tuple → 一个 typed handler → 一个 host-output 边界。** `Route` 接口（`route-registry.ts:54`）根本没有 `scripts` 字段，结构上排除了第二 dispatcher。
2. **adapter 命令是信封，不是逻辑。** 任何写进 `~/.claude/settings.json` / `~/.codex/hooks.json` 的分支判断都是回归 —— host 配置无法被测试、无法被原子替换。
3. **ROUTES 顺序是稳定契约。** Codex 按 `(absolute-path, event-snake, i, j)` 哈希 adapter 条目，重排会重新弹出信任提示（`route-registry.ts:14-16`）。新增 route 只能追加。
4. **handler 不碰 fd。** `HookHandlerResult` 是 handler 的唯一出口，`hostOutput()` 是唯一入海口。Codex 与 Claude 的输出语义差异只能在这一个函数里表达。
5. **opt-in marker 是硬门。** 没有 `.ai/harness/workflow-contract.json` 就静默退出 —— 装了 CLI 的用户在非 harness 仓库不应付出任何代价。
6. **`assets/hooks` 是 canonical root，`.ai/hooks` 是投影。** `.projection.json` 的 digest 与 file_count 是漂移检测，不是备份。
7. **遥测非安全权威，但消费者 fail-closed。** 字段缺失、畸形、重复或混协议时消费者必须停，不得补零。
8. **Hook 不做架构工作。** Hook 不记录架构漂移，不运行投影，不写 capability 块。架构更新在 PR 里显式完成：ChangeSet 加 `architecture-projection apply`。

### 3.2 关键权衡

| 决策 | 权衡 |
| --- | --- |
| PostToolUse.edit 只写一条 journal event，重活推到 Stop | 换来编辑热路径近乎零成本，代价是副作用可见性延迟到 Stop；host 若在 Stop 前被杀，pending 事件留在队列等下次 Stop 重试 |
| `subagent` handler 复用 4 条 route | 避免四份近似实现，代价是该 handler 必须在内部按 `context.event` 分支（`handler-registry.ts:49` 的窄化断言即此处的类型缝合点） |
| `hook-entry.ts` 与完整 commander CLI 分离 | 热路径不冷加载非 hook 命令模块（文件头 `:5` 明写理由），代价是子命令分派在 entry 里手写成一串 `if` |
| 保留 `workflow-state.sh` 作为 operator helper | 保住 workflow-state 契约的 parity，代价是仓库里长期存在 1,884 行 × 2 份 Bash；它没有事件入口，所以不构成第二 dispatcher |
| 空 lifecycle hooks 已移除 | Scaffold 和 template assembly 直接执行各自任务。它们不再调用空 runner。 |

### 3.3 组件拆分（2026-10-11）

数据来源：`archctx refactor scan --json`（archctx 0.7.0）。footprint 写在各 component 节点的 `source.include` 里。组件 footprint 只能用精确文件或 `dir/**`：`src/effects/architecture/model-reader.ts:85-89` 对每个节点的 include 都做前缀翻译，中间带 `*` 的 glob 会让 model reader 报 `source_include_invalid`。

| 组件 | footprint 摘要 | 文件 / 行 | 职责 |
| --- | --- | --- | --- |
| `component.hook-adapters.primary`（Hook Route Runtime） | `hook-entry.ts`、`hook/{runtime,route-registry,handler-registry,handler-contract,hook-input,event-telemetry,run-identity,trace-observer,session-context-budget}.ts`、`src/pi/hook-protocol.ts`、`src/core/loop/**`、`src/effects/loop/**`、`hook-work-budget.ts`、`hook-event-log.ts` | 15 / 3297 | route 表、handler 绑定、opt-in 检查、host 输出整形、遥测与日志轮转 |
| `component.hook-adapters.edit-guards`（Guard and Observer Handlers） | `hook/{mutation-*,minimal-change-*,prompt-*,circuit-breaker,command-observed,review-rubric,review-subject}.ts`（逐个列出）、`commands/prompt-guard-decision.ts` | 15 / 4561 | PreToolUse.edit 守卫、post-edit journal、Bash 观测、prompt 分类、minimal change |
| `component.hook-adapters.session-lifecycle`（Session Lifecycle Handlers） | `hook/{session-context,stop-handler,subagent-handler,delegation-state,task-inbox-handler,board-slice-context,state-snapshot}.ts`、`run-summary-retention.ts` | 8 / 3801 | SessionStart、Stop 延迟工作、subagent、Task Inbox |
| `component.hook-adapters.host-installer`（Host Adapter Installer） | `src/cli/installer/**`、`src/pi/{extension,hook-bridge}.ts`、`assets/hooks/**`、`.ai/hooks/**`、`commands/{install,status,security,hook}.ts`、`scripts/sync-hook-sources.ts` | 26 / 7729 | managed entries、install profile、Pi bridge、status 与 security scan |

与归属提议 §5 的两处偏差，都有源码证据：

- `session-context-budget.ts` 归 route-runtime。`runtime.ts` 的 `sessionOutput` 调用 `budgetSessionContext`（`runtime.ts:120`），`handler-contract.ts:3` 引用它的类型。SessionStart 预算是 host 输出整形的一部分（不变量 4）。按提议放进 session-lifecycle 会产生 runtime → handler 的反向边。
- `src/pi/hook-protocol.ts` 归 route-runtime。`runtime.ts` 的 `jsonOutput` 调用 `boundedHookDiagnostic`（`runtime.ts:142`）。它是 runtime 产出、Pi bridge 解析的协议 1 线格式。放进 host-installer 会产生 runtime → installer 的反向边。

组件之间的关系：

| 关系 | 类型 | 证据 |
| --- | --- | --- |
| host-installer → route-runtime | calls | `buildManagedHooks` 调用 `routesForHost`（`managed-entries.ts:107`）；`commands/hook.ts` 调用 `runHook` |
| route-runtime → edit-guards | calls | `handlers` 绑定 `runMutationGuard`（`handler-registry.ts:71`）；`hook-entry.ts` 直接运行 minimal-change、review-rubric、prompt-guard CLI |
| route-runtime → session-lifecycle | calls | `handlers` 绑定 `runStopHandler`（`handler-registry.ts:150`）和 SessionStart、subagent、inbox handler |
| session-lifecycle → edit-guards | calls | `runStopHandler` 调用 `consumePendingPostEditEvents`（`stop-handler.ts:483`）；SessionStart 渲染 minimal change 上下文 |
| edit-guards → route-runtime、session-lifecycle → route-runtime | depends-on | handler 实现 `HookHandlerResult` 契约，读取 `hook-input`、`run-identity` 和 event 级 `StateInputCollector` |

组件到其他 capability 的关系（生成区 §1.4 不显示组件级出向关系，所以列在这里）：

| 关系 | 证据 |
| --- | --- |
| host-installer → `public-surface.adoption` | `managed-entries.ts`、`uninstall.ts` 引用 `core/adoption/managed-hook-config.ts` |
| host-installer → `workflow-engine.contract-assets` | `commands/hook.ts:41` 调用 `resolveWorkflowStateLibrary` |
| host-installer → `global-runtime-reconciliation` | `status.ts:242` 调用 `inspectArchitectureProjectionReadiness` |
| route-runtime → `global-runtime-reconciliation` | `hook-entry.ts` 与 `runtime.ts` 用 `src/cli/runtime/write-all-sync.ts` 写 host 输出 |
| session-lifecycle → `public-surface.adoption` | `run-summary-retention.ts` 引用 `src/effects/path-safety.ts` |

依赖方向说明：route-runtime 与两个 handler 组件之间有双向边。registry 组合 handler（calls），handler 实现 registry 的契约（depends-on）。这是插件式组合，不是层次倒置。如果以后要消除这个环，把 `handler-contract.ts`、`hook-input.ts`、`run-identity.ts` 移到一个叶子组件即可。目前没有证据说明这个环造成了问题。

host-installer 有 26 个文件、7729 行，标记为 expandable。可以按 host 拆成 installer、Pi bridge、asset projection 三块。现在不拆。

### 3.4 10x 规模下先垮的点

排序依据是本仓库自己的 dispatch 遥测 `.ai/harness/runs/hook-events.jsonl`：44,301 条记录，窗口 `2026-07-23T09:05Z` → `2026-08-20T08:26Z`，按 `event.route_id` 聚合 `metrics.elapsed_ms`。占比是该 route 在实测总 hook 墙钟时间中的份额，不是猜测。

| route | 调用数 | 时间占比 | p50 | p95 | p99 / max |
| --- | --- | --- | --- | --- | --- |
| `Stop.default` | 675 | 48.7% | 549ms | 18.4s | 24.4s / 27.4s |
| `PostToolUse.bash` | 16,398 | 26.7% | 52ms | 113ms | 244ms / 1.2s |
| `PreToolUse.edit` | 2,219 | 16.5% | 253ms | 437ms | 873ms / 10.9s |
| `SessionStart.default` | 492 | 4.6% | 304ms | 711ms | 1.2s / 2.1s |
| `PostToolUse.always` | 21,217 | 2.6% | 3.2ms | 11.2ms | — / 386ms |
| 其余 6 条 route 合计 | 3,300 | <1.0% | — | — | — |

按实测的可证伪顺序：

1. **Stop 的延迟工作。** 旧采样里 Stop 是唯一贴到硬上限的 route：675 次 Stop 里 93 次超过 5s、77 次超过 10s，p99 24.4s。当时的主要成本是架构 cascade 和投影 drain。二者已删除（2026-10-10）。refactor recommendation observer 也已移出 Stop（2026-10-10），改由 Bot 按需读取证据。剩下的是 post-edit journal。需要重新采样，再判断 Stop 是否仍是最先垮的点。
2. **`PostToolUse.bash` 的单位成本 × 调用量。** p50 52ms 单看不贵，但它是第二高频 route（16,398 次），乘出来就是 26.7% 的总时间。它没有尾延迟问题（p99 244ms），垮的方式是稳态吞吐：命令密度上去后每次 Bash 调用都固定付这 50ms。
3. **`PreToolUse.edit` 阻塞编辑热路径。** mutation-guard 是**同步前置**门，p50 253ms 直接计入用户可感知的编辑延迟，且 max 10.9s 说明它在状态解析退化时会长尾。§3.2 那条"编辑热路径近乎零成本"的权衡只对 `PostToolUse.edit`（0.8%、p50 13ms）成立，对 PreToolUse 一侧不成立。
4. **SessionStart 上下文预算是全有或全无。** 五个 provider（resume、pending-plan-capture、current-status-snapshot、active-sprint、tooling-update-advisory）被 `appendBlock` 拼成**一整块** priority-5 的 `session-start-context.sh` section。`budgetSessionContext` 的裁剪粒度是 section（`session-context-budget.ts:437`），不是 provider —— 超预算时整块被丢掉、只留一行 `[ContextRef:session-start-context.sh]` 占位。所以这里不存在"低优先级 provider 先被牺牲"，而是五块内容一起消失。延迟本身不是瓶颈（4.6%、p95 711ms）。
5. **`resolveEffectiveState` 的锁竞争。** `runtime.ts:358` 的三次有界重试（`EFFECTIVE_STATE_RESOLUTION_MAX_ATTEMPTS = 3`，`runtime.ts:334`）只覆盖两种已知瞬时签名（stability 重读耗尽、独占锁超时）。并行 agent 数量上去后，重试耗尽会把 SessionStart 推进 `[HarnessStateUnavailable]` 分支 —— 这是正确的 fail-closed，但用户侧表现为上下文突然消失。
6. **`install-profile.ts` 1,441 行的单点（2026-10-11 实测，旧版记录为 1,167 行）。** profile 组件矩阵继续增长时，这里是最先需要拆分的文件。不在 dispatch 热路径上。

两个 sink 不是同一个东西，早期版本把它们混为一谈：

- `.ai/harness/runs/hook-events.jsonl` 由 dispatcher 的 `event-telemetry.ts:133` 在**每条 route** 完成后经 `appendHookEventLog`（`src/effects/hook-event-log.ts:87`）同步追加一条，因此它是上表的数据来源，也是唯一全 route 覆盖的写入。
- `.claude/.trace.jsonl` 只由 `trace-observer.ts:196` 写，而 `trace-observer` 只挂在 `PostToolUse.always` 这一条 route 上（`route-registry.ts:104-107`）。

`PostToolUse.always` 确实是调用量最大的 route（21,217 次，超过 bash），但实测它是**最便宜**的高频路径：p50 3.2ms、总占比 2.6%。同步追加争用在当前量级下不是排名靠前的风险；真要成为瓶颈，先出问题的会是 dispatcher 那条全 route 追加，而不是 trace 这一条。

注意遥测本身的边界：`metrics.child_processes` 在全部 44,301 条记录里都是 `0`，它属于 `measurement.incomplete_metrics`，不能用来反推 Stop 的子进程数量；上表只依赖 `elapsed_ms` 这个被标记为 complete 的字段。

### 3.5 prose ↔ 源码冲突（需上层裁决）

- 根 `CLAUDE.md` 写"repo-local `.claude/settings.json` 与 `.codex/hooks.json` hook adapters 已退役"，但 `src/cli/installer/targets/claude.ts:67` 的 `supportsLocation` 仍恒返回 `true`，`resolvePath`（`:58`）在 `--location local` 时写 `<cwd>/.claude/settings.json`，`install.ts:63` 也仍把 `local` 当合法输入。Codex 侧已经真正关死（`codex.ts` 的 `supportsLocation('local') === false`）。**当前源码事实：Claude 的 repo-local 安装路径仍可执行。** 本文按源码记录，退役声明与实现之间的落差需要一次显式裁决（收紧实现，或把根 `CLAUDE.md` 的表述改成"不作为产品交付面推荐"）。
- 本文档旧版 P1 把 `standard-plan.ts` / `fs-transaction.ts` 列为本 capability 模块。`.ai/context/capabilities.json` 已不存在。registry 现在只读 `.archcontext/model/nodes/` 里的 capability 节点（`src/core/capabilities/registry.ts:643`）。`capability-resolver match` 把这两个文件解析到 `public-surface-adoption`（2026-10-11 实测）。它们仍是跨 capability 的一次性迁移依赖。dispatch 路径不消费它们的结论。

### 3.6 Typed durable-effect failure boundary (2026-08-14)

- P1: `src/cli/hook/handler-registry.ts` is the sole declaration point for
  bounded effect contracts. Only `mutation-observed` (one post-edit journal
  phase) and `stop` (handoff, resume, event, run-summary) declare one; every
  other typed handler remains uninstrumented rather than being inferred as
  effect-free. `src/cli/hook/runtime.ts` owns the invocation-local observation
  and removes handler-ID completeness branches.
- P2: existing post-commit observers feed an additive
  `effect_observation` field in `loop-engine-hook-event/v1`. A thrown targeted
  handler is recorded as `unknown_partial` when no observer phase was seen,
  `committed_partial` for an observed prefix, and `committed_complete` after
  the declared bounded phases. A successful no-op is `none_committed`.
  Telemetry is diagnostic only; the journal and Stop projection files remain
  recovery authority and the public `RunHookResult` vocabulary is unchanged.
- P3: the next host-delivered same-route event is the only production retry
  operation. Fault tests inject throws after each named post-commit phase and
  compare normalized durable artifacts with a no-fault baseline. Stop's append
  event uses a timestamp-free projection key over every non-volatile rendering
  input and compares only the latest Stop inside a bounded reconciliation
  window; an unprovable latest event fails closed as reconcile-required. This
  is handler-local idempotency, not a generic transaction or rollback layer.
  Missing observer evidence fails closed as unknown and never authorizes
  cleanup.

### 3.7 开放问题

- `src/core/loop/loop-event-protocol.ts` 的文件头仍写着 "zero consumers" 和 "No production file imports this module yet"。实际上 `event-telemetry.ts:10` 和 `handler-contract.ts:12` 都引用它。文件头是否应该更新？没有记录。
- `session-context.ts` 的 `securitySentinelSessionContent` 调用 CLI 命令模块 `commands/security.ts` 的 `runSecurityScan`（`session-context.ts:215`）。这是 handler 组件对 CLI 命令文件的依赖，没有声明为关系。扫描逻辑是否应该移到 installer 或 effects 层？没有记录。
- `edit-guards` 与 `session-lifecycle` 依赖的 state、locking、evidence、fleet 模块目前没有归属。它们的关系等其他分组建立 `workflow-state`、`execution-primitives`、`evidence-ledger`、`task-fleet` 后再补。

## 4. 历史决策记录（append-only）

> 以下小节为既有文档原文逐字保留，未翻译、未改写。

### Frontend-scoped UX advisory (2026-07-21, PR #109)

The UserPromptSubmit advisory pair is split by scope: `bdd_feature_advice`
stays generic (any feature/implement intent → the `[BDD]` Given-When-Then
reminder), while `ux_feature_guard_advice` additionally requires a frontend/UI
noun — split ZH/EN sets with explicit English word boundaries so `build` and
`suite` can never match via the `ui` substring — evaluated against the
stripped prompt (`ctx.text`), so host-injected context cannot create UX
intent. The fact is echo-only by invariant: it gates the `[UXFeatureGuard]`
push in `prompt-handler.ts` and never enters routing or blocking decisions.
The noun sets expand only with a real missed-case fixture first
(`tests/cli/prompt-intents.test.ts` pins the positive/negative matrix).

### Contract-scoped failed-check repair (2026-08-05)

- P1: `checks_failed` is verification evidence about the current candidate;
  the active contract remains the sole edit-scope authority and Effective
  State remains the profile/blocker authority.
- P2: the resolver canonicalizes the full PreEdit target batch, rejects parent
  traversal and symlink escape, and projects contract authorization into
  Effective State's shared operation readiness. `mutation-guard` consumes the
  resolved `allowedToEdit`, contract path, and `allowed_paths` snapshot without
  rereading workflow authority. The contract-scope guard still rejects every
  sibling outside `allowed_paths`.
- P3: only `allowedToEdit` can exempt the sole `checks_failed` blocker after
  canonical contract authorization. `allowedToStop` and `readyToShip` remain
  hard-blocked, and an unsafe target or any additional blocker fails closed.
  This breaks the review-evidence repair cycle without creating contradictory
  CLI/MCP/hook readiness contracts.

### HRD-09 typed-authority consolidation (原 P3 段落，逐字保留)

The invariant is one public tuple → one typed handler → one host-output
boundary. HRD-09 removes the old second authority in the same work-package:
the Bash host-event runtime and shims are deleted, while the operator helper is
retained as a projection because workflow-state parity still depends on its
contract. Keeping that helper does not keep a second dispatcher alive.

At 10x event volume, synchronous telemetry append contention or incomplete
measurement is the first expected failure. Telemetry is therefore
non-authoritative for safety, but evidence consumers fail closed when required
fields are missing, malformed, duplicated, or mixed-protocol.

### Migration to the typed authority (原 P2 段落，逐字保留)

```text
repo-harness init / runInit
  -> standard-plan (pure operation list)
  -> exact-hash retired-file checks + managed adapter stripping
  -> one FsTransaction apply + manifest
  -> user-level adapter projection remains the host boundary
```

The migration detector is scoped to this explicit transaction. A fingerprint
mismatch preserves the file and reports the mismatch. Custom sibling commands,
unknown events, and unrelated adapter blocks remain intact. Runtime dispatch
does not inspect legacy command shapes, so there is no dual-read path.

### Codex native agent authority (2026-08-11)

- P1: `agents/fleet/*.md` remains persona authority and installed Codex TOML is
  its deterministic projection. The hook runtime owns permission guidance,
  circuit limits, and evidence only; it does not select a second transport.
- P2: `/delegate` or `/parallel` may create bounded advisor state, but every
  official `SubagentStart` independently validates `agent_type`/`model` against
  the installed TOML and writes event-scoped evidence through
  `.ai/harness/delegation/native-role-routing.json` under a dedicated native
  evidence lock, independently from the advisor-state lock. Only the current
  scope is retained, bounded to its latest 32 observations.
  Persistence failure downgrades the child to `unverified`; evidence no longer
  depends on prompt-advisor state and in-memory validation cannot substitute for
  the durable observation.
- P3: native `spawn_agent` plus exact `agent_type` is the sole Codex fleet
  identity/lifecycle authority. Missing/default/mismatched evidence fails
  closed without App-thread, `codex-exec`, or main-thread fallback. Reasoning
  effort stays `configured_unverified` because the event exposes no such field.

### Stop-time git changed set as the architecture observation authority (2026-08-12)

- P1: `src/cli/hook/architecture-drift.ts` owns the architecture changed set. The
  post-edit journal keeps only edit-time trigger payloads (contract
  verification, minimal change, checkpoint); its `dirty.architecture` bit and
  the `skipArchitectureCascade`/`eventIds`/`retainEventFiles` handshake with the
  projection drain are removed, not gated. A journal event only ever existed for
  a Claude Edit/Write tool call, so shell writes (the Codex worktree fleet
  shape) and apply_patch payloads were invisible to drift recording.
- P2: Stop computes `git diff --name-only --no-renames <cursor> HEAD` unioned
  with `git status --porcelain --untracked-files=all` (rename rows contribute
  both sides), canonicalizes every path through the same repo-relative filter
  the edit route uses, and hands one deterministic
  `ArchitectureProjectionSourceEvent` to `drainArchitectureProjectionJobs`. When
  projection is disabled the same path list drives `processArchitectureCascade`.
  `repo-harness architecture-projection drain --json` reads the same authority;
  its output schema is unchanged.
- P3: the cursor (`.ai/harness/state/architecture-drift-cursor.json`, a single
  slot following `session-run-identity.json`) advances to HEAD only on an
  acknowledged delivery, so retry-pending, dead-letter, and thrown failures
  replay the same range on the next Stop. For the disabled projection provider,
  acknowledgment covers the complete legacy cascade: the runner must resolve,
  every primary `architecture-queue` invocation must succeed, and every
  request-triggered `capability-context` follow-up
  must succeed. Stop remains advisory and reports a bounded diagnostic, while
  the manual drain exits non-zero; neither path advances the cursor after a
  partial cascade. Both callers persist a frozen legacy batch in
  `.ai/harness/state/architecture-drift-cascade.json` under the shared exclusive
  directory lock. Each complete path cascade advances its `completed` offset;
  timeout or failure retries the interrupted path, not the acknowledged prefix.
  The Git cursor advances only to the frozen batch HEAD once all paths finish;
  commits arriving during delivery remain in the next range. Pending working-tree
  edits are observed again by the next Stop. Malformed batch state fails closed,
  and historical paths are validated lexically, independent of the current target
  of completed paths. Each unfinished path must still resolve to its frozen name
  inside the repository immediately before delivery; retargeted or unsafe paths
  retain their offset and fail closed. All cursor writers (legacy, Stop, CLI and
  publication acknowledgement) use the same directory lock and expected-cursor
  comparison. Publication proof validation runs inside that transaction; the
  legacy holder uses the private held-lock writer rather than acquiring twice.
  An external cursor acknowledgement does not prove coverage of an old suffix:
  legacy recovery finishes that suffix first, preserves the external cursor,
  and observes its new range on the following window. A provider mode switch
  retains the legacy batch; only legacy delivery acknowledges its offsets.
  Stale empty locks from creation/release crashes use the existing identity-
  checked recovery protocol; fresh empty directories and live owners remain
  protected. This does not introduce a power-loss/fsync durability guarantee.
  A crash between an effect and its offset write may repeat that path:
  delivery is at least once. Subprocess cost still limits throughput, but a finite
  backlog whose individual cascades fit the budget makes progress across Stops.
  A missing or unresolvable cursor re-anchors at HEAD,
  processes working-tree entries only, and emits one stderr note instead of
  replaying history. Deletions stay in the feed:
  `architecture-queue record --file` classifies lexically and records a card for
  a path that no longer exists on disk. The cascade commands themselves are
  byte-identical -- only their input feed changed.

### Hooks stop doing architecture work (2026-10-10)

- P1: #483 removed the Stop drain. The queue, cursor, cascade and request-card
  helpers then had no automatic trigger. They are deleted, not gated. The
  entries above from 2026-08-12 describe that retired design.
- P2: the pull request is the architecture update unit. A responsibility change
  is an archctx model change plus `repo-harness architecture-projection apply`
  in the same branch.
- P3: this capability's primary flow is now route dispatch:
  `runHook` resolves one typed handler through `getHandlerForRoute`.

### 组件拆分与 footprint 归属（2026-10-11）

- P1：一个 ChangeSet 把本 capability 拆成 4 个组件。`component.hook-adapters.primary` 保留 id，改名为 Hook Route Runtime，并取得 footprint。新增 edit-guards、session-lifecycle、host-installer。
- P2：capability include 增加了此前无归属的文件：`src/core/loop/**`、`src/effects/loop/**`、`hook-work-budget.ts`、`hook-event-log.ts`、`run-summary-retention.ts`、`commands/{install,status,security,hook,prompt-guard-decision}.ts`、`scripts/sync-hook-sources.ts`。依据是归属提议 §1b、§1c、§1d：这些文件只被 `src/cli/hook/**` 或 installer 引用。
- P3：`flow.hook-adapters.primary` 的成功分支改为 route-runtime → edit-guards。新增 `flow.hook-adapters.stop`（Stop 消费 post-edit journal）和 `flow.hook-adapters.install`（route 表投影成 managed entries）。全部 selector 都是 CodeGraph 中的直接调用。

## 5. 验证面

capabilities.json 的 `verification_hints`：

```bash
bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/workflow-contract.test.ts
bash scripts/check-task-workflow.sh
```

本模块历史记录的补充验证命令：

- `bun test tests/cli/route-registry.test.ts tests/cli/hook.test.ts`
- `bun test tests/prompt-handler.test.ts tests/subagent-handler.test.ts`
- `bun test tests/command-observed.test.ts tests/trace-observer.test.ts`
- `bun test tests/stop-handler.test.ts tests/mutation-observed.test.ts`
- `bun test tests/hook-contracts.test.ts tests/hook-protocol.test.ts`
- `bun run check:type`
- `bun run check:hooks`
- `bun src/cli/index.ts architecture-projection check --json`

## 6. Workstream

- `tasks/archive/gate-audit-20261003/workstreams/runtime-harness/hook-adapters/github-issues-158-159.md`

## Gate audit cutover

The event route registry remains the host adapter authority. Ordinary edits and Stop no longer require plan, contract, review or archive stages. Risk has two values, `routine` and `high`; high risk selects focused safety coverage and optional independent review. Path/private-area checks and shared-store token fencing remain enforced. Hooks observe architecture on demand and never queue per-edit drift or write capability blocks into agent instructions. Main publication consumes trusted current CI facts; host permission changes, unsafe deletion and production effects retain their explicit authorization boundaries.

## Optimization Backlog

- `install-profile.ts` 有 1,441 行，是本 capability 最大的文件。它同时承担 profile 计划、事务、ownership 记录和遗留迁移（`planLegacyInstallProfileMigration`、`beginInstallHostTransaction`、`recordVerifiedAgentFleetOwnership`）。拆分顺序需要改动频率证据，目前没有。
- `session-context.ts` 有 1,515 行。五个 provider 拼成一个 section，超预算时整块丢弃（见 §3.4 第 4 点）。按 provider 拆成独立 section 可以让预算按优先级裁剪。
- route-runtime 与 handler 组件之间的环（§3.3）。如果 archctx 的环检测开始阻塞，把 handler 契约移到叶子组件。
- `write-all-sync.ts` 归 global-runtime-reconciliation，但 hook 热路径也用它。它造成 hook-adapters → global-runtime-reconciliation 的一条边，而 global-runtime-reconciliation 也调用 hook-adapters。这个 26 行的工具可以移到 `execution-primitives`（G2 新建），以去掉这条 capability 级回边。
- session-lifecycle → host-installer 的 `runSecurityScan` 调用（§3.7）是反向依赖证据，没有声明为关系。
- host-installer 与 edit-guards → acceptance-review 没有声明。`relation.acceptance-review.hook-adapters` 已经声明反向（review 命令调用 circuit breaker）。本方向有 5 条边，反向有 2 条。集成不新增反向关系。是否翻转方向是开放问题。
