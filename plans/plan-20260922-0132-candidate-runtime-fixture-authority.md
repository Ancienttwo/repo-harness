# Plan: Repair candidate runtime fixture after timeout authority move

> **Status**: Executing
> **Created**: 20260922-0132
> **Slug**: candidate-runtime-fixture-authority
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: https://github.com/Ancienttwo/repo-harness/actions/runs/35629594177
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Existing candidate reconciliation tests must fail before and pass after the test-only authority correction
> **Rollback Surface**: Revert the test fixture edit and own documents; no installed or production state mutation
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md`
> **Task Review**: `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260922-0132-candidate-runtime-fixture-authority.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: https://github.com/Ancienttwo/repo-harness/actions/runs/35629594177
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260922-0132-candidate-runtime-fixture-authority.md`
- Sprint contract: `tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md`
- Sprint review: `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md`
- Implementation notes: `tasks/notes/20260922-0132-candidate-runtime-fixture-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-0132-candidate-runtime-fixture-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-0132-candidate-runtime-fixture-authority.md`.

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
- Contract file: `tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md`
- Review file: `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md`
- Implementation notes file: `tasks/notes/20260922-0132-candidate-runtime-fixture-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-0132-candidate-runtime-fixture-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the test fixture edit and own documents; no installed or production state mutation
- **Verification boundary**: Existing candidate reconciliation tests must fail before and pass after the test-only authority correction
- **Review/acceptance boundary**: `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-0132-candidate-runtime-fixture-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md`, `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md`, and `tasks/notes/20260922-0132-candidate-runtime-fixture-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the test fixture edit and own documents; no installed or production state mutation

## Captured Planning Output

## Problem and authorization

AKN stage PR #434 CI run 35629594177 is blocked by two failures in the existing candidate runtime reconciliation fixture. This is the single directly blocking out-of-scope repair allowed by the repository rule for the full Agent-first implementation goal. It changes tests only, not production timeout or install behavior; a separate PR keeps it reviewable.

## P1 / P2 / P3

`copyRuntimeFixture` in tests/unit/candidate-bound-global-runtime-reconciliation.test.ts copies a complete runtime and overrides its package version and managed Stop timeout to model old B=30 and new C=150 runtimes. It still requires the literal ternary in src/cli/installer/managed-entries.ts. Baseline d52f9a9b moved the actual value to src/core/hook-work-budget.ts#MANAGED_STOP_TIMEOUT_SECONDS. Both B/C tests now fail at fixture setup before the update/reconciliation assertions run. The same file's existing end-to-end assertions verify C's installed timeout=150 and distinct candidate identity.

Change only the fixture to read and require the existing constant declaration, then rewrite it to 30 only inside the copied B runtime. Keep C=150 and retain the fail-closed source assertion. No fallback for the old expression, second authoring source, new tests, production timeout changes, runtime installation or schema changes. At 10x fixtures the existing whole-repository copying cost remains; optimizing that is out of scope.

## Scope and evidence

Allowed implementation file: tests/unit/candidate-bound-global-runtime-reconciliation.test.ts. Durable conclusion: docs/researches/20260922-candidate-runtime-fixture-authority.md. Own plan/contract/review/notes plus automatic docs/architecture/.projection-manifest.json. No other stage changes or main WIP.

Before the edit, run the existing test file in the isolated worktree and capture real nonzero PRE_FIX_EXIT and failure text in .ai/harness/runs/candidate-runtime-fixture/pre-fix.log. This is the existing regression guard; do not add a test that merely mirrors source text. After the edit, run the same file via canonical Verification Plan. Expected seconds to under one minute; real child CLI calls and complete disposable runtimes are required to prove distinct B/C behavior. Required repository integrity and type checks remain; no local full suite is newly requested. Full hosted CI remains a separate gate.

Root cause evidence must name the stale fixture authority, exact repro command, existing test guard and captured pre-fix failure. Add branch-aware task-sync validation using the pinned base and canonical Substantive Change SHA256 stamp before closeout, so staged/working-tree success cannot mask missing PR evidence.

## Acceptance

Both existing B/C tests progress beyond fixture preparation and prove candidate-bound reconciliation without touching a real installed runtime or real HOME. Other tests in the same file remain green. Original old-authority literal cannot remain as a fallback. Review and PR clearly label this as a CI fixture repair, not a production global-runtime change. One independent acceptance on the final diff and normal archive/seal are required. PR submission is authorized; merge is not.

## Task Breakdown

- [x] Capture the existing pre-fix failure and freeze Root Cause Evidence.
- [x] Retarget the copied fixture to the actual timeout constant and document the authority boundary.
- [x] Complete focused canonical checks, branch-aware task-sync and independent reviewer verdict.

Closeout after implementation: record the actual AcceptanceReceipt, archive and submit the separate CI repair PR; retain PR #434/#435 CI status separately until their branch state incorporates the repair.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture the existing pre-fix failure and freeze Root Cause Evidence.
- [x] Retarget the copied fixture to the actual timeout constant and document the authority boundary.
- [x] Complete focused canonical checks, branch-aware task-sync and independent reviewer verdict.
