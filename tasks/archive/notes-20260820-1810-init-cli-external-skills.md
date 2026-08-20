> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260528-1906-init-cli-external-skills.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Init CLI External Skills Notes

## Decision

Add a first-class `agentic-dev init` CLI path instead of requiring operators to
compose installed-copy sync, host adapter install, migration, external skill
bootstrap, and verification manually.

## Scope

- Default repo target is cwd; `--repo` remains available for off-root calls.
- Runtime target is `--target codex|claude|both`, defaulting to `both`.
- `project-initializer` installed skill paths are retired cleanup targets, not
  compatibility fallbacks.
- `agentic-dev-skill` remains the only compatibility alias.

## Tradeoff

Init now has side effects outside the target repo because it writes host adapter
config and skill roots. The command exposes `--no-sync-skill`,
`--no-host-adapters`, `--no-external-skills`, and `--dry-run` for bounded use,
but the default path is intentionally the complete operator setup path.

## Out of Scope

- CodeGraph MCP installation.
- gstack/gbrain installation or daemon setup.
- Renaming every historical `PROJECT_INITIALIZER_*` environment knob; this
  slice removes the installed path and upstream resolver contract that users hit.
