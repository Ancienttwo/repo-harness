> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Codex Hook Adapter Notes

## Decision

Codex hook support is a repo-local adapter surface at `.codex/hooks.json`. The
shared implementation remains `.ai/hooks/`; the Codex adapter uses the same
`assets/hooks/settings.template.json` command graph as `.claude/settings.json`.

## Evidence

- `codex features list` reports `hooks` as stable and enabled.
- `~/.codex/config.toml` stores trusted hook hashes for
  `/Users/ancienttwo/Projects/agentic-dev/.codex/hooks.json:*`.
- The previous init/migrate paths installed `.ai/hooks/` and
  `.claude/settings.json`, but not `.codex/hooks.json`, leaving Codex without a
  hook entrypoint in initialized repos.

## Boundary

Track `.codex/hooks.json` as adapter config. Keep other repo-local `.codex/*`
ignored as runtime residue, and keep all executable hook behavior in `.ai/hooks/`.
Every init, scaffold, or migration completion path should remind the user to
trust the repo hook in Codex Settings; adapter files alone are not enough for
Codex to execute hooks.

## Follow-up Fix

The installed-copy sync originally refreshed only `~/.codex/skills/*`. That left
`~/.claude/skills/project-initializer` as a standalone stale repo at version
5.0.2 while Codex aliases had moved to 5.1.1. The sync helper now refreshes
Claude `agentic-dev`, `agentic-dev-skill`, and `project-initializer` aliases
alongside Codex so Claude hook trust screens cannot keep pointing at the old
project root after a runtime refresh.
