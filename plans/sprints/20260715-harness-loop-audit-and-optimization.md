# repo-harness Harness Loop 全链路审计与优化方案

> 审计类型：固定提交静态代码审计
> 审计基线：`main@82550779cdccf0575d674ae53bbc95ba63e44743`
> 基线日期：2026-07-14
> 报告日期：2026-07-15
> 当前版本线：`0.10.0`
> 审计范围：从 Prompt / SessionStart 到 Plan、Execution、Verification、Stop、Handoff、Resume、Closeout 的完整控制回路
> 限制：本环境无法解析 `github.com` 进行本地 clone，因此未运行仓库测试；结论来自固定提交的公开源码、测试、文档、workflow contract 与发布记录的静态审阅。文中所有性能数字均为建议目标，不是实测结果。
> Program role：保留的静态审计与 Program source；不是 machine-operable Sprint backlog。
> Post-ESA authority baseline：`origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d`（PR #79；ESA-01..05 与 ESA-07 完成，ESA-06 原样 deferred）。
> Canonical Sprint A：`plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`。
> Program dependency：`ESA@3b33cea -> LSC -> HRD -> EPC -> SSD`。
> Delivery boundary：每个阶段使用独立 work-package、worktree、branch 与 PR；LSC characterization 与 semantic changes 也必须分 PR。
> Execution override：本文历史分析中的 compatibility/shim/fallback window 不构成实现授权；执行禁止 steady-state compatibility、dual authority、semantic fallback 与 silent migration。任何另行获批的 one-shot migration 必须 operator-invoked、fail closed，并在同一 work-package 删除旧 authority。

---

## 1. 执行摘要

repo-harness 的基本方向是正确的：

- 持久事实放在仓库，不放在聊天历史；
- Host adapter 的公开 route tuple 稳定；
- Prompt 层逐步退回路由和建议，硬门禁移到 edit/tool 边界；
- Effective State、工作流 profile、worktree、contract、checks、review、handoff 已经构成一套真实的控制系统；
- 安全边界倾向 fail-closed；
- Session context 有预算和去重；
- Hook runtime 已经开始合并重复 observer，并记录运行遥测；
- `tasks/current.md` 被明确标记为 orientation snapshot，而不是 authority；
- external verification 仍被诚实地描述为手动约定，而不是虚构的自动 gate。

问题不在“有没有 loop”，而在 loop 经历多轮增量演进后出现了 **control-plane accretion（控制面累积）**：

> 每次修复一个局部问题，就增加一个 Hook、脚本、状态文件、freshness 判断、fallback 或 circuit breaker 分支。局部安全性提高了，但全局语义、运行成本和状态收敛性开始下降。

本次审计的核心结论是：

1. **不应该继续删公开 Hook route。**当前 8 个共享 route + 3 个 Codex-only route 已经接近合理边界；应该精简内部脚本扇出和重复状态读取。
2. **首先要统一 loop 语义，而不是先重写 runtime。**当前 Standard profile、contract 要求、Effective State blocker 和 Stop gate 存在不一致；若不先统一，合并脚本只会把矛盾藏进一个更大的内核。
3. **真正需要减少的是 authority/evidence/projection 的混用。**目前 handoff、resume、`tasks/current.md`、Effective State cache、checks latest、post-bash latest、minimal-change latest 等表面彼此牵动，投影变化会污染状态版本和 circuit breaker。
4. **PostEdit 与 Stop 写放大明显。**每次 edit 可能触发 contract verification、architecture queue、context sync、capability request、handoff 刷新；Stop 又重复刷新和检查。应改为“事件记录 → dirty bits → 一次 checkpoint”。
5. **应建立一个统一的 Loop Kernel。**每个 Host event 只收集一次状态、计算一次 policy/readiness、产生一个 decision/effects plan；CLI、MCP、Hook、Skill 只消费这个结果。
6. **Evidence 必须有信任等级和 subject revision。**观察到某个 Bash 命令成功，不等于该命令是当前任务的权威验证；mtime 也不应代表 freshness。
7. **Circuit breaker 应检测是否有进展，而不只是计数。**以高频变化的 `stateVersion` 为 key 会让表面投影变化重置 breaker，无法识别无进展循环。

建议将优化拆成三个连续 Sprint：

1. **Loop Semantics Convergence**：统一 profile、工件要求、revision、readiness。
2. **Hook Runtime Diet**：一个事件一个进程、一次状态解析、一个 decision。
3. **Evidence & Projection Convergence**：统一证据账本、checkpoint 与 canonical recovery projections。

---

## 2. 当前 Loop 的真实形态

### 2.1 产品层闭环

当前主链可概括为：

```text
Prompt / Program Sprint
        ↓
Discovery / P1-P2-P3
        ↓
Draft Plan
        ↓
Approve / Promote
        ↓
Plan → Contract / Review / Notes / Active markers
        ↓
Worktree selection
        ↓
PreEdit guards
        ↓
Edit
        ↓
PostEdit sync + observation + handoff refresh
        ↓
PostBash observation / checks
        ↓
Review / External acceptance
        ↓
Stop gate / Handoff / Resume
        ↓
Closeout / Archive / Merge
```

这是一个完整的 repo-backed loop，不只是 Hook 集合。

### 2.2 Host event 层

公开 route contract 当前是：

| Event | Route | 当前内部脚本 |
|---|---|---|
| SessionStart | `default` | `session-start-context.sh`, `minimal-change-context.sh`, `security-sentinel.sh` |
| PreToolUse | `edit` | `worktree-guard.sh`, `pre-edit-guard.sh` |
| PreToolUse | `subagent` | return-channel guard |
| PostToolUse | `edit` | `post-edit-guard.sh`, `minimal-change-observer.sh` |
| PostToolUse | `bash` | `post-bash.sh` |
| PostToolUse | `always` | `post-tool-observer.sh` |
| UserPromptSubmit | `default` | `prompt-guard.sh` |
| UserPromptSubmit | `delegation` | Codex delegation advisor |
| SubagentStart | `context` | Codex-only |
| SubagentStop | `quality` | Codex-only |
| Stop | `default` | `stop-orchestrator.sh` |

公开 route 数量约 11，但一次事件可能串行启动多个 Bash 脚本，脚本内部又可能启动 CLI/Bun 子进程。以当前 route 表估算，完整 route surface 对应约 15 个内部脚本调用点。

