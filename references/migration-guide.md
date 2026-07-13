# Migration Guide (current repo-harness contract)

This guide upgrades existing repositories to the current `repo-harness`
tasks-first harness. The canonical public entrypoint is `repo-harness adopt`.

## Current Contract Surface

- **Contract ID**: `tasks-first-harness-v1` in `assets/workflow-contract.v1.json`.
- **Version source**: `assets/skill-version.json`; generated repos still stamp `.claude/.skill-version` with the legacy `project-initializer@{version}+template@{templateVersion}` format for compatibility.
- **Action commands**: public command skills are `agentic-dev-plan`, `agentic-dev-review`, `agentic-dev-autoplan`, `agentic-dev-init`, `agentic-dev-scaffold`, `agentic-dev-migrate`, `agentic-dev-upgrade`, `agentic-dev-capability`, `agentic-dev-architecture`, `agentic-dev-handoff`, `agentic-dev-deploy`, `agentic-dev-repair`, and `agentic-dev-check`.
- Shared hook product source lives in `assets/hooks/`; active runtime resolves central-first through `repo-harness-hook`, with full `.ai/hooks/` vendoring only when a repo pins `"hook_source": "repo"`.
- User-level host adapters live in `~/.claude/settings.json` and `~/.codex/hooks.json`; repo-local adapter files are user-owned and must be reviewed manually rather than rewritten by adoption.
- Generated `.claude/hooks/` shims are legacy cleanup targets. Custom `.claude/hooks/custom-*.sh` files are preserved.
- Stable product truth lives in `docs/spec.md`.
- `plans/` is the timestamped plan catalog; `.ai/harness/active-plan` selects the active plan, `.claude/.active-plan` remains a legacy fallback during transition, and any `docs/plan.md` pointer is legacy drift that should be removed during migration.
- Sprint done definitions live in `tasks/contracts/` and `tasks/reviews/`.
- Structured verification and resumable state live in `.ai/harness/checks/latest.json` and `.ai/harness/handoff/current.md`.
- `docs/TODO.md` is removed; `tasks/todos.md` is the only task contract.
- `docs/PROGRESS.md` is legacy migration input only; durable progress lives in `tasks/workstreams/` and release history lives in `docs/CHANGELOG.md`.
- `scripts/check-task-sync.sh` and `check:task-sync` enforce repo-local task sync.
- `scripts/check-task-workflow.sh` and `check:task-workflow` enforce repo-local workflow integrity.
- Helper scripts are installed from `assets/workflow-contract.v1.json`, including `new-spec.sh`, `new-plan.sh`, `new-sprint.sh`, `plan-to-todo.sh`, `contract-worktree.sh`, `prepare-handoff.sh`, `verify-contract.sh`, `verify-sprint.sh`, `check-agent-tooling.sh`, `check-brain-manifest.sh`, capability helpers, and architecture helpers.
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
- `.ai/harness/policy.json` now keeps product and complex/design planning parent-owned:
  - pre-contract framing -> `geju`
  - architecture and plan decision -> parent-agent P1/P2/P3
  - simple -> Waza
  - knowledge -> gbrain
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
repo-harness adopt --repo /path/to/project --dry-run

# Apply migration
repo-harness adopt --repo /path/to/project
```

## What the Transaction Does

1. Refreshes `<repo>/.ai/hooks/` as a repo-local fallback: helper libs plus a README by default, or the full hook runtime when `"hook_source": "repo"` is pinned.
2. Removes known generated legacy `<repo>/.claude/hooks/` shims while preserving user-owned `custom-*.sh` hooks.
3. Preserves project-level host adapter configuration for explicit manual review; user-level adapter setup remains a separate explicit command.
4. Archives legacy `docs/TODO.md`, `docs/plan.md`, `docs/PROGRESS.md`, `docs/contract.md`, `docs/review.md`, `docs/handoff.md`, and `HANDOFF.md` in the transaction before retiring their old paths.
6. Ensures `docs/spec.md`, `tasks/todos.md`, `tasks/lessons.md`, `docs/researches/`, `tasks/contracts/`, `tasks/reviews/`, `tasks/notes/`, `tasks/workstreams/`, `docs/architecture/`, `.ai/context/*`, and `.ai/harness/*` exist.
7. Installs `.ai/harness/workflow-contract.json`, merges missing policy defaults, and preserves explicit repo overrides.
8. Uses the workflow contract manifest for cleanup ownership; downstream repos use `repo-harness run` instead of installed root helper wrappers.
9. Copies the current shared harness reference configs into `docs/reference-configs/`, including external tooling guidance.
10. Injects `check:task-sync`, `check:context-files`, and `check:task-workflow` into `package.json` when present.
11. Returns a structured transaction manifest and explicit post-apply registry, CodeGraph, handoff, and strict workflow steps.
12. Keeps downstream `.ai/hooks/` as a lib-only central-first surface unless policy explicitly pins `hook_source` to `repo`.
13. Never auto-installs or auto-upgrades Waza/gbrain, never starts `gbrain serve`, and never enables MCP automatically.

## External Tooling Safety Contract

Use `bash scripts/check-agent-tooling.sh` for advisory checks only.

The detector is intentionally read-only. It may call:

- `npx -y skills ls -g --json`
- GitHub raw URL fetches for upstream Waza `SKILL.md` files and shared `rules/` files when `--check-updates` is set
- `gbrain doctor --json`
- `gbrain check-update --json`
- `gbrain integrations list --json`

The migration flow must not treat these as probes:

- `npx skills update`
- `npx skills check`
- `gbrain serve`
- `gbrain sync`
- `gbrain upgrade`

## Manual Follow-up

1. Review the user-level Claude/Codex host adapter entries for project-specific command exceptions.
2. Confirm `.ai/hooks/` contains the lib-only fallback surface, or the full repo-local hook implementation when `.ai/harness/policy.json` explicitly pins `"hook_source": "repo"`.
3. Confirm `.claude/settings.local.json` only contains personal overrides.
4. Confirm `docs/spec.md`, `tasks/reviews/`, and `.ai/harness/` exist and match the repo’s live workflow.
5. Confirm repo-local Skill Factory, old auto-memory artifacts, and generated `.claude/hooks/` shims were removed from `.claude/`, `.ai/hooks/`, and `scripts/` while custom hooks were preserved.
6. Confirm `.ai/harness/policy.json` contains the expected `external_tooling` profile and that explicit repo overrides were preserved.
7. Review the transaction manifest and any explicit post-apply verification failure.
8. Run `bash scripts/check-agent-tooling.sh --host both --check-updates` inside the migrated repo if you want a fresh advisory snapshot.
9. Run project smoke checks, `check:task-sync`, `check:task-workflow`, and basic hook trigger scenarios.
10. Run `bash scripts/prepare-handoff.sh migration` if the migration changed the active task state.
11. Run `bash scripts/verify-sprint.sh` when the repo already has an active sprint review flow.
12. Commit migration in one isolated change-set.
13. If your old docs referenced `governance/` contracts, skill-audit scripts, `project-initializer` as the canonical name, or generated `.claude/hooks/` shims, replace them with the current `agentic-dev` contract and `assets/initializer-question-pack.v4.json` as the Q&A source of truth.

## Rollback

- Restore `*.bak.<timestamp>` files created by the migration script.
- Or revert the migration commit.
