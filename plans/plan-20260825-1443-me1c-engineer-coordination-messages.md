# Plan: ME-1C Engineer Coordination Messages

> **Status**: Blocked
> **Created**: 20260825-1443
> **Slug**: me1c-engineer-coordination-messages
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Task Inbox byte stability plus Module inbox persist-first, rotation, resource-integrity and transport-fault matrix
> **Rollback Surface**: Module message schema/store/MCP/CLI/architecture additions; TaskMessageV1 bytes remain unchanged
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md`
> **Task Review**: `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md`
> **Implementation Notes**: `tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md`

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

- Active plan: `plans/plan-20260825-1443-me1c-engineer-coordination-messages.md`
- Sprint contract: `tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md`
- Sprint review: `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md`
- Implementation notes: `tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260825-1443-me1c-engineer-coordination-messages.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260825-1443-me1c-engineer-coordination-messages.md`.

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
- Contract file: `tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md`
- Review file: `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md`
- Implementation notes file: `tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260825-1443-me1c-engineer-coordination-messages.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Module message schema/store/MCP/CLI/architecture additions; TaskMessageV1 bytes remain unchanged
- **Verification boundary**: Task Inbox byte stability plus Module inbox persist-first, rotation, resource-integrity and transport-fault matrix
- **Review/acceptance boundary**: `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260825-1443-me1c-engineer-coordination-messages.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md`, `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md`, and `tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Module message schema/store/MCP/CLI/architecture additions; TaskMessageV1 bytes remain unchanged

## Captured Planning Output

## Decision Summary

Promote ME-1C as the next prerequisite work-package for ME-3A and ultimately ME-2B. Preserve `TaskMessageEventV1` and its delivery receipt wire bytes exactly. Extract only the observed canonical-event/receipt/transition mechanics, then add a separate closed `ModuleMessageEventV1` authority with persist-first transport acceleration.

## P1 Architecture Map

- Canonical Task Inbox remains under `src/core/fleet/task-message.ts` and `src/effects/fleet/task-inbox.ts`.
- Shared mechanics may own canonical create-if-absent, size bounds, receipt transition helpers and untrusted rendering primitives; it may not own an open payload schema.
- Module message identity, assignment/module scope and typed resource references live under the Engineer capability.
- Current Binding and authenticated Engineer Principal remain ME-0A/0B authorities; native transport is optional and non-authoritative.
- Decision, Interface, Task, Lease, Publication and Acceptance records are read-only referenced subjects and remain out of scope.

## P2 Concrete Trace

1. A human/program-orchestrator CLI or restricted Engineer MCP request supplies closed message fields while sender identity is derived at the invocation boundary.
2. The effect layer revalidates the target Engineer Profile/current Binding and exact assignment fences.
3. Under the recipient lock it persists immutable canonical event bytes, then a pending delivery receipt.
4. Only after both writes may an optional transport receive a bounded summary plus typed/content-addressed refs.
5. Transport outcome appends an immutable observation; failures keep the receipt pending, success permits `delivered`, and acknowledgement resolves every resource digest before transition.
6. Binding rotation supersedes old assignment-scope receipts while module-scope pending events survive for the next current Binding.

## P3 Design Decision

The smallest coherent change is a dedicated module protocol/store that reuses extracted mechanics without changing Task Inbox identity or wire format. Missing Binding, stale assignment fence, unknown subject/resource kind, digest mismatch and transport uncertainty fail closed. No Provider fallback, Session wake, task mutation, generic payload, database, daemon or transcript persistence is introduced. At 10x scale the first pressure point is recipient inbox scanning; a derived index is deferred until measured.

## Task Breakdown

- [ ] Promote the ME-1C PRD only after the Runtime Admission Canary freezes the Codex effect-correlation contract.
- [x] Extract shared closed message mechanics while preserving Task Inbox canonical byte goldens.
- [x] Implement ModuleMessage event, receipt and observation schemas with strict canonical validation.
- [x] Implement git-common-dir store, binding-fenced send/list/ack/supersede and resource digest checks.
- [x] Add CLI/MCP surfaces and a transport interface that receives only persisted bounded summaries/refs.
- [x] Add fault, rotation, resource-integrity, transition, byte-golden and full repository verification.

## Verification

- Focused unit and CLI/MCP tests for Task and Module message protocols.
- `bun run check:type` and root full suite.
- Architecture, task-sync, strict workflow, project-state and init dry-run gates.
- Exact-subject Change Assessment and typed AcceptanceReceipt before merge.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Promote the ME-1C PRD only after the Runtime Admission Canary freezes the Codex effect-correlation contract.
- [x] Extract shared closed message mechanics while preserving Task Inbox canonical byte goldens.
- [x] Implement ModuleMessage event, receipt and observation schemas with strict canonical validation.
- [x] Implement git-common-dir store, binding-fenced send/list/ack/supersede and resource digest checks.
- [x] Add CLI/MCP surfaces and a transport interface that receives only persisted bounded summaries/refs.
- [x] Add fault, rotation, resource-integrity, transition, byte-golden and full repository verification.

## Current Blocker

The 2026-08-25 control-plane amendment places the non-authoritative Runtime Admission Canary before ME-1C approval. The durable message core is retained as a verified candidate, but this plan cannot enter acceptance or merge until the canary proves `persisted event -> exactly one Codex turn -> lost-ack reconciliation` with byte-identical Task, Lease and Fleet authorities.
