# Plan: Lease Protocol 2 and PR Review Lifecycle

> **Status**: Executing
> **Created**: 20260822-1538
> **Slug**: lease-protocol-2-lifecycle
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: prd:fleet-acquire-publication-readiness#module-2
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Lease schema compatibility, task-locked lifecycle transitions, linked-PR journal ordering, board projection, full repository checks, and independent AcceptanceReceipt.
> **Rollback Surface**: Revert the WP0-B branch as one unit; schema-1 records remain readable and schema-2 reviewing records fail closed on older CLIs.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md`
> **Task Review**: `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md`
> **Implementation Notes**: `tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: prd:fleet-acquire-publication-readiness#module-2
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260822-1538-lease-protocol-2-lifecycle.md`
- Sprint contract: `tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md`
- Sprint review: `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md`
- Implementation notes: `tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260822-1538-lease-protocol-2-lifecycle.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260822-1538-lease-protocol-2-lifecycle.md`.

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
- Contract file: `tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md`
- Review file: `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md`
- Implementation notes file: `tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260822-1538-lease-protocol-2-lifecycle.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the WP0-B branch as one unit; schema-1 records remain readable and schema-2 reviewing records fail closed on older CLIs.
- **Verification boundary**: Lease schema compatibility, task-locked lifecycle transitions, linked-PR journal ordering, board projection, full repository checks, and independent AcceptanceReceipt.
- **Review/acceptance boundary**: `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260822-1538-lease-protocol-2-lifecycle.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md`, `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md`, and `tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the WP0-B branch as one unit; schema-1 records remain readable and schema-2 reviewing records fail closed on older CLIs.

## Captured Planning Output

## Goal and success criteria

Implement Lease Owner Record Schema 2 and the PR review lifecycle as one rollback/review boundary. A successful task-backed linked-PR ship must leave the exact lease in `reviewing` with a canonical `current_publication` pointer. The raw `contract-worktree finish --no-merge` step still precedes PR creation and therefore remains `completing`; reviewing entry occurs only in `ship_linked_pr` after durable `pr_observed` and before the ship journal's terminal `complete`. `reopen`, `takeover`, and `abandon` must be explicit task-locked transitions; no path except the existing `bind` may create a freshly `bound` lease.

Success means:

- Existing schema-1 owner records still parse with their existing meaning; schema-2 is written when the publication lifecycle requires it. `COORDINATION_PROTOCOL` remains exactly `1`, preserving task ID and task revision digest domains.
- Reviewing entry proves the completing owner, receipt task/claim/generation/head, receipt digest, marker-backed publication identity, branch/worktree binding, matching `pr_observed`, and the independent ship-journal key before writing `{record_schema: 2, state: reviewing, current_publication}` under the task lock. The existing `finish_transaction_key` and the pointer's `ship_transaction_key` are different journal domains and must never be substituted for one another.
- Same-owner reopen returns `reviewing -> bound` only after the recorded worktree still exists in `git worktree list --porcelain` and its branch/head plus receipt pointer revalidate.
- New-owner takeover performs `reviewing -> reserving`, mints a new claim, increments generation once, clears execution fields/current publication, revalidates the canonical pending row, requires provenance, then relies on the existing resumed-receipt-before-bind path to reach `bound`.
- Abandon releases only the exact current publication and records immutable lineage before clearing the lease. `sprint steal` and ordinary release refuse `reviewing` and point to the publication lifecycle commands.
- Legacy `completing` + successful no-merge journal + matching PR/receipt is detected but never silently migrated; an explicit exact-task/exact-claim command performs the same reviewing-entry proof only when a full marker-backed receipt already exists. Markerless/unattributable legacy PRs report `legacy_unattributable` for WP0-C/operator resolution and are never adopted by inference.
- Board projection classifies `reviewing` without offering release/steal/reconcile actions that their verbs reject.
- The existing `sprint reconcile` explicitly refuses `reviewing`; it must not bypass WP0-C's future fetch + canonical-row + pointer/claim/generation proof.

## Scope

- Core owner-record schema union, parser/serializer, pointer validation, and pure lifecycle transitions.
- Coordination effects for task-lock transitions, canonical row checks, worktree-topology checks, receipt/cache and journal evidence reads, and immutable publication lineage events.
- Publication CLI commands for reviewing entry (internal ship integration), reopen, takeover, abandon, and legacy detect/migrate.
- `ship_linked_pr` wiring after receipt/marker plus `pr_observed` durability and before the ship journal's `complete`; typed failure leaves the lease `completing`.
- Board/claim projection and command help updates.
- Focused unit, concurrency, shell closeout, parser-compatibility, board, and CLI tests.

## Out of scope

- WP0-C recovery and provider-driven integration reconcile.
- Merge readiness, fleet acquire, provider feedback, Task Inbox V1, MCP mirror, remote claims, session liveness, auto-merge, or cross-machine CAS.
- Any change to `COORDINATION_PROTOCOL`, task digest preimages, provider receipt schema, or a second canonical-task parser.

## P1 architecture map

- `src/core/state/coordination-identity.ts` owns owner-record parsing/serialization and pure state transitions.
- `src/effects/state/coordination-lease-store.ts` owns durable owner writes and the per-task lock.
- `src/cli/commands/sprint.ts` owns existing claim/bind/completion/release/steal commands and canonical-row revalidation patterns.
- Publication lifecycle core/effects/CLI code owns receipt-pointer proofs and lifecycle-specific commands while calling the same lease store; receipt cache and marker schema remain owned by `src/{core,effects}/publication/publication-receipt.ts`.
- `scripts/contract-worktree.sh` owns the earlier `bound -> completing` window; `scripts/ship-worktrees.sh` and its packaged template own the later receipt/marker/journal/reviewing call order and typed partial-failure behavior.
- `src/core/state/project-board.ts` plus collectors own read-only lease classification/actions.
- Tests under `tests/coordination-identity.test.ts`, `tests/coordination-lease-store.test.ts`, `tests/sprint-claim-concurrency.test.ts`, `tests/board-projection.test.ts`, publication tests, and closeout-journal tests are authoritative verification surfaces.

## P2 concrete traces

1. Ship: bound lease -> `contract-worktree finish --no-merge` opens/completes the local closeout while leaving `completing` -> push/PR -> `PublicationReceiptV1` cache + full marker -> canonical `pr_observed` ship journal -> task-lock reread -> reviewing transition + pointer containing the ship-journal key -> ship journal `complete`.
2. Reopen: pointer-selected reviewing lease -> receipt/worktree topology/branch/head revalidation under the lock -> same claim/generation restored to bound using only bind-declared execution fields already present in the reviewing record.
3. Takeover: pointer-selected reviewing lease -> expected claim/generation/head and canonical pending row revalidation under the lock -> new reserving record with generation + 1 and empty execution fields -> repair worktree -> existing bind appends `resumed` before writing bound.
4. Abandon/migration: exact pointer and provider-close reason -> durable lineage event -> release/remove; legacy completing inspection remains read-only until an explicit migration reruns the full reviewing-entry proof. Markerless or otherwise unattributable PRs remain completing and surface `legacy_unattributable`.

## P3 decision rationale

- Use a strict schema union rather than bumping the digest protocol or accepting loose optional fields. Schema 1 has no `record_schema/current_publication/reviewing`; schema 2 has explicit fields and closed validation.
- Keep `current_publication` in the lease because currentness is execution authority. Keep immutable lineage beside the publication store because audit history must survive lease removal but may never authorize mutation.
- Reuse the canonical sprint parser, task lock, receipt validators, and resumed-before-bind sequence. Do not add fallback ref normalization, inferred worktrees, marker-only authority, or session-liveness heuristics.
- At 10x active publications the first pressure is repeated filesystem/provider observation, not transition correctness; retain per-task locks and on-demand reads. Do not add a daemon/cache in this work package.

## Public interfaces and errors

- Add schema-2 owner JSON fields `record_schema: 2` and `current_publication: {publication_id, receipt_sha256, head_sha, ship_transaction_key}` for `reviewing`.
- Add publication lifecycle CLI surfaces with JSON output and exact expected-pointer fencing: internal mark-reviewing, `publication reopen`, `publication takeover`, `publication abandon`, and legacy inspect/migrate. Keep `sprint reconcile` closed to reviewing.
- Typed refusals include `publication_claim_mismatch`, `publication_pointer_mismatch`, `worktree_missing`, `head_moved`, `task_revision_mismatch`, `legacy_confirmation_required`, and `publication_incomplete` for a ship that cannot durably enter reviewing.

## Failure and rollback

- Every transition reads, validates, and writes inside one task lock. External/provider reads may prepare observations first, but the lock callback revalidates every mutation-relevant local fact.
- Failure before reviewing preserves `completing` plus journal/receipt evidence for WP0-C; `pr_observed` may exist while ship `complete` does not, and the ship command exits typed `publication_incomplete` rather than reporting success.
- Lineage-event persistence must complete before abandon removes the lease; idempotent retry proves byte equality.
- Roll back by reverting the WP0-B branch as a unit. Schema-1 records remain readable; any emitted schema-2 reviewing record requires the WP0-B reader and must not be downgraded silently.

## Task Breakdown

- [x] Add strict lease-owner schema 2 parsing/serialization and pure reviewing/reopen/takeover/abandon transitions without changing digest constants.
- [x] Add task-locked publication lifecycle effects, pointer/receipt/journal/worktree/canonical fencing, lineage, and explicit legacy inspection/migration.
- [x] Wire publication lifecycle CLI and task-backed `ship_linked_pr` after `pr_observed`; keep source/template ship helpers identical and preserve the earlier raw finish semantics.
- [x] Make legacy inspection/migration explicit and block ordinary `sprint reconcile` from clearing reviewing leases.
- [x] Extend board/claim projections and refusal messages for reviewing.
- [x] Add focused compatibility, transition, concurrency, closeout, migration, idempotency, and negative fencing tests.
- [ ] Run the contract criteria, targeted suites, full repository checks, independent review, and AcceptanceReceipt finalization.

## Verification

- `bun test tests/coordination-identity.test.ts --timeout 60000`
- `bun test tests/coordination-lease-store.test.ts --timeout 60000`
- `bun test tests/sprint-claim-concurrency.test.ts --timeout 60000`
- `bun test tests/board-projection.test.ts --timeout 60000`
- `bun test tests/unit/publication-receipt.test.ts --timeout 60000`
- `bun test tests/contract-worktree-closeout-journal.test.ts --timeout 60000`
- `bun test tests/helper-scripts.test.ts --timeout 60000`
- `cmp -s scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh`
- Root required checks from `AGENTS.md`, followed by independent gatekeeper review and exact-subject AcceptanceReceipt.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add strict lease-owner schema 2 parsing/serialization and pure reviewing/reopen/takeover/abandon transitions without changing digest constants.
- [x] Add task-locked publication lifecycle effects, pointer/receipt/journal/worktree/canonical fencing, lineage, and explicit legacy inspection/migration.
- [x] Wire publication lifecycle CLI and task-backed `ship_linked_pr` after `pr_observed`; keep source/template ship helpers identical and preserve the earlier raw finish semantics.
- [x] Make legacy inspection/migration explicit and block ordinary `sprint reconcile` from clearing reviewing leases.
- [x] Extend board/claim projections and refusal messages for reviewing.
- [x] Add focused compatibility, transition, concurrency, closeout, migration, idempotency, and negative fencing tests.
- [ ] Run the contract criteria, targeted suites, full repository checks, independent review, and AcceptanceReceipt finalization.
