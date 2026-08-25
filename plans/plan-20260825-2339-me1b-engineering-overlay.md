# Plan: ME-1B Engineering Overlay

> **Status**: Approved
> **Created**: 20260825-2339
> **Slug**: me1b-engineering-overlay
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Engineering/Fleet/Planning semantic independence and double-read consistency
> **Rollback Surface**: ME-1B schemas/projection/CLI/tests/ArchContext
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md`
> **Task Review**: `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md`
> **Implementation Notes**: `tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md`

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

- Active plan: `plans/plan-20260825-2339-me1b-engineering-overlay.md`
- Sprint contract: `tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md`
- Sprint review: `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md`
- Implementation notes: `tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260825-2339-me1b-engineering-overlay.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260825-2339-me1b-engineering-overlay.md`.

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
- Contract file: `tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md`
- Review file: `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md`
- Implementation notes file: `tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260825-2339-me1b-engineering-overlay.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: ME-1B schemas/projection/CLI/tests/ArchContext
- **Verification boundary**: Engineering/Fleet/Planning semantic independence and double-read consistency
- **Review/acceptance boundary**: `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260825-2339-me1b-engineering-overlay.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md`, `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md`, and `tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: ME-1B schemas/projection/CLI/tests/ArchContext

## Captured Planning Output

## Decision Summary

Promote and deliver the explicitly minimal ME-1B boundary: deterministic CLI/JSON read models for Planning Graph, Delivery Kanban, Engineering Overlay, and Organization Attention. The slice does not add a web UI, mutation route, cached status, Worker authority, or HumanControl composite. Later protocols remain explicit `unsupported`; existing ME-0A/0B/1A/1C/3A authorities are only observed.

## P1 Architecture Map

- `src/core/engineers/scheduling.ts` and `src/effects/engineers/scheduling.ts` remain ME-1A Work Graph authority/projection.
- `src/core/fleet/board.ts` and `src/effects/fleet/board.ts` remain Delivery Kanban authority/projection.
- ME-0A Profile/Binding, ME-0B ClaimActorReceipt, ME-1C inbox, and ME-3A effect stores are independent observed components.
- New `runtime-harness/engineering-overlay` owns only canonical overlay/attention schemas, double-read consistency, and CLI presentation.
- `src/cli/commands/sprint.ts`, `src/cli/commands/fleet.ts`, and `src/cli/commands/engineer.ts` expose three semantically independent read commands.
- Web UI, mutation endpoints, combined cached status, delegation/writer state before its owning PRD, and Provider lifecycle effects are out of scope.

## P2 Concrete Trace

1. `sprint graph --json` reads the canonical registered repository and ME-1A scheduling carrier, returning its exact graph revision and dependency states.
2. `fleet board --json` continues to classify task columns exclusively from Task/Lease/Publication authorities.
3. `engineer board --json` reads tracked Profiles plus git-common-dir Binding, live ClaimActor, ME-1C message, and ME-3A observation facts twice.
4. Matching component markers yield `stable`; any changed marker yields `changed_during_read`; unreadable component state yields `degraded` without inventing healthy-empty data.
5. Organization attention is derived only from closed observed conditions and names the owning component revision.

## P3 Design Decision

The smallest coherent slice is separate pure read models and CLI commands. It preserves one source of truth per domain and proves semantic independence before any composite/UI surface. At 10x Engineer count, sequential local reads fail first; the schema keeps per-component digests so collection can later be bounded/parallelized without changing authority.

## Task Breakdown

- [ ] Promote the ME-1B PRD to Approved with the minimal CLI/JSON boundary and closed support states.
- [ ] Add exact overlay/attention schemas, canonical digests, and illegal-state validation.
- [ ] Add effect-owned double-read projection over Profile/Binding/Claim/message/Provider observations.
- [ ] Add `sprint graph` and `engineer board` JSON/text read commands while preserving Fleet semantics.
- [ ] Add fault, consistency, semantic-independence, route-inventory, and performance fixtures.
- [ ] Register the ArchContext capability and project workflow/architecture evidence.
- [ ] Run focused and full repository verification, obtain acceptance, archive, and merge.

## Verification

- `bun test tests/unit/me1b-engineering-overlay.test.ts tests/cli/engineer.test.ts tests/cli/sprint.test.ts tests/cli/fleet.test.ts --timeout 60000`
- `bun run typecheck`
- root required checks from `AGENTS.md`
- full `bun test --timeout 60000`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Promote the ME-1B PRD to Approved with the minimal CLI/JSON boundary and closed support states.
- [ ] Add exact overlay/attention schemas, canonical digests, and illegal-state validation.
- [ ] Add effect-owned double-read projection over Profile/Binding/Claim/message/Provider observations.
- [ ] Add `sprint graph` and `engineer board` JSON/text read commands while preserving Fleet semantics.
- [ ] Add fault, consistency, semantic-independence, route-inventory, and performance fixtures.
- [ ] Register the ArchContext capability and project workflow/architecture evidence.
- [ ] Run focused and full repository verification, obtain acceptance, archive, and merge.
