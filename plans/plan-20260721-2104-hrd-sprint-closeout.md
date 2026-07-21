# Plan: HRD Sprint Closeout

> **Status**: Executing
> **Created**: 20260721-2104
> **Slug**: hrd-sprint-closeout
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Close the nine-row HRD sprint and preserve historical review bytes before pinning the post-closeout merge SHA for VGBR.
> **Rollback Surface**: Revert only the closeout PR; runtime, tests, benchmark evidence, and archived HRD reviews remain unchanged.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md`
> **Task Review**: `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md`
> **Implementation Notes**: `tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md`

## Agentic Routing
- Selected route: execution
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260721-2104-hrd-sprint-closeout.md`
- Sprint contract: `tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md`
- Sprint review: `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md`
- Implementation notes: `tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260721-2104-hrd-sprint-closeout.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260721-2104-hrd-sprint-closeout.md`.

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
- Contract file: `tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md`
- Review file: `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md`
- Implementation notes file: `tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260721-2104-hrd-sprint-closeout.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert only the closeout PR; runtime, tests, benchmark evidence, and archived HRD reviews remain unchanged.
- **Verification boundary**: Close the nine-row HRD sprint and preserve historical review bytes before pinning the post-closeout merge SHA for VGBR.
- **Review/acceptance boundary**: `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260721-2104-hrd-sprint-closeout.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md`, `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md`, and `tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert only the closeout PR; runtime, tests, benchmark evidence, and archived HRD reviews remain unchanged.

## Captured Planning Output

> **Task Profile**: ledger-closeout

## Decision Summary

