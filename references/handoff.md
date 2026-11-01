# Root Reference: Handoff

Use when work must resume later in another session or with another agent.

The GitHub issue, its claim comments and the PR carry the session handoff. No
local file carries resume state. `.ai/harness/handoff/` holds only the MCP
bridge inputs `task-goal.md` and `chatgpt-plan.md`.

## Protocol

1. Confirm the issue, the branch and the claim that the work runs under.
2. Push the branch head that the next session continues from.
3. Post an `issue claim status` comment on the issue. Give the branch, the head
   SHA, what is done, what is left and the next command.
4. When the seat moves to another agent, post a `handoff` comment that names
   the next head owner and the exact head SHA.
5. To resume, read the issue with all comments, the latest claim status and
   the PR. Continue from the next command that the latest status gives.

The comment shapes are in
`assets/skills/repo-harness-issue-flow/references/templates.md`.

## Boundaries

- Does not write a local handoff, resume or Codex-global packet file.
- Does not run `/check`. Route a readiness request to the check workflow.
- A handoff comment does not grant commit, push, merge or deletion authority.
