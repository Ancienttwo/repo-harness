# Plan: Sprint task: WP1 crash-durable closeout transaction

> **Status**: Executing
> **Created**: 20260803-1824
> **Slug**: wp1-crash-durable-closeout-transaction
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260803-1810-long-run-anti-drift.sprint.md#WP1 crash-durable closeout transaction
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md`; after execution revert branch `codex/wp1-crash-durable-closeout-transaction` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md`
> **Task Review**: `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md`
> **Implementation Notes**: `tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260803-1810-long-run-anti-drift.sprint.md#WP1 crash-durable closeout transaction
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md`
- Sprint contract: `tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md`
- Sprint review: `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md`
- Implementation notes: `tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md`.

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
- Contract file: `tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md`
- Review file: `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md`
- Implementation notes file: `tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md`; after execution revert branch `codex/wp1-crash-durable-closeout-transaction` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md`, `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md`, and `tasks/notes/20260803-1824-wp1-crash-durable-closeout-transaction.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md`; after execution revert branch `codex/wp1-crash-durable-closeout-transaction` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: WP1 crash-durable closeout transaction

## Context

- Sprint: `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md`
- Backlog row: 1
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `WP1 crash-durable closeout transaction` so that the acceptance line holds: Per-phase SIGKILL injection passes; no duplicate push/merge on rerun; state resolvers never read the journal (WP1 spec)

## Planning Expansion

Satisfied by this session's dual-track planning pass (2026-08-03): the
decision-complete design lives in
`docs/researches/20260803-loopx-comparative-analysis.md` (§7.1 + round-2
addendum) and the sprint's WP1 spec; the execution brief is frozen into the
task contract. No separate `$think` re-expansion — re-running planning on an
already-adjudicated design would duplicate a planning boundary.

## Task Breakdown

- [ ] Journal primitive shared by both helpers: transaction-key derivation
  (sha256 over repo identity, worktree, operation, plan/contract, original
  HEAD, target/base SHA), journal dir under
  `$(git rev-parse --git-common-dir)/repo-harness/transactions/<operation>/<key>/`,
  phase append via temp file + fsync + atomic rename (mechanism may shell to
  `bun -e` or `dd conv=fsync`; plain `mv` alone is insufficient), `status`
  field `in_progress|complete|aborted`.
- [ ] `contract-worktree.sh` finish integration: move the pre-closeout
  snapshot + `original_head` into the journal dir at `prepared`; write phases
  `implementation_committed`, `lifecycle_applied`, `lifecycle_committed`,
  `merged`, `complete` at the existing step boundaries; fail closed on an
  `in_progress` journal for the same key; keep uninterrupted finish
  observable behavior unchanged apart from journal writes.
- [ ] `ship-worktrees.sh` ship integration: same primitive with phases
  through `gate_sealed`, `pushed`, `pr_observed`, `complete`; the push→PR gap
  must be journaled so an interrupt there reconciles to PR-creation only.
- [ ] `recover` surface on both helpers: `inspect` (report journal, phases,
  snapshot, original HEAD from a fresh process), `abort` (restore
  pre-closeout state; refuse once `merged`/`pushed` reached), `reconcile`
  (verify external effects, complete only missing steps, never roll back
  remote). No auto-resume.
- [ ] Tests `tests/contract-worktree-closeout-journal.test.ts`: fixture-repo
  fault injection (SIGKILL at every phase; rerun/recover never duplicates
  push or merge — remote simulated with a local bare repo), journal
  discoverability from a fresh process, `abort` refusal after irreversible
  phases, `complete` replay is a no-op, and the no-read guard (Effective
  State resolution output identical with and without an `in_progress`
  journal present).
- [ ] Verify acceptance: exit criteria tests + `bun run check:type` pass in
  the worktree; existing `contract-worktree-squash-cleanup`,
  `helper-scripts`, `sprint-backlog` tests stay green.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
