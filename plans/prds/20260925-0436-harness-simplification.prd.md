# PRD: Harness Simplification

> **Status**: Draft
> **Slug**: harness-simplification
> **Created**: 2026-09-25 04:36
> **Updated**: 2026-09-25 04:36
> **Source Spec**: `docs/spec.md`
> **Source Review**: `docs/researches/simplification-gpt.md`（GPT 静态审查，基线 `2c00d4da`）
> **Baseline**: `origin/main@2c00d4da5d0d769223791791c01ae6b501ab2c5f`（package `0.19.2`）
> **Sprint**: `plans/sprints/20260925-0436-harness-simplification.sprint.md`
> **Tier**: standard

## AI Quick-Read Card

- Problem: harness 对普通任务施加的过程成本远超其保护价值：每次 Edit 前约 1.2–1.8 s 的完整状态解析、按文件名关键词误升 Strict、Stop 路径做架构维护甚至本地提交、测试证据要求单一形式；同时约 40% 的源码属于默认关闭或可选的子系统，并部分进入了 hook 热路径。
- Users: 在本仓库和下游仓库中使用 repo-harness 的 Claude / Codex agent，以及维护者本人。
- Platform: Bun CLI + 用户级 hook（`repo-harness-hook`）+ npm 包。
- P0 surface: `src/core/workflow/profile.ts`、`src/effects/state/resolve-effective-state.ts`、`src/cli/hook/{mutation-guard,mutation-observed,stop-handler,prompt-handler,session-context}.ts`、`scripts/verify-contract.sh`、契约模板、hook bundle 组成。
- Core metric: PreEdit 的完整状态解析次数 ≥3 → 0；Stop 触发的 git ref 更新 → 0；hook bundle 不含可选子系统。
- Hard constraint: 授权边界、路径 / worktree 安全、验证证据真实性、交付版本一致性不能退化；安全相关改动按目标分支（base）策略审查。
- Key risk: 删掉的是"仪式"还是"保护"区分不清；可选子系统抽离时牵连 MCP 工具面。
- Unknowns: macOS 原生耗时基线；是否有消费方依赖 PreEdit 发布的 `state_version`；下游是否在用 fleet / campaign / engineers。
- Acceptance scenarios: 见下文 9 条，全部机器可验。
- Suggested next step: 执行 Sprint 第 1 行（HS0 基线与 ratchet 骨架）。

## Problem

### 产品定位收敛

把 repo-harness 从"规定 agent 如何拆任务、如何写代码、如何证明每一步合规的流程系统"收敛为：

> **帮助 agent 找到正确上下文、守住授权边界、保存真实验证证据，并在交付时检查结果的薄层。**

模型能力增强后，可以减少过程干预；但授权、数据安全、验证真实性和交付一致性不能靠模型能力替代。

### 已核实的问题（基线 `2c00d4da`，本 PRD 作者实测）

以下数据在本机 Linux VM + 共享目录挂载环境中采集，绝对耗时偏高；**相对比例和计数可信，macOS 原生耗时须在 HS0 重采**。

1. **编辑热路径过重。**`resolvePreEditEffectiveState` 调用带锁、带发布的完整 `resolveEffectiveState`：`resolveStableEffectiveState` 至少做 2 次完整的 `resolveEffectiveStateUnlocked`，提交版本时的 confirm 回读再做 1 次，最少 3 次；外层还有 2 层重试（`resolve-effective-state.ts:798-866`、`runtime.ts:308-338`）。
   - 实测：PreEdit（lite 路径）单次 1242–1767 ms；只读稳定解析 521–1030 ms；带锁完整解析 916–1461 ms。
   - 对照：在非 opt-in 目录的空载冷启动热身后只要 28–35 ms，PostToolUse trace-observer 43–124 ms。
   - **结论：成本集中在状态解析，不在 bundle 加载。懒加载不是性能优先项。**
   - 遥测把这一串解析计为 1 次 `state_resolutions`，实际开销被低估。
