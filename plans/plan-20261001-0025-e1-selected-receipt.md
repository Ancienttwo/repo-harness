# Plan: E1 S2 selected receipt transaction and one-shot identity cutover

> **Status**: Executing
> **Created**: 20261001-0025
> **Slug**: e1-selected-receipt
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Frozen-time audit then exact replay/migration and callback/budget evidence
> **Rollback Surface**: Before execution remove `plans/plan-20261001-0025-e1-selected-receipt.md`; after execution revert branch `codex/e1-selected-receipt` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20261001-0025-e1-selected-receipt.contract.md`
> **Task Review**: `tasks/reviews/20261001-0025-e1-selected-receipt.review.md`
> **Implementation Notes**: `tasks/notes/20261001-0025-e1-selected-receipt.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20261001-0025-e1-selected-receipt.md`
- Sprint contract: `tasks/contracts/20261001-0025-e1-selected-receipt.contract.md`
- Sprint review: `tasks/reviews/20261001-0025-e1-selected-receipt.review.md`
- Implementation notes: `tasks/notes/20261001-0025-e1-selected-receipt.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20261001-0025-e1-selected-receipt.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20261001-0025-e1-selected-receipt.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20261001-0025-e1-selected-receipt.md`.

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
- Contract file: `tasks/contracts/20261001-0025-e1-selected-receipt.contract.md`
- Review file: `tasks/reviews/20261001-0025-e1-selected-receipt.review.md`
- Implementation notes file: `tasks/notes/20261001-0025-e1-selected-receipt.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20261001-0025-e1-selected-receipt.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20261001-0025-e1-selected-receipt.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20261001-0025-e1-selected-receipt.md`; after execution revert branch `codex/e1-selected-receipt` or the explicitly reviewed diff.
- **Verification boundary**: Frozen-time audit then exact replay/migration and callback/budget evidence
- **Review/acceptance boundary**: `tasks/reviews/20261001-0025-e1-selected-receipt.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20261001-0025-e1-selected-receipt.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20261001-0025-e1-selected-receipt.contract.md`, `tasks/reviews/20261001-0025-e1-selected-receipt.review.md`, and `tasks/notes/20261001-0025-e1-selected-receipt.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20261001-0025-e1-selected-receipt.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20261001-0025-e1-selected-receipt.md`; after execution revert branch `codex/e1-selected-receipt` or the explicitly reviewed diff.

## Captured Planning Output

## Why
S1 trusted observation evidence must become a selected-request closeout transaction without moving admission authority or replaying unknown effects. Existing acquire-next v1 and campaign outer budget identities lack selected/session/policy identity.

> **Task Profile**: code-change

## Goal
S2 only: shared C core in scheduling-acquire-next and acquireSelectedEngineerTask facade; explicit one-shot inner/outer receipt cutover with no permanent v1 reader; current callback policy revision R1 and trusted scope/request identity; typed observation errors/MCP mapping; retain observation refs. No new production selected entrypoint, unchanged lower admission/13-field assertion/offer_revision.

## Authority
Owner-approved S2 dispatch and local uncommitted design at /Users/chris/Projects/repo-harness/docs/researches/20260930-fleet-responsibility-trace.md (sha256:c5c164ce61cc512a98da2aa41916565b9faae5afdda65d0c7b4834a09d3baf95), GAP2 and S2 row plus 已裁定事项. GAP3/4 behavior strengthening belongs to S3, transport wiring to S4.

## P1 Architecture Map
Engineer scheduling collector owns current offer authority; unchanged scheduled acquire owns assertions and locks; scheduling-acquire-next owns inner admission/result ledger and observation refs. campaign-acquisition owns outer request/budget identity and existing callback/own-claim compensation, preserving effect-before-outcome. observation retention/explicit cleanup belongs to evidence closeout/recovery, not host scheduling. No automatic GC.

## P2 Concrete Trace
First audit frozen now_ms -> collector retry + Fleet board -> lease liveness/workflow-state consumers, comparing T1<T2 for every consumer. STOP on unsafe consumer before production edits. Once proven safe: authenticated/closed request -> unique key ledger -> conflict/pending/completed -> fresh-only observation/time/snapshot validation -> durable pending -> unchanged A -> existing fresh callback -> completed -> outer result/usage. Missing/expired observation never resets a known key.

## P3 Decision
Reuse current modules, canonical primitives and locks; new shared function protects two actual wrappers and existing outer transaction. No new abstraction/database/scheduler. One-shot cutover keeps legacy logical keys fenced and preserves source evidence; no legacy execution/replay in normal v2 readers. R1 binds existing callback semantics, not S3 membership strengthening. Unknown/corrupt metadata fails closed; 30s is admission-start freshness only.

## Stop Conditions
Stop immediately on an unsafe frozen-time consumer, workflow refusal, inability to fence old inner/outer keys without guessing, any required lower admission/revision change, or scope expansion to S3/S4. Report BLOCKED with exact evidence. No merge, Ready, scheduler, FleetRuntimeAdapter, release, cleanup or primary-checkout edits.

## Task Breakdown
- [x] Capture narrowed contract; publish exhaustive frozen-time audit before production edits.
- [x] Implement shared C core, selected facade, explicit one-shot inner/outer identity cutover, R1 and typed observation errors within existing owners.
- [ ] Extend existing tests for replay/conflict/crash/legacy fences, callback/outer budget ordering, observation errors and current-time authority; execute canonical Verification Plan including check:type.
- [ ] Commit exact allowed paths, push and open Draft PR; no finish/merge/Ready or later slice.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture narrowed contract; publish exhaustive frozen-time audit before production edits.
- [x] Implement shared C core, selected facade, explicit one-shot inner/outer identity cutover, R1 and typed observation errors within existing owners.
- [ ] Extend existing tests for replay/conflict/crash/legacy fences, callback/outer budget ordering, observation errors and current-time authority; execute canonical Verification Plan including check:type.
- [ ] Commit exact allowed paths, push and open Draft PR; no finish/merge/Ready or later slice.
