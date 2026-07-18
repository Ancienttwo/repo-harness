# Plan: Sprint task: lsc-03-standard-contract-semantic-cutover

> **Status**: Executing
> **Created**: 20260718-1531
> **Slug**: lsc-03-standard-contract-semantic-cutover
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-03-standard-contract-semantic-cutover
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-03 Execution Base**: `origin/main@3c9cf80a` (post-LSC-02 merge PR #84 plus sprint backfill)
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md`; after execution revert branch `codex/lsc-03-standard-contract-semantic-cutover` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md`
> **Task Review**: `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md`
> **Implementation Notes**: `tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-03-standard-contract-semantic-cutover
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md`
- Sprint contract: `tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md`
- Sprint review: `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md`
- Implementation notes: `tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md`.

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
| `src/core/state/project-effective-state.ts` | Edit | Profile-aware `missing_contract` decision via `ArtifactRequirementPolicy.resolve` (first consumer switch) |
| `src/effects/state/resolve-effective-state.ts` | Edit (only if required) | Input wiring to reach the profile at the decision point; no other semantic change |
| `tests/effective-state.test.ts` | Edit | Re-pin Standard behavior; add standard-allows / strict-blocks / fail-closed regressions |
| `tests/state/project-effective-state.test.ts` | Edit | Update synthetic-inputs assertion of the unconditional blocker |
| `tests/cli/state-command.test.ts` | Edit | Re-anchor blocker-suppression fixture if needed |
| `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` | Edit | Pin LSC-03 Execution Base per successor rule |
| Contract/review/notes for this slug | Edit | Workflow envelope |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md`
- Review file: `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md`
- Implementation notes file: `tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md`; after execution revert branch `codex/lsc-03-standard-contract-semantic-cutover` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md`, `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md`, and `tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md`; after execution revert branch `codex/lsc-03-standard-contract-semantic-cutover` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: lsc-03-standard-contract-semantic-cutover

## Context

- Sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
- Backlog row: 3
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `lsc-03-standard-contract-semantic-cutover` so that the acceptance line holds: In an independent PR, make the approved Standard work-package contract policy identical across State, PreEdit, Stop, docs, and Skill guidance while Strict missing-contract/worktree states remain fail-closed

## Planning Expansion (resolved 2026-07-18)

The sprint row is expanded in place; the calibrated contract
`tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md`
is the execution authority. Decision-complete inputs:

- Contradiction to resolve (audit LOOP-01): `CEREMONY_GUIDANCE` Standard text
  (`src/core/state/project-effective-state.ts:21`) promises no separate
  contract, while the unconditional `missing_contract` blocker
  (`project-effective-state.ts:213-220`) blocks any approved/executing plan
  without one, collapsing Standard PreEdit into `WorkflowProfileGuard` exit 2.
- Cutover shape: first consumer switch of LSC-02's
  `src/core/workflow/artifact-requirement-policy.ts` — the blocker decision
  consults `resolve({ profile, operation: 'edit' })`; `separate_contract`
  required (strict) keeps blocking, not_required (standard) stops blocking,
  unresolvable profile stays fail-closed. Hooks are untouched: the PreEdit
  collapse disappears because State stops emitting the blocker; Strict's own
  guards (`.ai/hooks/pre-edit-guard.sh:256-274`) remain byte-identical.
- Frozen authority: `standard.edit.complete-work-package-no-contract-blocks`
  and `strict.edit.missing-contract-blocks` cells in
  `tests/state/fixtures/loop-semantics/characterization.json` (target deltas:
  "separate_contract becomes not_required by default", "remove the current
  missing_contract collapse into WorkflowProfileGuard"; Strict verdict stays
  block).
- Ship and Stop surfaces are out of scope (LSC-06..08 / LSC-07); the external
  Skill guidance line (`~/.codex/skills/repo-harness/SKILL.md:23`) is
  runtime-referenced, not vendored — recorded in notes, not part of the diff.
- Tests pinning the old collapse to update:
  `tests/effective-state.test.ts:248-254,410-419`,
  `tests/state/project-effective-state.test.ts:145-166`,
  `tests/cli/state-command.test.ts:106-123`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Wire the `missing_contract` decision in `src/core/state/project-effective-state.ts` to `ArtifactRequirementPolicy.resolve({ profile, operation: 'edit' })` (strict keeps blocking; standard stops; unresolvable profile fails closed; CEREMONY_GUIDANCE text unchanged)
- [x] Update the pinning tests and add regression cases (standard allows, strict blocks, lite unaffected, unresolvable fails closed)
- [x] Regenerate characterization `current` blocks via `UPDATE_LOOP_SEMANTICS_GOLDEN=1` under the contract's scoped authorization — round 2 additionally authorized editing the exact `standard.edit` hardcoded literal (test lines 866-880) and regenerating `tests/state/fixtures/missing-contract.json` via `UPDATE_EFFECTIVE_STATE_GOLDENS=1`; both golden diffs verified field-level delta-shaped (see notes)
- [x] Pin `LSC-03 Execution Base: origin/main@3c9cf80a` in the sprint header per successor rule
- [x] Record before/after behavior and the migration note (incl. external Skill guidance surface) in the notes file
- [x] Run the full Exit Criteria command surface in this worktree and record evidence — characterization test 3/3 deterministic passes, cli-state-golden 13/13, three named test files 60/60, check:type clean, full `bun test` 1635 pass / 1 skip / 0 fail
- [x] Author the task review, obtain independent external acceptance, and ship as an independent PR against base `3c9cf80a`
