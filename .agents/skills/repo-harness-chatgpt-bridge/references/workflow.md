# Workflow

ChatGPT plans through MCP; Codex executes through repo-harness checks and handoff.

## Planning Chain

Use this chain for execution-ready planning:

1. idea -> PRD: call `write_prd_from_idea`.
2. PRD -> checklist Sprint: call `write_checklist_sprint`.
3. Sprint -> Goal: call `prepare_codex_goal_from_sprint` or run `repo-harness mcp prepare-goal`.

The MCP server prepares artifacts only. The local Codex host owns `/goal` execution.

Dev-mode exception:

- A user may explicitly enable `orchestrator` + `run_agent_goal` for local Developer Mode.
- The runner reads only `.ai/harness/handoff/codex-goal.md`.
- It runs only user-allowed local agents such as `codex` or `claude`.
- It is timeout-bounded, audited, and must not expose arbitrary shell or source-write tools.

## Agent Operating Modes

Setup mode:

- Run `repo-harness mcp doctor --repo .`.
- Run `repo-harness mcp setup chatgpt --repo .` for ChatGPT Connector files and the human guide.
- Run `repo-harness mcp setup codex --repo . --scope project` for local Codex MCP config.
- Run `repo-harness mcp install-skill --repo .` to install this Skill into the repo.

Planning handoff mode:

- Ask ChatGPT to inspect workflow state before writing.
- Keep output in `plans/prds/`, `plans/sprints/`, and `.ai/harness/handoff/`.
- Use `prepare_codex_goal_from_sprint` or `repo-harness mcp prepare-goal` for the final Codex handoff.

Execution mode:

- Codex reads `.ai/harness/handoff/codex-goal.md`.
- Codex executes one Sprint task card at a time.
- Codex runs checks and stages each completed phase before continuing.

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

## Safety Boundary

MCP planner profile is for workflow artifacts only. It must not expose source-code edits, arbitrary shell commands, package manifest writes, lockfile writes, CI writes, secrets, `_ops/`, or writable `_ref/` access.

The orchestrator dev runner is separate from planner mode. It is off by default and exists only for users who intentionally want ChatGPT Developer Mode to trigger a local Codex/Claude CLI against the fixed Codex goal handoff.
