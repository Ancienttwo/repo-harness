# Plan: Mutation-observed in-repo qualifier gate

> **Status**: Archived
> **Created**: 20260811-1659
> **Slug**: mutation-observed-in-repo-qualifier
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: cross-review 20260811 P3 decision
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md`; after execution revert branch `codex/mutation-observed-in-repo-qualifier` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md`
> **Task Review**: `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md`
> **Implementation Notes**: `tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: cross-review 20260811 P3 decision
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md`
- Sprint contract: `tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md`
- Sprint review: `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md`
- Implementation notes: `tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md`.

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
- Contract file: `tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md`
- Review file: `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md`
- Implementation notes file: `tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md`; after execution revert branch `codex/mutation-observed-in-repo-qualifier` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md`, `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md`, and `tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md`; after execution revert branch `codex/mutation-observed-in-repo-qualifier` or the explicitly reviewed diff.

## Captured Planning Output

# Goal

Close the mutation-observed poison-event defect: out-of-repository absolute
paths (for example plan files under `~/.claude/plans/` and memory files under
`~/.claude/projects/`) currently qualify as post-edit journal events, set the
architecture/context/capability dirty bits, and produce projection jobs that
archctx rejects with non-retryable `AC_SCHEMA_INVALID`, permanently blocking
the Stop-hook strict projection gate.

Root cause (verified 2026-08-11, reproduced in a disposable fixture): in
`src/cli/hook/mutation-observed.ts`, `normalizeFilePath` returns out-of-repo
absolute paths unchanged and `runMutationObserved` only checks for an empty
path before setting dirty bits and writing the journal event.

## Task Breakdown

- [x] Add an in-repo qualification gate to `runMutationObserved` using the
      existing `canonicalRepoRelativePath` helper
      (`src/effects/state/collect-state-inputs.ts`): when it returns `null`,
      no-op before any advisory, dirty-bit derivation, or journal write —
      same contract as the existing empty-path branch.
- [x] Red-green regression in `tests/mutation-observed.test.ts`
      (non-qualifying block): an out-of-repository absolute path writes no
      journal event and emits no output; a traversal-escaping relative path
      is likewise a no-op. The existing journal-schema test remains the
      proof that an in-repo path still writes exactly one event.
- [x] After the fix lands, remove the two currently-pending poison events in
      the primary tree
      (`.ai/harness/journal/post-edit/pending/` entries pointing at
      `~/.claude/projects/.../memory/*`), and verify the source journal and
      projection queue are empty.

## Verification

- `bun test tests/mutation-observed.test.ts` (new tests RED before the fix,
  GREEN after)
- `bun test tests/architecture-projection-provider.test.ts` (adjacent surface
  unchanged)
- Primary tree: `readPendingPostEditEvents` empty via
  `repo-harness architecture-projection drain --json` reporting
  `sourceJournalPending: 0`, queue empty.

## Out of scope (independent release gates, per cross-review decision)

- Digest ignore-contract convergence between
  `PROJECTION_WORKTREE_IGNORE_PATHS` and archctx's validator ignore list
  (needs an archctx-side release or request-supplied ignores; single
  authority, not two hardcoded lists).
- `repo-harness@0.14.2` publish/install readback (global 0.14.1 ships
  archctx@0.4.0 while the repo contract requires 0.4.1).

## Rollback

Single-commit revert of the qualifier gate + tests; no schema, storage, or
policy change.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add an in-repo qualification gate to `runMutationObserved` using the
- [x] Red-green regression in `tests/mutation-observed.test.ts`
- [x] After the fix lands, remove the two currently-pending poison events in
