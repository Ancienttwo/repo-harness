# PRD: Harness Simplification

> **Status**: Draft
> **Slug**: harness-simplification
> **Created**: 2026-09-25 04:36
> **Updated**: 2026-09-25
> **Review Disposition**: request-changes 已落实到本 Draft；尚未批准整轮执行
> **Source Spec**: `docs/spec.md`
> **Source Review**: `docs/researches/simplification-gpt.md`（GPT 静态审查，基线 `2c00d4da`）
> **Baseline**: `origin/main@2c00d4da5d0d769223791791c01ae6b501ab2c5f`（package `0.19.2`）
> **Sprint**: `plans/sprints/20260925-0436-harness-simplification.sprint.md`
> **Tier**: standard

## AI Quick-Read Card

- Problem: 普通任务承担重复状态解析、关键词误判、Stop 维护副作用和形式化证据成本；原作者报告 Linux VM 中 PreEdit 约 1.2–1.8 s，Mac 待复测。
- Users: 在本仓库和下游仓库中使用 repo-harness 的 Claude / Codex agent，以及维护者本人。
- Platform: Bun CLI + 用户级 hook（`repo-harness-hook`）+ npm 包。
- P0 surface: `src/core/workflow/profile.ts`、`src/effects/state/resolve-effective-state.ts`、`src/cli/hook/{mutation-guard,mutation-observed,stop-handler,prompt-handler,session-context}.ts`、`scripts/verify-contract.sh`、契约模板、hook bundle 组成。
- Core metric: PreEdit 完整状态解析次数 ≥3 → 0；普通 Stop 不更新 Git ref；Lite 不产生逐文件 TDD 提醒；未启用能力无扫描、初始化、提示注入和进程副作用。
- Hard constraint: 授权边界、路径 / worktree 安全、验证证据真实性、交付版本一致性不能退化；安全相关改动按目标分支（base）策略审查。
- Key risk: profile 声明未落实到真实门禁；未验证被当作通过；导航范围被误当作授权；轻视图遗漏变更集合或实时消费者。
- Unknowns: macOS 原生性能；有效状态缓存各消费者的实时性要求；下游可选能力使用与迁移成本。
- Acceptance scenarios: 见下文 9 条，全部机器可验。
- Suggested next step: 先完成执行队列 SIGPIPE 小修并复核本 Draft，再批准具体工作包；不要直接启动整轮。

## Problem

### 产品定位收敛

把 repo-harness 从"规定 agent 如何拆任务、如何写代码、如何证明每一步合规的流程系统"收敛为：

> **帮助 agent 找到正确上下文、守住授权边界、保存真实验证证据，并在交付时检查结果的薄层。**

模型能力增强后，可以减少过程干预；但授权、数据安全、验证真实性和交付一致性不能靠模型能力替代。

### 基线证据（`2c00d4da`，原 PRD 作者的实测与读码记录）

以下耗时由原作者在 Linux VM + 共享目录挂载环境采集，本次修订未重测。同一环境、同一输入支持状态解析是主要成本；跨文件系统、操作系统的耗时比例仍须重测。HS0 的 Mac 数据决定性能结论，但不阻塞删除提醒、修正文档等独立减法。代码调用次数与耗时证据分开记录。

1. **编辑热路径过重。**`resolvePreEditEffectiveState` 调用带锁、带发布的完整 `resolveEffectiveState`：`resolveStableEffectiveState` 至少做 2 次完整的 `resolveEffectiveStateUnlocked`，提交版本时的 confirm 回读再做 1 次，最少 3 次；外层还有 2 层重试（`resolve-effective-state.ts:798-866`、`runtime.ts:308-338`）。
   - 实测：PreEdit（lite 路径）单次 1242–1767 ms；只读稳定解析 521–1030 ms；带锁完整解析 916–1461 ms。
   - 对照：在非 opt-in 目录的空载冷启动热身后只要 28–35 ms，PostToolUse trace-observer 43–124 ms。
   - **该环境下状态解析是主要成本，HS4 是性能主项；Mac 收益由复测确认。**
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
8. **复杂度会反弹。**`docs/researches/20260712-harness-kernel-reduction.md` 已宣布收敛为"deterministic kernel"，两个多月后复杂度又长回来。**用少量行为约束防反弹，不把代码体积下降当作正确性的替代。**

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
  - 验证接受与当前改动相关的真实运行证据；`unverified` 只记录缺口，不满足任何必需检查。
