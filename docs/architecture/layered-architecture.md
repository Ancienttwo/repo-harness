# 总分层架构与时序

> **历史归档**：初始审查基线为 `d7e92f43d`；本页保留截至 `2cee26d888af9dd34ed52982e13df0c16db00681` 的后续修订，不是单一提交的快照。
> 当前规范见 [功能架构、时序与拓扑](current-architecture.md)。
> #901/#902/#904 的只读状态、失败停止回滚、init 分离，以及 #947 的恢复修复已经合入当前基线。
> 保留历史内容用于追踪审查；历史读者的退出决定继续引用 #917，不据此删除或恢复。

> **来源**：初稿见 #900；后续段落和引用可能采用较新源码。各项来源见[截至归档基线的文件历史](https://github.com/Ancienttwo/repo-harness/commits/2cee26d888af9dd34ed52982e13df0c16db00681/docs/architecture/layered-architecture.md)，不能把全页行号统一套用到 `d7e92f43d`。
> 后续修订包括 #945 的层内依赖整理；各段落的行号保留其修订时的来源。
> **事实优先级**：源码 > `.archcontext/model/` > 本文。本文是手写视图，archctx 不投影它。
> **配套**：[进程与命名空间拓扑 + 挂载层](process-namespace-topology.md) · [Architecture Index](index.md) · 各 capability 页的 Optimization Backlog。
> **用途**：精简重构的定位图。`R-Lx` 指向本文 [Remarks](#remarks)，`R-Tx` 指向[拓扑文档的 Remarks](process-namespace-topology.md#remarks)。

## 1. 分层总图

依赖方向是 L2 → L3 → L4，core 不导入其他层。scripts（L5）在主干旁边：effects 用子进程运行它，它又直接导入 `src`。粗线上的数字是 import 边数，红色虚线是违反方向的边，橙线是没有规则约束的边。

```mermaid
flowchart TB
  classDef ext fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:4 3
  classDef mount fill:#4c1d95,stroke:#ddd6fe,color:#ffffff
  classDef entry fill:#1e3a8a,stroke:#bfdbfe,color:#ffffff
  classDef fx fill:#155e75,stroke:#a5f3fc,color:#ffffff
  classDef core fill:#14532d,stroke:#bbf7d0,color:#ffffff
  classDef side fill:#78350f,stroke:#fde68a,color:#ffffff
  classDef store fill:#3f3f46,stroke:#d4d4d8,color:#ffffff

  subgraph L0["L0 参与者"]
    Human["Human<br/>shell · 浏览器"]:::ext
    Bot["Bot"]:::ext
    Host["Claude Code / Codex"]:::ext
    Client["MCP client"]:::ext
  end

  subgraph L1["L1 挂载面"]
    Mount["主机：hook 适配命令 · skills · agents · MCP 配置<br/>仓库：opt-in 标记 · policy · .gitignore 受管块"]:::mount
  end

  subgraph L2["L2 入口适配 · src/cli 36.3k · src/operator-web 8.2k"]
    Entry["repo-harness：8 个内联命令与 25 个命令组<br/>repo-harness-hook：7 条路由<br/>mcp serve · operator serve · operator-web UI"]:::entry
  end

  subgraph L3["L3 effects · src/effects 32.5k"]
    FX["state · evidence · fs-transaction · locking · git<br/>process runner 与 supervisor · terminal：Herdr 与 OAR<br/>review · architecture · fleet · publication · operator"]:::fx
  end

  subgraph L4["L4 core · src/core 20.0k"]
    Core["Effective State 投影 · workflow profile · capability registry<br/>adoption 计划 · fleet 与 messages · engineers · evidence 编解码"]:::core
  end

  subgraph L5["L5 helper · scripts 27.4k"]
    Scripts["37 个 .ts · 40 个 .sh · lib<br/>helper · CI gate · 同步工具"]:::side
  end

  subgraph L6["L6 状态与外部工具"]
    Stores["仓库文件 · .ai/harness<br/>{common}/repo-harness · ~/.repo-harness"]:::store
    Tools["git · gh · Herdr · archctx<br/>codegraph · oracle · Chrome"]:::ext
  end

  Host -->|"hook 事件"| Mount
  Mount -->|"exec，stdin JSON"| Entry
  Human -->|"argv · HTTP"| Entry
  Bot -->|"argv"| Entry
  Client -->|"stdio 或 HTTP"| Entry
  Entry ==>|"import 129"| FX
  Entry ==>|"import 57；operator-web 另有 60 条类型 import"| Core
  FX ==>|"import 198"| Core
  FX -->|"文件 · 锁 · 子进程"| Stores
  FX --> Tools
  FX -->|"子进程 helper-runner"| Scripts
  Scripts -->|"import 64：effects 41 · core 18 · cli 5"| FX
  FX -.->|"import 4 · R-L6"| Scripts
  Entry -.->|"import 1 · R-L6"| Scripts
  Core -.->|"import 1 · R-L8"| Entry
  Core ~~~ Stores
  Core ~~~ Tools

  linkStyle 11 stroke:#d97706
  linkStyle 12,13,14 stroke:#dc2626,stroke-width:2px
```

| 层 | 目录与规模（LOC） | 职责 |
| --- | --- | --- |
| L1 挂载面 | `assets/`、`agents/`、hook 适配命令、`.ai/harness/workflow-contract.json` | 把包投影到主机和目标仓库。细节见[拓扑文档 §4](process-namespace-topology.md#4-挂载层)。 |
| L2 入口适配 | `src/cli` 36.3k：`mcp` 13.0k、`commands` 11.1k、`installer` 3.5k、`chatgpt-browser` 3.2k、`hook` 2.9k；`src/operator-web` 8.2k | 解析 argv、hook payload、MCP 请求和 HTTP 请求，再调用 effects 与 core。operator server 的代码在 `src/effects/operator/server.ts`，按入口职责归到本层。 |
| L3 effects | `src/effects` 32.5k：`state` 4.3k、`operator` 3.8k、`evidence` 3.6k、`engineers` 2.5k、`publication` 2.4k、`fleet` 2.4k、`terminal` 1.9k、`review` 1.6k | 全部 I/O：文件、锁、Git、子进程、Herdr、archctx。 |
| L4 core | `src/core` 20.0k，101 个文件 | 纯解码、计划和投影。只有 `upgrade/legacy-inventory.ts` 读文件系统。 |
| L5 helper | `scripts/` 27.4k：37 个 `.ts` 13.7k、40 个 `.sh` 10.7k、`lib/` 3.0k | `repo-harness run` 执行的 helper、CI gate、同步工具。 |
| L6 状态与外部工具 | 4 个存储根；git、gh、Herdr、archctx、codegraph、oracle | 存储根的共享范围见[拓扑文档 §3](process-namespace-topology.md#3-命名空间拓扑)。 |

## 2. 依赖方向（实测）

统计口径：`.ts`、`.tsx`、`.mjs`、`.js` 文件里相对路径的 `from`、`import(` 和 `import` 说明符。包导入不计。

| 方向 | 边数 | 判定 | 例子 |
| --- | --- | --- | --- |
| cli → effects | 129 | 允许 | `src/cli/index.ts:72` → `effects/runtime/protected-helper-platform` |
| cli → core | 57 | 允许 | `src/cli/mcp/state-tools.ts:1` → `core/state/types` |
| effects → core | 198 | 允许 | `src/effects/fs-transaction.ts:27` → `core/adoption/operations` |
| operator-web → core | 60 | 允许，只有类型 | `src/operator-web/App.tsx:18` → `core/setup/types` |
| core → effects，effects → cli | 0 | 禁止，已满足 | — |
| core → cli | 1 | 违规，R-L8 | `src/core/upgrade/legacy-inventory.ts:4` → `cli/installer/install-profile` |
| effects → scripts | 4 | 违规，R-L6 | `src/effects/review/generic-review.ts:21` → `scripts/acceptance-receipt` |
| cli → scripts | 1 | 违规，R-L6 | `src/cli/commands/capability-context.ts:13` → `scripts/capability-resolver` |
| scripts → effects / core / cli | 41 / 18 / 5 | 没有规则，R-L6 | `scripts/merge-gate.ts:9` → `effects/publication/merge-readiness` |

检查覆盖：

- `scripts/check-state-boundaries.ts` 只对 `CORE_ROOTS` 检查禁用 import、子进程调用和 core 反向 import。`CORE_ROOTS` 只有 `src/core/state`、`src/core/workflow`、`src/core/capabilities`（`:36-40`）。
- 同一脚本禁止整个 `src/effects` 导入 `src/cli`（`:372-385`），并检查约 45 个 canonical symbol 的定义位置（`:47-103`）。
- 没有检查的部分：其余约 22 个 core 子目录、`src` 与 `scripts` 之间的边、目录级环、`src/operator-web` 的隔离。仓库没有 eslint、dependency-cruiser 或 knip 配置。

## 3. 时序图

`box` 框是一个 OS 进程。每张图只画主路径和改变结果的分支。

### 3.1 Hook 热路径：PreToolUse edit

宿主每次 Edit/Write 都起一个 hook 进程。允许分支为了输出 `[CapabilityOwner]` 行，还要起 `git status`（5 s 超时）。archcontext 模式下再跑 archctx 和 node 版本探测，二者都以 `processGroup: true` 运行（`archctx-provider.ts:57,128`），每次调用是 supervisor → launcher → 目标 3 个进程。

```mermaid
sequenceDiagram
  autonumber
  participant H as Claude Code / Codex
  participant SH as sh 适配命令
  box rgba(30,58,138,0.12) repo-harness-hook 进程，bun，每事件一个
    participant RT as runHook
    participant MG as runMutationGuard
  end
  participant SUB as git 与 archctx 子进程
  participant FS as .ai/harness

  H->>SH: PreToolUse Edit/Write，payload
  SH->>SH: git rev-parse，测试 opt-in 标记（R-L9）
  SH->>RT: exec repo-harness-hook PreToolUse --route edit
  RT->>RT: 校验 HOOK_HOST，isOptIn 再测标记，getRoute
  RT->>MG: handler.run(payload, identity)
  MG->>MG: firstDenial：仓库范围，_ref，_ops
  alt 命中拒绝
    MG->>FS: 追加 failures/latest.jsonl
    MG-->>RT: exit 2 与原因
  else 允许
    MG->>SUB: 读 policy，archctx resolve 10 s，git status 5 s（R-L5）
    SUB-->>MG: capability owner
    MG-->>RT: exit 0 与 additionalContext
  end
  RT->>FS: 加锁追加 runs/hook-events.jsonl
  RT-->>H: stdout JSON 与 exit code
```

### 3.2 SessionStart：Effective State 写路径

一次 `resolveEffectiveState` 在正常情况下跑 3 遍完整解析，每遍都读全部来源，并起 git 计算 review subject。SubagentStart、MCP `state_summary` 和 `state resolve` 走同一条路径。

```mermaid
sequenceDiagram
  autonumber
  participant H as Claude Code / Codex
  box rgba(30,58,138,0.12) repo-harness-hook 进程
    participant SC as session-context
    participant RS as resolveEffectiveState
  end
  participant SRC as policy · plan · handoff · tasks/current.md
  participant GIT as git 与 archctx 子进程
  participant ST as 状态文件

  H->>SC: SessionStart
  SC->>RS: getEffectiveState，hook 最多尝试 3 次
  RS->>ST: 取 .ai/harness/state/effective.lock
  RS->>SRC: authority pass，完整解析
  RS->>GIT: review subject
  loop confirmed pass，1 到 3 次，直到 authority 哈希一致
    RS->>SRC: 完整解析
    RS->>GIT: review subject
  end
  RS->>ST: 取 effective-state-version.json.lock（common 目录）
  RS->>SRC: confirm pass，再完整解析一次（R-L1）
  RS->>ST: 写 effective.json，再写 version 记录（R-L1）
  RS-->>SC: EffectiveState
  SC->>SRC: pending-plan provider 再读 policy 与 plan
  SC->>GIT: agent-notice：check-ignore，rev-parse，archctx
  SC-->>H: HarnessState 与上下文段，预算 1500 token
```

### 3.3 仓库采用：`repo-harness init --apply`

`init` 先改主机，再做仓库侧 adoption。主机侧步骤与 `install` 重复，并且不在主机事务锁内。

```mermaid
sequenceDiagram
  autonumber
  actor U as 用户
  box rgba(30,58,138,0.12) repo-harness CLI 进程
    participant IN as runInit
    participant PL as planAdoption，core
    participant TX as applyAdoptionPlan
  end
  participant HOST as 主机挂载点
  participant REPO as 目标仓库
  participant UH as ~/.repo-harness

  U->>IN: repo-harness init --apply
  IN->>REPO: cutover 静止检查，历史 Sprint 标记
  IN->>HOST: bash sync-codex-installed-copies.sh
  IN->>HOST: runInstall，没有取 global-runtime.lock（R-L4）
  IN->>IN: 子进程 inspect-project-state.ts，输出不进计划（R-L4）
  IN->>PL: createPlan
  PL-->>IN: mkdir · writeFile · appendManagedBlock · move · remove · gitUntrack
  IN->>TX: apply
  TX->>REPO: 全部操作先做 preflight
  loop 每个操作，前一个失败也继续（R-L2）
    TX->>REPO: 目标锁，备份，写 tmp，rename
  end
  TX->>REPO: 写 manifest.json，含回滚命令
  IN->>UH: 登记 registered-repos.json，registry 自有锁
  IN->>UH: 取 global-runtime.lock，ensureGlobalArchitectureProjection
  IN-->>U: 步骤报告，回滚要手动跑 init rollback
```

### 3.4 全局运行时刷新：`repo-harness update`

`update` 在一个主机事务里安装新包，再让新包的 CLI 子进程完成投影。父进程只在 receipt 绑定一致时提交。

```mermaid
sequenceDiagram
  autonumber
  actor U as 用户
  box rgba(30,58,138,0.12) 当前 CLI 进程
    participant RF as runTransactionalRuntimeRefresh
    participant GS as runGlobalRuntimeSetup
  end
  box rgba(20,83,45,0.15) 候选包 CLI 子进程
    participant CA as reconcile-installed-runtime
  end
  participant UH as ~/.repo-harness
  participant HOST as 主机挂载点

  U->>RF: repo-harness update
  RF->>UH: 取 transactions/global-runtime.lock
  RF->>UH: beginInstallHostTransaction，复制全部主机变更路径
  RF->>GS: updateMode
  GS->>HOST: installCli，bun add -g
  GS->>CA: spawn 新包，传 token 与 capability 文件
  CA->>HOST: 不装 CLI 再跑 setup：skills · hooks · agents · rules · MCP
  CA-->>GS: receipt：route registry 摘要 · adapter 摘要
  GS->>GS: 校验 receipt 绑定 transaction 与包摘要
  alt 成功
    RF->>UH: 写 install-state.json 与 configuration-restore.json，删备份
  else 失败或抛错
    RF->>HOST: rollbackInstallHostTransaction，从副本恢复
  end
```

### 3.5 MCP 工具调用

stdio 传输由 client 拉起进程，没有认证步骤。HTTP 默认只监听 `127.0.0.1:8765`，绑定非回环地址需要 `REPO_HARNESS_MCP_PUBLIC_ORIGIN`。

```mermaid
sequenceDiagram
  autonumber
  participant CL as MCP client
  box rgba(30,58,138,0.12) mcp serve 进程
    participant TR as transport
    participant CX as createMcpToolContext
    participant DP as callMcpTool
    participant GA as general-repo-access
  end
  participant UH as ~/.repo-harness
  participant REPO as 已登记仓库

  CL->>TR: tools/call
  opt HTTP 传输
    TR->>TR: Origin 检查 · 限流 · OAuth、bearer 或 url-token
  end
  TR->>CX: 建上下文，默认 planner profile
  CX->>UH: 读 mcp.local.json 与 registered-repos.json
  TR->>DP: 分发：retired，coding，reader，state，fleet，switch
  DP->>GA: resolveRepo，每次重读 registry，校验 dev/ino
  GA->>REPO: 路径解析 · ignore 策略 · 读写
  DP->>REPO: 写 audit 记录
  DP-->>CL: 结果
  Note over DP: state_summary 走 Effective State 写路径（R-L1）
```

### 3.6 验收评审：`repo-harness review round`

评审在独立 reviewer checkout 和 Herdr pane 中运行。CLI 进程通过会话目录里的文件与 pane 中的 node 进程握手。

```mermaid
sequenceDiagram
  autonumber
  actor OW as 所有者 agent
  box rgba(30,58,138,0.12) repo-harness CLI 进程
    participant RV as review round
    participant AR as scripts/acceptance-receipt.ts
  end
  participant HD as Herdr
  box rgba(120,53,15,0.15) Herdr pane 中的 node 进程
    participant OH as oar-review-host.js
  end
  participant GT as ~/.repo-harness/gates

  OW->>RV: review round，contract 路径（R-L3）
  RV->>RV: caller.lock · circuit breaker · reviewer checkout
  RV->>AR: acceptanceContext：contract · goal · report · subject（R-L6）
  RV->>HD: pane split，pane run node oar-review-host spec
  OH-->>RV: ready.json
  RV->>OH: request-N.json
  OH-->>RV: observed-N.json，CLI 每 100 ms 轮询
  RV->>AR: recordAcceptance
  AR->>GT: 写 sha256(worktree 根)/acceptance.latest.json
```

### 3.7 Operator board

服务只接受 `127.0.0.1` 与 `::1`，只有 GET 与 HEAD 路由。fleet 快照和任务读取在一次性子进程中运行，仓库快照在 worker 线程中运行。

```mermaid
sequenceDiagram
  autonumber
  actor BR as 浏览器
  box rgba(30,58,138,0.12) operator serve 进程，127.0.0.1:4318
    participant SV as handleRequest
  end
  box rgba(120,53,15,0.15) collector 子进程，detached，每请求一个
    participant FC as collectFleetBoard
  end
  participant DATA as registry · common 目录 · Herdr

  BR->>SV: GET /api/v1/fleet/snapshot
  SV->>SV: Host、Origin、Sec-Fetch-Site 校验
  SV->>FC: spawn，stdin JSON start
  FC->>DATA: registry · offers · board · readiness · inbox
  FC-->>SV: stdout JSON
  SV-->>BR: 200 JSON
  Note over SV,FC: 超时后 SIGTERM 进程组，500 ms 后 SIGKILL（R-T3）
```

## Remarks

按级别排序。`高`：影响正确性或热路径成本。`中`：重复实现或无用负担。`低`：命名与清理。已经记在 capability Optimization Backlog 的条目只给链接。

| ID | 级别 | 问题 | 证据 | 精简方向 |
| --- | --- | --- | --- | --- |
| R-L1 [#901](https://github.com/Ancienttwo/repo-harness/issues/901) | 高 | SessionStart、SubagentStart 和 MCP `state_summary` 只需要读取，却和 `state resolve` 一样走写路径 `resolveEffectiveState`。一次调用正常跑 3 遍完整解析（authority、confirmed、confirm 窗口），最多 10 遍。hook 外层再重试最多 3 次，最坏 30 遍，每遍都起 git。写出的 `.ai/harness/state/effective.json` 在 `src/` 和 `scripts/` 中没有读者。 | `src/effects/state/resolve-effective-state.ts:874-883,910-958,980-995`；`src/cli/hook/runtime.ts:95-112`；`src/effects/state/state-cache.ts:6,64`；`src/cli/mcp/state-tools.ts:131` | 只读调用方改用已有的 `resolveEffectiveStateReadOnly`（`:961`）。删除 cache，或给它一个读者。`state_version` 只保留一个发布入口。 |
| R-L2 [#902](https://github.com/Ancienttwo/repo-harness/issues/902) | 高 | `applyAdoptionPlan` 不是原子事务。preflight 之后用 `map` 执行全部操作，一个操作失败后，后面的操作照常执行，也不自动回滚。目标锁 `<target>.repo-harness.lock` 用 `O_EXCL` 创建，没有过期回收，写入方崩溃后该目标一直处于锁定状态。 | `src/effects/fs-transaction.ts:661-688`（执行）、`:226-236`（目标锁）、`:917`（手动回滚） | 第一个失败即停止，并按 manifest 自动回滚。目标锁改用带过期回收的 `exclusive-directory-lock`。 |
| R-L3 [#903](https://github.com/Ancienttwo/repo-harness/issues/903) | 中 | #834 让 state snapshot 不再读 task contract。`review round` 仍只接受 `tasks/contracts/*.contract.md` 作评审键。Stop 恢复仍从 `tasks/contracts` 推导 contract，并读 `.ai/harness/sprint/active-sprint`。同一个 contract 文件在一处已退役，在另两处是必需输入。 | `src/effects/review/generic-review.ts:163-170`；`src/effects/evidence/recovery-materializer.ts:179,188-200` | 先决定评审主体的键（goal、plan 或 diff subject），再删除 Stop 恢复里的 contract 与 Sprint 推导。命名空间侧见 R-T7。 |
| R-L4 [#904](https://github.com/Ancienttwo/repo-harness/issues/904) | 中 | `init --apply` 重复 `install` 的主机步骤，保证更弱。它直接跑 `sync-codex-installed-copies.sh`，在主机事务锁之外调用 `runInstall`。它起 `inspect-project-state.ts` 子进程，输出不进入 adoption 计划。`syncBundledItemsAtHome` 的 agent 复制循环只收到空数组。 | `src/cli/commands/init.ts:567,578,612-616`；`init.ts:412-432,447`；`install` 持锁见 `src/cli/index.ts:581-586` | `init` 只做仓库侧 adoption 和 registry 登记，主机侧变更交给 `install` 的持锁事务。删除没有用到的 inspect 子进程和 agent 循环。 |
| R-L5 [#905](https://github.com/Ancienttwo/repo-harness/issues/905) | 中 | 每次被允许的 Edit/Write 都为 owner 行解析 policy、起 `git status`，archcontext 模式下还起 node 探测与 archctx 两组受监督进程。archctx memo 只在进程内有效，hook 又是每事件一个进程。Stop 与 Codex UserPromptSubmit 各自重建 capability ownership，不经过事件内的 collector。 | `src/cli/hook/mutation-guard.ts:131-161`；`src/effects/architecture/archctx-provider.ts:48-58,116-135`；`src/cli/hook/handler-registry.ts:79`；`src/cli/hook/stop-handler.ts:95` | owner 解析结果按模型摘要和 HEAD 缓存到文件，或只在 SessionStart 输出一次。 |
| R-L6 [#906](https://github.com/Ancienttwo/repo-harness/issues/906) | 中 | `scripts/` 实际是一个库层。它导入 effects 41 次、core 18 次、cli 5 次。`src` 有 5 条边反向导入它，形成 3 个跨层环，都经过 `scripts/acceptance-receipt.ts` 或 `scripts/capability-resolver.ts`。 | `src/effects/review/generic-review.ts:21`、`src/effects/publication/publication-receipt.ts:6`、`src/effects/integration/product-acceptance.ts:56`、`src/cli/commands/capability-context.ts:13` → scripts；`scripts/merge-gate.ts:9` → effects | 把 acceptance receipt 和 capability resolver 的库代码移进 `src/effects/review` 与 `src/core/capabilities`，`scripts/` 只留 CLI 外壳。然后在 `check-state-boundaries.ts` 中禁止 `src → scripts`。 |
| R-L7 [#907](https://github.com/Ancienttwo/repo-harness/issues/907) | 已解决（保留 2 对 allowlist） | 叶子原语已移入 execution-primitives，其余共享类型与调用方已归位。层内目录互相导入由 checker 持续检查。 | `scripts/check-state-boundaries.ts` 的 `INTRA_LAYER_CYCLE_ALLOWANCES` 仅保留 `src/cli/chatgpt-browser ↔ src/cli/mcp` 与 `src/effects/engineers ↔ src/effects/fleet`。 | checker 拒绝未列入 allowlist 的目录环及已失效的 allowlist 条目；两对保留项的原因在常量中记录。 |
| R-L8 [#908](https://github.com/Ancienttwo/repo-harness/issues/908) | 低 | core 只有一个文件不纯：`legacy-inventory.ts` 导入 `fs`，还导入 `cli/installer/install-profile`。边界检查只覆盖 core 约 25 个子目录中的 3 个，所以没有报出它。 | `src/core/upgrade/legacy-inventory.ts:2,4`；`scripts/check-state-boundaries.ts:36-40` | 把 I/O 部分移到 effects，然后把 `CORE_ROOTS` 扩到整个 `src/core`。 |
| R-L9 [#909](https://github.com/Ancienttwo/repo-harness/issues/909) | 低 | hook 词表有漂移。`HookEvent` 含没有路由的 `PostToolUse` 与 `SubagentStop`，`SETUP_HOOK_EVENTS` 与 `WORKFLOW_MARKER_GATE_EVENTS` 也保留它们。minimal profile 的路由集是字符串表，不是 `Route` 的字段。opt-in 标记在 sh 命令、`isOptIn`、`inspectWorkflowMarker` 中各查一次。一处注释引用不存在的 `resolveStopEffectiveState`。 | `src/cli/hook/route-registry.ts:20-27`；`src/core/setup/types.ts:111`；`src/core/adoption/minimum-harness-version.ts:29`；`src/cli/installer/managed-entries.ts:75-77`；`src/cli/hook/runtime.ts:156`；`src/effects/state/resolve-continuation-envelope.ts:13` | 删除无路由事件。profile 归属写进 `Route`。opt-in 判定只留一处。 |
| R-L10 [#910](https://github.com/Ancienttwo/repo-harness/issues/910) | 低 | 没有引用或只有测试引用的模块。`src/effects/state/write-journal.ts`（101 行）没有任何引用。只被测试导入：`src/core/messages/document-handoff.ts`（281 行）、`src/effects/operator/docs-graph.ts`（158 行，与 `src/core/docs/docs-graph.ts` 同名）、`src/effects/strategy/wake.ts`、`src/effects/evidence/attested-import.ts`（331 行）、`scripts/run-skill-routing-eval.ts`（1,603 行）。 | 在 `src`、`scripts`、`tests`、`assets`、`package.json`、`.github` 中检索 import 和文本引用 | 逐个确认后删除，或接入真实调用方。`coding-session.ts` 见 R-T1。 |
