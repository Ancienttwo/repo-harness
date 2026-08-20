# Plan: setup-plugins survives a retired two-token option in final position

> **Status**: Archived
> **Created**: 20260818-0444
> **Slug**: setup-plugins-shift-overrun
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: retired two-token options in final position must forward to install instead of exiting 1 on bash 3.2
> **Rollback Surface**: two-expression revert, no external state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md`
> **Task Review**: `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md`

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

- Active plan: `plans/plan-20260818-0444-setup-plugins-shift-overrun.md`
- Sprint contract: `tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md`
- Sprint review: `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md`
- Implementation notes: `tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0444-setup-plugins-shift-overrun.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0444-setup-plugins-shift-overrun.md`.

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
- Contract file: `tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md`
- Review file: `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md`
- Implementation notes file: `tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0444-setup-plugins-shift-overrun.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: two-expression revert, no external state
- **Verification boundary**: retired two-token options in final position must forward to install instead of exiting 1 on bash 3.2
- **Review/acceptance boundary**: `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0444-setup-plugins-shift-overrun.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md`, `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md`, and `tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: two-expression revert, no external state

## Captured Planning Output

# setup-plugins survives a retired two-token option in final position

## Problem

`scripts/setup-plugins.sh` calls `shift 2` at `:21` (the `--hooks` branch) and
`:25` (the shared `--lsp|--project-type` branch). When that option is the last
argument, only one positional parameter remains, bash 3.2 returns non-zero from
`shift`, and `set -e` kills the script after it already logged the "ignored"
message and before it reaches either exec target.

Reproduced on `1d1b702a` against a stub `repo-harness`:

```
$ setup-plugins.sh --hooks
[setup-plugins] retired hook profile ignored: <missing>
exit=1

$ setup-plugins.sh --repo . --lsp
[setup-plugins] retired option ignored: --lsp
exit=1

$ setup-plugins.sh --repo . --project-type
[setup-plugins] retired option ignored: --project-type
exit=1

$ setup-plugins.sh --hooks none          # control
RH_ARG:[install] RH_ARG:[--no-hooks]
exit=0
```

This is harder to diagnose than the empty-array defect fixed in `c121a7ed`.
That one printed `unbound variable` and a line number. This one prints a
reassuring "ignored" line and then exits 1 silently — and in the `--repo . --lsp`
case the user supplied a perfectly valid argument that never reaches the
installer.

The two defects are independent: this failure fires inside the parse loop, strictly
before the expansion sites the earlier fix guarded, so neither masks the other.
`--hooks` exited 1 identically before and after `c121a7ed`.

## The semantic decision

A retired two-token option in final position could be treated as a user error
(fail with a message) or as a missing value to discard (log and continue).
**Discard and continue.**

Three reasons:

1. These options are retired; their values are never consumed. `--lsp ts` and
   `--lsp` produce the same outcome — nothing. Rejecting only the valueless form
   draws a distinction the program does not act on.
2. The existing branches already log and continue when the value is present.
   Failing when it is absent is inconsistent with the behavior one token away.
3. `:15` already reads `profile="${2:-}"` with a default, and `:19` already
   prints `<missing>` for that case. The author anticipated the absent value and
   handled it in the branch body; only the `shift` was left unguarded. This is a
   half-finished guard, not a deliberate rejection.

Failing loudly would also be actively unhelpful: the message would tell a user
that an option which does nothing is missing a value that is never read.

## Scope

- `scripts/setup-plugins.sh:21` and `:25` become
  `shift $(( $# >= 2 ? 2 : 1 ))`. Verified on bash 3.2.57: with one parameter
  left it shifts 1 and continues; with two or more it shifts 2 as before.
- Add execution tests for all three positions (`--hooks`, `--lsp`,
  `--project-type` in final position) plus a control proving two-token forms
  still consume both tokens.
- Close the `:39` coverage gap left open by the previous slice: the bun-fallback
  exec has no automated test because every existing case resolves the stub
  `repo-harness` first. Add a case that places a stub `bun` on PATH with
  `repo-harness` unresolvable. The previous slice's gatekeeper verified `:39`
  by hand and recorded the gap in
  `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`.

## Non-scope

- Which options are retired and what they log. The messages stay verbatim.
- The empty-array guards at `:35`/`:39` landed in `c121a7ed`.
- Any other script.

## Entity delta

`+0 / -0`. Two expressions change.

## Verification

```
bun test tests/setup-plugins-structure.test.ts
bun test tests/bootstrap-files.test.ts
bun test tests/cli/global-runtime-init.test.ts
bun run check:type
bun test
```

New tests must fail before the fix and pass after. Capture the pre-fix run as
the Root Cause Evidence artifact.

Falsifier: the guard must not change consumption when the value is present.
`setup-plugins.sh --lsp ts --repo .` must forward `--repo .` and nothing else —
if the fix ever shifts 1 where it should shift 2, the stray `ts` would leak into
the forwarded arguments. That leak, not the exit code, is the signal to watch.

Every test must resolve a stub on PATH. Nothing may invoke the real
`repo-harness install` or the real bun entrypoint.

## Blast radius

`setup-plugins.sh` is absent from `assets/workflow-contract.v1.json#helpers.scripts`
with no counterpart under `assets/templates/helpers/`, so it is not projected
downstream. Contributors running the script in this repository are the only
affected population.

## Rollback

Two-expression source change, no external state. Revert the commit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: setup-plugins survives a retired two-token option in final position