- Freedoms: 工作包内部如何拆分、是否先写测试、是否提取公共函数、是否派子 agent，都交给执行 agent 决定。

### Feasibility Boundary

- Recorded：上文是原作者对 `2c00d4da` 的实测 / 读码记录，命令见附录 A；本次文档修订不把它们升级为新版本实测。
- [UNKNOWN]：macOS 原生耗时；`state_version`、`effective.json`、`workflow_profile`、`progress_token`、`authority_revision` 各消费者对 PreEdit 发布的依赖；下游可选能力使用情况。
- [UNVERIFIED]：GPT 审查引用的 July 基准（`evals/harness/reports/profile-comparison.md`，源码提交 `b32b3282`）只说明方向，不作为本轮的数值基线。

## Users

### Primary Users

- 执行 agent（Claude Code / Codex）
  - Need：普通修改不被流程打断；高风险修改有清楚、稳定的边界提示。
  - Success signal：满足授权与安全条件的普通 Lite 任务无过程阻断、无新增工作流工件；首次有效编辑时间下降。
- 维护者（Ko）
  - Need：能判断工作是否真正完成；harness 自身可维护、不反弹。
  - Success signal：行为成本不反弹；可选能力的未启用路径无运行副作用。

### Secondary Users

- 下游仓库 operator
  - Need：升级后行为可预期；已显式选择的配置不被静默覆盖。
  - Success signal：升级迁移产出明确 diff，缺少声明时 fail closed 并给出修复命令。
- 外部审查者（GPT / Claude review）
  - Need：审查输入小而准。
  - Success signal：审查消费既有证据，不重复执行。

## Success Criteria

`evals/harness/budgets.json` 只约束可执行行为与明确口径的调用预算；实现达标的同一提交才收紧预算。耗时、总 TS 行数、bundle 字节数与组成只报告，注明工具链，不设永久单向硬限制。未来目标留在本 PRD 或决策记录，不预写进生效预算。

| Metric | Baseline (`2c00d4da`) | Target / 口径 | 验证入口 | 达成行 |
|---|---|---|---|---|
| PreEdit 完整解析次数 | 无竞争成功路径至少 3 次 | 0 | 真实 PreEdit 调用计数 `state_full_resolves` | HS4 |
| PreEdit 授权源读取轮数 | 待建立口径 | 无竞争成功路径 ≤2；初读 + 稳定性回读 | `state_authority_reads`；竞争重试另测 | HS4 |
| PreEdit p50（Mac） | HS0 采集 | 方向性目标 ≤ 基线 40%，只报告 | 同输入、环境、工具链的 characterization | HS4 |
| 普通 Stop 的 Git ref 更新 | 有条件发生 | 0 | 真实 Stop 前后 refs / reflog | HS1 |
| Stop 阻断条件 | 维护、建议等多类来源 | 仅活动契约的恢复记录持久化失败 | 真实行为矩阵，不数源码 `block` | HS3 |
| Strict 风险信号 | 路径 / capability 关键词及操作类型 | 已确认保护声明 + 全部显式高风险操作 | profile 与真实 PreEdit；配置不完整另行拒绝 | HS2 |
| Lite 逐文件 TDD/BDD 提示 | 按相邻测试文件提示 | 0 | Edit / Prompt 输出 | HS1 |
| 普通 Lite 新增 tracked 工作流工件 | HS0 采集 | 0 | 普通小修到受管理交付的完整场景 | HS5 |
| 未启用可选能力的副作用 | 部分进入默认 hook 路径 | 不扫描、不初始化、不注入提示、不启动进程 | 禁用 / 启用配置矩阵与真实入口 | HS6b（后置） |
| 根上下文模块 Architecture Contract | 原作者记录 1 个模块块 | 0，模块本地上下文仍有效 | 上下文投影结果 | HS7 |
| helper 重复实现 | 原作者记录至少 4 处 | 实际共用实现，保持行为 | 调用路径与行为测试，不数注释 | HS5 |
| adaptive-lite 相对 no-harness 耗时 / token | HS8 对照 | 方向性目标 ≤1.5× / ≤2×，只报告 | 固定版本、环境的 harness benchmark | HS8 |

## Acceptance Scenarios

### Scenario 1 — 普通小修复及轻路径交付

