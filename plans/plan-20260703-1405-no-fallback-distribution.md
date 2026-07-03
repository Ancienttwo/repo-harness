# Plan: No-fallback rule distribution hardening

> **Status**: Approved
> **Created**: 20260703-1405
> **Slug**: no-fallback-distribution
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: Spans two authoritative source trees (assets/ and docs/ reference-config mirrors), CLI command logic in src/cli/commands/init.ts, a shell heredoc template in scripts/lib/project-init-lib.sh, a drift-detection script, a hook context module, cross-cutting tests, and a user-authorized global-config refresh outside this repo; not reducible to a single next-sprint checklist row.
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260703-1405-no-fallback-distribution.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260703-1405-no-fallback-distribution.md`; after execution revert branch `codex/no-fallback-distribution` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260703-1405-no-fallback-distribution.contract.md`
> **Task Review**: `tasks/reviews/20260703-1405-no-fallback-distribution.review.md`
> **Implementation Notes**: `tasks/notes/20260703-1405-no-fallback-distribution.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260703-1405-no-fallback-distribution.md`
- Sprint contract: `tasks/contracts/20260703-1405-no-fallback-distribution.contract.md`
- Sprint review: `tasks/reviews/20260703-1405-no-fallback-distribution.review.md`
- Implementation notes: `tasks/notes/20260703-1405-no-fallback-distribution.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260703-1405-no-fallback-distribution.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260703-1405-no-fallback-distribution.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260703-1405-no-fallback-distribution.md`.

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
- Contract file: `tasks/contracts/20260703-1405-no-fallback-distribution.contract.md`
- Review file: `tasks/reviews/20260703-1405-no-fallback-distribution.review.md`
- Implementation notes file: `tasks/notes/20260703-1405-no-fallback-distribution.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260703-1405-no-fallback-distribution.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260703-1405-no-fallback-distribution.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260703-1405-no-fallback-distribution.md`; after execution revert branch `codex/no-fallback-distribution` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260703-1405-no-fallback-distribution.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260703-1405-no-fallback-distribution.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: (required before projection)

## Evidence Contract

- **State/progress path**: `plans/plan-20260703-1405-no-fallback-distribution.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260703-1405-no-fallback-distribution.contract.md`, `tasks/reviews/20260703-1405-no-fallback-distribution.review.md`, and `tasks/notes/20260703-1405-no-fallback-distribution.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260703-1405-no-fallback-distribution.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260703-1405-no-fallback-distribution.md`; after execution revert branch `codex/no-fallback-distribution` or the explicitly reviewed diff.

## Captured Planning Output

# 计划：把 No-Fallback 硬规则系统化进 repo-harness 的 CLAUDE.md/AGENTS.md 初始化与分发链路

## Context

上一轮事故（salesko）：Codex 在产品语义层写出兜底代码（LLM 抽取失败后用 deterministic 规则补抽语义，静默污染数据）。用户手写硬规则补救时暴露三个系统性缺口，全部指向 repo-harness 这个源头：

1. **规则只进了 Codex 树**：`~/.claude/CLAUDE.md` 的托管块（已核实 marker 健康，BEGIN@5/END@64）内容与模板一致——它缺规则的唯一原因是**权威模板 `assets/reference-configs/global-working-rules.md` 从来没有这条规则**。这是两树漂移的真正根因（不是 legacy-skip 分支）。
2. **托管块会吞手写规则**：`mergeManagedBlock()`（`src/cli/commands/init.ts:240-260`）整块替换、无 marker 配对校验、legacy 无 marker 文件被静默永久跳过。用户在 `~/.codex/AGENTS.md` 块内（177-183）手写的规则下次 sync 必被冲掉（块外 70-76 那份安全）。
3. **新仓库拿不到规则**：根模板 heredoc `pi_root_context_content()`（`scripts/lib/project-init-lib.sh:2159-2201`）无任何行为硬规则；也没有任何 check 检测根 CLAUDE.md↔AGENTS.md 生成后漂移。

目标：单一权威源 + 三个分发通道 + 托管块加固 + 漂移检测，让所有新旧仓库、两个 host 都稳定携带这条规则。

## 用户已确认的决策

- 根模板 heredoc **加**一条压缩 bullet（不只靠 hook/全局块两通道）。
- 实现完成后**执行**本机全局托管块刷新并 readback 验证。

## 变更清单

### 1. 权威规则源：`assets/reference-configs/global-working-rules.md`（+ `docs/reference-configs/` 逐字节镜像同改）

