# Architecture Module: public-surface/action-commands

> **Capability ID**: `public-surface-action-commands`
> **Matched Prefix**: `assets/skill-commands`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

Action commands are thin skill facades stored under `assets/skill-commands/`.
They expose user-facing verbs without duplicating the engine:

- `agentic-dev-plan`
- `agentic-dev-review`
- `agentic-dev-autoplan`
- `agentic-dev-init`
- `agentic-dev-scaffold`
- `agentic-dev-migrate`
- `agentic-dev-upgrade`
- `agentic-dev-capability`
- `agentic-dev-architecture`
- `agentic-dev-handoff`
- `agentic-dev-deploy`
- `agentic-dev-repair`
- `agentic-dev-check`

The manifest at `assets/skill-commands/manifest.json` is the public command
catalog. The root `SKILL.md` remains the router over the same engine.

## P2 Trace

Concrete route: user selects `agentic-dev-check` -> command facade confirms repo
path and dirty boundaries -> runs `bun test`, task sync, workflow strict check,
inspector, and migration dry-run where available -> returns pass/fail readiness
instead of mutating the repo.

Command shape is prose plus exact commands. Ownership crosses from public
command docs into repo-local scripts only when the command protocol calls the
engine. Planning/review/autoplan are non-mutating by default; init/scaffold/
migrate/upgrade/repair are mutating by design.

Error paths:

- A command may route to another command when inspection shows a different mode.
- Advisory tooling hangs or skipped checks must be reported, not hidden.
- Legacy compatibility directories must not expose duplicate command facades.

## P3 Decision

The action-command model exists to keep users choosing intent rather than
implementation steps. It preserves the invariant that `hooks-init`, `docs-init`,
and `create-project-dirs` are internal steps, not public commands.

At 10x commands, the first failure would be duplicate policy across command
files. The smallest coherent guard is the manifest plus tests and architecture
docs that assert command inventory, mutability defaults, and public boundaries
from the same action-style surface.

## Optimization Backlog

- Add an eval case whenever a new command changes routing behavior.
- Keep command facades thin; move policy into scripts, manifests, or reference configs.