- Given：合法确认的边界声明，`single-file-small-bug` 目标未受保护，无显式高风险操作。
- When：agent 完成编辑、Stop，并走已有 Lite 受管理交付入口。
- Then：不强制生成 plan / contract / notes / review，无逐文件 TDD 提醒，Stop 不更新 Git ref；所有必需的 subject-bound targeted checks 仍须通过。
- Evidence：真实入口 / eval；覆盖 Standard 不要求 separate contract 的交付路径，不能为运行 minimal-change 检查强建契约。

### Scenario 2 — 名称不再猜风险

- Given：明确未受保护的 fixture 路径包含 `session`、`checkout`、`auth`，capability 名称包含 `migration`，操作为普通 edit。
- When：PreEdit。
- Then：这些名字本身不触发 Strict；复杂度依现有计划策略处理。真实 `session-context.ts` 是否受保护取决于授权职责审查，不能用负向测试预先豁免它。
- Evidence：profile 矩阵与入口测试，覆盖全部九种显式操作仍为 Strict。

### Scenario 3 — 保护声明约束实际入口

- Given：已确认声明保护 policy、授权实现或被执行链消费的 Markdown 策略模板。
- When：无有效授权时通过真实 PreEdit 修改这些文件，或提交先删声明再改原受保护代码的候选。
- Then：普通 workflow / Markdown 免计划豁免不能覆盖保护声明；候选不得用自己的策略降低所需验收，按可信目标分支策略与已批准范围裁决。
- Evidence：PreEdit 与交付门禁负向测试；Strict 契约 / worktree 要求保持。

### Scenario 4 (negative) — 缺失声明与确认式迁移

- Given：声明缺失、非法，或只有尚未确认的迁移候选。
- When：实现编辑。
- Then：拒绝并说明“授权配置未完成”及明确迁移 / 修复入口；不能靠满足普通 Strict 工件绕过配置缺失。只读诊断和显式操作者配置修复仍可用。
- Evidence：预览不写有效 policy；确认后一次性应用并验证；明确确认的 `entries: []` 合法，缺失字段不等于空集合；失败不留下部分生效配置。

### Scenario 5 — 真实证据，不用原因字符串豁免

- Given：进程或安装缺陷无法用相邻单元测试复现历史故障。
- When：`verification_ref` 引用真实、相关、绑定当前 subject 的 Verification Plan 结果；用途为 smoke 时仍使用既有 `command` kind。
- Then：所有 profile 的必需验收仍须通过；可记录历史复现缺口等非必需 `unverified`，但它不能替代必需检查；豁免只走现有授权机制。
- Evidence：`verify-contract` fixtures 拒绝无关 preflight id、缺失 / 失败 / 陈旧结果；可选 pre-fix artifact 按 M4 的新关联验证。

### Scenario 6 — Stop 不承担可选维护

- Given：architecture provider 不可用，或存在 refactor / minimal-change / 计划完整性建议。
- When：普通 Stop。
- Then：保存恢复事实后退出，维护失败不阻断、不伪报完成；pending 状态可在后续入口看到。恢复内容不变可复用投影，身份不同的真实事件仍须保留。
- Evidence：真实 Stop 行为矩阵，包含活动契约持久化失败的唯一阻断正例；架构交付要求按配置与工作包判定，不以 Strict 身份强制启用。

### Scenario 7 (negative) — 交付与范围不降级

- Given：必需验证失败、证据陈旧、目标分支移动、receipt 过期、路径 / worktree 越界，或 capability 建议范围超出批准工作包。
- When：已有受管理交付入口 / merge gate / plan-to-contract 投影。
- Then：拒绝；新依赖必须说明并检查具体约束，不自动等于违规；声明保护不可被候选自我删除而绕过。
- Evidence：保留现有 merge、receipt、路径、worktree、进程清理负向测试；新增范围投影不得扩权的负例。

### Scenario 8 — 证据复用

- Given：已有与当前 subject 及所需检查绑定的有效证据。
- When：审查角色消费。
- Then：复用，不为角色重复执行；无效证据不能靠复用通过。
- Evidence：现有证据复用正反例。

### Scenario 9 — 编辑授权等价与稳定性

- Given：HS2 合入后、HS4 改造前冻结的 PreEdit golden，包含“已有敏感改动，再编辑普通文件”、活动 sprint / review、worktree 及并发授权变化。
- When：切换授权视图。
- Then：保留原变更路径合并语义，allow / block 与原因码逐项等价；无竞争读取 ≤2 轮；竞争最多额外重试两次，仍不稳定时 fail closed。缓存消费者不得使用陈旧授权或改成每次 Prompt 完整解析。
- Evidence：入口差分、消费者行为与竞争注入测试，HS2 的政策变化独立验收，不作为 HS4 的笼统排除项。

