> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Implementation Notes: agentic-dev rename

## Decision

Use `agentic-dev` for the skill/package/repo display surface while preserving `agentic-dev-skill` and `project-initializer` as legacy aliases.

## Compatibility Boundaries

- The initial display rename slice did not migrate filesystem install paths.
- Do not change generated stamp prefix from `project-initializer@...` in this slice.
- Do not change resolver fallbacks that look under `agentic-dev-skill` or `project-initializer` installed paths.
- Move default brain pointers to `icloud/brain/agentic-dev/*`, with `icloud/brain/agentic-dev-skill/*` and `icloud/brain/project-initializer/*` retained as legacy redirect/index paths.

## Follow-Through Surface

The next directory-migration slice can add a new installed path and alias resolver only after source repo checks, installed-copy sync, and migrated-repo version checks are validated together.

## Resolver Update

- `AGENTIC_DEV_ROOT` is now the preferred explicit upstream root.
- `AGENTIC_DEV_SKILL_ROOT` and `PROJECT_INITIALIZER_ROOT` remain legacy explicit upstream roots.
- Runtime lookup prefers `agentic-dev` installed paths and falls back to `agentic-dev-skill` and `project-initializer` installed paths across Codex, Claude, and skills CLI staging.
- The generated version stamp still uses the legacy prefix in this slice.
- `SKILL.md` keeps `agentic-dev-skill` and `project-initializer` in `when_to_use` metadata so legacy triggers remain discoverable even though the frontmatter `name` is `agentic-dev`.

## Installed Copy Follow-Through

- Superseded by `tasks/notes/projects-source-migration.notes.md`: `/Users/chris/Projects/agentic-dev` is now the only git-backed source repo.
- `/Users/chris/.codex/skills/agentic-dev` is now a symlink to the source repo and remains the only Codex discoverable skill surface.
- `/Users/chris/.codex/skills/agentic-dev-skill` and `/Users/chris/.codex/skills/project-initializer` remain legacy Codex runtime fallback aliases, but they must not contain `SKILL.md` files or `assets/skill-commands/` because Codex discovery scans those recursively and would show duplicate command skills.
- `/Users/chris/.claude/skills/agentic-dev` and `/Users/chris/.claude/skills/project-initializer` are symlink aliases pointing at `/Users/chris/Projects/agentic-dev`.
- Installed-copy sync uses `scripts/sync-codex-installed-copies.sh`; default local sync keeps aliases source-backed, while copy-based staging is still available with `AGENTIC_DEV_LINK_INSTALLED_COPIES=0` or a custom `CODEX_SKILLS_ROOT`.