2. **关键词定风险，误报漏报都有。**用 `resolveWorkflowProfile` 对 `git ls-files src tests docs` 逐个计算：
   - src 有 21/475 个文件被判为 Strict，docs 14/340，tests 8/566。
   - 误报：`src/core/adoption/source-checkout.ts` 因 `checkout` 被判为 **payment**；`src/cli/hook/session-context.ts` 因 `session` 被判为 **auth**。实测编辑它被 `[PlanStatusGuard]` 以 `risk-floor:strict:auth` 阻断（exit 2）。
   - 漏报：真正的风险下限权威 `src/core/workflow/profile.ts` 本身只是 **lite**，编辑时 exit 0。
   - capability ID `inspection-migration` 也会把整个 capability 拉进 Strict。
   - 结论：关键词既误报又漏报，不能作为运行时权威。
3. **Stop 承担维护任务。**`stop-handler.ts` 依次执行：
   - 架构投影 drain + cascade + restamp publication（`:743-772`，restamp 会 `git commit-tree` + `update-ref`）；
   - checkpoint、handoff/resume/event/run-summary 投影；
   - 完整状态解析；
   - 在 lite 提前返回**之前**执行 minimal-change enforce（`:876-897`，本仓库 `minimal_change.mode = "enforce"`）；
   - refactor recommendations，可直接 `block`（`:901-903`）；
   - PlanCompletenessGate 阻断（`:647-689`）。
   - 已经存在显式命令 `repo-harness run architecture-projection publish-restamp`（`src/cli/commands/architecture-projection.ts:80`），Stop 自动 restamp 没有必要。
4. **TDD 形式化。**
   - `mutation-guard.ts:691-710` 按"是否存在同名相邻测试文件"逐文件提示"write a failing test first"。
   - `prompt-handler.ts:588-589` 在 prompt 层注入 TDD/BDD advice。
   - bugfix 契约硬性要求 `pre_fix_failure_artifact`：必须有非零的 `PRE_FIX_EXIT=`，并包含 regression_guard 路径，见 `verify-contract.sh:238-300`。
   - 这种证据无法证明失败原因与目标缺陷相关，还把平台、进程、集成类缺陷排除在外。
5. **过细 Allowed Paths 已经反向伤害代码。**`mutation-observed.ts:184-188, 316-318, 459-461, 740-743` 的注释写明：因为目标文件不在 Allowed Paths 内，只能"verbatim re-port"`normalizeFilePath / getActivePlan / policyGet / repoRelativePath` 等 helper，而不是 import。
6. **可选子系统进入核心。**
   - `src` 共 144,734 行 TS（tests 148,860 行，shell 29,543 行）。
   - policy 中 mode 为 `off` 的子系统（campaign/automation、collaboration、agent_runtime、refactor、external_sources），加上 engineers、fleet、operator/operator-web、chatgpt-browser，合计约 59k 行（不含对应的 MCP tools 与测试）。
   - hook bundle（858 KB）包含 `src/*/fleet`（`task-inbox-handler.ts`，每次 UserPromptSubmit 都会跑）、`src/*/engineers`（经 fleet 引入）、`src/*/refactor`（经 `stop-handler.ts`）。
   - `agent_fleet.install_mode = "auto-install-on-init"` 会默认安装 7 个 agent。
7. **文档自相矛盾、上下文错位。**
   - `docs/spec.md:72` 仍写 "Hooks remain fail-open observers"，与 PreEdit / Stop 会阻断的事实相反。
   - `plan.template.md` 仍把已退役的 `.claude/.active-plan` 写成 "legacy fallback during transition"。
   - 根 `CLAUDE.md` / `AGENTS.md` 携带 `src/effects/automation` 一个模块的 Architecture Contract 块。
8. **复杂度会反弹。**`docs/researches/20260712-harness-kernel-reduction.md` 已宣布收敛为"deterministic kernel"，两个多月后复杂度又长回来。**本轮必须附带只能收紧的 ratchet，否则等于一次性清理。**

### Product Direction

- Hard Constraints:
  - `_ops`、`_ref`、secret、路径逃逸、worktree 归属、破坏性操作边界继续 fail closed。
  - 交付门禁（merge gate）继续读取精确 base 的策略并绑定 receipt/seal。
  - 不原地改写历史验收证据；运行中的契约通过显式升级或关闭迁移。
  - hook 的 `(event, routeId, matcher)` 是宿主公共契约，改动必须伴随 adapter 迁移和契约测试。
  - 遵守仓库原则：单一权威、不引入稳态兼容层或影子解析器，一次性迁移必须 fail closed，并在同一工作包内移除旧路径。
