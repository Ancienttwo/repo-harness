# Migration Guide (current tasks-first contract)

This guide upgrades existing repositories to the current `agentic-dev` tasks-first
harness. `agentic-dev-skill` and `project-initializer` remain legacy aliases, but
new docs and commands should use `agentic-dev`.

## Current Contract Surface

- **Contract ID**: `tasks-first-harness-v1` in `assets/workflow-contract.v1.json`.
- **Version source**: `assets/skill-version.json`; generated repos still stamp `.claude/.skill-version` with the legacy `project-initializer@{version}+template@{templateVersion}` format for compatibility.
- **Action commands**: public command skills are `agentic-dev-plan`, `agentic-dev-review`, `agentic-dev-autoplan`, `agentic-dev-init`, `agentic-dev-scaffold`, `agentic-dev-migrate`, `agentic-dev-upgrade`, `agentic-dev-capability`, `agentic-dev-architecture`, `agentic-dev-handoff`, `agentic-dev-deploy`, `agentic-dev-repair`, and `agentic-dev-check`.
- Shared hook logic lives in `.ai/hooks/`; Claude project hooks route through `.claude/settings.json`.
- Generated `.claude/hooks/` shims are legacy cleanup targets. Custom `.claude/hooks/custom-*.sh` files are preserved.
- Stable product truth lives in `docs/spec.md`.
- `plans/` is the only source of truth for the active plan; any `docs/plan.md` pointer is legacy drift and should be removed during migration.
- Sprint done definitions live in `tasks/contracts/` and `tasks/reviews/`.
- Structured verification and resumable state live in `.ai/harness/checks/latest.json` and `.ai/harness/handoff/current.md`.
- `docs/TODO.md` is removed; `tasks/todo.md` is the only task contract.
- `docs/PROGRESS.md` is legacy migration input only; durable progress lives in `tasks/workstreams/` and release history lives in `docs/CHANGELOG.md`.
- `scripts/check-task-sync.sh` and `check:task-sync` enforce repo-local task sync.
- `scripts/check-task-workflow.sh` and `check:task-workflow` enforce repo-local workflow integrity.
- Helper scripts are installed from `assets/workflow-contract.v1.json`, including `new-spec.sh`, `new-plan.sh`, `new-sprint.sh`, `plan-to-todo.sh`, `contract-worktree.sh`, `prepare-handoff.sh`, `verify-contract.sh`, `verify-sprint.sh`, `check-agent-tooling.sh`, `check-brain-manifest.sh`, context helpers, capability helpers, and architecture helpers.
- Hook input parsing is hybrid (stdin JSON + env/argv fallback).
- Shared hooks understand current Claude Code fields such as `prompt`, `session_id`, `transcript_path`, `memory_type`, and `load_reason`.
- BDD/TDD reminders now route by path.
- Runtime mode is configurable via template variables:
  - `{{RUNTIME_MODE}}`
  - `{{RUNTIME_PROFILE}}`
- Question pack is now kept under `assets/initializer-question-pack.v4.json` (with older packs retained for compatibility reads).
- `assets/skill-hooks.json` is a deprecated zero-overhead extension point, not the Codex/Claude harness runtime path.
- Plan G/H default package manager is `uv`.
- Default generated docs use the `minimal-agentic` profile: `docs/spec.md`, `docs/architecture/index.md`, `tasks/`, `.ai/harness/`, and selected `docs/reference-configs/` are the required contract. Optional long docs require evidence or explicit user request.
- `.ai/harness/policy.json` now carries an `external_tooling` profile:
  - `complex -> gstack`
  - `simple -> Waza`
  - `knowledge -> gbrain`
  - hosts: `claude-code`, `codex`
  - mode: `guidance-only`
  - detection: `init-migrate`
  - `gbrain.mcp: candidate-disabled`
- Waza is Codex-first: stage upstream changes in `~/.agents/skills`, copy verified skills into `~/.codex/skills`, and compare whole managed directories plus shared rules.
- `_ref/` and `_ops/` are preserved local surfaces. Migration must not vendor, rewrite, or delete ignored external references, private ops state, secrets, or real env files.
- Approved-plan execution uses filesystem-owned Evidence Contract gates before implementation.

## Automated Migration

```bash
# Preview only
bash scripts/migrate-project-template.sh --repo /path/to/project --dry-run

# Apply migration
bash scripts/migrate-project-template.sh --repo /path/to/project --apply
```

## What the Script Does

