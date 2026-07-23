---
name: repo-harness-setup
description: Canonical rule owner for installing, migrating, upgrading, repairing, scaffolding, and capability-configuring the repo-harness workflow in a repository.
when_to_use: "repo-harness-setup, initialize existing repo, migrate legacy repo, upgrade harness, repair harness, scaffold new project, add capability boundary"
---

# repo-harness-setup

Canonical rule owner for adopt/init, migrate, upgrade, repair, scaffold, and
capability configuration. Router-only: shared preflight, mode selection, and
cross-mode boundaries. Mode protocol lives under `references/`.

## Shared Preflight

1. Confirm the target repo path (`pwd`, or an explicit `--repo` argument).
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text` when available.

## Mode Selection

- No harness yet, or refreshing an existing install -> `references/adopt-init.md`.
- Inspector reports legacy docs or stale harness artifacts -> `references/migrate.md`.
- Harness present, needs latest contract/helpers/templates -> `references/upgrade.md`.
- A specific workflow surface is broken -> `references/repair.md`.
- New project/app/module skeleton, no existing repo workflow -> `references/scaffold.md`.
- Add or sync one capability boundary only -> `references/capability.md`.

## Boundaries

- Never write user-level (`HOME`) state from a repo-scoped mode; user-level setup is the separate `repo-harness update` command.
- Preserve user-authored repo files unless the workflow contract owns the generated surface; remove only `ownership=known_generated` files.
- Does not create an application stack from any mode except `scaffold`.
- Does not expose internal helper scripts (`create-project-dirs`, direct `scripts/init-project.sh`, `hooks-init`, `docs-init`) as public commands.
- Does not infer capability prefixes from broad directory globs; always use explicit prefixes.
- A request spanning more than one mode resolves in dependency order, re-running the shared preflight before each next mode.