- 在 ` ```md ` fence **内部**（fence 为 5-64 行；`readGlobalRulesTemplate` 只提取 fence 内容，`init.ts:227`），P3 段之后（现 30 行后）、`## Reporting`（现 32 行）之前，插入新章节。措辞与用户 `~/.codex/AGENTS.md:70-76` 手写版逐字对齐（实现时 readback 核对一次），草稿：

```md
## No Compatibility Fallbacks in Product Code

Do not add fallback, compatibility, heuristic, defensive, or "best effort" code paths unless the current task or a human-approved migration/release contract explicitly demands that path. Prefer fail-closed behavior with a clear error over silently inventing output.

When the source of truth is an LLM/provider/external authority/user input contract, do not re-derive the same semantic data with local deterministic rules, regexes, multilingual pattern lists, shadow parsers, or compatibility shims. If the authoritative value is missing, malformed, unauthenticated, or unavailable, surface that failure and stop; do not synthesize a replacement to make the flow continue.

Product-logic compatibility is harmful by default. Do not preserve old product semantics, accept multiple semantic shapes, infer missing fields, or translate one domain meaning into another unless the user explicitly requested that compatibility in the current task or a human-approved migration/release contract names it. Compatibility for old wire formats, legacy clients, or migration windows is allowed only when it is explicit, covered by tests, and bounded by a removal or ownership path. Validation, security checks, data-safety checks, and error handling remain required, but they must reject or report invalid states instead of changing semantics.
```

- 同文件去重历史遗留重复句（每次 sync 都会原样带给用户）：删 46 行保 47 行（「下一刀」条件句），删 51 行保 52 行（"When included, the recommendation is not a question…"）。

### 2. 存量仓库中央触达：`src/cli/hook/minimal-change-context.ts`

`SESSION_CONTEXT`（:10-18）在第 5 条后追加一条（Claude/Codex 双 host 同源注入；下游 `bun add -g repo-harness@latest` 即达）：

```ts
'6. No compatibility fallbacks in product code: do not re-derive an LLM/provider/authority-owned value with local rules or regexes; if the authoritative value is missing or malformed, fail closed with a clear error instead of synthesizing a replacement.',
```

预算核实：现文案约 72 词 + 约 40 词 ≈ 112，低于 policy `max_context_words` 180。

### 3. 新仓库根模板：`scripts/lib/project-init-lib.sh`

`pi_root_context_content()` heredoc 的 `## Decision Protocol` 段追加一条 bullet（两个根文件同源写出，parity 自动保持；不动 `pi_install_root_context_files` 的 preserve-user-authored 三态逻辑）：

```
- Do not add fallback, compatibility, or "best effort" product code that re-derives an authority's semantics (LLM/provider/external/user-input) with local rules, regexes, or shadow parsers; fail closed with a clear error unless the current task or a human-approved migration/release contract explicitly requires that path.
```

### 4. 托管块加固：`src/cli/commands/init.ts`

- `renderGlobalRules`（:231-238）：BEGIN marker 后追加一行自说明注释：`<!-- repo-harness manages this block; edits inside are overwritten on sync. Keep personal rules outside the markers. -->`——直接封堵「手写规则进块内」这个事故形态。
- `mergeManagedBlock`（:240-260）：加 marker 配对硬闸门（BEGIN/END 计数各须恰为 1 且顺序正确；否则拒绝重写、文件不动），范式对齐 `scripts/context-contract-sync.sh:206-215`。返回值改为 `{ content, status: 'written' | 'blocked-unbalanced' | 'skipped-legacy' }`（仅一个调用方）。**保留** legacy 无 marker 跳过行为（`tests/cli/init.test.ts:692` 锁定的 preserve 契约），但从静默变可见。
- `writeGlobalContextFiles`（:262-292）：按 status 输出可辨明细——`blocked:<path>（marker 不配平，手工修复后重跑）`、`skipped-legacy:<path>（存在无 marker 的旧版规则段，补 marker 后才能接受托管更新）`；任一 blocked 时 step 状态标记失败。
- **不复用** `src/effects/managed-block.ts::upsertManagedBlock`：marker 格式不同（`#` vs `<!-- -->`）、无 legacy preserve 守卫、repo-scoped 不能写 `~/` 路径；借鉴配对校验思路即可。

### 5. 漂移检测（advisory，只报不改）：`scripts/inspect-project-state.ts`

drift_signals（:136-177）追加：根 CLAUDE.md 与 AGENTS.md 都存在且内容不同 → push `root-agent-context-divergent`，并加一条 advisory requiredDecision（提示人工调和，harness 不自动覆盖）。守住 `project-init-lib.sh:2197` 的 preserve-user-authored invariant。**不**放进 `check-task-workflow.sh --strict`（硬门禁对故意分叉过狠）。

