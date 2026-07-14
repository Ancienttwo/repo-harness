# Architecture Domain: Verification

> **Source**: `.ai/context/capabilities.json`
> **Owner**: Regression tests, workflow gates, eval harness, CodeGraph readiness, and advisory tooling checks.

## Purpose

Verification protects the contract from drifting across self-host, generated
repos, command facades, hooks, migration helpers, and installed runtime copies.

## Capabilities

- `verification-codegraph-readiness` -> `docs/architecture/modules/verification/codegraph-readiness.md`
- `verification-evals-checks` -> `docs/architecture/modules/verification/evals-checks.md`

## Stable Rules

- Self-host and generated behavior must be checked together when shared assets change.
- `bun test` is the broad regression gate.
- `check-task-sync.sh` enforces that substantive repo changes update `tasks/`.
- `check-task-workflow.sh --strict` is the repo-local harness readiness gate.
- External brain-manifest and vault drift are outside repo verification and run only as explicit operator actions.
- External tooling probes remain read-only by default; CodeGraph readiness is required for agent code navigation, while other external tooling remains advisory.
- This self-host repo may use a vendored CodeGraph dev dependency; generated downstream repos keep global CodeGraph MCP setup explicit unless policy opts in.

## Verification Surface

- `bun test`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/ensure-codegraph.sh --check --json`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `repo-harness adopt --repo . --dry-run`