## Non-goals

- 不新增 profile、风险 DSL、长期迁移状态机、预算生命周期、遥测平台或智能测试选择器。
- 不放宽 CI / release gate，不重写历史 receipt / review / contract，不实现本轮尚未批准的风险或验证政策。
- 不用源码行数、注释数量、源码调用点数量代替行为证据。
- 不做大规模拆包、删除能力、另建仓库或 monorepo。默认 off 不证明无人使用；产品拆分另行决策。

## Module Behaviors (P0)

### M1 风险声明与真实门禁

- 唯一运行时信号：操作者确认的 `guards.protected_boundaries = { version: 1, entries: [{ id, category, paths }] }` 与显式操作类型；category 沿用 `StrictRiskCategory`。
- 删除路径 / capability 关键词推断及 `strictScanPaths`；保留全部显式高风险操作：`auth`、`payment`、`security`、`schema`、`migration`、`deploy`、`release`、`public-api`、`destructive`。自然语言和 `explicitOverride` 不能降下限。
- 文件数是复杂度提示，不是 Strict 依据；跨 capability / feature 的既有 Standard 规则保留。
- 合法声明命中 → Strict；缺失、损坏、未确认 → 独立的授权配置错误，拒绝受影响实现操作并指向迁移。不得把配置不完整包装成可用普通 Strict 流程满足的任务。
- 迁移：预览候选（包括来源和理由）→ 操作者确认或修订，空集合也须明确确认 → 一次性应用、验证 → 运行时仅消费新声明。候选不能先写成有效 policy；旧关键词至多供预览参考，不扩大成目录规则，不留运行时回退。明确的操作者修复入口按授权范围处理，不接受任意自称修复的编辑。
- 保护声明优先于 `isWorkflowSurfacePath` 免计划豁免。PreEdit 和交付都不得用候选删除保护项来降低原受保护变更的授权 / 验收要求；可信 base 策略不被候选 policy 取代。
- 本仓库待确认集合以原 policy、workflow、merge-readiness、path-safety、auth / oauth、release、deploy 为起点，补查实际授权职责：`src/effects/state/` 的授权解析、`src/cli/hook/mutation-guard.ts`、验证执行 / 证据身份 / acceptance receipt 校验，以及能改变这些机制的安装、投影源和配置。HS2 按调用关系选择最小集合，不能仅凭文件名或整个 `src/` 一刀切。
- Markdown 只保护被执行链消费为授权 / 执行策略的指令与模板，说明文档不因扩展名自动保护。实际集合在 HS2 的工作包审查确认。

### M2 编辑授权视图

- 完整 resolver 和 PreEdit 复用同一个授权决策；轻视图仅收集其真正消费的输入，不另造解析权威，不用 TTL 替代稳定性。
- 输入保留本次 `targetPaths` **加当前 review subject 变更路径集合**，用低成本路径读取，不构建内容级 review subject；同时保留操作类型和已批准工作包约束。
- 实现前逐项映射决策字段到授权来源：policy / edit-plan gate、plan、contract / allowed_paths、worktree 归属、capability，以及真正被决策消费的 review、active-sprint 等。明确相同决策如何由完整 resolver 复用；不机械声称与旧 `authoritySourceHashes` 同集，也不漏掉实际依赖。
- 每次尝试初读并采集源身份，再回读比较指纹（包括变更路径集合）；无竞争成功路径 ≤2 轮。最多额外重试两次，总轮数可到 6；超限沿用 `StateResolutionUnstableError`。必需来源不可用须报告失败，不合成授权。
- PreEdit 不发布 `effective.json` 或 `state_version`。HS4 清点 `state_version`、`effective.json`、`workflow_profile`、`progress_token`、`authority_revision` 的直接 / 间接消费者，尤其 `promptCircuitState()`；逐项标注实时授权事实或可滞后显示信息，并明确发布方。
- 实时消费者读取同一授权事实，可滞后视图采用约定的 SessionStart / 显式 resolve 等发布点；不能将成本搬成每次 Prompt 完整解析。SessionStart、`state resolve`、需要完整交付状态的入口仍可完整解析。

### M3 Stop 与交付检查归属

