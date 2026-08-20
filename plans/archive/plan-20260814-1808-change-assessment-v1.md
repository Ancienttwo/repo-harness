# Plan: Change Assessment v1

> **Status**: Archived
> **Created**: 20260814-1808
> **Slug**: change-assessment-v1
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Deterministic assessment, prepared verification evidence, receipt validation, and required repository checks.
> **Rollback Surface**: Revert the change-assessment branch commit; no acceptance receipt or production scheduler state is mutated by this work.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260814-1808-change-assessment-v1.contract.md`
> **Task Review**: `tasks/reviews/20260814-1808-change-assessment-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260814-1808-change-assessment-v1.notes.md`

## Agentic Routing
- Selected route: complex-engineering-plan
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260814-1808-change-assessment-v1.md`
- Sprint contract: `tasks/contracts/20260814-1808-change-assessment-v1.contract.md`
- Sprint review: `tasks/reviews/20260814-1808-change-assessment-v1.review.md`
- Implementation notes: `tasks/notes/20260814-1808-change-assessment-v1.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260814-1808-change-assessment-v1.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260814-1808-change-assessment-v1.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260814-1808-change-assessment-v1.md`.

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
- Contract file: `tasks/contracts/20260814-1808-change-assessment-v1.contract.md`
- Review file: `tasks/reviews/20260814-1808-change-assessment-v1.review.md`
- Implementation notes file: `tasks/notes/20260814-1808-change-assessment-v1.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260814-1808-change-assessment-v1.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260814-1808-change-assessment-v1.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the change-assessment branch commit; no acceptance receipt or production scheduler state is mutated by this work.
- **Verification boundary**: Deterministic assessment, prepared verification evidence, receipt validation, and required repository checks.
- **Review/acceptance boundary**: `tasks/reviews/20260814-1808-change-assessment-v1.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260814-1808-change-assessment-v1.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260814-1808-change-assessment-v1.contract.md`, `tasks/reviews/20260814-1808-change-assessment-v1.review.md`, and `tasks/notes/20260814-1808-change-assessment-v1.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260814-1808-change-assessment-v1.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the change-assessment branch commit; no acceptance receipt or production scheduler state is mutated by this work.

## Captured Planning Output

# Change Assessment v1

## P1 Global Architecture
- The canonical final subject is `buildReviewSubject`; the target is resolved exclusively from `.ai/harness/policy.json#worktree_strategy.review_base`.
- PostToolUse and Stop are advisory observers only. `verify-sprint --prepare-acceptance` recomputes the final subject and is the fail-closed decision boundary.
- `AcceptanceReceipt` remains the sole semantic merge authority and binds canonical verification evidence.

## P2 Data Flow
1. `verify-sprint --prepare-acceptance` resolves the strict review base and recomputes the normalized final subject.
2. `ChangeAssessment` selects subject-bound paths, closed reasons, and required oracles.
3. A `ReviewSelectionPacket` is validated before review and included in canonical verification evidence.
4. Review disagreement can only add escalation reasons; it cannot lower an existing requirement.
5. RuntimeEvidenceReceipt records CLI/npm release readback separately from merge acceptance.

## P3 Decision
- Reuse existing subject/base authority to avoid a second diff definition.
- Verification fails closed for missing/malformed policy, unresolved base, degraded subject, invalid packet, or absent required runtime evidence.
- Do not introduce model judgment, Hook journal history, protocol-3 receipt fields, scheduler, or service-auth readback.

## Implementation Scope
- WP0: freeze contract and docs.
- WP1: deterministic pure assessment plus characterization fixtures.
- WP2: prepare-acceptance evidence and ReviewSelectionPacket binding.
- WP3: CLI/npm RuntimeEvidenceReceipt protocol and fixtures.

## Task Breakdown
- [x] Add strict review-base resolver and deterministic change assessment.
- [x] Add selection packet, prepare-acceptance integration, and evidence binding.
- [x] Add runtime evidence receipt and CLI/npm readback fixtures.
- [x] Synchronize projected helpers and workflow/architecture documentation.
- [x] Run focused and required verification.
- [x] Close Gatekeeper remediation: per-path oracle coverage, subject-bound disagreement re-freeze, receipt recomputation, policy-base hunk novelty, and Bun-shebang PATH.
- [x] Close Gatekeeper round 2: installed package/tarball identity binding and rename-aware novelty hunks.
- [x] Synchronize strict assessment evidence in merge-gate and attested-import fixtures, then rerun the full suite.
- [x] Repair all affected verify-sprint fixtures with a legal Change Assessment oracle, package-complete helper runtime, and ignored generated packet cache.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add strict review-base resolver and deterministic change assessment.
- [x] Add selection packet, prepare-acceptance integration, and evidence binding.
- [x] Add runtime evidence receipt and CLI/npm readback fixtures.
- [x] Synchronize projected helpers and workflow/architecture documentation.
- [x] Run focused and required verification.