- Recommended Defaults:
  - 风险由**显式声明的受保护边界**和**操作类型**决定；复杂度（文件数、跨 capability）只决定要不要写计划。
  - Stop = 保存恢复状态并退出。
  - PreEdit 只读授权视图。
  - 验证证据接受真实运行证据，也接受显式的"未验证 + 原因"。
- Freedoms: 工作包内部如何拆分、是否先写测试、是否提取公共函数、是否派子 agent，都交给执行 agent 决定。

### Feasibility Boundary

- Confirmed：上文 1–8 均在 `2c00d4da` 实测或读码确认，命令记录在附录 A。
- [UNKNOWN]：macOS 原生耗时；`state_version` 在 PreEdit 路径上的消费方；下游仓库对可选子系统的使用情况。
- [UNVERIFIED]：GPT 审查引用的 July 基准（`evals/harness/reports/profile-comparison.md`，源码提交 `b32b3282`）只说明方向，不作为本轮的数值基线。

## Users

### Primary Users

- 执行 agent（Claude Code / Codex）
  - Need：普通修改不被流程打断；高风险修改有清楚、稳定的边界提示。
  - Success signal：Lite 任务零阻断、零新增工件；首次有效编辑时间下降。
- 维护者（Ko）
  - Need：能判断工作是否真正完成；harness 自身可维护、不反弹。
  - Success signal：ratchet 预算只收紧；可选子系统不再牵动核心改动。

### Secondary Users

- 下游仓库 operator
  - Need：升级后行为可预期；已显式选择的配置不被静默覆盖。
  - Success signal：升级迁移产出明确 diff，缺少声明时 fail closed 并给出修复命令。
- 外部审查者（GPT / Claude review）
  - Need：审查输入小而准。
  - Success signal：审查消费既有证据，不重复执行。

## Success Criteria

所有"计数类"指标由 `evals/harness/budgets.json` + `tests/harness-budget-ratchet.test.ts`（HS0 建立）在 CI 中门禁，数值只能往更严的方向改。"耗时类"指标只报告、不门禁。

| Metric | Baseline (`2c00d4da`) | Target | Measurement Method | 由哪一行达成 |
|---|---:|---:|---|---|
| PreEdit 完整状态解析次数 | ≥3 | 0 | 新增遥测计数 `state_full_resolves` | HS4 |
| PreEdit 授权源读取轮数 | n/a | ≤2 | 新增遥测计数 `state_authority_reads` | HS4 |
| PreEdit p50 耗时（macOS 原生） | HS0 采集 | ≤ 基线 40% | 复用 `tests/hook-runtime-characterization.test.ts` + `scripts/hook-dispatch-diet-report.ts` | HS4（只报告） |
| Stop 触发的 git ref 更新 | 条件满足时 1 | 0 | 测试比对 Stop 前后 `git for-each-ref` 与 reflog | HS1 |
| Stop 可阻断的来源 | 5 类 | 1 类（活动契约恢复记录持久化失败） | 对 `stop-handler.ts` 的 block 调用做结构测试 | HS1+HS3 |
| tracked src 中被判为 Strict 的文件 | 21（关键词） | 等于声明集合 | profile fixture 矩阵测试 | HS2 |
| Lite 编辑的 TDD/BDD 提示行数 | 每个"无相邻测试"的文件 2 行 | 0 | hook 输出快照 | HS1 |
| Lite 场景新增 tracked 工作流工件 | HS0 采集 | 0 | eval 场景 `single-file-small-bug` 结束后 `git status` | HS0 → HS5 |
| hook bundle 输入中的可选子系统前缀 | fleet、engineers、refactor | 无 | `bun build --metafile` 检查 | HS6b |
| hook bundle 大小 | 858 KB | HS6b 实测值 + 5% 上限 | 同上 | HS6b |
| `src` TS 行数 | 144,734 | HS6a 决定的上限 | `wc -l` 预算 | HS6b |
| 根 CLAUDE/AGENTS 中的模块 Architecture Contract 块 | 1 | 0 | 文本断言 | HS7 |
| mutation-observed 等处的 "re-port" 重复 helper | ≥4 处 | 0 | 按 "re-port" 注释计数 + 共享模块 import | HS5 |
| adaptive-lite 相对 no-harness 的耗时 / token | HS8 采集 | 方向性目标：耗时 ≤1.5×，非缓存 token ≤2× | `bun run benchmark:harness`，同 provider、同版本 | HS8（只报告） |

