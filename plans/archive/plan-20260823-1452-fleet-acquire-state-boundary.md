# Plan: Fix fleet acquire state boundary

> **Status**: Archived
> **Created**: 20260823-1452
> **Slug**: fleet-acquire-state-boundary
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260823-1452-fleet-acquire-state-boundary.md`; after execution revert branch `codex/fleet-acquire-state-boundary` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md`
> **Task Review**: `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md`
> **Implementation Notes**: `tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md`

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

- Active plan: `plans/plan-20260823-1452-fleet-acquire-state-boundary.md`
- Sprint contract: `tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md`
- Sprint review: `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md`
- Implementation notes: `tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260823-1452-fleet-acquire-state-boundary.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260823-1452-fleet-acquire-state-boundary.md`.

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
- Contract file: `tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md`
- Review file: `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md`
- Implementation notes file: `tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260823-1452-fleet-acquire-state-boundary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260823-1452-fleet-acquire-state-boundary.md`; after execution revert branch `codex/fleet-acquire-state-boundary` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260823-1452-fleet-acquire-state-boundary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md`, `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md`, and `tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260823-1452-fleet-acquire-state-boundary.md`; after execution revert branch `codex/fleet-acquire-state-boundary` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Restore `check:state-boundaries` and Required/CI by removing the pre-existing `src/effects/fleet/acquire.ts -> src/cli/commands/{sprint,state}` reverse dependency without changing fleet acquisition semantics.

## P1 architecture

- `src/core/state/coordination-identity.ts` owns pure lease identity and transitions.
- `src/effects/state/coordination-lease-store.ts` owns task locks and durable lease writes.
- `src/cli/commands/sprint.ts` currently mixes Commander adaptation with shared claim/bind/release orchestration.
- `src/effects/fleet/acquire.ts` consumes those verbs and therefore violates the effect-to-CLI boundary.

## P2 trace

`fleet acquire` enters `src/cli/commands/fleet.ts`, calls `acquireFleetTask`, then defaults to `claimSprintCommand`, `bindSprintCommand`, and `releaseSprintCommand` imported from the CLI layer. Those verbs call the existing identity/store authorities. Failure cleanup releases the exact claim. CI detects the reverse imports before tests run.

## P3 decision

Extract the shared coordination verb orchestration and its typed outcome/dependency contracts into one `src/effects/state/coordination-sprint.ts` effect owner. Keep Commander parsing, stdout/stderr, and process exit in `src/cli/commands/sprint.ts`; have both CLI and fleet acquire call the same effect functions. Do not shell out, duplicate state machines, add compatibility wrappers, or change `COORDINATION_PROTOCOL`/task digest domains.

## Scope

- Add the single shared coordination-sprint effect module.
- Rewire sprint CLI and fleet acquisition to it.
- Move the shared outcome type out of the CLI boundary without duplicating its definition.
- Preserve claim/bind/release bytes, resumed receipt ordering, acquisition rollback, CLI JSON, and MCP behavior.
- Add/adjust boundary and behavior tests.

## Out of scope

- Fleet board, provider feedback, task inbox, lease schema/state changes, new CLI flags, compatibility aliases, or CI workflow changes.

## Verification

- `bun scripts/check-state-boundaries.ts --repo .`
- `bun test tests/check-state-boundaries.test.ts`
- `bun test tests/coordination-lease-store.test.ts tests/fleet-acquire-concurrency.test.ts tests/unit/fleet-acquire-effect.test.ts tests/cli/fleet-offer-acquire.test.ts tests/cli/mcp-fleet-publication.test.ts tests/cli/state-command.test.ts`
- `bun run check:type`
- `bun test --timeout 60000`
- all root required checks, independent gate, Change Assessment, AcceptanceReceipt, closeout, and Required/CI.

## Task Breakdown

- [ ] Freeze a self-sufficient bugfix contract and pre-fix CI evidence.
- [ ] Extract shared coordination sprint effects and typed outcome.
- [ ] Rewire CLI/fleet consumers without semantic changes.
- [ ] Run focused/full verification, independent gate, AcceptanceReceipt, closeout, and main CI.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Freeze a self-sufficient bugfix contract and pre-fix CI evidence.
- [ ] Extract shared coordination sprint effects and typed outcome.
- [ ] Rewire CLI/fleet consumers without semantic changes.
- [ ] Run focused/full verification, independent gate, AcceptanceReceipt, closeout, and main CI.
