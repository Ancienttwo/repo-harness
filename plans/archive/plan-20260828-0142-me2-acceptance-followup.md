# Plan: ME-2 acceptance follow-up fixes

> **Status**: Archived
> **Created**: 20260828-0142
> **Slug**: me2-acceptance-followup
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused ME-2A/ME-2C oracles plus typecheck and task-sync green before merge
> **Rollback Surface**: Per-part commits on one revertable branch
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md`
> **Task Review**: `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md`
> **Implementation Notes**: `tasks/notes/20260828-0142-me2-acceptance-followup.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260828-0142-me2-acceptance-followup.md`
- Sprint contract: `tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md`
- Sprint review: `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md`
- Implementation notes: `tasks/notes/20260828-0142-me2-acceptance-followup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260828-0142-me2-acceptance-followup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260828-0142-me2-acceptance-followup.md`.

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
- Contract file: `tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md`
- Review file: `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md`
- Implementation notes file: `tasks/notes/20260828-0142-me2-acceptance-followup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260828-0142-me2-acceptance-followup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Per-part commits on one revertable branch
- **Verification boundary**: Focused ME-2A/ME-2C oracles plus typecheck and task-sync green before merge
- **Review/acceptance boundary**: `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260828-0142-me2-acceptance-followup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md`, `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md`, and `tasks/notes/20260828-0142-me2-acceptance-followup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Per-part commits on one revertable branch

## Captured Planning Output

## Goal

Close the ME-2 acceptance findings: bind the delegated-run environment into the evidence chain, close the proof-surface gap, deliver the typed rejection contract, and harden the two verified-context validation gaps.

## Context

Gatekeeper acceptance (2026-08-28) returned FAIL on ME-2A with three MEDIUM findings (proof surface != execution surface, unbound child env, dead rejection enums with a leaking ENOENT) and PASS on ME-2C with two low-cost hardening candidates. User approved one combined fix slice. The env binding is a hard prerequisite for any future writable delegation work.

## Scope

ME-2A closeout:
- `src/effects/engineers/delegated-run-store.ts`: dispatch and canary run with `inheritEnv: false` plus a minimal explicit env allowlist; the env set's digest is recorded in the process receipt and capability receipt.
- Same file: add a dispatch-surface denial probe (a write attempt under the same `codex exec --sandbox read-only` argv shape) so admission evidence covers the surface that actually executes, or — if a probe is infeasible on the exec surface — record the extrapolation explicitly in the PRD Known Unknowns and the capability receipt.
- Typed rejections: `trackedRegularFile` ENOENT becomes `delegated_run_profile_unavailable`, admission produces `role_profile_unavailable`, error messages carry repo-relative paths only; remove or wire the remaining dead enum values (`mode_unsupported`, `budget_invalid`, `sandbox_scope_mismatch`); regression tests for the missing-role path.

ME-2C hardening:
- `src/effects/engineers/verified-context-store.ts`: exactly-one Semantic Constraint Catalog assertion (matchAll count) + negative fixture.
- `src/core/engineers/verified-context.ts`: check receipt and verifier receipt must be distinct digests + negative fixture. Verify no persisted assertion data exists before tightening (fresh capability, expected none).

Out of scope: any writable delegation surface, ME-2B canary changes, `role_unavailable` naming beyond what the delegation schema already declares, PRD rewrites beyond the Known Unknowns entry if the probe route is infeasible.

## Verification Boundary

Focused oracles below green on the combined change before merge; no full-suite runs.

## Rollback Surface

Per-part commits on one revertable branch.

## Oracles

- `bun test tests/unit/me2a-me3b-readonly-delegation.test.ts tests/cli/delegation.test.ts --timeout 60000`
- `bun test tests/unit/me2c-verified-evidence-context.test.ts tests/cli/verified-context.test.ts --timeout 60000`
- `bun run check:type`
- `bash scripts/check-task-sync.sh`

## Task Breakdown

- [x] Env allowlist + receipt env digest for delegated runs.
- [x] Dispatch-surface denial probe or explicit Known Unknowns record.
- [x] Typed rejections, path hygiene, dead-enum cleanup, regression tests.
- [x] ME-2C catalog uniqueness + receipt distinctness with negative fixtures.
- [ ] Focused oracles, gatekeeper gate, merge, push.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Env allowlist + receipt env digest for delegated runs.
- [x] Dispatch-surface denial probe or explicit Known Unknowns record.
- [x] Typed rejections, path hygiene, dead-enum cleanup, regression tests.
- [x] ME-2C catalog uniqueness + receipt distinctness with negative fixtures.
- [ ] Focused oracles, gatekeeper gate, merge, push.
