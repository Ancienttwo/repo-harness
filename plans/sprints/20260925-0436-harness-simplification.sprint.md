# Sprint: Harness Simplification

> **Status**: Draft
> **Slug**: harness-simplification
> **Created**: 2026-09-25 04:36
> **Updated**: 2026-09-25 04:36
> **Source PRD**: `plans/prds/20260925-0436-harness-simplification.prd.md`
> **Source Spec**: `docs/spec.md`
> **Source Review**: `docs/researches/simplification-gpt.md`
> **Baseline**: `origin/main@2c00d4da5d0d769223791791c01ae6b501ab2c5f`
> **Backlog Schema**: 2
> **Goal Mode**: incremental

Program-level sprint container。每个 contract 行是一个独立的 merge / rollback 边界，也是一个
工作包；只有被判为 Strict 的行才生成单独契约。行内部的实现步骤由执行 agent 自行安排，不再
拆成更细的仓库工件。`tasks/todos.md` 仍是延后目标台账，不承载本 backlog。

## PRD

完整 PRD 见 Source PRD。摘要如下。

### Problem

- PreEdit 每次做 ≥3 次完整状态解析（实测 1.2–1.8 s / 次，VM 环境）；成本在解析，不在 bundle 加载。
- 按路径关键词判 Strict：`source-checkout.ts` 被判为 payment，`session-context.ts` 被判为 auth 并被阻断；而 `profile.ts` 本身只是 lite。
- Stop 承担架构 drain、restamp 本地提交、minimal-change enforce、refactor 阻断、PlanCompletenessGate。
- bugfix 只接受 `package_test + PRE_FIX_EXIT` 这一种证据形式；逐文件的 TDD 提示按"有没有相邻测试文件"触发。
- 过细的 Allowed Paths 导致 helper 被逐字复制（`mutation-observed.ts` 中至少 4 处）。
- 约 59k/145k 行属于默认关闭或可选的子系统，其中 fleet / engineers / refactor 已进入 hook bundle。
- 上一轮 kernel reduction（2026-07-12）之后复杂度反弹，缺少 ratchet。

### Users

- 执行 agent（Claude Code / Codex）、维护者、下游 operator、外部审查者。

### Success Criteria

- PreEdit 完整解析次数 → 0；Stop 的 git ref 更新 → 0；Stop 阻断来源 → 1 类。
- Strict 集合 = 声明的受保护边界 ∪ 高风险操作类型。
- hook bundle 不含可选子系统前缀；`src` 行数不超过 HS6a 决定的上限。
- 所有计数指标进入 `evals/harness/budgets.json`，只能收紧。

### Acceptance Scenarios

- Source PRD Scenario 1–9。每一行在 Acceptance 列标注其覆盖的场景。

### Non-goals

- 不新增 profile 档位、风险引擎、DSL、守护进程、数据库、遥测平台或智能测试选择器。
- 不放宽 CI / release lane，不改写历史验收证据，不在本轮改成 monorepo。

## Architecture Notes

### Capabilities Touched

- workflow-engine：`src/core/workflow/profile.ts`、`artifact-requirement-policy.ts`、policy schema 与迁移。
- runtime-harness：`src/cli/hook/*`、`src/effects/state/*`、hook 遥测、hook bundle。
- contract / verification：`scripts/verify-contract.sh`、`scripts/contract-run.ts`、`.claude/templates/*`、`docs/reference-configs/sprint-contracts.md`。
- architecture projection：`src/effects/architecture/*` 的触发点（逻辑不变，只改由谁触发）。
- installer / adoption：upgrade 迁移、agent fleet 安装模式、宿主 adapter 路由注册。
- 可选子系统（HS6a 决策后）：automation、engineers、collaboration、fleet、operator / operator-web、chatgpt-browser、refactor、external-sources，以及对应 MCP tools。

### Dependency Order

