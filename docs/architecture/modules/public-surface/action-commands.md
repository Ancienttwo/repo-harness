# Architecture Module: public-surface/command-facades

> **Capability ID**: `public-surface-action-commands`
> **Matched Prefix**: `assets/skill-commands`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

Command facades are on-demand skill wrappers stored under
`assets/skill-commands/`. They remain a CLI/documentation catalog, while the
default installed discovery surface is the root router plus at most
`repo-harness-plan`, `repo-harness-check`, and `repo-harness-handoff`. The implementation authority remains in the `repo-harness` CLI,
scripts, hooks, and contract files:

- `repo-harness-plan`
- `repo-harness-review`
- `repo-harness-autoplan`
- `repo-harness-ship`
- `repo-harness-init`
- `repo-harness-scaffold`
- `repo-harness-migrate`
- `repo-harness-upgrade`
- `repo-harness-capability`
- `repo-harness-architecture`
- `repo-harness-handoff`
- `repo-harness-deploy`
- `repo-harness-repair`
- `repo-harness-check`
- `repo-harness-prd`
- `repo-harness-sprint`
- `repo-harness-goal`
- `repo-harness-gptpro-setup`
- `repo-harness-gptpro`

The manifest at `assets/skill-commands/manifest.json` is the on-demand facade
catalog. `scripts/sync-codex-installed-copies.sh` owns profile selection and
removes only exact package-target symlinks, content-hash-verified owned copies,
or byte-identical package copies. Unknown and modified surfaces fail closed
before the transaction mutates any managed destination.

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
engine. Planning/review/goal are non-mutating by default; autoplan/ship/init/
scaffold/migrate/upgrade/repair are mutating by design after explicit command
invocation.

Error paths:

- A command may route to another command when inspection shows a different mode.
- Advisory tooling hangs or skipped checks must be reported, not hidden.
- Legacy compatibility directories must not expose duplicate command facades.

## P3 Decision

The facade model exists to keep users choosing intent rather than implementation
steps while the CLI+hooks path owns execution. It preserves the invariant that
`hooks-init`, `docs-init`, and `create-project-dirs` are internal steps, not
public commands.

At 10x commands, the first failure is discovery and routing duplication. The
catalog may grow, but default installation remains bounded and specialized
commands are loaded only after an explicit action.

## Optimization Backlog

- Add an eval case whenever a new command changes routing behavior.
- Keep command facades thin; move policy into scripts, manifests, or reference configs.
