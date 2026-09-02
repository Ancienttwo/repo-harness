# Sprint: {{SPRINT_TITLE}}

> **Status**: Draft
> **Slug**: {{SPRINT_SLUG}}
> **Created**: {{TIMESTAMP}}
> **Updated**: {{TIMESTAMP}}
> **Source PRD**: (optional) `plans/prds/<prd>.prd.md`
> **Source Spec**: `docs/spec.md`
> **Backlog Schema**: 2
> **Goal Mode**: incremental

Program-level sprint container. The Source PRD summary and ordered backlog
decompose product intent into ordered rows. Contract rows become task-contract
slices after `$think` expansion; inline rows stay in the sprint backlog or
active plan Task Breakdown.
`tasks/todos.md` stays the deferred-goal ledger and never carries this backlog.

## PRD

Summarize or link the upper-layer PRD here. Keep the full PRD in `plans/prds/`.

### Problem

- ...

### Users

- ...

### Success Criteria

- ...

### Acceptance Scenarios

- ...

### Non-goals

- ...

## Architecture Notes

### Capabilities Touched

- ...

### Dependency Order

- ...

### Risks

- ...

## Backlog

Ordered execution queue; keep rows in dependency order. Mode `contract` runs
the full plan -> contract -> worktree flow; `inline` allows primary-tree
execution for small tasks. Every row needs a concrete acceptance line.

The `ID` cell is the persisted, immutable task identity (64 lowercase hex
characters). It is minted once when the row is created and must never be edited,
copied between rows, or regenerated: editing the Task text is a rename, not a new
task.

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | {{TASK_ID_1}} | [ ] | {{SPRINT_SLUG}}-task-1 | contract | Replace with a machine-checkable acceptance line | (pending) |

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