## Acceptance Scenarios

### Scenario 1 — 普通小修复

- Given：`single-file-small-bug` 场景，目标文件不在任何声明的受保护边界内。
- When：agent 完成修复并 Stop。
- Then：不要求 plan / contract / notes / review；没有 TDD 提示；Stop 不阻断，也不写 git ref。
- Machine-checkable evidence：eval 场景断言 + `tests/harness-budget-ratchet.test.ts`。

### Scenario 2 — 名称撞上关键词的普通模块

- Given：已声明受保护边界，编辑 `src/cli/hook/session-context.ts` 或 `src/core/adoption/source-checkout.ts`。
- When：PreEdit。
- Then：profile 为 lite（或因跨 capability 为 standard），不再出现 `risk-floor:strict:auth` 或 `risk-floor:strict:payment`。
- Machine-checkable evidence：profile fixture 矩阵。

### Scenario 3 — 声明的受保护边界

- Given：`src/cli/mcp/oauth.ts` 属于声明的 `auth` 边界，哪怕只改一行。
- When：PreEdit。
- Then：Strict；没有 separate contract 和 isolated worktree 时拒绝编辑。
- Machine-checkable evidence：profile fixture 矩阵 + 现有 `tests/runtime-profile-enforcement.test.ts`。

### Scenario 4 (negative) — 缺少声明

- Given：policy 中没有 `guards.protected_boundaries`（未迁移的下游仓库）。
- When：PreEdit 任意实现文件。
- Then (must NOT)：不能静默判为 lite；以 `risk-floor:strict:protected-boundaries-undeclared` fail closed，并输出迁移命令。
- Machine-checkable evidence：fixture 测试。

### Scenario 5 — bugfix 使用真实运行证据

- Given：进程或安装类缺陷，没有可行的单元回归测试。
- When：契约在 Root Cause Evidence 中引用 Verification Plan 的 `command` / `smoke` 条目，或写明 `unverified: <原因>`。
- Then：standard 可以交付，并记录剩余风险；strict 在 `unverified` 时拒绝交付。
- Machine-checkable evidence：`verify-contract` fixtures。

### Scenario 6 — 可选架构工具失败

- Given：architecture projection provider 不可用。
- When：普通 Stop。
- Then：恢复记录照常保存，Stop 不阻断；pending 投影事实被记录，并在下次 SessionStart 或交付准备时可见。不得声称已完成架构维护。
- Machine-checkable evidence：`stop-handler` 测试。

### Scenario 7 (negative) — 交付一致性不退化

- Given：验证失败、证据陈旧、目标分支移动或 receipt 过期。
- When：prepare-acceptance / merge gate。
- Then (must NOT)：不能交付。
- Machine-checkable evidence：现有 merge-gate、陈旧 receipt、路径逃逸、worktree 归属、进程清理的负向测试全部保持通过，本轮不删除其中任何一条。

### Scenario 8 — 相同输入复用证据

- Given：已有与当前 subject 绑定的有效检查证据。
- When：换一个审查角色消费。
- Then：不重新执行。
- Machine-checkable evidence：现有证据复用测试保持通过。

### Scenario 9 — 编辑判定等价

- Given：HS4 前录制的 PreEdit 决策 golden（仓库状态 × 目标路径矩阵）。
- When：切换到授权视图。
- Then：除 HS2 有意改变的 profile 外，allow / block 决策和阻断原因码逐项一致。
- Machine-checkable evidence：golden 差分测试。

## Non-goals

- 不新增第四档 profile，不新建风险引擎、DSL、守护进程、数据库或遥测平台。
- 不做"智能测试选择器"；本地检查归属是一张显式表。
- 不重排或删除 hook 路由，除非伴随 adapter 迁移和契约测试（HS6b 的 inbox 路由条件注册除外，同样需要迁移）。
- 不放宽现有 CI / release lane；本轮不把"增加并行"作为优化项。
- 不重写历史 receipt、review 或 contract 的验证语义。
- 不以"测试文件数量减半"之类表面指标为目标。
- 不在本轮把单包仓库改成 monorepo；抽离出去的子系统要么进独立仓库或包，要么删除，由 HS6a 决定。

