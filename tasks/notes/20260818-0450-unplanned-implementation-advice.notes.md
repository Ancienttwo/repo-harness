# Notes: unplanned-implementation-advice

> **Plan**: plans/plan-20260818-0450-unplanned-implementation-advice.md
> **Contract**: tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md

## Why this is not a shell-command parser

The obvious reading of "shell writes bypass `PlanStatusGuard`" is "teach the guard to read shell commands". That was rejected. Covering the write surface means covering redirections, `tee`, `sed -i`, `install`, `python -c`, `eval`, and subshells — an unbounded set — which is the heuristic shadow parser this repo's rules forbid. It would also grant false confidence: whatever the parser missed would look sanctioned rather than unobserved.

The diff-derived path is sound instead of approximately sound. `computeArchitectureDriftChangedSet` reads `git status --porcelain -z`, so it sees the result of any write mechanism with no knowledge of the mechanism. Nothing to enumerate, nothing to miss.

## Why the exposure is narrower than it looked

A first draft of this finding claimed three gates were bypassed. Only one is. `allowed_paths_check` reads `git_changed_files_list` (`scripts/verify-sprint.sh:357`) and is therefore already immune, and inside a contract worktree `capture-plan --execute` produces plan and contract together — so a covered path implies an approved plan. The uncovered case is exactly: implementation change on `main`, no active plan, no contract. That is what this advisory watches.

## Placement

The check sits after the lite-profile early return, which matches `runEditPlanGate`'s own `workflowProfile === 'lite'` exemption (`mutation-guard.ts:532`) without restating it. The filter itself runs earlier, next to the changed set that is already computed for the architecture drain, so no second `git status` is spawned on the route that already carries the largest share of measured hook time.

Classification reuses the exported `isImplementationSurfacePath`. No second classifier: `plans/`, `tasks/`, `docs/`, `.ai/`, `.claude/`, `.codex/` and all Markdown are already exempt there, which is the entire false-positive surface.

## Why a JSONL file and not a telemetry metric

The advisory exists to measure a hit rate before anyone decides whether it should block. That needs a durable record, and `stderr` is not one. Adding a field to `hook-events.jsonl` would have been the tempting route, but `event-telemetry.ts` carries a measurement-completeness contract and `tasks/todos.md` already records one metric (`child_processes`) that is declared complete while never being populated. Repeating that shape to collect data about a gate would be self-defeating.

`.ai/harness/runs/unplanned-implementation.jsonl` is plain ignored runtime evidence in the same tree as `hook-events.jsonl`, with no typed contract to keep honest. The append is wrapped so a failure cannot change the Stop result, matching the sibling side effects above it.

## Out of scope / Future work

Enforce mode is not implemented and no policy key was added. The upgrade decision is data-gated: read the JSONL after a few weeks of real work and judge whether the hits are real problems or ordinary quick fixes on `main`. Adding a policy key now would design the switch before knowing whether anyone should ever flip it.
