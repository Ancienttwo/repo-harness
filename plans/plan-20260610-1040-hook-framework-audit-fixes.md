# Plan: Hook framework audit fixes

> **Status**: Executing
> **Created**: 20260610-1040
> **Slug**: hook-framework-audit-fixes
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md`
> **Sprint Review**: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`
> **Implementation Notes**: `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`

## Agentic Routing
- Selected route: plan-eng-review
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260610-1040-hook-framework-audit-fixes.md`
- Sprint contract: `tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md`
- Sprint review: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`
- Implementation notes: `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260610-1040-hook-framework-audit-fixes.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260610-1040-hook-framework-audit-fixes.md`.

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
- Contract file: `tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md`
- Review file: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`
- Implementation notes file: `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260610-1040-hook-framework-audit-fixes.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md`, `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`, and `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260610-1040-hook-framework-audit-fixes.md`; after execution revert branch `codex/hook-framework-audit-fixes` or the generated task artifacts

## Captured Planning Output

# repo-harness Hook 框架全面审计与修复计划

## Context

用户要求 review 整个 hook vibe coding framework 的 flow，找出 bug 并提出优化方案。审计方式：3 个并行探索覆盖「hook 入口层 / host 接线与 contract / 下游 sync 链」，关键结论逐条人工核实（含本会话实时误报证据）。用户已确认：死 hook 逐个审计分流、trust allowlist 现在加、**P0~P3 全部修复**。

**总体结论**：框架接线健康——9 个 hook 经 `~/.repo-harness/hook-shim.sh` 全局分发正常、`workflow-contract.json` 与 `assets/workflow-contract.v1.json` 实际同步、`assets/hooks/` 与 `.ai/hooks/` 双份一致、无双重触发。但存在 2 个 P0（任意仓库代码执行、契约块重写可吞用户内容）、5 个 P1、若干 P2/P3。

**审计中剔除的误报**（探索 agent 报告但人工核实不成立，执行时勿修）：模板硬编码 `/Users/chris`（实际 installer 用 `${HOME}` 安装期展开，repo-harness.sh:42-47）；contract 双文件漂移（diff 为空）；`tr '\r\n'` 用法（tr 正确解析转义）；`validate_plan_transition` 错误信息丢失（`var="$(fn)"` 失败时仍赋值，且该函数走 stdout）。

## P1 架构图

- **入口链**：host event → `~/.claude/settings.json` / `~/.codex/hooks.json`（安装期生成，`${HOME}` 展开）→ `~/.repo-harness/hook-shim.sh`（按 `.ai/harness/workflow-contract.json` opt-in）→ `<repo>/.ai/hooks/run-hook.sh`（Codex 输出过滤分支）→ 具体 hook。
- **事件覆盖**：SessionStart、PreToolUse(Edit|Write)、PostToolUse(Edit|Write / Bash / 兜底)、UserPromptSubmit、Stop 双 host 等价接线；SubagentStop / PreCompact / Notification 未接线（设计内，需文档注明）。
- **状态面**：`.ai/harness/events.jsonl`（114KB，无 rotation）、`.ai/harness/architecture/events.jsonl`、`runs/`、`handoff/`、`.claude/.session-id`。
- **下游链**：post-edit-guard → `architecture-drift.sh` → `context-contract-sync.sh` → `architecture-event.ts` → 局部 CLAUDE.md/AGENTS.md 受控块 + `workstream-sync.sh`。
- **双份模板**：`assets/hooks/`（源）↔ `.ai/hooks/`（安装副本），当前同步；**所有 hook 修改必须双份落地**。

## P2 已追踪关键路径（Edit → 契约块重写）

1. Edit `.ai/hooks/x.sh` → PostToolUse → `post-edit-guard.sh:37` 调 `architecture-drift.sh record --file`。
2. drift 写 `docs/architecture/requests/<ts>-<slug>.md`、append `architecture/events.jsonl`（drift.sh:431，无锁）。
3. `post-edit-guard.sh:40` grep `[ArchitectureDrift] Request:` → `context-contract-sync.sh sync-latest`。
4. sync-latest `tail -n 1` 读事件 → `architecture-event.ts sync-contract-files` → awk `replace_contract_block`（context-contract-sync.sh:198-229）重写局部 CLAUDE.md/AGENTS.md。
5. 全链每步 `|| true`，任何一步失败都静默、无补偿。

## P3 设计判断

核心 invariant：**hook advisory-first**（echo + exit 0），仅显式 gate（ArchiveGuard 等）exit 2；状态写入必须可重入幂等。修复不引入新抽象，复用现有 `hook_structured_error` / `workflow-state.sh` 模式；唯一新 helper 是 mkdir-lock（**macOS 无 `flock`，已验证**）。10x 规模下最先崩的是 events.jsonl 无界增长与 prompt-guard 每 prompt ~50 个子进程，列入 Slice 3/5。

---

## 确认的问题清单与修复设计

### P0

**P0-1 任意仓库代码执行** — `~/.repo-harness/hook-shim.sh:26-37`（源 `scripts/hook-shim.sh`）
任何带 `workflow-contract.json` 的 git 仓库，其 `.ai/hooks/` 在 SessionStart 即被执行，无信任检查。
修复：新增 `~/.repo-harness/trusted-repos`（每行一个 realpath）；shim 解析 `$repo` 后 `grep -Fxq` 校验，未信任则 exit 0（仅当 hook 为 session-start-context.sh 时向 stderr 提示一次 `run: repo-harness.sh trust <repo>`）。`scripts/repo-harness.sh` 增 `trust` / `untrust` / `trust-list` 子命令；`install` / `migrate` 自动信任目标仓库。

**P0-2 契约块重写吞内容** — `scripts/context-contract-sync.sh:198-229` + `scripts/architecture-event.ts:385-390`
awk 在 END marker 缺失时 `in_block` 恒为 1，BEGIN 之后**直到 EOF 全部被吞**；BEGIN 重复时新块写两次；marker 带尾随空格不匹配 → 文件尾追加第二份块。TS 侧正则同样无平衡校验。
修复：重写前校验 marker——BEGIN/END 各恰好 1 个且 END 在 BEGIN 后，否则 `hook_structured_error` 中止不重写；marker 匹配容忍尾随空白（`[[:space:]]*$`）；awk 与 TS 两处同步修。

### P1

**P1-1 TDD 误报** — `.ai/hooks/prompt-guard.sh:1517`
裸匹配 `(fix|patch|bug|修复|...)`，无词边界（"prefix"/"bugfix"/"找出Bug" 全中），用 `$PROMPT_TEXT` 而非 `$PROMPT_INTENT_TEXT`，且无负向守卫——对比 1522 行 BDD 规则有 6 个守卫。本会话实测误触发。
修复：换用 `$PROMPT_INTENT_TEXT`；复用 BDD 同款负向守卫集（`is_diagnostic_question_intent`、`is_review_release_advisory_intent` 等，函数已存在）；正则加词边界并要求修复动宾结构（如 `fix (the|this)? ?bug|修复|修一下`），排除 review/audit/找bug 类诊断意图。

**P1-2 WazaRoute 路由优先级错误** — `.ai/hooks/prompt-guard.sh:742-745`
名词域匹配（hook/workflow/config/配置…命中即 `return`）排在 `is_review_release_intent`（747 行）之前，导致提到工具名词的 review 请求永远被路由到 `/health`。本会话实测误路由。
修复：调序——review/release 意图判定前置；tooling 规则改为「健康动词（健康|检查|audit|health|体检|诊断）AND 工具名词」双条件。

**P1-3 CrossReview "Hard bug" 误报** — `.ai/hooks/prompt-guard.sh:1520`
随 P1-1 同分支误触发，P1-1 修复后自然收敛；验收用例需覆盖。

**P1-4 状态并发与无界增长** — `lib/workflow-state.sh` 事件 append、`context-pressure-hook.sh:24-27` counter 读改写、run-summary / active-plan 三连写
无任何锁；counter RMW 并发丢增量；两个 events.jsonl 无 rotation。
修复：`workflow-state.sh` 新增 `workflow_with_lock <name> <cmd>`（mkdir 自旋锁，~2s 超时 + 60s mtime 破栈，macOS 兼容），包住 events append、counter RMW、marker 三连写；`session-start-context.sh`（冷路径）做 rotation——events.jsonl 超 2000 行或 512KB 时保留尾部 500 行，余下归档 `.ai/harness/archive/events-<yyyymm>.jsonl`，两个 events 文件都处理。

**P1-5 八个死 hook** — `.ai/hooks/{tdd-guard-hook,security-sentinel,anti-simplification,atomic-commit,atomic-pending,changelog-guard,finalize-handoff,pre-code-change}.sh`
legacy 适配器退役后无任何事件接线、无内部调用（已验证；contract 中 `.claude/hooks/*` 条目只是 migration 清理列表）。
修复（用户已选分流）：逐个出「功能是否已被 prompt-guard / pre-edit-guard / stop-orchestrator 吸收」结论表——已吸收的删除（assets/ 与 .ai/ 双份 + 更新 contract migration 列表 + `inspect-project-state.ts:123` 引用），有独立价值的（预判 security-sentinel 聚合进 post-bash 链，参照 `assets/reference-configs/hook-operations.md:40` 的聚合设计）接线并补 settings 模板。

### P2

- **P2-1 静默失败链** — `post-edit-guard.sh:35-53` 全链 `|| true`：每个 stage 失败时 echo 一行 `[SyncChain] WARN: <stage> failed`（保持 advisory，不阻塞）。
- **P2-2 stale pending 指针** — `context-contract-sync.sh:456` 永远写最新 request、`architecture-drift.sh:407-410` 向 index.md 只追加不清理：drift 记录新 request 时移除同 capability 的旧 pending 行；`archive-architecture-request.sh` 归档时同步把契约块 `Pending architecture request` 置回 `(none)`。
- **P2-3 resolver stderr 污染** — `architecture-drift.sh:252` `2>&1` 把 stderr 混进 JSON：分离 stderr，`json_get` 前校验首字符为 `{`。
- **P2-4 hook 无 timeout** — `~/.claude/settings.json` / `~/.codex/hooks.json` 生成模板（`repo-harness.sh build_hooks_json`，line 61 起）：每个 entry 加 `"timeout": 30`（Claude 格式按秒）/ Codex 等价字段。
- **P2-5 WARN 死代码** — `hook-input.sh:118` 条件 `== ""` 永不为真（验证函数总置非空）：改为 `HOOK_STDIN_JSON_VALID` 为 false/unknown 时告警。
- **P2-6 mktemp 失败静默** — `run-hook.sh:27-28`：mktemp 失败时回退为直接 `exec bash "$HOOK_PATH"`（放弃过滤但不丢输出）。
- **P2-7 brain sync 路径校验** — `sync-brain-docs.sh:176-179` `startsWith` 未解析 symlink：用 `fs.realpathSync` 后再做容器校验。

### P3

- **P3-1** `lib/session-state.sh:11` session ID 用 `$RANDOM`：拼入 `date +%s` + `/dev/urandom` 8 hex。
- **P3-2** `post-bash.sh:161` NUL 截断：bash 变量本身无法保存 NUL（上游已截断），改为脚本内注释说明已知限制，不改逻辑。
- **P3-3 性能** — prompt-guard 每 prompt ~50 个 grep 子进程；`post-edit-guard.sh run_brain_doc_sync` 每次 edit 都起 `sync-brain-docs.sh`：先用 `time` 实测基线；prompt-guard 把同类关键词表合并为单次 `grep -E` / bash `case`；brain sync 改为先在 bash 内做 manifest 前缀快查、命中才起子进程。优化以实测数字验收，不臆改。
- **P3-4 可移植性** — 用户级 settings 含绝对路径属安装期正常行为：仅在 `docs/reference-configs/hook-operations.md` 注明 dotfile-sync 场景需重跑 `repo-harness.sh install`。
- **文档补齐**：SubagentStop/PreCompact/Notification 未接线为设计决策，写入 hook-operations.md；`run-hook.sh:26-65` Codex 按 hook 名分支的输出过滤规则（新增 Codex hook 需同步改 run-hook.sh）同样文档化。

---

## 执行切片（遵循本仓库 worktree-first 契约）

批准后第一步：`scripts/capture-plan.sh --slug hook-framework-audit-fixes --title "Hook framework audit fixes" --status Approved --execute`，由 `plan-to-todo.sh` 走 contract worktree。每片完成跑 required checks + Waza `/check` 收口。

1. **Slice 1 — P0**：trust allowlist（hook-shim.sh、repo-harness.sh）+ marker 硬化（context-contract-sync.sh、architecture-event.ts）+ 回归测试。
2. **Slice 2 — prompt-guard 精度**：P1-1/2/3，以本会话原 prompt（"…请review整个flow，找出Bug并提出优化方案"）作为回归用例：必须不触发 TDD/CrossReview、路由到 /check 而非 /health；另补「真修 bug」「真 health check」正例。
3. **Slice 3 — 并发与状态**：lock helper、rotation、P2-5/6、P3-1。
4. **Slice 4 — 死 hook 分流**：8 个脚本审计结论表 → 删除/接线，双份 + contract + 文档同步。
5. **Slice 5 — 下游链与性能**：P2-1/2/3/4/7、P3-3 性能实测与优化、P3 文档项。

## 关键文件

`scripts/hook-shim.sh`、`scripts/repo-harness.sh`、`scripts/context-contract-sync.sh`、`scripts/architecture-event.ts`、`scripts/architecture-drift.sh`、`scripts/sync-brain-docs.sh`、`.ai/hooks/prompt-guard.sh`、`.ai/hooks/post-edit-guard.sh`、`.ai/hooks/hook-input.sh`、`.ai/hooks/run-hook.sh`、`.ai/hooks/context-pressure-hook.sh`、`.ai/hooks/session-start-context.sh`、`.ai/hooks/lib/workflow-state.sh`、`.ai/hooks/lib/session-state.sh`、8 个死 hook、`docs/reference-configs/hook-operations.md`——hook 类文件全部同步修改 `assets/hooks/` 对应源。

## 验证

- 新增测试（沿用现有 `tests/*.test.ts` bun 风格）：`tests/contract-block-rewrite.test.ts`（缺 END / 双 BEGIN / 尾随空格三用例，断言中止且原文件不变）、`tests/prompt-guard-intent.test.ts`（误报回归 + 正例）、`tests/workflow-state-lock.test.ts`（并发 append/counter 不丢写）、`tests/hook-shim-trust.test.ts`（未信任仓库 no-op）。
- 既有 required checks 全绿：`bun test`、`check-deploy-sql-order.sh`、`check-task-sync.sh`、`check-task-workflow.sh --strict`、`inspect-project-state.ts --repo . --format text`、`migrate-project-template.sh --repo . --dry-run`（self-migration 仍工作，repo 规则）。
- 手工端到端：echo 模拟 stdin 重放 prompt-guard 验证三处误报消失；编辑一个受控前缀文件走完整 drift→sync 链确认契约块正确重写、events 加锁追加、index.md 无重复 pending。
- 性能：对比修复前后 `time bash .ai/hooks/prompt-guard.sh < fixture.json`。

## Task Breakdown
- [x] Slice 1: trust allowlist (hook-shim.sh + repo-harness.sh trust/untrust/trust-list, auto-trust on install/migrate) + marker balance hardening (context-contract-sync.sh awk + architecture-event.ts) + tests/hook-shim-trust.test.ts + tests/contract-block-rewrite.test.ts
- [ ] Slice 2: prompt-guard intent precision — TDD rule negative guards + PROMPT_INTENT_TEXT + word boundaries (line 1517), WazaRoute review-before-tooling precedence with health-verb requirement (lines 742-745), CrossReview follows TDD gate; tests/prompt-guard-intent.test.ts with this session's prompt as regression case; sync assets/hooks copies
- [ ] Slice 3: workflow_with_lock mkdir-lock helper wrapping events append / counter RMW / marker writes; session-start rotation for both events.jsonl files; fix hook-input.sh:118 dead WARN; run-hook.sh mktemp fallback; stronger session ID; tests/workflow-state-lock.test.ts
- [ ] Slice 4: audit verdict table for 8 dead hooks, delete absorbed ones (assets/ + .ai/ + contract migration lists + inspect-project-state.ts reference), rewire valuable ones (security-sentinel aggregation per hook-operations.md)
- [ ] Slice 5: [SyncChain] WARN observability in post-edit-guard; stale pending pointer lifecycle (drift dedup + archive reset); resolver stderr separation; timeout in generated host settings; realpath containment in sync-brain-docs.sh; measured prompt-guard/brain-sync perf optimization; doc updates in hook-operations.md

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Slice 1: trust allowlist (hook-shim.sh + repo-harness.sh trust/untrust/trust-list, auto-trust on install/migrate) + marker balance hardening (context-contract-sync.sh awk + architecture-event.ts) + tests/hook-shim-trust.test.ts + tests/contract-block-rewrite.test.ts
- [ ] Slice 2: prompt-guard intent precision — TDD rule negative guards + PROMPT_INTENT_TEXT + word boundaries (line 1517), WazaRoute review-before-tooling precedence with health-verb requirement (lines 742-745), CrossReview follows TDD gate; tests/prompt-guard-intent.test.ts with this session's prompt as regression case; sync assets/hooks copies
- [ ] Slice 3: workflow_with_lock mkdir-lock helper wrapping events append / counter RMW / marker writes; session-start rotation for both events.jsonl files; fix hook-input.sh:118 dead WARN; run-hook.sh mktemp fallback; stronger session ID; tests/workflow-state-lock.test.ts
- [ ] Slice 4: audit verdict table for 8 dead hooks, delete absorbed ones (assets/ + .ai/ + contract migration lists + inspect-project-state.ts reference), rewire valuable ones (security-sentinel aggregation per hook-operations.md)
- [ ] Slice 5: [SyncChain] WARN observability in post-edit-guard; stale pending pointer lifecycle (drift dedup + archive reset); resolver stderr separation; timeout in generated host settings; realpath containment in sync-brain-docs.sh; measured prompt-guard/brain-sync perf optimization; doc updates in hook-operations.md