- Stop 保留 journal flush、checkpoint、恢复投影、现有预算内 retention、未完成事项与非阻断交付提示。
- 恢复投影按语义内容与覆盖事件身份判等；生成时间不独自触发重写。事件追加按自身身份去重，不因正文相同吞掉不同事件；用 mtime 与事件存续行为分别验证。
- restamp 仅保留显式 `architecture-projection publish-restamp`；drain / cascade 不在 Stop 执行，只记录 pending；refactor 和 PlanCompletenessGate 仅提示。
- 唯一阻断：活动契约的恢复记录持久化失败。可选架构维护失败不阻断 Stop；架构交付要求由启用配置和工作包决定，Strict 不自动要求启用架构工具。
- minimal-change 的交付约束由 **所有现有受管理交付入口**（含 Lite / 无 separate contract 的 Standard）消费同一检查结果；有契约的 prepare-acceptance 是其中之一。不得靠强建契约获得覆盖。新依赖是需说明和检查的信号，是否阻断取决于具体政策，不能泛化为“有新依赖就阻断”。已有 audit receipt 保留历史含义，不把其全流程强加普通任务。
- 已显式选择的用户级 architecture 配置在 upgrade 中明确映射与提示，不静默丢失。

### M4 验证与授权范围

- Root Cause Evidence 保留具体 `root_cause`、`repro`；`verification_ref` 指向真实、相关、subject-bound 的验证结果，不仅是某个存在的 id。既有 check kind 仍为 `command` / `package_test`，smoke 是用途。
- `unverified` 独立描述指定缺口，不能替代 `verification_ref` 或任何必需验收。历史环境无法重现可作为非必需限制记录；当前必需检查未通过时，所有 profile 都拒绝交付，豁免沿用现有授权机制。
- `pre_fix_failure_artifact` 可选；提供时绑定同一缺陷与 `verification_ref` 对应检查，记录命令 / 输入 / 环境、失败结果及其相关性。删除依赖旧 `regression_guard` 路径文本的校验，不以任意非零退出证明根因。缺失可选 artifact 不等于当前验收缺失。
- 契约只生成适用区块；解析 / 规范化 / 元数据校验共用已有合适的 TS 模块，shell 与 runner 都消费它。只有观察到共同消费者与不变量才提取共享模块，不以委派 runner `contract-run.ts` 为公共依赖中心。
- capability 仅供范围建议。工作包可批准目录 glob，无须逐文件枚举；投影结果必须是明确批准范围的子集。helper / 调用方需扩展时，在同一工作包内显式扩展，不自动扩大、不拆成微任务。
- 去重针对真实 helper 实现与调用者，保持行为；删除 `re-port` 注释不是验收。历史证据不改写；活动契约通过明确升级或关闭迁移，不留新旧语义长期双读。

### M5 可选能力（后置，不阻塞核心收口）

- HS6a 只调查使用证据、成本、MCP tools / hook routes / CLI / policy / 安装投影边界与迁移风险，未知就保留未知。覆盖 automation / campaign、engineers、operator / operator-web、collaboration、fleet、chatgpt-browser、refactor、external-sources；默认 off 不能推导删除决定。
- HS6b 限定为同包内按需启用隔离：未启用不扫描、不初始化、不注入提示、不启动进程；新安装显式启用，已有明确启用配置保持有效。
- 宿主路由变化遵守 `(event, routeId, matcher)` 契约并验证 adapter 迁移；不要求 bundle 完全没有可选模块，不拆包、不删公共命令。大规模抽离 / 删除另行批准；HS7 / HS8 不依赖它。

## Data Model / Budget Rules

- `protected_boundaries`：`version: 1`，entries 为 `{ id, category: StrictRiskCategory, paths: glob[] }`；操作者确认是一次性应用的前提，不新增长期候选状态机。
- `harness_budgets`：`version: 1`；每个 metric 声明 `value`、`direction` 与稳定测量口径。只对少量可执行行为建立预算，测试可放在 `tests/harness-budget-ratchet.test.ts`，不复制产品解析或数源码文本。
- `max`：当前值 ≤ budget，新 budget ≤ base budget；`allowed-set`：当前观察集 ⊆ budget，新 budget ⊆ base budget；`forbidden-set`：当前观察集与 budget 不相交，新 budget ⊇ base budget。避免统一“集合只能变小”。
- base 尚无 budgets 文件时，仅允许经审查的首次初始化，并验证候选实际行为满足预算；新增 metric 同样须可测且当前达标。已有 metric 不得删除、重命名绕过或改变 direction / 口径来放松约束；真正替换测量契约须显式独立审查。
- 测量失败、缺数据、非法值或 base 无法读取均失败；只有确认 base 中该文件不存在才走初始化，不能把其他读取错误当不存在，更不能将测不到记作零。
- 未来目标不写入生效 budget，预算和达标实现同提交收紧；没有 `owner_row` 延迟生效语义。行数、bundle bytes / inputs 与性能保留报告，不设永久单向硬门禁。

