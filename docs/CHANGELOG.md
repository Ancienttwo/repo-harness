# Changelog

All notable changes to this skill are documented here.

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
