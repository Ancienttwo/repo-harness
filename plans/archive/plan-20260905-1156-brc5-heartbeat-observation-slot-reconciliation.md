> **Archived**: 2026-09-05 18:16
> **Related Plan**: plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-1816
> **Archive Projection V1**: `plans/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` => `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.notes.md` => `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.contract.md` => `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.review.md` => `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`

# Plan: Sprint task: BRC5 — Heartbeat observation 与 slot reconciliation

> **Status**: Archived
> **Created**: 20260905-1156
> **Slug**: brc5-heartbeat-observation-slot-reconciliation
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC5 — Heartbeat observation 与 slot reconciliation
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`; after execution revert branch `codex/brc5-heartbeat-observation-slot-reconciliation` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Task Review**: `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC5 — Heartbeat observation 与 slot reconciliation
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`
- Sprint contract: `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Sprint review: `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Implementation notes: `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`.

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
- Contract file: `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Review file: `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Implementation notes file: `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`; after execution revert branch `codex/brc5-heartbeat-observation-slot-reconciliation` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`, `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`, and `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`; after execution revert branch `codex/brc5-heartbeat-observation-slot-reconciliation` or the explicitly reviewed diff.

## Captured Planning Output

P1 — Map: BRC4 owns immutable issue-batch intent, exact three-field marker and browser session records. External-sources owns provider list/read, pagination failure classification, immutable ProviderIssueObservationV1 and source revisions. Campaign store owns authorization, CAS event history and cross-process lock. BRC5 supplies the missing reconciliation and bounded observation step; the existing heartbeat-triage remains read-only.

P2 — Trace: campaign step loads persisted intent/session under the campaign boundary, returns idle without provider calls when no authoring request is in flight, verifies deadline and exact main, obtains one complete provider list snapshot, validates marker and strict metadata, persists the deterministic slot reconciliation and at most one external mutation reservation/result. Unavailable or partial snapshots fail closed. Previously valid issue body edits become issue_source_drift. Invalid metadata can receive one targeted edit; its changed observation is the explicitly authorized exception, and failed repair becomes unfilled. Duplicate slots always require human attention.

P3 — Decide: reuse fetchGithubIssues and ProviderIssueObservationV1, never search or titles as authority. Keep one strict fenced JSON metadata parser with exact fields from the existing authoring contract. Keep campaign core protocol mutations under the parent integration owner; do not add competing campaign state authority. Persist-first reservations make unknown external outcomes require reconciliation instead of blind retry. Comment and close are two separate steps, each one mutation. Deadline derives from persisted intent timestamps. At 10x, bounded provider pagination fails first with snapshot_incomplete; do not adopt partial results. Rollback is this isolated BRC5 diff; persisted evidence stays immutable and is never silently translated.

## Execution Scope

- Core owner: src/core/automation/issue-batch-reconcile.ts and tests/unit/issue-batch-reconcile.test.ts; strict metadata parsing, deterministic matrix and fail-closed errors.
- Effect owner: src/effects/automation/issue-batch-observer.ts, observation store integration and tests/effects/issue-batch-observer.test.ts; existing provider read authority and durable evidence.
- Parent integration: campaign step/CLI, issue-batch-store.ts, development-campaign-store.ts lock boundary as needed, tests/effects/campaign-step.test.ts, tests/cli/development-campaign.test.ts, gpt-pro-issue-authoring.ts prompt format, architecture and task artifacts.
- This slice may exceed eight files because core, provider effects, CLI, tests and workflow evidence form one verification boundary. No adoption/materialization, task planning, acquisition, general budget reimplementation, cleanup of merged tasks or audit sequencing in BRC5.

## Frozen Contracts

- Metadata is exactly one fenced json object containing protocol=1, kind=repo-harness-campaign-issue-metadata, issue_kind, primary_capability, priority, depends_on_slots, suspected_paths. Missing/malformed metadata is slot_invalid only when a valid exact marker identifies a declared slot. Malformed markers never infer slot from title or fixture labels.
- Reconciliation consumes a complete provider snapshot, validates immutable observation digests, ignores wrong campaign/group, rejects duplicate declared slots, records undeclared same-group issues separately, and distinguishes missing from exhausted repair/unfilled.
- Reconciliation outcomes and failures cover complete, incomplete, issue_batch_ambiguous, slot_invalid, issue_source_drift, issue_provider_unavailable, issue_provider_snapshot_incomplete, source_main_stale and issue_slot_unexpected.
- Heartbeat returns idle plus next_check_at without external calls when no durable in-flight authoring exists. Expired intents yield campaign_no_progress. Provider mutations require reservation before invocation; replay of an unresolved reservation is reconciliation_required. A step emits at most one provider mutation. Unexpected issue reason comment precedes not_planned close across separate steps.
- BRC6 follows the resolved PRD challenge_verified requirement; its older bundle_only Sprint text is stale and will be corrected in that slice. BRC5 does not grant adoption authority.

## Task Breakdown
- [x] Implement strict metadata and pure slot reconciliation with the full BRC5 matrix.
- [x] Implement bounded provider observation and immutable local evidence using the existing external-source authority.
- [x] Integrate durable heartbeat step, one-shot repair and orphan comment/close; expose campaign step CLI.
- [ ] Preserve full-suite baseline `3958ce3f` (4363 pass, 0 fail, 4 skip), then run current-subject BRC5 and main-integration delta tests, type/boundary and repository integrity checks under the revised contract; do not relabel the historical full pass.
- [ ] Record one acceptance review, synchronize architecture and tasks, and finish the contract worktree.

> **Substantive Change SHA256**: `sha256:3bb88eddf19a3d9354d2d6dd200d23cc317ddd0cb9dfed45c2a74ef8508f861c`
