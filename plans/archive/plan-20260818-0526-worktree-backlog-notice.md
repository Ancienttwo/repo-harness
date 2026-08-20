# Plan: SessionStart notice for cleanable contract worktrees

> **Status**: Archived
> **Created**: 20260818-0526
> **Slug**: worktree-backlog-notice
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: SessionStart section must list squash-absorbed worktrees and stay silent when nothing is cleanable
> **Rollback Surface**: two source files, no external state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md`
> **Task Review**: `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0526-worktree-backlog-notice.notes.md`

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

- Active plan: `plans/plan-20260818-0526-worktree-backlog-notice.md`
- Sprint contract: `tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md`
- Sprint review: `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md`
- Implementation notes: `tasks/notes/20260818-0526-worktree-backlog-notice.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0526-worktree-backlog-notice.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0526-worktree-backlog-notice.md`.

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
- Contract file: `tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md`
- Review file: `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md`
- Implementation notes file: `tasks/notes/20260818-0526-worktree-backlog-notice.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0526-worktree-backlog-notice.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: two source files, no external state
- **Verification boundary**: SessionStart section must list squash-absorbed worktrees and stay silent when nothing is cleanable
- **Review/acceptance boundary**: `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0526-worktree-backlog-notice.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md`, `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md`, and `tasks/notes/20260818-0526-worktree-backlog-notice.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: two source files, no external state

## Captured Planning Output

# SessionStart notice for cleanable contract worktrees

## Why

Issue #196 reported 100+ accumulated worktree directories. The three merged
fixes (`b456121a`, `09f9d8f7`, `c121a7ed`, `9965e269`) made the cleanup path
work; none of them tell anyone there is something to clean. The reporter's own
framing was that an automatic suggestion asking for authorization would be the
better experience, and that is what remains unbuilt.

Deletion stays operator-executed. A worktree can hold unpushed work, removal is
irreversible, and a timer cannot judge whether the contents matter. What can be
automated is noticing.

## The design decision that matters

The merge determination has exactly one implementation as of `b456121a`:
`worktree_merge_mode` in `scripts/worktree-merge-lib.sh`. A TypeScript section
that re-derived `git merge-tree --write-tree` against `<target>^{tree}` would
recreate the two-authority defect that fix just removed — the same datum decided
in two places, drifting the moment either side changes.

So the section must consume the existing authority, not reimplement it.

`worktree-merge-lib.sh` is currently source-only; it exposes a function and has
no executable entrypoint. Add one, guarded by `BASH_SOURCE`/`$0` comparison so
sourcing behavior is unchanged:

```
bash scripts/worktree-merge-lib.sh --target <target> <branch>...
```

printing one `<branch>\t<mode>` line per input. Batch, not per-branch, so the
whole scan costs one process spawn rather than N.

Rejected alternative: parsing `ship-worktrees --cleanup-merged --dry-run`
output. That couples a hook to a human-readable format with no stability
contract, and `run_cmd` echoes rather than executes under `--dry-run`, so the
mode never appears in the output at all.

## Scope

- `scripts/worktree-merge-lib.sh`: add a `--target <ref>` batch entrypoint
  behind an `import.meta.main`-equivalent guard. Sourcing must remain
  side-effect free; existing consumers (`contract-worktree.sh`,
  `ship-worktrees.sh`) are untouched.
- `src/cli/hook/session-context.ts`: add `worktreeBacklogSessionSection(repoRoot)`
  and register it in `buildSessionStartSections` (line 1391) after the existing
  `securitySentinelSessionSection`. Shape mirrors the two sibling sections
  exactly: takes the repo root, returns a `SessionContextSection` or null.
- Returns null when no contract worktree is cleanable, so a repo with nothing to
  clean sees no output at all.
- When there is something: list the cleanable slugs and the one command that
  clears them. State plainly that nothing was deleted.
- Scan cap 24. Measured cost is ~22ms per `merge-tree` invocation, bounding the
  scan near 0.5s. Above the cap, state the unchecked count explicitly and point
  at `ship-worktrees --cleanup-merged --dry-run` for the full list.
- Tests: cleanable worktrees produce a section; zero cleanable produces null;
  an unmerged worktree is never listed; exceeding the cap reports the remainder
  rather than truncating silently.

## Non-scope

- No deletion, no prompt that performs deletion, no hook-initiated cleanup.
- No change to `worktree_merge_mode`'s predicate, to either existing consumer,
  or to the dirty-worktree guards.
- No new CLI command or flag. The section points at commands that already exist.
- Not a Stop-hook notice. Stop fires on every response; a scan costing up to
  0.5s does not belong there.

## Entity delta

`+1 / -0` internal function (`worktreeBacklogSessionSection`), plus one
executable entrypoint on an existing packaged helper. No new file, no new
command, no new flag, no public surface.

## Fragile assumption

SessionStart is the right notice point. If a backlog accrues mid-session the
notice waits for the next session start. Accepted: accumulation is chronic, not
an event needing immediate response. If this proves wrong the fix is to add the
same section to another event, not to redesign the scan.

## Verification

```
bun test tests/session-context*.test.ts
bun test tests/helper-scripts.test.ts
bun test tests/contract-worktree-squash-cleanup.test.ts
bun run check:helpers
bun run check:type
bun test
```

Behavioral checks:

- A repo whose only contract worktree is squash-absorbed must produce a section
  naming it.
- A repo whose only contract worktree is genuinely unmerged must produce null.
  This is the important one: a false positive here trains the operator to run a
  cleanup that will refuse, and the next step after that habit forms is
  `--discard-scaffold-only`.
- Sourcing `worktree-merge-lib.sh` must remain side-effect free after the
  entrypoint is added; the existing consumers' tests cover this.

Falsifier: if the section lists a worktree that `contract-worktree cleanup`
would refuse, the notice is worse than silence. Build a dirty unmerged worktree
and assert it is absent from the section.

## Rollback

Two source files, no external state, no migration. Revert the commit; the
section disappears and both helpers return to source-only behavior.

## Follow-through

Post to issue #196 once merged — that thread carries the original request for
this behavior.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: SessionStart notice for cleanable contract worktrees
