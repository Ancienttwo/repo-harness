---
name: repo-harness-init
description: Installs or refreshes the repo-harness workflow in an existing repository. Adds hooks, docs/spec.md, tasks, plans, .ai/context, .ai/harness, helpers, and policy without creating an application stack.
when_to_use: "repo-harness-init, initialize existing repo, add agentic workflow to existing repo, refresh repo-local harness, install tasks-first harness"
---

# repo-harness-init

Use this command for an existing repository that needs the repo-local agentic workflow installed or refreshed.

## Protocol

1. Confirm the target repo path.
2. If running from the target repo root, use `repo-harness adopt`; do not require `--repo .`.
3. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text`.
4. If the repo is legacy, route to `repo-harness-migrate`.
5. Otherwise run the safe path through `repo-harness adopt` or `bash scripts/migrate-project-template.sh --repo <repo> --apply`.
6. If user-level runtime dependencies are missing, run `repo-harness update` separately; repo adoption must not write HOME.
7. Verify with `repo-harness run check-task-workflow --strict` inside the target repo.

## Failure Modes

- If the repo has legacy workflow docs, route to `repo-harness-migrate`.
- If the user asks for a new product skeleton, route to `repo-harness-scaffold`.
- If global runtime setup is missing, report the exact target and rerun the focused `repo-harness update` command.

## Boundaries

- Does not create a new application stack.
- Does not call `scripts/init-project.sh` for product scaffold work.
- Preserves existing user-authored repo files unless the workflow contract explicitly owns the generated surface.