**审计结论：公开 route 不应继续削减；内部执行模型需要收敛。**

### 2.3 状态与工件层

当前状态可分为四类，但实现和文档还没有始终按照这四类处理。

#### Authority

```text
docs/spec.md
active plan
active contract
policy
capability registry
worktree ownership
repo/Git change subject
```

#### Evidence

```text
tasks/reviews/*
.ai/harness/checks/latest.json
.ai/harness/runs/*
post-bash latest
minimal-change latest
external verification manifests
architecture drift/request evidence
```

#### Projection / Recovery view

```text
.ai/harness/state/effective.json
.ai/harness/handoff/current.md
.ai/harness/handoff/resume.md
tasks/current.md
.claude/.task-handoff.md
SessionStart context packet
```

#### Runtime control

```text
active-plan
active-worktree
pending orchestration
delegation state
circuit breaker state
lock files
state version store
```

现在的主要问题，是 projection 和 evidence 经常被纳入与 authority 相同的 revision/freshness 链。

---

## 3. 质量评分

这些分数是定性审计结果，不是 benchmark。

| 维度 | 评分 | 判断 |
|---|---:|---|
| Repo-backed authority 方向 | 8/10 | 原则正确，`tasks/current.md` 等派生面也有清楚声明 |
| 安全边界 | 8/10 | worktree、scope、destructive action、profile floor 大多 fail-closed |
| Loop 语义一致性 | 5/10 | profile、artifact、blocker、Stop readiness 并非一套规则 |
| 运行时效率 | 4/10 | 一次事件存在多脚本、多进程、多次状态读取 |
| 工件经济性 | 4/10 | Standard 路径和 PostEdit/Stop 存在写放大 |
| 恢复能力 | 7/10 | handoff/resume 很强，但投影过多且 freshness 有 mtime 依赖 |
| 证据可信模型 | 5/10 | checks/review 基础不错，PostBash 与 external evidence 尚未统一 |
| 可观察性 | 6/10 | 已有 per-script telemetry，但真实端到端指标仍不足 |
| 可测试性 | 6/10 | 有大量行为测试，但核心规则仍散在 Shell 与 adapter |
| 可扩展性 | 5/10 | 新 feature 很容易再增加 Hook、latest 文件和 fallback |

---

## 4. 核心发现

## LOOP-01 — Standard profile 与 contract blocker 相互矛盾

**严重度：Critical**

根 Skill 对 Standard 的描述是：

```text
plan → edit → verify → at most one review
```

Effective State 中的 ceremony guidance 也表达了：

```text
Standard：最多一个 active plan；不需要 contract/notes/todos
```

但 Effective State blocker 又对 `Approved` / `Executing` plan 无条件要求 contract：

```text
Approved/Executing + missing contract → missing_contract blocker
```

README / Hook Failure Playbook 还把 approved execution 未生成 contract/review/notes scaffold 描述为 `ContractGuard`。

这意味着：

- Skill 告诉 Agent Standard 不需要 contract；
- State resolver 可能告诉 Agent缺 contract；
- PreEdit/Stop 还可能有自己的 contract判断；
- profile 只是 ceremony label，没有真正决定工件政策。

### 推荐决策

引入唯一的：

```ts
ArtifactRequirementPolicy.resolve({
  profile,
  operation,
  risk,
  taskKind,
  policy
})
```

我的推荐矩阵：

| Profile | Work package | Separate contract | Worktree | Review | Notes |
|---|---|---|---|---|---|
| Lite | 无持久计划，除非用户要求 | 否 | 否，除安全策略要求 | 否 | 否 |
| Standard | 一个 Approved Work Package | 默认否 | 按风险/策略 | 风险触发，最多一次 | 仅偏差/决策时创建 |
| Strict | 一个 Approved Work Package | 是 | 默认是 | 必须 fresh | 仅有实际内容时创建 |

其中 Standard 的 plan 本身应包含最小执行合约：

```text
scope
target paths / capabilities
acceptance
verification commands
rollback boundary
```

不要为了结构形式再复制一份 contract。

另一种合法选择是“所有 Approved plan 都必须有 contract”，但那就应该删除 Standard 的低 ceremony 承诺并重新命名 profile。两套说法不能继续共存。

### 验收

- 所有 artifact requirement 只由一张机器可读 policy matrix产生。
- Effective State、PreEdit、Stop、CLI、MCP、Skill 读取同一结果。
- Standard fixture 在没有 separate contract 时可以进入 edit，前提是 Approved Work Package 完整。
- Strict fixture 在没有 contract/worktree 时确定性阻断。
- 文档、Skill、测试不再写第二套 requirement 表。

---

## LOOP-02 — “Blocked”不能表达 edit、stop、ship 三种 readiness

**严重度：High**

当前 Effective State 的 blocker 只覆盖部分问题：

- 冲突；
- 缺失 contract；
- fresh checks 失败；
- 非法 profile / capability registry；
- 若干 authority 关系。

但 Stop 又检查：

- plan completeness；
- minimal-change review；
- review freshness；
- delegation fallback；
- handoff；
- profile-specific规则。

Human Review Path 又要求：

- review recommendation pass；
- review card verdict pass；
- external acceptance pass / not_required / manual override。

因此同一状态可能：

```text
Effective State: not blocked
Stop: block
Human closeout: not ready
MCP summary: looks healthy
```

### 推荐模型

把一个笼统的 `blocked` 拆成：

```ts
interface Readiness {
  allowedToPlan: Decision;
  allowedToEdit: Decision;
  allowedToVerify: Decision;
  allowedToStop: Decision;
  readyToShip: Decision;

  hardBlockers: Requirement[];
  missingRequirements: Requirement[];
  staleEvidence: EvidenceRef[];
  advisories: Advisory[];
  nextAction: ActionRef | null;
}
```

并建立唯一函数：

```ts
evaluateReadiness({
  effectiveState,
  artifactRequirements,
  evidence,
  requestedOperation,
  policy
})
```

### 关键原则

- **Edit gate**：只阻止无法安全编辑的事项。
- **Stop gate**：只阻止会丢失恢复状态或明显未完成的声明。
- **Ship gate**：要求完整的交付证据。
- 不要让 `Stop` 变成另一个隐式 release gate。
- 不要让一个 stale handoff 阻止安全编辑。
- 不要让一个未要求的 external acceptance 阻止 Standard stop。
- 每个阻断都必须给出一个机器可执行或明确的人类 next action。

