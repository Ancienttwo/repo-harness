# Plan Mode: Create

Source facade: `assets/skill-commands/repo-harness-plan`.

Use when the user wants a decision-complete plan for repo-harness workflow
work. Run the shared preflight in `../SKILL.md` first.

## Protocol

1. Read repo-local `AGENTS.md`, `CLAUDE.md`, `tasks/todos.md`, and `.ai/harness/policy.json` when present.
2. For product discovery and complex/design or architecture planning, invoke `geju` before a contract exists to establish the thesis, direction, falsifier, and cheapest proof point. The parent agent then completes P1/P2/P3 with its own repo/runtime capabilities; no external planning provider owns or blocks this lifecycle.
3. Before recommending implementation, write a workflow inventory: active plan path, expected contract/review/notes files, `tasks/todos.md`, `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, allowed-path owner, and the plan switching or worktree isolation rule.
4. Produce one recommended plan and name the next action: `repo-harness-setup` (selecting its adopt-init, scaffold, migrate, upgrade, or repair mode) or `repo-harness-check`.
5. When the plan is decision-complete, capture it with `repo-harness run capture-plan --slug <slug> --title <title>` so the repo has a file-backed `plans/plan-*.md` artifact.

## Delegation Brief

`tasks/contracts/<stem>.contract.md` is the authoritative delegation brief once implementation is handed to a file-coupled worker, not this mode's own narration. Before that handoff, fill in the contract's `## Why`, `## Goal`, `## Scope`, `## Stop Conditions`, `allowed_paths`, and `exit_criteria`; a template placeholder in any of these fails the gate closed. Verify completeness with `repo-harness run contract-run preflight --contract <contract-file>`.

When this plan traces back to a `$geju`/格局 pass, freeze its thesis and high-level direction into the contract's `## Why` and its falsifier plus cheapest proof point into the optional `## Falsifier` before capturing the contract; live geju framing is pre-contract exploration only, and once frozen the contract governs, not the live pass.

## Failure Modes

- If the inspector cannot classify the repo, keep the plan in Draft and list the missing files.
- If implementation approval is absent, do not run `repo-harness run plan-to-todo`.
- If the requested command surface is ambiguous, pick one public command and name why the alternatives are out of scope.

## Boundaries

- Does not edit implementation files or run `repo-harness run plan-to-todo` by default.
- May save a plan artifact with `repo-harness run capture-plan`; do not generate contracts, reviews, todos, or worktrees until the user approves implementation.
- Do not optimize for a planning harness by removing approval, review, or contract scope gates. If an automated run stalls on approval, fix the test harness or capture route, not the approval boundary.
- Internal implementation steps (`hooks-init`, `docs-init`, `create-project-dirs`) are `repo-harness-setup`'s non-public boundary, not this mode's own; see its `SKILL.md` Boundaries.
