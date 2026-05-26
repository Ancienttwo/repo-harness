# Architecture Domain: Verification

> **Source**: `.ai/context/capabilities.json`
> **Owner**: Regression tests, workflow gates, eval harness, and advisory tooling checks.

## Purpose

Verification protects the contract from drifting across self-host, generated
repos, command facades, hooks, migration helpers, and installed runtime copies.

## Capabilities

- `verification-evals-checks` -> `docs/architecture/modules/verification/evals-checks.md`

## Stable Rules

- Self-host and generated behavior must be checked together when shared assets change.
- `bun test` is the broad regression gate.
- `check-task-sync.sh` enforces that substantive repo changes update `tasks/`.
- `check-task-workflow.sh --strict` is the repo-local harness readiness gate.
- External tooling probes remain advisory and read-only by default.

## Verification Surface

- `bun test`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
