# Plan: AXR5 ArchContext provider, node v2, and readiness

> **Status**: Archived
> **Created**: 20260808-2015
> **Slug**: axr5-archctx-provider-node-v2-readiness
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: arch-context:plans/sprints/20260808-1433-archctx-repo-harness-projection-runtime-integration.sprint.md#AXR5
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: package-local provider and atomic node-v2 consumer migration
> **Rollback Surface**: Before execution remove `plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md`; after execution revert branch `codex/axr5-archctx-provider-node-v2-readiness` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md`
> **Task Review**: `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md`
> **Implementation Notes**: `tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: arch-context:plans/sprints/20260808-1433-archctx-repo-harness-projection-runtime-integration.sprint.md#AXR5
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md`
- Sprint contract: `tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md`
- Sprint review: `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md`
- Implementation notes: `tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md`.

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
- Contract file: `tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md`
- Review file: `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md`
- Implementation notes file: `tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md`; after execution revert branch `codex/axr5-archctx-provider-node-v2-readiness` or the explicitly reviewed diff.
- **Verification boundary**: package-local provider and atomic node-v2 consumer migration
- **Review/acceptance boundary**: `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md`, `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md`, and `tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md`; after execution revert branch `codex/axr5-archctx-provider-node-v2-readiness` or the explicitly reviewed diff.

## Captured Planning Output

## Why

ArchContext 已经提供 projection protocol、repo-harness layout/adoption、dirty-worktree/CodeGraph snapshot、node/v2 semantic diagrams 与 refresh signal，但 repo-harness 仍只有 capability node reader，没有固定版本 provider、手工 projection 命令或正交 readiness。PATH 上的任意 `archctx` 不能成为 agent runtime authority。

## Goal

在 provider 默认 disabled 的前提下，加入 package-local、feature-handshaken、fail-closed 的 ArchContext projection provider；同时原子迁移 repo-harness 的 capability reader/exporter/self-host nodes 到 `archcontext.node/v2`，使手工 `architecture-projection check|plan|apply|status|drain` 能返回受验证的 typed result，而不触碰 Stop 自动编排。

## P1 · Architecture Map

- `src/core/architecture/projection.ts`: repo-harness 自有的纯 protocol/domain types、policy/readiness 与 invariants；不依赖 PATH 或外部进程。
- `src/effects/architecture/archctx-provider.ts`: 唯一 subprocess boundary；只能从 consumer 安装根解析 `node_modules/.bin/archctx`，先执行 `capabilities --json`，再执行 docs lane。
- `src/cli/commands/architecture-projection.ts` + `src/cli/index.ts`: 手工 command lane；Commander 只做参数/I/O，domain/effect 保持可测试。
- `src/core/capabilities/registry.ts`: capability source 唯一 reader，切为 node/v2；v1 明确拒绝，不保留 dual reader。
- `scripts/capability-resolver.ts` 与 `assets/templates/helpers/capability-resolver.ts`: canonical helper projection，同步 node/v2 exporter；目录 prefix 输出 `/**`。
- `.archcontext/model/nodes/*.yaml`: self-host authority 一次性迁移到 v2 base fields，保证 reader 切换同 commit 可用。
- policy seeders、status/effective-state readiness: `capability_source`、`projection_provider`、code-facts、apply 四个 state 分开；provider disabled 不改变现有 hook/runtime。

Out of scope: Stop journal/drain/retry/dead-letter、自动 refresh consumer、10-doc adoption、npm publish、registry exact dependency 与 final authority cutover。

## P2 · Concrete Trace

`repo-harness architecture-projection <mode>` → parse repo policy → resolve package-local archctx → `archctx capabilities --json` → validate exact package/protocol/renderer/features → build expected worktree request → map mode to `archctx docs drift|plan|apply|adopt --profile repo-harness/v1` → validate envelope/snapshot/receipt identity → print typed JSON and exit by status。

Failure boundaries: disabled provider returns explicit disabled status without spawning；missing local binary、0.3.x/feature mismatch、PATH-only binary、invalid/corrupt JSON、snapshot mismatch、timeout and v1 node all fail closed。AXR5 manual lane does not ack mutation events and does not retry.

## P3 · Decision Rationale

- package-local resolution protects the cross-repo version/protocol invariant and makes PATH conflict irrelevant。
- provider and capability authority are orthogonal；disabled is a configured state, not a fallback reader。
- v2 reader/exporter/self-host nodes land atomically because a long-lived v1/v2 union would recreate dual semantic authority。
- repo-harness duplicates only the stable wire type/invariant boundary；runtime package dependency and registry pins wait for AXR8，AXR5–AXR7 use integrity-verified disposable tarballs。
- 10x first pressure is repeated cold handshake；cache key must include package version/tarball integrity/protocol feature set, but AXR5 keeps one-process manual invocation and leaves durable caching to AXR6 orchestration。

## Task Breakdown

1. Add failing tests for package-local resolution, capability handshake, disabled state, corrupt/mismatched output and manual command status mapping。
2. Implement pure projection protocol/policy/readiness types and validation。
3. Implement bounded package-local subprocess provider; never resolve `archctx` via PATH。
4. Add `architecture-projection check|plan|apply|status|drain`; `drain` is manual single-run alias only until AXR6 durable queue exists。
5. Migrate canonical node parser/exporter/helper projection to v2 and directory `/**` semantics；reject v1。
6. Migrate all ten self-host nodes to v2 base fields without changing capability ownership/prefix/contract/workstream meaning。
7. Update policy seeders/readiness/status documentation and tests，keeping projection provider disabled by default。
8. Add clean-room integration script: archive arch-context AXR4 revision, stage both packages as 0.4.0, pack with sha512 integrity, install through temporary `file:` pins with registry disabled, inject conflicting PATH binary, and run provider suite。No `file:` dependency may be committed。

## Verification

- `bun test tests/architecture-projection-provider.test.ts tests/cli/status.test.ts tests/state/operation-readiness.test.ts tests/capability-archcontext-export.test.ts`
- `bun test tests/capabilities/registry.test.ts tests/capability-archcontext-source.test.ts tests/capability-resolver.test.ts tests/unit/helper-projection-drift.test.ts`
- `bun run check:type`
- `bun run check:helpers`
- `bun src/cli/index.ts architecture-projection status --json`
- clean-room tarball/provider readback with recorded source revision, sha512 and integrity；network registry disabled。
- `bun test`

## Exit Criteria

- provider disabled preserves current effective state and performs zero subprocess calls。
- enabled provider uses only package-local 0.4.0 and exact features，PATH conflict cannot affect result。
- request/result identity, snapshot and receipt validation fail closed。
- canonical parser/helper/exporter accept node/v2 and reject node/v1；all ten self-host nodes resolve exactly as before。
- no committed `file:` dependency, no npm publication, no Stop orchestration changes。

## Rollback

One commit boundary: disable/remove projection provider lane and revert the atomic v2 reader/exporter/self-host migration together before AXR6. Runtime provider is disabled by default, so rollback does not need mutation journal migration。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: AXR5 ArchContext provider, node v2, and readiness