## Module Behaviors (P0)

### M1 风险下限（`src/core/workflow/profile.ts`）

- Purpose：只根据**声明的受保护边界**和**操作类型**给出 Strict。
- Hard Constraints：
  - 自然语言输入不能降低下限；
  - `explicitOverride` 低于下限时拒绝；
  - 信号缺失时 fail closed 为 Strict。
- Recommended Defaults：
  - policy 新增 `guards.protected_boundaries = { version: 1, entries: [{ id, category, paths: [glob] }] }`，category 沿用现有 `StrictRiskCategory`，不新增词汇；
  - 删除运行时的 `STRICT_CATEGORY_TOKENS` 路径 / capability 扫描，以及 `strictScanPaths` 参数；
  - `operationKind` 为 deploy / release / migration / destructive 时仍为 Strict；
  - `mediumScope`（≥4 路径）不再抬高下限，改为 `complexity-hint` reason；跨 capability 和 `feature` 仍为 Standard。
- Freedoms：glob 匹配实现。
- Normal path：目标路径命中某个 entry → Strict，reason 为 `risk-floor:strict:<category>:<entry-id>`。
- Failure path 1：policy 缺少声明 → Strict，reason 为 `protected-boundaries-undeclared`。
- Failure path 2：声明格式非法 → `INVALID_RISK_INPUT` → Strict。
- 一次性迁移：`repo-harness init/upgrade` 用旧关键词表在**目录粒度**扫描 tracked 源码，生成候选 entries 写入 policy，并打印出来供人确认。关键词表只留在迁移代码中，运行时不再引用。
- 本仓库初始声明（HS2 审查时确认）：
  - `security`：`.ai/harness/policy.json`、`src/core/workflow/**`、`scripts/merge-gate.ts`、`assets/templates/helpers/merge-gate.ts`、`src/{core,effects}/publication/merge-readiness.ts`、`src/effects/path-safety.ts`、`src/cli/chatgpt-browser/secret-scan.ts`、`src/effects/evidence/secret-env.ts`、`src/cli/commands/security.ts`；
  - `auth`：`src/cli/mcp/{auth,oauth}.ts`；
  - `release`：`src/{core,effects}/release/**`、`scripts/check-npm-release.sh`；
  - `deploy`：`deploy/**`。
- Open decisions：Agent 指令和模板类 Markdown（`AGENTS.md`、`.claude/**`、`agents/**`、`assets/templates/**`）是否声明为受保护边界，默认不声明，由 HS2 审查决定。

### M2 编辑授权视图（`src/effects/state/`）

- Purpose：PreEdit 只读取做出 allow/block 决策所需的授权事实。
- Hard Constraints：
  - 与完整 `EffectiveState` 共用同一个计算函数（完整解析器内部调用它），不形成第二权威；
  - 不用 TTL 替代一致性检查。
- Recommended Defaults：
  - `resolveEditAuthority(repoRoot, targetPaths)` 读取 policy（guards / protected_boundaries / edit_plan_gate）、active-plan / active-worktree marker、plan 状态、contract allowed_paths、worktree 归属，并对目标路径做 capability 前缀匹配；
  - 稳定性检查只对这些源重新计算哈希（与现有 `authoritySourceHashes` 同集），不一致时重试 ≤2 次，仍不一致抛现有的 `StateResolutionUnstableError`；
  - PreEdit 不发布 cache，也不提交 `state_version`；
  - SessionStart、`state resolve` CLI、prepare-acceptance 仍走完整解析。
- Failure path：授权源读取失败时，沿用现有 PreEdit 的 null / 抛错划分。
- Open decisions：是否存在依赖 PreEdit bump `state_version` 的消费方。HS4 第一步用 grep 加测试确认；若存在，改为由消费方显式读取。

### M3 Stop（`src/cli/hook/stop-handler.ts`）

- Purpose：提交恢复记录、保存证据引用、说明未完成事项，然后退出。
- 保留：
  - journal flush；
  - checkpoint；
  - handoff / resume / event / run-summary 投影（**内容不变时不重写**）；
  - retention（保持现有预算）；
  - `readyToShip` 提示（不阻断）。
