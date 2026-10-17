# Product mode: ordered backlog

Use this route to order work from a PRD or source spec. The GitHub issue and PR
own task identity, claim, status and dependencies. A planning document is a
reference. It does not authorize execution.

## Plan or derive from a PRD

1. Read the problem, users, success criteria, acceptance scenarios and non-goals.
2. Identify the affected capabilities and the dependency order.
3. Divide the work into bounded issues. Give each issue a goal, scope,
   acceptance check, dependency and rollback step.
4. Link each issue to its source requirement. Use existing issue numbers.
   Do not mint task IDs, contracts, offers or leases.
5. Save the requested plan or issue drafts. Create or update GitHub issues only
   within the user's requested write scope. Use gh or the GitHub API.

Keep product intent fixed when deriving work from an approved PRD. Report a
contradiction before changing that intent. Use test commands or observable
outcomes as acceptance checks.

## Status

Read the current issue and PR state. Report completed work, open dependencies
and verification evidence. Historical sprint files remain readable Markdown.
They are not a task queue or a claim source.

## Boundaries

This route plans work. It does not dispatch a worker or start a task.
Execution uses the issue brief and the repository's current working rules.
Preserve user approval. Follow the boundaries in `../SKILL.md`.
