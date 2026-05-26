# Changelog

All notable changes to this skill are documented here.

## [Unreleased]

### Changed

- Made broad research delegation a main-agent spawn decision based on context impact and callable runners, with bounded main-thread fallback when spawning is not useful or available.

## [5.0.2] - 2026-05-25

### Fixed

- Excluded ignored repo-local runtime state from Codex installed-copy sync outputs.

## [5.0.1] - 2026-05-25

### Added

- Added the agentic-dev plugin architecture map, domain/module docs, and capability-indexed local context contracts for Claude and Codex.

### Fixed

- Fixed Codex installed-copy sync for symlinked legacy `project-initializer` fallback paths.
- Removed tracked Claude trace state from the release surface and ignored repo-local Codex/runtime logs.

## [5.0.0] - 2026-05-25

### Fixed

- Made repeated `migrate-project-template.sh --apply` idempotent after a clean migration commit by normalizing first-write JSON output and preserving unchanged version stamps.
- Removed stale `3.1 guidance` wording from migration dry-run output.

### Changed

- Added `deploy/sql/` as the tracked deployment SQL surface and wired a filename-order check for `0001_name.sql` style files.
- Split deployable operations assets into tracked `deploy/` while keeping `_ops/` fully ignored for local private operations state and secrets.
- Externalized long-form optional reference configs into the default brain file vault while keeping repo-local runtime contracts, hooks, scripts, and required minimal docs authoritative.
- Added a repo-local brain manifest and workflow check for default brain pointers without making hooks depend on gbrain or iCloud.
- Renamed the skill/package/repo display surface to `agentic-dev` while keeping `agentic-dev-skill` and `project-initializer` as legacy aliases, install paths, and generated stamp compatibility surfaces.
- Added action-style `agentic-dev-*` command skill facades for plan, review, autoplan, init, scaffold, migrate, upgrade, repair, and check while keeping hooks/docs initialization internal.
- Added advisory prompt-hook route hints for reusable-workflow packaging, with `agentic-dev-autoplan` handling evidence-first plans only after user authorization.
- Added a Codex installed-copy sync helper that keeps command facades only in the canonical `agentic-dev` copy while legacy directories remain runtime fallback bundles.

## [4.0.2] - 2026-05-20

### Fixed

- Installed `inspect-project-state.ts`, `migrate-workflow-docs.ts`, `workflow-contract.ts`, `check-skill-version.ts`, and a delegating `migrate-project-template.sh` wrapper into generated repos so the router verification path is not left stale.
- Made generated capability discovery ignore `.worktrees/` and `_ref/` caches, preventing local worktree contracts from polluting `.ai/context/capabilities.json`.

## [4.0.1] - 2026-05-20

### Added

- Added a versioned upgrade strategy to the workflow contract, inspector output, harness policy, and migration cleanup path so legacy reconfiguration, archives, preserves, and removals are auditable.
- Added `docs/reference-configs/global-working-rules.md` as the user-level Claude/Codex rule template with enforceable P1/P2/P3 due diligence.

## [4.0.0] - 2026-05-20

### Changed

- Removed `docs/PROGRESS.md` from default generated and required workflow surfaces; legacy progress files are now archived during migration instead of normalized in place.
- Replaced default root `specs/` scaffolding with `docs/spec.md`, `interfaces/`, and tests as the stable product/runtime truth surfaces.
- Promoted `_ops/` as the trackable operations workspace for runbooks, submission materials, release checklists, and helper scripts, while keeping `_ops/secrets/` and `_ops/env/.env*` ignored.
- Made `_ref/` an ignored external comparison cache and added hook guards that block product edits under `_ref/` and sensitive `_ops` env/secret paths.
- Updated workflow contracts, generated templates, reference docs, architecture index, and tests to use `tasks/workstreams/` for durable progress and `docs/CHANGELOG.md` for release history.

## [3.6.0] - 2026-05-19

### Added

- Added `minimal-agentic` documentation generation so default scaffolds keep only required docs plus a small reference-config set, with `PROJECT_INITIALIZER_DOCUMENTATION_PROFILE=full` preserving the previous full docs surface.
- Added `docs/reference-configs/document-generation.md` to document required docs, on-demand docs, and the Agent-owned decision boundary.
- Added `lsp_profiles` metadata to policy and context maps so selected functional blocks can carry lightweight tooling hints without expanding root prompt context.
- Added `worktree_strategy` policy for conflict-triggered `codex/<task-slug>` worktrees, Waza `/check`-style validation, and merge-back to `main` without absorbing unrelated dirty changes.
- Added implementation notes as a task-local workflow artifact under `tasks/notes/`, with plan, contract, review, handoff, and archive integration.
- Added raw verification run snapshots under `.ai/harness/runs/` so `checks/latest.json` remains a pointer while durable evidence stays inspectable.

### Changed

- Updated scaffold, migration, init, ensure, workflow contract, and tests to install reference configs through the documentation profile instead of copying every reference doc by default.
- Changed init/migration external-tooling reports to skip update checks by default; set `PROJECT_INITIALIZER_CHECK_TOOLING_UPDATES=1` when an advisory run should also check upstream versions.
- Updated harness policy and reference docs to distinguish notes, evidence, promoted assets, and advisory memory instead of collapsing task-local decisions into long-term memory.

