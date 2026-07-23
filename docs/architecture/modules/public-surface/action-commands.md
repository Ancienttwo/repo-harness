# Architecture Module: public-surface/command-facades

> **Capability ID**: `public-surface-action-commands`
> **Matched Prefix**: `assets/skill-commands`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

Canonical rule-owner packages live under `assets/skills/` (activated
canonical packages) and `assets/skill-commands/` (survivors evolving in
place); `assets/skill-commands/manifest.json` v2 is the runtime discovery
authority for package classification and host/profile projection. They
remain an on-demand catalog while the default installed discovery surface is
the root router plus the profile-selected subset of `repo-harness-plan`,
`repo-harness-check`, `repo-harness-product` (full only), and
`repo-harness-ship` (full only). The implementation authority remains in
the `repo-harness` CLI, scripts, hooks, and contract files:

- `repo-harness` (router; synced unconditionally to every profile)
- `repo-harness-setup` (adopt/init, migrate, upgrade, repair, scaffold,
  capability-configuration modes; router-only, never auto-discovered)
- `repo-harness-plan` (create/review modes; minimal/full)
- `repo-harness-product` (PRD/Sprint/Goal modes; full only)
- `repo-harness-check` (workflow/release checks plus deploy-readiness
  reference; minimal/full)
- `repo-harness-ship` (full only)
- `repo-harness-architecture` (router-only or explicit install)
- `repo-harness-cross-review` (host-aware Claude/Codex provider modes;
  installed on both hosts for full)
- `merge-gate` (classification-only row in the full discovery matrix;
  repo-harness ships no merge-gate Skill)
- `repo-harness-chatgpt` (explicit ChatGPT setup only; never implied by
  either install profile)

The manifest at `assets/skill-commands/manifest.json` is the on-demand facade
catalog. `scripts/sync-codex-installed-copies.sh` owns profile selection
(driven by `scripts/skill-surface-select.ts`'s manifest-derived name/source
pairs, not a fixed physical parent directory) and removes only exact
package-target symlinks, content-hash-verified owned copies, or byte-identical
package copies. Unknown and modified surfaces fail closed before the
transaction mutates any managed destination. Retired package names (the
pre-cutover `repo-harness-init`, `-migrate`, `-upgrade`, `-repair`,
`-scaffold`, `-capability`, `-review`, `-prd`, `-sprint`, `-goal`, `-handoff`,
`-deploy`, `-autoplan`, `-gptpro`, `-gptpro-setup`, plus `codex-review` and
`claude-review`) are recorded as migration diagnostics only in the manifest's
`retiredPackages` array, each pointing at its live replacement or `null` when
fully retired (autoplan).

## P2 Trace

Concrete route: user selects `repo-harness-ship` -> command facade confirms repo
path, dirty boundaries, linked worktrees, review/check evidence, and remote PR
tooling -> `scripts/ship-worktrees.sh` runs `contract-worktree.sh finish
--no-merge` for finished contract worktrees -> pushes `codex/<slug>` branches
-> creates draft PRs without fast-forwarding `main`.

Concrete verification route: user selects `repo-harness-check` -> command facade confirms repo
path and dirty boundaries -> runs `bun test`, task sync, workflow strict check,
inspector, and migration dry-run where available -> returns pass/fail readiness
instead of mutating the repo.

Command shape is prose plus exact commands. Ownership crosses from public
command docs into repo-local scripts only when the command protocol calls the
engine. Planning/review/goal modes are non-mutating by default; ship/setup's
adopt-init/scaffold/migrate/upgrade/repair modes are mutating by design after
explicit invocation.

Error paths:

- A command may route to another mode when inspection shows a different mode.
- Advisory tooling hangs or skipped checks must be reported, not hidden.
- Legacy compatibility directories must not expose duplicate command facades.

## P3 Decision

The canonical-package model exists to keep users choosing intent rather than
implementation steps while the CLI+hooks path owns execution. It preserves
the invariant that `hooks-init`, `docs-init`, and `create-project-dirs` are
internal steps, not public commands.

At 10x commands, the first failure is discovery and routing duplication. The
catalog may grow, but default installation remains bounded by the manifest's
two-profile projection. Full is the default 11-hook surface; explicit minimal
keeps the 7-hook baseline. Specialized commands are loaded only after an
explicit action or the selected profile includes them.

## Optimization Backlog

- Add an eval case whenever a new command changes routing behavior.
- Keep command facades thin; move policy into scripts, manifests, or reference configs.
