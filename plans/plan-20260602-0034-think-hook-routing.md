# Plan: Think Hook Routing

> **Status**: Executing
> **Created**: 20260602-0034
> **Slug**: think-hook-routing
> **Planning Source**: waza-think
> **Orchestration Kind**: waza-think
> **Source Ref**: (none)
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/20260602-0034-think-hook-routing.contract.md`
> **Sprint Review**: `tasks/reviews/20260602-0034-think-hook-routing.review.md`
> **Implementation Notes**: `tasks/notes/20260602-0034-think-hook-routing.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260602-0034-think-hook-routing.md`
- Sprint contract: `tasks/contracts/20260602-0034-think-hook-routing.contract.md`
- Sprint review: `tasks/reviews/20260602-0034-think-hook-routing.review.md`
- Implementation notes: `tasks/notes/20260602-0034-think-hook-routing.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260602-0034-think-hook-routing.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260602-0034-think-hook-routing.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260602-0034-think-hook-routing.md`.

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
- Contract file: `tasks/contracts/20260602-0034-think-hook-routing.contract.md`
- Review file: `tasks/reviews/20260602-0034-think-hook-routing.review.md`
- Implementation notes file: `tasks/notes/20260602-0034-think-hook-routing.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260602-0034-think-hook-routing.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260602-0034-think-hook-routing.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/20260602-0034-think-hook-routing.contract.md`, `tasks/reviews/20260602-0034-think-hook-routing.review.md`, and `tasks/notes/20260602-0034-think-hook-routing.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260602-0034-think-hook-routing.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260602-0034-think-hook-routing.md`; after execution revert branch `codex/think-hook-routing` or the generated task artifacts

## Captured Planning Output

## Summary
Integrate explicit Waza think prompts into the existing UserPromptSubmit planning bridge without adding a new hook route, host adapter entry, or automatic model execution.

## Scope
- Route explicit `/think`, `$think`, and leading `[$think](...)` prompts to Waza `/think` advisory output before the generic agent workflow `/health` hint.
- Preserve existing Draft plan creation and pending orchestration behavior through `prompt-guard.sh`, `ensure-task-workflow.sh`, and `workflow_write_pending_orchestration`.
- Strengthen Stop planning completeness guidance so pending `/think` planning output is checked for execution-ready structure before the agent stops.
- Mirror changed hook behavior into generated assets and cover it with focused hook runtime tests.

## Non-Scope
- Do not add a new route to `src/cli/hook/route-registry.ts`.
- Do not change host adapters in `~/.codex/hooks.json` or `~/.claude/settings.json`.
- Do not auto-run Claude, Codex, Waza, or any external model from hooks.
- Do not treat a `$think` draft as an Approved execution plan.
- Do not generate contract/review/worktree artifacts until the plan is approved.

## P1 Map
- Host adapters bind `UserPromptSubmit.default` to repo-harness hook runtime.
- `src/cli/hook/route-registry.ts` owns route tuples; `UserPromptSubmit.default` remains mapped to `prompt-guard.sh`.
- `src/cli/hook/runtime.ts` dispatches only for opt-in repos and executes repo-local `.ai/hooks/*` scripts.
- `.ai/hooks/prompt-guard.sh` owns planning intent detection, route advisory, Draft plan creation, and execution gating.
- `.ai/hooks/lib/workflow-state.sh` owns pending orchestration state under `.ai/harness/planning/pending.json`.
- `scripts/capture-plan.sh` owns plan capture into `plans/` and active markers.
- `scripts/plan-to-todo.sh` owns Approved plan projection into execution scaffolding.

## P2 Trace
`[$think](...)` user prompt reaches `UserPromptSubmit.default`, runs `prompt-guard.sh`, strips injected `<skill>` context, classifies explicit think planning intent, emits Waza `/think` advisory, creates an independent Draft plan with `scripts/ensure-task-workflow.sh --new-plan`, writes pending orchestration as `kind=waza-think`, keeps later planning follow-ups in `PlanDiscussionGate`, and only moves into implementation after Codex captures an Approved plan via `capture-plan.sh --status Approved --execute`.

## P3 Decision Rationale
The smallest coherent change is advisory ordering plus tests. The current architecture already has the correct source-of-truth split: host planning is transient, `pending.json` is a bridge, and `plans/` plus `.ai/harness/active-plan` remain authoritative. Adding a route or auto-running a skill would duplicate state ownership and create another trust/update surface.

## Fragile Assumption
This assumes explicit `$think` prompts should be treated as planning even when the subject mentions hooks, workflow, Codex, or Claude. If that does not hold, the `/health` route would be more appropriate, but it would conflict with the user's explicit skill invocation.

## Rejected Alternative
Add a new hook route for Waza think. Rejected because route tuples are public adapter contracts; changing them would force host adapter migration and Codex trust churn for a behavior that can be expressed inside the existing `prompt-guard.sh` route.

## Verification
- `bun test tests/hook-runtime.test.ts tests/cli/prompt-guard-decision.test.ts`
- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`

## Rollback
Revert the branch or restore the changed hook, asset mirror, and test files. No external state, credentials, database, or provider resources are changed.

## Task Breakdown
- [x] Adjust `emit_waza_route_hint` so explicit think planning emits Waza `/think` before generic `/health`.
- [x] Mirror the hook change into `assets/hooks/prompt-guard.sh`.
- [x] Strengthen Stop planning completeness instructions for `/think` handoff readiness.
- [x] Mirror the Stop hook change into `assets/hooks/stop-orchestrator.sh`.
- [x] Add focused hook runtime regression coverage for explicit think routing with hook workflow language.
- [x] Run focused and required verification commands, with the external brain sync drift recorded in the review.

## Known Verification Blocker

- `bash scripts/check-task-workflow.sh --strict` fails in this isolated worktree because three repo-to-brain docs in the local brain vault match the dirty primary worktree under `/Users/ancienttwo/Projects/agentic-dev`, not this branch base. This slice does not sync or overwrite those external brain files because the contract explicitly excludes unrelated brain/docs work already dirty in the primary worktree.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Adjust `emit_waza_route_hint` so explicit think planning emits Waza `/think` before generic `/health`.
- [x] Mirror the hook change into `assets/hooks/prompt-guard.sh`.
- [x] Strengthen Stop planning completeness instructions for `/think` handoff readiness.
- [x] Mirror the Stop hook change into `assets/hooks/stop-orchestrator.sh`.
- [x] Add focused hook runtime regression coverage for explicit think routing with hook workflow language.
- [x] Run focused and required verification commands, with the external brain sync drift recorded in the review.