---

## LOOP-03 — `state_revision` 混入 projection，状态版本可能在稳定前分配

**严重度：High**

当前 state revision 的 source hash 范围包括：

```text
active marker/worktree
plan
contract
review
checks
sprint
handoff
resume
tasks/current
```

其中 handoff、resume、`tasks/current.md` 都是派生/恢复投影。结果是：

1. PostEdit 刷新 handoff；
2. state revision 改变；
3. state version 改变；
4. 以 stateVersion 为 key 的 circuit breaker 被视为新状态；
5. 即使 authority、代码和 blocker 完全没变，也可能重新允许相同修复循环。

另外，resolver 的稳定读取流程在初次解析和确认轮次都可能开启 version allocation。若 source 在读取中变化，版本可能在快照确认之前被消耗。

### 推荐 revision 模型

至少拆成：

```ts
authorityRevision
```

包含：

```text
plan
contract
policy
capability boundaries
worktree ownership
task identity
```

```ts
subjectRevision
```

包含：

```text
当前被验证的 repo diff / candidate commit / selected files
```

```ts
evidenceRevision
```

包含：

```text
与 subjectRevision 绑定的 checks/review/external evidence ledger head
```

```ts
projectionRevision
```

包含：

```text
handoff/resume/tasks-current/rendered context
```

```ts
progressToken
```

由：

```text
authorityRevision
subjectRevision
completed task markers
relevant evidence outcome
hard blocker set
```

计算，专供 circuit breaker 和 no-progress detection 使用。

### state version 分配规则

```text
collect A
project
collect B
compare authority/subject inputs
retry if changed
finalize stable snapshot
allocate version once
persist cache
```

版本只在稳定 snapshot 后分配一次；projection 的重渲染不应提升 authority/progress version。

---

## LOOP-04 — 每个 Hook event 的进程与状态读取扇出过大

**严重度：High**

当前 runtime 本身按 route.scripts 顺序 `spawnSync("bash", ...)`。部分脚本内部再调用：

```text
repo-harness state resolve
Bun/TypeScript helper
Git
sync helper
verification helper
```

典型路径：

### SessionStart

```text
host
→ repo-harness-hook
→ resolve Effective State subprocess
→ session-start-context.sh
→ minimal-change-context.sh
→ security-sentinel.sh
→ aggregate/budget
```

### PreEdit

```text
host
→ repo-harness-hook
→ worktree-guard.sh
→ pre-edit-guard.sh
→ state resolve CLI
→ shell 再读取 plan/contract/policy
```

### PostEdit

```text
host
→ repo-harness-hook
→ post-edit-guard.sh
→ contract verify
→ architecture queue
→ context sync
→ capability context
→ handoff refresh
→ minimal-change observer
```

运行时已经能记录每个 script invocation，但系统仍以脚本为执行单元，而不是以 event decision 为执行单元。

### 推荐

保留公开 route tuple，内部改成：

```ts
handleLoopEvent(eventInput): LoopEventResult
```

一次 event：

1. 解析 host payload 一次；
2. 收集 repo facts 一次；
3. resolve state/profile/readiness 一次；
4. 计算一个 decision；
5. 产生一组有序 effects；
6. 在一个事务/批次内执行必要写入；
7. 输出一个 host-safe result；
8. 记录一条 event-level telemetry。

目标不是完全禁止 Shell，而是：

> Shell 只能作为 Host / 外部工具 adapter，不再拥有状态机、重复状态读取或 compatibility semantics。

### 公开 route 保持

不建议减少 11 个 route，因为它们对应真实 host 生命周期。建议把内部处理收敛为 6–7 个 handler：

```text
session
prompt-routing
pre-mutation
post-mutation-observation
command-observation
subagent-lifecycle
stop/checkpoint
```

不同 route 可以映射到同一个 handler，但 route contract 不变。

---

## LOOP-05 — PostEdit 写放大，且把维护性同步放在热路径

**严重度：High**

每次 edit 可能触发：

- active contract verification；
- architecture queue 记录；
- context contract sync；
- capability-context request；
- repo-to-brain / related mirror sync；
- handoff 刷新；
- minimal-change observation；
- always observer trace。

这些操作中只有少部分必须在下一次 edit 前立即完成。

### 推荐分层

#### 同步硬门禁

在 edit 前完成：

```text
scope
worktree
path
destructive/security boundary
artifact readiness
```

#### 快速观察

在 edit 后只记录：

```json
{
  "kind": "change_observed",
  "event_id": "...",
  "paths": ["..."],
  "subject_revision": "...",
  "dirty": [
    "contract-verification",
    "architecture",
    "context",
    "capability",
    "checkpoint"
  ]
}
```

#### 延迟/批处理

在以下时机处理：

```text
显式 verify
phase transition
Stop
达到 N 个 edit 或 debounce window
准备 ship
```

### 具体变化

- PostEdit 不再每次写 handoff。
- PostEdit 不再直接重渲染 `tasks/current.md`。
- architecture/context/capability 只写一个 event 或 dirty bit。
- 同一 session 内重复路径事件去重。
- Stop/verify 只运行 dirty 的 projector。
- advisory sync 失败记录 evidence，不阻断 edit。

目标：

```text
PostEdit durable writes:
当前：多份 projection / latest / queue
目标：1 个小事件，0 个完整投影
```

---

## LOOP-06 — Stop orchestrator 已成为第二应用内核

**严重度：High**

Stop 当前负责或参与：

- handoff/resume 刷新；
- Lite/Standard/Strict 分支；
- minimal-change review；
- review freshness；
- plan completeness 文本启发式；
- delegation fallback；
- circuit/lock；
- Host 输出过滤；
- 直接读取 Effective State cache；
- cache 缺失时用 install profile 推断 workflow profile；
- handoff 更新后通过 mtime 对齐 resume freshness。

这里有四个明显问题。

### 问题 A：install profile 不是 runtime risk profile

```text
minimal / standard / product-planning / strict
```

是安装/发现配置，不应作为某个任务的 runtime risk profile fallback。

Stop 若无法解析 canonical state，应：

```text
fail closed on the affected gate
或 advisory + explicit unresolved-state reason
```

