> **Archived**: 2026-09-05 13:12
> **Related Plan**: plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-1312
> **Archive Projection V1**: `plans/plan-20260904-0517-acceptance-redaction-idempotence.md` => `plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md`
> **Archive Projection V1**: `tasks/notes/20260904-0517-acceptance-redaction-idempotence.notes.md` => `tasks/archive/notes-20260905-1312-acceptance-redaction-idempotence.md`
> **Archive Projection V1**: `tasks/contracts/20260904-0517-acceptance-redaction-idempotence.contract.md` => `tasks/archive/contract-20260905-1312-acceptance-redaction-idempotence.md`
> **Archive Projection V1**: `tasks/reviews/20260904-0517-acceptance-redaction-idempotence.review.md` => `tasks/archive/review-20260905-1312-acceptance-redaction-idempotence.md`

# Plan: Acceptance redaction idempotence

> **Status**: Archived
> **Created**: 20260904-0517
> **Slug**: acceptance-redaction-idempotence
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: AcceptanceReceipt publication authority is broken across prepare and finalize, directly blocking a verified BYOK release unit.
> **Verification Boundary**: Focused acceptance-receipt regression plus the repository root required checks on the exact frozen subject.
> **Rollback Surface**: Revert the command-canonicalization helper, packaged mirror, focused tests, and this workflow package together.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-1312-acceptance-redaction-idempotence.md`
> **Task Review**: `tasks/archive/review-20260905-1312-acceptance-redaction-idempotence.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-1312-acceptance-redaction-idempotence.md`

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

- Active plan: `plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md`
- Sprint contract: `tasks/archive/contract-20260905-1312-acceptance-redaction-idempotence.md`
- Sprint review: `tasks/archive/review-20260905-1312-acceptance-redaction-idempotence.md`
- Implementation notes: `tasks/archive/notes-20260905-1312-acceptance-redaction-idempotence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-1312-acceptance-redaction-idempotence.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md`.

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
- Contract file: `tasks/archive/contract-20260905-1312-acceptance-redaction-idempotence.md`
- Review file: `tasks/archive/review-20260905-1312-acceptance-redaction-idempotence.md`
- Implementation notes file: `tasks/archive/notes-20260905-1312-acceptance-redaction-idempotence.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1312-acceptance-redaction-idempotence.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the command-canonicalization helper, packaged mirror, focused tests, and this workflow package together.
- **Verification boundary**: Focused acceptance-receipt regression plus the repository root required checks on the exact frozen subject.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-1312-acceptance-redaction-idempotence.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: AcceptanceReceipt publication authority is broken across prepare and finalize, directly blocking a verified BYOK release unit.

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-1312-acceptance-redaction-idempotence.md`, `tasks/archive/review-20260905-1312-acceptance-redaction-idempotence.md`, and `tasks/archive/notes-20260905-1312-acceptance-redaction-idempotence.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-1312-acceptance-redaction-idempotence.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the command-canonicalization helper, packaged mirror, focused tests, and this workflow package together.

## Captured Planning Output

## Goal

Restore AcceptanceReceipt stability when `verify-sprint` finalization re-emits already-redacted command evidence. The same semantic verification run must retain one canonical fingerprint across prepare, receipt record, final verify, archive, and ship.

## P1 Architecture Map

- `src/core/evidence/redaction.ts` owns persisted evidence redaction.
- `scripts/verify-sprint.sh` prepares and later finalizes acceptance evidence, including materialized command records.
- `scripts/acceptance-receipt.ts` owns the canonical verification-evidence fingerprint used by receipt freshness checks; its packaged mirror is `assets/templates/helpers/acceptance-receipt.ts`.
- AcceptanceReceipt freshness is the publication authority. Storage redaction remains security authority and is out of scope unless the regression proves canonicalization cannot solve the issue.
- Out of scope: weakening secret detection, accepting stale receipts, changing BYOK product code, or adding compatibility/fallback semantics.

## P2 Concrete Trace

1. A focused verifier command containing `real-server-longpoll-stall-dedup` is persisted.
2. Evidence redaction replaces the high-entropy substring with `sha256:<digest>`.
3. `acceptance-receipt record` fingerprints the materialized `commands` field containing that marker.
4. Final `verify-sprint` re-emits the already-materialized checks object.
5. Redaction hashes the embedded digest again, producing `sha256:sha256:<digest>`.
6. Receipt verification fingerprints a different command string and rejects the otherwise unchanged subject as stale.

Error boundary: any semantic command change, status change, subject change, or non-redaction evidence change must still invalidate the receipt.

## P3 Decision Rationale

Keep persisted-event redaction and the full AcceptanceReceipt `commands` fingerprint unchanged. Finalization must replay the immutable raw run snapshot referenced by the already receipt-verified projection, validate that snapshot against the frozen subject/contract/assessment, and stop emitting when the same evidence is already finalized. This preserves the existing authorities instead of hiding producer drift in canonicalization.

At 10x scale the first pressure point is command-array volume, but normalization is linear in the already-bounded canonical payload and introduces no additional I/O or authority.

## Allowed Paths

- `scripts/verify-sprint.sh`
- `assets/templates/helpers/verify-sprint.sh`
- `tests/evidence-projection-drift.test.ts`
- plan, contract, review, notes, and generated workflow state for this work-package

## Acceptance Criteria

- A regression test reproduces single-hash to double-hash re-materialization and proves finalization instead replays the raw snapshot to produce the original single-redacted command.
- Repeated finalization produces no divergent accepted event.
- The raw snapshot is validated against the receipt-bound subject, contract, and Change Assessment before emission.
- Source and packaged helper remain byte-aligned through the repository's canonical sync mechanism.
- Focused tests and all root required checks pass on the exact subject.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add the repeated-finalization projection regression guard for re-redacted command markers.
- [x] Implement immutable prepared-snapshot replay and idempotent finalization, then sync the packaged helper mirror.
- [x] Run focused tests and inspect the exact diff for security-boundary preservation.
- [x] Run the repository's full required checks and bind acceptance to the frozen subject.
- [x] Publish the fix through a reviewed PR, merge it, and use the fixed source-bound harness to unblock BYOK Step 4a publication.

## Historical Closeout

The repo-harness fix merged through PR #305 as `bacee3c66cab773dd18477b41cdb1e1a6636d3df`. BYOK Step 4a merged through Ancienttwo/byok-sdk PR #132 as `c7c53357e138bd82f716243589157dd58cbaa038`; its plan `plans/archive/plan-20260904-0421-wp3b-step4-longpoll-cursor-stop.md` records Outcome Completed. Both PR states and main ancestry were checked on 2026-09-05, closing the remaining publication checkbox.

Archive this family as Superseded by those landed deliveries. The historical review records an external_pass receipt, but this contract remains Active rather than Fulfilled; preserve that distinction and do not manufacture a sealed terminal triple. Durable disposition: `docs/researches/20260905-task-ledger-closeout.md`.
