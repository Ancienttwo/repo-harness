---
name: agentic-dev-plan
description: Interactive planning entrypoint for repo-local agentic development work. Produces an approved plan before implementation and routes to init, scaffold, migrate, upgrade, repair, or check only after the decision is clear.
when_to_use: "agentic-dev-plan, plan repo-local agentic workflow work, design agentic-dev change, decide init vs scaffold vs migrate, plan harness change"
---

# agentic-dev-plan

Use this command when the user wants a decision-complete plan for agentic-dev workflow work.

## Protocol

1. Confirm the working repo with `pwd` or `git rev-parse --show-toplevel`.
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text` when the target repo has this engine available.
3. Read repo-local `AGENTS.md`, `CLAUDE.md`, `tasks/todo.md`, and `.ai/harness/policy.json` when present.
4. Before recommending implementation, write a workflow inventory: active plan path, expected contract/review/notes files, `tasks/todo.md`, `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, allowed-path owner, and the plan switching or worktree isolation rule.
5. Produce one recommended plan and name the next action command: `agentic-dev-init`, `agentic-dev-scaffold`, `agentic-dev-migrate`, `agentic-dev-upgrade`, `agentic-dev-repair`, or `agentic-dev-check`.
6. When the plan is decision-complete, capture it with `scripts/capture-plan.sh --slug <slug> --title <title>` so the repo has a file-backed `plans/plan-*.md` artifact.

## Boundaries

- Does not edit implementation files or run `plan-to-todo.sh` by default.
- May save a plan artifact with `scripts/capture-plan.sh`; do not generate contracts, reviews, todos, or worktrees until the user approves implementation.
- Do not optimize for a planning harness by removing approval, review, or contract scope gates. If an automated run stalls on approval, fix the test harness or capture route, not the approval boundary.
- Do not expose `hooks-init`, `docs-init`, or `create-project-dirs` as public commands; they are internal implementation steps.