不能用安装 profile 猜。

### 问题 B：直接读取 cache

`.ai/harness/state/effective.json` 是 read model，不应在 Stop 中成为独立权威。Stop 应调用 canonical resolver 或消费当前 event 已解析的 state。

### 问题 C：mtime 补丁

在 handoff 改写后通过 `touch -r` 让 resume 看起来 fresh，意味着 freshness 协议依赖文件时间而不是内容关系。正确做法是：

```text
resume.source_handoff_sha256
resume.authority_revision
resume.generated_from_checkpoint
```

### 问题 D：文本启发式 plan completeness

根据 assistant 消息长度和关键词判断“计划是否完整”，容易误伤解释性回复，也可能漏掉真正未捕获的计划。

### 推荐 Stop 的唯一职责

```text
1. resolve canonical state + readiness
2. flush pending event journal
3. write one checkpoint transaction
4. return allow / block / advise with exact missing requirement
```

其他职责迁移：

- plan completeness → 显式 `pending_orchestration` 状态；
- review freshness → readiness evaluator；
- minimal change → evidence；
- delegation fallback → delegation service；
- profile resolution → canonical resolver；
- handoff/resume/current → checkpoint projector；
- lock →共享 lock primitive。

---

## LOOP-07 — PostBash observation 与 verification authority 混用

**严重度：High**

`post-bash.sh` 会解析：

- command；
- exit code；
- output；
- command heuristics；
- 大输出日志；
- repair circuit；
- latest JSON。

这对 observability 很有用，但不足以证明：

```text
命令针对当前 subject revision
命令是 policy 要求的验证
命令未被 shell pipeline 掩盖 exit code
命令覆盖了要求的范围
命令输出不是缓存或过期结果
```

README 也明确说明 external verification manifests 当前是手动约定，不会被 `repo-harness check` 自动发现或 gate。

### 推荐 Evidence Ledger

引入 append-only、typed evidence：

```ts
interface EvidenceEvent {
  protocol: 1;
  eventId: string;
  taskId: string | null;
  kind:
    | "test"
    | "lint"
    | "build"
    | "review"
    | "external_acceptance"
    | "security"
    | "architecture"
    | "minimal_change"
    | "command_observation";
  producer: string;
  trust:
    | "authoritative"
    | "observed"
    | "external"
    | "human_override";
  subjectRevision: string | null;
  authorityRevision: string | null;
  status: "pass" | "fail" | "blocked" | "unknown";
  command?: string;
  exitCode?: number;
  artifact?: string;
  startedAt?: string;
  completedAt: string;
  metadata: Record<string, unknown>;
}
```

#### 信任规则

- `PostBash`：默认 `observed`，不能自动满足 required gate。
- `repo-harness verify run`：按已声明的 command/gate 产生 `authoritative`。
- 外部 manifest：显式 import 后为 `external`。
- Review：绑定 candidate fingerprint/subject revision。
- Manual override：必须包含 actor、reason、scope、expiry/one-shot。
- `checks/latest.json`：由 ledger 生成，不再是另一份手写权威。

### 存储建议

为减少锁竞争，可采用：

```text
.ai/harness/evidence/events/<timestamp>-<uuid>.json
.ai/harness/evidence/blobs/<sha256>
.ai/harness/checks/latest.json      # materialized view
```

每个 event 独立文件，比共享 JSONL 在跨进程/崩溃场景更容易原子写入。需要时再 compact。

---

## LOOP-08 — Circuit breaker 统计尝试，不判断进展

**严重度：High**

当前 circuit breaker key 包含：

```text
kind
guard
reason
path/action
stateVersion
fingerprint
```

问题是：

- `stateVersion` 可被 handoff/current 等 projection 变化推动；
- 相同 blocker 在不同 path string 下可能绕过；
- A → B → A 的振荡未必被识别；
- 做了真实进展后，单纯次数上限又可能过早阻止；
- 多个模块拥有不同 lock 和 stale-lock 策略。

### 推荐 progress-aware breaker

Key：

```ts
{
  taskId,
  actionClass,
  authorityRevision,
  blockerSetHash
}
```

Progress token：

```ts
hash({
  subjectRevision,
  completedTaskIds,
  evidenceRevision,
  hardBlockers,
  allowedPathCoverage
})
```

算法至少识别：

1. **Exact no-progress repeat**
   同一 action + 同一 progress token 重复。

2. **Oscillation**
   `A → B → A` 或有限状态循环。

3. **Superficial churn**
   blocker 不变，只改变 projection/path rendering。

4. **Real progress reset**
   subject、evidence 或 task completion 真正前进时重置。

### Lock 精简

建立共享 lock primitive，但不要建立一个全局大锁：

```text
state snapshot lock
checkpoint compaction lock
mutation lock
```

共用：

```text
token ownership
pid/hostname
created_at
timeout
stale reclaim policy
atomic acquisition/release
```

Evidence event 使用单文件原子创建，尽量无锁。

---

## LOOP-09 — Prompt routing 已改善，但仍不应承担 workflow authority

**严重度：Medium**

当前设计已经做对两件事：

- prompt classifier/decision table 移入 TypeScript；
- prompt-layer plan/spec/contract gate 降为 advisory，硬门禁在 edit layer。

应继续沿这个方向，而不是再次让自然语言 classifier 决定安全或完成状态。

### 推荐边界

Prompt 层只允许：

```text
route
advise
capture-intent
set pending_orchestration
request human choice
```

不得决定：

```text
allowed to edit
contract fulfilled
checks fresh
ready to ship
destructive action safe
```

这些只能基于 tool/path/state/evidence。

### 精简建议

- 根 Skill 和 prompt router 共用一个 action enum/schema：
  `setup | plan | execute | verify | handoff | discuss | none`。
- `prompt-guard.sh` 最终降为 Host payload adapter + output renderer。
- plan prompt 需要阻止 session 丢失时，写显式 `pending_orchestration`，不要让 Stop 猜 assistant 文本。
- 保留中文/Unicode classifier 的 eval corpus。
- 任何 classifier 简化必须先通过 shadow routing 对比；不能仅以减少行数为成功。

---

## LOOP-10 — Session context 的预算机制正确，但输入投影重复

**严重度：Medium**

当前 SessionStart 有：

