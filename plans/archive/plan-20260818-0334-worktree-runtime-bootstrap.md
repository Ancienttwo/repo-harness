# Plan: contract-worktree start 初始化运行时基线

> **Status**: Archived
> **Created**: 20260818-0334
> **Slug**: worktree-runtime-bootstrap
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260818-0334-worktree-runtime-bootstrap.md`; after execution revert branch `codex/worktree-runtime-bootstrap` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md`
> **Task Review**: `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md`

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

- Active plan: `plans/plan-20260818-0334-worktree-runtime-bootstrap.md`
- Sprint contract: `tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md`
- Sprint review: `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md`
- Implementation notes: `tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0334-worktree-runtime-bootstrap.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0334-worktree-runtime-bootstrap.md`.

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
- Contract file: `tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md`
- Review file: `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md`
- Implementation notes file: `tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0334-worktree-runtime-bootstrap.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260818-0334-worktree-runtime-bootstrap.md`; after execution revert branch `codex/worktree-runtime-bootstrap` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0334-worktree-runtime-bootstrap.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md`, `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md`, and `tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260818-0334-worktree-runtime-bootstrap.md`; after execution revert branch `codex/worktree-runtime-bootstrap` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

让 `contract-worktree start` 在创建 worktree 后初始化那些 gitignored 的运行时产物，使新 worktree 一开始就能通过 `check-architecture-sync.sh`，而不是每次都重新诊断一遍。

## Context

2026-08-18 在 `codex/unify-ai-memory-layers` 的 worktree 上，`check-architecture-sync.sh --strict` 直接红，`state=missing`、dead_letter 报 `unresolved-major-change` 列了 11 个与改动无关的 capability。真因是新 worktree 缺三个 gitignored 产物，`start` 一个都不建：

1. `node_modules/` —— `check-architecture-sync.sh:219` 走 candidate build `bun src/cli/index.ts`，它要求 package-local `archctx`；缺依赖时 handshake 报 `package-local archctx@0.4.3 is missing from the consumer dependency tree`，`state=missing`。全局 `repo-harness` CLI 走另一条解析并返回 `ready`，两者结论相反，极易误判。
2. `.codegraph/` 索引 —— `codeFacts` 为 `required` 但 `not-evaluated`，archctx 无法为各 capability 证明 flow，全部判 `unresolved-major-change`。错误信息只列 capability 名单，完全不提 code facts 缺失。
3. `receipts/` —— 前两项修好后第一次成功 drain 自动产生，无需单独处理。

诊断成本全在症状与真因之间的两层间隔上。`.archcontext/generated` 是红鲱鱼：从主库复制过去无效，移除后闸门照常绿。

## Task Breakdown

- [ ] 在 `start_worktree` 创建/复用 worktree 之后加运行时基线初始化：有 bun 且有 lockfile 时跑 `bun install --frozen-lockfile`；主库已采用 codegraph（存在 `.codegraph/`）且 `codegraph` 在 PATH 时在新 worktree 跑 `codegraph init`
- [ ] 两份配对副本 `scripts/contract-worktree.sh` 与 `assets/templates/helpers/contract-worktree.sh` 保持逐字节一致
- [ ] 加测试钉住 start 路径包含该初始化步骤
- [ ] 失败信息必须点名下游症状，避免再次从 `unresolved-major-change` 反推

## Key Decisions

- 只在主库已经采用某产物时才在 worktree 复制该采用：没有 `.codegraph/` 说明用户没选 codegraph，跳过而非代为引入。这保证对下游采用者中立，不新增依赖。
- `bun install` 失败 fail closed：没有依赖树任何验证都跑不了，静默继续只会把成本推到后面。
- `codegraph` 未安装时静默跳过（未采用路径），已安装但 init 失败时 fail closed 并点名症状。
- 幂等：worktree 可能被复用，重复执行必须无副作用。

## Verification

- `bash scripts/check-architecture-sync.sh`
- `bun test tests/contract-worktree-single-publication.test.ts tests/unit/helper-projection-drift.test.ts`
- 端到端：新建一个 contract worktree 后直接跑 `bash scripts/check-architecture-sync.sh`，应当直接绿

## Rollback

纯 shell 与测试改动，`git revert` 即可。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] 在 `start_worktree` 创建/复用 worktree 之后加运行时基线初始化：有 bun 且有 lockfile 时跑 `bun install --frozen-lockfile`；主库已采用 codegraph（存在 `.codegraph/`）且 `codegraph` 在 PATH 时在新 worktree 跑 `codegraph init`
- [ ] 两份配对副本 `scripts/contract-worktree.sh` 与 `assets/templates/helpers/contract-worktree.sh` 保持逐字节一致
- [ ] 加测试钉住 start 路径包含该初始化步骤
- [ ] 失败信息必须点名下游症状，避免再次从 `unresolved-major-change` 反推
