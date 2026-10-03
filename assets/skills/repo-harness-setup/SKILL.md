---
name: repo-harness-setup
description: Canonical rule owner for installing, migrating, upgrading, repairing, scaffolding, and capability-configuring the repo-harness workflow in a repository.
when_to_use: "repo-harness-setup, initialize existing repo, migrate legacy repo, upgrade harness, repair harness, scaffold new project, add capability boundary"
---

# repo-harness-setup

Worker entrypoint. Use the Bot-assigned mode and target repo.
If either is missing, return the decision to the Bot.

Load only the reference for the assigned mode.

## Shared Preflight

1. Confirm the target repo path (`pwd`, or an explicit `--repo` argument).
2. Inspect the proposed changes with `repo-harness init --repo <repo> --dry-run`.

## Mode Selection

- No harness yet, or refreshing an existing install -> `references/init.md`.
- Inspector reports legacy docs or stale harness artifacts -> `references/migrate.md`.
- Harness present, needs latest contract/helpers/templates -> `references/upgrade.md`.
- A specific workflow surface is broken -> `references/repair.md`.
- New project/app/module skeleton, no existing repo workflow -> `references/scaffold.md`.
- Add or sync one capability boundary only -> `references/capability.md`.

## Boundaries

- Never write user-level (`HOME`) state from a repo-scoped mode; user-level setup is the separate `repo-harness update` command.
- Preserve user-authored repo files unless the workflow contract owns the generated surface; remove only `ownership=known_generated` files.
- Does not create an application stack from any mode except `scaffold`.
- Does not expose internal helper scripts (`create-project-dirs`, direct shell init adapters, `hooks-init`, `docs-init`) as public commands.
- Does not infer capability prefixes from broad directory globs; always use explicit prefixes.
- Return a request spanning multiple modes to the Bot for scope and order.