- Effective State session section；
- resume/handoff；
- sprint/current；
- minimal-change guidance；
- security sentinel；
- token budget；
- dedupe。

预算和 fail-closed overflow 是值得保留的。问题在于多个投影可能表达相同内容：

```text
state next_action
handoff next step
resume next step
tasks/current current task
sprint active item
```

### 推荐 Context Packet

默认只注入：

```ts
interface ContextPacket {
  taskId: string | null;
  phase: string;
  profile: string;
  authorityRevision: string;
  subjectRevision: string | null;
  hardBlockers: CompactReason[];
  nextAction: CompactAction | null;
  targetPaths: string[];
  requiredGates: string[];
  securityBoundaries: string[];
  checkpointRef: string | null;
  planRef: string | null;
  contractRef: string | null;
  evidenceRef: string | null;
}
```

原则：

- 注入 delta 和引用，不复制 plan/contract。
- 基于 authority/progress revision 去重，不基于渲染文本 hash。
- 维持 1500 token 硬上限。
- 建议 p95 目标不超过 700 token。
- 若存在 blocker，优先输出 blocker + fix；不输出背景性长文。
- security findings 只注入 changed/new fingerprint。
- sprint 只注入 active row，不注入 backlog。

---

## LOOP-11 — 工件体系需要按 Authority / Evidence / Projection 重新归类

**严重度：Medium**

当前用户需要理解的文件过多，尤其在 Standard task 中可能出现：

```text
plan
contract
review
notes
active markers
checks latest
post-bash latest
minimal-change latest
handoff current
handoff resume
tasks/current
.task-handoff
architecture queue
context sync state
capability request
```

这增加：

- Agent 路由成本；
- freshness 组合数；
- migration surface；
- Hook 写放大；
- 人类不知道读哪一个；
- tests 需要维护多个影子状态。

### 推荐精简模型

#### Authority

```text
Work Package
Strict Contract（仅 Strict 或明确策略）
Policy / Capability Registry
Repo candidate / diff
```

#### Evidence

```text
Evidence Events
Human Review Card
External acceptance / override
```

#### Projection

```text
Effective State
Current Checkpoint
Human-readable rendered views
```

#### Control

```text
Active task/worktree
Pending orchestration
Circuit state
```

### 一个 canonical checkpoint

建议新增：

```text
.ai/harness/checkpoint/current.json
.ai/harness/checkpoint/current.md
```

它是由 authority + evidence 生成的恢复投影，不是 authority。

由 checkpoint 原子生成仍被保留的 canonical recovery views：

```text
.ai/harness/handoff/current.md
.ai/harness/handoff/resume.md
tasks/current.md
.claude/.task-handoff.md
```

每个 recovery projection 带：

```text
generated_from_checkpoint
authority_revision
subject_revision
checkpoint_sha256
```

EPC work-package 必须一次决定哪些 view 保持 canonical、哪些 view 退休，并在同一 package 删除退休 authoring path；不设 steady-state compatibility window。

---

## LOOP-12 — Benchmark 尚未覆盖真正的 Standard 与端到端 runtime cost

**严重度：Medium**

现有 hook diet 与 benchmark 体系有价值，但还存在几个盲点：

- route 数量有静态目标，但一个 route 内部启动多少进程未成为核心指标；
- telemetry 已记录 per-script invocation，但缺少 event-level 聚合；
- synthetic probe 不能替代真实 adopted repo；
- benchmark 常见 arm 把 `adaptive-lite` 与 standard deployment profile 混用，无法清楚回答 Standard 的成本；
- 缺少 false-block、no-progress turn、artifact writes 等 outcome 指标；
- SessionStart token budget 有硬上限，但缺少实际 p50/p95；
- state resolution 次数、Git 调用次数、文件读写数没有统一记录。

### 建议指标

这些是目标，先做 baseline 再确定 release gate：

| 指标 | 建议目标 |
|---|---:|
| Host → runtime 入口 | 每 event 1 次 |
| runtime 内嵌套进程 | 常规 event ≤1 |
| Effective State resolution | 每 event 恰好 1 次 |
| PreEdit p95 | 目标 ≤150ms；初期硬预算 ≤250ms |
| SessionStart context | max 1500；p95 目标 ≤700 tokens |
| PostEdit 完整投影写入 | 0 |
| PostEdit event 写入 | ≤1 |
| Stop checkpoint transaction | ≤1 |
| Standard 默认工件数量 | 比当前减少 ≥50% |
| false block | ≤1% 的非安全场景 |
| trust-boundary miss | eval suite 中 0 |
| no-progress corrective turns | breaker 后最多 1 次明确升级 |
| stale evidence accepted | 0 |
| canonical recovery projection drift | 0 |

Benchmark arm 应明确为：

```text
no-harness
lite
standard
strict
```

每个 arm 使用相同 scenario 和 candidate repo。

---

## 5. 目标 Harness Loop

建议把完整 loop 收敛为七个阶段：

```text
1. Sense
2. Resolve
3. Decide
4. Act
5. Observe
6. Gate
7. Checkpoint
```

### 5.1 Sense

一次性收集 immutable input：

```text
repo identity
policy
active work package
contract
worktree
candidate/diff
capability mapping
latest evidence heads
runtime event
host/session identity
```

不在多个脚本中重复读取。

### 5.2 Resolve

计算：

```text
Effective State
Risk
Artifact Requirements
Authority/Subject revisions
```

### 5.3 Decide

针对具体事件计算唯一决策：

```text
allow
block
advise
noop
```

以及结构化 reason/fix。

### 5.4 Act

Adapter 执行允许的 effects：

```text
write event
run explicit verifier
capture plan
update marker
render host output
```

### 5.5 Observe

所有外部结果进入 typed event/evidence，不直接被当成完成状态。

### 5.6 Gate

统一 readiness evaluator 回答：

```text
allowed_to_edit
allowed_to_stop
ready_to_ship
```

### 5.7 Checkpoint

只在：

```text
phase transition
explicit handoff
Stop
ship/closeout
```

生成一次恢复 checkpoint 和 canonical recovery projections。

---

## 6. Loop Kernel API 草案

