# Plan: ME-2C Verified Evidence Context Projection

> **Status**: Archived
> **Created**: 20260826-0707
> **Slug**: me2c-verified-evidence-context
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: user-approved ME-1B through ME-2B sequence
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: exact Contract constraints, candidate-bound checkpoint chain, and Human-fenced decision state
> **Rollback Surface**: ME-2C schemas, immutable evidence store, bounded CLI, Contract semantic-constraint carrier, tests, PRD, ArchContext
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260824-persistent-module-engineer-organization.md`
> **Task Contract**: `tasks/contracts/20260826-0707-me2c-verified-evidence-context.contract.md`
> **Task Review**: `tasks/reviews/20260826-0707-me2c-verified-evidence-context.review.md`
> **Implementation Notes**: `tasks/notes/20260826-0707-me2c-verified-evidence-context.notes.md`

## Agentic Routing

- Selected route: planning
- Routing reason: shared evidence and Contract boundary with independent verification and rollback surface.
- Due diligence:
  - P1 map: canonical Contract remains intent authority; delegated-run bytes are untrusted input; ME-2C adds a pure checkpoint evidence projection and immutable decision store only.
  - P2 trace: exact tracked Contract revision -> strict semantic constraint catalog -> bounded proposal -> WorkerResult/run evidence -> exact candidate/check/verifier receipts -> continuous assertion -> trusted/untrusted context projection; open DecisionRequest blocks the next proposal until a revision-fenced Human answer.
  - P3 decision rationale: extend the existing Contract with one optional strict JSON semantic-constraint catalog and project it by exact Git revision/digest. Do not derive constraint IDs from headings, prose, timestamps, Provider history, or Worker claims.

## Workflow Inventory

- Active plan: `plans/plan-20260826-0707-me2c-verified-evidence-context.md`
- Sprint contract: `tasks/contracts/20260826-0707-me2c-verified-evidence-context.contract.md`
- Sprint review: `tasks/reviews/20260826-0707-me2c-verified-evidence-context.review.md`
- Implementation notes: `tasks/notes/20260826-0707-me2c-verified-evidence-context.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: task contract `allowed_paths`
- Execution isolation: `repo-harness run plan-to-todo --plan plans/plan-20260826-0707-me2c-verified-evidence-context.md`

## Decision Summary

Implement ME-2C as a control-plane evidence boundary, not an Agent runtime. A new strict `Semantic Constraint Catalog` JSON block lives inside the canonical task Contract; `SemanticContractProjectionV1` reads that exact tracked Git revision and binds its bytes, blob and constraint IDs. Proposal, round receipt and semantic assertion records are canonical and content addressed. The compiler accepts only one unique continuous subject-matching assertion chain and byte-valid evidence refs, separates trusted assertions from Worker prose, and refuses any open Human decision. Decision transitions use immutable event plus CAS current semantics. No ME-2C function imports or invokes Task, Lease, Publication, Acceptance, Provider or delegated-run mutation effects.

## P1 Architecture Map

- Authority: tracked task Contract bytes and existing Task/Claim/Lease/Engineer fences.
- Input evidence: existing `WorkerRunRefV1` and `WorkerResultV1`, exact candidate identity, check receipt and verifier receipt digests.
- New pure core: canonical schemas, exact-key validation, digests, chain selection and trusted/untrusted packet construction.
- New effects: tracked Contract projection, immutable content-addressed evidence persistence, evidence-byte revalidation, and per-decision lock/event/current crash recovery under Git common dir.
- New CLI: bounded create/read/compile/decision commands over explicit repository-owned JSON inputs.
- Out of scope: Provider turns/history/compaction, prompt assembly, runtime dispatch, Task/Lease/Publication/Acceptance transitions, writable delegation and timestamp-based latest selection.

## P2 Concrete Trace

