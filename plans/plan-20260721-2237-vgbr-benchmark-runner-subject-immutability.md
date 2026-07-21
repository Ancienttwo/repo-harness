# Plan: VGBR Benchmark Runner Subject Immutability

> **Status**: Executing
> **Created**: 20260721-2237
> **Slug**: vgbr-benchmark-runner-subject-immutability
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: bugfix
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Pre-run subject capture, immutable packed runtime artifact, phase-boundary drift guards, and POSIX mode regression
> **Rollback Surface**: Revert the runner/test commit; no report bytes or product semantics are migrated
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Program**: Sprint C (Evidence & Projection Convergence) backlog row 2 `vgbr-rf` — `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`
> **Task Contract**: `tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md`
> **Task Review**: `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md`
> **Implementation Notes**: `tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md`

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

- Active plan: `plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md`
- Sprint contract: `tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md`
- Sprint review: `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md`
- Implementation notes: `tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md`.

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
- Contract file: `tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md`
- Review file: `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md`
- Implementation notes file: `tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the runner/test commit; no report bytes or product semantics are migrated
- **Verification boundary**: Pre-run subject capture, immutable packed runtime artifact, phase-boundary drift guards, and POSIX mode regression
- **Review/acceptance boundary**: `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md`, `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md`, and `tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the runner/test commit; no report bytes or product semantics are migrated

## Captured Planning Output

## P1 Architecture Map

The package owns only the authoritative profile benchmark producer and its focused matrix tests. It does not own HRD semantics, BDD2, canonical benchmark reports, manifests, fixtures, CLI/runtime product behavior, EPC, SSD, or compatibility paths. POST_HRD_SHA remains dbcfbe75025b0a7f6db06b9ea7d629ef11f91e7b. The prior VGBR attempt is retained as invalid_report evidence and is never rebound or retried.

The current producer hashes actual POSIX mode in benchmarkSubject(), but captures that subject only after profile preparation and 27 provider arms. projectHarnessBase executes the authoritative source CLI, whose install path runs bun add -g against the authoritative source root. On macOS with core.filemode=false, that changed src/cli/index.ts and src/cli/hook-entry.ts from 0755 to 0777 while Git remained clean.

## P2 Concrete Trace

A fresh authoritative run must: require clean checkout; load manifest and seed; capture source commit and all subject components before any preparation; create exactly one npm-pack artifact under the runner-owned external run root using --ignore-scripts; hash it; install that same tarball into each harness profile's isolated BUN_INSTALL; invoke only the installed CLI for adopt and install --no-cli; verify the tarball hash and authoritative subject after all profile bases and again after all arms; write a report only when both guards pass; bind source_commit and subject fields to the initial capture.

no-harness performs no global install. A pack/preparation/subject drift failure starts no provider and writes no report. A post-run drift retains disposable arm evidence but writes no report. The package never normalizes modes, chmod-restores files, regrades evidence, adds fallback installation, or changes report protocol.

## P3 Decision

Use one immutable npm tarball rather than a copied checkout. The artifact is outside the authoritative root, is produced once without lifecycle scripts, is hash-checked before each consumer, and is shared by the two harness-enabled profile bases. Existing report/v2 fields already bind the initial source and do not require schema expansion. The artifact remains available for the whole run and is removed only when disposal is safe; no provider benchmark is executed by this fix package.

BDD2 may continue in parallel because it does not own the runner or focused benchmark test files. Because BDD2 changes benchmark-subject inputs under assets and src/cli, the successor VGBR attempt may start only after live origin/main is frozen and every subject writer is merged or held off-main.

Execution-base annotation: BDD2 PR #109 merged without runner/test overlap while
this package was in verification.  The candidate was rebased from the historical
post-HRD closeout SHA onto fresh `origin/main@9e9dce6e1f817b766d21436c0b69477f6c67ca20`;
all final evidence is regenerated on that base.  The successor VGBR still pins
the later runner-fix merge SHA rather than either historical SHA.

Takeover annotation (2026-07-22): the prior session went dormant before
committing; a fresh session took the worktree over per explicit user
authorization. `origin/main` had advanced three further docs-only commits in
the interim — `0852e9ab`/`43aab46a`/`4bd4133d`, adding Sprint C
(`plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`,
this package's Program registration as backlog row 2) and its research doc,
touching only `plans/sprints/` and `docs/researches/`. Rebased cleanly onto
`4bd4133d142a06494510d09650ea5417fd6866d6`; diff-stat vs the new base is
byte-identical in shape to the diff-stat vs the old base, confirming the
rebase carried no semantic change. All evidence in the Acceptance section and
the contract/notes/review was regenerated fresh on this rebased base.

That closeout run surfaced one external blocker: `repo-harness run
check-task-workflow --strict` failed because Sprint C's own `## PRD` section
was empty — proven pre-existing on plain `origin/main` and outside this
package's scope. The orchestrator confirmed the Program fixed it directly on
`main` (commit `e4f64953`, "add PRD section to Sprint C for execution
readiness"). This package fetched and rebased a third time onto
`e4f649536097e29e3c686666567c0f9f2d133b7b` (the only new commit, docs-only);
`check-task-workflow --strict` and `contract-run preflight` both re-verified
green, and the focused suite was re-run as a sanity check (31 pass, 0 fail).
The full repository suite was not re-run a third time since no code changed.

## Acceptance

- Root Cause Evidence records the mode drift, isolated bun global-install reproduction, regression guard, and pre-fix failure artifact.
- Focused tests prove one pack, external artifact location, identical tarball hash across both harness profiles, no no-harness install, installed CLI use, pre-provider and post-run drift rejection, and no report write on drift.
- A core.filemode=false fixture stays Git-clean across 0755 to 0777 while the semantic subject guard rejects install_profile_inputs_sha256 drift.
- Focused smoke proves the installed package remains runnable for the needed lifecycle and no authoritative source mode/content changes occur.
- Full repo checks, fresh review/external acceptance, verify-sprint, merge-gate, commit/push/PR/merge close the package.
- The canonical profile-comparison triplet remains untouched; the new VGBR attempt is a separate approved contract after this merge.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze bugfix contract and capture the unfixed regression artifact.
- [x] Implement one external packed runtime authority and phase-boundary guards.
- [x] Pass focused regression and disposable installed-CLI smoke checks.
- [x] Freeze code and pass full repository verification.
- [ ] Record fresh semantic acceptance, merge seal, PR merge, and successor SHA.
  - Deliberately unchecked at the end of the 2026-07-22 takeover phase: that
    phase's own scope was rebase + re-verification + lifecycle-doc closeout,
    committed locally only (no merge seal, push, PR, or merge — see the
    contract's `Program`/`Base SHA` fields). All machine checks are now green,
    including `check-task-workflow --strict` (the Sprint C PRD-section gap
    that previously blocked it was fixed on `main` at `e4f64953` and this
    package rebased onto it). Remaining before this row can check: a typed
    AcceptanceReceipt, then merge seal / PR / merge / successor-SHA pin.
