# Task Execution Checklist (Primary)

> **Source Plan**: (none)
> **Status**: Idle
> Generate the next execution checklist from an approved plan with:
>   bash scripts/plan-to-todo.sh --plan plans/plan-YYYYMMDD-HHMM-slug.md

## Execution
- [x] Added selector-hooked functional-block context selection for paired `CLAUDE.md` and `AGENTS.md`
- [x] Removed implicit `apps/*`, `packages/*`, and `services/*` agent-context generation
- [x] Added `minimal-agentic` documentation profile with explicit full-doc opt-in
- [x] Added lightweight `lsp_profiles` metadata for selected functional blocks
- [x] Added conflict-triggered Codex worktree policy with Waza `/check` validation and merge-back requirements
- [x] Run workflow and regression checks for scaffold, migration, self-host parity, and Waza-style review
- [x] Added umbrella architecture drift requests and controlled local agent context contract sync hooks
- [x] Added explicit `.ai/context/capabilities.json` capability registry and longest-prefix resolver
- [x] Bound architecture drift, context contract sync, and workstream sync to capability IDs
- [x] Removed standalone `.ai/harness/workstreams/events.jsonl` in favor of `.ai/harness/events.jsonl`
- [x] Added capability registry validation to strict workflow checks
- [x] Renamed default runtime interface scaffold from `contracts/` to `interfaces/`
- [x] Deprecated default root `specs/` scaffold in favor of `docs/spec.md`, `interfaces/`, and tests
- [x] Deprecated `docs/PROGRESS.md` as a generated or required workflow surface; keep it as legacy migration input only
- [x] Clarified `tasks/notes/` as task-local decision notes in root `AGENTS.md` / `CLAUDE.md` and template partials
- [x] Updated `_ref/` and `_ops/` initialization, policy, gitignore, and hook guard rules
- [x] Added the `project-initializer` architecture diagram and linked it from the architecture index
- [x] Added contract-level worktree lifecycle start/finish automation with sprint verification and clean fast-forward merge gate
- [x] Rebased contract worktree lifecycle onto 4.0.0 and preserved worktrees placeholder/runtime-state checks
- [x] Added manifest-driven upgrade/reconfigure/cleanup strategy for legacy workflow versions
- [x] Extended inspector output with concrete upgrade plans and stale managed-config detection
- [x] Replaced migration cleanup heredoc with workflow-contract-owned `known_generated` removals
- [x] Added global Claude/Codex working-rules reference config and synced user-level global files
- [x] Bumped release metadata to 4.0.1 for package, skill-version manifest, README, and changelog
- [x] Bumped release metadata to 4.0.2 and installed router entrypoint helpers into generated repos
- [x] Fixed repeated migration apply idempotency for generated policy, Claude settings, and version stamp files
- [x] Removed stale 3.1 wording from migration dry-run output
- [x] Split deployable operations assets into tracked `deploy/` and ignored private `_ops/`
- [x] Added tracked `deploy/sql/` with ordered SQL filename validation
- [x] Added architecture drift request archive helper and pending-index cleanup rule
- [x] Externalized optional reference-config long docs to `icloud/brain/agentic-dev/*` and kept repo stubs for contract-safe discovery
- [x] Added `.ai/harness/brain-manifest.json` and `scripts/check-brain-manifest.sh` to guard default brain pointer drift
- [x] Renamed the skill/package/repo display surface to `agentic-dev` while preserving `agentic-dev-skill` and `project-initializer` as legacy aliases, install paths, and generated stamp compatibility surfaces
- [x] Added `AGENTIC_DEV_ROOT` and `agentic-dev` installed-path resolution while preserving `AGENTIC_DEV_SKILL_ROOT`, `PROJECT_INITIALIZER_ROOT`, and legacy path fallbacks
- [x] Synced real Codex installed copies for `agentic-dev`, `agentic-dev-skill`, and legacy `project-initializer`, with Claude new-name aliases pointing at the source repo
- [x] Added `agentic-dev-skill` and `project-initializer` to `SKILL.md` `when_to_use` metadata as legacy triggers during the rename window
- [x] Fixed Codex duplicate command discovery by making legacy Codex directories runtime fallback bundles without `SKILL.md` or `assets/skill-commands/`
- [x] Migrated the Claude source repo directory to `/Users/chris/.claude/skills/agentic-dev` and kept `/Users/chris/.claude/skills/project-initializer` as a legacy symlink alias
- [x] Updated README usage instructions for GitHub install, existing-repo apply, command-skill routing, and installed-copy path boundaries
- [x] Clarified `_ref/` as an occasional ignored reference checkout cache and required repo+commit/tag+path citations when it informs notes or research
- [x] Added action-style `agentic-dev-*` command skill facades and tests while keeping hook/docs setup as internal engine steps
- [x] Added advisory reusable-workflow packaging route hints that suggest `agentic-dev-autoplan` only after user authorization
- [x] Fixed Codex installed-copy sync for symlinked legacy `project-initializer` fallback paths
- [x] Bumped release metadata to 5.0.1 for package, skill-version manifest, README, stamp, and changelog
- [x] Bumped release metadata to 5.0.2 after excluding ignored runtime state from installed-copy sync outputs
