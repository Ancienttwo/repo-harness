# Workflow Orchestration Reference

> Externalized: full pattern lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/patterns/pattern-agentic-workflow-orchestration.md`
- gbrain slug: `patterns/pattern-agentic-workflow-orchestration`

## Repo Role

Concrete project execution still flows through plans, contracts, tasks,
workstreams, checks, and handoff files. The general multi-phase orchestration
pattern belongs in the external pattern page.

## Promotion Gate

Do not promote every sprint row or checklist step into a new `plans/plan-*.md`.
Create a top-level plan only when the slice is a coherent merge/PR unit, has a
separate rollback surface, needs independent verification, needs its own
review/acceptance boundary, touches a high-risk surface, or cannot remain a
checklist row in the active plan or sprint backlog.

Inline sprint rows stay in the sprint backlog or the active plan's
`## Task Breakdown`. Contract rows may expand through the full plan -> contract
-> review -> notes flow.