## [3.5.0] - 2026-05-11

### Added

- Added machine-readable `agentic_development` routing so product discovery uses gstack `office-hours`, complex engineering plans use gstack `plan-eng-review`, design plans use gstack `plan-design-review`, and daily small/medium work uses Waza `/think`, `/hunt`, and `/check`.
- Added `docs/reference-configs/agentic-development-flow.md` to keep detailed gstack/Waza routing and P1/P2/P3 due-diligence triggers out of root prompts.
- Added plan and review template sections for selected route, routing reason, and P1/P2/P3 evidence.
- Added `scripts/select-agent-context-blocks.sh` as the functional-block selector hook for paired `CLAUDE.md` and `AGENTS.md` generation, so Claude Code and Codex receive the same local module contract without inferring boundaries from broad layout globs.

### Changed

- Stopped generating repo-local `.claude/hooks/` shim scripts by default; `.ai/hooks/` is now the shared hook implementation layer and `.claude/settings.json` is the Claude adapter.
- Updated scaffold, migration, workflow contract, policy defaults, reference configs, and tests to keep self-host and generated repos aligned.
- Hardened workflow verification and legacy task migration around runtime contract parsing and partially migrated `tasks/todo.md` files.

## [3.4.0] - 2026-05-06

### Added

- Added Codex-first Waza policy metadata to the harness contract and generated repo policy defaults.
- Added host-aware Waza detection for real Claude/Codex skill paths, per-skill versions, symlink targets, staging drift, and upstream stale status.
- Added tests covering Claude staging symlinks, Codex independent runtime copies, read-only update checks, and Codex stale drift reporting.

### Changed

- Changed Waza `--check-updates` handling to compare upstream `tw93/Waza` raw `SKILL.md` hashes without running mutating `npx skills check`.
- Documented the Waza stage -> copy into Codex -> `cmp` verification workflow for generated and self-hosted harnesses.

## [3.3.0] - 2026-04-19

### Changed

- Removed repo-local Skill Factory and Claude auto-memory surfaces from the shared harness, migration path, and self-hosted repo.
- Added `scripts/check-agent-tooling.sh` plus generated `docs/reference-configs/external-tooling.md` so init and migrate flows can report gstack, Waza, and gbrain advisory status safely.
- Merged guidance-only `external_tooling` defaults into `.ai/harness/policy.json` during scaffold and migration without overwriting explicit repo overrides.

## [3.2.1] - 2026-04-19

### Fixed

- Added progressive context and harness policy surfaces alongside the workflow contract manifest so generated repos keep root context stable while exposing deeper context on demand.
- Wrote directory-level `AGENTS.md` files to discoverable module paths like `apps/*/AGENTS.md` instead of the container roots.
- Stopped custom plan `K` from creating `apps/`, `packages/`, and `services/` unless the target repo already has real module directories there.
- Corrected `scripts/inspect-project-state.ts` routing so initialized repos with bundled Skill Factory assets still classify as `audit` instead of collapsing to `skill-factory`.
- Tightened `scripts/check-task-workflow.sh` so strict workflow verification now fails explicitly when no `node`, `bun`, or `python3` runtime is available to read the workflow contract.
- Extended `scripts/migrate-workflow-docs.ts` to normalize legacy `tasks/todo.md` content in partially migrated repos and preserve the prior checklist in `tasks/archive/legacy-tasks-todo.md`.

## [3.2.0] - 2026-04-08

### Changed

- Added `assets/workflow-contract.v1.json` as the single machine-readable workflow contract and installed `.ai/harness/workflow-contract.json` in generated and self-hosted repos.
- Introduced `scripts/inspect-project-state.ts` so routing starts from structured repo inspection instead of prompt-only branching.
- Added `scripts/migrate-workflow-docs.ts` to preserve and migrate legacy `docs/plan.md`, `docs/TODO.md`, and execution-log style `docs/PROGRESS.md`.
- Updated migration, scaffold, and workflow verification paths to consume the shared contract manifest and verify it after migration.

## [3.1.0] - 2026-03-29

### Changed

- Added `run_id` to trace events, verification reports, and task-state snapshots for tighter report correlation.
- Expanded harness defaults to five dimensions by adding recovery and state profiles to the initializer question pack and plan map.
- Added structured `failure_class` logging plus `scripts/summarize-failures.sh` for guard failure aggregation.

## [3.0.0] - 2026-03-25

### Changed

- Upgraded generated repositories from a tasks-first scaffold to a shared long-running harness model.
- Added `docs/spec.md`, `tasks/reviews/`, and `.ai/harness/{checks,handoff}` as first-class generated artifacts.
- Reworked hook behavior around artifact-aware execution gates, contract scope enforcement, structured checks, and mandatory handoff generation.
- Upgraded the initializer question pack to `v2` and added stack-aware orchestration, evaluation, and handoff defaults.
- Updated helper scripts, templates, CLAUDE/AGENTS routing output, and tests to the shared harness model.
