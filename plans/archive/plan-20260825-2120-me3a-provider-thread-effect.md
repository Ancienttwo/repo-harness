# Plan: ME-3A Provider Thread Effect Adapter

> **Status**: Archived
> **Created**: 20260825-2120
> **Slug**: me3a-provider-thread-effect
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: At-most-once Codex action admission, restart/lost-ack reconciliation and unchanged control-plane authorities
> **Rollback Surface**: Provider effect schemas/store/CLI/MCP/ArchContext plus idempotent ME-1C delivery projection
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md`
> **Task Review**: `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md`
> **Implementation Notes**: `tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md`

## Agentic Routing
- Selected route: parent-agent
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260825-2120-me3a-provider-thread-effect.md`
- Sprint contract: `tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md`
- Sprint review: `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md`
- Implementation notes: `tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260825-2120-me3a-provider-thread-effect.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260825-2120-me3a-provider-thread-effect.md`.

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
- Contract file: `tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md`
- Review file: `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md`
- Implementation notes file: `tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260825-2120-me3a-provider-thread-effect.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Provider effect schemas/store/CLI/MCP/ArchContext plus idempotent ME-1C delivery projection
- **Verification boundary**: At-most-once Codex action admission, restart/lost-ack reconciliation and unchanged control-plane authorities
- **Review/acceptance boundary**: `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260825-2120-me3a-provider-thread-effect.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md`, `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md`, and `tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Provider effect schemas/store/CLI/MCP/ArchContext plus idempotent ME-1C delivery projection

## Captured Planning Output

## Decision Summary

Deliver ME-3A as a Codex-first, host-executed effect bridge over ME-1C rather than a repo-harness-owned Agent runtime. The control plane persists an exact immutable intent and a closed observation chain, then returns one bounded Codex action for the host to execute. Once an effect is marked started, every unknown outcome is reconcile-only: neither the store, CLI nor MCP may emit a second Provider action for that intent.

## P1 Architecture Map

- `src/core/engineers/module-message.ts` and `src/effects/engineers/module-inbox.ts` remain ME-1C message authority. ME-3A reads one persisted event/receipt and may publish only an idempotent delivery observation after positive Provider evidence.
- `src/core/engineers/provider-thread-effect.ts` owns closed Codex capability, intent, action and observation schemas plus canonical bytes/digests and legal transitions.
- `src/effects/engineers/provider-thread-effect-store.ts` owns the git-common-dir intent/observation journal, current projection, per-effect locks, Binding revalidation and crash/restart reconciliation.
- `src/cli/commands/engineer.ts` exposes local operator `thread-effect capability|prepare|start|observe|status` commands. `start` is the only command that can emit a Provider action, and only on the first `intent_persisted -> effect_started` transition.
- Restricted Engineer MCP gains read-only status/capability projection for the authenticated current Engineer. It cannot prepare/start/observe an effect or mutate Message, Task, Lease, Publication or Acceptance.
- A new `runtime-harness/provider-thread-effects` ArchContext capability owns this adapter boundary. ME-1B may later consume its read model; no UI or Board state is added here.
- Provider query loops, tool parsing, transcript/history persistence, compaction, model gateway, automatic Thread create/archive, daemon, automatic fallback and delegated runs are out of scope.

## P2 Concrete Trace

1. The local Program Orchestrator supplies one persisted ME-1C `message_id`, current Binding fences, a stable idempotency key and operation `send|resume|observe|stop`.
2. `prepare` reads the exact ModuleMessage event and pending receipt, revalidates the current EngineerBinding and recorded Codex capability observation, derives the operation fingerprint/effect ID, and persists the immutable intent plus `intent_persisted` current state under one effect lock.
3. `start` repeats the Message/Binding/capability checks, atomically appends `effect_started`, and returns exactly one closed Codex action containing the bound host/thread, bounded persisted payload and effect correlation fields. A repeated `start` never returns an action; it returns `reconciliation_required` or the terminal state.
4. The host invokes the named Codex operation outside repo-harness. Known success/failure is submitted as exact Provider evidence; an acknowledgement loss or process restart is recorded as `reconciliation_required`.
5. `observe` validates the exact Thread/turn/user-message/assistant-message tuple frozen by the Runtime Admission Canary. A positive send correlation appends `observed_success` and idempotently publishes the matching ME-1C delivery observation. Missing or ambiguous correlation remains `reconciliation_required`; it does not acknowledge the ModuleMessage.
6. Replaying the same observation bytes is idempotent. Conflicting evidence, stale Binding, unsupported capability, invalid transitions and duplicate start attempts fail closed.
7. Tests snapshot TaskMessage, Lease and Fleet projection inputs before/after runtime-only effects and prove zero byte change.

## P3 Design Decision

The host already owns Codex App Server transport and exact Thread/turn facts. Reimplementing JSON-RPC streaming, history or a query loop in repo-harness would create a second Provider runtime and violate the approved control-plane boundary. A closed action/evidence bridge is the smallest coherent production adapter: repo-harness owns intent idempotency and observations; the host owns the Provider call. At 10x scale the first pressure point is linear per-Engineer effect listing, so the store keys intents by effect ID and maintains only deterministic per-effect current records; no daemon or secondary index is added.

## Task Breakdown

- [x] Promote the ME-3A PRD to Approved with the canary-frozen Codex correlation and exact production schemas.
- [x] Implement closed capability, intent, action, observation and transition schemas with canonical byte/digest tests.
- [x] Implement the git-common-dir effect journal, crash-safe current projection, Binding/ME-1C validation and at-most-once action admission.
- [x] Add idempotent external delivery-observation publication to ME-1C without changing TaskMessage wire bytes.
- [x] Add local operator CLI commands and restricted Engineer read-only MCP projections.
- [x] Add fault matrix for persistence-before-action, duplicate start, lost acknowledgement, restart reconciliation, Binding rotation, unsupported capability, null usage and authority-byte stability.
- [x] Add ArchContext capability/workstream artifacts and run focused plus complete repository verification.

## Verification

- Focused schema/store/CLI/MCP tests including a canary-shaped Codex lost-ack fixture.
- Existing TaskMessage and ME-1C byte goldens.
- `bun run check:type` and `bun test --timeout 60000`.
- deploy SQL, architecture sync, task sync, strict workflow, project-state inspection and init dry-run.
- Exact-subject Change Assessment and typed AcceptanceReceipt before merge.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Promote the ME-3A PRD to Approved with the canary-frozen Codex correlation and exact production schemas.
- [x] Implement closed capability, intent, action, observation and transition schemas with canonical byte/digest tests.
- [x] Implement the git-common-dir effect journal, crash-safe current projection, Binding/ME-1C validation and at-most-once action admission.
- [x] Add idempotent external delivery-observation publication to ME-1C without changing TaskMessage wire bytes.
- [x] Add local operator CLI commands and restricted Engineer read-only MCP projections.
- [x] Add fault matrix for persistence-before-action, duplicate start, lost acknowledgement, restart reconciliation, Binding rotation, unsupported capability, null usage and authority-byte stability.
- [x] Add ArchContext capability/workstream artifacts and run focused plus complete repository verification.
