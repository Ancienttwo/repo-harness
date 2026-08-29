# Plan: C3 WorkStateHandoffV1 and adoption receipts

> **Status**: Archived
> **Created**: 20260830-0120
> **Slug**: c3-work-state-handoff-adoption
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#4
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, task-sync, strict task workflow and architecture-sync all green; handoff carries attempted paths, dead ends, findings and next actions; execution-context union complete per branch; two distinct adopters both succeed on one handoff and the same adopter retry is idempotent; adoption creates no Claim and moves no delivery-plane byte
> **Rollback Surface**: Single revertable commit adding src/core/collaboration/handoff.ts and adoption.ts, src/effects/collaboration/handoff-store.ts, adoption-store.ts, record-store.ts and actor.ts, four test files, one workstream ledger entry and one notes file; collaboration.mode=off leaves every new path inert
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md`
> **Task Review**: `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md`
> **Implementation Notes**: `tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#4
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-0120-c3-work-state-handoff-adoption.md`
- Sprint contract: `tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md`
- Sprint review: `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md`
- Implementation notes: `tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-0120-c3-work-state-handoff-adoption.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-0120-c3-work-state-handoff-adoption.md`.

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
- Contract file: `tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md`
- Review file: `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md`
- Implementation notes file: `tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-0120-c3-work-state-handoff-adoption.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit adding src/core/collaboration/handoff.ts and adoption.ts, src/effects/collaboration/handoff-store.ts, adoption-store.ts, record-store.ts and actor.ts, four test files, one workstream ledger entry and one notes file; collaboration.mode=off leaves every new path inert
- **Verification boundary**: Full bun suite, tsc --noEmit, task-sync, strict task workflow and architecture-sync all green; handoff carries attempted paths, dead ends, findings and next actions; execution-context union complete per branch; two distinct adopters both succeed on one handoff and the same adopter retry is idempotent; adoption creates no Claim and moves no delivery-plane byte
- **Review/acceptance boundary**: `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-0120-c3-work-state-handoff-adoption.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md`, `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md`, and `tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit adding src/core/collaboration/handoff.ts and adoption.ts, src/effects/collaboration/handoff-store.ts, adoption-store.ts, record-store.ts and actor.ts, four test files, one workstream ledger entry and one notes file; collaboration.mode=off leaves every new path inert

## Captured Planning Output

## P1 — Map

Collaboration plane, sprint row C3. C0 froze the two-plane split
(`docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`);
C1 shipped `src/core/collaboration/common.ts` (actor union, scope refs, artifact
refs, `deriveCollaborationRecordId`, recorded-time source, digest helpers),
`src/core/collaboration/signal.ts`, `src/effects/collaboration/signal-store.ts`
and `src/effects/collaboration/feature-flag.ts`. `common.ts` and `signal.ts` are
C1-frozen and consumed unchanged by C2-C9; this row edits neither.

C3 adds the knowledge-transfer records: `WorkStateHandoffV1`,
`HandoffExecutionContextV1` and `HandoffAdoptionReceiptV1`, plus their two
append-only stores under `<git-common-dir>/repo-harness/collaboration/v1/`
(`handoffs/`, `adoptions/`). Out of scope: thread/discovery/hotspot projection
(C2, parallel row, disjoint files), the contribution collector and admission
bridge (C4), TaskFreeze/takeover succession integration (C5), the context-packet
builder (C6), CLI/MCP (C7), Operator surface (C8).

## P2 — Trace

`adoptWorkStateHandoff({ repo_root, authorization_id, handoff_id,
context_packet_sha256 })`
-> `assertCollaborationMutationEnabled(repoRoot)` (`collaboration.mode` must be
   `shadow` or `active`, else `collaboration_disabled`)
-> `resolveCollaborationActor()` derives the adopter from the authenticated
   principal, re-reading the principal mapping to detect a rebinding mid-call
-> `validateCollaborationRecordId(handoff_id)` before any `join()`
-> per-handoff exclusive directory lock
-> the referenced handoff is read from `handoffs/<id>.json` and must belong to
   this repository; `handoff_sha256` is taken from the persisted record, never
   from the caller
-> receipt identity = `derive('handoff-adoption-receipt', [handoff_sha256,
   adopter_actor_sha256, context_packet_sha256])`
-> an existing receipt at that identity reconciles against its recorded
   `adopted_at` (idempotent) or raises `collaboration_conflict`
-> otherwise the clock is read once and the bytes are published create-once
   (staged, fsynced, `link`ed) into `adoptions/<receipt-id>.json`.

No Task, Claim, Lease, Publication or Acceptance store is opened for writing at
any step. A second, distinct adopter repeats the whole path and lands a second
receipt against the same handoff: the identity triple differs in exactly the
adopter term, so both succeed.

## P3 — Decisions

1. **No new `*_PROTOCOL`.** `handoff.ts` and `adoption.ts` consume the frozen
   `COLLABORATION_PROTOCOL` from `common.ts`, exactly as C1's `signal.ts` does.
   The closed inclusion scan in `tests/unit/collaboration-authority-baseline.test.ts`
   ranges over `src/core/**` modules that *own* a protocol constant, so neither
   module enters its universe and `src/core/collaboration/common.ts` stays the
   single adjudicated exclusion covering the whole plane. Minting a second wire
   version for the same plane would be a fabricated authority surface. The
   adjudication is asserted in this row's own test file rather than left implicit.

2. **Extract the store mechanics instead of copying them.** The durable
   create-once publish protocol (same-directory staged write, fsync, `link`, the
   single-source staging-name builder and its matcher, the lstat ancestor walk,
   the 64-hex-before-`join()` rule) and the server-side actor derivation would
   otherwise exist in three copies. Both were C1 review findings; three copies
   reopen them twice. They move to `src/effects/collaboration/record-store.ts`
   and `src/effects/collaboration/actor.ts` with zero behavior change, and
   `signal-store.ts` consumes them. `signalStagingName` stays exported so C1's
   own test keeps proving the builder/matcher pair against the real producer.

3. **Required content, not fabricated content.** All four knowledge fields
   (`attempted_paths`, `dead_ends`, `key_findings`, `next_actions`) are required
   keys under the exact-key check and every entry must be non-blank bounded text.
   `attempted_paths` and `next_actions` must additionally be non-empty: a handoff
   that attempted nothing and proposes nothing transfers no knowledge. `dead_ends`
   and `key_findings` may be empty arrays, because forcing them non-empty makes an
   honest agent write "none" — a fabricated finding is strictly worse for the
   successor than an absent one.

4. **Adoption is non-exclusive and grants nothing.** The receipt identity is the
   frozen triple (handoff SHA + adopter actor SHA + context packet SHA), so
   many-to-many adoption falls out of the identity rather than out of a policy
   check. No "claim" vocabulary appears in the protocol, the stores, the errors
   or the tests; the projection term is `unadopted_handoff`.

5. **Retry-stable time.** `adopted_at` and `created_at` follow C1's rule: a
   `persisted_observation` is used verbatim, a `first_publication` freezes the
   clock inside the lock on the first write, and every retry rebuilds the
   candidate from the *recorded* value so an idempotent republish is never a
   false conflict.

## Task Breakdown

- [ ] Extract `src/effects/collaboration/record-store.ts` and
      `src/effects/collaboration/actor.ts` from `signal-store.ts`, zero behavior
      change, C1's store test still green.
- [ ] `src/core/collaboration/handoff.ts`: `WorkStateHandoffV1`, the trigger
      closed set, `HandoffExecutionContextV1` with per-branch reference
      completeness, `deriveWorkStateHandoffId`, build/validate/canonical-bytes.
- [ ] `src/core/collaboration/adoption.ts`: `HandoffAdoptionReceiptV1`,
      `deriveHandoffAdoptionReceiptId` over the frozen triple, build/validate.
- [ ] `src/effects/collaboration/handoff-store.ts`: publish/read/list, supersede
      within one actor lineage, source signals must resolve in this repository.
- [ ] `src/effects/collaboration/adoption-store.ts`: adopt/read/list, per-handoff
      lock, per-adopter idempotency, non-exclusive across adopters.
- [ ] `tests/unit/collaboration-handoff.test.ts`,
      `tests/unit/collaboration-adoption.test.ts`,
      `tests/effects/collaboration-handoff-store.test.ts`,
      `tests/effects/collaboration-adoption-store.test.ts`.
- [ ] Workstream ledger and notes; full verification sweep.

## Verification

- `bun test --timeout 60000`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bash scripts/check-architecture-sync.sh`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Extract `src/effects/collaboration/record-store.ts` and
- [ ] `src/core/collaboration/handoff.ts`: `WorkStateHandoffV1`, the trigger
- [ ] `src/core/collaboration/adoption.ts`: `HandoffAdoptionReceiptV1`,
- [ ] `src/effects/collaboration/handoff-store.ts`: publish/read/list, supersede
- [ ] `src/effects/collaboration/adoption-store.ts`: adopt/read/list, per-handoff
- [ ] `tests/unit/collaboration-handoff.test.ts`,
- [ ] Workstream ledger and notes; full verification sweep.