1. Read one exact task Contract at a supplied Git revision; require a strict JSON semantic-constraint catalog and bind its exact bytes and constraint IDs into `SemanticContractProjectionV1`.
2. Build an `EngineerStepProposalV1` against exact task/binding fences, round index, previous assertion, contract projection and context packet. Every target constraint ID must exist in that exact Contract catalog.
3. Join one existing immutable WorkerResult and WorkerRunRef to the proposal and explicit candidate/before/after/evidence digests, yielding `WorkerRoundReceiptV1`; Worker prose remains untrusted.
4. Build an independent `SemanticVerificationAssertionV1` only when candidate, Contract, worker round, check and verifier subjects match. Constraint sets must be disjoint, complete for the proposal targets, and catalog-valid.
5. Compile a next context only from the unique continuous assertion chain rooted at null, exact evidence bytes and answered Human decisions. Forks, gaps, mutable evidence, subject drift or any open decision fail closed.
6. Decision open/answer/cancel/supersede writes immutable event first and updates current with expected-current CAS. Only Human may answer; crash retry with the same idempotency key resumes without timestamp inference.

## P3 Design Decision

The Contract itself carries stable semantic IDs because labels/free prose cannot be a machine authority and a separate sidecar would create dual truth. The extension is optional for ordinary contracts but mandatory for ME-2C projection, so existing workflows remain unchanged while trusted checkpoint creation fails closed without it. At 10x scale, repeated Git blob/evidence hashing is the first cost; immutable digest caches can be added later without changing authority. The smallest coherent P0 is schemas, exact projection, deterministic chain compiler and Human decision store—no runtime loop or mutation authority.

## Task Breakdown

- [x] Approve the ME-2C PRD by freezing the Contract carrier, verifier subject rules, chain selection and Human decision actor matrix.
- [x] Add strict canonical ME-2C core schemas and complete digest/subject/constraint validation.
- [x] Add exact tracked Contract projection plus immutable evidence and DecisionRequest event/current persistence.
- [x] Add deterministic continuous-chain compiler with trusted/untrusted separation and open-decision refusal.
- [x] Add bounded CLI create/read/compile/decision surfaces with no authority-transition imports.
- [x] Add deterministic schema, fork/gap, mutable evidence, subject drift and decision crash fixtures.
- [x] Register the ArchContext capability/workstream and pass focused, full, architecture, workflow and exact-subject acceptance gates.

## Evidence Contract

- **State/progress path**: this plan, its contract/review/notes, `tasks/current.md`, and the ME-2C workstream.
- **Verification evidence**: focused ME-2C tests, typecheck, full suite, required repository checks and exact-subject AcceptanceReceipt.
- **Evaluator rubric**: no unverified claim enters trusted context; no ambiguous chain is selected; no semantic record has an authority transition edge.
- **Stop condition**: task breakdown complete, exact-subject review passes and architecture projection is accepted/applied.
- **Rollback surface**: one ME-2C publication commit; immutable evidence has no Task/Lease/Publication/Acceptance pointer.

## Promotion Gate

- **Merge/PR unit**: one independently reviewable ME-2C control-plane capability.
- **Rollback surface**: ME-2C schemas, immutable store, CLI, Contract carrier, tests, PRD and ArchContext projection.
- **Verification boundary**: exact Contract constraint binding, unique continuous assertion chain, immutable evidence bytes and Human-fenced decision recovery.
- **Review/acceptance boundary**: the task review must pass all seven PRD acceptance scripts and prove no authority-transition import edge.
- **High-risk surface**: shared Contract semantics and trusted/untrusted evidence separation fail closed on missing, mutable, forked or stale inputs.
- **Why not checklist row**: this changes a shared evidence contract and has its own rollback, verification and Human acceptance boundary.

## Verification

- Focused core/store/CLI tests for all seven PRD acceptance scripts.
- Import and route inventory proving zero Provider/delegated-run mutation/Task/Lease/Publication/Acceptance edges.
- `bun run check:type`; `bun test --timeout 60000`; deploy SQL, architecture sync, task sync, strict workflow, project-state inspection and init dry-run.

## Rollback

Revert the single ME-2C publication commit. The Git-common evidence store is immutable and has no authority pointer; no daemon or external process remains.
