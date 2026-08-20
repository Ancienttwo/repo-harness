> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Projects Source Migration Notes

## Decision

`/Users/chris/Projects/agentic-dev` is the only git-backed source repo for this skill. Runtime paths under `.claude/skills` and `.codex/skills` are aliases, not editable copies.

## Rationale

The prior layout made `/Users/chris/.claude/skills/agentic-dev` the git source and kept Codex runtime copies under `/Users/chris/.codex/skills`. That allowed drift between source, installed runtime, and legacy fallback bundles. The new layout keeps Git history and dirty work in one normal project location while preserving old skill entrypoints.

## Compatibility

- `/Users/chris/.claude/skills/agentic-dev` and `/Users/chris/.claude/skills/project-initializer` are symlinks to `/Users/chris/Projects/agentic-dev`.
- `/Users/chris/.codex/skills/agentic-dev` is a symlink to `/Users/chris/Projects/agentic-dev` and remains the only discoverable Codex skill surface.
- Codex legacy fallback aliases omit `SKILL.md` and `assets/skill-commands/` to avoid duplicate command discovery while resolving scripts/assets from the source repo.
