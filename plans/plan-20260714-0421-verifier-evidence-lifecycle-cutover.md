# Plan: Verifier Evidence Lifecycle Cutover

> **Status**: Executing
> **Created**: 20260714-0421
> **Slug**: verifier-evidence-lifecycle-cutover
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bounded verifier consumes one subject-bound authoritative matrix and canonical acceptance
> **Rollback Surface**: revert ordered repository-only cutover commits
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md`
> **Task Review**: `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md`
> **Implementation Notes**: `tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md`

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

- Active plan: `plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md`
- Sprint contract: `tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md`
- Sprint review: `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md`
- Implementation notes: `tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md`.

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
- Contract file: `tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md`
- Review file: `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md`
- Implementation notes file: `tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert ordered repository-only cutover commits
- **Verification boundary**: bounded verifier consumes one subject-bound authoritative matrix and canonical acceptance
- **Review/acceptance boundary**: `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md`, `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md`, and `tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert ordered repository-only cutover commits

## Captured Planning Output

## Goal

Cut the authoritative benchmark out of the synchronous contract/sprint verifier, make verification bounded and evidence-consuming, bind review and benchmark validity to content subjects instead of unrelated Git ancestry, remove the Human Review Card external-acceptance fallback, and reduce benchmark preparation from per-arm installs to per-profile immutable bases while preserving 27 isolated runtime arms.

## Artifact Level

work-package

## Promotion Gate

- Promotion reason: verification_boundary
- This is one atomic cutover because the verifier, evidence schema, freshness authority, and benchmark producer must move together without a steady-state compatibility path or dual acceptance authority.

## In Scope

- Remove live `benchmark:harness --require-authoritative` production from active contract/template `commands_succeed` and remove duplicate focused-test execution authorities.
- Add a fixed 600-second strict-verifier wall-clock budget, per-command duration evidence, and process-group termination on timeout.
- Make sprint verification consume and validate authoritative benchmark subject/provenance/report bytes without launching providers, adopt, or substantive install.
- Replace Git-ancestry review freshness with normalized final-content `review_subject_sha256`; retain target revision only as metadata and overlap evidence.
- Make canonical `External Acceptance Advice` the only external-acceptance authority; remove Human Review Card fallback and legacy active-review acceptance branches.
- Add benchmark subject/provenance fields and prepare profile installation once per profile, then clone isolated writable HOME/workspace overlays per scenario.
- Keep exactly three profiles by nine scenarios, structured provider evidence, grader acceptance, No Harness isolation, and report byte integrity.
- Update source projections, active contract/template surfaces, focused tests, architecture/reference invariants, research/notes/review/current-status workflow artifacts.
- Produce one final authoritative matrix for the final benchmark subject, one canonical external acceptance, and a final artifact-only bounded verifier pass.

## Out of Scope

- Distributed benchmark scheduling, checkpoint/resume, a general artifact registry, extra providers, compatibility readers, policy knobs that relax the fixed verifier budget, telemetry beyond required duration/provenance evidence, deployment, release, or unrelated cleanup.

## Task Breakdown

- [x] P1/P2/P3 map the current verifier, fingerprint, acceptance, report, and benchmark setup paths.
- [x] Cut live evidence production and duplicate test authorities out of contract/sprint verification.
- [x] Implement fixed verifier budgets and process-group timeout evidence.
- [x] Cut review freshness to normalized content subject and canonical acceptance only.
- [x] Cut benchmark validity to benchmark subject/provenance and refactor setup to three profile bases plus 27 isolated overlays.
- [x] Update product source projections, contracts/templates, docs, workflow artifacts, and regression tests.
- [x] Run deterministic verification under the fixed budget.
- [x] Run exactly one final authoritative 3x9 matrix for the frozen benchmark subject.
- [ ] Obtain one external acceptance and run artifact-only final closeout.

## Evidence Contract

- State/progress path: active plan, linked task contract, implementation notes, review, and `tasks/current.md`.
- Verification evidence: focused tests for verifier budget/process groups, review subject, canonical acceptance, benchmark subject/setup count/isolation, source projection parity, typecheck, required root deterministic checks, one authoritative report.
- Evaluator rubric: no verifier call path can launch provider/benchmark/adopt/substantive install; strict verification terminates within 600 seconds; acceptance and evidence stale only on their content subjects; exactly one canonical external authority; benchmark prepares three profile bases and retains 27 isolated arms.
- Stop condition: all deterministic checks pass within budget, final report is authoritative for the frozen benchmark subject, canonical external acceptance is fresh, workflow artifacts close without launching another matrix.
- Rollback surface: revert the ordered work-package commits; no compatibility branch, dual schema, provider state, deploy, push, merge, or shared-main mutation.

## Verification Boundary

The cutover is complete only when a structural test proves verifier-to-provider reachability is absent, the fixed budget kills a process group in a fixture, subject hashes distinguish real byte/path/mode/deletion changes without staling on unrelated target movement, benchmark setup count is three, and the final closeout consumes one previously produced matrix.

## Rollback Surface

Revert this work-package's commits in reverse order. Because the migration removes old authorities in the same package and does not mutate external provider/deployment state, rollback is repository-only.

## Execution Boundary

Implement exactly the Goal, In Scope, Allowed Paths, and Exit Criteria in the linked contract. Absent requirements are forbidden design space. Do not add compatibility behavior, fallback acceptance, optional integrations, broad refactors, or polish.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] P1/P2/P3 map the current verifier, fingerprint, acceptance, report, and benchmark setup paths.
- [x] Cut live evidence production and duplicate test authorities out of contract/sprint verification.
- [x] Implement fixed verifier budgets and process-group timeout evidence.
- [x] Cut review freshness to normalized content subject and canonical acceptance only.
- [x] Cut benchmark validity to benchmark subject/provenance and refactor setup to three profile bases plus 27 isolated overlays.
- [x] Update product source projections, contracts/templates, docs, workflow artifacts, and regression tests.
- [x] Run deterministic verification under the fixed budget.
- [x] Run exactly one final authoritative 3x9 matrix for the frozen benchmark subject.
- [ ] Obtain one external acceptance and run artifact-only final closeout.