```ts
type LoopEvent =
  | { type: "session_started"; host: Host; sessionId: string }
  | { type: "prompt_submitted"; host: Host; sessionId: string; prompt: string }
  | {
      type: "mutation_requested";
      host: Host;
      sessionId: string;
      operation: "edit" | "write";
      targetPaths: string[];
    }
  | {
      type: "mutation_observed";
      host: Host;
      sessionId: string;
      changedPaths: string[];
    }
  | {
      type: "command_observed";
      host: Host;
      sessionId: string;
      command: string;
      exitCode: number;
      outputRef?: string;
    }
  | { type: "subagent_started"; host: Host; sessionId: string; agentId: string }
  | {
      type: "subagent_stopped";
      host: Host;
      sessionId: string;
      agentId: string;
      report: string;
    }
  | { type: "session_stopping"; host: Host; sessionId: string };

interface LoopEventResult {
  protocol: 1;
  eventId: string;

  state: EffectiveStateV1;
  readiness: Readiness;

  decision: {
    verdict: "allow" | "block" | "advise" | "noop";
    reasons: DecisionReason[];
    nextAction: ActionRef | null;
  };

  effects: PlannedEffect[];
  contextPacket?: ContextPacket;
  checkpoint?: CheckpointPlan;

  telemetry: {
    stateResolutions: number;
    childProcesses: number;
    filesRead: number;
    filesWritten: number;
    elapsedMs: number;
  };
}
```

### Adapter 边界

```text
Claude adapter
Codex adapter
CLI
MCP
       ↓
handleLoopEvent()
       ↓
Core decisions + explicit effects
```

适配器不得：

- 自己解析 authority artifact；
- 自己计算 profile；
- 自己判断 review/check freshness；
- 自己生成 circuit key；
- 自己用 install profile猜 runtime profile；
- 自己通过 mtime 修复 freshness。

---

## 7. 精简后的 Hook 内部结构

公开 route 不变，内部映射建议：

| 公开 route | 内部 handler |
|---|---|
| SessionStart.default | `sessionHandler` |
| UserPromptSubmit.default | `promptHandler` |
| PreToolUse.edit | `mutationGuardHandler` |
| PostToolUse.edit | `mutationObservedHandler` |
| PostToolUse.bash | `commandObservedHandler` |
| PostToolUse.always | `traceObserver`，可内嵌到 runtime |
| PreToolUse.subagent | `subagentHandler` |
| UserPromptSubmit.delegation | `subagentHandler` |
| SubagentStart.context | `subagentHandler` |
| SubagentStop.quality | `subagentHandler` |
| Stop.default | `stopHandler` |

内部模块约 7 个，而不是约 15 个脚本调用点。

### 保留 Shell 的场景

- operator-invoked one-shot retirement/migration，且同一 package 删除旧 authority；
- 调用已有 Bash-only helper；
- Host 限制只能执行脚本；
- 外部命令 adapter。

### Shell 退出条件

每个旧脚本满足以下条件后可退役：

- 新 handler parity fixtures 全过；
- packaged hooks 与 repo-pinned hooks 行为一致；
- adopted fixture one-shot migration 证明旧脚本可删除；
- telemetry 证明没有旧脚本调用；
- 旧脚本在同一 approved work-package 原子退休，不保留 release-line compatibility window。

---

## 8. Profile 与工件政策建议

### Lite

```text
目标：低 ceremony 的短任务
```

要求：

- 不自动创建 plan/contract/review/notes。
- edit 前只检查安全、worktree/path policy、明确 destructive boundary。
- 风险升高时自动提升到 Standard/Strict。
- changed code 时要求 targeted evidence 才能声称完成。
- Stop 只写 compact checkpoint。

### Standard

```text
目标：默认工程任务
```

要求：

- 一个 Approved Work Package。
- Work Package 内含 scope、target paths、acceptance、verification、rollback。
- 默认不复制 separate contract。
- 需要 isolated worktree 时由 risk/policy决定。
- targeted checks 必须绑定 subject revision。
- review 仅在 risk/policy要求时，最多一次。
- notes 只在偏差、权衡或未决问题出现时创建。
- handoff 只在 transition/Stop 写。

### Strict

```text
目标：高风险、跨边界、发布/迁移/安全任务
```

要求：

- Approved Work Package。
- 独立 Contract。
- linked worktree，除非 explicit override。
- checks、review、external acceptance 按声明的 evidence contract。
- candidate fingerprint。
- guarded mutation / revision precondition。
- readyToShip gate 完整通过。

### 风险计算

当前路径 token 和 path-count heuristic 只能作为显式 risk inputs；不得成为 semantic fallback，也不得在 authoritative input 缺失时合成风险结论。

建议：

```text
effectiveRisk = max(
  plannedRisk,
  observedDiffRisk,
  environmentPolicyRisk
)
```

其中：

- `plannedRisk`：来自 Work Package / capability metadata；
- `observedDiffRisk`：来自实际 diff；
- `environmentPolicyRisk`：例如 production、release、protected branch。

Capability metadata 优先于字符串 token。`api`、`session` 等宽泛 token 应作为信号，不直接单独决定 Strict，除非 policy 明确。

---

## 9. Readiness 决策示例

### Standard：允许编辑

```json
{
  "operation": "edit",
  "verdict": "allow",
  "profile": "standard",
  "requirements": {
    "work_package": "pass",
    "contract": "not_required",
    "worktree": "not_required",
    "scope": "pass"
  }
}
```

### Strict：缺 Contract

```json
{
  "operation": "edit",
  "verdict": "block",
  "reason": "required_contract_missing",
  "fix": {
    "action": "capture_contract",
    "source": "plans/plan-....md"
  }
}
```

### 可以 Stop，但不能 Ship

```json
{
  "allowed_to_stop": true,
  "ready_to_ship": false,
  "missing_requirements": [
    "fresh_review",
    "external_acceptance"
  ],
  "next_action": "run repo-harness verify"
}
```

这比全局 `blocked: true/false` 更贴近真实 loop。

---

## 10. 迁移后的工件图

```text
Authority
├── plans/plan-*.md                       # Work Package
├── tasks/contracts/*.contract.md         # Strict only / policy required
├── .ai/harness/policy.json
├── .ai/context/capabilities.json
└── Git candidate / diff

Evidence
├── .ai/harness/evidence/events/*.json
├── .ai/harness/evidence/blobs/*
├── tasks/reviews/*.review.md
└── .ai/harness/checks/latest.json         # generated view

Projection
├── .ai/harness/state/effective.json
├── .ai/harness/checkpoint/current.json
├── .ai/harness/checkpoint/current.md
├── .ai/harness/handoff/current.md         # canonical generated view
├── .ai/harness/handoff/resume.md          # canonical generated view
├── tasks/current.md                       # canonical generated view
└── .claude/.task-handoff.md               # canonical generated view

Control
├── .ai/harness/active-plan
├── .ai/harness/active-worktree
├── .ai/harness/pending-orchestration.json
└── .ai/harness/circuit/*
```

