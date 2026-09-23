> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-1049-akn06-readiness.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-1049-akn06-readiness.md` => `plans/archive/plan-20260922-1049-akn06-readiness.md`
> **Archive Projection V1**: `tasks/notes/20260922-1049-akn06-readiness.notes.md` => `tasks/archive/notes-20260923-1409-akn06-readiness.md`
> **Archive Projection V1**: `tasks/contracts/20260922-1049-akn06-readiness.contract.md` => `tasks/archive/contract-20260923-1409-akn06-readiness.md`
> **Archive Projection V1**: `tasks/reviews/20260922-1049-akn06-readiness.review.md` => `tasks/archive/review-20260923-1409-akn06-readiness.md`

# Plan: AKN-06f stale acceptance invalidation

> **Status**: Archived
> **Created**: 20260922-1049
> **Slug**: akn06-readiness
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Publication contract drift through canonical acceptance to browser readiness
> **Rollback Surface**: Revert only the Publication acceptance reader binding and its guards
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260923-1409-akn06-readiness.md`
> **Task Review**: `tasks/archive/review-20260923-1409-akn06-readiness.md`
> **Implementation Notes**: `tasks/archive/notes-20260923-1409-akn06-readiness.md`

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

- Active plan: `plans/archive/plan-20260922-1049-akn06-readiness.md`
- Sprint contract: `tasks/archive/contract-20260923-1409-akn06-readiness.md`
- Sprint review: `tasks/archive/review-20260923-1409-akn06-readiness.md`
- Implementation notes: `tasks/archive/notes-20260923-1409-akn06-readiness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260923-1409-akn06-readiness.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-1049-akn06-readiness.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-1049-akn06-readiness.md`.

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
- Contract file: `tasks/archive/contract-20260923-1409-akn06-readiness.md`
- Review file: `tasks/archive/review-20260923-1409-akn06-readiness.md`
- Implementation notes file: `tasks/archive/notes-20260923-1409-akn06-readiness.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260923-1409-akn06-readiness.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-1049-akn06-readiness.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert only the Publication acceptance reader binding and its guards
- **Verification boundary**: Publication contract drift through canonical acceptance to browser readiness
- **Review/acceptance boundary**: `tasks/archive/review-20260923-1409-akn06-readiness.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-1049-akn06-readiness.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260923-1409-akn06-readiness.md`, `tasks/archive/review-20260923-1409-akn06-readiness.md`, and `tasks/archive/notes-20260923-1409-akn06-readiness.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260923-1409-akn06-readiness.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert only the Publication acceptance reader binding and its guards

## Captured Planning Output

## Goal
Close OB-06's reproduced stale contract acceptance in Publication readiness. Read the existing canonical AcceptanceVerificationObservation for the current contract instead of trusting subject-only effective-state acceptance. Preserve existing head/base refusals and canonical-only Done.

## P1 / P2 / P3
P1: collectLocal joins Lease, Publication, merge seal, checks and effective-state. Effective-state deliberately excludes workflow artifacts from semantic review subject; its checks freshness compares active plan plus subject only. AcceptanceVerificationObservation already owns a verified contract/goal-bound disposition, and the sealed AcceptanceReceipt digest links it to the Publication. No new acceptance policy or storage is needed.
P2: After real accepted evidence, changing allowed_paths changes contract bytes without changing semantic subject. The current collector consequently preserves local_evidence_fresh and pass acceptance. Read the canonical observation keyed by the current contract's existing authorityFingerprint, verify its receipt digest against the current sealed receipt, current goal authority and Publication subject/base. Missing/malformed/mismatched facts yield missing acceptance and stale verification. Bind observation/receipt readback to the existing double-read token. No GET executes verifier or writes observations.
P3: Restrict the fix to the Publication reader; do not redefine global effective-state semantics, rerun acceptance policy, invent a hash normalization, add aliases or legacy fallback. Exact stored observation becomes required; old incomplete evidence fails closed. At10x repository size the added reads remain one selected contract/goal/receipt/observation per local readiness observation, without full verifier execution or provider calls. Status/Last Updated lifecycle normalization remains owned by authorityFingerprint.

## Files / verification boundary
src/effects/publication/merge-readiness.ts; tests/unit/merge-readiness-v1-effect.test.ts for a real local positive fixture and contract-change/missing/malformed/stale provenance guards; tests/unit/merge-readiness-v1.test.ts for individual head/base and completed-without-authority negatives; tests/operator-web/operator-interactions.test.tsx for ready→in_review refresh. Existing fleet/core/DTO authority remains unchanged unless a proven direct defect requires plan amendment. Own research/plan/contract/review/notes/todos and deterministic architecture manifest only.

## Verification
Record an actual pre-fix failing regression guard before editing production source. Run the two readiness suites, unit fleet-board and Operator interaction suite, typecheck, production browser build and root nine checks. Browser DOM guard consumes projected readiness and must remove the former green placement without producing Done. No full suite, provider/model call, runtime installation or main merge. Current architecture proof and one semantic acceptance are still required before PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture production-local pre-fix contract drift guard.
- [x] Bind Publication readiness to canonical acceptance observation.
- [x] Verify head/base/contract and browser invalidation with existing authority.
- [x] Commit the locally verified candidate.
- [ ] Complete architecture/semantic acceptance before PR.
