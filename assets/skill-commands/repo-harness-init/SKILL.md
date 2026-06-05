---
name: repo-harness-init
description: Installs or refreshes the repo-harness workflow in an existing repository. Adds hooks, docs/spec.md, tasks, plans, .ai/context, .ai/harness, helpers, and policy without creating an application stack.
when_to_use: "repo-harness-init, initialize existing repo, add agentic workflow to existing repo, refresh repo-local harness, install tasks-first harness"
---

# repo-harness-init

Use this command for an existing repository that needs the repo-local agentic workflow installed or refreshed.

## Protocol

1. Confirm the target repo path.
2. If running from the target repo root, use `repo-harness update`; do not require `--repo .`.
3. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text`.
4. If the repo is legacy, route to `repo-harness-migrate`.
5. Otherwise run the safe path through `repo-harness update` or `bash scripts/migrate-project-template.sh --repo <repo> --apply`.
6. Bootstrap the expected host runtime dependencies in the same pass: Waza (`think`, `hunt`, `check`, `health`) and the bundled cross-review skills when source copies are available.
7. Verify with `bash scripts/check-task-workflow.sh --strict` inside the target repo when the helper exists.

## Failure Modes

- If the repo has legacy workflow docs, route to `repo-harness-migrate`.
- If the user asks for a new product skeleton, route to `repo-harness-scaffold`.
- If global runtime setup fails, report the exact target and rerun the focused install command.

## Boundaries

- Does not create a new application stack.
- Does not call `scripts/init-project.sh` for product scaffold work.
- Preserves existing user-authored repo files unless the workflow contract explicitly owns the generated surface.
