# Plan: Capability boundary convergence + ArchContext export bridge

> **Status**: Executing
> **Created**: 20260706-0211
> **Slug**: archcontext-boundary-bridge
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Slice-level capability tests + resolver validate/match parity + scaffold-parity/workflow-contract tests + full required checks before ship
> **Rollback Surface**: Before execution remove the plan file; after execution revert branch codex/archcontext-boundary-bridge (no data migration, no downstream-irreversible surface)
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md`
> **Task Review**: `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md`
> **Implementation Notes**: `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`

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

- Active plan: `plans/plan-20260706-0211-archcontext-boundary-bridge.md`
- Sprint contract: `tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md`
- Sprint review: `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md`
- Implementation notes: `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260706-0211-archcontext-boundary-bridge.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260706-0211-archcontext-boundary-bridge.md`.

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
- Contract file: `tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md`
- Review file: `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md`
- Implementation notes file: `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260706-0211-archcontext-boundary-bridge.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove the plan file; after execution revert branch codex/archcontext-boundary-bridge (no data migration, no downstream-irreversible surface)
- **Verification boundary**: Slice-level capability tests + resolver validate/match parity + scaffold-parity/workflow-contract tests + full required checks before ship
- **Review/acceptance boundary**: `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260706-0211-archcontext-boundary-bridge.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md`, `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md`, and `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove the plan file; after execution revert branch codex/archcontext-boundary-bridge (no data migration, no downstream-irreversible surface)

## Captured Planning Output

# Capability boundary convergence + ArchContext export bridge

决策来源:2026-07-06 双轨评审(Opus deep-reasoner + Codex 盲评,独立收敛)。结论:现阶段不把 capability filing 接入 archctx 运行时;`capabilities.json` 保持权威源。本 work package 只做两件可回滚的准备:仓库内部收敛 + 只读 export 桥。gating 条件与覆核修正已记入 `docs/researches/20260705-archcontext-capability-filing-handover.md` §7。

## Scope(两个 slice)

### Slice 1:resolver 单点收敛(纯内部重构,零行为变化)

现状:`Capability` 类型与 registry 读路径存在三份副本,互不 import:

- `scripts/capability-resolver.ts:6-26`(类型)+ `findMatch`(:363-418,longest-prefix 热路径)
- `scripts/capability-config.ts:12`(重复类型)+ :253-267 直读 registry
- `src/cli/commands/capability-context.ts:11`(重复类型)+ :159-168 直读 + `findCapabilityByPath`(:242,重复实现 findMatch)

改动:

1. `capability-resolver.ts` 成为 `Capability` 类型与 `readRegistry` 的唯一导出点。
2. `capability-config.ts`、`capability-context.ts` 改为 import resolver 的类型与读入口;删除 `findCapabilityByPath` 重复实现,改调 resolver `findMatch`。
3. 同步更新 `assets/templates/helpers/capability-resolver.ts`、`assets/templates/helpers/capability-config.ts` 模板副本,保持 scaffold parity。

硬约束:匹配契约不得变——`longest-prefix; same-length ambiguity fails`(`.ai/harness/policy.json:76` 固化)。任何输入下 match 结果必须与改前逐字节一致。

### Slice 2:archcontext-boundaries export + parity 测试(只读桥,零 archctx 运行时依赖)

1. `capability-resolver.ts` 新增 `export --format archcontext-boundaries-v1` 子命令:从 `.ai/context/capabilities.json`(当前 7 个 capability)生成稳定 JSON 边界包,字段映射按 research doc §2 移交表(id→stableId `capability.<domain>.<name>`、prefixes→source.include、lsp_profile/verification_hints→extensions)。
2. Vendor 一份 node/v1 capability 相关子集 JSON Schema 到 `tests/fixtures/`(或现有 fixture 约定位置),文件头带溯源注释:source repo `Ancienttwo/arch-context` + commit + 抓取日期。
3. Parity 测试:同一组代表性路径,legacy `findMatch` 与 exported boundary 匹配结果一致;export 输出可通过 vendored schema 校验;schemaVersion pin 断言(schema 变动时测试失败,提示重新对账而非静默漂移)。

## EXECUTION_BOUNDARY(Non-Goals,缺席即禁区)

- 不加 `capability_source` policy 开关,不写 archcontext file-source adapter。
- 不改 /Users/kito/Projects/arch-context 任何文件。
- 不引入 archctx CLI/daemon/MCP 的任何运行时或安装依赖(本仓与下游模板都不加)。
- 不停用、不镜像、不重排 `capabilities.json`;workflow-contract requiredFiles 不动。
- hook 行为不动:热路径保持 fail-open/advisory;严格失败仅存在于显式 gate。
- 不做 external-tooling.md 的 archctx readiness 条目(留到 gating 条件满足后)。

## Verification

Slice 级:

```
bun test tests/capability-resolver.test.ts tests/capability-config.test.ts tests/cli/capability-context.test.ts
bun scripts/capability-resolver.ts validate --format text
bun scripts/capability-resolver.ts match --path scripts/inspect-project-state.ts --format json   # 结果与改前一致
bun test tests/scaffold-parity.test.ts tests/workflow-contract.test.ts
```

Ship 前全量 required checks:

```
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

## Rollback

执行前:删除本 plan 文件即可。执行后:revert `codex/archcontext-boundary-bridge` worktree 分支;两个 slice 均无数据迁移、无下游不可逆面。

## 后续(不在本包内)

重开 Stage 2 讨论的 gating 条件(记录于 research doc §7):daemon-optional `archctx resolve --path`;`@archcontext/contracts` 干净发 npm 且 schema 稳定;projection 支持 `agent-context` targetType。三者齐备前不追加任何 archctx 依赖。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: Capability boundary convergence + ArchContext export bridge
  - [x] Slice 1: converge `Capability`/`ContractFiles`/`CapabilityRegistry` types + `readRegistry`/`findMatch` onto `scripts/capability-resolver.ts`; `capability-config.ts` and `capability-context.ts` import instead of duplicating; `findCapabilityByPath` now delegates to `findMatch` while preserving its own root/file-prefix fallback. Byte-identical `match --path scripts/inspect-project-state.ts --format json` baseline captured before/after (see notes file).
  - [x] Slice 1 template parity: `assets/templates/helpers/capability-resolver.ts` and `capability-config.ts` mirrored, `diff` confirms 0 differences.
  - [x] Slice 2: `capability-resolver.ts export --format archcontext-boundaries-v1` subcommand added (deterministic `id`-sorted output).
  - [x] Slice 2: vendored capability-relevant subset of `archcontext.node/v1` schema at `tests/fixtures/archcontext/architecture-node.subset.schema.json` with source-repo/commit/date provenance.
  - [x] Slice 2: parity + schema-validation + schemaVersion-pin tests added at `tests/capability-archcontext-export.test.ts`.
  - [x] Contract `allowed_paths` reconciled to add the two `scripts/` files and their two `assets/templates/helpers/` mirrors the plan explicitly names (see contract file); no other path widened.
