# Plan: Characterize first-offer observation-time staleness

> **Status**: Executing
> **Created**: 20260930-1802
> **Slug**: e1-first-offer-staleness
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: origin/docs/pi-harness-host-invariants
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Existing ME-1A fixture composes real retry observation, offer digest and admission; focused tests plus hooks/task sync/strict workflow
> **Rollback Surface**: Revert the isolated test/e1-first-offer-staleness change; no runtime or data mutation
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md`
> **Task Review**: `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md`
> **Implementation Notes**: `tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: origin/docs/pi-harness-host-invariants
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260930-1802-e1-first-offer-staleness.md`
- Sprint contract: `tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md`
- Sprint review: `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md`
- Implementation notes: `tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260930-1802-e1-first-offer-staleness.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260930-1802-e1-first-offer-staleness.md`.

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
- Contract file: `tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md`
- Review file: `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md`
- Implementation notes file: `tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260930-1802-e1-first-offer-staleness.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the isolated test/e1-first-offer-staleness change; no runtime or data mutation
- **Verification boundary**: Existing ME-1A fixture composes real retry observation, offer digest and admission; focused tests plus hooks/task sync/strict workflow
- **Review/acceptance boundary**: `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260930-1802-e1-first-offer-staleness.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md`, `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md`, and `tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the isolated test/e1-first-offer-staleness change; no runtime or data mutation

## Captured Planning Output

## Approved S0 scope

> **Task Profile**: code-change

Owner-approved Packet 6B implements only S0 characterization. Design source: 7173049ca76ec3bf660ff057b63b3158817c379f:docs/researches/20260930-fleet-responsibility-trace.md, E1 gap closure design / S0. The design is read from Git, not copied into this worktree.

## Why

The first offer has no attempt current; real observeRetryEligibility derives eligible_since from observed_at. buildEngineerOfferCandidate includes it in the offer digest. Caller admission recollecting at T2 can reject the T1 assertion even with unchanged Task/Binding/dependency authority. We need a passing documented characterization before any observation receipt implementation.

## Goal

Extend tests/unit/me1a-engineer-scheduling-acquire.test.ts using its existing graph/offer/assertion fixture. Exercise the production retry observation with current=null at fixed T1 and T2 and the production admission function. Assert unchanged task authority, changed offer revision, expected engineer_offer_stale, and zero mutation. Preserve CI by asserting current stale behavior, not by changing production code.

## Scope

In scope: one existing test file and workflow plan/contract/review/notes generated for this isolated worktree. Freeze observation design and 30-second admission-start freshness in comments/notes only.
Out of scope: src, package/lock/dependency changes, observation schema code, host picker, TTL enforcement, scheduler, global installation, primary checkout, user dirty files, merging.

## P1 / P2 / P3

P1: core/engineers/automation-attempt observation -> core/engineers/scheduling offer builder -> effects/engineers/scheduling-acquire assertion validation. Existing test fixture already builds a real work graph, offers and assertion, with a mutation dependency counter.
P2: unchanged fixture -> current=null at T1 -> original assertion -> recollect with current=null at T2 -> matchesAssertion rejects offer revision -> acquire port is not called.
P3: characterize the observable failure without treating a future API as implemented. Parameterize only the test fixture's observation input; keep its existing default path. No sleeps, new fixture cache, test file, dependency or production abstraction.

## Test admission rationale

Existing ME-1A tests cover explicitly stale fences and lock contention but hard-code retry. The uncovered condition is a changed observation clock with no changed Task authority. The lowest useful layer is the real retry projector and offer builder composed with admission; no network/provider or real claim is needed. The owning test file's existing eight-process lock case remains its independent coverage. Expected command cost: under one minute.

## Verification

- bun test tests/unit/me1a-engineer-scheduling-acquire.test.ts
- bun run check:hooks
- bash scripts/check-task-sync.sh
- bash scripts/check-task-workflow.sh --strict
No full suite needed for this test-only slice; 6A's baseline full run is not relabeled as evidence for this changed subject.

## Design notes to freeze

Observation record is a future server-issued, content-addressed record binding repository, authenticated principal/Binding, canonical offer snapshot digest, observed_at_ms, expires_at_ms and producer/policy revision. None is implemented here.
30 seconds is the proposed new-transaction admission-start freshness bound after key-ledger lookup, not a maximum claim age after lock waits. Pending reconciles even if observation expired; completed replay is not a new effect. Clock/expiry/runtime viability remains unverified. Legacy-key identity, callback policy and scope cutover require later slices.

## Stop Conditions

Stop and return BLOCKED on a workflow command refusal, if the fixture cannot prove the condition with real production observation/build/admission, or if implementation needs a production path. Do not bypass gates. Do not merge.

## Task Breakdown

- [x] Add expected-stale characterization to the existing scheduling-acquire fixture.
- [x] Freeze S0 observation/freshness notes, run focused checks, and prepare the Draft PR change.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add expected-stale characterization to the existing scheduling-acquire fixture.
- [x] Freeze S0 observation/freshness notes, run focused checks, and prepare the Draft PR change.