- 移出：
  - restamp publication → 仅保留显式命令 `architecture-projection publish-restamp`；
  - 架构投影 drain / cascade → 只追加 pending 事实，由显式命令或交付准备执行；
  - refactor recommendations → 只做提示，永不 `block`；
  - minimal-change enforce → 移到 prepare-acceptance 并保留 audit receipt 语义，Stop 最多给一次提示；
  - PlanCompletenessGate → 降为提示。
- 唯一阻断：存在活动契约，且恢复记录持久化失败。
- 迁移：用户级 `~/.repo-harness/config.json#architecture` 中已显式选择的行为，由 upgrade 映射为对应的显式命令提示，不静默丢弃。

### M4 契约与验证证据（`scripts/verify-contract.sh`、`scripts/contract-run.ts`、`.claude/templates/contract.template.md`）

- Root Cause Evidence：
  - `root_cause`、`repro` 仍须具体；
  - `regression_guard` 改为 `verification_ref`，引用 Verification Plan 中任意 kind 的条目 id，或写 `unverified: <原因>`；
  - `pre_fix_failure_artifact` 改为可选，提供时按现有规则校验。
- strict 下 `unverified` 阻断 ship；lite / standard 记录剩余风险后放行。
- 契约只生成适用的区块：
  - Root Cause 仅用于 bugfix；
  - Delegation Contract 仅在有委派时生成；
  - benchmark 区块仅在需要消费时生成。
- 解析收敛：契约解析、规范化、元数据校验只保留一个 TS 实现（`contract-run.ts`）；`verify-contract.sh` 通过 JSON 消费其结果，删除 shell 侧的 YAML/字段解析函数。
- allowed_paths：计划投影成契约时按工作包涉及的 capability 前缀 + 对应测试生成 glob，不再逐文件枚举；需要扩展范围仍须显式声明。

### M5 可选子系统边界

- HS6a 为每个子系统产出 keep-core / extract / delete 决策（human_decision_boundary）。
- 默认建议：

| 子系统 | 约行数（core+effects+cli） | policy 默认 | 建议 |
|---|---:|---|---|
| automation / campaign | 14.1k | off | extract 或 delete |
| engineers | 13.9k | — | extract（连同 MCP `engineer-tools`） |
| operator + operator-web | 10.7k | — | extract（独立 UI 包，移出 `prepack`） |
| collaboration | 8.3k | off | extract 或 delete（连同 MCP `collaboration-tools`） |
| fleet | 5.1k | — | extract；`UserPromptSubmit.inbox` 仅在启用时注册；`agent_fleet.install_mode` → `explicit` |
| chatgpt-browser | 3.1k | — | extract 或 delete |
| refactor | 2.5k | off | 从 Stop 移除；CLI 保留或删除 |
| external-sources | 1.5k | off | delete 或 extract |
| publication / review / evidence / state / workflow | — | — | keep-core |
| MCP reader（去掉上述 tools 后） | — | — | keep-core（待确认） |

## Data Model