---

## 11. 优先级与快速收益

## P0：先修语义，不动大 runtime

1. 建立 ArtifactRequirementPolicy。
2. 选择并修复 Standard/Contract 语义。
3. 建立统一 Readiness。
4. Stop 禁止 install profile fallback。
5. Stop 禁止直接把 cache 当 authority。
6. 删除 mtime freshness 修补，改成 content revision。
7. state version 只在稳定 snapshot 后分配。
8. circuit breaker 不再直接依赖 projection-sensitive stateVersion。

这些改动会立即减少错误阻断和不一致。

## P1：合并事件执行

1. 建立 `handleLoopEvent`。
2. 一次 event 只 resolve state 一次。
3. PreEdit 的 worktree/plan/contract/scope 统一成一个 decision。
4. PostEdit 只写 event/dirty bits。
5. Stop 只做 readiness + checkpoint。
6. 统一 lock primitive。
7. 增加 event-level telemetry。

## P2：收敛 evidence 与 projection

1. Evidence Ledger。
2. `checks/latest.json` materialized view。
3. 一个 canonical checkpoint。
4. handoff/resume/tasks-current 统一生成。
5. SessionStart 从 Context Packet 注入。
6. Prompt plan completeness 改显式 pending state。
7. canonical recovery projections 一次性切换，并在同一 package 原子退休旧 authoring path。

---

## 12. 三个 Sprint 的执行方案

本节三个 backlog 是 Program source，不是执行 authority。Sprint A 的
machine-operable authority 是
`plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`；HRD、EPC
与 SSD 必须在前序 Sprint merge/push 后分别 promotion。不得把本审计文件
直接当作 active sprint，也不得把三个 Sprint 合成一个 delivery package。

# Sprint A — Loop Semantics Convergence

**周期：10 个工作日**
**目标：统一 profile、artifact、revision、readiness，不改变公开 Hook route。**

### Backlog

| ID | Task | SP | 验收 |
|---|---|---:|---|
| LSC-01 | 建立全 profile × operation characterization matrix | 3 | Lite/Standard/Strict × edit/stop/ship fixtures 覆盖当前行为和目标差异 |
| LSC-02 | 实现 ArtifactRequirementPolicy | 5 | 所有工件要求来自一个纯模块 |
| LSC-03 | 修复 Standard/Contract 矛盾 | 3 | Skill、State、PreEdit、Stop、文档一致 |
| LSC-04 | 拆分 authority/subject/evidence/projection revisions | 5 | projection 刷新不改变 authority/progress token |
| LSC-05 | 稳定后分配 state version | 3 | source mutation retry 不提前发布版本 |
| LSC-06 | 实现 evaluateReadiness | 8 | edit/stop/ship 使用同一决策 |
| LSC-07 | Stop 语义清理 | 5 | 无 install fallback、无 mtime touch、无 cache authority |
| LSC-08 | adapter parity + docs | 3 | CLI/MCP/Hook/Skill 对同 fixture 输出一致 |

### Definition of Done

- Standard 的 contract 政策只有一个答案。
- `allowedToEdit`、`allowedToStop`、`readyToShip` 可独立查询。
- revision 与 projection 分离。
- Circuit key 使用 progress token。
- Stop 不再补 mtime。
- 公开 route/tool/CLI 名称不变。
- 旧行为差异有 migration note。
- 全量 characterization、state、hook、workflow tests 通过。

# Sprint B — Hook Runtime Diet

**周期：10 个工作日**
**目标：一个事件一个 runtime decision，一次状态收集。**

### Backlog

| ID | Task | SP | 验收 |
|---|---|---:|---|
| HRD-01 | 建立 LoopEvent / LoopEventResult contracts | 3 | Host-neutral typed protocol |
| HRD-02 | 实现一次性 StateInputCollector | 5 | 每 event 仅收集一次 repo facts |
| HRD-03 | 合并 PreEdit handlers | 5 | 不再 shell + CLI 双重解析 |
| HRD-04 | 合并 SessionStart handlers | 5 | 一个 Context Packet、一次 budget |
| HRD-05 | 精简 Stop handler | 5 | readiness + flush + checkpoint |
| HRD-06 | PostEdit event journal / dirty bits | 5 | 每 edit 至多一个小事件写 |
| HRD-07 | progress-aware circuit + shared lock | 5 | no-progress、oscillation fixtures |
| HRD-08 | event telemetry 与 benchmark | 3 | event-level process/read/write/time 指标 |
| HRD-09 | legacy script retirement cutover | 3 | one-shot adopted fixture migration 后同包删除旧脚本，无双 authority |

### Definition of Done

- 公开 11 个 route tuple 不变。
- 常规 event 只有一个 repo-harness runtime 入口。
- Effective State resolution 每 event 为 1。
- PostEdit 不重渲染 handoff/current。
- Stop 只执行一次 checkpoint transaction。
- 旧脚本在 cutover package 中删除，不保留 steady-state shim。
- 性能 baseline 与目标差异有实测报告。

# Sprint C — Evidence & Projection Convergence

**周期：10 个工作日**
**目标：统一验证证据和恢复投影，删除 latest/handoff 的影子权威。**

### Backlog

| ID | Task | SP | 验收 |
|---|---|---:|---|
| EPC-01 | EvidenceEvent schema + atomic event store | 5 | 单 event 文件、可验证、可重放 |
| EPC-02 | verify runner 产生 authoritative evidence | 5 | required gate 绑定 subject revision |
| EPC-03 | PostBash importer | 3 | 默认 observed，不自动满足 gate |
| EPC-04 | external/manual evidence importer | 5 | trust、actor、reason、subject 完整 |
| EPC-05 | checks/latest materializer | 3 | latest 由 ledger 生成 |
| EPC-06 | canonical checkpoint | 5 | 一次生成 machine + human view |
| EPC-07 | canonical recovery projection generator | 5 | handoff/resume/current/task-handoff 同源，退休 view 同包删除 |
| EPC-08 | Context Packet cutover | 3 | SessionStart p95 token 目标可测 |
| EPC-09 | deprecation/eval/release | 3 | 无投影漂移，升级文档完整 |

