# Architecture Module: verification/evals-checks

> **Capability ID**: `verification-evals-checks`
> **Matched Prefixes**: `tests`, `evals`, `scripts/run-skill-evals.ts`, `scripts/check-task-workflow.sh`, `scripts/check-task-sync.sh`, `scripts/check-agent-tooling.sh`, `scripts/check-brain-manifest.sh`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

Verification is split into regression tests, repo-local workflow gates, migration
dry-runs, eval fixtures, and advisory external-tooling probes.

Authoritative checks:

- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `bun run benchmark:skills --dry-run` for eval-harness smoke.

## P2 Trace

Concrete route: pre-merge `agentic-dev-check` -> reports dirty worktree
boundaries -> runs unit/regression tests -> checks task sync -> checks workflow
strict readiness -> inspects repo state -> dry-runs self-migration -> reports
whether release or merge readiness is blocked.

Inputs are current git state, tracked files, ignored runtime paths, and advisory
tooling state. Outputs are command exit codes and concise readiness evidence.

Error paths:

- `check-task-sync.sh` fails when substantive repo changes lack `tasks/` synchronization.
- `check-task-workflow.sh --strict` fails for missing contract files, legacy docs, missing JSON runtime, broken deploy SQL order, or brain manifest drift.
- External tooling update checks may be skipped or timed out; they remain advisory unless the user explicitly asks for tooling maintenance.

## P3 Decision

Verification is broad because this repo is both source and self-hosted example.
The invariant is that self-hosted runtime files, generated templates, and
installable copies must not drift silently.

At 10x repo size, the first failure would be full-test cost. The current split
lets small slices run focused tests while release/pre-merge runs the full gate.

## Optimization Backlog

- Add capability registry validation to strict workflow checks once the new registry has one more real edit cycle.
- Keep external tooling probes read-only unless a command explicitly targets tooling maintenance.
