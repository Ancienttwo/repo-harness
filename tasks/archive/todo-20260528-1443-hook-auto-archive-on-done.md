> **Archived**: 2026-05-28 14:43
> **Related Plan**: plans/plan-20260528-1443-hook-auto-archive-on-done.md
> **Outcome**: Superseded
> **Source Plan**: (none)
> **Parent Run ID**: run-20260528-1443

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
- [x] Kept the earlier Claude skill paths functional during the rename window with `agentic-dev` and `project-initializer` aliases
- [x] Updated README usage instructions for GitHub install, existing-repo apply, command-skill routing, and installed-copy path boundaries
- [x] Clarified `_ref/` as an occasional ignored reference checkout cache and required repo+commit/tag+path citations when it informs notes or research
- [x] Added action-style `agentic-dev-*` command skill facades and tests while keeping hook/docs setup as internal engine steps
- [x] Added advisory reusable-workflow packaging route hints that suggest `agentic-dev-autoplan` only after user authorization
- [x] Added `agentic-dev-capability` for selected capability boundaries without a full init/migrate/upgrade pass
- [x] Added `agentic-dev-architecture`, `agentic-dev-handoff`, and `agentic-dev-deploy` as focused command facades
- [x] Migrated the git-backed source repo to `/Users/chris/Projects/agentic-dev` as the only editable source of truth and rebuilt Claude/Codex runtime paths as source-backed aliases
- [x] Fixed Codex installed-copy sync for symlinked legacy `project-initializer` fallback paths
- [x] Bumped release metadata to 5.0.1 for package, skill-version manifest, README, stamp, and changelog
- [x] Bumped release metadata to 5.0.2 after excluding ignored runtime state from installed-copy sync outputs
- [x] Made subagent/parallel research delegation a main-agent context-impact decision with a main-thread fallback path
- [x] Hardened Waza tooling checks to compare whole skill directories and shared `rules/` files, not only `SKILL.md`
- [x] Added filesystem-owned Evidence Contract fields and guards for approved plan execution
- [x] Bumped release metadata to 5.1.0 for package, skill manifest, README, stamp, and changelog
- [x] Refreshed stale `references/` docs for the current `agentic-dev` hook, migration, eval, plugin, and minimal-doc contracts
- [x] Verified reference drift scan and repo workflow checks for the doc refresh
- [x] Removed empty optional doc placeholders and refreshed command inventory docs for the current 13-command surface
- [x] Bumped release metadata to 5.1.1 for package, skill manifest, README, stamp, and changelog
- [x] Added generated Codex hook adapter support through `.codex/hooks.json` while keeping `.ai/hooks/` as the shared implementation layer
- [x] Added Codex Settings trust reminder after hook adapter configuration
- [x] Fixed installed-copy sync so Claude skill aliases are refreshed with Codex runtime aliases
- [x] Bumped release metadata to 5.1.2 for the Codex hook adapter release
- [x] Added CodeGraph advisory install guidance and a Bun `architecture-event.ts` helper to reduce shell JSON/path glue in architecture drift and context contract sync
- [x] Scoped Bun test discovery away from ignored advisory/runtime caches such as `_ref/` and `.codegraph/`
- [x] Moved context contract block rendering and replacement into `architecture-event.ts` while keeping shell fallbacks
- [x] Promoted CodeGraph from advisory setup guidance to required Codex agent readiness while keeping hooks non-blocking and `.codegraph/` ignored
- [x] Added passive Codex Plan / Waza think capture through `scripts/capture-plan.sh` and wired it into routing docs, policy, manifests, and tests
- [x] Added opt-in default-brain document sync through `scripts/sync-brain-docs.sh`, manifest `repo-to-brain` entries, and PostEdit hook integration
- [x] Bumped release metadata to 5.2.0 for package, skill manifest, README, stamp, and changelog
- [x] Fixed `GO` approval prompts bypassing the plan gate after Waza `/think` or Codex Plan output
- [x] Corrected exact approval prompts so Waza `/think` After Approval can run `capture-plan.sh --status Approved --execute` before implementation gates enforce active task artifacts
- [x] Added a plan-start bridge so explicit Waza `/think` / Codex Plan prompts create a Draft `plans/` artifact before approval
- [x] Extended anchored approval intent variants so natural approval phrasing reaches plan capture/projection without broadening bug-fix implementation wording
- [x] Bumped release metadata to 5.2.3 for the approval intent variant fix
- [x] Stripped injected skill/context blocks before prompt intent classification so expanded Waza skill bodies cannot mask `$think` plan-start intent
- [x] Allowed explicit `$think` / plan-start prompts to create an independent Draft plan even when an older Draft plan exists
- [x] Captured `PLEASE IMPLEMENT THIS PLAN:` prompts as Approved plans and projected them through `plan-to-todo.sh` before implementation gates continue
- [x] Captured pure plan-shaped Markdown prompts as Approved plans while leaving trigger-question examples read-only
- [x] Fixed hook dispatcher cwd handling so repo-relative plan capture runs inside `HOOK_REPO_ROOT`
- [x] Routed plain new-feature prompts to Draft `plans/` creation without projecting `tasks/todo.md`
- [x] Added root `CLAUDE.md` / `AGENTS.md` generation for init/migrate paths even when no functional blocks are selected
- [x] Kept functional-block context generation explicit while pruning `_ref/`, `_ops/`, and `.worktrees/` from legacy context discovery
- [x] Added context-file scan regression coverage so ignored external references cannot poison prompt safety checks
- [x] Applied autoresearch-style workflow inventory to `plans/plan-*.md` and `tasks/contracts/*.contract.md` generation
- [x] Preserved approval, review, and worktree gates while replacing latest-plan-first wording with explicit active-marker semantics
- [x] Verified plan/contract inventory generation with helper, scaffold, assembly, and output parity tests
- [x] Migrated active-plan marker authority to `.ai/harness/active-plan` with `.claude/.active-plan` legacy fallback
- [x] Updated active-plan readers, writers, switch, archive, handoff, policy, migration, and generated helper mirrors
- [x] Added compatibility coverage for legacy marker reads, host-neutral marker reads, dual-write capture, and concurrent plan switch
- [x] Ran autoresearch for hook workflow routing and promoted the winning `SKILL.md` hook protocol mutation
- [x] Implemented `autoresearch-advisory.sh` as a long-running hook workflow guard for prompt and post-edit optimization intent
- [x] Moved local autoresearch run products under ignored `autoresearch/` and preserved advisory hook session readback
- [x] Kept `autoresearch-advisory.sh` self-host-only by removing it from default hook assets and generated adapter templates