---

## 13. PR 顺序建议

### Sprint A

1. Characterization only。
2. Artifact policy pure core。
3. Revision model。
4. Readiness evaluator。
5. PreEdit/Stop cutover。
6. Adapter parity + docs。

### Sprint B

1. Event protocol + collector。
2. PreEdit one-decision cutover。
3. SessionStart Context Packet。
4. PostEdit journal。
5. Stop checkpoint。
6. Circuit/lock。
7. Telemetry and legacy retirement cleanup。

### Sprint C

1. Evidence schema/store。
2. Verify authoritative producer。
3. Observed/external importers。
4. Latest materializer。
5. Checkpoint projector。
6. Canonical recovery views 与旧 authoring path retirement。
7. Migration/deprecation gate。

### PR 规则

- Characterization 与语义改变分开。
- ESA、LSC、HRD、EPC、SSD 不得共享 work-package、worktree、branch 或 PR。
- 每个 successor 必须在 predecessor merge/push 后 fetch，并钉住 live `origin/main` SHA。
- 不在同一 PR 同时改 public route 和 decision semantics。
- 不长期保留两个 readiness evaluator。
- 不用 feature flag 长期运行两个 state algorithm。
- Generated projection 与 canonical source 分开 review。
- 每个行为变化写明 profile、operation、before/after。
- 每个 blocker 变化有 positive/negative fixture。
- 不新增 compatibility alias/shim 或 semantic fallback；任何另行获批的 one-shot migration 必须 fail closed，并在同一 package 删除旧 authority。

---

## 14. 测试矩阵

### Profile × Operation

```text
Lite × plan/edit/verify/stop/ship
Standard × plan/edit/verify/stop/ship
Strict × plan/edit/verify/stop/ship
```

### Authority 状态

```text
no plan
draft plan
approved work package
executing
completed
foreign worktree
missing/corrupt policy
invalid capability registry
conflicting active markers
```

### Evidence 状态

```text
none
observed pass
authoritative pass
authoritative fail
stale subject
review fingerprint mismatch
external pass
manual override
```

### Runtime 状态

```text
cache missing
cache corrupt
live lock
stale lock
source changes mid-read
event replay
duplicate event
process crash before/after rename
```

### Loop 状态

```text
normal progress
same action no progress
A-B-A oscillation
projection-only churn
real evidence progress
profile escalation mid-task
Stop without completion claim
Stop with false done claim
```

### Host parity

```text
Claude
Codex
CLI direct
MCP
```

所有 host 对核心 decision/reason/readiness 必须一致；只允许输出格式和 Host capability 有差异。

---

## 15. 不应该做的优化

1. **不要为了数字好看删除安全 route。**
2. **不要先把所有 Shell 改写成 TypeScript。**先统一语义。
3. **不要把所有文件写入塞进一个全局事务。**
4. **不要把所有 evidence 都视为 pass/fail 二值。**
5. **不要用 cache 加速到成为 authority。**
6. **不要继续用 mtime 代表内容 freshness。**
7. **不要把 install profile 当 task risk profile。**
8. **不要让 Prompt classifier 决定权限或完成状态。**
9. **不要默认每个 Standard task 创建 contract/review/notes 空壳。**
10. **不要同时推进 Skill 重构、Loop Kernel 和 artifact migration。**
11. **不要长期保留新旧两套 Hook decision engine。**
12. **不要用文件数量/代码行数作为唯一成功标准。**

---

## 16. 与 Skill 优化、Effective State Sprint 的关系

执行顺序：

```text
ESA-01..05 + ESA-07 — Done: PR #79 @ 3b33cea
    -> Loop Semantics Convergence
    -> Hook Runtime Diet
    -> Evidence & Projection Convergence
    -> Skill Surface & Discovery Convergence
```

可以复用设计与 evidence，但不得合并 delivery boundary：

- ESA 的 contracts、core/effects seam、capability authority、adapter parity 与 goldens 是 LSC 的固定输入。
- ArtifactRequirementPolicy、Readiness、Stop semantics 与 revision split 只在 LSC 的独立 packages 实现，不回填 ESA PR。
- 每个阶段从上一阶段 merge/push 后的 fresh `origin/main` pin 启动。
- Skill 体系必须等 LSC、HRD、EPC 全部稳定后再做，否则 router 会绑定旧 profile/gate 语义。
- Skill 最终只描述 task workflow，不持有 blocker/freshness/profile 规则。

目标依赖关系：

```text
Core State / Policy / Readiness
          ↓
Loop Kernel
          ↓
CLI / MCP / Hook adapters
          ↓
Skill workflows
```

---

## 17. 最终目标

优化完成后，repo-harness 的内部模型应能用一句话解释：

> 每个 Host 事件只进入一次 Loop Kernel；Kernel 从仓库 authority 解析一次状态，按 profile 和 operation 计算一次 readiness，执行最少必要 effects，把结果写成 typed evidence，并只在阶段转换或 Stop 时生成一次 checkpoint。

相较当前体系，目标不是降低能力，而是：

```text
更少的状态权威
更少的重复读取
更少的热路径写入
无 semantic fallback
更少的 freshness 组合
更少的无进展循环

相同或更强的安全边界
更清楚的阻断原因
更可靠的恢复
更可测的性能
更容易扩展的 Skill/MCP/CLI 表面
```

---

## 18. 已批准的首个任务

```text
Title:
Characterize Loop Semantics Across Profiles and Operations

Task Profile:
eval-only

Scope:
- Lite / Standard / Strict x edit / stop / ship
- reuse ESA goldens
- record current behavior and approved target deltas only

Out of scope:
- every production path
- LSC-02..08 semantic implementation
- Hook Runtime Diet
- Evidence Ledger / Checkpoint
- Skill rename or merge
- compatibility, fallback, dual authority, or silent migration
```

LSC-01 只冻结 baseline；其独立 PR merge 后，LSC-02 才能开始 production semantics。若先做 runtime 合并或把 semantic changes 混入 characterization，最终会失去可审计的 before/after acceptance surface。