1. HS0 先建基线和 ratchet，后续每一行都用它验收。
2. HS1 是纯减法、不改策略，风险最低、见效最快。
3. HS2 必须早于 HS4 / HS7：merge gate 按 base 策略审查，旧关键词规则会把 `session-context*.ts` 判为 Strict。
4. HS3 依赖 HS1（restamp 已移出）；与 HS2 没有代码依赖，可以并行，但合并顺序排在 HS2 之后。
5. HS4 依赖 HS0（计数器）和 HS2（授权视图读取声明边界，而不是关键词）。
6. HS5 依赖 HS2（profile 语义）；与 HS4 并行时要协调 `mutation-observed.ts` 的写入所有权（HS5 负责 helper 去重，HS4 不改该文件）。
7. HS6a → HS6b；HS6b 在 HS3 之后（Stop 已不引用 refactor）。
8. HS7 在 HS6b 之后（根上下文与检查表反映删减后的结构）。
9. HS8 最后。

### Risks

- 授权视图与完整解析分叉 → 完整解析器内部调用同一函数；在 HS4 用 golden 差分测试兜底。
- 声明边界漏声明 → 缺少声明时 fail closed；迁移按目录粒度给出候选；HS2 审查时逐条确认。
- 架构投影从 Stop 移出后漂移积累 → SessionStart 展示 pending 数量；strict 交付时 prepare-acceptance 要求投影已同步。
- 子系统抽离牵连 MCP 工具面和宿主路由 → HS6a 必须列出受影响的 MCP tools 与路由；HS6b 附带 adapter 迁移与契约测试。
- 本轮本身过程过重 → 每行一个工作包；只有 Strict 行才写单独契约；审查消费既有证据。

## Backlog

Ordered execution queue；保持依赖顺序。Mode `contract` 走完整的 plan → contract → worktree
流程；`inline` 允许在主工作树执行小任务。每行的 Acceptance 必须具体可验。

