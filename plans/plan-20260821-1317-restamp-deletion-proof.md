# Plan: Harden restamp publication against manifest deletion

> **Status**: Executing
> **Created**: 20260821-1317
> **Slug**: restamp-deletion-proof
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Deletion fixture plus focused restamp tests, required workflow gates, full suite, CI, and release readback
> **Rollback Surface**: Single commit reverts the proof, regression test, and deferred-ledger closure before publication
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md`
> **Task Review**: `tasks/reviews/20260821-1317-restamp-deletion-proof.review.md`
> **Implementation Notes**: `tasks/notes/20260821-1317-restamp-deletion-proof.notes.md`

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

- Active plan: `plans/plan-20260821-1317-restamp-deletion-proof.md`
- Sprint contract: `tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md`
- Sprint review: `tasks/reviews/20260821-1317-restamp-deletion-proof.review.md`
- Implementation notes: `tasks/notes/20260821-1317-restamp-deletion-proof.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260821-1317-restamp-deletion-proof.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260821-1317-restamp-deletion-proof.md`.

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
- Contract file: `tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md`
- Review file: `tasks/reviews/20260821-1317-restamp-deletion-proof.review.md`
- Implementation notes file: `tasks/notes/20260821-1317-restamp-deletion-proof.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260821-1317-restamp-deletion-proof.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single commit reverts the proof, regression test, and deferred-ledger closure before publication
- **Verification boundary**: Deletion fixture plus focused restamp tests, required workflow gates, full suite, CI, and release readback
- **Review/acceptance boundary**: `tasks/reviews/20260821-1317-restamp-deletion-proof.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260821-1317-restamp-deletion-proof.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md`, `tasks/reviews/20260821-1317-restamp-deletion-proof.review.md`, and `tasks/notes/20260821-1317-restamp-deletion-proof.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260821-1317-restamp-deletion-proof.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single commit reverts the proof, regression test, and deferred-ledger closure before publication

## Captured Planning Output

# Harden restamp publication against manifest deletion

## Goal

Prevent `publishArchitectureProjectionRestamp` from advancing the branch when the synthesized commit deletes `docs/architecture/.projection-manifest.json`; only a single-path modification is publishable.

## Scope

- Change `src/effects/architecture/restamp-publication.ts` so the post-`commit-tree` proof reads `git diff-tree --name-status -r -z` and accepts exactly one `M` record for the manifest path.
- Add a deletion regression fixture in `tests/architecture-restamp-publication.test.ts` proving the branch stays at the base commit, the index is restored, and the deletion remains visible in the worktree.
- Remove the fulfilled deferred row from `tasks/todos.md` and keep workflow projections synchronized.

## Non-Scope

- Do not change `evaluateRestampGate`, provider receipt classification, Stop-lane semantics, or creation/deletion compatibility behavior.
- Do not add fallback parsing or allow `A`; restamp publication is modification-only.

## P1 Architecture Map

The public CLI/drain entrypoints call `publishLatestArchitectureProjectionRestamp` or `publishArchitectureProjectionRestampForDrain`, both of which delegate to `publishArchitectureProjectionRestamp`. The pure provider result remains classification authority; the effects module owns Git fact collection, index staging, commit synthesis, proof, and compare-and-swap publication. The authoritative regression surface is `tests/architecture-restamp-publication.test.ts`.

## P2 Concrete Trace

A stale manual receipt says the manifest action is `update`; meanwhile the tracked manifest is deleted in the worktree. The current gate observes the manifest as the only dirty tracked path and publishes because `diff-tree --name-only` proves only the path, not the change kind. The new proof observes `D`, restores the index, returns `single-path-proof-failed`, and never calls `update-ref`.

## P3 Decision Rationale

Preserve the existing two-authority split: provider receipt decides whether the semantic operation is a restamp, while Git proves the exact commit bytes before the CAS. Strengthen only the missing Git invariant from “one path” to “one modified path.” At 10x invocation volume the same fixed number of Git subprocesses dominates; no new state or concurrency primitive is introduced.

## Task Breakdown

- [x] Replace the single-path name-only proof with an exact name-status modification proof and preserve fail-closed index restoration.
- [x] Add the deletion regression test and run the focused restamp publication tests.
- [ ] Close the deferred ledger row, run required workflow/type/full-suite checks, commit, push, and wait for CI.
- [ ] Publish npm `repo-harness@0.16.1`, create the tag and GitHub release from the existing changelog, refresh the global install, and record runtime evidence.

## Verification

- `bun test tests/architecture-restamp-publication.test.ts --timeout 60000`
- `bun run check:type`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun test --timeout 60000`
- Release readback: npm registry version/tarball, clean install and installed-hook/runtime evidence, GitHub tag/release, global `repo-harness --version`.

## Rollback and Failure Handling

The code/test/ledger change is one revertable commit. Any proof mismatch fails closed before `update-ref` and restores only the manifest index entry. Publishing stops on failed tests, CI, npm auth, registry readback, tag/release failure, or installed-runtime evidence failure; no compatibility fallback is added.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Replace the single-path name-only proof with an exact name-status modification proof and preserve fail-closed index restoration.
- [x] Add the deletion regression test and run the focused restamp publication tests.
- [ ] Close the deferred ledger row, run required workflow/type/full-suite checks, commit, push, and wait for CI.
- [ ] Publish npm `repo-harness@0.16.1`, create the tag and GitHub release from the existing changelog, refresh the global install, and record runtime evidence.
