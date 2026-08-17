# Plan: Worktree merge-mode single authority

> **Status**: Executing
> **Created**: 20260817-2055
> **Slug**: worktree-merge-authority
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: ship-worktrees --cleanup-merged --dry-run must report would-remove for a squash-absorbed branch
> **Rollback Surface**: pure source revert; ancestor-only filter over-skips rather than over-deletes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260817-2055-worktree-merge-authority.contract.md`
> **Task Review**: `tasks/reviews/20260817-2055-worktree-merge-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260817-2055-worktree-merge-authority.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260817-2055-worktree-merge-authority.md`
- Sprint contract: `tasks/contracts/20260817-2055-worktree-merge-authority.contract.md`
- Sprint review: `tasks/reviews/20260817-2055-worktree-merge-authority.review.md`
- Implementation notes: `tasks/notes/20260817-2055-worktree-merge-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260817-2055-worktree-merge-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260817-2055-worktree-merge-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260817-2055-worktree-merge-authority.md`.

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
- Contract file: `tasks/contracts/20260817-2055-worktree-merge-authority.contract.md`
- Review file: `tasks/reviews/20260817-2055-worktree-merge-authority.review.md`
- Implementation notes file: `tasks/notes/20260817-2055-worktree-merge-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260817-2055-worktree-merge-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260817-2055-worktree-merge-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: pure source revert; ancestor-only filter over-skips rather than over-deletes
- **Verification boundary**: ship-worktrees --cleanup-merged --dry-run must report would-remove for a squash-absorbed branch
- **Review/acceptance boundary**: `tasks/reviews/20260817-2055-worktree-merge-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260817-2055-worktree-merge-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260817-2055-worktree-merge-authority.contract.md`, `tasks/reviews/20260817-2055-worktree-merge-authority.review.md`, and `tasks/notes/20260817-2055-worktree-merge-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260817-2055-worktree-merge-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: pure source revert; ancestor-only filter over-skips rather than over-deletes

## Captured Planning Output

# Worktree merge-mode single authority

## Problem

The merge determination for a contract worktree branch exists in two places with
different semantics:

- `scripts/contract-worktree.sh:1793-1810` — ancestor check, then a
  `git merge-tree --write-tree` absorption check for squash merges.
- `scripts/ship-worktrees.sh:1120` — ancestor check only.

GitHub PRs in this project merge as squash, which never makes a branch tip an
ancestor of the target. The batch cleanup entrypoint therefore classifies every
normally-merged worktree as unmerged and skips it, so worktrees accumulate
indefinitely. Reported in issue #196 (a downstream user reached 100+ worktree
directories).

Reproduced on the current checkout:

```
$ bash scripts/ship-worktrees.sh --cleanup-merged --dry-run
[Ship] Skipped unmerged branch: codex/debug-ground-truth-eval-v1

