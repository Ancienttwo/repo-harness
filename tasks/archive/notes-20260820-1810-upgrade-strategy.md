> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Upgrade Strategy Notes

## Decision

The upgrade lane is contract-driven rather than script-local. `assets/workflow-contract.v1.json#migrations.upgrade.actions` owns the action list, `scripts/inspect-project-state.ts` projects detected signals into `upgrade_plan`, and `scripts/migrate-project-template.sh` deletes only paths from actions marked `action=remove` and `ownership=known_generated`.

## Tradeoff

Generated legacy files can still be removed automatically, but unknown user files are no longer covered by broad directory deletes. That leaves some empty directories behind in edge cases, which is preferable to deleting user-owned hook helpers or local state by accident.

## Global Rules

The user-level Claude/Codex working rules are kept in `docs/reference-configs/global-working-rules.md` and installed manually into `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md`. The repo-local `AGENTS.md` / `CLAUDE.md` contract stays short and workflow-specific.

