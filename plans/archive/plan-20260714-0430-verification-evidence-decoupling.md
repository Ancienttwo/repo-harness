# Plan: 验证工作流去过度工程：证据生产与验证门禁解耦

> **Status**: Archived
> **Created**: 20260714-0430
> **Slug**: verification-evidence-decoupling
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Root required checks plus reversed freshness/workflow-state behavior tests; this package's own verifier must not live-run the benchmark matrix
> **Rollback Surface**: Per-slice independent commits, each revertible; fingerprint semantic change paired with its test reversal in the same commit; Card-fallback deletion is an isolated commit
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md`
> **Task Review**: `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md`
> **Implementation Notes**: `tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260714-0430-verification-evidence-decoupling.md`
- Sprint contract: `tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md`
- Sprint review: `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md`
- Implementation notes: `tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-0430-verification-evidence-decoupling.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-0430-verification-evidence-decoupling.md`.

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
- Contract file: `tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md`
- Review file: `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md`
- Implementation notes file: `tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-0430-verification-evidence-decoupling.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Per-slice independent commits, each revertible; fingerprint semantic change paired with its test reversal in the same commit; Card-fallback deletion is an isolated commit
- **Verification boundary**: Root required checks plus reversed freshness/workflow-state behavior tests; this package's own verifier must not live-run the benchmark matrix
- **Review/acceptance boundary**: `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-0430-verification-evidence-decoupling.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md`, `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md`, and `tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Per-slice independent commits, each revertible; fingerprint semantic change paired with its test reversal in the same commit; Card-fallback deletion is an isolated commit

## Captured Planning Output

# 验证工作流去过度工程：证据生产与验证门禁解耦

## P1 目标与边界

kernel-reduction 合同一次执行耗时约 20 小时，事后双轨审计（GPT 独立调研 `docs/researches/20260714-gpt-review.md` + Opus 独立审计，本计划为两轨裁决合成）确认三个病灶：

1. 全量 3×9 authoritative benchmark matrix（单轮 25–40 分钟）被写进合同 `commands_succeed`，每轮 `verify-sprint` 经 `verify-contract` 活跑一遍，该会话触发至少 6 次；
2. review fingerprint 把 `base_rev` 哈入载荷（`src/cli/hook/diff-fingerprint.ts:489-506`），无关 main 推进或干净 rebase 即 churn，逼出 4 轮嵌套 `claude -p` 复验；
3. `scripts/verify-sprint.sh` 在 canonical external acceptance 不可用时回退 Human Review Card，构成 dual authority，违反 SSOT 与 fail-closed 原则。

目标状态：verify-sprint 单轮回到 `bun test` 支配的分钟级；authoritative matrix 降级为一次性证据生产（作者 clean checkout 手动跑，verify 只做已有的报告字节 + provenance 绑定校验，见 `workflow-state.sh` benchmark evidence 检查）；内容不变的 rebase / 无关 main 推进不再触发复验；验收唯一权威为 canonical section。

## P2 关键证据

- 活跑门禁链：contract `commands_succeed` → `verify-sprint.sh` → `verify-contract.sh` 逐条 `bash -c` 无缓存执行；廉价权威（报告 sha256 + runner/manifest/fixture provenance 绑定，毫秒级 fail-closed）在 `workflow-state.sh` 已存在，两套权威并存且留错了活跑那套。
- fingerprint：`head_rev` 已因「避免验收 commit 自失效」被排除出哈希载荷，`base_rev` 未同步排除；三点 diff patch hash 本身已具备正确语义——无关文件的 base 推进不改 patch，同文件改动改 hunk 上下文、自动触发重验。
- 三次事故（外层 20 分钟超时杀健康 matrix、286 个残留 benchmark 根写爆 temp 触发 ENOSPC、worktree 被并行会话删除）全部是「活跑权威塞进每轮验证」的次生灾害。
- 计时噪声：notes 实测同一 no-harness arm 时长波动 ±131%（共享主机），任何墙钟硬断言必然 flaky。

## P3 裁决（两轨分歧的取舍，经三准则复筛）

- fingerprint 只做最小修复（移出 `base_ref`/`base_rev`），不重写为内容摘要 + 路径交集机制——patch hash 已有该语义，新机制违反「宁可砍机制，不加新机制」。
- 不加任何防回归机器：600 秒墙钟硬门（计时噪声 ±131% + exit 143 事故先例，必然 flaky）和结构禁令检查脚本都不做。防回归 = 删掉模板里的坏示例 + 文档一行 invariant；实证复发一次再加检查（触发条件记入 todos）。
- 不给 evidence 绑定加补强断言——无观测事故；报告字节 + provenance 绑定已是唯一有效性权威，再加一套判定语义（source_commit 祖先检查）反而制造第二权威，违反 SSOT。
- benchmark runner 只做每 arm 结束即删临时目录（对应实测 ENOSPC 事故的最小修复）；「启动时带活性检测的陈旧根清扫」是新复杂度，积累源已随活跑门禁一起删除，不做。per-profile 安装重构（27 次安装 → 3 base + overlay）推迟为独立 todo。
- 不引入 concurrency key、evidence producer 正式身份、磁盘预算断言——单人本地工作流，过度机器。

## Task Breakdown

1. **fingerprint 去 base 绑定**：`src/cli/hook/diff-fingerprint.ts` 将 `base_ref`/`base_rev` 移出 hashed payload，保留为非哈希 metadata（与 `head_rev` 处理对称）。同一 slice 内反转 `tests/review-freshness.test.ts`：删除「任意 target advance 必 stale」断言；新增「内容不变的 rebase/无关 main 推进 → acceptance 仍有效」「实现内容/路径/删除状态变化 → 必 stale」「同文件 target 变化经 patch hash 变化 → 必 stale」。
2. **删除 Card fallback**：`scripts/verify-sprint.sh` 删除 canonical external acceptance 不可用时读 Human Review Card 结论的回退分支（GPT 报告引用 :518-528，按当前行号核对）；canonical 缺失/损坏/helper 不可用一律 fail。`tests/workflow-state-lib.test.ts` 删 fallback 用例，新增「Card 写 pass 不能挽救 canonical 失败」。
3. **模板与文档去活跑**：合同模板（`assets/` 产品源及仓库内投影）从 `exit_criteria.commands_succeed` 示例中移除 `benchmark:harness --require-authoritative` 类活跑命令；去除 `tests_pass` 与 `commands_succeed` 对同一测试文件的重复执行 authority（只留一处）；`docs/reference-configs/` 相应文档补一条 invariant：verifier 消费证据，不生产 runtime-heavy 证据；authoritative matrix = 作者合入前 clean checkout 手动跑一次产出 tracked 报告。当前无活动合同实例需要迁移。
4. **runner 每 arm 即删 + 收尾**：`scripts/run-harness-profile-benchmark.ts` 每 arm 结束提取结果后删除该 arm 临时目录（不改 arm 计时窗口与语义，`tests/harness-benchmark-matrix.test.ts` 相应补充）。提交 `docs/researches/20260714-gpt-review.md`（双轨证据之一）。`tasks/todos.md` 记两个推迟项及触发条件：「benchmark per-profile 安装重构（3 base + overlay）」、「合同 commands_succeed 结构禁令检查——仅当活跑 matrix 命令实证复发一次时再加」。本包不产新 authoritative 报告、不跑全量 matrix。

## 明确删除（同包移除旧路径，不留兼容开关）

- 合同模板/文档中的活跑全量 matrix verifier 命令及示例。
- fingerprint hashed payload 中的 `base_ref`、`base_rev`。
- `verify-sprint.sh` 的 Human Review Card external-acceptance fallback。
- `tests_pass` 与 `commands_succeed` 的重复测试执行 authority（保留一处）。
- 「target tip 任意变化即 stale」的 freshness 语义与对应测试断言。

## 明确不做（本包否决项）

- 600 秒/任意墙钟硬超时门禁——计时噪声必然 flaky。
- `check-verification-cost.sh` 结构禁令检查脚本——为一个已删除且模板不再示范的错误加常驻检查机器；防回归靠文档 invariant，实证复发一次再加。
- fingerprint 重写为 `review_subject_sha256` + target 路径交集判定机制——patch hash 已有该语义。
- evidence 绑定补强断言（`source_commit` 祖先检查等）——现有字节 + provenance 绑定是唯一有效性权威，不加第二套判定语义。
- 启动时带活性检测的陈旧 benchmark 根清扫——活性检测是新复杂度，积累源已删。
- benchmark per-profile 安装重构（推迟为 todo，非本包）。
- concurrency key、evidence producer 身份、磁盘预算断言。

## 验证与回滚

- 验证：root Required Checks 全量（`bun test`、check 脚本族、`check-task-workflow --strict`、adopt dry-run）+ 反转后的 freshness/workflow-state 行为测试。本包合同 verifier 不得包含活跑 matrix（吃自己的药）。
- 回滚：按 slice 独立 commit，逐个可 revert；fingerprint 语义变更与测试反转同 commit，revert 即整体恢复旧语义；Card fallback 删除为独立 commit。
- 成本预期：单轮验证 25–40 分钟 → 分钟级；benchmark 相关 work-package 全生命周期 ≈ 1 次 matrix + 1 次外部验收 + 秒级门禁。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: 验证工作流去过度工程：证据生产与验证门禁解耦
