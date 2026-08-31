> **Archived**: 2026-09-01 04:39
> **Related Plan**: plans/archive/plan-20260901-0205-external-source-binding-wp2.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260901-0439
> **Archive Projection V1**: `plans/plan-20260901-0205-external-source-binding-wp2.md` => `plans/archive/plan-20260901-0205-external-source-binding-wp2.md`
> **Archive Projection V1**: `tasks/notes/20260901-0205-external-source-binding-wp2.notes.md` => `tasks/archive/notes-20260901-0439-external-source-binding-wp2.md`
> **Archive Projection V1**: `tasks/contracts/20260901-0205-external-source-binding-wp2.contract.md` => `tasks/archive/contract-20260901-0439-external-source-binding-wp2.md`
> **Archive Projection V1**: `tasks/reviews/20260901-0205-external-source-binding-wp2.review.md` => `tasks/archive/review-20260901-0439-external-source-binding-wp2.md`

# Plan: External Source Binding WP2

> **Status**: Archived
> **Created**: 20260901-0205
> **Slug**: external-source-binding-wp2
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: parent-agent
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused binding protocol/store/effect/projection/CLI/authority tests plus all repository Required Checks.
> **Rollback Surface**: Revert the single external-source-binding-wp2 branch/PR; persisted binding receipts remain inert append-only evidence.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260901-0439-external-source-binding-wp2.md`
> **Task Review**: `tasks/archive/review-20260901-0439-external-source-binding-wp2.md`
> **Implementation Notes**: `tasks/archive/notes-20260901-0439-external-source-binding-wp2.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260901-0205-external-source-binding-wp2.md`
- Sprint contract: `tasks/archive/contract-20260901-0439-external-source-binding-wp2.md`
- Sprint review: `tasks/archive/review-20260901-0439-external-source-binding-wp2.md`
- Implementation notes: `tasks/archive/notes-20260901-0439-external-source-binding-wp2.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260901-0439-external-source-binding-wp2.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260901-0205-external-source-binding-wp2.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260901-0205-external-source-binding-wp2.md`.

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
- Contract file: `tasks/archive/contract-20260901-0439-external-source-binding-wp2.md`
- Review file: `tasks/archive/review-20260901-0439-external-source-binding-wp2.md`
- Implementation notes file: `tasks/archive/notes-20260901-0439-external-source-binding-wp2.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260901-0439-external-source-binding-wp2.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260901-0205-external-source-binding-wp2.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single external-source-binding-wp2 branch/PR; persisted binding receipts remain inert append-only evidence.
- **Verification boundary**: Focused binding protocol/store/effect/projection/CLI/authority tests plus all repository Required Checks.
- **Review/acceptance boundary**: `tasks/archive/review-20260901-0439-external-source-binding-wp2.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260901-0205-external-source-binding-wp2.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260901-0439-external-source-binding-wp2.md`, `tasks/archive/review-20260901-0439-external-source-binding-wp2.md`, and `tasks/archive/notes-20260901-0439-external-source-binding-wp2.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260901-0439-external-source-binding-wp2.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single external-source-binding-wp2 branch/PR; persisted binding receipts remain inert append-only evidence.

## Captured Planning Output

# External Source Binding WP2

## Thesis

Add one append-only, authorization-fenced edge receipt from an immutable provider observation revision to one exact canonical task revision. Multiple receipts naturally support one-to-many and many-to-one provenance. The binding remains provenance only: canonical sprint, approved plan/contract, TaskOffer, Lease and WorkEnvelope keep their current authority.

## P1: Architecture Map

- Source evidence authority: `src/core/external-sources/issue-observation.ts`, `src/effects/external-sources/store.ts`.
- Canonical task identity and revalidation authority: `src/core/state/coordination-identity.ts`, `src/effects/state/coordination-canonical-source.ts`.
- Dispatch authority remains `src/effects/fleet/acquire.ts`; no external-source code may mint TaskOffer, Claim, Lease, WorkEnvelope or runtime state.
- WP2 extends the existing `runtime-harness.external-source-intake` capability with a binding protocol, append-only store/effect, CLI mutation/read path and projection facts.

## P2: Concrete Trace

`repo-harness external-source bind --repo <id> --source-revision <digest> --sprint <path> --task-id <id> --target-ref <ref>` reads one strict registry snapshot, requires the repository to remain `read_write`, loads the immutable observation, reads the canonical sprint from the explicit target ref, resolves the exact task ID/revision, proves its approved plan/contract, re-reads registry/source/canonical authorities under the binding lock, then persists one canonical `ExternalSourceBindingReceiptV1`. `external-source list` joins receipts with latest observations and reports bound task edges plus `current|source_drift|canonical_drift|authority_stale`; Fleet later discovers the already-canonical task through its unchanged TaskOffer path and acquires it through the unchanged lease path.

## P3: Design Decision

- One receipt represents one source-revision-to-task-revision edge. This is the smallest closed relation that supports N:M provenance without a semantic duplicate matcher.
- The receipt carries the exact observation digest, canonical target commit, task revision, plan/contract digests and registry authorization revision. Revalidation is fail-closed before persistence.
- Provider title/body/labels/assignees remain untrusted. The only renderer wraps observation content in an explicit `[ExternalSourceUntrusted]` boundary and is never called by Fleet automatically.
- Source drift is attention, not automatic rebinding or cancellation. Canonical drift is also explicit; it never mutates or revives work.
- Human acceptance is the PR merge boundary. Binding, dispatch, execution and repair add no per-unit waiver/review pause. Missing authorization, provider credentials/capability or required host dependency remain the only installation-blocker class outside the automated loop.

At 10x scale, append-only scan/join cost fails first. WP2 keeps the reconstructable scan and adds no mutable index until measurement.

## Public Contracts

- `ExternalSourceBindingReceiptV1`: closed canonical schema and digest.
- `ExternalSourceBindingProjectionV1`: binding edge plus exact drift/authorization status.
- CLI `external-source bind`: mutation guarded by strict read-write registry authorization and all optimistic fences.
- CLI `external-source context`: explicit untrusted rendering for one immutable observation revision; no automatic prompt injection path.
- `external-source list` adds binding projection only; no TaskOffer readiness enum is duplicated.

## Scope

- Binding schema/validation/canonical bytes.
- Git-common-dir append-only binding store with lock, safe paths, idempotence and conflicts.
- Exact binding effect with registry, observation, canonical sprint/task and plan/contract revalidation.
- Projection and CLI surfaces.
- Focused protocol/store/effect/CLI/authority tests, docs and architecture/task artifacts.

Non-scope:
- Creating or editing GitHub Issues, labels, assignees, comments or PRs.
- Generating product requirements or canonical plans from provider text.
- Changing TaskOffer classification, priority, Claim/Lease, WorkEnvelope, worker runtime or publication semantics.
- Operator UI, background polling, webhook, GitLab adapter or mutable indexes.
- Semantic duplicate detection or heuristic task matching.

## Acceptance Scenarios

1. Exact source and canonical revisions produce one idempotent binding receipt.
2. One source can bind to multiple canonical tasks and multiple sources can bind to one task via separate receipts.
3. Source revision drift, canonical task drift and registry authorization drift are projected explicitly and never auto-rebound.
4. Unknown/ineligible source, read-only/unregistered repository, stale registry revision, missing/non-pending task, moved canonical target, or invalid plan/contract fails before persistence.
5. Concurrent identical binding reconciles idempotently; conflicting bytes for one identity fail closed.
6. Untrusted renderer includes exact provenance/digest and boundary markers; provider content cannot escape the data block or become standing instructions.
7. Binding and context operations leave TaskOffer, Claim, Lease, WorkEnvelope, collaboration and runtime stores byte-identical.
8. Existing Fleet offer/acquire tests remain unchanged and passing, proving the bridge terminates at canonical identity instead of adding a second scheduler.

## Verification

- Focused binding protocol, store, effect, projection, CLI and negative authority tests.
- `bun run check:type`
- `bun test --timeout 60000`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`

## Rollback

Revert this single branch/PR. Existing binding receipts remain inert bytes because no pre-WP2 authority reads them. Do not delete provider observations or mutate coordination/runtime state.

## Falsifier

If exact canonical task/plan proof cannot be revalidated independently of the caller's worktree, stop before writing receipts; do not substitute filenames, task labels, provider metadata or best-effort matching.

## Task Breakdown

- [x] Freeze binding protocol, authorization and untrusted-context boundaries.
- [x] Implement append-only binding store, exact bind/revalidation effect and projection.
- [x] Add CLI bind/context/list surfaces without changing Fleet authority.
- [x] Add focused tests, architecture/docs/task sync and run all required checks.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze binding protocol, authorization and untrusted-context boundaries.
- [x] Implement append-only binding store, exact bind/revalidation effect and projection.
- [x] Add CLI bind/context/list surfaces without changing Fleet authority.
- [x] Add focused tests, architecture/docs/task sync and run all required checks.
