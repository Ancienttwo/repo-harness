# Plan: Fail-closed bulk archive of terminal plans in plans/ root

> **Status**: Archived
> **Created**: 20260722-0350
> **Slug**: terminal-plans-sweep
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: tasks/todos.md
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: strict workflow check + task-sync + standalone full bun test + adopt dry-run; plans root reduced to active/HOLD set; gatekeeper audits classification table vs diff.
> **Rollback Surface**: Revert branch codex/terminal-plans-sweep; pure renames and header flips, no data migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-0350-terminal-plans-sweep.contract.md`
> **Task Review**: `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md`
> **Implementation Notes**: `tasks/notes/20260722-0350-terminal-plans-sweep.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: tasks/todos.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-0350-terminal-plans-sweep.md`
- Sprint contract: `tasks/contracts/20260722-0350-terminal-plans-sweep.contract.md`
- Sprint review: `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md`
- Implementation notes: `tasks/notes/20260722-0350-terminal-plans-sweep.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-0350-terminal-plans-sweep.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-0350-terminal-plans-sweep.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-0350-terminal-plans-sweep.md`.

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
- Contract file: `tasks/contracts/20260722-0350-terminal-plans-sweep.contract.md`
- Review file: `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md`
- Implementation notes file: `tasks/notes/20260722-0350-terminal-plans-sweep.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-0350-terminal-plans-sweep.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-0350-terminal-plans-sweep.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert branch codex/terminal-plans-sweep; pure renames and header flips, no data migration.
- **Verification boundary**: strict workflow check + task-sync + standalone full bun test + adopt dry-run; plans root reduced to active/HOLD set; gatekeeper audits classification table vs diff.
- **Review/acceptance boundary**: `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-0350-terminal-plans-sweep.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-0350-terminal-plans-sweep.contract.md`, `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md`, and `tasks/notes/20260722-0350-terminal-plans-sweep.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-0350-terminal-plans-sweep.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert branch codex/terminal-plans-sweep; pure renames and header flips, no data migration.

## Captured Planning Output

## Approach
### Strategy
One-shot fail-closed bulk archive of terminal plans accumulated in `plans/` root (~80 files), owner-delegated evidence model: a plan auto-archives ONLY with unambiguous terminal proof — its own `Status` header is terminal (Completed/Done/Archived/Superseded/Abandoned), OR its stem-matched contract records `Status: Fulfilled` with its review recording a pass recommendation. Ambiguous plans HOLD in place and are listed in the classification report. Active/excluded set never touched: `plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md` (active Approved), `plan-20260715-1140-skill-surface-discovery-convergence.md` (Draft by design per its ledger row), `plan-20260721-1743-sprint-strict-queue-enforcement.md` (owner's pending sprint work).

Migration semantics mirror `archive-workflow` per plan: set `Status: Archived`, move plan to `plans/archive/`, move stem-matched contract/notes/review files to `tasks/archive/{contract,notes,review}-<stamp>-<slug>.md`; bookkeeping (single todos snapshot + one `refresh-current-status --write`) runs ONCE for the whole sweep, not per plan. No helper/gate code changes; the full per-plan classification table (status found, contract status, review verdict, decision) is appended to this package's notes as the audit record. Task Profile: ledger-closeout.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Fail-closed one-shot (chosen) | No gate semantics touched; ambiguity never guessed; fully auditable diff | HOLD set needs a later owner pass | **Chosen** |
| Teach completed_archive_gate a sealed-terminal fallback | Durable mechanism | Gate-semantics change for a one-time backlog; future plans archive normally at closeout | Rejected |
| Bulk `--outcome Superseded` via helper ×80 | Zero new logic | Mislabels completed work at scale; 80 duplicate todos snapshots | Rejected |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `plans/*.md` (AUTO set) | migrate | `Status` → `Archived`; move to `plans/archive/` |
| `tasks/contracts|notes|reviews/*` (stem-matched, AUTO set) | move | To `tasks/archive/` with helper naming |
| `tasks/archive/todo-<stamp>-terminal-plans-sweep.md` | create | Single todos snapshot for the sweep |
| `tasks/current.md` | refresh | One `refresh-current-status --write` at end |
| package notes | append | Full classification table (audit record) |

### Data Flow
Classify (read-only, dry-run printed) → apply AUTO migrations → single bookkeeping pass → verification → report AUTO/HOLD/EXCLUDE counts and the HOLD list.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Misclassifying an active plan | Low | High | Fail-closed rules + explicit exclude list + dry-run table reviewed before apply + gatekeeper audit |
| Stem-matching moves a wrong artifact family | Low | Medium | Exact stem equality only; unmatched artifacts stay |
| Status header variants missed | Medium | Low | Unknown statuses → HOLD, never guessed |

## Promotion Gate
- **Merge/PR unit**: one branch `codex/terminal-plans-sweep`, one PR.
- **Rollback surface**: revert the branch; pure renames + header flips, no data migration.
- **Verification boundary**: `repo-harness run check-task-workflow --strict` + `bash scripts/check-task-sync.sh` + full `bun test` standalone + `bun src/cli/index.ts adopt --repo . --dry-run`; plans root afterward contains only the exclude set + HOLD set.
- **Review/acceptance boundary**: gatekeeper audits the classification table against the diff.
- **High-risk surface**: none — workflow artifacts only.
- **Why not checklist row**: ~80-plan mechanical diff with its own audit and rollback boundary.

## Evidence Contract
- **State/progress path**: contract exit criteria; classification table in notes.
- **Verification evidence**: strict/task-sync/test/adopt outputs; before/after plans-root listing.
- **Evaluator rubric**: gatekeeper PASS on table-vs-diff consistency and fail-closed property (no HOLD/EXCLUDE file moved).
- **Stop condition**: checks green, gatekeeper recorded, HOLD list reported to owner.
- **Rollback surface**: as in Promotion Gate.

## Task Breakdown
- [ ] S1 classify all `plans/*.md` root files (dry-run table: status, contract status, review verdict → AUTO/HOLD/EXCLUDE)
- [ ] S2 apply AUTO migrations (plan header+move; stem-matched contract/notes/review moves)
- [ ] S3 single bookkeeping pass (todos snapshot + refresh-current-status --write)
- [ ] S4 append classification table to notes; verify plans root = exclude+HOLD only
- [ ] S5 verification: strict + task-sync + full bun test + adopt dry-run; hand to gatekeeper

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] S1 classify all `plans/*.md` root files (dry-run table: status, contract status, review verdict → AUTO/HOLD/EXCLUDE)
- [ ] S2 apply AUTO migrations (plan header+move; stem-matched contract/notes/review moves)
- [ ] S3 single bookkeeping pass (todos snapshot + refresh-current-status --write)
- [ ] S4 append classification table to notes; verify plans root = exclude+HOLD only
- [ ] S5 verification: strict + task-sync + full bun test + adopt dry-run; hand to gatekeeper
