# Workflow

ChatGPT plans through MCP; Codex executes through repo-harness checks and handoff.

## Planning Chain

Use this chain for execution-ready planning:

1. idea -> PRD: call `write_prd_from_idea`.
2. PRD -> checklist Sprint: call `write_checklist_sprint`.
3. Sprint -> Goal: call `prepare_codex_goal_from_sprint` or run `repo-harness mcp prepare-goal`.

The MCP server prepares artifacts only. The local Codex host owns `/goal` execution.

## Sprint Format

When ChatGPT writes a sprint for Codex execution, use checklist task cards rather than prose-only plans.

Each execution phase should include:

- `[ ]` checklist items for concrete implementation steps.
- Acceptance criteria for the phase.
- Verification commands or evidence expected before the phase is considered done.
- A staging gate that tells Codex to stage the completed phase before continuing.

Preferred task card shape:

```markdown
## Task Card N: <phase name>

status: pending

Tasks:

- [ ] <step>
- [ ] <step>

Acceptance criteria:

- [ ] <observable outcome>

Verification:

- [ ] `<command or evidence surface>`

Stage gate:

- [ ] Stage all files for this completed phase before starting the next task card.
```

Codex should update checklist status as work completes and stop at staging gates long enough to verify `git status --short` shows the intended staged files.
