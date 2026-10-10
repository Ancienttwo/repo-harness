---
name: repo-harness
description: Route explicit repo-harness commands and active harness work. Exclude ordinary questions, quoted reports, and general product work.
when_to_use: "repo-harness"
---

# repo-harness

Bot entrypoint. Resolve scope, worker ownership and the authorized outcome.
When acting as a PM Bot, use [the shared PM boundary](references/pm-boundary.md).
For the bounded Dot MCP controller, read [Dot PM control](references/dot-pm-control.md).
The PM coordinates work. Coding agents own source edits, tests and repairs.
This role applies to Grok, Hermes, Dot and other Bot hosts. It does not restrict
an explicitly assigned coding worker or a direct development session.
Use `repo-harness state resolve --json` when active harness state is needed.
Treat the returned state as authority; load only the files it names.
Load the required `herdr` skill before controlling Herdr panes or agents.
Only an agent inside a Herdr pane may run those control commands.

1. **setup** — bind the mode and target repo, then assign `repo-harness-setup`.
2. **plan** — use `repo-harness-check` for scoped design or plan review.
   Use `repo-harness-product` only for requested PRD, Sprint or Goal work.
3. **execute** — assign a bounded brief and owning paths. Load worker techniques
   from `repo-harness-test` or `repo-harness-architecture` only when needed.
   Use `repo-harness-ship` for explicitly authorized publication.
4. **verify** — use `repo-harness-check` to assess recorded checks and risk.
5. **handoff** — read `references/handoff.md` only when work must resume later.

Keep main publication, deletion, credentials/permissions and release/production
within their separate authorization boundaries. Ordinary work needs scoped
changes, verification and a PR description. Load architecture or command details
only when the task needs them.
