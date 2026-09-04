> **Archived**: 2026-09-04 18:52
> **Related Plan**: plans/archive/plan-20260831-1239-operator-board-r1-presentation.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260904-1852
> **Archive Projection V1**: `plans/plan-20260831-1239-operator-board-r1-presentation.md` => `plans/archive/plan-20260831-1239-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/notes/20260831-1239-operator-board-r1-presentation.notes.md` => `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/contracts/20260831-1239-operator-board-r1-presentation.contract.md` => `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/reviews/20260831-1239-operator-board-r1-presentation.review.md` => `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`

# Plan: Operator Board R1 Presentation

> **Status**: Archived
> **Created**: 20260831-1239
> **Slug**: operator-board-r1-presentation
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Protocol-3 browser rendering, exact R1 evidence projection, responsive drawer behavior, and repository Required Checks
> **Rollback Surface**: Revert the isolated browser/read-projection merge unit; no authority or data migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md`
> **Task Review**: `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`
> **Implementation Notes**: `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260831-1239-operator-board-r1-presentation.md`
- Sprint contract: `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md`
- Sprint review: `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`
- Implementation notes: `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260831-1239-operator-board-r1-presentation.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260831-1239-operator-board-r1-presentation.md`.

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
- Contract file: `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md`
- Review file: `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`
- Implementation notes file: `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260831-1239-operator-board-r1-presentation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the isolated browser/read-projection merge unit; no authority or data migration
- **Verification boundary**: Protocol-3 browser rendering, exact R1 evidence projection, responsive drawer behavior, and repository Required Checks
- **Review/acceptance boundary**: `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260831-1239-operator-board-r1-presentation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md`, `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`, and `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the isolated browser/read-projection merge unit; no authority or data migration

## Captured Planning Output

## Objective

Restore the packaged Human Control Board against the current protocol-3 Operator snapshot and present R1 provider-neutral runtime/delivery evidence without changing authoritative five-column Task classification or adding automatic decisions.

## Scope

- Align the browser snapshot contract with the current server protocol and add regression coverage for the exact protocol-3 payload.
- Preserve the existing prioritized Worklist, but collapse zero-count groups by default and expand the first non-empty/actionable group.
- Add a secondary `Delivery & runtime` Task Drawer section that renders the authoritative inbox projection: `runtime_reachability`, `delivery_state`, `effect_sha256`, and `failure_class`.
- Show compact runtime/delivery badges on worklist cards only for actionable exception states; never derive or mutate a Task column from runtime facts.
- Make the task drawer opaque and modal on tablet/mobile, lock/background-isolate the board while open, and raise narrow-viewport interactive targets to 44px.
- Resolve message copy from the actual recipient mode: current claimant versus next claimant; keep read-only and unavailable sends fail-closed.
- Preserve existing fonts, warm-paper visual system, localized copy, exact one-write boundary, and error recovery state.

## Frozen Decisions

1. The five Fleet columns remain authoritative and unchanged.
2. R1 runtime reachability is evidence/attention only; it cannot move a card or authorize a workflow transition.
3. The browser consumes the server-owned protocol-3 DTO and performs validation only; it does not infer missing runtime evidence.
4. No auto-refresh, drag/drop, acquire, merge, architecture decision, provider apply, automatic runtime creation, or compatibility fallback is added.
5. URL-addressable selection is deferred from this slice because it is independent of the protocol/R1/responsive acceptance boundary.

## Allowed Paths

- `src/operator-web/**`
- `src/core/operator/fleet-snapshot.ts`
- `src/effects/operator/server.ts`
- `tests/operator-web/**`
- `tests/unit/operator-fleet-snapshot.test.ts`
- `tests/cli/operator-serve.test.ts`
- `docs/design/DESIGN-local-human-control-board-v1.md`
- workflow artifacts for this plan under `plans/` and `tasks/`

## Task Breakdown

1. Trace the exact protocol-3 server DTO through browser validation and repair the contract mismatch.
2. Extend browser types/rendering for the exact R1 inbox runtime/delivery evidence and exception badges.
3. Correct default worklist expansion and message target copy.
4. Repair tablet/mobile drawer separation and touch targets.
5. Add focused protocol, runtime evidence, default-expansion, message semantics, and responsive-class regression tests.
6. Run targeted UI/operator checks, repository Required Checks, architecture gate, and final review; update design/workflow artifacts.

## Acceptance Criteria

- An unmodified `repo-harness operator serve` renders a protocol-3 stable snapshot without a diagnostic proxy.
- Existing protocol-2/stale/unknown shapes fail closed rather than being heuristically adapted.
- A card containing R1 inbox fields displays exact delivery/runtime evidence in the drawer and only approved exception badges in the worklist.
- Runtime-only changes do not alter the card's authoritative five-column classification in tests.
- Zero-count worklist groups start collapsed; the first non-empty/actionable group starts expanded.
- Claimed and unclaimed tasks use distinct, truthful message-target labels; read-only send remains disabled.
- At 375px and 768px, the open drawer has an opaque modal surface/backdrop, background isolation, and no overlapping readable controls; touch targets are at least 44px.
- All Required Checks pass and the final review is subject-fresh.

## Verification Boundary

The slice is independently verifiable through operator snapshot unit tests, rendered operator UI interaction tests, CLI serve tests, responsive CSS assertions/browser smoke evidence, the architecture gate, and the repository Required Checks.

## Rollback

Revert this work-package as one merge unit. It changes only the browser/read-projection presentation and its tests/docs; no authority migration or persistent data conversion exists.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Trace and repair the exact protocol-3 server-to-browser DTO boundary.
- [x] Render exact R1 delivery/runtime evidence and exception-only badges without changing card columns.
- [x] Correct default worklist expansion and message target copy.
- [x] Repair tablet/mobile drawer isolation and touch targets.
- [x] Add focused regression coverage for protocol, R1 evidence, grouping, copy, and responsive behavior.
- [x] Run architecture, Required Checks, final review, and workflow closeout.