1. Syncs hook scripts from `assets/hooks/` to `<repo>/.ai/hooks/`.
2. Removes known generated legacy `<repo>/.claude/hooks/` shims while preserving user-owned `custom-*.sh` hooks.
3. Creates or merges `<repo>/.claude/settings.json` from `assets/hooks/settings.template.json`, dispatching into `.ai/hooks/run-hook.sh`.
4. If `jq` exists, moves `hooks` from `settings.local.json` into `settings.json`.
5. Archives legacy `docs/TODO.md`, `docs/plan.md`, `docs/PROGRESS.md`, `docs/contract.md`, `docs/review.md`, `docs/handoff.md`, and `HANDOFF.md` through `scripts/migrate-workflow-docs.ts`.
6. Ensures `docs/spec.md`, `tasks/todo.md`, `tasks/lessons.md`, `tasks/research.md`, `tasks/contracts/`, `tasks/reviews/`, `tasks/notes/`, `tasks/workstreams/`, `docs/architecture/`, `.ai/context/*`, and `.ai/harness/*` exist.
7. Installs `.ai/harness/workflow-contract.json`, merges missing policy defaults, and preserves explicit repo overrides.
8. Installs workflow helpers from the workflow contract manifest rather than from a hardcoded prose list.
9. Copies the current shared harness reference configs into `docs/reference-configs/`, including external tooling guidance.
10. Injects `check:task-sync`, `check:context-files`, and `check:task-workflow` into `package.json` when present.
11. Prints a migration report with an external tooling advisory section.
12. Keeps Claude hook references valid through `.claude/settings.json` while keeping implementation in `.ai/hooks/`.
13. Never auto-installs or auto-upgrades gstack/Waza/gbrain, never starts `gbrain serve`, and never enables MCP automatically.

## External Tooling Safety Contract

Use `bash scripts/check-agent-tooling.sh` for advisory checks only.

The detector is intentionally read-only. It may call:

- `git -C <gstack-dir> remote get-url origin`
- `git -C <gstack-dir> rev-parse HEAD`
- `git -C <gstack-dir> ls-remote --symref origin HEAD`
- `npx -y skills ls -g --json`
- GitHub raw URL fetches for upstream Waza `SKILL.md` files and shared `rules/` files when `--check-updates` is set
- `gbrain doctor --json`
- `gbrain check-update --json`
- `gbrain integrations list --json`

The migration flow must not treat these as probes:

- `gstack setup`
- `gstack setup --help`
- `npx skills update`
- `npx skills check`
- `gbrain serve`
- `gbrain sync`
- `gbrain upgrade`

## Manual Follow-up

1. Review `<repo>/.claude/settings.json` for project-specific command exceptions.
2. Confirm `.ai/hooks/` contains the shared repo-local hook implementation.
3. Confirm `.claude/settings.local.json` only contains personal overrides.
4. Confirm `docs/spec.md`, `tasks/reviews/`, and `.ai/harness/` exist and match the repo’s live workflow.
5. Confirm repo-local Skill Factory, old auto-memory artifacts, and generated `.claude/hooks/` shims were removed from `.claude/`, `.ai/hooks/`, and `scripts/` while custom hooks were preserved.
6. Confirm `.ai/harness/policy.json` contains the expected `external_tooling` profile and that explicit repo overrides were preserved.
7. Review the migration report's external tooling advisory section:
   - does gstack/Waza/gbrain presence match the local machine?
   - does `gbrain` stay advisory/manual-only when MCP is disabled?
   - are install and upgrade commands appropriate for the target hosts?
8. Run `bash scripts/check-agent-tooling.sh --host both --check-updates` inside the migrated repo if you want a fresh advisory snapshot.
9. Run project smoke checks, `check:task-sync`, `check:task-workflow`, and basic hook trigger scenarios through `.claude/settings.json -> .ai/hooks/run-hook.sh`.
10. Run `bash scripts/prepare-handoff.sh migration` if the migration changed the active task state.
11. Run `bash scripts/verify-sprint.sh` when the repo already has an active sprint review flow.
12. Commit migration in one isolated change-set.
13. If your old docs referenced `governance/` contracts, skill-audit scripts, `project-initializer` as the canonical name, or generated `.claude/hooks/` shims, replace them with the current `agentic-dev` contract and `assets/initializer-question-pack.v4.json` as the Q&A source of truth.

## Rollback

- Restore `*.bak.<timestamp>` files created by the migration script.
- Or revert the migration commit.
