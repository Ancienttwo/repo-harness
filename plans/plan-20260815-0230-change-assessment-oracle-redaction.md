# Plan: Fix Change Assessment oracle evidence redaction

> **Status**: Executing
> **Created**: 20260815-0230
> **Slug**: change-assessment-oracle-redaction
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260815-0230-change-assessment-oracle-redaction.md`; after execution revert branch `codex/change-assessment-oracle-redaction` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md`
> **Task Review**: `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md`
> **Implementation Notes**: `tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260815-0230-change-assessment-oracle-redaction.md`
- Sprint contract: `tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md`
- Sprint review: `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md`
- Implementation notes: `tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260815-0230-change-assessment-oracle-redaction.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260815-0230-change-assessment-oracle-redaction.md`.

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
- Contract file: `tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md`
- Review file: `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md`
- Implementation notes file: `tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260815-0230-change-assessment-oracle-redaction.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260815-0230-change-assessment-oracle-redaction.md`; after execution revert branch `codex/change-assessment-oracle-redaction` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260815-0230-change-assessment-oracle-redaction.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md`, `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md`, and `tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260815-0230-change-assessment-oracle-redaction.md`; after execution revert branch `codex/change-assessment-oracle-redaction` or the explicitly reviewed diff.

## Captured Planning Output

# Fix Change Assessment oracle ID evidence redaction

## Goal

Preserve committed Change Assessment oracle IDs byte-identically through evidence event redaction/materialization so assessment, packet, and envelope fingerprints remain verifiable by AcceptanceReceipt.

## P1 Architecture Map

`src/core/evidence/redaction.ts` classifies typed JSON string leaves before event payload redaction. `src/effects/evidence/event-writer.ts` applies it before ledger storage; checks materialization later projects those bytes. Change Assessment fingerprints in `src/core/review/change-assessment.ts` and AcceptanceReceipt verification in `scripts/acceptance-receipt.ts` require exact nested oracle IDs.

## P2 Concrete Trace

A strict release contract declares a long runtime-readback oracle ID. `verify-sprint --prepare-acceptance` builds a valid assessment envelope, then event emission passes the nested `required_oracles[].id` through entropy redaction. The ID becomes `sha256:...` while the precomputed assessment, packet, and evidence hashes remain unchanged. Materialized `checks/latest.json` therefore fails its own fingerprint check.

## P3 Design Decision

Add one structural entropy exemption only for `required_oracles/<array-index>/id`. Known-secret matching remains unconditional, and unrelated `id` fields remain entropy-redacted. This is the smallest change that preserves the committed public contract identifier without broadening the secret boundary.

## Scope

- Update the redaction classifier to use the full leaf path for Change Assessment oracle IDs.
- Add direct redaction and end-to-end materialization regressions.
- Synchronize required workflow artifacts.

## Non-Goals

- No general exemption for all `id` fields.
- No weakening of known-secret redaction or fingerprint verification.
- No release metadata changes.

## Verification

- Focused redaction/materializer/AcceptanceReceipt tests.
- Typecheck, helper parity, task/workflow checks, and hosted CI.

## Task Breakdown

- [x] Add a failing regression for long Change Assessment oracle IDs.
- [x] Implement the structural exemption while preserving known-secret redaction.
- [x] Run focused and required checks, review, and merge the bugfix PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a failing regression for long Change Assessment oracle IDs.
- [x] Implement the structural exemption while preserving known-secret redaction.
- [x] Run focused and required checks, review, and merge the bugfix PR.
