> **Archived**: 2026-09-05 02:27
> **Related Plan**: plans/archive/plan-20260905-0119-brc3-development-campaign-core.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0227
> **Archive Projection V1**: `plans/plan-20260905-0119-brc3-development-campaign-core.md` => `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/notes/20260905-0119-brc3-development-campaign-core.notes.md` => `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0119-brc3-development-campaign-core.contract.md` => `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0119-brc3-development-campaign-core.review.md` => `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`

# Plan: BRC3 development campaign core

> **Status**: Archived
> **Created**: 20260905-0119
> **Slug**: brc3-development-campaign-core
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC3 — Campaign protocol、policy key、ProgramAuthorization 复用、append-only journal、cross-process lock
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`; after execution revert branch `codex/brc3-development-campaign-core` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md`
> **Task Review**: `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC3 — Campaign protocol、policy key、ProgramAuthorization 复用、append-only journal、cross-process lock
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`
- Sprint contract: `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md`
- Sprint review: `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`
- Implementation notes: `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-0119-brc3-development-campaign-core.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`.

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
- Contract file: `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md`
- Review file: `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`
- Implementation notes file: `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`; after execution revert branch `codex/brc3-development-campaign-core` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md`, `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`, and `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`; after execution revert branch `codex/brc3-development-campaign-core` or the explicitly reviewed diff.

## Captured Planning Output

## Goal
Implement sprint row BRC3 as the bounded campaign foundation: one exact ProgramAuthorizationV1 campaign payload, target-base policy, canonical campaign protocol, Git-common-dir append-only journal, cross-process serialization, and operator CLI.

## P1 Architecture Map
- Authority: src/core/automation/budget.ts and src/effects/automation/grant-store.ts own ProgramAuthorizationV1 and host-owned grant bytes.
- Campaign core: add src/core/automation/development-campaign.ts for exact-key definition/event/current schemas and deterministic fold.
- Campaign effects: add src/effects/automation/development-campaign-policy.ts and development-campaign-store.ts; reuse resolveGitCommonDirectory and exclusive-directory-lock.
- Entrypoint: add src/cli/commands/campaign.ts and register it in src/cli/index.ts.
- Configuration/projection: .ai/harness/policy.json plus initialized policy fixtures; add capability.runtime-harness.development-campaign and its owned component/relations/flows.
- Frozen boundaries: Task, Lease, publication, acceptance, issue authoring, materialization, execution, merge, and cleanup remain out of scope.

## P2 Concrete Trace
campaign create reads a canonical request -> reads the stored host ProgramAuthorizationV1 by digest -> requires a non-null campaign payload and exact repo/ref/revision binding -> reads development_campaign and external_sources from the authorized target revision -> rejects off, disabled intake, expired grants, limits, and non-manual merge -> acquires a Git-common-dir lock -> persists immutable definition and first event -> folds events into current -> atomically publishes current. Replay with the same idempotency key and bytes returns the existing result; different bytes reject. Read rebuilds from events and rejects a divergent current projection.

## P3 Decision Rationale
- Add one required campaign field to ProgramAuthorizationV1 with value null or a closed CampaignAuthorizationPayloadV1. Required null preserves one exact schema; no optional/fallback parser and no second authorization protocol.
- Model the runtime mode as off|shadow|active; manual is enforced by ProgramAuthorizationV1.merge_mode, matching the PRD active/manual rung without inventing a fourth mode.
- Read policy at target_revision, never from candidate working bytes, so a candidate cannot authorize itself or raise limits.
- Reuse existing canonical message mechanics and exclusive lock; do not create generalized journal or policy abstractions.
- At 10x event volume, full-fold read cost is the first limit; BRC3 preserves rebuildability and correctness, while indexing/checkpoints remain out of scope until measured.

## Task Breakdown
- [x] Extend ProgramAuthorizationV1 and its canonical PRD schema with required campaign: ProgramAuthorizationCampaignV1 | null, exact validation, sealing, and migrated fixtures.
- [x] Add closed development_campaign policy with default off, explicit limits, target-revision loading, and external_sources precondition.
- [x] Add exact-key campaign definition/event/current protocol and deterministic event-chain fold.
- [x] Add Git-common-dir store at repo-harness/development-campaigns/v1 with immutable events, replay conflict detection, projection reconciliation, and exclusive lock.
- [x] Add campaign create/append/read CLI; every mutation fails in off mode and create requires external_sources non-off.
- [x] Create the development-campaign ArchContext capability, resolve the pending boundary transition, and update the BRC0 protected inventory closure/correct capability names.
- [x] Add focused unit/effect/CLI/concurrency tests and run required repository gates.

## Acceptance
- No DevelopmentCampaignAuthorizationV1 exists; the host grant digest binds the closed campaign payload.
- development_campaign defaults off; off mutations fail; target-base policy limits and external_sources precondition fail closed.
- Store root is exactly the Git common directory path required by the PRD; events are append-only and current is fully rebuildable.
- Same-key identical replay is idempotent; conflicting replay rejects; two processes serialize through the existing lock.
- Candidate policy changes cannot widen the authorized target-base policy.
- Focused tests, typecheck, architecture/task/workflow checks, project inspection, init dry-run, and full bun test pass.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Extend ProgramAuthorizationV1 and its canonical PRD schema with required campaign: ProgramAuthorizationCampaignV1 | null, exact validation, sealing, and migrated fixtures.
- [x] Add closed development_campaign policy with default off, explicit limits, target-revision loading, and external_sources precondition.
- [x] Add exact-key campaign definition/event/current protocol and deterministic event-chain fold.
- [x] Add Git-common-dir store at repo-harness/development-campaigns/v1 with immutable events, replay conflict detection, projection reconciliation, and exclusive lock.
- [x] Add campaign create/append/read CLI; every mutation fails in off mode and create requires external_sources non-off.
- [x] Create the development-campaign ArchContext capability, resolve the pending boundary transition, and update the BRC0 protected inventory closure/correct capability names.
- [x] Add focused unit/effect/CLI/concurrency tests and run required repository gates.
