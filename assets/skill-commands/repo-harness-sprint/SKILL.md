---
name: repo-harness-sprint
description: Program-level sprint planning and execution entrypoint. Uses upper-layer PRDs from plans/prds/ when present, writes ordered sprint backlogs in plans/sprints/, expands contract rows with $think into plan/contract/worktree flow, and keeps inline rows inside the sprint backlog or active plan checklist.
when_to_use: "repo-harness-sprint, plan a sprint, create sprint backlog, from-prd, PRD to sprint, sprint from PRD, run next sprint task, sprint status"
---

# repo-harness-sprint

Use this command to plan a program-level Sprint from an upper-layer PRD or source spec and execute its tasks through the existing task-contract flow. Sub-routes: `plan`, `from-prd`, `run`, `status`.

## Protocol

1. Confirm the working repo with `git rev-parse --show-toplevel`; read `docs/spec.md`, `.ai/harness/policy.json`, and `repo-harness run sprint-backlog status` when present.
2. Route `plan` (default when no sprint is active):
   - Discuss the product direction with the user from two named perspectives before writing anything: product (problem, users, success criteria, acceptance scenarios, non-goals) and architecture (capabilities touched, dependency order, risks, slice granularity).
   - Run `repo-harness run sprint-backlog init --slug <slug> --title <title>`, then fill `## PRD`, `## Architecture Notes`, and the ordered `## Backlog` table from the upper-layer PRD or source spec; every row needs a concrete machine-checkable acceptance line and a mode (`contract` or `inline`).
   - Present the draft sprint to the user. Only after explicit approval set `> **Status**: Approved`; `check-task-workflow.sh --strict` rejects placeholder PRDs, placeholder acceptance lines, and duplicate backlog rows.
3. Route `from-prd` when the user gives `plans/prds/*.prd.md`:
   - Read the PRD `Problem`, `Users`, `Success Criteria`, `Acceptance Scenarios`, and `Non-goals`; summarize them into the Sprint `## PRD` section and set `> **Source PRD**:` to the PRD path.
   - Derive backlog rows from `Module Behaviors (P0)` and acceptance scenario groups. Preserve dependency order and make every acceptance line traceable to a PRD acceptance scenario.
   - Keep discussion focused on ordering, slice granularity, and mode selection; do not re-decide the product intent unless the PRD has blocking contradictions.
   - Use `contract` rows for one plan -> contract -> worktree cycle. Split larger work at stable integration boundaries.
   - Acceptance lines must be machine-checkable, such as a test command, file existence assertion, grep pattern, or numeric assertion. Avoid subjective wording such as "works well".
   - Default mode is `contract`; use `inline` only for small isolated documentation, configuration, or single-file changes.
4. Route `run` (incremental, one backlog task per invocation):
   - Run `repo-harness run sprint-backlog next` to resolve the next pending row; when it exits 3, report the backlog as complete and recommend setting the sprint Status to Done after review.
   - Treat the row as a long-task waypoint, not a detailed implementation plan.
   - For `contract` rows, invoke `$think` with the sprint path, row task, mode, acceptance line, and Promotion Gate fields so the coding agent expands it into a decision-complete plan. Capture the approved `$think` output with `repo-harness run capture-plan --artifact-level work-package --promotion-reason worktree_boundary --source waza-think --source-ref sprint:<sprint-file>#<task> --status Approved --execute`.
   - For `inline` rows, do not create a new `plans/plan-*.md` or task contract. Keep the work in the sprint backlog or the current active plan's `## Task Breakdown`, then complete the row when the acceptance line is verified.
   - `repo-harness run sprint-backlog start-task` remains a compatibility helper for reserving a row. It captures a thin plan seed only for `contract` rows; inline rows append checklist-row content to the current active plan before recording an in-flight marker.
   - Execute contract slices as usual (implement, `/check`, external acceptance, `repo-harness run contract-worktree finish`); finish back-fills the backlog row warn-only.
5. Route `status`: report `repo-harness run sprint-backlog status` plus the Active Sprint section of `tasks/current.md`; mutate nothing.
6. After each completed task, re-read the sprint file before starting the next one; user edits to the backlog override stale session memory.

## Failure Modes

- If no sprint file exists and the user asked for `run` or `status`, report that no sprint is active and route to `plan`.
- If the backlog table is malformed or `check-task-workflow.sh --strict` rejects the sprint, stop and fix the sprint file before starting any task.
- If `start-task` fails after the plan was captured, report the orphan plan path and stop instead of retrying blindly.
- If a task contract is already executing in this worktree, finish or archive it first; never stack a second backlog task on top of it.

## Boundaries

- Does not implement backlog tasks itself; contract rows flow through the existing plan -> contract -> worktree -> verify gates, while inline rows stay in sprint/active-plan checklist scope.
- Does not set `> **Status**: Approved` without explicit user approval of the PRD and backlog.
- Never bypasses `/check`, external acceptance, or `verify-sprint.sh` to mark a backlog row complete.
- Goal mode (`run --goal`, autonomous continuation) is not part of this command yet; treat requests for it as future work and say so.
- Do not run two backlog tasks in parallel: concurrent contract rows merge-conflict on the sprint file's Updated and Execution Log lines; the backlog is an ordered queue.
- `tasks/todos.md` stays the deferred-goal ledger; never write the backlog there.
