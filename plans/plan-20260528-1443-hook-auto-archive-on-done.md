# Plan: Auto archive plans on done intent

> **Status**: Executing
> **Created**: 20260528-1443
> **Slug**: hook-auto-archive-on-done
> **Planning Source**: claude-plan-mode
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/hook-auto-archive-on-done.contract.md`
> **Sprint Review**: `tasks/reviews/hook-auto-archive-on-done.review.md`
> **Implementation Notes**: `tasks/notes/hook-auto-archive-on-done.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from claude-plan-mode planning output.
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260528-1443-hook-auto-archive-on-done.md`
- Sprint contract: `tasks/contracts/hook-auto-archive-on-done.contract.md`
- Sprint review: `tasks/reviews/hook-auto-archive-on-done.review.md`
- Implementation notes: `tasks/notes/hook-auto-archive-on-done.notes.md`
- Todo projection: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/hook-auto-archive-on-done.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan when present; `.claude/.active-plan` is a legacy fallback during transition. Use `scripts/switch-plan.sh --plan plans/plan-20260528-1443-hook-auto-archive-on-done.md` when multiple plans exist.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260528-1443-hook-auto-archive-on-done.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260528-1443-hook-auto-archive-on-done.md`.

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
- Contract file: `tasks/contracts/hook-auto-archive-on-done.contract.md`
- Review file: `tasks/reviews/hook-auto-archive-on-done.review.md`
- Implementation notes file: `tasks/notes/hook-auto-archive-on-done.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/hook-auto-archive-on-done.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and mirrored to `.claude/.active-plan` unless --no-active is used; latest non-archived `plans/plan-*.md` is a compatibility fallback only.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `tasks/todo.md`, `tasks/contracts/hook-auto-archive-on-done.contract.md`, `tasks/reviews/hook-auto-archive-on-done.review.md`, and `tasks/notes/hook-auto-archive-on-done.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/hook-auto-archive-on-done.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260528-1443-hook-auto-archive-on-done.md`; after execution revert branch `codex/hook-auto-archive-on-done` or the generated task artifacts

## Captured Planning Output

# Plan: 让 hook 在 done intent 全部验证通过后自动归档 plans/*

**Status**: Draft
**Created**: 2026-05-28
**Owner**: andytnko@gmail.com
**Skill route**: /hunt 诊断 → /think 改造方案

## Context

用户报告：「我为本 repo 配置了本 skill 的 hook，为什么 `plans/*` 也是不能触发归档」。

经过 hunt 诊断，根因不是 hook 配置失效或路径不匹配，而是 **agentic-dev 仓库当前 hook 链路在设计上就不会调用归档脚本**。本 plan 既给出根因解释，也提出一个保守的改造：在 done intent + 全套 quality gate 通过后，让 `prompt-guard.sh` 自动调用 `archive-workflow.sh`，并通过自然语言显式选择 outcome（默认 Completed，避免破坏可逆性约束）。

## P1 / P2 / P3 诊断（根因）

### P1 — 真实的 hook 链路

`.claude/settings.json` 配的 hook 全部清单（每个都是 `bash .ai/hooks/run-hook.sh <script>`）：

| 事件 | matcher | 脚本 | 是否调用归档 |
|---|---|---|---|
| SessionStart | (none) | `session-start-context.sh` | 否 |
| PreToolUse | `Edit\|Write` | `worktree-guard.sh` + `pre-edit-guard.sh` | 否 |
| PostToolUse | `Edit\|Write` | `post-edit-guard.sh` + `autoresearch-advisory.sh` | 否 |
| PostToolUse | `Bash` | `post-bash.sh` | 否 |
| PostToolUse | (none) | `trace-event.sh` + `context-pressure-hook.sh` | 否 |
| UserPromptSubmit | (none) | `prompt-guard.sh` + `autoresearch-advisory.sh` | 否 |
| Stop | (none) | `finalize-handoff.sh` | 否 |

`scripts/archive-workflow.sh` 在 `.claude/`、`.ai/hooks/`、`scripts/` 里**没有任何被调用的位置**（grep 确认：仅 `scripts/lib/project-init-lib.sh` 在 helper 列表里登记它，用于权限设置）。

### P2 — 用户编辑 `plans/plan-XXX.md` 之后的实际路径

1. Edit/Write → PreToolUse matcher `Edit|Write` 命中
2. `.ai/hooks/pre-edit-guard.sh` 跑 → 命中 `^plans/plan-.*\.md$` → 仅**验证 Draft → Annotating → Approved 状态转换合法性**（不归档）
3. PostToolUse matcher `Edit|Write` 命中
4. `.ai/hooks/post-edit-guard.sh` → 同步 architecture-drift / brain-docs / context-contract（不归档）
5. 下一次 UserPromptSubmit → `.ai/hooks/prompt-guard.sh:362-365` → `has_changes_glob '^plans/plan-.*\.md$'` 命中 → 仅打印 `[AnnotationGuard] <file> has annotations. Process all notes and revise. Do not implement yet.`（不归档）
6. 用户发"done" → `.ai/hooks/prompt-guard.sh:468-567` 跑 `done_intent` 分支 → 验证 active plan / contract / review / checks / evidence contract → **全部通过后什么也不做就返回**（不归档）
7. Stop hook → `.ai/hooks/finalize-handoff.sh` → 只写 `.ai/harness/handoff/current.md`（不归档）

### P3 — 为什么是这样设计

`scripts/archive-workflow.sh:7-11` 的 usage 强制要求 `--plan <file> --outcome <Completed|Abandoned|Superseded>`：

- 归档是不可逆的状态转换（plan 文件被 `mv` 到 `plans/archive/`，并清除 active-plan marker）
- outcome 三个值表达**不同语义**：成功完成 / 主动放弃 / 被新 plan 取代 —— hook 无法自动推断
- 这与 CLAUDE.md 工作流契约一致：「完成的 block 通过 Waza `/check` 和 `scripts/contract-worktree.sh finish` 完成」

所以 hook 系统**有意保持归档为显式调用**，避免误归档破坏可逆性。

### 根因（一句话）

> 根本原因是 `.claude/settings.json` + `.ai/hooks/` 的全部 hook 调用链中**没有任何一处调用 `scripts/archive-workflow.sh`**，归档脚本被设计为必须由用户/agent 显式运行并提供不可推断的 `--outcome` 参数；hook 对 `plans/*` 的所有逻辑只覆盖状态转换验证、变更警告和上下文同步，从不归档。

---

## 改造方案：在 done intent + 全套 quality gate 通过后自动归档

### 核心思路

不打破 hook 不主动决策的设计哲学，只在**用户已经发出明确完成信号**且**所有质量门通过**时，让 hook 把已有的显式归档动作"接上最后一公里"。

### 触发条件（全部满足才归档）

1. 用户 prompt 命中 `is_done_intent()`（已有的检测函数）
2. `get_active_plan` 返回非空
3. `derive_contract_path` 解析成功且 contract 文件存在
4. `plan_evidence_contract_error` 返回 0（Evidence Contract 完整）
5. `scripts/verify-contract.sh --strict` 返回 0
6. `workflow_active_review` 存在且 `workflow_review_recommends_pass` 通过
7. `workflow_checks_pass` 通过（`.ai/harness/checks/latest.json` 记录通过）
8. **新增**：`tasks/todo.md` 中没有未勾选的 `- [ ]` 项

（前 7 条已经在 prompt-guard.sh:468-567 的 done_intent 分支里全部检查完了，第 8 条是新加的"全部勾选完才归档"保险）

### outcome 选择策略

新增 `derive_done_outcome()` 函数，从 `PROMPT_INTENT_TEXT` 中推断 outcome 关键字：

- 命中"放弃 / abandoned / drop / 不做了 / 算了" → `Abandoned`
- 命中"替代 / superseded / replaced by / 改用新方案" → `Superseded`
- 默认（包括"done / 完成 / 收工 / finished"） → `Completed`

这样 outcome 仍然是**用户显式表达**的，hook 只做映射，不做决策。

### 关键文件修改

唯一需要改的文件：**`.ai/hooks/prompt-guard.sh`**

修改点 1：新增 `derive_done_outcome()` 函数（约 15 行），放在 `is_done_intent()` 附近。

修改点 2：在 done_intent 分支末尾（约第 567 行后，所有 quality gate 通过之后），新增自动归档块：

```bash
# 新增：所有 done 验证通过后，自动归档
remaining_todos="$(grep -cE '^- \[ \]' tasks/todo.md 2>/dev/null || echo 0)"
if [ "$remaining_todos" -gt 0 ]; then
  echo "[ArchiveGuard] Done intent detected but tasks/todo.md still has $remaining_todos unchecked items. Refusing to auto-archive."
  hook_structured_error "ArchiveGuard" \
    "Done intent with $remaining_todos unchecked todo items." \
    "Finish remaining items or run bash scripts/archive-workflow.sh manually." \
    "state_violation"
  exit 1
fi

outcome="$(derive_done_outcome)"
echo "[AutoArchive] All quality gates passed. Archiving plan as outcome=$outcome"
if ! archive_output="$(bash scripts/archive-workflow.sh --plan "$active_plan" --outcome "$outcome" 2>&1)"; then
  printf '%s\n' "$archive_output"
  hook_structured_error "AutoArchive" \
    "Automatic archive failed for $active_plan." \
    "Run bash scripts/archive-workflow.sh --plan $active_plan --outcome $outcome and resolve the error." \
    "contract_failure"
  exit 1
fi
printf '%s\n' "$archive_output"
```

可复用资源：
- `scripts/archive-workflow.sh:1-187` — 已经处理好 mv、status 更新、marker 清除、tasks/todo.md 重置、tasks/notes 归档
- `.ai/hooks/lib/workflow-state.sh` — 已提供 `get_active_plan` / `workflow_active_review` / `workflow_checks_pass` / `hook_structured_error`
- `prompt-guard.sh` 中现有的 `is_done_intent()` / `PROMPT_INTENT_TEXT` 解析逻辑

### 不需要改的

- `.claude/settings.json` 配置不变（matcher 和 hook 列表不变）
- `scripts/archive-workflow.sh` 不变（接口已经够好）
- 其他 hook 脚本不变
- 不影响手动调用 `archive-workflow.sh`（保留 escape hatch）

### 设计取舍说明

- **没选"PostToolUse 自动归档"**：因为编辑 plans/*.md 本身不是"完成"信号，自动归档会破坏 annotation 工作流
- **没选"Stop hook 自动归档"**：因为 Stop 触发频繁（每次会话结束），且无法判断 outcome
- **选 done_intent 自动归档**：done 是用户明确意图，且现有 hook 已经在这个分支堆好了全套验证 —— 只是临门一脚没踢出去
- **新增的 "todo 全勾选" 保险**：防止 done intent 误触发归档（用户可能只是说"先完成这一块"）

---

## 验证方案

### 单元级（修改完成后立即跑）

```bash
# 1. 检查 prompt-guard.sh 语法
bash -n .ai/hooks/prompt-guard.sh

# 2. 跑现有的 hook 单元测试（如果有）
bun test
```

### 集成级（端到端模拟）

```bash
# 1. 构造完整 Approved plan + contract + review + 全勾选 todo
bash scripts/new-plan.sh --slug hunt-test-archive --title "Test auto archive"
# 手动把 plan Status 改成 Approved，填好 Evidence Contract
# 跑 plan-to-todo
bash scripts/plan-to-todo.sh --plan plans/plan-*-hunt-test-archive.md
# 手动把 tasks/todo.md 所有 [ ] 改成 [x]
# 构造 review.md（recommend: pass）和 checks/latest.json（current sprint pass）

# 2. 模拟 done prompt 触发 hook
HOOK_REPO_ROOT="$(pwd)" \
  CLAUDE_HOOK_INPUT='{"prompt":"done"}' \
  bash .ai/hooks/prompt-guard.sh

# 3. 验证 6 个产物状态
ls plans/                          # 不应有 hunt-test-archive plan
ls plans/archive/                  # 应有 plan-*-hunt-test-archive.md
cat .ai/harness/active-plan        # 应不存在
cat tasks/todo.md | head -5        # 应为 "Status: Idle"
ls tasks/archive/                  # 应有 todo-*-hunt-test-archive.md
cat plans/archive/plan-*-hunt-test-archive.md | grep '^\*\*Status\*\*'  # 应为 "Archived"
```

### 回归级（确保不破坏现有流程）

```bash
# 当前必须通过的检查
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text

# 反向用例：未勾选 todo 时不应归档
echo "- [ ] still pending" >> tasks/todo.md
HOOK_REPO_ROOT="$(pwd)" CLAUDE_HOOK_INPUT='{"prompt":"done"}' bash .ai/hooks/prompt-guard.sh
# 期望：输出 [ArchiveGuard] 拒绝归档，exit 1

# 反向用例：outcome 推断（abandoned）
HOOK_REPO_ROOT="$(pwd)" CLAUDE_HOOK_INPUT='{"prompt":"算了不做了"}' bash .ai/hooks/prompt-guard.sh
# 期望：outcome=Abandoned
```

### Stop 条件

- 所有验证脚本通过
- plan 文件成功 mv 到 `plans/archive/`，状态字段更新为 `Archived` 或 `Abandoned`
- active-plan marker 被清除
- tasks/todo.md 重置为 Idle 模板
- 反向用例（todo 未全勾选 / outcome 关键字识别错误）都被正确拒绝

---

## Evidence Contract（plan 自验收四元组）

- **State/progress path**: `.ai/hooks/prompt-guard.sh` 的 done_intent 分支末尾新增 `[AutoArchive]` 日志行 + `scripts/archive-workflow.sh` stdout
- **Verification evidence**: `plans/archive/plan-*-hunt-test-archive.md` 存在 + `.ai/harness/active-plan` 被删除 + `tasks/todo.md` 为 Idle 模板
- **Evaluator rubric**: 见上"验证方案"三层（单元/集成/回归），其中集成级的 6 个产物状态全部满足
- **Stop condition**: 上述 6 个产物全部满足，且反向用例（todo 未全勾选、outcome 关键字）按预期拒绝/识别
- **Rollback surface**: `git checkout -- .ai/hooks/prompt-guard.sh` 即可完全回滚；归档动作如果误触发，plan 文件还在 `plans/archive/`，可手动 `mv` 回 `plans/`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Auto archive plans on done intent