```jsonc
{
  "version": "1",
  "entities": [
    {
      "id": "protected_boundaries",          // .ai/harness/policy.json#guards.protected_boundaries
      "owner": "repo operator",
      "fields": {
        "version": "1",
        "entries": "[{ id: string, category: StrictRiskCategory, paths: glob[] }]"
      }
    },
    {
      "id": "harness_budgets",                // evals/harness/budgets.json
      "owner": "repo maintainer",
      "fields": {
        "version": "1",
        "metrics": "{ [metric_id]: { value: number | string[], direction: 'max' | 'exact-set', owner_row: string } }"
      }
    }
  ],
  "relationships": [
    "budgets ratchet: CI 比较 PR 与 base 的 budgets.json，任何 metric 只能更严（数值变小或集合变小）"
  ]
}
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| PreEdit p50（macOS 原生，lite） | ≤ HS0 基线的 40% | hook runtime characterization，20 cycles | 基线的 60% |
| Stop p50（lite，无活动契约） | ≤ HS0 基线的 50% | 同上 | 基线的 75% |
| SessionStart | 不高于 HS0 基线 | 同上 | +10% |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| macOS 原生 hook 耗时 | 百分比目标的基数 | HS0 在维护者机器上运行 characterization | Maintainer |
| PreEdit `state_version` 消费方 | HS4 能否停止发布 | HS4 第一步：grep 加测试 | HS4 执行者 |
| 下游是否使用 fleet / campaign / engineers | HS6b 的删除或抽离方式 | HS6a 决策记录 | Maintainer |
| 受保护边界是否覆盖指令类 Markdown | Strict 集合范围 | HS2 审查 | Maintainer |
| PlanCompletenessGate 的实际价值 | M3 是否整个删除 | HS3 查看近 30 天 Stop 事件中该 gate 的触发记录 | HS3 执行者 |

## Self-Hosting Cost

本轮改动的是 harness 自身，受 harness 自己约束：

- merge gate 读取 **base** 策略。在现行关键词规则下，`session-context.ts`、`session-context-budget.ts` 等是 Strict，`profile.ts` 反而是 lite。
- 因此 **HS2（风险下限）必须排在 HS4 / HS7 之前**：HS2 合入后，后续涉及 `session-*` 文件的工作包按新的声明集合评估，避免被误判为 Strict，走一遍不必要的 contract + worktree + 外部验收。
- HS2 自身在旧规则下为 standard（跨 capability），接受这笔一次性成本。
- 每一行一个工作包；只有 Strict 的行才生成单独契约，其余用 standard 工作包，不为本轮再造过细的任务。

## Developer Handoff

You are implementing this PRD.

- Build first：HS0 的 budgets.json、ratchet 测试和基线采集。没有基线，后续每一行都无法验收。
- Do not reinterpret：
  - "风险只来自声明边界和操作类型"；
  - "Stop 唯一阻断来源"；
  - "授权视图与完整解析共用同一函数"；
  - "budgets 只能收紧"。
- You may improve：函数拆分、测试组织、迁移命令的交互形式。
- Verify with：各行 Acceptance、`tests/harness-budget-ratchet.test.ts`、根 `CLAUDE.md` 的 Required Checks，以及 Scenario 7 的负向测试集。

### Acceptance Scripts

1. `bun test tests/harness-budget-ratchet.test.ts`
2. `bun test tests/runtime-profile-enforcement.test.ts tests/effective-state.test.ts tests/merge-gate.test.ts`
3. `bun build src/cli/hook-entry.ts --target=bun --outfile /tmp/he.js --metafile=/tmp/he-meta.json`，再断言 inputs 中没有禁止前缀
4. `bun run benchmark:harness`（仅 HS8，同 provider、同版本、同快照）

## Review Focus（请外部审查重点质疑）

1. 缺少 `protected_boundaries` 时 fail closed 为 Strict，这对下游升级是否过于激进？替代方案（关键词命中时降为 Standard 下限）会引入稳态回退路径，违背仓库原则。
2. 本仓库初始声明集合把 `src/core/workflow/**` 和 policy 列为 `security`，是否过宽或过窄？
3. minimal-change 从 Stop 移到 prepare-acceptance 后，是否仍能拦住它原本要拦的"lite 下隐藏的新依赖"？
4. HS4 停止在 PreEdit 发布 `state_version`，是否破坏跨 hook 的一致性假设？
5. HS6a 的默认建议是否误伤实际在用的能力？

## Appendix A — 基线采集命令（`2c00d4da`，Linux VM）

- Profile 统计：一个临时 bun 脚本对 `git ls-files src tests docs` 逐个调用 `resolveWorkflowProfile({ targetPaths: [f], operationKind: 'edit' })`，统计各 profile 的数量，并输出 strict 条目及类别。
- Hook 耗时：`echo <payload> | bun /tmp/he.js PreToolUse --route edit`（bundle 由 `bun build src/cli/hook-entry.ts` 生成），分别对 `src/core/workflow/profile.ts`（exit 0）和 `src/cli/hook/session-context.ts`（exit 2，strict:auth）各跑 3 次、2 次。
- 解析器耗时：直接调用 `resolveEffectiveStateReadOnly` 与 `resolveEffectiveState`，risk 为 `{ targetPaths: ['src/core/workflow/profile.ts'], operationKind: 'edit' }`，各 3 次。
- Bundle 组成：`bun build --metafile`，按 `src/<layer>/<dir>` 聚合 inputs 字节数，并追踪跨前缀的 import 边。
