# Plan: setup-plugins survives an empty forwarded-args array

> **Status**: Archived
> **Created**: 20260818-0019
> **Slug**: setup-plugins-empty-args
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: setup-plugins.sh with no args and with retired-only args must forward to repo-harness install instead of crashing on bash 3.2
> **Rollback Surface**: two-expression revert, no external state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md`
> **Task Review**: `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`

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

- Active plan: `plans/plan-20260818-0019-setup-plugins-empty-args.md`
- Sprint contract: `tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md`
- Sprint review: `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md`
- Implementation notes: `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0019-setup-plugins-empty-args.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0019-setup-plugins-empty-args.md`.

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
- Contract file: `tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md`
- Review file: `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md`
- Implementation notes file: `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0019-setup-plugins-empty-args.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: two-expression revert, no external state
- **Verification boundary**: setup-plugins.sh with no args and with retired-only args must forward to repo-harness install instead of crashing on bash 3.2
- **Review/acceptance boundary**: `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0019-setup-plugins-empty-args.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md`, `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md`, and `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: two-expression revert, no external state

## Captured Planning Output

# setup-plugins survives an empty forwarded-args array

## Problem

`scripts/setup-plugins.sh:35` and `:39` expand `"${args[@]}"` under
`set -euo pipefail`. On bash 3.2 an empty array expanded that way raises
`unbound variable`, so the script dies before reaching either exec target.

macOS ships bash 3.2.57 as `/bin/bash`, and the script's shebang is `#!/bin/bash`.

Two reachable paths produce an empty `args`, both reproduced on the current
checkout (`09f9d8f7`) against a fake `repo-harness` on PATH:

```
$ setup-plugins.sh
scripts/setup-plugins.sh: line 35: args[@]: unbound variable
exit=1

$ setup-plugins.sh --lsp ts
[setup-plugins] retired option ignored: --lsp ts
scripts/setup-plugins.sh: line 35: args[@]: unbound variable
exit=1

$ setup-plugins.sh --repo .            # control
FAKE repo-harness got: install --repo .
exit=0
```

The first is a setup script invoked with no arguments, which is its most
natural call shape. The second is worse: every retired option (`--lsp`,
`--project-type`, `--with-optional`, `--with-obsidian`, and `--hooks` with any
profile other than `none`) is consumed and logged without appending to `args`,
so a caller who passes only retired flags believes they supplied arguments and
still gets an unbound-variable crash rather than the intended
`repo-harness install`.

This is the same defect class as `scripts/ship-worktrees.sh:806`, fixed in
`09f9d8f7`. That fix's gatekeeper swept the remaining `set -u` scripts and found
this as the only other genuinely reachable instance.

## Scope

- `scripts/setup-plugins.sh:35` and `:39` become
  `${args[@]+"${args[@]}"}`, the idiom already used in
  `scripts/ship-worktrees.sh` at `:806`, `:1085`, and `:1105`.
- Add execution tests to `tests/setup-plugins-structure.test.ts` covering both
  empty-args paths and the non-empty control, driven against a stub
  `repo-harness` on PATH so nothing is actually installed.

## Non-scope

- Which options are retired, what they log, and the exec targets themselves.
- The bun fallback's `ROOT_DIR` resolution.
- Any other script surfaced by the sweep. Everything else was confirmed guarded
  by `-gt 0`, `((${#arr[@]}))`, literal non-empty arrays, or an early exit.

## Why the tests matter more than the one-line fix

`tests/setup-plugins-structure.test.ts` currently holds four tests: a `bash -n`
syntax check and three string assertions that read the file and match on its
contents. None execute the script. A syntax check cannot catch an
expansion error that only fires at runtime with an empty array, and a string
assertion that the file mentions `repo-harness install` says nothing about
whether that line is reachable.

That is exactly how this survived, and it mirrors the sibling defect: there,
`tests/helper-scripts.test.ts` covered only the refusal branches, never the
success branch.

## Entity delta

`+0 / -0`. Two expressions change; the fix reuses an idiom already in the repo.

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

Falsifier: the guard must not alter forwarding when `args` is non-empty,
including an argument containing a space. `setup-plugins.sh --repo "/tmp/a b"`
must forward one argument, not two.

## Blast radius

`setup-plugins.sh` is absent from `assets/workflow-contract.v1.json#helpers.scripts`
and has no counterpart under `assets/templates/helpers/`, so it is not projected
to downstream repos. The crash is confined to contributors running the script in
this repository. That bounds the severity but not the fix cost, which is two
expressions.

## Rollback

Two-expression source change, no external state, no migration. Revert the commit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: setup-plugins survives an empty forwarded-args array
