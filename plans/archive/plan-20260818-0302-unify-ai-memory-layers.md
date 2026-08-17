# Plan: 统一 AI 长期记忆分层：repo 为权威，vault 降级为可选投影

> **Status**: Archived
> **Created**: 20260818-0302
> **Slug**: unify-ai-memory-layers
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260818-0302-unify-ai-memory-layers.md`; after execution revert branch `codex/unify-ai-memory-layers` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md`
> **Task Review**: `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md`

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

- Active plan: `plans/plan-20260818-0302-unify-ai-memory-layers.md`
- Sprint contract: `tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md`
- Sprint review: `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md`
- Implementation notes: `tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0302-unify-ai-memory-layers.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0302-unify-ai-memory-layers.md`.

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
- Contract file: `tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md`
- Review file: `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md`
- Implementation notes file: `tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0302-unify-ai-memory-layers.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260818-0302-unify-ai-memory-layers.md`; after execution revert branch `codex/unify-ai-memory-layers` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0302-unify-ai-memory-layers.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md`, `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md`, and `tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260818-0302-unify-ai-memory-layers.md`; after execution revert branch `codex/unify-ai-memory-layers` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

把机器上并行运行的五层 AI 记忆压成三层：repo 内文件为权威，两个 host 的自动记忆降级为 session 缓存，Obsidian vault 降级为可选的人读投影，写入路径只保留 `obsidian-memory` skill 一条显式调用。

产品面（本 repo 需要交付的部分）必须对全新采用者成立：未配置 `brainRoot` 是合法稳态，不得把「没有 vault」当作待修复故障。

## Context

2026-08-18 复核发现机器上同时存在：Claude Code auto-memory（108 篇）、Codex chronicle（近六千行）、repo-harness brain manifest（13 条文档外置）、`obsidian-memory` skill（零调用）、`_AI-Memory` vault（另一个 iCloud container）。两个 host 互不可见，两个 vault 互不知情。

`_AI-Memory` 项目页宣称已把回写协议接入 `~/.codex/AGENTS.md` 并启用每周五周检自动化，实测两条均不成立（AGENTS.md 227 行零命中；automations 目录为空）。落库的两篇内容退化为 commit SHA 与 CI run ID 流水账。

## Task Breakdown

- [x] Phase 1 修假接线：把回写协议真正写入 `~/.codex/AGENTS.md`（指向 skill 而非硬编码 vault 路径），删除 vault 内两条被证伪的宣称，订正 `/Users/kito` 失效路径
- [x] Phase 2 收敛成一个 vault：归档后把 `_AI-Memory` 协议与有效内容迁入 `brain/`，删除 `agentic-dev-skill`/`project-initializer` 两个废名 sub-vault
- [ ] Phase 3 产品面：`assets/skills/obsidian-memory/SKILL.md` 加排除式写入门槛、manifest 目录所有权边界、vault 可选语义；双侧投影；契约测试钉住；repo 契约文件补收口调用
- [ ] Phase 4 缓存层降级：两侧全局规则声明 host 自动记忆不得引用为事实，Codex 侧指向跨项目偏好唯一权威

## Key Decisions

- 权威落 repo 不落 vault：repo 在 git 下有版本历史与 review，vault 在 iCloud 没有；两个 runtime 原生就读 repo 内文件
- 写入门槛改成排除式：正向价值标准不可机械判断，实测产出流水账。规则为「git/registry/托管平台/CI/可重跑命令已记录的事实只写指针」
- 不碰 hooks：三处硬规则禁止 hooks 与 workflow check 读写 vault，且 hook 触发的记忆必然退化成日志
- brain manifest 只正名不改码：13 个条目是文档体积外置，非记忆；记忆笔记落 `notes/`、`decisions/`，不碰 manifest 拥有的路径
- vault 层对下游可选：产品面不得假设采用者配置了 brainRoot

## Verification

- `bun test tests/skill-surface/`
- `bash scripts/check-architecture-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `cmp` 校验 skill 双侧一致

## Rollback

Phase 1/3/4 全为文本，git revert 即可。Phase 2 已在 `_ops/archive/` 留 tarball（`ai-memory-pre-merge-20260818.tgz`、`brain-stale-subvaults-20260818.tgz`），vault 内容可原样恢复。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Phase 1 修假接线：把回写协议真正写入 `~/.codex/AGENTS.md`（指向 skill 而非硬编码 vault 路径），删除 vault 内两条被证伪的宣称，订正 `/Users/kito` 失效路径
- [x] Phase 2 收敛成一个 vault：归档后把 `_AI-Memory` 协议与有效内容迁入 `brain/`，删除 `agentic-dev-skill`/`project-initializer` 两个废名 sub-vault
- [ ] Phase 3 产品面：`assets/skills/obsidian-memory/SKILL.md` 加排除式写入门槛、manifest 目录所有权边界、vault 可选语义；双侧投影；契约测试钉住；repo 契约文件补收口调用
- [ ] Phase 4 缓存层降级：两侧全局规则声明 host 自动记忆不得引用为事实，Codex 侧指向跨项目偏好唯一权威
