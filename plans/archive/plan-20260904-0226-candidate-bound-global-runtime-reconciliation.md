> **Archived**: 2026-09-04 18:55
> **Related Plan**: plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260904-1855
> **Archive Projection V1**: `plans/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md` => `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260904-0226-candidate-bound-global-runtime-reconciliation.notes.md` => `tasks/archive/notes-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260904-0226-candidate-bound-global-runtime-reconciliation.contract.md` => `tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260904-0226-candidate-bound-global-runtime-reconciliation.review.md` => `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md`

# Plan: Candidate-bound global runtime reconciliation

> **Status**: Archived
> **Created**: 20260904-0226
> **Slug**: candidate-bound-global-runtime-reconciliation
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`; after execution revert branch `codex/candidate-bound-global-runtime-reconciliation` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
> **Task Review**: `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
> **Implementation Notes**: `tasks/archive/notes-20260904-1855-candidate-bound-global-runtime-reconciliation.md`

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

- Active plan: `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`
- Sprint contract: `tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
- Sprint review: `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
- Implementation notes: `tasks/archive/notes-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`.

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
- Contract file: `tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
- Review file: `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
- Implementation notes file: `tasks/archive/notes-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`; after execution revert branch `codex/candidate-bound-global-runtime-reconciliation` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md`, `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md`, and `tasks/archive/notes-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`; after execution revert branch `codex/candidate-bound-global-runtime-reconciliation` or the explicitly reviewed diff.

## Captured Planning Output

## Goal
Make `repo-harness update` commit only when the installed candidate version itself has reconciled and verified every selected managed runtime surface.

## Success Criteria
- A handoff-capable updater installs and validates the candidate package, then invokes a candidate absolute-path reconciler; its in-memory adapter builder never owns post-install projection.
- The bounded legacy migration is explicit: a pre-handoff updater bootstraps the candidate on the first invocation, then the candidate must run a second `repo-harness update --target <target>`; the first invocation is not claimed as an atomic repair.
- A typed receipt binds transaction identity, candidate version/package identity, selected targets, exact adapter projection digests, ownership ledger digest, and verification time; the parent validates it before commit.
- Candidate failure or receipt mismatch rolls back package, hooks, skills, and install-state through the existing global runtime transaction.
- `status` and `setup check` detect same-count field drift including Stop timeout, matcher, command/type, missing, extra, and duplicate managed entries.
- Doctor recommends `repo-harness update --target <target>` rather than raw package replacement plus repo-local init.
- Successful update refreshes install-state ownership hashes; explicit `--no-hooks` is reported as partial/degraded rather than fully reconciled.
- Existing unmanaged hook entries remain byte-semantically unchanged.

## Scope
- `src/cli/commands/global-runtime.ts`, `src/cli/index.ts`, candidate reconciliation protocol/runner under `src/cli/`.
- Existing installer ownership/projection logic, status/setup/doctor surfaces, and focused CLI/install-profile tests.
- Reuse `isManagedEntry`, `stripManagedEntries`, `buildManagedHooks`, transaction snapshot/rollback, and `applyInstallProfile`.

## Non-Scope
- Repo-local adoption semantics.
- New compatibility fallbacks or a second managed-entry ownership detector.
- Architecture projection behavior unrelated to global runtime installation.

## P1 / P2 / P3
P1: Package authority, host projections, and install-state ledger are three representations inside one global-runtime transaction.
P2: old updater -> install candidate -> candidate absolute-path process -> project selected surfaces -> refresh ledger -> exact reread -> typed receipt -> parent receipt validation -> transaction commit; any failure rolls back.
P3: Preserve the existing filesystem transaction and ownership stripping rules. Add version-bound semantic atomicity at the handoff boundary; exact comparison is the smallest invariant that prevents mixed-version false-ready states.

## Task Breakdown
- [x] Freeze red fixtures for same-count timeout drift, cross-version authority handoff, frozen legacy bootstrap, unmanaged preservation, rollback, ledger refresh, and no-hooks degraded reporting.
- [x] Implement candidate reconciler and typed receipt with absolute candidate entrypoint and transaction-bound validation.
- [x] Move post-install managed projection/ledger ownership to candidate execution for handoff-capable update mode.
- [x] Expose exact adapter projection diagnostics through status/setup check.
- [x] Correct doctor/setup upgrade actions.
- [x] Run targeted suites, full required checks, and distinct-package-root runtime boundary tests.

## Verification
- `bun test tests/cli/global-runtime-init.test.ts tests/cli/status.test.ts tests/cli/init-hook.test.ts tests/cli/doctor.test.ts tests/cli/install.test.ts tests/install-profiles.test.ts --timeout 60000`
- `bun run check:type`
- Required repository checks from root AGENTS.md.
- Pack/install fixture proving one update crosses old builder 30 to candidate builder 150 in one transaction.

## Rollback
The existing global-runtime transaction snapshot remains the rollback authority. Candidate reconciliation emits no commit authority; only the parent commits after receipt validation.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze red fixtures for same-count timeout drift, cross-version authority handoff, frozen legacy bootstrap, unmanaged preservation, rollback, ledger refresh, and no-hooks degraded reporting.
- [x] Implement candidate reconciler and typed receipt with absolute candidate entrypoint and transaction-bound validation.
- [x] Move post-install managed projection/ledger ownership to candidate execution for handoff-capable update mode.
- [x] Expose exact adapter projection diagnostics through status/setup check.
- [x] Correct doctor/setup upgrade actions.
- [x] Run targeted suites, full required checks, and distinct-package-root runtime boundary tests.
