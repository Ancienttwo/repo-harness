# Plan: Fleet Offer Acquire and MCP Mirror

> **Status**: Archived
> **Created**: 20260823-0202
> **Slug**: fleet-offer-acquire
> **Planning Source**: codex-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: prd:fleet-acquire-publication-readiness#module-5
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: WP2 focused race, authorization, helper, CLI, MCP tests plus root required checks and AcceptanceReceipt
> **Rollback Surface**: Revert the single WP2 publication unit; WP0 and WP1 remain intact
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md`
> **Task Review**: `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md`
> **Implementation Notes**: `tasks/notes/20260823-0202-fleet-offer-acquire.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: prd:fleet-acquire-publication-readiness#module-5
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260823-0202-fleet-offer-acquire.md`
- Sprint contract: `tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md`
- Sprint review: `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md`
- Implementation notes: `tasks/notes/20260823-0202-fleet-offer-acquire.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260823-0202-fleet-offer-acquire.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260823-0202-fleet-offer-acquire.md`.

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
- Contract file: `tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md`
- Review file: `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md`
- Implementation notes file: `tasks/notes/20260823-0202-fleet-offer-acquire.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260823-0202-fleet-offer-acquire.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single WP2 publication unit; WP0 and WP1 remain intact
- **Verification boundary**: WP2 focused race, authorization, helper, CLI, MCP tests plus root required checks and AcceptanceReceipt
- **Review/acceptance boundary**: `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260823-0202-fleet-offer-acquire.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md`, `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md`, and `tasks/notes/20260823-0202-fleet-offer-acquire.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single WP2 publication unit; WP0 and WP1 remain intact

## Captured Planning Output

## Goal and success criteria

Implement PRD v3 WP2 as one acquisition work-package: deterministic `TaskOfferV1` classification, `fleet offers --json`, execution-ready-only `fleet acquire`, `WorkEnvelopeV1`, and MCP mirrors for fleet offers/acquire plus publication readiness/reopen/takeover. Success means only a stable, writable, pending contract task with one exact Approved/projectable plan can be acquired; N concurrent acquires produce at most one bound lease/token/envelope; every stale authorization/offer or provisioning failure fails closed and compensates only its own claim.

## Scope

- Pure closed contracts for four execution-readiness classes, blocker diagnostics, offer revision, acquisition assertion, result/error, and WorkEnvelopeV1.
- Atomic registry snapshot, canonical target/plan proof, stable offer collection in registry then canonical-row order.
- Acquire orchestration reusing claim/start/bind authorities with optimistic authorization/offer revalidation and bounded deterministic selection.
- One shared claim-token writer, structured `contract-worktree start --json`, helper mirror parity, compensation tests.
- CLI `fleet offers/acquire` and existing MCP registry mirrors for fleet plus publication readiness/reopen/takeover using the same effects.

## Out of scope

- RepairOffer, feedback/inbox, remote claims/CAS, daemon/wake/session transport, automatic steal, PlanningOffer, sprint schema extension, auto-merge, compatibility aliases, or any change to `COORDINATION_PROTOCOL`/task digest domains.

## P1 architecture map

- `src/core/fleet/` owns immutable offer/envelope contracts and deterministic classification.
- `src/effects/fleet/` joins registry, canonical board/plan, claim, worktree provisioning, bind, token, and compensation.
- Registry, canonical sprint, lease store, worktree topology, plan/contract parsers remain the only authorities; offers and envelopes are projections/capabilities, never durable truth.
- `src/cli/commands/fleet.ts` and MCP tools are transport adapters over the same effect.
- Helper source/template mirrors must remain byte-equivalent where current project policy requires it.

## P2 concrete traces

1. Offers: atomic registry snapshot -> each adopted repo -> canonical target/stable board -> exact plan Source Ref and projectability -> four-way classification -> deterministic JSON.
2. Acquire: select or assert one execution-ready offer -> re-read authorization and offer -> task-lock claim -> structured fresh worktree start -> topology check -> revalidate -> bind -> lock-checked atomic claim token -> plan projection -> final authorization/lease verification -> WorkEnvelopeV1.
3. Failure: stale auth/offer or start/bind/token/projection fault releases only the matching claim; rollback failure returns a typed terminal error and never touches a foreign lease.
4. MCP: existing authorization/profile/repo resolver -> same fleet/publication effect -> same JSON contract; planner/read-only contexts cannot mutate.

## P3 decisions

- Never parse human helper output or duplicate branch naming; add a structured start result at the owning helper boundary.
- Never infer a plan from filenames or Plan cell. Require exactly one Approved work-package plan whose `Source Ref` matches the canonical sprint task cell and whose contract is projectable.
- Board stability is read-side eligibility only; claim/bind keep their existing task-lock canonical revalidation.
- Use optimistic authorization fences rather than a cross-repo global lock; no envelope is returned after a known revision change.
- Write claim tokens through one lock-checked atomic implementation and route existing producers through it.

## Failure and rollback

- `authorization_stale`, `offer_stale`, `no_eligible_task`, provisioning/bind/token/projection failures, and rollback failure are closed typed outcomes.
- Fresh acquisition rejects residual branch/worktree/metadata rather than adopting it.
- Revert WP2 as one publication unit; WP0/WP1 remain usable.

## Task Breakdown

- [x] Freeze pure TaskOfferV1/WorkEnvelopeV1 contracts and exhaustive classification tests.
- [x] Add atomic registry/canonical-plan offer collection and CLI `fleet offers`.
- [x] Add structured worktree start, shared token writer, execution-ready-only acquire with race/rollback tests.
- [x] Mirror fleet and publication tools through MCP with existing authorization gates.
- [x] Run focused concurrency/CLI/MCP/helper tests, root checks, Change Assessment, independent gate, AcceptanceReceipt, and local closeout.

## Verification

- Focused pure/effect/CLI/MCP tests including four-class exhaustiveness, exact plan/source proof, read-only denial, authorization/offer drift, N-way acquire race, own-claim compensation, token integrity, helper mirror parity, and JSON equivalence.
- `bun run check:type`, `bun test --timeout 60000`, `bun run check:helpers`, and all root required checks from AGENTS.md.
- Independent gatekeeper review and exact-subject AcceptanceReceipt.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze pure TaskOfferV1/WorkEnvelopeV1 contracts and exhaustive classification tests.
- [x] Add atomic registry/canonical-plan offer collection and CLI `fleet offers`.
- [x] Add structured worktree start, shared token writer, execution-ready-only acquire with race/rollback tests.
- [x] Mirror fleet and publication tools through MCP with existing authorization gates.
- [x] Run focused concurrency/CLI/MCP/helper tests, root checks, Change Assessment, independent gate, AcceptanceReceipt, and local closeout.
