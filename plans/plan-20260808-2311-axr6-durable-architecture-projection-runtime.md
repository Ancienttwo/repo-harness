# Plan: AXR6 Durable Architecture Projection Runtime

> **Status**: Executing
> **Created**: 20260808-2311
> **Slug**: axr6-durable-architecture-projection-runtime
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: arch-context:plans/sprints/20260808-1433-archctx-repo-harness-projection-runtime-integration.sprint.md#AXR6
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: durable Stop projection delivery and refresh signal consumption
> **Rollback Surface**: revert the AXR6 merge commit; preserve runtime receipts and dead letters
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md`
> **Task Review**: `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md`
> **Implementation Notes**: `tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: arch-context:plans/sprints/20260808-1433-archctx-repo-harness-projection-runtime-integration.sprint.md#AXR6
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md`
- Sprint contract: `tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md`
- Sprint review: `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md`
- Implementation notes: `tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md`.

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
- Contract file: `tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md`
- Review file: `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md`
- Implementation notes file: `tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert the AXR6 merge commit; preserve runtime receipts and dead letters
- **Verification boundary**: durable Stop projection delivery and refresh signal consumption
- **Review/acceptance boundary**: `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md`, `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md`, and `tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert the AXR6 merge commit; preserve runtime receipts and dead letters

## Captured Planning Output

## Why

AXR5 已经把 `ProjectionRequestV1 -> archctx@0.4.0 -> ProjectionResultV1` 固定为 package-local、typed、fail-closed boundary，但真实 Stop path 仍逐 path 调用旧 architecture queue helper，并在 helper 非零退出后可能删除 pending journal。当前 runtime 没有 durable projection job、retry/dead-letter、typed refresh consumer 或 projection-owned path loop suppression。

## Goal

在 capability authority 仍为 registry、provider 默认 disabled 的前提下，把 enabled provider 接入真实 Stop：PostEdit 只写 durable v2 observation，Stop 把所有 eligible paths 合并为一个 bounded projection job，原子持久化 pending/running/receipt/dead-letter，消费 typed refreshSignals，三次失败后 dead-letter；host-managed Stop timeout 为 150 秒，provider drain 上限保持 120 秒。

## P1 · Architecture Map

- `src/cli/hook/mutation-observed.ts`: hot path producer；写 `PostEditJournalEventV2`，一次性 bounded migration v1 pending files，不执行 projection。
- `src/effects/architecture/projection-jobs.ts`: job-store authority；exclusive lock 下做 pending/running/receipt/dead-letter 原子 transition、attempt count、crash recovery 和 read model。
- `src/effects/architecture/projection-orchestrator.ts`: Stop-time consumer；聚合 changed paths、排除 ArchContext-owned docs/context、capture expected snapshot、执行一个 apply/plan request、按 typed status/error 分类，并在 receipt 后 ack source events。
- `src/effects/architecture/refresh-consumer.ts`: 只消费 `ArchitectureRefreshSignalV1`；以 signalId/idempotencyKey 去重，调用既有 canonical `architecture-queue`、`context-contract-sync`、capability context request writer，并记录 output digests。
- `src/cli/hook/stop-handler.ts`: 在 handoff projection 前调用一个 120 秒 bounded drain，以独立 `projection_failure_gate` 按 advisory/strict surface readiness；既有 `freshness_gate` 只保留 merge/drift 语义。
- `src/cli/commands/architecture-projection.ts`: `drain` 改为 job orchestrator read/execute lane，不再是 plan alias。
- `src/cli/hook/session-context.ts`: SessionStart 显示 pending/running/dead-letter read model。
- `src/cli/installer/managed-entries.ts`: 只有 `Stop.default` timeout=150；所有其他 route=30；installer replacement 仍保留 sibling user hooks。

Out of scope: 10-doc adoption、capability authority cutover、npm publish、registry dependency pin、strict-by-default policy。

## P2 · Concrete Trace

`PostToolUse.edit` -> `runMutationObserved` -> atomic v2 pending observation -> `Stop.default` -> bounded v1 migration -> scan all v2 observations -> exclude projection-owned paths -> create/reuse one idempotent job -> pending→running -> `captureArchitectureProjectionSnapshot` -> package-local `runArchitectureProjection` -> validate result/snapshot/receipt -> consume each refresh signal exactly once through canonical writers -> write projection receipt -> ack source journal events.

Failure path: spawn exit/signal/timeout、corrupt JSON、stale snapshot、refresh partial failure leave the job/event durable and increment attempt；attempt 1–2 return pending；attempt 3 moves the exact job/event evidence to dead-letter。Crash after apply is recovered from running state without reclassifying unproven success as receipt. Projection-owned output paths produce no new eligible job.

## P3 · Decision Rationale

- Job store, not Stop process lifetime, owns delivery semantics；the event is acked only after durable terminal receipt.
- v1 compatibility exists only inside an explicit bounded rewrite migration；the consumer itself accepts v2 only, avoiding permanent dual semantic authority.
- Typed refreshSignals are authoritative；repo-harness does not infer “major” from paths/diff size/Markdown.
- One aggregated request per Stop bounds cold handshake and CodeGraph sync cost at 10x edit volume.
- 150s host timeout provides 30s control-plane margin over the 120s provider bound without widening non-Stop hooks.

## Task Breakdown

- [x] Freeze failing tests for 10-path coalescing, source-event ack timing, three-attempt retry/dead-letter, crash recovery and owned-path loop suppression.
- [x] Introduce v2 journal schema plus bounded v1 rewrite migration; keep PostEdit hot path one atomic write.
- [x] Implement locked atomic projection job store and read model.
- [x] Implement Stop orchestrator and typed refresh consumer with idempotency receipts/output digests.
- [x] Wire Stop, manual drain and SessionStart pending/dead-letter surface with advisory/strict policy behavior.
- [x] Set managed Stop timeout=150 for Claude/Codex while non-Stop remains 30 and sibling hooks survive update.
- [x] Run focused chaos/installer/host tests, type/helper gates, then full `bun run check:ci` and real installed Stop readback.

## Verification

- `bun test tests/mutation-observed.test.ts tests/stop-handler.test.ts tests/architecture-projection-orchestration.test.ts`
- `bun test tests/install-profiles.test.ts tests/hook-runtime-characterization.test.ts tests/session-context.test.ts`
- `bun run check:type`
- `bun run check:helpers`
- `bun run check:ci`
- disposable installed-host test holds Stop beyond 30 seconds and returns before 150 seconds with durable receipt.

## Exit Criteria

- Ten eligible changed paths produce one provider process and one receipt.
- Exit 1/signal/timeout/stale snapshot never loses source events; the third failed attempt produces a durable dead-letter record.
- Duplicate signal and projection-owned writes are idempotent and do not create a second projection job.
- Stop.default is 150 seconds for both hosts; all other managed routes remain 30 seconds; sibling user hooks survive update.
- SessionStart and `architecture-projection drain --json` accurately expose pending/dead-letter state；`retry-dead-letter` 提供不删除 source evidence 的显式恢复出口。
- Provider disabled preserves existing runtime behavior and performs no projection subprocess.

## Rollback

降级前先在 AXR6 runtime 把 provider 设为 disabled、执行 `architecture-projection drain --json` 并确认 pending journal 为零，再 revert AXR6 merge commit。因为旧 runtime 不理解 v2 observation，带 pending v2 queue 的直接降级不是支持状态。receipts/dead-letter files 继续作为 operational evidence 保留，不做破坏性删除。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze failing tests for 10-path coalescing, source-event ack timing, three-attempt retry/dead-letter, crash recovery and owned-path loop suppression.
- [x] Introduce v2 journal schema plus bounded v1 rewrite migration; keep PostEdit hot path one atomic write.
- [x] Implement locked atomic projection job store and read model.
- [x] Implement Stop orchestrator and typed refresh consumer with idempotency receipts/output digests.
- [x] Wire Stop, manual drain and SessionStart pending/dead-letter surface with advisory/strict policy behavior.
- [x] Set managed Stop timeout=150 for Claude/Codex while non-Stop remains 30 and sibling hooks survive update.
- [x] Run focused chaos/installer/host tests, type/helper gates, then full `bun run check:ci` and real installed Stop readback.
- [x] Close external Claude review findings: decouple non-architecture effects from source ack, enforce one running job, canonicalize job identity, honor typed refresh no-op semantics, and add independent failure gate plus dead-letter retry.
- [x] Harden review/runtime edges: parse Markdown finding headings, bound Fable-to-Opus fallback to explicit capacity signals, ignore `.ai/harness/**` in snapshots, recover stale PID reuse, and preserve original transition failures.
- [x] Close second review pass: bind dead letters to source-event overlap, persist preflight failures, verify claim ownership, checkpoint refresh actions, consume manual-drain acknowledgements, and prove 30-second kill then attempt-2 recovery under the 150-second lane.
- [x] Close third review pass: rotate acknowledged delivery identities, lock journal coalescing/ack, validate disabled policy without spawning, enforce one absolute drain deadline, fail closed on non-terminal results, and recover receipt-before-running-cleanup crashes.
- [x] Prove the cross-repository snapshot contract by excluding `.ai/harness/**` from the ArchContext repo-harness projection digest (`arch-context@9c2ae39`).