### 6. 模板债务清理

删除孤儿文件 `assets/templates/CLAUDE.md` + `assets/templates/AGENTS.md`（与 `EOF_DIRECTORY_AGENTS` heredoc 重复维护、无脚本引用、纯 tarball 死载荷）。删除前执行守卫：`grep -rn "templates/CLAUDE.md\|templates/AGENTS.md" scripts src tests assets docs` 须为空。

## 测试

- **新增 `tests/global-working-rules-distribution.test.ts`**（跨面 sentinel 锁，代替机制单源）：
  - assets 模板 fence 内含 `## No Compatibility Fallbacks in Product Code` 和 `do not re-derive the same semantic data`；
  - 两条被去重的句子各只出现一次；
  - `docs/reference-configs/global-working-rules.md` 与 assets 源逐字节相等（镜像锁，先例 `tests/sprint-backlog.test.ts:662`）；
  - `renderMinimalChangeSessionContext` 含 `No compatibility fallbacks` 与 `fail closed` 且不超词数预算。
- `tests/minimal-change-context.test.ts`：追加 toContain，保留 ≤180 词断言。
- `tests/cli/init.test.ts`：幂等用例更新（块内自说明行）；新增重复 marker → blocked 且文件不变；legacy 用例（:692）追加断言新的 `skipped-legacy` 明细（字节保留断言不变）。
- `tests/scaffold-parity.test.ts` + `tests/create-project-dirs.runtime.test.ts`：**追加**新根 bullet 的 toContain（不改既有行；:129 与 :80-82 的字节级 parity 断言自动覆盖两文件一致）。

## 验证命令

```bash
bun test tests/global-working-rules-distribution.test.ts tests/minimal-change-context.test.ts \
         tests/cli/init.test.ts tests/scaffold-parity.test.ts \
         tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts
bun test                                                    # 全量
bash scripts/migrate-project-template.sh --repo . --dry-run  # 动了 project-init-lib.sh 的强制自迁移检查
diff assets/reference-configs/global-working-rules.md docs/reference-configs/global-working-rules.md
bun scripts/inspect-project-state.ts --repo . --format text  # 本仓库不应出现 root-agent-context-divergent
bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && \
bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict
```

## 全局刷新（用户已授权的最后一步）

1. 先备份 `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md` 各一份（回滚面）。
2. 从本 checkout 触发 `writeGlobalContextFiles`（init 的 `--global-context` 路径、target both；确切 CLI 旗标实现时从 `runInit` 参数核对）。
3. readback 验证：两文件均 grep 到 `No Compatibility Fallbacks in Product Code`；块外内容与备份 diff 一致（Codex 块外 70-76 手写版仍在——之后是否删除去重由用户自定，本任务不碰）；重复「下一刀」句消失；二次运行报 `unchanged`（幂等）。

## 执行隔离与流程

- 工作区有 10 个未提交文件（CLI helper 迁移中间态），其中与本刀共享 `project-init-lib.sh`、`scaffold-parity.test.ts`、`create-project-dirs.runtime.test.ts`。**不 stash 不 reset 用户 WIP**；在当前 HEAD 上开专用分支，`project-init-lib.sh` 只动 heredoc 区（2159-2200，与 WIP 改动区文本距离远），共享测试文件只追加断言，保持两个变更集可独立 review。
- 按仓库契约，动手前用 `repo-harness run capture-plan --artifact-level work-package --slug no-fallback-distribution --status Approved` 把本计划落成 `plans/plan-*.md`（合并单元/回滚面/验证边界均满足 work-package 门槛）。

## 显式裁掉项与残留

- **裁掉**：partials 系统改动（未接线的手动路径，不映射任何事故形态）；功能块配对漂移检测（扩大爆炸半径，记 `tasks/todos.md`）；legacy 无 marker 文件自动转换（会碰用户手写段，只做可见化）；`policy.json` protected_concerns 扩项。
- **记录不修**：`renderGlobalRules` 语言替换正则 no-op（`init.ts:234` 匹配的句子在模板里不存在）——另行一刀。
- **残留（本刀不覆盖）**：`~/.claude/rules/anti-patterns.md` 缺 #37 属 Waza 规则树同步，salesko 两份 repo contract 的 never-commit 句子属该仓库——均为独立后续。

## 回滚

逐文件独立可 revert；模板回滚后下次 sync 自动恢复旧块；全局文件用第 1 步备份直接还原；孤儿模板删除可 `git revert`。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: No-fallback rule distribution hardening
