# Sprint: Harness Simplification

> **Status**: Draft
> **Slug**: harness-simplification
> **Created**: 2026-09-25 04:36
> **Updated**: 2026-09-25
> **Review Disposition**: request-changes 已落实到本 Draft；尚未批准整轮执行
> **Source PRD**: `plans/prds/20260925-0436-harness-simplification.prd.md`
> **Source Spec**: `docs/spec.md`
> **Source Review**: `docs/researches/simplification-gpt.md`（保留原审查，不改写历史）
> **Baseline**: `origin/main@2c00d4da5d0d769223791791c01ae6b501ab2c5f`
> **Backlog Schema**: 2
> **Goal Mode**: incremental
> **Substantive Change SHA256**: `sha256:9b01286e90222fc714f6af58e1cf18a484983641567a320000951c7dba9ba7fb`

Program-level sprint container。每个 `contract` 行接受现有 plan → contract → worktree
流程，不因最终 profile 为 Standard 而免工件；`inline` 行使用既有轻路径，不另造执行模式。
行内部不再拆成逐文件任务。`tasks/todos.md` 只承载延后目标，不复制本队列。

## PRD

### Problem

- 原作者在 Linux VM + 共享目录报告 PreEdit 1.2–1.8 s；无竞争调用链至少三次完整解析。同环境支持解析是主要成本，跨系统比例须重测。
- 路径 / capability 关键词既误判 `session`、`checkout`，也漏掉风险权威自身；profile 为 Strict 仍可能被 workflow 文件豁免绕过。
- Stop 的架构维护、restamp、建议阻断，以及逐文件 TDD 与单一证据形式，增加日常开发成本。
- capability 不能成为默认写入授权；默认 off 不能证明可选能力无人使用。

### Users

- 执行 agent、维护者、下游 operator 与消费已有证据的审查者。

### Success Criteria

- PreEdit 不做完整解析；普通 Stop 不更新 Git ref，建议与可选维护不阻断；Lite 无逐文件 TDD 提醒。
- 保护声明实际约束入口；必需检查不被 `unverified` 替代；范围投影不超出批准工作包。
- 只对可测行为建 ratchet，达标实现与预算同提交收紧；行数、bundle 大小和耗时只报告。
- 可选能力保留同包隔离；大规模抽离 / 删除退出本轮，HS7 / HS8 不依赖它。

### Acceptance Scenarios

- Source PRD Scenario 1–9；各行引用场景编号并补充可执行判据。不存在“所有非 Strict 行自动免契约”的承诺。

### Non-goals

- 不新增 profile、风险 DSL、预算生命周期、长期迁移状态机或智能测试选择器。
- 不放宽 CI / release gate，不改写历史证据，不拆包、不删除未知使用情况的能力、不改成 monorepo。

## Architecture Notes

### Boundaries

- workflow / authorization：风险声明、policy 迁移、PreEdit、完整状态与轻授权视图共用决策。
- recovery / delivery：Stop 保存恢复事实；既有交付入口消费验证与政策约束，包含 Lite / 无 separate contract 的 Standard。
- verification / scope：共享解析由合适的 TS 模块承载；runner 和 shell 是消费者；capability 只建议范围。
- optional capabilities：调查 MCP、CLI、adapter、配置与安装边界；同包内显式启用隔离，不启动产品拆分。

### Execution Prerequisite

`scripts/sprint-backlog.sh` 的 `next_pending_row` 与 `start-task` 的 `target_row` 选择器（:1046）
改为只打印首个匹配项、但读完上游输入，
同步 packaged helper；保留 `set -euo pipefail`，不加 `|| true`。已有测试补长 backlog、
无待办（`next` 仍返回 3）、上游返回 17 的传播，以及真实 start-task 在长 backlog 中选择靠前行并正确生成计划。该小修独立于 HS0–HS8，不另建 PRD。

### Dependency Order

