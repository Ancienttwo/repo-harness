# Plan: Make delegated-run dispatch enforce its own collaboration fence

> **Status**: Executing
> **Created**: 20260902-2101
> **Slug**: issue-278-dispatch-effect-fence
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: github:Ancienttwo/repo-harness#278
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md`; after execution revert branch `codex/issue-278-dispatch-effect-fence` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md`
> **Task Review**: `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md`
> **Implementation Notes**: `tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md`
> **Substantive Change SHA256**: `sha256:b10aaaa66e6d66ec01d3248f0db1762f7f8c2168c1b2666628cfde8cbda01305`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: github:Ancienttwo/repo-harness#278
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md`
- Sprint contract: `tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md`
- Sprint review: `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md`
- Implementation notes: `tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md`.

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
- Contract file: `tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md`
- Review file: `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md`
- Implementation notes file: `tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md`; after execution revert branch `codex/issue-278-dispatch-effect-fence` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md`, `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md`, and `tasks/notes/20260902-2101-issue-278-dispatch-effect-fence.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md`; after execution revert branch `codex/issue-278-dispatch-effect-fence` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria
Resolve GitHub issue #278: make the single production delegated-run dispatch effect enforce the collaboration fence itself, so any caller (CLI, C9 canary, MCP/automation, future scheduler) cannot reach the host action for a collaboration run without the live binding/context fence. Success: the acceptance criteria in issue #278 are covered by focused tests, composed CLI and C9 paths execute the fence exactly once, and the full required checks pass.

## Scope
- Compose `fenceCollaborationDispatch()` into the single production dispatch effect (currently `dispatchDelegatedRun()` in `src/effects/`), or wrap it such that the raw unfenced effect is no longer publicly callable outside its module.
- Preserve `delegation_only` behavior (no collaboration binding required) and exact failure codes; fail before any host/provider side effect.
- Remove the redundant pre-step fencing in `src/cli/commands/delegation.ts#dispatchWithCollaborationFence` and `scripts/c9-collaboration-dispatch-runner.ts` once composed-path tests prove exactly one fence execution.
- Update ArchContext flow/capability selectors (`.archcontext/model/flows/flow.collaboration.context-delivery.yaml`, `capability.runtime-harness.collaboration.yaml`) and module docs from the CLI-owned edge to the effect-owned edge.
- Remove the corresponding deferred-goal row from `tasks/todos.md` (line "Move the collaboration dispatch fence from the CLI adapter into the dispatch effect").

## Non-scope
- No second dispatch implementation; no inference of collaboration intent from prompts; no weakening of binding revision, run identity, or context-delivery checks; no compatibility fallback that dispatches after a fence error. Do not touch scheduling, lease, or task identity code (issues #283/#284 run in parallel worktrees).

## P1 Architecture map
Delegation plane: `src/cli/commands/delegation.ts` (CLI adapter) → `dispatchDelegatedRun()` effect → host action/provider. Collaboration fence: `fenceCollaborationDispatch()` in `src/effects/collaboration/` reads the live binding and context-delivery state. C9 canary runner `scripts/c9-collaboration-dispatch-runner.ts` repeats the CLI two-step. ArchContext flow `flow.collaboration.context-delivery.yaml` declares the fence edge on the CLI.

## P2 Concrete trace
CLI `delegation dispatch` → `dispatchWithCollaborationFence` → `fenceCollaborationDispatch(goal, binding)` → refusal codes (`binding_missing`, stale/replaced binding) or pass → `dispatchDelegatedRun()` → provider/host side effect. After the change: any caller → `dispatchDelegatedRun()` → internal fence (delegation_only short-circuits) → side effect. Pressure point: the fence must run before any provider invocation and exactly once on composed paths.

## P3 Decision rationale
The fence is a property of the dispatch operation, not of one call site; C6 built it as a pre-step to keep one dispatch semantics, and moving the fence inside the effect keeps that single semantics while making the guarantee loud rather than silent. Smallest coherent change: fence inside the effect boundary, delete the pre-steps, update the declared ArchContext edge. At 10x callers the first failure is a forgotten pre-step; effect-owned fencing removes that class.

## Task Breakdown
- [x] #1 Add failing tests: direct non-CLI collaboration dispatch without binding fails before host action; same call with exact live binding succeeds; delegation_only dispatches without binding; stale/replaced binding fails closed in CLI and direct-effect fixtures.
- [x] #2 Compose the fence into the single production dispatch effect and make the raw unfenced path non-public.
- [x] #3 Remove redundant pre-step fencing from the CLI adapter and the C9 runner; add composed-path tests asserting exactly one fence invocation and zero provider calls on refusal.
- [ ] #4 Update ArchContext flow/capability selectors and module docs to the effect-owned edge; run architecture projection; remove the fulfilled `tasks/todos.md` ledger row. (Model selectors, flow and relation updated; ledger row removed. The projection returns `human-action-required` for the entrypoint/relation/responsibility change and needs `architecture-projection accept --signal-id <id> --approval-reference <event-id>`, which this contract does not own; module docs are projection outputs of that accepted apply.)
- [x] #5 Run focused tests, `bun run check:type`, root required checks, and record acceptance evidence.

## Verification
bun test --timeout 60000; bun run check:type; bash scripts/check-deploy-sql-order.sh; bash scripts/check-architecture-sync.sh; bash scripts/check-task-sync.sh; repo-harness run check-task-workflow --strict; bun scripts/inspect-project-state.ts --repo . --format text; bun src/cli/index.ts init --repo . --dry-run.

## Annotations

- None.

## Task Breakdown
- [x] #1 Add failing tests: direct non-CLI collaboration dispatch without binding fails before host action; same call with exact live binding succeeds; delegation_only dispatches without binding; stale/replaced binding fails closed in CLI and direct-effect fixtures.
- [x] #2 Compose the fence into the single production dispatch effect and make the raw unfenced path non-public.
- [x] #3 Remove redundant pre-step fencing from the CLI adapter and the C9 runner; add composed-path tests asserting exactly one fence invocation and zero provider calls on refusal.
- [ ] #4 Update ArchContext flow/capability selectors and module docs to the effect-owned edge; run architecture projection; remove the fulfilled `tasks/todos.md` ledger row. (Model selectors, flow and relation updated; ledger row removed. The projection returns `human-action-required` for the entrypoint/relation/responsibility change and needs `architecture-projection accept --signal-id <id> --approval-reference <event-id>`, which this contract does not own; module docs are projection outputs of that accepted apply.)
- [x] #5 Run focused tests, `bun run check:type`, root required checks, and record acceptance evidence.
