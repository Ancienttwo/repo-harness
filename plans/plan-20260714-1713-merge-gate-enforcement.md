# Plan: Local merge gate enforcement

> **Status**: Completed
> **Created**: 20260714-1713
> **Slug**: merge-gate-enforcement
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Targeted receipt and ship fail-closed tests plus repository required checks
> **Rollback Surface**: Remove merge-gate skill, receipt verifier, and ship integration as one unit
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md`
> **Task Review**: `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md`
> **Implementation Notes**: `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`

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

- Active plan: `plans/plan-20260714-1713-merge-gate-enforcement.md`
- Sprint contract: `tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md`
- Sprint review: `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md`
- Implementation notes: `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-1713-merge-gate-enforcement.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-1713-merge-gate-enforcement.md`.

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
- Contract file: `tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md`
- Review file: `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md`
- Implementation notes file: `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-1713-merge-gate-enforcement.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove merge-gate skill, receipt verifier, and ship integration as one unit
- **Verification boundary**: Targeted receipt and ship fail-closed tests plus repository required checks
- **Review/acceptance boundary**: `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-1713-merge-gate-enforcement.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md`, `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md`, and `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove merge-gate skill, receipt verifier, and ship integration as one unit

## Captured Planning Output

## Outcome

Add one read-only merge-gate protocol consumed by the existing gatekeeper agent and enforce a SHA-bound verdict receipt at the local ship boundary.

## Task Breakdown

- [x] Define a concise repo-owned `merge-gate` skill as the single semantic authority for verdict inputs, evidence, and PASS/FAIL/BLOCKED output.
- [x] Add a deterministic receipt verifier that binds verdict to repository, base SHA, head SHA, and diff fingerprint.
- [x] Make the local ship entrypoint fail closed when the configured gatekeeper command or fresh receipt is absent, without changing existing product semantics.
- [x] Add focused tests for pass, fail, blocked, stale SHA, stale diff, and bypass attempts.
- [x] Update architecture and workflow artifacts, then run required checks.
- [x] Resolve PR review findings for protected environment isolation, transactional PR ship rollback, and required runtime installation; refresh full verification, and record the repository owner's explicit decision to skip unavailable Claude acceptance.

## Constraints

- Gatekeeper execution is read-only; it cannot edit, commit, push, or merge.
- The orchestrator owns receipt persistence and merge execution.
- No GitHub App or hosted gate is introduced in this slice.
- No compatibility fallback, alternate receipt shape, or heuristic verdict parsing.
- Existing dirty `main` changes remain outside this worktree and outside this work-package.

## Acceptance

- Ship cannot merge a contract worktree when the merge gate is enabled and no current PASS receipt exists.
- A receipt for another head SHA or diff fingerprint is rejected.
- FAIL and BLOCKED verdicts are rejected.
- The skill and runtime wrapper have one-way ownership: agent selects runtime; skill defines the review contract.
- Focused and repository-required checks pass.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Define a concise repo-owned `merge-gate` skill as the single semantic authority for verdict inputs, evidence, and PASS/FAIL/BLOCKED output.
- [x] Add a deterministic receipt verifier that binds verdict to repository, base SHA, head SHA, and diff fingerprint.
- [x] Make the local ship entrypoint fail closed when the configured gatekeeper command or fresh receipt is absent, without changing existing product semantics.
- [x] Add focused tests for pass, fail, blocked, stale SHA, stale diff, and bypass attempts.
- [x] Update architecture and workflow artifacts, then run required checks.
- [x] Resolve PR review findings for protected environment isolation, transactional PR ship rollback, and required runtime installation; refresh full verification, and record the repository owner's explicit decision to skip unavailable Claude acceptance.