1. 核心队列：HS0 → HS1 → HS2 → HS4 → HS3 → HS5 → HS5b → HS7 → HS8。
2. HS0 的行为基线先建立；Mac 性能采样是性能结论的前提，暂缺时可通过已有显式选行执行 HS1 等无关减法，保留 HS0 未完成状态。
3. HS2 先于 HS4 / HS7，避免授权输入返工；HS2 自身和后续行都按最终 diff 与目标分支策略定级，不预判 Standard、不依赖旧规则漏判。
4. HS4 先冻结 HS2 后的决策 golden，再替换解析路径；HS3 在 HS1 的 restamp 减法与 HS4 之后收敛 Stop。
5. HS5 在 HS2 / HS3 之后统一证据、交付检查和范围投影；HS5b 在 HS5 之后把外部审查传输收敛为 Herdr；HS7 不依赖大规模拆包。
6. HS6a 可独立旁线调查，机器队列置于 HS8 后以免阻塞核心收口；HS6b 仅做 HS6a 确认边界后的同包启用隔离，后置且非 HS8 前提。
7. HS8 是核心里程碑。HS6a / HS6b 未完成仍保持 pending，不将整个 Sprint 标记 Done，不自动批准后置工作包。

### Risks and Invariants

- 候选策略自我降权 → 真实编辑 / 交付入口使用可信目标分支保护规则与批准范围；确认式迁移不让候选提前生效。
- 轻视图漏输入 / 读到撕裂状态 → 保留变更路径集合；列明真正消费的授权源；同源稳定性回读与有界重试。
- 把成本移到 Prompt → 清点缓存消费者实时性并测试，不在每次 Prompt 重新跑完整 resolver。
- 新证据字段变成自动豁免 → `unverified` 只描述缺口；真实相关结果满足必需验收，豁免使用既有授权机制。
- 架构维护迁出后不可见 → pending 事实可见；交付要求依配置和工作包，不因 Strict 自动启用。
- 预算先于实现生效 → 未来目标只放 PRD；实测达标提交才收紧，测量失败直接失败。

## Backlog

Ordered execution queue。`contract` 走完整 plan → contract → worktree；`inline` 走已有
轻路径，仍遵守授权与检查。下游轻任务的减负以真实场景验收，不能靠本 Sprint 的描述宣告。