$ bash scripts/contract-worktree.sh cleanup --slug debug-ground-truth-eval-v1 --target main --dry-run
[ContractWorktree] Merge check for codex/debug-ground-truth-eval-v1: absorbed into main (squash-equivalent tree)
[ContractWorktree] would remove worktree: /Users/ancienttwo/Projects/repo-harness-wt-debug-ground-truth-eval-v1
```

Same branch, two entrypoints, two answers. This is the duplicate-authority
failure the root contract forbids: one datum, one source of truth.

## Scope

### Phase 1 — collapse the merge determination to one authority

- Add `scripts/lib/worktree-merge-lib.sh` exporting
  `worktree_merge_mode <branch> <target>` which prints exactly one of
  `ancestor`, `absorbed`, or `unmerged` on stdout.
  - `ancestor`: `git merge-base --is-ancestor <branch> <target>` succeeds.
  - `absorbed`: `git merge-tree --write-tree <target> <branch>` exits zero and
    its output tree equals `git rev-parse <target>^{tree}`.
  - `unmerged`: anything else, including merge-tree failure or conflict. Stays
    fail-closed; no widening.
- `scripts/contract-worktree.sh` sources the lib and replaces its inline
  determination. The distinction between `-d` (ancestor) and `-D` (absorbed)
  at `scripts/contract-worktree.sh:1857-1871` must be preserved exactly: force
  delete stays scoped to the absorbed predicate.
- `scripts/ship-worktrees.sh:1120` sources the lib and replaces
  `git merge-base --is-ancestor` with `worktree_merge_mode`. Both `ancestor`
  and `absorbed` proceed to cleanup; `unmerged` keeps the existing
  `[Ship] Skipped unmerged branch:` message.
- The dirty-worktree guard (`ensure_worktree_status_for_cleanup`,
  `guard_dirty_merged_worktree`, `--discard-scaffold-only`) is untouched. Only
  the merge determination moves. Dirty and unmerged must remain
  independently distinguishable.

### Phase 2 — SessionStart backlog notice

- Add `worktreeBacklogSessionSection(repoRoot)` in
  `src/cli/hook/session-context.ts`, registered in `buildSessionStartSections`
  (line 1391) alongside the existing `minimalChangeSessionSection` and
  `securitySentinelSessionSection`. Same shape: return a section or null.
- Returns null when no contract worktree is cleanable, so quiet repos see
  nothing.
- Lists cleanable worktrees and the one command that clears them. Deletion
  stays operator-executed; the hook never removes anything.
- Scan cap: 24 worktrees. Measured cost is ~22ms per `merge-tree` call
  (20 iterations in 0.446s), so 24 bounds the SessionStart cost near 0.5s.
  When more exist, the section states the unchecked count explicitly and points
  at `--cleanup-merged --dry-run` for the full list. No silent truncation.

## Non-scope

- No automatic worktree deletion. Removal is irreversible and a worktree can
  hold unpushed work; the authorization gate stays with the operator.
- No remote branch deletion. GitHub `deleteBranchOnMerge` is already the
  authority (verified true for this repo) and a second deleter would only fire
  in the case where the branch legitimately still exists.
- No new CLI command, subcommand, or flag. Public surface delta is +0.

## Entity delta

`+1 / -0`: `scripts/worktree-merge-lib.sh`. Justified by two real consumers and
a cross-module invariant, which is the shared-component threshold in the root
contract.

Corrected during execution: this is a packaged helper, not a purely internal
file. `contract-worktree.sh` sources it in installed downstream repos, so it
must be registered in `assets/workflow-contract.v1.json#helpers.scripts` and the
mirrored `.ai/harness/workflow-contract.json`, which are versioned manifests
downstream consumes. It adds no invocable entrypoint — no command, subcommand,
or flag — but the earlier "no public surface added" claim understated it: the
helper inventory downstream repos install grows by one file.

Path correction: `scripts/` top level, not `scripts/lib/`. `helpers.scripts` is
flat (54 entries, zero directory separators) and `tests/helper-scripts.test.ts:580-583`
compares it against a non-recursive `readdirSync`. `scripts/lib/` is the tier
that is deliberately not projected downstream (`project-init-lib.sh` is absent
from the manifest). A projected lib does not belong there.

## Phase independence

Phase 1 is independently mergeable: once the batch filter recognizes absorbed
branches, cleanup works. Phase 2 depends on Phase 1's determination being
correct (otherwise it would under-report every squash-merged worktree) but
Phase 1 shipping alone leaves the system usable.

## Fragile assumption

Phase 2 assumes SessionStart is the right notice point. If backlog accrues
mid-session, the notice appears only at the next session start. Accepted:
accumulation is a chronic condition, not an event needing immediate response.

## Verification

Phase 1:

```
bun test tests/contract-worktree-squash-cleanup.test.ts
bun test tests/helper-scripts.test.ts
bash scripts/ship-worktrees.sh --cleanup-merged --dry-run
```

The dry-run must report `would remove` for a squash-absorbed branch instead of
`[Ship] Skipped unmerged branch:`.

New regression case in `tests/contract-worktree-squash-cleanup.test.ts`: a
squash-merged branch must be cleaned through `ship-worktrees --cleanup-merged`,
not skipped. The comment at line 194 already states this invariant for the
single-slug path; the batch path was never covered.

Phase 2:

```
bun test tests/session-context*.test.ts
bun test
```

Full repo required checks before merge:

```
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
```

## Rollback

Both phases are pure source changes with no external state and no data
migration. Revert the commit. Phase 1 restores the ancestor-only filter, which
returns to over-skipping rather than over-deleting, so a bad revert fails safe.

## Follow-through

Issue #196 stays open until Phase 1 merges, then gets a closing comment naming
the fix.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Worktree merge-mode single authority
