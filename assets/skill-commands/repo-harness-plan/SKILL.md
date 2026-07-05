---
name: repo-harness-plan
description: Interactive planning entrypoint for repo-local agentic development work. Produces an approved plan before implementation and routes to init, scaffold, migrate, upgrade, repair, or check only after the decision is clear.
when_to_use: "repo-harness-plan, plan repo-local agentic workflow work, design repo-harness change, decide init vs scaffold vs migrate, plan harness change"
---

# repo-harness-plan

Use this command when the user wants a decision-complete plan for repo-harness workflow work.

## Protocol

1. Confirm the working repo with `pwd` or `git rev-parse --show-toplevel`.
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text` when the target repo has this engine available.
3. Read repo-local `AGENTS.md`, `CLAUDE.md`, `tasks/todos.md`, and `.ai/harness/policy.json` when present.
4. Before recommending implementation, write a workflow inventory: active plan path, expected contract/review/notes files, `tasks/todos.md`, `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, allowed-path owner, and the plan switching or worktree isolation rule.
5. Produce one recommended plan and name the next action command: `repo-harness-init`, `repo-harness-scaffold`, `repo-harness-migrate`, `repo-harness-upgrade`, `repo-harness-repair`, or `repo-harness-check`.
6. When the plan is decision-complete, capture it with `repo-harness run capture-plan --slug <slug> --title <title>` so the repo has a file-backed `plans/plan-*.md` artifact.

## Delegation Brief

`tasks/contracts/<stem>.contract.md` is the authoritative delegation brief once implementation is handed to a file-coupled worker, not this skill's own narration. Before that handoff, fill in the contract's `## Why`, `## Goal`, `## Scope`, `## Stop Conditions`, `allowed_paths`, and `exit_criteria`; a template placeholder in any of these fails the gate closed. Verify completeness with `repo-harness run contract-run preflight --contract <contract-file>`.

## Failure Modes

- If the inspector cannot classify the repo, keep the plan in Draft and list the missing files.
- If implementation approval is absent, do not run `repo-harness run plan-to-todo`.
- If the requested command surface is ambiguous, pick one public command and name why the alternatives are out of scope.

## Boundaries

- Does not edit implementation files or run `repo-harness run plan-to-todo` by default.
- May save a plan artifact with `repo-harness run capture-plan`; do not generate contracts, reviews, todos, or worktrees until the user approves implementation.
- Do not optimize for a planning harness by removing approval, review, or contract scope gates. If an automated run stalls on approval, fix the test harness or capture route, not the approval boundary.
- Do not expose `hooks-init`, `docs-init`, or `create-project-dirs` as public commands; they are internal implementation steps.