Close the already-merged Hook Runtime Diet sprint without changing runtime,
tests, benchmark data, or historical review text. The current implementation
merge is `b5a98c903d3728002d2f663ba7a1b421913e368f` (PR #106), named
`HRD_RUNTIME_SHA`. This package does not predict or write its own merge SHA.
After the HRD-CLOSEOUT PR merges, the VGBR successor must fresh-fetch
`origin/main`, pin that exact merge commit as `POST_HRD_SHA`, and keep `main`
frozen through VGBR benchmark acceptance, including against docs-only merges.

## Why

HRD-01 through HRD-09 are merged and every backlog row is checked, but the
canonical sprint header still says `Approved`. HRD-08 and HRD-09 archived
reviews also retain historically accurate pre-merge pending language. Leaving
the sprint open makes EPC activation ambiguous; rewriting the archived reviews
would falsify history. This package closes only the lifecycle ledger and adds
an append-only supersession annotation outside the archived reviews.

## Goal

- Set the canonical Hook Runtime Diet sprint status to `Done`.
- Record `HRD_RUNTIME_SHA` as PR #106's immutable merge commit.
- Freeze the successor-pinned SHA rule: a package records the exact base it
  consumes and never predicts its own merge SHA; VGBR fresh-fetches and pins
  the HRD-CLOSEOUT merge commit as `POST_HRD_SHA`.
- Add one append-only historical-review supersession annotation in this
  package's notes; do not edit either archived review.
- Establish the strict serial dependency:
  `HRD-CLOSEOUT merge -> POST_HRD_SHA pin/freeze -> VGBR-R -> EPC-00 -> EPC-01`.

## P1: Architecture Map

- Effective State and Loop Semantics are fixed predecessor authorities.
- Hook Runtime Diet is an already-landed runtime implementation surface.
- This package owns only the HRD sprint lifecycle projection and its own
  workflow artifacts.
- VGBR owns the next authoritative benchmark; EPC and SSD remain no-touch.
- The parallel BDD2 package is a separate Program slice. Its plan, contract,
  review, notes, todos, source, tests, and generated projections are forbidden.
- BDD2 may continue development in its own worktree. Once HRD-CLOSEOUT merges,
  benchmark subject quiescence forbids merging BDD2 or any other change into
  `main` until VGBR acceptance.

## P2: Concrete Trace

`origin/main@b5a98c90` proves PR #106 merged -> the HRD sprint shows 9/9 rows
complete -> this closeout changes the sprint lifecycle to `Done` -> its notes
append a supersession annotation that points at, but does not mutate, the two
archived reviews -> closeout PR merges -> the merge commit becomes
the candidate post-HRD baseline -> VGBR fresh-fetches `origin/main`, pins that
exact commit as `POST_HRD_SHA`, and consumes it under a frozen main.

## P3: Design Decision

- Preserve archived review bytes as historical evidence.
- Add a new deterministic annotation rather than rewriting old conclusions.
- Use one docs/workflow-only PR because sprint status is an independent
  lifecycle and rollback boundary.
- Do not reproduce full-suite, semantic, provider, or benchmark evidence for an
  unchanged runtime subject.
- Apply the Program-wide successor-pinned SHA rule; this package cannot and
  does not backfill its own merge SHA.
- No compatibility, fallback, alias, dual authority, or shadow projection.

## Scope

In scope:

- `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- This package's plan, contract, review, and notes.
- Provider-free workflow/contract/merge-seal evidence for this exact docs
  subject.

Out of scope:

- Existing HRD-08/HRD-09 archived review, contract, plan, and notes bytes.
- `tasks/current.md`, `tasks/todos.md`, and every BDD2 artifact.
- `src/`, `tests/`, `assets/`, `.ai/hooks/`, benchmark reports or runner.
- VGBR execution, EPC canonicalization/implementation, SSD activation.
- Full `bun test`, provider review, authoritative benchmark, publish or deploy.

## Falsifier

The direction is wrong if closing the sprint requires changing runtime behavior,
historical review bytes, benchmark evidence, or any path outside the exact
allowlist. Cheapest proof: hash both archived reviews before editing and prove
the hashes are unchanged in the final diff.

## Cheapest Sufficient Proof

- Assert worktree `HEAD == captured base == origin/main@b5a98c90` at start.
- Contract preflight and strict workflow gate pass.
- `git diff --check` passes and every changed path is in the exact allowlist.
- Both archived review hashes remain unchanged.
- Sprint status is `Done`, all nine rows remain checked, and the closeout notes
  contain the ordered supersession annotation.
- Provider-free merge-gate seal passes after docs freeze.

## Concurrency and Ownership

- User explicitly authorizes this package to run in parallel with BDD2 because
  actual file ownership is disjoint.
- Do not edit BDD2's plan, contract, review, notes, todos, code, tests, assets,
  or external Skill surface.
- Stop if either writer requires any file owned by the other package.
- Stop on `origin/main` drift before closeout evidence is frozen.
- After closeout merge, BDD2 development may continue only off-main; any merge
  is blocked until VGBR accepts the frozen subject.

## Stop Conditions

- Any required edit outside the exact contract `allowed_paths`.
- Any mutation to the archived HRD-08 or HRD-09 review files.
- Any runtime/test/benchmark change or request to rerun expensive evidence.
- Any BDD2 path overlap.
- Any base drift, subject drift after acceptance, or merge-gate mismatch.
- More than three fail-fix-reverify rounds for one issue.

## Verification and Acceptance

- Task profile: `ledger-closeout`.
- Evidence requirement: `benchmark: not_applicable`.
- One semantic reviewer is frozen in the contract; review Markdown remains a
  projection, not authority.
- Verification is limited to contract/workflow checks, hash preservation,
  diff scope, architecture/task consistency as applicable, and merge gate.
- Merge authorization is separate from semantic acceptance.

## Rollback

Revert the HRD-CLOSEOUT PR. This restores only the prior sprint lifecycle
projection and removes the new annotation; runtime, tests, receipts, and
historical archived reviews remain unchanged.

## Approved Execution Checklist

- [ ] Capture the approved ledger-closeout plan in an isolated worktree rooted
      at exact `origin/main@b5a98c90`.
- [ ] Calibrate and preflight the generated contract before lifecycle edits.
- [ ] Set HRD sprint `Status` to `Done` and add closeout dependency metadata.
- [ ] Add the append-only historical-review supersession annotation to the new
      closeout notes without mutating historical review bytes.
- [ ] Run the cheapest sufficient workflow, scope, hash, and merge-gate checks.
- [ ] Commit, push, open and merge an independent PR.
- [ ] After merge, require VGBR to fresh-fetch and pin the actual closeout
      merge as `POST_HRD_SHA`; freeze main until VGBR acceptance.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture the approved ledger-closeout plan in an isolated worktree rooted at exact `origin/main@b5a98c90`.
- [x] Calibrate and preflight the generated contract before lifecycle edits.
- [x] Set HRD sprint `Status` to `Done` and add closeout dependency metadata.
- [x] Add the append-only historical-review supersession annotation to the new closeout notes without mutating historical review bytes.
- [ ] Run the cheapest sufficient workflow, scope, hash, and merge-gate checks.
- [ ] Commit, push, open and merge an independent PR.
- [ ] After merge, require VGBR to fresh-fetch and pin the actual closeout merge as `POST_HRD_SHA`; freeze main until VGBR acceptance.