The `ID` cell is the persisted, immutable task identity (64 lowercase hex
characters). Reordering or renaming a task preserves its ID; never copy or
regenerate IDs. The first eight rows form the core milestone; the last two
remain explicit pending work beyond that milestone.

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | f351872b6da2766af68f80dc536ed6d47cbbd69a42c0562b4421539bea8e694e | [ ] | HS0 — 基线与少量行为预算 | inline | 建立 `evals/harness/budgets.json` 与 ratchet 验证：初始记录当前可测行为，区分 max / allowed-set / forbidden-set；base 无文件仅首次初始化，新增 metric 须可测且达标，删除 / 重命名绕过 / direction 或口径变化拒绝；测量或 base 读取失败不能按零或无文件处理；初始行为包括完整解析计数、Stop refs、Lite 提醒；行数 / bundle / 时间仅报告，未来目标不提前写预算；在维护者 Mac 用既有 characterization 记录同输入、版本、环境、采样与 p50，保存到 `docs/researches/20260925-harness-simplification-baseline.md`；暂缺 Mac 数据不阻塞无关减法，不声称性能改善 | (pending) |
| 2 | dd6c6a7b5b56db371f52094406170967e1caeec60d76b23019c47049c6206108 | [ ] | HS1 — 删除逐文件提醒与 Stop restamp | contract | 移除 Edit / Prompt 的逐文件 TDD/BDD 建议及专用死代码；真实入口证明 Lite 无提醒，Stop 前后 refs 与 reflog 不变，refactor 建议不阻断；restamp 只保留显式命令；修正 `docs/spec.md` 的 fail-open 误述和模板的旧 active-plan fallback 文案；达标同提交收紧 Stop refs / Lite 提醒预算，不数源码调用或注释；覆盖 Scenario 1、6 | (pending) |
| 3 | 9cd20e320a6456a2e88e51fd6cd72fe9c6f87c7aa9b0821e9f7d092ac108eb93 | [ ] | HS2 — 确认式风险声明与完整门禁切换 | contract | 落实 PRD M1：删除路径 / capability 关键词猜测，保留 auth、payment、security、schema、migration、deploy、release、public-api、destructive 全部显式操作；确认式迁移预览不写有效配置，确认空集合与缺失不同，一次性 apply / validate，失败不留下部分生效配置；配置缺失 / 非法拒绝实现但允许明确诊断 / 修复；按授权、验证、receipt、安装 / 投影职责确认保护集合；真实 PreEdit 证明 policy / 策略 Markdown 的保护高于 workflow 豁免；可信 base 判定使先删声明再改敏感代码不能降权；普通名称 fixture 非 Strict、显式 override 不得降下限；init dry-run 与 fixture apply 共用 TS 操作模型；不预判此行 Standard；覆盖 Scenario 2、3、4、7 | (pending) |
| 4 | 5be62bd66313239dca182767a1258ac19820f95be54aa4ee3812055f01ad0777 | [ ] | HS4 — 编辑授权视图替代完整解析 | contract | 冻结 HS2 后 PreEdit golden，包含已有敏感变更后编辑普通文件；保留 targetPaths 加当前 review subject 变更路径，使用低成本路径读取；列出真实授权源及共用决策，包含实际消费的 review / active-sprint，不机械复用旧哈希集合；清点 state_version / effective.json / workflow_profile / progress_token / authority_revision 消费者，区分实时授权与可滞后视图，证明没有把完整解析搬到每次 Prompt；PreEdit 不发布缓存 / state_version；无竞争初读加回读 ≤2 轮，竞争最多额外重试两次、最多 6 轮、超限 fail closed；完整 resolver 复用授权决策，golden 逐项等价；同提交收紧 state_full_resolves=0 与无竞争 state_authority_reads≤2，竞争单独测；Mac p50 目标只报告；覆盖 Scenario 9、7 | (pending) |
| 5 | d5650826a89a4bb0ec6de174dca14c7b6d7997cb36692b5ad075d06e4fd69825 | [ ] | HS3 — Stop 保存退出与交付检查覆盖 | contract | Stop 不执行架构 drain / cascade，保留 pending 可见性；架构交付检查由配置 / 工作包决定，Strict 不自动要求启用；minimal-change 由全部现有受管理交付入口消费同一结果，验证 Lite / 无 separate contract 的 Standard 也覆盖，不强建契约；新依赖仅按具体政策判断，保留历史 audit receipt 语义；PlanCompletenessGate 降提示；恢复语义与覆盖事件身份不变才不重写，生成时间不触发写入，不同事件身份仍保存；真实行为矩阵证明建议 / 可选维护失败不阻断，仅活动契约恢复持久化失败阻断；显式 architecture 配置升级映射可见；覆盖 Scenario 1、6、7 | (pending) |
| 6 | a337d6e4ce5a656e9426f448b93912684229f00d318ea6e448fcbdbb9300688b | [ ] | HS5 — 真实验证、批准范围与重复实现收敛 | contract | 落实 PRD M4：verification_ref 绑定真实相关验证结果，kind 仍为 command / package_test，smoke 只是用途；无关 preflight / 缺失 / 失败 / 陈旧结果拒绝；unverified 不能替代任一 profile 的必需验收，豁免沿用现有授权；可选 pre-fix artifact 关联同一缺陷与对应检查，不再校验已删 regression_guard 路径；契约只生成适用区块，共享 TS 解析由 shell 和 runner 消费，不依赖委派 runner 作公共中心；目录 glob 由工作包批准，capability 仅建议，投影不扩权，扩展在同一包明确处理；实际 helper 去重并验行为，不数 re-port 注释；更新规则 / 模板，历史证据不改写，活动契约明确迁移；覆盖 Scenario 1、5、7、8 | (pending) |
| 7 | 5b28a474e239badc218c26d832cc674c0af356373a747e851f86036bf82137ab | [ ] | HS5b — 外部审查传输统一为 Herdr | contract | 外部审查（Codex / Claude 审查者）只保留 Herdr 一条传输，复用 claude-review-session 已有的 Herdr 驱动；删除 codex-plugin provider、直调 codex exec 分支与宿主自动选路；AcceptanceReceipt source 收敛为审查者维度，一次性迁移活动契约中的 codex-plugin / codex-review 取值并在同包删除旧路径，历史归档回执仍可验证且不引入双读；保留 base/HEAD 与 subject 摘要钉定、结束后重算 stale_scope、结构化结果文件校验、严重级别映射、P1 即 FAIL、两次尝试上限；缺 Herdr 时 fail-closed 给出明确错误；覆盖 Codex→Claude 与 Claude→Codex 两个方向的真实会话测试 | (pending) |
| 8 | 0e7776461412a130af8c73f8e7679e24408753093b989c4cb9ddd1920b0a767d | [ ] | HS7 — 上下文与本地检查归属 | contract | 不依赖 HS6a / HS6b；模块 Architecture Contract 只投影到模块本地，根上下文保留全局入口；Required Checks 指向现有 testing policy 中按改动面划分的归属表，命令及 CI / release gate 不变；移除测试须在 PR 逐项说明同一失败模式的保留覆盖，仅清理非协议文案、源码扫描或重复昂贵 setup 的冗余断言，不新增同类计数测试；上下文投影验行为，预算仅在达标同提交收紧 | (pending) |
| 9 | 56f6a430a5de73381743306672916ce50bccbbb074d25569489e9724f0a33c7c | [ ] | HS8 — 核心对照评测与收口 | inline | 冻结基线 / 候选提交、provider / model、宿主 / Bun、工具权限、环境与场景输入；复用有效同 subject 证据，运行既有 9 场景 adaptive-lite 对照并以 no-harness 为参照；报告正确性、用户干预、阻断、工件、缓存 / 非缓存 token 与耗时，关键差异有限重复；结论进入 `docs/researches/` 并更新产品定位；仅达标行为收紧预算；不以全通过或小样本声称质量等价；不等待 HS6a / HS6b，也不替其标记完成 | (pending) |
| 10 | e2341604399a5d727dab4af0c09c4addc810239aeaf321e4209fdafa765166a9 | [ ] | HS6a — 后置调查：可选能力使用与成本 | inline | 在 `docs/researches/20260925-optional-subsystem-disposition.md` 按 PRD M5 记录使用证据、未知项、运行 / 安装成本及 MCP tools / hook routes / CLI / policy / tests 边界；提出同包隔离的最小范围；默认 off 不能证明可删；抽离 / 删除仅作后续独立决策，不授权执行；不把未来目标写进 budgets，不阻塞 HS7 / HS8 | (pending) |
| 11 | 536040431ea467c4f33c0fb1fbdb79bcd06465157b22b9ecef43ef78b71d56f3 | [ ] | HS6b — 后置隔离：同包能力按需启用 | contract | 依 HS6a 确认的范围，禁用能力不扫描、不初始化、不注入提示、不启动进程；新安装默认 explicit，已有明确启用配置升级后仍有效；真实禁用 / 启用矩阵与下游升级 fixture 验证；涉及宿主路由须 adapter 迁移及契约测试；不拆包、不删公共能力、不要求 bundle 零可选前缀或总行数单向下降；仅当前达标行为同提交加入 / 收紧预算；非核心 HS8 收口前置 | (pending) |

## Verification Provenance

原提交四项通过仅保留为原作者报告：check-task-sync、check-task-workflow --strict、
inspect-project-state、check-architecture-sync；其余 Required Checks **not run**。
本次修订不把旧结果迁移为新候选的 PASS，也未执行 Mac 基线或整轮 benchmark。
SIGPIPE 与本候选文档检查的实际结果单独在交付摘要报告。

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
