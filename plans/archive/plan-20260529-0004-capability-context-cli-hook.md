# Plan: Capability Context CLI 与 Hook 队列方案

> **Status**: Archived
> **Created**: 20260529-0004
> **Slug**: capability-context-cli-hook
> **Planning Source**: user-approved-plan
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/capability-context-cli-hook.contract.md`
> **Sprint Review**: `tasks/reviews/capability-context-cli-hook.review.md`
> **Implementation Notes**: `tasks/notes/capability-context-cli-hook.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260529-0004-capability-context-cli-hook.md`
- Sprint contract: `tasks/contracts/capability-context-cli-hook.contract.md`
- Sprint review: `tasks/reviews/capability-context-cli-hook.review.md`
- Implementation notes: `tasks/notes/capability-context-cli-hook.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/capability-context-cli-hook.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260529-0004-capability-context-cli-hook.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260529-0004-capability-context-cli-hook.md`.

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
- Contract file: `tasks/contracts/capability-context-cli-hook.contract.md`
- Review file: `tasks/reviews/capability-context-cli-hook.review.md`
- Implementation notes file: `tasks/notes/capability-context-cli-hook.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/capability-context-cli-hook.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260529-0004-capability-context-cli-hook.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/capability-context-cli-hook.contract.md`, `tasks/reviews/capability-context-cli-hook.review.md`, and `tasks/notes/capability-context-cli-hook.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/capability-context-cli-hook.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260529-0004-capability-context-cli-hook.md`; after execution revert branch `codex/capability-context-cli-hook` or the generated task artifacts

## Captured Planning Output

# Capability Context CLI 与 Hook 队列方案
## Summary
- 结论：选 **B + C 实验旗标**。默认不在 `PostEdit` 里 spawn agent；hook 只写队列，`SessionStart` 提醒当前 agent 处理。需要节省主会话 context 时，显式跑 `--auto-fill-positioning` 让 sidecar agent 产出小 JSON，再由 CLI 渲染。
- spawn agent 能节省的是**主会话上下文**，不是 token/quota/时间；放进 hook 会变成隐性成本和不稳定 runtime 依赖，所以不作为默认链路。
- 这是一个超过 8 文件的单 PR，无新 service。核心入口在 [src/cli/index.ts](/Users/ancienttwo/Projects/agentic-dev/src/cli/index.ts)、[scripts/capability-resolver.ts](/Users/ancienttwo/Projects/agentic-dev/scripts/capability-resolver.ts)、[.ai/hooks/post-edit-guard.sh](/Users/ancienttwo/Projects/agentic-dev/.ai/hooks/post-edit-guard.sh)。
## P1/P2/P3
- **P1 Map**：现有权威边界是 `.ai/context/capabilities.json` + `capability-resolver`；hook runtime 是 `.ai/hooks`；`context-contract-sync.sh` 只维护 architecture contract block；CLI 是新的语义 context writer。
- **P2 Trace**：`PostEdit` -> `architecture-drift.sh record` -> append architecture event with `spawn_recommended` -> `capability-context request` 写 `.ai/harness/capability-context/requests.jsonl` -> `SessionStart` 注入 pending 摘要 -> 当前 agent 跑 `repo-harness capability-context sync --pending --apply`。
- **P3 Decision**：保持 hook 同步、轻量、零 LLM 调用；把 LLM 生成降级为显式 `--auto-fill-positioning`，失败时仍可用手工 manifest 或 registry 默认渲染。
## Key Changes
- 新增 CLI：`repo-harness capability-context`
  - `status --repo . [--json]`：列出 capabilities、目标 `AGENTS.md/CLAUDE.md` 状态、pending request、manifest 覆盖情况。
  - `request --path <changed-file> [--from-latest-architecture-event] [--json]`：按 longest-prefix 解析 capability，追加幂等 queue event。
  - `sync --capability <id>|--path <path>|--pending --apply|--dry-run [--auto-fill-positioning] [--source-map-manifest <path>] [--json]`：渲染/更新 paired local context files。
- 目标路径规则固定：对每个 capability 用 `prefixes[0]`；若它是文件则用 `dirname(prefixes[0])`；根目录保持根 `AGENTS.md/CLAUDE.md`；非根 capability 将 registry `contract_files` 规范化到该目录。
- 新增手工 fallback manifest：`.ai/context/capability-source-map.json`
  - schema：`version` + `capabilities.<id>.positioning` + `source_map[{label,path,role}]` + `refresh_hints[]`。
  - manifest 优先，其次 `--auto-fill-positioning` 写回 manifest，最后用 registry/architecture/workstream/verification hints 生成最小可用 block。
- 新增 controlled block：`<!-- BEGIN CAPABILITY CONTEXT --> ... <!-- END CAPABILITY CONTEXT -->`；保留人工内容，继续让现有 architecture block 独立维护。
- `.ai/harness/capability-context/` 是 runtime queue/draft 状态，加入 `.gitignore`，不作为产品交付文件。
## Not Building
- 不做 `PostEdit` 直接后台 spawn。
- 不从 `apps/*`、`packages/*`、`services/*` 物理布局猜 capability。
- 不让 hook 写大段语义文档；hook 只记录请求和注入提示。
- 不替换 `context-contract-sync.sh`；它继续只维护 architecture contract block。
## Test Plan
- `bun test tests/cli/capability-context.test.ts`：覆盖 `status/request/sync`、路径派生、manifest 优先级、dry-run/apply、paired 文件一致。
- `bun test tests/hook-runtime.test.ts`：覆盖 architecture drift 后写 pending queue、SessionStart 注入 pending 摘要、无 queue 时静默。
- `bun test tests/capability-resolver.test.ts tests/capability-config.test.ts`：确认 longest-prefix、root fallback、registry contract_files 规范化不破坏现有能力。
- 全量 gate：`bun test`、`bash scripts/check-task-sync.sh`、`bash scripts/check-task-workflow.sh --strict`、`bash scripts/migrate-project-template.sh --repo . --dry-run`。
## Assumptions
- 当前脏树属于并行工作面；实现时应开隔离 worktree，不吸收无关改动。
- 首个 PR 做全套 CLI + hook queue + SessionStart + manifest fallback；不拆成假阶段，因为单独只做 hook queue 对用户不可用。
- `--auto-fill-positioning` 只在显式命令下消费 agent quota；默认路径完全可离线、可审计、可回滚。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: Capability Context CLI 与 Hook 队列方案