## Performance Targets

只报告同环境、同输入、固定 Bun / 工具链下的 p50：PreEdit ≤ HS0 基线 40%，普通 Stop ≤50%，SessionStart 不高于基线。记录 warm / cold、采样次数（目标 20 cycles）、Git 状态与文件系统。竞争重试和无竞争成功路径分别报告。Mac 性能基线缺失阻止性能收益声明，不阻塞无关减法。

## Self-Hosting / Execution Boundary

- HS2 先于 HS4 / HS7 合入；每行风险都按最终 diff 和精确目标分支规则计算。不得预先宣布 HS2 是 Standard，或利用旧引擎对自身的漏判降低切换验收。
- `Mode=contract` 明确接受既有 plan → contract → worktree 流程，不论最终 profile；轻任务只用已有 inline 语义并验真实行为。不新造模式、不承诺非 Strict contract 行自动免工件。
- 保留原十个 task ID。核心顺序为 HS0 → HS1 → HS2 → HS4 → HS3 → HS5 → HS7 → HS8；HS6a 可旁线调查，HS6b 后置。机器队列顺序与此一致；HS8 是核心里程碑，不在后置行未完成时声称整个 Sprint Done。
- SIGPIPE 前置小修调整 `next_pending_row` 与 `start-task` 的 `target_row` 选择器（`scripts/sprint-backlog.sh:1046`），输出首条匹配后读完上游输入。真实 status / next 覆盖长 backlog、无待办及上游错误传播，真实 start-task 覆盖长 backlog 中选择靠前行并正确生成计划；不需要额外 PRD 或测试报告。

## Developer Handoff / Review Follow-through

- 本 Draft 已吸收 request-changes：确认式风险迁移与入口保护、完整授权输入、证据不自动豁免、范围不自动扩权、行为预算、可选能力退出核心关键路径。
- HS0 先建立最少行为基线；Mac 测量暂不可用时保留缺口，可明确选择无性能依赖的 HS1，不能伪造基线或标记未完成项 Done。
- 按每行 Acceptance 和仓库 Testing Policy 选择已有测试；保留 Required Checks 与 CI / release 边界。性能 / provider benchmark 仅在 HS8 冻结版本与环境后生产一次，重用有效证据。
- 待复核：HS2 实际保护集合与可信策略来源；HS4 消费者实时性及授权来源表；Lite / Standard 交付入口覆盖；HS6a 下游使用证据。它们属于对应工作包的有界设计确认，不是当前已实现事实。

### Verification Provenance

- 原作者报告 `check-task-sync`、`check-task-workflow --strict`、`inspect-project-state`、`check-architecture-sync` 在原文档提交通过；本次不把这四项迁移成修订候选的 PASS。
- 原提交其余 Required Checks：**not run**，不以“理论上不受影响”替代结果。
- 本次方案修订未执行 Mac 性能基线或完整 harness benchmark；本地候选的实际针对性验证在交付摘要中单独报告。

## Appendix A — 基线采集命令（`2c00d4da`，Linux VM）

- Profile 统计：一个临时 bun 脚本对 `git ls-files src tests docs` 逐个调用 `resolveWorkflowProfile({ targetPaths: [f], operationKind: 'edit' })`，统计各 profile 的数量，并输出 strict 条目及类别。
- Hook 耗时：`echo <payload> | bun /tmp/he.js PreToolUse --route edit`（bundle 由 `bun build src/cli/hook-entry.ts` 生成），分别对 `src/core/workflow/profile.ts`（exit 0）和 `src/cli/hook/session-context.ts`（exit 2，strict:auth）各跑 3 次、2 次。
- 解析器耗时：直接调用 `resolveEffectiveStateReadOnly` 与 `resolveEffectiveState`，risk 为 `{ targetPaths: ['src/core/workflow/profile.ts'], operationKind: 'edit' }`，各 3 次。
- Bundle 组成：`bun build --metafile`，按 `src/<layer>/<dir>` 聚合 inputs 字节数，并追踪跨前缀的 import 边。
