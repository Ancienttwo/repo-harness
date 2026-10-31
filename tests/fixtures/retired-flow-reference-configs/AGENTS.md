# Repo Agent Context

This is the root routing contract for Claude Code and Codex. Load this before task-local artifacts.

## Workflow Contract

- Use first principles, one source of truth, and no steady-state compatibility paths.
- Treat `docs/spec.md` as product truth; keep correction-derived lessons in `tasks/lessons.md`.
- Write a plan before cross-module changes, architecture changes, and dependency upgrades. Small changes do not need a plan.
- Create task worktrees only at `/tmp/<repo>-wt-<slug>` (Windows: the OS temp directory): use `repo-harness run contract-worktree start --plan <plan-file>`, or `git worktree add` with that path. Never create one beside the main checkout (`../`).
- Read `.ai/context/capabilities.json` and `.ai/context/context-map.json` before adding scoped agent context.
- When a branch changes a capability's responsibility, entrypoints, relations or flows, run `repo-harness architecture-projection check --json` before review and follow `repo-harness-architecture` (`assets/skill-commands/repo-harness-architecture/references/worker.md` in the installed `repo-harness` skill: `~/.claude/skills/repo-harness/` or `~/.codex/skills/repo-harness/`).
- Write human-facing documents (`docs/`, `docs/prds/`, design briefs) in the language set by `.ai/harness/policy.json#documentation.language`; keep section headers, field keys, and technical terms in English. Agent-facing artifacts stay English.
- Keep `_ref/` ignored external reference material and `_ops/` ignored local operations state.
