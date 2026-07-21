# Plan: Closeout Single Acceptance Authority

> **Status**: Review
> **Created**: 20260721-0601
> **Slug**: closeout-single-acceptance-authority
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Focused acceptance/seal/closeout/CI fixtures plus the mandatory repo checks once after code freeze
> **Rollback Surface**: Revert the single PR before HRD-08; discard host-state receipts/seals and recreate any downstream contract without compatibility reads
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md`
> **Task Review**: `tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260721-0601-closeout-single-acceptance-authority.md`
- Sprint contract: `tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md`
- Sprint review: `tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md`
- Implementation notes: `tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260721-0601-closeout-single-acceptance-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260721-0601-closeout-single-acceptance-authority.md`.

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
- Contract file: `tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md`
- Review file: `tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md`
- Implementation notes file: `tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260721-0601-closeout-single-acceptance-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR before HRD-08; discard host-state receipts/seals and recreate any downstream contract without compatibility reads
- **Verification boundary**: Focused acceptance/seal/closeout/CI fixtures plus the mandatory repo checks once after code freeze
- **Review/acceptance boundary**: one typed `AcceptanceReceipt` must record `external_pass` or a contract-allowed `user_waiver`; the review file only projects that receipt.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260721-0601-closeout-single-acceptance-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md`, `tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md`, and `tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: the contract-frozen reviewer records one typed semantic disposition; review Markdown is not an authoring authority
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and one contract-allowed AcceptanceReceipt disposition is recorded
- **Rollback surface**: Revert the single PR before HRD-08; discard host-state receipts/seals and recreate any downstream contract without compatibility reads

## Captured Planning Output

## Goal

Replace the current two-semantic-review closeout with one typed semantic AcceptanceReceipt and one provider-free local merge seal. Preserve Codex/host safety approval for the one private-diff transfer, keep user waiver distinct from external pass, and ensure target-base movement without path overlap only recomputes the local seal.

## Scope

- Work-package 1: remove `codex/**` push CI, add workflow concurrency cancellation, classify `merge-gate` under closeout timeout, and freeze/fetch the target base before expensive closeout verification.
- Work-package 2: add a strict AcceptanceReceipt authority, freeze reviewer identity in the task contract, make review Markdown a projection, cut verify-sprint/finish/ship over to the receipt, and remove the Claude call plus host reviewer runtime from merge-gate.
- Retain exact base/head/full-diff binding in the local seal and deterministic lifecycle allowances.
- Do not merge, edit, or absorb the concurrent `solo-operator-acceptance-policy` worktree.

## P1 Architecture Map

- Semantic subject authority: `src/effects/review/diff-fingerprint.ts` and `src/cli/hook/review-subject.ts`.
- Current prose acceptance authority: `assets/hooks/lib/workflow-state.sh`, projected to `.ai/hooks/lib/workflow-state.sh`.
- Closeout orchestration: `scripts/verify-sprint.sh`, `scripts/contract-worktree.sh`, and `scripts/ship-worktrees.sh`, plus packaged mirrors.
- Current second reviewer and mixed receipt/seal: `scripts/merge-gate.ts` and its packaged mirror.
- Runtime/install surfaces: `src/cli/runtime/helper-runner.ts`, `src/cli/commands/init.ts`, workflow contract manifests, templates, and merge-gate skill/agent assets.
- CI authority: `.github/workflows/ci.yml`.

## P2 Concrete Trace

Current: review card external pass -> workflow-state Markdown parser -> verify-sprint -> contract-worktree candidate commit -> merge-gate invokes Claude again -> mixed PASS receipt -> archive lifecycle commit -> receipt verify -> branch push -> duplicate branch-push and PR CI.

Target: fetch/freeze base -> one final verification evidence bundle -> one external semantic review or typed user waiver -> AcceptanceReceipt -> deterministic review projection -> provider-free exact local seal -> one PR CI -> one merge authorization -> merge.

## P3 Decision

Use one strict JSON receipt written to host-owned repo-harness state. The receipt binds normalized subject, goal, contract, canonical verification evidence, benchmark evidence, target revision/path overlap, reviewer identity, and a closed disposition `external_pass|user_waiver|reject`. Contract activation freezes the reviewer; waiver is legal only when the contract explicitly allows it. `merge-gate` consumes the receipt and writes/verifies an exact local seal without provider credentials or calls. Delete the old review-prose authority and second Claude runner in the same cutover; do not preserve dual reads or compatibility aliases.

## Task Breakdown

- [x] Land closeout waste guardrails: CI trigger/concurrency, base preflight ordering, and merge-gate timeout coverage.
- [x] Add strict task-contract acceptance policy and AcceptanceReceipt schema/store/verification/projection.
- [x] Cut workflow-state, verify-sprint, finish, and ship consumers to the receipt authority.
- [x] Convert merge-gate to a provider-free exact local seal and remove obsolete Claude runtime installation/assets.
- [x] Add composition fixtures proving one provider call, no duplicate verification, typed waiver semantics, subject invalidation rules, overlap behavior, seal binding, and one PR CI trigger.
- [x] Sync generated hook/helper/manifest projections and update workflow reference docs/artifacts.
- [x] Run focused tests, then the mandatory repo checks once after code freeze.

## Non-Goals

- Do not weaken or disable Codex built-in private-diff approval.
- Do not synthesize semantic acceptance when a provider is unavailable.
- Do not add compatibility parsing for legacy review prose or pre-cutover receipts.
- Do not start HRD-08 before this package is merged.

## Verification

- Focused: acceptance receipt, merge gate, workflow-state, helper scripts, closeout-runner timeout, and CI workflow fixtures.
- Mandatory after freeze: `bun test`, deploy SQL order, architecture sync, task sync, strict workflow check, project-state inspection, and adopt dry-run.

## Rollback

Revert the single work-package PR before starting HRD-08. Host-state receipts/seals are runtime cache and may be deleted. If a downstream contract has already been created under the new schema, abandon and recreate that worktree after the revert; do not add a dual-read rollback shim.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Land closeout waste guardrails: CI trigger/concurrency, base preflight ordering, and merge-gate timeout coverage.
- [x] Add strict task-contract acceptance policy and AcceptanceReceipt schema/store/verification/projection.
- [x] Cut workflow-state, verify-sprint, finish, and ship consumers to the receipt authority.
- [x] Convert merge-gate to a provider-free exact local seal and remove obsolete Claude runtime installation/assets.
- [x] Add composition fixtures proving one provider call, no duplicate verification, typed waiver semantics, subject invalidation rules, overlap behavior, seal binding, and one PR CI trigger.
- [x] Sync generated hook/helper/manifest projections and update workflow reference docs/artifacts.
- [x] Run focused tests, then the mandatory repo checks once after code freeze.