The `ID` cell is the persisted, immutable task identity (64 lowercase hex
characters). It is minted once when the row is created and must never be edited,
copied between rows, or regenerated: editing the Task text is a rename, not a new
task.

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | f351872b6da2766af68f80dc536ed6d47cbbd69a42c0562b4421539bea8e694e | [ ] | HS0 — 基线采集与 budget ratchet 骨架 | inline | 新增 `evals/harness/budgets.json`（schema 见 PRD Data Model）与 `tests/harness-budget-ratchet.test.ts`；测试同时断言当前值不超过预算、PR 的预算不比 `git show <base>:evals/harness/budgets.json` 更宽松；首批 metric 录入 `2c00d4da` 当前值：`preedit.full_state_resolves`、`stop.git_ref_updates`、`stop.block_sources`、`lite.tdd_advisory_lines`、`hook_bundle.optional_prefixes`、`hook_bundle.bytes`、`src.ts_lines`、`root_context.module_contract_blocks`；用 `tests/hook-runtime-characterization.test.ts` + `scripts/hook-dispatch-diet-report.ts` 在维护者 macOS 上采集 PreEdit / Stop / SessionStart p50，写入 `docs/researches/20260925-harness-simplification-baseline.md`；源码行为零变化 | (pending) |
| 2 | dd6c6a7b5b56db371f52094406170967e1caeec60d76b23019c47049c6206108 | [ ] | HS1 — 快速减负：删除 TDD/BDD 提示、Stop 不再 restamp、refactor 不阻断、修正文档矛盾 | contract | 删除 `mutation-guard.ts` 的 TDD/BDD reminder 块、`tddCandidateExists` 及其专用排除表，删除 `prompt-handler.ts` 的 TDD/BDD advice，同步更新 `tests/runtime-profile-enforcement.test.ts`、`tests/hook-contracts.test.ts` 中对应断言；`stop-handler.ts` 不再 import 或调用 `publishArchitectureProjectionRestampForDrain`，restamp 只保留 `architecture-projection publish-restamp` 显式入口，并新增测试证明 Stop 前后 `git for-each-ref` 与 HEAD reflog 不变；`renderRefactorRecommendationDecision` 的结果只进 stderr，Stop 不再因它 `block`；`docs/spec.md:72` 改为"安全与授权检查可阻断；观察与建议不阻断；交付检查只决定能否交付"；`plan.template.md` 删除 `.claude/.active-plan` legacy 文案；budgets 收紧 `stop.git_ref_updates=0`、`lite.tdd_advisory_lines=0`，`stop.block_sources` 去掉 refactor；覆盖 Scenario 1、6 | (pending) |
| 3 | 9cd20e320a6456a2e88e51fd6cd72fe9c6f87c7aa9b0821e9f7d092ac108eb93 | [ ] | HS2 — 风险与复杂度分离：声明式受保护边界 + 一次性迁移 | contract | policy 新增 `guards.protected_boundaries`（category 沿用 `StrictRiskCategory`），本仓库按 PRD M1 的初始集合声明；`resolveWorkflowProfile` 删除运行时 `STRICT_CATEGORY_TOKENS` 路径 / capability 扫描与 `strictScanPaths` 参数（同步 `resolve-effective-state.ts:604-607`、`change-assessment.ts:90`），Strict 只来自声明命中或 deploy / release / migration / destructive 操作；`mediumScope` 不再抬高下限，改为 `complexity-hint` reason；缺少声明时以 `risk-floor:strict:protected-boundaries-undeclared` fail closed 并提示迁移命令；upgrade 迁移用旧关键词表按目录粒度生成候选 entries 并打印，关键词表只存在于迁移代码中；fixture 矩阵断言 `session-context.ts`、`source-checkout.ts`、`docs/auth/runbook.md` 非 Strict，`src/cli/mcp/oauth.ts`、`src/core/workflow/profile.ts` 为 Strict，`explicitOverride` 低于下限仍被拒绝；`init --repo . --dry-run` 与 fixture apply 走同一 TS 操作模型；覆盖 Scenario 2、3、4 | (pending) |
| 4 | d5650826a89a4bb0ec6de174dca14c7b6d7997cb36692b5ad075d06e4fd69825 | [ ] | HS3 — Stop 收敛为"保存并退出" | contract | 架构投影 drain / cascade 移出 Stop，Stop 只追加 pending 事实，SessionStart 显示 pending 数量，strict 的 prepare-acceptance 要求投影已同步；minimal-change enforce 移到 prepare-acceptance 并保留 audit receipt 语义，Stop 最多输出一条提示；PlanCompletenessGate 降为提示（先用近期 Stop 事件确认其触发记录，结论写进 plan）；handoff / resume / event / run-summary 内容不变时不重写（mtime 断言）；结构测试断言 `stop-handler.ts` 中唯一的 block 来源是"存在活动契约且恢复记录持久化失败"；`~/.repo-harness/config.json#architecture` 中已显式选择的行为由 upgrade 映射为显式命令提示；budgets 收紧 `stop.block_sources` 为 1 类；覆盖 Scenario 1、6 | (pending) |
| 5 | 5be62bd66313239dca182767a1258ac19820f95be54aa4ee3812055f01ad0777 | [ ] | HS4 — 编辑热路径：授权视图替代完整状态解析 | contract | 第一个提交先录制 PreEdit 决策 golden（仓库状态 × 目标路径矩阵，含 allow / block 与原因码），并 grep 加测试确认 PreEdit 发布的 `state_version` 无消费方（若有消费方，改为由消费方显式读取）；新增 `resolveEditAuthority`，只读取 PRD M2 列出的授权源，完整 `resolveEffectiveStateUnlocked` 内部调用同一函数；稳定性检查只重哈希授权源，重试 ≤2 次；PreEdit 不发布 cache，也不提交 `state_version`；遥测新增 `state_full_resolves`、`state_authority_reads`、`internal_git_spawns`，`child_processes` 语义不变；golden 除 HS2 有意改变的项外逐项一致；budgets 收紧 `preedit.full_state_resolves=0`、`preedit.authority_reads<=2`；macOS PreEdit p50 ≤ HS0 基线 40%（只报告）；不修改 `mutation-observed.ts`；覆盖 Scenario 9、7 | (pending) |
| 6 | a337d6e4ce5a656e9426f448b93912684229f00d318ea6e448fcbdbb9300688b | [ ] | HS5 — 证据去形式化、契约解析收敛、helper 去重 | contract | Root Cause Evidence 改为 `root_cause` + `repro` + `verification_ref`（Verification Plan 中任意 kind 的条目 id，或 `unverified: <原因>`），`pre_fix_failure_artifact` 改为可选、提供时按原规则校验；strict 下 `unverified` 阻断 ship；契约生成只输出适用区块（Root Cause 仅 bugfix，Delegation 仅在有委派时，benchmark 仅在需要消费时）；`verify-contract.sh` 删除 `contract_root_cause_section`、`root_cause_field`、`root_cause_placeholder`、`is_concrete_root_cause_field` 等 shell 解析函数，改为消费 `contract-run.ts` 的 JSON 结果；plan → contract 投影按 capability 前缀 + 对应测试生成 allowed_paths glob；`mutation-observed.ts` 与 `session-context.ts` 中 re-port 的 helper 合并为一个共享模块，`src/cli/hook` 中 "re-port" 注释计数为 0；`docs/reference-configs/sprint-contracts.md` 与 `contract-brief-example-bugfix.md` 删除与"先失败后实现"强制顺序冲突的条文；历史契约不改写，运行中的契约按显式升级迁移；覆盖 Scenario 5、8 | (pending) |
| 7 | e2341604399a5d727dab4af0c09c4addc810239aeaf321e4209fdafa765166a9 | [ ] | HS6a — 可选子系统去留决策记录 | inline | 在 `docs/researches/20260925-optional-subsystem-disposition.md` 为 PRD M5 表中每个子系统给出 keep-core / extract / delete 决策与理由；列出每项影响的 MCP tools、hook 路由、CLI 命令、policy key、tests 与下游迁移；确定 `src.ts_lines` 上限与 `hook_bundle.optional_prefixes` 禁止集合；维护者确认（human_decision_boundary）后写入 budgets（此时只允许收紧到尚未生效的目标值，并标注 owner_row=HS6b） | (pending) |
| 8 | 536040431ea467c4f33c0fb1fbdb79bcd06465157b22b9ecef43ef78b71d56f3 | [ ] | HS6b — 执行子系统抽离 / 删除 | contract | 按 HS6a 决策执行，每个子系统的删除或抽离都在同一工作包内移除旧路径，不留兼容 shim；`bun build --metafile` 的 hook bundle inputs 不含禁止前缀，bundle 字节数不超过预算；`UserPromptSubmit.inbox` 路由仅在 fleet 启用时由 installer 注册，附 adapter 迁移与路由契约测试；`agent_fleet.install_mode` 默认 `explicit`；若 operator-web 被抽离，`prepack` 不再构建它；`src` 行数不超过预算；Scenario 7 的负向测试集全部通过；下游升级迁移在 fixture 上验证 | (pending) |
| 9 | 0e7776461412a130af8c73f8e7679e24408753093b989c4cb9ddd1920b0a767d | [ ] | HS7 — 根上下文、本地检查归属与重复测试清理 | contract | `context-contract-sync.sh` 只把 Architecture Contract 块写入模块本地文件，根 `CLAUDE.md` / `AGENTS.md` 不含 `## Architecture Contract`（budget `root_context.module_contract_blocks=0`）；根 Required Checks 改为一行指向 `docs/reference-configs/sprint-contracts.md` 中按改动面划分的检查归属表（普通源码、Hook、helper / 模板、工作流策略、发布安装、非执行文档），命令本身不变；删除的每个测试都在 PR 描述中列出覆盖同一失败模式的保留测试，候选仅限扫描源码文本、固定非协议文案、重复完整安装的纯输入分支；CI lane 与 release gate 不变 | (pending) |
| 10 | 56f6a430a5de73381743306672916ce50bccbbb074d25569489e9724f0a33c7c | [ ] | HS8 — 收口评测与预算锁定 | inline | 固定 provider、宿主版本、工具权限、仓库快照，用 `bun run benchmark:harness` 在 `evals/harness/scenarios.json` 的 9 个场景上对比 `2c00d4da` 与候选版本的 adaptive-lite，no-harness 作为参照；缓存与非缓存 token、耗时、阻断次数、新增工件分开报告；关键差异场景补重复运行；结论写进 `docs/researches/`，并在 `docs/spec.md` 更新产品定位句；budgets 锁定为最终实测值；样本量不足时只报告观察结果，不宣称质量等价 | (pending) |

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
