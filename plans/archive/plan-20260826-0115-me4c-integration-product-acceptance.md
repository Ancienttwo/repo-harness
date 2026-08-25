# Plan: ME-4C Integration Product Acceptance

> **Status**: Archived
> **Created**: 20260826-0115
> **Slug**: me4c-integration-product-acceptance
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Exact combined candidate and existing AcceptanceReceipt projection
> **Rollback Surface**: ME-4C schemas/effects/CLI/tests/ArchContext
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md`
> **Task Review**: `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md`
> **Implementation Notes**: `tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md`

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

- Active plan: `plans/plan-20260826-0115-me4c-integration-product-acceptance.md`
- Sprint contract: `tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md`
- Sprint review: `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md`
- Implementation notes: `tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260826-0115-me4c-integration-product-acceptance.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260826-0115-me4c-integration-product-acceptance.md`.

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
- Contract file: `tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md`
- Review file: `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md`
- Implementation notes file: `tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260826-0115-me4c-integration-product-acceptance.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: ME-4C schemas/effects/CLI/tests/ArchContext
- **Verification boundary**: Exact combined candidate and existing AcceptanceReceipt projection
- **Review/acceptance boundary**: `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260826-0115-me4c-integration-product-acceptance.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md`, `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md`, and `tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: ME-4C schemas/effects/CLI/tests/ArchContext

## Captured Planning Output

## Decision Summary

Deliver ME-4C as an exact-subject integration evidence plane over existing Git, Publication and Acceptance authorities. The combined candidate is one already-existing Git commit/tree; every selected publication must be the current lease-owned pointer and an ancestor of that commit. The product verdict remains the existing verified protocol-2 `AcceptanceReceipt`; ME-4C emits only a content-addressed projection and never creates a second Acceptance authority.

## P1 Architecture Map

- `src/core/publication/publication-receipt.ts` remains immutable PublicationReceipt authority; `src/core/state/coordination-identity.ts` and the lease store remain current-publication pointer/status authority.
- `scripts/acceptance-receipt.ts` remains the sole product verdict authority and exact normalized-final-content verifier.
- New `src/core/integration/product-acceptance.ts` owns only closed IntegrationContract, IntegrationEnvelope, AcceptanceMatrix and ProductAcceptanceProjection schemas/canonical digests.
- New `src/effects/integration/product-acceptance.ts` owns strict approved-requirement reads, Git ancestor/tree checks, publication pointer/lease-byte revalidation, immutable git-common-dir evidence persistence and the join to an already-verified AcceptanceReceipt.
- New `src/cli/commands/integration.ts` exposes local JSON/text build/read/accept commands. No command builds a merge, changes Task/Lease/Publication, records a waiver or performs Human merge.
- Runtime Sessions, ME-2C assertions and ME-3 effects may appear only as optional evidence refs. Provider lifecycle, merge construction, automatic release and UI are out of scope.

## P2 Concrete Trace

1. An operator supplies one Approved PRD/source-spec pair, repository identity, integration group, exact required work-package revisions and closed constraint IDs.
2. Contract build reads exact regular files, verifies the PRD is Approved, digests their bytes and persists one immutable content-addressed IntegrationContract.
3. Envelope build reads the exact current lease pointer and cached PublicationReceipt for every required task, digests the full lease observation bytes, resolves base/head/tree, and proves base plus every publication head are ancestors of the final head.
4. Matrix build requires exactly one row for every contract constraint, validates each evidence ref against immutable bytes/digest, and persists the content-addressed matrix. Missing, duplicate, extra, fail or blocked rows cannot pass the product gate.
5. Product projection re-reads requirement bytes, every current pointer/lease observation, candidate head/tree and evidence bytes. It then asks the existing acceptance helper to verify the protocol-2 AcceptanceReceipt for the same repository/current candidate.
6. Only `external_pass` or `user_waiver` can be projected. The output binds exact envelope, matrix, receipt digest, subject and target revision, with no mutation of Task, Lease, Publication or Acceptance.
7. A two-publication fixture changes each fence in turn and proves stale requirement, pointer, status, head/tree, evidence or receipt fails closed.

## P3 Design Decision

An existing Git commit is the smallest sufficient combined-candidate carrier: content and parentage are already immutable and Git remains merge-order authority. Reusing verified `AcceptanceReceipt` avoids a parallel product-verdict plane. Immutable git-common-dir projections provide restart-safe evidence without mutable current pointers. At 10x scale, repeated Git/lease reads across many selected publications fail first; bounded batch reads can be added later without changing schemas or authority, so no index, daemon or merge service is justified now.

## Task Breakdown

- [x] Promote ME-4C PRD to Approved with existing-commit carrier and AcceptanceReceipt projection decisions.
- [x] Add closed IntegrationContract, IntegrationEnvelope, AcceptanceMatrix and ProductAcceptanceProjection schemas and canonical digests.
- [x] Add strict Git/publication/requirement/evidence revalidation and immutable git-common-dir evidence storage.
- [x] Add local integration CLI JSON/text build/read/accept commands with no authority mutations.
- [x] Add two-publication, stale-fence, matrix-completeness, receipt-authority and route-inventory fixtures.
- [x] Register the ArchContext capability/workstream and run focused plus complete repository verification.

## Verification

- Focused ME-4C core/effect/CLI suites with a two-publication exact-candidate fixture.
- Existing Publication lifecycle and AcceptanceReceipt suites.
- `bun run check:type` and full `bun test --timeout 60000`.
- Deploy SQL, architecture sync, task sync, strict workflow, project-state inspection and init dry-run.
- Exact-subject Change Assessment and typed AcceptanceReceipt before merge.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Promote ME-4C PRD to Approved with existing-commit carrier and AcceptanceReceipt projection decisions.
- [x] Add closed IntegrationContract, IntegrationEnvelope, AcceptanceMatrix and ProductAcceptanceProjection schemas and canonical digests.
- [x] Add strict Git/publication/requirement/evidence revalidation and immutable git-common-dir evidence storage.
- [x] Add local integration CLI JSON/text build/read/accept commands with no authority mutations.
- [x] Add two-publication, stale-fence, matrix-completeness, receipt-authority and route-inventory fixtures.
- [x] Register the ArchContext capability/workstream and run focused plus complete repository verification.
