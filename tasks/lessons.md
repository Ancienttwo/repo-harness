# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:

## Command facade skills must register standalone, not only the umbrella
- Date: 2026-06-18
- Triggered by correction: User reported only the umbrella `repo-harness` skill was discoverable in Claude Code; the 19 `assets/skill-commands/repo-harness-*` facades were invisible.
- Mistake pattern: `sync-codex-installed-copies.sh` linked only the package root as `~/.claude/skills/repo-harness` (and the Codex canonical copy), so facades existed only nested inside that copy and the host never registered them as their own skills.
- Prevention rule: When facades are added/removed under `assets/skill-commands/repo-harness-*`, the installed-copy sync must register each as a standalone host skill in both the Codex and Claude skill roots, for link and copy modes. Drive it off the directory glob (each facade dir has a self-contained `SKILL.md`).
- Where to apply next time: `scripts/sync-codex-installed-copies.sh` (`sync_command_facades`) plus its coverage in `tests/installed-copy-sync.test.ts`; keep both in sync with the facade catalog in `assets/skill-commands/manifest.json`.
